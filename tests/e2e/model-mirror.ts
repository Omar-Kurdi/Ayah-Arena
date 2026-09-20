import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { BrowserContext } from '@playwright/test';
import { MODEL } from '../../scripts/listener-fixtures.mjs';

/**
 * A local mirror of the speech model, for the listener test.
 *
 * The listener really downloads its model, so the test lets it -- once per
 * model revision. Requests for model and runtime files are redirected to a
 * small file server that keeps them in .cache/listener/model and fetches
 * anything missing from upstream. The application's own path is untouched: its
 * worker still fetches over the network, transformers.js still parses the
 * response, onnxruntime still runs it.
 *
 * A redirect rather than a fulfilled response on purpose. Playwright carries
 * fulfilled bodies over the DevTools connection, which refuses anything past
 * 100MB, and the encoder alone is 79MB.
 *
 * Requests for the model's default branch are fetched at the revision pinned
 * in scripts/listener-fixtures.mjs, so the bytes cannot change under the test
 * without the cache key changing with them. Anything else off-origin is
 * refused, which doubles as a check that a round needs no other network.
 */

const ALLOWED = [
  /^https:\/\/huggingface\.co\//,
  /^https:\/\/[^/]*\.hf\.co\//,
  /^https:\/\/[^/]*\.xethub\.hf\.co\//,
  /^https:\/\/cdn\.jsdelivr\.net\//,
];

export interface MirrorStats {
  /** Files answered from disk. */
  served: number;
  /** Files fetched from upstream and kept. */
  fetched: number;
  /** Off-origin requests the test refused. */
  blocked: string[];
}

export interface Mirror {
  origin: string;
  stats: MirrorStats;
  close: () => Promise<void>;
}

const isAllowed = (url: string) => ALLOWED.some((pattern) => pattern.test(url));

/** The model's default branch is only ever read at the revision we pinned. */
const pinned = (url: string) =>
  url.replace(`${MODEL.id}/resolve/main/`, `${MODEL.id}/resolve/${MODEL.revision}/`);

const fileFor = (dir: string, url: string) =>
  join(dir, createHash('sha256').update(url).digest('hex').slice(0, 32));

/**
 * The content type matters: onnxruntime instantiates its WebAssembly straight
 * from the response, and the browser refuses to do that unless the type says
 * application/wasm. Upstream's type is kept beside each file for that reason.
 */
const typeFor = (path: string, url: string) => {
  if (existsSync(`${path}.type`)) return readFileSync(`${path}.type`, 'utf8');
  if (url.endsWith('.wasm')) return 'application/wasm';
  if (url.endsWith('.json')) return 'application/json';
  if (url.endsWith('.mjs') || url.endsWith('.js')) return 'text/javascript';
  return 'application/octet-stream';
};

/** Downloads one file into the mirror, if it is not there already. */
async function ensureMirrored(dir: string, upstream: string, stats: MirrorStats): Promise<string> {
  const path = fileFor(dir, upstream);
  if (existsSync(path)) {
    stats.served += 1;
    return path;
  }

  const fetched = await fetch(upstream);
  if (!fetched.ok || !fetched.body) throw new Error(`upstream ${fetched.status} for ${upstream}`);

  // Written aside and renamed, so an interrupted run cannot leave a half-file
  // behind that later runs would trust.
  const partial = `${path}.partial`;
  const body = Readable.fromWeb(fetched.body as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(body, createWriteStream(partial));
  renameSync(partial, path);
  writeFileSync(`${path}.type`, fetched.headers.get('content-type') ?? typeFor(path, upstream));
  stats.fetched += 1;
  return path;
}

/** Serves the mirrored files, fetching what it does not have yet. */
export async function startMirror(dir: string): Promise<Mirror> {
  mkdirSync(dir, { recursive: true });
  const stats: MirrorStats = { served: 0, fetched: 0, blocked: [] };

  const server: Server = createServer((request, response) => {
    void (async () => {
      const upstream = new URL(request.url ?? '', 'http://mirror').searchParams.get('u') ?? '';
      if (!isAllowed(upstream)) {
        response.writeHead(403).end('not a model URL');
        return;
      }

      const path = await ensureMirrored(dir, upstream, stats);
      response.writeHead(200, {
        'content-type': typeFor(path, upstream),
        'content-length': statSync(path).size,
        // The worker fetches this from the app's origin, not the mirror's.
        'access-control-allow-origin': '*',
      });
      await pipeline(createReadStream(path), response);
    })().catch((error: unknown) => {
      if (!response.headersSent) response.writeHead(500);
      response.end(String(error));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('mirror has no port');

  return {
    origin: `http://127.0.0.1:${address.port}`,
    stats,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Sends the browser's model requests to the mirror, and refuses the rest. */
export async function routeModelRequests(context: BrowserContext, mirror: Mirror): Promise<void> {
  const mirrorHost = new URL(mirror.origin).host;

  await context.route(
    (url) =>
      url.protocol.startsWith('http') &&
      !['127.0.0.1', 'localhost'].includes(url.hostname) &&
      url.host !== mirrorHost,
    async (route) => {
      const requested = route.request().url();
      if (!isAllowed(requested)) {
        mirror.stats.blocked.push(requested);
        return route.abort('blockedbyclient');
      }
      const target = `${mirror.origin}/model?u=${encodeURIComponent(pinned(requested))}`;
      return route.fulfill({ status: 302, headers: { location: target } });
    }
  );
}
