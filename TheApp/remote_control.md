---
title: Remote Control
description: Remote Control
layout: page
---

Remote control can be implemented by SSH login and running commands inside Red Pitaya device.

<div class="alert alert-warning" role="alert">
  <strong>Under construction</strong> TO BE COMPLETED with detailed description
</div>

## Commands for FPGA registers control

SSH remote clients enable the possibility of remote script control trough any lab/calc/programming framework.

Inside Red Pitaya, commands are stored in folder:
`/opt/redpitaya/www/apps/lock-in+pid/py`

This are some commands already implemented:

```bash
lock.py         # Read/Write lock-in FPGA parameters (most of the instruments)
osc.py          # Read/Write oscilloscope FPGA parameters
osc_get_ch.py   # Oscilloscope Channel acquisition
osc_trig.py     # Trigger configuration
data_dump.py    # Raw data streaming
```

The three first commands allows to make most of the standard procedures, like
instruments configuration, data acquisition and oscilloscope control.

For example, to read the Oscilloscope A channel value, just run:

```bash
./lock.py oscA
```

To read the `pidB_kp` value, an then change it, run:

```bash
./lock.py pidB_kp
pidB_kp            :          0
./lock.py pidB_kp 20
pidB_kp            :         20
./lock.py pidB_kp
pidB_kp            :         20
```

With no params, `lock.py` and `osc.py` shows you all the registers available and its actual value.


<a data-toggle="collapse" href="#registerRW" aria-expanded="false" aria-controls="registerRW">Available registers<span class="caret"></span></a>

<div id="registerRW" class="collapse" markdown="1" style="padding: 10px; border: 1px solid gray; border-radius: 5px;">


```bash
./lock.py
oscA_sw            :          4
oscB_sw            :          2
osc_ctrl           :          3
trig_sw            :          0
out1_sw            :          0
out2_sw            :         12
slow_out1_sw       :          0
slow_out2_sw       :          0
slow_out3_sw       :          0
slow_out4_sw       :          0
lock_control       :       1148
lock_feedback      :       1148
lock_trig_val      :          0
lock_trig_time     :          0
lock_trig_sw       :          0
rl_error_threshold :          0
rl_signal_sw       :          0
rl_signal_threshold:          0
rl_config          :          0
rl_state           :          0
sf_jumpA           :          0
sf_jumpB           :          0
sf_config          :          0
signal_sw          :          0
signal_i           :       6734
sg_amp1            :          0
sg_amp2            :          0
sg_amp3            :          0
sg_amp_sq          :          0
lpf_F1             :         32
lpf_F2             :         32
lpf_F3             :         32
lpf_sq             :         32
error_sw           :          0
error_offset       :          0
error              :          0
error_mean         :          0
error_std          :          0
gen_mod_phase      :          0
gen_mod_phase_sq   :          0
gen_mod_hp         :          0
gen_mod_sqp        :          0
ramp_A             :       3344
ramp_B             :       3298
ramp_step          :       1000
ramp_low_lim       :       2000
ramp_hig_lim       :       7000
ramp_reset         :          0
ramp_enable        :          1
ramp_direction     :          0
ramp_B_factor      :       4096
sin_ref            :        596
cos_ref            :       4060
cos_1f             :       4012
cos_2f             :      -2464
cos_3f             :      -3476
sq_ref_b           :          1
sq_quad_b          :          0
sq_phas_b          :          1
sq_ref             :       4096
sq_quad            :       4096
sq_phas            :       4096
in1                :       6744
in2                :       6796
out1               :          0
out2               :       2319
slow_out1          :          0
slow_out2          :          0
slow_out3          :          0
slow_out4          :          0
oscA               :       2087
oscB               :       6790
X_28               :      13751
Y_28               :     -16574
F1_28              :     -13671
F2_28              :       3780
F3_28              :      -1797
sqX_28             :   27602875
sqY_28             :  -27606127
sqF_28             :  -27347185
cnt_clk            :          0
cnt_clk2           :          0
read_ctrl          :          0
pidA_sw            :          0
pidA_PSR           :          3
pidA_ISR           :          8
pidA_DSR           :          0
pidA_SAT           :         13
pidA_sp            :          0
pidA_kp            :          0
pidA_ki            :          0
pidA_kd            :          0
pidA_in            :          0
pidA_out           :          0
pidA_ctrl          :          0
ctrl_A             :       3034
pidB_sw            :          0
pidB_PSR           :          3
pidB_ISR           :          8
pidB_DSR           :          0
pidB_SAT           :         13
pidB_sp            :          0
pidB_kp            :          0
pidB_ki            :          0
pidB_kd            :          0
pidB_in            :          0
pidB_out           :          0
pidB_ctrl          :          0
ctrl_B             :       3616
aux_A              :          0
aux_B              :          0
```

```bash
./osc.py
conf     :          5
TrgSrc   :          1
ChAth    :       4013
ChBth    :      11384
TrgDelay :      16377
Dec      :       8192
CurWpt   :      14132
TrgWpt   :       7607
ChAHys   :         63
ChBHys   :         63
AvgEn    :          0
PreTrgCnt:          1
ChAEqFil1:      32147
ChAEqFil2:     276423
ChAEqFil3:   14260634
ChAEqFil4:       9830
ChBEqFil1:      32147
ChBEqFil2:     276423
ChBEqFil3:   14260634
ChBEqFil4:       9830

```

</div>

## Remote control through Python scripts

On [`github.com/marceluda/rp_lock-in_pid/tree/master/resources/remote_control`](https://github.com/marceluda/rp_lock-in_pid/tree/master/resources/remote_control)
you can find a Python tool, based on [paramiko](http://www.paramiko.org/), for remote control of Lock-in+PID App.

The [example file](https://github.com/marceluda/rp_lock-in_pid/blob/master/resources/remote_control/example.py)
shows how to use it:

```python
from numpy import *
import numpy as np
from matplotlib import pyplot as plt
from time import sleep,time

# PATH of control_hugo.py file
import sys
#sys.path.append('/home/lolo/Dropbox/Doctorado/pylib')
sys.path.append(r'C:\Users\Nestor\Desktop\lolo\lib')
from control_hugo import red_pitaya_control,red_pitaya_app

AppName      = 'lock-in+pid'
host         = '192.168.1.103'
port         = 22  # default port
trigger_type = 6   # 6 is externa trigger

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
```

<div class="alert alert-danger" role="alert">
  <strong>Attention!</strong> If you are going to make remote acquisition, make sure the Web App oscilloscope is not running. **The best way to do that is to set it in "Mode: Single"**.
</div>

You can run this example with [Anaconda Python](https://www.anaconda.com/distribution/) on Windows or Linux platforms.
To install Paramiko, just run in console:

```bash
cd $HOME/anaconda/bin
./conda install -c anaconda paramiko
```
