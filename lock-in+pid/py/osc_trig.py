#!/usr/bin/python3

from __future__ import print_function

import signal
import time
from time import sleep
import mmap
import sys
import struct
import subprocess

import argparse


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

# This is to prevent CTRL+C signal to go to nc subprocess
def preexec_function():
    # Ignore the SIGINT signal by setting the handler to the standard
    # signal handler SIG_IGN.
    signal.signal(signal.SIGINT, signal.SIG_IGN)


from hugo import osc,li


# Function to handle nice close with CTRL+C
class GracefulKiller:
    kill_now = False
    def __init__(self):
        signal.signal(signal.SIGINT, self.exit_gracefully)
        signal.signal(signal.SIGTERM, self.exit_gracefully)

    def exit_gracefully(self,signum, frame):
        self.kill_now = True


#Trigger source:
#1-trig immediately
#2-ch A threshold positive edge
#3-ch A threshold negative edge
#4-ch B threshold positive edge
#5-ch B threshold negative edge
#6-external trigger positive edge - DIO0_P pin
#7-external trigger negative edge
#8-arbitrary wave generator application positive edge
#9-arbitrary wave generator application negative edge

sig_val={'now':1,'chAup':2,'chAdown':3,'chBup':4,'chBdown':5, 'ext':6}

parser = argparse.ArgumentParser()

parser.add_argument("-t", "--timeout", type=int, dest='timeout', default=10,
                    help="timeout in seconds")
parser.add_argument("-p", "--time-before-trigger", dest='trig_pos', type=int, default=-1,
                    help="clock ticks to wait before trigger (each tick is 8 ns)")
parser.add_argument('-s','--signal', dest='signal', action='store', choices=list(sig_val.keys()), default='now', help='signal for trigger')

parser.add_argument("-v", "--value", type=int, dest='threshold', default=100001,
                    help="threshold value")

parser.add_argument("--hyst", type=int, dest='hyst', default=-1,
                    help="threshold value")

parser.add_argument("-d", "--decimation", type=int, dest='dec', action='store', choices=[0,1,8,64,1024,8192,65536], default=0, help='decimation value')

# threshold

args = parser.parse_args()


if __name__ == '__main__':
    # Function for nice kill
    killer = GracefulKiller()
    
    osc.reset()
    if args.dec>0:
        osc.set_dec(args.dec)
    
    osc.trigVal=sig_val[args.signal]
    
    if sig_val[args.signal] in [2,3] and abs(args.threshold)<8192:
        osc['ChAth'].val(args.threshold)
    if sig_val[args.signal] in [4,5] and abs(args.threshold)<8192:
        osc['ChBth'].val(args.threshold)
    
    if args.hyst>0:
        osc['ChAHys'].val(args.hyst)
        osc['ChBHys'].val(args.hyst)
        
    
    if args.trig_pos>=0:
        osc['TrgDelay'].val(args.trig_pos)
    
    osc.start_trigger()
    tbuff=time.time()
    
    while True:
        sleep(0.1)
        
        if time.time()-tbuff > args.timeout:
            success=False
            break
        if (osc['conf'].val() & 4 ) == 4:
            success=True
            break
    
    if not success:
        print('timeout')
        exit()
    
    new_conf=int( osc['conf'].val() | 1 )
    osc['conf'].val(new_conf)
    
    tbuff=time.time()
    while True:
        sleep(0.1)
        if time.time()-tbuff > args.timeout:
            success=False
            break
        if osc['TrgSrc'].val() == 0:
            success=True
            break
    
    if success:
        print('success')
    else:
        print('memory read error')
    
    

