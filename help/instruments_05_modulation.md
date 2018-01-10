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

The harmonic fucntions ar build into an array of 2520 points of 14 bits signed int.

![Harmonic Functions]({{ site.baseurl }}/img/harmonic_mods.png "Harmonic Functions")

All of them are discretized versions of $$cos(\omega t)$$, $$sin(\omega t)$$, $$cos(2 \omega t)$$ and $$cos(3 \omega t)$$. The discretization was carefully made in a way that all the orthogonality relations between them are kept.

The `phase` parameter controls the steps of delay between `cos_ref` and `cos_?f` signals.

The `period` parameter (`hp` inside FPGA) is the number of internal FPGA clock periods that last each point of the array. The min value of `hp=0` means each points corresponds to a clock period (8 ns), making the full Cosinus period of $$ \frac{1}{2520 \cdot 8 ns}  = 49.6 kHz$$. With `hp=1`, each point last 16 ns, an so on.

$$ Period = (hp+1) \cdot 8 ns$$


## Square functions


![Square Functions]({{ site.baseurl }}/img/square_mods.png "Square Functions")


{% include instrument_navbar.html up=1 %}
