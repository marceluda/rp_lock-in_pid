---
title: Ramp generator
description: Ramp generator instrument
layout: page
---

{% include instrument_navbar.html id=6 %}

The Ramp generator instrument is used to make configurable triangle functions for
scanning purposes.

The FPGA module generates two signals: `ramp_A` and `ramp_B`.
`ramp_B` is a copy of `ramp_A` with an scale factor.

## Ramp module operation

There are four parameters to control the ramp signals shapes:
`ramp_step`, `ramp_low_lim`, `ramp_hig_lim` and `ramp_B_factor`.

Another 3 parameters are used to control de behavior:
`ramp_direction`, `ramp_reset` and `ramp_enable`.

![Ramp Signal]({{ site.baseurl }}/img/ramp_signal.png "Ramp Signal")



| Parameter        | Range of values  | Web GUI control | Description                                                                                                                         |
|------------------|------------------|-----------------|-------------------------------------------------------------------------------------------------------------------------------------|
| `ramp_step`      | `[0:4294967295]` | Ramp Step       | The module waits `(ramp_step+1)` clock ticks ( (`ramp_step`+1) ⋅ 8 ns ) in ecah value, before jumping to the next one.                          |
| `ramp_hig_lim`   | `[-8192:8191]`   | Ramp high limit | The highest value that `ramp_A` signal can have. When `ramp_A` is going upward and reachs `ramp_hig_lim` it starts going downward.  |
| `ramp_low_lim`   | `[-8192:8191]`   | Ramp low limit  | The lowest value that `ramp_A` signal can have. When `ramp_A` is going downward and reachs `ramp_low_lim` it starts going upward.   |
| `ramp_B_factor`  | `[-8192:8191]`   | Ramp B factor   | `ramp_B` value is defined by `ramp_A` and this parameter: $$ bla $$                                                                 |
| `ramp_enable`    | `[0:1]`          | Ramp enable     | If set to True (1), the ramp signals advance. If set to False (0), stop.                                                            |
| `ramp_reset`     | `[0:1]`          | Ramp reset      | If set to True (1), both signals are set to zero                                                                                    |
| `ramp_direction` | `[0:1]`          | Ramp direction  | This defines the starting direction (True : upward )                                                                                |







## Web frontend


![Ramp Panel]({{ site.baseurl }}/img/ramp_panel.png "Ramp Panel"){:style="float: right;margin-right: 7px;margin-top: 7px;"}



{% include instrument_navbar.html up=1 %}
