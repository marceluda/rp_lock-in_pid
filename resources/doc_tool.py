#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Wed Sep 13 10:56:26 2017

@author: lolo
"""

try:
    from numpy import *
except ModuleNotFoundError:
    print('You need to install `numpy` module for python. Try one of these:')
    print('  - apt install python3-numpy')
    print('  - pip3 search numpy')
    exit(0)

try:
    import matplotlib.pyplot as plt
except ModuleNotFoundError:
    print('You need to install `matplotlib` module for python. Try one of these:')
    print('  - apt install python3-matplotlib')
    print('  - pip3 search matplotlib')
    exit(0)


import re

import os

import enum

APP='lock_in+pid'

#%%


def clean_comments(txt):
    if type(txt)==list:
        txt=''.join(txt)
    txt=re.sub('`timescale[^\n]*\n','',txt)
    #txt=re.sub('/\*.*?\*/|\'(?:\\.|[^\\\'])*\'|"(?:\\.|[^\\"])*"', '', txt, flags=re.S )

    while txt.find('/*') >= 0 :
        i0=txt.find('/*')
        i1=txt.find('*/',i0)
        txt = txt[0:i0] + txt[i1+2:]

    #txt=re.sub('/\*[^*/]*\*/"', '', txt, flags=re.S )
    txt=re.sub('//[^\n]*\n','\n',txt)

    return txt




#%%


def get_mod_ports(name):
    if name=='mult_dsp_14':
        return {'ins':['CLK','A','B'] , 'outs':['P']}

    with open(APP+'/fpga/rtl/lock/'+name+'.v', 'r') as file:
        aa=file.readlines()
    aa=clean_comments(aa)

    for i in aa.split(';' ):
        if bool(re.match( '\s*module\s+\w+\s*(?:#\s*\([^\)]*\))?\s*\(' ,  i   )):
            break

    i = re.sub('\s+\)',',\n\)',i)
    inp=[]
    for j in [ y.strip() for y in re.findall('[^#]\([^\)]*\)',i)[0][1:-1].split('\n') ]:
        if 'input' in j:
            inp+=[ k.strip(' ,') for k in re.findall('[^, ]+\s*,',j) ]

    out=[]
    for j in [ y.strip() for y in re.findall('[^#]\([^\)]*\)',i)[0][1:-1].split('\n') ]:
        if 'output' in j:
            out+=[ k.strip(' ,') for k in re.findall('[^, ]+\s*,',j) ]

    return {'ins':inp , 'outs':out}



#
#pp=aa.split(';' )[0]
#
#bool(re.match( '\s+module\s+\w+\s*[^#]\(' ,  i   ))
#
#bool(re.match( '\s+module\s+\w+\s*(?:#\s*\([^\)]*\))?\s*\(' ,  i   ))
#
#
#bool(re.match( '\s+module\s+\w+\s*(?:#)' ,  i   ))


#%%

#
#with open(APP+'/fpga/rtl/red_pitaya_top.v', 'r') as file:
#    aa=file.readlines()

with open(APP+'/fpga/rtl/lock.v', 'r') as file:
    aa=file.readlines()

aa=clean_comments(aa)



# print( aa  )


modules=[]

for i in aa.split(';' ):
    if bool(re.match( '\s*\w+\s+(?:#\s*\([^\s]*\)\s)?\s*\w+\s*\s*\(' ,i)):
        if re.match(  '\s*(\w+)\s+(?:#\s*\([^\s]*\)\s)?\s*\w+\s*\s*\(' ,i).group(1) in ['module', 'if', 'case', 'casez']:
            continue
        #if re.match( '\s*(\w*)\s*(\w*)\s+\(' ,i).group(1) in ['module', 'if', 'case', 'casez']:
        #    continue
        tmp = re.match( '\s*(\w+)\s+(?:#\s*\([^\s]*\)\s)?\s*(\w+)\s*\s*\(' ,i)
        mod_name  = tmp.group(1)
        inst_name = tmp.group(2)

        #mod_name  = re.match( '\s*(\w*)\s*(\w*)\s+\(' ,i).group(1)
        #inst_name = re.match( '\s*(\w*)\s*(\w*)\s+\(' ,i).group(2)


        #break
        #print(re.sub('\n','',i))
        #i = re.sub('\s*\w*\s*\w*\s+\(','',i)
        #i = re.sub('\)\s*','',i)


        modules.append( {'module':   mod_name  ,
                         'instance': inst_name ,
                         'in_port': [] ,
                         'in_wire': [] ,
                         'out_port': [] ,
                         'out_wire': []   } )

        mod_tmp = get_mod_ports(mod_name)

        for port in re.findall( '\.\w+\s*\(\s*\w*\s*\)' ,i):
            tmp = re.match('\.(\w+)\s*\(\s*(\w*)\s*\)',port)
            port_name  = tmp.group(1)
            port_wire  = tmp.group(2)

            if port_name in mod_tmp['ins']:
                modules[-1]['in_port'].append( port_name )
                modules[-1]['in_wire'].append( port_wire )
            elif port_name in mod_tmp['outs']:
                modules[-1]['out_port'].append( port_name )
                modules[-1]['out_wire'].append( port_wire )
        print(mod_name)
        print('   ')


if False:
    [ y['module'] for y in modules ]

    [ y['instance'] for y in modules ]



#%%

# [ y['instance'] for y in modules ]

if False:

    filter_mod=[
     'i_jump_control',
     'i_satprotect_ctrl_A',
     'i_satprotect_ctrl_B',
     'i_muxer5_scope1',
     'i_muxer5_scope2',
     'i_trigger_input',
     'muxer_signal_i',
     'muxer3_error_i',
     'i_sum_2N_error_mean',
     'i_sum_2N_error_std',
     'i_gen_mod',
     'i_gen_scan',
     'i_muxer4_lock_trig_sw',
     'i_lock_ctrl',
     'muxer3_rl_signal_sw',
     'i_debounce_out_of_lock',
     'i_sq_mult_sq_ref',
     'i_sq_mult_sq_quad',
     'i_sq_mult_sq_phas',
     'i_LP_filter_sin_ref_A',
     'i_LP_filter_cos_ref_A',
     'i_LP_filter_sin_1f_A',
     'i_LP_filter_sin_2f_A',
     'i_LP_filter_sin_3f_A',
     'i_LP_filter_sq_ref_A',
     'i_LP_filter_sq_quad_A',
     'i_LP_filter_sq_phas_A',
     'i_LP_filter_sin_ref_B',
     'i_LP_filter_cos_ref_B',
     'i_LP_filter_sin_1f_B',
     'i_LP_filter_sin_2f_B',
     'i_LP_filter_sin_3f_B',
     'i_LP_filter_sq_ref_B',
     'i_LP_filter_sq_quad_B',
     'i_LP_filter_sq_phas_B',
     'i_satprotect_Xo_37',
     'i_satprotect_Yo_37',
     'i_satprotect_F1_37',
     'i_satprotect_F2_37',
     'i_satprotect_F3_37',
     'i_satprotect_sqx_37',
     'i_satprotect_sqy_37',
     'i_satprotect_sqf_37',
     'i_satprotect_Xo',
     'i_satprotect_Yo',
     'i_satprotect_F1',
     'i_satprotect_F2',
     'i_satprotect_F3',
     'i_satprotect_sqx',
     'i_satprotect_sqy',
     'i_satprotect_sqf',
     'i_muxer5_pidA',
     'i_lock_pid_block_A',
     'i_muxer5_pidB',
     'i_lock_pid_block_B']


    mods = [ y for y in filter( lambda x: x['instance'] in filter_mod , modules) ]


    from graphviz import Digraph


    dot = Digraph(comment='verilog1')


    dot.graph_attr['rankdir'] = 'LR'
    dot.graph_attr['splines'] = 'ortho'
    dot.node_attr['shape']='record'

    for r in mods:
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        dot.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )

    #dot.edge('Bar:p1', 'Foo:data0')

    out_wires=[]
    for i in mods:
        out_wires += i['out_wire']
    out_wires=unique(out_wires).tolist()

    for i in out_wires:
        if i=='':
            continue

        out_inst = [ y['instance'] for y in filter( lambda x: i in x['out_wire'] , mods) ][0]
        out_port = [ y['out_port'][y['out_wire'].index(i)] for y in filter( lambda x: i in x['out_wire'] , mods) ][0]

        pp=[ y['instance'] +':'+ y['in_port'][y['in_wire'].index(i)] for y in filter( lambda x: i in x['in_wire'] , mods) ]
        if len(pp)>0:
            for j in pp:
                dot.edge(out_inst+':'+out_port , j)

    dot.view()


# [ y['instance'] for y in modules[10:15] ]



#%%

if False:
    #
    #with open(APP+'/fpga/rtl/red_pitaya_top.v', 'r') as file:
    #    aa=file.readlines()

    with open(APP+'/fpga/rtl/lock.v', 'r') as file:
        aa=file.readlines()

    aa=clean_comments(aa)



    # print( aa  )


    modules=[]

    for i in aa.split(';' ):
        if bool(re.match( '\s*\w+\s+(?:#\s*\([^\s]*\)\s)?\s*\w+\s*\s*\(' ,i)):
            if re.match(  '\s*(\w+)\s+(?:#\s*\([^\s]*\)\s)?\s*\w+\s*\s*\(' ,i).group(1) in ['module', 'if', 'case', 'casez']:
                continue

            tmp = re.match( '\s*(\w+)\s+(?:#\s*\([^\s]*\)\s)?\s*(\w+)\s*\s*\(' ,i)
            mod_name  = tmp.group(1)
            inst_name = tmp.group(2)

            modules.append( {'module':   mod_name  ,
                             'instance': inst_name ,
                             'in_port': [] ,
                             'in_wire': [] ,
                             'out_port': [] ,
                             'out_wire': []   } )

            mod_tmp = get_mod_ports(mod_name)

            #for port in re.findall( '\.\w+\s*\(\s*\w*\s*\)' ,i):
            for port in re.findall( '\.\w+\s*\(\s*(?:\$signed\()*\w*(?:\))*\s*\)' ,i):
                tmp = re.match('\.(\w+)\s*\(\s*(?:\$signed\()*(\w*)(?:\))*\s*\)',port)
                port_name  = tmp.group(1)
                port_wire  = tmp.group(2)

                if port_name in mod_tmp['ins']:
                    modules[-1]['in_port'].append( port_name )
                    modules[-1]['in_wire'].append( port_wire )
                elif port_name in mod_tmp['outs']:
                    modules[-1]['out_port'].append( port_name )
                    modules[-1]['out_wire'].append( port_wire )
            print(mod_name)
            print('   ')




    #%%  PIDs
    filter_mod=[
     'i_muxer5_pidA',
     'i_lock_pid_block_A',
     'i_muxer5_pidB',
     'i_lock_pid_block_B']


    mods = [ y for y in filter( lambda x: x['instance'] in filter_mod , modules) ]



    from graphviz import Digraph


    dot = Digraph('ER',comment='verilog1')

    s1 = Digraph(comment='subgraph')
    s1.graph_attr.update(rank='same')

    s2 = Digraph(comment='subgraph')
    s2.graph_attr.update(rank='same')

    s3 = Digraph(comment='subgraph')
    s3.graph_attr.update(rank='same')

    s4 = Digraph(comment='subgraph')
    s4.graph_attr.update(rank='same')


    dot.graph_attr['rankdir'] = 'LR'
    #dot.graph_attr['splines'] = 'ortho'
    dot.graph_attr['nodesep'] = '0'
    dot.node_attr['shape']='record'

    for r in mods[0:4:2]:
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        s2.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )

    for r in mods[1:4:2]:
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        s4.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )

    dot.edge('i_muxer5_pidA:out','i_lock_pid_block_A:dat_i',minlen='3')
    dot.edge('i_muxer5_pidB:out','i_lock_pid_block_B:dat_i',minlen='3')

    r=[ y for y in filter(lambda x: x['instance']=='i_muxer5_pidA' , mods) ][0]
    for i,pp in enumerate(r['in_port']):
        s1.node( r['in_wire'][i]+'A',r['in_wire'][i] , shape='plaintext',fontsize='12',height='0',group='ins')
        dot.edge( r['in_wire'][i]+'A', 'i_muxer5_pidA:'+pp)

    r=[ y for y in filter(lambda x: x['instance']=='i_muxer5_pidB' , mods) ][0]
    for i,pp in enumerate(r['in_port']):
        s1.node( r['in_wire'][i]+'B',r['in_wire'][i] , shape='plaintext',fontsize='12',height='0',group='ins')
        dot.edge( r['in_wire'][i]+'B', 'i_muxer5_pidB:'+pp)


    r=[ y for y in filter(lambda x: x['instance']=='i_lock_pid_block_A' , mods) ][0]
    for i,pp in enumerate(r['in_port']):
        s2.node( r['in_wire'][i]+'A',r['in_wire'][i] , shape='plaintext',fontsize='12',height='0',group='in2')
        dot.edge( r['in_wire'][i]+'A', 'i_lock_pid_block_A:'+pp,minlen='1')




    dot.subgraph(s1)
    dot.subgraph(s2)
    dot.subgraph(s3)
    dot.subgraph(s4)


    dot.view()




#%%

#
#with open(APP+'/fpga/rtl/red_pitaya_top.v', 'r') as file:
#    aa=file.readlines()

with open(APP+'/fpga/rtl/lock.v', 'r') as file:
    aa=file.readlines()

aa=clean_comments(aa)



# print( aa  )


modules=[]

for i in aa.split(';' ):
    if bool(re.match( '\s*\w+\s+(?:#\s*\([^\s]*\)\s)?\s*\w+\s*\s*\(' ,i)):
        if re.match(  '\s*(\w+)\s+(?:#\s*\([^\s]*\)\s)?\s*\w+\s*\s*\(' ,i).group(1) in ['module', 'if', 'case', 'casez']:
            continue

        tmp = re.match( '\s*(\w+)\s+(?:#\s*\([^\s]*\)\s)?\s*(\w+)\s*\s*\(' ,i)
        mod_name  = tmp.group(1)
        inst_name = tmp.group(2)

        modules.append( {'module':   mod_name  ,
                         'instance': inst_name ,
                         'in_port': [] ,
                         'in_wire': [] ,
                         'out_port': [] ,
                         'out_wire': []   } )

        mod_tmp = get_mod_ports(mod_name)

        #for port in re.findall( '\.\w+\s*\(\s*\w*\s*\)' ,i):
        for port in re.findall( '\.\w+\s*\(\s*(?:\$signed\()*\w*(?:\))*\s*\)' ,i):
            tmp = re.match('\.(\w+)\s*\(\s*(?:\$signed\()*(\w*)(?:\))*\s*\)',port)
            port_name  = tmp.group(1)
            port_wire  = tmp.group(2)

            if port_name in mod_tmp['ins']:
                modules[-1]['in_port'].append( port_name )
                modules[-1]['in_wire'].append( port_wire )
            elif port_name in mod_tmp['outs']:
                modules[-1]['out_port'].append( port_name )
                modules[-1]['out_wire'].append( port_wire )
        print(mod_name)
        print('   ')







#%%  PIDs
filter_mod=[
 'i_muxer5_pidA',
 'i_muxer5_pidB',
 'i_lock_pid_block_A',
 'i_lock_pid_block_B']


mods = [ y for y in filter( lambda x: x['instance'] in filter_mod , modules) ]



from graphviz import Digraph


dot = Digraph('G',comment='verilog1')


dot.graph_attr['rankdir'] = 'LR'
#dot.graph_attr['splines'] = 'ortho'
dot.graph_attr['nodesep'] = '0'
dot.node_attr['shape']='record'

for ss in [Digraph('s1')]:
    for r in mods[0:2]:
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        ss.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )
        dot.subgraph(ss)

for ss in [Digraph('s3')]:
    for r in mods[2:4]:
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        ss.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )
        dot.subgraph(ss)

dot.edge('i_muxer5_pidA:out','i_lock_pid_block_A:dat_i',minlen='3')
dot.edge('i_muxer5_pidB:out','i_lock_pid_block_B:dat_i',minlen='3')

for ss in [Digraph('s0')]:
    r=[ y for y in filter(lambda x: x['instance']=='i_muxer5_pidA' , mods) ][0]
    for i,pp in enumerate(r['in_port']):
        ss.node( r['in_wire'][i]+'A',r['in_wire'][i] , shape='plaintext',fontsize='12',height='0',group='ins')
        dot.edge( r['in_wire'][i]+'A', 'i_muxer5_pidA:'+pp)

    r=[ y for y in filter(lambda x: x['instance']=='i_muxer5_pidB' , mods) ][0]
    for i,pp in enumerate(r['in_port']):
        ss.node( r['in_wire'][i]+'B',r['in_wire'][i] , shape='plaintext',fontsize='12',height='0',group='ins')
        dot.edge( r['in_wire'][i]+'B', 'i_muxer5_pidB:'+pp)
    dot.subgraph(ss)

for ss in [Digraph('s2')]:
    r=[ y for y in filter(lambda x: x['instance']=='i_lock_pid_block_A' , mods) ][0]
    for i,pp in enumerate(r['in_port']):
        if pp=='dat_i':
            continue
        ss.node( r['in_wire'][i]+'A',r['in_wire'][i] , shape='plaintext',fontsize='12',height='0',group='in2')
        dot.edge( r['in_wire'][i]+'A', 'i_lock_pid_block_A:'+pp,minlen='1')
    r=[ y for y in filter(lambda x: x['instance']=='i_lock_pid_block_B' , mods) ][0]
    for i,pp in enumerate(r['in_port']):
        if pp=='dat_i':
            continue
        ss.node( r['in_wire'][i]+'B',r['in_wire'][i] , shape='plaintext',fontsize='12',height='0',group='in2')
        dot.edge( r['in_wire'][i]+'B', 'i_lock_pid_block_B:'+pp,minlen='1')
    dot.subgraph(ss)


dot.view()




#%%  PIDs

def get_mods(names):
    if type(names)==str:
        names = names.split(',')
    return [ y for y in filter( lambda x: x['instance'] in names , modules) ]


from graphviz import Digraph


#dot = Digraph('G',comment='verilog1',format='svg')
dot = Digraph('G',comment='verilog1')


dot.graph_attr['rankdir'] = 'LR'
#dot.graph_attr['rankdir'] = 'TB'
#dot.graph_attr['splines'] = 'ortho'
dot.graph_attr['nodesep'] = '0'
dot.node_attr['shape']='record'


# gen_mod and dignal chooes
for ss in [Digraph('s1')]:
    for r in get_mods('i_gen_mod,muxer_signal_i'):
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        ss.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )
        dot.subgraph(ss)

for ss in [Digraph('s0')]:
    for r in get_mods('muxer_signal_i,i_gen_mod'):
        for i,pp in enumerate(r['in_port']):
            ss.node(  r['in_wire'][i] , r['in_wire'][i] , shape='plaintext',fontsize='12',height='0',group='ins')
            dot.edge( r['in_wire'][i] , r['instance']+':'+pp)
    dot.subgraph(ss)


for ss in [Digraph('s2')]:
    ss.node(  'node_signal_i' , 'signal_i', fontcolor='blue', shape='plaintext')
    dot.edge( 'muxer_signal_i:out', 'node_signal_i' ,  color='blue', arrowhead='none')
    dot.subgraph(ss)

# multipliers
col='red1,red2,red3,red4,orangered1,orangered2,orangered3,orangered4'.split(',')
col='red1,red4,darksalmon,lightsalmon,crimson,maroon,hotpink,indianred'.split(',')
for ss in [Digraph('s3')]:
    k=0
    for r in get_mods('i_mult_dps_sin_ref,i_mult_dps_cos_ref,i_mult_dps_sin_1f,i_mult_dps_sin_2f,i_mult_dps_sin_3f,i_sq_mult_sq_ref,i_sq_mult_sq_quad,i_sq_mult_sq_phas'):
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        ss.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )


        for i,pp in enumerate(r['in_port']):
            for src in get_mods('muxer_signal_i,i_gen_mod'):
                if r['in_wire'][i] in src['out_wire']:
                    ind=src['out_wire'].index(r['in_wire'][i])
                    if r['in_wire'][i]=='signal_i':
                        ss.node( r['instance']+pp+'_signal_i', "signal_i", shape='plaintext', fontcolor='blue' )
                        dot.edge( r['instance']+pp+'_signal_i' , r['instance']+':'+pp , color='blue')
                    else:
                        dot.edge( src['instance']+':'+src['out_port'][ind] , r['instance']+':'+pp , label=r['in_wire'][i], minlen='4', color=col[k])

        k+=1
    dot.subgraph(ss)



# lpf
for ss in [Digraph('s4')]:
    k=0
    for r in get_mods('i_LP_filter_sin_ref_A,i_LP_filter_cos_ref_A,i_LP_filter_sin_1f_A,i_LP_filter_sin_2f_A,i_LP_filter_sin_3f_A,i_LP_filter_sq_ref_A,i_LP_filter_sq_quad_A,i_LP_filter_sq_phas_A'):
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        ss.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )


        for i,pp in enumerate(r['in_port']):
            found=False
            for src in get_mods('i_mult_dps_sin_ref,i_mult_dps_cos_ref,i_mult_dps_sin_1f,i_mult_dps_sin_2f,i_mult_dps_sin_3f,i_sq_mult_sq_ref,i_sq_mult_sq_quad,i_sq_mult_sq_phas'):
                if r['in_wire'][i] in src['out_wire']:
                    ind=src['out_wire'].index(r['in_wire'][i])
                    dot.edge( src['instance']+':'+src['out_port'][ind] , r['instance']+':'+pp , label=r['in_wire'][i], minlen='4', color=col[k])
                    found=True
                elif r['in_wire'][i]+'14' in src['out_wire']:
                    ind=src['out_wire'].index(r['in_wire'][i]+'14')
                    dot.edge( src['instance']+':'+src['out_port'][ind] , r['instance']+':'+pp , label=r['in_wire'][i], minlen='4', color=col[k])
                    found=True

            if not found:
                ss.node( r['instance']+r['in_wire'][i], r['in_wire'][i] , shape='plaintext')
                dot.edge( r['instance']+r['in_wire'][i] , r['instance']+':'+pp )

        k+=1
    dot.subgraph(ss)




# lpf2
for ss in [Digraph('s5')]:
    k=0
    for r in get_mods('i_LP_filter_sin_ref_B,i_LP_filter_cos_ref_B,i_LP_filter_sin_1f_B,i_LP_filter_sin_2f_B,i_LP_filter_sin_3f_B,i_LP_filter_sq_ref_B,i_LP_filter_sq_quad_B,i_LP_filter_sq_phas_B'):
        mod_name = r['module']
        mod_inst = r['instance']
        name=mod_name+'\\n('+mod_inst+')'
        print(name)
        inp = '|'.join([ '<'+y+'>'+y for y in r['in_port'] ])
        out = '|'.join([ '<'+y+'>'+y for y in r['out_port'] ])
        ss.node(r['instance'], "{ { "+inp+" }| "+name+" |{"+out+"} }" )


        for i,pp in enumerate(r['in_port']):
            found=False
            for src in get_mods('i_LP_filter_sin_ref_A,i_LP_filter_cos_ref_A,i_LP_filter_sin_1f_A,i_LP_filter_sin_2f_A,i_LP_filter_sin_3f_A,i_LP_filter_sq_ref_A,i_LP_filter_sq_quad_A,i_LP_filter_sq_phas_A'):
                if r['in_wire'][i] in src['out_wire']:
                    ind=src['out_wire'].index(r['in_wire'][i])
                    dot.edge( src['instance']+':'+src['out_port'][ind] , r['instance']+':'+pp , label=r['in_wire'][i], minlen='4', color=col[k])
                    found=True
                elif r['in_wire'][i]+'14' in src['out_wire']:
                    ind=src['out_wire'].index(r['in_wire'][i]+'14')
                    dot.edge( src['instance']+':'+src['out_port'][ind] , r['instance']+':'+pp , label=r['in_wire'][i], minlen='4', color=col[k])
                    found=True

            if not found:
                ss.node( r['instance']+r['in_wire'][i], r['in_wire'][i] , shape='plaintext')
                dot.edge( r['instance']+r['in_wire'][i] , r['instance']+':'+pp )

        k+=1
    dot.subgraph(ss)

# lpf2
for ss in [Digraph('s6')]:
    nodes= [['Xo_37','sin_ref_lpf2','sg_amp1'],
            ['Yo_37','cos_ref_lpf2','sg_amp1'],
            ['F1_37','sin_1f_lpf2','sg_amp1'],
            ['F2_37','sin_2f_lpf2','sg_amp2'],
            ['F3_37','sin_3f_lpf2','sg_amp3'],
            ['sqx_37','sq_ref_lpf2','sg_amp_sq'],
            ['sqy_37','sq_quad_lpf2','sg_amp_sq'],
            ['sqf_37','sq_phas_lpf2','sg_amp_sq']]
    k=0
    for nn in nodes:
        ss.node( nn[2]+nn[0] , label=nn[1]+'\<\<\<'+nn[2] )
        ss.node( nn[0] , label=nn[0] , shape='plaintext' )
        for src in get_mods('i_LP_filter_sin_ref_B,i_LP_filter_cos_ref_B,i_LP_filter_sin_1f_B,i_LP_filter_sin_2f_B,i_LP_filter_sin_3f_B,i_LP_filter_sq_ref_B,i_LP_filter_sq_quad_B,i_LP_filter_sq_phas_B'):
            if nn[1] in src['out_wire']:
                ind=src['out_wire'].index(nn[1])
                dot.edge( src['instance']+':'+src['out_port'][ind] , nn[2]+nn[0] , label=nn[1], minlen='2', color=col[k])
                dot.edge( nn[2]+nn[0] , nn[0] , minlen='1', color=col[k])
        k+=1
    dot.subgraph(ss)







dot.view()








#%%
[ 'i_satprotect_ctrl_A',
 'i_satprotect_ctrl_B',
 'i_muxer5_scope1',
 'i_muxer5_scope2',
 'i_trigger_input',
 'out1_sw_m',
 'out2_sw_m',
 'i_mult_slow_out3_aux',
 'i_mult_slow_out4_aux',
 'slow_out3_sw_m',
 'slow_out4_sw_m',
 'i_sat15_in1in2',

 ,
 'i_gen_scan',
 'i_muxer4_lock_trig_sw',
 'i_lock_ctrl',
 'muxer3_rl_signal_sw',
 'i_debounce_out_of_lock',

 'i_LP_filter_sin_ref_A',
 'i_LP_filter_cos_ref_A',
 'i_LP_filter_sin_1f_A',
 'i_LP_filter_sin_2f_A',
 'i_LP_filter_sin_3f_A',
 'i_LP_filter_sq_ref_A',
 'i_LP_filter_sq_quad_A',
 'i_LP_filter_sq_phas_A',
 'i_LP_filter_sin_ref_B',
 'i_LP_filter_cos_ref_B',
 'i_LP_filter_sin_1f_B',
 'i_LP_filter_sin_2f_B',
 'i_LP_filter_sin_3f_B',
 'i_LP_filter_sq_ref_B',
 'i_LP_filter_sq_quad_B',
 'i_LP_filter_sq_phas_B',
 'i_satprotect_Xo_37',
 'i_satprotect_Yo_37',
 'i_satprotect_F1_37',
 'i_satprotect_F2_37',
 'i_satprotect_F3_37',
 'i_satprotect_sqx_37',
 'i_satprotect_sqy_37',
 'i_satprotect_sqf_37',
 'i_satprotect_Xo',
 'i_satprotect_Yo',
 'i_satprotect_F1',
 'i_satprotect_F2',
 'i_satprotect_F3',
 'i_satprotect_sqx',
 'i_satprotect_sqy',
 'i_satprotect_sqf',
 'i_muxer5_pidA',
 'i_lock_pid_block_A',
 'i_muxer5_pidB',
 'i_lock_pid_block_B']
