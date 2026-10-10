#!/bin/bash
# Simulates fpga/prj/v0.94/rtl/lock/lock_ctrl.v with test/lock_ctrl_tb.v in Vivado 2020.1 xsim.
# Usage: test/lock_ctrl_sim.sh [work_dir]     (default: a temporary directory, removed at the end)
# Exit status 0 if the testbench prints "TB RESULT: PASS".
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
RTL="$HERE/../fpga/prj/v0.94/rtl/lock/lock_ctrl.v"
TB="$HERE/lock_ctrl_tb.v"
VIVADO_SETTINGS="${VIVADO_SETTINGS:-/tools/Xilinx/Vivado/2020.1/settings64.sh}"
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK"
env -i HOME="$HOME" PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C bash -c "
  . '$VIVADO_SETTINGS' > /dev/null &&
  cd '$WORK' &&
  xvlog '$RTL' '$TB' &&
  xelab -debug typical lock_ctrl_tb -s lock_ctrl_tb_sim &&
  xsim lock_ctrl_tb_sim -R
" 2>&1 | tee "$WORK/lock_ctrl_sim.log"
RC=1
grep -q "TB RESULT: PASS" "$WORK/lock_ctrl_sim.log" && RC=0
[ -z "$1" ] && rm -rf "$WORK"
exit $RC
