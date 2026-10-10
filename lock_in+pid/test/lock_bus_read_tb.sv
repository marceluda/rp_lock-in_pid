`timescale 1ns / 1ps
// Testbench of the bus reads of fpga/prj/v0.94/rtl/lock.v through the clock domain crossing of the
// system bus (fpga/rtl/rtl/sys_bus_cdc.sv), as in red_pitaya_top.sv: the PS side runs on fclk[0] and
// the lock module on adc_clk, two asynchronous 125 MHz clocks.
// Run with test/lock_bus_read_sim.sh (Vivado 2020.1 xsim). Prints "TB RESULT: PASS" or "TB RESULT: FAIL".
//
// lock_in+pid v2.2.5, port of the lock_in+pid_harmonic v2.3.17 test (bug of the in1 reads, testAgent
// 2026-10-09 14:44, found in lock_in+pid_harmonic; this App has the same bus code): sys_bus_cdc samples sys_rdata in the
// fclk domain some cycles after sys_ack and assumes the slave holds it. Up to v0.2.4 (and harmonic v2.3.16) lock.v reloaded
// sys_rdata on every adc_clk cycle, so a fast changing signal (in1, oscA = in1) changed under the PS
// sampling edge: in hardware, a mix of bits of two consecutive values. A zero delay simulation cannot
// show the mix itself, so the testbench checks its cause: at the fclk edge where the PS side takes the
// data, sys_rdata must not have changed during the previous fclk period (AGE_MIN). The adc_clk period
// is a bit shorter than the fclk one, so the phase between the clocks sweeps a full period.
//
// Checks: N reads of in1 (0xF8) and of oscA (0x118, oscA_sw = 1 = in1) with in1 changing sign on every
// cycle: data stable (age >= AGE_MIN), valid 14-bit sign extension, value taken by in1 near the read;
// in2 (0xFC, constant); write and read back pidA_kp (0x164) and lock_trig_time (0x34, 32 bits).

module lock_bus_read_tb;

    localparam real FCLK_HALF = 4.000;   // 125 MHz
    localparam real ACLK_HALF = 3.9973;  // ~125.07 MHz: the phase sweeps 8 ns every ~1500 cycles
    localparam real AGE_MIN   = 8.0;     // ns without changes of sys_rdata before the PS sampling edge
    localparam int  NREAD     = 2000;

    logic fclk = 1'b0, aclk = 1'b0;
    always #(FCLK_HALF) fclk = ~fclk;
    initial begin #1.3; forever #(ACLK_HALF) aclk = ~aclk; end

    logic frstn = 1'b0, arstn = 1'b0;

    sys_bus_if ps (.clk(fclk), .rstn(frstn));  // PS side (master)
    sys_bus_if sl (.clk(aclk), .rstn(arstn));  // lock side

    sys_bus_cdc i_cdc (.pll_locked_i(1'b1), .bus_s(ps), .bus_m(sl));

    // ADC input: changes sign on every cycle (worst case for the old code: bits 13..31 all toggle)
    logic signed [14-1:0] in1 = 14'sd0, in2 = 14'sd100;
    logic [16-1:0] acnt = 16'd0;
    logic signed [14-1:0] in1_hist [0:31];
    integer h;
    always @(posedge aclk) begin
        acnt <= acnt + 16'd1;
        in1  <= acnt[0] ? $signed({2'b00, acnt[12:1]}) : -$signed({2'b00, acnt[12:1]}) - 14'sd1;
        for (h = 31; h > 0; h = h - 1) in1_hist[h] <= in1_hist[h-1];
        in1_hist[0] <= in1;
    end

    wire signed [14-1:0] out1, out2, osc1, osc2;
    wire [24-1:0] pwm_a, pwm_b, pwm_c, pwm_d;
    wire [32-1:0] osc_ctrl;
    wire trigger, dmod;

    lock dut (
        .clk(aclk), .rst(~arstn),
        .in1(in1), .in2(in2), .external_trigger(1'b0),
        .out1(out1), .out2(out2), .osc1(osc1), .osc2(osc2),
        .trigger(trigger), .digital_modulation(dmod),
        .pwm_cfg_a(pwm_a), .pwm_cfg_b(pwm_b), .pwm_cfg_c(pwm_c), .pwm_cfg_d(pwm_d),
        .osc_ctrl(osc_ctrl),
        .sys_addr(sl.addr), .sys_wdata(sl.wdata), .sys_sel(4'b1111),
        .sys_wen(sl.wen), .sys_ren(sl.ren), .sys_rdata(sl.rdata),
        .sys_err(sl.err), .sys_ack(sl.ack)
    );

    // time of the last change of sys_rdata (lock side)
    realtime t_rdata = 0.0;
    always @(sl.rdata) t_rdata = $realtime;

    integer fails = 0, n_unstable = 0, n_badext = 0, n_badval = 0;
    realtime age_min_seen = 1.0e9;

    // one bus access from the PS side, like axi4_lite_slave: request on one fclk edge, data taken at
    // the edge where ack is seen
    task automatic bus(input logic wr, input logic [32-1:0] addr, input logic [32-1:0] wdata,
                       output logic [32-1:0] rdata, output realtime age);
        integer to;
        @(posedge fclk);
        ps.addr  <= addr;
        ps.wdata <= wdata;
        ps.wen   <= wr;
        ps.ren   <= ~wr;
        @(posedge fclk);
        ps.wen   <= 1'b0;
        ps.ren   <= 1'b0;
        to = 0;
        while (ps.ack !== 1'b1 && to < 100) begin @(posedge fclk); to = to + 1; end
        // sampling edge: the values before the NBA updates of this edge
        rdata = ps.rdata;
        age   = $realtime - t_rdata;
        if (to >= 100) begin $display("ERROR: bus timeout at 0x%h", addr); fails = fails + 1; end
        @(posedge fclk);
    endtask

    function automatic logic in_hist(input logic signed [14-1:0] v);
        integer k;
        in_hist = 1'b0;
        for (k = 0; k < 32; k = k + 1) if (in1_hist[k] === v) in_hist = 1'b1;
    endfunction

    task automatic read_fast(input logic [32-1:0] addr, input string name);
        logic [32-1:0] d;
        realtime age;
        integer i, uns, bext, bval;
        realtime amin;
        uns = 0; bext = 0; bval = 0; amin = 1.0e9;
        for (i = 0; i < NREAD; i = i + 1) begin
            bus(1'b0, addr, 32'h0, d, age);
            if (age < amin) amin = age;
            if (age < AGE_MIN) uns = uns + 1;
            if (d[31:13] !== {19{d[13]}}) bext = bext + 1;
            else if (!in_hist($signed(d[13:0]))) bval = bval + 1;
            repeat ((i * 7) % 5) @(posedge fclk);   // vary the spacing between reads
        end
        $display("%-5s 0x%h: %0d reads, sys_rdata changed < %.1f ns before the PS sampling edge: %0d (min age %.3f ns), bad sign extension: %0d, value not taken by in1: %0d",
                 name, addr, NREAD, AGE_MIN, uns, amin, bext, bval);
        n_unstable = n_unstable + uns; n_badext = n_badext + bext; n_badval = n_badval + bval;
        if (amin < age_min_seen) age_min_seen = amin;
    endtask

    logic [32-1:0] d;
    realtime age;

    initial begin
        ps.wen = 1'b0; ps.ren = 1'b0; ps.addr = 32'h0; ps.wdata = 32'h0;
        for (h = 0; h < 32; h = h + 1) in1_hist[h] = 14'sd0;
        #100;
        frstn = 1'b1; arstn = 1'b1;
        #200;

        // static registers: write + read back
        bus(1'b1, 32'h164, 32'hFFFFFB2E, d, age);           // pidA_kp = -1234
        bus(1'b0, 32'h164, 32'h0, d, age);
        if (d !== 32'hFFFFFB2E) begin $display("FAIL pidA_kp read 0x%h", d); fails = fails + 1; end
        else $display("pidA_kp 0x164: write/read -1234 OK (0x%h)", d);
        bus(1'b1, 32'h34, 32'hB2D05E00, d, age);            // lock_trig_time = 3000000000
        bus(1'b0, 32'h34, 32'h0, d, age);
        if (d !== 32'hB2D05E00) begin $display("FAIL lock_trig_time read 0x%h", d); fails = fails + 1; end
        else $display("lock_trig_time 0x34: write/read 3000000000 OK (0x%h)", d);
        bus(1'b0, 32'h0, 32'h0, d, age);
        if (d !== 32'h1) begin $display("FAIL oscA_sw read 0x%h (expected 1 = in1)", d); fails = fails + 1; end
        bus(1'b0, 32'hFC, 32'h0, d, age);
        if (d !== 32'd100) begin $display("FAIL in2 read 0x%h (expected 100)", d); fails = fails + 1; end
        else $display("in2   0xfc: 100 OK");

        read_fast(32'hF8, "in1");
        read_fast(32'h118, "oscA");

        $display("minimum age of sys_rdata at the PS sampling edge: %.3f ns (required >= %.1f)", age_min_seen, AGE_MIN);
        if (n_unstable > 0 || n_badext > 0 || n_badval > 0) fails = fails + 1;
        if (fails == 0) $display("TB RESULT: PASS");
        else            $display("TB RESULT: FAIL (%0d)", fails);
        $finish;
    end

endmodule
