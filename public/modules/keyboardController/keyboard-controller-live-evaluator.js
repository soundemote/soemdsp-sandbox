// Registers the offline/render-time dispatch handler for keyboardController into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.keyboardController = ({ runtime, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const signal = nodeGraphMvp?.midiKeyboardSignal || (
    typeof nodeGraphMidiKeyboardFallbackSignal === "function"
      ? nodeGraphMidiKeyboardFallbackSignal()
      : null
  );
  const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
  const manualRawMidi = Number.isFinite(Number(signal?.rawMidi))
    ? Number(signal.rawMidi)
    : Number(signal?.midi) || 60;
  const manualOctave = Number(signal?.octave) || 0;
  const octave = hasInput(nodeId, "Octave")
    ? Math.max(-6, Math.min(6, Math.round(Number(mixInput(nodeId, "Octave")) || 0)))
    : manualOctave;
  const rawMidi = resetActive
    ? 60
    : (hasInput(nodeId, "MIDI Note") ? Number(mixInput(nodeId, "MIDI Note")) || 0 : manualRawMidi);
  const midi = Math.max(0, Math.min(127, Math.round(rawMidi + octave * 12)));
  const automatedPitch = resetActive || hasInput(nodeId, "MIDI Note") || hasInput(nodeId, "Octave");
  const key = automatedPitch
    ? Math.max(0, Math.min(24, Math.round(rawMidi) - 48))
    : Math.max(0, Math.min(24, Math.round(Number(signal?.keyIndex) || 0)));
  const q = automatedPitch
    ? key / 24
    : Math.max(0, Math.min(1, Number(signal?.keyQuantized) || key / 24));
  const x = resetActive ? 0.5 : (hasInput(nodeId, "X")
    ? Math.max(0, Math.min(1, Number(mixInput(nodeId, "X")) || 0))
    : Math.max(0, Math.min(1, Number(signal?.x) || q)));
  // Y is mouse/pointer vertical position only — not MIDI velocity.
  const y = resetActive ? 0 : (hasInput(nodeId, "Y")
    ? Math.max(0, Math.min(1, Number(mixInput(nodeId, "Y")) || 0))
    : Math.max(0, Math.min(1, Number(signal?.y) || 0)));
  const gate = resetActive ? 0 : (hasInput(nodeId, "Gate")
    ? (Number(mixInput(nodeId, "Gate")) > 0 ? 1 : 0)
    : (Number(signal?.gate) > 0 ? 1 : 0));
  const hold = hasInput(nodeId, "Hold") && Number(mixInput(nodeId, "Hold")) > 0 ? 1 : 0;
  const velocity01 = hasInput(nodeId, "Velocity")
    ? Math.max(0, Math.min(1, Number(mixInput(nodeId, "Velocity")) || 0))
    : Math.max(0, Math.min(1, Number(signal?.velocity) || 0));
  const velocityNumber = Math.round(velocity01 * 127);
  const frequency = Math.max(0, 440 * (2 ** ((midi - 69) / 12)));
  const keyboardRate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const increment = Math.max(0, frequency / keyboardRate);
  return {
    Trigger: hasInput(nodeId, "Gate") ? gate : (Number(signal?.gatePulse) > 0 ? 1 : 0),
    "0.1v/Oct": Math.max(0, Math.min(1, midi / 120)),
    "Note#/127": Math.max(0, Math.min(1, midi / 127)),
    Frequency: frequency,
    Gate: Math.max(gate, hold),
    Increment: increment,
    KeyboardKey: key,
    NoteNumber: midi,
    KeyboardNorm: q,
    "Velocity#": velocityNumber,
    "Velocity#/127": velocity01,
    X: x,
    Y: y,
    "Held Keys": nodeGraphMidiKeyboardHeldKeysTransmitValue(
      nodeGraphMvp?.midiKeyboardHeldKeysLowBitmask,
      nodeGraphMvp?.midiKeyboardHeldKeysHighBitmask,
      frame % 2,
    ),
  };
};
