#!/bin/bash

if [[ $BASH_ARGC > 0 ]]; then
  RPIP="$1"
else
  RPIP="rp-f01d89.local"
fi

# rp-xxxxxx.local

RPOPTS="-l root"
CONTROLLERHF="controllerhf.so"


ssh $RPIP $RPOPTS "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /opt/redpitaya/www/apps/scope+lock ; mkdir -p /opt/redpitaya/www/apps/scope+lock ; mkdir -p /root/py"
echo "

---------------------

"

scp $RPSCP -r scope+lock/*  root@$RPIP:/opt/redpitaya/www/apps/scope+lock/

echo "

---------------------

"


scp -r scope+lock/RP_py/*.py  root@$RPIP:/root/py/


echo "

If thereis not erros, everything is installed. Just open the application in your browser.

"

echo "Press return to finish"

read

