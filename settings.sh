################################################################################
# setup Xilinx Vivado FPGA tools
################################################################################

# v2.2.5: the FPGA is built with Vivado 2020.1, loaded by lock_in+pid/fpga/Makefile itself
# in a clean environment (VIVADO_SETTINGS, default /tools/Xilinx/Vivado/2020.1/settings64.sh).
# Vivado 2015.2 is not needed any more (the C controller only uses the Linaro toolchain);
# it is still loaded if present, as in the 0.2.x series.
if [ -f /opt/Xilinx/Vivado/2015.2/settings64.sh ]; then
  . /opt/Xilinx/Vivado/2015.2/settings64.sh
fi

################################################################################
# setup Linaro toolchain
################################################################################

# export TOOLCHAIN_PATH=/opt/linaro/gcc-linaro-4.9-2015.02-3-x86_64_arm-linux-gnueabihf
# export TOOLCHAIN_PATH=/opt/linaro/gcc-linaro-4.9-2014.11-x86_64_arm-linux-gnueabihf/

if [ -d "/opt/linaro/gcc-linaro-4.9-2014.11-x86_64_arm-linux-gnueabihf" ]; then
  export TOOLCHAIN_PATH=/opt/linaro/gcc-linaro-4.9-2014.11-x86_64_arm-linux-gnueabihf/
fi

if [ -d "/opt/linaro/gcc-linaro-4.9-2015.02-3-x86_64_arm-linux-gnueabihf" ]; then
  export TOOLCHAIN_PATH=/opt/linaro/gcc-linaro-4.9-2015.02-3-x86_64_arm-linux-gnueabihf/
fi


export PATH=$PATH:$TOOLCHAIN_PATH/bin
export CROSS_COMPILE=arm-linux-gnueabihf-

################################################################################
# setup Buildroot download cache directory, to avoid downloads
# this path is also used by some other downloads
################################################################################

#export BR2_DL_DIR=$HOME/Workplace/buildroot/dl
export BR2_DL_DIR=dl

################################################################################
# common make procedure, should not be run by this script
################################################################################

#GIT_COMMIT_SHORT=`git rev-parse --short HEAD`
#make REVISION=$GIT_COMMIT_SHORT
