# Varispeed Delay

Status: plan only. Do not build until Architect says so.
Date: 2026-09-29.

Doppler is a separate under-construction card in Space. It does not implement this.

## What it is

A stereo delay line whose read head moves at Speed instead of at the sample clock. Pitch stays shifted while Speed stays off 1. This is not Doppler. Doppler only shifts pitch while delay time is moving. To hold a pitch, the read rate itself has to change.

Speed 0.5 by default so the read head falls behind and later speeds up to +2 still have memory to play. Faster than realtime from a cold start runs out immediately. That is acceptable.

## Signal

Per channel, same Speed on both:

input -> write memory -> read at Speed -> HPF -> LPF -> saturation -> Amplitude -> out

Waterfall (stereo) shows the post-saturation signal, before Amplitude. Same waterfall settings as other stereo waterfall faces.

## When the playhead runs out

Silence. No crossfade, no wrap, no slew, no click hider. Running into the write head, or off the end of what was recorded, is the end of the sound.

Speed 0 holds the read head on the last sample it reached (a frozen value), it does not count as click avoidance. Reverse (negative Speed) plays backward through memory that was already written.

## Parameters (locked 2026-09-29)

Do not implement yet.

| Param | Default | Range | Notes |
| --- | --- | --- | --- |
| Memory | TBD | seconds | How much audio can be written. |
| Mix | TBD | wet/dry | Parallel mix. |
| Speed | 0.5 | -2 to +2 | 1 = original pitch. Negative reverses the playhead. |
| Filter Slope | 1 | 1 to 4 | Shared pole count for the passive highpass and lowpass. |
| LPF | open (20 kHz) | Hz, Architect can retune | Passive lowpass, second in the chain. |
| HPF | open (20 Hz) | Hz, Architect can retune | Passive highpass, first in the chain. |
| Saturation | 1 | 0.01 to 4 | Same soft clip as SoemReverb: `soft_clip_coeffs` / tanh in `library/include/soemdsp/nonlinearity/nonlinearity.h`. No new library math. |
| Amplitude | TBD | output level | After saturation. Waterfall is the pre-amplitude signal. |

Chain: signal -> HPF -> LPF -> Saturation -> Amplitude. Display taps before Amplitude.

Do not add feedback, flutter, interpolation quality, or a crossfade.

## Not in this module

- Doppler (moving delay time). Separate Space card, parked, no DSP in this plan.
- Bode frequency shift.
- Sample Player / Sample Looper speed (those play a loaded file, not live input).
