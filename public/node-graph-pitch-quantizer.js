// Pitch Quantizer helpers: 12-bit pitch-class masks + quantization math.
//
// Bit i = pitch class i (0=C … 11=B) is in the scale. Applied across every
// octave: the keyboard face edits this mask; the Scale jack can override it.

// Preset scale masks. Index matches the "scale" parameter choice order
// (0…5 presets; 6 = Custom when the face keyboard has been edited).
const nodeGraphPitchQuantizerScaleMasks = Object.freeze([
  4095, // Chromatic (all 12)
  2741, // Major (0,2,4,5,7,9,11)
  1453, // Minor (0,2,3,5,7,8,10)
  661,  // Major Pentatonic (0,2,4,7,9)
  1193, // Minor Pentatonic (0,3,5,7,10)
  1365, // Whole Tone (0,2,4,6,8,10)
]);

const nodeGraphPitchQuantizerCustomScaleChoice = 6;

const nodeGraphPitchQuantizerNoteNames = Object.freeze([
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
]);

// Piano layout for one octave: white indices and black attachments.
const nodeGraphPitchQuantizerWhiteClasses = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
const nodeGraphPitchQuantizerBlackKeys = Object.freeze([
  { pitchClass: 1, afterWhite: 0 }, // C#
  { pitchClass: 3, afterWhite: 1 }, // D#
  { pitchClass: 6, afterWhite: 3 }, // F#
  { pitchClass: 8, afterWhite: 4 }, // G#
  { pitchClass: 10, afterWhite: 5 }, // A#
]);

function createNodeGraphPitchQuantizerState() {
  return { hasOutput: false, lastOutput: 0 };
}

function nodeGraphPitchQuantizerMaskFromChoice(choiceIndex) {
  const index = Math.max(
    0,
    Math.min(nodeGraphPitchQuantizerScaleMasks.length - 1, Math.round(Number(choiceIndex) || 0)),
  );
  return nodeGraphPitchQuantizerScaleMasks[index];
}

function nodeGraphPitchQuantizerNormalizeMask(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) {
    return nodeGraphPitchQuantizerScaleMasks[1]; // Major
  }
  return n & 0xFFF;
}

/**
 * If Scale is patched from a Chord Pad, return that pad's mask for face paint.
 * (Select CV on the pad is not mirrored here — face uses pad params only.)
 */
function nodeGraphPitchQuantizerScaleJackDisplayMask(node) {
  if (!node?.id || typeof nodeGraphModuleScopeConnectionsTo !== "function") {
    return null;
  }
  const connections = nodeGraphModuleScopeConnectionsTo(node.id, "Scale");
  const connection = connections?.[0];
  if (!connection?.sourceNode) {
    return null;
  }
  const source = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(connection.sourceNode)
    : null;
  if (source?.type === "chordPad" && typeof nodeGraphChordPadScaleForNode === "function") {
    return nodeGraphPitchQuantizerNormalizeMask(nodeGraphChordPadScaleForNode(source));
  }
  return null;
}

/** Active 12-bit mask for a patch node (Scale jack handled by the evaluators). */
function nodeGraphPitchQuantizerMaskForNode(node) {
  if (!node || typeof node !== "object") {
    return nodeGraphPitchQuantizerScaleMasks[1];
  }
  // Face display: when Scale is driven by Chord Pad, show that chord's tones.
  const jackMask = nodeGraphPitchQuantizerScaleJackDisplayMask(node);
  if (jackMask != null) {
    return jackMask;
  }
  const params = node.params || {};
  if (params.scaleMask != null && String(params.scaleMask).trim() !== "") {
    return nodeGraphPitchQuantizerNormalizeMask(params.scaleMask);
  }
  return nodeGraphPitchQuantizerMaskFromChoice(params.scale);
}

/** True when Scale jack is connected (keyboard becomes display-only for mask). */
function nodeGraphPitchQuantizerScaleJackConnected(nodeId) {
  if (typeof nodeGraphModuleScopeConnectionsTo !== "function") {
    return false;
  }
  return (nodeGraphModuleScopeConnectionsTo(nodeId, "Scale") || []).length > 0;
}

/** After a Chord Pad changes, repaint any Quantizers fed by its Scale. */
function syncNodeGraphPitchQuantizersFedByChordPad(chordPadNodeId) {
  const id = String(chordPadNodeId || "").trim();
  if (!id || typeof nodeGraphMvp === "undefined") {
    return;
  }
  const connections = nodeGraphMvp.patch?.connections || [];
  for (const connection of connections) {
    if (connection.sourceNode !== id || connection.sourcePort !== "Scale") {
      continue;
    }
    if (typeof syncNodeGraphPitchQuantizerFace === "function") {
      syncNodeGraphPitchQuantizerFace(connection.destinationNode);
    }
  }
}

function nodeGraphPitchQuantizerMaskHasClass(mask, pitchClass) {
  const pc = ((Math.round(Number(pitchClass)) % 12) + 12) % 12;
  return Boolean((nodeGraphPitchQuantizerNormalizeMask(mask) >> pc) & 1);
}

function nodeGraphPitchQuantizerMaskToggleClass(mask, pitchClass) {
  const pc = ((Math.round(Number(pitchClass)) % 12) + 12) % 12;
  return nodeGraphPitchQuantizerNormalizeMask(mask) ^ (1 << pc);
}

function nodeGraphPitchQuantizerChoiceForMask(mask) {
  const normalized = nodeGraphPitchQuantizerNormalizeMask(mask);
  const preset = nodeGraphPitchQuantizerScaleMasks.indexOf(normalized);
  return preset >= 0 ? preset : nodeGraphPitchQuantizerCustomScaleChoice;
}

// Snaps a 0.1V/Oct pitch signal (semitone = pitch * 120) to the nearest
// active pitch class in a 12-bit scale mask. Empty mask holds the last
// quantized output (hardware quantizer behavior).
function nodeGraphPitchQuantizerSample(state, options = {}) {
  const pitch = Number(options.pitch) || 0;
  const mask = options.hasScaleInput
    ? Math.round(Number(options.scaleInput) || 0) & 0xFFF
    : (
      options.scaleMask != null
        ? nodeGraphPitchQuantizerNormalizeMask(options.scaleMask)
        : nodeGraphPitchQuantizerMaskFromChoice(options.scaleChoice)
    );

  if (mask === 0) {
    return state.hasOutput ? state.lastOutput : pitch;
  }

  const semitoneFloat = pitch * 120;
  const rounded = Math.round(semitoneFloat);
  let bestSemitone = rounded;
  let bestDistance = Infinity;
  let found = false;
  for (let radius = 0; radius <= 12 && !found; radius += 1) {
    for (const sign of radius === 0 ? [0] : [-1, 1]) {
      const candidate = rounded + sign * radius;
      const pitchClass = ((candidate % 12) + 12) % 12;
      if (!((mask >> pitchClass) & 1)) continue;
      const distance = Math.abs(candidate - semitoneFloat);
      if (!found || distance < bestDistance) {
        found = true;
        bestDistance = distance;
        bestSemitone = candidate;
      }
    }
  }

  const output = found ? bestSemitone / 120 : pitch;
  state.hasOutput = true;
  state.lastOutput = output;
  return output;
}
