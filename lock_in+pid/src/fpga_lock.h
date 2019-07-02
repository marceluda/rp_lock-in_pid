/**
 * @brief Red Pitaya LOCK FPGA controller.
 *
 * @Author Marcelo Luda <marceluda@gmail.com>
 *
 *
 *
 * This part of code is written in C programming language.
 * Please visit http://en.wikipedia.org/wiki/C_(programming_language)
 * for more details on the language used herein.
 */

#ifndef _FPGA_LOCK_H_
#define _FPGA_LOCK_H_

#include <stdint.h>

/** @defgroup fpga_lock_h LOCK Controller
 * @{
 */

/** Base LOCK FPGA address */
#define LOCK_BASE_ADDR 0x40600000
/** Base LOCK FPGA core size */
#define LOCK_BASE_SIZE 0x190

/** @brief LOCK FPGA registry structure.
 *
 * This structure is direct image of physical FPGA memory. When accessing it all
 * reads/writes are performed directly from/to FPGA LOCK registers.
 */
// [FPGAREG DOCK]
typedef struct lock_reg_t {

    /** @brief Offset 20'h00000 - oscA_sw
      *  switch for muxer oscA
      *
      *  bits [31: 5] - Reserved
      *  bits [ 4: 0] - Data
      */
    uint32_t oscA_sw;
    
    /** @brief Offset 20'h00004 - oscB_sw
      *  switch for muxer oscB
      *
      *  bits [31: 5] - Reserved
      *  bits [ 4: 0] - Data
      */
    uint32_t oscB_sw;
    
    /** @brief Offset 20'h00008 - osc_ctrl
      *  oscilloscope control
      *  [osc2_filt_off,osc1_filt_off]
      *
      *  bits [31: 2] - Reserved
      *  bits [ 1: 0] - Data
      */
    uint32_t osc_ctrl;
    
    /** @brief Offset 20'h0000C - trig_sw
      *  Select the external trigger signal
      *
      *  bits [31: 8] - Reserved
      *  bits [ 7: 0] - Data
      */
    uint32_t trig_sw;
    
    /** @brief Offset 20'h00010 - out1_sw
      *  switch for muxer out1
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t out1_sw;
    
    /** @brief Offset 20'h00014 - out2_sw
      *  switch for muxer out2
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t out2_sw;
    
    /** @brief Offset 20'h00018 - slow_out1_sw
      *  switch for muxer slow_out1
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t slow_out1_sw;
    
    /** @brief Offset 20'h0001C - slow_out2_sw
      *  switch for muxer slow_out2
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t slow_out2_sw;
    
    /** @brief Offset 20'h00020 - slow_out3_sw
      *  switch for muxer slow_out3
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t slow_out3_sw;
    
    /** @brief Offset 20'h00024 - slow_out4_sw
      *  switch for muxer slow_out4
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t slow_out4_sw;
    
    /** @brief Offset 20'h00028 - lock_control
      *  lock_control help
      *
      *  bits [31:11] - Reserved
      *  bits [10: 0] - Data
      */
    uint32_t lock_control;
    
    /** @brief Offset 20'h0002C - lock_feedback
      *  lock_control feedback
      *
      *  bits [31:11] - Reserved
      *  bits [10: 0] - Data
      */
    uint32_t lock_feedback;
    
    /** @brief Offset 20'h00030 - lock_trig_val
      *  if lock_control ?? , this vals sets the voltage threshold that turns on the lock
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  lock_trig_val;
    
    /** @brief Offset 20'h00034 - lock_trig_time
      *  if lock_control ?? , this vals sets the time threshold that turns on the lock
      *
      *  bits [31: 0] - Data
      */
    uint32_t lock_trig_time;
    
    /** @brief Offset 20'h00038 - lock_trig_sw
      *  selects signal for trigger
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t lock_trig_sw;
    
    /** @brief Offset 20'h0003C - rl_error_threshold
      *  Threshold for error signal. Launchs relock when |error| > rl_error_threshold
      *
      *  bits [31:13] - Reserved
      *  bits [12: 0] - Data
      */
    uint32_t rl_error_threshold;
    
    /** @brief Offset 20'h00040 - rl_signal_sw
      *  selects signal for relock trigger
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t rl_signal_sw;
    
    /** @brief Offset 20'h00044 - rl_signal_threshold
      *  Threshold for signal. Launchs relock when signal < rl_signal_threshold
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  rl_signal_threshold;
    
    /** @brief Offset 20'h00048 - rl_config
      *  Relock enable. [relock_reset,enable_signal_th,enable_error_th] 
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t rl_config;
    
    /** @brief Offset 20'h0004C - rl_state
      *  Relock state: [state:idle|searching|failed,signal_fail,error_fail,locked] 
      *
      *  bits [31: 5] - Reserved
      *  bits [ 4: 0] - Data
      */
    uint32_t rl_state;
    
    /** @brief Offset 20'h00050 - sf_jumpA
      *  Step function measure jump value for ctrl_A
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  sf_jumpA;
    
    /** @brief Offset 20'h00054 - sf_jumpB
      *  Step function measure jump value for ctrl_B
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  sf_jumpB;
    
    /** @brief Offset 20'h00058 - sf_config
      *  Step function configuration. [pidB_ifreeze,pidB_freeze,pidA_ifreeze,pidA_freeze,start] 
      *
      *  bits [31: 5] - Reserved
      *  bits [ 4: 0] - Data
      */
    uint32_t sf_config;
    
    /** @brief Offset 20'h0005C - signal_sw
      *  Input selector for signal_i
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t signal_sw;
    
    /** @brief Offset 20'h00060 - signal_i
      *  signal for demodulation
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  signal_i;
    
    /** @brief Offset 20'h00064 - sg_amp1
      *  amplification of Xo, Yo and F1o
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t sg_amp1;
    
    /** @brief Offset 20'h00068 - sg_amp2
      *  amplification of F2o
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t sg_amp2;
    
    /** @brief Offset 20'h0006C - sg_amp3
      *  amplification of F3o
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t sg_amp3;
    
    /** @brief Offset 20'h00070 - sg_amp_sq
      *  amplification of SQo
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t sg_amp_sq;
    
    /** @brief Offset 20'h00074 - lpf_F1
      *  Low Pass Filter of X, Y and F1
      *
      *  bits [31: 6] - Reserved
      *  bits [ 5: 0] - Data
      */
    uint32_t lpf_F1;
    
    /** @brief Offset 20'h00078 - lpf_F2
      *  Low Pass Filter of F2
      *
      *  bits [31: 6] - Reserved
      *  bits [ 5: 0] - Data
      */
    uint32_t lpf_F2;
    
    /** @brief Offset 20'h0007C - lpf_F3
      *  Low Pass Filter of F3
      *
      *  bits [31: 6] - Reserved
      *  bits [ 5: 0] - Data
      */
    uint32_t lpf_F3;
    
    /** @brief Offset 20'h00080 - lpf_sq
      *  Low Pass Filter of SQ
      *
      *  bits [31: 6] - Reserved
      *  bits [ 5: 0] - Data
      */
    uint32_t lpf_sq;
    
    /** @brief Offset 20'h00084 - error_sw
      *  select error signal
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t error_sw;
    
    /** @brief Offset 20'h00088 - error_offset
      *  offset for the error signal
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  error_offset;
    
    /** @brief Offset 20'h0008C - error
      *  error signal value
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  error;
    
    /** @brief Offset 20'h00090 - error_mean
      *  1 sec error mean val
      *
      *  bits [31: 0] - Data
      */
    int32_t  error_mean;
    
    /** @brief Offset 20'h00094 - error_std
      *  1 sec error square sum val
      *
      *  bits [31: 0] - Data
      */
    int32_t  error_std;
    
    /** @brief Offset 20'h00098 - gen_mod_phase
      *  phase relation of cos_?f signals
      *
      *  bits [31:12] - Reserved
      *  bits [11: 0] - Data
      */
    uint32_t gen_mod_phase;
    
    /** @brief Offset 20'h0009C - gen_mod_phase_sq
      *  phase relation of sqf signal
      *
      *  bits [31: 0] - Data
      */
    uint32_t gen_mod_phase_sq;
    
    /** @brief Offset 20'h000A0 - gen_mod_hp
      *  harmonic period set
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    uint32_t gen_mod_hp;
    
    /** @brief Offset 20'h000A4 - gen_mod_sqp
      *  square signal period
      *
      *  bits [31: 0] - Data
      */
    uint32_t gen_mod_sqp;
    
    /** @brief Offset 20'h000A8 - ramp_A
      *  ramp signal A
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  ramp_A;
    
    /** @brief Offset 20'h000AC - ramp_B
      *  ramp signal B
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  ramp_B;
    
    /** @brief Offset 20'h000B0 - ramp_step
      *  period of the triangular ramp signal
      *
      *  bits [31: 0] - Data
      */
    uint32_t ramp_step;
    
    /** @brief Offset 20'h000B4 - ramp_low_lim
      *  ramp low limit
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  ramp_low_lim;
    
    /** @brief Offset 20'h000B8 - ramp_hig_lim
      *  ramp high limit
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  ramp_hig_lim;
    
    /** @brief Offset 20'h000BC - ramp_reset
      *  ramp reset config
      *
      *  bits [31: 1] - Reserved
      *  bit  [0]     - Data
      */
    uint32_t ramp_reset;
    
    /** @brief Offset 20'h000C0 - ramp_enable
      *  ramp enable/disable switch
      *
      *  bits [31: 1] - Reserved
      *  bit  [0]     - Data
      */
    uint32_t ramp_enable;
    
    /** @brief Offset 20'h000C4 - ramp_direction
      *  ramp starting direction (up/down)
      *
      *  bits [31: 1] - Reserved
      *  bit  [0]     - Data
      */
    uint32_t ramp_direction;
    
    /** @brief Offset 20'h000C8 - ramp_B_factor
      *  proportional factor ramp_A/ramp_B.
      *  ramp_B=ramp_A*ramp_B_factor/4096
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  ramp_B_factor;
    
    /** @brief Offset 20'h000CC - sin_ref
      *  lock-in modulation sinus harmonic reference
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  sin_ref;
    
    /** @brief Offset 20'h000D0 - cos_ref
      *  lock-in modulation cosinus harmonic reference
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  cos_ref;
    
    /** @brief Offset 20'h000D4 - cos_1f
      *  lock-in modulation sinus harmonic signal with phase relation to reference
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  cos_1f;
    
    /** @brief Offset 20'h000D8 - cos_2f
      *  lock-in modulation sinus harmonic signal with phase relation to reference and double frequency
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  cos_2f;
    
    /** @brief Offset 20'h000DC - cos_3f
      *  lock-in modulation sinus harmonic signal with phase relation to reference and triple frequency
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  cos_3f;
    
    /** @brief Offset 20'h000E0 - sq_ref_b
      *  lock-in modulation binary reference
      *
      *  bits [31: 1] - Reserved
      *  bit  [0]     - Data
      */
    uint32_t sq_ref_b;
    
    /** @brief Offset 20'h000E4 - sq_quad_b
      *  lock-in modulation binary quadrature
      *
      *  bits [31: 1] - Reserved
      *  bit  [0]     - Data
      */
    uint32_t sq_quad_b;
    
    /** @brief Offset 20'h000E8 - sq_phas_b
      *  lock-in modulation binary with phase respect to reference
      *
      *  bits [31: 1] - Reserved
      *  bit  [0]     - Data
      */
    uint32_t sq_phas_b;
    
    /** @brief Offset 20'h000EC - sq_ref
      *  lock-in modulation square signal reference
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  sq_ref;
    
    /** @brief Offset 20'h000F0 - sq_quad
      *  lock-in modulation square signal quadrature
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  sq_quad;
    
    /** @brief Offset 20'h000F4 - sq_phas
      *  lock-in modulation square signal with phase relation to reference
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  sq_phas;
    
    /** @brief Offset 20'h000F8 - in1
      *  Input signal IN1
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  in1;
    
    /** @brief Offset 20'h000FC - in2
      *  Input signal IN2
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  in2;
    
    /** @brief Offset 20'h00100 - out1
      *  signal for RP RF DAC Out1
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  out1;
    
    /** @brief Offset 20'h00104 - out2
      *  signal for RP RF DAC Out2
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  out2;
    
    /** @brief Offset 20'h00108 - slow_out1
      *  signal for RP slow DAC 1
      *
      *  bits [31:12] - Reserved
      *  bits [11: 0] - Data
      */
    uint32_t slow_out1;
    
    /** @brief Offset 20'h0010C - slow_out2
      *  signal for RP slow DAC 2
      *
      *  bits [31:12] - Reserved
      *  bits [11: 0] - Data
      */
    uint32_t slow_out2;
    
    /** @brief Offset 20'h00110 - slow_out3
      *  signal for RP slow DAC 3
      *
      *  bits [31:12] - Reserved
      *  bits [11: 0] - Data
      */
    uint32_t slow_out3;
    
    /** @brief Offset 20'h00114 - slow_out4
      *  signal for RP slow DAC 4
      *
      *  bits [31:12] - Reserved
      *  bits [11: 0] - Data
      */
    uint32_t slow_out4;
    
    /** @brief Offset 20'h00118 - oscA
      *  signal for Oscilloscope Channel A
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  oscA;
    
    /** @brief Offset 20'h0011C - oscB
      *  signal for Oscilloscope Channel B
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  oscB;
    
    /** @brief Offset 20'h00120 - X_28
      *  Demodulated signal from sin_ref
      *
      *  bits [31:28] - Reserved
      *  bits [27: 0] - Data
      */
    int32_t  X_28;
    
    /** @brief Offset 20'h00124 - Y_28
      *  Demodulated signal from cos_ref
      *
      *  bits [31:28] - Reserved
      *  bits [27: 0] - Data
      */
    int32_t  Y_28;
    
    /** @brief Offset 20'h00128 - F1_28
      *  Demodulated signal from cos_1f
      *
      *  bits [31:28] - Reserved
      *  bits [27: 0] - Data
      */
    int32_t  F1_28;
    
    /** @brief Offset 20'h0012C - F2_28
      *  Demodulated signal from cos_2f
      *
      *  bits [31:28] - Reserved
      *  bits [27: 0] - Data
      */
    int32_t  F2_28;
    
    /** @brief Offset 20'h00130 - F3_28
      *  Demodulated signal from cos_3f
      *
      *  bits [31:28] - Reserved
      *  bits [27: 0] - Data
      */
    int32_t  F3_28;
    
    /** @brief Offset 20'h00134 - sqX_28
      *  Demodulated signal from sq_ref
      *
      *  bits [31:28] - Reserved
      *  bits [27: 0] - Data
      */
    int32_t  sqX_28;
    
    /** @brief Offset 20'h00138 - sqY_28
      *  Demodulated signal from sq_quad
      *
      *  bits [31:28] - Reserved
      *  bits [27: 0] - Data
      */
    int32_t  sqY_28;
    
    /** @brief Offset 20'h0013C - sqF_28
      *  Demodulated signal from sq_phas
      *
      *  bits [31:28] - Reserved
      *  bits [27: 0] - Data
      */
    int32_t  sqF_28;
    
    /** @brief Offset 20'h00140 - cnt_clk
      *  Clock count
      *
      *  bits [31: 0] - Data
      */
    uint32_t cnt_clk;
    
    /** @brief Offset 20'h00144 - cnt_clk2
      *  Clock count
      *
      *  bits [31: 0] - Data
      */
    uint32_t cnt_clk2;
    
    /** @brief Offset 20'h00148 - read_ctrl
      *  [unused,start_clk,Freeze]
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t read_ctrl;
    
    /** @brief Offset 20'h0014C - pidA_sw
      *  switch selector for pidA input
      *
      *  bits [31: 5] - Reserved
      *  bits [ 4: 0] - Data
      */
    uint32_t pidA_sw;
    
    /** @brief Offset 20'h00150 - pidA_PSR
      *  pidA PSR
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t pidA_PSR;
    
    /** @brief Offset 20'h00154 - pidA_ISR
      *  pidA ISR
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t pidA_ISR;
    
    /** @brief Offset 20'h00158 - pidA_DSR
      *  pidA DSR
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t pidA_DSR;
    
    /** @brief Offset 20'h0015C - pidA_SAT
      *  pidA saturation control
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    uint32_t pidA_SAT;
    
    /** @brief Offset 20'h00160 - pidA_sp
      *  pidA set_point
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidA_sp;
    
    /** @brief Offset 20'h00164 - pidA_kp
      *  pidA proportional constant
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidA_kp;
    
    /** @brief Offset 20'h00168 - pidA_ki
      *  pidA integral constant
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidA_ki;
    
    /** @brief Offset 20'h0016C - pidA_kd
      *  pidA derivative constant
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidA_kd;
    
    /** @brief Offset 20'h00170 - pidA_in
      *  pidA input
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidA_in;
    
    /** @brief Offset 20'h00174 - pidA_out
      *  pidA output
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidA_out;
    
    /** @brief Offset 20'h00178 - pidA_ctrl
      *  pidA control: [ pidA_ifreeze: integrator freeze , pidA_freeze: output freeze , pidA_irst:integrator reset]
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t pidA_ctrl;
    
    /** @brief Offset 20'h0017C - ctrl_A
      *  control_A: pidA_out + ramp_A
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  ctrl_A;
    
    /** @brief Offset 20'h00180 - pidB_sw
      *  switch selector for pidB input
      *
      *  bits [31: 5] - Reserved
      *  bits [ 4: 0] - Data
      */
    uint32_t pidB_sw;
    
    /** @brief Offset 20'h00184 - pidB_PSR
      *  pidB PSR
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t pidB_PSR;
    
    /** @brief Offset 20'h00188 - pidB_ISR
      *  pidB ISR
      *
      *  bits [31: 4] - Reserved
      *  bits [ 3: 0] - Data
      */
    uint32_t pidB_ISR;
    
    /** @brief Offset 20'h0018C - pidB_DSR
      *  pidB DSR
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t pidB_DSR;
    
    /** @brief Offset 20'h00190 - pidB_SAT
      *  pidB saturation control
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    uint32_t pidB_SAT;
    
    /** @brief Offset 20'h00194 - pidB_sp
      *  pidB set_point
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidB_sp;
    
    /** @brief Offset 20'h00198 - pidB_kp
      *  pidB proportional constant
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidB_kp;
    
    /** @brief Offset 20'h0019C - pidB_ki
      *  pidB integral constant
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidB_ki;
    
    /** @brief Offset 20'h001A0 - pidB_kd
      *  pidB derivative constant
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidB_kd;
    
    /** @brief Offset 20'h001A4 - pidB_in
      *  pidB input
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidB_in;
    
    /** @brief Offset 20'h001A8 - pidB_out
      *  pidB output
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  pidB_out;
    
    /** @brief Offset 20'h001AC - pidB_ctrl
      *  pidB control: [ pidB_ifreeze: integrator freeze , pidB_freeze: output freeze , pidB_irst:integrator reset]
      *
      *  bits [31: 3] - Reserved
      *  bits [ 2: 0] - Data
      */
    uint32_t pidB_ctrl;
    
    /** @brief Offset 20'h001B0 - ctrl_B
      *  control_B: pidA_out + ramp_B
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  ctrl_B;
    
    /** @brief Offset 20'h001B4 - aux_A
      *  auxiliar value of 14 bits
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  aux_A;
    
    /** @brief Offset 20'h001B8 - aux_B
      *  auxiliar value of 14 bits
      *
      *  bits [31:14] - Reserved
      *  bits [13: 0] - Data
      */
    int32_t  aux_B;
    

} lock_reg_t;
// [FPGAREG DOCK END]


/** @} */

/* Description of the following variables or function declarations is in
 * fpga_lock.c
 */
  extern lock_reg_t    *g_lock_reg;

int fpga_lock_init(void);
int fpga_lock_exit(void);

#endif // _FPGA_LOCK_H_
