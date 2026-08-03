// Registers the offline/render-time dispatch handler for midiNotePitch into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.midiNotePitch = ({ nodeId, mixInput }) => {
  const pitch = Math.max(0, Math.min(127, (
    Number(mixInput(nodeId, "MIDI Note")) +
    Number(mixInput(nodeId, "Octave Offset")) * 12 +
    Number(mixInput(nodeId, "Pitch Offset"))
  ) || 0));
  const frequencyHz = typeof nodeGraphDspMidiNoteToHz === "function"
    ? nodeGraphDspMidiNoteToHz(pitch)
    : 440 * (2 ** ((pitch - 69) / 12));
  return {
    Frequency: frequencyHz,
    "Pitch 0-1": pitch / 127,
    "Pitch 0-127": pitch,
  };
};
