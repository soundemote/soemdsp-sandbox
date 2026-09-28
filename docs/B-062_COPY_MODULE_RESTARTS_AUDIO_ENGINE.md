# B-062 - Non-audio UI changes restart audio engine

**Status:** open  
**Severity:** hear  
**Source:** user 2026-09-27 (inert module copy); user 2026-09-28 (Text Box deletion)

## User symptom

Copying a module restarts the audio engine even when the copied module is not connected and is doing nothing. Deleting a Text Box also restarts the audio engine, even though a Text Box is non-audio UI with no live audio role. These unnecessary restarts interrupt otherwise-running audio.

## Repro

1. Run a patch with live audio.
2. Reproduce either case:
   - Copy a module and leave the new copy unconnected and otherwise inert.
   - Delete a Text Box.
3. Observe the audio-engine restart or interruption.
4. Compare with a change that actually alters the active audio graph, such as connecting the copied module.

## Investigation / fix shape

Trace both module-copy and module-delete commits through the module action path, `commitNodeGraphPatch`, and the live-plan sync/restart path. Separate inert, unconnected copies and non-audio UI edits (including Text Box deletion) from changes that connect to the active graph or have side effects. A non-audio UI edit or inert copy should not restart the audio engine; when safe, it should use no live sync or a non-restarting incremental update. Required updates for modules that connect, publish, consume, or otherwise affect live execution must remain intact.

The root cause is not confirmed by this report. This is a docs-only bug entry; do not apply a code fix as part of filing it.

## Verification target

With audio already running, copying an unconnected inert module or deleting a Text Box should preserve engine/session continuity and produce no restart gap or click. Connecting the copy, or making another change that affects live audio execution, should still receive whatever live update is required.