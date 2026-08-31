# Cyan / block-rate from audio-rate modules

## What cyan already is (not “512 samples of future”)

CMYK **C (cyan)** Parameter jacks are **once per audio quantum**, zero-order held:

1. The audio module still runs **every sample** (or native block) as usual.
2. At the end of the quantum (e.g. 128 frames), the worklet publishes **one** value — typically the **last sample** of `Out` — into `nodeOutputs`.
3. Additive / cyan mod inlets **read that single value once** per quantum and hold it for the block (ZOH).

There is **no** precomputed “future block” of envelope shape. It is sample-accurate audio on the gold path, and a **snapshot** on the cyan path.

## Why Additive Envelope existed

Efficient Yellow Graph folds mods from `nodeOutputs`. Controllers (Knob) publish there; **Curve Envelope’s gold Out did not always land in that map for cyan consumers** in a way faces/mods expect. The Additive Envelope duplicate was a block-rate publisher, not a different DSP.

## Goal: no module copies

Prefer **one** Curve Envelope:

- Gold `Out` stays sample-accurate for audio.
- When a cable lands on a **cyan** mod inlet (or Out is listed in `blockRateOutputs`), the efficient path already can ZOH-publish last sample — ensure Curve Envelope is included in that publish pass (same as native graph harvest / controller sidecar).

## UpdateOnTrigger (shipped on Curve Envelope)

Separate concern: knob/mod changes mid-note. **UpdateOnTrigger On** latches Delay/Attack/Decay/Sustain/Release/shapes/Loop/Level on Gate rising edge so tweaking Decay does not reshape the current stage until the next trigger.

## Messiness of “if turquoise, send a block of future data”

**High mess / wrong model** if it means simulating the next N samples of every gold module for cyan. **Low mess** if it means: keep computing audio as now; **publish one ZOH sample per quantum** when the destination is cyan (or always publish last Out into `nodeOutputs` for modules that can be mod sources). That matches existing CMYK C policy and avoids twin modules.
