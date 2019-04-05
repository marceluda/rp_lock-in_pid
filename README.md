# Red Pitaya Lock-in+PID Application

## Lock-in and PID application for RedPitaya enviroment

This is an application build for the [Red Pitaya STEMlab 125-14](https://www.redpitaya.com/) board (RP).
The board is closed-hardware and open-software. You can buy the board and build your own software.

If you have a RP board you can install the **Lock-in+PID** application
by copying the `lock-in+pid` folder (that comes with this tar/zip file) to the
`/opt/redpitaya/www/apps` folder (inside the RP).

For more information about installing procedure, refer to:
https://marceluda.github.io/rp_lock-in_pid/TheApp/install/


## The Lock-in+PID project
The project is hosted in: https://marceluda.github.io/rp_lock-in_pid

There you can find documentation about use and building of the app, and
some suggested applications.

# Compile / implementation HELP

Run on terminal:

$ source settings.sh
$ make

Or form App folder `lock-in+pid` :

$ source ../settings.sh

and then...

For web controller C code compiling:
$ make app

For FPGA implementation:
$ make fpga

For zip packaging
$ mkdir -p ../archive
$ make zip

For tar.gz packaging
$ mkdir -p ../archive
$ make tar

For cleaning:
$ make clean       # clean all
$ make clean_app   # clean only C objects
$ make clean_fpga  # clean only FPGA implementation temp files and .bin
