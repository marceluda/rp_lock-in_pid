#
#

APP=$(notdir $(CURDIR:%/=%))

-include ../_settings.env
-include ../_build_number


# Versioning system
BUILD_NUMBER ?= 0
REVISION ?= devbuild
VER:=$(shell cat info/info.json | grep version | sed -e 's/.*:\ *\"//' | sed -e 's/-.*//')

INSTALL_DIR ?= .


CONTROLLERHF   = controllerhf.so

# FPGA (v2.2.5): Vivado 2020.1, RedPitaya-FPGA structure (fpga/, project v0.94, model Z10),
# ported from lock_in+pid_harmonic v2.3.17. fpga/Makefile loads Vivado 2020.1 by itself in a
# clean environment, so it does not mix with the Vivado 2015.2 + Linaro environment of
# ../settings.sh used for C. It produces red_pitaya.bit and, with bootgen, fpga.bit.bin
# (Ecosystem 2.0: loaded with fpgautil by fpga.sh).
# v2.2.5: the DEBUG and RELOAD flavours (controllerhf_dbg.so / controllerhf_rld.so, target_dbg/,
# target_rld/ and their packages) were removed: only the App itself is built and packaged.
FPGA_BIN  = fpga.bit.bin
FPGA_PRJ ?= v0.94
FPGA_OUT  = fpga/prj/$(FPGA_PRJ)/out


CFLAGS += -DVERSION=$(VER)-$(BUILD_NUMBER) -DREVISION=$(REVISION)
export CFLAGS


# fpga/app are PHONY: with fpga.sh present, make's implicit rule '%: %.sh' would
# otherwise turn the target 'fpga' (a directory) into 'cat fpga.sh > fpga'
.PHONY: clean clean_fpga clean_app clean_target fpga app

all: $(CONTROLLERHF) fpga

$(CONTROLLERHF):
	$(MAKE) -C src clean
	$(MAKE) -C src

app: $(CONTROLLERHF)

fpga: red_pitaya.bit $(FPGA_BIN)

red_pitaya.bit:
	$(MAKE) -C fpga all PRJ=$(FPGA_PRJ)
	cp $(FPGA_OUT)/red_pitaya.bit .

# .bit -> .bin for Ecosystem 2.0: made by fpga/Makefile (bootgen of Vivado 2020.1)
$(FPGA_BIN): red_pitaya.bit
	$(MAKE) -C fpga bin PRJ=$(FPGA_PRJ)
	cp $(FPGA_OUT)/fpga.bit.bin $(FPGA_BIN)



target/$(APP): red_pitaya.bit $(FPGA_BIN) $(CONTROLLERHF) index.html
	mkdir -p target/$(APP)
	cp -r $(CONTROLLERHF) nginx.conf fpga.conf fpga.sh $(FPGA_BIN) info css js py red_pitaya.bit index.html target/$(APP)
	chmod 755 target/$(APP)/fpga.sh  # 2.0 runs it with system(): needs the exec bit
	cp -r upload_app.sh target/
	cp -r ../resources target/
	cp ../CHANGELOG.md ../README.md target/
	mkdir -p target/$(APP)/py
	# No Python caches in target/ nor in the packages (py/__pycache__, resources/**/__pycache__, *.pyc)
	find target -name __pycache__ -type d -prune -exec rm -rf {} +
	find target \( -name '*.pyc' -o -name '*.pyo' \) -type f -delete
	sed -i target/$(APP)/info/info.json -e 's/REVISION/$(REVISION)/'
	sed -i target/$(APP)/info/info.json -e 's/BUILD_NUMBER/$(BUILD_NUMBER)/'
	sed -i target/$(APP)/index.html -e "s/\(\\s*\)var\\s*app_version\\s*=\\s*'VERSION'\\s*;\\s*/\\1var app_version = '$(VER)-$(BUILD_NUMBER)-$(REVISION)';/"


zip: $(CONTROLLERHF) target/$(APP)
	mkdir -p ../archive
	cd target; zip -r $(INSTALL_DIR)/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).zip *
	mv target/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).zip ../archive/.

tar: $(CONTROLLERHF) target/$(APP)
	mkdir -p ../archive
	cd target; tar -czf $(INSTALL_DIR)/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).tar.gz *
	mv target/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).tar.gz ../archive/.

clean_target:
	-$(RM) target -rf

clean_app:
	$(MAKE) -C src clean
	-$(RM) target -rf
	-$(RM) *.so
	echo "BUILD_NUMBER=$$(( $(BUILD_NUMBER) + 1 ))" > ../_build_number

clean_fpga:
	$(MAKE) -C fpga clean PRJ=$(FPGA_PRJ)
	-$(RM) target -rf
	-$(RM) red_pitaya.bit $(FPGA_BIN)
	echo "BUILD_NUMBER=$$(( $(BUILD_NUMBER) + 1 ))" > ../_build_number

clean: clean_app clean_fpga clean_target



# Upload to a Red Pitaya (never run by the build). Set RPIP (and RPOPTS/RPSCP if needed) on the
# command line or in ../_settings.env, e.g.  make upload RPIP=rp-XXXXXX.local
# v2.2.5 (as lock_in+pid_harmonic v2.3.15): the targets depend only on target/$(APP), the
# file system is made writable with the rw script of the OS (/opt/redpitaya/sbin/rw in Ecosystem 2.0,
# /boot/sbin/rw in 0.9x; it needs PATH_REDPITAYA exported) and fpga.sh keeps its exec bit.
# After an upload, stop and start the App (or open it from the menu) to load the new controllerhf.so.
RPOPTS ?= -l root
RP_DIR  = /opt/redpitaya/www/apps/$(APP)
RP_RW   = export PATH_REDPITAYA=/opt/redpitaya ; if [ -x /opt/redpitaya/sbin/rw ] ; then /opt/redpitaya/sbin/rw ; else /boot/sbin/rw ; fi

.PHONY: upload upload_bit upload_html upload_py check_rpip

check_rpip:
	@test -n "$(RPIP)" || { echo "ERROR: set RPIP (e.g. make upload RPIP=rp-XXXXXX.local)"; exit 1; }

# FPGA image only (red_pitaya.bit and the Ecosystem 2.0 fpga.bit.bin)
upload_bit: check_rpip red_pitaya.bit $(FPGA_BIN)
	ssh $(RPIP) $(RPOPTS) "$(RP_RW) ; rm -f $(RP_DIR)/red_pitaya.bit $(RP_DIR)/$(FPGA_BIN)"
	scp $(RPSCP) red_pitaya.bit $(FPGA_BIN) root@$(RPIP):$(RP_DIR)/

# The whole App
upload: check_rpip target/$(APP)
	ssh $(RPIP) $(RPOPTS) "$(RP_RW) ; rm -rf $(RP_DIR) ; mkdir -p $(RP_DIR)"
	cd target/$(APP) ; scp  $(RPSCP) -r controllerhf.so css js py nginx.conf fpga.conf fpga.sh $(FPGA_BIN) index.html info red_pitaya.bit  root@$(RPIP):$(RP_DIR)/
	ssh $(RPIP) $(RPOPTS) "chmod 755 $(RP_DIR)/fpga.sh"

# Web interface only: index.html (with the version of the target), css and js
upload_html: check_rpip target/$(APP)
	ssh $(RPIP) $(RPOPTS) "$(RP_RW) ; rm -rf $(RP_DIR)/index.html $(RP_DIR)/js $(RP_DIR)/css"
	cd target/$(APP); scp $(RPSCP) -r index.html css js root@$(RPIP):$(RP_DIR)/

# Python scripts of py/
upload_py: check_rpip ./py/hugo.py
	ssh $(RPIP) $(RPOPTS) "$(RP_RW) ; mkdir -p $(RP_DIR)/py ; rm -f $(RP_DIR)/py/*.py"
	scp $(RPSCP) ./py/*.py root@$(RPIP):$(RP_DIR)/py/
	ssh $(RPIP) $(RPOPTS) "chmod +x $(RP_DIR)/py/*.py"
