---
title: Derivated versions
description: Apps based on Lock-in+PID
layout: page
mathjax: true
---

Here you can find other works and versions related with this App. Most of them are
just the same application but with slight modifications.


## Harmonic Lock-in+PID (v0.3)

This version of the App doesn't include the square Lock-in. Thats enable some free
"physical surfece" of the FPGA to implement other features.

The new features are:
  - **Modulation added on outputs**: In the Auxiliar tab of the Lock-in instrument
    you can switch on/off the modulacion signal `cos_ref` to be added to the signal
    already choosen for each port. A `-1` value menas `off` and any other value is the
    relative amplitude respecto to `8191 int == 1 Vpp`.
  - **Enhanced amplification**: The `X` and `Y` signals can now be amplified by `x524288` (`x512k`).
    This enables the posibility to measure signals that are far below the resolution limit (~`1V/8192`)

The lower physical surface load may correct some cross-talking problems between signals that happened on some devices
in the Lock-in+PID App.


The source code can be found in  [github rp_lock-in_pid_h repository](https://github.com/marceluda/rp_lock-in_pid_h/releases/tag/v0.3).

The first realese version (v0.3):

<ul class="nav nav-tabs">
  <li class="active"><a data-toggle="tab" href="#zip"  > .zip    </a></li>
  <li>               <a data-toggle="tab" href="#targz"> .tar.gz </a></li>
</ul>

<div class="tab-content">
<div id="zip" class="tab-pane fade in active" markdown="1">

|  **Default**  |  [lock_in+pid_harmonic-0.3.0-2-devbuild.zip](lock_in+pid_harmonic-0.3.0-2-devbuild.zip)               |
|  **Debug**    |  [lock_in+pid_harmonic-0.3.0-2-devbuild_DEBUG.zip](lock_in+pid_harmonic-0.3.0-2-devbuild_DEBUG.zip)   |
|  **Reload**   |  [lock_in+pid_harmonic-0.3.0-2-devbuild_RELOAD.zip](lock_in+pid_harmonic-0.3.0-2-devbuild_RELOAD.zip) |

</div>
<div id="targz" class="tab-pane fade" markdown="1">

|  **Default**  |  [lock_in+pid_harmonic-0.3.0-2-devbuild.tar.gz](lock_in+pid_harmonic-0.3.0-2-devbuild.tar.gz)               |
|  **Debug**    |  [lock_in+pid_harmonic-0.3.0-2-devbuild_DEBUG.tar.gz](lock_in+pid_harmonic-0.3.0-2-devbuild_DEBUG.tar.gz)   |
|  **Reload**   |  [lock_in+pid_harmonic-0.3.0-2-devbuild_RELOAD.tar.gz](lock_in+pid_harmonic-0.3.0-2-devbuild_RELOAD.tar.gz) |

</div>
</div>
