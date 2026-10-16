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
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <pthread.h>
#include <sys/time.h>
#include <unistd.h>

#include "lock.h"
#include "fpga_lock.h"


#ifndef min
    #define min(a,b) ((a) < (b) ? (a) : (b))
#endif

#ifndef max
    #define max(a,b) ((a) > (b) ? (a) : (b))
#endif

/* v2.3.15: float parameter -> unsigned 32-bit register (lock_trig_time). The parameters are float:
 * (int) of a value >= 2**31 is undefined (on the ARM it saturated to 2**31 - 1), and 4294967295
 * is 4294967296.0f as float. The conversion goes through int64_t (defined for the whole range)
 * and saturates to 0 .. 0xffffffff. Values above 2**24 keep the float resolution. */
static inline uint32_t lock_float_to_u32(float v)
{
    if (!(v > 0.0f))          return 0u ;            /* also NaN */
    if (v >= 4294967295.0f)   return 0xffffffffu ;
    return (uint32_t)(int64_t)v ;
}


int   save_read_ctrl = -1 ;
float lock_error_var = 0 ;

/* v2.3.13: last value of lock_control written by lock_update() (0xffffffff: none yet).
 * lock_control is command + configuration and the FPGA never modifies it (doc/lock_control.md):
 *  - lock_update() writes it only when the value composed from LOCK_CTRL_AUX_* changes, so an
 *    unrelated parameter change does not rewrite a value written from outside the controller;
 *  - lock_update_status() copies it to LOCK_CTRL_AUX_* only when it differs from this value,
 *    i.e. when it was written from outside (Python, c/lock, monitor). */
static uint32_t lock_control_written = 0xffffffff ;

/* v2.3.23 (Capture Lock with slow scans): lock request held back until the scope is armed.
 * A POST that arms a Single acquisition and requests a lock (0->1 of lock_now / launch_lock) used to wait in
 * rp_set_params() for the scope worker (at most 1.5 s): with windows of tens of seconds the worker needs |xmin|
 * (the pre-trigger history) before it enables the trigger, the request was applied before that and the FPGA
 * pulse "Lock control trig" came with the trigger still disabled (capture lost); the POST also took ~2 s and the
 * page sent it again. Now the POST answers at once and the request bits (lock_ctrl_hold, 1 = lock_now,
 * 2 = launch_lock_trig) are kept out of lock_control until:
 *   - the scope worker has enabled the trigger of an acquisition armed with parameters of generation >=
 *     lock_ctrl_hold_gen (lock_request_armed(), called by the worker), and
 *   - rp_set_params() has written the other lock registers of that POST (lock_request_commit()),
 * or the deadline is over (lock_request_poll(): never kept for ever).
 * A held bit that is no longer requested (release) is simply dropped. lock_ctrl_mutex serialises the writes of
 * lock_control (rp_set_params(), the worker thread, rp_get_params()).
 *
 * (A software ramp monitor that held time trigger requests until a scan floor was tried in build 55 and removed:
 * the FPGA does it now, lock_ctrl.v cnt_ok.)
 */
static pthread_mutex_t lock_ctrl_mutex = PTHREAD_MUTEX_INITIALIZER;
static uint32_t lock_ctrl_hold        = 0 ;
static int      lock_ctrl_hold_gen    = 0 ;
static int      lock_ctrl_need_armed  = 0 ;   /* held for the scope (Capture Lock) */
static int      lock_ctrl_hold_armed  = 0 ;   /* the worker has enabled the trigger (gen >= lock_ctrl_hold_gen) */
static int      lock_ctrl_hold_commit = 0 ;   /* rp_set_params() has finished the lock part of the POST */
static double   lock_ctrl_hold_until  = 0 ;   /* deadline [s] (lock_now_s()) */
static rp_app_params_t *lock_ctrl_params = NULL ;   /* rp_main_params of the last lock_update() */

static double lock_now_s(void)
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec * 1e-6;
}

static uint32_t lock_control_compose(rp_app_params_t *params)
{
    return (uint32_t) (
            ((int)params[LOCK_CTRL_AUX_LOCK_NOW        ].value) *    1 +
            ((int)params[LOCK_CTRL_AUX_LAUNCH_LOCK_TRIG].value) *    2 +
            ((int)params[LOCK_CTRL_AUX_PIDB_ENABLE_CTRL].value) *    4 +
            ((int)params[LOCK_CTRL_AUX_PIDA_ENABLE_CTRL].value) *    8 +
            ((int)params[LOCK_CTRL_AUX_RAMP_ENABLE_CTRL].value) *   16 +
            ((int)params[LOCK_CTRL_AUX_SET_PIDB_ENABLE ].value) *   32 +
            ((int)params[LOCK_CTRL_AUX_SET_PIDA_ENABLE ].value) *   64 +
            ((int)params[LOCK_CTRL_AUX_SET_RAMP_ENABLE ].value) *  128 +
            ((int)params[LOCK_CTRL_AUX_TRIG_TYPE       ].value) *  256 +
            ((int)params[LOCK_CTRL_AUX_LOCK_TRIG_RISE  ].value) * 1024 );
}

/* lock_ctrl_mutex held: writes lock_control (without the held request bits) if it changed */
static void lock_control_write_locked(rp_app_params_t *params)
{
    uint32_t lc = lock_control_compose(params);
    lock_ctrl_hold &= (lc & 3u);              /* a held request that is no longer requested is dropped */
    if (!lock_ctrl_hold)
        lock_ctrl_need_armed = 0;
    lc &= ~lock_ctrl_hold;
    if (lc != lock_control_written) {
        g_lock_reg->lock_control = lc;
        lock_control_written     = lc;
    }
}

/* lock_ctrl_mutex held: the held request goes to the FPGA now */
static void lock_request_apply_locked(const char *why)
{
    uint32_t held = lock_ctrl_hold;
    lock_ctrl_hold = 0;
    lock_ctrl_need_armed = 0;
    if (held && lock_ctrl_params) {
        lock_control_write_locked(lock_ctrl_params);
        if (why)
            fprintf(stderr, "lock: request 0x%x applied (%s)\n", held, why);
    }
}

/* lock_ctrl_mutex held: applies the held request if nothing holds it any more */
static void lock_request_try_locked(void)
{
    if (!lock_ctrl_hold || !lock_ctrl_hold_commit)
        return;
    if (lock_ctrl_need_armed && !lock_ctrl_hold_armed)
        return;
    lock_request_apply_locked(NULL);
}

/* v2.3.18: the lock trigger registers (this App: lock_trig_val 0x30, lock_trig_time 0x34, lock_trig_sw 0x38) follow the
 * same rule as lock_control. Python (py/lock_from_registers.py --time/--level/--sw, control_finn.py) may write
 * them: before, the web page never showed those values and lock_update() wrote its own copy back at the next
 * change of any lock parameter (a lock armed from Python then fired at the time of the page).
 *  - lock_update() writes each one only when the value derived from its parameter changes
 *    (lock_trig_*_par: the derived value last seen);
 *  - lock_update_status() reads them, and when a register differs from lock_trig_*_reg (the value written by
 *    lock_update() or already taken from outside) copies it to its parameter.
 * lock_trig_known = 0: nothing written yet (lock_init(), the first lock_update() writes all three). */
static int      lock_trig_known    = 0 ;
static int32_t  lock_trig_val_reg  = 0 , lock_trig_val_par  = 0 ;
static uint32_t lock_trig_time_reg = 0 , lock_trig_time_par = 0 ;
static uint32_t lock_trig_sw_reg   = 0 , lock_trig_sw_par   = 0 ;

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
    /* v2.3.18: the registers are reset by fpga_lock_init(): nothing written by this controller yet
     * (also if the library stays loaded between a stop and a start of the App) */
    lock_control_written = 0xffffffff ;
    lock_trig_known      = 0 ;
    pthread_mutex_lock(&lock_ctrl_mutex);
    lock_ctrl_hold       = 0 ;
    lock_ctrl_params     = NULL ;
    pthread_mutex_unlock(&lock_ctrl_mutex);

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
    { /* v2.3.13: lock_control is command + configuration (doc/lock_control.md). Written only when
       * the value composed from lock_ctrl_aux_* changes (keep this block if the dock is regenerated).
       * v2.3.23: without the request bits held until the scope is armed (lock_ctrl_hold) */
        pthread_mutex_lock(&lock_ctrl_mutex);
        lock_ctrl_params = params;
        lock_control_write_locked(params);
        pthread_mutex_unlock(&lock_ctrl_mutex);
    }
  //g_lock_reg->lock_status               = (int)params[LOCK_LOCK_STATUS              ].value;
    { /* v2.3.18: lock trigger registers, written only when their parameter changes (see lock_trig_known;
       * keep this block if the dock is regenerated) */
        int32_t  tv = (int32_t)  params[LOCK_LOCK_TRIG_VAL ].value;
        uint32_t tt = lock_float_to_u32(params[LOCK_LOCK_TRIG_TIME_VAL].value);
        uint32_t ts = (uint32_t)(int)params[LOCK_LOCK_TRIG_SW  ].value;
        if (!lock_trig_known || tv != lock_trig_val_par) {
            g_lock_reg->lock_trig_val  = tv;
            lock_trig_val_par  = tv;
            lock_trig_val_reg  = (int32_t) g_lock_reg->lock_trig_val;    /* as the FPGA keeps it */
        }
        if (!lock_trig_known || tt != lock_trig_time_par) {
            g_lock_reg->lock_trig_time = tt;
            lock_trig_time_par = tt;
            lock_trig_time_reg = g_lock_reg->lock_trig_time;
        }
        if (!lock_trig_known || ts != lock_trig_sw_par) {
            g_lock_reg->lock_trig_sw   = ts;
            lock_trig_sw_par   = ts;
            lock_trig_sw_reg   = g_lock_reg->lock_trig_sw;
        }
        lock_trig_known = 1;
    }
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
    params[ 95].value = (float)g_lock_reg->lock_status           ; // lock_lock_status
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
    // [PARAMSUPDATE DOCK END]

    lock_update_status(params);

    return 0;
}


/*----------------------------------------------------------------------------------*/
/**
 * @brief v2.3.13: Update the lock control status params from the FPGA
 *
 * Copies the read only lock_status register (0x1C) to LOCK_LOCK_STATUS and lock_control to
 * LOCK_LOCK_CONTROL. If lock_control was written from outside the controller (it differs from
 * the last value written by lock_update()) its bits are copied to the LOCK_CTRL_AUX_* params,
 * so the web UI shows the commands/configuration written by Python. v2.3.18: the same for
 * lock_trig_val, lock_trig_time and lock_trig_sw (LOCK_LOCK_TRIG_VAL, _TIME_VAL, _SW). Nothing
 * is ever written to the FPGA here. Cheap (five register reads): called by rp_get_params() on
 * every request (also when the scope gets no triggers) and at the end of lock_update_main().
 *
 * @param[in] params  Pointer to overall configuration parameters
 * @retval -1 FPGA not mapped
 * @retval  0 succesful update
 */
int lock_update_status(rp_app_params_t *params)
{
    uint32_t lc;

    if(g_lock_reg == NULL)
        return -1;

    pthread_mutex_lock(&lock_ctrl_mutex);
    lc = g_lock_reg->lock_control & 0x7ff;
    params[LOCK_LOCK_STATUS ].value = (float) (g_lock_reg->lock_status & 0xffff);
    params[LOCK_LOCK_CONTROL].value = (float) lc;

    /* v2.3.23: a request held by the controller for the scope (Capture Lock) is shown as ARMED */
    if(lock_ctrl_hold && !(g_lock_reg->lock_status & 2))
        params[LOCK_LOCK_STATUS].value = (float) ((g_lock_reg->lock_status & 0xffff) | 1);

    if(lc != lock_control_written) {
        lock_ctrl_hold = 0;          /* v2.3.23: written from outside: that value rules */
        lock_ctrl_need_armed = 0;
        params[LOCK_CTRL_AUX_LOCK_NOW        ].value = (float) ((lc >>  0) & 0x01);
        params[LOCK_CTRL_AUX_LAUNCH_LOCK_TRIG].value = (float) ((lc >>  1) & 0x01);
        params[LOCK_CTRL_AUX_PIDB_ENABLE_CTRL].value = (float) ((lc >>  2) & 0x01);
        params[LOCK_CTRL_AUX_PIDA_ENABLE_CTRL].value = (float) ((lc >>  3) & 0x01);
        params[LOCK_CTRL_AUX_RAMP_ENABLE_CTRL].value = (float) ((lc >>  4) & 0x01);
        params[LOCK_CTRL_AUX_SET_PIDB_ENABLE ].value = (float) ((lc >>  5) & 0x01);
        params[LOCK_CTRL_AUX_SET_PIDA_ENABLE ].value = (float) ((lc >>  6) & 0x01);
        params[LOCK_CTRL_AUX_SET_RAMP_ENABLE ].value = (float) ((lc >>  7) & 0x01);
        params[LOCK_CTRL_AUX_TRIG_TYPE       ].value = (float) ((lc >>  8) & 0x03);
        params[LOCK_CTRL_AUX_LOCK_TRIG_RISE  ].value = (float) ((lc >> 10) & 0x01);
        lock_control_written = lc;
    }
    pthread_mutex_unlock(&lock_ctrl_mutex);

    /* v2.3.18: lock trigger registers written from outside (see lock_trig_known) */
    if(lock_trig_known) {
        int32_t  tv = (int32_t) g_lock_reg->lock_trig_val;
        uint32_t tt = g_lock_reg->lock_trig_time;
        uint32_t ts = g_lock_reg->lock_trig_sw;
        if(tv != lock_trig_val_reg) {
            params[LOCK_LOCK_TRIG_VAL     ].value = (float) tv;
            lock_trig_val_reg  = tv;
            lock_trig_val_par  = (int32_t) params[LOCK_LOCK_TRIG_VAL].value;
        }
        if(tt != lock_trig_time_reg) {
            /* float: above 2**24 ticks the parameter is rounded (<= 128 ticks, 1 us); the register keeps the
             * exact value, lock_update() does not write it back unless the parameter changes */
            params[LOCK_LOCK_TRIG_TIME_VAL].value = (float) tt;
            lock_trig_time_reg = tt;
            lock_trig_time_par = lock_float_to_u32(params[LOCK_LOCK_TRIG_TIME_VAL].value);
        }
        if(ts != lock_trig_sw_reg) {
            params[LOCK_LOCK_TRIG_SW      ].value = (float) ts;
            lock_trig_sw_reg   = ts;
            lock_trig_sw_par   = (uint32_t)(int) params[LOCK_LOCK_TRIG_SW].value;
        }
    }

    return 0;
}


/*----------------------------------------------------------------------------------*/
/* v2.3.23: lock request held until the scope is armed (see lock_ctrl_hold) */

/* rp_set_params(), before lock_update(): hold the request bits 'mask' (1 lock_now, 2 launch_lock_trig) until the
 * worker enables the trigger of an acquisition of generation >= gen, at most timeout_s */
void lock_request_hold(uint32_t mask, int gen, double timeout_s)
{
    pthread_mutex_lock(&lock_ctrl_mutex);
    lock_ctrl_hold       |= (mask & 3u);
    lock_ctrl_need_armed  = 1;
    lock_ctrl_hold_gen    = gen;
    lock_ctrl_hold_armed  = 0;
    lock_ctrl_hold_commit = 0;
    lock_ctrl_hold_until  = lock_now_s() + timeout_s;
    pthread_mutex_unlock(&lock_ctrl_mutex);
}

/* rp_set_params(), after lock_update(): the other lock registers of the POST are written */
void lock_request_commit(void)
{
    pthread_mutex_lock(&lock_ctrl_mutex);
    lock_ctrl_hold_commit = 1;
    lock_request_try_locked();
    pthread_mutex_unlock(&lock_ctrl_mutex);
}

/* scope worker: the trigger of an acquisition armed with parameters of generation gen is enabled */
void lock_request_armed(int gen)
{
    pthread_mutex_lock(&lock_ctrl_mutex);
    if (lock_ctrl_hold && lock_ctrl_need_armed && gen >= lock_ctrl_hold_gen) {
        lock_ctrl_hold_armed = 1;
        lock_request_try_locked();
    }
    pthread_mutex_unlock(&lock_ctrl_mutex);
}

/* any thread, often (rp_get_params(), worker loop): a held request past its deadline is applied anyway */
void lock_request_poll(void)
{
    pthread_mutex_lock(&lock_ctrl_mutex);
    if (lock_ctrl_hold && lock_ctrl_hold_commit && lock_ctrl_need_armed && !lock_ctrl_hold_armed &&
        lock_now_s() > lock_ctrl_hold_until) {
        lock_ctrl_need_armed = 0;
        lock_request_apply_locked("scope not armed in time");
    }
    pthread_mutex_unlock(&lock_ctrl_mutex);
}

/* request bits held now (0: none) */
uint32_t lock_request_held(void)
{
    uint32_t h;
    pthread_mutex_lock(&lock_ctrl_mutex);
    h = lock_ctrl_hold;
    pthread_mutex_unlock(&lock_ctrl_mutex);
    return h;
}
