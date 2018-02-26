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
CONTROLLER_DBG = controllerhf_dbg.so

CFLAGS += -DVERSION=$(VER)-$(BUILD_NUMBER) -DREVISION=$(REVISION)
export CFLAGS


.PHONY: clean clean_fpga clean_app clean_target

all: $(CONTROLLERHF) fpga

$(CONTROLLERHF):
	$(MAKE) -C src clean
	sed 's?/* *#define DEBUG 1.*?#define DEBUG 1? ' -i src/main.h
	$(MAKE) -C src
	mv $(CONTROLLERHF) $(CONTROLLER_DBG)
	$(MAKE) -C src clean
	sed ' s?/* *#define DEBUG 1.*?// #define DEBUG 1? ' -i src/main.h
	$(MAKE) -C src

app: $(CONTROLLERHF)

fpga: red_pitaya.bit

red_pitaya.bit:
	cd fpga && $(MAKE) out/red_pitaya.bit
	cp fpga/out/red_pitaya.bit .

target/$(APP): red_pitaya.bit $(CONTROLLERHF) index.html
	mkdir -p target/$(APP)
	cp -r $(CONTROLLERHF) fpga.conf info css js red_pitaya.bit index.html target/$(APP)
	cp -r upload_app.sh target/
	cp -r ../resources target/
	mkdir -p target/$(APP)/py
	cp ../resources/rp_cmds/py/*.py target/$(APP)/py/
	sed -i target/$(APP)/info/info.json -e 's/REVISION/$(REVISION)/'
	sed -i target/$(APP)/info/info.json -e 's/BUILD_NUMBER/$(BUILD_NUMBER)/'
	sed -i target/$(APP)/index.html -e "s/\(\\s*\)var\\s*app_version\\s*=\\s*'VERSION'\\s*;\\s*/\\1var app_version = '$(VER)-$(BUILD_NUMBER)-$(REVISION)';/"

target_dbg/$(APP): red_pitaya.bit $(CONTROLLER_DBG) index.html
	mkdir -p target_dbg/$(APP)
	cp -r $(CONTROLLER_DBG) fpga.conf info css js red_pitaya.bit index.html target_dbg/$(APP)
	mv target_dbg/$(APP)/$(CONTROLLER_DBG) target_dbg/$(APP)/$(CONTROLLERHF)
	cp -r upload_app.sh target_dbg/
	cp -r ../resources target_dbg/
	mkdir -p target_dbg/$(APP)/py
	cp ../resources/rp_cmds/py/*.py target_dbg/$(APP)/py/
	sed -i target_dbg/$(APP)/info/info.json -e 's/REVISION/$(REVISION)_DEBUG/'
	sed -i target_dbg/$(APP)/info/info.json -e 's/BUILD_NUMBER/$(BUILD_NUMBER)/'
	sed -i target_dbg/$(APP)/index.html -e "s/\(\\s*\)var\\s*app_version\\s*=\\s*'VERSION'\\s*;\\s*/\\1var app_version = '$(VER)-$(BUILD_NUMBER)-$(REVISION)_DEBUG';/"

zip: $(CONTROLLERHF) target/$(APP) target_dbg/$(APP)
	#-$(RM) target -rf
	cd target; zip -r $(INSTALL_DIR)/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).zip *
	mv target/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).zip ../archive/.
	cd target_dbg; zip -r $(INSTALL_DIR)/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION)_DEBUG.zip *
	mv target_dbg/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION)_DEBUG.zip ../archive/.
	#$(RM) target -rf

tar: $(CONTROLLERHF) target/$(APP) target_dbg/$(APP)
	cd target; tar -czf $(INSTALL_DIR)/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).tar.gz *
	mv target/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).tar.gz ../archive/.
	cd target_dbg; tar -czf $(INSTALL_DIR)/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION)_DEBUG.tar.gz *
	mv target_dbg/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION)_DEBUG.tar.gz ../archive/.

clean_target:
	-$(RM) target -rf
	-$(RM) target_dbg -rf

clean_app:
	$(MAKE) -C src clean
	-$(RM) target -rf
	-$(RM) target_dbg -rf
	-$(RM) *.so
	echo "BUILD_NUMBER=$$(( $(BUILD_NUMBER) + 1 ))" > ../_build_number

clean_fpga:
	$(MAKE) -C fpga clean
	-$(RM) target -rf
	-$(RM) target_dbg -rf
	rm red_pitaya.bit
	echo "BUILD_NUMBER=$$(( $BUILD_NUMBER + 1 ))" > ../_build_number

clean: clean_app clean_fpga clean_target



upload_bit:
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm /opt/redpitaya/www/apps/$(APP)/red_pitaya.bit"
	scp $(RPSCP) red_pitaya.bit  root@$(RPIP):/opt/redpitaya/www/apps/$(APP)/

upload: target/$(APP)
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /opt/redpitaya/www/apps/$(APP) ; mkdir -p /opt/redpitaya/www/apps/$(APP)"
	scp $(RPSCP) -r target/$(APP)/controllerhf.so  target/$(APP)/css target/$(APP)/js  target/$(APP)/fpga.conf  target/$(APP)/index.html  target/$(APP)/info target/$(APP)/red_pitaya.bit  root@$(RPIP):/opt/redpitaya/www/apps/$(APP)/

upload_html: target/$(APP)
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /opt/redpitaya/www/apps/$(APP)/{index.html,js,css}"
	scp $(RPSCP) -r target/$(APP)/index.html target/$(APP)/css target/$(APP)/js root@$(RPIP):/opt/redpitaya/www/apps/$(APP)/

upload_py: ../resources/rp_cmds/py/hugo.py
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /root/py/{data_dump.py,set.py,ver_mem.py,*.py}"
	scp $(RPSCP) ../resources/rp_cmds/py/*.py root@$(RPIP):/root/py/
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; chmod +x /root/py/*.py"
