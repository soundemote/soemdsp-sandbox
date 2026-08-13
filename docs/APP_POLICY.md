# App-wide policy (standing orders)

**Audience:** humans and agents working on soemdsp-sandbox.  
**Status:** binding while the app is **not feature-complete**.  
**Related:** [SANDBOX_DESIGN.md](./SANDBOX_DESIGN.md) (UI aesthetics), [WASM_SLIM_LOAD.md](./WASM_SLIM_LOAD.md), [MODULE_PATTERN_REFERENCE.md](./MODULE_PATTERN_REFERENCE.md).

When in doubt: prefer **honesty, one path, and delete over compatibility**.

---

## 1. No patch backwards compatibility (pre–feature-complete)

While the product is not feature-complete:

- **Do not** add rename bridges, dual param keys, migration layers, or “read `level` if `brightness` missing” shims.
- **Do not** keep dead aliases so old saved patches keep working after intentional renames.
- Renames are **clean**: one key, one label, one code path. Old patches may reset that knob to default — acceptable.

When feature-complete (or when explicitly chosen later): introduce migrations deliberately (versioned patch format), not ad-hoc fallbacks.

---

## 2. No JavaScript fallback modules for DSP

- Module audio/math that has a **native/WASM** path must **not** ship a parallel JS DSP implementation “in case native fails.”
- If native is missing or not ready: **silence / black / inert** (and optional status), not a second algorithm.
- Face/display may present native results (e.g. upload a mono grid) but must **not** re-implement the field/kernel in JS or GLSL for “looks only.”
- Same rule offline: Render Sample must not use a JS twin of a native module (see §5).

---

## 3. Prefer GPU for module display graphics

- Module faces, scopes, fields, phosphor-style displays: **prefer GPU** (WebGL / existing scope GPU paths).
- Avoid CPU pixel loops / 2D canvas full-frame paint for live module displays when a GPU path exists or can be added.
- CPU is OK for: one-shot layout, debug overlays, tiny markers, metadata — not the main live image.

---

## 4. What I See Is What I Hear (WISIWIH)

- Face and audio outputs must share the **same domain mapping and kernel** for a given module (or document a deliberate, labeled exception).
- Do **not** give the face a prettier separate noise/field while jacks sample something else.
- Display-only knobs that change look without affecting the shared signal are a **WISIWIH smell** — either wire them into the shared path or make clear they are cosmetic (prefer wire).

---

## 5. Module DSP lives in one place

**Hosts are not DSP.** Live AudioWorklet, offline/Render Sample, and any main-thread evaluation are **hosts** that call into a single module implementation. They must not each own a different formula for the same module type.

### Single core

- **Module DSP lives in one place** — native/WASM (`native_modules/…`) and/or one pure shared helper (`*-math.js` / stdlib), not a worklet copy and a render copy that can drift.
- Offline and realtime **reference that same core**. The only intentional difference is **scheduling** (device quantum vs bounce length / block size), not the waveshaper, filter, or feedback math.
- Do **not** maintain diverging “worklet version” vs “render version” of the same module without a tracked, labeled reason (and fix the split rather than document it as normal).

### Live chaos and video (one universe)

- While playing: **one** dynamical evaluation (the worklet). Faces, scopes, phosphor, and video **observe** that run (buffers / rings from the worklet). They must not re-simulate the graph with a second set of phases, noise seeds, or integrators.
- **What I see is what I hear** under feedback and chaos requires **one state**, not “same knobs, two sims.”

### Offline / Render Sample

- Offline is the **same modules, same core**, stepped without the audio device clock — not a parallel JS approximation of the live native path.
- Prefer the **same native export** on main thread for render when the live path is native (lazy instantiate WASM; silence until ready — see §2). Do not invent a second algorithm “so offline works before WASM loads.”
- A bounce may be a **new take** (new seeds / cold start). That is still the same engine; it is not license to use different math.

### Dual evaluation is not the goal

- Live A/V sync is **one sim, many observers** — not two full graphs forced to stay identical.
- “Identical pure functions on two threads” still yields two trajectories under chaos if both step state. Prefer capture over re-run for live display.

---

## 6. Transport and status UI must match engine reality

- Play / pause / stop / Output labels and colors follow **actual** live node + output state, not optimistic or stuck UI.
- Do not leave “zombie” engines (muted worklet still up, UI says Off) or green transport when cold.
- Prefer full teardown on failure over silent mute + misleading chrome.

---

## 7. No artificial smoothness on discontinuous domain params

- Parameters that **reshape the domain** (scale, lacunarity, zoom, seed, octaves, …) may jump the field when scrubbed — that is often **correct**.
- Do not invent crossfades or dual-field morphs solely to hide that unless product asks for it.
- Parameter-edit smoothers (one-pole, etc.) are optional UX; they are not a substitute for honest domain math.

---

## 8. Diagnostics and teaching graphics: debug-only

- Probe markers, mode tags, self-test chrome, evidence dumps: **debug UI on** only (e.g. `node-debug-only` / not under `keyboard-debug-hidden`).
- Production/default face stays clean.

---

## 9. Build identity and cache honesty

- Serve a rolling **build token** (and no-store on shell) so humans can confirm they loaded the build they think they loaded.
- When changing public JS that must not be cached stale, bump cache-bust query (or rely on build-token bust of scripts).

---

## 10. Prefer delete and simplify over soft recovery

- Invalid patches / failed loads: **hard fail with clear status**, not silent soft recovery that leaves unknown state.
- Prefer one obvious error path over multiple “best effort” branches that hide bugs.

---

## 11. Naming

- Prefer full, consistent product names where modules are siblings (e.g. **Fractal Brownian Field** next to **Fractal Brownian Noise**).
- Internal type ids (`fbmField`) may stay short; **user-facing labels** should not be cryptic abbreviations unless established brand.

---

## 12. UI stability (see also SANDBOX_DESIGN)

- No mouse-following tooltips / `title` hover clutter.
- No layout jitter from changing labels.
- Calm idle chrome; earn brightness with state.

---

## Quick “should I?” checklist

| Idea | Usually |
|------|---------|
| Keep old param key so last week’s patch works | **No** (pre-feature-complete) |
| JS noise if WASM not ready | **No** — silence / black |
| CPU full-face fractal every frame | **No** — GPU / native grid |
| Face noise ≠ jack kernel | **No** — WISIWIH |
| Smooth scale scrub so it “sounds nice” | **No** unless product asks |
| Probe reticles always on | **No** — debug only |
| Dual path “just in case” | **No** — one path |
| Second formula for offline/render | **No** — same core as live (§5) |
| Re-sim graph for live video/scopes | **No** — observe worklet buffers (§5) |
| JS twin of native “so render works” | **No** — silence until WASM (§2 / §5) |

---

## 13. Stereo jacks: M / L / R (not L / M / R)

App-wide stack order and outlet color. Names keep their color; **Mono is always first**.

| Order | Channel | Outlet RGB |
| --- | --- | --- |
| 1st | Mono (`M`, `In`/`Out` labeled Mono) | Green |
| 2nd | Left (`L`) | Red |
| 3rd | Right (`R`) | Blue |

XYZ is the same RGB **by name** (X red, Y green, Z blue), not by slot.

- Outlet chrome only. Inlets uncolored. Cables do **not** inherit RGB (gold analog / white digital).
- Full write-up: [MODULE_LAYOUT_PLAN.md](./MODULE_LAYOUT_PLAN.md) §11.

---

## Amendments

Add new rules here when the same class of mistake happens twice. Keep this file short and enforceable.
