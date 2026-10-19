/**
 * $Id: worker.c 881 2013-12-16 05:37:34Z rp_jmenart $
 *
 * @brief Red Pitaya Oscilloscope worker.
 *
 * @Author Jure Menart <juremenart@gmail.com>
 *
 * (c) Red Pitaya  http://www.redpitaya.com
 *
 * This part of code is written in C programming language.
 * Please visit http://en.wikipedia.org/wiki/C_(programming_language)
 * for more details on the language used herein.
 */

#include <stdio.h>
#include <pthread.h>
#include <errno.h>
#include <string.h>
#include <unistd.h>
#include <math.h>
#include <stdlib.h>
#include <limits.h>
#include <time.h>

#include "worker.h"
#include "fpga.h"
#include "fpga_lock.h"   /* v2.2.11: g_lock_reg (Auto time limit) */
#include "lock.h"         /* v2.2.9: lock_request_*() (Capture Lock, from lock_in+pid_harmonic 2.3.23) */

pthread_t *rp_osc_thread_handler = NULL;
void *rp_osc_worker_thread(void *args);

pthread_mutex_t       rp_osc_ctrl_mutex = PTHREAD_MUTEX_INITIALIZER;
rp_osc_worker_state_t rp_osc_ctrl;
rp_app_params_t       *rp_osc_params = NULL;
int                   rp_osc_params_dirty;
int                   rp_osc_params_fpga_update;
/* v2.3.14 (Capture Lock): generation of the parameters given to the worker (incremented by
 * rp_osc_worker_update_params()) and generation/state of the last acquisition the worker armed,
 * so that rp_set_params() can apply a lock request only after the scope is armed
 * (see rp_osc_worker_wait_armed()). Protected by rp_osc_ctrl_mutex. */
static int                   rp_osc_params_gen  = 0;
static int                   rp_osc_armed_gen   = -1;
static rp_osc_worker_state_t rp_osc_armed_state = rp_osc_idle_state;
/* v2.3.23: state of the acquisition of the worker (scope_acq_state, see main.h) and its parameter generation.
 * Protected by rp_osc_ctrl_mutex. */
static int                   rp_osc_acq_state   = 0;
static int                   rp_osc_acq_gen     = -1;

pthread_mutex_t       rp_osc_sig_mutex = PTHREAD_MUTEX_INITIALIZER;
float               **rp_osc_signals;
int                   rp_osc_signals_dirty = 0;
int                   rp_osc_sig_last_idx = 0;
/* v2.3.23: parameter generation of the published trace (rp_osc_set_signals_gen()) and of the last one copied
 * out by rp_osc_get_signals() (sig_gen, see main.h). Protected by rp_osc_sig_mutex. */
static int            rp_osc_sig_pub_gen    = -1;
static int            rp_osc_sig_served_gen = -1;
float               **rp_tmp_signals; /* used for calculation, only from worker */

/* Signals directly pointing at the FPGA mem space */
int                  *rp_fpga_cha_signal, *rp_fpga_chb_signal;

/* Calibration parameters read from EEPROM */
rp_calib_params_t *rp_calib_params = NULL;

/* v2.3.23: reader of a long acquisition (rp_osc_long_rd_*(), see there) */
typedef struct rp_osc_long_rd_s {
    int       trig_ptr;     /* buffer address of the trigger sample (s = 0) */
    int       last_cur;     /* last write pointer read */
    long long written;      /* samples written from the trigger on: s = 0 .. written-1 */
    long long pre_valid;    /* samples before the trigger that belong to this acquisition */
    int       s0, step;     /* sample of the point 0 and samples between points */
    int       n_pts;        /* points up to the end of the window of the user (the others: after it) */
    int       next;         /* next point to read */
    int       first_valid;  /* first point with data (-1: none yet) */
    long long meas_n;       /* raw samples in the measurements */
    double    smpl_us;      /* sample period [us] */
} rp_osc_long_rd_t;

static void rp_osc_long_rd_start(rp_osc_long_rd_t *rd, int s0, int step, int n_pts, long long pre_sw, float smpl_period);
static void rp_osc_long_rd_update(rp_osc_long_rd_t *rd);
static long long rp_osc_long_rd_wait_us(const rp_osc_long_rd_t *rd);
static int rp_osc_long_rd_read(rp_osc_long_rd_t *rd, int done,
                               float **cha_out_signal, int *cha_in_signal,
                               float **chb_out_signal, int *chb_in_signal,
                               float **time_out_signal,
                               float t_start, int dec_factor, int time_unit,
                               rp_osc_meas_res_t *ch1_meas, rp_osc_meas_res_t *ch2_meas,
                               float ch1_max_adc_v, float ch2_max_adc_v,
                               float ch1_user_dc_off, float ch2_user_dc_off);
static void rp_osc_long_rd_fill_tail(const rp_osc_long_rd_t *rd, float **sig);


/*----------------------------------------------------------------------------------*/
int rp_osc_worker_init(rp_app_params_t *params, int params_len,
                       rp_calib_params_t *calib_params)
{
    int ret_val;

    rp_osc_ctrl               = rp_osc_idle_state;
    rp_osc_params_dirty       = 0;
    rp_osc_params_fpga_update = 0;

    rp_copy_params(params, (rp_app_params_t **)&rp_osc_params);

    rp_cleanup_signals(&rp_osc_signals);
    if(rp_create_signals(&rp_osc_signals) < 0)
        return -1;

    rp_cleanup_signals(&rp_tmp_signals);
    if(rp_create_signals(&rp_tmp_signals) < 0) {
        rp_cleanup_signals(&rp_osc_signals);
        return -1;
    }

    if(osc_fpga_init() < 0) {
        rp_cleanup_signals(&rp_osc_signals);
        rp_cleanup_signals(&rp_tmp_signals);
        return -1;
    }

    rp_calib_params = calib_params;

    osc_fpga_get_sig_ptr(&rp_fpga_cha_signal, &rp_fpga_chb_signal);

    rp_osc_thread_handler = (pthread_t *)malloc(sizeof(pthread_t));
    if(rp_osc_thread_handler == NULL) {
        rp_cleanup_signals(&rp_osc_signals);
        rp_cleanup_signals(&rp_tmp_signals);
        return -1;
    }
    ret_val =
        pthread_create(rp_osc_thread_handler, NULL, rp_osc_worker_thread, NULL);
    if(ret_val != 0) {
        osc_fpga_exit();

        rp_cleanup_signals(&rp_osc_signals);
        rp_cleanup_signals(&rp_tmp_signals);
        fprintf(stderr, "pthread_create() failed: %s\n",
                strerror(errno));
        return -1;
    }

    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_worker_exit(void)
{
    int ret_val = 0;

    rp_osc_worker_change_state(rp_osc_quit_state);
    if(rp_osc_thread_handler) {
        ret_val = pthread_join(*rp_osc_thread_handler, NULL);
        free(rp_osc_thread_handler);
        rp_osc_thread_handler = NULL;
    }
    if(ret_val != 0) {
        fprintf(stderr, "pthread_join() failed: %s\n",
                strerror(errno));
    }
    osc_fpga_exit();

    rp_cleanup_signals(&rp_osc_signals);
    rp_cleanup_signals(&rp_tmp_signals);

    rp_clean_params(rp_osc_params);

    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_worker_change_state(rp_osc_worker_state_t new_state)
{
    if(new_state >= rp_osc_nonexisting_state)
        return -1;
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    rp_osc_ctrl = new_state;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);
    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_worker_get_state(rp_osc_worker_state_t *state)
{
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    *state = rp_osc_ctrl;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);
    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_worker_update_params(rp_app_params_t *params, int fpga_update)
{
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    rp_copy_params(params, (rp_app_params_t **)&rp_osc_params);
    rp_osc_params_dirty       = 1;
    rp_osc_params_fpga_update = fpga_update;
    rp_osc_params_gen++;
    rp_osc_params[PARAMS_NUM].name = NULL;
    rp_osc_params[PARAMS_NUM].value = -1;

    pthread_mutex_unlock(&rp_osc_ctrl_mutex);

    return 0;
}


/*----------------------------------------------------------------------------------*/
/* v2.3.14: new parameters and the auto-set state under the same lock, so the worker always runs the
 * auto-set with these parameters (it reads the state and the 'dirty' parameters together). */
int rp_osc_worker_start_auto_set(rp_app_params_t *params, int fpga_update)
{
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    rp_copy_params(params, (rp_app_params_t **)&rp_osc_params);
    rp_osc_params_dirty       = 1;
    rp_osc_params_fpga_update = fpga_update;
    rp_osc_params_gen++;
    rp_osc_params[PARAMS_NUM].name = NULL;
    rp_osc_params[PARAMS_NUM].value = -1;
    rp_osc_ctrl = rp_osc_auto_set_state;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);

    return 0;
}


/*----------------------------------------------------------------------------------*/
/* v2.3.14: generation of the last parameters given with rp_osc_worker_update_params() */
int rp_osc_worker_params_gen(void)
{
    int gen;
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    gen = rp_osc_params_gen;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);
    return gen;
}


/*----------------------------------------------------------------------------------*/
/* v2.3.23: generation of the parameters of the last acquisition whose trigger the worker enabled (-1: none),
 * only while it still waits for that trigger in that state */
int rp_osc_worker_armed_gen(rp_osc_worker_state_t state)
{
    int g;
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    g = (rp_osc_armed_state == state && rp_osc_acq_state == 2) ? rp_osc_armed_gen : -1;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);
    return g;
}


/*----------------------------------------------------------------------------------*/
/* v2.3.14: wait until the worker has armed the scope (trigger enabled, pre-trigger history
 * loaded) with parameters of generation >= gen and in state 'state'.
 * Returns 0 when armed, -1 on timeout (e.g. streaming owns the scope). */
int rp_osc_worker_wait_armed(int gen, rp_osc_worker_state_t state, int timeout_us)
{
    const int step = 200; /* [us] */
    while(1) {
        int ok;
        pthread_mutex_lock(&rp_osc_ctrl_mutex);
        ok = (rp_osc_armed_gen >= gen) && (rp_osc_armed_state == state);
        pthread_mutex_unlock(&rp_osc_ctrl_mutex);
        if(ok)
            return 0;
        if(timeout_us <= 0)
            return -1;
        usleep(step);
        timeout_us -= step;
    }
}


/*----------------------------------------------------------------------------------*/
int rp_osc_clean_signals(void)
{
    pthread_mutex_lock(&rp_osc_sig_mutex);
    rp_osc_signals_dirty = 0;
    pthread_mutex_unlock(&rp_osc_sig_mutex);
    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_get_signals(float ***signals, int *sig_idx)
{
    float **s = *signals;
    pthread_mutex_lock(&rp_osc_sig_mutex);
    if(rp_osc_signals_dirty == 0) {
        *sig_idx = rp_osc_sig_last_idx;
        pthread_mutex_unlock(&rp_osc_sig_mutex);
        return -1;
    }

    memcpy(&s[0][0], &rp_osc_signals[0][0], sizeof(float)*SIGNAL_LENGTH);
    memcpy(&s[1][0], &rp_osc_signals[1][0], sizeof(float)*SIGNAL_LENGTH);
    memcpy(&s[2][0], &rp_osc_signals[2][0], sizeof(float)*SIGNAL_LENGTH);

    *sig_idx = rp_osc_sig_last_idx;
    rp_osc_sig_served_gen = rp_osc_sig_pub_gen;

    rp_osc_signals_dirty = 0;
    pthread_mutex_unlock(&rp_osc_sig_mutex);
    return 0;
}


/*----------------------------------------------------------------------------------*/
/* v2.3.23: parameter generation of the last trace copied out by rp_osc_get_signals() (-1: none) */
int rp_osc_get_signals_gen(void)
{
    int g;
    pthread_mutex_lock(&rp_osc_sig_mutex);
    g = rp_osc_sig_served_gen;
    pthread_mutex_unlock(&rp_osc_sig_mutex);
    return g;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_set_signals(float **source, int index)
{
    return rp_osc_set_signals_gen(source, index, -1);
}

/* v2.3.23: the same, with the parameter generation of the acquisition (sig_gen) */
int rp_osc_set_signals_gen(float **source, int index, int gen)
{
    pthread_mutex_lock(&rp_osc_sig_mutex);
    rp_osc_sig_pub_gen = gen;

    memcpy(&rp_osc_signals[0][0], &source[0][0], sizeof(float)*SIGNAL_LENGTH);
    memcpy(&rp_osc_signals[1][0], &source[1][0], sizeof(float)*SIGNAL_LENGTH);
    memcpy(&rp_osc_signals[2][0], &source[2][0], sizeof(float)*SIGNAL_LENGTH);
    rp_osc_sig_last_idx = index;

    rp_osc_signals_dirty = 1;
    pthread_mutex_unlock(&rp_osc_sig_mutex);

    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_set_meas_data(rp_osc_meas_res_t ch1_meas, rp_osc_meas_res_t ch2_meas)
{
    rp_update_meas_data(ch1_meas, ch2_meas);
    return 0;
}


/*----------------------------------------------------------------------------------*/
/* v2.3.23: monotonic time [us] (the waits of the worker must not follow NTP steps of the clock) */
static long long rp_osc_now_us(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000000LL + ts.tv_nsec / 1000;
}

/* v2.3.23: state of the acquisition of the worker, for rp_get_params() (scope_acq_state / scope_acq_gen) */
static void rp_osc_acq_set(int state, int gen)
{
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    rp_osc_acq_state = state;
    rp_osc_acq_gen   = gen;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);
}

int rp_osc_worker_acq_status(int *state, int *gen)
{
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    if(state) *state = rp_osc_acq_state;
    if(gen)   *gen   = rp_osc_acq_gen;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);
    return 0;
}

/* v2.3.23: the state or the parameters of the worker changed */
static int rp_osc_worker_changed(rp_osc_worker_state_t state)
{
    int changed;
    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    changed = (rp_osc_ctrl != state) || rp_osc_params_dirty;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);
    return changed;
}

/* v2.3.23: sleeps until t_end_us (rp_osc_now_us()) in steps of at most 10 ms. Returns 1 at once if the state
 * or the parameters change meanwhile (the caller goes back to the top of the loop, where an acquisition with
 * the same settings is resumed, not armed again), 0 when the time is over. */
static int rp_osc_worker_sleep_until(long long t_end_us, rp_osc_worker_state_t state)
{
    while(1) {
        long long d;
        if(rp_osc_worker_changed(state))
            return 1;
        d = t_end_us - rp_osc_now_us();
        if(d <= 0)
            return 0;
        usleep((useconds_t)(d > 10000 ? 10000 : d));
    }
}

/* v2.3.23: parameters that define an acquisition (FPGA settings, window, conversions of the trace). A new copy
 * of the parameters with all of them unchanged (e.g. the same Single POST sent again by the page, or
 * single_btn alone) does not abort the acquisition in progress: it is resumed. */
static const int rp_osc_acq_keys[] = {
    MIN_GUI_PARAM, MAX_GUI_PARAM, TRIG_MODE_PARAM, TRIG_SRC_PARAM, TRIG_EDGE_PARAM, TRIG_DLY_PARAM,
    TRIG_LEVEL_PARAM, TIME_RANGE_PARAM, TIME_UNIT_PARAM, EN_AVG_AT_DEC, PRB_ATT_CH1, GAIN_CH1, PRB_ATT_CH2,
    GAIN_CH2, GEN_DC_OFFS_1, GEN_DC_OFFS_2, LOCK_OSCA_SW, LOCK_OSCB_SW, LOCK_OSC_RAW_MODE, LOCK_OSC_LOCKIN_MODE,
    -1 };

static int rp_osc_acq_params_same(const rp_app_params_t *a, const rp_app_params_t *b)
{
    int i;
    if(!a || !b)
        return 0;
    for(i = 0; rp_osc_acq_keys[i] >= 0; i++)
        if(a[rp_osc_acq_keys[i]].value != b[rp_osc_acq_keys[i]].value)
            return 0;
    return 1;
}

/* v2.3.23: trace with no data (all the points on (t_start, 0)): replaces a trace in other time units, which the
 * page would draw on the new axis (e.g. ms values on an axis in s after Reset zoom), until the next one comes */
static void rp_osc_publish_empty(float t_start_units, int gen)
{
    int i;
    for(i = 0; i < SIGNAL_LENGTH; i++) {
        rp_tmp_signals[0][i] = t_start_units;
        rp_tmp_signals[1][i] = 0;
        rp_tmp_signals[2][i] = 0;
    }
    rp_osc_set_signals_gen(rp_tmp_signals, 0, gen);
}

/* v2.2.11 (from lock_in+pid_harmonic 2.3.26): Auto mode waits for the trigger
 * (level of a channel, or Ext Trig with Source = External) like Normal,
 * and forces the acquisition only when no trigger came within a time limit (as the Auto of a bench scope). Up to
 * v2.2.10 Auto was an immediate trigger (osc_fpga_cnv_trig_source(trig_imm = 1)): t = 0 fell on any phase of the
 * scan even with Ext Trig = Scan floor (testAgent, sq 2.0.3/2.0.4, 2026-10-19).
 * Time limit, counted from the moment the trigger is enabled (after the pre-trigger history):
 *   max( AUTO_TRIG_MIN_S,                      unknown period: free view refreshed ~4 times per second
 *        1.1 * window + 50 ms,                 a signal with a period up to the window always triggers in time
 *        1.1 * period of the Ext Trig + 50 ms  known period: Scan floor / ceil (ramp running) and modulation )
 * at most AUTO_TRIG_MAX_S (longer than the longest window, 68.7 s). A 30 s scan seen in a 0..29.4 s window waits
 * up to 33.05 s: Auto acquires every scan from its floor, as Normal, while the floors come. */
#define AUTO_TRIG_MIN_S   0.25
#define AUTO_TRIG_MAX_S   80.0

/* Period of the Ext Trig event of the lock module (lock trig_sw), in seconds; 0 if unknown or not periodic */
static double rp_osc_ext_trig_period_s(void)
{
    uint32_t sw;
    if(!g_lock_reg)
        return 0;
    sw = g_lock_reg->trig_sw;
    if(sw == 2 || sw == 4) {
        /* Scan floor / Scan ceil: ramp of gen_ramp.v (as rampPeriodCycles() of the page), only if it runs: Scan
         * enable on, not in reset, and the effective ramp enable of lock_ctrl.v (lock_status bit 4; off e.g. when
         * LOCKED with the ramp off): a stopped scan gives no floors, so the free view is not slowed down */
        double span = (double)(int32_t)g_lock_reg->ramp_hig_lim - (double)(int32_t)g_lock_reg->ramp_low_lim;
        double cyc  = (double)g_lock_reg->ramp_step + 1.0;
        if(!(g_lock_reg->ramp_enable & 1) || (g_lock_reg->ramp_reset & 1) || !((g_lock_reg->lock_status >> 4) & 1) ||
           span <= 0)
            return 0;
        return (2 * span * cyc) * 8e-9;      /* triangle (no sawtooth in this App) */
    }
    if(sw == 8)   /* harmonic mod.: 2520 table points, each one held gen_mod_hp+1 cycles (gen_mod_h.v) */
        return 2520.0 * ((g_lock_reg->gen_mod_hp & 0x3FFF) + 1) * 8e-9;
    if(sw == 16) {   /* Square mod.: 2*(gen_mod_sqp+1) cycles; sqp 0: once per harmonic period (sqPeriodCycles()) */
        if(g_lock_reg->gen_mod_sqp == 0)
            return 2520.0 * ((g_lock_reg->gen_mod_hp & 0x3FFF) + 1) * 8e-9;
        return 2.0 * ((double)g_lock_reg->gen_mod_sqp + 1.0) * 8e-9;
    }
    return 0;
}

/* Time limit of an Auto acquisition [us] (see above) */
static long long rp_osc_auto_timeout_us(const rp_app_params_t *p)
{
    double unit  = rp_osc_get_time_unit_factor((int)p[TIME_UNIT_PARAM].value);
    double t_win = (p[MAX_GUI_PARAM].value - p[MIN_GUI_PARAM].value) / unit;
    double per   = ((int)p[TRIG_SRC_PARAM].value == 2) ? rp_osc_ext_trig_period_s() : 0;
    double t     = AUTO_TRIG_MIN_S;
    if(t_win > 0 && 1.1 * t_win + 0.05 > t)
        t = 1.1 * t_win + 0.05;
    if(per > 0 && 1.1 * per + 0.05 > t)
        t = 1.1 * per + 0.05;
    if(t > AUTO_TRIG_MAX_S)
        t = AUTO_TRIG_MAX_S;
    return (long long)(t * 1e6);
}


/*----------------------------------------------------------------------------------*/
void *rp_osc_worker_thread(void *args)
{
    rp_osc_worker_state_t state;
    rp_app_params_t      *curr_params = NULL;
    rp_app_params_t      *prev_params = NULL;  /* v2.3.23: copy before the last new parameters */
    int                   fpga_update = 0;
    int                   dec_factor = 0;
    int                   time_vect_update = 0;
    uint32_t              trig_source = 0;
    int                   curr_gen = -1;       /* generation of curr_params (v2.3.14) */

    /* Long acquisition: windows of 1.5 s or more are read while the FPGA writes them (partial traces) */
    int long_acq = 0;
    rp_osc_long_rd_t rd;

    /* v2.3.23: acquisition in progress. It is kept (resumed) across new parameters that do not change it
     * (rp_osc_acq_params_same()) and across a change of the state back to the same one: before, any POST
     * that reached the worker (e.g. the Single + lock request POST sent again by the page after a timeout)
     * re-armed the scope and waited the whole pre-trigger history again. */
    int acq_armed = 0;                  /* FPGA armed for it */
    int acq_trig_set = 0;               /* its trigger source is enabled */
    int acq_trig = 0;                   /* its trigger was received */
    int acq_published = 0;              /* (non-long) acq. state 3 published */
    int acq_forced = 0;                 /* v2.2.11: Auto: no trigger in its time limit, acquisition forced */
    rp_osc_worker_state_t acq_state = rp_osc_idle_state;   /* worker state it was armed in */
    long long acq_arm_us = 0, acq_trig_set_us = 0, acq_pre_wait_us = 0, acq_next_rd_us = 0;
    /* time units of the last published trace (rp_osc_publish_empty()) */
    float pub_units = -1;

    rp_osc_meas_res_t ch1_meas, ch2_meas;
    float ch1_max_adc_v = 1, ch2_max_adc_v = 1;
    float max_adc_norm = osc_fpga_calc_adc_max_v(rp_calib_params->fe_ch1_fs_g_hi, 0);

    //lolo
    int32_t  fe_ch1_dc_offs=0;
    int32_t  fe_ch2_dc_offs=0;

    (void)args;
    memset(&rd, 0, sizeof(rd));
    rp_osc_meas_clear(&ch1_meas);
    rp_osc_meas_clear(&ch2_meas);

    pthread_mutex_lock(&rp_osc_ctrl_mutex);
    state = rp_osc_ctrl;
    pthread_mutex_unlock(&rp_osc_ctrl_mutex);

    while(1) {
        int new_params = 0;

        pthread_mutex_lock(&rp_osc_ctrl_mutex);
        state = rp_osc_ctrl;

        if(rp_osc_params_dirty) {
            if(curr_params)
                rp_copy_params(curr_params, (rp_app_params_t **)&prev_params);
            rp_copy_params(rp_osc_params, (rp_app_params_t **)&curr_params);
            fpga_update = rp_osc_params_fpga_update;

            rp_osc_params_dirty = 0;
            curr_gen = rp_osc_params_gen;
            new_params = 1;
            dec_factor =
                osc_fpga_cnv_time_range_to_dec(curr_params[TIME_RANGE_PARAM].value);

            uint32_t fe_fsg1 = (curr_params[GAIN_CH1].value == 0) ?
                    rp_calib_params->fe_ch1_fs_g_hi :
                    rp_calib_params->fe_ch1_fs_g_lo;
            ch1_max_adc_v =
                    osc_fpga_calc_adc_max_v(fe_fsg1, (int)curr_params[PRB_ATT_CH1].value);

            uint32_t fe_fsg2 = (curr_params[GAIN_CH2].value == 0) ?
                    rp_calib_params->fe_ch2_fs_g_hi :
                    rp_calib_params->fe_ch2_fs_g_lo;
            ch2_max_adc_v =
                    osc_fpga_calc_adc_max_v(fe_fsg2, (int)curr_params[PRB_ATT_CH2].value);
        }

        pthread_mutex_unlock(&rp_osc_ctrl_mutex);

        /* request to stop worker thread, we will shut down */
        if(state == rp_osc_quit_state) {
            rp_clean_params(curr_params);
            rp_clean_params(prev_params);
            return 0;
        }

        /* v2.3.23: lock request held for the scope past its deadline (lock.c) */
        lock_request_poll();

        if(state == rp_osc_auto_set_state) {
            acq_armed = 0;
            rp_osc_acq_set(0, curr_gen);
            /* Auto-set algorithm was selected - run it */
            int auto_ret = rp_osc_auto_set(curr_params, ch1_max_adc_v, ch2_max_adc_v,
                            curr_params[GEN_DC_OFFS_1].value,
                            curr_params[GEN_DC_OFFS_2].value,
                            curr_params[PRB_ATT_CH1].value,
                            curr_params[PRB_ATT_CH2].value,
                            curr_params[GAIN_CH1].value,
                            curr_params[GAIN_CH2].value,
                            curr_params[EN_AVG_AT_DEC].value);
            if(auto_ret == 0) {
                /* Return calculated parameters to main module (v2.3.14: only the auto-set ones) */
                rp_update_main_params(curr_params);
            } else {
                /* v2.3.14: aborted. New parameters with the auto-set state: the loop runs it again
                 * with them. Another state: nothing to copy back, only auto_flag is cleared. */
                rp_osc_worker_state_t st;
                rp_osc_worker_get_state(&st);
                if(st != rp_osc_auto_set_state)
                    rp_auto_set_aborted();
            }
            /* the auto-set left the FPGA with its own settings */
            fpga_update = 1;
            continue;
        }

        if(curr_params == NULL) {
            usleep(10000);
            continue;
        }

        if( rp_osc_params[LOCK_OSCA_SW].value==1 )
            fe_ch1_dc_offs=rp_calib_params->fe_ch1_dc_offs;
        else if( rp_osc_params[LOCK_OSCA_SW].value==2 )
            fe_ch1_dc_offs=rp_calib_params->fe_ch2_dc_offs;
        else
            fe_ch1_dc_offs=0;

        if( rp_osc_params[LOCK_OSCB_SW].value==1 )
            fe_ch2_dc_offs=rp_calib_params->fe_ch1_dc_offs;
        else if( rp_osc_params[LOCK_OSCB_SW].value==2 )
            fe_ch2_dc_offs=rp_calib_params->fe_ch2_dc_offs;
        else
            fe_ch2_dc_offs=0;

        /* v2.3.23: new parameters that do not change the acquisition in progress (same state): resume it */
        if(new_params) {
            /* (v2.3.23) only while it still waits for its trigger: a Single after the trigger is a new acquisition
             * (else a new Capture Lock request would take the trace of an older event) */
            if(acq_armed && !acq_trig && (state == acq_state) && rp_osc_acq_params_same(prev_params, curr_params)) {
                fpga_update = 0;
                rp_osc_acq_set(acq_trig_set ? 2 : 1, curr_gen);
                /* (v2.3.23) already armed for this generation: say so (a lock request of this POST is held for
                 * it; before, it waited for its deadline: RP2, 10.9 s) */
                if(acq_trig_set) {
                    pthread_mutex_lock(&rp_osc_ctrl_mutex);
                    rp_osc_armed_gen   = curr_gen;
                    rp_osc_armed_state = state;
                    pthread_mutex_unlock(&rp_osc_ctrl_mutex);
                    lock_request_armed(curr_gen);
                }
            } else {
                acq_armed = 0;
                time_vect_update = 1;
            }
        }
        /* other state (e.g. Normal -> Single): a new acquisition */
        if(acq_armed && (state != acq_state))
            acq_armed = 0;

        if(fpga_update) {
            acq_armed = 0;
            osc_fpga_reset();
            /* v2.2.11: also in Auto the trigger source is the real one (trig_imm 0); the worker forces the
             * acquisition if no trigger comes in time (rp_osc_auto_timeout_us()) */
            if(osc_fpga_update_params(0,
                                      curr_params[TRIG_SRC_PARAM].value,
                                      curr_params[TRIG_EDGE_PARAM].value,
                                      /* Here we could use trigger, but it is safer
                                       * to use start GUI value (it was recalculated
                                       * correctly already in rp_osc_main() so we
                                       * can use it and be sure that all signal
                                       * (even if extended becuase of decimation
                                       * will be covered in the acquisition
                                       */
                                      /*curr_params[TRIG_DLY_PARAM].value,*/
                                      curr_params[MIN_GUI_PARAM].value,
                                      curr_params[TRIG_LEVEL_PARAM].value,
                                      curr_params[TIME_RANGE_PARAM].value,
                                      max_adc_norm, max_adc_norm,
                                      fe_ch1_dc_offs,
                                      curr_params[GEN_DC_OFFS_1].value,
                                      fe_ch2_dc_offs,
                                      curr_params[GEN_DC_OFFS_2].value,
                                      curr_params[PRB_ATT_CH1].value,
                                      curr_params[PRB_ATT_CH2].value,
                                      curr_params[GAIN_CH1].value,
                                      curr_params[GAIN_CH2].value,
                                      curr_params[EN_AVG_AT_DEC].value) < 0) {
                fprintf(stderr, "Setting of FPGA registers failed\n");
                rp_osc_worker_change_state(rp_osc_idle_state);
            }
            trig_source = osc_fpga_cnv_trig_source(0,
                                     curr_params[TRIG_SRC_PARAM].value,
                                     curr_params[TRIG_EDGE_PARAM].value);

            fpga_update = 0;
        }

        if(time_vect_update) {
            float unit_factor =
                rp_osc_get_time_unit_factor(curr_params[TIME_UNIT_PARAM].value);
            float t_acq = (curr_params[MAX_GUI_PARAM].value -
                           curr_params[MIN_GUI_PARAM].value) / unit_factor;

            rp_osc_prepare_time_vector((float **)&rp_tmp_signals[0],
                                       dec_factor,
                                       curr_params[MIN_GUI_PARAM].value,
                                       curr_params[MAX_GUI_PARAM].value,
                                       curr_params[TIME_UNIT_PARAM].value);

            time_vect_update = 0;

            /* check if we have long acquisition - if yes the algorithm
             * (wait for pre-defined time and return partial signal) */
            /* TODO: Make it programmable */
            long_acq = (t_acq >= 1.5);

            /* v2.3.23: other time units than the last trace: that trace is replaced by an empty one at once */
            if((pub_units >= 0) && (curr_params[TIME_UNIT_PARAM].value != pub_units)) {
                rp_osc_publish_empty(curr_params[MIN_GUI_PARAM].value * unit_factor, curr_gen);
                pub_units = curr_params[TIME_UNIT_PARAM].value;
            }
        }

        if((state == rp_osc_idle_state) || (state == rp_osc_abort_state)) {
            if(acq_armed) {
                acq_armed = 0;
                rp_osc_acq_set(0, curr_gen);
            }
            usleep(10000);
            continue;
        }

        /* New acquisition: arm (the FPGA writes from now on) */
        if(!acq_armed) {
            float time_delay = curr_params[TRIG_DLY_PARAM].value;
            osc_fpga_arm_trigger();
            acq_armed     = 1;
            acq_trig_set  = 0;
            acq_trig      = 0;
            acq_published = 0;
            acq_forced    = 0;
            acq_state     = state;
            acq_arm_us    = rp_osc_now_us();
            /* Be sure to have enough time to load necessary history: time delay is always in seconds */
            if(time_delay < 0)
                acq_pre_wait_us = (long long)round(-1 * time_delay * 1e6);
            else
                acq_pre_wait_us = (curr_params[TIME_RANGE_PARAM].value > 4) ? 5000 : 1;
            rp_osc_meas_clear(&ch1_meas);
            rp_osc_meas_clear(&ch2_meas);
            rp_osc_acq_set(1, curr_gen);
        }

        /* Pre-trigger history: wait (v2.3.23: interrupted by a change, and resumed if the change does not
         * touch this acquisition), then enable the trigger */
        if(!acq_trig_set) {
            if(rp_osc_worker_sleep_until(acq_arm_us + acq_pre_wait_us, state))
                continue;
            osc_fpga_set_trigger(trig_source);
            acq_trig_set    = 1;
            acq_trig_set_us = rp_osc_now_us();
            /* v2.3.14: the scope is armed now (new acquisition): publish it */
            pthread_mutex_lock(&rp_osc_ctrl_mutex);
            rp_osc_armed_gen   = curr_gen;
            rp_osc_armed_state = state;
            rp_osc_acq_state   = 2;
            rp_osc_acq_gen     = curr_gen;
            pthread_mutex_unlock(&rp_osc_ctrl_mutex);
            /* v2.3.23: a lock request held for this acquisition goes to the FPGA now (lock.c) */
            lock_request_armed(curr_gen);
        }

        /* Wait for the trigger (non-long: for the end of the acquisition) */
        if(!acq_trig) {
            int changed = 0;
            /* v2.2.11: Auto: time limit for the trigger (recomputed each time the wait is entered or resumed) */
            long long auto_to_us = (acq_state == rp_osc_auto_state) ? rp_osc_auto_timeout_us(curr_params) : 0;
            while(1) {
                if(rp_osc_worker_changed(state)) {
                    changed = 1;
                    break;
                }
                if(auto_to_us && !acq_forced && (rp_osc_now_us() - acq_trig_set_us >= auto_to_us)) {
                    /* no trigger: force it (manual trigger source, as the immediate trigger of Auto up to 2.2.10);
                     * not if a trigger has just come (it is not unlocked / rewritten under the acquisition) */
                    if(!osc_fpga_trig_received())
                        osc_fpga_set_trigger(1);
                    acq_forced = 1;
                }
                if(!long_acq) {
                    if(osc_fpga_triggered())
                        break;
                    if(!acq_published && osc_fpga_trig_received()) {
                        acq_published = 1;
                        rp_osc_acq_set(3, curr_gen);
                    }
                } else {
                    /* v2.3.23: the trigger status bit (osc_fpga_trig_received()). Before, a change of the trigger
                     * pointer also counted as a trigger: it changes with a reset too, not only at a trigger */
                    if(osc_fpga_trig_received())
                        break;
                }
                usleep(1000);
            }
            if(changed)
                continue;

            if(long_acq) {
                /* Trigger - so let's arrange all the needed pointers & stuff */
                float smpl_period = c_osc_fpga_smpl_period * dec_factor;
                float unit_factor = rp_osc_get_time_unit_factor(curr_params[TIME_UNIT_PARAM].value);
                float t_acq = (curr_params[MAX_GUI_PARAM].value - curr_params[MIN_GUI_PARAM].value) / unit_factor;
                int   t_start_idx = round(curr_params[MIN_GUI_PARAM].value / smpl_period);
                int   step = (int)round((t_acq / smpl_period) / (SIGNAL_LENGTH-1));
                /* pre-trigger samples of this acquisition: the FPGA counter (0x2C), or at least the time the
                 * trigger was disabled after the arm (FPGAs without that register) */
                long long pre_sw = (long long)((acq_trig_set_us - acq_arm_us) * 1e-6 / smpl_period) - 2;
                /* points up to the end of the window of the user (GUI_XMAX, in the units of the time vector) */
                float xmax_user = curr_params[GUI_XMAX].value / unit_factor;
                int   n_pts = SIGNAL_LENGTH;
                if(step < 1)
                    step = 1;
                if(xmax_user > curr_params[MIN_GUI_PARAM].value)
                    n_pts = (int)ceil((xmax_user - curr_params[MIN_GUI_PARAM].value) / (step * smpl_period)) + 2;
                rp_osc_long_rd_start(&rd, t_start_idx - 3, step, n_pts, pre_sw, smpl_period);
                rp_osc_meas_clear(&ch1_meas);
                rp_osc_meas_clear(&ch2_meas);
                acq_next_rd_us = rp_osc_now_us() + 200000;
            }
            acq_trig = 1;
            rp_osc_acq_set(3, curr_gen);
        }

        if(!long_acq) {
            /* Triggered, decimate & convert the values */
            rp_osc_meas_clear(&ch1_meas);
            rp_osc_meas_clear(&ch2_meas);
            rp_osc_decimate((float **)&rp_tmp_signals[1], &rp_fpga_cha_signal[0],
                            (float **)&rp_tmp_signals[2], &rp_fpga_chb_signal[0],
                            (float **)&rp_tmp_signals[0], dec_factor,
                            curr_params[MIN_GUI_PARAM].value,
                            curr_params[MAX_GUI_PARAM].value,
                            curr_params[TIME_UNIT_PARAM].value,
                            &ch1_meas, &ch2_meas, ch1_max_adc_v, ch2_max_adc_v,
                            curr_params[GEN_DC_OFFS_1].value,
                            curr_params[GEN_DC_OFFS_2].value);
            rp_osc_meas_avg_amp(&ch1_meas, OSC_FPGA_SIG_LEN);
            rp_osc_meas_avg_amp(&ch2_meas, OSC_FPGA_SIG_LEN);
        } else {
            int done, complete;
            /* v2.3.23: read when the next points are there (at most every 200 ms; the last ones at once, so
             * that the next acquisition is armed in time for the next scan floor) */
            if(rp_osc_worker_sleep_until(acq_next_rd_us, state))
                continue;
            done = osc_fpga_triggered();
            rp_osc_long_rd_update(&rd);
            complete = rp_osc_long_rd_read(&rd, done, (float **)&rp_tmp_signals[1], &rp_fpga_cha_signal[0],
                                           (float **)&rp_tmp_signals[2], &rp_fpga_chb_signal[0],
                                           (float **)&rp_tmp_signals[0],
                                           curr_params[MIN_GUI_PARAM].value, dec_factor,
                                           curr_params[TIME_UNIT_PARAM].value,
                                           &ch1_meas, &ch2_meas, ch1_max_adc_v, ch2_max_adc_v,
                                           curr_params[GEN_DC_OFFS_1].value,
                                           curr_params[GEN_DC_OFFS_2].value);
            if(!complete) {
                if(rd.first_valid >= 0) {
                    rp_osc_long_rd_fill_tail(&rd, (float **)rp_tmp_signals);
                    rp_osc_set_signals_gen(rp_tmp_signals,
                                           (rd.next < SIGNAL_LENGTH-1) ? rd.next : SIGNAL_LENGTH-2, curr_gen);
                    pub_units = curr_params[TIME_UNIT_PARAM].value;
                }
                acq_next_rd_us = rp_osc_now_us() + rp_osc_long_rd_wait_us(&rd);
                continue;
            }
            rp_osc_meas_avg_amp(&ch1_meas, rd.meas_n > 0 ? rd.meas_n : 1);
            rp_osc_meas_avg_amp(&ch2_meas, rd.meas_n > 0 ? rd.meas_n : 1);
        }

        /* Acquisition complete */
        acq_armed = 0;
        rp_osc_acq_set(4, curr_gen);
        if(state == rp_osc_single_state)
            rp_osc_worker_change_state(rp_osc_idle_state);

        rp_osc_meas_period(&ch1_meas, &ch2_meas, &rp_fpga_cha_signal[0],
                           &rp_fpga_chb_signal[0], dec_factor);
        rp_osc_meas_convert(&ch1_meas, ch1_max_adc_v, fe_ch1_dc_offs);
        rp_osc_meas_convert(&ch2_meas, ch2_max_adc_v, fe_ch2_dc_offs);

        rp_osc_set_meas_data(ch1_meas, ch2_meas);
        rp_osc_set_signals_gen(rp_tmp_signals, SIGNAL_LENGTH-1, curr_gen);
        pub_units = curr_params[TIME_UNIT_PARAM].value;

        /* do not loop too fast */
        if(!long_acq)
            usleep(10000);
    }

    rp_clean_params(curr_params);
    rp_clean_params(prev_params);
    return 0;
}

/*----------------------------------------------------------------------------------*/
int rp_osc_prepare_time_vector(float **out_signal, int dec_factor,
                               float t_start, float t_stop, int time_unit)
{
    float smpl_period = c_osc_fpga_smpl_period * dec_factor;
    float t_step, t_curr;
    int   out_idx, in_idx;
    int   idx_step;
    int   t_unit_factor = rp_osc_get_time_unit_factor(time_unit);;

    float *s = *out_signal;

    if(t_stop <= t_start) {
        t_start = 0;
        t_stop  = OSC_FPGA_SIG_LEN * smpl_period;
    }

    t_step = (t_stop - t_start) / (SIGNAL_LENGTH-1);
    idx_step = (int)(ceil(t_step/smpl_period));
    if(idx_step > 8)
        idx_step = 8;

    for(out_idx = 0, in_idx = 0, t_curr=t_start; out_idx < SIGNAL_LENGTH;
        out_idx++, t_curr += t_step, in_idx += idx_step) {
        s[out_idx] = t_curr * t_unit_factor;
    }

    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_decimate(float **cha_signal, int *in_cha_signal,
                    float **chb_signal, int *in_chb_signal,
                    float **time_signal, int dec_factor,
                    float t_start, float t_stop, int time_unit,
                    rp_osc_meas_res_t *ch1_meas, rp_osc_meas_res_t *ch2_meas,
                    float ch1_max_adc_v, float ch2_max_adc_v,
                    float ch1_user_dc_off, float ch2_user_dc_off)
{
    int t_start_idx, t_stop_idx;
    float smpl_period = c_osc_fpga_smpl_period * dec_factor;
    int   t_unit_factor = rp_osc_get_time_unit_factor(time_unit);
    int t_step;
    int in_idx, out_idx, t_idx;
    int wr_ptr_curr, wr_ptr_trig;

    float *cha_s = *cha_signal;
    float *chb_s = *chb_signal;
    float *t = *time_signal;
    //lolo
    float cha_tmp,chb_tmp;
    int32_t  fe_ch1_dc_offs=0;
    int32_t  fe_ch2_dc_offs=0;

    // if oscilloscope channels are in in1 or in2, make offset correction
    if( rp_osc_params[LOCK_OSCA_SW].value==1 )
        fe_ch1_dc_offs=rp_calib_params->fe_ch1_dc_offs;
    if( rp_osc_params[LOCK_OSCA_SW].value==2 )
        fe_ch1_dc_offs=rp_calib_params->fe_ch2_dc_offs;
    if( rp_osc_params[LOCK_OSCB_SW].value==1 )
        fe_ch2_dc_offs=rp_calib_params->fe_ch1_dc_offs;
    if( rp_osc_params[LOCK_OSCB_SW].value==2 )
        fe_ch2_dc_offs=rp_calib_params->fe_ch2_dc_offs;

    /* If illegal take whole frame */
    if(t_stop <= t_start) {
        t_start = 0;
        t_stop = (OSC_FPGA_SIG_LEN-1) * smpl_period;
    }

    /* convert time to samples */
    t_start_idx = round(t_start / smpl_period);
    t_stop_idx  = round(t_stop / smpl_period);

    if((((t_stop_idx-t_start_idx)/(float)(SIGNAL_LENGTH-1))) < 1)
        t_step = 1;
    else {
        /* ceil was used already in rp_osc_main() for parameters, so we can easily
         * use round() here
         */
        t_step = round((t_stop_idx-t_start_idx)/(float)(SIGNAL_LENGTH-1));
    }
    osc_fpga_get_wr_ptr(&wr_ptr_curr, &wr_ptr_trig);
    in_idx = wr_ptr_trig + t_start_idx - 3;

    if(in_idx < 0)
        in_idx = OSC_FPGA_SIG_LEN + in_idx;
    if(in_idx >= OSC_FPGA_SIG_LEN)
        in_idx = in_idx % OSC_FPGA_SIG_LEN;

    /* First perform measurements on non-decimated signal:
     *  - min, max - performed in the loop
     *  - avg, amp - performed after the loop
     *  - freq, period - performed in the next decimation loop
     */
    for(out_idx=0; out_idx < OSC_FPGA_SIG_LEN; out_idx++) {
        rp_osc_meas_min_max(ch1_meas, in_cha_signal[out_idx]);
        rp_osc_meas_min_max(ch2_meas, in_chb_signal[out_idx]);
    }


    for(out_idx=0, t_idx=0; out_idx < SIGNAL_LENGTH;
        out_idx++, in_idx+=t_step, t_idx+=t_step) {
        /* Wrap the pointer */
        if(in_idx >= OSC_FPGA_SIG_LEN)
            in_idx = in_idx % OSC_FPGA_SIG_LEN;

        if( rp_osc_params[LOCK_OSC_RAW_MODE].value>0 ){
            cha_s[out_idx] = osc_fpga_cnv_cnt_to_v(in_cha_signal[in_idx], (float)(1<<(c_osc_fpga_adc_bits-1)) , 0, 0);
            chb_s[out_idx] = osc_fpga_cnv_cnt_to_v(in_chb_signal[in_idx], (float)(1<<(c_osc_fpga_adc_bits-1)) , 0, 0);
            //cha_s[out_idx] = in_cha_signal[in_idx];
            //chb_s[out_idx] = in_chb_signal[in_idx];
        } else {
            cha_tmp = osc_fpga_cnv_cnt_to_v(in_cha_signal[in_idx], ch1_max_adc_v,
                                       fe_ch1_dc_offs,
                                       ch1_user_dc_off);

            chb_tmp = osc_fpga_cnv_cnt_to_v(in_chb_signal[in_idx], ch2_max_adc_v,
                                               fe_ch2_dc_offs,
                                               ch2_user_dc_off);
            // check mode
            if( rp_osc_params[LOCK_OSC_LOCKIN_MODE].value>0 ){
                cha_s[out_idx] = sqrt(cha_tmp*cha_tmp + chb_tmp*chb_tmp) ;
                chb_s[out_idx] = atan2( chb_tmp , cha_tmp ) ;
            } else {
                cha_s[out_idx] = cha_tmp ;
                chb_s[out_idx] = chb_tmp ;
            }
        }

        //-------
        /* DISABLED
        if( rp_osc_params[LOCK_OSC_LOCKIN_MODE].value>0 ){
            cha_s[out_idx] = sqrt(cha_tmp*cha_tmp + chb_tmp*chb_tmp) ;
            chb_s[out_idx] = atan2( chb_tmp , cha_tmp ) ;
        } else if( rp_osc_params[LOCK_OSC_RAW_MODE].value>0 ){

            cha_s[out_idx] = osc_fpga_cnv_cnt_to_v(in_cha_signal[in_idx], (float)(1<<(c_osc_fpga_adc_bits-1)) , 0, 0);
            chb_s[out_idx] = osc_fpga_cnv_cnt_to_v(in_chb_signal[in_idx], (float)(1<<(c_osc_fpga_adc_bits-1)) , 0, 0);
            //cha_s[out_idx] = in_cha_signal[in_idx];
            //chb_s[out_idx] = in_chb_signal[in_idx];
        } else {
            cha_s[out_idx] = cha_tmp ;
            chb_s[out_idx] = chb_tmp ;
        }  // */

        t[out_idx] = (t_start + (t_idx * smpl_period)) * t_unit_factor;

        /* A bug in FPGA? - Trig & write pointers not sample-accurate. */
        if ( (dec_factor > 64) && (out_idx == 1) ) {
            int i;
            for (i=0; i < out_idx; i++) {
                cha_s[i] = cha_s[out_idx];
                chb_s[i] = chb_s[out_idx];
            }
        }
    }

    return 0;
}


/*----------------------------------------------------------------------------------*/
/* v2.3.23: reader of long acquisitions (windows of 1.5 s or more), read while the FPGA writes them.
 *
 * Replaces rp_osc_decimate_partial() of the RP 0.9x scope. It followed the buffer with its read index alone and
 * stopped only when that index was 1..99 samples ahead of the write pointer: when the index wrapped (16383 -> 0..)
 * before the write pointer it read the samples of the previous lap of the buffer as if they were new, up to the
 * 1024 points (status OK); with xmin > 0 (the first point more than 100 samples after the write pointer) it never
 * stopped; and a read that got no point was taken as the end of the acquisition. With windows of 30 s (Dec 524288,
 * one lap = 68.7 s) the trace mixed data of 68.7 s before.
 *
 * Here every point is a sample s counted from the trigger (s = 0 at the trigger pointer, negative before it) and
 * the reader keeps the count of samples written since the trigger ('written', from the deltas of the write
 * pointer, read at least every 200 ms: a lap takes 8.6 s or more at the decimations of long acquisitions). A
 * sample belongs to this acquisition if
 *     -pre_valid <= s <= written - 1     and     s >= written - 16384 + margin (not overwritten yet),
 * pre_valid = samples written between the arm and the trigger (FPGA counter adc_we_cnt, register 0x2C, or the
 * time the trigger was kept disabled after the arm). Points outside are never read from the buffer: before the
 * first valid point they take its value and time (the trace starts there), after it the previous one. The
 * acquisition is complete (OK) only when every point was read, or when the FPGA has finished (conf bit 4 / the
 * trigger source back to 0) and the remaining points will never be written.
 * The server makes the window a bit longer than the one of the user (1024 points with an integer number of
 * samples between them: e.g. 0..30 s at Dec 524288 -> 0..30.06 s). The points after the end of the window of
 * the user (n_pts on) are not waited for (they are out of the plot): with Reset zoom on a slow scan
 * (window 0.98 x the ramp period) the acquisition ends before the next scan floor and the scope is armed again
 * in time for it (before, one scan of every two was lost).
 */
#define RP_OSC_RD_MARGIN 64     /* samples kept away from the oldest one (the FPGA keeps writing while we read) */

static void rp_osc_long_rd_start(rp_osc_long_rd_t *rd, int s0, int step, int n_pts, long long pre_sw, float smpl_period)
{
    int cur, trig, d;
    long long we = (long long)osc_fpga_get_we_cnt();

    osc_fpga_get_wr_ptr(&cur, &trig);
    rd->trig_ptr = trig & (OSC_FPGA_SIG_LEN-1);
    rd->last_cur = cur & (OSC_FPGA_SIG_LEN-1);
    d = (rd->last_cur - rd->trig_ptr) & (OSC_FPGA_SIG_LEN-1);
    /* wr_ptr_cur is the last sample written, wr_ptr_trig the one at the trigger: right after the trigger
     * the current pointer may still be one behind (d = 16383: nothing written yet) */
    rd->written   = (d >= OSC_FPGA_SIG_LEN - 16) ? 0 : (long long)d + 1;
    rd->pre_valid = (we > pre_sw) ? we : pre_sw;
    if(rd->pre_valid < 0)
        rd->pre_valid = 0;
    if(rd->pre_valid > OSC_FPGA_SIG_LEN)
        rd->pre_valid = OSC_FPGA_SIG_LEN;
    rd->s0          = s0;
    rd->step        = step;
    rd->n_pts       = (n_pts > 0 && n_pts < SIGNAL_LENGTH) ? n_pts : SIGNAL_LENGTH;
    rd->next        = 0;
    rd->first_valid = -1;
    rd->meas_n      = 0;
    rd->smpl_us     = smpl_period * 1e6;
}

static void rp_osc_long_rd_update(rp_osc_long_rd_t *rd)
{
    int cur;
    osc_fpga_get_wr_ptr(&cur, NULL);
    cur &= (OSC_FPGA_SIG_LEN-1);
    rd->written += (cur - rd->last_cur) & (OSC_FPGA_SIG_LEN-1);
    rd->last_cur = cur;
}

/* time until the next read [us]: the last point, or 200 ms */
static long long rp_osc_long_rd_wait_us(const rp_osc_long_rd_t *rd)
{
    long long s_last = (long long)rd->s0 + (long long)(rd->n_pts-1) * rd->step;
    double w = (double)(s_last + 1 - rd->written) * rd->smpl_us + 2000.0;
    if(w < 2000.0)
        w = 2000.0;
    if(w > 200000.0)
        w = 200000.0;
    return (long long)w;
}

/* Reads the points that are there. Returns 1 when the acquisition is complete. */
static int rp_osc_long_rd_read(rp_osc_long_rd_t *rd, int done,
                               float **cha_out_signal, int *cha_in_signal,
                               float **chb_out_signal, int *chb_in_signal,
                               float **time_out_signal,
                               float t_start, int dec_factor, int time_unit,
                               rp_osc_meas_res_t *ch1_meas, rp_osc_meas_res_t *ch2_meas,
                               float ch1_max_adc_v, float ch2_max_adc_v,
                               float ch1_user_dc_off, float ch2_user_dc_off)
{
    float *cha_out = *cha_out_signal;
    float *chb_out = *chb_out_signal;
    float *t_out   = *time_out_signal;
    float smpl_period = c_osc_fpga_smpl_period * dec_factor;
    int   t_unit_factor = rp_osc_get_time_unit_factor(time_unit);
    long long lo, hi;
    float cha_tmp, chb_tmp;
    int32_t fe_ch1_dc_offs = 0, fe_ch2_dc_offs = 0;

    // if oscilloscope channels are in in1 or in2, make offset correction
    if( rp_osc_params[LOCK_OSCA_SW].value==1 )
        fe_ch1_dc_offs=rp_calib_params->fe_ch1_dc_offs;
    if( rp_osc_params[LOCK_OSCA_SW].value==2 )
        fe_ch1_dc_offs=rp_calib_params->fe_ch2_dc_offs;
    if( rp_osc_params[LOCK_OSCB_SW].value==1 )
        fe_ch2_dc_offs=rp_calib_params->fe_ch1_dc_offs;
    if( rp_osc_params[LOCK_OSCB_SW].value==2 )
        fe_ch2_dc_offs=rp_calib_params->fe_ch2_dc_offs;

    hi = rd->written - 1;
    lo = rd->written - OSC_FPGA_SIG_LEN + RP_OSC_RD_MARGIN;
    if(lo < -rd->pre_valid)
        lo = -rd->pre_valid;

    for(; rd->next < SIGNAL_LENGTH; rd->next++) {
        int k = rd->next;
        long long s = (long long)rd->s0 + (long long)k * rd->step;
        float t = (t_start + ((float)(k * rd->step) * smpl_period)) * t_unit_factor;

        if(s > hi && !done && k < rd->n_pts)
            break;                                  /* not written yet: next read */

        if(s < lo || s > hi || k >= rd->n_pts) {
            /* not part of this acquisition (before its history, overwritten, or never written) */
            if(rd->first_valid >= 0) {
                t_out[k]   = t_out[k-1];
                cha_out[k] = cha_out[k-1];
                chb_out[k] = chb_out[k-1];
            } else {
                t_out[k] = t;                       /* set with the first valid point */
            }
            continue;
        }

        {
            int idx = (int)(((long long)rd->trig_ptr + s) & (OSC_FPGA_SIG_LEN-1));
            long long m;

            /* measurements: the raw samples of this point (up to the next one) */
            for(m = s; m < s + rd->step && m <= hi; m++) {
                int mi = (int)(((long long)rd->trig_ptr + m) & (OSC_FPGA_SIG_LEN-1));
                rp_osc_meas_min_max(ch1_meas, cha_in_signal[mi]);
                rp_osc_meas_min_max(ch2_meas, chb_in_signal[mi]);
                rd->meas_n++;
            }

            if( rp_osc_params[LOCK_OSC_RAW_MODE].value>0 ){
                cha_out[k] = osc_fpga_cnv_cnt_to_v(cha_in_signal[idx], (float)(1<<(c_osc_fpga_adc_bits-1)) , 0, 0);
                chb_out[k] = osc_fpga_cnv_cnt_to_v(chb_in_signal[idx], (float)(1<<(c_osc_fpga_adc_bits-1)) , 0, 0);
            } else {
                cha_tmp = osc_fpga_cnv_cnt_to_v(cha_in_signal[idx], ch1_max_adc_v,
                                                fe_ch1_dc_offs, ch1_user_dc_off);
                chb_tmp = osc_fpga_cnv_cnt_to_v(chb_in_signal[idx], ch2_max_adc_v,
                                                fe_ch2_dc_offs, ch2_user_dc_off);
                if( rp_osc_params[LOCK_OSC_LOCKIN_MODE].value>0 ){
                    cha_out[k] = sqrt(cha_tmp*cha_tmp + chb_tmp*chb_tmp) ;
                    chb_out[k] = atan2( chb_tmp , cha_tmp ) ;
                }else{
                    cha_out[k] = cha_tmp ;
                    chb_out[k] = chb_tmp ;
                }
            }
            t_out[k] = t;

            if(rd->first_valid < 0) {
                int i;
                rd->first_valid = k;
                for(i = 0; i < k; i++) {             /* the trace starts at the first valid point */
                    t_out[i]   = t_out[k];
                    cha_out[i] = cha_out[k];
                    chb_out[i] = chb_out[k];
                }
            }

            /* A bug in FPGA? - Trig & write pointers not sample-accurate (as rp_osc_decimate_partial()) */
            if((dec_factor > 64) && (k == 2) && (rd->first_valid == 0)) {
                int i;
                for(i = 0; i < k; i++) {
                    cha_out[i] = cha_out[k];
                    chb_out[i] = chb_out[k];
                }
            }
        }
    }

    if(rd->next < SIGNAL_LENGTH)
        return 0;

    if(rd->first_valid < 0) {
        /* no point of this acquisition at all: an empty trace */
        int i;
        for(i = 0; i < SIGNAL_LENGTH; i++) {
            t_out[i]   = t_start * t_unit_factor;
            cha_out[i] = 0;
            chb_out[i] = 0;
        }
    }
    return 1;
}

/* partial trace: the points not read yet on the last one read (not the trace of the previous acquisition) */
static void rp_osc_long_rd_fill_tail(const rp_osc_long_rd_t *rd, float **sig)
{
    int i, last = rd->next - 1;
    if(last < 0)
        return;
    for(i = rd->next; i < SIGNAL_LENGTH; i++) {
        sig[0][i] = sig[0][last];
        sig[1][i] = sig[1][last];
        sig[2][i] = sig[2][last];
    }
}

/*----------------------------------------------------------------------------------*/
int rp_osc_get_time_unit_factor(int time_unit)
{
    int t_unit_factor;

    switch(time_unit) {
    case 0:
        /* [us] */
        t_unit_factor = 1e6;
        break;
    case 1:
        /* [ms] */
        t_unit_factor = 1e3;
        break;
    case 2:
    default:
        /* [s] */
        t_unit_factor = 1;
        break;
    }

    return t_unit_factor;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_auto_set(rp_app_params_t *orig_params,
                    float ch1_max_adc_v, float ch2_max_adc_v,
                    float ch1_user_dc_off, float ch2_user_dc_off,
                    int ch1_probe_att, int ch2_probe_att, int ch1_gain, int ch2_gain, int en_avg_at_dec)
{
    const int c_noise_thr = 500; /* noise threshold */
    rp_osc_worker_state_t old_state, state;
    int params_dirty;
    /* Min/maxes from both channel */
    int max_cha = INT_MIN;
    int max_chb = INT_MIN;
    int min_cha = INT_MAX;
    int min_chb = INT_MAX;
    /* Y axis deltas, 0 - ChA, 1 - Chb */
    int dy[2]     = { 0, 0 };
    int old_dy[2] = { 0, 0 };

    // lolo
    int32_t  fe_ch1_dc_offs=0;
    int32_t  fe_ch2_dc_offs=0;

    // if oscilloscope channels are in in1 or in2, make offset correction
    if( rp_osc_params[LOCK_OSCA_SW].value==1 )
        fe_ch1_dc_offs=rp_calib_params->fe_ch1_dc_offs;
    if( rp_osc_params[LOCK_OSCA_SW].value==2 )
        fe_ch1_dc_offs=rp_calib_params->fe_ch2_dc_offs;
    if( rp_osc_params[LOCK_OSCB_SW].value==1 )
        fe_ch2_dc_offs=rp_calib_params->fe_ch1_dc_offs;
    if( rp_osc_params[LOCK_OSCB_SW].value==2 )
        fe_ch2_dc_offs=rp_calib_params->fe_ch2_dc_offs;


    /* Channel to be used for auto-algorithm:
     * 0 - Channel A
     * 1 - Channel B
     */
    int channel;
    int smpl_cnt;
    int iter;
    int time_range = 0;

    TRACE("WORKER LOLO AUTO START: %d\n", 1);

    for (iter=0; iter < 10; iter++) {
        TRACE("WORKER LOLO iter: %d\n", iter);

        /* 10 auto-trigger acquisitions */
        pthread_mutex_lock(&rp_osc_ctrl_mutex);
        old_state = state = rp_osc_ctrl;
        pthread_mutex_unlock(&rp_osc_ctrl_mutex);

        osc_fpga_reset();
        osc_fpga_update_params(1, 0, 0, 0, 0, time_range, ch1_max_adc_v, ch2_max_adc_v,
                   fe_ch1_dc_offs,
                   0,
                   fe_ch2_dc_offs,
                   0,
                   ch1_probe_att, ch2_probe_att, ch1_gain, ch2_gain, 0);

        /* ARM & Trigger */
        osc_fpga_arm_trigger();
        osc_fpga_set_trigger(1);

        TRACE("WORKER LOLO wait for trigger, iter: %d\n", iter);
        /* Wait for trigger to finish */
        while(1) {
            pthread_mutex_lock(&rp_osc_ctrl_mutex);
            state = rp_osc_ctrl;
            params_dirty = rp_osc_params_dirty;
            pthread_mutex_unlock(&rp_osc_ctrl_mutex);
            /* change in state, abort polling */
            if((state != old_state) || params_dirty) {
                return -1;
            }
            if(osc_fpga_triggered()) {
                break;
            }
            usleep(500);
        }
        TRACE("WORKER LOLO wait for trigger endded, iter: %d\n", iter);

        /* Get the signals - available at rp_fpga_chX_signal vectors */
        for(smpl_cnt = 0; smpl_cnt < OSC_FPGA_SIG_LEN; smpl_cnt++) {
            /* keep the 14 ADC bits (2.0 FPGA: 16-bit sign-extended samples) */
            int cha_smpl = rp_fpga_cha_signal[smpl_cnt] & ((1<<c_osc_fpga_adc_bits)-1);
            int chb_smpl = rp_fpga_chb_signal[smpl_cnt] & ((1<<c_osc_fpga_adc_bits)-1);

            // TWO'S COMPLEMENT
            // LOLO
            if(cha_smpl & (1<<(c_osc_fpga_adc_bits-1)))
                cha_smpl = -1 * ((cha_smpl ^ ((1<<c_osc_fpga_adc_bits)-1))+1);
            if(chb_smpl & (1<<(c_osc_fpga_adc_bits-1)))
                chb_smpl = -1 * ((chb_smpl ^ ((1<<c_osc_fpga_adc_bits)-1))+1);
            if(rp_osc_params[LOCK_OSC_RAW_MODE].value==0){ // LOLO
                cha_smpl = cha_smpl + fe_ch1_dc_offs;
                chb_smpl = chb_smpl + fe_ch2_dc_offs;
            } else{

            } // LOLO
            /* Get min/maxes */
            max_cha = (max_cha < cha_smpl) ? cha_smpl : max_cha;
            min_cha = (min_cha > cha_smpl) ? cha_smpl : min_cha;
            max_chb = (max_chb < chb_smpl) ? chb_smpl : max_chb;
            min_chb = (min_chb > chb_smpl) ? chb_smpl : min_chb;
        }

        dy[0] = max_cha - min_cha;
        dy[1] = max_chb - min_chb;

        TRACE("WORKER LOLO max_cha: %d\n", max_cha);
        TRACE("WORKER LOLO min_cha: %d\n", min_cha);

        /* Calculate ratios of last amplitude increase for both channels */
        const float c_inc_thr = 1.1;
        float ratio[2] = { 1e6, 1e6 };
        int i;
        for(i = 0; i < 2; i++) {
            if (old_dy[i] != 0) {
                ratio[i] = (float)dy[i] / (float)old_dy[i];
            }
        }
        old_dy[0] = dy[0];
        old_dy[1] = dy[1];

        /* Signal amplitude found & stable? */
        if ( ((ratio[0] < c_inc_thr) && (dy[0] > c_noise_thr)) ||
             ((ratio[1] < c_inc_thr) && (dy[1] > c_noise_thr)) ) {
            /* This is meant for optimizing the time it takes for AUTO to complete,
             * and is a compromise between the speed and robustness of the AUTO
             * algorithm.
             * Since it is fast enough, it is safer to search for amplitude through
             * all the iterations instead of bailing out sooner.
             */
            //break;
        }

        /* Still searching? - Increase time range up to 130 ms (D = 1024). */
        if ((iter % 3) == 2) {
            time_range++;
            if (time_range > 3) {
                time_range = 3;
            }
        }
    }

    /* Check the Y axis amplitude on both channels and select the channel with
     * the larger one.
     */
    channel = (dy[0] > dy[1]) ? 0 : 1;

    TRACE("WORKER LOLO for ended. channel: %d\n", channel);

    TRACE("WORKER LOLO next if. dy[channel] < c_noise_thr: %d\n", (int) (dy[channel] < c_noise_thr) );

    if(dy[channel] < c_noise_thr) {
        /* No signal detected, set the parameters to:
         * - no decimation (time range 130 [us])
         * - trigger mode - auto
         * - X axis - full, from 0 to 130 [us]
         * - Y axis - Min/Max + adding extra 200% to average
         */
        TRACE("AUTO: No signal detected.\n");
        int min_y, max_y, ave_y;

        orig_params[TRIG_MODE_PARAM].value  = 0;
        orig_params[MIN_GUI_PARAM].value    = 0;
        orig_params[MAX_GUI_PARAM].value    = 130;
        orig_params[TIME_RANGE_PARAM].value = 0;
        orig_params[TRIG_SRC_PARAM].value   = 0;
        orig_params[TRIG_LEVEL_PARAM].value = 0;
        orig_params[AUTO_FLAG_PARAM].value  = 0;
        orig_params[TIME_UNIT_PARAM].value  = 0;
        orig_params[TRIG_DLY_PARAM].value   = 0;

        min_y = (min_cha < min_chb) ? min_cha : min_chb;
        max_y = (max_cha > max_chb) ? max_cha : max_chb;

        ave_y = (min_y + max_y) >> 1;
        min_y = (min_y - ave_y) * 2 + ave_y;
        max_y = (max_y - ave_y) * 2 + ave_y;

        if(rp_osc_params[LOCK_OSC_RAW_MODE].value>0){ // LOLO
            orig_params[MIN_Y_NORM].value = min_y ;
            orig_params[MAX_Y_NORM].value = max_y ;
        }else{
            orig_params[MIN_Y_NORM].value = min_y / (float)(1 << (c_osc_fpga_adc_bits - 1));
            orig_params[MAX_Y_NORM].value = max_y / (float)(1 << (c_osc_fpga_adc_bits - 1));
        }



        // For POST response ...
        transform_to_iface_units(orig_params);
        return 0;

    } else {

        /* Signal above threshold - loop from lower to higher decimation */
        int min_y, max_y;
        int trig_src_ch;               /* Trigger level in samples, smpls_2 introduced for histeresis */
        int trig_level;
        float trig_level_v;            /* Trigger level in [V] */
        int time_range;                /* decimation from 0 to 5 */
        float max_adc_v;
        int calib_dc_off;

       int wr_ptr_curr, wr_ptr_trig;

        if(channel == 0) {
            min_y = min_cha;
            max_y = max_cha;
            trig_src_ch = 0;
            max_adc_v = ch1_max_adc_v;
            calib_dc_off = fe_ch1_dc_offs;
        } else {
            min_y = min_chb;
            max_y = max_chb;
            trig_src_ch = 1;
            max_adc_v = ch2_max_adc_v;
            calib_dc_off = fe_ch2_dc_offs;
        }
        trig_level = (max_y + min_y) >> 1;
        TRACE("AUTO: trig level: %d\n", trig_level);
        TRACE("AUTO: min,max: %d  %d\n", min_y, max_y);

        if(rp_osc_params[LOCK_OSC_RAW_MODE].value>0){ // LOLO
            trig_level_v = (((trig_level) * max_adc_v)/
                            (float)(1<<(c_osc_fpga_adc_bits-1))) ;
        }else{
            trig_level_v = (((trig_level + calib_dc_off) * max_adc_v)/
                            (float)(1<<(c_osc_fpga_adc_bits-1))) ;
        }
        int loc_max = INT_MIN;
        int loc_min = INT_MAX;

        TRACE("WORKER LOLO trig_level_v: %f\n", trig_level_v);

        /* Loop over time ranges and search for the best suiting one (Last range removed: too slow) */
        for(time_range = 0; time_range < 5; time_range++) {
            float period = 0;
            int trig_source = osc_fpga_cnv_trig_source(0, trig_src_ch, 0);
            int *sig_data;

            TRACE("WORKER LOLO for time_range: %d\n", time_range);
            osc_fpga_reset();
            osc_fpga_update_params(0, trig_src_ch, 0, 0, trig_level_v, time_range,
                                   ch1_max_adc_v, ch2_max_adc_v,
                                   fe_ch1_dc_offs,
                                   0,
                                   fe_ch2_dc_offs,
                                   0,
                                   ch1_probe_att, ch2_probe_att, ch1_gain, ch2_gain, en_avg_at_dec);

            /* ARM & Trigger */
            osc_fpga_arm_trigger();
            osc_fpga_set_trigger(trig_source);
            TRACE("WORKER LOLO wait for another tirgegr: %d\n", 1);
            /* Wait for trigger */
            /* Wait for trigger to finish */
            while(1) {
                pthread_mutex_lock(&rp_osc_ctrl_mutex);
                state = rp_osc_ctrl;
                params_dirty = rp_osc_params_dirty;
                pthread_mutex_unlock(&rp_osc_ctrl_mutex);

                /* change in state, abort polling */
                if((state != old_state) || params_dirty) {
                    return -1;
                }
                if(osc_fpga_triggered()) {
                    break;
                }
                usleep(500);
            }

            TRACE("WORKER LOLO wait for another tirgegr finished: %d\n", 1);

            // Checking where acquisition starts
            osc_fpga_get_wr_ptr(&wr_ptr_curr, &wr_ptr_trig);

            /* We have a signal in rp_fpga_chX_signal */
            sig_data = (channel == 0) ? rp_fpga_cha_signal : rp_fpga_chb_signal;
            int dec_factor = osc_fpga_cnv_time_range_to_dec(time_range);

            rp_osc_meas_res_t meas;
            rp_osc_meas_clear(&meas);
            meas.min = min_y;
            meas.max = max_y;

            meas_period(&meas, sig_data, wr_ptr_trig, dec_factor, &loc_min, &loc_max);
            period = meas.period;
            TRACE("AUTO: period = %.6f\n", period);

            /* We have a winner - calculate the new parameters */
            if ((period > 0) || (time_range >= 4))
            {
                int ave_y, amp_y;
                int time_unit = 2;
                float t_unit_factor = 1; /* to convert to seconds */

                /* pick correct which time unit is selected */
                if((time_range == 0) || (time_range == 1)) {
                    time_unit     = 0;
                    t_unit_factor = 1e6;
                } else if((time_range == 2) || (time_range == 3)) {
                    time_unit     = 1;
                    t_unit_factor = 1e3;
                }

                orig_params[TRIG_MODE_PARAM].value  = 1; /* 'normal' */
                orig_params[TIME_RANGE_PARAM].value = time_range;
                orig_params[TRIG_SRC_PARAM].value   = trig_src_ch;

                if(rp_osc_params[LOCK_OSC_RAW_MODE].value>0){  // LOLO
                    orig_params[TRIG_LEVEL_PARAM].value =((float)(loc_max + loc_min))/2 ;
                }else{
                    orig_params[TRIG_LEVEL_PARAM].value = ((float)(loc_max + loc_min))/2 /
                                            (float)(1<<(c_osc_fpga_adc_bits-1));
                }


                orig_params[MIN_GUI_PARAM].value    = 0;
                orig_params[TRIG_DLY_PARAM].value   = 0;

                if (period > 0) {
                    /* Period detected. v2.3.18: minimum window 1 us (125 samples), it was 100 ns: with only
                     * noise in the input (e.g. lock closed, ramp stopped) the "period" found in the noise
                     * gave a window of 0...139 ns. A real signal of more than 1 MHz shows several periods. */
                    const float c_min_t_span = 1e-6;
                    if (period < c_min_t_span / 1.5) {
                        period = c_min_t_span / 1.5;
                    }
                    orig_params[MAX_GUI_PARAM].value =  period * 1.5 * t_unit_factor;
                } else {
                    /* Period not detected, which means it is longer than ~300 ms */
                    TRACE("AUTO: Signal period cannot be determined.\n");
                    /* Stretch to max 1/4 range. All slow signals should be still visible there */
                    orig_params[MAX_GUI_PARAM].value = 2.0;
                    orig_params[TIME_RANGE_PARAM].value = 5;
                }

                orig_params[TIME_UNIT_PARAM].value  = time_unit;
                orig_params[AUTO_FLAG_PARAM].value  = 0;

                min_y = (min_cha < min_chb) ? min_cha : min_chb;
                max_y = (max_cha > max_chb) ? max_cha : max_chb;

                if (loc_max > max_y)
                    max_y = loc_max;

                if (loc_min <  min_y)
                    min_y = loc_min;

                ave_y = (min_y + max_y) >> 1;
                amp_y = ((max_y - min_y) >> 1) * 1.2;
                min_y = ave_y - amp_y;
                max_y = ave_y + amp_y;

                if(rp_osc_params[LOCK_OSC_RAW_MODE].value>0){  // LOLO
                    orig_params[MIN_Y_NORM].value = min_y ;
                    orig_params[MAX_Y_NORM].value = max_y ;
                }else{
                    orig_params[MIN_Y_NORM].value = min_y / (float)(1 << (c_osc_fpga_adc_bits - 1));
                    orig_params[MAX_Y_NORM].value = max_y / (float)(1 << (c_osc_fpga_adc_bits - 1));
                }

                // For POST response ...
                transform_to_iface_units(orig_params);
                return 0;
            }
        }
    }
    return -1;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_meas_clear(rp_osc_meas_res_t *ch_meas)
{
    ch_meas->min = 1e9;
    ch_meas->max = -1e9;
    ch_meas->amp = 0;
    ch_meas->avg = 0;
    ch_meas->freq = 0;
    ch_meas->period = 0;

    return 0;
}


/*----------------------------------------------------------------------------------*/
inline int rp_osc_adc_sign(int in_data)
{
    /* 14-bit sample (0.9x) or 16-bit sign-extended sample (2.0 FPGA of
     * v2.2.5): keep the 14 ADC bits before converting (see fpga.c). */
    int s_data = in_data & ((1<<c_osc_fpga_adc_bits)-1);
    if(s_data & (1<<(c_osc_fpga_adc_bits-1)))
        s_data = -1 * ((s_data ^ ((1<<c_osc_fpga_adc_bits)-1)) + 1);
    return s_data;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_meas_min_max(rp_osc_meas_res_t *ch_meas, int sig_data)
{
    int s_data = rp_osc_adc_sign(sig_data);

    if(ch_meas->min > s_data)
        ch_meas->min = s_data;
    if(ch_meas->max < s_data)
        ch_meas->max = s_data;

    ch_meas->avg += s_data;

    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_meas_avg_amp(rp_osc_meas_res_t *ch_meas, int avg_len)
{
    ch_meas->avg /= avg_len;
    ch_meas->amp = ch_meas->max - ch_meas->min;
    return 0;
}


/*----------------------------------------------------------------------------------*/
int rp_osc_meas_period(rp_osc_meas_res_t *ch1_meas, rp_osc_meas_res_t *ch2_meas,
                       int *in_cha_signal, int *in_chb_signal, int dec_factor)
{
    int wr_ptr_curr, wr_ptr_trig;

    // Checking where acquisition starts
    osc_fpga_get_wr_ptr(&wr_ptr_curr, &wr_ptr_trig);

    int min, max; // Ignored for measurement panel calculations
    meas_period(ch1_meas, in_cha_signal, wr_ptr_trig, dec_factor, &min, &max);
    meas_period(ch2_meas, in_chb_signal, wr_ptr_trig, dec_factor, &min, &max);

    return 0;
}

/*----------------------------------------------------------------------------------*/
int meas_period(rp_osc_meas_res_t *meas, int *in_signal, int wr_ptr_trig, int dec_factor,
                int *min, int *max)
{
    const float c_meas_freq_thr = 100;
    const int c_meas_time_thr = OSC_FPGA_SIG_LEN / 8;
    const float c_min_period = 19.6e-9; // 51 MHz

    float thr1, thr2, cen;
    int state = 0;
    int trig_t[2] = { 0, 0 };
    int trig_cnt = 0;
    int ix, ix_corr;

    float acq_dur=(float)(OSC_FPGA_SIG_LEN)/((float) c_osc_fpga_smpl_freq) * (float) dec_factor;

    cen = (meas->max + meas->min) / 2;

    thr1 = cen + 0.2 * (meas->min - cen);
    thr2 = cen + 0.2 * (meas->max - cen);

    meas->period = 0;
    *max = INT_MIN;
    *min = INT_MAX;

    for(ix = 0; ix < (OSC_FPGA_SIG_LEN); ix++) {
        ix_corr = ix + wr_ptr_trig;

        if (ix_corr >= OSC_FPGA_SIG_LEN) {
            ix_corr %= OSC_FPGA_SIG_LEN;
        }

        int sa = rp_osc_adc_sign(in_signal[ix_corr]);

        /* Another max, min calculation at lower rate to avoid evaluation errors on slower signals */
        if (sa > *max)
            *max = sa;
        if (sa < *min)
            *min = sa;

        /* Lower transitions */
        if((state == 0) && (ix_corr > 0) && (sa < thr1)) {
            state = 1;
        }

        /* Upper transitions - count them & store edge times. */
        if((state == 1) && (sa >= thr2) ) {
            state = 0;
            if (trig_cnt++ == 0) {
                trig_t[0] = ix;
            } else {
                trig_t[1] = ix;
            }
        }

        if ((trig_t[1] - trig_t[0]) > c_meas_time_thr) {
            break;
        }
    }

    /* Period calculation - taking into account at least meas_time_thr samples */
    if(trig_cnt >= 2) {
        meas->period = (trig_t[1] - trig_t[0]) /
            ((float)c_osc_fpga_smpl_freq * (trig_cnt - 1)) * dec_factor;
    }

    if( ((thr2 - thr1) < c_meas_freq_thr) ||
         (meas->period * 3 >= acq_dur)    ||
         (meas->period < c_min_period) )
    {
        meas->period = 0;
        meas->freq   = 0;
    } else {
        meas->freq = 1.0 / meas->period;
    }

    return 0;
}


/*----------------------------------------------------------------------------------*/
inline float rp_osc_meas_cnv_cnt(float data, float adc_max_v)
{
    if(rp_osc_params[LOCK_OSC_RAW_MODE].value>0){ // LOLO
        return data ;
    }else{
        return (data * adc_max_v / (float)(1<<(c_osc_fpga_adc_bits-1)));
    }
}


/*----------------------------------------------------------------------------------*/
int rp_osc_meas_convert(rp_osc_meas_res_t *ch_meas, float adc_max_v, int32_t cal_dc_offs)
{
    ch_meas->min = rp_osc_meas_cnv_cnt(ch_meas->min+cal_dc_offs, adc_max_v);
    ch_meas->max = rp_osc_meas_cnv_cnt(ch_meas->max+cal_dc_offs, adc_max_v);
    ch_meas->amp = rp_osc_meas_cnv_cnt(ch_meas->amp, adc_max_v);
    ch_meas->avg = rp_osc_meas_cnv_cnt(ch_meas->avg+cal_dc_offs, adc_max_v);

    return 0;
}
