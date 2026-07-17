# WebUI CLAP Host Plan

Status: Phase 1, initial Phase 3, initial Phase 4, initial Phase 5, and initial Phase 6 prototype started. The localhost health/version host exists and supports browser CORS/preflight access. The host can discover `.clap` paths through scan folders and explicit `--plugin` paths. With `--inspect-metadata`, the host can read native CLAP plugin descriptors in isolated probe subprocesses. With `--test-instantiate`, the host can create, initialize, and destroy plugin instances in isolated probe subprocesses. The browser has a `CLAP Plugin` module shell that can store a selected catalog entry, request/delete a host instance, read host capabilities, read host config, read host audio port metadata, read host parameter metadata, read per-instance `clap.gui` editor capability, open and close supported non-floating Win32 `clap.gui` editors through the local host when the plugin accepts the GUI sequence, read per-instance `clap.latency`, read per-instance `clap.tail`, read/save/restore per-instance `clap.state`, persist host parameter values and saved plugin state in patch data, restore stored parameter values into a host instance, and write host parameter values. Host-discovered CLAP parameters now expose sandbox modulation input ports and slider-output ports. The instance API can keep initialized plugin instances alive, serialize access to the instance table and native instance operations, read CLAP audio ports, read CLAP parameter metadata, report editor capability through `GET /instances/:id/editor`, attempt supported Win32 plugin editors through `POST /instances/:id/editor/open`, close opened plugin editors through `POST /instances/:id/editor/close`, report latency through `GET /instances/:id/latency`, report tail length through `GET /instances/:id/tail`, save state through `GET /instances/:id/state`, load state through `POST /instances/:id/state`, set one parameter plain value through `POST /instances/:id/param`, set multiple parameter plain values through `POST /instances/:id/params`, run bounded offline process calls that can accept and return planar float audio as JSON arrays or base64 float32 channels, keep an offline render session active across multiple process chunks, reject overlapping non-idle render sessions, release abandoned render sessions after an idle timeout, and run a bounded `/process-batch` request for multiple process items. `/health` now reports `hostConfig` with bind host, port, Python executable, script path, working directory, scan dirs, explicit plugins, and probe flags. Host instances now report a safety latch, mute non-finite or excessive raw output, expose `POST /instances/:id/safety/reset`, and publish `maxProcessFrames`, `processBatch`, `offlineRenderSessions`, `renderSessionIdleTimeoutSeconds`, `pluginEditorOpening`, and `pluginStatePersistence` capabilities. Render Sample has an initial bounded bridge that renders reachable CLAP nodes chunk-by-chunk in graph order, requires `audioProcessing: true`, requires `offlineRenderSessions: true`, opens one host render session per reachable CLAP Plugin instance, chunks process calls by the host-reported frame limit, sends effective chunk-start CLAP parameter values inside each process request, sums incoming graph wires into all CLAP input port lanes, calls the host through `planar-f32-base64`, compensates reported CLAP latency when injecting returned output, appends bounded finite CLAP tail frames when reported before the render pass, records reported infinite CLAP tails as metadata, injects all CLAP output port lanes, batches independent CLAP nodes in the same chunk when the host supports it, blocks the render if host safety mutes a CLAP node, closes host render sessions after processing, and rejects feedback edges that touch CLAP Plugin nodes. Live Audio now blocks plans containing CLAP Plugin nodes with a clear status instead of silently routing plugin output. WebSocket transport, packaging, sample-accurate plugin-parameter automation, feedback-safe CLAP scheduling, and Live Audio graph routing are not implemented.

Update 2026-07-17: the connection UI is re-enabled (see "Current state" under Phase 2). File-based CLAP presets exist (save/load a configured node, see "Design Direction" below Phase 2). Phase 8 Live Audio has started under Architecture A (host owns its own real-time audio device, verified against a real installed instrument) -- see Phase 8 for what's implemented vs. not.

Working name:

```text
Soundemote WebUI CLAP Host
```

Cleanup pass (2026-06-28, branch `void/sandbox-bugfixes`):

- CLAP feedback now surfaces at plan time (`compileNodeGraphExecutionPlan`),
  not only at render time.
- CLAP latency/tail errors log via `console.warn` instead of silently
  degrading to zero.
- CLAP output buffer is padded by one process chunk to absorb latency
  compensation shift.
- The `/shutdown` route on the host tool is documented in its README.
- The disconnect error message mentions the under-construction state and
  the local `.cmd` launcher path.
- The connection UI is intentionally disabled via
  `nodeGraphClapHostUnderConstruction = true`. See Phase 2 for the
  re-enablement checklist.

## Purpose

Add CLAP plugin support to the browser sandbox through a local native companion app.

The browser remains the modular interface. The local native host owns plugin scanning, plugin loading, plugin processing, filesystem access, and audio safety.

```text
Browser Sandbox
    |
    | WebSocket / localhost HTTP
    |
Soundemote WebUI CLAP Host
    |
    | Native CLAP API
    |
User CLAP Plugins
```

## Boundary

The browser must not load CLAP plugins directly.

The browser must not own native plugin safety, plugin filesystem access, or plugin audio processing.

The browser sends patch/control/render requests. The native host owns native plugin work.

## User Flow

1. User opens the sandbox.
2. Sandbox shows `CLAP Host: Not Connected`.
3. User runs the local companion app.
4. Sandbox connects to localhost.
5. Sandbox receives plugin catalog and plugin metadata.
6. User adds a `CLAP Plugin` module.
7. Sandbox controls parameters and routing.
8. Native host processes render requests.

Initial UI copy:

```text
CLAP Host: Not Connected
[Download Host] [Connect Local Host]
```

## Phase 1: Local Host Prototype

Prototype path:

```text
tools/webui-clap-host/webui_clap_host.py
```

Build the smallest native executable that can:

- start a localhost server;
- answer health checks;
- report host version;
- expose a small JSON API;
- shut down cleanly.

Recommended first port:

```text
47991
```

Endpoints:

```text
GET /health
GET /version
```

The host sends CORS headers and supports `OPTIONS` preflight so the sandbox page can call localhost from the browser.
The host also supports `GET /diagnostics` for the running HTTP host and `--doctor` for a JSON preflight report that exits without starting the HTTP server.

Example response:

```json
{
  "ok": true,
  "name": "Soundemote WebUI CLAP Host",
  "version": "0.1.0"
}
```

No plugin loading in Phase 1.

Run the current prototype:

```powershell
python tools\webui-clap-host\webui_clap_host.py
tools\webui-clap-host\start_webui_clap_host.cmd
tools\webui-clap-host\start_webui_clap_host.ps1
```

The Windows launchers start the same Python prototype with descriptor inspection enabled by default.

## Phase 2: Browser Connection UI

Add sandbox connection state:

```text
CLAP Host: Disconnected / Connected / Error
```

Controls:

- `Host` URL field
- `Connect Local Host`
- `Copy Host Command`
- `Download Host` later
- `Retry`

The first implementation can poll:

```text
http://127.0.0.1:47991
```

The browser Host field can override the localhost URL. The native prototype supports `--host` and `--port`.

### Current state (2026-07-16)

The connection UI is re-enabled: `nodeGraphClapHostUnderConstruction = false`
in `public/node-graph-clap-host.js`. `bindNodeGraphClapHostControls` wires
Connect/Plugins/Diagnostics normally.

Verified against a real local host with 21 installed CLAP plugins: Connect
reaches the running host, the catalog populates with real plugin
descriptors, and creating an instance (`Crisp`) returns real native audio
port metadata (`Input`/`Output`, stereo, 2 channels each).

Re-enabling surfaced a real bug, now fixed: `GET /plugins` re-scanned and
re-inspected every plugin's descriptor from scratch on every request (each
inspected plugin spawns an isolated probe subprocess), taking ~4.8s for 21
plugins on this machine. The browser's automatic post-connect scan used a
6000ms timeout, which was not reliably enough headroom, and produced
`plugin catalog error: plugin scan timed out` on the first connect. Fixed
with a server-side cache (`cached_discover_clap_plugins` in
`webui_clap_host.py`): the scan result is cached for the process's
lifetime (scan dirs/explicit plugins/inspection flags are fixed at
startup, so this is safe), and `GET /plugins?refresh=1` bypasses it.
`refreshNodeGraphClapHostPlugins(forceRefresh)` in
`public/node-graph-clap-host.js` threads this through: the automatic
post-connect scan reads the cache (fast after the first warm), and the
"Refresh Plugins" button passes `true` to see newly-installed plugins.

The render path (`nodeGraphRenderExternalClapOutputs` in
`public/node-graph-render-output.js`) still requires a connected host for
any patch containing a `clapPlugin` node.

Remaining from the original re-enablement checklist:

1. Set `nodeGraphClapHostUnderConstruction = false` (done).
2. Verify `bindNodeGraphClapHostControls` wires Connect/Plugins/Diagnostics
   correctly against a running local host (done, see above).
3. Surface CLAP feedback at plan time (done).
4. Surface CLAP latency/tail errors in debug status (done).
5. Audit render-tail/latency compensation (still partial — output buffer is
   padded by one process chunk to absorb latency shift, but trailing
   `latencyFrames` of output remain zero. Proper fix: pre-query latency from
   host before render, add to `engineFrames`, trim output).

## Design Direction (2026-07-16) — CLAP Presets

Discussed and agreed: a discovered-but-unconfigured `CLAP Plugin` module
stays a single generic catalog entry (not one entry per installed plugin —
that would need the Module Browser to merge in a dynamic, host-dependent
list, which is materially more work for a static-catalog UI). Instead, a
configured node (plugin selected, params set) is already a complete,
self-describing preset, since patch nodes are plain JSON
(`clap: {catalogId, clapId, path, name, ...}`, `params`, saved
`clap.state`) — so presets reuse that shape rather than inventing a new
data model, and copy/duplicate of a configured node already worked before
any of this for reuse *within* a session.

### Implemented (2026-07-17)

Presets are files, matching the same "native host owns filesystem access"
boundary CLAP plugin discovery already uses — the browser never touches
the preset folder directly.

Host (`tools/webui-clap-host/webui_clap_host.py`):

- `--preset-dir` (default `<script folder>/presets`, auto-created).
- `GET /presets` — list saved presets (id, name, plugin identity, saved
  timestamp); `GET /presets/:id` — full preset content.
- `POST /presets` — save one; strips `instanceId`/`audioInputs`/
  `audioOutputs` from the stored `clap` binding (those are host-instance-
  specific, not portable) and assigns a slugified, de-duplicated id.
- `DELETE /presets/:id` — remove one.

Browser (`public/node-graph-clap-host.js`):

- Every `CLAP Plugin` node now has a preset picker row: a `<select>` of
  saved presets, a name `<input>`, "Save as Preset", and "Delete Preset"
  (deletes whichever preset is currently selected in the picker).
- `saveNodeGraphClapPluginPreset` freshens saved `clap.state` first (if a
  live instance exists, via the existing `saveNodeGraphClapPluginState`),
  then `POST`s the node's current `clap`/`params`/`paramMeta`.
- `loadNodeGraphClapPluginPreset` fetches the preset, applies it onto the
  node, then calls the existing `createNodeGraphClapPluginInstance` —
  which already restores saved `clap.state` when present, or otherwise
  syncs the preset's stored params onto the fresh instance via the
  existing `refreshNodeGraphClapPluginParameters` →
  `syncStoredNodeGraphClapParametersToHost` path. No new instance-creation
  or parameter-sync logic was needed; presets just feed the existing
  patch-reload-restore machinery.
- Always a **fresh** host instance — a preset never stores or reconnects
  to a persisted `instanceId`, since those are scoped to one running host
  process's lifetime.
- Empty preset list → picker just shows "No saved presets", node behaves
  exactly like the bare generic shell (nothing conditionally hidden).

Verified live against the real local host: saved a configured `Crisp`
instance (with a parameter changed from its default) as a preset, deleted
that instance, placed a brand-new generic `CLAP Plugin` node, loaded the
preset onto it, and confirmed a genuinely fresh instance id, the plugin's
real saved `clap.state` restored, and the changed parameter value
(`0.77`) present on the new instance. Delete-preset round-tripped
correctly (list goes back to empty). No console errors; full smoke suite
passes.

Multiple `CLAP Plugin` nodes/instances in one patch already worked before
any of this — the host's instance table already supports many concurrent
instances behind one running host process.

Not built: exporting/importing a preset as a downloadable file for
cross-machine sharing (current presets live in the host's local preset
folder only, same machine/host-process scope as everything else CLAP).

## Phase 3: Plugin Discovery

The native host scans CLAP plugin folders.

Windows defaults:

```text
C:\Program Files\Common Files\CLAP
%LOCALAPPDATA%\Programs\Common\CLAP
CLAP_PATH entries separated by ;
```

macOS defaults:

```text
/Library/Audio/Plug-Ins/CLAP
~/Library/Audio/Plug-Ins/CLAP
```

Linux defaults:

```text
/usr/lib/clap
/usr/local/lib/clap
~/.clap
CLAP_PATH entries separated by :
```

The first prototype may also accept:

```text
--plugin "C:\path\to\plugin.clap"
--scan-dir "C:\path\to\folder"
--inspect-metadata
--test-instantiate
```

Endpoint:

```text
GET /plugins
```

Current prototype behavior:

```text
GET /plugins returns discovered .clap paths.
Without --inspect-metadata, catalog entries use the file or bundle stem as the provisional name.
With --inspect-metadata, descriptor probing loads CLAP libraries in isolated subprocesses and reads plugin descriptors.
Descriptor probing does not instantiate plugins.
Descriptor probing does not process audio.
With --test-instantiate, probing creates, initializes, and destroys plugin instances in isolated subprocesses.
Instantiation probing does not keep instances alive.
Instantiation probing does not process audio.
```

Example response shape:

```json
[
  {
    "id": "...",
    "name": "...",
    "vendor": "...",
    "path": "...",
    "audioInputs": 2,
    "audioOutputs": 2,
    "parameters": []
  }
]
```

## Phase 4: Sandbox CLAP Module

Add a sandbox module type:

```text
CLAP Plugin
```

Instance data:

```js
{
  type: "clapPlugin",
  clap: {
    catalogId: "...",
    clapId: "...",
    path: "...",
    name: "...",
    vendor: "...",
    instanceId: "..."
  },
  params: {}
}
```

Current visible behavior:

- title uses the selected plugin name when present;
- generic stereo `Left` and `Right` input ports are present;
- generic stereo `Left` and `Right` output ports are present;
- browser selector uses the localhost plugin catalog;
- after host connection, the browser reads `GET /instances` to repopulate current host instance summaries;
- if a patch contains a missing host instance id after reconnect, the module marks it stale and offers `Forget Instance`;
- `Create Instance` calls `POST /instances`;
- `Delete Instance` calls `DELETE /instances/:id`;
- after instance creation, generic stereo ports are replaced with flattened CLAP audio port lanes such as `Input L` and `Input R`;
- browser lanes expose every CLAP input/output port in host port order, with channels kept inside each port;
- `Refresh Params` calls `GET /instances/:id/params`;
- host-owned CLAP parameter sliders call `POST /instances/:id/param`;
- stored parameter restore calls `POST /instances/:id/params`;
- host-owned CLAP parameters expose sandbox modulation input ports and slider-output ports after parameter refresh;
- the module displays host instance safety state and exposes `Reset Safety`;
- the module routes audio in bounded Render Sample when a host instance exists;
- Live Audio blocks plans containing CLAP Plugin nodes;
- supported non-floating Win32 plugin editors can open through a native host window when the plugin accepts the GUI sequence.

Later module behavior:

- audio ports should route real samples through the native host;
- plugin parameters should become sandbox modulation-capable sliders or a documented bridge equivalent.

## Phase 5: Offline Render First

Do not begin with live plugin hosting.

First useful target:

```text
Render Sample can process audio through reachable CLAP Plugin nodes in graph order.
```

Render endpoint:

```text
POST /render
```

Example request:

```json
{
  "sampleRate": 44100,
  "frames": 88200,
  "patch": {},
  "pluginInstances": []
}
```

Example response:

```json
{
  "ok": true,
  "sampleRate": 44100,
  "channels": 2,
  "audio": "base64-or-binary-reference"
}
```

Later versions may use binary streaming or a temporary WAV file. The current `/process` route can already use `planar-f32-base64` so Render Sample does not send large JSON float arrays for CLAP chunks.

Current prototype behavior:

```text
POST /instances/:id/process can run as a one-shot probe or as one chunk inside an active host render session.
As a one-shot probe, it activates one existing instance, processes a bounded generated in-memory buffer, stops processing, deactivates the plugin, clamps metric analysis to finite [-1, 1] samples, and returns process metrics.
Inside an active render session, it processes the chunk without stopping and restarting the plugin.
When returnAudio is true, it returns bounded planar float audio as `planar-f32-json` or `planar-f32-base64`.
When inputAudio is present, it uses caller-supplied planar channel audio as `planar-f32-json` or `planar-f32-base64` instead of the generated impulse.
Render Sample can use this endpoint for CLAP Plugin nodes with existing host instances.
Reachable CLAP nodes are processed chunk-by-chunk in graph order. Input buffers are built from incoming graph wires, and already-processed upstream CLAP chunks are available to downstream CLAP nodes in the same offline render pass. Feedback connections or feedback modulations touching CLAP Plugin nodes are rejected before host processing.
When multiple reachable CLAP nodes have no CLAP dependency between them for the current chunk, the browser may send those process items through `POST /process-batch`.
The batch endpoint processes items serially and returns one result per item. It reduces localhost request count; it is not a graph scheduler inside the host.
Before each reachable CLAP node processes, Render Sample sends effective CLAP parameter plain values in the `POST /instances/:id/process` payload.
When a CLAP parameter has sandbox modulation wires, Render Sample samples the effective value at each CLAP process chunk start.
This is chunk-start parameter sync. It is not sample-accurate CLAP automation.
This is a bounded offline bridge, not Live Audio integration.
```

## Phase 6: Parameter Sync

Sandbox slider changes update local plugin state.

Endpoints:

```text
POST /instances
GET /instances
GET /instances/:id/params
DELETE /instances/:id
POST /instances/:id/param
POST /instances/:id/params
POST /instances/:id/render/begin
POST /instances/:id/process
POST /instances/:id/render/end
POST /process-batch
POST /instances/:id/safety/reset
```

Current prototype behavior:

```text
POST /instances accepts path and clapId.
GET /instances returns active initialized instances.
GET /instances/:id/params reads CLAP parameter metadata and current values.
POST /instances/:id/param sets a plain parameter value through clap.params.flush().
POST /instances/:id/params sets multiple plain parameter values through one clap.params.flush() call containing multiple parameter events.
POST /instances/:id/render/begin activates and starts processing for a bounded offline Render Sample pass.
POST /instances/:id/process runs a bounded offline process call and returns metrics, with optional planar float JSON or base64 audio. The request may include a `renderSessionId` and a `parameters` array; the host applies those parameter values before processing the chunk and reports the result as `processParameters`.
If native `plugin.process()` returns `CLAP_PROCESS_ERROR`, the host fails the process call instead of returning audio.
Direct POST /instances/:id/param and POST /instances/:id/params writes are blocked while a render session is active.
If a render session is abandoned, the host releases it after the reported idle timeout.
A second POST /instances/:id/render/begin is rejected while a non-idle render session is active.
POST /instances/:id/render/end stops processing and deactivates the plugin after the bounded offline Render Sample pass.
POST /process-batch runs multiple bounded process items in one request and returns one item result for each request item.
POST /instances/:id/safety/reset clears the instance safety latch after a muted dangerous-output event.
DELETE /instances/:id destroys the plugin instance.
Render Sample graph integration exists for bounded CLAP Plugin host calls, including chunk-by-chunk graph-order offline CLAP chains without feedback and bounded finite-tail extension. If a feedback signal or feedback modulation touches a CLAP Plugin node, Render Sample blocks with a clear message.
Render Sample uses `/process-batch` for independent CLAP nodes in the same chunk when the connected host reports `processBatch: true`.

Render Sample requires the connected host to report `audioProcessing: true` and `offlineRenderSessions: true` in its capabilities.

Render Sample uses the connected host's `maxProcessFrames` capability as the CLAP process chunk size. The current host reports `48000`.
Render Sample includes effective CLAP parameter values in the process call payload.
Render Sample can append bounded finite CLAP tail frames after the requested duration. During the appended tail window, source nodes are silenced and infinite tails remain metadata-only.
Sandbox modulation wires can target CLAP parameters for bounded offline Render Sample processing.
This modulation bridge is chunk-start control-rate behavior, not CLAP event automation.
Live Audio blocks plans containing CLAP Plugin nodes with a clear status.
Live Audio graph integration is not implemented yet.
```

Parameter rules:

- metadata comes from CLAP;
- sandbox uses CLAP min, max, default, and unit where possible;
- stepped parameters use choice-style sliders;
- continuous parameters use normal sliders;
- preserve sandbox `maxDigits` formatting policy.

## Phase 7: Safety Boundary

Never trust plugins.

Native host safety layers:

- clamp non-finite values;
- apply Ear Protection or equivalent guard;
- hard mute non-finite plugin output or raw output above the host peak limit;
- latch after a muted dangerous-output event;
- report protection trips to the browser;
- require explicit reset or host restart after a safety latch.

Danger path:

```text
dangerous plugin output -> mute -> latch -> user reset or host restart
```

## Phase 8: Live Audio

Started 2026-07-17, Architecture A (the two live-audio architectures were
discussed and Architecture A chosen explicitly): the native host owns its
own real-time audio device callback entirely outside the browser's Web
Audio graph. This is a deliberate constraint, not a placeholder --
`AudioWorklet` runs on a hard real-time thread that cannot block on
network I/O, so "call the localhost host over HTTP every audio quantum"
was never viable. The alternative (streaming audio into the browser's
live graph via a jitter-buffered ring buffer, so a CLAP node could sit
between two other live modules) is a materially bigger, higher-risk build
and was explicitly deferred in favor of this simpler first step.

The native host owns:

- audio callback (implemented);
- plugin processing (implemented);
- note queue (implemented, single-note-event granularity);
- audio output device (implemented, via the optional `sounddevice`
  dependency -- see below);
- speaker protection (implemented, reuses the same finite/peak-limit
  safety latch the offline path already had).

The browser sends parameter changes and note events (implemented at the
host-API level; browser UI for this is not wired yet -- see below).
Module graph changes and transport commands are not part of this first
slice: a live CLAP instance in Architecture A is a standalone sound
source, not summed with the rest of the live graph.

### Implemented (2026-07-17)

One new host dependency, deliberately isolated: `sounddevice` (a thin
PortAudio wrapper), feature-detected at import time exactly like the
native CLAP libraries themselves -- if it's not installed, `GET /health`
reports `capabilities.liveAudio: false` and `/live/*` routes return a
clear error; every other host feature (discovery, offline render,
presets) needs zero pip installs, unchanged.

New routes on `PersistentClapInstance`:

- `POST /instances/:id/live/start` -- body `{sampleRate, blockSize}`.
  Activates the plugin, pre-allocates all ctypes audio/event buffers once
  (never again -- the audio callback must not allocate), and opens a
  `sounddevice.RawOutputStream` (raw buffers, not numpy, to keep the new
  dependency footprint to one package).
- `POST /instances/:id/live/stop` -- stops the stream, deactivates.
- `POST /instances/:id/live/note` -- body `{noteOn, key, velocity,
  channel}`; queues a `clap_event_note` delivered at the start of the next
  callback.
- `GET /instances/:id/live` -- status: active, sample rate, block size,
  peak, frame count, xrun count, dropped-callback count, safety state.
- `DELETE /instances/:id` (existing route) now also tears down a live
  stream first if one is active.

Real-time safety notes:

- The callback (`_live_audio_callback`) runs on PortAudio's own
  real-time thread, not the HTTP server's. It uses a **non-blocking**
  lock acquire against the instance's existing `RLock` -- a contended
  lock (e.g. a concurrent stop/delete from the HTTP thread) drops that
  one callback's audio to silence rather than blocking the audio thread,
  logged as `droppedCallbackCount`.
- No live browser-graph input yet -- the plugin's audio input ports (if
  any) always see silence; only note/param events drive it. This matches
  Architecture A's "standalone source" scope.
- Reuses the exact same finite/peak-limit safety check the offline path
  already had (`CLAP_SAFETY_PEAK_LIMIT`): non-finite or excessive output
  mutes and latches, same as before.
- The planar-to-interleaved output copy is a plain Python loop (no numpy,
  to avoid a second new dependency) -- a known first-version cost, worth
  revisiting if CPU usage becomes a problem at small block sizes.

Verified live against the real local host and a real installed
instrument (Vital): created an instance, started live audio
(`sampleRate: 48000, blockSize: 256`), confirmed `frameCount` advancing
in real time via `GET /instances/:id/live` (i.e. genuinely paced by the
real audio device clock, not running ahead), sent a note-on and observed
`peak` jump to a real non-zero, non-clipping value (`0.356`), sent
note-off and watched `peak` return to `0.0` after the envelope release,
stopped cleanly, and separately confirmed `DELETE /instances/:id` while
live tears down the stream without error. Zero xruns, zero dropped
callbacks throughout. Full smoke suite passes.

`liveAudio`/`liveAudioMinBlockFrames`/`liveAudioMaxBlockFrames`/
`liveAudioDefaultBlockFrames` were added to the browser's capability
allowlist (`nodeGraphClapHostCapabilityKeys` in
`public/node-graph-clap-host.js`) so the connected-host state correctly
tracks the new capability -- this is the only browser-side change in this
pass.

### Not yet built

- Browser UI: no Live/Stop/note buttons on the `CLAP Plugin` module body
  yet, and no status display for peak/xruns. The host API is complete and
  proven; this is now a UI-wiring pass, not an unknown.
- MIDI queues beyond single note-on/off events (velocity curves, CC,
  pitch bend, polyphony beyond what the plugin itself handles from
  repeated note-on calls).
- Module graph / transport integration -- out of scope for Architecture
  A as designed; would be Architecture B territory (see the discussion
  this phase opened with) if ever revisited.
- WebSocket transport for lower-latency control (current control path is
  still per-request HTTP, fine for occasional note/param events, not
  attempted for anything higher-frequency).

## Phase 9: Plugin Editor Later

Do not embed plugin GUIs in the first version.

First version exposes sandbox-native controls only.

Later option:

```text
Browser button: Open Plugin Editor
Native host opens external plugin editor window.
```

## Phase 10: Packaging

Eventually ship:

```text
Soundemote WebUI CLAP Host Installer
```

User-facing copy:

```text
Install the local CLAP Host to use plugins from your computer inside the Soundemote sandbox.
```

The web sandbox must continue working without the local host installed.

## First Proof

Smallest useful proof:

1. Native host starts.
2. Browser connects and shows `CLAP Host: Connected`.
3. Native host loads one known plugin by absolute path. Implemented for descriptor reads, instance creation, parameter reads, parameter writes, and bounded offline processing.
4. Browser shows the plugin in a list. Implemented as catalog status and `CLAP Plugin` selector entries.
5. User adds `CLAP Plugin` module. Implemented as a browser module shell with generic stereo ports before instance creation.
6. Browser stores the selected plugin descriptor in patch data. Implemented.
7. Browser can ask the host to create/delete an instance for the selected module. Implemented.
8. Browser reads and stores CLAP audio port metadata from the host instance. Implemented.
9. Browser redraws the module with flattened CLAP audio port lanes. Implemented.
10. Native host keeps one initialized plugin instance alive and reads its parameters. Implemented through HTTP instance API.
11. Native host activates and processes one bounded generated buffer through the plugin. Implemented.
12. Native host can return bounded planar float JSON audio from `/process`. Implemented.
13. Render Sample sends graph audio through the plugin. Implemented for bounded host-instance CLAP Plugin nodes.
14. Browser receives playable rendered audio through the graph render path. Implemented for that bounded offline bridge.
15. Live Audio sends real-time graph audio through the plugin. Not implemented.

## Verification Notes

2026-06-04:

- Browser connected to the local host at `http://127.0.0.1:47991`.
- Browser catalog scan reported 15 CLAP entries and 12 inspected descriptors.
- Browser added a `CLAP Plugin` module, selected `Crisp`, and created host instance `clap-2`.
- The module displayed flattened stereo lanes: `Input L`, `Input R`, `Output L`, `Output R`.
- The module displayed 11 CLAP parameter sliders.
- A browser graph connected `gain.Out` to both CLAP inputs and connected both CLAP outputs to `output.Left` and `output.Right`.
- The execution-plan validator now accepts `clapPlugin` as a supported source node.
- Browser Render Sample completed with `render ready` and produced a two-second playable audio blob.
- Follow-up bridge patch: CLAP input buffers are now summed from incoming graph wires, and upstream CLAP outputs are available to downstream CLAP nodes during graph-order offline Render Sample processing.
- Browser regression proof after the bridge patch: `Crisp` instance `clap-1`, graph valid, Render Sample `render ready`, and a playable two-second blob.
- CLAP parameter persistence patch: host parameter payloads are translated into patch `params` and `paramMeta`, host slider edits update patch data, and stored patch parameter values are restored to the host instance during parameter refresh.
- Render Sample parameter sync patch: before host process calls, stored CLAP patch parameter plain values are pushed to the host instance. This does not implement sample-accurate modulation.
- Browser proof for render parameter sync: `Crisp` Amount was set to `50%` in the browser patch, manually changed to `20%` through the host API, then Render Sample completed with `render ready` and the host reported Amount `50%` again.
- CLAP parameter port patch: host-discovered CLAP parameters now expose sandbox modulation input ports and slider-output ports. Render Sample applies effective CLAP parameter values at CLAP process chunk starts. This still does not implement sample-accurate CLAP event automation.
- Browser proof for CLAP parameter modulation: `Gain.Amount` slider output was wired to `Crisp.Amount`, the base `Crisp.Amount` slider was set to `0%`, Render Sample completed with `render ready`, and the host reported `Crisp.Amount` at `33%`, matching Gain's normalized `1 / 3` slider output.
- Bulk parameter write patch: the host accepts `POST /instances/:id/params` for stored patch restore, applies batches through one `clap.params.flush()` call, and `/process` accepts a `parameters` array so Render Sample can sync chunk-start CLAP values without a separate request.
- Host API proof for bulk parameter writes: one `POST /instances/clap-1/params` request set `Crisp.Amount` to `25%` and `Crisp.Output` to `0.75`; readback reported both values.
- Multi-event parameter flush proof: `Crisp` accepted two parameter updates through `POST /instances/clap-1/params`, then accepted two process-time parameter updates through `POST /instances/clap-1/process`; the process response reported `processParameters.count: 2`, `safetyMuted: false`, and `processStatus: 2`.
- Threaded host safety patch: the instance table is protected by a server lock, and each persistent CLAP instance uses an `RLock` so parameter reads/writes, process calls, safety reset, summary reads, and close operations do not enter the same native instance concurrently.
- Threaded host proof: with `Crisp`, simultaneous `GET /instances/:id/params`, `POST /instances/:id/process`, and `GET /instances` requests returned three successful responses with zero job errors.
- Live Audio guard patch: browser live plans containing CLAP Plugin nodes now report `Live Audio does not route CLAP Plugin nodes yet. Use Render Sample for CLAP processing` instead of producing silent plugin output.
- Base64 audio transport patch: `/process` now accepts `inputAudioFormat: "planar-f32-base64"` and `returnAudioFormat: "planar-f32-base64"`, and browser Render Sample uses that format for CLAP chunks.
- Host API proof for base64 audio transport: `Crisp` processed 64 frames with base64 stereo input, returned `audioFormat: "planar-f32-base64"`, two output channels, 256 decoded bytes per channel, finite output, and `processStatus: 2`.
- Host safety latch patch: CLAP instances now expose `safety`, `/process` returns `safetyMuted` and zero audio after a safety trip, `POST /instances/:id/safety/reset` clears the latch, and browser Render Sample blocks with `CLAP safety muted ...` when the host reports a mute.
- Host API proof for safety state: normal `Crisp` processing returned `safetyMuted: false`, `safety.latched: false`, `rawPeak: 0.1621464192867279`, and `POST /instances/clap-1/safety/reset` returned a clear latch state.
- Browser safety UI patch: the CLAP Plugin module displays host safety state, updates it from Render Sample `/process` responses, and provides a `Reset Safety` button wired to `POST /instances/:id/safety/reset`.
- Browser reconnect sync patch: after connecting to the localhost host, the browser reads `GET /instances`, merges host instance summaries into module state, and refreshes displayed safety state for existing instance ids.
- Host API proof for reconnect sync data: after creating `Crisp` instance `clap-1`, `GET /instances` returned one instance with `safety.latched: false`, empty reason, `rawPeak: 0`, and `peakLimit: 4`.
- Windows launcher patch: `tools\webui-clap-host\start_webui_clap_host.ps1` starts the prototype host with descriptor inspection enabled by default and accepts port, plugin, scan-dir, and instantiate-probe options.
- Browser command patch: `Copy Host Command` now copies the Windows `.cmd` launcher command for the selected host and port.
- Offline render session patch: Render Sample now opens host render sessions before CLAP chunk processing and closes them afterward, so stateful plugins are not restarted for every chunk.
- Native CLAP process error status fails the process call instead of returning audio.
- Direct `/param` and `/params` writes are blocked during an active render session. Render-time parameter changes use `/process` payload parameters instead.
- Abandoned render sessions are released by an idle timeout reported through host capabilities.
- Overlapping non-idle render sessions are rejected instead of replacing active plugin processing.
- Browser CLAP audio lane exposure and host processing now use every CLAP input/output port, flattened in host port order.
- Host all-port buffer proof: `Crisp` processed a render-session chunk through the new buffer builder and returned `processStatus: 2`, `audioFormat: "planar-f32-base64"`, two output channels, one input port, one output port, and `safetyMuted: false`.
- A plugin with multiple distinct audio ports should be used for a later runtime proof of the multi-port branch.
- Plugin editor capability patch: instances now report `clap.gui` support through summaries and `GET /instances/:id/editor`; the browser exposes `Open Editor`.
- Win32 editor opening patch: `POST /instances/:id/editor/open` can create a native parent window and open non-floating Win32 `clap.gui` editors when the plugin reports that API and accepts the GUI sequence. `POST /instances/:id/editor/close` closes opened plugin editors. Editor operations are blocked during active offline render sessions.
- Plugin latency info patch: instances now report `clap.latency` through summaries, `GET /instances/:id/latency`, and process responses; Render Sample compensates reported latency when injecting returned CLAP output.
- Plugin tail info patch: instances now report `clap.tail` through summaries, `GET /instances/:id/tail`, and process responses; the browser records reported tail length, including infinite tails, as render metadata.
- Bounded tail render patch: Render Sample can append finite CLAP tail frames up to the browser tail limit. During the appended tail window, source nodes are silenced while downstream browser processing can continue to pass CLAP output. Infinite tails remain metadata-only.
- Plugin state persistence patch: instances now report `clap.state` support through summaries, save plugin state through `GET /instances/:id/state`, load saved state through `POST /instances/:id/state`, and the browser can store saved state in patch JSON for later restoration into a recreated host instance.
- Launcher/config status patch: `/health` now reports `hostConfig`, the browser displays a compact host config summary after connection, and the Windows launcher validates port, Python command, and host script before starting from the sandbox repo root.
- Host diagnostics patch: `GET /diagnostics` reports host configuration, catalog counts, metadata error counts, instantiation error counts, and missing explicit plugin paths from the running host. The browser host strip has a Diagnostics button for this route.
- Host doctor patch: `python tools\webui-clap-host\webui_clap_host.py --doctor --inspect-metadata` prints the same class of JSON preflight report without starting the HTTP server.
- Live Audio, packaging, sample-accurate CLAP automation, feedback-safe CLAP scheduling, and optimized multi-plugin processing remain unimplemented.

## Difficulty

- Local host health connection: easy-medium.
- Plugin scan and metadata: medium-high.
- Offline render through one plugin: high.
- General CLAP module integration: high.
- Live CLAP hosting: very high.
- Product-grade host: major product.

## Non-Goals For First Version

- Browser-native CLAP loading.
- Live plugin audio.
- Plugin editor embedding.
- Silent dependency on the local host.
- Browser responsibility for plugin safety.
