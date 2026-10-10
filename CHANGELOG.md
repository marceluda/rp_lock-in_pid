
# Devbuild  changes

## 2.2.5 - FPGA rebuilt with Vivado 2020.1 (Ecosystem 2.0), branch devel2.0
First version of the 2.2.x series (branch `devel2.0`): v0.2.4 with the FPGA design ported to Vivado 2020.1,
as done in lock_in+pid_harmonic v2.3.10-v2.3.17. The 0.2.x series (branch `master`, Vivado 2015.2) stays as
the version for the 0.9x / 1.0 ecosystems.
  - CHANGED: `lock_in+pid/fpga` is now the RedPitaya-FPGA v0.94 project (model Z10) with the lock module of
             this App (`prj/v0.94/rtl/lock.v` + `lock/`, same registers). `make` builds `red_pitaya.bit` and
             `fpga.bit.bin` (bootgen), `make project` opens the Vivado project, `make clean` cleans; Vivado
             2020.1 is loaded inside the Makefile, isolated from the Linaro setup of the C controller. The
             2015.2 design is kept untracked in `fpga_old_2015.2/` (remains in history at v0.2.4).
  - CHANGED: The scope is the Red Pitaya 2.0 one (from lock_in+pid_harmonic): the controller unlocks its
             trigger (0x94) before each acquisition and detects the end of acquisition with conf bit 4;
             decimation register widened to 20 bits (up to 524288); scope read data held for the PS side of
             the bus (CDC fix of `rp_scope_cfg`). Kept from the 2015.2 design: lock at 0x40600000, scope at
             0x40100000 with the lock signals and lock trigger, slow outputs (PWM) driven by the lock, digital
             modulation on `exp_n_io[7]`, ASG / PID regions answer without error.
  - BUGFIX: Bus reads of fast changing signals (in1, oscA, out1, PID in/out...) could return a mix of bits of
            two values: `lock.v` now loads `sys_rdata` only during a read and holds it, and the read-only wires
            are read from registered copies (`*_rd`) frozen during the read, with a multicycle constraint
            (fix of lock_in+pid_harmonic v2.3.17; generator `resources/config_tool.py` updated, now pointing to
            `fpga/prj/v0.94/rtl/lock.v`). Test: `lock_in+pid/test/lock_bus_read_sim.sh` (xsim 2020.1).
  - BUGFIX: Negative scope samples would be shown as -1 V (the 2.0 scope returns 16-bit sign-extended samples):
            the controller and `py/hugo.py` keep the 14 ADC bits; `hugo.py` unlocks the trigger and accepts
            decimation 524288.
  - CHANGED: Only the App is built and packaged: the `_DEBUG` and `_RELOAD` flavours (controllerhf_dbg.so,
             controllerhf_rld.so, target_dbg/, target_rld/, their zip/tar and icons, the RELOAD dock of
             `src/main.c`) were removed. `make upload*` kept, as in lock_in+pid_harmonic v2.3.15 (rw script of
             the OS, `RPIP` required, fpga.sh 755).
  - CHANGED: `settings.sh` loads Vivado 2015.2 only if it is installed (not needed any more).
  - NOTE: FPGA timing does not close (as in the 2015.2 design and in lock_in+pid_harmonic 2.3.x).

## 0.2.4
  - BUGFIX: The second of two quick changes was lost (e.g. two controls changed while a POST
            was in flight): server responses keep the unsent user changes and the queued POST
            sends them. Config -> load during a POST also arrives.
  - BUGFIX: Indicators (X, Y, R, phi...) frozen after editing a number field (the 100 ms timer
            of the field left the edit mode on). Escape restores the field; leaving a select or
            checkbox without changes also ends the edit mode.
  - BUGFIX: Out of range value + Enter sent 2 POSTs (implicit submit + HTML5 validation of the
            form re-focused the field): Enter does preventDefault() and the forms are novalidate.
  - BUGFIX: The mouse wheel over a number field stopped the oscilloscope (it sent single_btn).
            SHIFT + wheel up now increments (Chrome sends it as a horizontal scroll).
  - BUGFIX: Wheel over a focused field sent each step twice.
  - BUGFIX: Restart after "another client took control" restores your settings also when the
            intruder is another tab of this same App (the App stays loaded).
  - FEATURE: Cautious polling on Ecosystem 2.0: a slow or failed /get_client_id (App change in
             progress) stops GET /data until the board answers fast again, and after
             "Application not loaded" no GET /data is done until the probe confirms this App
             (avoids the nginx worker crash).
  - BUGFIX: Cautious mode entered without reason during active use: a single slow/failed
            /get_client_id is retried at once (cautious only if the retry is slow/fails too), a
            slow answer overlapping our own POST /data is not measured, and the checks to leave it
            are 1 s apart (was 3 s).
  - BUGFIX: Endless POST loop (~15 POST/s, it crashed the nginx worker) after Config -> load of a
            config without some keys (e.g. one of lock_in+pid_harmonic): missing keys keep their
            current value, a select without selection never gives NaN, NaN is never a pending
            change, and sendParams() has an anti-loop guard (no POST without changes < 200 ms after
            the previous one, at most 10 POST/s). The display tolerates missing X/Y/F values.
  - BUGFIX: Saved configs use an own localStorage key (lockConfig_lock_in+pid); only the configs
            of this App are copied from the old shared key 'lockConfig'.

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
