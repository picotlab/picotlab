#!/bin/sh
# Run ONLY after the maintainer approves the repo name and the public push. Usage: release/first-push.sh owner/name
set -eu
[ $# -eq 1 ] || { echo "usage: $0 owner/name (needs the maintainer's yes)"; exit 2; }
cd "$(dirname "$0")/.."
# never run build.sh here: the app lane owns the build; test what is on disk
node test/core.test.js index.html | tail -1
if [ -n "${PREFLIGHT:-}" ]; then python3 "$PREFLIGHT" preflight . --third-party vendor; fi   # optional: soma-venture preflight
git add -A
git status --short
git commit -m "Picotlab prototype v9: pattern engine, 3D sim, walkthrough, Apache 2.0"
gh repo create "$1" --public --source . --remote origin --description "Free, open-source crochet design tool: true-size patterns, 3D stitch preview, hook walkthrough" --push
