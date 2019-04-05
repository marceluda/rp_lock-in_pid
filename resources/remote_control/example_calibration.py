# -*- coding: utf-8 -*-

# You need paramiko for Red Pitaya conecction

# If you use Anaconda, run from console:
# conda install -c anaconda paramiko

#%%

from numpy import *
import numpy as np
from matplotlib import pyplot as plt
from time import sleep,time


# PATH of control_hugo.py file
import sys
#sys.path.append('/home/lolo/Dropbox/Doctorado/pylib')
sys.path.append(r'C:\Users\Nestor\Desktop\lolo\lib')

from control_hugo import red_pitaya_control,red_pitaya_app

AppName      = 'lock_in+pid'
host         = '10.0.32.207'
port         = 22  # default port
trigger_type = 6   # 6 is externa trigger

#%%


filename = 'test.npz'
rp=red_pitaya_app(AppName=AppName,host=host,port=port,filename=filename,password='root')

# reduce log noise on Windows platform
import logging
logging.basicConfig()
logging.getLogger("paramiko").setLevel(logging.WARNING)
rp.verbose = False

import warnings
warnings.filterwarnings("ignore")



#%% This is for Calibration help
rp.get_adc_dac_calib()



trigger_type = 6 # 6 es externo, 1 es manual
dec = 1 # [1,8,64, 1024, 8192, 65536]

print('Actual parameters:\n')
print(repr(rp.calib_params))
print('\n')

print('Put the Web App in single acquisition mode.\n')

print('Connect in1 and in2 to GND\n')
input('Then Press enter\n\n')



rp.osc_trig_fire(trig=trigger_type,dec=dec)
sleep(dec *8e-9*2**14 + 0.2)
rp.get_curv(log='ruido info' )

ch1_val = mean( rp.data[-1][2]['ch1'])
ch2_val = mean( rp.data[-1][2]['ch2'])

rp.calib_params['FE_CH1_DC_offs'] = -int(ch1_val)
rp.calib_params['FE_CH2_DC_offs'] = -int(ch2_val)


print('Connect in1 and in2 to a Voltage reference (near and below 1 V)\n')
Vref = input('Input Reference Voltage in Volts: ')
Vref = float(Vref)

rp.osc_trig_fire(trig=trigger_type,dec=dec)
sleep(dec *8e-9*2**14 + 0.2)
rp.get_curv(log='ruido info' )

ch1_val = mean( rp.data[-1][2]['ch1'])
ch2_val = mean( rp.data[-1][2]['ch2'])

ch1_act = (ch1_val + rp.calib_params['FE_CH1_DC_offs'])*float(rp.calib_params['FE_CH1_FS_G_HI'])/2**32*100/8192
ch2_act = (ch2_val + rp.calib_params['FE_CH2_DC_offs'])*float(rp.calib_params['FE_CH2_FS_G_HI'])/2**32*100/8192

rp.calib_params['FE_CH1_FS_G_HI'] = int(rp.calib_params['FE_CH1_FS_G_HI']/ch1_act*Vref)
rp.calib_params['FE_CH2_FS_G_HI'] = int(rp.calib_params['FE_CH2_FS_G_HI']/ch2_act*Vref)

print('Saving new calibration. Please, restart de web App.')
rp.set_adc_dac_calib()




