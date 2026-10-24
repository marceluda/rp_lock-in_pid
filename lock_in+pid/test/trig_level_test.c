/*
 * v2.2.14: host test of the Raw Mode trigger level conversion of src/fpga.c (port of rp_dummy2 1.0.1), linked with the
 * real fpga.c: osc_fpga_cnv_cnt_to_trig_v() must give the voltage that osc_fpga_cnv_v_to_cnt() (the function that
 * writes the threshold of the scope) turns into exactly the same counts, for every 14-bit level, calibration offset,
 * full scale and user offset. Before, the worker passed the counts as volts: 100 counts -> threshold 8191.
 *
 *   gcc -Wall -Werror -Isrc -o /tmp/trig_level_test test/trig_level_test.c src/fpga.c -lm && /tmp/trig_level_test
 *   (from the App folder; exit code 1 on failure)
 */
#include <stdio.h>
#include <math.h>
#include "fpga.h"

int main(void)
{
    static const float adc_max[] = { 1.0f, 1.0835f, 20.5f };
    static const int   calib[]   = { 0, 37, -25, 585 };
    static const float user[]    = { 0.0f, 0.1f };
    int a, b, u, c, fails = 0, n = 0, clamped = 0, old;
    for(a = 0; a < 3; a++)
        for(b = 0; b < 4; b++)
            for(u = 0; u < 2; u++)
                for(c = -8192; c <= 8191; c++) {
                    float v = osc_fpga_cnv_cnt_to_trig_v((float)c, adc_max[a], calib[b], user[u]);
                    int   r = osc_fpga_cnv_v_to_cnt(v, adc_max[a], calib[b], user[u]);
                    n++;
                    /* osc_fpga_cnv_v_to_cnt() clamps the voltage to +-adc_max_v before taking the user offset out,
                     * and a level that, with the calibration offset, is beyond the 14-bit range saturates too
                     * (as in volts mode): those are counted apart, and must saturate at the right end */
                    if(fabsf(v) > adc_max[a] || c + calib[b] > 8191 || c + calib[b] < -8192) {
                        int rs = ((r & 0x3FFF) ^ 0x2000) - 0x2000;
                        clamped++;
                        if((c > 0 && rs < 0) || (c < 0 && rs > 0)) {
                            if(fails++ < 10)
                                printf("  FAIL: %d counts (max %g V, calib %d, user %g V) saturates at the wrong end: %d\n",
                                       c, adc_max[a], calib[b], user[u], rs);
                        }
                        continue;
                    }
                    if((r & 0x3FFF) != (c & 0x3FFF)) {
                        if(fails++ < 10)
                            printf("  FAIL: %d counts (max %g V, calib %d, user %g V) -> %g V -> %d\n",
                                   c, adc_max[a], calib[b], user[u], v, r);
                    }
                }
    printf("  %s: %d levels x full scales x offsets -> the same counts in the threshold register (%d failures; "
           "%d beyond the full scale with the user/calibration offset, saturated at their end as in volts mode)\n",
           fails ? "FAIL" : "PASS", n, fails, clamped);
    old = osc_fpga_cnv_v_to_cnt(100.0f, 1.0f, 0, 0.0f);
    printf("  (reference) the old path, 100 counts taken as 100 V, gives %d\n", old);
    if(fails == 0 && old == 8191) { printf("ALL PASS (0 failures)\n"); return 0; }
    printf("FAILED\n");
    return 1;
}
