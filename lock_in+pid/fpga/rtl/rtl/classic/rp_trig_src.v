/**
 * $Id: rp_trig_src.v 2024-03-15
 *
 * @brief Red Pitaya trigger selector logic
 *
 * @Author Jure Trnovec
 *
 * (c) Red Pitaya  http://www.redpitaya.com
 *
 * This part of code is written in Verilog hardware description language (HDL).
 * Please visit http://en.wikipedia.org/wiki/Verilog
 * for more details on the language used herein.
 */


/*
GENERAL DESCRIPTION:
This module selects the trigger source for acquisition. 
Also includes trigger protection logic.
*/

module rp_trig_src #(
  parameter CHN = 0
)(
  // ADC
  input                 adc_clk_i       ,  // ADC clock
  input                 adc_rstn_i      ,  // ADC reset - active low

  input                 adc_rst_do_i    ,
  input                 adc_dly_do_i    ,
  input                 trig_dis_clr_i  ,

  input       [   5-1: 0] set_trg_src_i   ,
  input                 set_trg_new_i   ,
  input                 dly_valp_i      , // delay valid - immediate pulse


  input                 adc_trig_sw_i   ,
  input       [ 4-1: 0] adc_trig_p_i    ,
  input       [ 4-1: 0] adc_trig_n_i    ,
  input                 ext_trig_p_i    ,
  input                 ext_trig_n_i    ,
  input                 asg_trig_p_i    ,
  input                 asg_trig_n_i    ,
  input       [ 4-1: 0] trig_ch_i       ,

  output      [ 8-1: 0] trg_state_o     ,
  output                adc_trig_o
);

reg   [   5-1: 0] set_trig_src ;
reg               adc_trg_dis      ;
reg               adc_trig         ;
wire              adc_trig_sw      ;
reg               adc_trig_sw_r    ;

assign adc_trig_sw   = (adc_trig_sw_r) && dly_valp_i; 

always @(posedge adc_clk_i)
if (adc_rstn_i == 1'b0) begin
   adc_trg_dis   <= 1'b0 ;
   set_trig_src  <= 5'h0 ;
   adc_trig_sw_r <= 1'b0 ;
end else begin
   if (set_trg_new_i)
      set_trig_src <= set_trg_src_i ;
   else if (adc_dly_do_i || adc_trig || adc_rst_do_i) //delay reached or reset
      set_trig_src <= 5'h0 ;

   if (trig_dis_clr_i)
      adc_trg_dis <= 1'b0 ;
   else if (adc_trig)
      adc_trg_dis <= 1'b1 ;

   if (adc_trig_sw_i)// extend wait for next valid sample 
      adc_trig_sw_r <= 1'b1; 
   else if (dly_valp_i)
      adc_trig_sw_r <= 1'b0; 

end

genvar GV;
generate
if(CHN == 0) begin

always @(posedge adc_clk_i) begin
   if (adc_trg_dis) begin
      adc_trig <= 1'b0;
   end else begin
      case (set_trig_src)
          5'd1 : adc_trig <= adc_trig_sw                     ; // manual
          5'd2 : adc_trig <= adc_trig_p_i[0]                 ; // A ch rising edge
          5'd3 : adc_trig <= adc_trig_n_i[0]                 ; // A ch falling edge
          5'd4 : adc_trig <= adc_trig_p_i[1]                 ; // B ch rising edge
          5'd5 : adc_trig <= adc_trig_n_i[1]                 ; // B ch falling edge
          5'd6 : adc_trig <= ext_trig_p_i                    ; // external - rising edge
          5'd7 : adc_trig <= ext_trig_n_i                    ; // external - falling edge
          5'd8 : adc_trig <= asg_trig_p_i                    ; // ASG - rising edge
          5'd9 : adc_trig <= asg_trig_n_i                    ; // ASG - falling edge
          5'd10: adc_trig <= trig_ch_i[0]                    ; // C ch rising edge
          5'd11: adc_trig <= trig_ch_i[1]                    ; // C ch falling edge
          5'd12: adc_trig <= trig_ch_i[2]                    ; // D ch rising edge
          5'd13: adc_trig <= trig_ch_i[3]                    ; // D ch falling edge
          5'd18: adc_trig <= adc_trig_p_i[0] | adc_trig_n_i[0]; // A ch any edge
          5'd20: adc_trig <= adc_trig_p_i[1] | adc_trig_n_i[1]; // B ch any edge
          5'd22: adc_trig <= ext_trig_p_i    | ext_trig_n_i   ; // external any edge
          5'd24: adc_trig <= asg_trig_p_i    | asg_trig_n_i   ; // ASG any edge
          5'd26: adc_trig <= trig_ch_i[0]    | trig_ch_i[1]   ; // C ch any edge
          5'd28: adc_trig <= trig_ch_i[2]    | trig_ch_i[3]   ; // D ch any edge
       default : adc_trig <= 1'b0                            ;
      endcase
   end
end

end else begin

always @(posedge adc_clk_i) begin
   if (adc_trg_dis) begin
      adc_trig <= 1'b0;
   end else begin
      case (set_trig_src)
          5'd1 : adc_trig <= adc_trig_sw                     ; // manual
          5'd2 : adc_trig <= trig_ch_i[0]                    ; // A ch rising edge
          5'd3 : adc_trig <= trig_ch_i[1]                    ; // A ch falling edge
          5'd4 : adc_trig <= trig_ch_i[2]                    ; // B ch rising edge
          5'd5 : adc_trig <= trig_ch_i[3]                    ; // B ch falling edge
          5'd6 : adc_trig <= ext_trig_p_i                    ; // external - rising edge
          5'd7 : adc_trig <= ext_trig_n_i                    ; // external - falling edge
          5'd8 : adc_trig <= asg_trig_p_i                    ; // ASG - rising edge
          5'd9 : adc_trig <= asg_trig_n_i                    ; // ASG - falling edge
          5'd10: adc_trig <= adc_trig_p_i[0]                 ; // C ch rising edge
          5'd11: adc_trig <= adc_trig_n_i[0]                 ; // C ch falling edge
          5'd12: adc_trig <= adc_trig_p_i[1]                 ; // D ch rising edge
          5'd13: adc_trig <= adc_trig_n_i[1]                 ; // D ch falling edge
          5'd18: adc_trig <= trig_ch_i[0]    | trig_ch_i[1]   ; // A ch any edge
          5'd20: adc_trig <= trig_ch_i[2]    | trig_ch_i[3]   ; // B ch any edge
          5'd22: adc_trig <= ext_trig_p_i    | ext_trig_n_i   ; // external any edge
          5'd24: adc_trig <= asg_trig_p_i    | asg_trig_n_i   ; // ASG any edge
          5'd26: adc_trig <= adc_trig_p_i[0] | adc_trig_n_i[0]; // C ch any edge
          5'd28: adc_trig <= adc_trig_p_i[1] | adc_trig_n_i[1]; // D ch any edge
       default : adc_trig <= 1'b0                            ;
      endcase
   end
end

end
endgenerate


assign adc_trig_o    = adc_trig;
assign trg_state_o   = {2'h0, adc_trg_dis, set_trig_src};

endmodule
