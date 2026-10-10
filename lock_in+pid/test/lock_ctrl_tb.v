`timescale 1ns / 1ps
// Testbench of fpga/prj/v0.94/rtl/lock/lock_ctrl.v (v2.3.13 lock control state machine; v2.3.15: 32-bit
// time trigger, cases 14-15).
// Run with test/lock_ctrl_sim.sh (Vivado 2020.1 xsim). Prints "TB RESULT: PASS" or "TB RESULT: FAIL".
//
// The "PS" side only writes lock_control (as Python or the C controller would) and reads lock_status:
// nothing is ever copied back from the status to lock_control.

module lock_ctrl_tb;

    reg clk = 1'b0;
    reg rst = 1'b1;
    always #4 clk = ~clk;   // 125 MHz

    reg         [11-1:0] lock_control = 11'd1148;   // reset value of lock.v
    reg         [32-1:0] time_threshold = 32'd0;
    reg  signed [14-1:0] level_threshold = 14'd0;
    reg  signed [14-1:0] signal = 14'd0;
    reg                  ramp_trigger = 1'b0;

    wire ramp_enable, pidA_enable, pidB_enable, lock_ctrl_trig;
    wire [16-1:0] lock_status;

    lock_ctrl dut (
        .clk(clk), .rst(rst),
        .lock_ctrl            ( lock_control[9:0] ),
        .signal               ( signal            ),
        .ramp_trigger         ( ramp_trigger      ),
        .time_threshold       ( time_threshold    ),
        .level_threshold      ( level_threshold   ),
        .level_rising_trigger ( lock_control[10]  ),
        .ramp_enable          ( ramp_enable       ),
        .pidA_enable          ( pidA_enable       ),
        .pidB_enable          ( pidB_enable       ),
        .lock_ctrl_trig       ( lock_ctrl_trig    ),
        .lock_status          ( lock_status       )
    );

    // ---- stimulus generators -------------------------------------------------------------
    // "ramp": period RAMP_P clocks, ramp_trigger (ramp floor) one clock at phase 0, like gen_ramp
    integer RAMP_P = 1000;
    integer phase  = 0;
    integer sig_mode = 0;   // 0: sawtooth -500..499 over one period, 1: two teeth per period, 2: constant 0
    integer cycle = 0;
    integer last_floor = 0;
    always @(posedge clk) begin
        cycle <= cycle + 1;
        if (rst) begin
            phase        <= 0;
            ramp_trigger <= 1'b0;
        end else begin
            phase        <= (phase == RAMP_P-1) ? 0 : phase + 1;
            ramp_trigger <= (phase == RAMP_P-1);
            if (phase == RAMP_P-1) last_floor <= cycle + 1;   // cycle in which ramp_trigger is high
        end
        case (sig_mode)
            0: signal <= phase - 500;
            1: signal <= (phase % 500) - 250;
            default: signal <= 14'd0;
        endcase
    end

    // count lock_ctrl_trig pulses and remember when/at which signal the lock happened
    integer trig_pulses = 0;
    integer lock_cycle = -1;
    integer lock_phase = -1;
    integer lock_sig_now = 0, lock_sig_last = 0;
    reg locked_q = 1'b0;
    always @(posedge clk) begin
        if (lock_ctrl_trig) trig_pulses <= trig_pulses + 1;
        locked_q <= lock_status[1];
        if (lock_status[1] & ~locked_q) begin
            lock_cycle    <= cycle;
            lock_phase    <= phase;
        end
        if (dut.enter_lock) begin            // values seen by the trigger logic in the locking clock
            lock_sig_now  <= dut.sig_trig_now;    // v2.2.6 (lock_in+pid): pair compared by the registered comparators
            lock_sig_last <= dut.sig_trig_last;
        end
    end

    // ---- helpers -----------------------------------------------------------------------------
    integer errors = 0;
    integer checks = 0;

    task check(input cond, input [8*96-1:0] msg);
        begin
            checks = checks + 1;
            if (cond) $display("  ok   %0s", msg);
            else begin
                errors = errors + 1;
                $display("  FAIL %0s  (status=0x%04h ctrl=0x%03h en r/A/B=%b%b%b t=%0t)",
                         msg, lock_status, lock_control, ramp_enable, pidA_enable, pidB_enable, $time);
            end
        end
    endtask

    task wr(input [11-1:0] v);   // bus write of lock_control (synchronous, like lock.v)
        begin
            @(posedge clk); #1 lock_control = v;
        end
    endtask

    task wait_clk(input integer n);
        integer i;
        begin
            for (i = 0; i < n; i = i + 1) @(posedge clk);
            #1;
        end
    endtask

    // lock_control fields
    function [11-1:0] ctrl;
        input now, launch, man_ramp, man_A, man_B, set_ramp, set_A, set_B;
        input [1:0] ttype;
        input rise;
        ctrl = {rise, ttype, set_ramp, set_A, set_B, man_ramp, man_A, man_B, launch, now};
    endfunction

    wire armed  = lock_status[0];
    wire locked = lock_status[1];
    wire [7:0] lock_count = lock_status[15:8];
    wire [2:0] eff = {ramp_enable, pidA_enable, pidB_enable};

    integer n0, p0, c0;

    initial begin
        $display("=== lock_ctrl testbench (v2.3.13) ===");
        wait_clk(5);
        rst = 1'b0;
        wait_clk(3);

        // 1. reset state ------------------------------------------------------------------
        $display("1. reset value 1148: IDLE, manual enables 1/1/1");
        check(lock_status == 16'h001C, "status after reset = 0x001C (idle, enables r/A/B = 1/1/1)");

        // 2. scan configuration (time trigger configured, not armed) ------------------------
        $display("2. scan state: ramp on, PIDs off, set_* = PID A + PID B, time trigger at 300");
        time_threshold = 300;
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2);
        check(eff == 3'b100 && !armed && !locked, "IDLE, effective = manual (ramp only)");
        wait_clk(3*RAMP_P);
        check(!locked && lock_count == 0, "no lock without a request (3 ramp periods)");

        // 3. arm: time trigger --------------------------------------------------------------
        $display("3. Trigger Lock (bit 1) with time trigger");
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2);
        check(armed && !locked && eff == 3'b100, "ARMED, enables still manual");
        n0 = trig_pulses;
        wait(locked); wait_clk(2);
        check(locked && !armed, "LOCKED by the time trigger, without any write");
        check(eff == 3'b011, "effective enables = set_* (ramp off, PID A on, PID B on)");
        $display("   time trigger: lock %0d clocks after the floor", lock_cycle - last_floor);
        check(lock_cycle - last_floor >= 300 && lock_cycle - last_floor <= 302,
              "lock 300(+2) clocks after the ramp floor trigger");
        check(trig_pulses == n0 + 1, "one lock_ctrl_trig pulse");
        check(lock_count == 1, "lock_count = 1");
        check(lock_control == ctrl(0,1, 1,0,0, 0,1,1, 2'd1, 0), "lock_control unchanged by the FPGA");

        // 4. hold: no write back, and rewriting the same value (as the C controller does) ----
        $display("4. stays locked: 5 ramp periods, same lock_control rewritten 5 times");
        wait_clk(5*RAMP_P);
        repeat (5) wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2*RAMP_P);
        check(locked && eff == 3'b011 && lock_count == 1 && trig_pulses == n0 + 1,
              "still LOCKED, count 1, no new trigger pulse");

        // 5. set_* are live while locked ------------------------------------------------------
        $display("5. set_pidB 1->0 while locked");
        wr(ctrl(0,1, 1,0,0, 0,1,0, 2'd1, 0));
        wait_clk(2);
        check(locked && eff == 3'b010, "PID B off, still LOCKED");
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2);

        // 6. release with [1:0] = 00 ---------------------------------------------------------
        $display("6. release: bits [1:0] = 00");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2);
        check(!locked && !armed && eff == 3'b100, "IDLE, back to the manual enables (scan)");

        // 7. level trigger, rising --------------------------------------------------------------
        $display("7. level trigger, rising, threshold 100 (sawtooth -500..499)");
        level_threshold = 100;
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd2, 1));
        wait_clk(2);
        check(armed, "ARMED");
        wait(locked); wait_clk(2);
        check(lock_sig_last < 100 && lock_sig_now >= 100, "locked on the rising crossing of 100");
        check(eff == 3'b011 && lock_count == 2, "set_* enabled, count 2");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd2, 1));
        wait_clk(2);

        // 8. level trigger, falling (two teeth per period, threshold 100) ---------------------
        $display("8. level trigger, falling, threshold -100 (descending signal)");
        sig_mode = 1;
        level_threshold = -100;
        // a falling crossing only exists at the end of each tooth: (phase%500)-250 jumps 249 -> -250
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd2, 0));
        wait_clk(2);
        wait(locked); wait_clk(2);
        check(lock_sig_last >= -100 && lock_sig_now < -100, "locked on the falling crossing of -100");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd2, 0));
        wait_clk(2);

        // 9. level + time: crossing before the time is ignored ----------------------------------
        $display("9. level+time: two rising crossings of 100 per period (phase 350, 850), time 600");
        level_threshold = 100;
        time_threshold  = 600;
        wait(phase == 10);   // arm at the beginning of a period
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd3, 1));
        wait(locked); wait_clk(2);
        $display("   level+time: lock %0d clocks after the floor", lock_cycle - last_floor);
        // v2.2.6 (lock_in+pid): the level comparison is registered (+1 clock): 850..854 (was 850..853)
        check(lock_cycle - last_floor >= 850 && lock_cycle - last_floor <= 854,
              "locked on the crossing at phase ~850, not at ~350");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd3, 1));
        wait_clk(2);
        sig_mode = 0;

        // 10. lock now ---------------------------------------------------------------------------
        $display("10. Lock Now (bit 0), trigger type OFF");
        c0 = lock_count;
        wr(ctrl(1,0, 1,0,0, 0,1,1, 2'd0, 0));
        wait_clk(2);
        check(locked && eff == 3'b011 && lock_count == c0 + 1, "LOCKED immediately");
        wait_clk(3*RAMP_P);
        check(locked, "still LOCKED after 3 ramp periods");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd0, 0));
        wait_clk(2);
        check(!locked && eff == 3'b100, "Lock Now released -> IDLE");

        // 11. manual override while locked -----------------------------------------------------
        $display("11. manual override: manual PID B bit changed while locked (bit 1 still set)");
        time_threshold = 300;
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd1, 0));
        wait(locked); wait_clk(2);
        wr(ctrl(0,1, 1,0,1, 0,1,1, 2'd1, 0));
        wait_clk(2);
        check(!locked && !armed && eff == 3'b101, "IDLE with the new manual enables");
        c0 = lock_count;
        wait_clk(3*RAMP_P);
        check(!locked && lock_count == c0, "no relock while bit 1 stays set (needs a new 0->1 edge)");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd1, 0));
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd1, 0));
        wait(locked); wait_clk(2);
        check(locked && lock_count == c0 + 1, "re-armed with a new edge and locked again");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2);

        // 12. armed with trigger OFF never locks -------------------------------------------------
        $display("12. Trigger Lock with trigger type OFF");
        c0 = lock_count;
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd0, 0));
        wait_clk(3*RAMP_P);
        check(armed && !locked && lock_count == c0, "ARMED forever, no lock");
        wr(ctrl(1,1, 1,0,0, 0,1,1, 2'd0, 0));
        wait_clk(2);
        check(locked, "Lock Now while armed -> LOCKED");
        wr(ctrl(1,0, 1,0,0, 0,1,1, 2'd0, 0));
        wait_clk(2);
        check(locked, "clearing only bit 1 keeps the lock (bit 0 still set)");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd0, 0));
        wait_clk(2);
        check(!locked && !armed, "both bits 0 -> IDLE");

        // 13. manual enables in IDLE act directly --------------------------------------------------
        $display("13. manual enables in IDLE");
        wr(ctrl(0,0, 0,1,1, 0,1,1, 2'd0, 0));
        wait_clk(2);
        check(eff == 3'b011 && !locked, "manual PID A + PID B on, ramp off");
        wr(ctrl(0,0, 0,0,0, 0,1,1, 2'd0, 0));
        wait_clk(2);
        check(eff == 3'b000, "everything off (\"Don't turn on PIDs and Ramp\")");

        // 14. time threshold >= 2**31 (v2.3.15: 32-bit counter and comparator) --------------------
        //     The counter is set directly (dut.cnt) to avoid simulating 2**31 clocks. With the 31-bit
        //     comparator of v2.3.13/14 the threshold 2**31+200 aliased to 200.
        $display("14. time trigger at 2**31 + 200 (no aliasing to 200)");
        RAMP_P = 2000000000;                     // no more ramp floors: the counter is not reset
        time_threshold = 32'h8000_00C8;          // 2**31 + 200
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2);
        dut.cnt = 32'd0;
        c0 = lock_count;
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2000);
        check(armed && !locked && lock_count == c0, "ARMED, no lock when cnt passes 200 (alias of 2**31+200)");
        dut.cnt = 32'h8000_0000 + 32'd100;       // 100 clocks before the threshold
        n0 = cycle;
        wait(locked); wait_clk(2);
        check(lock_cycle - n0 >= 99 && lock_cycle - n0 <= 104,
              "LOCKED when cnt reaches 2**31 + 200 (~100 clocks after setting it to 2**31 + 100)");
        check(lock_count == c0 + 1, "lock_count + 1");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd1, 0));
        wait_clk(2);

        // 15. level + time with a time threshold >= 2**31 -------------------------------------------
        //     sig_mode 0 with no ramp floors: the signal rises 1 count per clock and wraps every 16384
        //     clocks, so there is a rising crossing of 100 every 16384 clocks.
        $display("15. level+time, time 2**31 + 200: crossings ignored until cnt >= 2**31 + 200");
        sig_mode = 0;
        level_threshold = 100;
        dut.cnt = 32'd0;
        c0 = lock_count;
        wr(ctrl(0,1, 1,0,0, 0,1,1, 2'd3, 1));
        wait_clk(40000);                          // at least 2 crossings
        check(armed && !locked && lock_count == c0, "ARMED, crossings ignored while cnt < 2**31 + 200");
        dut.cnt = 32'h8000_0000 + 32'd300;       // past the time threshold
        wait(locked); wait_clk(2);
        check(lock_sig_last < 100 && lock_sig_now >= 100 && lock_count == c0 + 1,
              "LOCKED on the next rising crossing once cnt >= 2**31 + 200");
        wr(ctrl(0,0, 1,0,0, 0,1,1, 2'd3, 1));
        wait_clk(2);

        $display("=== %0d checks, %0d errors ===", checks, errors);
        if (errors == 0) $display("TB RESULT: PASS");
        else             $display("TB RESULT: FAIL");
        $finish;
    end

    initial begin
        #(8*400000);
        $display("TB RESULT: FAIL (timeout)");
        $finish;
    end

endmodule
