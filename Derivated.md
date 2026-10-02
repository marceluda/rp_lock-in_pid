---
title: Derivated versions
description: Apps based on Lock-in+PID
layout: page
mathjax: true
cards:
  - nombre: Lock-in+PID H
    descripcion: Harmonic lock-in up to 50 kHz, PID filters and lock control.
    imagen: /img/cards/rp_lock-in_pid_h.png
    url: "#lock-in-pid-h"
  - nombre: Lock-in+PID H2
    descripcion: Two lock-in demodulators sharing the same local oscillator.
    imagen: /img/cards/rp_lock-in_pid_h2.png
    url: "#lock-in-pid-h2"
  - nombre: Lock-in+PID H HF
    descripcion: High frequency version of Lock-in+PID H, up to 1 MHz.
    imagen: /img/cards/rp_lock-in_pid_h_hf.png
    url: "#lock-in-pid-h-hf"
---

{% include card-grid.html items=page.cards logo=true %}

Here you can find other works and versions related with this App. Most of them are
just the same application but with slight modifications.


{% include section-title.html id="lock-in-pid-h" title="Lock-in+PID H" %}

{% include repo-badges.html repo="marceluda/rp_lock-in_pid_h" %}

Harmonic version of Lock-in+PID. It includes a harmonic lock-in up to 50 kHz, PID filters and lock control.

This version of the App doesn't include the square Lock-in. That frees some "physical surface" of the FPGA
to implement other features.

The new features are:
  - **Modulation added on outputs**: In the Auxiliar tab of the Lock-in instrument
    you can switch on/off the modulation signal `cos_ref` to be added to the signal
    already chosen for each port. A `-1` value means `off` and any other value is the
    relative amplitude with respect to `8191 int == 1 Vpp`.
  - **Enhanced amplification**: The `X` and `Y` signals can now be amplified by `x524288` (`x512k`).
    This enables the possibility to measure signals that are far below the resolution limit (~`1V/8192`).
  - **NOW WORKS IN RP 2.0 ECOSYSTEM** since v0.3.9. Version 0.3.10 fixed some bugs related with the new 2.0 ecosystem.

The lower physical surface load may correct some cross-talking problems between signals that happened on some devices
in the Lock-in+PID App.

The source code can be found in the [github rp_lock-in_pid_h repository](https://github.com/marceluda/rp_lock-in_pid_h/tree/v0.3.10).

**Downloads:**

<ul class="nav nav-tabs">
  <li class="active"><a data-toggle="tab" href="#h-now">LAST VERSION</a></li>
  <li><a data-toggle="tab" href="#h-old">Old versions</a></li>
</ul>

<div class="tab-content">
<div id="h-now" class="tab-pane fade in active" markdown="1">

Last release (v0.3.10):

{% include download-badge.html file="lock_in+pid_harmonic-0.3.10-4-devbuild.tar.gz" label="v0.3.10-4" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.10-4-devbuild.zip" label="v0.3.10-4" %}

</div>
<div id="h-old" class="tab-pane fade" markdown="1">

Old releases:

| Version | Downloads |
|---------|-----------|
| **v0.3.9** | {% include download-badge.html file="lock_in+pid_harmonic-0.3.9-0-devbuild.tar.gz" label="v0.3.9-0" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.9-0-devbuild.zip" label="v0.3.9-0" %} |
| **v0.3.7** | {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-22-devbuild.tar.gz" label="v0.3.7-22" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-22-devbuild.zip" label="v0.3.7-22" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-21-devbuild.tar.gz" label="v0.3.7-21" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-21-devbuild.zip" label="v0.3.7-21" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-20-devbuild.tar.gz" label="v0.3.7-20" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-20-devbuild.zip" label="v0.3.7-20" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-15-devbuild.tar.gz" label="v0.3.7-15" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-15-devbuild.zip" label="v0.3.7-15" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-10-devbuild.tar.gz" label="v0.3.7-10" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-10-devbuild.zip" label="v0.3.7-10" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-8-devbuild.tar.gz" label="v0.3.7-8" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-8-devbuild.zip" label="v0.3.7-8" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-1-devbuild.tar.gz" label="v0.3.7-1" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.7-1-devbuild.zip" label="v0.3.7-1" %} |
| **v0.3.4** | {% include download-badge.html file="lock_in+pid_harmonic-0.3.4-1-devbuild.tar.gz" label="v0.3.4-1" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.4-1-devbuild.zip" label="v0.3.4-1" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.4-1-devbuild_DEBUG.tar.gz" label="v0.3.4-1 DEBUG" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.4-1-devbuild_DEBUG.zip" label="v0.3.4-1 DEBUG" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.4-1-devbuild_RELOAD.tar.gz" label="v0.3.4-1 RELOAD" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.4-1-devbuild_RELOAD.zip" label="v0.3.4-1 RELOAD" %} |
| **v0.3.3** | {% include download-badge.html file="lock_in+pid_harmonic-0.3.3-4-devbuild.tar.gz" label="v0.3.3-4" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.3-4-devbuild.zip" label="v0.3.3-4" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.3-4-devbuild_DEBUG.tar.gz" label="v0.3.3-4 DEBUG" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.3-4-devbuild_DEBUG.zip" label="v0.3.3-4 DEBUG" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.3-4-devbuild_RELOAD.tar.gz" label="v0.3.3-4 RELOAD" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.3-4-devbuild_RELOAD.zip" label="v0.3.3-4 RELOAD" %} |
| **v0.3.1** | {% include download-badge.html file="lock_in+pid_harmonic-0.3.1-3-devbuild.tar.gz" label="v0.3.1-3" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.1-3-devbuild.zip" label="v0.3.1-3" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.1-3-devbuild_DEBUG.tar.gz" label="v0.3.1-3 DEBUG" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.1-3-devbuild_DEBUG.zip" label="v0.3.1-3 DEBUG" %} |
|            | {% include download-badge.html file="lock_in+pid_harmonic-0.3.1-3-devbuild_RELOAD.tar.gz" label="v0.3.1-3 RELOAD" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.1-3-devbuild_RELOAD.zip" label="v0.3.1-3 RELOAD" %} |

</div>
</div>

  - All releases are also available in [github](https://github.com/marceluda/rp_lock-in_pid/tree/gh-pages/Derivated)
  - [ChangeLog](https://github.com/marceluda/rp_lock-in_pid_h/blob/master/CHANGELOG.md) in the [project page](https://github.com/marceluda/rp_lock-in_pid_h)

<iframe width="560" height="315" src="https://www.youtube.com/embed/330eYE75MYQ" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>


{% include section-title.html id="lock-in-pid-h2" title="Lock-in+PID H2" %}

{% include repo-badges.html repo="marceluda/rp_lock-in_pid_h2" %}

Based on [Lock-in+PID H](#lock-in-pid-h), this version includes **two** lock-in demodulators
that share the same local oscillator, PID filters and lock control.

Features:
  - **Two** lock-in amplifiers
  - In-phase and quadrature demodulation
    - Demodulation for arbitrary phase
    - Demodulation for double and triple frequency
  - Two PID filters, for loop back stabilization
  - Ramp/Scan controller for response analysis
  - Lock control for automatic scan-stop / PID start
  - Streaming system for continued acquisition of two channels
  - Remote control through HTTP API

The source code can be found in the [github rp_lock-in_pid_h2 repository](https://github.com/marceluda/rp_lock-in_pid_h2).


{% include section-title.html id="lock-in-pid-h-hf" title="Lock-in+PID H HF" %}

{% include repo-badges.html repo="marceluda/rp_lock-in_pid_h_hf" %}

High Frequency version of [Lock-in+PID H](#lock-in-pid-h). It is a copy of that project with only one change:
**the harmonic modulation signal frequency can be set from 60 Hz to 1 MHz**.

The source code can be found in the [github rp_lock-in_pid_h_hf repository](https://github.com/marceluda/rp_lock-in_pid_h_hf).


{% include section-title.html id="other-authors" title="Derivated works from other authors" %}

### Harmonic Lock-in+PID with 3 PIDs

{% include repo-badges.html repo="stefanputz/rp_lock-in_pid" version=false %}

Some improvements made by [stefanputz](https://github.com/stefanputz), accessible in the [github repo](https://github.com/stefanputz/rp_lock-in_pid).


{% include section-title.html id="other-apps" title="Other apps" %}

Looking for more? Check out other Red Pitaya apps I've developed.

<div class="text-center">
  <a href="https://marceluda.github.io/redpitaya/" class="btn btn-primary" role="button">Other Red Pitaya apps</a>
</div>
