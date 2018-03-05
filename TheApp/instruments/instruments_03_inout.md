---
title: Outputs
description: Inputs and outputs instrument
layout: page
navbar: inst-links
---

{% include page_navbar.html %}


The *Outputs* panel lets you define the signals that are used in
the different hardware outputs.

#  Output signals


![outputs panel]({{ site.baseurl }}/img/outputs_panel.png "Outputs panel"){:style="float: left;margin-left: 7px;margin-top: 7px;"}

The output panel frontend controls a set of demultiplexers that lets you choose between
several signals to feed the DACs (Digital to Analog Converter) of [RedPitaya hardware](TheApp/RedPitaya_board/).

All the selectable signals are 14 bits signed int at 125 MSa/sec (internal clock frequency). The options are:
`in1`, `in2`, `in1-in2`, `sin_ref`, `cos_1f`, `cos_2f`, `cos_3f`, `sq_ref`, `sq_quad`, `sq_phas`, `PID A out`,
`PID B out`, `ctrl_A`, `ctrl_B`, `error`, `aux_A`, `aux_B`

The out1 and out2 port of RedPitaya use 14 bits signed int DAC at 125 MSa/s, that maps
[&nbsp;-8192&nbsp;:&nbsp;8191&nbsp;] int to [&nbsp;-1&nbsp;:&nbsp;1&nbsp;] Volts. In these cases the signals are
feed directly to the DACs.

The slow outputs are filtered PWM outputs at 1 MSa/s, that maps [&nbsp;0&nbsp;:&nbsp;2496&nbsp;] int
to [&nbsp;0&nbsp;:&nbsp;1.8&nbsp;] Volts.
The choosed 14 bits signal is converted before feeding the slow output, following this equation:

```C
slow_outX = (selected_signal + 8192) * 156 / 1024 ;
```

So, a signal whose value is -1 V in the out1 will be 0 V if its used for slow_out3, for example.


{% include page_navbar.html up=1 %}
