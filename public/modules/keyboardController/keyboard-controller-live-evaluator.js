// Shared live evaluator for Portal MIDI (keyboardController) and the Keyboard
// controller-face module. Both read the same global midiKeyboardSignal / Held
// Keys bitmasks (K Controllers dock + Keyboard module are one SSOT).
nodeGraphLiveModuleEvaluators.keyboardController = ({
  runtime, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  void runtime;
  void frames;
  void frameValues;
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
  const hold = hasInput(nodeId, "Hold") && Number(mixInput(nodeId, "Hold")) > 0;
  const velocity01 = hasInput(nodeId, "Velocity")
    ? Math.max(0, Math.min(1, Number(mixInput(nodeId, "Velocity")) || 0))
    : Math.max(0, Math.min(1, Number(signal?.velocity) || 0));
  const velocityNumber = Math.round(velocity01 * 127);
  // Gate/Trigger amplitudes follow velocity (Thump etc. read Gate height as vel).
  let gateAmp = 0;
  if (!resetActive) {
    if (hasInput(nodeId, "Gate")) {
      gateAmp = Math.max(0, Math.min(1, Number(mixInput(nodeId, "Gate")) || 0));
    } else if (Number(signal?.gate) > 0 || hold) {
      gateAmp = velocity01;
    }
  }
  const triggerAmp = resetActive
    ? 0
    : (hasInput(nodeId, "Gate")
      ? gateAmp
      : (Number(signal?.gatePulse) > 0 ? velocity01 : 0));
  const frequency = Math.max(0, 440 * (2 ** ((midi - 69) / 12)));
  const keyboardRate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const increment = Math.max(0, frequency / keyboardRate);
  return {
    Trigger: triggerAmp,
    "0.1V/Oct": Math.max(0, Math.min(1, midi / 120)),
    "0.1v/Oct": Math.max(0, Math.min(1, midi / 120)),
    "Note#/127": Math.max(0, Math.min(1, midi / 127)),
    Frequency: frequency,
    Gate: gateAmp,
    "Inc.": increment,
    Increment: increment,
    KeyboardKey: key,
    "Note#": midi,
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

nodeGraphLiveModuleEvaluators.keyboard = nodeGraphLiveModuleEvaluators.keyboardController;
