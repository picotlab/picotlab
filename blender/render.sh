#!/bin/sh
# Safe wrapper for render.py: one render at a time, low priority, 300 s cap, skipped under memory pressure.
#   lab/hookloop/blender/render.sh <in.obj|in.py> <out.png> [render.py options]
# Env: BLENDER (default /Applications/Blender.app/Contents/MacOS/Blender), PICOTLAB_TIMEOUT (default 300), PICOTLAB_MIN_FREE (default 30 %); the old HOOKLOOP_* names still work as a fallback.
set -e
here=$(cd "$(dirname "$0")" && pwd)
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
limit=${PICOTLAB_TIMEOUT:-${HOOKLOOP_TIMEOUT:-300}}; minfree=${PICOTLAB_MIN_FREE:-${HOOKLOOP_MIN_FREE:-30}}
[ $# -ge 2 ] || { sed -n 2,4p "$0"; exit 1; }
if pgrep -f "blender/render.py" >/dev/null; then echo "render.sh: another Picotlab render is running; not starting a second one" >&2; exit 2; fi
free=$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/ {gsub("%","",$2); print $2}')
if [ -n "$free" ] && [ "$free" -lt "$minfree" ]; then echo "render.sh: only ${free}% memory free (< ${minfree}%); skipping the render" >&2; exit 3; fi
echo "render.sh: ${free:-?}% memory free; rendering with nice 15, ${limit} s cap" >&2
# perl's alarm survives exec, so Blender is killed with SIGALRM after $limit seconds
exec nice -n 15 perl -e 'alarm shift; exec @ARGV or die "exec failed: $!"' "$limit" "$BLENDER" -b --python "$here/render.py" -- "$@"
