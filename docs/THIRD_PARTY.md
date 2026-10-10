# Third-party and upstream notices

This file is the human-readable companion to the short **License** line in Module Settings (under Code / LIB).

Sandbox native ports ship under the [Soundemote Noncommercial Source License 1.0](../LICENSE) unless a module header says otherwise. Upstream projects keep their own terms. Opening **Code** shows the sandbox port; **LIB** shows the upstream or reference file when one is declared.

## Soundemote soemdsp (MIT)

Many modules port or wrap headers from [soundemote/soemdsp](https://github.com/soundemote/soemdsp) (`include/soemdsp/...`). That library is MIT; see its [LICENSE](https://github.com/soundemote/soemdsp/blob/main/LICENSE).

Examples: PolyBLEP, Hyperpluck, Softwave, Ellipsoid, Pluck Envelope, Additive, SuperLove, Noise Generator, and other catalog entries whose LIB URL points at `soundemote/soemdsp`.

## RS-MET (Robin Schmidt)

Several filters and generators are ports of Robin Schmidt’s RS-MET / RAPT / rosic code ([RS-MET on GitHub, branch `work`](https://github.com/RobinSchmidt/RS-MET/tree/work)).

Robin dual-licenses his own DSP (roughly GPL-or-compatible open source, or a separate closed-source arrangement with him). See the RS-MET tree’s LICENSE text. Sandbox inclusion of specific ports is with Robin’s permission where noted in module headers (for example Robin Sinepulse / SweepKicker, 2026-10-06).

LIB URLs for these modules point at specific files under `Libraries/RobsJuceModules/...`, not the repo root.

Examples: Ladder Filter, Dual Ladder, EQ / ZDF family, Phaser, Cookbook, Butterworth / Bessel / Chebyshev / Linkwitz / Elliptic, Crossover, TB-303 filter, Passive Filter, Ray, Robin Sinusoid, Metallic Ratio, and related catalog entries.

## Reference copies under `originalcode/`

Some modules keep an unmodified upstream or historical reference beside the port:

| Module | Reference | Notes |
|---|---|---|
| `chaosfly` | `native_modules/chaosfly/originalcode/Butterfly` | JSFX Elan’s Chaos Generator / Butterfly (reference copy). |
| `flower_child_filter` | `native_modules/flower_child_filter/originalcode/` | Flower Child Filter core (FMD / Soundemote lineage). |
| `sabrina_reverb` | `native_modules/sabrina_reverb/originalcode/` | Historical Sabrina VST sources (reference). |
| `softpop_oscillator` | `native_modules/softpop_oscillator/originalcode/` | Softpop reference material when present. |
| `robin_sinepulse` | `native_modules/robin_sinepulse/originalcode/` | Unmodified RS-MET SweepKicker excerpts; port used with permission. |
| `cookbook_filter` | `native_modules/cookbook_filter/originalcode/` | RS-MET cookbook reference copies. |

Treat `originalcode/` as attribution and parity material. Do not assume those trees are MIT or Soundemote-licensed unless their own notices say so.

## Modules with no LIB link

If LIB is hidden, the module is typically a sandbox-original or JS face without a declared upstream twin. **Code** still opens the sandbox source under the Soundemote Noncommercial license.

## Header overrides

Catalog license fields are derived from `soemdsp-native-lib` when possible. Optional per-module headers:

- `// soemdsp-native-license: ...` — short sandbox/port label (default: Soundemote Noncommercial)
- `// soemdsp-native-license-url: ...` — link for that label (default: repo `LICENSE`)
- `// soemdsp-native-upstream-license: ...` — short upstream label
- `// soemdsp-native-upstream-license-url: ...` — link for upstream terms or this notice

Regenerate `public/native-modules-catalog.json` after header changes (`python scripts/generate_native_modules_catalog.py`).
