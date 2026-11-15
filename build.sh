#!/bin/sh
# Assemble index.html from src/ (shell + core + app), then run the headless core tests.
set -e
cd "$(dirname "$0")"
{ cat src/shell.html; echo '<script>'; cat src/core.js; cat src/app.js; cat src/photo.js; cat src/calib.js; cat src/paste.js; cat src/walk.js; echo '</script>'; } > index.html
node -e "const s=require('fs').readFileSync('index.html','utf8'); new Function(s.slice(s.lastIndexOf('<script>')+8, s.lastIndexOf('</script>')))" || { echo 'build.sh: the page script has a syntax error'; exit 1; }
node test/core.test.js index.html | tail -1
