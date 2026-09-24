// Sequencer — Transport-locked piano-roll clip (pure). Tick = 1/32 note.
// 1 beat = 8 ticks. 1 bar of 4/4 = 32 ticks. No live speed.

const SEQUENCER_TICKS_PER_BEAT = 8;
const SEQUENCER_TICKS_PER_BAR = 32;
const SEQUENCER_MAX_BARS = 64;
const SEQUENCER_MAX_TICKS = SEQUENCER_TICKS_PER_BAR * SEQUENCER_MAX_BARS;
const SEQUENCER_BAR_CHOICES = Object.freeze([1, 2, 4, 8, 16, 32, 64]);
const SEQUENCER_DEFAULT_VEL = 100;
const SEQUENCER_SNAP_TICKS = Object.freeze({
  "4/1": 128,
  "2/1": 64,
  "1/1": 32,
  "1/2": 16,
  "1/4": 8,
  "1/8": 4,
  "1/16": 2,
  "1/32": 1,
});
const SEQUENCER_SNAP_LABELS = Object.freeze(["4/1", "2/1", "1/1", "1/2", "1/4", "1/8", "1/16", "1/32"]);

function sequencerDefaultClip() {
  return {
    loopTicks: SEQUENCER_TICKS_PER_BAR,
    snap: 8,
    keysVisible: 24,
    scrollMidi: 48,
    barsVisible: 1,
    labelMode: "name",
    audition: true,
    notes: [],
  };
}

function sequencerClampMidi(m) {
  const n = Math.round(Number(m));
  if (!Number.isFinite(n)) return 60;
  return Math.max(0, Math.min(127, n));
}

function sequencerClampTick(t, loopTicks) {
  const loop = Math.max(1, Math.round(Number(loopTicks) || SEQUENCER_TICKS_PER_BAR));
  let n = Math.round(Number(t));
  if (!Number.isFinite(n)) n = 0;
  n %= loop;
  if (n < 0) n += loop;
  return n;
}

function sequencerNormalizeNote(raw, _loopTicks) {
  const midi = sequencerClampMidi(raw?.midi);
  let start = Math.round(Number(raw?.start));
  if (!Number.isFinite(start)) start = 0;
  if (start < 0) start = 0;
  if (start >= SEQUENCER_MAX_TICKS) start = SEQUENCER_MAX_TICKS - 1;
  let length = Math.round(Number(raw?.length));
  if (!Number.isFinite(length) || length < 1) length = 1;
  if (start + length > SEQUENCER_MAX_TICKS) length = SEQUENCER_MAX_TICKS - start;
  if (length < 1) length = 1;
  let vel = Math.round(Number(raw?.vel));
  if (!Number.isFinite(vel) || vel < 1) vel = SEQUENCER_DEFAULT_VEL;
  if (vel > 127) vel = 127;
  return { midi, start, length, vel };
}

function sequencerNormalizeClip(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const loopTicks = Math.max(
    SEQUENCER_TICKS_PER_BAR,
    Math.min(SEQUENCER_TICKS_PER_BAR * SEQUENCER_MAX_BARS, Math.round(Number(src.loopTicks) || SEQUENCER_TICKS_PER_BAR)),
  );
  const snapRaw = Math.round(Number(src.snap));
  const snap = [1, 2, 4, 8, 16, 32, 64, 128].includes(snapRaw) ? snapRaw : 8;
  const keysVisibleRaw = Math.round(Number(src.keysVisible));
  const keysVisible = [12, 24, 36, 48, 88, 128].includes(keysVisibleRaw) ? keysVisibleRaw : 24;
  let scrollMidi = Math.round(Number(src.scrollMidi));
  if (!Number.isFinite(scrollMidi)) scrollMidi = 48;
  scrollMidi = Math.max(0, Math.min(127, scrollMidi));
  const maxScroll = Math.max(0, 128 - keysVisible);
  if (scrollMidi > maxScroll) scrollMidi = maxScroll;
  const barsVisibleRaw = Math.round(Number(src.barsVisible));
  const barsVisible = SEQUENCER_BAR_CHOICES.includes(barsVisibleRaw) ? barsVisibleRaw : 1;
  const labelMode = src.labelMode === "number" ? "number" : "name";
  const audition = src.audition !== false;
  const notes = Array.isArray(src.notes)
    ? src.notes.map((n) => sequencerNormalizeNote(n, loopTicks))
    : [];
  return { loopTicks, snap, keysVisible, scrollMidi, barsVisible, labelMode, audition, notes };
}

function sequencerCloneClip(clip) {
  const c = sequencerNormalizeClip(clip);
  return {
    ...c,
    notes: c.notes.map((n) => ({ midi: n.midi, start: n.start, length: n.length, vel: n.vel })),
  };
}

function sequencerSnapFloor(tick, snap) {
  const s = Math.max(1, Math.round(Number(snap) || 1));
  const t = Number(tick);
  if (!Number.isFinite(t)) return 0;
  return Math.floor(t / s) * s;
}

function sequencerSnapCeil(tick, snap) {
  const s = Math.max(1, Math.round(Number(snap) || 1));
  const t = Number(tick);
  if (!Number.isFinite(t) || t <= 0) return s;
  return Math.ceil(t / s) * s;
}

function sequencerPitchLabel(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const m = sequencerClampMidi(midi);
  return `${names[m % 12]}${Math.floor(m / 12) - 2}`;
}

function sequencerNoteSoundsAt(note, tick, loopTicks) {
  const loop = Math.max(1, Math.round(Number(loopTicks) || 1));
  const t = sequencerClampTick(tick, loop);
  const start = Math.round(Number(note.start) || 0);
  if (start >= loop) return false;
  const length = Math.max(1, Math.round(note.length) || 1);
  const end = Math.min(start + length, loop);
  return t >= start && t < end;
}

function sequencerSoundingAt(clip, tick) {
  const c = clip && typeof clip === "object" ? clip : sequencerDefaultClip();
  const loop = Math.max(1, Math.round(Number(c.loopTicks) || SEQUENCER_TICKS_PER_BAR));
  const t = sequencerClampTick(tick, loop);
  const out = [];
  const notes = Array.isArray(c.notes) ? c.notes : [];
  for (let i = 0; i < notes.length; i += 1) {
    const n = notes[i];
    if (sequencerNoteSoundsAt(n, t, loop)) out.push(n);
  }
  return out;
}

/** Union of notes overlapping integer ticks [tickFrom, tickTo) on the loop. */
function sequencerSoundingInRange(clip, tickFrom, tickTo, loopTicks) {
  const loop = Math.max(1, Math.round(Number(loopTicks) || SEQUENCER_TICKS_PER_BAR));
  let from = Math.floor(Number(tickFrom));
  let to = Math.floor(Number(tickTo));
  if (!Number.isFinite(from)) from = 0;
  if (!Number.isFinite(to) || to <= from) {
    return sequencerSoundingAt(clip, from);
  }
  const span = Math.min(loop, to - from);
  if (span <= 1) return sequencerSoundingAt(clip, from);
  const seen = new Set();
  const out = [];
  for (let i = 0; i < span; i += 1) {
    const t = from + i;
    const chunk = sequencerSoundingAt(clip, t);
    for (let n = 0; n < chunk.length; n += 1) {
      const note = chunk[n];
      const key = `${note.midi}:${note.start}:${note.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(note);
    }
  }
  return out;
}

function sequencerTickFromBeats(beats, loopTicks) {
  const loop = Math.max(1, Math.round(Number(loopTicks) || SEQUENCER_TICKS_PER_BAR));
  const b = Number(beats);
  if (!Number.isFinite(b) || b < 0) return 0;
  return Math.floor(b * SEQUENCER_TICKS_PER_BEAT) % loop;
}

function sequencerBeatsFromSeconds(seconds, bpm) {
  const t = Number(seconds);
  const tempo = Number(bpm);
  const safeBpm = Number.isFinite(tempo) && tempo > 0 ? tempo : 120;
  if (!Number.isFinite(t) || t < 0) return 0;
  return t * (safeBpm / 60);
}

function sequencerNoteKey(n) {
  return `${Math.round(Number(n?.midi) || 0)}:${Math.round(Number(n?.start) || 0)}:${Math.round(Number(n?.length) || 1)}`;
}

function sequencerTransposeOctave(clip, octaves, selectedKeys) {
  const c = sequencerCloneClip(clip);
  const shift = Math.round(Number(octaves) || 0) * 12;
  if (!shift) return c;
  const filter = selectedKeys instanceof Set && selectedKeys.size > 0 ? selectedKeys : null;
  const notes = [];
  for (let i = 0; i < c.notes.length; i += 1) {
    const n = c.notes[i];
    if (filter && !filter.has(sequencerNoteKey(n))) {
      notes.push({ midi: n.midi, start: n.start, length: n.length, vel: n.vel });
      continue;
    }
    const midi = n.midi + shift;
    if (midi < 0 || midi > 127) {
      if (filter) notes.push({ midi: n.midi, start: n.start, length: n.length, vel: n.vel });
      continue;
    }
    notes.push({ midi, start: n.start, length: n.length, vel: n.vel });
  }
  c.notes = notes;
  if (!filter) {
    const vis = Math.max(1, c.keysVisible | 0);
    c.scrollMidi = Math.max(0, Math.min(128 - vis, (c.scrollMidi | 0) + shift));
  }
  return c;
}

function sequencerScaleClip(clip, factor) {
  const c = sequencerCloneClip(clip);
  const f = Number(factor);
  if (!(f === 2 || f === 0.5)) return c;
  const loop = Math.max(1, Math.round(c.loopTicks * f));
  const nextLoop = Math.max(1, Math.min(SEQUENCER_TICKS_PER_BAR * SEQUENCER_MAX_BARS, loop));
  const notes = [];
  for (let i = 0; i < c.notes.length; i += 1) {
    const n = c.notes[i];
    let start = Math.round(n.start * f);
    let length = Math.round(n.length * f);
    if (length < 1) length = 1;
    if (start < 0) start = 0;
    if (start >= nextLoop) continue;
    if (length > nextLoop) length = nextLoop;
    notes.push({ midi: n.midi, start, length, vel: n.vel });
  }
  c.loopTicks = nextLoop;
  c.notes = notes;
  return c;
}

function sequencerHitNote(clip, tick, midi) {
  const t = Math.round(Number(tick) || 0);
  const m = sequencerClampMidi(midi);
  const notes = Array.isArray(clip?.notes) ? clip.notes : [];
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const n = notes[i];
    if (n.midi !== m) continue;
    const start = Math.round(Number(n.start) || 0);
    const length = Math.max(1, Math.round(n.length) || 1);
    if (t >= start && t < start + length) return i;
  }
  return -1;
}

function sequencerAddNote(clip, tick, midi) {
  const c = sequencerCloneClip(clip);
  const start = sequencerSnapFloor(tick, c.snap);
  const length = Math.max(1, c.snap);
  c.notes.push(sequencerNormalizeNote({
    midi,
    start,
    length,
    vel: SEQUENCER_DEFAULT_VEL,
  }, c.loopTicks));
  return c;
}

function sequencerRemoveNoteAt(clip, index) {
  const c = sequencerCloneClip(clip);
  if (index < 0 || index >= c.notes.length) return c;
  c.notes.splice(index, 1);
  return c;
}

function sequencerRemoveNotesAt(clip, indices) {
  const c = sequencerCloneClip(clip);
  const drop = new Set((indices || []).map((i) => i | 0));
  if (!drop.size) return c;
  c.notes = c.notes.filter((_, i) => !drop.has(i));
  return c;
}

function sequencerMoveNote(clip, index, tick, midi) {
  const c = sequencerCloneClip(clip);
  if (index < 0 || index >= c.notes.length) return c;
  const n = c.notes[index];
  let start = sequencerSnapFloor(tick, c.snap);
  if (start < 0) start = 0;
  const maxStart = Math.max(0, SEQUENCER_MAX_TICKS - n.length);
  if (start > maxStart) start = maxStart;
  c.notes[index] = sequencerNormalizeNote({
    ...n,
    start,
    midi,
  }, c.loopTicks);
  return c;
}

function sequencerResizeNote(clip, index, endTick) {
  const c = sequencerCloneClip(clip);
  if (index < 0 || index >= c.notes.length) return c;
  const n = c.notes[index];
  const snap = Math.max(1, c.snap);
  const end = sequencerSnapCeil(endTick, snap);
  let length = end - n.start;
  if (length < snap) length = snap;
  c.notes[index] = sequencerNormalizeNote({ ...n, length }, c.loopTicks);
  return c;
}

function sequencerOutputsFromNotes(notes, phase, prevMask) {
  const mask = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  const table = typeof polyphonyCreateTable === "function" ? polyphonyCreateTable() : new Uint8Array(128);
  let highest = -1;
  let vel = 0;
  const list = Array.isArray(notes) ? notes : [];
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i];
    const midi = sequencerClampMidi(n.midi);
    const v = Math.max(1, Math.min(127, Math.round(Number(n.vel) || SEQUENCER_DEFAULT_VEL)));
    if (typeof noteMaskSet === "function") noteMaskSet(mask, midi, true);
    else mask[midi] = 1;
    if (typeof polyphonyTableSet === "function") polyphonyTableSet(table, midi, v);
    else table[midi] = v;
    if (midi >= highest) {
      highest = midi;
      vel = v;
    }
  }
  const play = typeof noteMaskTransmit === "function" ? noteMaskTransmit(mask, phase) : 0;
  const poly = typeof polyphonyTableWireSample === "function" ? polyphonyTableWireSample(table) : 0;
  const gate = list.length > 0 ? 1 : 0;
  let trigger = 0;
  if (prevMask instanceof Uint8Array) {
    for (let m = 0; m < 128; m += 1) {
      if (mask[m] && !prevMask[m]) {
        trigger = 1;
        break;
      }
    }
  } else if (gate) {
    trigger = 1;
  }
  const freq = highest >= 0 ? 440 * (2 ** ((highest - 69) / 12)) : 0;
  return {
    mask,
    table,
    play,
    poly,
    gate,
    trigger,
    midi: highest,
    vel,
    pitch: highest >= 0 ? highest : 0,
    freq,
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.SEQUENCER_TICKS_PER_BEAT = SEQUENCER_TICKS_PER_BEAT;
  globalThis.SEQUENCER_TICKS_PER_BAR = SEQUENCER_TICKS_PER_BAR;
  globalThis.SEQUENCER_MAX_BARS = SEQUENCER_MAX_BARS;
  globalThis.SEQUENCER_MAX_TICKS = SEQUENCER_MAX_TICKS;
  globalThis.SEQUENCER_BAR_CHOICES = SEQUENCER_BAR_CHOICES;
  globalThis.SEQUENCER_SNAP_TICKS = SEQUENCER_SNAP_TICKS;
  globalThis.SEQUENCER_SNAP_LABELS = SEQUENCER_SNAP_LABELS;
  globalThis.sequencerDefaultClip = sequencerDefaultClip;
  globalThis.sequencerNormalizeClip = sequencerNormalizeClip;
  globalThis.sequencerCloneClip = sequencerCloneClip;
  globalThis.sequencerSoundingAt = sequencerSoundingAt;
  globalThis.sequencerSoundingInRange = sequencerSoundingInRange;
  globalThis.sequencerTickFromBeats = sequencerTickFromBeats;
  globalThis.sequencerBeatsFromSeconds = sequencerBeatsFromSeconds;
  globalThis.sequencerNoteKey = sequencerNoteKey;
  globalThis.sequencerTransposeOctave = sequencerTransposeOctave;
  globalThis.sequencerScaleClip = sequencerScaleClip;
  globalThis.sequencerHitNote = sequencerHitNote;
  globalThis.sequencerAddNote = sequencerAddNote;
  globalThis.sequencerRemoveNoteAt = sequencerRemoveNoteAt;
  globalThis.sequencerRemoveNotesAt = sequencerRemoveNotesAt;
  globalThis.sequencerMoveNote = sequencerMoveNote;
  globalThis.sequencerResizeNote = sequencerResizeNote;
  globalThis.sequencerOutputsFromNotes = sequencerOutputsFromNotes;
  globalThis.sequencerSnapFloor = sequencerSnapFloor;
  globalThis.sequencerSnapCeil = sequencerSnapCeil;
  globalThis.sequencerPitchLabel = sequencerPitchLabel;
  globalThis.sequencerClampMidi = sequencerClampMidi;
}
