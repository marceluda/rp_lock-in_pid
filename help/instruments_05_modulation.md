---
title: Internal Oscillator
description: Modulation
layout: page
mathjax: true
---

{% include instrument_navbar.html %}

Both Lock-in amplifiers have their own internal oscillators for reference signals.
They can also be used as function generator for any other purpose.

## Harmonic functions

The harmonic functions are build into an array of 2520 points of 14 bits signed int stored in Read
Only Memory (ROM) modules in the FPGA layer.

![Harmonic Functions]({{ site.baseurl }}/img/harmonic_mods.png "Harmonic Functions")

All of them are discretized versions of $$cos(\omega t)$$, $$sin(\omega t)$$, $$cos(2 \omega t)$$ and
$$cos(3 \omega t)$$. The discretization was carefully made in a way that all the Fourier orthogonality
relations between them are kept.

The `phase` parameter controls the steps of delay between `cos_ref` and `cos_?f` signals.

The `period` parameter (`hp` inside FPGA) is the number of internal FPGA clock periods that last each point
of the array. The min value of `hp=0` means each points corresponds to a clock period (8 ns), making the
full Cosinus period of $$ \frac{1}{2520 \cdot 8 ns}  = 49.6 kHz$$. With `hp=1`, each point last 16 ns, an so on.

$$ Period = (hp+1) \cdot 8 ns$$

### Schematics of FPGA layer
The following graphic represents the FPGA logic circuit for the harmonic functions generation.
It's not rigorous, for simplicity. Lets you understand the way the parameters affects the generated
functions.

![Harmonic Functions FPGA]({{ site.baseurl }}/img/gen_mod2_harmonic.png "Harmonic Functions FPGA")


<a data-toggle="collapse" href="#Schematics_of_FPGA_layer_harmonic" aria-expanded="false" aria-controls="Schematics_of_FPGA_layer_harmonic">detailed description <span class="caret"></span></a>

<div id="Schematics_of_FPGA_layer_harmonic" class="collapse" markdown="1" style="padding: 10px; border: 1px solid gray; border-radius: 5px;">
Each function is stored in a ROM module. The ROM outputs the value stored in the position
set by the `addr` input.

The `addr` input of the ROM modules for `cos_ref` and `sin_ref` is labeled `cnt` an is fed by a counter that
goes from 0 to 2519 and start again. The counter changes is value at the time rate set by the frequency
divider thats lowers down the frequency of the FPGA internal clock (125 MHz). The lower value mean no division
at all.

The memory modules address for  `cos_f?` functions are fed by the same `cnt` number minus `phase`, so they are
phase shifted respect to `cos_ref` and `sin_ref`. The phase parameter of the Web App control this.
</div>

## Square functions

The square functions are build on the run. They works as frequency dividers applied to the internal FPGA clock (125 MHz).



![Square Functions]({{ site.baseurl }}/img/square_mods.png "Square Functions")

### Schematics of FPGA layer


![Square Functions FPGA]({{ site.baseurl }}/img/gen_mod2_square.png "Square Functions FPGA")

## Web Frontend

![Harmonic Functions web]({{ site.baseurl }}/img/lock-in_panels_modulation.png "Harmonic Functions web")


{% include instrument_navbar.html up=1 %}
