---
title: The Red Pitaya Board
description: RedPitaya Board
layout: page
---

# The Red Pitaya project

[Red Pitaya](https://www.redpitaya.com/) is a private company that works in instrumentation
hardware developing for labs and engineering applications.
The main product of this company is the [STEMlab-board](https://www.redpitaya.com/f130/STEMlab-board)
(originally called Red Pitaya itself). This board is an embebed device that combines
a computer with ARM processor, an FPGA and a electronic board with ADCs and DACs designed to replace
labs instruments.

The project started with an [Open Source](https://en.wikipedia.org/wiki/Open-source_software)
philosophy for software and a [Closed Source](https://en.wikipedia.org/w/index.php?title=Closed_Source)
philosophy for the hardware design. Red Pitaya sells you the board an offers you the compiled software,
but you can use your own soft, starting from your own or from the
[Red Pitaya Open Source code on git-hub](https://github.com/RedPitaya).

![stemlab]({{ site.baseurl }}/img/stemlab1.png "stemlab"){:style="display: block; margin-left: auto; margin-right: auto;"}


# The STEMlab product

The STEMlab was designed to provide multiple functionalities. It can be used to replace
(under some conditions) several lab instruments:

  - Oscilloscope
  - Function generator
  - Spectrum analyser
  - PIDs filters

The different utilities are packed in "STEMlab Applications". The device itself
runs a GNU/Linux Operative System with a web server that provides access to users
from any device with browser support (PC, notebooks, tablets, cell-phones).
When you connect to it through a network you access a freamwork where you can
use, add or remove that applications. Some Open-Source (and free) applications are
available on internet. You can buy others.

Each application has 3 parts:

  - **An FPGA design**: A digital circuit that process on "real time" ( 125 MHz internal clock)
    and in parallel all the hardware inputs and controls all the hardware outputs.
  - **A Software logic**: A set of routines to process the user actions and make changes
    on the FPGA registers and switches, and control in this way the hardware behavior. Also,
    this routines process the data that comes from hardware to send it to the user.
  - **A Frontend**: An interactive web page provided by the web server and run in the
    user web browser that is the interface to user interaction. This web page shows the data in
    graphical interface and provides a set of HTML controls that lets the user commands the hardware.


## Hardware


![hardware]({{ site.baseurl }}/img/redpitaya_hardware.png "hardware")
