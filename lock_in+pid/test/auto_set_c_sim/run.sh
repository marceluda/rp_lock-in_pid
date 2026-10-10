#!/bin/bash
# v2.3.14: builds the real controller sources natively (gcc of the PC, /dev/mem faked by fake_hw.h) with
# harness.c and runs it.  Usage: test/auto_set_c_sim/run.sh [src dir]   (default: ../../src)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=$(cd "${1:-$HERE/../../src}" && pwd)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
SRCS=$(ls "$SRC"/*.c | grep -v '_\.c$')     # not the main_controllerhf*.so_.c copies of the Makefile
for f in $SRCS; do
    # gnu89 like the gcc 4.9 of the target (inline functions of worker.c); no -Werror: on a 64-bit PC calib.c gives a %d/size_t format warning (fine on the 32-bit ARM target)
    gcc -c -g -O0 -std=gnu89 -Wall -Wno-format -DVERSION=sim -DREVISION=sim -include "$HERE/fake_hw.h" -I"$SRC" "$f" \
        -o "$OUT/$(basename "$f" .c).o"
done
gcc -c -g -O0 -Wall -Werror -I"$SRC" "$HERE/harness.c" -o "$OUT/harness.o"
gcc -o "$OUT/harness" "$OUT"/*.o -lm -lpthread
"$OUT/harness"
