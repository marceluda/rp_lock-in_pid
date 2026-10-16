`timescale 1ns / 1ps
// lock_in+pid v2.2.9: periods that Reset Zoom uses (index.html, resetZoomWindow()), measured on the RTL (port of
// test/ramp_mod_period_tb.v of lock_in+pid_harmonic v2.3.21):
//   gen_ramp.v : interval between ramp floor triggers (trigger_low) and between ceil triggers (trigger_hig). This
//                App has only the triangle (no sawtooth input), both directions. Expected 2*(hig-low)*(step+1).
//   gen_mod2.v : interval between harmonic_trig pulses, expected 2520*(hp+1) clock cycles; interval between the
//                rising edges of square_trig ("Square mod." trigger), expected 2*(sqp+1) for sqp > 0 and the
//                harmonic period 2520*(hp+1) for sqp = 0 (the square references follow the harmonic oscillator; the
//                pulse is then hp+1 clocks long, the scope triggers on its edge).
// Run with test/ramp_mod_period_sim.sh (Vivado 2020.1 xsim). Prints "TB RESULT: PASS" if all match.
module ramp_mod_period_tb;
    reg clk = 0, rst = 1;
    always #4 clk = ~clk;

    reg         [31:0] step;
    reg  signed [13:0] low, hig;
    reg                dir, enable, rreset;
    wire               t_low, t_hig;
    wire signed [13:0] outA, outB;

    gen_ramp #(.R(14)) dut_ramp (
        .clk(clk), .rst(rst),
        .ramp_step(step), .ramp_low_lim(low), .ramp_hig_lim(hig), .ramp_B_factor(14'd0),
        .ramp_reset(rreset), .ramp_enable(enable), .ramp_direction(dir),
        .relock_enable(1'b0), .out_of_lock(1'b0), .relock_reset(1'b0),
        .trigger_low(t_low), .trigger_hig(t_hig), .outA(outA), .outB(outB)
    );

    reg  [13:0] hp;
    reg  [31:0] sqp;
    wire        h_trig, s_trig;
    gen_mod2 dut_mod (
        .clk(clk), .rst(rst), .phase(12'd0), .phase_sq(32'd0), .hp(hp), .sqp(sqp),
        .sin_ref(), .cos_ref(), .cos_1f(), .cos_2f(), .cos_3f(), .cntu_w(),
        .sq_ref(), .sq_quad(), .sq_phas(), .harmonic_trig(h_trig), .square_trig(s_trig)
    );

    integer cyc = 0;
    always @(posedge clk) cyc <= cyc + 1;

    integer errors = 0, checks = 0;

    task measure_ramp(input integer exp, input [8*16-1:0] name);
        integer k, tl, th, pl, ph;
        begin
            pl = -1; ph = -1; tl = -1; th = -1;
            for(k = 0; k < 4 * exp + 100; k = k + 1) begin
                @(posedge clk); #1;
                if(t_low) begin if(tl >= 0) pl = cyc - tl; tl = cyc; end
                if(t_hig) begin if(th >= 0) ph = cyc - th; th = cyc; end
            end
            checks = checks + 1;
            if(pl != exp || ph != exp) begin
                errors = errors + 1;
                $display("FAIL %0s low=%0d hig=%0d step=%0d: floor period %0d, ceil period %0d, expected %0d",
                         name, low, hig, step, pl, ph, exp);
            end else
                $display("ok   %0s low=%0d hig=%0d step=%0d: floor/ceil period %0d cycles", name, low, hig, step, pl);
        end
    endtask

    task run_ramp(input integer l, input integer h, input integer s, input d);
        integer exp;
        begin
            rreset = 1; low = l; hig = h; step = s; dir = d; enable = 1;
            repeat(5) @(posedge clk);
            rreset = 0;
            exp = 2 * (h - l) * (s + 1);
            measure_ramp(exp, d ? "triangle dir 1" : "triangle dir 0");
        end
    endtask

    // period of the rising edges of sig (harmonic_trig is 1 clock long; square_trig with sqp = 0 is hp+1 long)
    task run_mod(input integer h, input integer s, input sel_sq);
        integer k, t, p, exp, n;
        reg last;
        begin
            hp = h; sqp = s; t = -1; p = -1; last = 0;
            exp = (sel_sq && s > 0) ? 2 * (s + 1) : 2520 * (h + 1);
            n = 3 * exp + 2 * 2520 * (h + 1) + 10;
            for(k = 0; k < n; k = k + 1) begin
                @(posedge clk); #1;
                if((sel_sq ? s_trig : h_trig) && !last) begin if(t >= 0) p = cyc - t; t = cyc; end
                last = (sel_sq ? s_trig : h_trig);
            end
            checks = checks + 1;
            if(p != exp) begin
                errors = errors + 1;
                $display("FAIL %0s hp=%0d sqp=%0d: period %0d, expected %0d", sel_sq ? "square  " : "harmonic", h, s, p, exp);
            end else
                $display("ok   %0s hp=%0d sqp=%0d: period %0d cycles", sel_sq ? "square  " : "harmonic", h, s, p);
        end
    endtask

    initial begin
        step = 0; low = 0; hig = 10; dir = 0; enable = 0; rreset = 1; hp = 0; sqp = 0;
        repeat(10) @(posedge clk);
        rst = 0;
        run_ramp(-100, 100, 0, 0);
        run_ramp(-100, 100, 3, 0);
        run_ramp(  -7,  50, 9, 1);
        run_ramp(-100, 100, 3, 1);
        run_mod(0, 0, 0);
        run_mod(1, 0, 0);
        run_mod(4, 0, 0);
        run_mod(0, 99, 0);      // harmonic period does not depend on sqp
        run_mod(0, 1, 1);
        run_mod(0, 3, 1);
        run_mod(2, 99, 1);      // square period does not depend on hp
        run_mod(0, 1249, 1);
        run_mod(0, 0, 1);       // sqp 0: harmonic period
        run_mod(2, 0, 1);
        $display("TB RESULT: %0s (%0d checks, %0d errors)", errors ? "FAIL" : "PASS", checks, errors);
        $finish;
    end
endmodule
