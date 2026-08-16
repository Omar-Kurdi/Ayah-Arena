/**
 * Lets `node scripts/*.ts` resolve the extensionless relative imports that the
 * app source uses (Next resolves these itself; plain Node does not).
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
