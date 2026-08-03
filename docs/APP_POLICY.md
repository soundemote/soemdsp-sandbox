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

## 5. One code path for main-thread and worklet math

- Prefer **same algorithm** in live worklet and offline/main evaluation (shared native, shared pure helpers).
- Do not maintain diverging “worklet version” vs “render version” of the same module math without a tracked reason.

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

---

## Amendments

Add new rules here when the same class of mistake happens twice. Keep this file short and enforceable.
