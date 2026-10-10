#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Close the lock of lock_in+pid (v2.2.6 or later; ported from lock_in+pid_harmonic v2.3.14) writing ONLY FPGA registers, and read its state.

Runs on the Red Pitaya (same mmap access as the other scripts of this folder, through hugo.py), with or
without the web UI open. Nothing is copied back from the status: the FPGA runs the lock sequence by itself
(see doc/lock_control.md).

  lock_control (0x28, rw): [0] lock_now  [1] launch_lock (arm)  [2] pidB_en  [3] pidA_en  [4] ramp_en (manual)
                           [5] set_pidB  [6] set_pidA  [7] set_ramp (enables when locked)
                           [9:8] trigger type (0 off, 1 time, 2 level, 3 level after time)  [10] level rising
  lock_status  (0x2C, ro): [0] armed  [1] locked  [2] pidB_en  [3] pidA_en  [4] ramp_en (effective)
                           [15:8] number of locks (mod 256)

Examples:
  ./lock_from_registers.py --status
  ./lock_from_registers.py --trig time --time 16.58ms --set pidA,pidB          # arm, wait for the lock
  ./lock_from_registers.py --trig level --level 5085 --sw 0 --rise --set pidA
  ./lock_from_registers.py --trig both --time 10ms --level 0.5V --sw 0 --fall
  ./lock_from_registers.py --now --set pidA,pidB                               # lock right now
  ./lock_from_registers.py --release                                           # back to the manual enables
  ./lock_from_registers.py --trig time --time 16.58ms --set pidA,pidB --force  # release and arm again

Same request (lock_in+pid_harmonic v2.3.14): if the lock is already LOCKED with the same lock_control value and the same
trigger registers (--time / --level / --sw), nothing is written (a request is [1:0] = 00 and then the
0->1 edge, and that 00 would open the loop for a few ms): the script says so and exits with code 0.
If it is ARMED with the same request, nothing is written and it just waits for the lock. Use --force to
release and arm (or lock) again anyway. A different request releases the current lock and arms the new one.

lock_trig_sw (signal for the level trigger): 0 error, 1 X, 2 Y, 3 F1, 4 F2, 5 F3, 6 sqX, 7 sqY, 8 sqF, 9 signal_i,
10 ramp_A, 11 aux_A, 12 in1, 13 in2, 14 in1-in2, 15 pidA_out (FPGA muxer of lock.v).

Note: the C controller (web UI) writes lock_control only when the user changes a lock control button or
checkbox, so a value written here is kept. The other lock registers (lock_trig_time, lock_trig_val, ...)
are rewritten by the controller with its copy of them when the user changes any lock parameter in the UI.
"""

from __future__ import print_function

import argparse
import sys
import time

from hugo import li

ENABLES = ('ramp', 'pidA', 'pidB')
TRIG_TYPES = {'off': 0, 'time': 1, 'level': 2, 'both': 3}


def parse_enables(txt):
    """'ramp,pidA' -> {'ramp':1,'pidA':1,'pidB':0}"""
    names = [x.strip() for x in txt.split(',') if x.strip()] if txt else []
    for n in names:
        if n not in ENABLES:
            raise argparse.ArgumentTypeError('unknown enable "{:s}" (use {:s})'.format(n, ','.join(ENABLES)))
    return {n: int(n in names) for n in ENABLES}


def parse_time(txt):
    """time trigger: clock ticks (8 ns) or a value with units s, ms, us"""
    t = txt.strip().lower()
    for unit, factor in (('us', 1e-6), ('ms', 1e-3), ('s', 1.0)):
        if t.endswith(unit):
            return int(round(float(t[:-len(unit)]) * factor / 8e-9))
    return int(t)


def parse_level(txt):
    """level trigger: integer (-8192..8191) or a value with units V, mV"""
    t = txt.strip().lower()
    if t.endswith('mv'):
        v = int(round(float(t[:-2]) * 8192 / 1000))
    elif t.endswith('v'):
        v = int(round(float(t[:-1]) * 8192))
    else:
        v = int(t)
    return max(-8192, min(8191, v))


def lock_control_value(now, launch, manual, final, trig_type, rise):
    return ((now & 1) << 0 | (launch & 1) << 1 |
            manual['pidB'] << 2 | manual['pidA'] << 3 | manual['ramp'] << 4 |
            final['pidB'] << 5 | final['pidA'] << 6 | final['ramp'] << 7 |
            (trig_type & 3) << 8 | (rise & 1) << 10)


def read_status():
    s = li['lock_status'].val()
    return {'raw': s, 'armed': s & 1, 'locked': (s >> 1) & 1, 'pidB': (s >> 2) & 1, 'pidA': (s >> 3) & 1,
            'ramp': (s >> 4) & 1, 'count': (s >> 8) & 0xff}


def describe_control(lc):
    names = {0: 'off', 1: 'time', 2: 'level', 3: 'level+time'}
    return ('lock_control={:4d} (0x{:03x}): lock_now={:d} launch={:d} manual[ramp,A,B]={:d}{:d}{:d} '
            'set[ramp,A,B]={:d}{:d}{:d} trig={:s} rise={:d}').format(
        lc, lc, lc & 1, (lc >> 1) & 1, (lc >> 4) & 1, (lc >> 3) & 1, (lc >> 2) & 1,
        (lc >> 7) & 1, (lc >> 6) & 1, (lc >> 5) & 1, names[(lc >> 8) & 3], (lc >> 10) & 1)


def describe_status(st):
    state = 'LOCKED' if st['locked'] else ('ARMED' if st['armed'] else 'OFF')
    return ('lock_status={:5d} (0x{:04x}): {:6s} effective[ramp,A,B]={:d}{:d}{:d} locks={:d}').format(
        st['raw'], st['raw'], state, st['ramp'], st['pidA'], st['pidB'], st['count'])


def main():
    ap = argparse.ArgumentParser(description='Lock from FPGA registers only (lock_in+pid v2.2.6 or later)',
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument('--status', action='store_true', help='only print lock_control and lock_status')
    ap.add_argument('--release', action='store_true', help='clear the lock requests (bits [1:0]): back to the manual enables')
    ap.add_argument('--now', action='store_true', help='lock right now (lock_now) instead of arming the trigger')
    ap.add_argument('--trig', choices=sorted(TRIG_TYPES), default=None, help='trigger type (default: keep the current one)')
    ap.add_argument('--time', type=parse_time, default=None, help='time trigger: ticks of 8 ns, or e.g. 16.58ms')
    ap.add_argument('--level', type=parse_level, default=None, help='level trigger: -8192..8191, or e.g. 0.5V, 120mV')
    ap.add_argument('--sw', type=int, default=None, help='signal for the level trigger (lock_trig_sw, 0..15)')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--rise', dest='rise', action='store_const', const=1, default=None, help='level trigger on a rising crossing')
    g.add_argument('--fall', dest='rise', action='store_const', const=0, help='level trigger on a falling crossing')
    ap.add_argument('--scan', type=parse_enables, default=None,
                    help='manual enables while not locked, e.g. "ramp" (default: keep the current ones)')
    ap.add_argument('--set', dest='final', type=parse_enables, default=None,
                    help='enables when locked, e.g. "pidA,pidB" (default: keep the current ones)')
    ap.add_argument('--timeout', type=float, default=10.0, help='seconds to wait for the lock (0: do not wait)')
    ap.add_argument('--force', action='store_true',
                    help='release and request again even if the lock is already LOCKED/ARMED with the same request '
                         '(default: nothing is written then)')
    a = ap.parse_args()

    lc = li['lock_control'].val()
    if a.status:
        print(describe_control(lc))
        print(describe_status(read_status()))
        return 0

    if a.release:
        li['lock_control'].val(lc & ~3)
        print(describe_control(li['lock_control'].val()))
        print(describe_status(read_status()))
        return 0

    manual = a.scan if a.scan is not None else {'ramp': (lc >> 4) & 1, 'pidA': (lc >> 3) & 1, 'pidB': (lc >> 2) & 1}
    final = a.final if a.final is not None else {'ramp': (lc >> 7) & 1, 'pidA': (lc >> 6) & 1, 'pidB': (lc >> 5) & 1}
    trig_type = TRIG_TYPES[a.trig] if a.trig is not None else (lc >> 8) & 3
    rise = a.rise if a.rise is not None else (lc >> 10) & 1
    if not a.now and trig_type == 0:
        print('trigger type is off: use --trig time|level|both, or --now', file=sys.stderr)
        return 2

    base = lock_control_value(0, 0, manual, final, trig_type, rise)
    request = base | (1 if a.now else 2)

    # v2.3.14: same request already active -> nothing is written (the release [1:0] = 00 would open the loop)
    st = read_status()
    same_regs = ((a.time is None or (li['lock_trig_time'].val() & 0xffffffff) == (a.time & 0xffffffff)) and
                 (a.level is None or (li['lock_trig_val'].val() & 0x3fff) == (a.level & 0x3fff)) and
                 (a.sw is None or (li['lock_trig_sw'].val() & 0xf) == (a.sw & 0xf)))
    same = ((lc & 0x7ff) == request) and same_regs
    if same and not a.force and (st['locked'] or st['armed']):
        print(describe_control(lc))
        print(describe_status(st))
        if st['locked']:
            print('already LOCKED with the same request: nothing written (use --force to release and lock again)')
            return 0
        print('already ARMED with the same request: nothing written, waiting for the lock (--force: arm again)')
    else:
        # trigger registers
        if a.time is not None:
            li['lock_trig_time'].val(a.time)
        if a.level is not None:
            li['lock_trig_val'].val(a.level)
        if a.sw is not None:
            li['lock_trig_sw'].val(a.sw)
        # 1) configuration with no request: releases a previous lock (state OFF, manual enables)
        li['lock_control'].val(base)
        # 2) request: a 0->1 edge of lock_now or launch_lock. The FPGA does the rest by itself.
        li['lock_control'].val(request)
        print(describe_control(li['lock_control'].val()))
        print('lock_trig_time={:d} lock_trig_val={:d} lock_trig_sw={:d}'.format(
            li['lock_trig_time'].val(), li['lock_trig_val'].val(), li['lock_trig_sw'].val()))

    # 3) wait for the lock, reading only the status register
    t0 = time.time()
    st = read_status()
    print(describe_status(st))
    while not st['locked'] and a.timeout > 0 and time.time() - t0 < a.timeout:
        time.sleep(0.005)
        st = read_status()
    if st['locked']:
        print('locked after {:.3f} s'.format(time.time() - t0))
        print(describe_status(st))
        return 0
    if a.timeout > 0:
        print('not locked after {:g} s (still {:s}); --release to cancel'.format(
            a.timeout, 'ARMED' if st['armed'] else 'OFF'))
        print(describe_status(st))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
