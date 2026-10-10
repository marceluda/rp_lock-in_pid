// lock_in+pid v2.2.6: copied from lock_in+pid_harmonic v2.3.17 (the versions in the comments are those of that
// App; here lock_control is at 0x40600028 and lock_status at 0x4060002C; doc/lock_control.md is lock_in+pid/doc/lock_control.md),
// with the trigger inputs registered for timing (ramp_trigger_r, ge_now/ge_last, time_eq/time_ge: see below).
// Time trigger: same clock as before. Level trigger: 1 clock (8 ns) later.
`timescale 1ns / 1ps
//////////////////////////////////////////////////////////////////////////////////
// Company:
// Engineer:
//
// Create Date: 22.02.2017 11:41:25
// Design Name:
// Module Name: lock_ctrl
// Project Name:
// Target Devices:
// Tool Versions:
// Description:
//
// Dependencies:
//
// Revision:
// Revision 0.01 - File Created
// Additional Comments:
//
//////////////////////////////////////////////////////////////////////////////////


module lock_ctrl
    (
    input clk,rst,
    // inputs
    input         [10-1:0] lock_ctrl,
    input  signed [14-1:0] signal,
    input                  ramp_trigger,
    input         [32-1:0] time_threshold,
    input  signed [14-1:0] level_threshold,
    input                  level_rising_trigger,
    // outputs
    output                 ramp_enable,
    output                 pidA_enable,
    output                 pidB_enable,
    output                 lock_ctrl_trig,
    output        [16-1:0] lock_status
    );

    /** lock_ctrl (register lock_control) is COMMAND + CONFIGURATION: this module never
     *  needs it to be rewritten (v2.3.13, see doc/lock_control.md). Bits:
     *
     * lock_ctrl[ 0] --> lock_now         : lock request, immediate (0->1 edge locks)
     * lock_ctrl[ 1] --> launch_lock      : lock request on trigger (0->1 edge arms)
     *                                      [1:0]==00 releases the lock (back to IDLE)
     * lock_ctrl[ 2] --> pidB_enable_ctrl --|   manual (open loop) enables, effective in
     * lock_ctrl[ 3] --> pidA_enable_ctrl   |-> IDLE and ARMED. A change while LOCKED
     * lock_ctrl[ 4] --> ramp_enable_ctrl --|   releases the lock (manual override)
     * lock_ctrl[ 5] --> set_pidB_enable --|
     * lock_ctrl[ 6] --> set_pidA_enable   |--> enables while LOCKED
     * lock_ctrl[ 7] --> set_ramp_enable --|
     * lock_ctrl[ 8] --> trig_time        : time trigger
     * lock_ctrl[ 9] --> trig_val         : level trigger (both: level after time)
     * lock_trig_rise (lock_control[10])  : level_rising_trigger input
     *
     * lock_status (read only):
     *   [0] armed, [1] locked, [2] pidB_enable, [3] pidA_enable, [4] ramp_enable (effective),
     *   [7:5] 0, [15:8] number of entries into LOCKED (modulo 256)
     **/

    localparam ST_IDLE   = 2'd0 ,
               ST_ARMED  = 2'd1 ,
               ST_LOCKED = 2'd2 ;

    // previous value of the command/configuration bits: edges of lock_now / launch_lock and
    // changes of the manual enables
    reg  [5-1:0] ctrl_last;

    always @(posedge clk)
        if (rst) ctrl_last  <=  5'b0 ;
        else     ctrl_last  <=  lock_ctrl[4:0] ;

    wire   lock_now_rise, launch_rise, release_req, manual_change;
    assign lock_now_rise  =  lock_ctrl[0] & ~ctrl_last[0] ;
    assign launch_rise    =  lock_ctrl[1] & ~ctrl_last[1] ;
    assign release_req    = ~(|lock_ctrl[1:0]) ;
    assign manual_change  =  |(lock_ctrl[4:2] ^ ctrl_last[4:2]) ;

    wire   seek_time_trig,seek_level_trig;
    assign seek_time_trig  = lock_ctrl[8] ;  // time trigger configured
    assign seek_level_trig = lock_ctrl[9] ;  // level trigger configured


    // counter for time trigger
    // v2.3.15: 32 bits, compared with the whole 32-bit lock_trig_time (it was 31 bits: values >= 2**31
    // aliased to value - 2**31, and the counter wrapped every 2**31 ticks = 17.2 s instead of 34.4 s)
    reg  [32-1:0] cnt ;
    wire [32-1:0] cnt_next ;

    // lock_in+pid v2.2.6: ramp_trigger is registered (it comes from gen_ramp through combinational
    // logic: -2.7 ns into cnt). The counter is loaded with 1 instead of 0 one clock later, so cnt has
    // exactly the same value in every clock as before (the time trigger fires in the same clock).
    reg           ramp_trigger_r ;

    always @(posedge clk, posedge rst)
        if (rst) ramp_trigger_r  <=  1'b0 ;
        else     ramp_trigger_r  <=  ramp_trigger ;

    always @(posedge clk, posedge rst)
        if (rst) cnt  <=   32'b0   ;
        else     cnt  <=  cnt_next ;

    // counter is synchronized with gen_ramp signal
    assign cnt_next = ramp_trigger_r ? 32'd1 : cnt+1'b1 ;



    // save last val of signal (useful to get level trigger slope condition)
    reg  signed   [14-1:0] signal_last,signal_now;

    always @(posedge clk) begin
        if (rst) begin
            signal_last  <=   14'b0   ;
            signal_now   <=   14'b0   ;
        end
        else begin
            signal_last  <=   signal_now ;
            signal_now   <=   signal     ;
        end
    end


    // lock_in+pid v2.2.6: the comparisons are registered (signal_now -> comparator -> trigger -> state
    // machine was -1.1 ns). Level conditions: one more clock of latency (8 ns) for the level trigger only;
    // the time conditions are computed from cnt_next, so they have the value of cnt in the same clock
    // (no latency); the time condition of level+time is taken one clock late, aligned with the level one.
    reg           ge_now, ge_last ;            // signal_now >= level_threshold, and its previous value
    reg           time_eq, time_ge, time_ge_d ;// cnt == / >= time_threshold (same clock as cnt), time_ge delayed
    reg  signed   [14-1:0] sig_trig_now, sig_trig_last;   // values compared in ge_now / ge_last (simulation)

    always @(posedge clk) begin
        if (rst) begin
            ge_now        <=  1'b0 ;
            ge_last       <=  1'b0 ;
            time_eq       <=  1'b0 ;
            time_ge       <=  1'b0 ;
            time_ge_d     <=  1'b0 ;
            sig_trig_now  <=  14'b0 ;
            sig_trig_last <=  14'b0 ;
        end
        else begin
            ge_now        <=  (signal_now >= level_threshold) ;
            ge_last       <=  ge_now ;
            time_eq       <=  (cnt_next == time_threshold) ;
            time_ge       <=  (cnt_next >= time_threshold) ;
            time_ge_d     <=  time_ge ;
            sig_trig_now  <=  signal_now ;
            sig_trig_last <=  sig_trig_now ;
        end
    end


    // Trigger conditions (same as v2.3.12)
    wire  trigger,time_trigger,level_trigger,both_trigger;

    // Time trigger
    assign time_trigger  = time_eq & seek_time_trig & (~seek_level_trig) ;

    /* Level trigger: if signal is equal or greater (less) than threshold
                      and was less (equal or greater) in the last value
                      then fires trigger
    */
    assign level_trigger    = ( level_rising_trigger ? (ge_now & ~ge_last) : (~ge_now & ge_last) )
                              & seek_level_trig ;

    // time+level trigger: if time trigger condition was already met, then fire trigger when level condition is met
    assign both_trigger     = level_trigger & time_ge_d & seek_time_trig;

    assign trigger          = time_trigger | (level_trigger&(~seek_time_trig)) | both_trigger;


    // State machine: IDLE -> ARMED -> LOCKED, executed here without any write from the PS
    reg  [ 2-1:0] state;
    reg  [ 8-1:0] lock_cnt;
    reg           lock_trig_r;
    reg  [ 2-1:0] state_next;

    always @(*) begin
        state_next = state ;
        case (state)
            ST_IDLE   : if      (lock_now_rise)              state_next = ST_LOCKED ;
                        else if (launch_rise)                state_next = ST_ARMED  ;
            ST_ARMED  : if      (release_req)                state_next = ST_IDLE   ;
                        else if (lock_now_rise | trigger)    state_next = ST_LOCKED ;
            ST_LOCKED : if      (release_req|manual_change)  state_next = ST_IDLE   ;
            default   :                                      state_next = ST_IDLE   ;
        endcase
    end

    wire   enter_lock;
    assign enter_lock = (state_next==ST_LOCKED) & (state!=ST_LOCKED) ;

    always @(posedge clk) begin
        if (rst) begin
            state        <=  ST_IDLE ;
            lock_cnt     <=  8'b0    ;
            lock_trig_r  <=  1'b0    ;
        end
        else begin
            state        <=  state_next ;
            lock_trig_r  <=  enter_lock ;
            if (enter_lock)
                lock_cnt <=  lock_cnt + 1'b1 ;
        end
    end

    wire   locked,armed;
    assign locked         = (state==ST_LOCKED) ;
    assign armed          = (state==ST_ARMED ) ;

    // one clock pulse when the lock closes (oscilloscope trigger source)
    assign lock_ctrl_trig = lock_trig_r ;

    // Outputs: effective enables
    assign ramp_enable      = locked ?  lock_ctrl[7] :  lock_ctrl[4]   ;
    assign pidA_enable      = locked ?  lock_ctrl[6] :  lock_ctrl[3]   ;
    assign pidB_enable      = locked ?  lock_ctrl[5] :  lock_ctrl[2]   ;

    assign lock_status      = { lock_cnt , 3'b0 , ramp_enable , pidA_enable , pidB_enable , locked , armed } ;


endmodule



/*
lock_ctrl NAME (
    .clk(clk),  .rst(rst),
    // inputs
    .lock_ctrl            ( lock_state         ),
    .signal               ( lock_ctrl_signal   ),
    .ramp_trigger         ( ramp_trig          ),
    .time_threshold       ( lock_trig_time_val ),
    .level_threshold      ( lock_trig_val      ),
    .level_rising_trigger ( lock_trig_rise     ),
    // outputs
    .ramp_enable          ( ramp_enable_ctrl   ),
    .pidA_enable          ( pidA_enable_ctrl   ),
    .pidB_enable          ( pidB_enable_ctrl   ),
    .lock_ctrl_trig       ( lock_ctrl_trig     ),
    .lock_status          ( lock_status        )
);
*/
