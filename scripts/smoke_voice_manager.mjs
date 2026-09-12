// VoiceManager freestanding smoke: note_on/off, midiNoteStatus, release by note.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(__dirname, "..", "native_modules", "combined", "soemdsp_combined.wasm");
const bytes = fs.readFileSync(wasmPath);
const { instance } = await WebAssembly.instantiate(bytes, {});
const e = instance.exports;

const must = (name) => {
  const fn = e[name];
  if (typeof fn !== "function") throw new Error(`missing export ${name}`);
  return fn;
};

const create = must("soemdsp_voice_manager_create");
const destroy = must("soemdsp_voice_manager_destroy");
const setPoly = must("soemdsp_voice_manager_set_polyphony");
const setPhony = must("soemdsp_voice_manager_set_phony_mode");
const noteOn = must("soemdsp_voice_manager_note_on");
const noteOff = must("soemdsp_voice_manager_note_off");
const sust = must("soemdsp_voice_manager_sustaining_count");
const voiceNote = must("soemdsp_voice_manager_voice_note");
const voiceState = must("soemdsp_voice_manager_voice_state");
const isOn = must("soemdsp_voice_manager_note_is_on");
const histCount = must("soemdsp_voice_manager_history_count");
const histNote = must("soemdsp_voice_manager_history_note");
const lastKind = must("soemdsp_voice_manager_last_event_kind");

const h = create() | 0;
if (!(h > 0)) throw new Error("create failed");
setPoly(h, 4);
setPhony(h, 1); // polyphony

noteOn(h, 60, 0.8);
noteOn(h, 64, 0.7);
noteOn(h, 67, 0.6);
if ((sust(h) | 0) !== 3) throw new Error(`expected 3 sustaining, got ${sust(h)}`);
if ((isOn(h, 64) | 0) !== 1) throw new Error("64 should be on");
if ((histCount(h) | 0) !== 3) throw new Error("history count");

// Duplicate note_on ignored
noteOn(h, 64, 1.0);
if ((sust(h) | 0) !== 3) throw new Error("duplicate on should ignore");

// Turn off middle note only
noteOff(h, 64);
if ((isOn(h, 64) | 0) !== 0) throw new Error("64 should be off");
if ((isOn(h, 60) | 0) !== 1) throw new Error("60 still on");
if ((isOn(h, 67) | 0) !== 1) throw new Error("67 still on");
if ((sust(h) | 0) !== 2) throw new Error(`expected 2 sustaining after middle off, got ${sust(h)}`);

// Remaining offs
noteOff(h, 60);
noteOff(h, 67);
if ((sust(h) | 0) !== 0) throw new Error("all should release from sustaining");
if ((histCount(h) | 0) !== 0) throw new Error("history empty");

// Mono legato: A on, B on, B off → back to A
setPhony(h, 0);
setPoly(h, 1);
noteOn(h, 48, 1);
noteOn(h, 55, 1);
if ((histNote(h, 0) | 0) !== 55) throw new Error("history top should be 55");
noteOff(h, 55);
if ((voiceNote(h, 0) | 0) !== 48) throw new Error(`legato retarget expected 48, got ${voiceNote(h, 0)}`);
if ((isOn(h, 48) | 0) !== 1) throw new Error("48 still status on");
noteOff(h, 48);
if ((voiceState(h, 0) | 0) !== 2) throw new Error("last off → releasing");

destroy(h);
console.log("smoke_voice_manager: ok", { lastKind: lastKind(h) });
