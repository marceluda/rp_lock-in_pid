/**
 * $Id: worker.h 881 2013-12-16 05:37:34Z rp_jmenart $
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

#ifndef __WORKER_H
#define __WORKER_H

#include "main.h"
#include "calib.h"

typedef enum rp_osc_worker_state_e {
    rp_osc_idle_state = 0, /* do nothing */
    rp_osc_quit_state, /* shutdown worker */
    rp_osc_abort_state, /* abort current measurement */
    rp_osc_auto_state, /* auto mode acquisition */
    rp_osc_normal_state, /* normal mode */
    rp_osc_single_state, /* single acq., automatically goes to idle */
    rp_osc_auto_set_state, /* runs auto-set algorithm */
    rp_osc_nonexisting_state /* must be last */
} rp_osc_worker_state_t;

int rp_osc_worker_init(rp_app_params_t *params, int params_len,
                       rp_calib_params_t *calib_params);
int rp_osc_worker_exit(void);
int rp_osc_worker_change_state(rp_osc_worker_state_t new_state);
int rp_osc_worker_get_state(rp_osc_worker_state_t *state);
int rp_osc_worker_update_params(rp_app_params_t *params, int fpga_update);
/* v2.3.14: new parameters + auto-set state in one step (the auto-set starts from these parameters) */
int rp_osc_worker_start_auto_set(rp_app_params_t *params, int fpga_update);
/* v2.3.14 (Capture Lock): parameter generation and wait for the scope to be armed */
int rp_osc_worker_params_gen(void);
int rp_osc_worker_wait_armed(int gen, rp_osc_worker_state_t state, int timeout_us);

/* removes 'dirty' flags */
int rp_osc_clean_signals(void);
/* Returns:
 *  0 - new signals (dirty signal) are copied to the output 
 *  1 - no new signals available (dirty signal was not set - we need to wait)
 */
int rp_osc_get_signals(float ***signals, int *sig_idx);
/* Fills the output signal structure from temp one after calculation is done 
 * and marks it dirty 
 */
int rp_osc_set_signals(float **source, int index);
/* v2.3.23: the same, with the parameter generation of its acquisition; generation of the last trace
 * copied out by rp_osc_get_signals(); state of the acquisition of the worker (scope_acq_state, see main.h) */
int rp_osc_set_signals_gen(float **source, int index, int gen);
int rp_osc_get_signals_gen(void);
int rp_osc_worker_acq_status(int *state, int *gen);
int rp_osc_worker_armed_gen(rp_osc_worker_state_t state);
/* Fills the output measuremenet data with last measurements
 */
int rp_osc_set_meas_data(rp_osc_meas_res_t ch1_meas, rp_osc_meas_res_t ch2_meas);

/* Prepares time vector (only where there is a need for it) */
int rp_osc_prepare_time_vector(float **out_signal, int dec_factor,
                               float t_start, float t_stop, int time_unit);

/* 16k -> 2k decimation
 * out_signal - needs to be already allocated, 2k float samples
 * in_signal  - 16k signal 
 * dec_factor - set in FPGA
 * t_start    - user set start time
 * t_stop     - user set stop time
 * TODO: Remove time vector generation from these functions, it should
 * be created at the beginning
 */
int rp_osc_decimate(float **cha_signal, int *in_cha_signal,
                    float **chb_signal, int *in_chb_signal,
                    float **time_signal, int dec_factor, 
                    float t_start, float t_stop, int time_unit,
                    rp_osc_meas_res_t *ch1_meas, rp_osc_meas_res_t *ch2_meas,
                    float ch1_max_adc_v, float ch2_max_adc_v,
                    float ch1_user_dc_off, float ch2_user_dc_off);

/* v2.3.23: rp_osc_decimate_partial() (RP 0.9x) replaced by the long acquisition reader of worker.c
 * (rp_osc_long_rd_*(), static) */

/* Trigger level for the FPGA (osc_fpga_update_params()): trig_level in normalized volts, or ADC counts in Raw Mode
 * (lock_osc_raw_mode), turned into the voltage that gives exactly those counts with the calibration offsets of the
 * channels as passed to osc_fpga_update_params() */
float rp_osc_trig_level_v(rp_app_params_t *p, float adc_max_v, int ch1_calib_dc_off, int ch2_calib_dc_off);

/* Auto-set algorithm */
int rp_osc_auto_set(rp_app_params_t *orig_params, 
                    float ch1_max_adc_v, float ch2_max_adc_v,
                    float ch1_user_dc_off, float ch2_user_dc_off,
                    int ch1_probe_att, int ch2_probe_att, int ch1_gain, int ch2_gain, int en_avg_at_dec);

/* helper function - returns the factor for time unit conversion */
int rp_osc_get_time_unit_factor(int time_unit);

/* helper function - clears the measurement structure */
int rp_osc_meas_clear(rp_osc_meas_res_t *ch_meas);
/* helper function - calculates min, max and accumulates average value */
int rp_osc_meas_min_max(rp_osc_meas_res_t *ch_meas, int sig_data);
/* helper function - calculates average and amplitude */
int rp_osc_meas_avg_amp(rp_osc_meas_res_t *ch_meas, int avg_len);
/* helper function - calculates period and frequency */
int rp_osc_meas_period(rp_osc_meas_res_t *ch1_meas, rp_osc_meas_res_t *ch2_meas, 
                       int *in_cha_signal, int *in_chb_signal, int dec_factor);
int meas_period(rp_osc_meas_res_t *meas, int *in_signal, int wr_ptr_trig, int dec_factor,
                int *min, int *max);
/* helper function - convert CNT to V for meas. data (min, max, amp, avg) */
int rp_osc_meas_convert(rp_osc_meas_res_t *ch_meas, float adc_max_v, int32_t cal_dc_offs);

#endif /* __WORKER_H*/
