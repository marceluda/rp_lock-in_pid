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

os.chdir('/home/lolo/Dropbox/Doctorado/herramientas/RedPitaya/scope+lock/v0.15/scope+lock/resources/RP_py')

from read_dump import read_dump
from read_from_linux import red_pitaya_control,red_pitaya_lock,smooth,findpeaks,goodYlim,now,is_int

today=datetime.now().strftime("%Y%m%d")



RP_addr='10.0.32.207'
RP_port=2022

ssh='ssh '+str(RP_addr)+' -l root ' + ('-p {:d} '.format(RP_port) if is_int(RP_port) else '')


#os.chdir('/home/lolo/Dropbox/Doctorado/datos_labo/lolo')





rp=red_pitaya_lock(RP_addr='10.0.32.207',RP_port=2022,filename='/home/lolo/Dropbox/Doctorado/datos_labo/lolo/test.npz')



#%% Examples of commands



rp.lock.set('oscA_sw',12)
rp.lock.set('oscB_sw',13)
rp.lock.set('oscA_sw',16)
rp.lock.set('gen_mod_hp',10000)


#%% Start and stop long streamign

rp.start_streaming(log='prueba',signals='oscA oscB')

rp.stop_straming()


#%%
rp.fire_trig('ext',dec=1,trig_pos=8000)
rp.get_curv()
rp.plot(time=False,rel=True)


rp.fire_trig('ext',dec=1,trig_pos=5)
rp.get_curv()

rp.plot()

#%%

rp.print_log()
rp.print_data()


#%%


rp.get_fast_stream(signals='oscA oscB')
rp.get_fast_stream(signals='oscA oscB')
rp.get_fast_stream(signals='oscA oscB')

for i in rp.allan:
    d=read_dump(i[2])
    d.allan_range(start=0,signal='oscA')
    d.allan_range(start=0,signal='oscB')
    d.plot_allan(num='all')


d.load_range(start=0,end=-1)
d.plot('oscA oscB')


#%%


rp.save()

rp.export_data_csv()




#%%






#rp.osc.load()


#rp.osc.data


#rp.lock.load()

#rp.lock.data



#rp.osc.set('Dec',64)

#rp.osc.get('Dec')




