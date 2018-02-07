---
title: PIDs
description: PIDs instruments
layout: page
mathjax: true
---

{% include instrument_navbar.html id=7 %}

$$
\definecolor{var}{RGB}{199,37,78}
$$

The application has two PID (Proportional-Integral-Derivative) filters designed
to set their parameters in ranges of different orders of magnitude.
Also, the PIDs are combined with auxiliar adders and a multiplexer that makes
the system suitable for scanning and loop-back schemes of control.


## The PID module design

![PID Panel]({{ site.baseurl }}/img/PIDs_scheme.png "PID Panel")

Each PID filter has a multiplexer for input signal selection, controlled
by `pidX_sw` parameter.

`pidA_sw` and `pidB_sw` lets you choose from these input signals:
`error`,
`Xo`,
`Yo`,
`F1o`,
`F2o`,
`F3o`,
`sqXo`,
`sqYo`,
`sqFo`,
`signal_i`,
`Ramp A`,
`sin_ref`,
`cos_ref`,
`cos_1f`,
`cos_2f`,
`cos_3f`,
`sq_ref`,
`sq_quad`,
`sq_phas`,
`aux_A`,
`aux_B`,
`test14`,
`in1`,
`in2`,
`in1-in2`.
All the signals are 14 bit signed int (range:`[-8192:8191]`).

The input signal is processed by the PID filter itself, and the output is:

$$ out = k_p \cdot (sp-in)  +  k_i \cdot \int_0^t{ (sp-in) dt } + kd \cdot \frac{d}{dt}(sp-in) $$

where $$ in $$ is te input signal `pidX_in`, $$ sp $$ is the set-point value `pidX_sp`,
$$ k_p = \frac{\color{var}\texttt{pidX_kp}}{ scale }  $$,
$$ k_i = \frac{\color{var}\texttt{pidX_ki}}{ \tau_i }  $$ and
$$ k_d = \frac{\color{var}\texttt{pidX_kd}}{ \tau_d }  $$.


### Error signal

The default input signal for both PIDs is the `error` signal, that can be selected
from several inputs using the `error_sw` parameter, and can be byased by an `error_offset` amount
for set-point purposes.
This feature ease the signal conditioning tuning for schemes of two PIDs working with the same input.

The `error` signal is used in other panels features.

### Proportional

The proportional part of the PID is set by two parameters: `pidX_kp` and `pidX_PSR`.
The first one is the proportionality factor. The second one a scale to change order of magnitude of the
amplification.

$$ k_p = \frac{\color{var}\texttt{pidX_kp}}{ scale }

`pidX_PSR` lets you chosee the value of $$scale$$ from this options: 1, 8, 64, 1024, 4096. The default value is
1024. This option is hidden by default and appears turning on the "Mor options" button.

With the default scale, if you set `pidA_kp=512` the proportional part of PID A will output a signal with the half
of the amplitude of the input.



### Integral

### Derivative

## Web Frontend

![PID Panel]({{ site.baseurl }}/img/PIDs_panel.png "PID Panel"){:style="float: left;margin-left: 7px;margin-top: 7px;"}


{% include instrument_navbar.html up=1 %}
