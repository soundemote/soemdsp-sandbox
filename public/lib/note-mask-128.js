// 128 MIDI on/off mask for Play Keys / Arp Keys.
// Internal: Uint8Array(128), index = MIDI 0..127.
// Wire (one analog sample): 3 self-describing chunks (mantissa still ~53 bits).
//   chunk0 MIDI 0–48:  raw
//   chunk1 MIDI 49–97: 2^49 + bits
//   chunk2 MIDI 98–127: 2^50 + bits
// If only chunk0 is used, every sample is chunk0 (0-sample delay).

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

/** phase: 0, 1, or 2. */
function noteMaskTransmit(mask, phase) {
  const c0 = noteMaskPackRange(mask, 0, 48);
  if (!noteMaskHasHighChunks(mask)) return c0;
  const p = Math.abs(Math.round(Number(phase) || 0)) % 3;
  if (p === 0) return c0;
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
  globalThis.noteMaskTransmit = noteMaskTransmit;
  globalThis.noteMaskDemuxRegisters = noteMaskDemuxRegisters;
  globalThis.noteMaskFromRegisters = noteMaskFromRegisters;
  globalThis.noteMaskOrTransmit = noteMaskOrTransmit;
  globalThis.noteMaskToMidiList = noteMaskToMidiList;
  globalThis.polyphonyTableAddNoteMask = polyphonyTableAddNoteMask;
}
