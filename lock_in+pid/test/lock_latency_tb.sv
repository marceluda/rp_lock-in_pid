`timescale 1ns / 1ps
// lock_latency_tb.sv (lock_in+pid v2.2.8, adapted from lock_in+pid_harmonic v2.3.19): the lock.v of this version (N) side by side with the one of a previous
// version (O, modules renamed with the prefix o_ by test/lock_latency_sim.sh), same bus writes. Checks that
// every signal of N is the one of O delayed by the documented latency (doc/lock_latency.md), bit by bit,
// and measures the latency of a step.
// The generator of N comes 1 clock later than the one of O, and its references reach the lock-in 1 clock later
// still (compensation of the output register): in the lock-in scenarios N gets in1/in2 2 clocks later (dly_in = 2).
// The generator of N comes 1 clock later than the one of O. In the scenarios with dly_in = 1, N also gets
// in1/in2 1 clock later (as in a real loop, where in1 is the response to the modulation of out1): then N
// must be exactly O delayed by 1 clock plus the registers added in v2.3.19. With dly_in = 0 (S3, PIDs on
// in1, and the step tests) only the paths that do not mix in1 with the generator are compared.
// Run with test/lock_latency_sim.sh (Vivado 2020.1 xsim). Prints "TB RESULT: PASS" or "TB RESULT: FAIL".
//
// Parts:
//   U1  sat14 (new, mask) vs o_sat14 (old, barrel shift): RES 64 and 15, random inputs, lim 0..80
//   S1  "lock mode" (lpf_F0 33, sg_amp0 5, error = Yo, PID A on error, PID B on F1o, out1/out2 = ctrl_A/B)
//   S2  both LPF bypassed, sg_amp 0..31 (saturation and wrap of the shift), PID A on Xo, PID B on F3o
//   S3  PIDs on in1 / in2, PSR/ISR/DSR/SAT/kd/ki swept (integrator saturation, sat14)
//   S4  modulation on (out1 = in1 + mod, out2 = mod), S4b the same without delaying in1 (modulation +2,
//       references +1: the modulation leaves 1 clock later with respect to the reference of the lock-in)
//   S5  level trigger of lock_ctrl on Xo: the lock comes 2 clocks later (3 with the delayed input)
//   S6  step response: first clock in which each output moves after a step of in1
module lock_latency_tb;

    reg clk = 1'b0;
    always #4 clk = ~clk;

    reg                rst = 1'b1;
    reg  signed [13:0] in1 = 14'sd0, in2 = 14'sd0;
    reg  signed [13:0] in1_d = 14'sd0, in2_d = 14'sd0;   // in1/in2 one clock later
    reg  signed [13:0] in1_dd = 14'sd0, in2_dd = 14'sd0; // in1/in2 two clocks later
    int                dly_in = 0;                       // N gets in1/in2 delayed dly_in clocks (0, 1 or 2)
    wire signed [13:0] n_in1 = (dly_in == 2) ? in1_dd : (dly_in == 1) ? in1_d : in1;
    wire signed [13:0] n_in2 = (dly_in == 2) ? in2_dd : (dly_in == 1) ? in2_d : in2;
    always @(posedge clk) begin in1_d <= in1; in2_d <= in2; in1_dd <= in1_d; in2_dd <= in2_d; end
    reg         [31:0] addr = 32'd0, wdata = 32'd0;
    reg                wen = 1'b0;

    wire signed [13:0] n_out1, n_out2, n_osc1, n_osc2, o_out1, o_out2, o_osc1, o_osc2;

    lock N (
        .clk(clk), .rst(rst), .in1(n_in1), .in2(n_in2), .external_trigger(1'b0),
        .out1(n_out1), .out2(n_out2), .osc1(n_osc1), .osc2(n_osc2),
        .trigger(), .digital_modulation(),
        .pwm_cfg_a(), .pwm_cfg_b(), .pwm_cfg_c(), .pwm_cfg_d(), .osc_ctrl(),
        .sys_addr(addr), .sys_wdata(wdata), .sys_sel(4'hF), .sys_wen(wen), .sys_ren(1'b0),
        .sys_rdata(), .sys_err(), .sys_ack()
    );

    o_lock O (
        .clk(clk), .rst(rst), .in1(in1), .in2(in2), .external_trigger(1'b0),
        .out1(o_out1), .out2(o_out2), .osc1(o_osc1), .osc2(o_osc2),
        .trigger(), .digital_modulation(),
        .pwm_cfg_a(), .pwm_cfg_b(), .pwm_cfg_c(), .pwm_cfg_d(), .osc_ctrl(),
        .sys_addr(addr), .sys_wdata(wdata), .sys_sel(4'hF), .sys_wen(wen), .sys_ren(1'b0),
        .sys_rdata(), .sys_err(), .sys_ack()
    );

    // ---------------------------------------------------------------- signals compared
    localparam NS = 21;
    localparam MAXC = 160000;
    string names [NS] = '{"Xo","Yo","F1o","F2o","F3o","pidA_out_cache","pidB_out_cache","pidA_out","pidB_out",
                          "error","out1","out2","osc1","osc2","lock_ctrl_signal","X_28","ctrl_A","lock_status",
                          "cos_ref","harmonic_trig","sqXo"};
    int hn [NS][];
    int ho [NS][];
    int cyc = 0;
    bit rec = 0;

    initial begin
        for (int k = 0; k < NS; k++) begin hn[k] = new[MAXC]; ho[k] = new[MAXC]; end
    end

    always @(posedge clk) if (rec) begin
        #1;
        if (cyc < MAXC) begin
            hn[0][cyc]  = N.Xo;              ho[0][cyc]  = O.Xo;
            hn[1][cyc]  = N.Yo;              ho[1][cyc]  = O.Yo;
            hn[2][cyc]  = N.F1o;             ho[2][cyc]  = O.F1o;
            hn[3][cyc]  = N.F2o;             ho[3][cyc]  = O.F2o;
            hn[4][cyc]  = N.F3o;             ho[4][cyc]  = O.F3o;
            hn[5][cyc]  = N.pidA_out_cache;  ho[5][cyc]  = O.pidA_out_cache;
            hn[6][cyc]  = N.pidB_out_cache;  ho[6][cyc]  = O.pidB_out_cache;
            hn[7][cyc]  = N.pidA_out;        ho[7][cyc]  = O.pidA_out;
            hn[8][cyc]  = N.pidB_out;        ho[8][cyc]  = O.pidB_out;
            hn[9][cyc]  = N.error;           ho[9][cyc]  = O.error;
            hn[10][cyc] = n_out1;            ho[10][cyc] = o_out1;
            hn[11][cyc] = n_out2;            ho[11][cyc] = o_out2;
            hn[12][cyc] = n_osc1;            ho[12][cyc] = o_osc1;
            hn[13][cyc] = n_osc2;            ho[13][cyc] = o_osc2;
            hn[14][cyc] = N.lock_ctrl_signal; ho[14][cyc] = O.lock_ctrl_signal;
            hn[15][cyc] = N.X_28;            ho[15][cyc] = O.X_28;
            hn[16][cyc] = N.ctrl_A;          ho[16][cyc] = O.ctrl_A;
            hn[17][cyc] = N.lock_status;     ho[17][cyc] = O.lock_status;
            hn[18][cyc] = N.cos_ref;         ho[18][cyc] = O.cos_ref;
            hn[19][cyc] = N.harmonic_trig;   ho[19][cyc] = O.harmonic_trig;
            hn[20][cyc] = N.sqXo;            ho[20][cyc] = O.sqXo;
        end
        cyc++;
    end

    int fails = 0;
    int checks = 0;

    // compare N[t] with O[t-L] for t in [t0, cyc-1]; L < 0: not compared
    task automatic compare(input string scen, input int L [NS], input int t0);
        for (int k = 0; k < NS; k++) begin
            int bad = 0, first = -1, nchg = 0;
            if (L[k] < 0) continue;
            for (int t = t0; t < cyc && t < MAXC; t++) begin
                if (hn[k][t] !== ho[k][t-L[k]]) begin bad++; if (first < 0) first = t; end
                if (t > t0 && ho[k][t-L[k]] != ho[k][t-L[k]-1]) nchg++;
            end
            checks++;
            if (bad) begin
                fails++;
                $display("FAIL %s %-16s latency %0d: %0d of %0d clocks differ, first at %0d (new %0d, old %0d)",
                         scen, names[k], L[k], bad, cyc - t0, first, hn[k][first], ho[k][first-L[k]]);
            end else
                $display("ok   %s %-16s = old delayed %0d clock(s) (%0d ns), %0d clocks, %0d changes",
                         scen, names[k], L[k], 8*L[k], cyc - t0, nchg);
        end
    endtask

    // ---------------------------------------------------------------- bus and stimulus
    task automatic wr(input [31:0] a, input [31:0] d);
        @(negedge clk); addr = a; wdata = d; wen = 1'b1;
        @(negedge clk); wen = 1'b0;
    endtask

    bit stim_on = 0;
    real A1 = 3000.0, A2 = 1500.0, NOISE = 200.0, P1 = 2520.0, P2 = 97000.0;
    int  t_stim = 0;
    reg [31:0] lfsr = 32'hACE1_2345;
    function automatic int clamp14(input real v);
        if (v >  8191.0) return  8191;
        if (v < -8192.0) return -8192;
        return $rtoi(v);
    endfunction
    // the inputs change at the rising edge, like the ADC registers of red_pitaya_top.sv (adc_dat)
    bit step_on = 0;
    always @(posedge clk) begin
        lfsr = {lfsr[30:0], lfsr[31]^lfsr[21]^lfsr[1]^lfsr[0]};
        if (step_on) begin
            in1 <= 14'sd6000; in2 <= 14'sd0;
        end else if (stim_on) begin
            real s, nz;
            nz  = (real'(lfsr[11:0]) / 4096.0 - 0.5) * 2.0 * NOISE;
            s   = A1*$sin(6.283185307*t_stim/P1) + A2*$sin(6.283185307*t_stim/P2 + 1.0) + nz;
            in1 <= clamp14(s);
            in2 <= clamp14(0.5*s + 0.7*A1*$cos(6.283185307*t_stim/(P1/2.0)) - nz);
            t_stim++;
        end else begin
            in1 <= 14'sd0; in2 <= 14'sd0;
        end
    end

    // reset both, keep the inputs at 0 while configuring (the LPFs stay at 0), then start
    task automatic start_scen();
        stim_on = 0; rec = 0;
        @(negedge clk); rst = 1'b1;
        repeat (5) @(negedge clk);
        rst = 1'b0;
        repeat (3) @(negedge clk);
    endtask
    task automatic run(input int n);
        t_stim = 0; cyc = 0; rec = 1; stim_on = 1;
        repeat (n) @(posedge clk);
        @(negedge clk); rec = 0; stim_on = 0;
    endtask

    // register addresses
    // lock_in+pid: X, Y and F1 share lpf_F1 and sg_amp1 (F0 / SG0 below); F1 / SG1 are the square lock-in
    // (lpf_sq, sg_amp_sq); no modulation on the outputs (MOD1/MOD2: an address not decoded)
    localparam OSCA=32'h00, OSCB=32'h04, OUT1=32'h10, OUT2=32'h14, LCTRL=32'h28, TVAL=32'h30, TSW=32'h38,
               SIGSW=32'h5C, SG0=32'h64, SG1=32'h70, SG2=32'h68, SG3=32'h6C,
               F0=32'h74, F1=32'h80, F2=32'h78, F3=32'h7C, ERRSW=32'h84, MOD1=32'hFFF00, MOD2=32'hFFF04, HP=32'hA0, SQP=32'hA4,
               ASW=32'h14C, APSR=32'h150, AISR=32'h154, ADSR=32'h158, ASAT=32'h15C, ASP=32'h160, AKP=32'h164, AKI=32'h168, AKD=32'h16C,
               BSW=32'h180, BPSR=32'h184, BISR=32'h188, BDSR=32'h18C, BSAT=32'h190, BSP=32'h194, BKP=32'h198, BKI=32'h19C, BKD=32'h1A0;

    // ---------------------------------------------------------------- U1, U2: unit equivalences
    reg  signed [63:0] u64;  reg [63:0] l64;  wire signed [63:0] s64n, s64o;
    reg  signed [14:0] u15;  reg [14:0] l15;  wire signed [14:0] s15n, s15o;
    sat14   #(.RES(64)) u_n64 (.in(u64), .lim(l64), .out(s64n));
    o_sat14 #(.RES(64)) u_o64 (.in(u64), .lim(l64), .out(s64o));
    sat14   #(.RES(15)) u_n15 (.in(u15), .lim(l15), .out(s15n));
    o_sat14 #(.RES(15)) u_o15 (.in(u15), .lim(l15), .out(s15o));

    function automatic logic [63:0] rnd_mag(input int width);   // random value with a random number of significant bits
        int b; logic [63:0] v;
        b = $urandom_range(width-1, 0);
        v = {$urandom, $urandom};
        v = v & ((64'd1 << b) - 1);
        if ($urandom_range(1,0)) v = ~v;               // negative: leading ones
        return v;
    endfunction

    task automatic unit_tests();
        int bad;
        bad = 0;
        for (int i = 0; i < 200000; i++) begin
            u64 = rnd_mag(64); l64 = $urandom_range(80, 0);
            u15 = rnd_mag(15); l15 = $urandom_range(20, 0);
            #1;
            if (s64n !== s64o) begin bad++; if (bad < 4) $display("U1 RES64 in %0d lim %0d new %0d old %0d", u64, l64, s64n, s64o); end
            if (s15n !== s15o) begin bad++; if (bad < 4) $display("U1 RES15 in %0d lim %0d new %0d old %0d", u15, l15, s15n, s15o); end
        end
        checks++; if (bad) begin fails++; $display("FAIL U1 sat14: %0d differences", bad); end
        else $display("ok   U1 sat14 (mask) = old sat14 (barrel shift): 2 x 200000 random vectors, lim 0..80 / 0..20");
    endtask

    // ---------------------------------------------------------------- scenarios
    int L [NS];
    // x: Xo..F3o, pa/pb: PID A/B (cache and gated), err: error, o1/o2: out1/out2, s1/s2: osc1/osc2,
    // sig: signal of lock_ctrl, x28: X_28 (bus), ca: ctrl_A, stat: lock_status; cos_ref and harmonic_trig: 1
    task automatic setL(input int x, input int pa, input int pb, input int err, input int o1, input int o2,
                        input int s1, input int s2, input int sig, input int x28, input int ca, input int stat);
        L = '{x, x, x, x, x, pa, pb, pa, pb, err, o1, o2, s1, s2, sig, x28, ca, stat, 1, 1, x};
    endtask

    task automatic config_lockin(input int f0, input int f1, input int f2, input int f3,
                                 input int g0, input int g1, input int g2, input int g3);
        wr(SIGSW, 0); wr(F0, f0); wr(F1, f1); wr(F2, f2); wr(F3, f3);
        wr(SG0, g0); wr(SG1, g1); wr(SG2, g2); wr(SG3, g3); wr(HP, 0); wr(SQP, 777);   // square modulation on
    endtask

    int t_lock_n, t_lock_o;

    initial begin
        $display("lock_latency_tb: new lock.v (N) vs old lock.v (O)");
        unit_tests();

        // S1 lock mode ----------------------------------------------------------------------
        start_scen();
        config_lockin(33, 32, 16+3, 48+2, 5, 3, 7, 15);
        wr(ERRSW, 2);                                              // error = Xo (lock_in+pid)
        wr(ASW, 0); wr(AKP, -250 & 16'h3FFF); wr(AKI, -20 & 16'h3FFF); wr(APSR, 3); wr(AISR, 8); wr(ASAT, 13);
        // DSR 0: with DSR > 0 the D term is sampled every 2^n clocks by a counter that runs from the reset, so
        // a delayed input is sampled at other points (not a plain delay; S3 checks DSR > 0 with an undelayed input)
        wr(BSW, 3); wr(BKP, 100); wr(BKI, 5); wr(BKD, 50); wr(BPSR, 2); wr(BISR, 5); wr(BDSR, 0); wr(BSAT, 10);
        wr(OUT1, 12); wr(OUT2, 13); wr(MOD1, 14'h3FFF); wr(MOD2, 14'h3FFF);      // ctrl_A / ctrl_B, modulation off
        wr(OSCA, 22); wr(OSCB, 10); wr(TSW, 1); wr(LCTRL, 12);    // scope Xo / pidA_out_cache, trigger signal Xo, PIDs on
        repeat (5) @(negedge clk);
        A1 = 3000.0; A2 = 1500.0; NOISE = 200.0;
        dly_in = 2;
        run(150000);
        setL(4, 5, 5, 4, 6, 6, 4, 5, 4, 3, 5, 0);
        compare("S1", L, 20);

        // S2 bypass, sg_amp sweep -----------------------------------------------------------
        for (int g = 0; g < 32; g += 3) begin
            start_scen();
            config_lockin(0, 0, 0, 0, g, g % 16, (g+5) % 16, (g+11) % 16);
            wr(ERRSW, 2);
            wr(ASW, 1); wr(AKP, 1000); wr(AKI, 3); wr(APSR, 0); wr(AISR, 2); wr(ASAT, 13);
            wr(BSW, 5); wr(BKP, -2000); wr(BKI, -1); wr(BKD, 300); wr(BPSR, 1); wr(BISR, 0); wr(BDSR, 0); wr(BSAT, 12);
            wr(OUT1, 12); wr(OUT2, 13); wr(MOD1, 14'h3FFF); wr(MOD2, 14'h3FFF);
            wr(OSCA, 23); wr(OSCB, 26); wr(TSW, 4); wr(LCTRL, 12);
            repeat (5) @(negedge clk);
            A1 = 7000.0; A2 = 1000.0; NOISE = 1500.0;
            dly_in = 2;
            run(8000);
            setL(4, 5, 5, 4, 6, 6, 4, 4, 4, 3, 5, 0);
            compare($sformatf("S2 sg%0d", g), L, 20);
        end

        // S3 PIDs on in1 / in2 ----------------------------------------------------------------
        for (int j = 0; j < 10; j++) begin
            start_scen();
            config_lockin(33, 32, 32, 32, 5, 0, 0, 0);
            wr(ERRSW, 1);                                          // error = in1
            wr(ASW, 22); wr(AKP, 3000 - 700*j); wr(AKI, 200 + 50*j); wr(AKD, 1000); wr(APSR, j % 5); wr(AISR, j); wr(ADSR, j % 6); wr(ASAT, 13 - j);
            wr(BSW, 23); wr(BKP, -1500); wr(BKI, -(30*j+1) & 16'h3FFF); wr(BKD, 0); wr(BPSR, (j+2) % 5); wr(BISR, 9 - j); wr(BDSR, 0); wr(BSAT, 4 + j);
            wr(ASP, 100*j); wr(BSP, -50*j & 16'h3FFF);
            wr(OUT1, 12); wr(OUT2, 13); wr(MOD1, 14'h3FFF); wr(MOD2, 14'h3FFF);
            wr(OSCA, 4); wr(OSCB, 11); wr(TSW, 15); wr(LCTRL, 12);
            repeat (5) @(negedge clk);
            A1 = 2500.0; A2 = 3000.0; NOISE = 300.0;
            dly_in = 0;
            run(12000);
            setL(-1, 1, 1, 0, 2, 2, 1, 1, 1, -1, 1, 0);
            compare($sformatf("S3 j%0d", j), L, 20);
        end

        // S4 modulation ---------------------------------------------------------------------
        start_scen();
        config_lockin(33, 32, 32, 32, 5, 0, 0, 0);
        // lock_in+pid: no modulation added to the outputs; out1 = cos_1f, out2 = sq_ref (generator: +1, output: +1)
        wr(OUT1, 5); wr(OUT2, 8);
        wr(OSCA, 13); wr(OSCB, 20); wr(LCTRL, 0);
        repeat (5) @(negedge clk);
        A1 = 3000.0; A2 = 1500.0; NOISE = 200.0;
        dly_in = 1;
        run(10000);
        setL(-1, -1, -1, -1, 2, 2, 1, 1, -1, -1, -1, 0);
        compare("S4", L, 20);
        // S4b: in1 not delayed: the modulation alone (out2 = 0 + mod) comes 2 clocks later, the references 1
        start_scen();
        config_lockin(33, 32, 32, 32, 5, 0, 0, 0);
        wr(OUT1, 5); wr(OUT2, 8);
        wr(OSCA, 13); wr(OSCB, 20); wr(LCTRL, 0);
        repeat (5) @(negedge clk);
        dly_in = 0;
        run(10000);
        setL(-1, -1, -1, -1, 2, 2, 1, 1, -1, -1, -1, 0);
        compare("S4b", L, 20);

        // S5 level trigger on Xo -------------------------------------------------------------
        start_scen();
        config_lockin(0, 0, 0, 0, 2, 0, 0, 0);
        wr(TSW, 1); wr(TVAL, 3000);
        wr(LCTRL, (1<<10) | (2<<8) | (1<<6));                      // level, rising, PID A on when locked
        repeat (5) @(negedge clk);
        A1 = 3000.0; A2 = 1500.0; NOISE = 200.0;
        dly_in = 2;
        t_stim = 0; cyc = 0; rec = 1; stim_on = 1;
        repeat (2000) @(negedge clk);
        wr(LCTRL, (1<<10) | (2<<8) | (1<<6) | 2);                  // arm
        repeat (18000) @(negedge clk);
        rec = 0; stim_on = 0;
        t_lock_n = -1; t_lock_o = -1;
        for (int t = 1; t < cyc; t++) begin
            if (t_lock_n < 0 && ((hn[17][t] >> 1) & 1) && !((hn[17][t-1] >> 1) & 1)) t_lock_n = t;
            if (t_lock_o < 0 && ((ho[17][t] >> 1) & 1) && !((ho[17][t-1] >> 1) & 1)) t_lock_o = t;
        end
        checks++;
        if (t_lock_o < 0 || t_lock_n != t_lock_o + 4) begin
            fails++; $display("FAIL S5 level trigger on Xo: locked at clock %0d (old %0d), expected old + 4", t_lock_n, t_lock_o);
        end else
            $display("ok   S5 level trigger on Xo: locked at clock %0d, old at %0d (+4 = 2 of the delayed input + 2 of Xo)", t_lock_n, t_lock_o);
        setL(4, -1, -1, -1, -1, -1, -1, -1, 4, 3, -1, -1);         // PIDs and status change with the lock (checked above)
        compare("S5", L, 20);

        // S6 step response -------------------------------------------------------------------
        // dly 2: N gets the step 2 clocks later (its references reach the lock-in 2 clocks later); the difference
        // printed is the one of the chain (N - O - 2)
        step_test("Xo, LPF bypassed (F0 0), in1 step", 0, 0, 0, 22, 2);
        step_test("Xo, LPF on (F0 33)", 33, 5, 0, 22, 2);
        step_test("pidA_out (PID A on in1, kp only)", 0, 0, 1, 22, 0);
        step_test("pidA_out (PID A on Xo, kp only)", 0, 0, 1, 1, 2);
        step_test("out1 = ctrl_A (PID A on Xo)", 0, 0, 2, 1, 2);
        step_test("out1 = ctrl_A (PID A on in1)", 0, 0, 2, 22, 0);
        step_test("out1 = in1", 0, 0, 3, 1, 0);

        $display("checks %0d, fails %0d", checks, fails);
        if (fails == 0) $display("TB RESULT: PASS"); else $display("TB RESULT: FAIL");
        $finish;
    end

    // first clock after the step in which the observed signal changes (N and O)
    task automatic step_test(input string what, input int f0, input int g0, input int obs, input int asw, input int dly);
        int k, tn, to;
        start_scen();
        dly_in = dly;
        config_lockin(f0, 32, 32, 32, g0, 0, 0, 0);
        wr(ASW, asw); wr(AKP, 4000); wr(AKI, 0); wr(AKD, 0); wr(APSR, 0); wr(AISR, 8); wr(ASAT, 13);
        wr(OUT1, (obs == 3) ? 1 : 12); wr(MOD1, 14'h3FFF); wr(LCTRL, 8);
        repeat (300) @(negedge clk);
        k = (obs == 0) ? 0 : (obs == 1) ? 7 : 10;
        // constant input 0 for 100 clocks, then the step (in1 = 6000 from clock 100 on)
        cyc = 0; rec = 1;
        repeat (100) @(negedge clk);
        step_on = 1;
        repeat (400) @(negedge clk);
        rec = 0; step_on = 0;
        tn = -1; to = -1;
        for (int t = 1; t < cyc; t++) begin
            if (tn < 0 && hn[k][t] != hn[k][t-1]) tn = t;
            if (to < 0 && ho[k][t] != ho[k][t-1]) to = t;
        end
        // in1 = 6000 from the record index 100 on
        $display("step %-36s: first change %0d clocks after in1 (old %0d): +%0d clocks = %0d ns",
                 what, tn - 100 - dly, to - 100, tn - to - dly, 8*(tn - to - dly));
    endtask

endmodule
