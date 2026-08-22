# Live display / pause verification

Hard-refresh (`Ctrl+F5`) before this. Debug: 🐞 → **LIVE** (or `SE.liveDisplay()`).

## 1. Output Instant Trace (SinCos → Output)

1. Empty patch. Spawn **SinCos**. Wire **Sin** → Output **Mono**.
2. Play. Output face must show a moving sine (not a black plate).
3. LIVE dump: `output … n=` > 0, `lr=0` (Mono only).
4. Wire Cos → Output Right. LIVE: `lr=1`. Both colors on the face.

Fail: `n=0` with audio → capture still missing. `lr=1` with only Mono wired → stereo helper regression.

## 2. Pause (speed 0.0, no audio)

1. With the sine playing, press Pause / Space.
2. Header speed **0.0**. Audio **silent** (no leftover stutter).
3. LIVE: `paused: true`, `hostGain: 0`.
4. Play: audio returns, hostGain 1.

## 3. Music Player spawn CPU

1. Stop sim. Spawn Music Player. GPU HUD should stay idle (no RAF).
2. LIVE: `phosphorRaf` empty while stopped.
3. Play with no sample: player must **not** compile a custom-display script each frame.
4. Load folder → Play one file. Phosphor draws; spawn-only CPU is gone.

## 4. Folder field

Picker shows the **folder name** (browser API). Paste `C:\full\path` and Load to use the server list. Placeholder: `folder name, or paste C:\full\path`.

## 5. Display Settings preview stamp

Open Output Display Settings. The L/R (or single) preview square stays **≤ 96px** when the window is wide.

## 6. SinCos stutter

After (1): GPU fps should stay usable at Output history **≤ 0.4 s**. If it hitchs only when Output is blank, that is the Mono/L-R bug — re-run 1.
