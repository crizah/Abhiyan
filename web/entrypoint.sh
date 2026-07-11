#!/bin/sh
set -e


if [ -f /usr/share/nginx/html/config.js ]; then
  envsubst '${REACT_APP_BACKEND_URL} ${REACT_APP_GOOGLE_CLIENT_ID}' < /usr/share/nginx/html/config.js > /tmp/config.js
  mv /tmp/config.js /usr/share/nginx/html/config.js
fi

exec nginx -g 'daemon off;'