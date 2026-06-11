#!/bin/sh
set -e


if [ -f /usr/share/nginx/html/config.js ]; then
  envsubst '${BACKEND_URL}' < /usr/share/nginx/html/config.js > /tmp/config.js
  mv /tmp/config.js /usr/share/nginx/html/config.js
fi

exec nginx -g 'daemon off;'