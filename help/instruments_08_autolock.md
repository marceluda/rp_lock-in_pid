---
title: Auto-lock
description: Auto-lock instrument
layout: page
mathjax: true
---

{% include instrument_navbar.html id=8 %}

$$
\definecolor{var}{RGB}{199,37,78}
$$

This instrument is a compilation of tools useful to set up a loop-back
stabilization scheme. The tools were through to ease the procedure of
looking for a desired stabilization condition, starting automatically the
the stabilization system and detecting when the stabilization procedure fails
to take actions.

## System variable stabilization

For the sake of clarity, we describe in the next items the idea behind the
stabilization application.

* You have a system property or variable you want control or stabilize to a fixed value.
* You can measure this variable or some value associated to this variable that
we will call the **system response**.
* You can control the system in some degree using a **control signal** (in this application
  you can use up to two control signals) that changes the state of the system in a way that
  generates a **system response**.
* You cannot control all the system variables. The uncontrolled variables (i.e.: environment,
  random variables, noise, etc) makes undesired changes on the value of the variable you
  want to control and this changes can be measured on the **system response**.
* So, to control or fix the desired variable you build the following stabilization scheme:
  1. You measure the **system response**
  2. You compare the **system response** with a desired value, called **set-point** and
     build an **error** signal: $$ \texttt{error} = \texttt{response} \; - \; \texttt{set-point} $$
  3. You process the **error** signal with a filter. If the **error** signal is 0, the system
     variable is in the desired state. If not, you have to modify the system. The filter that
     process the **error** signals outputs a **correction** signal.
  4. The **correction** signal is added to the actual value of the **control** signal used
     to change the system state.
  5. A well designed filter will output a **correction** signal that will compensate the
     uncontrolled variables changes, making the originally uncontrollable variable a stable well
     controlled variable.


When you apply the **correction** signal to control the system and compensate the undesired
changes you are working in a **closed-loopback** scheme.

When you are studying the system you want to control, you are operating in a **open-loopback**
scheme. For example, if you are measuring the system response and the error signal while
you scan the control signal with a predefined function like a ramp.

The aim of this instrument is to provide tools to identify the conditions suitable
to pass from the **open-loopback** scheme to the **closed-loopback** scheme in order to
make a good stabilization of a desired variable.

## The Lock Control procedure

1. Setup the hardware inputs of the Red Pitaya to measure the system response.
2. Setup the hardware outputs of the Red Pitaya to use control signal `ctrl_A`
and `ctrl_B`.
3. Choose an `error` signal from the PIDs panel.
4. Switch off the "PID A Enable" and  "PID B Enable" buttons from the Lock Control Panel.
5. Configure and start a Ramp scan using the Ramp Panel.
  * Here you can see the system response using one oscilloscope channel, and you can use
    the other channel to see the Ramp position.
  * To ease the next steps it is useful to set up the oscilloscope trigger in external source
    with Normal mode, and choose from the "Ext Trig" menu the "Ramp floor" option. With this
    the oscilloscope trigger will be raised when the Ramp_A reaches the bottom value.
6. If you need it, set the error offset in the PID panel to choose the position where
   error signal crosses zero (que locking position).
7. Configure the PIDs filters
  * Keeping the external trigger configuration, you can use an oscilloscope channel to
    see the `pidX_out` signal and the other one to see the `error` signal.
  * As long  "PID X Enable" switchs are kept off, you can see the `pidX_out` signal in the
    oscilloscope but it is not added nor affect the `ctrl_X` signal you use for output.
8. Now you are ready to lock. With the standard configuration, hitting the "Lock Now" button
   in the Lock Control panel will automatically stop the Ramp (freezing the output value)
   and enable both PIDs. Also, you can configure a Auto-Lock start using the tools of this panel.






{% include instrument_navbar.html up=1 %}
