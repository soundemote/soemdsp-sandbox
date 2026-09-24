// Pitch Quantizer helpers: pitch-class masks + quantization math.
//
// Face keyboard edits a 12-bit class mask (bit i = class i). Scale jack is the
// shared noteMask128 bus (Play/Arp/Chord Keys); DSP folds lit notes via n%12.

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
    Math.min(nodeGraphPitchQuantizerScaleMasks.length - 1, Math.round(nodeGraphFiniteNumber(choiceIndex))),
  );
  return nodeGraphPitchQuantizerScaleMasks[index];
}

function nodeGraphPitchQuantizerNormalizeMask(raw) {
  if (typeof noteMaskResolveScaleBits === "function") {
    const bits = noteMaskResolveScaleBits(raw);
    return bits || nodeGraphPitchQuantizerScaleMasks[1];
  }
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) {
    return nodeGraphPitchQuantizerScaleMasks[1]; // Major
  }
  return n & 0xFFF;
}

/** Keyboard / saved mask. Scale jack never writes this. */
function nodeGraphPitchQuantizerKeyboardMask(node) {
  const params = node?.params || {};
  if (params.scaleMask != null && String(params.scaleMask).trim() !== "") {
    return nodeGraphPitchQuantizerNormalizeMask(params.scaleMask);
  }
  if (params.scale != null && String(params.scale).trim() !== "") {
    return nodeGraphPitchQuantizerMaskFromChoice(params.scale);
  }
  return nodeGraphPitchQuantizerScaleMasks[1];
}

/** True when a cable is on Scale in. DSP uses that cable; keyboard is display-only. */
function nodeGraphPitchQuantizerScaleJackConnected(nodeId) {
  if (typeof nodeGraphModuleScopeConnectionsTo !== "function") {
    return false;
  }
  return (nodeGraphModuleScopeConnectionsTo(nodeId, "Scale") || []).length > 0;
}


/** OR Scale-jack cables into one 12-bit mask (noteMask128 fold / pad params). */
function nodeGraphResolveScaleBitsFromConnections(nodeId) {
  if (typeof nodeGraphModuleScopeConnectionsTo !== "function") return 0;
  const connections = nodeGraphModuleScopeConnectionsTo(nodeId, "Scale") || [];
  let bits = 0;
  const fold = (mask) => (typeof noteMaskPitchClassBits === "function" && mask instanceof Uint8Array
    ? noteMaskPitchClassBits(mask) : 0);
  for (let i = 0; i < connections.length; i += 1) {
    const sp = String(connections[i]?.sourcePort || "");
    const srcId = connections[i]?.sourceNode;
    const source = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(srcId) : null;
    if (source?.type === "chordPad" && typeof nodeGraphChordPadScaleForNode === "function") {
      bits |= nodeGraphChordPadScaleForNode(source) & 0xFFF;
    } else if (source?.type === "pitchQuantizer") {
      bits |= nodeGraphPitchQuantizerKeyboardMask(source) & 0xFFF;
    }
    const live = typeof nodeGraphMvp !== "undefined"
      ? nodeGraphMvp?.live?.nodeOutputs?.get?.(String(srcId))
      : null;
    if (!live || typeof live !== "object") continue;
    if (sp === "Play Keys") bits |= fold(live.playMask);
    else if (sp === "Arp Keys") bits |= fold(live.arpMask);
    else if (sp === "Chord Memory") bits |= fold(live.chordMask || live.chordPlayMask);
    else if (sp === "Scale") {
      bits |= fold(live.scaleMask);
      if (!live.scaleMask && typeof noteMaskResolveScaleBits === "function") {
        bits |= noteMaskResolveScaleBits(live.Scale);
      }
    }
  }
  return bits & 0xFFF;
}

/** Face paint: Scale jack (noteMask128 / legacy bits) overrides keyboard when patched. */
function nodeGraphPitchQuantizerMaskForNode(node) {
  if (!node || typeof node !== "object") {
    return nodeGraphPitchQuantizerScaleMasks[1];
  }
  if (nodeGraphPitchQuantizerScaleJackConnected(node.id)) {
    const bits = typeof nodeGraphResolveScaleBitsFromConnections === "function"
      ? nodeGraphResolveScaleBitsFromConnections(node.id)
      : 0;
    if (bits) return nodeGraphPitchQuantizerNormalizeMask(bits);
  }
  return nodeGraphPitchQuantizerKeyboardMask(node);
}

/** Wire connect/disconnect does not rebuild module DOM — refresh jacked/keys. */
function syncNodeGraphAllPitchQuantizerFaces() {
  const nodes = nodeGraphMvp?.patch?.nodes;
  if (!Array.isArray(nodes) || typeof syncNodeGraphPitchQuantizerFace !== "function") {
    return;
  }
  for (const node of nodes) {
    if (node?.type === "pitchQuantizer") {
      syncNodeGraphPitchQuantizerFace(node.id);
    }
  }
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
  const pitch = nodeGraphFiniteNumber(options.pitch);
  const keyboard = options.scaleMask != null
    ? nodeGraphPitchQuantizerNormalizeMask(options.scaleMask)
    : nodeGraphPitchQuantizerMaskFromChoice(options.scaleChoice);
  const jack = typeof noteMaskResolveScaleBits === "function"
    ? noteMaskResolveScaleBits(options.scaleInput)
    : (Math.round(nodeGraphFiniteNumber(options.scaleInput)) & 0xFFF);
  const mask = (options.hasScaleInput && jack !== 0) ? jack : keyboard;

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
