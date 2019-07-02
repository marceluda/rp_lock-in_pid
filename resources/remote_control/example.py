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
host         = '192.168.1.103'
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

#%% Set params

rp.lock.ramp_step    = 1000
rp.lock.ramp_low_lim = 0
rp.lock.ramp_hig_lim = 8191
rp.lock.ramp_enable  = 1
rp.lock.out2_sw = 12

rp.lock.oscA_sw = 1
rp.lock.oscB_sw = 2
rp.lock.trig_sw = 8

rp.get_adc_dac_calib()


trigger_type = 6 # 6 es externo, 1 es manual

# Decimation only allows this values: 1,8,64, 1024, 8192, 65536
# The oscilloscope data points will be separated by 2^(dec-1) * 8 ns
dec = 1 # [1,8,64, 1024, 8192, 65536]

rp.osc_trig_fire(trig=trigger_type,dec=dec)
sleep(dec *8e-9*2**14 + 0.2)
rp.get_curv(log='ruido info' )

rp.save()

# Access last acquisition values
ch1_val = mean( rp.data[-1][2]['ch1'])
ch1_err =  std( rp.data[-1][2]['ch1'])

ch2_val = mean( rp.data[-1][2]['ch2'])
ch2_err =  std( rp.data[-1][2]['ch2'])

ch1_act = (ch1_val + rp.calib_params['FE_CH1_DC_offs'])*float(rp.calib_params['FE_CH1_FS_G_HI'])/2**32*100/8192
ch2_act = (ch2_val + rp.calib_params['FE_CH2_DC_offs'])*float(rp.calib_params['FE_CH2_FS_G_HI'])/2**32*100/8192

# plot last acquisition

rp.plot()



#%%


#%% This is for Calibration help
rp.get_adc_dac_calib()

print(repr(rp.calib_params))


trigger_type = 6 # 6 es externo, 1 es manual
dec = 1 # [1,8,64, 1024, 8192, 65536]

rp.osc_trig_fire(trig=trigger_type,dec=dec)
sleep(dec *8e-9*2**14 + 0.2)
rp.get_curv(log='ruido info' )

ch1_val = mean( rp.data[-1][2]['ch1'])
ch2_val = mean( rp.data[-1][2]['ch2'])

real_val = 1.026

ch1_act = (ch1_val + rp.calib_params['FE_CH1_DC_offs'])*float(rp.calib_params['FE_CH1_FS_G_HI'])/2**32*100/8192
ch2_act = (ch2_val + rp.calib_params['FE_CH2_DC_offs'])*float(rp.calib_params['FE_CH2_FS_G_HI'])/2**32*100/8192

rp.calib_params['FE_CH1_FS_G_HI'] = int(rp.calib_params['FE_CH1_FS_G_HI']/ch1_act*real_val)
rp.calib_params['FE_CH2_FS_G_HI'] = int(rp.calib_params['FE_CH2_FS_G_HI']/ch2_act*real_val)

rp.set_adc_dac_calib()
