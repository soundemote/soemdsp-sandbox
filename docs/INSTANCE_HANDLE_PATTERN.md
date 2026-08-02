# Native Module Instance Handle Pattern

Design proposal for a general instance handle pattern for native
(C++ -> wasm) sandbox modules. Forward-looking — not yet implemented.

## Problem

Current native modules use two different state models:

- `ellipsoid` — file-scope `double` globals. Single-instance only. Multiple
  nodes in one graph share the same globals, so X/Y/mono reads return
  whichever node ran last. Safe today only because the worklet reads
  synchronously per-node, but not a template for stateful modules.
- `sabrina_reverb` — fixed pool of 2 instances via
  `states[kMaxInstances = 2]` indexed by an instance id. Better than
  globals, but hard-caps at 2 nodes and requires manual index management.

Neither scales. A general handle pattern lets future stateful native
modules be multi-instance safe without per-module state-pool boilerplate.

## Proposed export shape

Every stateful native module exports:

```text
soemdsp_<module>_create()                              -> i32 handle
soemdsp_<module>_destroy(handle: i32)                  -> void
soemdsp_<module>_reset(handle: i32)                    -> void
soemdsp_<module>_set_params(handle: i32, ...)          -> void
soemdsp_<module>_process(handle: i32, ...)             -> output
```

Stateless modules (like `ellipsoid` today) can skip the handle and keep
the current direct-export shape. The handle pattern is opt-in for modules
that need per-instance state.

## Handle semantics

- `create` returns an opaque `i32` handle. The handle is an index into a
  fixed-size state pool allocated in wasm linear memory.
- `destroy` releases the slot. The slot can be reused by a later `create`.
- `reset` clears state without destroying the slot.
- `set_params` and `process` take the handle as the first argument.

The pool size is bounded by a compile-time constant (e.g. 32 instances)
to keep wasm memory allocation fixed. The browser never sees the pool
directly; it only sees the handle.

## Browser-side integration

The worklet (`node-live-audio-worklet.js`) currently hardcodes module
routing by name at lines 364 (`ellipsoid`) and 374 (`sabrina_reverb`).
A general loader would:

1. On `setNativeModuleWasm`, store the wasm exports keyed by module name.
2. On plan application, for each native module node, call `create` and
   store the handle keyed by node id in a `Map<string, number>`.
3. On `stop` or plan replacement, call `destroy` for each active handle.
4. On frame evaluation, call `process(handle, ...)` for the node.

This avoids hardcoding module names in the worklet. New native modules
register via the `// soemdsp-native-*` header convention and the server's
`/api/native-modules` catalog, and the worklet loads them generically.

## State pool layout (C++ side)

```cpp
namespace {
constexpr int kMaxInstances = 32;
struct ModuleState {
  bool active;
  // ... module-specific state fields ...
};
ModuleState g_states[kMaxInstances];
}

extern "C" {
int soemdsp_module_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!g_states[i].active) {
      g_states[i] = {};
      g_states[i].active = true;
      return i;
    }
  }
  return -1;  // no free slot
}

void soemdsp_module_destroy(int handle) {
  if (handle < 0 || handle >= kMaxInstances) return;
  g_states[handle].active = false;
}

void soemdsp_module_reset(int handle) {
  if (handle < 0 || handle >= kMaxInstances) return;
  // reset state fields, keep active
}

void soemdsp_module_process(int handle, /* inputs */, /* outputs */) {
  if (handle < 0 || handle >= kMaxInstances) return;
  ModuleState& state = g_states[handle];
  // ... process using state ...
}
}
```

## Migration path

1. `ellipsoid` — keep as-is (stateless, safe under current call pattern).
   No migration needed until a second ellipsoid node is required in one
   graph.
2. `sabrina_reverb` — migrate from `states[kMaxInstances=2]` pool to the
   general handle pattern when Codex finalizes the Sabrina export shape.
   The fixed pool of 2 is a special case of the general pattern; migration
   is mostly renaming `create`/`destroy` to the standard exports and
   raising `kMaxInstances`.
3. Future stateful modules — use the handle pattern from the start. The
   `MODULE_PATTERN_REFERENCE.md` native section documents this as the
   recommended shape.

## Boundaries

- This is a sandbox-only pattern. The production `soemdsp` runtime uses
  binding metadata and externally owned DSP memory; the wasm handle pool
  is the sandbox's equivalent for browser-resident native modules.
- The handle pool does not replace the `soemdsp` binding layer. It is a
  browser-side instance management convenience for wasm modules.
- Stateful modules that need to persist state across render sessions must
  save/restore through a module-specific state blob in patch JSON.

## Open questions

- Pool size: 32 instances may be too few for large patches with many
  native reverb nodes. Make it configurable? Or rely on the fact that
  native modules are heavyweight and few in number per patch?
- Thread safety: the worklet is single-threaded, so no locking needed
  inside wasm. The browser main thread never calls wasm process directly.
- Handle validation: should invalid handles log a warning or silently
  return zero output? Current modules silently return zero; the handle
  pattern should match that for consistency.
