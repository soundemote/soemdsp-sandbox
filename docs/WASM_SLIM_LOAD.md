# Phase E — Used-modules WASM slim

## Short answer

**Not** “user picks modules in the Module Browser and only those exist.”  
The Module Browser still lists everything.

**Yes** — “only **download/instantiate native WASM** for module types **already on the patch (live plan)**,” when slim mode is on.

Typical use: **iframe / player / clapplayer** loads a fixed patch → only that patch’s native modules are fetched.

---

## Two different things people mix up

| | Module Browser | WASM slim (Phase E) |
|--|----------------|---------------------|
| What | UI catalog of types you *can* place | Which **.wasm binaries** the browser downloads |
| When | Always full catalog (authoring) | On live plan apply / patch load |
| Who decides | You dragging modules | **Patch contents** + load mode |

Adding a module from the browser in **authoring (combined)** does nothing special for WASM — combined already has everything.

Adding a **new native** type under **slim** triggers another fetch on the next plan update (lazy used-modules send).

---

## Modes

| Mode | Who | Behavior |
|------|-----|----------|
| **combined** (default authoring) | Full sandbox | One big `soemdsp_combined.wasm` |
| **slim** | Player / embed | Per-module wasm only for types on the plan |

### Enable slim

1. `?wasmLoad=slim`  
2. Embed auto: `?hideui=1`, `?autostart=1`, `?player=1`, or `?clapplayer=1` → slim unless overridden  
3. `embed-config.json`: `{ "wasmLoad": "slim" }` or `{ "player": true }`  
4. Runtime: `nodeGraphMvp.live.nativeWasmLoadMode = "slim"`  

Force full: `?wasmLoad=combined`.

---

## Flow

```text
Authoring (combined):
  start live → fetch combined once → all natives ready

Player (slim):
  load patch → compile plan → types on plan
    → catalog lookup → fetch only those .wasm
    → worklet instantiate each
  user cannot add random modules (hide UI) OR
  if they can, next plan update fetches any new native type
```

---

## What it does *not* do

- Hide types from the Module Browser in the full app  
- Change DSP math  
- Pre-build a custom wasm on the website (unless you add that later)  

Website/iframe chooses **mode + which patch URL**; the **patch** chooses **which natives**.

---

## Status

- [x] Mode switch + used-only send path  
- [x] Player-ish query/embed hints default to slim  
- [x] Optional fetch metrics — `nodeGraphLiveNativeWasmFetchReport()` + slim debug totals  
- [ ] clapplayer / external player shell default wiring (out of this monorepo)  

## Diagnostics

After Live Audio has loaded native WASM:

```js
nodeGraphLiveNativeWasmFetchReport()
// { mode, fetchCount, uniqueUrls, totalBytes, totalKiB, byUrl: [...] }
```

Auto-log once after load: `?wasmStats=1` (or `nodeGraphMvp.live.debugNativeWasm = true`).

On `window` after load-mode resolve (Live Audio start):

| API | Purpose |
|-----|---------|
| `nodeGraphLiveGetNativeWasmLoadMode()` | `"slim"` \| `"combined"` \| `"unresolved"` |
| `nodeGraphLiveNativeWasmFetchReport()` | totals + per-URL bytes |
| `nodeGraphLiveNativeWasmFetchStats` | raw accumulator |

Live plan status line also shows `/ wasm slim` or `/ wasm combined` when resolved.

Player-style embed example (sibling of `index.html`, not under `public/`):

```json
// embed-config.example.json → copy to ./embed-config.json
{ "player": true, "wasmLoad": "slim" }
```
