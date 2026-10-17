# RP Lock-in+PID — documentation

Documentation of `lock_in+pid` **v2.2.10** (branch `master`, Ecosystem 2.0, FPGA built with Vivado 2020.1).
Back to the [project README](../README.md) · [CHANGELOG](../CHANGELOG.md). The published documentation of the
App (concepts, applications, the 0.x versions) is at https://marceluda.github.io/rp_lock-in_pid/

| Document | Contents |
|---|---|
| [App.md](App.md) | The instruments of the App and their technical data: frequencies, filters, gains, ranges, time spans |
| [Usage.md](Usage.md) | The web interface panel by panel, and the procedures: scan, error signal, close and check a lock, configs |
| [Structure.md](Structure.md) | How the web page, the server (nginx + `controllerhf.so`) and the FPGA work together; block diagrams of the FPGA |
| [FPGA.md](FPGA.md) | Register map of the lock module and of the oscilloscope, bit fields and selector values |
| [Remote.md](Remote.md) | Control from a program: Python scripts on the board (`py/`), the deprecated SSH client `control_hugo.py`; there is no HTTP API |
| [Devel.md](Devel.md) | Source tree, requirements, building (C, FPGA), tests, installation |

Design notes kept with the sources (`lock_in+pid/doc/`):

- [`lock_control.md`](../lock_in+pid/doc/lock_control.md): the lock control (since v2.2.6; `lock_control` /
  `lock_status`, state machine in the FPGA, locking from Python).
- [`lock_capture.md`](../lock_in+pid/doc/lock_capture.md): *Capture Lock* and *Fire on click*.

Screenshots of the web interface are in the hidden folder `.Usage/`.
