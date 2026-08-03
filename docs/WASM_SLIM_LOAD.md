# Phase E — Used-modules WASM slim (load size)

## Problem today

Native DSP is often shipped as:

- many per-module `.wasm` files, and/or  
- one **combined** `soemdsp_combined.wasm` that contains *all* native modules

The sandbox currently prefers the **combined** binary so every module is
available without juggling many WASM memories (browsers cap how many you can
have). That is great for **authoring** (any module can be added instantly) but
costs **download size and cold-start time**, especially for a **player** that
only needs the modules on one patch.

## What “used-modules slim” means

On load (or plan apply):

1. Walk the patch graph → set of module **types** in use.  
2. Resolve native dependencies for those types (from `native-modules-catalog.json`).  
3. Fetch/instantiate **only** that WASM set (or a smaller combined subset).  
4. If the user adds a new native module later, fetch its WASM then.

## What it affects

| Area | Effect |
|------|--------|
| **Player / embed / clapplayer** | Smaller first paint; faster start |
| **Authoring sandbox** | Optional; full combined can stay the default |
| **DSP behavior** | **None**, if the right modules still load |
| **Risk** | Missing dep → module silent or JS fallback |

## What it does *not* do

- Change formulas or sound  
- Remove modules from the catalog  
- Replace C++ — only changes **which binaries are transferred**

## Relation to Phase A

Phase A (shared pure JS) reduces *duplication* of math.  
Phase E reduces *bytes over the network* for native code. Complementary.

## Rough approach (when implemented)

```text
patch.nodes → usedTypes
  → catalog filter wasmAvailable
  → if player: fetch each needed wasm (or prebuilt slim packs)
  → if authoring: keep combined unless user enables "slim load"
```

Status: **not started** (design only).
