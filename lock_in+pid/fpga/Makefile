#
# lock_in+pid FPGA - Vivado 2020.1, RedPitaya-FPGA project structure
#
# Based on the Makefile of RedPitaya-FPGA ((C) Red Pitaya 2013-2025), reduced to
# what this App needs (project v0.94 with the lock module, model Z10 = STEMlab 125-14).
#
#   make            bitstream (prj/v0.94/out/red_pitaya.bit) + Ecosystem 2.0 image
#                   (prj/v0.94/out/fpga.bit.bin, made with bootgen)
#   make bit        only the bitstream
#   make bin        only fpga.bit.bin (from an existing red_pitaya.bit)
#   make project    create the Vivado project (prj/v0.94/build/redpitaya.xpr) and
#                   open it in the Vivado GUI (no synthesis)
#   make clean      remove every build product of PRJ
#
# Vivado 2020.1 is loaded INSIDE this Makefile, in a clean environment (env -i):
# the rest of the App (controllerhf.so) is built with the environment of
# ../../settings.sh (Vivado 2015.2 + Linaro), and both must not mix. Calling
# make here with or without that environment loaded gives the same result.
#
# Variables (command line or environment):
#   VIVADO_SETTINGS  settings64.sh of Vivado 2020.1
#   PRJ, MODEL       project in prj/ and board model (only v0.94 / Z10 are included)
#   DEFINES          extra Verilog defines passed to red_pitaya_vivado_$(MODEL).tcl
#

SHELL := /bin/bash

PRJ     ?= v0.94
MODEL   ?= Z10
DEFINES ?=
VIVADO_SETTINGS ?= /tools/Xilinx/Vivado/2020.1/settings64.sh

OUT      = prj/$(PRJ)/out
FPGA_BIT = $(OUT)/red_pitaya.bit
FPGA_BIN = $(OUT)/fpga.bit.bin

# sources: a change in any of them rebuilds the bitstream
SOURCES := $(shell find rtl prj/$(PRJ)/rtl prj/$(PRJ)/ip prj/$(PRJ)/sdc sdc ip brd -type f 2>/dev/null) \
           red_pitaya_vivado_$(MODEL).tcl

# Clean environment with Vivado 2020.1 loaded. Usage: $(call XILINX_2020,<command>)
XENV = env -i HOME="$(HOME)" USER="$(USER)" LOGNAME="$(LOGNAME)" TERM="$(TERM)" \
           DISPLAY="$(DISPLAY)" XAUTHORITY="$(XAUTHORITY)" \
           PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C
XILINX_2020 = $(XENV) bash -c '. "$(VIVADO_SETTINGS)" > /dev/null && cd "$(CURDIR)" && $(1)'

VIVADO_BATCH = vivado -nojournal -mode batch

.PHONY: all bit bin project clean check_vivado help

all: $(FPGA_BIT) $(FPGA_BIN)

bit: $(FPGA_BIT)

bin: $(FPGA_BIN)

help:
	@sed -n '2,25p' Makefile

check_vivado:
	@test -f "$(VIVADO_SETTINGS)" || { echo "ERROR: Vivado 2020.1 not found: $(VIVADO_SETTINGS) (set VIVADO_SETTINGS=...)"; exit 1; }

# Synthesis + implementation + bitstream (tens of minutes)
$(FPGA_BIT): $(SOURCES) | check_vivado
	rm -f vivado.log
	$(call XILINX_2020,$(VIVADO_BATCH) -source red_pitaya_vivado_$(MODEL).tcl -tclargs $(PRJ) $(DEFINES))
	test -f $(FPGA_BIT)
	-./synCheck.sh $(PRJ)
	-mv -f synReport_*.log $(OUT)/ 2> /dev/null
	-cp -f vivado.log $(OUT)/vivado.log

# .bit -> .bit.bin for Ecosystem 2.0 (fpgautil), with bootgen of Vivado 2020.1.
# bootgen names the output after the input: copy to fpga.bit -> fpga.bit.bin
$(FPGA_BIN): $(FPGA_BIT) | check_vivado
	cp -f $(FPGA_BIT) $(OUT)/fpga.bit
	printf "all:{ fpga.bit }\n" > $(OUT)/fpga.bif
	$(call XILINX_2020,cd $(OUT) && bootgen -image fpga.bif -arch zynq -process_bitstream bin -w on)
	test -f $(FPGA_BIN)

# Vivado GUI with the project created (DEV_MODE: stops before synthesis)
project: | check_vivado
	$(call XILINX_2020,vivado -nojournal -source red_pitaya_vivado_$(MODEL).tcl -tclargs $(PRJ) $(DEFINES) DEV_MODE)

clean:
	rm -rf out .Xil .srcs sdk project sim
	rm -rf prj/$(PRJ)/out prj/$(PRJ)/.Xil prj/$(PRJ)/.srcs prj/$(PRJ)/sdk prj/$(PRJ)/project
	rm -rf prj/$(PRJ)/build prj/$(PRJ)/.gen prj/$(PRJ)/build-fsbl
	rm -f  prj/$(PRJ)/*.log
	rm -f  vivado*.log vivado*.jou vivado*.str usage_statistics_webtalk.* synReport*
