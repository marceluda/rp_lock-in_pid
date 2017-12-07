# -*- coding: utf-8 -*-
"""
Created on Tue Sep 12 10:33:55 2017

@author: lolo
"""

from numpy import *
import matplotlib.pyplot as plt

import os
from time import sleep
import time

from datetime import datetime
import subprocess

#os.chdir('/home/lolo/Dropbox/Doctorado/herramientas/RedPitaya/scope+lock/v0.15/scope+lock/resources/RP_py')

from read_dump import read_dump


def smooth(x, window_len=11, window='hanning'):
    s=r_[2*x[0]-array(x[window_len:1:-1]), x, 2*x[-1]-array(x[-1:-window_len:-1])]
    w = ones(window_len,'d')
    y = convolve(w/w.sum(), s, mode='same')
    return y[window_len-1:-window_len+1]

def lta_find_head(filename):
    with open(filename, 'r') as file:
        i=0
        for line in file:
            i+=1
            if re.search('^Time[ ]*\[ms\]\t',line,re.M):
                break
    return i

def findpeaks(x,minh=0,mind=1):
    nn=len(x)
    z=nonzero(
        logical_and(
            logical_and( 
                diff(x)[0:nn-2]*diff(x)[1:nn-1]<=0 ,
                diff(x)[0:nn-2]>0
                ),
            x[0:nn-2]>minh
            )
        )[0]+1
    z=z.tolist()
    while(len(nonzero(diff(z)<mind)[0])>0):
        z.pop( nonzero(diff(z)<mind)[0][0]+1 )
    return z

def goodYlim(yy,margin=0.1,offset=0):
    full_range=max(yy)-min(yy)
    gmin=min(yy)-full_range*margin/2 + min(0,offset)*full_range
    gmax=max(yy)+full_range*margin/2 + max(0,offset)*full_range
    return (gmin,gmax)

def now():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def is_int(s):
    try:
        int(s)
        return True
    except ValueError:
        return False
    except TypeError:
        return False

#today=datetime.now().strftime("%Y%m%d")
#filename='/home/lolo/Dropbox/Doctorado/datos_labo/20171102/20171102_140828.bin'



#RP_addr='10.0.32.207'
#RP_port=2022

#ssh='ssh '+str(RP_addr)+' -l root ' + ('-p {:d} '.format(RP_port) if is_int(RP_port) else '')


#os.chdir('/home/lolo/Dropbox/Doctorado/datos_labo/lolo')


#%% Levantar curva ya medida en el osciloscopio en binario


class SSHError(Exception):
    def __init__(self, msj):
        self.msj = msj
    def __str__(self):
        return repr(self.msj)


class RPError(Exception):
    def __init__(self, msj):
        self.msj = msj
    def __str__(self):
        return repr(self.msj)

class red_pitaya_control():
    """
    This class is used to control FPGA registers associated to one memory slot
    of RedPitaya.
    
    Example:
    osc = red_pitaya_control(cmd='/root/py/osc.py' ,name='osc' ,parent=self)
    
    This creates osc object that lets you control Oscilloscope memory regs
    using the script '/root/py/osc.py' on RP host.
    
    Usage:
        osc.load()        # loads all the reg keys and values you can read/set
                          # Must be run once before any other function
                          # It create an attribute in osc for each reg key.
        osc.get('Dec')    # loads 'Dec' reg and returns its value
        osc.set('Dec',5)  # Sets 'Dec' reg value in RP to 5
        osc.Dec = 5       # Sets 'Dec' reg value in RP to 5
        print(osc.Dec)    # prints the already loaded Dec reg value
        
        osc.get_data()    # Returns a Dict with all the regs and values loeaded
    
    """

    def __init__(self,name,parent,cmd=''):
        self.cmd            = cmd
        self.parent         = parent
        self.keys           = []
        self.data           = {}
        self.name           = name
        #self.upload_changes = True
        
    def __setattr__(self, name, value):
        #if self.__dict__.get("_locked") and name == "x":
        #    raise AttributeError("MyClass does not allow assignment to .x member")
        if name in ['cmd' , 'parent' , 'keys', 'data' , 'name']:
            self.__dict__[name] = value
        elif name in self.keys :
            self.set(name,value)
        else:
            self.__dict__[name] = value
    
    def __repr__(self):
        txt='red_pitaya_control: '+self.name+' \n'
        txt+='              cmd: '+self.cmd+' \n'
        txt+='Keys avaible: '+' '.join(self.keys) + '\n'
        return txt
    
    def load(self):
        """
        Loads all the avaible keys values for the memory slot of red_pitaya_control
        """
        self.parent.log('rp.'+self.name+'.load(): '+self.cmd )
        result = self.parent.run(self.cmd)
        for rta in result.stdout.decode().strip().split('\n'):
            self.data[ rta.strip().split(':')[0].strip() ] = int(rta.strip().split(':')[1].strip())
        self.keys  = list(self.data.keys())
        #self.upload_changes = False
        for i in self.keys:
            #setattr(self,i,self.data[i])
            self.__dict__[i] = self.data[i]
        #self.upload_changes = True
    
    def get_data(self):
        """
        Returns a Dict with all the keys and values already loaded
        """
        return self.data
    
    def get(self,par):
        """
        Usage:
            self.get(par)
        
        If par is in self.keys , it load from RP the 'par' reg and returns it value.
        """
        if par in self.keys:
            self.parent.log('rp.'+self.name+'.get(par='+par+'): '+self.cmd+' '+par )
            result = self.parent.run(self.cmd+' '+par)
            for rta in result.stdout.decode().strip().split('\n'):
                self.data[ rta.strip().split(':')[0].strip() ] = int(rta.strip().split(':')[1].strip())
            #self.upload_changes = False
            #setattr(self,par,self.data[par])
            self.__dict__[par] = self.data[par]
            #self.upload_changes = True
            return self.data[par]
    
    def set(self,par,val):
        """
        Usage:
            self.set(par,val)
            
        Sets in RP the reg 'par' to value val
        """
        if par in self.keys:
            self.parent.log('rp.'+self.name+'.set(par='+par+',val='+str(val)+'): '+self.cmd+' '+par+' '+str(val) )
            result = self.parent.run(self.cmd+' '+par+' '+str(val))
            for rta in result.stdout.decode().strip().split('\n'):
                self.data[ rta.strip().split(':')[0].strip() ] = int(rta.strip().split(':')[1].strip())
            #self.upload_changes = False
            #setattr(self,par,self.data[par])
            self.__dict__[par] = self.data[par]
            #self.upload_changes = True
            print(self.name+'.set('+par+','+str(val)+')')
            return self.data[par]


class red_pitaya_lock():
    """
    This class is used to control RedPitaya (RP) scope+lock app using memory registers
    from the RP itself. The object lets you set and load regs, control oscilloscope and lock,
    load plots from oscilloscope, stream regs values to binary files in localhost,
    plot loaded data and keep log of all the activity.
    
    Example:
        rp=red_pitaya_lock(RP_addr='rp-f01d89.local',RP_port=22,filename='/home/user/experience01.npz')
    
    This creates the rp object associated to RP 'rp-f01d89.local' , connecting through port 22
    and will save any data to the file '/home/user/experience01.npz'.
    
    Usage:
        
        rp.log('msj')          # Logging messages you want to keep    
        rp.print_log()         # Shows logged data
        
        rp.get_curv()          # Gets oscilloscope channels data from RP memory
                               # and stores it in rp.data
        rp.fire_trig()         # Configure trigger and sets the oscilloscope the caught the
                               # next trigger event
        rp.print_data()        # Shows stored data
        
        rp.plot()              # Fast plot of stored data
        
        rp.save()              # Saves data into self.filename
        rp.load()              # Loads data from self.filename
        rp.export_data_csv()   # Exports stored data to csv files.
        
        rp.get_fast_stream()   # Streams registers values from RP to localhost for a definited
                               # short time length and stores it in a .bin file
        
        rp.start_streaming()   # Starts a long time length streaming of regs values from RP
                               # to localhost and stores it in a .bin file
        
        rp.stop_streaming()    # Stops a long time length streaming
        
    """
    def __init__(self,RP_addr,RP_port=22,filename=None):
        if filename==None:
            filename = pwd()+'/'+now()+'.npz'
        self.filename   = filename
        self.dir        = os.path.dirname(filename)
        self.today      = datetime.now().strftime("%Y%m%d")
        self.RP_addr    = RP_addr
        self.RP_port    = RP_port
        self.ssh        = 'ssh '+str(RP_addr)+' -l root ' + ('-p {:d} '.format(RP_port) if is_int(RP_port) else '')
        self.log_db     = []
        self.data       = []
        self.allan      = []
        self.osc        = red_pitaya_control(cmd='/root/py/osc.py' ,name='osc' ,parent=self)
        self.lock       = red_pitaya_control(cmd='/root/py/lock.py',name='lock',parent=self)
        self.oscA_sw    = ['0', 'in1', 'in2', 'error', 'ctrl_A', 'ctrl_B', 'Scan A', 'scan_B', 'pidA_in', 'pidB_in', 'PID A out', 'PID B out', 'sin_ref', 'cos_ref', 'sin_1f', 'sin_2f', 'sin_3f', 'sq_ref', 'sq_quad', 'sq_phas', "{1'b0,sq_ref_b,12'b0}", 'signal_i', 'Xo', 'Yo', 'F1', 'F2', 'F3', 'sqx', 'sqy', 'sqf', '0', '0']
        self.oscB_sw    = ['0', 'in1', 'in2', 'error', 'ctrl_A', 'ctrl_B', 'Scan A', 'scan_B', 'pidA_in', 'pidB_in', 'PID A out', 'PID B out', 'sin_ref', 'cos_ref', 'sin_1f', 'sin_2f', 'sin_3f', 'sq_ref', 'sq_quad', 'sq_phas', "{1'b0,sq_ref_b,12'b0}", 'signal_i', 'Xo', 'Yo', 'F1', 'F2', 'F3', 'sqx', 'sqy', 'sqf', '0', '0']
        self.newfig     = True
        self.check_connection()
        self.osc.load()
        self.lock.load()
        self.stream  = False
    
    def check_connection(self):
        """
        Checks that localhost can connect to RP throught SSH and gets some usefull info
        """
        self.info={}
        result = self.run('uname -a')
        if result.returncode == 0:
            self.info['RP kernel'] = result.stdout.decode().strip()
            result = self.run('echo $SSH_CONNECTION')
            myIP, myPort, rpIP, rpPort = result.stdout.decode().strip().split(' ')
            self.info['myIP']   = myIP
            self.info['myPort'] = myPort
            self.info['rpIP']   = rpIP
            self.info['rpPort'] = rpPort
    
    def __repr__(self):
        txt='red_pitaya_lock: \n'
        for i in 'filename RP_addr ssh'.split(' '):
            txt+='rp.{:<15s}: {:s}\n'.format(i, str(getattr(self,i )) )
        txt+='rp.{:<15s}: [{:>3d}]'.format('log_db', len(self.log_db) )
        txt+=' ---> [num , datetime , log_txt ]\n'
        
        txt+='rp.{:<15s}: [{:>3d}]'.format('data', len(self.data) )
        txt+=' ---> [num , datetime , Dict ]\n'
        txt+='                       Dict={i,ch1,ch2,ch1_name,ch2_name,dec,osc,lock,log}\n\n'
        
        return txt
    
    def __getitem__(self, key):
        if type(key)==int:
            return self.data[key]
        if type(key)==slice:
            return self.data[key]
    
    def log(self,txt,silent=False):
        """
        Usage:
            self.log(txt, silent=False)
        
        Logs txt string in self.log_db , with order and timestamp info
        if silent==False, prints txt
        """
        num=len(self.log_db)
        self.log_db.append( [ num, datetime.now().timestamp() , txt ] )
        if not silent:
            print(txt)
        return num
    
    def print_log(self):
        """
        Usage:
            self.print_log()
        
        Prints all logged data
        
        Example:
            rp.print_log()
            0  20171117_11:51:07 rp.run: uname -a | result[0]
            1  20171117_11:51:08 rp.run: echo $SSH_CONNECTION | result[0]
            2  20171117_11:51:08 rp.osc.load(): /root/py/osc.py
            3  20171117_11:51:10 rp.run: /root/py/osc.py | result[0]
            4  20171117_11:51:10 rp.lock.load(): /root/py/lock.py
            5  20171117_11:51:11 rp.run: /root/py/lock.py | result[0]
        """
        max_num = max([ len(str(y[0])) for y in self.log_db ])
        
        txt = '{:>'+str(max_num)+'d}  {:s} {:s}'
        for l in self.log_db:
            print( txt.format( l[0], 
                               datetime.fromtimestamp( l[1] ).strftime('%Y%m%d_%H:%M:%S'),
                               l[2] ) )
    def print_data(self):
        """
        Usage:
            self.print_data()
        
        Prints all loaded data
        
        Example:
            rp.print_data()
              0 12:22:10 : signals=sin_ref,sin_3f       log=
              1 12:23:14 : signals=sin_ref,sin_2f       log=Check here the slope
        """
        for dd in self.data:
            print('{:3d} {:s} : signals={:s} log={:s}'.format( 
                    dd[0], 
                    datetime.fromtimestamp( dd[1] ).strftime('%H:%M:%S'),
                    (dd[2]['ch1_name'] + ','+dd[2]['ch2_name']).ljust(20),
                    dd[2]['log']
                    ))
        
    def get_curv(self,log=''):
        """
        Gets oscilloscope channels data from RP memory. Its assumes the trigger is
        stopped and not running. If you want a fresh meassurement you must run a
        Mode:Single adquisition froms web interface or use self.fire_trig() first.
        
        Usage:
            self.get_curv(log='msj')
        
        The log params lets you save user info about the measurement
        
        The loaded data is stored in self.data as [ num, datetime , Dict ]
        The Dict has all the measurement data:
           'i'       : index vector of data,
           'ch1'     : channel 1 vector ,
           'ch2'     : channel 2 vector,
           'ch1_name': signal name of ch1,
           'ch2_name': signal name of ch2,
           'dec'     : Oscilloscope Decimation
           'osc'     : Dict with all oscilloscope RP regs,
           'lock'    : Dict with all lock RP regs,
           'log'     : log message
        
        ch1 and ch2 are 14 bits signed int vectors with 2**14 lenght.
        The time step between data points is 8 ns * 2**dec
        Trigger position can be get with:
            (self.data[num][2]['osc']['TrgWpt']-self.data[num][2]['osc']['CurWpt'])
        
        Example:
            rp.get_curv(log='This is to save a waveform sample')
            rp.plot()
            rp.print_data()
            
        """
        cmd='/root/py/osc_get_ch.py'
        result = self.run(cmd)
        self.log('rp.get_curv(): '+cmd+' | '+log)
        ind=[ int(y.strip().split(',')[0]) for y in result.stdout.decode().strip().split('\n') ]
        ch1=[ int(y.strip().split(',')[1]) for y in result.stdout.decode().strip().split('\n') ]
        ch2=[ int(y.strip().split(',')[2]) for y in result.stdout.decode().strip().split('\n') ]
        self.osc.load()
        self.lock.load()
        num=len(self.data)
        self.data.append( [num, datetime.now().timestamp(), {
                           'i'  : ind,
                           'ch1': ch1,
                           'ch2': ch2,
                           'ch1_name': self.oscA_sw[self.lock.oscA_sw],
                           'ch2_name': self.oscB_sw[self.lock.oscB_sw],
                           'dec': self.osc.Dec,
                           'osc': self.osc.data,
                           'lock': self.lock.data,
                           'log': log
                            }
                           ] )
    def save(self):
        """
        Saves stored data, logs, etc in self.filename using numpy.savez()
        
        Usage:
            self.save()
        
        """
        savez(self.filename, data  = self.data, 
                             log   = self.log_db,
                             info  = self.info,
                             allan = self.allan )
    
    def load(self):
        """
        Loads stored data, logs, etc from self.filename using numpy.load()
        
        Usage:
            self.save()
        
        """
        tmp=load(self.filename)
        self.data   = tmp['data'].tolist()
        self.log_db = tmp['log'].tolist()
        self.info   = tmp['info'].tolist()
        self.allan  = tmp['allan'].tolist()
    
    def fire_trig(self,trig_src,trig_pos=None,dec=None,hys=None,threshold=None,timeout=10):
        """
        Configure the oscilloscope trigger and make it wait and capture the next
        trigger event
        
        Usage:
            self.fire_trig(trig_src,trig_pos=None,dec=None,hys=None,threshold=None,timeout=10)
        
        Params reference:
            trig_src : Should be one of ['now', 'chAup', 'chAdown', 'chBup', 'chBdown', 'ext']
                       Sets the type of trigger event: ChA upward, ChA downward, ChB... External Trigger
            trig_pos : The position in ints that will have the trigger after adquisition.
                       If trig_pos=500 , trigger event will be at postiion 500 in the loaded data vectors.
                       If trig_pos=None will keep the last trigger position (e.g. the web interfase position)
            dec      : Decimation. Should be [0,1,8,64,1024,8192,65536]. The decimation parameter sets the time
                       interval between data points, to be 8 ns * 2**dec. The total adquisition time is
                       8 ns * 2**dec * 2**14 . If it is None, keeps the last value.
            hys      : Sets the hysteresis parameter.
            threshold: Sets the threshold paramater. Its the Value the signal should pass to fire the trigger.
                       Ther must be more than hys ints of difference between the data before the threshold and
                       after it to fire the trigger.
            timeout  : Sets the timeout in seconds.
        
        
        Example:
            rp.fire_trig('ext',trig_pos=300,dec=8,threshold=0,timeout=30)
            rp.get_curv(log='This is to save a waveform sample')
            rp.plot()
            
        """
        cmd='/root/py/osc_trig.py '
        if trig_src in ['now', 'chAup', 'chAdown', 'chBup', 'chBdown', 'ext']:
            cmd += '--signal '+trig_src+' '
        else:
            print('Triger not set')
            return False
        if type(trig_pos)==int:
            cmd += ' --time-before-trigger {:d} '.format(2**14-trig_pos)
        if type(dec)==int and (dec in [0,1,8,64,1024,8192,65536] ):
            cmd += ' --decimation {:d} '.format(dec)
        if type(threshold)==int:
            cmd += ' --value {:d} '.format(threshold)
        if type(hys)==int:
            cmd += ' --hys {:d} '.format(hys)
        cmd += ' --timeout {:d} '.format(timeout)
        self.log('fire_trig: '+cmd)
        result = self.run(cmd)
        if 'success' in result.stdout.decode():
            return True
        else:
            print('rp.fire_trig FAILED')
            print(result.stdout.decode())
            return False
            
    def export_data_csv(self,num=None):
        """
        Export stored data to csv files
        
        Usage:
            self.export_data_csv(num=None)
        
        If num==None, exports all the data.
        If type(num)==int , exports self.data[num]
        If type(num)==list , exports self.data[n] for n in num
        
        Example:
            rp.export_data_csv()
            
        """
        if num==None:
            num=arange(len(self.data)).tolist()
        elif type(num)==int and num in arange(len(self.data)).tolist():
            num=[num]
        elif not type(num)==list:
            print('Not valid data')
            return False
        
        for n in num:
            tt=datetime.fromtimestamp(self.data[n][1]).strftime("%Y%m%d_%H%M%S")
            nn='{:03d}'.format(self.data[n][0])
            fn=self.filename.split('.')[0:-1][0]+'_'+nn+'_'+tt+'_signals:'
            fn+=self.data[n][2]['ch1_name'] +','+self.data[n][2]['ch2_name']+'.csv'
            print('writting: '+fn)
            
            with open(fn, 'w') as out:
                out.write('# datetime: '+ datetime.fromtimestamp(self.data[n][1]).strftime("%d/%m/%Y %H:%M:%S") + '\r\n')
                out.write('# signals ch1='+self.data[n][2]['ch1_name'] + ',ch2='+ self.data[n][2]['ch2_name'] + '\r\n')
                out.write('# '+self.data[0][2]['log']+'\r\n')
                out.write('# num,           time,  ch1,  ch2\r\n')
                out.write('# int,            sec,  int,  int\r\n')
                for i in range(len(self.data[n][2]['i'])):
                    out.write( '{:5d},{:15f},{:5d},{:5d}\r\n'.format(
                            self.data[n][2]['i'][i],
                            (self.data[n][2]['i'][i]-(self.data[n][2]['osc']['TrgWpt']-self.data[n][2]['osc']['CurWpt']))*8e-9*self.data[n][2]['dec'] , 
                            self.data[n][2]['ch1'][i],
                            self.data[n][2]['ch2'][i],
                            ))
    def get_fast_stream(self,signals='error',log='',time_len=60):
        """
        Fire an streaming of regs values and store it in a .bin file in local host.
        get_fast_stream() waits until the streaming has finished to give the control back to the console.
        
        Usage:
            self.get_fast_stream(log='',signals='error',time_len=60)
        
        signals   : A list or a space separated string of signals names that should be streamed.
                    Each signal name should be one of self.lock.data.keys()
        time_len  : Length in seconds of the data streaming to take.
        
        Each stream is saved in a .bin file in the same folder of filename. The name of the file
        has the fire time information in format: YYYYMMDD_hhmmss.bin
        
        Each streaming session is saved in self.allan array in format:
            [num , datetime , bin_filename , log_txt ]
        
        Example:
            rp.get_fast_stream('error ctrl_A ctrl_B')
            d=read_dump(rp.allan[-1][2])
            d.plotr(start=0,end=-1,signals='error ctrl_A')
            
        """
        ip=self.run('echo $SSH_CONNECTION').stdout.decode().split(' ')[0]
        if type(signals)==str:
            signals=signals.split(' ')
        for i in signals:
            if not i in self.lock.keys:
                raise RPError('{:s} is not in self.lock.keys'.format(i))
        name=os.path.dirname(self.filename)+'/'+now()+'.bin'
        num=len(self.allan)
        self.allan.append( [num, datetime.now().timestamp() , name , log ] )
        print('Getting streaming for ['+' '.join(signals)+'], time_len={:d} sec'.format(time_len))
        self.log('get_fast_stream(): Getting streaming for ['+' '.join(signals)+'], time_len={:d} sec'.format(time_len),silent=True)
        self.log('get_fast_stream('+name+'):'+log,silent=True)
        file=open(name,'a')
        ncproc = subprocess.Popen( 'nc -l 6000'.split(' ') , shell=False , stdin=subprocess.PIPE , stdout=file , stderr=subprocess.PIPE)
        #subprocess.Popen('nc -d -l 6000 > '+name, shell=True)
        cmd='/root/py/data_dump.py -s '+ip+' -p 6000 -t '+str(time_len)+' --params '+' '.join(signals)
        self.log('remote: '+cmd)
        result = self.run(cmd)
        ncproc.terminate()
        ncproc.communicate()
        file.close()
        
        print(result.stdout.decode())
        
    def start_streaming(self,signals='error',log=''):
        """
        Start an streaming of regs values and store it in a .bin file in local host.
        start_streaming() gives the control back to the console inmediatly. To stop the
        streaming you should use self.stop_streaming() .
        
        Usage:
            self.start_streaming(signals='error',log='')
        
        signals   : A list or a space separated string of signals names that should be streamed.
                    Each signal name should be one of self.lock.data.keys()
        
        Each stream is saved in a .bin file in the same folder of filename. The name of the file
        has the fire time information in format: YYYYMMDD_hhmmss.bin
        
        Each streaming session is saved in self.allan array in format:
            [num , datetime , bin_filename ]
        
        Example:
            rp.start_streaming('error ctrl_A ctrl_B')
            time.sleep(3600)
            rp.stop_streaming()
            d=read_dump(rp.allan[-1][2])
            d.plotr(start=0,end=-1,signals='error ctrl_A')
            
        """
        ip=self.run('echo $SSH_CONNECTION').stdout.decode().split(' ')[0]
        if type(signals)==str:
            signals=signals.split(' ')
        for i in signals:
            if not i in self.lock.keys:
                raise RPError('{:s} is not in self.lock.keys'.format(i))
        name=os.path.dirname(self.filename)+'/'+now()+'.bin'
        num=len(self.allan)
        self.allan.append( [num, datetime.now().timestamp() , name , log ] )
        print('Getting streaming for ['+' '.join(signals)+']')
        self.log('start_streaming(): Getting streaming for ['+' '.join(signals)+']')
        self.log('start_streaming():'+log)
        
        self.file   = open(name,'a')
        self.stream = subprocess.Popen( 'nc -l 6000'.split(' ') , shell=False , stdin=subprocess.PIPE , stdout=self.file , stderr=subprocess.PIPE)
        #subprocess.Popen('nc -d -l 6000 > '+name, shell=True)
        cmd='/root/py/data_dump.py -s '+ip+' -p 6000 --params '+' '.join(signals)
        self.log('remote: '+cmd)
        self.remote  = subprocess.Popen(self.ssh.split(' ')+[cmd], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        #sleep(2)
        #print('streaming started:'+self.stream.stdout.read().decode())
    def stop_streaming(self):
        """
        Stops an streaming of regs values already launched.
        See start_streaming().
        
        Example:
            rp.start_streaming('error ctrl_A ctrl_B')
            time.sleep(3600)
            rp.stop_streaming()
            d=read_dump(rp.allan[-1][2])
            d.plotr(start=0,end=-1,signals='error ctrl_A')
            
        """
        if self.stream==False:
            print('Streaming never started')
        else:
            cmd="ps ax "
            result = self.run(cmd)
            for i in [ y.strip().split(' ')[0] for y in filter(lambda x: 'data_dump.py' in x, result.stdout.decode().split('\n'))  ]:
                self.run('kill '+str(i))
                self.log('stop_straming(): killing pid: '+str(i))
            self.stream.terminate()
            self.stream.communicate()
            self.file.close()
            self.stream=False
    def plot(self,num=-1,figsize=(12,5),time=True,rel=None,same_plot=True,autotime=True):
        """
        Plot stored data taken from oscilloscope channels.
        
        Usage:
            self.plot(num=-1,figsize=(12,5),time=True,rel=None,same_plot=True,autotime=True)
        
        num       : The dataset to plot. Will plot self.data[num]
        time      : if True, x axis the time vector. Else, x axis is the index position vector.
        rel       : Realtive. If rel==True, the 0 of x axis will be the trigger position.
                    default value: rel=time.
        same_plot : If True, both channels are plot in the same subplot. Else, each channel
                    will be ploted in different subplots with shared x axis.
        autotime  : If True, time units are shown in a human readable form using ns, us, ms, sec, min or hour.
        figsize   : figure size
        
        if self.newfig==True , each plot generates a new plot figure.
        
        Example:
            rp.plot(num=-1,same_plot=False)
            
        """
        xx=array(self.data[num][2]['i'])
        y1=array(self.data[num][2]['ch1'])
        y2=array(self.data[num][2]['ch2'])
        y1_lbl=self.data[num][2]['ch1_name']
        y2_lbl=self.data[num][2]['ch2_name']
        
        if rel==None:
            rel=time
        if rel:
            xx=xx-(self.data[num][2]['osc']['TrgWpt']-self.data[num][2]['osc']['CurWpt'])
        if time:
            xx=xx*8e-9*self.data[num][2]['dec']
            xlbl='tiempo [seg]'
            if autotime and max(abs(xx)) < 5e-4:
                xx=xx*1e6
                xlbl='tiempo [us]'
            elif autotime and max(abs(xx)) < 5e-1:
                xx=xx*1e3
                xlbl='tiempo [ms]'
            elif autotime and max(abs(xx)) > 60*3 :
                xx=xx/60
                xlbl='tiempo [min]'
            elif autotime and max(abs(xx)) > 60*60*3 :
                xx=xx/60/60
                xlbl='tiempo [hour]'
        else:
            xlbl='posicion [int]'
        
        if self.newfig:
            plt.figure(figsize=figsize)
        else:
            plt.clf()
        
        self.ax=[]
        if same_plot:
            self.ax.append( plt.subplot2grid( (1,1), (0, 0))  )
            ax1=self.ax[0]
            ax2=self.ax[0]
        else:
            self.ax.append( plt.subplot2grid( (2,1), (0, 0))  )
            self.ax.append( plt.subplot2grid( (2,1), (1, 0), sharex=self.ax[0])  )
            ax1=self.ax[0]
            ax2=self.ax[1]
        
        ax1.plot(xx,y1,label=y1_lbl)
        ax2.plot(xx,y2,label=y2_lbl)
        if same_plot:
            plt.legend()
        else:
            ax1.set_ylabel(y1_lbl)
            ax2.set_ylabel(y2_lbl)
        ax1.grid(b=True)
        ax2.grid(b=True)
        ax2.set_xlabel(xlbl)
        plt.tight_layout()
    
    def run(self,cmd):
        """
        Runs a command on RP host and returns the stdout.
        
        Usage:
            self.run(cmd)
        
        Example:
            root_files = rp.run('ls -l /')
            
        """
        result = subprocess.run(self.ssh.split(' ')+[cmd], stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        if result.returncode == 0:
            self.log('rp.run: '+ cmd + ' | result[{:d}]'.format(result.returncode))
            return result
        elif result.returncode == 1:
            msj='Remote command ERROR [{:d}]: '.format(result.returncode)+result.stderr.decode()
            self.log('rp.run: '+ cmd + ' | result[{:d}] | '.format(result.returncode) + msj)
            raise SSHError(msj)
        else:
            msj='SSH ERROR [{:d}]: '.format(result.returncode)+result.stderr.decode()
            self.log('rp.run: '+ cmd + ' | result[{:d}] | '.format(result.returncode) + msj)
            raise SSHError(msj)




if __name__ == '__main__':    

    rp=red_pitaya_lock(RP_addr='10.0.32.207',RP_port=2022,filename='/home/lolo/Dropbox/Doctorado/datos_labo/lolo/test.npz')


