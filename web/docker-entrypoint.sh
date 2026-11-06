#!/bin/sh
set -eu
mkdir -p /data/happyvote
chown -R happyvote:happyvote /data/happyvote
exec su --preserve-environment -s /bin/sh happyvote -c 'exec node --max-old-space-size=1536 server.mjs'
