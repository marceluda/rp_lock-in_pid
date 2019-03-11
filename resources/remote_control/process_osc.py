#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Wed Sep  6 15:06:19 2017

@author: liaf-ankylosaurus-admin
"""

#%% Un buen ejemplo desde el oscilo ##########################################


from numpy import *
import matplotlib.pyplot as plt


pyfile='data_20170806_144216.py'

global_vars={}
local_vars={}

with open(pyfile) as f:
    code = compile(f.read(), "somefile.py", 'exec')
    exec(code, global_vars, local_vars)

t1 =local_vars[ 't1']
ch1=local_vars['ch1']
t2 =local_vars[ 't2']
ch2=local_vars['ch2']

del global_vars
del local_vars

plt.figure(figsize=(7,6))
ax1 = plt.subplot2grid((1,1), (0, 0))
#ax2 = plt.subplot2grid((2,1), (1, 0), sharex=ax1)

ax1.plot( t1 , ch1 , linewidth=2 , color='blue', label='Demodulado')
ax1.plot( t2 , ch2 , linewidth=2 , color='red' , label='Fotodiodo')
ax1.plot( t2 , 0*t2 , linewidth=1 , color='black' )

ax1.grid(b=True)
#ax1.set_ylim(-0.55,max(ch2)-0.01)
#ax1.set_xlim(min(t1),max(t1))
ax1.legend(loc=0)

ax1.set_ylabel('[V]')
ax1.set_xlabel('Tiempo [s]')

plt.tight_layout()
# plt.savefig(folder+filename.replace('.py','_auto.png'))
 
 
 
 
 