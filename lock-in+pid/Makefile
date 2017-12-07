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


CONTROLLERHF = controllerhf.so

CFLAGS += -DVERSION=$(VER)-$(BUILD_NUMBER) -DREVISION=$(REVISION)
export CFLAGS


.PHONY: clean clean_fpga clean_app

all: $(CONTROLLERHF) fpga info/info.json

$(CONTROLLERHF): info/info.json
	$(MAKE) -C src

info/info.json:
	sed "{ s/BUILD_NUMBER/$(BUILD_NUMBER)/ }" info/_info.json > info/_info.json

app: $(CONTROLLERHF)

fpga: red_pitaya.bit info/info.json

red_pitaya.bit:
	cd fpga && $(MAKE) out/red_pitaya.bit
	cp fpga/out/red_pitaya.bit .

zip: $(CONTROLLERHF)
	-$(RM) target -rf
	mkdir -p target/$(APP)
	cp -r $(CONTROLLERHF) fpga.conf info css js red_pitaya.bit resources/RP_py index.html target/$(APP)
	cp -r upload_app.sh target/
	mkdir -p target/$(APP)/RP_py
	cp resources/RP_py/*.py target/$(APP)/RP_py/
	sed -i target/$(APP)/info/info.json -e 's/REVISION/$(REVISION)/'
	sed -i target/$(APP)/info/info.json -e 's/BUILD_NUMBER/$(BUILD_NUMBER)/'
	cd target; zip -r $(INSTALL_DIR)/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).zip *
	mv target/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).zip ../.
	$(RM) target -rf

tar: $(CONTROLLERHF)
	-$(RM) target -rf
	mkdir -p target/$(APP)
	cp -r $(CONTROLLERHF) fpga.conf info css js red_pitaya.bit resources/RP_py index.html target/$(APP)
	cp -r upload_app.sh target/
	mkdir -p target/$(APP)/RP_py
	cp resources/RP_py/*.py target/$(APP)/RP_py/
	sed -i target/$(APP)/info/info.json -e 's/REVISION/$(REVISION)/'
	sed -i target/$(APP)/info/info.json -e 's/BUILD_NUMBER/$(BUILD_NUMBER)/'
	cd target; tar -czf $(INSTALL_DIR)/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).tar.gz *
	mv target/$(APP)-$(VER)-$(BUILD_NUMBER)-$(REVISION).tar.gz ../.
	$(RM) target -rf

clean_app:
	$(MAKE) -C src clean
	-$(RM) target -rf
	-$(RM) *.so
	-$(RM) info/info.json
	echo "BUILD_NUMBER=$$(( $BUILD_NUMBER + 1 ))" > ../_build_number

clean_fpga:
	$(MAKE) -C fpga clean
	rm red_pitaya.bit
	-$(RM) info/info.json
	echo "BUILD_NUMBER=$$(( $BUILD_NUMBER + 1 ))" > ../_build_number

clean: clean_app clean_fpga


upload_bit: red_pitaya.bit
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm /opt/redpitaya/www/apps/$(APP)/red_pitaya.bit"
	scp $(RPSCP) red_pitaya.bit  root@$(RPIP):/opt/redpitaya/www/apps/$(APP)/

upload:
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /opt/redpitaya/www/apps/$(APP) ; mkdir -p /opt/redpitaya/www/apps/$(APP)"
	scp $(RPSCP) -r controllerhf.so  css js  fpga.conf  index.html  info red_pitaya.bit  root@$(RPIP):/opt/redpitaya/www/apps/$(APP)/

upload_html: index.html
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /opt/redpitaya/www/apps/$(APP)/{index.html,js,css}"
	scp $(RPSCP) -r index.html css js root@$(RPIP):/opt/redpitaya/www/apps/$(APP)/

upload_py: resources/RP_py/hugo.py
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; rm -rf /root/py/{data_dump.py,set.py,ver_mem.py,*.py}"
	scp $(RPSCP) ./resources/RP_py/lock.py ./resources/RP_py/osc.py ./resources/RP_py/hugo.py ./resources/RP_py/*.py root@$(RPIP):/root/py/
	ssh $(RPIP) $(RPOPTS) "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw ; chmod +x /root/py/*.py"
