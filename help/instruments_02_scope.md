---
title: Oscilloscope
description: Oscilloscope instrument
layout: page
---

{% include instrument_navbar.html %}

The Oscilloscope instrument lets you see the wave form of two signals
of the device. They can be internal signals (produced inside the FPGA module)
or external (taken through ADC inputs).


## The original application

As was said, this instrument is based in the
[scope application](https://github.com/RedPitaya/RedPitaya/tree/release-v0.95/apps-free/scope))
of the Free Software repository for the Red Pitaya Comunity.
All the controls of the original application were kept in the right hand column.
In these panels you can control the trigger behavior, the time and amplitude scales,
monitor the statistics for each channel, etc. Only the *"Monitor"* panel is new, used
for the PIDs instrument.

The original application was designed to measure only de ADC inputs. This version was modified
to use de oscilloscope functionality on other signals. The controls for this purposes are in the
left panel.

## New features



{% include instrument_navbar.html up=1 %}
