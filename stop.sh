#!/usr/bin/env bash
#
# Stops the server ./start.sh left running. Nothing else: your drill progress
# in .data/ayah-arena.db is untouched.

set -euo pipefail
cd "$(dirname "$0")"

RUN_DIR=.run
PID_FILE="$RUN_DIR/server.pid"
MODE_FILE="$RUN_DIR/mode"

if [ ! -f "$PID_FILE" ]; then
  echo "Nothing to stop — no server was started from here."
  exit 0
fi

pid=$(cat "$PID_FILE")
if ! kill -0 "$pid" 2>/dev/null; then
  echo "Nothing to stop — pid $pid is already gone."
  rm -f "$PID_FILE" "$MODE_FILE"
  exit 0
fi

# The whole session: npm, next, and next's workers. The leading minus is the
# process group, which is why start.sh uses setsid.
kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid"

for _ in $(seq 10); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "Stopped."
    rm -f "$PID_FILE" "$MODE_FILE"
    exit 0
  fi
  sleep 0.5
done

echo "It did not stop when asked; ending it."
kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
rm -f "$PID_FILE" "$MODE_FILE"
echo "Stopped."
