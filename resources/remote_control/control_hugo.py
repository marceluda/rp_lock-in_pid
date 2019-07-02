# -*- coding: utf-8 -*-
"""
Created on Tue Sep 12 10:33:55 2017

@author: lolo
"""

from numpy import *
try:
    import matplotlib.pyplot as plt
except:
    print('No PLT')


import os
from time import sleep
import time

from datetime import datetime
import subprocess
import platform
import paramiko
# conda install -c anaconda paramiko
import getpass
import socket

import requests
import bs4

#from read_dump import read_dump

# For read_dump
import glob
import struct
import struct


BLUE='\033[34m'
RED='\033[31m'
NORMAL='\033[0m'


#%%
## This are some auxilliary functions



def get_url(url,get={}):
    res = requests.get(url,get)

    try:
        res.raise_for_status()
    except Exception as exc:
        print('There was a problem: %s' % (exc))

    return res.text


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



#%%

# Cosas para graficar




class data2obj(object):
    def __init__(self, adict):
        """Convert a dictionary to a class

        @param :adict Dictionary
        """
        self.__dict__.update(adict)
        for k, v in adict.items():
            if isinstance(v, dict):
                self.__dict__[k] = data2obj(v)
            if isinstance(v, list):
                self.__dict__[k] = [ data2obj(f) if isinstance(f, dict) else f  for f in v ]

    def __getitem__(self, key):
        return self.__dict__[key]

    def __repr__(self):
        return repr(self.__dict__)


class RpDat():
    def __init__(self,data):
        self.data        = data.copy()
        self.datetime    = datetime.fromtimestamp(data[1]).strftime("%Y-%m-%d_%H:%M:%S")
        self.timestamp   = data[1]
        self.len         = len( data[2]['ch1'] )
        self.channels    = [1,2]
        self.params      = data2obj({'osc': data[2]['osc'] , 'lock': data[2]['lock'] })
        self.t_name      = 'tiempo'
        for jj in ['ch1_name', 'ch2_name', 'log', 'calib_params', 'dec']:
            setattr(self,jj, data[2][jj])
        self.d         = {}
        self.update()

    def update(self):
        for i in [1,2]:
            raw  = array( self.data[2]['ch'+str(i)] ) * 1.0
            ch   = (raw + self.calib_params['FE_CH'+str(i)+'_DC_offs'])*float(self.calib_params['FE_CH'+str(i)+'_FS_G_HI'])/2**32*100/8192
            setattr(self,'ch{:d}'.format(i) , ch  )
            self.d['ch{:d}_raw'.format(i)] = raw
            self.d['ch{:d}'.format(i)    ] = ch
        xx  = array(self.data[2]['i'])-(self.data[2]['osc']['TrgWpt']-self.data[2]['osc']['CurWpt'])
        xx  = xx*8e-9*self.dec

        self.d['t'] =  xx
        self.d['N'] =  arange(self.len)
        for k in self.d.keys():
            setattr(self, k , self.d[k] )


    def plot(self,chs=[],fun=[],scale=False):
        if type(chs)==int:
            chs = [chs]
        if chs==[]:
            chs = self.channels
        if fun==[]:
            fun = lambda x: x
        if callable(fun):
            fun = [fun]*len(chs)

        prefix = { 0: '', 1:'k' , 2:'M' , 3:'G' , 4:'T' , 5:'P' ,
                 -1:'m' ,-2:'μ' ,-3:'n' ,-4:'p' ,-5:'a'}

        if scale:
            tsc      = min( log10( max(self.t)-min(self.t ))//3 , 0 )
            t_factor = 1/10**(tsc*3)
            t_prefix = prefix[tsc]
        else:
            t_prefix = ''
            t_factor = 1


        self.ax = []
        self.ax.append( plt.subplot2grid((len(chs),1), (0, 0) ))
        for i,ch in enumerate(chs):
            if i>0:
                self.ax.append( plt.subplot2grid((len(chs),1), (i, 0) , sharex=self.ax[0] ))

            if scale:
                tmp_y   = fun[i](self.d['ch{:d}'.format(ch)])
                sc      = log10( max(tmp_y)-min( tmp_y ))//3
                factor = 1/10**(sc*3)
                v_prefix = prefix[sc]
            else:
                v_prefix = ''
                factor = 1
            self.ax[-1].plot( self.t * t_factor ,
                              fun[i](self.d['ch{:d}'.format(ch)]) * factor,
                              label=self.__dict__['ch'+str(ch)+'_name'] )
            self.ax[-1].grid(b=True,linestyle='--',color='lightgray')
            self.ax[-1].set_ylabel(self.__dict__['ch'+str(ch)+'_name']+' ['+v_prefix+'V]')
        self.ax[-1].set_xlabel('t['+t_prefix+'s]')
        self.ax[-1].set_xlim(min(self.t*t_factor),max(self.t*t_factor))
        for axx in self.ax[0:-1]:
            plt.setp(axx.get_xticklabels(), visible=False)
            axx.set_xlabel('')
        plt.tight_layout()
        return self


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
        for rta in self.parent.ssh_cmd(self.cmd).strip().split('\n'):
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
            result = self.parent.ssh_cmd(self.cmd+' '+par)
            for rta in result.strip().split('\n'):
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
            result = self.parent.ssh_cmd(self.cmd+' '+par+' '+str(val))
            for rta in result.strip().split('\n'):
                self.data[ rta.strip().split(':')[0].strip() ] = int(rta.strip().split(':')[1].strip())
            #self.upload_changes = False
            #setattr(self,par,self.data[par])
            self.__dict__[par] = self.data[par]
            #self.upload_changes = True
            print(self.name+'.set('+par+','+str(val)+')')
            return self.data[par]

###################################################################################

#%%
class red_pitaya_app():
    """
    This class is used to control RedPitaya (RP) lock_in+pid app using memory registers
    from the RP itself. The object lets you set and load regs, control oscilloscope and lock,
    load plots from oscilloscope, stream regs values to binary files in localhost,
    plot loaded data and keep log of all the activity.

    Example:
        rp=red_pitaya_lock(AppName='lock_in+pid',host='rp-f01d89.local',port=22,filename='/home/user/experience01.npz')

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


    def __init__(self,AppName='lock-in_pid',host=None,port=22,password='',user='root',key_path='',filename=None, connect=True, loadApp=False):
        self.ssh = None
        if not filename==None:
            self.filename   = filename
        else:
            self.filename   = datetime.now().strftime("%Y%m%d_%H%M%S")+'.npz'
        self.AppName        = AppName
        self.host           = host
        self.port           = port
        self.password       = password if len(password)>0 else 'root'
        self.user           = user
        self.connected      = False
        self.rw             = False
        self.ssh            = paramiko.SSHClient()
        self.path           = os.getcwd()
        self.key_path       = key_path if len(key_path)>0 else 'pass' if len(password)>0 else ''
        self.linux          = True if platform.system()=='Linux' else False
        self.home           = os.environ['HOME'] if platform.system()=='Linux' else os.environ['USERPROFILE']
        self.verbose        = True
        if not self.filename==None:
            self.dir            = os.path.dirname(filename)
        else:
            self.dir            = os.getcwd()
        self.today          = datetime.now().strftime("%Y%m%d")
        self.log_db     = []
        self.data       = []
        self.osc        = red_pitaya_control(cmd='/opt/redpitaya/www/apps/'+ self.AppName +'/py/osc.py' ,name='osc' ,parent=self)
        self.lock       = red_pitaya_control(cmd='/opt/redpitaya/www/apps/'+ self.AppName +'/py/lock.py',name=AppName,parent=self)
        self.oscA_sw    = [ 'ch'+str(y) for y in range(32) ]
        self.oscB_sw    = [ 'ch'+str(y) for y in range(32) ]
        self.newfig     = True
        self.calib_params = {'BE_CH1_DC_offs': 0,
                             'BE_CH1_FS': 42949673,
                             'BE_CH2_DC_offs': 0,
                             'BE_CH2_FS': 42949673,
                             'FE_CH1_DC_offs': 0,          # Offset raw entrada
                             'FE_CH1_FS_G_HI': 42949673,   # ganancia para LV
                             'FE_CH1_FS_G_LO': 858993459,  # ganancia para HV
                             'FE_CH2_DC_offs': 0,
                             'FE_CH2_FS_G_HI': 42949673,
                             'FE_CH2_FS_G_LO': 858993459}
        if connect:
            self.check_connection()
            if loadApp:
                self.loadApp()
            self.osc.load()
            self.lock.load()
            self.get_html()
            self.config_sw_names()
            self.get_adc_dac_calib()

            self.lock_control_ref ='lock_now,launch_lock,pidB_enable_ctrl,pidA_enable_ctrl,ramp_enable_ctrl,set_pidB_enable'.split(',')
            self.lock_control_ref+='set_pidA_enable,set_ramp_enable,trig_time,trig_val,lock_trig_rise'.split(',')


        self.stream     = False
        self.allan      = []
        paramiko.util.log_to_file('ssh_session.log')

    def __exit__(self, exc_type, exc_value, traceback):
        if self.connected:
            self.ssh.close()
        self.active = False
        for i in [exc_type, exc_value, traceback]:
            if not i==None:
                print(repr(i))
        #print('exit')

    def __del__(self):
        if self.connected:
            self.ssh.close()
        #print('del')

    def __enter__(self):
        return self

    def loadApp(self):
        cmd = '/opt/redpitaya/www/apps/'+self.AppName+'/py/load_app.py'
        stdin,stdout,stderr = self.ssh.exec_command(cmd)

    def get_html(self):
        self.html = self.ssh_cmd('cat /opt/redpitaya/www/apps/'+self.AppName+'/index.html')

    def config_sw_names(self):
        h         = bs4.BeautifulSoup(self.html, "lxml")
        self.oscA_sw = [ y.getText() for y in h.select('#lock_oscA_sw option') ]
        self.oscB_sw = [ y.getText() for y in h.select('#lock_oscB_sw option') ]

    def resolve_dns(self):
        try:
            addr    = socket.gethostbyname(self.host)
            self.ip = addr
            return True
        except Exception as e:
            return False

    def check_tcp_connection(self):
        with socket.socket() as s:
            try:
                s.connect((self.host, self.port))
                return True
            except Exception as e:
                return False

    def try_local_key(self):
        if not os.path.isfile('key'):
            return False
        key_path = os.path.join(os.getcwd(),'key')
        try:
            self.ssh.connect(hostname=self.host,port=self.port,username=self.user, key_filename=key_path)
            self.key_path = key_path
            return True
        except Exception as e:
            print('could not connect with local key:'+ repr(e) )
            return False

    def try_user_key(self):
        if not 'HOME' in os.environ.keys():
            return False
        for i in ['id_rsa','id_dsa']:
            key_path = os.path.join(os.environ['HOME'], '.ssh', i)
            if os.path.isfile(key_path):
                try:
                    self.ssh.connect(hostname=self.host,port=self.port,username=self.user, key_filename=key_path)
                    self.key_path = key_path
                    return True
                except Exception as e:
                    print('could not connect with user key('+i+'):'+ repr(e) )
        return False

    def try_pass(self):
        try:
            self.ssh.connect(hostname=self.host,port=self.port,username=self.user,password=self.password)
            self.key_path = 'pass'
            return True
        except Exception as e:
            print('could not connect with password:'+ repr(e))
            return False

    def try_keypath(self):
        try:
            self.ssh.connect(hostname=self.host,port=self.port,username=self.user, key_filename=self.key_path)
            return True
        except Exception as e:
            print('could not connect with key('+self.key_path+'):'+ repr(e) )
            return False

    def ssh_connect(self):
        # globals()['__file__']
        if self.connected:
            return True
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.connected = True
        if self.key_path=='' and ( self.try_user_key() or self.try_local_key() or  self.try_pass()):
            print('looking for auth method')
            return(True)
        elif self.key_path=='pass' and self.try_pass():
            print('auth method: pass')
            return(True)
        elif os.path.isfile(self.key_path) and self.try_keypath():
            print('auth method: key: '+self.key_path)
            return(True)
        else:
            self.connected = False
            return(False)

    def create_local_key(self):
        if os.path.isfile('key'):
            print('Already exists key file.')
            return False
        try:
            private_key = paramiko.RSAKey.generate(bits=2048)
            private_key.write_private_key_file('key')
            print('key file "key" was created')
        except Exception as e:
            print('could not create key:'+ repr(e) )
            return False

        with open("key.pub", 'w') as f:
            f.write("{:s} {:s}".format(private_key.get_name(), private_key.get_base64()) )
            f.write(" Generated automatically for lock_in+pid app")
            print('public key file "key.pub" was created')
        return True

    def ssh_cmd(self,cmd):
        if not self.host=='local':
            if not self.ssh_connect():
                print('Could not connect trought ssh')
                return False
        if self.verbose:
            print('Remote Command: '+RED+cmd+NORMAL)
        if self.host=='local':
            completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
            #completed.returncode
            #completed.stderr.decode('utf-8')
            return completed.stdout.decode('utf-8')
        else:
            #if not self.rw:
            #    self.ssh.exec_command('rw')
            stdin,stdout,stderr = self.ssh.exec_command(cmd)
            return ''.join( stdout.readlines() )

    def ssh_close(self):
        if self.connected:
            self.ssh.close()
        self.connected = False

    def check_connection(self):
        """
        Checks that localhost can connect to RP throught SSH and gets some usefull info
        """
        self.info={}
        result = self.ssh_cmd('uname -a')
        self.info['RP kernel'] = result.strip()
        myIP, myPort, rpIP, rpPort = self.ssh_cmd('echo $SSH_CONNECTION').strip().split(' ')
        self.info['myIP']   = myIP
        self.info['myPort'] = myPort
        self.info['rpIP']   = rpIP
        self.info['rpPort'] = rpPort
        if self.connected:
            return True
        else:
            return False
        self.info={}
        result = self.ssh_cmd('uname -a')
        self.info['RP kernel'] = result.strip()
        myIP, myPort, rpIP, rpPort = self.ssh_cmd('echo $SSH_CONNECTION').strip().split(' ')
        self.info['myIP']   = myIP
        self.info['myPort'] = myPort
        self.info['rpIP']   = rpIP
        self.info['rpPort'] = rpPort

    def __repr__(self):
        txt='red_pitaya_lock: \n'
        for i in 'filename host port'.split(' '):
            txt+='rp.{:<15s}: {:s}\n'.format(i, str(getattr(self,i )) )
        txt+='rp.{:<15s}: [{:>3d}]'.format('log_db', len(self.log_db) )
        txt+=' ---> [num , datetime , log_txt ]\n'

        txt+='rp.{:<15s}: [{:>3d}]'.format('data', len(self.data) )
        txt+=' ---> [num , datetime , Dict ]\n'
        txt+='                       Dict={i,ch1,ch2,ch1_name,ch2_name,dec,osc,lock,log}\n\n'

        return txt

    def __getitem__(self, key):
        if type(key)==int:
            return RpDat(self.data[key].copy())
        if type(key)==slice:
            return [ RpDat(y.copy()) for y in self.data[key] ]

    def log(self,txt):
        """
        Usage:
            self.log(txt)

        Logs txt string in self.log_db , with order and timestamp info
        """
        num=len(self.log_db)
        self.log_db.append( [ num, datetime.now().timestamp() , txt ] )
        if self.verbose:
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
            print( txt.format( int(l[0]),
                               datetime.fromtimestamp( float(l[1]) ).strftime('%Y%m%d_%H:%M:%S'),
                               str(l[2]) ) )
    def print_data(self,userlog=False):
        """
        Usage:
            self.print_data()

        Prints all loaded data

        Example:
            rp.print_data()
              0 12:22:10 : signals=sin_ref,sin_3f       log=
              1 12:23:14 : signals=sin_ref,sin_2f       log=Check here the slope
        """



        data =[ (dd[0],dd[1], dd[2]['ch1_name']+','+dd[2]['ch2_name'],  dd[2]['log'] ) for dd in self.data ]
        if userlog:
            data+=[ (-1, float(l[1]), 'LOG'  ,str(l[2])) for l in filter(lambda x: 'rp.'!=x[2][0:3] , self.log_db) ]

        for dd in sorted(data, key=lambda i: i[1]):
            print('{:s} {:s} : {:28s} {:s}'.format(
                    str(dd[0]).rjust(3) if dd[0]>=0 else '   ' ,
                    datetime.fromtimestamp( dd[1] ).strftime('%H:%M:%S'),
                    ('signals='+dd[2]) if dd[0]>=0 else '-'*28 ,
                    dd[3]
                    ))

    def osc_trig_fire(self,trig=1,dec=1,wait=False,timeout=10):
        """
        Usage:
            self.osc_trig_fire(trig=6,dec=8)

        Sets the oscilloscope to wait for trigger signal
        Returns control inmediatly

        Parameters:
            trig param sets the trigger type:
               1 : manual
               2 : A ch rising edge
               3 : A ch falling edge
               4 : B ch rising edge
               5 : B ch falling edge
               6 : external - rising edge
               7 : external - falling edge
               8 : ASG - rising edge
               9 : ASG - falling edge

            dec : posible values
                [1,8,64, 1024, 8192, 65536]
        """
        if not dec in [1, 8, 64, 1024, 8192, 65536]:
            print(RED+'ERROR: '+NORMAL+'dec should be one of: 1, 8, 64, 1024, 8192, 65536')
            return False

        if not trig in [1, 2, 3, 4, 5, 6, 7, 8, 9]:
            print(RED+'ERROR: '+NORMAL+'trig should be one of: 1, 2, 3, 4, 5, 6, 7, 8, 9')
            return False

        #self.osc.Dec    = dec  # sets decimation
        #self.osc.TrgSrc = trig # sets Trigger source / type
        #self.osc.conf   = 1    # Launch trigger

        self.log('rp.osc_trig_fire(dec='+str(dec ) +',trig='+str(trig)+')' )
        cmds   = self.osc.cmd+' Dec '   +str(dec ) + '; '
        if not trig==1:
            cmds  += self.osc.cmd+' TrgSrc '+str(trig) + '; '
        else:
            cmds  += self.osc.cmd+' conf 2 ; '
            cmds  += self.osc.cmd+' TrgDelay 0 ; '
        cmds  += self.osc.cmd+' conf 1 ;'
        if trig==1:
            cmds  += self.osc.cmd+' TrgSrc '+str(trig) + '; '
        if wait:
            if timeout<0:
                cmds  += '/opt/redpitaya/www/apps/'+self.AppName+'/py/wait_trig.py ;'
            else:
                cmds  += '/opt/redpitaya/www/apps/'+self.AppName+'/py/wait_trig.py '+str(timeout)+';'
        result = self.ssh_cmd(cmds)

        return True

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
        cmd='/opt/redpitaya/www/apps/'+ self.AppName +'/py/osc_get_ch.py'
        result = self.ssh_cmd(cmd)
        self.log('rp.get_curv(): '+cmd+' | '+log)
        ind=[ int(y.strip().split(',')[0]) for y in result.strip().split('\n') ]
        ch1=[ int(y.strip().split(',')[1]) for y in result.strip().split('\n') ]
        ch2=[ int(y.strip().split(',')[2]) for y in result.strip().split('\n') ]
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
                           'osc': self.osc.data.copy(),
                           'lock': self.lock.data.copy(),
                           'calib_params': self.calib_params.copy(),
                           'log': log
                            }
                           ] )
    def get_adc_dac_calib(self,calib_path=''):
        """
        Gets calibration params for ADCs and DACs
        """
        if calib_path=='':
            calib_path='/opt/redpitaya/bin/calib'

        txt = self.ssh_cmd(calib_path+' -r -v')

        for par in [ y.split('=') for y in txt.strip().split('\n') ]:
            self.calib_params[ par[0].strip() ] = int(par[1])

    def set_adc_dac_calib(self,calib_path=''):
        """
        Sets calibration params for ADCs and DACs
        """
        if calib_path=='':
            calib_path='/opt/redpitaya/bin/calib'
        params  = 'FE_CH1_FS_G_HI,FE_CH2_FS_G_HI,FE_CH1_FS_G_LO,FE_CH2_FS_G_LO,'
        params +='FE_CH1_DC_offs,FE_CH2_DC_offs,BE_CH1_FS,BE_CH2_FS,'
        params +='BE_CH1_DC_offs,BE_CH2_DC_offs'

        txt = ' '.join([ str(self.calib_params[par]) for par in params.split(',') ])
        self.ssh_cmd('echo "{:s}" | '.format(txt)+calib_path+' -w')


    def save(self):
        """
        Saves stored data, logs, etc in self.filename using numpy.savez()

        Usage:
            self.save()

        """
        savez(self.filename, data  = self.data,
                             log   = self.log_db,
                             info  = self.info,
                             allan = self.allan,
                             html  = self.html )

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
        if 'html' in tmp.keys():
            self.html   = tmp['html'].tolist()
            if len(self.html) >0:
                self.config_sw_names()

    def __getattr__(self, name):
        if name=='lock_control':
            lock_control = self.lock.get('lock_control')
            rta = {}
            for i,nn in enumerate(self.lock_control_ref):
                rta[nn] = bool(lock_control & 2**i )
            return rta
        if name=='lock_control_trigger_config':
            lock_control = self.lock.get('lock_control')
            rta = {}
            for nn in self.lock_control_ref[5:]:
                rta[nn] = bool(lock_control & 2**self.lock_control_ref.index(nn) )
            for nn in 'lock_trig_sw,lock_trig_time,lock_trig_val'.split(','):
                rta[nn] = int(self.lock.get(nn))
            return rta

    def set_lock_control_trigger_config(self,params):
        for key in params:
            lock_control = self.lock.get('lock_control')
            if key in self.lock_control_ref:
                self.__lock_control_update(key,params[key])
            elif key in ['lock_trig_sw', 'lock_trig_time', 'lock_trig_val']:
                self.lock.set(key,params[key])

    def __lock_control_update(self,param,val):
        if param in self.lock_control_ref:
            lock_control = self.lock.get('lock_control')
            lock_control&= 0b11111111111 - 2**self.lock_control_ref.index(param)
            lock_control+= 2**self.lock_control_ref.index(param)*int(val)
            self.lock.set('lock_control',lock_control)

    def pidA_enable(self,val=True):
        self.__lock_control_update('pidA_enable_ctrl',val)

    def pidB_enable(self,val=True):
        self.__lock_control_update('pidB_enable_ctrl',val)

    def ramp_enable(self,val=True):
        self.__lock_control_update('ramp_enable_ctrl',val)

    def launch_lock(self):
        self.rp.__lock_control_update('launch_lock',True)

    def lock_now(self):
        self.rp.__lock_control_update('lock_now',True)

    def counter_start(self):
        self.lock.read_ctrl = self.lock.get('read_ctrl') | 0b10

    def counter_freeze(self):
        self.lock.read_ctrl = self.lock.get('read_ctrl') | 0b01

    def counter_unfreeze(self):
        self.lock.read_ctrl = self.lock.get('read_ctrl') & 0b10

    def counter_reset(self):
        self.lock.read_ctrl =0b00

    def counter_get_cnt(self):
        freezed = bool(self.lock.read_ctrl&0b01)
        if not freezed:  # if not freezed
            self.counter_freeze()
        rta = int64(self.lock.get('cnt_clk')+self.lock.get('cnt_clk2')*2**32)
        if not freezed:
            self.counter_unfreeze()
        return rta

    def counter_get_time(self):
        return float(self.counter_get_cnt())*1e-8

    def start_streaming(self,signals='error',log=''):
        """
        Start an streaming of regs values and store it in a .bin file in local host.
        start_streaming() gives the control back to the console inmediatly. To stop the
        streaming you should use self.stop_streaming() .

        Usage:
            self.start_streaming(signals='error',log='')

        signals   : A list or a space separated string of signals names that should be streamed.
                    Each signal name should be one of self.lock.keys

        Each stream is saved in a .bin file in the same folder of filename. The name of the file
        has the fire time information in format: YYYYMMDD_hhmmss.bin

        Example:
            rp.start_streaming('error ctrl_A ctrl_B')
            time.sleep(3600)
            rp.stop_streaming()
            d=read_dump(rp.allan[-1][2])
            d.plotr(start=0,end=-1,signals='error ctrl_A')

        """
        if type(signals)==str:
            signals=signals.split(' ')
        for i in signals:
            if not i in self.lock.keys:
                raise RPError('{:s} is not in self.lock.keys'.format(i))
        fn  =  now()+'_dump.bin'
        print('Getting streaming for ['+' '.join(signals)+']')
        self.log('start_streaming(): Getting streaming for ['+' '.join(signals)+']')
        self.log('start_streaming():'+log)

        self.file   = open(fn,'a')
        self.stream = subprocess.Popen( 'nc -l 6000'.split(' ') , shell=False , stdin=subprocess.PIPE , stdout=self.file , stderr=subprocess.PIPE)
        #subprocess.Popen('nc -d -l 6000 > '+name, shell=True)
        #cmd='/root/py/data_dump.py -s '+ip+' -p 6000 --params '+' '.join(signals)

        cmd ='/opt/redpitaya/www/apps/'+ self.AppName +'/py/data_dump.py '
        cmd+=' -s '+ self.info['myIP'] + ' -p 6000 '
        cmd+='--params ' + ' '.join(signals)

        self.log('start_streaming(): filename='+fn)
        print(fn)
        self.log('remote: '+cmd)
        self.remote  = self.ssh.exec_command(cmd)
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
            result = self.ssh_cmd(cmd)
            for i in [ y.strip().split(' ')[0] for y in filter(lambda x: 'data_dump.py' in x, result.split('\n'))  ]:
                self.ssh_cmd('kill '+str(i))
                self.log('stop_straming(): killing pid: '+str(i))
            self.stream.terminate()
            self.stream.communicate()
            self.file.close()
            self.stream=False

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
        cmd='/opt/redpitaya/www/apps/'+ self.AppName +'/py/osc_trig.py '
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
        result = self.ssh_cmd(cmd)
        if 'success' in result:
            return True
        else:
            print('rp.fire_trig FAILED')
            print(result)
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

    def plot(self,num=-1,figsize=(12,5),time=True,rel=None,same_plot=True,autotime=True,raw=False):
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

        if raw:
            y1 = ( y1 + self.data[num][2]['calib_params']['FE_CH1_DC_offs'])*float(self.data[num][2]['calib_params']['FE_CH1_FS_G_HI'])/2**32*100/8192
            y2 = ( y2 + self.data[num][2]['calib_params']['FE_CH2_DC_offs'])*float(self.data[num][2]['calib_params']['FE_CH2_FS_G_HI'])/2**32*100/8192

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

        if raw:
            ax1.set_ylabel('ch1 [int]')
            ax2.set_ylabel('ch2 [int]')
        else:
            ax1.set_ylabel('ch1 [V]')
            ax2.set_ylabel('ch2 [V]')
        plt.tight_layout()

    #    def run(self,cmd):
    #        """
    #        Runs a command on RP host and returns the stdout.
    #
    #        Usage:
    #            self.run(cmd)
    #
    #        Example:
    #            root_files = rp.run('ls -l /')
    #
    #        """
    #        result = subprocess.run(self.ssh.split(' ')+[cmd], stderr=subprocess.PIPE, stdout=subprocess.PIPE)
    #        if result.returncode == 0:
    #            self.log('rp.run: '+ cmd + ' | result[{:d}]'.format(result.returncode))
    #            return result
    #        elif result.returncode == 1:
    #            msj='Remote command ERROR [{:d}]: '.format(result.returncode)+result.stderr.decode()
    #            self.log('rp.run: '+ cmd + ' | result[{:d}] | '.format(result.returncode) + msj)
    #            raise SSHError(msj)
    #        else:
    #            msj='SSH ERROR [{:d}]: '.format(result.returncode)+result.stderr.decode()
    #            self.log('rp.run: '+ cmd + ' | result[{:d}] | '.format(result.returncode) + msj)
    #            raise SSHError(msj)


#%%

#%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
#%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%


class read_dump():
    """
    This class is a toolkit to read .bin files generated by red_pitaya_lock() streaming
    functions.

    Example:
    d = read_dump(filename='/path/file.bin', head1_size=100, head2_size=3400 )

    This creates d object that lets you processes the streamead data.
    The first 100 bytes have information about the starting time of the streaming and
    the streamed reg names.
    The next 3400 bytes have information about the lock regs in FPGA at the time of
    streaming start. Both numbers can be changed for special situatiosn using head1_size
    and head2_size params.



    Usage:
        d.load_params()     # loads regs values from self.filename headers
        d.load_range()      # loads a range of values by index position
        d.load_time()       # loads a range of values by time position
        d.plot()            # Plots a loaded range
        d.plotr()           # Loads a range of values by index and plots
        d.plott()           # Loads a range of values by time and plots
        d.fast_plotr()      # Fast plot by index range

        d.time_stats()      # Calcs useful time statistical information
        d.allan_range()     # Calcs Allan deviation of a data set selected by index range
        d.allan_range2()    # Calcs Allan deviation of a data set selected by index range
                            # with a heavier algorithm that takes care of error intervals

        d.save_buff()       # Saves allan_dev data and time_stats data in a file
        d.load_buff()       # Loads allan_dev data and time_stats data in a file
        d.export_range()    # Exports data to a text file
        d.print_t0()        # Prints data adquisition start time

        d.plot_allan()      # Plots allan deviation
        d.plot_allan_error  # Plots allan deviation with error intervals



    """
    def __init__(self,filename,head1_size=100,head2_size=3400):
        self.filename   = filename
        self.head1_size = head1_size
        self.head2_size = head2_size
        self.head_size  = head1_size+head2_size
        self.load_params()
        self.plotlim    = 1000000
        self.data       = array([])
        self.newfig     = True
        self.allan      = []
        self.locked_ranges = []
        self.time_stats_data = {}
        self.t          = []
        self.t0         = datetime.fromtimestamp( float([ y.split(' ')[-1] for y in filter(lambda x: 'timestamp' in x , self.txt1.decode().split('\n') ) ][0]))

    def load_params(self):
        """
        Reads self.filename and gets header information.

        Usage:
            d.load_params()

        Headers texts are stored in self.txt .
        The text is processed and the params keys and values of RP lock module memory regs
        are stored in self.params as a Dictionary.
        The names for the signals sotred in the .bin file are stored in self.names .
        Labels for plots are stored in dself.ylbl

        Example:
            d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
            d.load_params()

            print(d.params['error_offset'])

        """
        with open(self.filename,'rb') as f:
            txt1=f.read(self.head1_size)
            txt2=f.read(self.head2_size)
        txt=txt1+txt2
        N=len(txt.decode().split('\n')[0].split(','))
        self.strstr='!f'+'l'*N
        self.ylbl=txt1.decode().split('\n')[0].split(' ')[1].split(',')
        self.names=['t']
        self.names.extend(self.ylbl)
        self.txt1=txt1
        self.params={}
        for i in txt2.decode().split('{')[1].split('}')[0].replace('\n','').split(','):
            if len(i)>2:
                self.params[i.split(':')[0].split('"')[1]]=float(i.split(':')[1])

    def __getitem__(self, key):
        if type(key)==int:
            return self.data[key]
        if type(key)==str:
            return self.data[self.names.index(key)]
        if type(key)==slice:
            return self.data[key]

    def print_t0(self):
        """
        Prints data adquisition start time read from .bin fiel
        Example:
             d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
             d.print_t0()
             20171109_18:47:20

        """
        print(self.t0.strftime('%Y%m%d_%H:%M:%S'))

    def load_range(self,start=0,end=-1,large=None,step='auto'):
        """
        Loads data from .bin filename and stores it in numpy arrays for data processing and plotting.
        Each data bin consist in the measurement time and several signals values.
        The signals names are the self.names ones.
        The data loaded is filtered by and start index an stop index, where the index is the bin number.
        After loadding the data, several arrays with independent signals are set:
            self.t           : time array
            self.n           : index array
            self.SIGNAL_NAME : for each signal read, one adata array is set.

        Usage:
            self.load_range(start=0,end=-1,large=None,step='auto')

        Params:
            start : Start position of the data to read
            stop  : Stop position of the data to read
            step  : step size in number of bins between data. step==1 means no jumps.
            large : if defined, data reading is stopped after getting 'large' data points.

        After succesfully reading the data, its stored in self.data.

        Example:
             d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
             d.load_range(start=1000,end=5000,step=1)
             print( std( d.error ) )
             plt.plot( d.t , d.oscA )

        """
        self.check_time_stats()
        autoset=False
        if end<0:
            end=self.time_stats_data['data_length']-end
            autoset=True
        if not is_int(step):
            step=int(max(1, 10**floor(log10( end-start )-4) ))
            autoset=True
        if autoset:
            print('autoset: end={:d}, step={:d}'.format(end,step))

        large_break = is_int(large);

        tbuff=time.time()
        with open(self.filename,'rb') as f:
            f.read(self.head_size)
            cs=struct.calcsize(self.strstr)
            if start>1:
                f.read(cs*start)
            fc=f.read(cs)
            j=start
            data=[]
            while fc:
                if j % step==0:
                    data.append( [j]+ list(struct.unpack(self.strstr,fc)) )
                fc=f.read(cs)
                j+=1
                if round((j-start)/step)>self.plotlim:
                    print('ERROR: data length exeded {:d} points'.format(self.plotlim))
                    break
                if j>=end:
                    break
                if large_break and round((j-start)/step)>large:
                    break
        print('Load time: {:f} sec'.format( time.time()-tbuff ))
        self.data=array(data)
        for i,n in enumerate(['n']+self.names):
            setattr(self,n,self.data[:,i])

    def load_time(self,start=0,end=-1,large=None,step='auto'):
        """
        Loads data from .bin filename and stores it in numpy arrays for data processing and plotting.
        Each data bin consist in the measurement time and several signals values.
        The signals names are the self.names ones.
        The data loaded is filtered by an start time and stop time, where the time is in seconds.
        After loadding the data, several arrays with independent signals are set:
            self.t           : time array
            self.n           : index array
            self.SIGNAL_NAME : for each signal read, one adata array is set.

        Usage:
            self.load_time(start=0,end=-1,large=None,step='auto')

        Params:
            start : Start time of the data to read
            stop  : Stop time of the data to read
            step  : step size in number of bins between data. step==1 means no jumps.
            large : if defined, data reading is stopped after getting 'large' seconds of data points.

        After succesfully reading the data, its stored in self.data.

        Example:
             d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
             d.load_time(start=60*5,end=60*15,step=1)
             print( std( d.error ) )
             plt.plot( d.t , d.oscA )

        """
#        self.check_time_stats()
#        if end==None and large==None:
#            print('needs start + end|large')
#            return
#        end_break   = is_int(end);
#        large_break = is_int(large);
        end_break   = is_int(end);
        large_break = is_int(large);

        self.check_time_stats()
        autoset=False
        if end<0:
            end=self.time_stats_data['last_time']-end
            autoset=True
        if not is_int(step):
            dl=int(( end-start )/self.time_stats_data['last_time']*self.time_stats_data['data_length'])
            step=int(max(1, 10**floor(log10( dl )-4) ))
            autoset=True
        if autoset:
            print('autoset: end={:d}, step={:d}'.format(int(end),int(step)))

        large_break = is_int(large);

        tbuff=time.time()
        with open(self.filename,'rb') as f:
            f.read(self.head_size)
            cs=struct.calcsize(self.strstr)
            fc=f.read(cs)
            j=0
            j0=0
            data=[]
            save_data=False
            while fc:
                tnow=struct.unpack(self.strstr,fc)[0]
                if save_data==False and tnow>start:
                    save_data=True
                    j0=j
                if save_data and (j-j0) % step==0:
                    data.append( [j]+ list(struct.unpack(self.strstr,fc)) )
                fc=f.read(cs)
                j+=1
                if round((j-j0)/step)>self.plotlim:
                    print('ERROR: data length exeded {:d} points'.format(self.plotlim))
                    break
                if end_break and tnow>=end:
                    break
                if large_break and tnow-start>large:
                    break
        print('Load time: {:f} sec'.format( time.time()-tbuff ))
        self.data=array(data)
        print('Data length: {:d}'.format( len(self.data) ) )
        for i,n in enumerate(['n']+self.names):
            setattr(self,n,self.data[:,i])


    def plot_from_range(self):
        rr=array(plt.ginput(2)).astype(int)[:,0]
        step=max(1, 10**floor(log10( abs(diff(rr)) ) -4) )
        if type(step)==ndarray:
            step=step[0]
        print('step='+str(step))
        self.plotr(signals=self.last_signals,start=min(rr),end=max(rr),step=step)

    def get_index(self,n=1):
        ind=array(plt.ginput(n)).astype(int)[:,0].tolist()
        for i in ind:
            print('index: '+str(i))
        return ind

    def plot(self,signals,figsize=(12,5),time=True,relative=False,autotime=True):
        """
        Plots loaded data.

        Usage:
            self.plot(signals,figsize=(12,5),time=True,relative=False,autotime=True)

        Params:
            signals  : space separated string or a list with signals names to plot
            figsize  : size of figure windows
            time     : if True, x axis is in time units. Else, in index [int] units
            relative : if True, x axis starts at zero, else use absolute value for time/index
            autotime : If True, x axis units are set in human readble most useful units.

        Example:
             d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
             d.load_time(start=60*5,end=60*15,step=1)
             d.plot( 'error' )

        """
        if type(signals)==str:
            signals=signals.split(' ')
        for i in signals:
            if not i in self.names[1:]:
                print(i+' is not in names')
                return False
        if self.newfig:
            plt.figure(figsize=figsize)
        else:
            plt.clf()
        self.last_signals=signals
        self.ax=[]
        self.ax.append( plt.subplot2grid( (len(signals),1), (0, 0))  )
        for i in range(1,len(signals)):
            self.ax.append( plt.subplot2grid( (len(signals),1), (i, 0), sharex=self.ax[0])  )
        if len(self.t)==0:
            print('needs tu run load_range first')
            return False
        xlbl='seg'
        xx=self.t
        xx_len=max(xx)-min(xx)
        if time:
            xlbl='time [sec]'
            if autotime and max(abs(xx)) < 5e-4:
                xx=xx*1e6
                xlbl='time [us]'
            elif autotime and max(abs(xx)) < 5e-1:
                xx=xx*1e3
                xlbl='time [ms]'
            elif autotime and xx_len > 60*5 and max(abs(xx)) <= 60*60*3 :
                xx=xx/60
                xlbl='time [min]'
            elif autotime and xx_len > 60*60*3 :
                xx=xx/60/60
                xlbl='time [hour]'
        else:
            xx=self.n
            xlbl='int'
        if relative:
            xx=xx-xx[0]
        for i,signal in enumerate(signals):
            self.ax[i].plot( xx , getattr(self,signal), linewidth=0.5 )
            self.ax[i].grid(b=True)
            self.ax[i].set_ylabel(signal)
        self.ax[-1].set_xlabel(xlbl)
        if autotime and ( ('min' in xlbl) or ('sec' in xlbl) ) :
            t0,t1=self.ax[-1].get_xlim()
            self.ax[-1].set_xticks( arange( ceil(t0/60)*60 , floor(t1/60)*60+60 , 60 ) )
            self.ax[-1].set_xlim( (t0,t1))

        plt.tight_layout()

    def plott(self,signals,start=0,end=-1,large=None,step='auto',relative=False):
        self.load_time(start=start,end=end,large=large,step=step)
        self.plot(signals=signals,time=True,relative=relative)
    def plotr(self,signals,start=0,end=-1,large=None,step='auto',relative=False):
        self.load_range(start=start,end=end,large=large,step=step)
        self.plot(signals=signals,time=False,relative=relative)

    def fast_plotr(self,signals,index=10000,large=10000,relative=False):
        self.plotr(signals,start=int(index-large/2),end=int(index+large/2),relative=relative )

    def time_stats(self):
        """
        Calculates time statistics data

        Usage:
            self.time_stats())

        """
        tbuff=time.time()
        with open(self.filename,'rb') as f:
            f.read(self.head_size)
            cs=struct.calcsize(self.strstr)
            fc=f.read(cs)
            j=0
            data=[]
            # first read
            tnow  = struct.unpack(self.strstr,fc)[0]
            tlast = struct.unpack(self.strstr,fc)[0]
            fc=f.read(cs)
            max_dt=0
            min_dt=1e100
            j=1
            while fc:
                tlast=tnow
                tnow=struct.unpack(self.strstr,fc)[0]
                max_dt=max(max_dt,tnow-tlast)
                if tnow-tlast>0:
                    min_dt=min(min_dt,tnow-tlast)
                fc=f.read(cs)
                j+=1
        print('Load time   : {:f} sec'.format( time.time()-tbuff ))
        print('Data length : {:d}'.format( j ) )
        print('Last time   : {:f} sec'.format( tnow ) )
        print('Max dt      : {:f} sec'.format( max_dt ) )
        print('Min dt      : {:f} sec'.format( min_dt ) )
        self.time_stats_data= { 'data_length':j , 'last_time': tnow, 'max_dt' :max_dt, 'min_dt':min_dt }

    def find_locked(self,error_signal=1,ctrl_signal=2):
        tbuff=time.time()
        with open(self.filename,'rb') as f:
            f.read(self.head_size)
            cs=struct.calcsize(self.strstr)
            j=0
            error_std=[0]*10
            ctrl_std =[0]*10
            locked=False
            self.locked_ranges=[]
            for i in range(9):
                fc=f.read(cs)
                error_std[i] = struct.unpack(self.strstr,fc)[error_signal]
                ctrl_std[i]  = struct.unpack(self.strstr,fc)[ctrl_signal]
                j+=1
            print(j)
            while fc:
                fc=f.read(cs)
                error_std[j%10] = struct.unpack(self.strstr,fc)[error_signal]
                ctrl_std[j%10]  = struct.unpack(self.strstr,fc)[ctrl_signal]
                #print( [j, std(error_std) , std(ctrl_std)] )
                if locked==False and ( std(error_std)<70 and std(ctrl_std)<500 ):
                    locked=True
                    self.locked_ranges.append( [j,-1] )
                if locked==True and ( std(error_std)>=70 or std(ctrl_std)>=500 ):
                    locked=False
                    self.locked_ranges[-1][1]=j
                    print(self.locked_ranges[-1])
                j+=1
        print('Load time: {:f} sec'.format( time.time()-tbuff ))
        self.locked_range= j

    def save_buff(self):
        """
        Saves data in file: self.filename+'_buff.npz'

        Usage:
            self.save_buff()

        """
        savez(self.filename.split('.')[0:-1][0]+'_buff.npz',
              locked_ranges   = self.locked_ranges,
              time_stats_data = self.time_stats_data ,
              allan           = self.allan )

    def load_buff(self):
        """
        Loads data from file: self.filename+'_buff.npz'

        Usage:
            self.save_buff()

        """
        data=load(self.filename.split('.')[0:-1][0]+'_buff.npz')
        self.locked_ranges   = data['locked_ranges']
        self.time_stats_data = data['time_stats_data'].tolist()
        self.allan           = data['allan'].tolist()

    def print_locked_ranges(self):
        min_val=sort(diff(self.locked_ranges).flatten())[-10]-1
        for i,num in enumerate(diff(self.locked_ranges).flatten()):
            if num> min_val:
                print('j={:15d}:{:<15d} , large={:15d}'.format(
                        self.locked_ranges[i][0],
                        self.locked_ranges[i][1],
                        num ) )

    def export_range(self,signal,start=0,end=1,sp=0):
        """
        Exports data.

        Usage:
            self.export_range(signal,start=0,end=1,sp=0)

        """
        self.check_time_stats()
        s_ind=self.names.index(signal)
        max_dt_oom=floor(log10(self.time_stats_data['max_dt']))
        max_dt=ceil(self.time_stats_data['max_dt']*10**(-max_dt_oom))/10**(-max_dt_oom)
        print('Min time bin: {:f} sec'.format(max_dt))
        tbuff=time.time()
        time_already=False
        if len(self.allan)>0:
            for i in self.allan:
                if i['range']==[start,end]:
                    t0=i['t0']
                    t1=i['t1']
                    time_already=True
                    print('already have time info')
                    break
        if not time_already:
            with open(self.filename,'rb') as f:
                f.read(self.head_size)
                cs=struct.calcsize(self.strstr)
                fc=f.read(cs)
                j=0
                while fc:
                    tnow=struct.unpack(self.strstr,fc)[0]
                    if j==start:
                        t0=tnow
                    if j==end:
                        t1=tnow
                        break
                    fc=f.read(cs)
                    j+=1
        print('Load time: {:f} sec'.format( time.time()-tbuff ))
        print('t0: {:f} sec'.format( t0 ) )
        print('t1: {:f} sec'.format( t1 ) )
        print('Dt: {:f} sec | {:f} min'.format( t1-t0, (t1-t0)/60 ) )
        print('')
        bins_num=int(  floor(log( (t1-t0)/max_dt )/log(2)) -1 )
        print('Number of bins: {:d}'.format(bins_num))

        steps=max_dt
        v_s   = []
        v_tmp = []

        #v_lastmod  = 1e10
        v_lasttime = t0
        percentage      = '0%'
        percentage_step = int((end-start)/1000)
        j=0
        with open(self.filename,'rb') as f:
            with open(self.filename.split('.')[0:-1][0]+'_export_'+signal+'.dat', 'w') as output:
                f.read(self.head_size)
                cs=struct.calcsize(self.strstr)
                for j in range(start):
                    fc=f.read(cs)
                    j+=1
                n=0
                while fc:
                    fc=f.read(cs)
                    vv=struct.unpack(self.strstr,fc)
                    tnow=vv[0]
                    if tnow > v_lasttime + steps:
                        v_lasttime=tnow
                        #v_s.append( mean( v_tmp ) )
                        output.write('{:>6d} {:15f}\r\n'.format(n, mean( v_tmp ) ) )
                        v_tmp=[ vv[s_ind] - sp   ]
                        n+=1
                    else:
                        v_tmp.append(  vv[s_ind] - sp  )
                    j+=1
                    if j>end:
                        break
                    if int((j-start))%percentage_step==0:
                        if not percentage == str(int((j-start)/(end-start)*100)) + '%':
                            percentage = str(int((j-start)/(end-start)*100)) + '%'
                            print( percentage )
        print('Total Load time: {:f} sec'.format( time.time()-tbuff ))

    def check_time_stats(self):
        """
        Check if time_stats  is done.

        Usage:
            self.check_time_stats()

        """
        if len(self.time_stats_data)==0:
            print('running first: self.time_stats()')
            self.time_stats()
            return False
        return True

    def plot_allan(self,num=-1):
        """
        Plots allan deviation of signals taken from allan_range
        Usage:
            self.plot_allan(num=-1)

        Params:
            num  : number of dataset to plot

        Example:
            d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
            d.allan_range(start=6944, end=8148326,signal='error')
            d.allan[-1]['factor']= 1.5   # Factor multipliyed to signal before plotting
            d.plot_allan()

        """
        if len(self.allan)==0:
            print('Not allan data to plot')
            return False
        if num=='all':
            num=slice(0,len(self.allan))
        plt.figure()
        for i,aa in enumerate( self.allan[num] ):
            plt.loglog(aa['steps'],aa['allan_dev'],'o-',label=aa['signal'])
        plt.xlabel('time [sec]')
        plt.ylabel('Allan_dev [int]')
        plt.grid(b=True)
        plt.legend()
        plt.tight_layout()


    def plot_allan_error(self,num=-1,figsize=(12,5),bar=True):
        """
        Plots allan deviation of signals taken from allan_range2 with error intervals

        Usage:
            self.plot_allan_error(num=-1,figsize=(12,5),bar=True)

        Params:
            num     : number of dataset to plot or 'all'
            figsize : size of figure windows
            bar     : If True, express error intervals as error bars. Else, using color area.


        Example:
            d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
            d.allan_range2(start=6944, end=8148326,signal='error')
            d.allan_range2(start=6944, end=8148326,signal='ctrl_A')
            d.allan[0]['factor']= 1.5   # Factor multipliyed to signal before plotting
            d.allan[1]['factor']= 100   # Factor multipliyed to signal before plotting
            d.plot_allan_error()

        """
        if len(self.allan)==0:
            print('Not allan data to plot')
            return False
        if num=='all':
            num=slice(0,len(self.allan))
        elif type(num)==int:
            num=slice(num,num+1)
        if self.newfig:
            plt.figure(figsize=figsize)
        else:
            plt.clf()

        self.ax=[]
        self.ax.append( plt.subplot2grid( (1,1), (0, 0))  )
        self.ax[-1].set_yscale('log')
        self.ax[-1].set_xscale('log')
        for i,aa in enumerate( self.allan[num] ):
            xx   = array(aa['steps'])
            yy   = array(aa['allan_dev'])*abs(aa['factor'])
            ymax = array(aa['allan_dev_max'])*abs(aa['factor'])
            ymin = array(aa['allan_dev_min'])*abs(aa['factor'])
            if bar:
                self.ax[-1].errorbar(xx, yy, yerr=[ yy-ymin , ymax-yy ] , fmt='.-',label=aa['signal'])
            else:
                self.ax[-1].plot(xx, yy ,'.-', linewidth=1, label=aa['signal'])
                cc=self.ax[-1].get_lines()[-1].get_color()
                self.ax[-1].fill_between(xx, ymin, ymax, facecolor=cc, alpha=0.5)
        self.ax[-1].set_xlabel('time [sec]')
        self.ax[-1].set_ylabel('Allan_dev [int]')
        self.ax[-1].grid(b=True)
        self.ax[-1].legend()
        plt.tight_layout()

    def allan_range2(self,signal,start=0,end=1,sp=0,div=16):
        """
        Calculates allan deviation of the signal ( 'signal'- sp ) from 'start' index to 'end' index.
        First, it analyses the data range and auto set the best time bin length to divide the time array.
        The, calculates the mean value of each time bin creating a v_s vector of the signal data that is
        equally spaced in time.
        Then calculates the allan deviation on the v_s vector.

        Usage:
            self.allan_range2(signal,start=0,end=1,sp=0,div=16)

        Params:
            signal    : signal name to be processed
            start,end : index limits of data to process
            sp        : set-point value to supress from signal
            div       : for time ranges that uses several time bins, the allan deviation is calculated
                        from at most 'div' diferent time offsets. This produces several values for time
                        range, that enables so select the max, min and mean value for error plotting.


        Example:
            d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
            d.allan_range2(start=6944, end=8148326,signal='ctrl_A')
            d.plot_allan_error()

        """
        # First we find the optimal time range
        self.check_time_stats()
        if end==1:
            end=self.time_stats_data['data_length']-1
        print('Analysing vector "{:s}" in range {:d}:{:d}'.format(signal,start,end))
        s_ind=self.names.index(signal)
        max_dt_oom=floor(log10(self.time_stats_data['max_dt']))
        max_dt=ceil(self.time_stats_data['max_dt']*10**(-max_dt_oom))/10**(-max_dt_oom)
        print('Min time bin: {:f} sec'.format(max_dt))
        tbuff=time.time()
        time_already=False
        if len(self.allan)>0:
            for i in self.allan:
                if i['range']==[start,end]:
                    t0=i['t0']
                    t1=i['t1']
                    time_already=True
                    print('already have time info')
                    break
        if not time_already:
            print('Looking for time information')
            with open(self.filename,'rb') as f:
                f.read(self.head_size)
                cs=struct.calcsize(self.strstr)
                fc=f.read(cs)
                j=0
                while fc:
                    tnow=struct.unpack(self.strstr,fc)[0]
                    if j==start:
                        t0=tnow
                    if j==end:
                        t1=tnow
                        break
                    fc=f.read(cs)
                    j+=1
        print('Load time: {:f} sec'.format( time.time()-tbuff ))
        print('t0: {:f} sec'.format( t0 ) )
        print('t1: {:f} sec'.format( t1 ) )
        print('Dt: {:f} sec | {:f} min'.format( t1-t0, (t1-t0)/60 ) )
        print('')
        bins_num=int(  floor(log( (t1-t0)/max_dt )/log(2)) -1 )
        print('Number of bins: {:d}'.format(bins_num))

        steps = max_dt * 2**arange(bins_num)
        step  = max_dt
        v_s   = []
        v_n   = []
        v_tmp = []
        v_lasttime = t0
        percentage      = '0%'
        percentage_step = int((end-start)/1000)
        with open(self.filename,'rb') as f:
            f.read(self.head_size)
            cs=struct.calcsize(self.strstr)
            fc=True
            j=0
            for j in range(start):
                fc=f.read(cs)
                j+=1
            while fc:
                fc=f.read(cs)
                vv=struct.unpack(self.strstr,fc)
                tnow=vv[0]
                for i in range(bins_num):
                    if tnow > v_lasttime + step:
                        v_lasttime+=step
                        v_s.append( mean( v_tmp ) )
                        v_n.append(len(v_tmp))
                        v_tmp=[ vv[s_ind] - sp   ]

                    else:
                        v_tmp.append(  vv[s_ind] - sp    )
                j+=1
                if j>end:
                    break
                if int((j-start))%percentage_step==0:
                    if not percentage == str(int((j-start)/(end-start)*100)) + '%':
                        percentage = str(int((j-start)/(end-start)*100)) + '%'
                        print( percentage )
        ss=(steps/steps[0]).astype(int)
        #vv=v_s[:]
        allan_var_all = []
        allan_dev_all = []
        for i in ss:
            print(i)
            alvar=[]
            aldev=[]
            for k in arange(0,i,i/min(i,div)).astype(int):
                np=int(len(v_s[k:])-len(v_s[k:])%i)
                tmp = []
                nnn = []
                for j in range(i):
                    tmp += v_s[k+j:np+k:i]
                    nnn += v_n[k+j:np+k:i]
                tmp = array(tmp).reshape( (i,int(np/i)) )
                nnn = array(nnn).reshape( (i,int(np/i)) )
                #tmp = mean(tmp,axis=1).tolist()
                tmp = sum(tmp*nnn,axis=0)
                nnn = sum(nnn,axis=0)
                tmp = (tmp/nnn).tolist()

                if len(v_s[k+np:])>0:
                    tmp.append( sum( array(v_s[k+np:])*array(v_n[k+np:]) ) / sum( array(v_n[k+np:]) ) )
                #v_s.append(tmp)
                aa=array(tmp)
                alvar.append( sum((aa[0:-1]-aa[1:])**2) / ( 2 * (len(aa)-1) )  )
                aldev.append( sqrt(alvar[-1]) )
            allan_var_all.append(alvar)
            allan_dev_all.append(aldev)

        allan_dev     = []
        allan_dev_max = []
        allan_dev_min = []
        allan_dev_std = []
        allan_var     = []
        for i in allan_dev_all:
            allan_dev.append(     mean(i) )
            allan_dev_max.append( max(i) )
            allan_dev_min.append( min(i) )
            allan_dev_std.append( std(i) )
        for i in allan_var_all:
            allan_var.append(     mean(i) )

        i=len(self.allan)
        self.allan.append( { 'num':i, 'signal':signal, 'signal_index': s_ind,
                             't0':t0  , 't1':t1,
                             'steps':steps, 'v_s':v_s , 'v_n':v_n ,'range': [start,end]  ,
                             'allan_dev_max':allan_dev_max , 'allan_dev_min':allan_dev_min ,
                             #'allan_dev_all':allan_dev_all , 'allan_var_all':allan_var_all ,
                             'allan_dev_std':allan_dev_std, 'factor': 1 ,
                             'allan_var':allan_var , 'allan_dev':allan_dev })
        print('Total Load time: {:f} sec'.format( time.time()-tbuff ))




    def allan_range(self,signal,start=0,end=1,sp=0):
        """
        Calculates allan deviation of the signal ( 'signal'- sp ) from 'start' index to 'end' index.
        First, it analyses the data range and auto set the best time bin length to divide the time array.
        The, calculates the mean value of each time bin creating a v_s vector of the signal data that is
        equally spaced in time.
        Then calculates the allan deviation on the v_s vector.

        Usage:
            self.allan_range(signal,start=0,end=1,sp=0)

        Params:
            signal    : signal name to be processed
            start,end : index limits of data to process
            sp        : set-point value to supress from signal

        Example:
            d=read_dump(filename='/home/lolo/data/20171109_184719.bin')
            d.allan_range(start=6944, end=8148326,signal='error')
            d.plot_allan()

        """
        # First we find the optimal time range
        self.check_time_stats()
        if end==1:
            end=self.time_stats_data['data_length']-1
        print('Analysing vector "{:s}" in range {:d}:{:d}'.format(signal,start,end))
        s_ind=self.names.index(signal)
        max_dt_oom=floor(log10(self.time_stats_data['max_dt']))
        max_dt=ceil(self.time_stats_data['max_dt']*10**(-max_dt_oom))/10**(-max_dt_oom)
        print('Min time bin: {:f} sec'.format(max_dt))
        tbuff=time.time()
        time_already=False
        if len(self.allan)>0:
            for i in self.allan:
                if i['range']==[start,end]:
                    t0=i['t0']
                    t1=i['t1']
                    time_already=True
                    print('already have time info')
                    break
        if not time_already:
            print('Looking for time information')
            with open(self.filename,'rb') as f:
                f.read(self.head_size)
                cs=struct.calcsize(self.strstr)
                fc=f.read(cs)
                j=0
                while fc:
                    tnow=struct.unpack(self.strstr,fc)[0]
                    if j==start:
                        t0=tnow
                    if j==end:
                        t1=tnow
                        break
                    fc=f.read(cs)
                    j+=1
        print('Load time: {:f} sec'.format( time.time()-tbuff ))
        print('t0: {:f} sec'.format( t0 ) )
        print('t1: {:f} sec'.format( t1 ) )
        print('Dt: {:f} sec | {:f} min'.format( t1-t0, (t1-t0)/60 ) )
        print('')
        bins_num=int(  floor(log( (t1-t0)/max_dt )/log(2)) -1 )
        print('Number of bins: {:d}'.format(bins_num))

        steps=max_dt * 2**arange(bins_num)
        v_s=[]
        for i in range(bins_num):
            v_s.append([])
        v_tmp=[]
        for i in range(bins_num):
            v_tmp.append([])
        v_n = []
        for i in range(bins_num):
            v_n.append([])
        v_lastmod  = ones(bins_num)*1e10
        v_lasttime = ones(bins_num)*t0
        percentage      = '0%'
        percentage_step = int((end-start)/1000)
        with open(self.filename,'rb') as f:
            f.read(self.head_size)
            cs=struct.calcsize(self.strstr)
            fc=True
            j=0
            for j in range(start):
                fc=f.read(cs)
                j+=1
            while fc:
                fc=f.read(cs)
                vv=struct.unpack(self.strstr,fc)
                tnow=vv[0]
                for i in range(bins_num):
                    if tnow > v_lasttime[i] + steps[i]:
                        #v_lasttime[i]=tnow
                        v_lasttime[i]+=steps[i]
                        v_s[i].append( mean( v_tmp[i] ) )
                        v_n[i].append(len(v_tmp[i]))
                        v_tmp[i]=[ vv[s_ind] - sp   ]
                    else:
                        v_tmp[i].append(  vv[s_ind] - sp    )
                j+=1
                if j>end:
                    break
                if int((j-start))%percentage_step==0:
                    if not percentage == str(int((j-start)/(end-start)*100)) + '%':
                        percentage = str(int((j-start)/(end-start)*100)) + '%'
                        print( percentage )
        allan_var = []
        for i in v_s:
            aa=array(i)
            allan_var.append(  sum((aa[0:-1]-aa[1:])**2) / ( 2 * (len(aa)-1) )  )
        allan_dev=sqrt(array(allan_var))
        i=len(self.allan)
        self.allan.append( { 'num':i, 'signal':signal, 'signal_index': s_ind,
                             't0':t0  , 't1':t1, 'v_n':v_n ,
                             'steps':steps, 'v_s':v_s , 'range': [start,end]  ,
                             'allan_var':allan_var , 'allan_dev':allan_dev })
        print('Total Load time: {:f} sec'.format( time.time()-tbuff ))















#%%

if __name__ == '__main__':
    rp=red_pitaya_app(AppName='lock_in+pid',host='10.0.32.207',port=22)
    rp=red_pitaya_app(AppName='lock_in+pid',host='10.0.32.207',port=22,password='root')




# load_app.py
"""
#!/usr/bin/python3
from __future__ import print_function

from time import sleep
#import mmap
import sys

# apt install -y python3-requests
import requests
import os


url='http://localhost/lock_in+pid'
Appame = os.path.realpath(__file__).split('/')[5]

res = requests.get('http://localhost/'+Appame, params={ 'type': 'run' } )
#print(res)

# http://10.0.32.207:3080/bazaar?start=lock_in+pid

res = requests.get('http://localhost/bazaar?start='+Appame)
print(res.text)
"""
