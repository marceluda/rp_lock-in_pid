#
# Red Pitaya specific application Makefile.
#

APP=lock-in+pid

# Versioning system
BUILD_NUMBER ?= 0
REVISION ?= devbuild
VER:=$(shell cat $(APP)/info/_info.json | grep version | sed -e 's/.*:\ *\"//' | sed -e 's/-.*//')

INSTALL_DIR ?= .

folder=$(CURDIR:%/=%)

-include _settings.env

# If you want to set specific variables use the file: settings.env
#
# i.e.
#
# RPIP=10.0.32.207
# RPOPTS=-l root -p 2022
# RPSCP=-P 2022


CFLAGS += -DVERSION=$(VER)-$(BUILD_NUMBER) -DREVISION=$(REVISION)
export CFLAGS

PP=1

.PHONY: clean clean_fpga clean_app

all:
			echo "a ver esto ---$(APP)---"
			echo "$(folder)"
			echo "$(BUILD_NUMBER)"
			echo "$(REVISION)"
			echo "$(VER)"
			echo $$(( $(PP) + 1 ))
