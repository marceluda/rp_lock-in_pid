#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Module for lock-in+pid control
"""


from time import sleep
import mmap
import sys

import struct

#%%

class fpga_reg():
    """Register for FPGA module"""
    def __init__(self, name,index,nbits=32,signed=False,rw=True,base_addr=0x40600000,dev_file="/dev/mem"):
        """Initialize attributes."""
        self.name        = name
        self.rw          = rw
        self.ro          = not rw
        self.nbits       = nbits
        self.index       = index
        self.addr        = index*4
        self.base_addr   = base_addr
        self.signed      = signed
        self.dev_file    = dev_file

    def __getitem__(self, key): # This lets you use [] for attributes
        return getattr(self,key)

    def __str__(self):
        return '{:s}(addr:{:d})'.format(self.name,self.addr)

    def val(self,value=None):
        with open(self.dev_file, "r+b") as dev:
            mem = mmap.mmap(dev.fileno(), 512, offset=self.base_addr)
            if type(value)==int and self.rw:
                mem[self.addr:self.addr+4]=( value ).to_bytes(4, byteorder='little' , signed=self.signed )
            return int.from_bytes(mem[self.addr:self.addr+4], byteorder='little', signed=self.signed )

    def read(self):
        with open(self.dev_file, "rb") as dev:
            mem = mmap.mmap(dev.fileno(), 512, offset=self.base_addr)
            return int.from_bytes(mem[self.addr:self.addr+4], byteorder='little', signed=self.signed)


class fpga_regs():
    """Register for FPGA module"""
    def __init__(self, base_addr=0x40600000,dev_file="/dev/mem"):
        """Initialize attributes."""
        self.base_addr   = base_addr
        self.dev_file    = dev_file
        self.regs        = []

    def add(self,reg):
        if reg.name in [y.name for y in self.regs ]:
            print('name already exist')
        else:
            reg.base_addr = self.base_addr
            reg.dev_file  = self.dev_file
            self.regs.append(reg)
        self.N        = len(self.regs)
        self.max_name = max([len(y.name) for y in self.regs ])

    def __getitem__(self, key):
        if type(key)==int:
            return self.regs[key]
        if type(key)==str:
            return self.regs[ [y.name for y in self.regs ].index(key) ]
        if type(key)==slice:
            return self.regs[key]

    def names(self):
        return [y.name for y in self.regs ]

    def show(self,key=None):
        ss='{:<'+str(self.max_name)+'s}: {:>10d}'
        if type(key)==int or type(key)==str:
            r=self[key]
            print(ss.format( r.name , r.val() ))
        else:
            for r in self.regs:
                print(ss.format( r.name , r.val() ))




#Trigger source:
#1-trig immediately
#2-ch A threshold positive edge
#3-ch A threshold negative edge
#4-ch B threshold positive edge
#5-ch B threshold negative edge
#6-external trigger positive edge - DIO0_P pin
#7-external trigger negative edge
#8-arbitrary wave generator application positive edge
#9-arbitrary wave generator application negative edge


class fpga_osc(fpga_regs):
    def __init__(self, base_addr=0x40100000,dev_file="/dev/mem"):
        fpga_regs.__init__(self, base_addr)
        self.type  = 'oscilloscoe'
        self.trigVal = 0
        self.trigTh  = 0
        self.chA     = [0]*16*1024
        self.chB     = [0]*16*1024
        self.ptr     = 0
        self.trg_ptr = 0

    def dec(self,num=None):
        if type(num)==int:
            if not (num in [1,8,64,1024,8192,65536] ):
                print('Error: dec should be: [1,8,64,1024,8192,65536]')
            else:
                self['Dec'].val(num)
        return self['Dec'].val()

    def trig_threshold(self,val=None):
        if type(val)==int:
            self.trigTh=val
        return self.trigTh

    def trig_ChA_rise(self,val=None):
        self.trigVal=2
        self.trig_threshold(val)
    def trig_ChA_fall(self,val=None):
        self.trigVal=3
        self.trig_threshold(val)
    def trig_ChB_rise(self,val=None):
        self.trigVal=4
        self.trig_threshold(val)
    def trig_ChB_fall(self,val=None):
        self.trigVal=5
        self.trig_threshold(val)
    def trig_now(self):
        self.trigVal=1
    def trig_ext(self):
        self.trigVal=6

    def get_chs(self):
        self.ptr     = self['CurWpt'].val()+1
        self.trg_ptr = self['TrgWpt'].val()
        with open("/dev/mem", "r+b") as ff:
            # Get ChA
            mem = mmap.mmap(ff.fileno(), mmap.PAGESIZE*1024*32, offset=0x40110000)
            for i in range(2**14):
                C=int.from_bytes(mem.read(4), byteorder='little', signed=False)
                self.chA[i]= ( -1 * ( (C^16383) +1 )  ) if (C & 0x2000 ) else C
            mem.close()
            # Get ChB
            mem = mmap.mmap(ff.fileno(), mmap.PAGESIZE*1024*32, offset=0x40120000)
            for i in range(2**14):
                C=int.from_bytes(mem.read(4), byteorder='little', signed=False)
                self.chB[i]= ( -1 * ( (C^16383) +1 )  ) if (C & 0x2000 ) else C
            mem.close()
            self.chA = self.chA[self.ptr:16384] + self.chA[0:self.ptr]
            self.chB = self.chB[self.ptr:16384] + self.chB[0:self.ptr]
        return True

    def get_curves(self,binary=False):
        self.get_chs()
        out=[]
        if binary:
            out=b''
            for i in range(16*1024):
                ss=struct.Struct('!hh')
                out+=ss.pack(self.chA[i],self.chB[i])
        else:
            for i in range(16*1024):
                out.append("{:05d},{:5d},{:5d}".format(i,self.chA[i],self.chB[i]))
            out.append('')
            out='\n'.join(out)
        return out

    def reset(self):
        self['conf'].val( 2 )

    def start_trigger(self):
        self['TrgSrc'].val(self.trigVal)

    def set_dec(self,dec):
        if int(dec) in [0,1,8,64,1024,8192,65536]:
            self['Dec'].val(int(dec))
            return True
        else:
            return False





osc=fpga_osc(base_addr=0x40100000)

osc.add( fpga_reg(name='conf'     ,index=0 ,rw=True,nbits= 4,signed=False) )
osc.add( fpga_reg(name='TrgSrc'   ,index=1 ,rw=True,nbits= 4,signed=False) )
osc.add( fpga_reg(name='ChAth'    ,index=2 ,rw=True,nbits=14,signed=True ) )
osc.add( fpga_reg(name='ChBth'    ,index=3 ,rw=True,nbits=14,signed=True ) )
osc.add( fpga_reg(name='TrgDelay' ,index=4 ,rw=True,nbits=32,signed=False) )
osc.add( fpga_reg(name='Dec'      ,index=5 ,rw=True,nbits=17,signed=False) )
osc.add( fpga_reg(name='CurWpt'   ,index=6 ,rw=True,nbits=14,signed=False) )
osc.add( fpga_reg(name='TrgWpt'   ,index=7 ,rw=True,nbits=14,signed=False) )
osc.add( fpga_reg(name='ChAHys'   ,index=8 ,rw=True,nbits=14,signed=False) )
osc.add( fpga_reg(name='ChBHys'   ,index=9 ,rw=True,nbits=14,signed=False) )
osc.add( fpga_reg(name='AvgEn'    ,index=10,rw=True,nbits= 1,signed=False) )
osc.add( fpga_reg(name='PreTrgCnt',index=11,rw=True,nbits=32,signed=False) )
osc.add( fpga_reg(name='ChAEqFil1',index=12,rw=True,nbits=18,signed=False) )
osc.add( fpga_reg(name='ChAEqFil2',index=13,rw=True,nbits=25,signed=False) )
osc.add( fpga_reg(name='ChAEqFil3',index=14,rw=True,nbits=25,signed=False) )
osc.add( fpga_reg(name='ChAEqFil4',index=15,rw=True,nbits=25,signed=False) )
osc.add( fpga_reg(name='ChBEqFil1',index=16,rw=True,nbits=18,signed=False) )
osc.add( fpga_reg(name='ChBEqFil2',index=17,rw=True,nbits=25,signed=False) )
osc.add( fpga_reg(name='ChBEqFil3',index=18,rw=True,nbits=25,signed=False) )
osc.add( fpga_reg(name='ChBEqFil4',index=19,rw=True,nbits=25,signed=False) )


class fpga_lock_in(fpga_regs):
    def __init__(self, base_addr=0x40600000,dev_file="/dev/mem"):
        fpga_regs.__init__(self, base_addr)
        self.type  = 'lock-in'
    def read(self):
        return self.type

    def freeze(self):
        val  = self['read_ctrl'].val()
        self['read_ctrl'].val(  val | 1 )
    def unfreeze(self):
        val  = self['read_ctrl'].val()
        self['read_ctrl'].val(  val & 6 )
    def start_clk(self):
        val  = self['read_ctrl'].val()
        self['read_ctrl'].val(  val | 2  )
    def stop_clk(self):
        val  = self['read_ctrl'].val()
        self['read_ctrl'].val(  val & 5  )


# The following code can be printed from config_tool.py
# f.print_hugo()

# [REGSET DOCK]
li = fpga_lock_in(base_addr=0x40600000,dev_file="/dev/mem")

li.add( fpga_reg(name='oscA_sw'            , index=  0, rw=True , nbits= 5,signed=False) )
li.add( fpga_reg(name='oscB_sw'            , index=  1, rw=True , nbits= 5,signed=False) )
li.add( fpga_reg(name='osc_ctrl'           , index=  2, rw=True , nbits= 2,signed=False) )
li.add( fpga_reg(name='trig_sw'            , index=  3, rw=True , nbits= 8,signed=False) )
li.add( fpga_reg(name='out1_sw'            , index=  4, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='out2_sw'            , index=  5, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='slow_out1_sw'       , index=  6, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='slow_out2_sw'       , index=  7, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='slow_out3_sw'       , index=  8, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='slow_out4_sw'       , index=  9, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='lock_control'       , index= 10, rw=True , nbits=11,signed=False) )
li.add( fpga_reg(name='lock_feedback'      , index= 11, rw=False, nbits=11,signed=False) )
li.add( fpga_reg(name='lock_trig_val'      , index= 12, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='lock_trig_time'     , index= 13, rw=True , nbits=32,signed=False) )
li.add( fpga_reg(name='lock_trig_sw'       , index= 14, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='rl_error_threshold' , index= 15, rw=True , nbits=13,signed=False) )
li.add( fpga_reg(name='rl_signal_sw'       , index= 16, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='rl_signal_threshold', index= 17, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='rl_config'          , index= 18, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='rl_state'           , index= 19, rw=False, nbits= 5,signed=False) )
li.add( fpga_reg(name='sf_jumpA'           , index= 20, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='sf_jumpB'           , index= 21, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='sf_config'          , index= 22, rw=True , nbits= 5,signed=False) )
li.add( fpga_reg(name='signal_sw'          , index= 23, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='signal_i'           , index= 24, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='sg_amp1'            , index= 25, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='sg_amp2'            , index= 26, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='sg_amp3'            , index= 27, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='sg_amp_sq'          , index= 28, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='lpf_F1'             , index= 29, rw=True , nbits= 6,signed=False) )
li.add( fpga_reg(name='lpf_F2'             , index= 30, rw=True , nbits= 6,signed=False) )
li.add( fpga_reg(name='lpf_F3'             , index= 31, rw=True , nbits= 6,signed=False) )
li.add( fpga_reg(name='lpf_sq'             , index= 32, rw=True , nbits= 6,signed=False) )
li.add( fpga_reg(name='error_sw'           , index= 33, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='error_offset'       , index= 34, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='error'              , index= 35, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='error_mean'         , index= 36, rw=False, nbits=32,signed=True ) )
li.add( fpga_reg(name='error_std'          , index= 37, rw=False, nbits=32,signed=True ) )
li.add( fpga_reg(name='gen_mod_phase'      , index= 38, rw=True , nbits=12,signed=False) )
li.add( fpga_reg(name='gen_mod_phase_sq'   , index= 39, rw=True , nbits=32,signed=False) )
li.add( fpga_reg(name='gen_mod_hp'         , index= 40, rw=True , nbits=14,signed=False) )
li.add( fpga_reg(name='gen_mod_sqp'        , index= 41, rw=True , nbits=32,signed=False) )
li.add( fpga_reg(name='ramp_A'             , index= 42, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='ramp_B'             , index= 43, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='ramp_step'          , index= 44, rw=True , nbits=32,signed=False) )
li.add( fpga_reg(name='ramp_low_lim'       , index= 45, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='ramp_hig_lim'       , index= 46, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='ramp_reset'         , index= 47, rw=True , nbits= 1,signed=False) )
li.add( fpga_reg(name='ramp_enable'        , index= 48, rw=True , nbits= 1,signed=False) )
li.add( fpga_reg(name='ramp_direction'     , index= 49, rw=True , nbits= 1,signed=False) )
li.add( fpga_reg(name='ramp_B_factor'      , index= 50, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='sin_ref'            , index= 51, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='cos_ref'            , index= 52, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='cos_1f'             , index= 53, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='cos_2f'             , index= 54, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='cos_3f'             , index= 55, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='sq_ref_b'           , index= 56, rw=False, nbits= 1,signed=False) )
li.add( fpga_reg(name='sq_quad_b'          , index= 57, rw=False, nbits= 1,signed=False) )
li.add( fpga_reg(name='sq_phas_b'          , index= 58, rw=False, nbits= 1,signed=False) )
li.add( fpga_reg(name='sq_ref'             , index= 59, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='sq_quad'            , index= 60, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='sq_phas'            , index= 61, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='in1'                , index= 62, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='in2'                , index= 63, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='out1'               , index= 64, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='out2'               , index= 65, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='slow_out1'          , index= 66, rw=False, nbits=12,signed=False) )
li.add( fpga_reg(name='slow_out2'          , index= 67, rw=False, nbits=12,signed=False) )
li.add( fpga_reg(name='slow_out3'          , index= 68, rw=False, nbits=12,signed=False) )
li.add( fpga_reg(name='slow_out4'          , index= 69, rw=False, nbits=12,signed=False) )
li.add( fpga_reg(name='oscA'               , index= 70, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='oscB'               , index= 71, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='X_28'               , index= 72, rw=False, nbits=28,signed=True ) )
li.add( fpga_reg(name='Y_28'               , index= 73, rw=False, nbits=28,signed=True ) )
li.add( fpga_reg(name='F1_28'              , index= 74, rw=False, nbits=28,signed=True ) )
li.add( fpga_reg(name='F2_28'              , index= 75, rw=False, nbits=28,signed=True ) )
li.add( fpga_reg(name='F3_28'              , index= 76, rw=False, nbits=28,signed=True ) )
li.add( fpga_reg(name='sqX_28'             , index= 77, rw=False, nbits=28,signed=True ) )
li.add( fpga_reg(name='sqY_28'             , index= 78, rw=False, nbits=28,signed=True ) )
li.add( fpga_reg(name='sqF_28'             , index= 79, rw=False, nbits=28,signed=True ) )
li.add( fpga_reg(name='cnt_clk'            , index= 80, rw=False, nbits=32,signed=False) )
li.add( fpga_reg(name='cnt_clk2'           , index= 81, rw=False, nbits=32,signed=False) )
li.add( fpga_reg(name='read_ctrl'          , index= 82, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='pidA_sw'            , index= 83, rw=True , nbits= 5,signed=False) )
li.add( fpga_reg(name='pidA_PSR'           , index= 84, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='pidA_ISR'           , index= 85, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='pidA_DSR'           , index= 86, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='pidA_SAT'           , index= 87, rw=True , nbits=14,signed=False) )
li.add( fpga_reg(name='pidA_sp'            , index= 88, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='pidA_kp'            , index= 89, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='pidA_ki'            , index= 90, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='pidA_kd'            , index= 91, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='pidA_in'            , index= 92, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='pidA_out'           , index= 93, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='pidA_ctrl'          , index= 94, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='ctrl_A'             , index= 95, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='pidB_sw'            , index= 96, rw=True , nbits= 5,signed=False) )
li.add( fpga_reg(name='pidB_PSR'           , index= 97, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='pidB_ISR'           , index= 98, rw=True , nbits= 4,signed=False) )
li.add( fpga_reg(name='pidB_DSR'           , index= 99, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='pidB_SAT'           , index=100, rw=True , nbits=14,signed=False) )
li.add( fpga_reg(name='pidB_sp'            , index=101, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='pidB_kp'            , index=102, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='pidB_ki'            , index=103, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='pidB_kd'            , index=104, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='pidB_in'            , index=105, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='pidB_out'           , index=106, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='pidB_ctrl'          , index=107, rw=True , nbits= 3,signed=False) )
li.add( fpga_reg(name='ctrl_B'             , index=108, rw=False, nbits=14,signed=True ) )
li.add( fpga_reg(name='aux_A'              , index=109, rw=True , nbits=14,signed=True ) )
li.add( fpga_reg(name='aux_B'              , index=110, rw=True , nbits=14,signed=True ) )
# [REGSET DOCK END]













#%%

if __name__ == '__main__':

    li.show()
    #print('---------')

    #print(osc.get_curves(True))

    #print(osc.chA[0:10])
    #osc.show()


    #%%

    if False:
        max([len(y.name) for y in f])
        ss="li.add( fpga_reg(name={:<21s}, index={:>3d}, rw={:<5s}, nbits={:>2d},signed={:<5s}) )"
        for r in f:
            print(ss.format( "'"+r.name+"'", r.index, str(r.rw) , r.nbits ,  str(r.signed) ))
