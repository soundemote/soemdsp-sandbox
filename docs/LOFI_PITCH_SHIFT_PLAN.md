# Lo-Fi Pitch Shift Plan (Component-First)

Status: planning note for later. Not an implementation contract yet.  
Aesthetic: **lo-fi / abusable** — artifacts are the musical material, not bugs to hide.  
Date captured: 2026-08-01.

## Goal

Build realtime pitch-related tools for the soemdsp sandbox modular graph that:

- Sound **characterful** under extreme settings (choppy, metallic, smeared, chipmunk/demon).
- Stay **cheap enough** for AudioWorklet / WASM at typical block sizes.
- Ship as **useful modules at every layer**, not only as one monolithic “pitch shifter.”

**Do not start with** clean modern stretch libraries (Signalsmith Stretch, Rubber Band R3) as the primary product. Those optimize *away* the dirt we want. They remain optional later as a separate “clean” path if ever needed.

## Product principle: lowest components first

> Build the lowest components as individual modules. Perfect each component.  
> Then compose them. **Each component is useful by itself.**

This matches the sandbox modular philosophy: users patch effects; we do not only ship closed black boxes.

```text
Layer 0  — Delay / buffer primitives
Layer 1  — Read-head / varispeed / scrub
Layer 2  — Granular engine (windowed grains)
Layer 3  — Pitch-from-grains (rate + density)
Layer 4  — Optional spectral dirt (simple phase vocoder)
Layer 5  — Composites / presets (“lofi pitch”, “swarm”, “freeze”)
```

Each layer can ship and stay in the catalog forever.

---

## Context from research (summary)

### Clean / high-quality (defer for HQ module later)

| Library | License | Notes |
|---------|---------|--------|
| **Signalsmith Stretch** | MIT | Excellent poly pitch/time; header-friendly C++; too clean for lo-fi-first. Good *reading* (ADC talk / design blog). |
| **Rubber Band** | GPL or commercial | Industry standard; RT mode exists; license fork for proprietary distro. |
| Commercial (élastique, etc.) | Paid | Skip for sandbox default path. |

### Abuse-friendly algorithms (primary)

| Algorithm | Musical abuse | Fit for sandbox |
|-----------|---------------|-----------------|
| **Granular pitch** (resample grains + OLA) | Grain size, density, jitter, window, feedback | **Best default stack** |
| **Simple phase vocoder** (STFT, weak phase) | Short windows, bad hop, freeze | Spectral mush / robot |
| **WSOLA / SoundTouch-class** | Short frames, extreme ratios | Plastic / karaoke character |
| **Varispeed delay / ring scrub** | Flutter, wrap, feedback | Tape / DJ / zipper |
| **PSOLA-ish** | Peak-locked grains | Vocal cartoon/monster; harder |

**Dirty combos (product gold):** grains → bitcrush / SR reduce; multi-voice detune; feedback around pitch; spectral freeze into pad.

Signalsmith material remains valuable as **education** (how good pitch works). For *this* plan, treat Stretch as the opposite of the aesthetic—or a future “HQ Pitch” module, not Layer 0–3.

---

## Component roadmap (individual modules)

Each item below should be a **real module** (or a clear reuse of an existing one) with ports, params, and a short “abuse guide” in catalog notes.

### Phase A — Buffer primitives (Layer 0)

| Module (working name) | Alone useful for | Core idea |
|----------------------|------------------|-----------|
| **Tape Delay / Buffer** (may already exist as delay family) | Echo, slapback | Fixed or modulatable delay line |
| **Write Head** (or delay with freeze/write enable) | Loopers, glitch | Continuous write into a buffer |
| **Read Head** | Scrub, reverse, freeze | Independent read pointer |

**Ship criteria:** stable buffer length control, no zipper on smooth delay time (or intentional zipper as a switch), clear latency/docs.

**Reuse check:** `delay_effect`, `wall_delay`, `ping_pong_delay` — document what already covers Layer 0 before inventing duplicates.

### Phase B — Varispeed / scrub (Layer 1)

| Module | Alone useful for | Abuse knobs |
|--------|------------------|-------------|
| **Varispeed Delay** | Tape stop/start, DJ pitch without “preserving formants” | Rate, buffer size, feedback, flutter |
| **Buffer Scrub** | Manual / CV scrub through recent audio | Position, speed, wrap mode |

**Ship criteria:** musical under ±1–2 octaves of rate; feedback stable until user asks for scream; mono first.

### Phase C — Grain engine (Layer 2)

| Module | Alone useful for | Abuse knobs |
|--------|------------------|-------------|
| **Grain Delay / Cloud** | Ambient clouds, stutter, texture | Grain size, density, spray/jitter, window, reverse grain chance |
| **Grain Freeze** | Pads from any input | Capture window, density, pitch offset per grain |

**Ship criteria:** no mandatory pitch shift yet—grains at 1.0 rate already justify the module. Document click vs Hann window as intentional tone.

### Phase D — Pitch-from-grains (Layer 3)

| Module | Alone useful for | Abuse knobs |
|--------|------------------|-------------|
| **Grain Pitch** / **Lofi Pitch** | Classic lo-fi pitch FX | Pitch (semitones or ratio), grain size, density, jitter, feedback |
| **Grain Choir** (optional) | Detuned swarm | Voice count, detune spread, stereo width later |

**Ship criteria:** default preset already “cassette”; abuse preset tiny grains + feedback; mono In→Out; documented latency if any.

### Phase E — Spectral dirt (Layer 4, optional)

| Module | Alone useful for | Abuse knobs |
|--------|------------------|-------------|
| **Phase Vocoder** (simple) | Robot, wash, freeze | FFT size, hop, freeze, bin shift / pitch |
| **Spectral Freeze** | Drones | Capture, fade |

Only after grains feel finished. Do not block Phase D on this.

### Phase F — Composites (Layer 5)

| Module or preset pack | Idea |
|----------------------|------|
| **Lofi Pitch** (composite shell or documented patch) | Grain Pitch + optional crush/SR |
| **Scream Feedback** | Pitch + feedback + limiter |
| **Swarm** | Multi-voice Grain Pitch |

Composites may be:

- a **factory patch** / cookbook entry, and/or  
- a **single module** that internalizes A–D only after those modules exist and are good.

Prefer cookbook/patch first; ship a combined module only if users still want one box.

---

## Suggested I/O and param shapes (later implementation)

### Grain Pitch (canonical end-state of Phase D)

```text
In  → Out
Optional: Mix (dry/wet) as param or second path

Pitch        ±12 or ±24 st  (or 0.25×–4× rate)
Grain size   ~5–100 ms
Density      overlaps / rate
Jitter       position spray
Window       Hann ↔ rect (click amount)
Feedback     0…almost 1
```

### Shared conventions

- Mono first; stereo only when mono is solid.
- Mark heavy modules for CPU / constraint UI if needed.
- Prefer WASM/native when grains get dense; JS worklet OK for prototypes.
- Follow `docs/ADDING_HARDCODED_SANDBOX_MODULE.md` / native module pattern when building.

---

## Explicit non-goals (for this plan)

- Zero-latency high-quality polyphonic pitch of full mixes.
- Formant-corrected “transparent” shift as the default path.
- Shipping Signalsmith Stretch / Rubber Band as the **first** pitch module.
- Blocking useful intermediate modules until a mega-shifter is perfect.

---

## Decision log

| Decision | Choice | Why |
|----------|--------|-----|
| Aesthetic | Lo-fi / abusable | User priority: musical artifacts |
| Architecture | Component modules first | Each layer is useful alone; matches modular graph |
| Primary algorithm family | Granular + varispeed buffer | Cheap, controllable dirt |
| Clean stretch libs | Defer | Too clean; license/CPU for Rubber Band |
| Signalsmith Stretch | Reference / future HQ only | MIT and excellent, wrong first product |

---

## Resume checklist (when picking this up)

1. Audit existing delay/buffer modules — map to Layer 0 / B gaps.  
2. Spec **Grain Delay** ports/params (no pitch) and ship.  
3. Spec **Varispeed Delay** if not covered by existing delay.  
4. Add pitch rate to grains → **Grain Pitch**.  
5. Cookbook patches that chain crush / feedback / multi-voice.  
6. Only then consider a combined UI module or HQ Stretch path.

## Related reading (external)

- Signalsmith Stretch design: https://signalsmith-audio.co.uk/writing/2023/stretch-design/  
- Signalsmith Stretch code: https://signalsmith-audio.co.uk/code/stretch/ (MIT; GitHub mirror)  
- ADC22 “Four Ways To Write A Pitch-Shifter” (Geraint Luff) — useful taxonomy; prefer *simple* methods for lo-fi  
- Rubber Band: https://breakfastquay.com/rubberband/ (GPL / commercial)

## Related sandbox docs

- `docs/ADDING_HARDCODED_SANDBOX_MODULE.md`  
- `docs/MODULE_PATTERN_REFERENCE.md`  
- `docs/FUTURE_PLANNING.md` (index entry)

---

*End of plan. Implementation starts only when this file is deliberately pulled into active work.*
