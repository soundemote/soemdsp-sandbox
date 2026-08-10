# soemdsp-sandbox

Browser-based modular audio synthesis — patch native C++/WASM DSP modules, watch waveforms live, hear the result. Python file server + modern browser; no package install for the sandbox itself.

### Live demo — [soundemote.io/sandbox](http://soundemote.io/sandbox)

---

## What's inside

- **Live Audio** — AudioWorklet graph; patch modules and hear them in real time
- **Native DSP** — oscillators, filters, envelopes, reverb, chaos generators (C++ → WASM)
- **Scopes** — phosphor / 2D faces for patch visualization
- **Render Sample** — bounce a patch to audio and inspect the waveform

Plugin **hosting** experiments live elsewhere ([soemdsp-sandbox-claphost](https://github.com/soundemote/soemdsp-sandbox-claphost)). This repo is modular authoring only.

---

## Quick start

```powershell
# Requirements: Python 3, a modern browser

git clone https://github.com/soundemote/soemdsp-sandbox.git
cd soemdsp-sandbox
python server.py
# open http://127.0.0.1:8765

python scripts\smoke_test.py   # optional
```

Optional: if a local sibling `soemdsp` build is available, you can resync native artifacts before `python server.py` (see the build docs in that repo).

---

## Docs & reference

| Doc | Topic |
|---|---|
| [`docs/SANDBOX_REFERENCE.md`](docs/SANDBOX_REFERENCE.md) | Sandbox setup / API reference |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | High-level architecture |
| [`docs/ADDING_HARDCODED_SANDBOX_MODULE.md`](docs/ADDING_HARDCODED_SANDBOX_MODULE.md) | Add a hardcoded module |
| [`docs/OSC_MODULE_NON_UI_REFERENCE.md`](docs/OSC_MODULE_NON_UI_REFERENCE.md) | Oscillator module non-UI notes |
| [`VACTROLS.md`](VACTROLS.md) | Vactrol physics & envelope knobs |
| [`POWER_ENGINE_SYNTHESIS.md`](POWER_ENGINE_SYNTHESIS.md) | Spiral / engine synthesis notes |
| [`BEAMING_RADAR_SIGNAL_TO_JEROBEAM.md`](BEAMING_RADAR_SIGNAL_TO_JEROBEAM.md) | Jerobeam module dedication |

---

## Related forks

| Project | Focus |
|---|---|
| [Aliasing Wars](https://soundemote.io/aliasingwars) | Anti-aliased hard-sync / PolyBLEP |
| [Vactrols](https://soundemote.io/vactrols) | Photoconductor-based envelopes |
| [White Wire](https://soundemote.io/whitewire) | Bit-oriented patch wires / LUT cell |
| [Phosphor](https://soundemote.io/phosphor) | CRT-style scope decay |
| [Analog Filters](https://soundemote.io/analogfilters) | Circuit-style filter models (Flower Child family, etc.) |
| [SIMD](https://soundemote.io/simd) | WASM SIMD128 + block-processing boundary |
| [Creatures](https://soundemote.io/creatures) | Patchable virtual pet |
| [Efficient Patch System](https://soundemote.io/efficientpatchsystem) | Multiplayer / performance experiments |

---

## License

Source-available for noncommercial use only. Commercial use requires a separate written commercial license from Soundemote. See [`LICENSE`](LICENSE).

---

## Boundaries

- Server writes only via explicit save / settings / audio helper routes
- Open Path is restricted to Downloads
- Browser patch graph is demo-scoped state
- Browser path is not the production soemdsp scheduler
- Patch files save instances and settings; they do not define new module types
