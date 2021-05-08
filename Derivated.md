---
title: Derivated versions
description: Apps based on Lock-in+PID
layout: page
mathjax: true
---

Here you can find other works and versions related with this App. Most of them are
just the same application but with slight modifications.


## Harmonic Lock-in+PID (v0.3.4)

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


The source code can be found in  [github rp_lock-in_pid_h repository](https://github.com/marceluda/rp_lock-in_pid_h/releases/tag/v0.3.3).

The last realese version (v0.3.4):

<ul class="nav nav-tabs">
  <li class="active"><a data-toggle="tab" href="#now"  > LAST VERSION    </a></li>
  <li>               <a data-toggle="tab" href="#old"> Old versions</a></li>
</ul>

<div class="tab-content">
<div id="now" class="tab-pane fade in active" markdown="1">

  * [lock_in+pid_harmonic-0.3.7-15-devbuild.tar.gz](lock_in+pid_harmonic-0.3.7-15-devbuild.tar.gz)
  * [lock_in+pid_harmonic-0.3.7-15-devbuild.zip](lock_in+pid_harmonic-0.3.7-15-devbuild.zip)

</div>
<div id="old" class="tab-pane fade" markdown="1">

Old releases:

Tar version
|  **Default**  |  [lock_in+pid_harmonic-0.3.4-1-devbuild.zip](lock_in+pid_harmonic-0.3.4-1-devbuild.zip)               |
|  **Debug**    |  [lock_in+pid_harmonic-0.3.4-1-devbuild_DEBUG.zip](lock_in+pid_harmonic-0.3.4-1-devbuild_DEBUG.zip)   |
|  **Reload**   |  [lock_in+pid_harmonic-0.3.4-1-devbuild_RELOAD.zip](lock_in+pid_harmonic-0.3.4-1-devbuild_RELOAD.zip) |

ZIP version
|  **Default**  |  [lock_in+pid_harmonic-0.3.4-1-devbuild.tar.gz](lock_in+pid_harmonic-0.3.4-1-devbuild.tar.gz)               |
|  **Debug**    |  [lock_in+pid_harmonic-0.3.4-1-devbuild_DEBUG.tar.gz](lock_in+pid_harmonic-0.3.4-1-devbuild_DEBUG.tar.gz)   |
|  **Reload**   |  [lock_in+pid_harmonic-0.3.4-1-devbuild_RELOAD.tar.gz](lock_in+pid_harmonic-0.3.4-1-devbuild_RELOAD.tar.gz) |

</div>
</div>

  - older releases in [github](https://github.com/marceluda/rp_lock-in_pid/tree/gh-pages/Derivated)
  - [ChangeLog](https://github.com/marceluda/rp_lock-in_pid_h/blob/master/CHANGELOG.md) in the [project page](https://github.com/marceluda/rp_lock-in_pid_h)

<iframe width="560" height="315" src="https://www.youtube.com/embed/330eYE75MYQ" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## Dummy Simulator(v0.1): A peak function simulator for testing purposes

This App simulate a peak-response from a system scanned through a control signal. You can use ir to test locking
procedures for Lock-in+PID or Harmonic Lock-in+PID App.

  * In one RedPitaya device (RP1) you use Lock-in+PID
  * In other one (RP2) you load the simulator
  * Connect RP1 `in1` to RP2 `out1` and RP1 `out1` to RP2 `in1`
  * Now you can make a Ramp-Scan from RP1. RP2 will response on `out1` as you where scaning
    an spectrum with one peak.
  * On the simulator you can see de actual input, the response of the system, and the also a copy of the peak signal
  * The App lets you configure the peak height, width, position over the ramp-scan, add white gaussian noise and a linear baseline.

The source code can be found in  [github rp_dummy_simulator repository](https://github.com/marceluda/rp_dummy_simulator).

Download v0.1 from: [dummy_simulator-0.1.0-1](dummy_simulator-0.1.0-1-devbuild.tar.gz)


## Harmonic Lock-in+PID with 3 PIDs

Some improvements made by [stefanputz](https://github.com/stefanputz), accesible in [github repo](https://github.com/stefanputz/rp_lock-in_pid).
