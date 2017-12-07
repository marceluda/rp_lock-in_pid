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

from read_dump import read_dump
from read_from_linux import red_pitaya_control,red_pitaya_lock,smooth,findpeaks,goodYlim,now,is_int

today=datetime.now().strftime("%Y%m%d")


# Con esto cargamos el control remoto de la RP


filename = os.environ['HOME']+'/Desktop/RP/data/{:s}.npz'.format(today)
os.mkdir(os.path.dirname(filename))

print('Archivo de trabajo: ' + filename )

rp=red_pitaya_lock(RP_addr='rp-f01d89.local',RP_port=22,filename=filename)




#%% 

print("""
Primero hay que cargar en el navegador el aplicación, generar un barrido
y ubicar un pico adecuaco para loquear.
""")


#%% 

print("""
Vamos a capturar el pico y su señal de error y otras yerbas.
 - Ponemos a triggerear en el navegador con la fuente externa y usamos el trigger
   de 'scan floor'
 - Ponemos Mode en Single y le demos una captura en sigle
""")

# Ahroa levantamos los datos directo de la RP (tiene mas info que lo que llega al navegador)


rp.get_curv(log='Premera captura del pico a lockear')

rp.plot()

# Estimo que los canales eran 'in1' y 'error' , pero por si acaso hacemos un conjunto de
# mediciones todas juntas, para que quede.

save_oscA_sw = rp.lock.oscA_sw
save_oscB_sw = rp.lock.oscB_sw
save_Dec     = rp.osc.Dec

rp.lock.set('oscA_sw',1) # in1
rp.lock.set('oscB_sw',3) # error
rp.fire_trig('ext',trig_pos=30)
rp.get_curv(log='Capturamos error')

rp.lock.set('oscA_sw',1) # in1
rp.lock.set('oscB_sw',27) # sqx
rp.fire_trig('ext',trig_pos=30)
rp.get_curv(log='Capturamos sqx')

rp.lock.set('oscA_sw',1) # in1
rp.lock.set('oscB_sw',28) # sqy
rp.fire_trig('ext',trig_pos=30)
rp.get_curv(log='Capturamos sqy')

rp.lock.set('oscA_sw',1) # in1
rp.lock.set('oscB_sw',6) # scan A
rp.fire_trig('ext',trig_pos=30)
rp.get_curv(log='Capturamos Scan A')

rp.lock.set('oscA_sw',1) # in1
rp.lock.set('oscB_sw',3) # error
rp.fire_trig('ext',trig_pos=30,dec=1)
rp.get_curv(log='Capturamos error de nuevo, con decimation=1')

# Volvemos a los valores originales
rp.lock.set('oscA_sw', save_oscA_sw )
rp.lock.set('oscB_sw', save_oscB_sw ) 
rp.osc.set( 'Dec', save_Dec ) 


rp.save()

#%% 
print("""
Ya que está, relevamos bien lento el pico una vez
""")

# Ahroa levantamos los datos directo de la RP (tiene mas info que lo que llega al navegador)


save_oscA_sw   = rp.lock.oscA_sw
save_oscB_sw   = rp.lock.oscB_sw
save_scan_step = rp.lock.scan_step

rp.lock.set('oscA_sw',1) # in1
rp.lock.set('oscB_sw',3) # error
rp.lock.set('scan_step',20000) 
rp.fire_trig('ext',trig_pos=30,dec=65536,timeout=30)
rp.get_curv(log='Capturamos error en version lenta')

# Volvemos a los valores originales
rp.lock.set('oscA_sw'  , save_oscA_sw)
rp.lock.set('oscB_sw'  , save_oscB_sw)
rp.lock.set('scan_step', save_scan_step) 
rp.osc.set( 'Dec', save_Dec ) 

rp.plot()

rp.save()


#%% 
print("""
CAPTURA DEL MOMENTO DE LOCKEO
Para capturar ese instante, habilitamos el Mode Normal en el osciloscopio web y procedemos como siempre
 - Configuramos los PID
 - Ponemos el Lock Control en Time trigger
 - Seleccionamos con el mouse el pico / lugar de lockeo que queremos
 - En lugar de hacer clic en Trigger Lock, cambiamos el Mode a Single en la web y corremos este código
""")

# leemos parámetros actuales
rp.lock.load()
rp.osc.load()
save_Dec     = rp.osc.Dec

# Seteamos Lock control trigger
rp.lock.set('trig_sw'  , 128 )

# Le decimos a la RP que espere el trigger externo
rp.fire_trig('ext',trig_pos=8000,dec=64,timeout=1)

# Disparamos el Trigger Lock
rp.lock.set('lock_control'  , rp.lock.lock_control | 2 )  # El bit 2 es el que dispara el trigger lock

print('Esperando 10 seg a ver si lockea')

sleep(10)
# Recuperamos la curva de ese lock
rp.get_curv(log='Captura del momento del lockeo')
rp.plot()

"""
Ahora corroboramos si el sistems esta lockeado pasando a Mode Auto en el oscilo web
"""

rp.save()

#%% 
print("""
La idea ahora es hacer algunas pruebas programadas con el sistema ya estabilizado
Se me ocurren algunas varias. La idea es variar algun parámetro y ver como cambia algun indicador de estbilidad
 - Con el sistema lockeado, configuramos el osciloscopio web en Mode Single
""")



# Con el sistema ya lockeado, vemos como varía el error variando el pasabajos.

# Guardamos parámetros actuales
rp.lock.load()
rp.osc.load()

save_oscA_sw   = rp.lock.oscA_sw
save_oscB_sw   = rp.lock.oscB_sw
save_lpf_sq    = rp.lock.lpf_sq

# Seteamos el trigger en algo que esté todo el tiempo (esto es para evitar un BUG que tengo al adquirir)
rp.lock.set('trig_sw'  , 128 ) # Harmonic modulation Trigger


rp.lock.set('oscA_sw',1) # in1
rp.lock.set('oscB_sw',3) # error


#%%
###############################################################################
# Barrido de LPF Tau relevando el error_std

v_tau       = []
v_error_std = []

# Barremos 10 valores del low_pass_filter SQ
for i in range(10):
    rp.log('Seteando LPF_SQ en {:f} us'.format( 0.512 * 2**i ) )
    rp.lock.set('lpf_sq', i+32)  # el 32 quiere decir q es filtro de orden 2
    sleep(1)
    
    rp.fire_trig('ext',trig_pos=30,dec=65536)
    rp.get_curv(log='in1 y error para lpf_sq={:d}'.format(32+i))
    v_tau.append( 0.512 * 2**i )
    v_error_std.append( rp.lock.error_std )


plt.figure()
plt.plot(v_tau , v_error_std)
plt.xlabel('tau LPF [us]')
plt.ylabel('error std [int]')

# volvemos a estado inicial
rp.lock.set('lpf_sq',save_lpf_sq) 

rp.save()

print("""
Terminado. Verificar si el sistema sigue lockeado
""")


#%%
###############################################################################
# Barrido de LPF Tau releando la varianza de Allan con un minuto de largo 
# (esto va tardar al menos 10 min)

print("""
Volvemos a poner el oscilo en Mode Single
""")

# Encendemos el timer
rp.lock.set('read_ctrl', rp.lock.read_ctrl | 2 )


# Barremos 10 valores del low_pass_filter SQ
for i in range(10):
    rp.log('Seteando LPF_SQ en {:f} us'.format( 0.512 * 2**i ) )
    rp.lock.set('lpf_sq', i+32)  # el 32 quiere decir q es filtro de orden 2
    sleep(1)
    rp.get_fast_stream(signals='error ctrl_A ctrl_B sqx sqy cnt_clk2 cnt_clk',time_len=60,log='Tau = {:f} us'.format( 0.512 * 2**i))


# volvemos a estado inicial
rp.lock.set('lpf_sq',save_lpf_sq) 


print("""
Terminado. Verificar si el sistema sigue lockeado.
Podemos ver los diferentes allan dev con estos comandos:
""")

for aa in rp.allan:
    d=read_dump(aa[2])
    d.allan_range(start=0,signal='error')
    d.allan_range(start=0,signal='ctrl_A')
    d.plot_allan(num='all')
    plt.title(aa[3])
    plt.tight_layout()

# volvemos a estado inicial
rp.lock.set('lpf_sq',save_lpf_sq) 

rp.save()


#%%
###############################################################################
# Barrido de valores del proporcional de corriente
# ( o cualquier otra cosa que se te ocurra progrmar)
# Este guarda todo junto. TENES QUE PONER LOS VALORES VOS Y PROGRAMAR A GUSTO


print("""
Checkeamos que este lockeado.
Volvemos a poner el oscilo en Mode Single.
""")

# Encendemos el timer
rp.lock.set('read_ctrl', rp.lock.read_ctrl | 2 )

# Guardamos valores originales

rp.lock.load()
save_pidA_kp  = rp.lock.pidA_kp
save_pidB_kp  = rp.lock.pidB_kp
save_pidA_ki  = rp.lock.pidA_ki
save_pidB_ki  = rp.lock.pidB_ki



v_error_std = []
# Barremos 10 valores del low_pass_filter SQ
for i in [ 100, 200, 500, 1000, 2000, 5000 ]:
    rp.log('Valor de i: {:d} '.format( i ) )
    rp.lock.set('pidA_kp', i )
    #rp.lock.set('pidB_kp', save_pidB_kp )
    #rp.lock.set('pidA_ki', save_pidA_ki )
    #rp.lock.set('pidB_ki', save_pidB_ki )  
    sleep(1)
    rp.get_fast_stream(signals='error ctrl_A ctrl_B sqx sqy cnt_clk2 cnt_clk',time_len=60,log='i = {:d} int'.format( i))
    rp.lock.load()
    v_error_std.append( rp.lock.error_std  )


# volvemos a estado inicial
rp.lock.set('pidA_kp', save_pidA_kp )
rp.lock.set('pidB_kp', save_pidB_kp )
rp.lock.set('pidA_ki', save_pidA_ki )
rp.lock.set('pidB_ki', save_pidB_ki )


rp.save()


rp.lock.set('pidA_kp', -100 )



#%%


print("""
Por último hacemos un lock laaaaargo que podemos dejar corriendo por horas.
""")

# Encendemos el timer
rp.lock.set('read_ctrl', rp.lock.read_ctrl | 2 )

rp.start_streaming(log='lock largo',signals='error ctrl_A ctrl_B sqx sqy cnt_clk2 cnt_clk')

rp.save()

print("""
Probar si se puede dejar andando con el sistema de relock, usando valores razonables
""")





#%%
print("""
Cuando lo querramos terminarm ejecutamos esto
""")

rp.stop_straming()


rp.save()




#%% otros comandos de utilidad

rp.save()   # Guardar datos

rp.export_data_csv()  # Expordar curvas a csv

rp.print_log()  # Imprimir log

rp.print_data()  # Ver curvas disponibles


rp.lock.load()  # Cargar parámetros del sistema de lock
rp.osc.load()   # Cargar parámetros del osciloscopio




#%%   Listado de parámetros utiles

rp.osc.ChAth  # Threshold para el trigger de canal A
rp.osc.ChBth  # Threshold para el trigger de canal B
rp.osc.Dec    # Decimation | numero de clicks de reloj (c/u de 8 ns) antes de tomar un dato en oscA y oscB


rp.lock.aux_A                # Valor auxiliar
rp.lock.aux_B                # Valor auxiliar

rp.lock.cnt_clk              # Reloj interno 
rp.lock.cnt_clk2             # Reloj interno 

rp.lock.error                # valor de la señal error
rp.lock.error_mean           # 
rp.lock.error_offset         #
rp.lock.error_std            #
rp.lock.error_sw             # Seleccion switch de la señal de error

rp.lock.gen_mod_hp           # Periodo para la modulacion armónica
rp.lock.gen_mod_phase        # Fase para armónica
rp.lock.gen_mod_phase_sq     # Periodo para la modulación cuadrada
rp.lock.gen_mod_sqp          # Fase para cuadrada

rp.lock.scan_B_factor        # Relacion de amplitud scanB/scanA  ( es scan_B_factor/4096)
rp.lock.scan_direction       # 
rp.lock.scan_enable          # Encender / apagar scan
rp.lock.scan_hig_lim         # limite superior
rp.lock.scan_low_lim         # limite inferior
rp.lock.scan_reset           # resetear
rp.lock.scan_step            # Para setear el periodo del scan

rp.lock.trig_sw              # Selector de la señal de trigger externo

rp.lock.lock_trig_sw         # Selector de señal para disparar el sistema de lockeo
rp.lock.lock_trig_time       # Tiempo paar disparar el sistema de lockeo
rp.lock.lock_trig_val        # Valor paar disparar el sistema de lockeo

rp.lock.signal_sw            # Selector de señal a demodular

rp.lock.lpf_F1               # Filtro pasabajos. Selector del Tau para Xo, Yo y F1
rp.lock.lpf_F2               # Filtro pasabajos. Selector del Tau F2
rp.lock.lpf_F3               # Filtro pasabajos. Selector del Tau F3
rp.lock.lpf_sq               # Filtro pasabajos. Selector del Tau señales cuadradas sqx sqy sqf

rp.lock.sg_amp1              # Amplificador para Xo, Yo, F1
rp.lock.sg_amp2              # Amplificador para F2
rp.lock.sg_amp3              # Amplificador para F3
rp.lock.sg_amp_sq            # Amplificador para sqx, sqy, sqz

rp.lock.oscA_sw              # Selector del canal 1 del oscilosciopio
rp.lock.oscB_sw              # Selector del canal 2 del oscilosciopio

rp.lock.out1_sw              # Selector salida 1
rp.lock.out2_sw              # Selector salida 2
rp.lock.slow_out1_sw         # Salida lenta 1
rp.lock.slow_out2_sw         # ...
rp.lock.slow_out3_sw         #
rp.lock.slow_out4_sw         #

rp.lock.pidA_DSR             # Parametros del PID A
rp.lock.pidA_ISR             #
rp.lock.pidA_PSR             #
rp.lock.pidA_kd              #
rp.lock.pidA_ki              #
rp.lock.pidA_kp              #
rp.lock.pidA_sp              #
rp.lock.pidA_sw              #

rp.lock.pidB_DSR             # Parametros del PID B
rp.lock.pidB_ISR             #
rp.lock.pidB_PSR             #
rp.lock.pidB_kd              #
rp.lock.pidB_ki              #
rp.lock.pidB_kp              #
rp.lock.pidB_sp              #
rp.lock.pidB_sw              #

rp.lock.rl_config            # Sistema de relock
rp.lock.rl_error_threshold   #
rp.lock.rl_signal_sw         #
rp.lock.rl_signal_threshold  #
rp.lock.rl_state             #

rp.lock.sf_config            # Sistema de step function
rp.lock.sf_jumpA             #
rp.lock.sf_jumpB             #




