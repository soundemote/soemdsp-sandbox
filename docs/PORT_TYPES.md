# Strict port types

One jack name, one type. Types are metadata (`portTypes` on the module def, or legacy heuristics). They are **not** a second jack list.

## Types
| type | meaning | look |
|------|---------|------|
| `audio` | CV / audio (default) | round |
| `digital` | gate / trigger / reset-style | white round |
| `noteMask` | note bus | square + bus color |
| `code` | text / curve payloads | white square |
| `data` | generic non-audio data | data plane |
| `graphChunk` | Additive Yellow Graph chunks | yellow |
| `blockRate` | Additive cyan Parameter / once-per-quantum | cyan |
| `setup` | Setup param (once-per-quantum automatable, not realtime) | purple square |
| `texture` | TV / RGBA video-style taps (📺) | reserved |

No MIDI type. No phase/frequency subtypes.

## Rules
- List each jack once in `inputs`/`outputs` (or once in `dataInputs`/`dataOutputs`).
- `codeInputs` / `digitalInputs` / etc. only **tag** behavior for legacy defs; prefer `portTypes`.
- Overlapping names in signal+data jack lists throw at build.
- Wires connect **same type only**, except:
  - `audio` ↔ `digital` (white gates/triggers are voltages; Knob can drive 2t D)
  - `audio` / `digital` **into** `setup` (Knob/OSC sampled once per quantum). `setup` does not feed analog.
- Mismatch → no connection + wire-break animation.
- Cable color is owned by the **output** jack (no from→to color transition).
- `setup` is a parameter class (`setup: true` on the param). Jacks live on the param row (not left-column IO). Paint is existing param purple (`#c44dff` / `#b184ff`), **square**. Cyan stays Additive / graphics.
