#!/bin/bash

if [[ $BASH_ARGC > 0 ]]; then
  RPIP="$1"
else
  RPIP="rp-XXXXXX.local"
fi

# rp-xxxxxx.local

RPOPTS="-l root -p 22 "
RPSCP="-P 22 "
CONTROLLERHF="controllerhf.so"


ssh $RPIP $RPOPTS "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /opt/redpitaya/www/apps/lock-in+pid ; mkdir -p /opt/redpitaya/www/apps/lock-in+pid ; mkdir -p /root/py"
echo "

---------------------

"

scp $RPSCP -r lock-in+pid/*  root@$RPIP:/opt/redpitaya/www/apps/lock-in+pid/

echo "

---------------------

"


scp $RPSCP -r resources/rp_cmds/py/*.py  root@$RPIP:/root/py/
scp $RPSCP -r resources/rp_cmds/nginx.sh  root@$RPIP:/root/
# ssh $RPIP $RPOPTS "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; ln -s /root/nginx.sh /etc/cron.daily/nginx.sh ; chmod +x /root/nginx.sh"


echo "

If there are not erros everything is installed. Just open the application in your browser.

"

echo "Press return to finish"

read
