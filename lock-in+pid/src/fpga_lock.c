/**
 * @brief Red Pitaya LOCK FPGA controller.
 *
 * @Author Marcelo Luda <marceluda@gmail.com>
 *         
 * (c) Red Pitaya  http://www.redpitaya.com
 *
 * This part of code is written in C programming language.
 * Please visit http://en.wikipedia.org/wiki/C_(programming_language)
 * for more details on the language used herein.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <errno.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>

#include "fpga_lock.h"

/** 
 * GENERAL DESCRIPTION:
 *
 * This module initializes and provides for other SW modules the access to the 
 * FPGA PID module.
 *
 * This module maps physical address of the LOCK core to the logical address,
 * which can be used in the GNU/Linux user-space. To achieve this LOCK_BASE_ADDR
 * from CPU memory space is translated automatically to logical address with the
 * function mmap().
 * Before this module is used external SW module must call fpga_lock_init().
 * When this module is no longer needed fpga_lock_exit() should be called.
 */

/** The FPGA register structure (defined in fpga_lock.h) */
lock_reg_t *g_lock_reg     = NULL;

/** The memory file descriptor used to mmap() the FPGA space */
int g_lock_fd = -1;


/*----------------------------------------------------------------------------*/
/**
 * @brief Internal function used to clean up memory.
 *
 * This function un-maps FPGA registers, closes memory file
 * descriptor and cleans all memory allocated by this module.
 *
 * @retval 0 Success
 * @retval -1 Failure, error is printed to standard error output.
 */
int __lock_cleanup_mem(void)
{
    /* If registry structure is NULL we do not need to un-map and clean up */
    if(g_lock_reg) {
        if(munmap(g_lock_reg, LOCK_BASE_SIZE) < 0) {
            fprintf(stderr, "munmap() failed: %s\n", strerror(errno));
            return -1;
        }
        g_lock_reg = NULL;
    }

    if(g_lock_fd >= 0) {
        close(g_lock_fd);
        g_lock_fd = -1;
    }
    return 0;
}

// [FPGARESET DOCK]
/** Reset all LOCK */
void reset_locks(void)
{
    if (g_lock_reg) {
        g_lock_reg->oscA_sw              =      1;
        g_lock_reg->oscB_sw              =      2;
        g_lock_reg->osc_ctrl             =      3;
        g_lock_reg->trig_sw              =      0;
        g_lock_reg->out1_sw              =      0;
        g_lock_reg->out2_sw              =      0;
        g_lock_reg->slow_out1_sw         =      0;
        g_lock_reg->slow_out2_sw         =      0;
        g_lock_reg->slow_out3_sw         =      0;
        g_lock_reg->slow_out4_sw         =      0;
        g_lock_reg->lock_control         =   1148;
        g_lock_reg->lock_feedback        =   1148;
        g_lock_reg->lock_trig_val        =      0;
        g_lock_reg->lock_trig_time       =      0;
        g_lock_reg->lock_trig_sw         =      0;
        g_lock_reg->rl_error_threshold   =      0;
        g_lock_reg->rl_signal_sw         =      0;
        g_lock_reg->rl_signal_threshold  =      0;
        g_lock_reg->rl_config            =      0;
        g_lock_reg->rl_state             =      0;
        g_lock_reg->sf_jumpA             =      0;
        g_lock_reg->sf_jumpB             =      0;
        g_lock_reg->sf_config            =      0;
        g_lock_reg->signal_sw            =      0;
        g_lock_reg->signal_i             =      0;
        g_lock_reg->sg_amp1              =      0;
        g_lock_reg->sg_amp2              =      0;
        g_lock_reg->sg_amp3              =      0;
        g_lock_reg->sg_amp_sq            =      0;
        g_lock_reg->lpf_F1               =     32;
        g_lock_reg->lpf_F2               =     32;
        g_lock_reg->lpf_F3               =     32;
        g_lock_reg->lpf_sq               =     32;
        g_lock_reg->error_sw             =      0;
        g_lock_reg->error_offset         =      0;
        g_lock_reg->error                =      0;
        g_lock_reg->error_mean           =      0;
        g_lock_reg->error_std            =      0;
        g_lock_reg->gen_mod_phase        =      0;
        g_lock_reg->gen_mod_phase_sq     =      0;
        g_lock_reg->gen_mod_hp           =      0;
        g_lock_reg->gen_mod_sqp          =      0;
        g_lock_reg->ramp_A               =      0;
        g_lock_reg->ramp_B               =      0;
        g_lock_reg->ramp_step            =      0;
        g_lock_reg->ramp_low_lim         =  -5000;
        g_lock_reg->ramp_hig_lim         =   5000;
        g_lock_reg->ramp_reset           =      0;
        g_lock_reg->ramp_enable          =      0;
        g_lock_reg->ramp_direction       =      0;
        g_lock_reg->ramp_B_factor        =   4096;
        g_lock_reg->sin_ref              =      0;
        g_lock_reg->cos_ref              =      0;
        g_lock_reg->cos_1f               =      0;
        g_lock_reg->cos_2f               =      0;
        g_lock_reg->cos_3f               =      0;
        g_lock_reg->sq_ref_b             =      0;
        g_lock_reg->sq_quad_b            =      0;
        g_lock_reg->sq_phas_b            =      0;
        g_lock_reg->sq_ref               =      0;
        g_lock_reg->sq_quad              =      0;
        g_lock_reg->sq_phas              =      0;
        g_lock_reg->in1                  =      0;
        g_lock_reg->in2                  =      0;
        g_lock_reg->out1                 =      0;
        g_lock_reg->out2                 =      0;
        g_lock_reg->slow_out1            =      0;
        g_lock_reg->slow_out2            =      0;
        g_lock_reg->slow_out3            =      0;
        g_lock_reg->slow_out4            =      0;
        g_lock_reg->oscA                 =      0;
        g_lock_reg->oscB                 =      0;
        g_lock_reg->X_28                 =      0;
        g_lock_reg->Y_28                 =      0;
        g_lock_reg->F1_28                =      0;
        g_lock_reg->F2_28                =      0;
        g_lock_reg->F3_28                =      0;
        g_lock_reg->sqX_28               =      0;
        g_lock_reg->sqY_28               =      0;
        g_lock_reg->sqF_28               =      0;
        g_lock_reg->cnt_clk              =      0;
        g_lock_reg->cnt_clk2             =      0;
        g_lock_reg->read_ctrl            =      0;
        g_lock_reg->pidA_sw              =      0;
        g_lock_reg->pidA_PSR             =      3;
        g_lock_reg->pidA_ISR             =      8;
        g_lock_reg->pidA_DSR             =      0;
        g_lock_reg->pidA_SAT             =     13;
        g_lock_reg->pidA_sp              =      0;
        g_lock_reg->pidA_kp              =      0;
        g_lock_reg->pidA_ki              =      0;
        g_lock_reg->pidA_kd              =      0;
        g_lock_reg->pidA_in              =      0;
        g_lock_reg->pidA_out             =      0;
        g_lock_reg->pidA_ctrl            =      0;
        g_lock_reg->ctrl_A               =      0;
        g_lock_reg->pidB_sw              =      0;
        g_lock_reg->pidB_PSR             =      3;
        g_lock_reg->pidB_ISR             =      8;
        g_lock_reg->pidB_DSR             =      0;
        g_lock_reg->pidB_SAT             =     13;
        g_lock_reg->pidB_sp              =      0;
        g_lock_reg->pidB_kp              =      0;
        g_lock_reg->pidB_ki              =      0;
        g_lock_reg->pidB_kd              =      0;
        g_lock_reg->pidB_in              =      0;
        g_lock_reg->pidB_out             =      0;
        g_lock_reg->pidB_ctrl            =      0;
        g_lock_reg->ctrl_B               =      0;
        g_lock_reg->aux_A                =      0;
        g_lock_reg->aux_B                =      0;
    }
}
// [FPGARESET DOCK END]


/*----------------------------------------------------------------------------*/
/**
 * @brief Maps FPGA memory space and prepares register variables.
 * 
 * This function opens memory device (/dev/mem) and maps physical memory address
 * LOCK_BASE_ADDR (of length LOCK_BASE_SIZE) to logical addresses. It initializes
 * the pointer g_lock_reg to point to FPGA LOCK.
 * If function fails FPGA variables must not be used.
 *
 * @retval 0  Success
 * @retval -1 Failure, error is printed to standard error output.
 */
int fpga_lock_init(void)
{
    /* Page variables used to calculate correct mapping addresses */
    void *page_ptr;
    long page_addr, page_off, page_size = sysconf(_SC_PAGESIZE);

    /* If module was already initialized, clean all internals */
    if(__lock_cleanup_mem() < 0)
        return -1;

    /* Open /dev/mem to access directly system memory */
    g_lock_fd = open("/dev/mem", O_RDWR | O_SYNC);
    if(g_lock_fd < 0) {
        fprintf(stderr, "open(/dev/mem) failed: %s\n", strerror(errno));
        return -1;
    }

    /* Calculate correct page address and offset from LOCK_BASE_ADDR and
     * LOCK_BASE_SIZE
     */
    page_addr = LOCK_BASE_ADDR & (~(page_size-1));
    page_off  = LOCK_BASE_ADDR - page_addr;

    /* Map FPGA memory space to page_ptr. */
    page_ptr = mmap(NULL, LOCK_BASE_SIZE, PROT_READ | PROT_WRITE,
                          MAP_SHARED, g_lock_fd, page_addr);
    if((void *)page_ptr == MAP_FAILED) {
        fprintf(stderr, "mmap() failed: %s\n", strerror(errno));
         __lock_cleanup_mem();
        return -1;
    }

    /* Set FPGA LOCK module pointers to correct values. */
    g_lock_reg = page_ptr + page_off;

    /* Reset all controllers */
    //reset_locks();

    return 0;
}


/*----------------------------------------------------------------------------*/
/**
 * @brief Cleans up FPGA PID module internals.
 * 
 * This function closes the memory file descriptor, unmaps the FPGA memory space
 * and cleans also all other internal things from FPGA LOCK module.
 * @retval 0 Success
 * @retval -1 Failure
 */
int fpga_lock_exit(void)
{
    /* Reset all controllers */
    //reset_locks();

    return __lock_cleanup_mem();
}
