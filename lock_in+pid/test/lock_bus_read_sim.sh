#!/bin/bash
# Simulates the bus reads of fpga/prj/v0.94/rtl/lock.v through fpga/rtl/rtl/sys_bus_cdc.sv (PS clock and
# ADC clock asynchronous) with test/lock_bus_read_tb.sv in Vivado 2020.1 xsim (lock_in+pid v2.2.5, from lock_in+pid_harmonic v2.3.17).
# Usage: test/lock_bus_read_sim.sh [work_dir [lock.v]]   (default: a temporary directory, removed at the
#        end; the lock.v of the repo). Passing another lock.v (e.g. the one of v0.2.4: `git show v0.2.4:lock_in+pid/fpga/rtl/lock.v`) shows the bug.
# mult_dsp_14.v instantiates DSP48E1: elaborated with the unisims_ver library and glbl.
# Exit status 0 if the testbench prints "TB RESULT: PASS".
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
PRJ="$HERE/../fpga/prj/v0.94/rtl"
LOCK_V="${2:-$PRJ/lock.v}"
LOCK_V="$(cd "$(dirname "$LOCK_V")" && pwd)/$(basename "$LOCK_V")"
IFC="$HERE/../fpga/rtl/rtl/interface/sys_bus_if.sv"
CDC="$HERE/../fpga/rtl/rtl/sys_bus_cdc.sv"
TB="$HERE/lock_bus_read_tb.sv"
VIVADO_SETTINGS="${VIVADO_SETTINGS:-/tools/Xilinx/Vivado/2020.1/settings64.sh}"
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK"
cp "$PRJ"/lock/*.dat "$WORK"/       # \$readmemb of gen_mod2.v
# lock/abs_val.v is not used by lock.v (and has a trailing comma that xvlog rejects): not compiled
env -i HOME="$HOME" PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C bash -c "
  . '$VIVADO_SETTINGS' > /dev/null &&
  cd '$WORK' &&
  xvlog '$LOCK_V' \$(ls '$PRJ'/lock/*.v | grep -v '/abs_val.v\$') &&
  xvlog -sv '$IFC' '$CDC' '$TB' &&
  xvlog \$XILINX_VIVADO/data/verilog/src/glbl.v &&
  xelab -debug typical --timescale 1ns/1ps -L unisims_ver lock_bus_read_tb glbl -s lock_bus_read_tb_sim &&
  xsim lock_bus_read_tb_sim -R
" 2>&1 | tee "$WORK/lock_bus_read_sim.log"
RC=1
grep -q "TB RESULT: PASS" "$WORK/lock_bus_read_sim.log" && RC=0
[ -z "$1" ] && rm -rf "$WORK"
exit $RC
