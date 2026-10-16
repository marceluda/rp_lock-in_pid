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
 *   4. v2.3.18: lock_trig_time / lock_trig_val / lock_trig_sw written from outside (Python) are copied to the
 *      parameters (GET) and are not written back by a later change of another lock parameter.
 *   5. v2.3.18: AUTO with only noise in the inputs: window of at least 1 us (it was 0...139 ns on the board).
 *   6. v2.3.23: long acquisitions (windows >= 1.5 s) with a model of the circular buffer of the scope FPGA
 *      (rp_bram_sm.v: write pointer that wraps at 16384, trigger pointer, adc_we_cnt, post-trigger delay, conf
 *      bits 2/4) running in real time; every sample holds its absolute number (raw mode: ch1 = n % 8192,
 *      ch2 = n / 8192 % 8192), so each point of a trace says which sample it is: no point may come from
 *      another lap of the buffer or from before the history of the acquisition, and OK only when complete.
 *      6.1 Auto, xmin > 0; 6.2 Normal + Scan floor, window 0.98 x period: every sweep; 6.3 a read that
 *      catches the write pointer at the end of the buffer (deterministic: the model holds the writer there).
 *   7. v2.3.23: Capture Lock with a pre-trigger history longer than 1.5 s (model of the lock pulse "Lock
 *      control trig"): the request is applied after the trigger is enabled, the POST answers at once; the same
 *      POST sent again does not re-arm; release / kp while held; the fast case (window of 64 ms).
 *   8. v2.3.23: a change of time units (Reset zoom ms -> s): the trace of the old units is replaced at once.
 *   9. v2.3.23, with a model of the ramp (triangle) and of lock_ctrl.v (state machine; time counter reset at a
 *      scan floor, valid (cnt_ok) only from a floor of the running ramp, saturating; old_fpga: as before 2.3.23,
 *      counting from the last floor also while the ramp is stopped):
 *      9.0 (old FPGA model) reproduces RP2: Trigger Lock (time) right after releasing a lock closed early in the
 *          scan fires in the middle of the scan;
 *      9.1 the same from the page with the FPGA of 2.3.23: lock at floor + time after a real floor;
 *      9.3 the same with the request written directly to lock_control (py/lock_from_registers.py);
 *      9.2 a new Capture Lock request while the capture of the same window is still waiting: applied at once
 *          (2.3.23-51: the scope was resumed without saying it was armed, the request waited for its deadline).
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
#include <sched.h>

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
static volatile int fpga_mode = 0;    /* 0: instant acquisitions (sections 1-5), 1: circular buffer model (6-8) */
static double now_s(void);
static void ring_tick(void);
/* v2.3.18: 1 = "noise" instead of the sine: +-100 counts of white noise plus a 1200-count component with a period
 * of 12.4 samples (99 ns), as the "period" of ~93 ns that the auto-set found in the noise on the board. -585: the
 * default fe dc offset (calib.c, no EEPROM here), so that the corrected signal is centred at 0 (the period search
 * of the auto-set compares raw samples with thresholds of corrected values: the amplitude must exceed the offset) */
static volatile int sig_noise = 0;
static void *fpga_thread(void *arg)
{
    (void)arg;
    int *cha = NULL, *chb = NULL, i;
    while(fpga_run) {
        usleep(200);
        if(!osc)
            continue;
        if(fpga_mode == 1) {
            /* the commands (reset / arm) as soon as they are written, as the FPGA (the C reads the pointers
             * right after them); the samples every 200 us */
            double t_next = now_s() + 200e-6;
            while(fpga_mode == 1 && fpga_run && now_s() < t_next) {
                if(osc->conf & 0x3)
                    ring_tick();
                sched_yield();
            }
            ring_tick();
            continue;
        }
        if(osc->conf & 0x2)                        /* reset (self-clearing) */
            osc->conf &= ~(0x2 | OSC_FPGA_CONF_ACQ_DONE_BIT);
        if((osc->conf & 0x1) && (osc->trig_source & OSC_FPGA_TRIG_SRC_RD_MASK)) {
            usleep(1000);
            if(!cha)
                osc_fpga_get_sig_ptr(&cha, &chb);
            for(i = 0; i < OSC_FPGA_SIG_LEN; i++) {    /* 3000 counts, period 2000 samples */
                int v = sig_noise ? (int)lround(1200.0 * sin(2 * M_PI * i / 12.4)) + (rand() % 201) - 100 - 585
                                : (int)lround(3000.0 * sin(2 * M_PI * i / 2000.0));
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


/* ---------------------------------------------------------------- v2.3.23: circular buffer model */
/* Registers by offset (also with the fpga.h of older versions, where 0x2C has another name) */
#define OSC_REG(off) (((volatile uint32_t *)osc)[(off) / 4])
#define RING_N OSC_FPGA_SIG_LEN
#define MAX_TRIGS 256
static struct {
    pthread_mutex_t mx;
    double t_last;             /* [s] time up to which samples were made */
    double due;                /* fractional samples due */
    long long n;               /* absolute number of the next sample */
    int    wp, wp_cur, wp_trig, we, dly_do, dly_end, trg_rd;
    long long dly_cnt;
    uint32_t we_cnt;
    /* lock: pulse "Lock control trig" */
    uint32_t lc_last;          /* lock_control seen */
    double   lock_delay_s;     /* pulse this long after a 0->1 of lock_now / launch_lock */
    double   pulse_t;          /* pending pulse time (0: none) */
    int      rises, rises_trig_on, pulses, pulses_lost;
    /* scan floors (lock_trig_sw 2) */
    double   floor_period_s, floor_t0;
    long long next_floor_n;
    /* triggers: absolute sample number of the trigger sample */
    long long trig_n[MAX_TRIGS];
    int      ntrig;
    /* stall: the writer waits stall_s at the address stall_addr once (a read that catches it there) */
    int      stall_addr;
    double   stall_s, stall_until;
    int      stalled;
    /* v2.3.23: model of the ramp and of lock_ctrl.v (lockfsm = 1) */
    int      lockfsm;
    int      old_fpga;         /* 1: lock_ctrl.v before 2.3.23 (no cnt_ok, counter wraps) */
    int      cnt_ok;
    double   phi;              /* phase of the triangle [s], 0 = scan floor */
    double   cnt_s;            /* time counter of lock_ctrl.v [s] since the last floor (never stops) */
    int      fsm;              /* 0 idle, 1 armed, 2 locked */
    int      lock_count;
    double   lock_phi[64], lock_t[64], rise_t[64];
    int      nlock, nrise;
    double   floor_t[256];
    int      nfloor;
} ring = { .mx = PTHREAD_MUTEX_INITIALIZER, .stall_addr = -1 };

static void ring_reset_model(void)
{
    pthread_mutex_lock(&ring.mx);
    ring.t_last = now_s(); ring.due = 0; ring.n = 1000000;   /* n of 7 digits: ch2 != 0 */
    ring.wp = ring.wp_cur = ring.wp_trig = ring.we = ring.dly_do = ring.dly_end = ring.trg_rd = 0;
    ring.dly_cnt = 0; ring.we_cnt = 0;
    ring.lc_last = g_lock_reg ? g_lock_reg->lock_control : 0;
    ring.lock_delay_s = 0.001; ring.pulse_t = 0;
    ring.rises = ring.rises_trig_on = ring.pulses = ring.pulses_lost = 0;
    ring.floor_period_s = 0; ring.next_floor_n = -1;
    ring.ntrig = 0;
    ring.stall_addr = -1; ring.stall_s = 0; ring.stall_until = 0; ring.stalled = 0;
    ring.lockfsm = 0; ring.old_fpga = 0; ring.cnt_ok = 0; ring.phi = 0; ring.cnt_s = 0; ring.fsm = 0; ring.lock_count = 0;
    ring.nlock = ring.nrise = ring.nfloor = 0;
    pthread_mutex_unlock(&ring.mx);
}

/* v2.3.23: ramp + lock_ctrl.v over dt seconds (ring.mx held). Returns 1 when the lock closes (scope pulse). */
static int lockfsm_step(double t, double dt)
{
    uint32_t lc = g_lock_reg->lock_control;
    int lo = (int32_t)g_lock_reg->ramp_low_lim, hi = (int32_t)g_lock_reg->ramp_hig_lim, pulse = 0;
    double P = 2.0 * (hi - lo) * ((double)g_lock_reg->ramp_step + 1.0) * 8e-9;
    double thr = g_lock_reg->lock_trig_time * 8e-9, cnt0;
    int now_r = (lc & 1) && !(ring.lc_last & 1), launch_r = (lc & 2) && !(ring.lc_last & 2), rel = !(lc & 3);
    int man = ((lc ^ ring.lc_last) >> 2) & 7, type = (lc >> 8) & 3;
    int locked0 = (ring.fsm == 2);
    if((now_r || launch_r) && ring.nrise < 64) ring.rise_t[ring.nrise++] = t;
    if(ring.fsm == 0)      { if(now_r) ring.fsm = 2; else if(launch_r) ring.fsm = 1; }
    else if(ring.fsm == 1) { if(rel) ring.fsm = 0; else if(now_r) ring.fsm = 2; }
    else                   { if(rel || man) ring.fsm = 0; }
    ring.lc_last = lc;
    /* ramp: runs if the effective enable of lock_ctrl and the ramp_enable register */
    {
        int en = (ring.fsm == 2 ? (lc >> 7) & 1 : (lc >> 4) & 1) && (g_lock_reg->ramp_enable & 1) && P > 0;
        cnt0 = ring.cnt_s;
        ring.cnt_s += dt;
        if(ring.old_fpga) {
            if(ring.cnt_s >= 4294967296.0 * 8e-9) ring.cnt_s -= 4294967296.0 * 8e-9;   /* wraps */
            ring.cnt_ok = 1;
        } else {
            if(ring.cnt_s > 4294967295.0 * 8e-9) ring.cnt_s = 4294967295.0 * 8e-9;      /* saturates */
            if(!en) ring.cnt_ok = 0;                                                     /* ramp stopped */
        }
        if(en) {
            ring.phi += dt;
            if(ring.phi >= P) {                    /* scan floor: the counter restarts */
                ring.phi -= P;
                ring.cnt_s = ring.phi;
                cnt0 = -1;
                ring.cnt_ok = 1;
                if(ring.nfloor < 256) ring.floor_t[ring.nfloor++] = t - ring.phi;
            }
        }
        /* time trigger: the counter reaches the threshold (as cnt == time_threshold) */
        if(ring.fsm == 1 && type == 1 && ring.cnt_ok && cnt0 < thr && ring.cnt_s >= thr)
            ring.fsm = 2;
        if(ring.fsm == 2 && !locked0) {
            pulse = 1;
            ring.lock_count++;
            if(ring.nlock < 64) { ring.lock_phi[ring.nlock] = ring.phi; ring.lock_t[ring.nlock] = t; ring.nlock++; }
        }
        g_lock_reg->ramp_A = (P > 0) ? (int)lround(ring.phi < P / 2 ? lo + (hi - lo) * 2 * ring.phi / P
                                                                    : hi - (hi - lo) * (2 * ring.phi / P - 1)) : 0;
        int eff = (ring.fsm == 2 ? (lc >> 7) & 1 : (lc >> 4) & 1);
        *(volatile uint32_t *)&g_lock_reg->lock_status = (uint32_t)(((ring.lock_count & 255) << 8) | (eff << 4) |
                                                         ((ring.fsm == 2) << 1) | (ring.fsm == 1));
    }
    return pulse;
}

static void ring_tick(void)
{
    static int *cha = NULL, *chb = NULL;
    double t = now_s();
    uint32_t c, src;
    double ts;
    int dec, k, max_k;

    if(!cha)
        osc_fpga_get_sig_ptr(&cha, &chb);
    pthread_mutex_lock(&ring.mx);
    c = osc->conf;
    if(getenv("SIM_DEBUG") && (c & 3)) fprintf(stderr, "MDBG %.4f conf 0x%x (reset/arm) n %lld wp %d src %u dec %u\n", t, c, ring.n, ring.wp, osc->trig_source, osc->data_dec);
    if(c & 0x2) {                                  /* reset */
        ring.wp = ring.wp_cur = ring.wp_trig = 0;
        ring.we = ring.dly_do = ring.dly_end = ring.trg_rd = 0;
        ring.we_cnt = 0;
        osc->trig_source = 0;                      /* as rp_scope_cfg.v: set_trig_src <= 0 at a reset */
        __sync_fetch_and_and(&osc->conf, ~0x2u);
    }
    if(c & 0x1) {                                  /* arm */
        ring.we = 1; ring.we_cnt = 0; ring.dly_do = 0; ring.dly_end = 0; ring.trg_rd = 0;
        __sync_fetch_and_and(&osc->conf, ~0x1u);
    }
    /* lock_control: 0->1 of lock_now (bit 0) or launch_lock (bit 1) -> lock pulse after lock_delay_s */
    if(g_lock_reg && ring.lockfsm) {
        uint32_t lc = g_lock_reg->lock_control;
        if((lc & ~ring.lc_last) & 3u) {
            ring.rises++;
            if(osc->trig_source & 0xf) ring.rises_trig_on++;
        }
        if(lockfsm_step(t, t - ring.t_last))
            ring.pulse_t = t;
    } else if(g_lock_reg) {
        uint32_t lc = g_lock_reg->lock_control;
        if((lc & ~ring.lc_last) & 3u) {
            ring.rises++;
            if(osc->trig_source & 0xf)
                ring.rises_trig_on++;
            ring.pulse_t = t + ring.lock_delay_s;
        }
        if(!(lc & 3u))
            ring.pulse_t = 0;                      /* released before it locked */
        ring.lc_last = lc;
    }
    dec = (int)osc->data_dec;
    if(dec < 1) dec = 1;
    ts  = 8e-9 * dec;
    if(ring.stalled) {
        if(t < ring.stall_until) { ring.t_last = t; pthread_mutex_unlock(&ring.mx); return; }
        ring.stalled = 0;
    }
    ring.due += (t - ring.t_last) / ts;
    ring.t_last = t;
    max_k = (int)ring.due;
    ring.due -= max_k;
    if(max_k > 20000) {          /* fast decimations: only the last 20000 samples of the tick are made (the */
        ring.n += max_k - 20000; /* others pass unwritten, as if the scope were not armed; tests use Dec >= 65536) */
        max_k = 20000;
    }
    src = osc->trig_source & 0xf;
    for(k = 0; k < max_k; k++) {
        long long n = ring.n++;
        double tn = t - (max_k - 1 - k) * ts;     /* time of this sample */
        int trig = 0, ext = 0;
        if(ring.floor_period_s > 0 && g_lock_reg && g_lock_reg->trig_sw == 2) {
            if(ring.next_floor_n < 0)
                ring.next_floor_n = n + (long long)(ring.floor_period_s / ts);
            if(n >= ring.next_floor_n) {
                ext = 1;
                ring.next_floor_n += (long long)llround(ring.floor_period_s / ts);
            }
        }
        if(ring.pulse_t > 0 && tn >= ring.pulse_t) {
            ring.pulses++;
            ring.pulse_t = 0;
            if(g_lock_reg && g_lock_reg->trig_sw == 128) {
                if(ring.we && !ring.dly_do && (src == 6 || src == 7)) ext = 1;
                else ring.pulses_lost++;
            }
        }
        if(ring.we && !ring.dly_do && src) {
            if(src == 1) trig = 1;
            else if((src == 6 || src == 7) && ext) trig = 1;
        }
        if(trig) {
            ring.wp_trig = ring.wp; ring.dly_do = 1; ring.trg_rd = 1;
            ring.dly_cnt = (long long)osc->trigger_delay;
            osc->trig_source = 0; src = 0;
            if(ring.ntrig < MAX_TRIGS) ring.trig_n[ring.ntrig++] = n;
            if(getenv("SIM_DEBUG")) fprintf(stderr, "MDBG %.4f TRIG n %lld wp %d src %u\n", t, n, ring.wp, osc->trig_source);
        }
        if(ring.we) {
            if(ring.stall_addr >= 0 && ring.wp == ring.stall_addr && ring.dly_do) {
                ring.stall_addr = -1; ring.stalled = 1; ring.stall_until = t + ring.stall_s;
                ring.n--;                           /* this sample is made after the stall */
                ring.due = 0;
                break;
            }
            cha[ring.wp] = (int)(n % 8192);
            chb[ring.wp] = (int)((n / 8192) % 8192);
            ring.wp_cur = ring.wp;
            ring.wp = (ring.wp + 1) % RING_N;
            if(!ring.dly_do) {
                if(ring.we_cnt != 0xffffffffu) ring.we_cnt++;
            } else if(--ring.dly_cnt <= 0) {
                ring.we = 0; ring.dly_do = 0; ring.dly_end = 1;
            }
        }
    }
    {
        static double t_dbg = 0;
        if(getenv("SIM_DEBUG") && t - t_dbg > 0.5) {
            t_dbg = t;
            fprintf(stderr, "RING t %.3f dec %d n %lld wp %d we %d dly %d cnt %lld trig %d src %u conf 0x%x ntrig %d dly_reg %u\n",
                    t, dec, ring.n, ring.wp, ring.we, ring.dly_do, ring.dly_cnt, ring.trg_rd, osc->trig_source, osc->conf,
                    ring.ntrig, osc->trigger_delay);
        }
    }
    osc->wr_ptr_cur = ring.wp_cur;
    osc->wr_ptr_trigger = ring.wp_trig;
    OSC_REG(0x2C) = ring.we_cnt;
    if(ring.trg_rd) __sync_fetch_and_or(&osc->conf, 0x4u); else __sync_fetch_and_and(&osc->conf, ~0x4u);
    if(ring.dly_end) __sync_fetch_and_or(&osc->conf, 0x10u); else __sync_fetch_and_and(&osc->conf, ~0x10u);
    pthread_mutex_unlock(&ring.mx);
}

/* n of a trigger of the model, or -1 */
static int ring_is_trig(long long n)
{
    int i, r = 0;
    pthread_mutex_lock(&ring.mx);
    for(i = 0; i < ring.ntrig; i++)
        if(ring.trig_n[i] == n) r = 1;
    pthread_mutex_unlock(&ring.mx);
    return r;
}
static int ring_ntrig(void)
{
    int r;
    pthread_mutex_lock(&ring.mx);
    r = ring.ntrig;
    pthread_mutex_unlock(&ring.mx);
    return r;
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


/* ---------------------------------------------------------------- v2.3.23: GET /data as the nginx module */
/* rp_data_get_signals() of the module: its own buffer, rp_get_signals() up to 200 x 1 ms while there is no new
 * trace; returns 0 OK, -2 AGAIN (partial trace), -1 AGAIN (old trace: the buffer of the module again) */
static float **mod_sig = NULL;
static int module_get(void)
{
    int num, len, ret, k;
    if(!mod_sig)
        rp_create_signals(&mod_sig);
    ret = rp_get_signals(&mod_sig, &num, &len);
    for(k = 0; ret == -1 && k < 200; k++) {
        usleep(1000);
        ret = rp_get_signals(&mod_sig, &num, &len);
    }
    return ret;
}

/* dec of the current time_range */
static int cur_dec(void) { return osc_fpga_cnv_time_range_to_dec((int)get("time_range")); }
static double unit_f(void) { return pow(10, 3 * (2 - get("time_units"))); }

/* window in seconds: POST in the GUI units, then the GUI answer to a forceX (as the page) */
static void post_window(double xmin_s, double xmax_s, const char *k1, double v1, const char *k2, double v2,
                        const char *k3, double v3)
{
    double f = unit_f();
    post("xmin", xmin_s * f, "xmax", xmax_s * f, k1, v1, k2, v2, k3, v3, NULL);
    usleep(20000);
    if(get("forcex_flag") == 1)
        post("xmin", (double)get("xmin"), "xmax", (double)get("xmax"), NULL);
    usleep(20000);
}

/* Check of the trace in mod_sig (raw mode, ring model): every point that is not a copy of the previous one
 * (collapsed: not part of the acquisition) is sample n = trigger + s_k of ONE trigger of the model, with
 * s_k = round(t_k / Ts) - 3 as the C reads it. Returns the number of data points, -1 if a point is wrong
 * (msg says which). trig_out: n of the trigger. first_t: time of the first data point [units of the trace]. */
static int trace_check(double ts, double uf, long long *trig_out, double *first_t, char *msg, int msglen)
{
    int k, npts = 0;
    long long trig = -1;
    msg[0] = 0;
    for(k = 0; k < SIGNAL_LENGTH; k++) {
        double t = mod_sig[0][k] / uf;
        long long a = lround(mod_sig[1][k]), b = lround(mod_sig[2][k]);
        long long n = b * 8192 + a;
        long long sk;
        if(k > 0 && mod_sig[0][k] == mod_sig[0][k-1] && mod_sig[1][k] == mod_sig[1][k-1] && mod_sig[2][k] == mod_sig[2][k-1])
            continue;                                   /* collapsed point */
        if(k < 2 && mod_sig[1][k] == mod_sig[1][k+1] && mod_sig[2][k] == mod_sig[2][k+1])
            continue;                                   /* "FPGA bug" copy of the first points (worker.c) */
        sk = llround(t / ts) - 3;
        if(trig < 0) {
            trig = n - sk;
            if(first_t) *first_t = mod_sig[0][k];
            if(!ring_is_trig(trig)) {
                snprintf(msg, msglen, "point %d (t %.4f s): sample %lld = trigger %lld + %lld, no such trigger "
                         "(%.1f laps of the buffer away from the last one)", k, t, n, trig, sk,
                         ring_ntrig() ? (double)(ring.trig_n[ring_ntrig()-1] - trig) / RING_N : 0.0);
                return -1;
            }
        } else if(n - sk != trig) {
            snprintf(msg, msglen, "point %d (t %.4f s): sample %lld, expected %lld (%+.2f laps)", k, t, n, trig + sk,
                     (double)(n - sk - trig) / RING_N);
            return -1;
        }
        npts++;
    }
    if(trig_out) *trig_out = trig;
    return npts;
}

typedef struct { int gets, ok, again, bad, ok_bad, empty; long long last_trig; char first_bad[400]; double t_ok; } run_stat_t;

/* polls GET /data for dur_s seconds as the page does, checking every new trace */
static void run_traces(double dur_s, run_stat_t *st, int stop_at_ok)
{
    double t_end = now_s() + dur_s, t0 = now_s();
    double ts = 8e-9 * cur_dec(), uf = 1;
    memset(st, 0, sizeof(*st));
    st->last_trig = -1;
    while(now_s() < t_end) {
        char msg[300];
        int ret = module_get(), np;
        uf = pow(10, 3 * (2 - get("time_units")));
        ts = 8e-9 * cur_dec();
        st->gets++;
        if(ret == -1) { usleep(5000); continue; }
        np = trace_check(ts, uf, &st->last_trig, NULL, msg, sizeof(msg));
        if(ret == 0) st->ok++; else st->again++;
        if(np == 0) st->empty++;
        if(np < 0) {
            st->bad++;
            if(ret == 0) st->ok_bad++;
            if(!st->first_bad[0]) {
                int i;
                snprintf(st->first_bad, sizeof(st->first_bad), "%s %s", ret == 0 ? "OK" : "AGAIN", msg);
                if(getenv("SIM_DEBUG")) {
                    fprintf(stderr, "DEBUG bad trace: %s\n  triggers:", st->first_bad);
                    for(i = (ring.ntrig > 6 ? ring.ntrig - 6 : 0); i < ring.ntrig; i++) fprintf(stderr, " %lld", ring.trig_n[i]);
                    fprintf(stderr, "\n  model n %lld wp %d wp_trig %d\n  points:", ring.n, ring.wp, ring.wp_trig);
                    for(i = 0; i < 12; i++) fprintf(stderr, " [%.4f %lld]", mod_sig[0][i], (long long)(lround(mod_sig[2][i]) * 8192 + lround(mod_sig[1][i])));
                    fprintf(stderr, "\n");
                }
            }
        }
        if(ret == 0 && !st->t_ok) st->t_ok = now_s() - t0;
        if(ret == 0 && stop_at_ok) break;
        usleep(5000);
    }
}

/* request bits (lock_now | launch) in the lock_control register */
static int lock_request_held_param(void) { return 0; }

/* the C of this version has the v2.3.23 scope params (scope_gen ...) */
static int has_v2323(void) { return !isnan(get("scope_gen")); }

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

    /* ---- 4. v2.3.18: lock trigger registers written from outside */
    {
        post("lock_lock_trig_time_val", 2256455.0, "lock_lock_trig_val", 100.0, "lock_lock_trig_sw", 0.0, NULL);
        check("4.0 page values written", g_lock_reg->lock_trig_time == 2256455 && g_lock_reg->lock_trig_val == 100 &&
              g_lock_reg->lock_trig_sw == 0, "time %u, val %d, sw %u", g_lock_reg->lock_trig_time,
              (int)g_lock_reg->lock_trig_val, g_lock_reg->lock_trig_sw);
        g_lock_reg->lock_trig_time = 12500000;       /* py/lock_from_registers.py --time 100ms --level -1234 --sw 5 */
        g_lock_reg->lock_trig_val  = -1234;
        g_lock_reg->lock_trig_sw   = 5;
        check("4.1 GET shows the values written from outside", get("lock_lock_trig_time_val") == 12500000 &&
              get("lock_lock_trig_val") == -1234 && get("lock_lock_trig_sw") == 5, "time %.0f, val %g, sw %g",
              get("lock_lock_trig_time_val"), get("lock_lock_trig_val"), get("lock_lock_trig_sw"));
        float pb = get("lock_ctrl_aux_set_pidB_enable");
        post("lock_ctrl_aux_set_pidB_enable", (double)(1 - pb), NULL);   /* testAgent: a lock checkbox of the page */
        check("4.2 change of another lock parameter: the registers keep the outside values",
              g_lock_reg->lock_trig_time == 12500000 && g_lock_reg->lock_trig_val == -1234 && g_lock_reg->lock_trig_sw == 5 &&
              ((g_lock_reg->lock_control >> 5) & 1) == (unsigned)(1 - pb), "time %u, val %d, sw %u, lock_control 0x%03x", g_lock_reg->lock_trig_time,
              (int)g_lock_reg->lock_trig_val, g_lock_reg->lock_trig_sw, g_lock_reg->lock_control);
        post("lock_lock_trig_time_val", 2072500.0, NULL);    /* the page changes the time again */
        check("4.3 a later change of the time in the page is written (only the time)",
              g_lock_reg->lock_trig_time == 2072500 && g_lock_reg->lock_trig_val == -1234 && g_lock_reg->lock_trig_sw == 5,
              "time %u, val %d, sw %u", g_lock_reg->lock_trig_time, (int)g_lock_reg->lock_trig_val, g_lock_reg->lock_trig_sw);
        g_lock_reg->lock_trig_time = 2147495993u;     /* 2**31 + 12345: not exact as float */
        get("lock_lock_trig_time_val");
        post("lock_pidA_kp", 77.0, "lock_ctrl_aux_set_pidB_enable", (double)pb, NULL);
        check("4.4 value above 2**24 from outside kept exact in the register after other changes",
              g_lock_reg->lock_trig_time == 2147495993u, "time %u (param %.0f)", g_lock_reg->lock_trig_time,
              get("lock_lock_trig_time_val"));
        g_lock_reg->lock_trig_time = 0xffffffffu;
        get_data();                                   /* lock_update_main() + lock_update_status() */
        post("lock_pidA_kp", 78.0, NULL);
        check("4.5 2**32-1 from outside (and a complete acquisition): kept", g_lock_reg->lock_trig_time == 0xffffffffu &&
              get("lock_lock_trig_time_val") >= 4294967040.0f, "time %u, param %.0f", g_lock_reg->lock_trig_time,
              get("lock_lock_trig_time_val"));
        post("lock_lock_trig_time_val", 1000.0, NULL);
        check("4.6 then the page writes 1000", g_lock_reg->lock_trig_time == 1000, "time %u", g_lock_reg->lock_trig_time);
    }

    /* ---- 5. v2.3.18: AUTO with noise only */
    {
        sig_noise = 1;
        post("trig_mode", 0.0, "xmin", 0.0, "xmax", 20.0, NULL);
        usleep(50000);
        dt = post("auto_flag", 1.0, NULL);
        usleep(50000);
        float tu5 = get("time_units"), x0 = get("xmin"), x1 = get("xmax");
        double f5 = pow(10, 3 * (2 - tu5)), span = (x1 - x0) / f5;
        check("5.1 AUTO with noise only: window >= 1 us", span >= 0.999e-6 && dt < 5,
              "x %g..%g [units %g] = %.3g s, trig_mode %g, POST %.3f s", x0, x1, tu5, span, get("trig_mode"), dt);
        sig_noise = 0;
    }


    /* ================================================================ v2.3.23: circular buffer model */
    if(getenv("SIM_ONLY9")) goto only9;           /* debug: only section 9 */
    fpga_mode = 1;
    ring_reset_model();
    post("trig_mode", 1.0, "trig_source", 0.0, "lock_osc_raw_mode", 1.0, "lock_trig_sw", 0.0, NULL);
    usleep(50000);
    int v2323 = has_v2323();
    printf("INFO C with the v2.3.23 scope params: %s\n", v2323 ? "yes" : "no (older version)");

    /* ---- 6.1 Auto, window 1..3 s (xmin > 0) */
    {
        run_stat_t st;
        post("trig_mode", 0.0, NULL);
        post_window(1.0, 3.0, NULL, 0, NULL, 0, NULL, 0);
        run_traces(7.0, &st, 0);
        check("6.1 Auto, window 1..3 s (Dec 65536): no trace with samples of another lap of the buffer",
              st.bad == 0 && st.ok >= 1,
              "Dec %d, %d GET, %d OK, %d AGAIN, %d bad (%d OK) %s", cur_dec(), st.gets, st.ok, st.again, st.bad, st.ok_bad,
              st.first_bad);
    }

    /* ---- 6.2 Normal + Scan floor every 3 s, window 0 .. 2.94 s (Reset zoom: 0.98 x period) */
    {
        run_stat_t st;
        int t0;
        pthread_mutex_lock(&ring.mx); ring.floor_period_s = 3.0; ring.next_floor_n = -1; pthread_mutex_unlock(&ring.mx);
        post("trig_mode", 1.0, "trig_source", 2.0, "lock_trig_sw", 2.0, NULL);
        post_window(0.0, 2.94, NULL, 0, NULL, 0, NULL, 0);
        usleep(3100000);                        /* first floor: the scope is armed */
        module_get();
        t0 = ring_ntrig();
        run_traces(12.05, &st, 0);
        int floors = ring_ntrig() - t0;
        check("6.2a Normal + Scan floor 3 s, window 0..2.94 s: every trace (partial and OK) from its own trigger",
              st.bad == 0 && st.ok >= 3, "Dec %d, %d OK, %d AGAIN, %d bad %s", cur_dec(), st.ok, st.again, st.bad, st.first_bad);
        check("6.2b ... every sweep acquired (scope armed again before the next floor)", floors >= 4 && st.ok >= floors - 1,
              "%d triggers in 12 s (4 floors), %d OK", floors, st.ok);
    }

    /* ---- 6.3 a read that catches the writer at the end of the buffer */
    {
        run_stat_t st;
        pthread_mutex_lock(&ring.mx); ring.stall_addr = RING_N - 2; ring.stall_s = 0.45; pthread_mutex_unlock(&ring.mx);
        run_traces(12.0, &st, 0);
        int stalled_done = (ring.stall_addr < 0);
        check("6.3 the reader reaches the write pointer at address 16382 (writer held there 0.45 s): no sample of the previous lap",
              stalled_done && st.bad == 0 && st.ok >= 2, "stall %s, %d OK, %d AGAIN, %d bad %s",
              stalled_done ? "done" : "NOT reached", st.ok, st.again, st.bad, st.first_bad);
        pthread_mutex_lock(&ring.mx); ring.floor_period_s = 0; pthread_mutex_unlock(&ring.mx);
    }

    /* ---- 7. Capture Lock with a pre-trigger history of 1.8 s (window -1.8 .. 4.2 s) */
    {
        int c;
        for(c = 0; c < 5; c++) {
            const char *name[] = { "7.1 Lock Now", "7.2 Trigger Lock (lock 50 ms after the request), POST sent again 0.5 s later",
                                   "7.3 Trigger Lock released 0.5 s later", "7.4 Trigger Lock, kp changed 0.3 s later",
                                   "7.5 fast case: Lock Now, window -19.2 .. 44.8 ms" };
            const char *req = (c == 0 || c == 4) ? "lock_ctrl_aux_lock_now" : "lock_ctrl_aux_launch_lock_trig";
            double xmin = (c == 4) ? -0.0192 : -1.8, xmax = (c == 4) ? 0.0448 : 4.2, dt, f, sgen0;
            run_stat_t st;
            char msg[300];
            long long trig = -1;
            double first_t = NAN;
            int np, rises_before;
            /* clean start: Normal, no request, then the 2 POSTs of the page (7.5: from a fast window, 0..64 ms, as
             * with the 64 ms scan of the lock tests) */
            post("trig_mode", 1.0, "trig_source", 2.0, "lock_trig_sw", 2.0, "lock_ctrl_aux_lock_now", 0.0,
                 "lock_ctrl_aux_launch_lock_trig", 0.0, NULL);
            if(c == 4) {
                post("trig_mode", 0.0, NULL);
                post_window(0.0, 0.064, NULL, 0, NULL, 0, NULL, 0);
                usleep(2500000);    /* the C of 2.3.22 ends the sleep of the previous window (1.8 s) */
                post("trig_mode", 1.0, NULL);
            }
            usleep(100000);
            pthread_mutex_lock(&ring.mx);
            ring.lock_delay_s = (c == 0 || c == 4) ? 0.001 : 0.05;
            ring.rises = ring.rises_trig_on = ring.pulses = ring.pulses_lost = 0;
            pthread_mutex_unlock(&ring.mx);
            rises_before = ring.rises;
            post_window(xmin, xmax, "trig_mode", 2.0, "lock_trig_sw", 128.0, NULL, 0);
            f = unit_f();
            dt = post("single_btn", 1.0, req, 1.0, "xmin", xmin * f, "xmax", xmax * f, NULL);
            sgen0 = get("scope_gen");
            if(c == 1) { usleep(500000); post("single_btn", 1.0, req, 1.0, "xmin", xmin * f, "xmax", xmax * f, NULL); }
            if(c == 2) { usleep(500000); post(req, 0.0, NULL); }
            if(c == 3) { usleep(300000); post("lock_pidA_kp", 321.0, NULL); }
            run_traces(c == 4 ? 1.5 : 9.0, &st, 1);
            np = (st.ok > 0) ? trace_check(8e-9 * cur_dec(), unit_f(), &trig, &first_t, msg, sizeof(msg)) : 0;
            if(c == 2) {
                check(name[c], ring.rises == rises_before && st.ok == 0 && (!v2323 || lock_request_held_param() == 0),
                      "lock_now/launch 0->1 written %d times (expected 0), %d OK", ring.rises - rises_before, st.ok);
                continue;
            }
            check(name[c], st.ok >= 1 && np > 0 && st.bad == 0 && ring.pulses_lost == 0,
                  "POST %.3f s, OK after %.2f s, %d AGAIN, lock pulses %d (lost %d), request written %d times (%d with the trigger on), %s",
                  dt, st.t_ok, st.again, ring.pulses, ring.pulses_lost, ring.rises, ring.rises_trig_on,
                  st.ok ? (np > 0 ? "trace from the lock" : msg) : "NO capture");
            if(st.ok >= 1 && np > 0) {
                double uf = unit_f();
                check("   ... request applied with the trigger already enabled, POST answered at once, whole history before the lock",
                      ring.rises_trig_on == ring.rises && dt < 0.3 && fabs(first_t / uf - xmin) < 0.02 * (xmax - xmin),
                      "trigger on at the request %d/%d, POST %.3f s, first point %.4f s (xmin %.4f s)", ring.rises_trig_on,
                      ring.rises, dt, first_t / uf, xmin);
                if(v2323)
                    check("   ... sig_gen of the capture >= scope_gen of the arming POST", get("sig_gen") >= sgen0,
                          "sig_gen %g, scope_gen %g", get("sig_gen"), sgen0);
            }
        }
        post("lock_ctrl_aux_lock_now", 0.0, "lock_ctrl_aux_launch_lock_trig", 0.0, "trig_mode", 1.0, "lock_trig_sw", 2.0, NULL);
    }

    /* ---- 8. change of time units (Reset zoom from 0..20 ms to 0..2.94 s) */
    {
        double t_end, bad_t = NAN;
        int ok_units = 1, n = 0;
        post("trig_mode", 0.0, "trig_source", 0.0, NULL);
        post_window(0.0, 0.020, NULL, 0, NULL, 0, NULL, 0);
        usleep(200000);
        module_get(); module_get();         /* the module holds a trace in ms */
        float tu_ms = get("time_units");
        post_window(0.0, 2.94, NULL, 0, NULL, 0, NULL, 0);
        usleep(30000);
        t_end = now_s() + 0.4;
        while(now_s() < t_end) {
            int i;
            module_get();
            n++;
            for(i = 0; i < SIGNAL_LENGTH; i++)
                if(mod_sig[0][i] < -1e-6 || mod_sig[0][i] > 2.95) { ok_units = 0; bad_t = mod_sig[0][i]; }
        }
        check("8.1 units ms -> s: within 0.43 s no GET serves the old trace (x values in ms)", tu_ms == 1 && get("time_units") == 2 && ok_units,
              "units %g -> %g, %d GET, %s", tu_ms, get("time_units"), n, ok_units ? "all x in 0..2.94" : "x out of the window");
        if(!ok_units) printf("     first x out of the window: %g\n", bad_t);
    }
    post("trig_mode", 1.0, "lock_osc_raw_mode", 0.0, NULL);
    fpga_mode = 0;


only9:
    /* ================================================================ 9. v2.3.23: ramp + lock_ctrl.v model */
    {
        int i, nl0, nf0;
        double thr = 1.0, t_rel;            /* ramp period 3 s */
        fpga_mode = 1;
        ring_reset_model();
        pthread_mutex_lock(&ring.mx); ring.lockfsm = 1; pthread_mutex_unlock(&ring.mx);
        /* triangle -1000..1000, step 93749: 2*2000*93750*8 ns = 3 s; time trigger 1 s after the floor; PID only */
        post("lock_ramp_low_lim", -1000.0, "lock_ramp_hig_lim", 1000.0, "lock_ramp_step", 93749.0, "lock_ramp_sawtooth", 0.0,
             "lock_ramp_enable", 1.0, "lock_ctrl_aux_ramp_enable_ctrl", 1.0, "lock_ctrl_aux_set_ramp_enable", 0.0,
             "lock_ctrl_aux_trig_type", 1.0, "lock_lock_trig_time_val", thr / 8e-9, "lock_ctrl_aux_lock_now", 0.0,
             "lock_ctrl_aux_launch_lock_trig", 0.0, "trig_mode", 1.0, "lock_trig_sw", 2.0, NULL);
        usleep(4000000);                                     /* a floor or more: the ramp monitor follows it */
        /* 9.0 / 9.1 / 9.3: lock from outside (Python: lock_now in the register) 0.3 s after a floor, released 0.3 s
         * later, then Trigger Lock (time 1 s): from the page (POST release, POST request) or written directly */
        {
            int run;
            for(run = 0; run < 3; run++) {
                const char *nm[] = { "9.0 (old FPGA model) reproduces RP2: Trigger Lock (time 1 s) after releasing a lock closed 0.3 s after a floor fires mid-scan",
                                     "9.1 Trigger Lock (time 1 s) from the page right after releasing a lock closed 0.3 s after a floor: floor + 1 s, after a real floor",
                                     "9.3 the same written directly to lock_control (py/lock_from_registers.py): floor + 1 s, after a real floor" };
                int ok, floors = 0;
                double ph, dt;
                pthread_mutex_lock(&ring.mx); ring.old_fpga = (run == 0); pthread_mutex_unlock(&ring.mx);
                for(i = 0; i < 4000; i++) {
                    double phs;
                    pthread_mutex_lock(&ring.mx); phs = ring.phi; pthread_mutex_unlock(&ring.mx);
                    if(phs > 0.30 && phs < 0.32) break;
                    usleep(1000);
                }
                g_lock_reg->lock_control = g_lock_reg->lock_control | 1u;
                usleep(300000);
                get("lock_lock_status");                     /* the page reads the outside write (lock_now = 1) */
                nl0 = ring.nlock; nf0 = ring.nfloor;
                if(run < 2) {
                    post("lock_ctrl_aux_lock_now", 0.0, "lock_ctrl_aux_launch_lock_trig", 0.0, NULL);
                    usleep(5000);            /* the two POSTs of the page are ms apart (the model samples every 0.2 ms) */
                    t_rel = now_s();
                    post("lock_ctrl_aux_launch_lock_trig", 1.0, NULL);
                } else {
                    uint32_t lc = g_lock_reg->lock_control & ~3u;
                    g_lock_reg->lock_control = lc;               /* release */
                    usleep(5000);
                    t_rel = now_s();
                    g_lock_reg->lock_control = lc | 2u;          /* launch_lock (trig_type time in lc) */
                }
                while(now_s() - t_rel < 5.0 && ring.nlock < nl0 + 1) usleep(10000);
                ok = ring.nlock >= nl0 + 1;
                ph = ok ? ring.lock_phi[nl0] : -1; dt = ok ? ring.lock_t[nl0] - t_rel : -1;
                for(i = nf0; i < ring.nfloor; i++) if(ok && ring.floor_t[i] > t_rel && ring.floor_t[i] < ring.lock_t[nl0]) floors++;
                if(run == 0)
                    check(nm[run], ok && fabs(ph - thr) > 0.1 && floors == 0,
                          "lock %.2f s after the request at scan phase %.3f s (time %.3f s), %d floors in between", dt, ph, thr, floors);
                else
                    check(nm[run], ok && fabs(ph - thr) < 0.03 && floors >= 1,
                          "lock %s %.2f s after the request at scan phase %.3f s (expected %.3f s), %d floors in between",
                          ok ? "closed" : "NOT closed", dt, ph, thr, floors);
                if(run == 2) { g_lock_reg->lock_control = g_lock_reg->lock_control & ~3u; get("lock_lock_status"); }
                post("lock_ctrl_aux_launch_lock_trig", 0.0, "lock_ctrl_aux_lock_now", 0.0, NULL);
                usleep(1000000);                             /* the ramp runs again */
            }
            pthread_mutex_lock(&ring.mx); ring.old_fpga = 0; pthread_mutex_unlock(&ring.mx);
        }

        /* 9.2: Capture Lock (Level, never crosses: the capture waits), then a new request with the same window */
        {
            double xmin = -1.8, xmax = 4.2, f, t2, dt_apply = -1;
            int nr0;
            post("lock_ctrl_aux_trig_type", 2.0, NULL);
            post_window(xmin, xmax, "trig_mode", 2.0, "lock_trig_sw", 128.0, NULL, 0);
            f = unit_f();
            post("single_btn", 1.0, "lock_ctrl_aux_launch_lock_trig", 1.0, "xmin", xmin * f, "xmax", xmax * f, NULL);
            usleep(2500000);                                 /* history loaded, trigger enabled, request applied */
            {
                int k, nok = 0;
                char txt[200] = "";
                for(k = 0; k < 4; k++) {
                    post("lock_ctrl_aux_launch_lock_trig", 0.0, NULL);   /* new click: release ... */
                    usleep(5000 + k * 3000);
                    nr0 = ring.nrise;
                    t2 = now_s();
                    post("single_btn", 1.0, "lock_ctrl_aux_launch_lock_trig", 1.0, "xmin", xmin * f, "xmax", xmax * f, NULL);
                    while(now_s() - t2 < 6.0 && ring.nrise == nr0) { usleep(5000); get("lock_lock_status"); }   /* page polling */
                    dt_apply = (ring.nrise > nr0) ? ring.rise_t[nr0] - t2 : -1;
                    if(dt_apply >= 0 && dt_apply < 0.3) nok++;
                    snprintf(txt + strlen(txt), sizeof(txt) - strlen(txt), "%s%.3f", k ? ", " : "", dt_apply);
                }
                check("9.2 new Capture Lock request while the capture of the same window waits: applied at once (scope already armed), 4/4",
                      nok == 4, "request written %s s after the POST (-1: not in 6 s; 2.3.23-51: at its deadline, history + 3 s)", txt);
            }
            post("lock_ctrl_aux_launch_lock_trig", 0.0, "trig_mode", 1.0, "lock_trig_sw", 2.0, "lock_ctrl_aux_trig_type", 0.0, NULL);
        }
        pthread_mutex_lock(&ring.mx); ring.lockfsm = 0; pthread_mutex_unlock(&ring.mx);
        fpga_mode = 0;
    }

    fpga_run = 0;
    pthread_join(th, NULL);
    printf("%d OK, %d FAIL\n", oks, fails);
    _exit(fails ? 1 : 0);     /* no rp_app_exit(): it would look for streaming processes in /proc */
}
