/*
Implements several features:
1) Reads data from the axi cyclically and continuously fills the fifo
2) Implements logic for reading a single entire buffer from the fifo

Refactored into:
- rp_asg_axi_fifo_writer: AXI -> FIFO writer
- rp_asg_axi_fifo_reader: FIFO reader and DAC output
*/

module rp_asg_axi #(
  parameter RSZ=16
)(
   // DAC
   output      [ 14-1: 0] dac_o           ,  //!< dac data output
   input                  dac_clk_i       ,  //!< dac clock
   input                  dac_rstn_i      ,  //!< dac reset - active low
   // trigger
   input                  trig_i          ,  //!< software trigger
   // buffer ctrl
   axi_sys_if.s           axi_sys         ,

   // configuration
   input                  set_rst_i       ,  //!< set FSM to reset
   input                  set_axi_en_i    ,  //!< enable AXI buffer read
   input                  repeat_i        ,  //!< repeat arm (no delay)
   input      [  32-1: 0] set_axi_start_i ,  //!< AXI start address
   input      [  32-1: 0] set_axi_stop_i  ,  //!< AXI stop address
   input      [  32-1: 0] set_axi_dec_i   ,  //!< AXI decimation
   input      [  16-1: 0] set_cyc_cnt_i   ,  //!< limit number of writes
   output     [  20-1: 0] axi_state_o     ,  //!< AXI state
   output                 axi_last_o      ,  //!< AXI final sample
   output                 axi_last_pre_o  ,  //!< AXI pre-final sample
   output                 axi_first_o        //!< AXI first sample
);

//---------------------------------------------------------------------------------
//

localparam DW = 64;
localparam AW = 32;
localparam LW =  4;
localparam int DAT_FIFO_DEPTH = 128;
localparam int DAT_FIFO_LVL_W = 7;
localparam int AXI_BURST_LEN = 16; // max burst supported by the current 4-bit LEN path
localparam int AXI_MAX_OUTSTANDING_BURSTS = 8;
localparam int DATA_REQUEST_LEVEL = DAT_FIFO_DEPTH - AXI_BURST_LEN;
localparam int FIFO_PRELOAD_SIZE  = 120;
localparam DAT_FIFO_W         = DW;

logic            start_pulse_dac;

logic [DW-1:0]       dat_fifo_idata;
logic               dat_fifo_wr;
logic               dat_fifo_full;
logic [DAT_FIFO_LVL_W-1:0] dat_wr_fifo_lvl;
logic [DAT_FIFO_W-1:0] dat_fifo_out_full;
logic [DW-1:0]       dat_fifo_out;
logic               dat_fifo_rd;
logic               dat_fifo_empty;
logic [DAT_FIFO_LVL_W-1:0] dat_rd_fifo_lvl;
logic [7-1:0]        dat_rd_fifo_lvl_7;
logic               dat_rd_valid;
logic               dat_fifo_rst_busy;
logic               axi_fifo_reset;
logic [DAT_FIFO_W-1:0] dat_fifo_in;

//---------------------------------------------------------------------------------
//
//  AXI -> FIFO writer

rp_asg_axi_fifo_writer #(
  .DW                 (DW),
  .AW                 (AW),
  .LW                 (LW),
  .AXI_BURST_LEN      (AXI_BURST_LEN),
  .DATA_REQUEST_LEVEL (DATA_REQUEST_LEVEL),
  .WR_LVL_W           (7),
  .MAX_OUTSTANDING_BURSTS (AXI_MAX_OUTSTANDING_BURSTS)
) inst_axi_fifo_writer (
  .dac_clk_i       (dac_clk_i),
  .dac_rstn_i      (dac_rstn_i),
  .start_pulse_i   (start_pulse_dac),
  .set_rst_i       (set_rst_i),
  .set_axi_start_i (set_axi_start_i),
  .set_axi_stop_i  (set_axi_stop_i),
  .axi_sys         (axi_sys),
  .dat_fifo_idata  (dat_fifo_idata),
  .dat_fifo_wr     (dat_fifo_wr),
  .dat_fifo_full   (dat_fifo_full),
  .dat_wr_fifo_lvl (dat_wr_fifo_lvl),
  .dat_fifo_rst_busy (dat_fifo_rst_busy),
  .axi_fifo_reset  (axi_fifo_reset)
);

//---------------------------------------------------------------------------------
//
//  FIFO reader + DAC output

assign dat_rd_fifo_lvl_7 = dat_rd_fifo_lvl;

rp_asg_axi_fifo_reader #(
  .DW                (DW),
  .AW                (AW),
  .FIFO_PRELOAD_SIZE (FIFO_PRELOAD_SIZE),
  .RD_LVL_W           (7)
) inst_axi_fifo_reader (
  .dac_o           (dac_o),
  .dac_clk_i       (dac_clk_i),
  .dac_rstn_i      (dac_rstn_i),
  .trig_i          (trig_i),
  .set_rst_i       (set_rst_i),
  .set_axi_en_i    (set_axi_en_i),
  .set_axi_start_i (set_axi_start_i),
  .set_axi_stop_i  (set_axi_stop_i),
  .set_axi_dec_i   (set_axi_dec_i),
  .set_cyc_cnt_i   (set_cyc_cnt_i),
  .repeat_i        (repeat_i),
  .axi_state_o     (axi_state_o),
  .axi_last_o      (axi_last_o),
  .axi_last_pre_o  (axi_last_pre_o),
  .axi_first_o     (axi_first_o),
  .start_pulse_o   (start_pulse_dac),
  .dat_fifo_out    (dat_fifo_out),
  .dat_rd_valid    (dat_rd_valid),
  .dat_fifo_empty  (dat_fifo_empty),
  .dat_rd_fifo_lvl (dat_rd_fifo_lvl_7),
  .dat_fifo_rd     (dat_fifo_rd)
);

//---------------------------------------------------------------------------------
//
//  data FIFO

assign dat_fifo_in  = dat_fifo_idata;
assign dat_fifo_out = dat_fifo_out_full;

asg_dat_fifo inst_asg_dat_fifo
(
  .wr_clk         (axi_sys.clk      ),
  .rd_clk         (dac_clk_i        ),
  .rst            (axi_fifo_reset   ),
  .din            (dat_fifo_in      ),
  .wr_en          (dat_fifo_wr      ),
  .wr_data_count  (dat_wr_fifo_lvl  ),
  .full           (dat_fifo_full    ),
  .dout           (dat_fifo_out_full),
  .rd_en          (dat_fifo_rd      ),
  .rd_data_count  (dat_rd_fifo_lvl  ),
  .valid          (dat_rd_valid     ),
  .empty          (dat_fifo_empty   ),
  .wr_rst_busy    (dat_fifo_rst_busy),
  .rd_rst_busy    (                 )
);

endmodule
