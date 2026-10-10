/* v2.3.14: native test of the real controller code (src/main.c, worker.c, lock.c, fpga*.c, ...) for the
 * AUTO (auto-set) and forceX paths of rp_set_params(). /dev/mem is plain memory (fake_hw.h) and a thread
 * plays the scope FPGA: every armed acquisition triggers after ~1 ms with a sine on both channels.
 *
 *   1. Capture Lock -> AUTO: the restore POST {trig_mode 1, lock_trig_sw 2, xmin, xmax, auto_flag 1}
 *      leaves Ext Trig = Scan floor (params and FPGA), the window is not the capture one, and lock params
 *      changed after the last scope change (kp) or in the AUTO POST itself (ki) are not reverted.
 *   2. forceX: zoom with a change of units, a POST in the old units right after it is still ignored,
 *      a zoom-out of more than 33x 1.6 s later is applied.
 *   3. A POST that changes the scope while the auto-set runs: no 10 s wait, auto_flag ends at 0.
 *
 * Build and run: test/auto_set_c_sim/run.sh [src dir]     (exit code 1 if a check fails)
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdint.h>
#include <errno.h>
#include <math.h>
#include <unistd.h>
#include <pthread.h>
#include <sys/time.h>

#include "main.h"
#include "worker.h"
#include "fpga.h"
#include "fpga_lock.h"

/* ---------------------------------------------------------------- /dev/mem as plain memory */
#define FAKE_FD 900
static volatile osc_fpga_reg_mem_t *osc = NULL;

int fake_open(const char *path, int flags, ...)
{
    (void)flags;
    if(strcmp(path, "/dev/mem") == 0)
        return FAKE_FD;
    errno = ENOENT;
    return -1;
}
int fake_close(int fd) { return (fd == FAKE_FD) ? 0 : close(fd); }
int fake_munmap(void *addr, size_t len) { (void)addr; (void)len; return 0; }
void *fake_mmap(void *addr, size_t len, int prot, int flags, int fd, off_t off)
{
    (void)addr; (void)prot; (void)flags; (void)fd;
    void *m = calloc(1, len + 4096);
    if((long)off == OSC_FPGA_BASE_ADDR)
        osc = (volatile osc_fpga_reg_mem_t *)m;
    return m;
}

/* ---------------------------------------------------------------- scope FPGA */
static volatile int fpga_run = 1;
static void *fpga_thread(void *arg)
{
    (void)arg;
    int *cha = NULL, *chb = NULL, i;
    while(fpga_run) {
        usleep(200);
        if(!osc)
            continue;
        if(osc->conf & 0x2)                        /* reset (self-clearing) */
            osc->conf &= ~(0x2 | OSC_FPGA_CONF_ACQ_DONE_BIT);
        if((osc->conf & 0x1) && (osc->trig_source & OSC_FPGA_TRIG_SRC_RD_MASK)) {
            usleep(1000);
            if(!cha)
                osc_fpga_get_sig_ptr(&cha, &chb);
            for(i = 0; i < OSC_FPGA_SIG_LEN; i++) {    /* 3000 counts, period 2000 samples */
                int v = (int)lround(3000.0 * sin(2 * M_PI * i / 2000.0));
                cha[i] = v & 0x3fff;
                chb[i] = (v / 2) & 0x3fff;
            }
            osc->wr_ptr_trigger = 100;
            osc->wr_ptr_cur     = 100 + OSC_FPGA_SIG_LEN / 2;
            osc->trig_source    = 0;
            osc->conf           = (osc->conf & ~0x1) | OSC_FPGA_CONF_ACQ_DONE_BIT;
        }
    }
    return NULL;
}

/* ---------------------------------------------------------------- helpers */
static int fails = 0, oks = 0;
static void check(const char *name, int cond, const char *fmt, ...)
{
    char buf[512] = "";
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    printf("%s %s  [%s]\n", cond ? "OK  " : "FAIL", name, buf);
    if(cond) oks++; else fails++;
}

static double now_s(void)
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec * 1e-6;
}

/* POST: "name", value, "name", value, ..., NULL. Returns the time rp_set_params() took [s]. */
static double post(const char *first, ...)
{
    rp_app_params_t p[64];
    int n = 0;
    const char *name = first;
    va_list ap;
    va_start(ap, first);
    while(name && n < 63) {
        p[n].name  = (char *)name;
        p[n].value = (float)va_arg(ap, double);
        n++;
        name = va_arg(ap, const char *);
    }
    va_end(ap);
    p[n].name = NULL;
    double t0 = now_s();
    rp_set_params(p, n);
    return now_s() - t0;
}

/* GET: value of a parameter as served to the client (rp_get_params()) */
static float get(const char *name)
{
    rp_app_params_t *p = NULL;
    int n = rp_get_params(&p), i;
    float v = NAN;
    for(i = 0; i < n; i++) {
        if(strcmp(p[i].name, name) == 0)
            v = p[i].value;
        free(p[i].name);
    }
    free(p);
    return v;
}

/* GET /data: one complete acquisition (its rp_get_signals() also reads the lock registers back) */
static void get_data(void)
{
    float **s = NULL;
    int num, len, k;
    rp_create_signals(&s);
    for(k = 0; k < 100; k++) {
        if(rp_get_signals(&s, &num, &len) == 0)
            break;
        usleep(2000);
    }
    rp_cleanup_signals(&s);
}

typedef struct { double dt; } auto_arg_t;
static void *auto_post_thread(void *arg)
{
    auto_arg_t *a = (auto_arg_t *)arg;
    a->dt = post("trig_mode", 1.0, "auto_flag", 1.0, NULL);
    return NULL;
}

int main(void)
{
    pthread_t th;
    double dt;

    setvbuf(stdout, NULL, _IOLBF, 0);
    if(rp_app_init() < 0) {
        printf("FAIL rp_app_init\n");
        return 1;
    }
    pthread_create(&th, NULL, fpga_thread, NULL);

    /* ---- 1. Capture Lock -> AUTO */
    post("trig_mode", 1.0, "trig_source", 2.0, "lock_trig_sw", 2.0, "xmin", 0.0, "xmax", 20.0, NULL);
    usleep(50000);
    /* answer to a possible forceX (the GUI sends the range back) */
    post("xmin", (double)get("xmin"), "xmax", (double)get("xmax"), NULL);
    usleep(20000);
    float win_min = get("xmin"), win_max = get("xmax"), tu0 = get("time_units");
    /* capture: POST 1 (Single + External + Ext Trig 128 + window), POST 2 (single_btn + request) */
    post("trig_mode", 2.0, "lock_trig_sw", 128.0, "xmin", win_min - 5, "xmax", win_max - 5, NULL);
    post("single_btn", 1.0, "lock_ctrl_aux_launch_lock_trig", 1.0, "xmin", win_min - 5, "xmax", win_max - 5, NULL);
    usleep(50000);
    check("1.0 capture armed: Ext Trig 128 in params and FPGA", get("lock_trig_sw") == 128 && g_lock_reg->trig_sw == 128,
          "lock_trig_sw %g, FPGA trig_sw %u", get("lock_trig_sw"), g_lock_reg->trig_sw);
    get_data();
    /* lock param changed after the last scope change (does not reach the worker) */
    post("lock_pidA_kp", 123.0, "xmin", win_min - 5, "xmax", win_max - 5, NULL);
    usleep(20000);
    /* AUTO with the Capture Lock restore in the same POST (+ a lock param of this POST) */
    dt = post("trig_mode", 1.0, "lock_trig_sw", 2.0, "xmin", (double)win_min, "xmax", (double)win_max,
              "lock_pidA_ki", 7.0, "auto_flag", 1.0, NULL);
    usleep(50000);
    get_data();
    get_data();
    check("1.1 AUTO: Ext Trig back to Scan floor (2) in params", get("lock_trig_sw") == 2, "lock_trig_sw %g", get("lock_trig_sw"));
    check("1.2 AUTO: Ext Trig 2 in the FPGA (lock trig_sw register)", g_lock_reg->trig_sw == 2, "FPGA trig_sw %u", g_lock_reg->trig_sw);
    check("1.3 AUTO: lock_pidA_kp set after the capture not reverted", get("lock_pidA_kp") == 123 && g_lock_reg->pidA_kp == 123,
          "param %g, FPGA %d", get("lock_pidA_kp"), (int)g_lock_reg->pidA_kp);
    check("1.4 AUTO: lock_pidA_ki of the AUTO POST applied", get("lock_pidA_ki") == 7 && g_lock_reg->pidA_ki == 7,
          "param %g, FPGA %d", get("lock_pidA_ki"), (int)g_lock_reg->pidA_ki);
    check("1.5 AUTO: auto_flag cleared, POST answered without the 10 s timeout", get("auto_flag") == 0 && dt < 5,
          "auto_flag %g, POST %.3f s", get("auto_flag"), dt);
    check("1.6 AUTO: scope from the auto-set (Normal, source ch1/ch2, window from 0, not the capture one)",
          get("trig_mode") == 1 && get("trig_source") < 2 && get("xmin") == 0 && get("xmax") > 0 &&
          !(get("xmin") == win_min - 5 && get("xmax") == win_max - 5),
          "trig_mode %g, trig_source %g, x %g..%g [units %g] (before: %g..%g [units %g], capture %g..%g)",
          get("trig_mode"), get("trig_source"), get("xmin"), get("xmax"), get("time_units"),
          win_min, win_max, tu0, win_min - 5, win_max - 5);
    check("1.7 AUTO: the other lock params are kept (launch request still 1)", get("lock_ctrl_aux_launch_lock_trig") == 1,
          "launch %g", get("lock_ctrl_aux_launch_lock_trig"));

    /* ---- 2. forceX */
    post("trig_mode", 1.0, "trig_source", 0.0, "xmin", 0.0, "xmax", 20e-3 * pow(10, 3 * (2 - get("time_units"))), NULL);   /* 20 ms */
    usleep(20000);
    post("xmin", (double)get("xmin"), "xmax", (double)get("xmax"), NULL);   /* GUI answers the forceX */
    usleep(20000);
    float tu = get("time_units");
    check("2.0 start in ms, no forceX", tu == 1 && get("forcex_flag") == 0, "units %g, forcex %g, x %g..%g", tu,
          get("forcex_flag"), get("xmin"), get("xmax"));
    post("xmin", 0.1, "xmax", 0.4, NULL);    /* zoom in: ms -> us */
    check("2.1 zoom 0.1-0.4 ms: forceX to 100-400 us", get("forcex_flag") == 1 && get("time_units") == 0 &&
          fabsf(get("xmin") - 100) < 1 && fabsf(get("xmax") - 400) < 1,
          "forcex %g, units %g, x %g..%g", get("forcex_flag"), get("time_units"), get("xmin"), get("xmax"));
    post("xmin", 0.15, "xmax", 0.35, NULL);  /* POST still in the old units, right after */
    check("2.2 POST in the old units right after: ignored (still forced)", get("forcex_flag") == 1 &&
          fabsf(get("xmin") - 100) < 1 && fabsf(get("xmax") - 400) < 1,
          "forcex %g, units %g, x %g..%g", get("forcex_flag"), get("time_units"), get("xmin"), get("xmax"));
    usleep(1600000);
    post("xmin", 0.0, "xmax", 64160.0, NULL);   /* zoom-out > 33x, in us */
    check("2.3 zoom-out 0-64160 us 1.6 s later: applied (0-64.16 ms)", get("time_units") == 1 &&
          fabsf(get("xmin")) < 0.01 && fabsf(get("xmax") - 64.16) < 0.01,
          "forcex %g, units %g, x %g..%g", get("forcex_flag"), get("time_units"), get("xmin"), get("xmax"));
    post("xmin", (double)get("xmin"), "xmax", (double)get("xmax"), NULL);
    check("2.4 GUI answers the forceX: flag cleared", get("forcex_flag") == 0, "forcex %g", get("forcex_flag"));

    /* ---- 3. scope change while the auto-set runs */
    {
        pthread_t ta;
        auto_arg_t a = { 0 };
        pthread_create(&ta, NULL, auto_post_thread, &a);
        usleep(3000);
        dt = post("trig_mode", 0.0, NULL);
        pthread_join(ta, NULL);
        usleep(100000);
        check("3.1 POST during the auto-set: both answered without the 10 s timeout, auto_flag 0",
              a.dt < 5 && dt < 5 && get("auto_flag") == 0,
              "AUTO POST %.3f s, other POST %.3f s, auto_flag %g", a.dt, dt, get("auto_flag"));
    }

    fpga_run = 0;
    pthread_join(th, NULL);
    printf("%d OK, %d FAIL\n", oks, fails);
    _exit(fails ? 1 : 0);     /* no rp_app_exit(): it would look for streaming processes in /proc */
}
