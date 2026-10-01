
# Devbuild  changes

## 0.2.3
  - FEATURE: Ecosystem 2.0 support. FPGA is loaded with fpga.sh + fpga.bit.bin (fpgautil).
  - BUGFIX: "Error while sending data (E3)" on Ecosystem 2.0. The web UI now sends only the
            changed parameters, in sequential POSTs of at most 600 B, with retries.
  - BUGFIX: nginx worker segfault on Ecosystem 2.0 (GET /data while another App is loaded).
            The loaded App is probed with an empty POST before polling /data.
  - FEATURE: Detects when another client (e.g. the main menu) takes control of the board,
             stops polling and shows a modal with Restart. User state is restored after restart.
  - BUGFIX: Robust App start on Ecosystem 2.0 (stop previous App, wait, start, verify, retry).
  - BUGFIX: "Don't turn on PIDs and Ramp" now also disables Scan enable and lock triggers.
  - BUGFIX: Only finite numeric values are sent to the controller.
  - BUGFIX: Month value in pretty_now() (string concatenation).
  - BUGFIX: GUI xmin/xmax read by index in main.c; partial parameter updates broke them.

## 0.2.0-0-devbuild
  - FEATURE: better mousewheel behaviour for input number web interface.
             change step size with SHIFT and/or CTRL keys.
  - BUGFIX: Smoother real-time parame change on number inputs for web


## 0.1.1-2-devbuild
  - BUGFIX: Corrected Month value for now() and pretty_now() JS functions
            in index.html

## 0.1.1-1-devbuild
  - BUGFIX: Patch for the Lock control time trigger "Choose from graph" option,
            to set a time between 0 and max Ramp period.
  - FEATURE: Auto-zoom option for Lock control time trigger "Choose from graph" button.
             When enabled, if you click "Choose from graph" button the external trigger
             ans oscilloscope plot is configured for recommended conditions for position choose

## 0.1.0-48-devbuild
  - Started with DEBUG and RELOAG flavour
