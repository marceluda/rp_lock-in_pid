#!/home/lolo/anaconda3/bin/python3
# -*- coding: utf-8 -*-
"""
Created on Thu Oct 20 19:51:28 2016

@author: lolo
"""


from numpy import *
import matplotlib.pyplot as plt


write_files=False

T=int(2520)
xx=arange(0,T)
A=(2**12-1)
y1=sin((xx+0.5)*2*pi/T)  *A
y2=sin((xx+0.5)*2*pi/T*2)*A
y3=sin((xx+0.5)*2*pi/T*3)*A


plt.plot(xx,y1)
plt.plot(xx,y2)
plt.plot(xx,y3)

sy1=y1.copy()
sy2=y2.copy()
sy3=y3.copy()

sq1=sign(sy1).astype(int)
sq2=sign(sy2).astype(int)
sq3=sign(sy3).astype(int)


y1=y1.astype(int)
y2=y2.astype(int)
y3=y3.astype(int)


disp(sum(y1))
disp(sum(y2))
disp(sum(y3))

disp(sum(y1*y2))
disp(sum(y1*y3))
disp(sum(y2*y3))


# Cuando vemos el discretizado comparado con el posta tenemos una dispersion
# horrible. Corregimos

# para y1
plt.plot(y1-sy1,'.-')

I12=arange(0,T/4).astype(int)
plt.plot(around(y1[I12]+0.5)-sy1[I12],'.-')
plt.plot(around(y1+0.5)-sy1,'.-')

tmp=around(y1[I12]+0.5).astype(int).tolist()
ny1=[]
ny1.extend( tmp  )
tmp.reverse()
ny1.extend( tmp  )
ny1.extend( (-array(ny1)).astype(int).tolist()  )
plt.plot(ny1)

y1=array(ny1).copy()

# para y2
plt.plot(y2-sy2,'.-')

I12=arange(0,T/8).astype(int)
plt.plot(around(y2[I12]+0.5)-sy2[I12],'.-')
plt.plot(around(y2+0.5)-sy2,'.-')

tmp=around(y2[I12]+0.5).astype(int).tolist()
ny2=[]
ny2.extend( tmp  )
tmp.reverse()
ny2.extend( tmp  )
ny2.extend( (-array(ny2)).astype(int).tolist()  )
ny2.extend( ny2  )
plt.plot(ny2)

y2=array(ny2).copy()


# para y3
plt.plot(y3-sy3,'.-')

I12=arange(0,T/3/4).astype(int)
plt.plot(around(y3[I12]+0.5)-sy3[I12],'.-')
plt.plot(around(y3+0.5)-sy3,'.-')

tmp=around(y3[I12]+0.5).astype(int).tolist()
ny3=[]
ny3.extend( tmp  )
tmp.reverse()
ny3.extend( tmp  )
ny3.extend( (-array(ny3)).astype(int).tolist()  )
tmp=ny3.copy()
ny3.extend( tmp  )
ny3.extend( tmp  )
plt.plot(ny3)

y3=array(ny3).copy()


# Ya sin correlación en el error entre los discretizados y el original, verificamos
# las ortogonalidades


disp(sum(y1))
disp(sum(y2))
disp(sum(y3))

disp(sum(y1*y2))
disp(sum(y1*y3))
disp(sum(y2*y3))



# Hay que corregir y1 para que sea ortogonal a y3


# Ajustar la parte cuadrada
I1=arange(0,T/6).astype(int)
I2=arange(T/6,T/4).astype(int)
I12=arange(0,T/4).astype(int)


disp(sum(y1[I1])-sum(y1[I2]))
plt.plot(I1,y1[I1],'b.-',I2,y1[I2],'r.-')
plt.plot(I12,sq3[I12]*A,'g.-')

disp('Tengo que sacar ')
disp(sum(sq3[I12]*y1[I12])/2)
disp('puntos de la parte 1 y mandarlos a la parte 2 ')


#a2=-(I2-420)*(I2-629)
#a2=a2/max(a2)
#
#plt.plot(a2)
#
#
#ac=[]
#for i in arange(1,3,0.0001):
#    ac.append( sum(  floor(a2*i)  ) )
#plt.plot(ac,'.-')
#
#sum(floor(arange(1,3,0.0001)[688]*a2))

# agrrgarle 3 a I2
a2=-(I2-420)*(I2-629)*sin(pi*(I2-629)/2)**2
a2=a2/max(a2)
plt.plot(a2,'.')

ac=[]
for i in arange(1,3,0.0001):
    ac.append( sum(  floor(a2*i)  ) )
plt.plot(ac,'.-')

a2=floor(arange(1,3,0.0001)[9]*a2)
disp(sum(a2))

#sacarle 3 a I1
a1=- I1*(I1-419) *sin(pi*I1/2)**2
a1=- ((I1-419/2)**4-(419/2)**4) *sin(pi*I1/2)**2

a1=a1/max(a1)

plt.plot(a1,'.')

ac=[]
for i in arange(1,1.0003,0.00000001):
    ac.append( sum(  floor(a1*i)  ) )
plt.plot(ac,'.-')

a1=floor(arange(1,1.0003,0.00000001)[4]*a1)
disp(sum(a1))


# reparamos y1
disp(   sum(y1[I1]-a1)-sum(y1[I2]+a2)   )

tmp=[]
tmp.extend( (y1[I1]-a1).astype(int).tolist() )
tmp.extend( (y1[I2]+a2).astype(int).tolist() )

plt.plot(tmp,'.')
plt.plot(sy1)
plt.plot(tmp-sy1[I12],'.-')

ny1=[]
ny1.extend( tmp  )
tmp.reverse()
ny1.extend( tmp  )
ny1.extend( (-array(ny1)).astype(int).tolist()  )
plt.plot(ny1)

y1=array(ny1).copy()



# Volvemos a probar ...
disp(sum(y1))
disp(sum(y2))
disp(sum(y3))

disp(sum(y1*y2))
disp(sum(y1*y3))
disp(sum(y2*y3))
# Aun hay que corregir la ortogonalidad con y3



# Raparamos y1*y3
disp(   sum(y1[I1])-sum(y1[I2])   )

disp(  ( sum(y1[I1]*y3[I1])+sum(y1[I2]*y3[I2]) )/2  )
disp(  ( sum(y1[I1]*y3[I1])+sum(y1[I2]*y3[I2]) )  )

dd=3201

# Tenemos que combinar igual cantidad de +1 y -1 en b1
# tal que sum(b1*y3[I1])=dd

tmp=y3[I1]
# Veamos todas las restas posibles

t1=unique(sort(tmp))

# Filas
ff=ones(len(t1)).reshape(-1,1) * t1.reshape(1,-1)
# columnas
cc=t1.reshape(-1,1)  * ones(len(t1)).reshape(1,-1)

t2=ff - cc
t2=t2.astype(int)

plt.plot(unique(sort(t2.flatten())),'.-')
plt.plot(arange(5000),ones(5000)*dd)
plt.grid(b=True)

# Son todas pares! No puedo fabricar un numero impar así !
# No hace falta... puedo sumarle a uno dd+1 y restarle al otro dd-1

nonzero(t2==dd+1)
disp(t2[28,194])
disp(ff[28,194])
disp(cc[28,194])

b1=zeros(len(I1))
tmp[nonzero(tmp==ff[28,194])[0][-1]]
tmp[nonzero(tmp==cc[28,194])[0][1]]

b1[nonzero(tmp==ff[28,194])[0][-1]]=1
b1[nonzero(tmp==cc[28,194])[0][1]]=-1

disp(sum(b1*tmp))

# Ahora buscamos b2 tal que sum(b2*y3[I2])=dd-1


tmp=y3[I2]
# Veamos todas las restas posibles

t1=unique(sort(tmp))

# Filas
ff=ones(len(t1)).reshape(-1,1) * t1.reshape(1,-1)
# columnas
cc=t1.reshape(-1,1)  * ones(len(t1)).reshape(1,-1)

t2=ff - cc
t2=t2.astype(int)

plt.plot(unique(sort(t2.flatten())),'.-')
plt.plot(arange(5000),ones(5000)*dd)
plt.grid(b=True)

# Son todas pares! No puedo fabricar un numero impar así !
# No hace falta... puedo sumarle a uno dd+1 y restarle al otro dd-1

nonzero(t2==dd-1)
disp(t2[71,197])
disp(ff[71,197])
disp(cc[71,197])

b2=zeros(len(I2))
tmp[nonzero(tmp==ff[71,197])[0][-1]]
tmp[nonzero(tmp==cc[71,197])[0][0]]

b2[nonzero(tmp==ff[71,197])[0][-1]]=1
b2[nonzero(tmp==cc[71,197])[0][0]]=-1

disp(sum(b2*tmp))


# ahora reparamos y1

disp(   sum(y1[I1]+b1)-sum(y1[I2]+b2)   )
disp(   sum( (y1[I1]+b1)*y3[I1] ) + sum( (y1[I2]+b2)*y3[I2] )   )


tmp=[]
tmp.extend( (y1[I1]+b1).astype(int).tolist() )
tmp.extend( (y1[I2]+b2).astype(int).tolist() )

plt.plot(tmp,'.')
plt.plot(sy1)
plt.plot(tmp-sy1[I12],'.-')

ny1=[]
ny1.extend( tmp  )
tmp.reverse()
ny1.extend( tmp  )
ny1.extend( (-array(ny1)).astype(int).tolist()  )
plt.plot(ny1)

y1=array(ny1).copy()



# Rechequeamos las relaciones


disp(sum(y1))
disp(sum(y2))
disp(sum(y3))

disp(sum(y1*y2))
disp(sum(y1*y3))
disp(sum(y2*y3))


disp(sum(y1*sq2))
disp(sum(y1*sq3))

disp(sum(y2*sq1))
disp(sum(y2*sq3))

disp(sum(y3*sq1))
disp(sum(y3*sq2))

disp('Está perfecto!!')




fn='data_sin.dat'
tmp=y1.astype(uint16)

if write_files:
    with open(fn, 'w') as content_file:
        tmp2=[]
        for i in tmp:
            tmp2.append('{0:016b}'.format(i)[-14:])
        content_file.write(' '.join(tmp2))


fn='data_sin2.dat'
tmp=y2.astype(uint16)

# for i in tmp:
#     print('{0:016b} '.format(i)[-15:])
if write_files:
    with open(fn, 'w') as content_file:
        tmp2=[]
        for i in tmp:
            tmp2.append('{0:016b}'.format(i)[-14:])
        content_file.write(' '.join(tmp2))


fn='data_sin3.dat'
tmp=y3.astype(uint16)

# for i in tmp:
#     print('{0:016b} '.format(i)[-15:])

if write_files:
    with open(fn, 'w') as content_file:
        tmp2=[]
        for i in tmp:
            tmp2.append('{0:016b}'.format(i)[-14:])
        content_file.write(' '.join(tmp2))
    


# Para los cosenos hacemos lo mismo

T4 =int(T/4)
T8 =int(T/4/2)
T12=int(T/4/3)

cy1=[]
cy1.extend( y1[T4: ].tolist() )
cy1.extend( y1[0:T4].tolist() )
cy1=array(cy1)
plt.plot(cy1)

cy2=[]
cy2.extend( y2[T8: ].tolist() )
cy2.extend( y2[0:T8].tolist() )
cy2=array(cy2)
plt.plot(cy2)

cy3=[]
cy3.extend( y3[T12: ].tolist() )
cy3.extend( y3[0:T12].tolist() )
cy3=array(cy3)
plt.plot(cy3)



fn='data_cos.dat'
tmp=cy1.astype(uint16)

# for i in tmp:
#     print('{0:016b} '.format(i)[-15:])

if write_files:
    with open(fn, 'w') as content_file:
        tmp2=[]
        for i in tmp:
            tmp2.append('{0:016b}'.format(i)[-14:])
        content_file.write(' '.join(tmp2))


fn='data_cos2.dat'
tmp=cy2.astype(uint16)

# for i in tmp:
#     print('{0:016b} '.format(i)[-15:])

if write_files:
    with open(fn, 'w') as content_file:
        tmp2=[]
        for i in tmp:
            tmp2.append('{0:016b}'.format(i)[-14:])
        content_file.write(' '.join(tmp2))


fn='data_cos3.dat'
tmp=cy3.astype(uint16)

# for i in tmp:
#     print('{0:016b} '.format(i)[-15:])

if write_files:
    with open(fn, 'w') as content_file:
        tmp2=[]
        for i in tmp:
            tmp2.append('{0:016b}'.format(i)[-14:])
        content_file.write(' '.join(tmp2))


plot_things=True
if plot_things:
    plt.figure()
    plt.plot( xx , y1 , label='y1' )
    plt.plot( xx,  sin((xx+0.5)*2*pi/T) * A ,  label='sin' )
    plt.grid(b=True)
    plt.legend()
    
    plt.figure()
    plt.plot( xx,  sin((xx+0.5)*2*pi/T) * A - y1 ,  label='sin' )
    
    
    
    
    