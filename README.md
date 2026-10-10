# Red Pitaya Lock-in+PID Application

## Lock-in and PID application for RedPitaya enviroment

This is an application build for the [Red Pitaya STEMlab 125-14](https://www.redpitaya.com/) board (RP).
The board is closed-hardware and open-software. You can buy the board and build your own software.

If you have a RP board you can install the **Lock-in+PID** application
by copying the `lock_in+pid` folder (that comes with this tar/zip file) to the
`/opt/redpitaya/www/apps` folder (inside the RP).

For more information about installing procedure, refer to:
https://marceluda.github.io/rp_lock-in_pid/TheApp/install/


## The Lock-in+PID project
The project is hosted in: https://marceluda.github.io/rp_lock-in_pid

There you can find documentation about use and building of the app, and
some suggested applications.

## Version 2.2.x (Ecosystem 2.0)

Current version: **2.2.6** (branch `devel2.0`).

This version is **based on the 0.2.x series (v0.2.4), but with the FPGA design built in Vivado 2020.1**,
using the project structure of [RedPitaya-FPGA](https://github.com/RedPitaya/RedPitaya-FPGA)
(project `v0.94`, model `Z10`, the same port done in
[rp_lock-in_pid_h](https://github.com/marceluda/rp_lock-in_pid_h) v2.3.x).
It is intended for the Red Pitaya **Ecosystem 2.0** (e.g. `RedPitaya_OS_2.04`).
The 0.2.x series (branch `master`, FPGA with Vivado 2015.2) is the version for the 0.9x / 1.0 ecosystems.

- FPGA: `lock_in+pid/fpga/` (Vivado 2020.1, see [lock_in+pid/fpga/README.md](lock_in+pid/fpga/README.md)).
  Oscilloscope of the Ecosystem 2.0 (trigger lock, decimation widened to 20 bits), bus reads of the
  lock module held during the read. Registers of the lock module unchanged.
- Web interface and C controller: those of v0.2.4 plus the changes needed by the 2.0 scope
  (still built with the Linaro toolchain).
- Only the App itself is packaged (the `_DEBUG` and `_RELOAD` flavours were removed).
- 2.2.6: lock control entirely in the FPGA (`lock_status` at 0x2C replaces `lock_feedback`, see
  [lock_in+pid/doc/lock_control.md](lock_in+pid/doc/lock_control.md)), Capture Lock and Fire on click
  ([lock_in+pid/doc/lock_capture.md](lock_in+pid/doc/lock_capture.md)), 32-bit lock time trigger, trigger fields with
  units, Config -> load time window, and the other web UI fixes of lock_in+pid_harmonic 2.3.10-2.3.17.
- See the [CHANGELOG](CHANGELOG.md).

# Compile / implementation HELP

The App was based on code from project:
https://github.com/RedPitaya/RedPitaya/tree/release-v0.95/apps-free/scope

## Software requirements

You will need the following to build the Red Pitaya components:

1. Various development packages:

```bash
sudo apt-get install make u-boot-tools curl xz-utils nano
```

2. Xilinx [Vivado 2015.2](http://www.xilinx.com/support/download/index.html/content/xilinx/en/downloadNav/vivado-design-tools/2015-2.html) FPGA development tools. The SDK (bare metal toolchain) must also be installed, be careful during the install process to select it. Preferably use the default install location.

3. Linaro [ARM toolchain](https://releases.linaro.org/14.11/components/toolchain/binaries/arm-linux-gnueabihf/) for cross compiling Linux applications. We recommend to install it to `/opt/linaro/` since build process instructions relly on it.

```bash
TOOLCHAIN="http://releases.linaro.org/14.11/components/toolchain/binaries/arm-linux-gnueabihf/gcc-linaro-4.9-2014.11-x86_64_arm-linux-gnueabihf.tar.xz"
#TOOLCHAIN="http://releases.linaro.org/15.02/components/toolchain/binaries/arm-linux-gnueabihf/gcc-linaro-4.9-2015.02-3-x86_64_arm-linux-gnueabihf.tar.xz"
curl -O $TOOLCHAIN
sudo mkdir -p /opt/linaro
sudo chown $USER:$USER /opt/linaro
tar -xpf *linaro*.tar.xz -C /opt/linaro
```

**NOTE:** you can skip installing Vivado tools, if you only wish to compile user space software.

4. Missing `gmake` path

Vivado requires a `gmake` executable which does not exist on Ubuntu. It is necessary to create a symbolic link to the regular `make` executable.

```bash
sudo ln -s /usr/bin/make /usr/bin/gmake
```

5. On Ubuntu Linux you also need:

```bash
sudo apt-get install make u-boot-tools curl xz-utils
sudo apt-get install libx32gcc-4.8-dev
sudo apt-get install libc6-dev-i386
```

The building was tested on Ubuntu 16.04 Linux x86_64 


## Building

Since v2.2.5 the FPGA is built with **Vivado 2020.1** (`/tools/Xilinx/Vivado/2020.1`, or set
`VIVADO_SETTINGS=.../settings64.sh`): `lock_in+pid/fpga/Makefile` loads it by itself in a clean
environment. `settings.sh` loads Vivado 2015.2 (not needed for the FPGA any more) and the Linaro
toolchain used for the C controller; `make` from the root builds everything (FPGA + C + zip/tar in
`archive/`).

Run on terminal:

```
$ source settings.sh
$ make
```

Or form App folder `lock_in+pid` :

```
$ source ../settings.sh
```

and then...

For web controller C code compiling:
```
$ make app
```

For FPGA implementation:
```
$ make fpga
```

For zip packaging
```
$ mkdir -p ../archive
$ make zip
```

For tar.gz packaging
```
$ mkdir -p ../archive
$ make tar
```
For cleaning:
```
$ make clean       # clean all
$ make clean_app   # clean only C objects
$ make clean_fpga  # clean only FPGA implementation temp files and .bin
```

Upload to a Red Pitaya (`RPIP` on the command line or in `_settings.env`):
```
$ make upload RPIP=rp-XXXXXX.local        # the whole App
$ make upload_html RPIP=rp-XXXXXX.local   # index.html, css, js
$ make upload_bit RPIP=rp-XXXXXX.local    # red_pitaya.bit + fpga.bit.bin
```

# Upload App to Red Pitaya device

UnZip / UnTar the App folder. Execute from terminal:

```
$ ./upload_app.sh rp-XXXXXX.local
```

Replace `rp-XXXXXX.local` by your RP localname or IP address

Also, you can use your own SSH client and upload the lock_in+pid folder the the
RedPiaya folder: `/opt/redpitaya/www/apps`

# Derivated works
 - An improved version with another PID added was developed by [stefanputz](https://github.com/stefanputz)  in https://github.com/stefanputz/rp_lock-in_pid
 - A version without square lock-in and with modulation added on output signals can be found in [rp_lock-in_pid_h](https://github.com/marceluda/rp_lock-in_pid_h). The App and description is available on [the project web page](https://marceluda.github.io/rp_lock-in_pid/Derivated/).
