#!/bin/sh

# Start supervisor which manages both backend and nginx
exec /usr/bin/supervisord -c /etc/supervisord.conf
