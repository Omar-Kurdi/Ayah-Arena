#!/usr/bin/env bash
#
# Starts Ayah Arena and leaves it running.
#
#   ./start.sh          the dev server, with hot reload
#   ./start.sh --prod   a production build, served the way it is deployed
#
# The server runs in its own session, so closing this terminal does not take
# it with it. ./stop.sh stops it.

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3210}"
RUN_DIR=.run
PID_FILE="$RUN_DIR/server.pid"
MODE_FILE="$RUN_DIR/mode"
LOG_FILE="$RUN_DIR/server.log"

mode=dev
case "${1-}" in
  --prod) mode=prod ;;
  -h | --help)
    sed -n '3,10p' "$0" | cut -c3-
    exit 0
    ;;
  '') ;;
  *)
    echo "start.sh: unknown option '$1' — try --prod, or --help" >&2
    exit 2
    ;;
esac

# Progress is stored through node:sqlite, which arrived in Node 22.5.
# shellcheck disable=SC2016  # the ${...} below is JavaScript, not shell
node -e 'const [a,b]=process.versions.node.split(".").map(Number);
         if (a < 22 || (a === 22 && b < 5)) {
           console.error(`Ayah Arena needs Node 22.5 or newer; this is ${process.versions.node}.`);
           process.exit(1);
         }'

mkdir -p "$RUN_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Already running ($(cat "$MODE_FILE" 2>/dev/null || echo "?")) at http://localhost:$PORT"
  echo "Stop it with ./stop.sh, or watch it with: tail -f $LOG_FILE"
  exit 0
fi
rm -f "$PID_FILE"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ "$mode" = prod ]; then
  echo "Building..."
  npm run build
  # `next build` rewrites tsconfig.json. Say so rather than quietly reverting
  # it: it may be a change you wanted.
  if git -C . diff --quiet -- tsconfig.json 2>/dev/null; then :; else
    echo "note: the build rewrote tsconfig.json — 'git checkout -- tsconfig.json' if that was not you."
  fi
  command=(npm start)
else
  command=(npm run dev)
fi

# Its own session, so stop.sh can take down the whole tree: npm starts next,
# which starts workers of its own.
setsid "${command[@]}" >"$LOG_FILE" 2>&1 </dev/null &
pid=$!
echo "$pid" >"$PID_FILE"
echo "$mode" >"$MODE_FILE"

printf 'Starting the %s server' "$mode"
for _ in $(seq 60); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo
    echo "It stopped before it was ready. The last of $LOG_FILE:" >&2
    tail -n 15 "$LOG_FILE" >&2
    rm -f "$PID_FILE" "$MODE_FILE"
    exit 1
  fi
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
    echo
    echo "Ayah Arena is at http://localhost:$PORT  ($mode, pid $pid)"
    echo "  log:  tail -f $LOG_FILE"
    echo "  stop: ./stop.sh"
    exit 0
  fi
  printf '.'
  sleep 1
done

echo
echo "Still not answering on port $PORT after a minute. It is running (pid $pid);" >&2
echo "see $LOG_FILE, or ./stop.sh to stop it." >&2
exit 1
