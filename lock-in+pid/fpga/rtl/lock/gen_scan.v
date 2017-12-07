`timescale 1ns / 1ps
//////////////////////////////////////////////////////////////////////////////////
// 
// 
// Scanning module. Outputs triangular scan. Echa  value last for scan_step clock ticks 
// before changing to the next value.
// Outputs two signals, with a amplitud relation set by scan_B_factor
// 
// Includes a relock system wich produce an exponential amplitud increasing signal
// to find next closest lock condition.
// 
//////////////////////////////////////////////////////////////////////////////////


module gen_scan #(parameter R=14)
    (
    input clk,rst,
    // inputs
    input         [32-1:0] scan_step,
    input  signed [ R-1:0] scan_low_lim,scan_hig_lim,scan_B_factor,
    input                  scan_reset,scan_enable,scan_direction,
    input                  relock_enable,out_of_lock,relock_reset,
    // outputs
    output                 trigger_low,
    output                 trigger_hig,
    output signed [ R-1:0] outA, outB
    );
    
    // R resolution of input and output signals
    reg  signed [ R-1:0] scan_signal;
    wire signed [ R-1:0] scan_signal_next;
    // Second output
    wire signed [28-1:0] outB_28;
    
    // Counter
    reg         [32-1:0] cnt;
    wire        [32-1:0] cnt_next;
    
    // Auxiliary signals
    reg  slope;
    wire slope_next;
    reg  trig_low_last,trig_low_now;
    reg  trig_hig_last,trig_hig_now;
    
    reg  [32-1:0] scan_step_last, scan_step_now;
    wire          scan_step_changed ;
    wire          go ;
    
    reg  [32-1:0] scan_direction_last, scan_direction_now;
    wire          floor,ceil,slope_changed;
    
    // relock system signals
    wire signed [ R-1:0] relock_low_lim ,relock_hig_lim;
    wire                 relock_run_scan,relock_freeze_pids;
    
    // Wires for scan control
    wire signed [ R-1:0] low_lim,hig_lim;
    wire                 enable,direction;
    
    assign  low_lim   = relock_enable & out_of_lock  ?  relock_low_lim  :  scan_low_lim   ;
    assign  hig_lim   = relock_enable & out_of_lock  ?  relock_hig_lim  :  scan_hig_lim   ;
    assign  direction = relock_enable & out_of_lock  ?  1'b0            :  scan_direction ;
    assign  enable    = relock_enable & out_of_lock  ?  relock_run_scan :  scan_enable    ;
    
    gen_scan_relock #(.R(14)) i_gen_scan_relock (
        .clk(clk),  .rst(rst),
        // inputs
        .relock_on       ( relock_enable        ),
        .out_of_lock     ( out_of_lock          ),
        .scan_A          ( outA                 ),
        .scan_trigger_in ( trigger_low          ),
        .reset           ( relock_reset         ),
        // outputs
        .new_low_lim     ( relock_low_lim       ),
        .new_hig_lim     ( relock_hig_lim       ),
        .state_14        ( /* lolo */ ),
        .run_scan        ( relock_run_scan      ),
        .freeze_pids     ( relock_freeze_pids   ) 
    );
    
    

        
    
    // Counter evolution    
    always @(posedge clk) 
        if (rst) begin
            cnt            <=    32'b0        ;
            scan_step_last <=    32'b0        ;
            scan_step_now  <=    32'b0        ;
        end
        else begin
            cnt            <=    cnt_next        ;
            scan_step_last <=    scan_step_now   ;
            scan_step_now  <=    scan_step       ;
        end
    

    
    assign scan_step_changed = ~ ( scan_step_now == scan_step_last)  ;
    assign cnt_next          =  |{scan_reset,scan_step_changed,scan_step_now==cnt} ? 32'b0 :  cnt + enable ;
    assign go                =  &{ cnt==scan_step_now | (~(|scan_step_now)) , enable , ~scan_reset } ;
    
    
    
    // scan_signal evolution
    always @(posedge clk) 
    if (rst) begin
        scan_signal          <=    {R{1'b0}}    ;
        slope                <=         1'b1    ;
        scan_direction_last  <=         1'b0    ;
        scan_direction_now   <=         1'b0    ;
    end
    else if(scan_reset) begin
        scan_signal          <=    {R{1'b0}}      ;
        slope                <=   ~direction ;
        scan_direction_last  <=    direction ;
        scan_direction_now   <=    direction ;
        trig_low_last        <=    1'b0           ;
        trig_low_now         <=    1'b0           ;
        trig_hig_last        <=    1'b0           ;
        trig_hig_now         <=    1'b0           ;
    end
    else begin
        if(go) begin
            scan_signal          <= scan_signal_next   ;
            slope                <= slope_next         ;
            scan_direction_last  <= scan_direction_now ;
            scan_direction_now   <= direction     ;
        end
        else begin
            scan_signal          <= scan_signal      ;
            slope                <= slope            ;
            scan_direction_last  <= scan_direction_last ;
            scan_direction_now   <= scan_direction_now  ;
        end
        trig_low_last        <=    trig_low_now        ;
        trig_low_now         <=    trigger_low         ;
        trig_hig_last        <=    trig_hig_now        ;
        trig_hig_now         <=    trigger_hig         ;
    end
    
    
    assign floor         = ( scan_signal<=low_lim  )  ;
    assign ceil          = ( scan_signal>=hig_lim  )  ;
    assign slope_changed =  scan_direction_now ^ scan_direction_last ;
    
    assign scan_signal_next = floor ? scan_signal + 1'b1  :
                              ceil  ? scan_signal - 1'b1  :
                              slope ? scan_signal + 1'b1  :
                                      scan_signal - 1'b1  ;
    
    assign slope_next       = floor         ? 1'b1   :
                              ceil          ? 1'b0   :
                              slope_changed ? ~slope : 
                                               slope ;
    
    assign trigger_low = &{ scan_signal==low_lim , go, ~trig_low_last } ;
    assign trigger_hig = &{ scan_signal==hig_lim , go, ~trig_hig_last } ;
    
    
    // outputs
    assign outA    = scan_signal ;
    
    // assign outB_28  = $signed(scan_signal) * $signed(scan_B_factor) ;
    
    mult_dsp_14  i_mult_dps_error_pow (.CLK(clk), .A($signed(scan_signal)) , .B($signed(scan_B_factor)), .P(outB_28));
    
    assign outB     = $signed(outB_28[26:0]) >>> 12 ;
    //assign outB     = relock_hig_lim ;
    //assign outB     = { 8'b0 , scan_step_changed, trigger, slope , go , direction , enable};
    
endmodule

/*
gen_scan #(.R(14)) NAME (
    .clk(clk),  .rst(rst),
    // inputs
    .scan_step (   32'd1000 ),
    .scan_low_lim(  14'd0     ),
    .scan_hig_lim(  14'd1000  ),
    .scan_reset  (    1'b0    ),
    .scan_enable (   1'b1     ),
    .scan_direction(1'b1      ),
    .scan_B_factor (scan_B_factor ),
    // outputs
    .trigger     ( TRIG       ),
    .outA        (  OUT       ),
    .outB        (  OUT       ) 
);
*/
