#!/usr/bin/python3

from __future__ import print_function

import signal
from time import time
from time import sleep
import mmap
import sys
import struct
import subprocess

import argparse




# Some config vars
Dtime  = 2e-3  # seg
Dtime2 = Dtime/2

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


parser = argparse.ArgumentParser()

parser.add_argument("-s", "--server", type=str, default="10.0.32.147",
                    help="server ip address")
parser.add_argument("-p", "--port", type=str, default="6000",
                    help="server tcp port")
parser.add_argument("-t", "--timeout", type=int, dest='timeout', default=0,
                    help="timeout value. 0 means infinite.")
parser.add_argument('--params', nargs='+')

args = parser.parse_args()

nc_cmd = ['nc '+args.server+' '+args.port]


if __name__ == '__main__':
    # Function for nice kill
    killer = GracefulKiller()
    
    # Memory sectors to send
    memcodes=[]
    
    if len(sys.argv)>1:
        for i in args.params:
            memcodes.append(li[i].addr)
    else:
        eprint("Usage: ... ")
        eprint(" ")
        numkeys=[y.ljust(20) for y in li.names()]
        for i in range(int(len(numkeys)/5+1)):
            print(', '.join(numkeys[i*5:(i+1)*5]))
        eprint("")
        eprint("Run in server:")
        eprint("nc -l -p 6000 | pv -b >  $( date +%Y%m%d_%H%M%S ).bin ")
        eprint("")
        exit()
    
    # Store first time
    t0=time()
    
    struct_str='!f'
    C=[]
    for i in args.params:
        struct_str+='l'
        C.append(0)
    ss=struct.Struct(struct_str)
    
    # NetCat proccess to send data to server
    process = subprocess.Popen(nc_cmd, shell=True, stdin=subprocess.PIPE,stdout=subprocess.PIPE,preexec_fn = preexec_function)
    
    txt=(('Columns: '+','.join(args.params)+'\n'+'timestamp {:>20f}\n'.format(t0)).ljust(99)+'\n').encode('ascii')
    
    process.stdin.write(txt)
    process.stdin.flush()
    
    # Open memory
    with open("/dev/mem", "r+b") as f:
      mm = mmap.mmap(f.fileno(), 512, offset=0x40600000)
      
      txt2=[]
      for i in li:
          addr=i.addr
          A=int.from_bytes(mm[addr:addr+4], byteorder='little', signed=True)
          txt2.append( '"{:s}": {:f}'.format(i.name,A) )
      process.stdin.write( (  ('params={'+',\n'.join(txt2) +'\n}\n').ljust(3399)+'\n' ).encode('ascii') )
      process.stdin.flush() 
      li.start_clk()
      print(t0)
      tl=time()
      if args.timeout <= 0:
          while True:
              if (time()-tl>Dtime):
                  li.freeze()
                  for i,addr in enumerate(memcodes):
                      C[i]=int.from_bytes(mm[addr:addr+4], byteorder='little', signed=True)
                  #sys.stdout.buffer.write( ss.pack(time()-t0, *C )  )
                  li.unfreeze()
                  process.stdin.write( ss.pack(time()-t0, *C ) )
                  process.stdin.flush()
              sleep(Dtime2)
              if killer.kill_now:
                  break
      else:
          while True:
              if (time()-tl>Dtime):
                  li.freeze()
                  for i,addr in enumerate(memcodes):
                      C[i]=int.from_bytes(mm[addr:addr+4], byteorder='little', signed=True)
                  #sys.stdout.buffer.write( ss.pack(time()-t0, *C )  )
                  li.unfreeze()
                  process.stdin.write( ss.pack(time()-t0, *C ) )
                  process.stdin.flush()
              sleep(Dtime2)
              if (time()-tl>args.timeout):
                  break
              if killer.kill_now:
                  break            
    # End code
    
    print("Program finished")
    print('')
    print("pack string: '{:s}'".format(struct_str))




######## Reading example

#from numpy import *
#import matplotlib.pyplot as plt
 
#import struct
 
#fn='/home/lolo/tmp/borrar/archivo2.txt'
 
#cs=struct.calcsize('!fhhh')
#dd=[]
#with open(fn,'rb') as f:
    #txt=f.read(100)
    #fc=f.read(cs)
    #while fc:
        #dd.append(struct.unpack('!fhhh',fc))
        #fc=f.read(cs)
 
#dd=array(dd)
 
#t=array(dd)[:,0]  ;  a=array(dd)[:,1]  ;  b=array(dd)[:,2] ; c=array(dd)[:,3]
 
#plt.plot(t,a,t,b,t,c)
