#!/usr/bin/env sh
# Starts a local web server and opens the game in your default browser.
cd "$(dirname "$0")"
URL=http://localhost:8080
open_url() { (sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL")) & }
if command -v node >/dev/null 2>&1; then open_url; exec node server.js
elif command -v python3 >/dev/null 2>&1; then open_url; exec python3 -m http.server 8080
else echo "Node.js or Python 3 not found - open index.html directly in Chrome/Edge."; fi
