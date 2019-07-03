#!/bin/bash

APP="lock_in+pid"



# A POSIX variable
OPTIND=1         # Reset in case getopts has been used previously in the shell.

# Initialize our own variables:
port_number=22
webonly=false

while getopts "wp:h?" opt; do
    case "$opt" in
    p)  port_number=$OPTARG
        echo "port_number: $port_number"
        ;;
    w)  webonly=true
        echo "webonly: $webonly"
        ;;
    h|\?)
        echo "${0} [-p port_number] rp-XXXXXX.local "
        exit 0
        ;;

    esac
done

shift $((OPTIND-1))

[ "${1:-}" = "--" ] && shift

# echo "port_number=$port_number, RP_address='$1', Leftovers: $@"


# exit when any command fails
set -e

# keep track of the last executed command
trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
# echo an error message before exiting

export SSH_AUTH_SOCK=0

L=0
if [[ $LANG = *"es_"* ]]; then
  echo "Idioma español"
  L=1
fi

if [[ $BASH_ARGC > 0 ]]; then
  RPIP="$1"
else
  txt=( "You mus provide the Red Pitaya hostname or IP:\n  ./upload_app.sh rp-XXXXXX.local\n"
        "Debes especificar el nombre de host o la direción IP de la Red Pitaya:\n  ./upload_app.sh rp-XXXXXX.local\n")
  echo -e ${txt[$L]}
  exit
fi

if [[ $LANG = *"es_"* ]]; then
  trap 'echo "
  El comando \"${last_command}\"  falló con el código de ERROR: $?.
  "' ERR
else
  trap 'echo "
  \"${last_command}\" command filed with exit code $?.
  "' ERR
fi

txt=( "RedPitaya hostname: "
      "Nombre de la Red Pitaya: ")
echo ${txt[$L]} $RPIP

if [ ! -f $HOME/.ssh/id_rsa ]; then
  txt=( "\nYou don't have SSH KEY. Creating one automatically. \n"
        "\nNo tenés una llave SSH. Creando una automáticamente. \n")
  echo -e ${txt[$L]}
  echo "
  mkdir -p $HOME/.ssh/
  chmod 700 $HOME/.ssh
  ssh-keygen -t rsa -P "" -f $HOME/.ssh/id_rsa
  chmod 600 $HOME/.ssh/id_rsa
  "
  mkdir -p $HOME/.ssh/
  chmod 700 $HOME/.ssh
  ssh-keygen -t rsa -P "" -f $HOME/.ssh/id_rsa
  chmod 600 $HOME/.ssh/id_rsa
fi

if [ -d ./${APP} ]; then
  cd ${APP}
  echo "cd ${APP}"
fi

echo "$APP"


# rp-xxxxxx.local

RPOPTS="-l root -p ${port_number} "
RPSCP="-P ${port_number} "
CONTROLLERHF="controllerhf.so"


txt=( "\nIf the SSH key is not in the Red Pitaya, we upload it. \n"
      "\nSi la llave SSH no está subida a la Red Pitaya, la subimos \n")
echo -e ${txt[$L]}

echo "ssh-copy-id -p ${port_number} -i ${HOME}/.ssh/id_rsa.pub root@${RPIP}"
ssh-copy-id -p ${port_number} -i ${HOME}/.ssh/id_rsa.pub root@${RPIP}

txt=( "\nIn the future, you will not need to type the root password again for remote login \n"
      "\nEn el futuro no necesitarás tipear nuevamente la clave SSH para root. \n")
echo -e ${txt[$L]}

if $webonly ; then

    ssh $RPIP $RPOPTS "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /opt/redpitaya/www/apps/${APP}/{index.html,js.css} "
    echo -e "\n\n---------------------\n\n"
    scp  ${RPSCP} -r index.html css js root@${RPIP}:/opt/redpitaya/www/apps/${APP}/

else
 
    ssh $RPIP $RPOPTS "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /opt/redpitaya/www/apps/${APP} ; mkdir -p /opt/redpitaya/www/apps/${APP} "
    echo -e "\n\n---------------------\n\n"
    scp  ${RPSCP} -r controllerhf.so css js fpga.conf index.html info py red_pitaya.bit  root@${RPIP}:/opt/redpitaya/www/apps/${APP}/

fi

echo -e "\n\n---------------------\n\n"


txt=( "\nUpload finished. Just open the application in your browser: \n"
      "\nLa aplicación fue subida exitosamente. Solo tenés que abrirla en el navegador web: \n")
echo -e ${txt[$L]}

echo "http://${RPIP}/${APP}"

echo -e "\n\n"
