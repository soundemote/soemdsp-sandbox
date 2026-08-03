# Phase E — Used-modules WASM slim

## Problem

Authoring prefers **`soemdsp_combined.wasm`**: every native module, one shared
memory (avoids Chrome’s per-process WASM memory cap). That is large to
download and slow to cold-start for a **player** that only uses a few types.

## Modes

| Mode | When | Behavior |
|------|------|----------|
| **combined** | Default (authoring) | Fetch combined binary once; all natives available |
| **slim** | Player / embed / clapplayer | Fetch only wasm for **types on the current plan** |

### How to enable slim

1. Query: `?wasmLoad=slim` (aliases: `used`, `used-modules`)  
2. Or `?nativeWasm=slim`  
3. Or `embed-config.json`: `{ "wasmLoad": "slim" }` or `{ "nativeWasmLoad": "slim" }`  
4. Or at runtime: `nodeGraphMvp.live.nativeWasmLoadMode = "slim"` before live start  

Force combined: `?wasmLoad=combined` (aliases: `full`, `all`).

## Implementation

`sendNodeGraphLiveNativeModules` in `node-graph-live-runtime.js`:

- Resolves mode once via `nodeGraphLiveResolveNativeWasmLoadMode()`  
- **slim** → `sendNodeGraphLiveNativeModulesUsedOnly` (catalog filter × plan types)  
- **combined** → existing combined send; on missing binary, falls back to used-only  

Adding a new native module on the patch re-runs send on plan update; already-sent
modules are skipped (idempotent `sent` set).

## What it affects

| | |
|--|--|
| Download size / cold start | Yes (slim) |
| Sound / formulas | **No** (if deps load) |
| Risk | Slim + huge native set → many memories; prefer combined for big patches |

## Status

- [x] Mode switch + used-only path wired  
- [ ] clapplayer / site embed defaults to slim  
- [ ] Optional fetch-byte metrics  
