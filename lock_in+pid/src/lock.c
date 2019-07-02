/**
 * @brief Red Pitaya LOCK Controller
 *
 * @Author Marcelo Luda <marceluda@gmail.com>
 *
 *
 *
 * This part of code is written in C programming language.
 * Please visit http://en.wikipedia.org/wiki/C_(programming_language)
 * for more details on the language used herein.
 */

#include <stdio.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#include "lock.h"
#include "fpga_lock.h"


#ifndef min
    #define min(a,b) ((a) < (b) ? (a) : (b))
#endif

#ifndef max
    #define max(a,b) ((a) > (b) ? (a) : (b))
#endif


int   save_read_ctrl = -1 ;
float lock_error_var = 0 ;

/**
 * GENERAL DESCRIPTION:
 *
 *
 * PENDIENTE  PENDIENTE  PENDIENTE  PENDIENTE  PENDIENTE  PENDIENTE
 *
 *
 */


/*----------------------------------------------------------------------------------*/
/** @brief Initialize LOCK Controller module
 *
 * A function is intended to be called within application initialization. It's purpose
 * is to initialize LOCK Controller module.
 *
 * @retval     -1 failure, error message is reported on standard error
 * @retval      0 successful initialization
 */

int lock_init(void)
{
    if(fpga_lock_init() < 0) {
        return -1;
    }

    return 0;
}


/*----------------------------------------------------------------------------------*/
/** @brief Cleanup LOCK Controller module
 *
 * A function is intended to be called on application's termination. The main purpose
 * of this function is to release allocated resources...
 *
 * @retval      0 success, never fails.
 */
int lock_exit(void)
{
    fpga_lock_exit();

    return 0;
}


/*----------------------------------------------------------------------------------*/
/**
 * @brief Update LOCK Controller module towards actual settings.
 *
 * A function is intended to be called whenever one of the settings is modified
 *
 * @param[in] params  Pointer to overall configuration parameters
 * @retval -1 failure, error message is repoted on standard error device
 * @retval  0 succesful update
 */
int lock_update(rp_app_params_t *params)
{

  // [FPGAUPDATE DOCK]
    g_lock_reg->oscA_sw                   = (int)params[LOCK_OSCA_SW                  ].value;
    g_lock_reg->oscB_sw                   = (int)params[LOCK_OSCB_SW                  ].value;
    g_lock_reg->osc_ctrl                  = (((int)params[LOCK_OSC2_FILT_OFF].value)<<1) + ((int)params[LOCK_OSC1_FILT_OFF].value);
    g_lock_reg->trig_sw                   = (int)params[LOCK_TRIG_SW                  ].value;
    g_lock_reg->out1_sw                   = (int)params[LOCK_OUT1_SW                  ].value;
    g_lock_reg->out2_sw                   = (int)params[LOCK_OUT2_SW                  ].value;
    g_lock_reg->slow_out1_sw              = (int)params[LOCK_SLOW_OUT1_SW             ].value;
    g_lock_reg->slow_out2_sw              = (int)params[LOCK_SLOW_OUT2_SW             ].value;
    g_lock_reg->slow_out3_sw              = (int)params[LOCK_SLOW_OUT3_SW             ].value;
    g_lock_reg->slow_out4_sw              = (int)params[LOCK_SLOW_OUT4_SW             ].value;
    g_lock_reg->lock_control              = (int) (
                                           ((int)params[LOCK_CTRL_AUX_LOCK_NOW        ].value)   *     1  + 
                                           ((int)params[LOCK_CTRL_AUX_LAUNCH_LOCK_TRIG].value)   *     2  + 
                                           ((int)params[LOCK_CTRL_AUX_PIDB_ENABLE_CTRL].value)   *     4  + 
                                           ((int)params[LOCK_CTRL_AUX_PIDA_ENABLE_CTRL].value)   *     8  + 
                                           ((int)params[LOCK_CTRL_AUX_RAMP_ENABLE_CTRL].value)   *    16  + 
                                           ((int)params[LOCK_CTRL_AUX_SET_PIDB_ENABLE ].value)   *    32  + 
                                           ((int)params[LOCK_CTRL_AUX_SET_PIDA_ENABLE ].value)   *    64  + 
                                           ((int)params[LOCK_CTRL_AUX_SET_RAMP_ENABLE ].value)   *   128  + 
                                           ((int)params[LOCK_CTRL_AUX_TRIG_TYPE       ].value)   *   256  + 
                                           ((int)params[LOCK_CTRL_AUX_LOCK_TRIG_RISE  ].value)   *  1024  ) ;
  //g_lock_reg->lock_feedback             = (int)params[LOCK_LOCK_FEEDBACK            ].value;
    g_lock_reg->lock_trig_val             = (int)params[LOCK_LOCK_TRIG_VAL            ].value;
    g_lock_reg->lock_trig_time            = (int)params[LOCK_LOCK_TRIG_TIME_VAL       ].value;
    g_lock_reg->lock_trig_sw              = (int)params[LOCK_LOCK_TRIG_SW             ].value;
    g_lock_reg->rl_error_threshold        = (int)params[LOCK_RL_ERROR_THRESHOLD       ].value;
    g_lock_reg->rl_signal_sw              = (int)params[LOCK_RL_SIGNAL_SW             ].value;
    g_lock_reg->rl_signal_threshold       = (int)params[LOCK_RL_SIGNAL_THRESHOLD      ].value;
    g_lock_reg->rl_config                 = (((int)params[LOCK_RL_RESET].value) << 2 ) + (((int)params[LOCK_RL_SIGNAL_ENABLE].value) << 1 ) + ((int)params[LOCK_RL_ERROR_ENABLE].value);
  //g_lock_reg->rl_state                  = (int)params[LOCK_RL_STATE                 ].value;
    g_lock_reg->sf_jumpA                  = (int)params[LOCK_SF_JUMPA                 ].value;
    g_lock_reg->sf_jumpB                  = (int)params[LOCK_SF_JUMPB                 ].value;
    g_lock_reg->sf_config                 = (((int)params[LOCK_SF_BFRZI].value) << 4 ) +(((int)params[LOCK_SF_BFRZO].value) << 3 ) +(((int)params[LOCK_SF_AFRZI].value) << 2 ) + (((int)params[LOCK_SF_AFRZO].value) << 1 ) + ((int)params[LOCK_SF_START].value);
    g_lock_reg->signal_sw                 = (int)params[LOCK_SIGNAL_SW                ].value;
  //g_lock_reg->signal_i                  = (int)params[LOCK_SIGNAL_I                 ].value;
    g_lock_reg->sg_amp1                   = (int)params[LOCK_SG_AMP1                  ].value;
    g_lock_reg->sg_amp2                   = (int)params[LOCK_SG_AMP2                  ].value;
    g_lock_reg->sg_amp3                   = (int)params[LOCK_SG_AMP3                  ].value;
    g_lock_reg->sg_amp_sq                 = (int)params[LOCK_SG_AMP_SQ                ].value;
    g_lock_reg->lpf_F1                    = (((int)params[LOCK_LPF_F1_ORDER].value)<<4) + ((int)params[LOCK_LPF_F1_TAU].value);
    g_lock_reg->lpf_F2                    = (((int)params[LOCK_LPF_F2_ORDER].value)<<4) + ((int)params[LOCK_LPF_F2_TAU].value);
    g_lock_reg->lpf_F3                    = (((int)params[LOCK_LPF_F3_ORDER].value)<<4) + (((int)params[LOCK_LPF_F3_TAU].value));
    g_lock_reg->lpf_sq                    = (((int)params[LOCK_LPF_SQ_ORDER].value)<<4) + ((int)params[LOCK_LPF_SQ_TAU].value);
    g_lock_reg->error_sw                  = (int)params[LOCK_ERROR_SW                 ].value;
    g_lock_reg->error_offset              = (int)params[LOCK_ERROR_OFFSET             ].value;
  //g_lock_reg->error                     = (int)params[LOCK_ERROR                    ].value;
  //g_lock_reg->error_mean                = (int)params[LOCK_ERROR_MEAN               ].value;
  //g_lock_reg->error_std                 = (int)params[LOCK_ERROR_STD                ].value;
    g_lock_reg->gen_mod_phase             = (int)params[LOCK_GEN_MOD_PHASE            ].value;
    g_lock_reg->gen_mod_phase_sq          = (int)params[LOCK_GEN_MOD_PHASE_SQ         ].value;
    g_lock_reg->gen_mod_hp                = (int)params[LOCK_GEN_MOD_HP               ].value;
    g_lock_reg->gen_mod_sqp               = (int)params[LOCK_GEN_MOD_SQP              ].value;
  //g_lock_reg->ramp_A                    = (int)params[LOCK_RAMP_A                   ].value;
  //g_lock_reg->ramp_B                    = (int)params[LOCK_RAMP_B                   ].value;
    g_lock_reg->ramp_step                 = (int)params[LOCK_RAMP_STEP                ].value;
    g_lock_reg->ramp_low_lim              = (int)params[LOCK_RAMP_LOW_LIM             ].value;
    g_lock_reg->ramp_hig_lim              = (int)params[LOCK_RAMP_HIG_LIM             ].value;
    g_lock_reg->ramp_reset                = (int)params[LOCK_RAMP_RESET               ].value;
    g_lock_reg->ramp_enable               = (int)params[LOCK_RAMP_ENABLE              ].value;
    g_lock_reg->ramp_direction            = (int)params[LOCK_RAMP_DIRECTION           ].value;
    g_lock_reg->ramp_B_factor             = (int)params[LOCK_RAMP_B_FACTOR            ].value;
  //g_lock_reg->sin_ref                   = (int)params[LOCK_SIN_REF                  ].value;
  //g_lock_reg->cos_ref                   = (int)params[LOCK_COS_REF                  ].value;
  //g_lock_reg->cos_1f                    = (int)params[LOCK_COS_1F                   ].value;
  //g_lock_reg->cos_2f                    = (int)params[LOCK_COS_2F                   ].value;
  //g_lock_reg->cos_3f                    = (int)params[LOCK_COS_3F                   ].value;
  //g_lock_reg->sq_ref_b                  = (int)params[LOCK_SQ_REF_B                 ].value;
  //g_lock_reg->sq_quad_b                 = (int)params[LOCK_SQ_QUAD_B                ].value;
  //g_lock_reg->sq_phas_b                 = (int)params[LOCK_SQ_PHAS_B                ].value;
  //g_lock_reg->sq_ref                    = (int)params[LOCK_SQ_REF                   ].value;
  //g_lock_reg->sq_quad                   = (int)params[LOCK_SQ_QUAD                  ].value;
  //g_lock_reg->sq_phas                   = (int)params[LOCK_SQ_PHAS                  ].value;
  //g_lock_reg->in1                       = (int)params[LOCK_IN1                      ].value;
  //g_lock_reg->in2                       = (int)params[LOCK_IN2                      ].value;
  //g_lock_reg->out1                      = (int)params[LOCK_OUT1                     ].value;
  //g_lock_reg->out2                      = (int)params[LOCK_OUT2                     ].value;
  //g_lock_reg->slow_out1                 = (int)params[LOCK_SLOW_OUT1                ].value;
  //g_lock_reg->slow_out2                 = (int)params[LOCK_SLOW_OUT2                ].value;
  //g_lock_reg->slow_out3                 = (int)params[LOCK_SLOW_OUT3                ].value;
  //g_lock_reg->slow_out4                 = (int)params[LOCK_SLOW_OUT4                ].value;
  //g_lock_reg->oscA                      = (int)params[LOCK_OSCA                     ].value;
  //g_lock_reg->oscB                      = (int)params[LOCK_OSCB                     ].value;
  //g_lock_reg->X_28                      = (int)params[LOCK_X_28                     ].value;
  //g_lock_reg->Y_28                      = (int)params[LOCK_Y_28                     ].value;
  //g_lock_reg->F1_28                     = (int)params[LOCK_F1_28                    ].value;
  //g_lock_reg->F2_28                     = (int)params[LOCK_F2_28                    ].value;
  //g_lock_reg->F3_28                     = (int)params[LOCK_F3_28                    ].value;
  //g_lock_reg->sqX_28                    = (int)params[LOCK_SQX_28                   ].value;
  //g_lock_reg->sqY_28                    = (int)params[LOCK_SQY_28                   ].value;
  //g_lock_reg->sqF_28                    = (int)params[LOCK_SQF_28                   ].value;
  //g_lock_reg->cnt_clk                   = (int)params[LOCK_CNT_CLK                  ].value;
  //g_lock_reg->cnt_clk2                  = (int)params[LOCK_CNT_CLK2                 ].value;
    g_lock_reg->read_ctrl                 = (int)params[LOCK_READ_CTRL                ].value;
    g_lock_reg->pidA_sw                   = (int)params[LOCK_PIDA_SW                  ].value;
    g_lock_reg->pidA_PSR                  = (int)params[LOCK_PIDA_PSR                 ].value;
    g_lock_reg->pidA_ISR                  = (int)params[LOCK_PIDA_ISR                 ].value;
    g_lock_reg->pidA_DSR                  = (int)params[LOCK_PIDA_DSR                 ].value;
    g_lock_reg->pidA_SAT                  = (int)params[LOCK_PIDA_SAT                 ].value;
    g_lock_reg->pidA_sp                   = (int)params[LOCK_PIDA_SP                  ].value;
    g_lock_reg->pidA_kp                   = (int)params[LOCK_PIDA_KP                  ].value;
    g_lock_reg->pidA_ki                   = (int)params[LOCK_PIDA_KI                  ].value;
    g_lock_reg->pidA_kd                   = (int)params[LOCK_PIDA_KD                  ].value;
  //g_lock_reg->pidA_in                   = (int)params[LOCK_PIDA_IN                  ].value;
  //g_lock_reg->pidA_out                  = (int)params[LOCK_PIDA_OUT                 ].value;
    g_lock_reg->pidA_ctrl                 = (((int)params[LOCK_PIDA_IFREEZE].value)<<2) + (((int)params[LOCK_PIDA_FREEZE].value)<<1) + ((int)params[LOCK_PIDA_IRST].value);
  //g_lock_reg->ctrl_A                    = (int)params[LOCK_CTRL_A                   ].value;
    g_lock_reg->pidB_sw                   = (int)params[LOCK_PIDB_SW                  ].value;
    g_lock_reg->pidB_PSR                  = (int)params[LOCK_PIDB_PSR                 ].value;
    g_lock_reg->pidB_ISR                  = (int)params[LOCK_PIDB_ISR                 ].value;
    g_lock_reg->pidB_DSR                  = (int)params[LOCK_PIDB_DSR                 ].value;
    g_lock_reg->pidB_SAT                  = (int)params[LOCK_PIDB_SAT                 ].value;
    g_lock_reg->pidB_sp                   = (int)params[LOCK_PIDB_SP                  ].value;
    g_lock_reg->pidB_kp                   = (int)params[LOCK_PIDB_KP                  ].value;
    g_lock_reg->pidB_ki                   = (int)params[LOCK_PIDB_KI                  ].value;
    g_lock_reg->pidB_kd                   = (int)params[LOCK_PIDB_KD                  ].value;
  //g_lock_reg->pidB_in                   = (int)params[LOCK_PIDB_IN                  ].value;
  //g_lock_reg->pidB_out                  = (int)params[LOCK_PIDB_OUT                 ].value;
    g_lock_reg->pidB_ctrl                 = (((int)params[LOCK_PIDB_IFREEZE].value)<<2) + (((int)params[LOCK_PIDB_FREEZE].value)<<1) + ((int)params[LOCK_PIDB_IRST].value);
  //g_lock_reg->ctrl_B                    = (int)params[LOCK_CTRL_B                   ].value;
    g_lock_reg->aux_A                     = (int)params[LOCK_AUX_A                    ].value;
    g_lock_reg->aux_B                     = (int)params[LOCK_AUX_B                    ].value;
  // [FPGAUPDATE DOCK END]

    return 0;
}


int lock_freeze_regs(){
  //TRACE("LOLO: prev save_read_ctrl = %d \n",  save_read_ctrl );
  save_read_ctrl          = (uint)g_lock_reg->read_ctrl ;
  g_lock_reg->read_ctrl   =  g_lock_reg->read_ctrl | 0b00000000000000000000000000000001 ;
  //TRACE("LOLO: g_lock_reg->read_ctrl = %d \n",  g_lock_reg->read_ctrl );
  return 0;
}

int lock_restore_regs(){
  //TRACE("LOLO: prev save_read_ctrl = %d \n",  save_read_ctrl );
  g_lock_reg->read_ctrl   =  save_read_ctrl ;
  //TRACE("LOLO: g_lock_reg->read_ctrl = %d \n",  g_lock_reg->read_ctrl );
  return 0;
}


/*----------------------------------------------------------------------------------*/
/**
 * @brief Update LOCK Controller module towards actual settings FROM THE FPGA REGs
 *
 * A function is intended to be called whenever one of the settings is modified BY FPGA
 *
 * @param[in] params  Pointer to overall configuration parameters
 * @retval -1 failure, error message is repoted on standard error device
 * @retval  0 succesful update
 */
int lock_update_main(rp_app_params_t *params)
{

    //uint32_t  mask16 =   0b00000000000000000000000000001111 ;

    // [PARAMSUPDATE DOCK]
    params[ 81].value = (float)g_lock_reg->oscA_sw               ; // lock_oscA_sw
    params[ 82].value = (float)g_lock_reg->oscB_sw               ; // lock_oscB_sw
    params[ 83].value = (float) ((g_lock_reg->osc_ctrl      )& 0x01) ; // lock_osc1_filt_off
    params[ 84].value = (float) ((g_lock_reg->osc_ctrl >> 1 )& 0x01) ; // lock_osc2_filt_off
    params[ 87].value = (float)g_lock_reg->trig_sw               ; // lock_trig_sw
    params[ 88].value = (float)g_lock_reg->out1_sw               ; // lock_out1_sw
    params[ 89].value = (float)g_lock_reg->out2_sw               ; // lock_out2_sw
    params[ 90].value = (float)g_lock_reg->slow_out1_sw          ; // lock_slow_out1_sw
    params[ 91].value = (float)g_lock_reg->slow_out2_sw          ; // lock_slow_out2_sw
    params[ 92].value = (float)g_lock_reg->slow_out3_sw          ; // lock_slow_out3_sw
    params[ 93].value = (float)g_lock_reg->slow_out4_sw          ; // lock_slow_out4_sw
    params[ 94].value = (float)g_lock_reg->lock_control          ; // lock_lock_control
    params[ 95].value = (float)g_lock_reg->lock_feedback         ; // lock_lock_feedback
    params[ 96].value = (float)g_lock_reg->lock_trig_val         ; // lock_lock_trig_val
    params[ 97].value = (float)g_lock_reg->lock_trig_time        ; // lock_lock_trig_time_val
    params[ 98].value = (float)g_lock_reg->lock_trig_sw          ; // lock_lock_trig_sw
    params[ 99].value = (float)g_lock_reg->rl_error_threshold    ; // lock_rl_error_threshold
    params[100].value = (float)g_lock_reg->rl_signal_sw          ; // lock_rl_signal_sw
    params[101].value = (float)g_lock_reg->rl_signal_threshold   ; // lock_rl_signal_threshold
    params[102].value = (float) ((g_lock_reg->rl_config      )& 0x01) ; // lock_rl_error_enable
    params[103].value = (float) ((g_lock_reg->rl_config >> 1 )& 0x01) ; // lock_rl_signal_enable
    params[104].value = (float) ((g_lock_reg->rl_config >> 2 )& 0x01) ; // lock_rl_reset
    params[105].value = (float)g_lock_reg->rl_state              ; // lock_rl_state
    params[106].value = (float)g_lock_reg->sf_jumpA              ; // lock_sf_jumpA
    params[107].value = (float)g_lock_reg->sf_jumpB              ; // lock_sf_jumpB
    params[108].value = (float) ((g_lock_reg->sf_config      )& 0x01) ; // lock_sf_start
    params[109].value = (float) ((g_lock_reg->sf_config >> 1 )& 0x01) ; // lock_sf_AfrzO
    params[110].value = (float) ((g_lock_reg->sf_config >> 2 )& 0x01) ; // lock_sf_AfrzI
    params[111].value = (float) ((g_lock_reg->sf_config >> 3 )& 0x01) ; // lock_sf_BfrzO
    params[112].value = (float) ((g_lock_reg->sf_config >> 4 )& 0x01) ; // lock_sf_BfrzI
    params[113].value = (float)g_lock_reg->signal_sw             ; // lock_signal_sw
    params[114].value = (float)g_lock_reg->signal_i              ; // lock_signal_i
    params[115].value = (float)g_lock_reg->sg_amp1               ; // lock_sg_amp1
    params[116].value = (float)g_lock_reg->sg_amp2               ; // lock_sg_amp2
    params[117].value = (float)g_lock_reg->sg_amp3               ; // lock_sg_amp3
    params[118].value = (float)g_lock_reg->sg_amp_sq             ; // lock_sg_amp_sq
    params[119].value = (float) ((g_lock_reg->lpf_F1      )& 0x0f) ; // lock_lpf_F1_tau
    params[120].value = (float) ((g_lock_reg->lpf_F1 >> 4 )& 0x03) ; // lock_lpf_F1_order
    params[121].value = (float) ((g_lock_reg->lpf_F2      )& 0x0f) ; // lock_lpf_F2_tau
    params[122].value = (float) ((g_lock_reg->lpf_F2 >> 4 )& 0x03) ; // lock_lpf_F2_order
    params[123].value = (float) ((g_lock_reg->lpf_F3      )& 0x0f) ; // lock_lpf_F3_tau
    params[124].value = (float) ((g_lock_reg->lpf_F3 >> 4 )& 0x03) ; // lock_lpf_F3_order
    params[125].value = (float) ((g_lock_reg->lpf_sq      )& 0x0f) ; // lock_lpf_sq_tau
    params[126].value = (float) ((g_lock_reg->lpf_sq >> 4 )& 0x03) ; // lock_lpf_sq_order
    params[127].value = (float)g_lock_reg->error_sw              ; // lock_error_sw
    params[128].value = (float)g_lock_reg->error_offset          ; // lock_error_offset
    params[129].value = (float)g_lock_reg->error                 ; // lock_error
    params[130].value = ((float) ( g_lock_reg->error_mean >= 0 ? g_lock_reg->error_mean : g_lock_reg->error_mean-32 ))/262144  ; // lock_error_mean
    lock_error_var    = ((float) (g_lock_reg->error_std))/32 - pow(params[LOCK_ERROR_MEAN].value,2) ;
    params[131].value = lock_error_var<0 ? -1 : sqrt( lock_error_var )  ; // lock_error_std
    params[132].value = (float)g_lock_reg->gen_mod_phase         ; // lock_gen_mod_phase
    params[133].value = (float)g_lock_reg->gen_mod_phase_sq      ; // lock_gen_mod_phase_sq
    params[134].value = (float)g_lock_reg->gen_mod_hp            ; // lock_gen_mod_hp
    params[135].value = (float)g_lock_reg->gen_mod_sqp           ; // lock_gen_mod_sqp
    params[136].value = (float)g_lock_reg->ramp_A                ; // lock_ramp_A
    params[137].value = (float)g_lock_reg->ramp_B                ; // lock_ramp_B
    params[138].value = (float)g_lock_reg->ramp_step             ; // lock_ramp_step
    params[139].value = (float)g_lock_reg->ramp_low_lim          ; // lock_ramp_low_lim
    params[140].value = (float)g_lock_reg->ramp_hig_lim          ; // lock_ramp_hig_lim
    params[141].value = (float)g_lock_reg->ramp_reset            ; // lock_ramp_reset
    params[142].value = (float)g_lock_reg->ramp_enable           ; // lock_ramp_enable
    params[143].value = (float)g_lock_reg->ramp_direction        ; // lock_ramp_direction
    params[144].value = (float)g_lock_reg->ramp_B_factor         ; // lock_ramp_B_factor
    params[145].value = (float)g_lock_reg->sin_ref               ; // lock_sin_ref
    params[146].value = (float)g_lock_reg->cos_ref               ; // lock_cos_ref
    params[147].value = (float)g_lock_reg->cos_1f                ; // lock_cos_1f
    params[148].value = (float)g_lock_reg->cos_2f                ; // lock_cos_2f
    params[149].value = (float)g_lock_reg->cos_3f                ; // lock_cos_3f
    params[150].value = (float)g_lock_reg->sq_ref_b              ; // lock_sq_ref_b
    params[151].value = (float)g_lock_reg->sq_quad_b             ; // lock_sq_quad_b
    params[152].value = (float)g_lock_reg->sq_phas_b             ; // lock_sq_phas_b
    params[153].value = (float)g_lock_reg->sq_ref                ; // lock_sq_ref
    params[154].value = (float)g_lock_reg->sq_quad               ; // lock_sq_quad
    params[155].value = (float)g_lock_reg->sq_phas               ; // lock_sq_phas
    params[156].value = (float)g_lock_reg->in1                   ; // lock_in1
    params[157].value = (float)g_lock_reg->in2                   ; // lock_in2
    params[158].value = (float)g_lock_reg->out1                  ; // lock_out1
    params[159].value = (float)g_lock_reg->out2                  ; // lock_out2
    params[160].value = (float)g_lock_reg->slow_out1             ; // lock_slow_out1
    params[161].value = (float)g_lock_reg->slow_out2             ; // lock_slow_out2
    params[162].value = (float)g_lock_reg->slow_out3             ; // lock_slow_out3
    params[163].value = (float)g_lock_reg->slow_out4             ; // lock_slow_out4
    params[164].value = (float)g_lock_reg->oscA                  ; // lock_oscA
    params[165].value = (float)g_lock_reg->oscB                  ; // lock_oscB
    lock_freeze_regs();
    params[166].value = (float)g_lock_reg->X_28                  ; // lock_X
    params[167].value = (float)g_lock_reg->Y_28                  ; // lock_Y
    params[168].value = (float)g_lock_reg->F1_28                 ; // lock_F1
    params[169].value = (float)g_lock_reg->F2_28                 ; // lock_F2
    params[170].value = (float)g_lock_reg->F3_28                 ; // lock_F3
    params[171].value = (float)g_lock_reg->sqX_28                ; // lock_sqX
    params[172].value = (float)g_lock_reg->sqY_28                ; // lock_sqY
    params[173].value = (float)g_lock_reg->sqF_28                ; // lock_sqF
    params[174].value = (float)g_lock_reg->cnt_clk               ; // lock_cnt_clk
    params[175].value = (float)g_lock_reg->cnt_clk2              ; // lock_cnt_clk2
    lock_restore_regs();
    params[176].value = (float)g_lock_reg->read_ctrl             ; // lock_read_ctrl
    params[177].value = (float)g_lock_reg->pidA_sw               ; // lock_pidA_sw
    params[178].value = (float)g_lock_reg->pidA_PSR              ; // lock_pidA_PSR
    params[179].value = (float)g_lock_reg->pidA_ISR              ; // lock_pidA_ISR
    params[180].value = (float)g_lock_reg->pidA_DSR              ; // lock_pidA_DSR
    params[181].value = (float)g_lock_reg->pidA_SAT              ; // lock_pidA_SAT
    params[182].value = (float)g_lock_reg->pidA_sp               ; // lock_pidA_sp
    params[183].value = (float)g_lock_reg->pidA_kp               ; // lock_pidA_kp
    params[184].value = (float)g_lock_reg->pidA_ki               ; // lock_pidA_ki
    params[185].value = (float)g_lock_reg->pidA_kd               ; // lock_pidA_kd
    params[186].value = (float)g_lock_reg->pidA_in               ; // lock_pidA_in
    params[187].value = (float)g_lock_reg->pidA_out              ; // lock_pidA_out
    params[188].value = (float) ((g_lock_reg->pidA_ctrl                 )& 0x001) ; // lock_pidA_irst
    params[189].value = (float) ((g_lock_reg->pidA_ctrl            >>1  )& 0x001) ; // lock_pidA_freeze
    params[190].value = (float) ((g_lock_reg->pidA_ctrl            >>2  )& 0x001) ; // lock_pidA_ifreeze
    params[191].value = (float)g_lock_reg->ctrl_A                ; // lock_ctrl_A
    params[192].value = (float)g_lock_reg->pidB_sw               ; // lock_pidB_sw
    params[193].value = (float)g_lock_reg->pidB_PSR              ; // lock_pidB_PSR
    params[194].value = (float)g_lock_reg->pidB_ISR              ; // lock_pidB_ISR
    params[195].value = (float)g_lock_reg->pidB_DSR              ; // lock_pidB_DSR
    params[196].value = (float)g_lock_reg->pidB_SAT              ; // lock_pidB_SAT
    params[197].value = (float)g_lock_reg->pidB_sp               ; // lock_pidB_sp
    params[198].value = (float)g_lock_reg->pidB_kp               ; // lock_pidB_kp
    params[199].value = (float)g_lock_reg->pidB_ki               ; // lock_pidB_ki
    params[200].value = (float)g_lock_reg->pidB_kd               ; // lock_pidB_kd
    params[201].value = (float)g_lock_reg->pidB_in               ; // lock_pidB_in
    params[202].value = (float)g_lock_reg->pidB_out              ; // lock_pidB_out
    params[203].value = (float) ((g_lock_reg->pidB_ctrl                 )& 0x001) ; // lock_pidB_irst
    params[204].value = (float) ((g_lock_reg->pidB_ctrl            >>1  )& 0x001) ; // lock_pidB_freeze
    params[205].value = (float) ((g_lock_reg->pidB_ctrl            >>2  )& 0x001) ; // lock_pidB_ifreeze
    params[206].value = (float)g_lock_reg->ctrl_B                ; // lock_ctrl_B
    params[207].value = (float)g_lock_reg->aux_A                 ; // lock_aux_A
    params[208].value = (float)g_lock_reg->aux_B                 ; // lock_aux_B
    params[209].value = (float) (( g_lock_reg->lock_feedback >> 0 ) & 0x01 ) ; // lock_ctrl_aux_lock_now
    params[210].value = (float) (( g_lock_reg->lock_feedback >> 1 ) & 0x01 ) ; // lock_ctrl_aux_launch_lock_trig
    params[211].value = (float) (( g_lock_reg->lock_feedback >> 2 ) & 0x01 ) ; // lock_ctrl_aux_pidB_enable_ctrl
    params[212].value = (float) (( g_lock_reg->lock_feedback >> 3 ) & 0x01 ) ; // lock_ctrl_aux_pidA_enable_ctrl
    params[213].value = (float) (( g_lock_reg->lock_feedback >> 4 ) & 0x01 ) ; // lock_ctrl_aux_ramp_enable_ctrl
    params[214].value = (float) (( g_lock_reg->lock_feedback >> 5 ) & 0x01 ) ; // lock_ctrl_aux_set_pidB_enable
    params[215].value = (float) (( g_lock_reg->lock_feedback >> 6 ) & 0x01 ) ; // lock_ctrl_aux_set_pidA_enable
    params[216].value = (float) (( g_lock_reg->lock_feedback >> 7 ) & 0x01 ) ; // lock_ctrl_aux_set_ramp_enable
    params[217].value = (float) (( g_lock_reg->lock_feedback >> 8 ) & 0x03 ) ; // lock_ctrl_aux_trig_type
    params[218].value = (float) (( g_lock_reg->lock_feedback >>10 ) & 0x01 ) ; // lock_ctrl_aux_lock_trig_rise
    // [PARAMSUPDATE DOCK END]

    return 0;
}
