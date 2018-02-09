---
title: Intruments on App
description: Description of instruments that comes with the application
layout: page
---


{% include instrument_navbar.html %}


The Lock-in+PID application for Red Pitaya is organized in "instruments", compiled all together
in an common toolbox. It follows the same structure of the Free Software Red Pitaya original applications,
described below. Each instrument has its own space in the web interface, separated in panels that can be folded/unfolded.

## The instruments
The instruments themselves are:

 - **Two channel Oscilloscope** (based on [relese-0.95 scope application](https://github.com/RedPitaya/RedPitaya/tree/release-v0.95/apps-free/scope))
 - **Inputs and output control:** A set of (de)multplexers to choose the signals flow through instrumentes, from input (ADC) channels to output (DAC) channels.
 - **Two Lock-in Amplifiers:**
   - An "Slow Harmonic Lock-in" that uses harmonic functions in quadrature for signal demodulation. The local oscillator goes from 3 Hz to 49 kHz.
   - A "Fast square Lock-in" that uses square functions in quadrature for signal demodulation. The local oscillator goes from 30 mHz to 31 MHz.
   - **Square and harmonic oscillators**: This instrument is part of each lock-in amplifier, but can be used for other applications.
 - **Ramp generator:** produces triangle wave functions for scanning purposes.
 - **Two PIDs filters:** Based on (based on [relese-0.95 scope application](https://github.com/RedPitaya/RedPitaya/tree/release-v0.95/apps-free/scope)), modified to achieve several orders of magnitude in the configuration parameters ranges. Proportional factor goes from 0.001 to 8000 and integral characteristic time goes from 8 ns to 9 sec.
 - **Auto-lock control:** This tool lets you turn on/off the Ramp and PIDs instruments automatically to start an stabilization feedback loop on configurable events.


## "Where" are the instruments?

The instruments are not really a "isolated portions of code" that works in an
independent way. They are a logical division that lets you think in the
configuration
of the application as you would think of in a lab scheme. The combination of
several instruments lets you control an experiment setup and measure the desired
variables.

<a data-toggle="collapse" href="#Where_are_the_instruments" aria-expanded="false" aria-controls="Where_are_the_instruments">read more</a>

<div id="Where_are_the_instruments" class="collapse" markdown="1">

The *core* of the instruments is in the FPGA layer. Each of them are implemented as
wired logical gates whose behavior is controlled by configurable FPGA registers
(memory sectors that can be set up from the microprocesor / operating system).
So, when you set the values of these registers you change the frequency of the
lock-in local oscillator, choose the signal that goes to output 1 or modify the
integrator characteristic time of one of the PID filters.

There are two ways to control theses registers. The direct way is executing code in
the RedPitaya operating system that reads and writes directly in this registers.
The other way is by using the Web Frontend, the RedPitaya App itself.

In this part of the documentation we cover the Web Frontend control. The Web App
is an HTML+JS application that runs on your desktop/movile browser and communicates constantly to a web server that runs on RedPitaya operative system.
Each instrument has its controls and information grouped by panels in the web
interface, for visual simplicity. When you use the these controls the web page
sends the information the the web server, that process the information and change the
values of the FPGA registers.

</div>


## The layer structure


<div class="alert alert-warning" role="alert">
  <strong>Under construction</strong> TO BE COMPLETED
</div>


## The web Frontend

![app frontend]({{ site.baseurl }}/img/app_frontend.png "Web Frontend to control the instruments")



{% include instrument_navbar.html up=1 %}
