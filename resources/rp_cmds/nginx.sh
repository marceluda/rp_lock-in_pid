#!/bin/bash

systemctl stop redpitaya_nginx

sed '/output chain is empty/d' -i /var/log/redpitaya_nginx/error.log
sed '/output chain is empty/d' -i /var/log/redpitaya_nginx/debug.log

systemctl start redpitaya_nginx

