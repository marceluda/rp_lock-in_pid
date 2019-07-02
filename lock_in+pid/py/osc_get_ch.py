#!/usr/bin/python3

from __future__ import print_function

from time import sleep
import mmap
import sys
import struct
import subprocess

import argparse


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


def is_int(s):
    try:
        int(s)
        return True
    except ValueError:
        return False


from hugo import osc,li


parser = argparse.ArgumentParser()

parser.add_argument('-b', action='store_true',
                    default=False,
                    dest='binary',
                    help='Set binary to true')
args = parser.parse_args()


if __name__ == '__main__':
    osc.get_chs()
    outbuff=osc.get_curves(binary=args.binary)
    if args.binary:
        sys.stdout.buffer.write(outbuff)
    else:
        print(outbuff)


