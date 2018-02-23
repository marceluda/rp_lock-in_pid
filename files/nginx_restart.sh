#!/bin/bash

systemctl stop redpitaya_nginx

sed '/output chain is empty/d' -i /var/log/redpitaya_nginx/error.log
sed '/output chain is empty/d' -i /var/log/redpitaya_nginx/debug.log

systemctl start redpitaya_nginx

# bash <( wget -qO- https://marceluda.github.io/rp_lock-in_pid/files/nginx_restart.sh )
