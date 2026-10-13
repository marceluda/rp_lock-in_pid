#!/bin/bash
# v2.2.8 (from lock_in+pid_harmonic v2.3.19): simulates the lock.v of the working tree (N) side by side with the lock.v of a previous commit (O)
# with test/lock_latency_tb.sv in Vivado 2020.1 xsim: every signal of N must be the one of O delayed by the
# latency documented in doc/lock_latency.md, bit by bit; also measures the latency of a step.
# Usage: test/lock_latency_sim.sh [work_dir [old_ref]]   (default: a temporary directory, removed at the end;
#        old_ref = 694e02d, v2.2.7, the last version without the pipeline registers)
# The modules of the old version are renamed with the prefix o_ (module names only).
# Exit status 0 if the testbench prints "TB RESULT: PASS".
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
PRJ="$HERE/../fpga/prj/v0.94/rtl"
REPO="$(cd "$HERE/.." && git rev-parse --show-toplevel)"
SUB="lock_in+pid/fpga/prj/v0.94/rtl"
OLD_REF="${2:-694e02d}"
TB="$HERE/lock_latency_tb.sv"
VIVADO_SETTINGS="${VIVADO_SETTINGS:-/tools/Xilinx/Vivado/2020.1/settings64.sh}"
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK/old"
cp "$PRJ"/lock/*.dat "$WORK"/       # \$readmemb of gen_mod_h.v
# old sources (lock/abs_val.v is not used by lock.v and xvlog rejects it)
OLD_FILES="lock.v $(git -C "$REPO" ls-tree --name-only "$OLD_REF" "$SUB/lock/" | grep '\.v$' | grep -v '/abs_val.v$' | sed "s|^$SUB/||")"
for f in $OLD_FILES; do
  mkdir -p "$WORK/old/$(dirname "$f")"
  git -C "$REPO" show "$OLD_REF:$SUB/$f" > "$WORK/old/$f"
done
MODS=$(cat "$WORK"/old/lock.v "$WORK"/old/lock/*.v | sed -n 's/^\s*module\s\+\([A-Za-z0-9_]\+\).*/\1/p' | sort -u)
SEDEXPR=""
for m in $MODS; do SEDEXPR="$SEDEXPR -e s/\\b$m\\b/o_$m/g"; done
for f in $OLD_FILES; do sed -i $SEDEXPR "$WORK/old/$f"; done
NEW_FILES="$PRJ/lock.v $(ls "$PRJ"/lock/*.v | grep -v '/abs_val.v$' | tr '\n' ' ')"
OLD_ABS="$(for f in $OLD_FILES; do echo -n "$WORK/old/$f "; done)"
env -i HOME="$HOME" PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C bash -c "
  . '$VIVADO_SETTINGS' > /dev/null &&
  cd '$WORK' &&
  xvlog $NEW_FILES &&
  xvlog $OLD_ABS &&
  xvlog -sv '$TB' &&
  xvlog \$XILINX_VIVADO/data/verilog/src/glbl.v &&
  xelab -debug off --timescale 1ns/1ps -L unisims_ver lock_latency_tb glbl -s lock_latency_tb_sim &&
  xsim lock_latency_tb_sim -R
" 2>&1 | tee "$WORK/lock_latency_sim.log"
RC=1
grep -q "TB RESULT: PASS" "$WORK/lock_latency_sim.log" && RC=0
[ -z "$1" ] && rm -rf "$WORK"
exit $RC
