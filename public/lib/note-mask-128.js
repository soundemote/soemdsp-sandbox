// 128 MIDI on/off mask. Index = MIDI 0..127.
// Play Keys / Arp Keys / Chord Memory pass this array on nodeOutputs.
// Analog jack sample is just busy (0/1). Native arp still packs chunks.

const NOTE_MASK_MIDI_COUNT = 128;
const NOTE_MASK_FLAG1 = 2 ** 49;
const NOTE_MASK_FLAG2 = 2 ** 50;

function noteMaskCreate() {
  return new Uint8Array(NOTE_MASK_MIDI_COUNT);
}

function noteMaskEnsure(mask) {
  if (mask instanceof Uint8Array && mask.length >= NOTE_MASK_MIDI_COUNT) return mask;
  const next = noteMaskCreate();
  if (mask instanceof Uint8Array) next.set(mask.subarray(0, Math.min(mask.length, NOTE_MASK_MIDI_COUNT)));
  return next;
}

function noteMaskClear(mask) {
  const m = noteMaskEnsure(mask);
  m.fill(0);
  return m;
}

function noteMaskSet(mask, midi, on) {
  const m = noteMaskEnsure(mask);
  const i = Math.round(Number(midi));
  if (i < 0 || i >= NOTE_MASK_MIDI_COUNT) return m;
  m[i] = on ? 1 : 0;
  return m;
}

function noteMaskGet(mask, midi) {
  const i = Math.round(Number(midi));
  if (!(mask instanceof Uint8Array) || i < 0 || i >= mask.length) return false;
  return (mask[i] | 0) > 0;
}

function noteMaskOr(a, b) {
  const out = noteMaskCreate();
  const left = noteMaskEnsure(a);
  const right = noteMaskEnsure(b);
  for (let i = 0; i < NOTE_MASK_MIDI_COUNT; i += 1) {
    out[i] = (left[i] | right[i]) ? 1 : 0;
  }
  return out;
}

function noteMaskCopy(mask) {
  return Uint8Array.from(noteMaskEnsure(mask));
}

function noteMaskPackRange(mask, start, end) {
  const m = noteMaskEnsure(mask);
  let bits = 0;
  for (let midi = start, bit = 0; midi <= end; midi += 1, bit += 1) {
    if (m[midi]) bits += 2 ** bit;
  }
  return bits;
}

function noteMaskUnpackRange(mask, bits, start, end) {
  const m = noteMaskEnsure(mask);
  const n = Number(bits) || 0;
  for (let midi = start, bit = 0; midi <= end; midi += 1, bit += 1) {
    m[midi] = Math.floor(n / (2 ** bit)) % 2 === 1 ? 1 : 0;
  }
  return m;
}

function noteMaskHasHighChunks(mask) {
  const m = noteMaskEnsure(mask);
  for (let i = 49; i < NOTE_MASK_MIDI_COUNT; i += 1) {
    if (m[i]) return true;
  }
  return false;
}

function noteMaskPackChunks(mask) {
  return {
    c0: noteMaskPackRange(mask, 0, 48),
    c1: noteMaskPackRange(mask, 49, 97),
    c2: noteMaskPackRange(mask, 98, 127),
  };
}

/** phase: 0, 1, or 2. Always rotate so empty/high chunks can clear latches. */
function noteMaskTransmit(mask, phase) {
  const p = Math.abs(Math.round(Number(phase) || 0)) % 3;
  if (p === 0) return noteMaskPackRange(mask, 0, 48);
  if (p === 1) return NOTE_MASK_FLAG1 + noteMaskPackRange(mask, 49, 97);
  return NOTE_MASK_FLAG2 + noteMaskPackRange(mask, 98, 127);
}

function noteMaskDemuxRegisters(regs, value) {
  const v = Number(value);
  const out = regs && typeof regs === "object" ? regs : { c0: 0, c1: 0, c2: 0 };
  if (!Number.isFinite(v) || v <= 0) {
    if (!(v > 0)) {
      /* keep latched halves */
    }
    return out;
  }
  if (v >= NOTE_MASK_FLAG2) out.c2 = v - NOTE_MASK_FLAG2;
  else if (v >= NOTE_MASK_FLAG1) out.c1 = v - NOTE_MASK_FLAG1;
  else out.c0 = v;
  return out;
}

function noteMaskFromRegisters(regs) {
  const mask = noteMaskCreate();
  const c0 = Number(regs?.c0) || 0;
  const c1 = Number(regs?.c1) || 0;
  const c2 = Number(regs?.c2) || 0;
  noteMaskUnpackRange(mask, c0, 0, 48);
  noteMaskUnpackRange(mask, c1, 49, 97);
  noteMaskUnpackRange(mask, c2, 98, 127);
  return mask;
}

function noteMaskOrTransmit(values, phase) {
  let acc = noteMaskCreate();
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v instanceof Uint8Array) {
      acc = noteMaskOr(acc, v);
      continue;
    }
    const regs = { c0: 0, c1: 0, c2: 0 };
    noteMaskDemuxRegisters(regs, v);
    acc = noteMaskOr(acc, noteMaskFromRegisters(regs));
  }
  return noteMaskTransmit(acc, phase);
}

function noteMaskPitchClassBits(mask) {
  const m = noteMaskEnsure(mask);
  let bits = 0;
  for (let i = 0; i < NOTE_MASK_MIDI_COUNT; i += 1) {
    if (m[i]) bits |= (1 << (i % 12));
  }
  return bits & 0xFFF;
}

/** DAW C3 / middle C. Octave Offset 0 on Scale out starts here. */
const NOTE_MASK_C3_MIDI = 60;

/** Expand 12-bit pitch-class mask to noteMask128 (all octaves of each class). */
function noteMaskFromPitchClassBits(bits) {
  return noteMaskFromPitchClassBitsRange(bits, 11, 0);
}

/**
 * Light pitch classes in `octaves` stacked octaves starting at baseMidi (MIDI 0–127).
 * octaves 1 = one octave of the chord at base; 2 = base and +12; etc.
 */
function noteMaskFromPitchClassBitsRange(bits, octaves, baseMidi) {
  const mask = noteMaskCreate();
  const b = (Math.round(Number(bits)) || 0) & 0xFFF;
  if (!b) return mask;
  let oct = Math.round(Number(octaves));
  if (!Number.isFinite(oct) || oct < 1) oct = 1;
  if (oct > 11) oct = 11;
  let base = Math.round(Number(baseMidi));
  if (!Number.isFinite(base)) base = 60;
  const basePc = ((base % 12) + 12) % 12;
  for (let o = 0; o < oct; o += 1) {
    for (let pc = 0; pc < 12; pc += 1) {
      if (!(b & (1 << pc))) continue;
      const midi = base + o * 12 + ((pc - basePc + 12) % 12);
      if (midi >= 0 && midi < NOTE_MASK_MIDI_COUNT) mask[midi] = 1;
    }
  }
  return mask;
}

/**
 * Scale bus SSOT: noteMask128, legacy 12-bit number, or anything falsy → 0..4095.
 * Packed note-mask transmits (FLAG1+) are not scale values.
 */
function noteMaskChordPadRootPc(params) {
  const p = params && typeof params === "object" ? params : {};
  const keyPc = ((Math.round(Number(p.key)) % 12) + 12) % 12;
  const deg = Math.max(0, Math.min(6, Math.round(Number(p.degree) || 0)));
  const mode = Math.round(Number(p.mode) || 0) === 1 ? 1 : 0;
  const off = mode === 1
    ? [0, 2, 3, 5, 7, 8, 10][deg]
    : [0, 2, 4, 5, 7, 9, 11][deg];
  return (keyPc + off) % 12;
}

/**
 * Scale-out policy: Octaves (1–8) stacked from C3 + Octave Offset + optional root PC.
 * Chord Pad C major at offset 0 → C3 (MIDI 60).
 */
function noteMaskScaleOutFromNode(node, bits) {
  const params = node?.params && typeof node.params === "object" ? node.params : {};
  let oct = Math.round(Number(params.octaves));
  if (!Number.isFinite(oct) || oct < 1) oct = 3;
  if (oct > 8) oct = 8;
  let off = Math.round(Number(params.octaveOffset));
  if (!Number.isFinite(off)) off = 0;
  if (off < -4) off = -4;
  if (off > 4) off = 4;
  const rootPc = String(node?.type || "") === "chordPad"
    ? noteMaskChordPadRootPc(params)
    : 0;
  const baseMidi = NOTE_MASK_C3_MIDI + off * 12 + rootPc;
  return noteMaskFromPitchClassBitsRange(bits, oct, baseMidi);
}

function noteMaskResolveScaleBits(value) {
  if (value instanceof Uint8Array) return noteMaskPitchClassBits(value);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (typeof NOTE_MASK_FLAG1 === 'number' && n >= NOTE_MASK_FLAG1) return 0;
  return Math.round(n) & 0xFFF;
}

function noteMaskToMidiList(mask) {

  const m = noteMaskEnsure(mask);
  const out = [];
  for (let i = 0; i < NOTE_MASK_MIDI_COUNT; i += 1) {
    if (m[i]) out.push(i);
  }
  return out;
}

function polyphonyTableAddNoteMask(table, mask, octaveOffset = 0, velocities = null, defaultVel = 100) {
  if (!(table instanceof Uint8Array)) return table;
  const m = noteMaskEnsure(mask);
  const oct = Math.round(Number(octaveOffset) || 0);
  let vel = Math.round(Number(defaultVel));
  if (!(vel > 0)) vel = 100;
  if (vel > 127) vel = 127;
  for (let raw = 0; raw < NOTE_MASK_MIDI_COUNT; raw += 1) {
    if (!m[raw]) continue;
    const midi = raw + oct * 12;
    if (midi < 0 || midi > 127) continue;
    let use = vel;
    if (velocities instanceof Uint8Array && raw < velocities.length && (velocities[raw] | 0) > 0) {
      use = Math.min(127, velocities[raw] | 0);
    }
    if (typeof polyphonyTableNoteOn === "function") {
      polyphonyTableNoteOn(table, midi, use, false);
    } else if (!table[midi]) {
      table[midi] = use;
    }
  }
  return table;
}

if (typeof globalThis !== "undefined") {
  globalThis.NOTE_MASK_MIDI_COUNT = NOTE_MASK_MIDI_COUNT;
  globalThis.NOTE_MASK_FLAG1 = NOTE_MASK_FLAG1;
  globalThis.NOTE_MASK_FLAG2 = NOTE_MASK_FLAG2;
  globalThis.noteMaskCreate = noteMaskCreate;
  globalThis.noteMaskEnsure = noteMaskEnsure;
  globalThis.noteMaskClear = noteMaskClear;
  globalThis.noteMaskSet = noteMaskSet;
  globalThis.noteMaskGet = noteMaskGet;
  globalThis.noteMaskOr = noteMaskOr;
  globalThis.noteMaskCopy = noteMaskCopy;
  globalThis.noteMaskPackChunks = noteMaskPackChunks;
  globalThis.noteMaskTransmit = noteMaskTransmit;
  globalThis.noteMaskDemuxRegisters = noteMaskDemuxRegisters;
  globalThis.noteMaskFromRegisters = noteMaskFromRegisters;
  globalThis.noteMaskOrTransmit = noteMaskOrTransmit;
  globalThis.noteMaskToMidiList = noteMaskToMidiList;
  globalThis.noteMaskPitchClassBits = noteMaskPitchClassBits;
  globalThis.noteMaskFromPitchClassBits = noteMaskFromPitchClassBits;
  globalThis.noteMaskFromPitchClassBitsRange = noteMaskFromPitchClassBitsRange;
  globalThis.NOTE_MASK_C3_MIDI = NOTE_MASK_C3_MIDI;
  globalThis.noteMaskScaleOutFromNode = noteMaskScaleOutFromNode;
  globalThis.noteMaskResolveScaleBits = noteMaskResolveScaleBits;
  globalThis.polyphonyTableAddNoteMask = polyphonyTableAddNoteMask;
}
