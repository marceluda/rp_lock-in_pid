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
  - nombre: Lock-in+PID SQ
    descripcion: Version of Lock-in+PID with only the square (fast) lock-in.
    imagen: /img/cards/rp_lock-in_pid_sq.png
    url: "#lock-in-pid-sq"
  - nombre: Lock-in+PID H HF
    descripcion: High frequency version of Lock-in+PID H, up to 1 MHz.
    imagen: /img/cards/rp_lock-in_pid_h_hf.png
    url: "#lock-in-pid-h-hf"
  - nombre: Lock-in+PID H2
    descripcion: Two lock-in demodulators sharing the same local oscillator.
    imagen: /img/cards/rp_lock-in_pid_h2.png
    url: "#lock-in-pid-h2"
---

{% include card-grid.html items=page.cards logo=true %}

Here you can find other works and versions related with this App. Most of them are
just the same application but with slight modifications.

<div class="alert alert-info" role="alert" markdown="1">
**2.x versions:** they were redesigned by porting the original FPGA designs onto the base design of
RedPitaya-FPGA [Release_2025.2](https://github.com/RedPitaya/RedPitaya-FPGA/releases/tag/Release_2025.2)
(tag `2.07-48`, branch `origin/Release-2025.2`), which is suitable for the Red Pitaya Ecosystem 2.0.
The FPGA is built with Vivado 2020.1.

**Which version should I download?**
- **2.x** → Red Pitaya **Ecosystem 2.0** (e.g. `RedPitaya_OS_2.04`; tested on 2.04-35).
- **0.x** → **0.9x / 1.0** ecosystems.
</div>

<div class="text-center">
  <a href="https://marceluda.github.io/redpitaya/en/versions/" class="btn btn-default btn-sm" role="button"><i class="fa fa-archive"></i> All versions</a>
</div>


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
  - **Red Pitaya Ecosystem 2.0**: since v0.3.9 the App was expected to work on the 2.0 ecosystem, but some bugs
    were found in that implementation (v0.3.10 and v0.3.11 fixed several of them, see the ChangeLog).
    The new **2.x versions** are based on the FPGA design of
    [RedPitaya-FPGA Release_2025.2](https://github.com/RedPitaya/RedPitaya-FPGA/releases/tag/Release_2025.2),
    suitable for the 2.0 ecosystem, and they seem to work without major problems.

The lower physical surface load may correct some cross-talking problems between signals that happened on some devices
in the Lock-in+PID App.

The source code can be found in the [github rp_lock-in_pid_h repository](https://github.com/marceluda/rp_lock-in_pid_h/tree/v0.3.11).

**Downloads:**

| For | Downloads |
|-----|-----------|
| **Ecosystem 2.0** | {% include download-badge.html file="lock_in+pid_harmonic-2.3.23-57-devbuild.tar.gz" label="v2.3.23-57" %} {% include download-badge.html file="lock_in+pid_harmonic-2.3.23-57-devbuild.zip" label="v2.3.23-57" %} |
| **Ecosystems 0.9x / 1.0** | {% include download-badge.html file="lock_in+pid_harmonic-0.3.11-17-devbuild.tar.gz" label="v0.3.11-17" %} {% include download-badge.html file="lock_in+pid_harmonic-0.3.11-17-devbuild.zip" label="v0.3.11-17" %} |

  - All releases are also available in [github](https://github.com/marceluda/rp_lock-in_pid/tree/gh-pages/Derivated)
  - [ChangeLog](https://github.com/marceluda/rp_lock-in_pid_h/blob/master/CHANGELOG.md) in the [project page](https://github.com/marceluda/rp_lock-in_pid_h)

<iframe width="560" height="315" src="https://www.youtube.com/embed/330eYE75MYQ" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>


{% include section-title.html id="lock-in-pid-sq" title="Lock-in+PID SQ" %}

{% include repo-badges.html repo="marceluda/rp_lock-in_pid_sq" %}

Version of Lock-in+PID with only the square (fast) lock-in. It takes the [Lock-in+PID H](#lock-in-pid-h) App
and replaces the harmonic modulation with **square modulation**, like the one of the original Lock-in+PID:
a square local oscillator with reference and quadrature outputs up to **31.25 MHz** and a square lock-in,
while keeping the features of the harmonic App (modulation added to the control signals, two PIDs, ramp,
lock control run by the FPGA, streaming and HTTP remote control).

It is only available as a 2.x version, for the Red Pitaya Ecosystem 2.0.

The source code can be found in the [github rp_lock-in_pid_sq repository](https://github.com/marceluda/rp_lock-in_pid_sq).

**Downloads:**

| For | Downloads |
|-----|-----------|
| **Ecosystem 2.0** | {% include download-badge.html file="lock_in+pid_square-2.0.3-11-devbuild.tar.gz" label="v2.0.3-11" %} {% include download-badge.html file="lock_in+pid_square-2.0.3-11-devbuild.zip" label="v2.0.3-11" %} |


{% include section-title.html id="lock-in-pid-h-hf" title="Lock-in+PID H HF" %}

{% include repo-badges.html repo="marceluda/rp_lock-in_pid_h_hf" %}

High Frequency version of [Lock-in+PID H](#lock-in-pid-h). It is a copy of that project with only one change:
**the harmonic modulation signal frequency can be set from 60 Hz to 1 MHz**.

The source code can be found in the [github rp_lock-in_pid_h_hf repository](https://github.com/marceluda/rp_lock-in_pid_h_hf).

**Downloads:**

| For | Downloads |
|-----|-----------|
| **Ecosystem 2.0** | {% include download-badge.html file="lock_in+pid_harmonic_hf-2.3.14-16-devbuild.tar.gz" label="v2.3.14-16" %} {% include download-badge.html file="lock_in+pid_harmonic_hf-2.3.14-16-devbuild.zip" label="v2.3.14-16" %} |
| **Ecosystems 0.9x / 1.0** | {% include download-badge.html file="lock_in+pid_harmonic_hf-0.3.9-7-devbuild.tar.gz" label="v0.3.9-7" %} {% include download-badge.html file="lock_in+pid_harmonic_hf-0.3.9-7-devbuild.zip" label="v0.3.9-7" %} |


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

**Downloads:**

| For | Downloads |
|-----|-----------|
| **Ecosystem 2.0** | {% include download-badge.html file="lock_in+pid_harmonic2-2.4.7-18-devbuild.tar.gz" label="v2.4.7-18" %} {% include download-badge.html file="lock_in+pid_harmonic2-2.4.7-18-devbuild.zip" label="v2.4.7-18" %} |
| **Ecosystems 0.9x / 1.0** | {% include download-badge.html file="lock_in+pid_harmonic2-0.4.2-10-devbuild.tar.gz" label="v0.4.2-10" %} {% include download-badge.html file="lock_in+pid_harmonic2-0.4.2-10-devbuild.zip" label="v0.4.2-10" %} |


{% include section-title.html id="other-authors" title="Derivated works from other authors" %}

### Harmonic Lock-in+PID with 3 PIDs

{% include repo-badges.html repo="stefanputz/rp_lock-in_pid" version=false %}

Some improvements made by [stefanputz](https://github.com/stefanputz), accessible in the [github repo](https://github.com/stefanputz/rp_lock-in_pid).


{% include section-title.html id="other-apps" title="Other apps" %}

Looking for more? Check out other Red Pitaya apps I've developed.

<div class="text-center">
  <a href="https://marceluda.github.io/redpitaya/en/" class="btn btn-primary" role="button">Other Red Pitaya apps</a>
</div>
