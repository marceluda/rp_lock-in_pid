////////////////////////////////////////////////////////////////////////////////
// Module: System bus stub that acknowledges without error (lock_in+pid, from lock_in+pid_harmonic)
//
// The RedPitaya sys_bus_stub answers with err=1 (AXI SLVERR). controllerhf.so
// still maps and writes the ASG (0x40200000) and PID (0x40300000) regions,
// which are not implemented in this design; a SLVERR on those accesses would
// raise a bus error in the process. Like the original (Vivado 2015.2) design,
// these regions acknowledge every access, ignore writes and read as 0.
////////////////////////////////////////////////////////////////////////////////

module sys_bus_stub_ok (
  sys_bus_if.s bus
);

assign bus.ack   = 1'b1;
assign bus.err   = 1'b0;
assign bus.rdata = 32'h0;

endmodule: sys_bus_stub_ok
