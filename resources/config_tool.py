#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
The purpose of this script is to keep traking of the comunication between
layers in the APP.

The circuit physical layer in the FPGA has registers whose values are
related with OS memory addresses, used by C controller variables.
The C controller variables are updated by HTML form fields.

So, to ease the HTML form fields <--> C variables <--> FPGA registers
consistensy whe making changes on the APP, this script stores all the logic
and print it avery time you run it.

To understan changes made, on each run the script moves the modified files to
filename.ext ---> filename_YYYYMMDD_HHmmss.ext (date format)

"""

try:
    from numpy import *
except ModuleNotFoundError:
    print('You need to install `numpy` module for python. Try one of these:')
    print('  - apt install python3-numpy')
    print('  - pip3 search numpy')
    exit(0)



import os
import enum

PWD = os.environ['PWD']

if PWD.find('rp_lock-in_pid')>0:
    folder = PWD[:PWD.find('rp_lock-in_pid')+len('rp_lock-in_pid')]

APP='lock_in+pid'

do_verilog = True
do_main    = True
do_html    = True
do_py      = True

#folder=''
#folder='/home/lolo/Dropbox/Doctorado/github/rp_lock-in_pid'


#%%


class fpga_register():
    """Register for FPGA module"""
    def __init__(self, name, val=0, rw=True,  nbits=14, min_val=0, max_val=0, desc='todo', signed=False, fpga_update=True ,index=0, group='mix'):
        """Initialize attributes."""
        self.name        = name
        self.val         = val
        self.rw          = rw
        self.ro          = not rw
        self.nbits       = nbits
        self.index       = index
        self.i           = index
        self.pos         = index*4
        self.addr        = "20'h{:05X}".format(index*4)
        if min_val==0 and max_val==0:
            self.min     =   - 2**(nbits-1) if signed else  0
            self.min     =     2**(nbits-1) if signed else  2**nbits -1
        else:
            self.min         = min_val
            self.max         = max_val
        self.desc        = desc
        self.fpga_update = fpga_update
        self.signed      = signed
        self.group       = group
        self.write_def   = True
        self.c_update    = None
        self.main_reg    = None
        self.reg_read    = False

    def __getitem__(self, key):
        return getattr(self,key)



class fpga_registers():
    def __init__(self):
        self.data  = []
        self.names = []
        self.len   = 0
    def __getitem__(self, key):
        if type(key)==int:
            return self.data[key]
        if type(key)==str:
            return self.data[self.names.index(key)]
        if type(key)==slice:
            return self.data[key]

    def add(self, name, val=0, rw=True,  nbits=14, min_val=0, max_val=0, signed=False, desc='todo',fpga_update=True, group='mix'):
        self.data.append(fpga_register(name=name, val=val, rw=rw, nbits=nbits, group=group,
                                       min_val=min_val, max_val=max_val, signed=signed,
                                       desc=desc, fpga_update=fpga_update , index=self.len ))
        self.names.append(name)
        self.len = len(self.names)

    def print_hugo(self,ret=False):
        txt=''
        txt+='li = fpga_lock_in(base_addr=0x40600000,dev_file="/dev/mem")\n'
        txt+='\n'
        for r in self:
            txt+="li.add( fpga_reg(name={:21s}, index={:3d}, rw={:5s}, nbits={:2d},signed={:5s}) )\n".format(
                    "'"+r.name+"'" , r.index , str(r.rw) , r.nbits , str(r.signed) )
        if ret:
            return txt
        else:
            print(txt)


f = fpga_registers()

# Oscilloscope
grp='scope'
f.add( name="oscA_sw"            , group=grp , val=    1, rw=True ,  nbits= 5, min_val=          0, max_val=         31, fpga_update=True , signed=False, desc="switch for muxer oscA" )
f.add( name="oscB_sw"            , group=grp , val=    2, rw=True ,  nbits= 5, min_val=          0, max_val=         31, fpga_update=True , signed=False, desc="switch for muxer oscB" )
f.add( name="osc_ctrl"           , group=grp , val=    3, rw=True ,  nbits= 2, min_val=          0, max_val= 4294967295, fpga_update=True , signed=False, desc="oscilloscope control\n[osc2_filt_off,osc1_filt_off]" )
f.add( name="trig_sw"            , group=grp , val=    0, rw=True ,  nbits= 8, min_val=          0, max_val=        255, fpga_update=True , signed=False, desc="Select the external trigger signal" )


# Outputs
grp='outputs'
f.add( name="out1_sw"            , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="switch for muxer out1" )
f.add( name="out2_sw"            , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="switch for muxer out2" )
f.add( name="slow_out1_sw"       , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="switch for muxer slow_out1" )
f.add( name="slow_out2_sw"       , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="switch for muxer slow_out2" )
f.add( name="slow_out3_sw"       , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="switch for muxer slow_out3" )
f.add( name="slow_out4_sw"       , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="switch for muxer slow_out4" )

# Lock control
grp='lock_control'
f.add( name="lock_control"       , group=grp , val= 1148, rw=True ,  nbits=11, min_val=          0, max_val=       2047, fpga_update=True , signed=False, desc="lock_control help" )
f.add( name="lock_feedback"      , group=grp , val= 1148, rw=False,  nbits=11, min_val=          0, max_val=       2047, fpga_update=True , signed=False, desc="lock_control feedback" )
f.add( name="lock_trig_val"      , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="if lock_control ?? , this vals sets the voltage threshold that turns on the lock" )
f.add( name="lock_trig_time"     , group=grp , val=    0, rw=True ,  nbits=32, min_val=          0, max_val= 4294967295, fpga_update=True , signed=False, desc="if lock_control ?? , this vals sets the time threshold that turns on the lock" )
f.add( name="lock_trig_sw"       , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="selects signal for trigger" )

f.add( name="rl_error_threshold" , group=grp , val=    0, rw=True ,  nbits=13, min_val=          0, max_val=       8191, fpga_update=True , signed=False, desc="Threshold for error signal. Launchs relock when |error| > rl_error_threshold" )
f.add( name="rl_signal_sw"       , group=grp , val=    0, rw=True ,  nbits= 3, min_val=          0, max_val=          7, fpga_update=True , signed=False, desc="selects signal for relock trigger" )
f.add( name="rl_signal_threshold", group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="Threshold for signal. Launchs relock when signal < rl_signal_threshold" )
f.add( name="rl_config"          , group=grp , val=    0, rw=True ,  nbits= 3, min_val=          0, max_val=          7, fpga_update=True , signed=False, desc="Relock enable. [relock_reset,enable_signal_th,enable_error_th] " )
f.add( name="rl_state"           , group=grp , val=    0, rw=False,  nbits= 5, min_val=          0, max_val=         31, fpga_update=False, signed=False, desc="Relock state: [state:idle|searching|failed,signal_fail,error_fail,locked] " )

f.add( name="sf_jumpA"           , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="Step function measure jump value for ctrl_A" )
f.add( name="sf_jumpB"           , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="Step function measure jump value for ctrl_B" )
#f.add( name="sf_jump"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="Step function measure jump value" )
f.add( name="sf_config"          , group=grp , val=    0, rw=True ,  nbits= 5, min_val=          0, max_val=         31, fpga_update=True , signed=False, desc="Step function configuration. [pidB_ifreeze,pidB_freeze,pidA_ifreeze,pidA_freeze,start] " )

# Lock-in control
grp='lock-in'
f.add( name="signal_sw"          , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="Input selector for signal_i" )
f.add( name="signal_i"           , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=False, signed=True , desc="signal for demodulation" )
f.add( name="sg_amp1"            , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="amplification of Xo, Yo and F1o" )
f.add( name="sg_amp2"            , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="amplification of F2o" )
f.add( name="sg_amp3"            , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="amplification of F3o" )
f.add( name="sg_amp_sq"          , group=grp , val=    0, rw=True ,  nbits= 4, min_val=          0, max_val=         15, fpga_update=True , signed=False, desc="amplification of SQo" )

f.add( name="lpf_F1"             , group=grp , val=   32, rw=True ,  nbits= 6, min_val=          0, max_val=         63, fpga_update=True , signed=False, desc="Low Pass Filter of X, Y and F1" )
f.add( name="lpf_F2"             , group=grp , val=   32, rw=True ,  nbits= 6, min_val=          0, max_val=         63, fpga_update=True , signed=False, desc="Low Pass Filter of F2" )
f.add( name="lpf_F3"             , group=grp , val=   32, rw=True ,  nbits= 6, min_val=          0, max_val=         63, fpga_update=True , signed=False, desc="Low Pass Filter of F3" )
f.add( name="lpf_sq"             , group=grp , val=   32, rw=True ,  nbits= 6, min_val=          0, max_val=         63, fpga_update=True , signed=False, desc="Low Pass Filter of SQ" )

f.add( name="error_sw"           , group=grp , val=    0, rw=True ,  nbits= 3, min_val=          0, max_val=          7, fpga_update=True , signed=False, desc="select error signal" )
f.add( name="error_offset"       , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="offset for the error signal" )
f.add( name="error"              , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=False, signed=True , desc="error signal value" )
f.add( name="error_mean"         , group=grp , val=    0, rw=False,  nbits=32, min_val=-2147483648, max_val= 2147483647, fpga_update=False, signed=True , desc="1 sec error mean val" )
f.add( name="error_std"          , group=grp , val=    0, rw=False,  nbits=32, min_val=-2147483648, max_val= 2147483647, fpga_update=False, signed=True , desc="1 sec error square sum val" )
#f.add( name="error_abs"          , group=grp , val=    0, rw=False,  nbits=13, min_val=          0, max_val=       8191, fpga_update=False, signed=True , desc="error absolute value" )

# Modulation Generator
grp='gen_mod'
f.add( name="gen_mod_phase"      , group=grp , val=    0, rw=True ,  nbits=12, min_val=          0, max_val=       2519, fpga_update=True , signed=False, desc="phase relation of cos_?f signals" )
f.add( name="gen_mod_phase_sq"   , group=grp , val=    0, rw=True ,  nbits=32, min_val=          0, max_val= 4294967295, fpga_update=True , signed=False, desc="phase relation of sqf signal" )
f.add( name="gen_mod_hp"         , group=grp , val=    0, rw=True ,  nbits=14, min_val=          0, max_val=      16383, fpga_update=True , signed=False, desc="harmonic period set" )
f.add( name="gen_mod_sqp"        , group=grp , val=    0, rw=True ,  nbits=32, min_val=          0, max_val= 4294967295, fpga_update=True , signed=False, desc="square signal period" )

# Ramp control
grp='gen_ramp'
f.add( name="ramp_A"             , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="ramp signal A" )
f.add( name="ramp_B"             , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="ramp signal B" )
f.add( name="ramp_step"          , group=grp , val=    0, rw=True ,  nbits=32, min_val=          0, max_val= 4294967295, fpga_update=True , signed=False, desc="period of the triangular ramp signal" )
f.add( name="ramp_low_lim"       , group=grp , val=-5000, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="ramp low limit" )
f.add( name="ramp_hig_lim"       , group=grp , val= 5000, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="ramp high limit" )
f.add( name="ramp_reset"         , group=grp , val=    0, rw=True ,  nbits= 1, min_val=          0, max_val=          1, fpga_update=True , signed=False, desc="ramp reset config" )
f.add( name="ramp_enable"        , group=grp , val=    0, rw=True ,  nbits= 1, min_val=          0, max_val=          1, fpga_update=True , signed=False, desc="ramp enable/disable switch" )
f.add( name="ramp_direction"     , group=grp , val=    0, rw=True ,  nbits= 1, min_val=          0, max_val=          1, fpga_update=True , signed=False, desc="ramp starting direction (up/down)" )
f.add( name="ramp_B_factor"      , group=grp , val= 4096, rw=True ,  nbits=14, min_val=      -4096, max_val=       4096, fpga_update=True , signed=True , desc="proportional factor ramp_A/ramp_B.\nramp_B=ramp_A*ramp_B_factor/4096" )


# Modulation Signals
grp='modulation'
f.add( name="sin_ref"            , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="lock-in modulation sinus harmonic reference" )
f.add( name="cos_ref"            , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="lock-in modulation cosinus harmonic reference" )
f.add( name="cos_1f"             , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="lock-in modulation sinus harmonic signal with phase relation to reference" )
f.add( name="cos_2f"             , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="lock-in modulation sinus harmonic signal with phase relation to reference and double frequency" )
f.add( name="cos_3f"             , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="lock-in modulation sinus harmonic signal with phase relation to reference and triple frequency" )
f.add( name="sq_ref_b"           , group=grp , val=    0, rw=False,  nbits= 1, min_val=          0, max_val=          1, fpga_update=True , signed=False, desc="lock-in modulation binary reference" )
f.add( name="sq_quad_b"          , group=grp , val=    0, rw=False,  nbits= 1, min_val=          0, max_val=          1, fpga_update=True , signed=False, desc="lock-in modulation binary quadrature" )
f.add( name="sq_phas_b"          , group=grp , val=    0, rw=False,  nbits= 1, min_val=          0, max_val=          1, fpga_update=True , signed=False, desc="lock-in modulation binary with phase respect to reference" )
f.add( name="sq_ref"             , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="lock-in modulation square signal reference" )
f.add( name="sq_quad"            , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="lock-in modulation square signal quadrature" )
f.add( name="sq_phas"            , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="lock-in modulation square signal with phase relation to reference" )

# Other signals
grp='inout'
f.add( name="in1"                , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="Input signal IN1" )
f.add( name="in2"                , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="Input signal IN2" )
f.add( name="out1"               , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="signal for RP RF DAC Out1" )
f.add( name="out2"               , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="signal for RP RF DAC Out2" )
f.add( name="slow_out1"          , group=grp , val=    0, rw=False,  nbits=12, min_val=      -2048, max_val=       2047, fpga_update=True , signed=False, desc="signal for RP slow DAC 1" )
f.add( name="slow_out2"          , group=grp , val=    0, rw=False,  nbits=12, min_val=      -2048, max_val=       2047, fpga_update=True , signed=False, desc="signal for RP slow DAC 2" )
f.add( name="slow_out3"          , group=grp , val=    0, rw=False,  nbits=12, min_val=      -2048, max_val=       2047, fpga_update=True , signed=False, desc="signal for RP slow DAC 3" )
f.add( name="slow_out4"          , group=grp , val=    0, rw=False,  nbits=12, min_val=      -2048, max_val=       2047, fpga_update=True , signed=False, desc="signal for RP slow DAC 4" )
f.add( name="oscA"               , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="signal for Oscilloscope Channel A" )
f.add( name="oscB"               , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="signal for Oscilloscope Channel B" )

grp='product_signals'
f.add( name="X_28"               , group=grp , val=    0, rw=False,  nbits=28, min_val= -134217728, max_val=  134217727, fpga_update=True , signed=True , desc="Demodulated signal from sin_ref" )
f.add( name="Y_28"               , group=grp , val=    0, rw=False,  nbits=28, min_val= -134217728, max_val=  134217727, fpga_update=True , signed=True , desc="Demodulated signal from cos_ref" )
f.add( name="F1_28"              , group=grp , val=    0, rw=False,  nbits=28, min_val= -134217728, max_val=  134217727, fpga_update=True , signed=True , desc="Demodulated signal from cos_1f" )
f.add( name="F2_28"              , group=grp , val=    0, rw=False,  nbits=28, min_val= -134217728, max_val=  134217727, fpga_update=True , signed=True , desc="Demodulated signal from cos_2f" )
f.add( name="F3_28"              , group=grp , val=    0, rw=False,  nbits=28, min_val= -134217728, max_val=  134217727, fpga_update=True , signed=True , desc="Demodulated signal from cos_3f" )
f.add( name="sqX_28"             , group=grp , val=    0, rw=False,  nbits=28, min_val= -134217728, max_val=  134217727, fpga_update=True , signed=True , desc="Demodulated signal from sq_ref" )
f.add( name="sqY_28"             , group=grp , val=    0, rw=False,  nbits=28, min_val= -134217728, max_val=  134217727, fpga_update=True , signed=True , desc="Demodulated signal from sq_quad" )
f.add( name="sqF_28"             , group=grp , val=    0, rw=False,  nbits=28, min_val= -134217728, max_val=  134217727, fpga_update=True , signed=True , desc="Demodulated signal from sq_phas" )
f.add( name="cnt_clk"            , group=grp , val=    0, rw=False,  nbits=32, min_val=          0, max_val= 4294967295, fpga_update=False, signed=False, desc="Clock count" )
f.add( name="cnt_clk2"           , group=grp , val=    0, rw=False,  nbits=32, min_val=          0, max_val= 4294967295, fpga_update=False, signed=False, desc="Clock count" )
f.add( name="read_ctrl"          , group=grp , val=    0, rw=True ,  nbits= 3, min_val=          0, max_val=          7, fpga_update=True , signed=False, desc="[unused,start_clk,Freeze]" )



# PID Control
grp='pidA'
f.add( name="pidA_sw"            , group=grp , val=    0, rw=True ,  nbits= 5, min_val=          0, max_val=         31, fpga_update=True , signed=False, desc="switch selector for pidA input" )
f.add( name="pidA_PSR"           , group=grp , val=    3, rw=True ,  nbits= 3, min_val=          0, max_val=          4, fpga_update=True , signed=False, desc="pidA PSR" )
f.add( name="pidA_ISR"           , group=grp , val=    8, rw=True ,  nbits= 4, min_val=          0, max_val=          9, fpga_update=True , signed=False, desc="pidA ISR" )
f.add( name="pidA_DSR"           , group=grp , val=    0, rw=True ,  nbits= 3, min_val=          0, max_val=          5, fpga_update=True , signed=False, desc="pidA DSR" )
f.add( name="pidA_SAT"           , group=grp , val=   13, rw=True ,  nbits=14, min_val=          0, max_val=         13, fpga_update=True , signed=False, desc="pidA saturation control" )
f.add( name="pidA_sp"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidA set_point" )
f.add( name="pidA_kp"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidA proportional constant" )
f.add( name="pidA_ki"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidA integral constant" )
f.add( name="pidA_kd"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidA derivative constant" )
f.add( name="pidA_in"            , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidA input" )
f.add( name="pidA_out"           , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidA output" )
f.add( name="pidA_ctrl"          , group=grp , val=    0, rw=True ,  nbits= 3, min_val=          0, max_val=          7, fpga_update=True , signed=False, desc="pidA control: [ pidA_ifreeze: integrator freeze , pidA_freeze: output freeze , pidA_irst:integrator reset]" )
f.add( name="ctrl_A"             , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=False, signed=True , desc="control_A: pidA_out + ramp_A" )

grp='pidB'
f.add( name="pidB_sw"            , group=grp , val=    0, rw=True ,  nbits= 5, min_val=          0, max_val=         31, fpga_update=True , signed=False, desc="switch selector for pidB input" )
f.add( name="pidB_PSR"           , group=grp , val=    3, rw=True ,  nbits= 3, min_val=          0, max_val=          4, fpga_update=True , signed=False, desc="pidB PSR" )
f.add( name="pidB_ISR"           , group=grp , val=    8, rw=True ,  nbits= 4, min_val=          0, max_val=          9, fpga_update=True , signed=False, desc="pidB ISR" )
f.add( name="pidB_DSR"           , group=grp , val=    0, rw=True ,  nbits= 3, min_val=          0, max_val=          5, fpga_update=True , signed=False, desc="pidB DSR" )
f.add( name="pidB_SAT"           , group=grp , val=   13, rw=True ,  nbits=14, min_val=          0, max_val=         13, fpga_update=True , signed=False, desc="pidB saturation control" )
f.add( name="pidB_sp"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidB set_point" )
f.add( name="pidB_kp"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidB proportional constant" )
f.add( name="pidB_ki"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidB integral constant" )
f.add( name="pidB_kd"            , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidB derivative constant" )
f.add( name="pidB_in"            , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidB input" )
f.add( name="pidB_out"           , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="pidB output" )
f.add( name="pidB_ctrl"          , group=grp , val=    0, rw=True ,  nbits= 3, min_val=          0, max_val=          7, fpga_update=True , signed=False, desc="pidB control: [ pidB_ifreeze: integrator freeze , pidB_freeze: output freeze , pidB_irst:integrator reset]" )
f.add( name="ctrl_B"             , group=grp , val=    0, rw=False,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=False, signed=True , desc="control_B: pidA_out + ramp_B" )

# aux
grp='mix'
f.add( name="aux_A"              , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="auxiliar value of 14 bits" )
f.add( name="aux_B"              , group=grp , val=    0, rw=True ,  nbits=14, min_val=      -8192, max_val=       8191, fpga_update=True , signed=True , desc="auxiliar value of 14 bits" )


# Dont erase   #####
#for r in f:
#    print('f.add( name={:20s} , val={:5d}, rw={:5s},  nbits={:2d}, min_val={:11d}, max_val={:11d}, fpga_update={:5s}, signed={:5s}, desc="{:s}" )'.format(
#            '"'+r.name+'"'  ,  r.val , str(r.rw) , r.nbits , r.min , r.max , str(r.fpga_update) , str(r.signed) , r.desc
#            ))
#

for r in f:
    if r.ro:
        r.fpga_update=False

for i in ['osc_ctrl','in1','in2','out1','out2']:
    f[i].write_def=False


for i in ['X_28', 'Y_28', 'F1_28', 'F2_28', 'F3_28', 'sqX_28', 'sqY_28', 'sqF_28', 'error', 'ctrl_A', 'ctrl_B']:
    f[i].reg_read=True




#%% ###########################################################################


def inline(txt):
    return txt.replace('\n',' // ')

class txt_buff():
    """Buffer for out text"""
    def __init__(self, tab=4,n=1,end='\n',comment='//'):
        self.indent=' '*tab
        self.end=end
        self.txt=''
        self.tab=tab
        self.n=n
        self.comment=comment
        self.ended=True
    def add(self,txt,end=True):
        if self.ended:
            self.txt+=self.indent*self.n+txt+(self.end if end else '')
        else:
            self.txt+=txt+(self.end if end else '')
        self.ended=end
    def add_comment(self,txt):
        self.txt+=(self.indent*self.n)[:-2]+self.comment+txt+self.end
    def out(self):
        return self.txt
    def indent_plus(self):
        self.n     += 1
    def indent_minus(self):
        self.n     -= 1
    def nl(self):
        self.txt+=self.indent*self.n+self.end

if __name__ == '__main__':
    txt=txt_buff()
    print(txt.out())


def fpga_reg_write(indent=1):
    txt=txt_buff(n=indent)

    txt.add('//---------------------------------------------------------------------------------')
    txt.add('//')
    txt.add('//  System bus connection')
    txt.nl()
    txt.add('// SO --> MEMORIA --> FPGA')
    txt.nl()
    txt.add('always @(posedge clk)')
    txt.add('if (rst) begin')
    txt.indent_plus()

    for r in f:
        if r.rw:
            txt.add( "{:<20}   <= {:s}{:>2d}'d{:<5d} ; // {:s}".format(
                    r.name, '-' if r.val<0 else ' ' , r.nbits , abs(r.val) , inline(r.desc)
                    ))

    txt.indent_minus()
    txt.add('end else begin')
    txt.indent_plus()
    txt.add('if (sys_wen) begin')
    txt.indent_plus()

    for r in f:
        if r.rw:
            if r.nbits == 1:
                txt.add("if (sys_addr[19:0]=={:5s})  {:<20}  <= |sys_wdata[32-1: 0] ; // {:}".format(
                       r.addr, r.name , inline(r.desc)
                       ) )
            else:
                txt.add("if (sys_addr[19:0]=={:5s})  {:<20}  <=  sys_wdata[{:>2d}-1: 0] ; // {:}".format(
                       r.addr, r.name , r.nbits , inline(r.desc)
                       ))
        else:
            txt.add_comment("if (sys_addr[19:0]=={:5s})  {:<20}  <=  sys_wdata[{:>2d}-1: 0] ; // {:}".format(
                   r.addr, r.name , r.nbits , inline(r.desc)
                   ))
    txt.indent_minus()
    txt.add('end')
    txt.indent_minus()
    txt.add('end')

    return txt.out()

def fpga_reg_read(indent=1):
    txt=txt_buff(n=indent)

    txt.add('//---------------------------------------------------------------------------------')
    txt.add('// FPGA --> MEMORIA --> SO')
    txt.add('wire sys_en;')
    txt.add('assign sys_en = sys_wen | sys_ren;')
    txt.nl()
    txt.add('always @(posedge clk, posedge rst)')
    txt.add("if (rst) begin")

    txt.indent_plus()
    txt.add("sys_err <= 1'b0  ;")
    txt.add("sys_ack <= 1'b0  ;")
    txt.indent_minus()

    txt.add("end else begin")
    txt.indent_plus()
    txt.add("sys_err <= 1'b0 ;")
    txt.nl()
    txt.add("casez (sys_addr[19:0])")

    txt.indent_plus()

    for r in f:
        if r.nbits==32:
            txt.add("{:3s} : begin sys_ack <= sys_en;  sys_rdata <= {:>45}   ;".format(
                    r.addr , (r.name+'_reg' if r.reg_read else r.name )
                    ).ljust(95)
                    +" end // {:}".format(inline(r.desc))
              )
        elif r.nbits==1:
            txt.add(
                    "{:5s} : begin sys_ack <= sys_en;  sys_rdata <=".format(r.addr)+
                    " {  31'b0  ".ljust(28)+
                    ",  {:>15s}  }};".format( (r.name+'_reg' if r.reg_read else r.name ) ) +
                    " end // {:}".format(inline(r.desc))
                    )
        else:
            if r.signed:
                txt.add(
                        "{:5s} : begin sys_ack <= sys_en;  sys_rdata <=".format(r.addr)+
                        " {{  {{{:>2d}{{{:s}[{:d}]}}}} ".format(32-r.nbits, (r.name+'_reg' if r.reg_read else r.name ), r.nbits-1).ljust(28)+
                        ",  {:>15s}  }};".format( (r.name+'_reg' if r.reg_read else r.name ) ) +
                        " end // {:}".format(inline(r.desc))
                        )
            else:
                txt.add(
                        "{:5s} : begin sys_ack <= sys_en;  sys_rdata <=".format(r.addr)+
                        " {{  {:>2d}'b0 ".format(32-r.nbits).ljust(28)+
                        ",  {:>15s}  }};".format(  (r.name+'_reg' if r.reg_read else r.name )  ) +
                        " end // {:}".format(inline(r.desc))
                        )
    txt.add("default   : begin sys_ack <= sys_en;  sys_rdata <=  32'h0        ; end")
    txt.indent_minus()
    txt.add("endcase")
    txt.indent_minus()
    txt.add("end")

    return txt.out()


def fpga_defs(indent=1):
    txt=txt_buff(n=indent)

    for group in unique([ y.group for y in f ]).tolist():
        txt.add('// '+group+' --------------------------')
        # reg Unsigned
        for nbits in unique([ y.nbits for y in filter(lambda x: x.group==group and x.rw==True and x.signed==False and x.write_def==True, f) ]):
            if nbits==1:
                txt.add('reg                  '.format(nbits),end=False)
            else:
                txt.add('reg         [{:>2d}-1:0] '.format(nbits),end=False)
            txt.add(','.join( [ y.name for y in filter(lambda x: x.group==group and x.rw==True and x.nbits==nbits and x.signed==False and x.write_def==True, f) ] )
                   +';')
        # reg Signed
        for nbits in unique([ y.nbits for y in filter(lambda x: x.group==group and x.rw==True and x.signed==True and x.write_def==True, f) ]):
            txt.add('reg  signed [{:>2d}-1:0] '.format(nbits),end=False)
            txt.add(','.join( [ y.name for y in filter(lambda x: x.group==group and x.rw==True and x.nbits==nbits and x.signed==True and x.write_def==True, f) ] )
                   +';')
        # wire Unsigned
        for nbits in unique([ y.nbits for y in filter(lambda x: x.group==group and x.rw==False and x.signed==False and x.write_def==True, f) ]):
            if nbits==1:
                txt.add('wire                 '.format(nbits),end=False)
            else:
                txt.add('wire        [{:>2d}-1:0] '.format(nbits),end=False)
            txt.add(','.join( [ y.name for y in filter(lambda x: x.group==group and x.rw==False and x.nbits==nbits and x.signed==False and x.write_def==True, f) ] )
                   +';')
        # wire Signed
        for nbits in unique([ y.nbits for y in filter(lambda x: x.group==group and x.rw==False and x.signed==True and x.write_def==True, f) ]):
            txt.add('wire signed [{:>2d}-1:0] '.format(nbits),end=False)
            txt.add(','.join( [ y.name for y in filter(lambda x: x.group==group and x.rw==False and x.nbits==nbits and x.signed==True and x.write_def==True, f) ] )
                   +';')
        txt.nl()
    return txt.out()





#%

from datetime import datetime

def update_verilog(filename,dock,txt):
    """Update automatic parts in file DOCK place"""
    if type(dock)==str:
        dock=[dock]
    if type(txt)==str:
        txt=[txt]
    with open(filename, 'r') as input:
        with open(filename.replace('.v','_.v'), 'w') as output:
            out=''
            for line in input:
                for i,d in enumerate(dock):
                    if '// [{:s} DOCK]'.format(d) in line:
                        out=d
                        output.write(line)
                        output.write(txt[i])
                        if not txt[i][-1]=='\n':
                            output.write('\n')
                    if '// [{:s} DOCK END]'.format(d) in line and out==d:
                        out=''
                if out=='':
                    output.write(line)
    tnow=datetime.now().strftime("%Y%m%d_%H%M%S")
    os.rename(filename,filename.replace('.v','_'+tnow+'.v'))
    os.rename(filename.replace('.v','_.v'),filename)

#%


fpga_mod_fn=APP+'/fpga/rtl/lock.v'

if __name__ == '__main__' and do_verilog:
    print('do_verilog')
    if not os.path.isdir(folder):
        raise ValueError('"folder" variable should be the source code folder path.')
    os.chdir(folder)
    update_verilog(fpga_mod_fn,dock=['WIREREG','FPGA MEMORY'],
                   txt=[fpga_defs(),fpga_reg_write()+fpga_reg_read()])




#%%
##########################################################################################
##########################################################################################






















#unique([ y.group for y in f ]).tolist()
if False:
    prop=['name','val','rw','nbits','min','max','fpga_update','signed','group','desc']
    large={}
    for i in prop:
        large[i]=0

    for i in prop:
        for r in f:
            large[i]=max( large[i] , len(str( r[i] ))  )
        if type(r[i])==str:
            large[i]+=2
    large['desc']=10


    buff=txt_buff(n=0)

    grp=''
    for r in f:
        if grp!=r.group:
            grp=r.group
            buff.add('\n# group: '+grp)
        txt=[]
        txt.append(' name='    + ('"lock_'+r['name']+'"').ljust(large['name']+5)   )
        txt.append(' fpga_reg='+ ('"'+r['name']+'"').ljust(large['name'])   )
        for i in prop[1:]:
            if type(r[i])==str:
                txt.append(' '+i+'='+ ('"'+r[i]+'"').ljust(large[i])   )
            else:
                txt.append(' '+i+'='+ str(r[i]).ljust(large[i])        )

        buff.add('m.add('+','.join(txt)+')')

    print(buff.out().replace('min=','min_val=').replace('max=','max_val='))


































#%%   CPP registers


class main_register():
    """Register for FPGA module"""
    def __init__(self, name, val=0, rw=True,  min_val=0, max_val=0, nbits=14, desc='todo',
                 signed=False, fpga_update=True ,index=0, c_update=None , group='mix'):
        """Initialize attributes."""
        self.name        = name
        self.val         = val
        self.rw          = rw
        self.ro          = not rw
        self.nbits       = nbits
        self.index       = index
        self.i           = index
        self.min         = min_val
        self.max         = max_val
        self.desc        = desc
        self.group       = group
        self.fpga_update = fpga_update
        self.signed      = signed
        self.c_update    = c_update


class main_registers():
    def __init__(self,num_base=81):
        self.data  = []
        self.names = []
        self.len   = 0
        self.num_base=num_base
    def __getitem__(self, key):
        if type(key)==int:
            return self.data[key]
        if type(key)==str:
            return self.data[self.names.index(key)]
        if type(key)==slice:
            return self.data[key]

    def add(self, name, val=0, rw=True, nbits=14, min_val=0, max_val=0, signed=False, desc='todo',
            fpga_update=True, c_update=None, fpga_reg=None , group='mix'):
        if type(name)==str:
            self.data.append(main_register(name=name, val=val, rw=rw,  nbits=nbits, group=group,
                                           min_val=min_val, max_val=max_val, signed=signed,
                                           desc=desc, fpga_update=fpga_update , index=self.len,
                                           c_update=c_update))
            self.names.append(name)
            self.data[-1].fpga_reg=fpga_reg
            self.data[-1].c_update=None
            self.len = len(self.names)
        elif type(name)==fpga_register:
            self.data.append(main_register(name='lock_'+name.name, val=name.val, rw=name.rw,
                                           min_val=name.min, max_val=name.max, signed=name.signed,
                                           desc=name.desc, fpga_update=name.fpga_update , index=self.len ))
            self.data[-1].fpga_reg=name.name
            self.data[-1].c_update='(float)g_lock_reg->{:20s}'.format(name.name)
            self.names.append('lock_'+name.name)
            self.len = len(self.names)
        self.data[-1].index=self.data[-1].i+self.num_base
        self.data[-1].cdef=self.data[-1].name.upper()


m = main_registers(num_base=81)

# group: scope
m.add( name="lock_oscA_sw"       , fpga_reg="oscA_sw"       , val=1    , rw=True , nbits=5 , min_val=0         , max_val=31        , fpga_update=True , signed=False, group="scope"          , desc="switch for muxer oscA")
m.add( name="lock_oscB_sw"       , fpga_reg="oscB_sw"       , val=2    , rw=True , nbits=5 , min_val=0         , max_val=31        , fpga_update=True , signed=False, group="scope"          , desc="switch for muxer oscB")
if True:
    m.add( name="lock_osc1_filt_off"      , fpga_reg="osc_ctrl" , val=1    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="scope"          , desc="oscilloscope control osc1_filt_off")
    m.add( name="lock_osc2_filt_off"      , fpga_reg="osc_ctrl" , val=1    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="scope"          , desc="oscilloscope control osc2_filt_off")
    r=m["lock_osc1_filt_off"]; r.c_update='(float) ((g_lock_reg->{:s}      )& 0x01)'.format(r.fpga_reg)
    r=m["lock_osc2_filt_off"]; r.c_update='(float) ((g_lock_reg->{:s} >> 1 )& 0x01)'.format(r.fpga_reg)
    r=f["osc_ctrl"]; r.c_update='(((int)params[{:s}].value)<<1) + ((int)params[{:s}].value)'.format( m["lock_osc2_filt_off"].cdef , m["lock_osc1_filt_off"].cdef )
else:
    m.add( name="lock_osc_ctrl"      , fpga_reg="osc_ctrl"      , val=3    , rw=True , nbits=2 , min_val=0         , max_val=4294967295, fpga_update=True , signed=False, group="scope"          , desc="oscilloscope control[osc2_filt_off,osc1_filt_off]")
m.add( name="lock_osc_raw_mode"      ,                            val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=False, signed=False, group="scope"          , desc="Set oscilloscope mode in Raw (int unit instead of Volts)")
m.add( name="lock_osc_lockin_mode"   ,                            val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=False, signed=False, group="scope"          , desc="Set oscilloscope mode in lock-in (ch1 as R [V|int], ch2 as Phase [rad])")
m.add( name="lock_trig_sw"           , fpga_reg="trig_sw"       , val=0    , rw=True , nbits=8 , min_val=0         , max_val=255       , fpga_update=True , signed=False, group="scope"          , desc="Select the external trigger signal")

# group: outputs
m.add( name="lock_out1_sw"       , fpga_reg="out1_sw"       , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="outputs"        , desc="switch for muxer out1")
m.add( name="lock_out2_sw"       , fpga_reg="out2_sw"       , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="outputs"        , desc="switch for muxer out2")
m.add( name="lock_slow_out1_sw"  , fpga_reg="slow_out1_sw"  , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="outputs"        , desc="switch for muxer slow_out1")
m.add( name="lock_slow_out2_sw"  , fpga_reg="slow_out2_sw"  , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="outputs"        , desc="switch for muxer slow_out2")
m.add( name="lock_slow_out3_sw"  , fpga_reg="slow_out3_sw"  , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="outputs"        , desc="switch for muxer slow_out3")
m.add( name="lock_slow_out4_sw"  , fpga_reg="slow_out4_sw"  , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="outputs"        , desc="switch for muxer slow_out4")

# group: lock_control
m.add( name="lock_lock_control"  , fpga_reg="lock_control"  , val=1148 , rw=True , nbits=11, min_val=0         , max_val=2047      , fpga_update=True , signed=False, group="lock_control"   , desc="lock_control help")
m.add( name="lock_lock_feedback" , fpga_reg="lock_feedback" , val=1148 , rw=False, nbits=11, min_val=0         , max_val=2047      , fpga_update=False, signed=False, group="lock_control"   , desc="lock_control feedback")
m.add( name="lock_lock_trig_val" , fpga_reg="lock_trig_val" , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="lock_control"   , desc="if lock_control ?? , this vals sets the voltage threshold that turns on the lock")
m.add( name="lock_lock_trig_time_val", fpga_reg="lock_trig_time", val=0    , rw=True , nbits=32, min_val=0         , max_val=4294967295, fpga_update=True , signed=False, group="lock_control"   , desc="if lock_control ?? , this vals sets the time threshold that turns on the lock")
r.main_reg='lock_'+r.name
r=f["lock_trig_time" ]; r.c_update='(int)params[{:30s}].value'.format( m['lock_lock_trig_time_val'].cdef )

m.add( name="lock_lock_trig_sw"  , fpga_reg="lock_trig_sw"  , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock_control"   , desc="selects signal for trigger")

m.add( name="lock_rl_error_threshold" ,fpga_reg="rl_error_threshold" ,val=0,rw=True ,nbits=13,min_val=0        , max_val=8191      , fpga_update=True , signed=False, group="lock_control"   , desc="Threshold for error signal. Launchs relock when |error| > rl_error_threshold")
m.add( name="lock_rl_signal_sw"       ,fpga_reg="rl_signal_sw"       ,val=0,rw=True ,nbits=3 ,min_val=0        , max_val=7         , fpga_update=True , signed=False, group="lock_control"   , desc="selects signal for relock trigger")
m.add( name="lock_rl_signal_threshold",fpga_reg="rl_signal_threshold",val=0,rw=True ,nbits=14,min_val=-8192    , max_val=8191      , fpga_update=True , signed=True , group="lock_control"   , desc="Threshold for signal. Launchs relock when signal < rl_signal_threshold")
m.add( name="lock_rl_error_enable"    ,fpga_reg="rl_config"          ,val=0,rw=True ,nbits=1 ,min_val=0        , max_val=1         , fpga_update=True , signed=False, group="lock_control"   , desc="Relock enable. [enable_error_th] ")
m.add( name="lock_rl_signal_enable"   ,fpga_reg="rl_config"          ,val=0,rw=True ,nbits=1 ,min_val=0        , max_val=1         , fpga_update=True , signed=False, group="lock_control"   , desc="Relock enable. [enable_signal_th] ")
m.add( name="lock_rl_reset"           ,fpga_reg="rl_config"          ,val=0,rw=True ,nbits=1 ,min_val=0        , max_val=1         , fpga_update=True , signed=False, group="lock_control"   , desc="Relock enable. [relock_reset] ")
r=m["lock_rl_error_enable" ]; r.c_update='(float) ((g_lock_reg->{:s}      )& 0x01)'.format(r.fpga_reg)
r=m["lock_rl_signal_enable"]; r.c_update='(float) ((g_lock_reg->{:s} >> 1 )& 0x01)'.format(r.fpga_reg)
r=m["lock_rl_reset"        ]; r.c_update='(float) ((g_lock_reg->{:s} >> 2 )& 0x01)'.format(r.fpga_reg)
r=f["rl_config"            ]; r.c_update='(((int)params[{:s}].value) << 2 ) + (((int)params[{:s}].value) << 1 ) + ((int)params[{:s}].value)'.format( m["lock_rl_reset"].cdef , m["lock_rl_signal_enable"].cdef , m["lock_rl_error_enable"].cdef )

m.add( name="lock_rl_state"           ,fpga_reg="rl_state"           ,val=0,rw=False,nbits=5 ,min_val=0        , max_val=31        , fpga_update=False, signed=False, group="lock_control"   , desc="Relock state: [state:idle|searching|failed,signal_fail,error_fail,locked] ")

m.add( name="lock_sf_jumpA"            , fpga_reg="sf_jumpA"            , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="lock_control"   , desc="Step function measure jump value for ctrl_A")
m.add( name="lock_sf_jumpB"            , fpga_reg="sf_jumpB"            , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="lock_control"   , desc="Step function measure jump value for ctrl_B")

#m.add( name="lock_sf_config"          , fpga_reg="sf_config"          , val=0    , rw=True , nbits=5 , min_val=0         , max_val=31        , fpga_update=True , signed=False, group="lock_control"   , desc="Step function configuration. [pidB_ifreeze,pidB_freeze,pidA_ifreeze,pidA_freeze,start] ")
m.add( name="lock_sf_start"           , fpga_reg="sf_config"          , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="lock_control"   , desc="Step function start ")
m.add( name="lock_sf_AfrzO"           , fpga_reg="sf_config"          , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="lock_control"   , desc="Step function pidA_freeze ")
m.add( name="lock_sf_AfrzI"           , fpga_reg="sf_config"          , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="lock_control"   , desc="Step function pidA_ifreeze ")
m.add( name="lock_sf_BfrzO"           , fpga_reg="sf_config"          , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="lock_control"   , desc="Step function pidB_freeze ")
m.add( name="lock_sf_BfrzI"           , fpga_reg="sf_config"          , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="lock_control"   , desc="Step function pidB_ifreeze ")

r=m["lock_sf_start"        ]; r.c_update='(float) ((g_lock_reg->{:s}      )& 0x01)'.format(r.fpga_reg)
r=m["lock_sf_AfrzO"        ]; r.c_update='(float) ((g_lock_reg->{:s} >> 1 )& 0x01)'.format(r.fpga_reg)
r=m["lock_sf_AfrzI"        ]; r.c_update='(float) ((g_lock_reg->{:s} >> 2 )& 0x01)'.format(r.fpga_reg)
r=m["lock_sf_BfrzO"        ]; r.c_update='(float) ((g_lock_reg->{:s} >> 3 )& 0x01)'.format(r.fpga_reg)
r=m["lock_sf_BfrzI"        ]; r.c_update='(float) ((g_lock_reg->{:s} >> 4 )& 0x01)'.format(r.fpga_reg)
r=f["sf_config"            ]; r.c_update='(((int)params[{:s}].value) << 4 ) +(((int)params[{:s}].value) << 3 ) +(((int)params[{:s}].value) << 2 ) + (((int)params[{:s}].value) << 1 ) + ((int)params[{:s}].value)'.format(
        m["lock_sf_BfrzI"].cdef , m["lock_sf_BfrzO"].cdef,m["lock_sf_AfrzI"].cdef , m["lock_sf_AfrzO"].cdef , m["lock_sf_start"].cdef )


# group: lock-in
m.add( name="lock_signal_sw"     , fpga_reg="signal_sw"     , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="Input selector for signal_i")
m.add( name="lock_signal_i"      , fpga_reg="signal_i"      , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="lock-in"        , desc="signal for demodulation")
m.add( name="lock_sg_amp1"       , fpga_reg="sg_amp1"       , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="amplification of Xo, Yo and F1o")
m.add( name="lock_sg_amp2"       , fpga_reg="sg_amp2"       , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="amplification of F2o")
m.add( name="lock_sg_amp3"       , fpga_reg="sg_amp3"       , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="amplification of F3o")
m.add( name="lock_sg_amp_sq"     , fpga_reg="sg_amp_sq"     , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="amplification of SQo")

if True:
    m.add( name="lock_lpf_F1_tau"    , fpga_reg="lpf_F1"        , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter TAU of X, Y and F1")
    m.add( name="lock_lpf_F1_order"  , fpga_reg="lpf_F1"        , val=2    , rw=True , nbits=2 , min_val=0         , max_val=2         , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter order / off")
    r=m["lock_lpf_F1_tau"  ]; r.c_update='(float) ((g_lock_reg->{:s}      )& 0x0f)'.format(r.fpga_reg)
    r=m["lock_lpf_F1_order"]; r.c_update='(float) ((g_lock_reg->{:s} >> 4 )& 0x03)'.format(r.fpga_reg)
    r=f["lpf_F1"]; r.c_update='(((int)params[{:s}].value)<<4) + ((int)params[{:s}].value)'.format( m["lock_lpf_F1_order"].cdef , m["lock_lpf_F1_tau"].cdef )

    m.add( name="lock_lpf_F2_tau"    , fpga_reg="lpf_F2"        , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter TAU of F2")
    m.add( name="lock_lpf_F2_order"  , fpga_reg="lpf_F2"        , val=2    , rw=True , nbits=2 , min_val=0         , max_val=2         , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter order / off")
    r=m["lock_lpf_F2_tau"  ]; r.c_update='(float) ((g_lock_reg->{:s}      )& 0x0f)'.format(r.fpga_reg)
    r=m["lock_lpf_F2_order"]; r.c_update='(float) ((g_lock_reg->{:s} >> 4 )& 0x03)'.format(r.fpga_reg)
    r=f["lpf_F2"]; r.c_update='(((int)params[{:s}].value)<<4) + ((int)params[{:s}].value)'.format( m["lock_lpf_F2_order"].cdef , m["lock_lpf_F2_tau"].cdef )


    m.add( name="lock_lpf_F3_tau"    , fpga_reg="lpf_F3"        , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter TAU of F3")
    m.add( name="lock_lpf_F3_order"  , fpga_reg="lpf_F3"        , val=2    , rw=True , nbits=2 , min_val=0         , max_val=2         , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter order / off")
    r=m["lock_lpf_F3_tau"  ]; r.c_update='(float) ((g_lock_reg->{:s}      )& 0x0f)'.format(r.fpga_reg)
    r=m["lock_lpf_F3_order"]; r.c_update='(float) ((g_lock_reg->{:s} >> 4 )& 0x03)'.format(r.fpga_reg)
    r=f["lpf_F3"]; r.c_update='(((int)params[{:s}].value)<<4) + (((int)params[{:s}].value))'.format( m["lock_lpf_F3_order"].cdef , m["lock_lpf_F3_tau"].cdef )


    m.add( name="lock_lpf_sq_tau"    , fpga_reg="lpf_sq"        , val=0    , rw=True , nbits=4 , min_val=0         , max_val=15        , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter TAU of Square")
    m.add( name="lock_lpf_sq_order"  , fpga_reg="lpf_sq"        , val=2    , rw=True , nbits=2 , min_val=0         , max_val=2         , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter order / off")
    r=m["lock_lpf_sq_tau"  ]; r.c_update='(float) ((g_lock_reg->{:s}      )& 0x0f)'.format(r.fpga_reg)
    r=m["lock_lpf_sq_order"]; r.c_update='(float) ((g_lock_reg->{:s} >> 4 )& 0x03)'.format(r.fpga_reg)
    r=f["lpf_sq"]; r.c_update='(((int)params[{:s}].value)<<4) + ((int)params[{:s}].value)'.format( m["lock_lpf_sq_order"].cdef , m["lock_lpf_sq_tau"].cdef )
else:
    m.add( name="lock_lpf_F1"        , fpga_reg="lpf_F1"        , val=0    , rw=True , nbits=6 , min_val=0         , max_val=63        , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter of X, Y and F1")
    m.add( name="lock_lpf_F2"        , fpga_reg="lpf_F2"        , val=0    , rw=True , nbits=6 , min_val=0         , max_val=63        , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter of F2")
    m.add( name="lock_lpf_F3"        , fpga_reg="lpf_F3"        , val=0    , rw=True , nbits=6 , min_val=0         , max_val=63        , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter of F3")
    m.add( name="lock_lpf_sq"        , fpga_reg="lpf_sq"        , val=0    , rw=True , nbits=6 , min_val=0         , max_val=63        , fpga_update=True , signed=False, group="lock-in"        , desc="Low Pass Filter of SQ")

m.add( name="lock_error_sw"      , fpga_reg="error_sw"      , val=0    , rw=True , nbits=3 , min_val=0         , max_val=7         , fpga_update=True , signed=False, group="lock-in"        , desc="select error signal")
m.add( name="lock_error_offset"  , fpga_reg="error_offset"  , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="lock-in"        , desc="offset for the error signal")
m.add( name="lock_error"         , fpga_reg="error"         , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="lock-in"        , desc="error signal value")
m.add( name="lock_error_mean"         , fpga_reg="error_mean"         , val=0    , rw=False, nbits=32, min_val=-2147483648, max_val=2147483647, fpga_update=False, signed=True , group="lock-in"        , desc="1 sec error mean val")
r=m["lock_error_mean"  ]; r.c_update='((float) ( g_lock_reg->{:s} >= 0 ? g_lock_reg->{:s} : g_lock_reg->{:s}-32 ))/262144 '.format(r.fpga_reg,r.fpga_reg,r.fpga_reg)
m.add( name="lock_error_std"          , fpga_reg="error_std"          , val=0    , rw=False, nbits=32, min_val=-2147483648, max_val=2147483647, fpga_update=False, signed=True , group="lock-in"        , desc="1 sec error square sum val")
r=m["lock_error_std"  ]; r.c_update='lock_error_var<0 ? -1 : sqrt( lock_error_var ) '.format(r.fpga_reg , m["lock_error_mean"].cdef)


# group: gen_mod
m.add( name="lock_gen_mod_phase" , fpga_reg="gen_mod_phase" , val=0    , rw=True , nbits=12, min_val=0         , max_val=2519      , fpga_update=True , signed=False, group="gen_mod"        , desc="phase relation of cos_?f signals")
m.add( name="lock_gen_mod_phase_sq", fpga_reg="gen_mod_phase_sq",val=0 , rw=True , nbits=32, min_val=0         , max_val=4294967295, fpga_update=True , signed=False, group="gen_mod"        , desc="phase relation of sq_phas signal")
m.add( name="lock_gen_mod_hp"    , fpga_reg="gen_mod_hp"    , val=0    , rw=True , nbits=14, min_val=0         , max_val=16383     , fpga_update=True , signed=False, group="gen_mod"        , desc="harmonic period set")
m.add( name="lock_gen_mod_sqp"   , fpga_reg="gen_mod_sqp"   , val=0    , rw=True , nbits=32, min_val=0         , max_val=4294967295, fpga_update=True , signed=False, group="gen_mod"        , desc="square signal period")

# group: gen_ramp
m.add( name="lock_ramp_A"        , fpga_reg="ramp_A"        , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="gen_ramp"       , desc="ramp signal A")
m.add( name="lock_ramp_B"        , fpga_reg="ramp_B"        , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="gen_ramp"       , desc="ramp signal B")
m.add( name="lock_ramp_step"     , fpga_reg="ramp_step"     , val=0    , rw=True , nbits=32, min_val=0         , max_val=4294967295, fpga_update=True , signed=False, group="gen_ramp"       , desc="period of the triangular ramp signal")
m.add( name="lock_ramp_low_lim"  , fpga_reg="ramp_low_lim"  , val=-5000, rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="gen_ramp"       , desc="ramp low limit")
m.add( name="lock_ramp_hig_lim"  , fpga_reg="ramp_hig_lim"  , val=5000 , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="gen_ramp"       , desc="ramp high limit")
m.add( name="lock_ramp_reset"    , fpga_reg="ramp_reset"    , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="gen_ramp"       , desc="ramp reset config")
m.add( name="lock_ramp_enable"   , fpga_reg="ramp_enable"   , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="gen_ramp"       , desc="ramp enable/disable switch")
m.add( name="lock_ramp_direction", fpga_reg="ramp_direction", val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="gen_ramp"       , desc="ramp starting direction (up/down)")
m.add( name="lock_ramp_B_factor" , fpga_reg="ramp_B_factor" , val= 4096, rw=True , nbits=14, min_val=-4096     , max_val=4096      , fpga_update=True , signed=True , group="gen_ramp"       , desc="proportional factor ramp_A/ramp_B.\nramp_B=ramp_A*ramp_B_factor/4096")

# group: modulation
m.add( name="lock_sin_ref"       , fpga_reg="sin_ref"       , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="modulation"     , desc="lock-in modulation sinus harmonic reference")
m.add( name="lock_cos_ref"       , fpga_reg="cos_ref"       , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="modulation"     , desc="lock-in modulation cosinus harmonic reference")
m.add( name="lock_cos_1f"        , fpga_reg="cos_1f"        , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="modulation"     , desc="lock-in modulation sinus harmonic signal with phase relation to reference")
m.add( name="lock_cos_2f"        , fpga_reg="cos_2f"        , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="modulation"     , desc="lock-in modulation sinus harmonic signal with phase relation to reference and double frequency")
m.add( name="lock_cos_3f"        , fpga_reg="cos_3f"        , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="modulation"     , desc="lock-in modulation sinus harmonic signal with phase relation to reference and triple frequency")
m.add( name="lock_sq_ref_b"      , fpga_reg="sq_ref_b"      , val=0    , rw=False, nbits=1 , min_val=0         , max_val=1         , fpga_update=False, signed=False, group="modulation"     , desc="lock-in modulation binary reference")
m.add( name="lock_sq_quad_b"     , fpga_reg="sq_quad_b"     , val=0    , rw=False, nbits=1 , min_val=0         , max_val=1         , fpga_update=False, signed=False, group="modulation"     , desc="lock-in modulation binary quadrature")
m.add( name="lock_sq_phas_b"     , fpga_reg="sq_phas_b"     , val=0    , rw=False, nbits=1 , min_val=0         , max_val=1         , fpga_update=False, signed=False, group="modulation"     , desc="lock-in modulation binary with phase respect to reference")
m.add( name="lock_sq_ref"        , fpga_reg="sq_ref"        , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="modulation"     , desc="lock-in modulation square signal reference")
m.add( name="lock_sq_quad"       , fpga_reg="sq_quad"       , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="modulation"     , desc="lock-in modulation square signal quadrature")
m.add( name="lock_sq_phas"       , fpga_reg="sq_phas"       , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="modulation"     , desc="lock-in modulation square signal with phase relation to reference")

# group: inout
m.add( name="lock_in1"           , fpga_reg="in1"           , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="inout"          , desc="Input signal IN1")
m.add( name="lock_in2"           , fpga_reg="in2"           , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="inout"          , desc="Input signal IN2")
m.add( name="lock_out1"          , fpga_reg="out1"          , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="inout"          , desc="signal for RP RF DAC Out1")
m.add( name="lock_out2"          , fpga_reg="out2"          , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="inout"          , desc="signal for RP RF DAC Out2")
m.add( name="lock_slow_out1"     , fpga_reg="slow_out1"     , val=0    , rw=False, nbits=12, min_val=-2048     , max_val=2047      , fpga_update=False, signed=False, group="inout"          , desc="signal for RP slow DAC 1")
m.add( name="lock_slow_out2"     , fpga_reg="slow_out2"     , val=0    , rw=False, nbits=12, min_val=-2048     , max_val=2047      , fpga_update=False, signed=False, group="inout"          , desc="signal for RP slow DAC 2")
m.add( name="lock_slow_out3"     , fpga_reg="slow_out3"     , val=0    , rw=False, nbits=12, min_val=-2048     , max_val=2047      , fpga_update=False, signed=False, group="inout"          , desc="signal for RP slow DAC 3")
m.add( name="lock_slow_out4"     , fpga_reg="slow_out4"     , val=0    , rw=False, nbits=12, min_val=-2048     , max_val=2047      , fpga_update=False, signed=False, group="inout"          , desc="signal for RP slow DAC 4")
m.add( name="lock_oscA"          , fpga_reg="oscA"          , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="inout"          , desc="signal for Oscilloscope Channel A")
m.add( name="lock_oscB"          , fpga_reg="oscB"          , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="inout"          , desc="signal for Oscilloscope Channel B")

# group: product_signals
m.add( name="lock_X_28"         , fpga_reg="X_28"         , val=0    , rw=False, nbits=28, min_val=-134217728, max_val=134217727 , fpga_update=False, signed=True , group="product_signals", desc="Demodulated signal from sin_ref")
m.add( name="lock_Y_28"         , fpga_reg="Y_28"         , val=0    , rw=False, nbits=28, min_val=-134217728, max_val=134217727 , fpga_update=False, signed=True , group="product_signals", desc="Demodulated signal from cos_ref")
m.add( name="lock_F1_28"         , fpga_reg="F1_28"         , val=0    , rw=False, nbits=28, min_val=-134217728, max_val=134217727 , fpga_update=False, signed=True , group="product_signals", desc="Demodulated signal from cos_1f")
m.add( name="lock_F2_28"         , fpga_reg="F2_28"         , val=0    , rw=False, nbits=28, min_val=-134217728, max_val=134217727 , fpga_update=False, signed=True , group="product_signals", desc="Demodulated signal from cos_2f")
m.add( name="lock_F3_28"         , fpga_reg="F3_28"         , val=0    , rw=False, nbits=28, min_val=-134217728, max_val=134217727 , fpga_update=False, signed=True , group="product_signals", desc="Demodulated signal from cos_3f")
m.add( name="lock_sqX_28"        , fpga_reg="sqX_28"        , val=0    , rw=False, nbits=28, min_val=-134217728, max_val=134217727 , fpga_update=False, signed=True , group="product_signals", desc="Demodulated signal from sq_ref")
m.add( name="lock_sqY_28"        , fpga_reg="sqY_28"        , val=0    , rw=False, nbits=28, min_val=-134217728, max_val=134217727 , fpga_update=False, signed=True , group="product_signals", desc="Demodulated signal from sq_quad")
m.add( name="lock_sqF_28"        , fpga_reg="sqF_28"        , val=0    , rw=False, nbits=28, min_val=-134217728, max_val=134217727 , fpga_update=False, signed=True , group="product_signals", desc="Demodulated signal from sq_phas")
m.add( name="lock_cnt_clk"       , fpga_reg="cnt_clk"       , val=0    , rw=False, nbits=32, min_val=0          , max_val=4294967295, fpga_update=False, signed=False, group="product_signals", desc="Clock count")
m.add( name="lock_cnt_clk2"      , fpga_reg="cnt_clk2"      , val=0    , rw=False, nbits=32, min_val=0          , max_val=4294967295, fpga_update=False, signed=False, group="product_signals", desc="Clock count")
m.add( name="lock_read_ctrl"     , fpga_reg="read_ctrl"     , val=0    , rw=True , nbits=3 , min_val=0          , max_val=7         , fpga_update=True , signed=False, group="product_signals", desc="[unused,start_clk,Freeze]")

# group: pidA
m.add( name="lock_pidA_sw"       , fpga_reg="pidA_sw"       , val=0    , rw=True , nbits=5 , min_val=0         , max_val=31        , fpga_update=True , signed=False, group="pidA"           , desc="switch selector for pidA input")
m.add( name="lock_pidA_PSR"      , fpga_reg="pidA_PSR"      , val=3    , rw=True , nbits=3 , min_val=0         , max_val=4         , fpga_update=True , signed=False, group="pidA"           , desc="pidA PSR")
m.add( name="lock_pidA_ISR"      , fpga_reg="pidA_ISR"      , val=8    , rw=True , nbits=4 , min_val=0         , max_val=9         , fpga_update=True , signed=False, group="pidA"           , desc="pidA ISR")
m.add( name="lock_pidA_DSR"      , fpga_reg="pidA_DSR"      , val=0    , rw=True , nbits=3 , min_val=0         , max_val=5         , fpga_update=True , signed=False, group="pidA"           , desc="pidA DSR")
m.add( name="lock_pidA_SAT"      , fpga_reg="pidA_SAT"      , val=13   , rw=True , nbits=14, min_val=0         , max_val=13        , fpga_update=True , signed=False, group="pidA"           , desc="pidA saturation control")
m.add( name="lock_pidA_sp"       , fpga_reg="pidA_sp"       , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="pidA"           , desc="pidA set_point")
m.add( name="lock_pidA_kp"       , fpga_reg="pidA_kp"       , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="pidA"           , desc="pidA proportional constant")
m.add( name="lock_pidA_ki"       , fpga_reg="pidA_ki"       , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="pidA"           , desc="pidA integral constant")
m.add( name="lock_pidA_kd"       , fpga_reg="pidA_kd"       , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="pidA"           , desc="pidA derivative constant")
m.add( name="lock_pidA_in"       , fpga_reg="pidA_in"       , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="pidA"           , desc="pidA input")
m.add( name="lock_pidA_out"      , fpga_reg="pidA_out"      , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="pidA"           , desc="pidA output")

if True:
    m.add( name="lock_pidA_irst"     , fpga_reg="pidA_ctrl"     , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="pidA"           , desc="pidA_irst")
    m.add( name="lock_pidA_freeze"   , fpga_reg="pidA_ctrl"     , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="pidA"           , desc="pidA_freeze")
    m.add( name="lock_pidA_ifreeze"  , fpga_reg="pidA_ctrl"     , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="pidA"           , desc="pidA_ifreeze")
    r=m["lock_pidA_irst"   ]; r.c_update='(float) ((g_lock_reg->{:20s}      )& 0x001)'.format(r.fpga_reg)
    r=m["lock_pidA_freeze" ]; r.c_update='(float) ((g_lock_reg->{:20s} >>1  )& 0x001)'.format(r.fpga_reg)
    r=m["lock_pidA_ifreeze"]; r.c_update='(float) ((g_lock_reg->{:20s} >>2  )& 0x001)'.format(r.fpga_reg)
    r=f["pidA_ctrl"]; r.c_update='(((int)params[{:s}].value)<<2) + (((int)params[{:s}].value)<<1) + ((int)params[{:s}].value)'.format( m["lock_pidA_ifreeze"].cdef, m["lock_pidA_freeze"].cdef, m["lock_pidA_irst"].cdef)
else:
    m.add( name="lock_pidA_ctrl"     , fpga_reg="pidA_ctrl"     , val=0    , rw=True , nbits=3 , min_val=0         , max_val=7         , fpga_update=True , signed=False, group="pidA"           , desc="pidA control: [ pidA_ifreeze: integrator freeze , pidA_freeze: output freeze , pidA_irst:integrator reset]")

m.add( name="lock_ctrl_A"        , fpga_reg="ctrl_A"        , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="pidA"           , desc="control_A: pidA_out + ramp_A")

# group: pidB
m.add( name="lock_pidB_sw"       , fpga_reg="pidB_sw"       , val=0    , rw=True , nbits=5 , min_val=0         , max_val=31        , fpga_update=True , signed=False, group="pidB"           , desc="switch selector for pidB input")
m.add( name="lock_pidB_PSR"      , fpga_reg="pidB_PSR"      , val=3    , rw=True , nbits=3 , min_val=0         , max_val=4         , fpga_update=True , signed=False, group="pidB"           , desc="pidB PSR")
m.add( name="lock_pidB_ISR"      , fpga_reg="pidB_ISR"      , val=8    , rw=True , nbits=4 , min_val=0         , max_val=9         , fpga_update=True , signed=False, group="pidB"           , desc="pidB ISR")
m.add( name="lock_pidB_DSR"      , fpga_reg="pidB_DSR"      , val=0    , rw=True , nbits=3 , min_val=0         , max_val=5         , fpga_update=True , signed=False, group="pidB"           , desc="pidB DSR")
m.add( name="lock_pidB_SAT"      , fpga_reg="pidB_SAT"      , val=13   , rw=True , nbits=14, min_val=0         , max_val=13        , fpga_update=True , signed=False, group="pidB"           , desc="pidB saturation control")
m.add( name="lock_pidB_sp"       , fpga_reg="pidB_sp"       , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="pidB"           , desc="pidB set_point")
m.add( name="lock_pidB_kp"       , fpga_reg="pidB_kp"       , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="pidB"           , desc="pidB proportional constant")
m.add( name="lock_pidB_ki"       , fpga_reg="pidB_ki"       , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="pidB"           , desc="pidB integral constant")
m.add( name="lock_pidB_kd"       , fpga_reg="pidB_kd"       , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="pidB"           , desc="pidB derivative constant")
m.add( name="lock_pidB_in"       , fpga_reg="pidB_in"       , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="pidB"           , desc="pidB input")
m.add( name="lock_pidB_out"      , fpga_reg="pidB_out"      , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="pidB"           , desc="pidB output")

if True:
    m.add( name="lock_pidB_irst"     , fpga_reg="pidB_ctrl"     , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="pidA"           , desc="pidB_irst")
    m.add( name="lock_pidB_freeze"   , fpga_reg="pidB_ctrl"     , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="pidA"           , desc="pidB_freeze")
    m.add( name="lock_pidB_ifreeze"  , fpga_reg="pidB_ctrl"     , val=0    , rw=True , nbits=1 , min_val=0         , max_val=1         , fpga_update=True , signed=False, group="pidA"           , desc="pidB_ifreeze")
    r=m["lock_pidB_irst"   ]; r.c_update='(float) ((g_lock_reg->{:20s}      )& 0x001)'.format(r.fpga_reg)
    r=m["lock_pidB_freeze" ]; r.c_update='(float) ((g_lock_reg->{:20s} >>1  )& 0x001)'.format(r.fpga_reg)
    r=m["lock_pidB_ifreeze"]; r.c_update='(float) ((g_lock_reg->{:20s} >>2  )& 0x001)'.format(r.fpga_reg)
    r=f["pidB_ctrl"]; r.c_update='(((int)params[{:s}].value)<<2) + (((int)params[{:s}].value)<<1) + ((int)params[{:s}].value)'.format( m["lock_pidB_ifreeze"].cdef, m["lock_pidB_freeze"].cdef, m["lock_pidB_irst"].cdef)
else:
    m.add( name="lock_pidB_ctrl"     , fpga_reg="pidB_ctrl"     , val=0    , rw=True , nbits=3 , min_val=0         , max_val=7         , fpga_update=True , signed=False, group="pidB"           , desc="pidB control: [ pidB_ifreeze: integrator freeze , pidB_freeze: output freeze , pidB_irst:integrator reset]")
m.add( name="lock_ctrl_B"        , fpga_reg="ctrl_B"        , val=0    , rw=False, nbits=14, min_val=-8192     , max_val=8191      , fpga_update=False, signed=True , group="pidB"           , desc="control_B: pidA_out + ramp_B")

# group: mix
m.add( name="lock_aux_A"         , fpga_reg="aux_A"         , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="mix"            , desc="auxiliar value of 14 bits")
m.add( name="lock_aux_B"         , fpga_reg="aux_B"         , val=0    , rw=True , nbits=14, min_val=-8192     , max_val=8191      , fpga_update=True , signed=True , group="mix"            , desc="auxiliar value of 14 bits")





m.add(name="lock_ctrl_aux_lock_now"         , val=0 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_launch_lock_trig" , val=0 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_pidB_enable_ctrl" , val=1 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_pidA_enable_ctrl" , val=1 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_ramp_enable_ctrl" , val=1 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_set_pidB_enable"  , val=1 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_set_pidA_enable"  , val=1 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_set_ramp_enable"  , val=0 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_trig_type"        , val=0 , max_val=3 , fpga_update=False, fpga_reg='lock_feedback')
m.add(name="lock_ctrl_aux_lock_trig_rise"   , val=0 , max_val=1 , fpga_update=False, fpga_reg='lock_feedback')

m['lock_ctrl_aux_lock_now'        ].c_update='(float) (( g_lock_reg->lock_feedback >> 0 ) & 0x01 )'
m['lock_ctrl_aux_launch_lock_trig'].c_update='(float) (( g_lock_reg->lock_feedback >> 1 ) & 0x01 )'
m['lock_ctrl_aux_pidB_enable_ctrl'].c_update='(float) (( g_lock_reg->lock_feedback >> 2 ) & 0x01 )'
m['lock_ctrl_aux_pidA_enable_ctrl'].c_update='(float) (( g_lock_reg->lock_feedback >> 3 ) & 0x01 )'
m['lock_ctrl_aux_ramp_enable_ctrl'].c_update='(float) (( g_lock_reg->lock_feedback >> 4 ) & 0x01 )'
m['lock_ctrl_aux_set_pidB_enable' ].c_update='(float) (( g_lock_reg->lock_feedback >> 5 ) & 0x01 )'
m['lock_ctrl_aux_set_pidA_enable' ].c_update='(float) (( g_lock_reg->lock_feedback >> 6 ) & 0x01 )'
m['lock_ctrl_aux_set_ramp_enable' ].c_update='(float) (( g_lock_reg->lock_feedback >> 7 ) & 0x01 )'
m['lock_ctrl_aux_trig_type'       ].c_update='(float) (( g_lock_reg->lock_feedback >> 8 ) & 0x03 )'
m['lock_ctrl_aux_lock_trig_rise'  ].c_update='(float) (( g_lock_reg->lock_feedback >>10 ) & 0x01 )'


m.add(name="lock_mod_sq_on"       , val=0 , max_val=1 , fpga_update=False, fpga_reg=None)
m.add(name="lock_mod_harmonic_on" , val=1 , max_val=1 , fpga_update=False, fpga_reg=None)
m['lock_mod_sq_on'      ].c_update=' params['+m['lock_mod_sq_on'      ].cdef+'].value '
m['lock_mod_harmonic_on'].c_update=' params['+m['lock_mod_harmonic_on'].cdef+'].value '




for r in [ y for y in filter(lambda x: ( x.c_update==None and x.fpga_reg!=None) , m) ]:
    r.c_update='(float)g_lock_reg->{:20s}'.format(r.fpga_reg)


for i in [ y  for y in filter(lambda x:  x.name[-3:]=='_28' , m) ]:
    i.name=i.name[:-3]

for r in f:
    if r.c_update==None:
        r.main_reg='lock_'+r.name
        r.c_update='(int)params[{:30s}].value'.format( m[r.main_reg].cdef )


f['lock_control'].c_update='(int) (\n'
for i,ii in enumerate([ 'lock_ctrl_aux_lock_now',
                        'lock_ctrl_aux_launch_lock_trig',
                        'lock_ctrl_aux_pidB_enable_ctrl',
                        'lock_ctrl_aux_pidA_enable_ctrl',
                        'lock_ctrl_aux_ramp_enable_ctrl',
                        'lock_ctrl_aux_set_pidB_enable',
                        'lock_ctrl_aux_set_pidA_enable',
                        'lock_ctrl_aux_set_ramp_enable',
                        'lock_ctrl_aux_trig_type']):
    f['lock_control'].c_update+=' '*43+'((int)params[{:30s}].value)   *  {:>4d}  + \n'.format(m[ii].cdef,2**i)
f['lock_control'].c_update+=' '*43+'((int)params[{:30s}].value)   *  {:>4d}  ) '.format(m['lock_ctrl_aux_lock_trig_rise'].cdef,2**10)



#%%

def main_update_params(indent=1):
    txt=txt_buff(n=indent)
    for r in [ y for y in filter(lambda x: ( x.fpga_reg!=None) , m) ]:
        if r.name =='lock_X':
            txt.add('lock_freeze_regs();')
        if r.name=='lock_error_std':
            txt.add('lock_error_var    = ((float) (g_lock_reg->error_std))/32 - pow(params[LOCK_ERROR_MEAN].value,2) ;')
        txt.add('params[{:3d}].value = {:40s} ; // {:s}'.format(r.index, r.c_update , r.name ))
        if r.name =='lock_cnt_clk2':
            txt.add('lock_restore_regs();')
    return txt.out()

# print(main_update_params())



def main_update_fpga(indent=1):
    txt=txt_buff(n=indent)
    for r in f:
        if r.rw:
            txt.add('g_lock_reg->{:25s} = {:25s};'.format(r.name,r.c_update) )
        else:
            txt.add_comment('g_lock_reg->{:25s} = {:25s};'.format(r.name,r.c_update) )
    return txt.out()

# print(main_update_fpga())



def main_fpga_regs_reset(indent=0):
    txt=txt_buff(n=indent)
    txt.add('/** Reset all LOCK */')
    txt.add('void reset_locks(void)')
    txt.add('{')
    txt.indent_plus()
    txt.add('if (g_lock_reg) {')
    txt.indent_plus()

    for r in f:
        txt.add('g_lock_reg->{:20s} ={:>7d};'.format(r.name,r.val) )

    txt.indent_minus()
    txt.add('}')
    txt.indent_minus()
    txt.add('}')
    return txt.out()


# print(main_fpga_regs_reset())


def main_fpga_regs_def(indent=0):
    txt=txt_buff(n=indent)
    txt.add('typedef struct lock_reg_t {')
    txt.nl()
    txt.indent_plus()

    for r in f:
        txt.add('/** @brief Offset {:s} - {:}'.format(r.addr,r.name))
        for j in r.desc.split('\n'):
            txt.add('  *  '+j)
        txt.add('  *')
        if r.nbits<32:
            txt.add('  *  bits [{:>2d}:{:>2d}] - Reserved'.format(31,r.nbits))
        if r.nbits==1:
            txt.add('  *  bit  [0]     - Data')
        else:
            txt.add('  *  bits [{:>2d}:{:>2d}] - Data'.format(r.nbits-1,0) )
        txt.add('  */')
        if r.signed:
            txt.add('int32_t  {:};'.format(r.name))
        else:
            txt.add('uint32_t {:};'.format(r.name))
        txt.nl()
    txt.indent_minus()
    txt.nl()
    txt.add('} lock_reg_t;')
    return txt.out()


# print(main_fpga_regs_def())



def main_def(indent=1):
    txt=txt_buff(n=indent)
    txt.nl()
    for r in m:
        if r.signed:
            r_min='{:>12s}'.format(hex(r.min)) if abs(r.min)>2147483647-1 else '{:>12d}'.format(r.min)
            r_max='{:>12s}'.format(hex(r.max)) if abs(r.max)>2147483647-1 else '{:>12d}'.format(r.max)
        else:
            r_min='{:>12s}'.format(hex(r.min)) if r.min>2147483647 else '{:>12d}'.format(r.min)
            r_max='{:>12s}'.format(hex(r.max)) if r.max>2147483647 else '{:>12d}'.format(r.max)
        txt.add('{{ {:32s},  {:>5d}, {:d}, {:d}, {:12s}, {:12s} }},'.format(
                '"'+r.name+'"',r.val , int(r.fpga_update) , int(r.ro), r_min, r_max
                )+' /** '+inline(r.desc)+' **/'
                )
    txt.nl()
    return txt.out()



# print(main_def())


def main_defh(indent=0):
    txt=txt_buff(n=indent)
    txt.nl()
    for r in m:
        txt.add('#define {:<30s}  {:>d}'.format(r.cdef,r.index)            )
    txt.nl()
    return txt.out()


# print(main_defh())

#%

from datetime import datetime
import re

def update_main(filename,dock,txt):
    """Update automatic parts in file DOCK place"""
    if type(dock)==str:
        dock=[dock]
    if type(txt)==str:
        txt=[txt]
    fn1=filename
    tmp=filename.split('.')
    tmp[-2]+='_'
    fn2='.'.join(tmp)

    with open(fn1, 'r') as input:
        with open(fn2, 'w') as output:
            out=''
            for line in input:
                for i,d in enumerate(dock):
                    if '// [{:s} DOCK]'.format(d) in line:
                        out=d
                        output.write(line)
                        output.write(txt[i])
                        if not txt[i][-1]=='\n':
                            output.write('\n')
                    if '// [{:s} DOCK END]'.format(d) in line and out==d:
                        out=''
                if out=='':
                    output.write(line)
    tnow=datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp=filename.split('.')
    tmp[-2]+='_'+tnow
    fn3='.'.join(tmp)

    os.rename(fn1,fn3)
    os.rename(fn2,fn1)

def replace_pattern(filename,pattern,txt):
    """Update automatic parts in file on pattern place"""
    if type(pattern)==str:
        pattern=[pattern]
    if type(txt)==str:
        txt=[txt]
    fn1=filename
    tmp=filename.split('.')
    tmp[-2]+='_'
    fn2='.'.join(tmp)

    with open(fn1, 'r') as input:
        with open(fn2, 'w') as output:
            for line in input:
                out=True
                for i,pat in enumerate(pattern):
                    if bool(re.match(pat,line)):
                        out=False
                        output.write(txt[i])
                        if not txt[i][-1]=='\n':
                            output.write('\n')
                        break
                if out:
                    output.write(line)
    tnow=datetime.now().strftime("%Y%m%d_%H%M%S_p")
    tmp=filename.split('.')
    tmp[-2]+='_'+tnow
    fn3='.'.join(tmp)

    os.rename(fn1,fn3)
    os.rename(fn2,fn1)


#%

if __name__ == '__main__' and do_main:
    print('do_main')
    if not os.path.isdir(folder):
        raise ValueError('"folder" variable should be the source code folder path.')
    os.chdir(folder)

    filename=APP+'/src/lock.c'
    update_main(filename , dock = ['PARAMSUPDATE'      , 'FPGAUPDATE'],
                           txt  = [main_update_params(), main_update_fpga()])

    filename=APP+'/src/fpga_lock.c'
    update_main(filename , dock = ['FPGARESET'],
                           txt  = [main_fpga_regs_reset()])


    filename=APP+'/src/fpga_lock.h'

    update_main(filename , dock = ['FPGAREG'],
                           txt  = [main_fpga_regs_def()])

    filename=APP+'/src/main.c'
    update_main(filename , dock = ['MAINDEF'],
                           txt  = [main_def()])

    filename=APP+'/src/main.h'
    update_main(filename , dock = ['MAINDEFH'],
                           txt  = [main_defh()])

    replace_pattern(filename , pattern = ['^#define[ ]+PARAMS_NUM[ ]+[0-9]+'],
                               txt     = [ '#define PARAMS_NUM        {:>3d}'.format(m[-1].index+1) ])







#%%   HTML registers


class html_register():
    """Register for FPGA module"""
    def __init__(self, name, val=0, rw=True,  min_val=0, max_val=0,
                 desc='todo', signed=False, fpga_update=True ,index=0,
                 input_type='input'):
        """Initialize attributes."""
        self.name        = name
        self.val         = val
        self.rw          = rw
        self.ro          = not rw
        self.index       = index
        self.i           = index
        self.min         = min_val
        self.max         = max_val
        self.desc        = desc
        self.fpga_update = fpga_update
        self.signed      = signed
        self.type        = input_type


class html_registers():
    def __init__(self,num_base=81):
        self.data  = []
        self.names = []
        self.len   = 0
        self.num_base=num_base
    def __getitem__(self, key):
        if type(key)==int:
            return self.data[key]
        if type(key)==str:
            return self.data[self.names.index(key)]
        if type(key)==slice:
            return self.data[key]

    def add(self, name, val=0, rw=True,  min_val=0, max_val=0, signed=False, desc='todo',
            fpga_update=True, c_update=None, fpga_reg=None):
        if type(name)==str:
            self.data.append(html_register(name=name, val=val, rw=rw,
                                           min_val=min_val, max_val=max_val, signed=signed,
                                           desc=desc, fpga_update=fpga_update ,
                                           input_type='input'))
            self.names.append(name)
            self.len = len(self.names)
        elif type(name)==main_register:
            self.data.append(html_register(name=name.name, val=name.val, rw=name.rw,
                                           min_val=name.min, max_val=name.max, signed=name.signed,
                                           desc=name.desc, fpga_update=name.fpga_update ,
                                           input_type='input'))
            self.names.append(name.name)
            self.len = len(self.names)
        self.data[-1].index=self.data[-1].i+self.num_base


h = html_registers(num_base=81)

for i in m:
    h.add(i)



#h.add(name='lock_mod_sq_on'      , val=0, rw=True, min_val=0 , max_val=1, signed=False, fpga_update=False, desc='Show Square Modulation')
#h.add(name='lock_mod_harmonic_on', val=1, rw=True, min_val=0 , max_val=1, signed=False, fpga_update=False, desc='Show Harmonic Modulation')



#%%

for r in h:
    if r.ro:
        r.type='none'
    else:
        if r.name[-3:]=='_sw' or r.max==15 or r.max==7 or r.max==3:
            r.type='select'
        elif r.max==1:
            r.type='checkbox'
        else:
            r.type='number'

if False:
    for r in h:
        print("h[{:32s}].type = '{:s}'".format("'"+r.name+"'",r.type))


h['lock_oscA_sw'                  ].type = 'select'
h['lock_oscB_sw'                  ].type = 'select'
h['lock_trig_sw'                  ].type = 'select'

if True:
    h['lock_osc1_filt_off'            ].type = 'checkbox'
    h['lock_osc2_filt_off'            ].type = 'checkbox'

h['lock_osc_raw_mode'             ].type = 'button'
h['lock_osc_lockin_mode'          ].type = 'button'

h['lock_out1_sw'                  ].type = 'select'
h['lock_out2_sw'                  ].type = 'select'
h['lock_slow_out1_sw'             ].type = 'select'
h['lock_slow_out2_sw'             ].type = 'select'
h['lock_slow_out3_sw'             ].type = 'select'
h['lock_slow_out4_sw'             ].type = 'select'

h['lock_lock_control'             ].type = 'none'

h['lock_lock_trig_val'            ].type = 'number'
h['lock_lock_trig_time_val'           ].type = 'number'
h['lock_lock_trig_sw'             ].type = 'select'

h['lock_rl_error_threshold'       ].type = 'number'
h['lock_rl_signal_threshold'      ].type = 'number'
h['lock_rl_signal_sw'             ].type = 'select'
h['lock_rl_error_enable'          ].type = 'checkbox'
h['lock_rl_signal_enable'         ].type = 'checkbox'
h['lock_rl_reset'                 ].type = 'checkbox'

h['lock_sf_jumpA'                 ].type = 'number'
h['lock_sf_jumpB'                 ].type = 'number'
h['lock_sf_start'                 ].type = 'button'
h['lock_sf_AfrzO'                 ].type = 'checkbox'
h['lock_sf_AfrzI'                 ].type = 'checkbox'
h['lock_sf_BfrzO'                 ].type = 'checkbox'
h['lock_sf_BfrzI'                 ].type = 'checkbox'

h['lock_signal_sw'                ].type = 'select'
h['lock_sg_amp1'                  ].type = 'select'
h['lock_sg_amp2'                  ].type = 'select'
h['lock_sg_amp3'                  ].type = 'select'
h['lock_sg_amp_sq'                ].type = 'select'
if True:
    h['lock_lpf_F1_tau'               ].type = 'select'
    h['lock_lpf_F1_order'             ].type = 'select'
    h['lock_lpf_F2_tau'               ].type = 'select'
    h['lock_lpf_F2_order'             ].type = 'select'
    h['lock_lpf_F3_tau'               ].type = 'select'
    h['lock_lpf_F3_order'             ].type = 'select'
    h['lock_lpf_sq_tau'               ].type = 'select'
    h['lock_lpf_sq_order'             ].type = 'select'
h['lock_error_sw'                 ].type = 'select'

h['lock_error_offset'             ].type = 'number'

h['lock_gen_mod_phase'            ].type = 'number'
h['lock_gen_mod_phase_sq'         ].type = 'number'

h['lock_gen_mod_hp'               ].type = 'number'
h['lock_gen_mod_sqp'              ].type = 'number'


h['lock_ramp_step'                ].type = 'number'
h['lock_ramp_low_lim'             ].type = 'number'
h['lock_ramp_hig_lim'             ].type = 'number'
h['lock_ramp_reset'               ].type = 'checkbox'
h['lock_ramp_enable'              ].type = 'checkbox'
h['lock_ramp_direction'           ].type = 'checkbox'
h['lock_ramp_B_factor'            ].type = 'number'


h['lock_pidA_sw'                  ].type = 'select'
h['lock_pidA_PSR'                 ].type = 'select'
h['lock_pidA_ISR'                 ].type = 'select'
h['lock_pidA_DSR'                 ].type = 'select'
h['lock_pidA_SAT'                 ].type = 'select'
h['lock_pidA_sp'                  ].type = 'number'
h['lock_pidA_kp'                  ].type = 'number'
h['lock_pidA_ki'                  ].type = 'number'
h['lock_pidA_kd'                  ].type = 'number'
if True:
    h['lock_pidA_irst'                ].type = 'checkbox'
    h['lock_pidA_freeze'              ].type = 'checkbox'
    h['lock_pidA_ifreeze'             ].type = 'checkbox'

h['lock_pidB_sw'                  ].type = 'select'
h['lock_pidB_PSR'                 ].type = 'select'
h['lock_pidB_ISR'                 ].type = 'select'
h['lock_pidB_DSR'                 ].type = 'select'
h['lock_pidB_SAT'                 ].type = 'select'
h['lock_pidB_sp'                  ].type = 'number'
h['lock_pidB_kp'                  ].type = 'number'
h['lock_pidB_ki'                  ].type = 'number'
h['lock_pidB_kd'                  ].type = 'number'
if True:
    h['lock_pidB_irst'                ].type = 'checkbox'
    h['lock_pidB_freeze'              ].type = 'checkbox'
    h['lock_pidB_ifreeze'             ].type = 'checkbox'

h['lock_aux_A'                    ].type = 'number'
h['lock_aux_B'                    ].type = 'number'

h['lock_ctrl_aux_lock_now'        ].type = 'button'
h['lock_ctrl_aux_launch_lock_trig'].type = 'button'
h['lock_ctrl_aux_pidB_enable_ctrl'].type = 'button'
h['lock_ctrl_aux_pidA_enable_ctrl'].type = 'button'
h['lock_ctrl_aux_ramp_enable_ctrl'].type = 'button'
h['lock_ctrl_aux_set_pidB_enable' ].type = 'checkbox'
h['lock_ctrl_aux_set_pidA_enable' ].type = 'checkbox'
h['lock_ctrl_aux_set_ramp_enable' ].type = 'checkbox'
h['lock_ctrl_aux_trig_type'       ].type = 'select'
h['lock_ctrl_aux_lock_trig_rise'  ].type = 'checkbox'


h['lock_mod_sq_on'        ].type = 'button'
h['lock_mod_harmonic_on'  ].type = 'button'


for r in h:
    r.control=None


#%%

#
#for i in [ y for y in filter( lambda x: x.type=='select' , h) ]:
#    print('cat index.html| grep \'<select\' | grep \'id="{:s}\''.format(i.name) )

# [ y.name for y in filter( lambda x: x.type=='select' , h) ]



class select():
    def __init__(self,idd,items=[],vals=[],default=0):
        self.id      = idd
        self.items   = items
        if len(vals)==0:
            vals=list(range(len(items)))
        self.vals    = vals
        self.default = m[idd].val
        self.enable  = [True]*len(vals)
        self.hide    = []
        self.hide_group = idd+'_hid'
        for i in range(len(vals)-len(items)):
            self.items.append('-')
            self.enable[-1-i]=False
    def __getitem__(self, key):
        if type(key)==int:
            return self.items[key]
        if type(key)==str:
            return self.items.index(key)
        if type(key)==slice:
            return self.items[key]
    def out(self,indent=1):
        txt=txt_buff(n=indent,tab=2)
        txt.add('<select id="{:s}" class="form-control">'.format(self.id))
        txt.indent_plus()
        for i,v in enumerate(self.vals):
            sel=' selected="selected"' if v==self.default else ''
            dtag = ' data-tag="{:}"'.format(self.hide_group) if (v in self.hide) else ' '
            if self.enable[i]:
                txt.add('<option'+dtag+' value="{:d}"{:s}>{:s}</option>'.format(v,sel,self.items[i]))
            else:
                txt.add('<!--option value="{:d}{:s}">{:s}</option-->'.format(v,sel,self.items[i]))
        txt.indent_minus()
        txt.add('</select>')
        return txt.out()
    def regex(self):
        return '[ ]*<select.*id=[\'"]+'+self.id+'[\'"]+[^>]+>.*'
    def regexend(self):
        return '[ ]*</select[ ]*>'


class input_number():
    def __init__(self,idd,val=0,minv=0, maxv=8192,step=1):
        if type(idd)==str:
            self.id      = idd
            self.val     = val
            self.min     = minv
            self.max     = maxv
            self.step    = step
        elif type(idd)==html_register:
            self.id      = idd.name
            self.val     = idd.val
            self.min     = idd.min
            self.max     = idd.max
            self.step    = 1
    def out(self,indent=1):
        txt=txt_buff(n=indent,tab=2)
        txt.add('<input type="number" autocomplete="off" class="form-control" '+
                'value="{:d}" id="{:s}" step="{:d}" min="{:d}" max="{:d}">'.format(
                    self.val , self.id  , self.step , self.min , self.max
                ))
        return txt.out()
    def regex(self):
        return '[ ]*<input.*id=[\'"]+'+self.id+'[\'"]+[^>]*>.*'
    def regexend(self):
        return '.*'

class input_checkbox():
    def __init__(self,idd,val=0,text=''):
        if type(idd)==str:
            self.id      = idd
            self.val     = val
            if text=='':
                text=self.id
            self.text    = text
        elif type(idd)==html_register:
            self.id      = idd.name
            self.val     = idd.val
            self.text    = idd.name
    def out(self,indent=1):
        txt=txt_buff(n=indent,tab=2)
        checked='' if self.val==0 else ' checked'
        txt.add('<input type="checkbox" id="'+self.id+'"'+checked+'>',end=False)
        txt.add(self.text)
        return txt.out()
    def regex(self):
        return '[ ]*<input.*id=[\'"]+'+self.id+'[\'"]+[^>]*>.*'
    def regexend(self):
        return '.*'


class input_button():
    def __init__(self,idd,val=0,text=''):
        if type(idd)==str:
            self.id      = idd
            self.val     = val
            if text=='':
                text=self.id
            self.text    = text
        elif type(idd)==html_register:
            self.id      = idd.name
            self.val     = idd.val
            self.text    = idd.name
    def out(self,indent=1):
        txt=txt_buff(n=indent,tab=2)
        checked='' if self.val==0 else ''
        txt.add('<button id="'+self.id+'" class="btn btn-primary btn-lg" data-checked="true" disabled>',end=False)
        txt.add(self.text,end=False)
        txt.add('</button>')
        return txt.out()
    def regex(self):
        return '[ ]*<button.*id=[\'"]+'+self.id+'[\'"]+[^>]*>.*'
    def regexend(self):
        return '.*'

#

#aaa=input_number(idd='lolo',val=10,minv=5,maxv=12)
#print(aaa.out())


## Print all number inputs
#numhtml=[]
#with open(filename, 'r') as input:
#    for line in input:
#        if bool(re.match('[ ]*<input.*id=[\'"]lock.*',line)) and bool(re.match('[ ]*<input.*number.*',line)):
#            #print(re.search('[ ]*(<input[^>]+>).*',line).group(1))
#            numhtml.append(re.search('[ ]*<input[^>]*id=[\'"]+(\w+)[\'"]+.*>.*',line).group(1))



# load controls for number inputs
for i in [ y.name for y in filter( lambda x: x.type=='number' , h) ]:
    h[i].control = input_number(idd=h[i])

# load controls for checkbox inputs
for i in [ y.name for y in filter( lambda x: x.type=='checkbox' , h) ]:
    h[i].control = input_checkbox(idd=h[i])

if True:
    h['lock_osc1_filt_off'].control.text='Ch1'
    h['lock_osc2_filt_off'].control.text='Ch2'
h['lock_ramp_reset'].control.text='Scan reset'
h['lock_ramp_enable'].control.text='Scan enable'
h['lock_ramp_direction'].control.text='Scan direction'
h['lock_pidA_irst'].control.text='reset integral'
h['lock_pidB_irst'].control.text='reset integral'


h['lock_rl_error_threshold'       ].control.text = 'Error Thr'
h['lock_rl_signal_threshold'      ].control.text = 'Signal Thr'
h['lock_rl_error_enable'          ].control.text = 'Error Enable'
h['lock_rl_signal_enable'         ].control.text = 'Signal Enable'
h['lock_rl_reset'                 ].control.text = 'RL reset'

h['lock_pidA_ifreeze'].control.text='freeze integral'
h['lock_pidB_ifreeze'].control.text='freeze integral'
h['lock_pidA_freeze'].control.text ='freeze out'
h['lock_pidB_freeze'].control.text ='freeze out'

h['lock_ctrl_aux_set_ramp_enable'].control.text='Scan enable'
h['lock_ctrl_aux_set_pidA_enable'].control.text='PID A enable'
h['lock_ctrl_aux_set_pidB_enable'].control.text='PID B enable'
h['lock_ctrl_aux_lock_trig_rise'].control.text='trig upward?'

# load controls for button inputs
for i in [ y.name for y in filter( lambda x: x.type=='button' , h) ]:
    h[i].control = input_button(idd=h[i])

h['lock_ctrl_aux_ramp_enable_ctrl'].control.text='Scan enable'
h['lock_ctrl_aux_pidA_enable_ctrl'].control.text='PID&nbsp;A enable'
h['lock_ctrl_aux_pidB_enable_ctrl'].control.text='PID&nbsp;B enable'
h['lock_ctrl_aux_launch_lock_trig'].control.text='Trigger<br>Lock'
h['lock_ctrl_aux_lock_now'        ].control.text='Lock<br>Now'

h['lock_osc_raw_mode'             ].control.text = 'Raw&nbsp;Mode'
h['lock_osc_lockin_mode'          ].control.text = 'R|Phase&nbsp;Mode'



h['lock_mod_sq_on'        ].control.text = 'Square'
h['lock_mod_harmonic_on'  ].control.text = 'Harmonic'

h['lock_sf_start'        ].control.text = 'Start Step Responce'

h['lock_sf_AfrzI'        ].control.text = 'A int'
h['lock_sf_AfrzO'        ].control.text = 'A out'
h['lock_sf_BfrzI'        ].control.text = 'B int'
h['lock_sf_BfrzO'        ].control.text = 'B out'




## Print all number inputs
#selhtml=[]
#with open(filename, 'r') as input:
#    for line in input:
#        if bool(re.match('[ ]*<select.*id=[\'"]lock.*',line)):
#            out=True
#            #print(re.search('[ ]*(<select[^>]+>).*',line).group(1))
#            #print(re.search('[ ]*<select[^>]*id=[\'"]+(\w+)[\'"]+.*>.*',line).group(1))
#            selhtml.append(re.search('[ ]*<select[^>]*id=[\'"]+(\w+)[\'"]+.*>.*',line).group(1))

## Print all checkbox inputs
#chkhtml=[]
#with open(filename, 'r') as input:
#    for line in input:
#        if bool(re.match('[ ]*<input.*id=[\'"]lock.*',line)) and bool(re.match('[ ]*<input.*checkbox.*',line)):
#            print(re.search('[ ]*(<input[^>]+>.*)',line).group(1))
#            chkhtml.append(re.search('[ ]*<input[^>]*id=[\'"]+(\w+)[\'"]+.*>.*',line).group(1))

#buthtml=[]
#with open(filename, 'r') as input:
#    for line in input:
#        if bool(re.match('[ ]*<button.*id=[\'"]lock.*',line)):
#            print(re.search('[ ]*(<button[^>]+>.*)',line).group(1))
#            buthtml.append(re.search('[ ]*<button[^>]*id=[\'"]+(\w+)[\'"]+.*>.*',line).group(1))

#for i in numhtml:
#    if not i in [ y.name for y in filter( lambda x: x.type=='number' , h) ]:
#        print(i)
#
#for i in [ y.name for y in filter( lambda x: x.type=='number' , h) ]:
#    if not i in numhtml:
#        print(i)
#
#for r in h:
#    if r.type=='number':
#        print(r.name)
#
#for r in h:
#    if r.type=='select':
#        print(r.name)
#

#
#for r in h:
#    if r.rw and not (r.name in selhtml or r.name in numhtml):
#        print(r.name+' '+ r.type + ' val=' + str(r.val))
#


#aaa=select(idd='lock_oscA_sw',
#           #vals  = list(range(32)),
#           items = ['0','in1','in2','sin_ref','cos_ref','sin_1f ','sin_2f',
#                    'sin_3f','sq_ref','sq_quad','sq_fase','ramp_signal',
#                    'Lock-in input','signal_a','Xo','Yo','F1','F2','F3',
#                    'sqx','sqy','sqf','pidA_in','pidB_in','pidA_out',
#                    'pidB_out','sq_ref_b','test14','PID A + scan','PID B + scan']
#           )

#for i in [ y.name for y in filter( lambda x: x.type=='select' , h) ]:
#    print('h["{:s}"].control = select(idd="{:s}",items=[])'.format(i,i))



#%%

#values=[
#         ['in1_m_in2[14-1:0]','in1-in2'],
#         ['pidA_out_cache','PID A out'],
#         ['pidB_out_cache','PID B out'],
#         ["14'b0",'0'],
#         ["{1'b0, sq_ref_b  , 12'b0  }",'sq_ref_b'],
#         ["14'b10000000000000",'0'],
#         ["{1'b0, sq_phas_b , 12'b0  }",'sq_phas_b'],
#         ['ramp_A','Scan A'],
#         ['ramp_A','Scan B'],
#         ['error_reg', 'error']
#     ]




def parse_sw(val):
    values=[
             ['in1_m_in2.*','in1-in2'],
             ['pid(\w)_out.*','PID \\1 out'],
             ["14'b1?0+\s*",'0'],
             [".*sq_([a-z]*)_b.*",'square \\1 (bin)'],
             ['ramp_(\w)','Ramp \\1'],
             ['error_\w*', 'error']
         ]
    for i in values:
        if bool(re.match(i[0],val)):
            return re.sub(i[0],i[1],val)
    return val



def get_muxer(filename,name):
    with open(filename, 'r') as input:
        out=False
        deep=0
        txt=[]
        sel=''
        for line in input:
            lin=line.strip(' \n\t')
            if '//' in lin:
                lin=lin[0:lin.find('//')]
            if bool(re.match('.*muxer.*\(',lin)):
                out=True
            if out:
                #print(lin)
                txt.append(lin)
                deep+=lin.count('(')-line.count(')')
            if out and deep==0:
                out=False
                tmp=''.join(txt)
                txt=[]
                if bool(re.match('.*sel *\( *'+name+' *\).*',tmp)):
                    sel=tmp
                #txt=[]
        txt=sel.split(')')
        ret=[]
        for i in txt:
            i=i.strip(' \n\t')
            if '.in' in i:
                ii=re.search('.*\((.*)',i)
                ret.append( parse_sw( ii.group(1).strip(' \n\t')  ))
        #print( '["' + '","'.join(ret) + '"]')
        return ret

if False:
    filename=APP+'/fpga/rtl/lock.v'
    print(get_muxer(filename,"slow_out1_sw"))
    print(get_muxer(filename,"lpf_F1"))
    print(get_muxer(filename,"sg_amp1"))
    print(get_muxer(filename,"oscA_sw"))
    print(get_muxer(filename,"oscB_sw"))
    print(get_muxer(filename,"pidA_sw"))
    print(get_muxer(filename,"signal_sw"))
    print(get_muxer(filename,"out1_sw"))

    for i in get_muxer(filename,"pidB_sw"):
        print('`'+i+'`,')




filename=APP+'/fpga/rtl/lock.v'
if not os.path.isdir(folder):
    raise ValueError('"folder" variable should be the source code folder path.')
os.chdir(folder)

for i in [ y.name for y in filter( lambda x: x.type=='select' , h) ]:
    if len(get_muxer(filename,i[5:] ))>0:
        h[i].control = select(idd=i , items=get_muxer(filename,i[5:] ) );
    else:
        print(i)



#%%
if False:
    # get_muxer(filename,"lock_trig_sw")
    h["lock_lock_trig_sw"].control = select(idd='lock_lock_trig_sw',
                 items=get_muxer(filename,"lock_trig_sw") );

    # get_muxer(filename,"signal_sw")
    h["lock_signal_sw"].control = select(idd="lock_signal_sw",
                 items=get_muxer(filename,"lock_trig_sw"))

    # get_muxer(filename,"oscA_sw")
    h["lock_oscA_sw"].control = select(idd="lock_oscA_sw",
                 items=["14'b0","in1","in2","sin_ref","cos_ref","sin_1f","sin_2f","sin_3f",
                        "sq_ref","sq_quad","sq_phas","ramp_A","signal_i","signal_i","Xo","Yo","F1o","F2o","F3o","sqXo","sqYo","sqFo","pidA_in","pidB_in","pidA_out_cache","pidB_out_cache","{1'b0, sq_ref_b  , 12'b0  }","test14","ctrl_A","ctrl_B","14'b0","14'b0"])

    # get_muxer(filename,"oscB_sw")
    h["lock_oscB_sw"].control = select(idd="lock_oscB_sw",
                 items=['0','in1','in2','sin_ref','cos_ref','sin_1f ','sin_2f','sin_3f',
                        'sq_ref','sq_quad','sq_fase','ramp_signal','Lock-in input','signal_a',
                        'Xo','Yo','F1','F2','F3','sqx','sqy','sqf','pidA_in','pidB_in',
                        'pidA_out','pidB_out','sq_ref_b','test14','PID A + ramp','PID B + ramp'])


    h["lock_out1_sw"].control = select(idd="lock_out1_sw",
                 items=['0','in1','in2','sin_ref','cos_ref','sin_1f ','sin_2f','sin_3f',
                        'sq_ref','sq_quad','sq_fase','ramp_signal','Lock-in input','signal_a',
                        'Xo','Yo','F1','F2','F3','sqx','sqy','sqf','pidA_in','pidB_in',
                        'pidA_out','pidB_out','sq_ref_b','test14','PID A + ramp','PID B + ramp','Aux A'])

    h["lock_out2_sw"].control = select(idd="lock_out2_sw",
                 items=['0','in1','in2','sin_ref','cos_ref','sin_1f ','sin_2f','sin_3f','sq_ref',
                        'sq_quad','sq_fase','ramp_signal','Lock-in input','signal_a','Xo','Yo',
                        'F1','F2','F3','sqx','sqy','sqf','pidA_in','pidB_in','pidA_out',
                        'pidB_out','sq_ref_b','test14','PID A + ramp','PID B + ramp','Aux B'])

    h["lock_slow_out1_sw"].control = select(idd="lock_slow_out1_sw",
                 items=['0','in1','in2','sin_ref','cos_ref','sin_1f ','sin_2f','sin_3f',
                        'sq_ref','sq_quad','sq_fase','ramp_signal','Lock-in input','signal_a'
                        ,'Xo','Yo','F1','F2','F3','sqx','sqy','sqf','pidA_in','pidB_in',
                        'pidA_out','pidB_out','sq_ref_b','test14','PID A + ramp','PID B + ramp'])


    h["lock_slow_out2_sw"].control = select(idd="lock_slow_out2_sw",
                 items=['0','in1','in2','sin_ref','cos_ref','sin_1f ','sin_2f','sin_3f',
                        'sq_ref','sq_quad','sq_fase','ramp_signal','Lock-in input','signal_a',
                        'Xo','Yo','F1','F2','F3','sqx','sqy','sqf','pidA_in','pidB_in',
                        'pidA_out','pidB_out','sq_ref_b','test14','PID A + ramp','PID B + ramp'])

    h["lock_slow_out3_sw"].control = select(idd="lock_slow_out3_sw",
                 items=['0','in1','in2','sin_ref','cos_ref','sin_1f ','sin_2f','sin_3f',
                        'sq_ref','sq_quad','sq_fase','ramp_signal','Lock-in input','signal_a'
                        ,'Xo','Yo','F1','F2','F3','sqx','sqy','sqf','pidA_in','pidB_in',
                        'pidA_out','pidB_out','sq_ref_b','test14','PID A + scan','PID B + scan'])


    h["lock_slow_out4_sw"].control = select(idd="lock_slow_out4_sw",
                 items=['0','in1','in2','sin_ref','cos_ref','sin_1f ','sin_2f','sin_3f',
                        'sq_ref','sq_quad','sq_fase','ramp_signal','Lock-in input','signal_a',
                        'Xo','Yo','F1','F2','F3','sqx','sqy','sqf','pidA_in','pidB_in',
                        'pidA_out','pidB_out','sq_ref_b','test14','PID A + scan','PID B + scan'])


    h["lock_test_sw"].control = select(idd="lock_test_sw",
                 items=['0','sin_ref_mult[27-1:13]','sin_ref_lpf2[27-1:13]','Xo',
                        'cos_ref_mult[27-1:13]','cos_ref_lpf2[27-1:13]','Yo','sin_1f_mult[27-1:13]',
                        'sin_1f_lpf2[27-1:13]','F1','sin_2f_mult[27-1:13]','sin_2f_lpf2[27-1:13]',
                        'F2','sin_3f_mult[27-1:13]','sin_3f_lpf2[27-1:13]','F3','sq_ref_mult[27-1:13]',
                        'sq_ref_lpf2[27-1:13]','sqx','sq_quad_mult[27-1:13]','sq_quad_lpf2[27-1:13]',
                        'sqy','Aux A','Aux B'])

    h["lock_pidA_sw"].control = select(idd="lock_pidA_sw",
                 items=['0','Xo','Yo','F1','F2','F3','sqx','sqy','sqf','signal_a','ramp_signal',
                        'sin_ref','cos_ref','sin_1f','sin_2f','sin_3f','sq_ref','sq_quad',
                        'sq_fase','aux_A','aux_B','test14','IN1','IN2','IN1-IN2'])

    h["lock_pidA_PSR"].control = select(idd="lock_pidA_PSR",items=['/1','/8','/64','/1024','/4096'])
    h["lock_pidA_ISR"].control = select(idd="lock_pidA_ISR",items=['8 ns','64 ns','512 ns','8 us','6 us','524 us','8 ms','67 ms','537 ms','9 s'])
    h["lock_pidA_DSR"].control = select(idd="lock_pidA_DSR",items=['7.5 ns','60 ns','480 ns','7.68 us','61.44 us','491.5 us'])
    h["lock_pidA_SAT"].control = select(idd="lock_pidA_SAT",items=['&plusmn;122uV','&plusmn;244uV','&plusmn;488uV','&plusmn;977uV','&plusmn;2mV','&plusmn;4mV','&plusmn;8mV','&plusmn;16mV','&plusmn;31mV','&plusmn;62mV','&plusmn;125mV','&plusmn;250mV','&plusmn;500mV','&plusmn;1 V'])

    h["lock_pidB_sw"].control = select(idd="lock_pidB_sw",
                 items=['0','Xo','Yo','F1','F2','F3','sqx','sqy','sqf','signal_a','ramp_signal',
                        'sin_ref','cos_ref','sin_1f','sin_2f','sin_3f','sq_ref','sq_quad',
                        'sq_fase','aux_A','aux_B','test14','IN1','IN2','IN1-IN2'])

    h["lock_pidB_PSR"].control = select(idd="lock_pidB_PSR",items=['/1','/8','/64','/1024','/4096'])
    h["lock_pidB_ISR"].control = select(idd="lock_pidB_ISR",items=['8 ns','64 ns','512 ns','8 us','6 us','524 us','8 ms','67 ms','537 ms','9 s'])
    h["lock_pidB_DSR"].control = select(idd="lock_pidB_DSR",items=['7.5 ns','60 ns','480 ns','7.68 us','61.44 us','491.5 us'])
    h["lock_pidB_SAT"].control = select(idd="lock_pidB_SAT",items=['&plusmn;122uV','&plusmn;244uV','&plusmn;488uV','&plusmn;977uV','&plusmn;2mV','&plusmn;4mV','&plusmn;8mV','&plusmn;16mV','&plusmn;31mV','&plusmn;62mV','&plusmn;125mV','&plusmn;250mV','&plusmn;500mV','&plusmn;1 V'])

    h["lock_LPF_A_sw"].control = select(idd="lock_LPF_A_sw",items=['in1','in2','in1_m_in2','sin_ref','sin_2f','sq_ref','ramp_signal','sq_ref_b','aux_A','Xo','pidA_out','pidB_out'])
    h["lock_LPF_B_sw"].control = select(idd="lock_LPF_B_sw",items=['in1','in2','in1_m_in2','sin_1f','sin_3f','sq_fase','ramp_signal','sq_quad_b','aux_B','F1','pidA_out','pidB_out'])

    h["lock_lpf_F1_aux"].control = select(idd="lock_lpf_F1_aux",items=['2nd order','1st order','None','OFF'])
    h["lock_lpf_F1_aux"].control.enable=[True, True, False, True]

    h["lock_lpf_F2_aux"].control = select(idd="lock_lpf_F2_aux",items=['2nd order','1st order','None','OFF'])
    h["lock_lpf_F2_aux"].control.enable=[True, True, False, True]

    h["lock_lpf_F3_aux"].control = select(idd="lock_lpf_F3_aux",items=['2nd order','1st order','None','OFF'])
    h["lock_lpf_F3_aux"].control.enable=[True, True, False, True]

    h["lock_lpf_sq_aux"].control = select(idd="lock_lpf_sq_aux",items=['2nd order','1st order','None','OFF'])
    h["lock_lpf_sq_aux"].control.enable=[True, True, False, True]


    h["lock_sg_amp_in"].control = select(idd="lock_sg_amp_in" ,items=['x1','x2','x4','x8','x16','x32','x64','x128','x256','x512'])
    h["lock_lpf_F1"   ].control = select(idd="lock_lpf_F1"    ,items=['131us |  7.6kHz','262us |  3.8kHz','524us |  1.9kHz','  1ms | 953.7 Hz','  2ms | 476.8 Hz','  4ms | 238.4 Hz','  8ms | 119.2 Hz',' 17ms | 59.6 Hz',' 34ms | 29.8 Hz',' 67ms | 14.9 Hz','134ms |  7.5 Hz','268ms |  3.7 Hz','537ms |  1.9 Hz','  1 s | 931.3mHz','  2 s | 465.7mHz','  4 s | 232.8mHz'])
    h["lock_lpf_F2"   ].control = select(idd="lock_lpf_F2"    ,items=['131us |  7.6kHz','262us |  3.8kHz','524us |  1.9kHz','  1ms | 953.7 Hz','  2ms | 476.8 Hz','  4ms | 238.4 Hz','  8ms | 119.2 Hz',' 17ms | 59.6 Hz',' 34ms | 29.8 Hz',' 67ms | 14.9 Hz','134ms |  7.5 Hz','268ms |  3.7 Hz','537ms |  1.9 Hz','  1 s | 931.3mHz','  2 s | 465.7mHz','  4 s | 232.8mHz'])
    h["lock_lpf_F3"   ].control = select(idd="lock_lpf_F3"    ,items=['131us |  7.6kHz','262us |  3.8kHz','524us |  1.9kHz','  1ms | 953.7 Hz','  2ms | 476.8 Hz','  4ms | 238.4 Hz','  8ms | 119.2 Hz',' 17ms | 59.6 Hz',' 34ms | 29.8 Hz',' 67ms | 14.9 Hz','134ms |  7.5 Hz','268ms |  3.7 Hz','537ms |  1.9 Hz','  1 s | 931.3mHz','  2 s | 465.7mHz','  4 s | 232.8mHz'])
    h["lock_lpf_sq"   ].control = select(idd="lock_lpf_sq"    ,items=['512ns |  2.0MHz','  1us | 976.6kHz','  2us | 488.3kHz','  4us | 244.1kHz','  8us | 122.1kHz',' 16us | 61.0kHz',' 33us | 30.5kHz',' 66us | 15.3kHz','131us |  7.6kHz','262us |  3.8kHz','524us |  1.9kHz','  1ms | 953.7 Hz','  2ms | 476.8 Hz','  4ms | 238.4 Hz','  8ms | 119.2 Hz',' 17ms | 59.6 Hz'])
    h["lock_LPF_A_tau"].control = select(idd="lock_LPF_A_tau" ,items=['  8.00 ns | 19.89 MHz  ',' 16.00 ns |  9.95 MHz  ',' 32.00 ns |  4.97 MHz  ',' 64.00 ns |  2.49 MHz  ','128.00 ns |  1.24 MHz  ','256.00 ns |621.70 kHz  ','512.00 ns |310.85 kHz  ','  1.02 us |155.42 kHz  ','  2.05 us | 77.71 kHz  ','  4.10 us | 38.86 kHz  ','  8.19 us | 19.43 kHz  ',' 16.38 us |  9.71 kHz  ',' 32.77 us |  4.86 kHz  ',' 65.54 us |  2.43 kHz  ','131.07 us |  1.21 kHz  ','262.14 us |607.13  Hz  ','524.29 us |303.56  Hz  ','  1.05 ms |151.78  Hz  ','  2.10 ms | 75.89  Hz  ','  4.19 ms | 37.95  Hz  ','  8.39 ms | 18.97  Hz  ',' 16.78 ms |  9.49  Hz  ',' 33.55 ms |  4.74  Hz  ',' 67.11 ms |  2.37  Hz  ','134.22 ms |  1.19  Hz  ','268.44 ms |592.90 mHz  ','536.87 ms |296.45 mHz  ','  1.07  s |148.22 mHz  ','  2.15  s | 74.11 mHz  ','  4.29  s | 37.06 mHz  ','  8.59  s | 18.53 mHz  ',' 17.18  s |  9.26 mHz  '])
    h["lock_LPF_B_tau"].control = select(idd="lock_LPF_B_tau" ,items=['  8.00 ns | 19.89 MHz  ',' 16.00 ns |  9.95 MHz  ',' 32.00 ns |  4.97 MHz  ',' 64.00 ns |  2.49 MHz  ','128.00 ns |  1.24 MHz  ','256.00 ns |621.70 kHz  ','512.00 ns |310.85 kHz  ','  1.02 us |155.42 kHz  ','  2.05 us | 77.71 kHz  ','  4.10 us | 38.86 kHz  ','  8.19 us | 19.43 kHz  ',' 16.38 us |  9.71 kHz  ',' 32.77 us |  4.86 kHz  ',' 65.54 us |  2.43 kHz  ','131.07 us |  1.21 kHz  ','262.14 us |607.13  Hz  ','524.29 us |303.56  Hz  ','  1.05 ms |151.78  Hz  ','  2.10 ms | 75.89  Hz  ','  4.19 ms | 37.95  Hz  ','  8.39 ms | 18.97  Hz  ',' 16.78 ms |  9.49  Hz  ',' 33.55 ms |  4.74  Hz  ',' 67.11 ms |  2.37  Hz  ','134.22 ms |  1.19  Hz  ','268.44 ms |592.90 mHz  ','536.87 ms |296.45 mHz  ','  1.07  s |148.22 mHz  ','  2.15  s | 74.11 mHz  ','  4.29  s | 37.06 mHz  ','  8.59  s | 18.53 mHz  ',' 17.18  s |  9.26 mHz  '])


h['lock_trig_sw'  ].control = select(idd="lock_trig_sw"   ,
                     items=['None', 'Pin','Scan floor','Scan ceil','harmonic mod.','Square mod.','Out of lock'  ,'Jump trigger','Lock control trig'],
                     vals =[    0 ,    1 ,          2 ,         4 ,             8 ,          16 ,            32 ,           64 ,               128  ]
                     )

h["lock_sg_amp1"  ].control = select(idd="lock_sg_amp1"   ,items=['x1','x2','x4','x8','x16','x32','x64','x128','x256','x512'])
h["lock_sg_amp2"  ].control = select(idd="lock_sg_amp2"   ,items=['x1','x2','x4','x8','x16','x32','x64','x128','x256','x512'])
h["lock_sg_amp3"  ].control = select(idd="lock_sg_amp3"   ,items=['x1','x2','x4','x8','x16','x32','x64','x128','x256','x512'])
h["lock_sg_amp_sq"].control = select(idd="lock_sg_amp_sq" ,items=['x1','x2','x4','x8','x16','x32','x64','x128','x256','x512'])

h["lock_lpf_F1_tau"   ].control = select(idd="lock_lpf_F1_tau"    ,items=['131us |  7.6kHz','262us |  3.8kHz','524us |  1.9kHz','  1ms | 953.7 Hz','  2ms | 476.8 Hz','  4ms | 238.4 Hz','  8ms | 119.2 Hz',' 17ms | 59.6 Hz',' 34ms | 29.8 Hz',' 67ms | 14.9 Hz','134ms |  7.5 Hz','268ms |  3.7 Hz','537ms |  1.9 Hz','  1 s | 931.3mHz','  2 s | 465.7mHz','  4 s | 232.8mHz'])
h["lock_lpf_F2_tau"   ].control = select(idd="lock_lpf_F2_tau"    ,items=['131us |  7.6kHz','262us |  3.8kHz','524us |  1.9kHz','  1ms | 953.7 Hz','  2ms | 476.8 Hz','  4ms | 238.4 Hz','  8ms | 119.2 Hz',' 17ms | 59.6 Hz',' 34ms | 29.8 Hz',' 67ms | 14.9 Hz','134ms |  7.5 Hz','268ms |  3.7 Hz','537ms |  1.9 Hz','  1 s | 931.3mHz','  2 s | 465.7mHz','  4 s | 232.8mHz'])
h["lock_lpf_F3_tau"   ].control = select(idd="lock_lpf_F3_tau"    ,items=['131us |  7.6kHz','262us |  3.8kHz','524us |  1.9kHz','  1ms | 953.7 Hz','  2ms | 476.8 Hz','  4ms | 238.4 Hz','  8ms | 119.2 Hz',' 17ms | 59.6 Hz',' 34ms | 29.8 Hz',' 67ms | 14.9 Hz','134ms |  7.5 Hz','268ms |  3.7 Hz','537ms |  1.9 Hz','  1 s | 931.3mHz','  2 s | 465.7mHz','  4 s | 232.8mHz'])
h["lock_lpf_sq_tau"   ].control = select(idd="lock_lpf_sq_tau"    ,items=['512ns |  2.0MHz','  1us | 976.6kHz','  2us | 488.3kHz','  4us | 244.1kHz','  8us | 122.1kHz',' 16us | 61.0kHz',' 33us | 30.5kHz',' 66us | 15.3kHz','131us |  7.6kHz','262us |  3.8kHz','524us |  1.9kHz','  1ms | 953.7 Hz','  2ms | 476.8 Hz','  4ms | 238.4 Hz','  8ms | 119.2 Hz',' 17ms | 59.6 Hz'])

h["lock_lpf_F1_order"   ].control = select(idd="lock_lpf_F1_order"    ,items=['OFF', '1', '2'])
h["lock_lpf_F2_order"   ].control = select(idd="lock_lpf_F2_order"    ,items=['OFF', '1', '2'])
h["lock_lpf_F3_order"   ].control = select(idd="lock_lpf_F3_order"    ,items=['OFF', '1', '2'])
h["lock_lpf_sq_order"   ].control = select(idd="lock_lpf_sq_order"    ,items=['OFF', '1', '2'])

h["lock_pidA_PSR"].control = select(idd="lock_pidA_PSR",items=['/1','/8','/64','/1024','/4096'])
h["lock_pidA_ISR"].control = select(idd="lock_pidA_ISR",items=['8 ns','64 ns','512 ns','8 us','6 us','524 us','8 ms','67 ms','537 ms','9 s'])
h["lock_pidA_DSR"].control = select(idd="lock_pidA_DSR",items=['7.5 ns','60 ns','480 ns','7.68 us','61.44 us','491.5 us'])
h["lock_pidA_SAT"].control = select(idd="lock_pidA_SAT",items=['&plusmn;122uV','&plusmn;244uV','&plusmn;488uV','&plusmn;977uV','&plusmn;2mV','&plusmn;4mV','&plusmn;8mV','&plusmn;16mV','&plusmn;31mV','&plusmn;62mV','&plusmn;125mV','&plusmn;250mV','&plusmn;500mV','&plusmn;1 V'])

h["lock_pidB_PSR"].control = select(idd="lock_pidB_PSR",items=['/1','/8','/64','/1024','/4096'])
h["lock_pidB_ISR"].control = select(idd="lock_pidB_ISR",items=['8 ns','64 ns','512 ns','8 us','6 us','524 us','8 ms','67 ms','537 ms','9 s'])
h["lock_pidB_DSR"].control = select(idd="lock_pidB_DSR",items=['7.5 ns','60 ns','480 ns','7.68 us','61.44 us','491.5 us'])
h["lock_pidB_SAT"].control = select(idd="lock_pidB_SAT",items=['&plusmn;122uV','&plusmn;244uV','&plusmn;488uV','&plusmn;977uV','&plusmn;2mV','&plusmn;4mV','&plusmn;8mV','&plusmn;16mV','&plusmn;31mV','&plusmn;62mV','&plusmn;125mV','&plusmn;250mV','&plusmn;500mV','&plusmn;1 V'])

h["lock_ctrl_aux_trig_type"].control = select(idd="lock_ctrl_aux_trig_type",items=['OFF','Time trigger','Level Trigger','Level+time Trigger'])


# h['lock_oscA_sw'].control.items =

# Hide some intems for advance options
if False:
    for i,v in enumerate(h['lock_pidA_sw'].control.items):
        print('{:2d} {:}'.format(i,v))

h['lock_oscA_sw'].control.enable = [True]*30 + [False]*2
h['lock_oscB_sw'].control.enable = [True]*30 + [False]*2

h['lock_pidA_sw'].control.enable = [True]*25 + [False]*7
h['lock_pidB_sw'].control.enable = [True]*25 + [False]*7

h['lock_pidA_sw'].control.hide = list(range(1,9))+list(range(10,22))
h['lock_pidB_sw'].control.hide = list(range(1,9))+list(range(10,22))


h['lock_pidA_sw'].control.hide_group = 'pidA_more'
h['lock_pidB_sw'].control.hide_group = 'pidB_more'


h["lock_signal_sw"].control.enable = [True]*12+[False]*4


#%%


#update_html(filename,h)

#
#test='[ ]*<select.*id=[\'"]+'+'lock_LPF_B_tau'+'[\'"]+[^>]+>.*'
#
#with open(filename, 'r') as input:
#    out=False
#    for line in input:
#        if bool(re.match(test,line)):
#            out=True
#        if bool(re.match('[ ]*</select.*',line)) and out==True:
#            out=False
#            print(line,end='')
#        if out:
#            print('\'',end='')
#            print(re.search('[ ]*<option[ ]*value="(\d+)"[^>]*>([^<]*)</option>.*|$',line).group(2),end='')
#            print('\',',end='')
#            #print(line)
#    print('')
#

if False:
    test='[ ]*<select.*id=[\'"]+'+'lock_ctrl_aux_trig_type'+'[\'"]+[^>]+>.*'
    ll="  config_params_txts = 'xmin,xmax,trig_mode,trig_source,trig_edge,trig_delay,trig_level,time_range,time_units,en_avg_at_dec,min_y,'+"
    bool(re.match(' *config_params_txts *=',ll))






if False:
    fn1=APP+'/index.html'
    with open(fn1, 'r') as input:
        out=False
        for line in input:
            if bool(re.match(' *config_params_txts *=',line)):
                out=True
            if out:
                print(line.strip('\n'))
            if ';' in line:
                out=False





class html_global_config():
    def __init__(self,regex_start,regex_end,text):
        self.regex_start   = regex_start
        self.regex_end     = regex_end
        if type(text)==str:
            self.text      = text.split('\n')
        elif type(text)==list:
            self.text      = text
        else:
            self.text      = 'ERROR'
            print('ERROR html_global_configs')
    def out(self,indent=1):
        txt=txt_buff(n=indent,tab=2)
        for i in self.text:
            txt.add(i)
        return txt.out()
    def regex(self):
        return self.regex_start
    def regexend(self):
        return self.regex_end


html_global_configs=[]

if True:  # config_params_txts  ***********************************************
    txt=[]
    txt.append("config_params_txts = 'xmin,xmax,trig_mode,trig_source,trig_edge,trig_delay,trig_level,time_range,time_units,en_avg_at_dec,min_y,'+")
    txt.append(' '*21+"'max_y,prb_att_ch1,gain_ch1,prb_att_ch2,gain_ch2,gui_xmin,gui_xmax,'+")
    tmp=' '*21+"'"
    for i in [ y.name for y in filter( lambda x: x.rw , h) ]:
        tmp += i+","
        if len(tmp)>130:
            tmp+="'+"
            txt.append(tmp)
            tmp=' '*21+"'"
    if len(tmp)>25:
        tmp=tmp[0:-1]
        tmp+="';"
        txt.append(tmp)
    else:
        txt[-1]=txt[-1][0:-3]+"';"
    txt=('\n'.join(txt))

html_global_configs.append(
        html_global_config( regex_start = ' *config_params_txts *=',
                            regex_end   = '.*;.*',
                            text        = txt )
        )

if True:  # input_checkboxes  *************************************************
    txt=[]
    tmp="var input_checkboxes = '"
    for i in [ '#'+y.name for y in filter( lambda x: x.type=='checkbox' , h) ]:
        tmp += i+","
        if len(tmp)>130:
            tmp+="'+"
            txt.append(tmp)
            tmp=' '*23+"'"
    if len(tmp)>25:
        tmp=tmp[0:-1]
        tmp+="';"
        txt.append(tmp)
    else:
        txt[-1]=txt[-1][0:-3]+"';"
    txt=('\n'.join(txt))

html_global_configs.append(
        html_global_config( regex_start = ' *var *input_checkboxes *=',
                            regex_end   = '.*;.*',
                            text        =  txt)
        )

if True:  # input_select  *************************************************
    txt=[]
    tmp="var switches=["
    for i in [ "'#"+y.name+"'" for y in filter( lambda x: x.type=='select' , h) ]:
        tmp += i+","
        if len(tmp)>130:
            txt.append(tmp)
            tmp=' '*14
    if len(tmp)>16:
        tmp=tmp[0:-1]
        tmp+="];"
        txt.append(tmp)
    else:
        txt[-1]=txt[-1][0:-1]+"];"
    txt=('\n'.join(txt))

html_global_configs.append(
        html_global_config( regex_start = ' *var *switches *= *\[',
                            regex_end   = '.*\] *;.*',
                            text        =  txt)
        )


if True:  # input_buttons  *************************************************
    txt=[]
    tmp="var input_buttons = '"
    for i in [ '#'+y.name for y in filter( lambda x: x.type=='button' , h) ]:
        tmp += i+","
        if len(tmp)>130:
            tmp+="'+"
            txt.append(tmp)
            tmp=' '*20+"'"
    if len(tmp)>22:
        tmp=tmp[0:-1]
        tmp+="';"
        txt.append(tmp)
    else:
        txt[-1]=txt[-1][0:-3]+"';"
    txt=('\n'.join(txt))

html_global_configs.append(
        html_global_config( regex_start = ' *var *input_buttons *=',
                            regex_end   = '.*;.*',
                            text        =  txt)
        )


if True:  # input_number  *************************************************
    txt=[]
    tmp="var input_number=["
    for i in [ "'"+y.name+"'" for y in filter( lambda x: x.type=='number' , h) ]:
        tmp += i+","
        if len(tmp)>130:
            tmp+=" "
            txt.append(tmp)
            tmp=' '*18
    if len(tmp)>20:
        tmp=tmp[0:-1]
        tmp+="];"
        txt.append(tmp)
    else:
        txt[-1]=txt[-1][0:-2]+"];"
    txt=('\n'.join(txt))

html_global_configs.append(
        html_global_config( regex_start = ' *var *input_number *= *\[',
                            regex_end   = '.*\] *;.*',
                            text        =  txt)
        )



if True:  # LOADPARAMS  *************************************************
    txt=[]

    txt.append('// [LOLO DOCK LOADPARAMS]')

    txt.append('// Checkboxes')
    max_len=3+max([ len(y.name) for y in filter( lambda x: x.type=='checkbox' , h) ])
    for i in [ y.name for y in filter( lambda x: x.type=='checkbox' , h) ]:
        tmp="$({:<"+str(max_len)+"s}).prop('checked', (params.original.{:<"+str(max_len)+"s} ? true : false));"
        txt.append( tmp.format( "'#"+i+"'" , i ) )
    txt.append('')

    txt.append('// Numbers')
    max_len=3+max([ len(y.name) for y in filter( lambda x: x.type=='number' , h) ])
    for i in [ y.name for y in filter( lambda x: x.type=='number' , h) ]:
        tmp="$({:<"+str(max_len)+"s}).val(params.original.{:<"+str(max_len)+"s});"
        txt.append( tmp.format( "'#"+i+"'" , i ) )
    txt.append('')

    txt.append('// Switches')
    max_len=3+max([ len(y.name) for y in filter( lambda x: x.type=='select' , h) ])
    for i in [ y.name for y in filter( lambda x: x.type=='select' , h) ]:
        tmp="$({:<"+str(max_len)+"s}).val(params.original.{:<"+str(max_len)+"s});"
        txt.append( tmp.format( "'#"+i+"'" , i ) )
    txt.append('')

    txt.append('// Buttons')
    for i in [ y.name for y in filter( lambda x: x.type=='button' , h) ]:
        txt.append( ("if (params.original."+i+"){").ljust(55)+" // "+i )
        txt.append( "  $('#"+i+"').removeClass('btn-default').addClass('btn-primary').data('checked',true);" )
        txt.append( "}else{" )
        txt.append( "  $('#"+i+"').removeClass('btn-primary').addClass('btn-default').data('checked',false);" )
        txt.append( "}" )
    txt.append('')

    txt.append('// [LOLO DOCK LOADPARAMS END]')

    txt=('\n'.join(txt))
    #print(txt)

html_global_configs.append(
        html_global_config( regex_start = ' *// *\[LOLO DOCK LOADPARAMS\].*',
                            regex_end   = '.*// *\[LOLO DOCK LOADPARAMS END\].*',
                            text        =  txt)
        )




# ['button', 'checkbox', 'none', 'number', 'select']




#with open(filename, 'r') as input:
#    out=False
#    for line in input:
#        if bool(re.match(test,line)):
#            out=True
#            print(line)
#            print(len( re.search('^([ ]*)[^ ]+',line).group(1) ))
#        if bool(re.match('[ ]*</select.*',line)) and out==True:
#            out=False
#            print(line,end='')
#            #print(line)
#    print('')
#

#%% Update HTML

def update_html(filename,h):
    """Update automatic parts in file on pattern place"""
    fn1=filename
    tmp=filename.split('.')
    tmp[-2]+='_'
    fn2='.'.join(tmp)

    with open(fn1, 'r') as input:
        with open(fn2, 'w') as output:
            out=''
            for line in input:
                if out=='':
                    config_list=[ y.control for y in filter( lambda x: x.control!=None , h) ]
                    config_list.extend(html_global_configs)
                    for c in config_list:
                        if bool(re.match(c.regex(),line)):
                            out=c.regexend()
                            indent=int(ceil(len( re.search('^([ ]*)[^ ]+',line).group(1) )/2))
                            output.write( c.out(indent=indent) )
                            break
                if out=='':
                    output.write(line)
                elif bool(re.match(out,line)):
                    out=''

    tnow=datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp=filename.split('.')
    tmp[-2]+='_'+tnow
    fn3='.'.join(tmp)

    os.rename(fn1,fn3)
    os.rename(fn2,fn1)



#os.chdir(folder)
filename=APP+'/index.html'

if __name__ == '__main__' and do_html:
    print('do_html')
    if not os.path.isdir(folder):
        raise ValueError('"folder" variable should be the source code folder path.')
    os.chdir(folder)
    update_html(filename,h)





#%%






def update_py(filename,h):
    """Update automatic parts in file on pattern place"""
    fn1=filename
    tmp=filename.split('.')
    tmp[-2]+='_'
    fn2='.'.join(tmp)

    with open(fn1, 'r') as input:
        with open(fn2, 'w') as output:
            out=''
            for line in input:
                if out=='':
                    config_list=h
                    for c in config_list:
                        if bool(re.match(c.regex(),line)):
                            out=c.regexend()
                            indent=int(ceil(len( re.search('^([ ]*)[^ ]+',line).group(1) )/2))
                            output.write( c.out(indent=indent) )
                            break
                if out=='':
                    output.write(line)
                elif bool(re.match(out,line)):
                    out=''

    tnow=datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp=filename.split('.')
    tmp[-2]+='_'+tnow
    fn3='.'.join(tmp)

    os.rename(fn1,fn3)
    os.rename(fn2,fn1)





py_global_config=[]

if False:
    tmp=''
    txt=[]
    txt.append('# [LOLO DOCK]')
    txt.append('nombres=[')
    for i in [ y.name for y in f ]:
        tmp += "'"+i+"',"
        if len(tmp)> 70:
            txt.append(tmp)
            tmp=''
    txt.append(tmp)
    txt[-1]=txt[-1][0:-1]
    txt.append('];')
    txt.append('# [LOLO DOCK END]')
    #print('\n'.join(txt))

    py_global_config.append(
            html_global_config( regex_start = ' *# *\[LOLO DOCK\] *',
                                regex_end   = ' *# *\[LOLO DOCK END\]',
                                text        = txt )
            )

if False:
    tmp=''
    txt=[]
    txt.append('# [LOLOSET DOCK]')
    txt.append('num={')
    for i in [ y for y in f ]:
        tmp += "'"+i.name+"':{:d},".format(i.i)
        if len(tmp)> 70:
            txt.append(tmp)
            tmp=''
    txt.append(tmp)
    txt[-1]=txt[-1][0:-1]
    txt.append('};')
    txt.append('')
    tmp=''
    txt.append('rw={')
    for i in [ y for y in f ]:
        tmp += "'"+i.name+"':{:d},".format(int(i.rw))
        if len(tmp)> 70:
            txt.append(tmp)
            tmp=''
    txt.append(tmp)
    txt[-1]=txt[-1][0:-1]
    txt.append('};')
    txt.append('# [LOLOSET DOCK END]')
    #print('\n'.join(txt))

    py_global_config.append(
            html_global_config( regex_start = ' *# *\[LOLOSET DOCK\] *',
                                regex_end   = ' *# *\[LOLOSET DOCK END\]',
                                text        = txt )
            )


py_global_config.append(
        html_global_config( regex_start = ' *# *\[REGSET DOCK\] *',
                            regex_end   = ' *# *\[REGSET DOCK END\]',
                            text        = '# [REGSET DOCK]\n'+f.print_hugo(ret=True)+'# [REGSET DOCK END]\n' )
        )

#os.chdir(folder)

if __name__ == '__main__' and do_py:
    print('do_py')
    if not os.path.isdir(folder):
        raise ValueError('"folder" variable should be the source code folder path.')
    os.chdir(folder)
    #update_py('resources/rp_cmds/py/ver_mem.py',py_global_config)
    #update_py('resources/rp_cmds/py/set.py',py_global_config)
    #update_py('lresources/rp_cmds/py/data_dump.py',py_global_config)
    update_py(f'{APP}/py/hugo.py',py_global_config)
