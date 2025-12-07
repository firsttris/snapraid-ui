#!/bin/sh

# Start supervisor which manages both backend and nginx
exec /usr/sbin/supervisord -c /etc/supervisord.conf
