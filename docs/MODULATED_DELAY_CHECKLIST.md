# Modulated delay checklist (Delay / Ping Pong / future)

Use before shipping any tempo-sync or free-time delay with a built-in LFO.

## Formula ownership

- **One formula** in native C++ only. No JS DSP twin.
- Document units in the module header and parameter tooltips identically.

### Ping Pong (tempo-sync)

```text
delaySec = max(0, tempoBase + Offset_ms/1000 + LFO_Amp_ms/1000 × lfoBipolar)
```

- `tempoBase` = Numer/Denom × whole note × Sync × (240/BPM)
- **Offset** = static ms trim (not depth)
- **LFO Amp** = absolute ms depth (default > 0 so Rate is audible)
- **LFO Rate** = Hz
- Gold LFO outs = raw bipolar LFO (not × Amp)

### Delay (free time)

```text
readOffset ≈ delaySamples − delaySamples × lfoUnipolar × modAmount
```

- **modAmount** = fraction of delay time (default > 0)
- **modRate** = Hz
- Same Control *slots* as Ping Pong Amp/Rate; **different depth units**

## State that must persist

1. LFO phase / walk / FBM time = **plain fields on the instance** (not nested member-method stores).
2. Cross-block smoke: two `process_block` calls must continue phase (not restart).
3. Block I/O buffers: prefer static arrays keyed by instance, not fields whose addresses are exported from the state struct.

## Defaults

- Depth default **> 0** so Rate/Mod Rate is immediately audible on wet audio.
- Document: Amp/Mod = 0 → Rate still may move CV outs; delay time stays at base (+ Offset).

## Ports / wiring

- Audio outs vs gold LFO/mod outs named clearly.
- Native graph port aliases cover UI labels (`LFO L`, `Mod L`, …).

## Checklist before merge

- [ ] No `*-live-evaluator.js` / JS sample path for this effect
- [ ] Header + tooltips state the same formula and units
- [ ] Cross-block LFO persistence smoke green
- [ ] Default depth audible; Rate changes wow speed with Amp > 0
- [ ] Comments do not say “same as Delay” without naming the unit difference
