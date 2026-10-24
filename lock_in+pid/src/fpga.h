/**
 * $Id: fpga.h 881 2013-12-16 05:37:34Z rp_jmenart $
 *
 * @brief Red Pitaya Oscilloscope FPGA Interface.
 *
 * @Author Jure Menart <juremenart@gmail.com>
 *         
 * (c) Red Pitaya  http://www.redpitaya.com
 *
 * This part of code is written in C programming language.
 * Please visit http://en.wikipedia.org/wiki/C_(programming_language)
 * for more details on the language used herein.
 */

#ifndef __FPGA_H
#define __FPGA_H

#include <stdint.h>


/** @defgroup fpga_h Acquisition
 * @{
 */

/** Starting address of FPGA registers handling Oscilloscope module. */
#define OSC_FPGA_BASE_ADDR 	0x40100000
/** The size of FPGA registers handling Oscilloscope module. */
#define OSC_FPGA_BASE_SIZE 0x30000
/** Size of data buffer into which input signal is captured , must be 2^n!. */
#define OSC_FPGA_SIG_LEN   (16*1024)

/** Bit index in FPGA configuration register for arming the trigger. */
#define OSC_FPGA_CONF_ARM_BIT  1
/** Bit index in FPGA configuration register for reseting write state machine. */
#define OSC_FPGA_CONF_RST_BIT  2

/** Bit mask in the trigger_source register for depicting the trigger source type. */
#define OSC_FPGA_TRIG_SRC_MASK 0x00000007
/** Trigger source field (bits [3:0]) as read back from the trig_source register. */
#define OSC_FPGA_TRIG_SRC_RD_MASK 0x0000000f
/** conf bit 2 (R): trigger status. 0.9x: post-trigger delay running (adc_dly_do);
 *  2.0 (v0.94, rp_scope_com): trigger received, sticky until next arm/reset (adc_trg_rd). */
#define OSC_FPGA_CONF_TRIG_ST_BIT   0x4
/** conf bit 4 (R), only in the 2.0 v0.94 scope: acquisition (post-trigger
 *  delay) finished, sticky until next arm/reset (adc_dly_end). Reads 0 in 0.9x. */
#define OSC_FPGA_CONF_ACQ_DONE_BIT  0x10
/** Bit mask in the cha_thr register for depicting trigger threshold on channel A. */
#define OSC_FPGA_CHA_THR_MASK  0x00003fff
/** Bit mask in the cha_thr register for depicting trigger threshold on channel B. */
#define OSC_FPGA_CHB_THR_MASK  0x00003fff
/** Bit mask in the trigger_delay register for depicting trigger delay. */
#define OSC_FPGA_TRIG_DLY_MASK 0xffffffff

/** Offset to the memory buffer where signal on channel A is captured. */
#define OSC_FPGA_CHA_OFFSET    0x10000
/** Offset to the memory buffer where signal on channel B is captured. */
#define OSC_FPGA_CHB_OFFSET    0x20000

/** Hysteresis register default setting */

#define OSC_HYSTERESIS 0x3F

/** @brief FPGA registry structure for Oscilloscope core module.
 *
 * This structure is direct image of physical FPGA memory. It assures
 * direct read/write FPGA access when it is mapped to the appropriate memory address
 * through /dev/mem device.
 */
typedef struct osc_fpga_reg_mem_s {
    /** @brief  Configuration:
     * bit     [0] - arm_trigger
     * bit     [1] - rst_wr_state_machine
     * bit     [2] - (R) trigger status (see OSC_FPGA_CONF_TRIG_ST_BIT)
     * bit     [3] - arm_keep
     * bit     [4] - (R) acquisition done, 2.0 only (OSC_FPGA_CONF_ACQ_DONE_BIT)
     * bits [31:5] - reserved 
     */
    uint32_t conf;

    /** @brief  Trigger source:
     * bits [ 2 : 0] - trigger source:
     *   1 - trig immediately
     *   2 - ChA positive edge
     *   3 - ChA negative edge
     *   4 - ChB positive edge 
     *   5 - ChB negative edge
     *   6 - External trigger 0
     *   7 - External trigger 1 
     * bits [31 : 3] -reserved
     */
    uint32_t trig_source;

    /** @brief  ChA threshold:
     * bits [13: 0] - ChA threshold
     * bits [31:14] - reserved
     */
    uint32_t cha_thr;

    /** @brief  ChB threshold:
     * bits [13: 0] - ChB threshold
     * bits [31:14] - reserved
     */
    uint32_t chb_thr;

    /** @brief  After trigger delay:
     * bits [31: 0] - trigger delay 
     * 32 bit number - how many decimated samples should be stored into a buffer.
     * (max 16k samples)
     */
    uint32_t trigger_delay;

    /** @brief  Data decimation
     * bits [19: 0] - decimation factor (20 bits in the 2.0 scope, rp_scope_cfg.v; it was 17 in 0.9x).
     *   The App uses 1, 8, 64, 128, 256, 512, 1024, 8192, 65536 and 524288 (osc_fpga_cnv_time_range_to_dec())
     * bits [31:20] - reserved
     */
    uint32_t data_dec;

    /** @brief  Write pointers - both of the format:
     * bits [13: 0] - pointer
     * bits [31:14] - reserved
     * Current pointer - where machine stopped writing after trigger
     * Trigger pointer - where trigger was detected 
     */
    uint32_t wr_ptr_cur;
    uint32_t wr_ptr_trigger;

    /** @brief  ChA & ChB hysteresis - both of the format:
     * bits [13: 0] - hysteresis threshold
     * bits [31:14] - reserved
     */
    uint32_t cha_hystersis;
    uint32_t chb_hystersis;

    /** @brief
     * bits [0] - enable signal average at decimation
     * bits [31:1] - reserved
     */
    uint32_t other;

    /** @brief Offset 0x2C (R) - v2.3.23: number of samples written into the buffer since the last arm and
     * before the trigger (adc_we_cnt of rp_bram_sm.v / red_pitaya_scope.v, saturates at 2**32-1). It is the
     * pre-trigger history of the current acquisition that really belongs to it (see osc_fpga_get_we_cnt()).
     */
    uint32_t we_cnt;
    
    /** @brief ChA Equalization filter
     * bits [17:0] - AA coefficient (pole)
     * bits [31:18] - reserved
     */
    uint32_t cha_filt_aa;    
    
    /** @brief ChA Equalization filter
     * bits [24:0] - BB coefficient (zero)
     * bits [31:25] - reserved
     */
    uint32_t cha_filt_bb;    
    
    /** @brief ChA Equalization filter
     * bits [24:0] - KK coefficient (gain)
     * bits [31:25] - reserved
     */
    uint32_t cha_filt_kk;  
    
    /** @brief ChA Equalization filter
     * bits [24:0] - PP coefficient (pole)
     * bits [31:25] - reserved
     */
    uint32_t cha_filt_pp;     
    
    
    

    /** @brief ChB Equalization filter
     * bits [17:0] - AA coefficient (pole)
     * bits [31:18] - reserved
     */
    uint32_t chb_filt_aa;    
    
    /** @brief ChB Equalization filter
     * bits [24:0] - BB coefficient (zero)
     * bits [31:25] - reserved
     */
    uint32_t chb_filt_bb;    
    
    /** @brief ChB Equalization filter
     * bits [24:0] - KK coefficient (gain)
     * bits [31:25] - reserved
     */
    uint32_t chb_filt_kk;  
    
    /** @brief ChB Equalization filter
     * bits [24:0] - PP coefficient (pole)
     * bits [31:25] - reserved
     */
    uint32_t chb_filt_pp;            

    /** @brief Offsets 0x50 - 0x90: AXI/DMA and external trigger debouncer
     * registers, not used by this application. */
    uint32_t reserved_50_90[17];

    /** @brief Offset 0x94 - Trigger lock control (only in the 2.0 v0.94 scope,
     * used by the Vivado 2020.1 FPGA design of this App since v2.2.5)
     * bit [0] - (W) write 1 to unlock the trigger. After every trigger the
     *           2.0 FPGA locks the trigger (trig_source bit 5 reads 1) and
     *           ignores any new trigger until this bit is written (librp:
     *           acq_Start() -> osc_SetUnlockTrigger()). In the 0.9x
     *           scope (v0.2.x FPGA, Vivado 2015.2) this address is unmapped (write ignored).
     */
    uint32_t trigger_lock_ctr;

    /** @brief  ChA & ChB data - 14 LSB bits valid starts from 0x10000 and
     * 0x20000 and are each 16k samples long */
} osc_fpga_reg_mem_t;

/** @} */


/* constants */
extern const float c_osc_fpga_smpl_freq;
extern const float c_osc_fpga_smpl_period;
extern const int   c_osc_fpga_adc_bits;


/* function declarations, detailed descriptions is in apparent implementation file  */
int   osc_fpga_init(void);
int   osc_fpga_exit(void);
int   osc_fpga_update_params(int trig_imm, int trig_source, int trig_edge,
                             float trig_delay, float trig_level, int time_range,
                             float ch1_adc_max_v, float ch2_adc_max_v,
                             int ch1_calib_dc_off, float ch1_user_dc_off,
                             int ch2_calib_dc_off, float ch2_user_dc_off,
                             int ch1_probe_att, int ch2_probe_att,
			      int ch1_gain, int ch2_gain,
                             int enable_avg_at_dec);
int   osc_fpga_reset(void);
int   osc_fpga_arm_trigger(void);
int   osc_fpga_set_trigger(uint32_t trig_source);
int   osc_fpga_set_trigger_delay(uint32_t trig_delay);
int   osc_fpga_triggered(void);
int   osc_fpga_get_sig_ptr(int **cha_signal, int **chb_signal);
int   osc_fpga_get_wr_ptr(int *wr_ptr_curr, int *wr_ptr_trig);
/* v2.3.23 */
int   osc_fpga_trig_received(void);
uint32_t osc_fpga_get_we_cnt(void);

int   osc_fpga_cnv_trig_source(int trig_imm, int trig_source, int trig_edge);
int   osc_fpga_cnv_time_range_to_dec(int time_range);
int   osc_fpga_cnv_time_to_smpls(float time, int dec_factor);
int   osc_fpga_cnv_v_to_cnt(float voltage, float max_adc_v,
                            int calib_dc_off, float user_dc_off);
float osc_fpga_cnv_cnt_to_trig_v(float cnts, float adc_max_v,
                                 int calib_dc_off, float user_dc_off);
float osc_fpga_cnv_cnt_to_v(int cnts, float max_adc_v,
                            int calib_dc_off, float user_dc_off);
float osc_fpga_calc_adc_max_v(uint32_t fe_gain_fs, int probe_att);

#endif /* __FPGA_H */
