set_property LOC XADC_X0Y0 [get_cells i_ams/XADC_inst]

############################################################################
# Clock constraints                                                        #
############################################################################

# set_false_path -from [get_clocks clk_fpga_0] -to [get_clocks adc_clk]
# set_false_path -from [get_clocks clk_fpga_0] -to [get_clocks par_clk]

### SATA connector
set_property IOSTANDARD DIFF_HSTL_I_18 [get_ports {daisy_p_o[*]}]
set_property IOSTANDARD DIFF_HSTL_I_18 [get_ports {daisy_n_o[*]}]
set_property IOSTANDARD DIFF_HSTL_I_18 [get_ports {daisy_p_i[*]}]
set_property IOSTANDARD DIFF_HSTL_I_18 [get_ports {daisy_n_i[*]}]

set_property PULLTYPE PULLUP [get_ports daisy_p_i[1]]

set_property -dict {PACKAGE_PIN Y9  IOSTANDARD LVCMOS33} [get_ports {exp_p_io[8]}]
set_property -dict {PACKAGE_PIN Y8  IOSTANDARD LVCMOS33} [get_ports {exp_n_io[8]}]
set_property -dict {PACKAGE_PIN Y12 IOSTANDARD LVCMOS33} [get_ports {exp_p_io[9]}]
set_property -dict {PACKAGE_PIN Y13 IOSTANDARD LVCMOS33} [get_ports {exp_n_io[9]}]
set_property -dict {PACKAGE_PIN Y7  IOSTANDARD LVCMOS33} [get_ports {exp_p_io[10]}]
set_property -dict {PACKAGE_PIN Y6  IOSTANDARD LVCMOS33} [get_ports {exp_n_io[10]}]

set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[0].inst_sys_bus_cdc/ctrl_do_reg/C  ]  -to [get_pins sys_bus_interconnect/for_bus[0].inst_sys_bus_cdc/reg_do_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[0].inst_sys_bus_cdc/reg_done_reg/C ]  -to [get_pins sys_bus_interconnect/for_bus[0].inst_sys_bus_cdc/ctrl_done_csff_reg[0]/D ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[0].inst_sys_bus_cdc/ctrl_we_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[0].inst_sys_bus_cdc/reg_we_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[0].inst_sys_bus_cdc/ctrl_re_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[0].inst_sys_bus_cdc/reg_re_csff_reg[0]/D    ]

set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[1].inst_sys_bus_cdc/ctrl_do_reg/C  ]  -to [get_pins sys_bus_interconnect/for_bus[1].inst_sys_bus_cdc/reg_do_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[1].inst_sys_bus_cdc/reg_done_reg/C ]  -to [get_pins sys_bus_interconnect/for_bus[1].inst_sys_bus_cdc/ctrl_done_csff_reg[0]/D ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[1].inst_sys_bus_cdc/ctrl_we_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[1].inst_sys_bus_cdc/reg_we_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[1].inst_sys_bus_cdc/ctrl_re_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[1].inst_sys_bus_cdc/reg_re_csff_reg[0]/D    ]

set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[2].inst_sys_bus_cdc/ctrl_do_reg/C  ]  -to [get_pins sys_bus_interconnect/for_bus[2].inst_sys_bus_cdc/reg_do_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[2].inst_sys_bus_cdc/reg_done_reg/C ]  -to [get_pins sys_bus_interconnect/for_bus[2].inst_sys_bus_cdc/ctrl_done_csff_reg[0]/D ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[2].inst_sys_bus_cdc/ctrl_we_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[2].inst_sys_bus_cdc/reg_we_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[2].inst_sys_bus_cdc/ctrl_re_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[2].inst_sys_bus_cdc/reg_re_csff_reg[0]/D    ]

set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[3].inst_sys_bus_cdc/ctrl_do_reg/C  ]  -to [get_pins sys_bus_interconnect/for_bus[3].inst_sys_bus_cdc/reg_do_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[3].inst_sys_bus_cdc/reg_done_reg/C ]  -to [get_pins sys_bus_interconnect/for_bus[3].inst_sys_bus_cdc/ctrl_done_csff_reg[0]/D ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[3].inst_sys_bus_cdc/ctrl_we_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[3].inst_sys_bus_cdc/reg_we_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[3].inst_sys_bus_cdc/ctrl_re_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[3].inst_sys_bus_cdc/reg_re_csff_reg[0]/D    ]

set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[4].inst_sys_bus_cdc/ctrl_do_reg/C  ]  -to [get_pins sys_bus_interconnect/for_bus[4].inst_sys_bus_cdc/reg_do_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[4].inst_sys_bus_cdc/reg_done_reg/C ]  -to [get_pins sys_bus_interconnect/for_bus[4].inst_sys_bus_cdc/ctrl_done_csff_reg[0]/D ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[4].inst_sys_bus_cdc/ctrl_we_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[4].inst_sys_bus_cdc/reg_we_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[4].inst_sys_bus_cdc/ctrl_re_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[4].inst_sys_bus_cdc/reg_re_csff_reg[0]/D    ]

set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[5].inst_sys_bus_cdc/ctrl_do_reg/C  ]  -to [get_pins sys_bus_interconnect/for_bus[5].inst_sys_bus_cdc/reg_do_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[5].inst_sys_bus_cdc/reg_done_reg/C ]  -to [get_pins sys_bus_interconnect/for_bus[5].inst_sys_bus_cdc/ctrl_done_csff_reg[0]/D ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[5].inst_sys_bus_cdc/ctrl_we_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[5].inst_sys_bus_cdc/reg_we_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[5].inst_sys_bus_cdc/ctrl_re_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[5].inst_sys_bus_cdc/reg_re_csff_reg[0]/D    ]

set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[6].inst_sys_bus_cdc/ctrl_do_reg/C  ]  -to [get_pins sys_bus_interconnect/for_bus[6].inst_sys_bus_cdc/reg_do_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[6].inst_sys_bus_cdc/reg_done_reg/C ]  -to [get_pins sys_bus_interconnect/for_bus[6].inst_sys_bus_cdc/ctrl_done_csff_reg[0]/D ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[6].inst_sys_bus_cdc/ctrl_we_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[6].inst_sys_bus_cdc/reg_we_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[6].inst_sys_bus_cdc/ctrl_re_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[6].inst_sys_bus_cdc/reg_re_csff_reg[0]/D    ]

set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[7].inst_sys_bus_cdc/ctrl_do_reg/C  ]  -to [get_pins sys_bus_interconnect/for_bus[7].inst_sys_bus_cdc/reg_do_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[7].inst_sys_bus_cdc/reg_done_reg/C ]  -to [get_pins sys_bus_interconnect/for_bus[7].inst_sys_bus_cdc/ctrl_done_csff_reg[0]/D ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[7].inst_sys_bus_cdc/ctrl_we_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[7].inst_sys_bus_cdc/reg_we_csff_reg[0]/D    ]
set_max_delay -datapath_only 8.000 -from [get_pins sys_bus_interconnect/for_bus[7].inst_sys_bus_cdc/ctrl_re_reg/C ]   -to [get_pins sys_bus_interconnect/for_bus[7].inst_sys_bus_cdc/reg_re_csff_reg[0]/D    ]

set_false_path -from [get_clocks pll_adc_clk] -to [get_pins {i_asg/ch*/inst_axi_dac/dac_rd_clr_r*/D}]
set_false_path -from [get_clocks clk_fpga_0] -to [get_pins {spi_done_csff*/D}]
set_max_delay -datapath_only 8.000 -from [get_pins ps/axi_slave_gp0/rd_araddr*[*]/C] -to [get_pins sys_bus_interconnect/for_bus[*].inst_sys_bus_cdc/bus_m\\.addr*[*]*/D]
set_max_delay -datapath_only 8.000 -from [get_pins ps/axi_slave_gp0/wr_awaddr*[*]/C] -to [get_pins sys_bus_interconnect/for_bus[*].inst_sys_bus_cdc/bus_m\\.addr*[*]*/D]
set_max_delay -datapath_only 8.000 -from [get_pins ps/axi_slave_gp0/rd_do*/C] -to [get_pins sys_bus_interconnect/for_bus[*].inst_sys_bus_cdc/bus_m\\.addr*[*]*/D]
set_false_path -from [get_pins ps/axi_slave_gp0/wr_wdata*[*]/C] -to [get_pins sys_bus_interconnect/for_bus[*].inst_sys_bus_cdc/bus_m\\.wdata*[*]*/D]
set_false_path -from [get_pins sys_bus_interconnect/for_bus[*].inst_sys_bus_cdc/reg_rdata*[*]*/C] -to [get_pins ps/axi_slave_gp0/axi\\.RDATA*[*]*/D]
set_max_delay -datapath_only 8.000 -from [get_pins i_hk/i_freq_meter/ref_gate_reg/C] -to [get_pins {i_hk/i_freq_meter/mes_gate_csff*[0]/D}]
set_false_path -from [get_pins {adc_dat*[*][*]/C}] -to [get_pins {dac_dat_*[*]/D}]
set_false_path -from [get_pins {i_adc366x/adc_dat_o*[*]/C}] -to [get_pins {dac_dat_*[*]/D}]

# lock_in+pid v2.2.5 (from lock_in+pid_harmonic v2.3.17): bus reads of the lock module (lock.v, FPGA MEMORY dock). sys_bus_cdc raises
# sys_ren with the address already stable (bus_m.addr is loaded in the same clock) and keeps it for 2 adc_clk
# cycles (until the registered sys_ack of lock.v); lock.v loads sys_rdata in both cycles only while sys_ren = 1
# and holds its read copies (*_rd, *_reg) while sys_ren = 1; the other inputs of the read mux are registers
# written only by the bus. The PS takes sys_rdata after the reg_done handshake (several fclk cycles after the
# second load), so the value read is the one of the second cycle: its inputs have 2 cycles.
set_multicycle_path -setup 2 -to [get_pins {i_lock/sys_rdata_reg[*]/D}]
set_multicycle_path -hold 1 -to [get_pins {i_lock/sys_rdata_reg[*]/D}]
