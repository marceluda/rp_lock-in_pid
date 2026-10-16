#!/bin/bash
# lock_in+pid v2.2.9 (from lock_in+pid_harmonic v2.3.21): measures the ramp (gen_ramp.v), harmonic and square modulation (gen_mod2.v) periods on the RTL, with
# test/ramp_mod_period_tb.v in Vivado 2020.1 xsim (the formulas that Reset Zoom uses, see index.html).
# Usage: test/ramp_mod_period_sim.sh [work_dir]     (default: a temporary directory, removed at the end)
# Exit status 0 if the testbench prints "TB RESULT: PASS".
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
RTL="$HERE/../fpga/prj/v0.94/rtl/lock"
TB="$HERE/ramp_mod_period_tb.v"
VIVADO_SETTINGS="${VIVADO_SETTINGS:-/tools/Xilinx/Vivado/2020.1/settings64.sh}"
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK"
cp "$RTL"/data_*.dat "$WORK"/
env -i HOME="$HOME" PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C bash -c "
  . '$VIVADO_SETTINGS' > /dev/null &&
  cd '$WORK' &&
  xvlog \$XILINX_VIVADO/data/verilog/src/glbl.v &&
  xvlog '$RTL/gen_ramp.v' '$RTL/gen_ramp_relock.v' '$RTL/mult_dsp_14.v' '$RTL/satprotect.v' '$RTL/gen_mod2.v' '$TB' &&
  xelab -debug typical --timescale 1ns/1ps -L unisims_ver ramp_mod_period_tb glbl -s ramp_mod_period_sim &&
  xsim ramp_mod_period_sim -R
" 2>&1 | tee "$WORK/ramp_mod_period_sim.log"
RC=1
grep -q "TB RESULT: PASS" "$WORK/ramp_mod_period_sim.log" && RC=0
[ -z "$1" ] && rm -rf "$WORK"
exit $RC
