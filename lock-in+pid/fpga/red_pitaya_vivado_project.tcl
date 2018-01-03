################################################################################
# Vivado tcl script for building RedPitaya FPGA in non project mode
#
# Usage:
# vivado -mode batch -source red_pitaya_vivado_project.tcl
################################################################################

################################################################################
# define paths
################################################################################

set path_rtl rtl
set path_ip  ip
set path_sdc sdc

################################################################################
# setup an in memory project
################################################################################

set part xc7z010clg400-1

create_project -part $part -force redpitaya ./project

################################################################################
# create PS BD (processing system block design)
################################################################################

# create PS BD
source                            $path_ip/system_bd.tcl

# generate SDK files
generate_target all [get_files    system.bd]

################################################################################
# read files:
# 1. RTL design sources
# 2. IP database files
# 3. constraints
################################################################################

read_verilog                      .srcs/sources_1/bd/system/hdl/system_wrapper.v

add_files                         $path_rtl/axi_master.v
add_files                         $path_rtl/axi_slave.v
add_files                         $path_rtl/axi_wr_fifo.v

add_files                         $path_rtl/red_pitaya_ams.v
add_files                         $path_rtl/red_pitaya_asg_ch.v
add_files                         $path_rtl/red_pitaya_asg.v
add_files                         $path_rtl/red_pitaya_dfilt1.v
add_files                         $path_rtl/red_pitaya_hk.v
add_files                         $path_rtl/red_pitaya_pid_block.v
add_files                         $path_rtl/red_pitaya_pid.v
add_files                         $path_rtl/red_pitaya_pll.sv
add_files                         $path_rtl/red_pitaya_ps.v
add_files                         $path_rtl/red_pitaya_pwm.sv
add_files                         $path_rtl/red_pitaya_scope.v
add_files                         $path_rtl/red_pitaya_top.v

add_files                      $path_rtl/lock.v
add_files                      $path_rtl/lock/aDACdecoder.v
add_files                      $path_rtl/lock/LP_filter.v
add_files                      $path_rtl/lock/LP_filter2.v
#add_files                      $path_rtl/lock/LP_filter2_pipe.v
add_files                      $path_rtl/lock/LP_filter3.v
#add_files                      $path_rtl/lock/LP_filter3_pipe.v
add_files                      $path_rtl/lock/mult_dsp_14.v
add_files                      $path_rtl/lock/sq_mult.v
add_files                      $path_rtl/lock/muxer3.v
add_files                      $path_rtl/lock/muxer4.v
add_files                      $path_rtl/lock/muxer5.v
add_files                      $path_rtl/lock/muxer_reg3.v
add_files                      $path_rtl/lock/muxer_reg4.v
add_files                      $path_rtl/lock/muxer_reg5.v
#add_files                      $path_rtl/lock/gen_mod.v
add_files                      $path_rtl/lock/gen_mod2.v
add_files                      $path_rtl/lock/gen_ramp.v
add_files                      $path_rtl/lock/gen_ramp_relock.v
add_files                      $path_rtl/lock/lock_ctrl.v
add_files                      $path_rtl/lock/lock_pid_block.v
add_files                      $path_rtl/lock/slope9.v
add_files                      $path_rtl/lock/sat14.v
add_files                      $path_rtl/lock/satprotect.v
#add_files                      $path_rtl/lock/UniversalCounter.v
add_files                      $path_rtl/lock/trigger_input.v
add_files                      $path_rtl/lock/jump_control.v
#add_files                      $path_rtl/lock/sum_2N.v
add_files                      $path_rtl/lock/sum_2N2.v
add_files                      $path_rtl/lock/pipe_mult.v
add_files                      $path_rtl/lock/debounce.v


add_files -fileset constrs_1      $path_sdc/red_pitaya.xdc

import_files -force

update_compile_order -fileset sources_1

################################################################################
################################################################################

#start_gui



synth_design -top red_pitaya_top \
             -flatten_hierarchy rebuilt \
             -bufg 12 \
             -fanout_limit 400 \
             -fsm_extraction  one_hot \
             -keep_equivalent_registers \
             -resource_sharing off \
             -no_lc \
             -shreg_min_size 5

opt_design
power_opt_design
place_design
phys_opt_design


route_design
