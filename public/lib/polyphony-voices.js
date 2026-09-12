// Polyphony voice table — Midi Note + Velocity (status = velocity > 0).
// Mirrors native_modules/sandbox_native_maths/polyphony_voices.h
// Full MIDI 0..127. No Play/Arp bitmasks / phase-mux on this bus.

const POLYPHONY_NOTE_COUNT = 128;
const POLYPHONY_MAX_VOICES = 32;

function polyphonyCreateTable() {
  return new Uint8Array(POLYPHONY_NOTE_COUNT);
}

function polyphonyTableClear(table) {
  if (!(table instanceof Uint8Array)) return;
  table.fill(0);
}

function polyphonyTableSet(table, midi, velocity) {
  if (!(table instanceof Uint8Array)) return;
  const m = Math.round(Number(midi));
  if (!(m >= 0) || m >= POLYPHONY_NOTE_COUNT) return;
  let v = Math.round(Number(velocity));
  if (!(v > 0)) {
    table[m] = 0;
    return;
  }
  if (v > 127) v = 127;
  table[m] = v;
}

/** True when this MIDI note is already held (velocity > 0). */
function polyphonyTableIsSustaining(table, midi) {
  if (!(table instanceof Uint8Array)) return false;
  const m = Math.round(Number(midi));
  if (!(m >= 0) || m >= POLYPHONY_NOTE_COUNT) return false;
  return (table[m] | 0) > 0;
}

/**
 * Note-on into the table. If already sustaining, keep existing velocity
 * (no retrigger / no overwrite) unless forceVelocity is set.
 * Returns true when this call newly opened the note.
 */
function polyphonyTableNoteOn(table, midi, velocity, forceVelocity = false) {
  if (!(table instanceof Uint8Array)) return false;
  const m = Math.round(Number(midi));
  if (!(m >= 0) || m >= POLYPHONY_NOTE_COUNT) return false;
  let v = Math.round(Number(velocity));
  if (!(v > 0)) v = 100;
  if (v > 127) v = 127;
  if (polyphonyTableIsSustaining(table, m) && !forceVelocity) {
    return false;
  }
  table[m] = v;
  return true;
}

/** Note-off: clear only this MIDI note. */
function polyphonyTableNoteOff(table, midi) {
  if (!(table instanceof Uint8Array)) return;
  const m = Math.round(Number(midi));
  if (!(m >= 0) || m >= POLYPHONY_NOTE_COUNT) return;
  table[m] = 0;
}

/**
 * Merge gold latch bitmasks (88-key face, baseMidi + index) into a 128 table.
 * Already-sustaining notes are left alone (same velocity).
 */
function polyphonyTableAddGoldLatchBits(table, low, high, baseMidi = 24, latchVelocity = 100) {
  if (!(table instanceof Uint8Array)) return table;
  const base = Math.round(Number(baseMidi));
  const lo = Math.trunc(Number(low) || 0);
  const hi = Math.trunc(Number(high) || 0);
  let vel = Math.round(Number(latchVelocity));
  if (!(vel > 0)) vel = 100;
  if (vel > 127) vel = 127;
  for (let i = 0; i <= 87; i += 1) {
    const mask = i < 49 ? lo : hi;
    const bit = i < 49 ? i : i - 49;
    const on = Math.floor(mask / (2 ** bit)) % 2 === 1;
    if (!on) continue;
    polyphonyTableNoteOn(table, base + i, vel, false);
  }
  return table;
}

function polyphonyTableFromHeldNotesMap(notes) {
  const table = polyphonyCreateTable();
  if (!(notes instanceof Map)) return table;
  for (const [midi, vel] of notes) {
    polyphonyTableSet(table, midi, vel);
  }
  return table;
}

function polyphonyTableMergeMax(dst, src) {
  if (!(dst instanceof Uint8Array) || !(src instanceof Uint8Array)) return dst;
  const n = Math.min(dst.length, src.length, POLYPHONY_NOTE_COUNT);
  for (let i = 0; i < n; i += 1) {
    if (src[i] > dst[i]) dst[i] = src[i];
  }
  return dst;
}

function polyphonyTableCopy(src) {
  const out = polyphonyCreateTable();
  if (src instanceof Uint8Array) out.set(src.subarray(0, POLYPHONY_NOTE_COUNT));
  return out;
}

/** Active notes as { midi, velocity }[] ascending pitch. */
function polyphonyTableCollect(table, maxOut = POLYPHONY_NOTE_COUNT) {
  const notes = [];
  if (!(table instanceof Uint8Array)) return notes;
  const lim = Math.max(1, Math.min(POLYPHONY_NOTE_COUNT, maxOut | 0));
  for (let m = 0; m < POLYPHONY_NOTE_COUNT; m += 1) {
    const v = table[m] | 0;
    if (!v) continue;
    notes.push({ midi: m, velocity: v });
    if (notes.length >= lim) break;
  }
  return notes;
}

function polyphonyTableActiveCount(table) {
  if (!(table instanceof Uint8Array)) return 0;
  let n = 0;
  for (let i = 0; i < POLYPHONY_NOTE_COUNT; i += 1) {
    if (table[i]) n += 1;
  }
  return n;
}

/**
 * Wire sample for Polyphony out (scope/cable presence).
 * Integer = midi note of newest/highest active; fraction = velocity/128.
 * 0 when silent. Meta Voices ignores this float — reads the velocity table.
 */
function polyphonyTableWireSample(table) {
  if (!(table instanceof Uint8Array)) return 0;
  for (let m = POLYPHONY_NOTE_COUNT - 1; m >= 0; m -= 1) {
    const v = table[m] | 0;
    if (v > 0) return m + (v / 128);
  }
  return 0;
}

function polyphonyCreateSlots(laneCount) {
  const n = Math.max(1, Math.min(POLYPHONY_MAX_VOICES, laneCount | 0));
  const slots = [];
  for (let i = 0; i < n; i += 1) {
    slots.push({ midi: -1, velocity: 0, age: 0 });
  }
  return slots;
}

/**
 * Sticky voice allocator (mirrors C++ polyphony_allocate_sticky).
 * Returns updated ageCounter.
 */
function polyphonyAllocateSticky(table, slots, ageCounter) {
  if (!(table instanceof Uint8Array) || !Array.isArray(slots) || !slots.length) {
    return ageCounter | 0;
  }
  const laneCount = Math.min(POLYPHONY_MAX_VOICES, slots.length);
  let age = ageCounter | 0;

  for (let i = 0; i < laneCount; i += 1) {
    const slot = slots[i];
    const m = slot.midi | 0;
    if (!(m >= 0) || m >= POLYPHONY_NOTE_COUNT) {
      slot.midi = -1;
      slot.velocity = 0;
      slot.age = 0;
      continue;
    }
    const v = table[m] | 0;
    if (!v) {
      slot.midi = -1;
      slot.velocity = 0;
      slot.age = 0;
    } else {
      slot.velocity = v;
    }
  }

  for (let m = 0; m < POLYPHONY_NOTE_COUNT; m += 1) {
    const v = table[m] | 0;
    if (!v) continue;
    let found = false;
    for (let i = 0; i < laneCount; i += 1) {
      if (slots[i].midi === m) {
        found = true;
        break;
      }
    }
    if (found) continue;

    let freeIdx = -1;
    for (let i = 0; i < laneCount; i += 1) {
      if (slots[i].midi < 0) {
        freeIdx = i;
        break;
      }
    }
    if (freeIdx < 0) {
      freeIdx = 0;
      for (let i = 1; i < laneCount; i += 1) {
        if ((slots[i].age | 0) < (slots[freeIdx].age | 0)) freeIdx = i;
      }
    }
    age += 1;
    slots[freeIdx].midi = m;
    slots[freeIdx].velocity = v;
    slots[freeIdx].age = age;
  }
  return age;
}

function polyphonyVoiceHz(midi, metaNode) {
  if (!(midi >= 0) || midi > 127) return 0;
  const oct = Number(metaNode?.params?.octave) || 0;
  const st = Number(metaNode?.params?.semitones) || 0;
  const cents = Number(metaNode?.params?.cents) || 0;
  const freqOff = Number(metaNode?.params?.frequency) || 0;
  const base = 440 * (2 ** ((midi - 69) / 12));
  return base * (2 ** (oct + (st / 12) + (cents / 1200))) + freqOff;
}

// Browser / worklet global (no module bundler for worklet blob).
if (typeof globalThis !== "undefined") {
  globalThis.POLYPHONY_NOTE_COUNT = POLYPHONY_NOTE_COUNT;
  globalThis.POLYPHONY_MAX_VOICES = POLYPHONY_MAX_VOICES;
  globalThis.polyphonyCreateTable = polyphonyCreateTable;
  globalThis.polyphonyTableClear = polyphonyTableClear;
  globalThis.polyphonyTableSet = polyphonyTableSet;
  globalThis.polyphonyTableIsSustaining = polyphonyTableIsSustaining;
  globalThis.polyphonyTableNoteOn = polyphonyTableNoteOn;
  globalThis.polyphonyTableNoteOff = polyphonyTableNoteOff;
  globalThis.polyphonyTableAddGoldLatchBits = polyphonyTableAddGoldLatchBits;
  globalThis.polyphonyTableFromHeldNotesMap = polyphonyTableFromHeldNotesMap;
  globalThis.polyphonyTableMergeMax = polyphonyTableMergeMax;
  globalThis.polyphonyTableCopy = polyphonyTableCopy;
  globalThis.polyphonyTableCollect = polyphonyTableCollect;
  globalThis.polyphonyTableActiveCount = polyphonyTableActiveCount;
  globalThis.polyphonyTableWireSample = polyphonyTableWireSample;
  globalThis.polyphonyCreateSlots = polyphonyCreateSlots;
  globalThis.polyphonyAllocateSticky = polyphonyAllocateSticky;
  globalThis.polyphonyVoiceHz = polyphonyVoiceHz;
}
