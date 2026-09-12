// soemdsp-native-module: voice_manager
// soemdsp-native-label: VoiceManager
// soemdsp-native-target: voice_manager
// soemdsp-native-kind: pitch
//
// Freestanding port of soemdsp VoiceManager polyphony/monophony core
// (include/soemdsp/plugin/VoiceManager.hpp). No STL — fixed pools for wasm.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kMaxVoices = 32;
static const int kMidiNotes = 128;

enum VoiceState {
  VS_AVAILABLE = 0,
  VS_SUSTAINING = 1,
  VS_RELEASING = 2
};

enum PhonyMode {
  PHONY_MONO = 0,
  PHONY_POLY = 1
};

enum SlideMode {
  SLIDE_NEVER = 0,
  SLIDE_ALLOW = 1,
  SLIDE_ALWAYS = 2
};

enum EventKind {
  EV_NONE = 0,
  EV_ATTACK = 1,
  EV_LEGATO = 2,
  EV_SLIDE = 3,
  EV_RELEASE = 4
};

struct Voice {
  int idx;
  int note;
  double velocity;
  int state;
};

struct Manager {
  bool active;
  int polyphony;
  int phonyMode;
  int slideMode;

  Voice voices[kMaxVoices];
  int available[kMaxVoices];
  int sustaining[kMaxVoices];
  int releasing[kMaxVoices];
  int availableCount;
  int sustainingCount;
  int releasingCount;

  bool midiNoteStatus[kMidiNotes];
  int noteHistory[kMidiNotes];
  int noteHistoryCount;
  int previousNoteOn;
  int indexForLegato;

  int lastAttackSlot;
  int lastEventKind;
};

static Manager gPool[kMaxInstances];

static void clear_status(Manager& m) {
  for (int i = 0; i < kMidiNotes; i++) m.midiNoteStatus[i] = false;
  m.noteHistoryCount = 0;
  m.previousNoteOn = -1;
  m.indexForLegato = 0;
  m.lastAttackSlot = -1;
  m.lastEventKind = EV_NONE;
}

static void rebuild_pools(Manager& m, int polyphony) {
  if (polyphony < 1) polyphony = 1;
  if (polyphony > kMaxVoices) polyphony = kMaxVoices;
  m.polyphony = polyphony;
  m.availableCount = 0;
  m.sustainingCount = 0;
  m.releasingCount = 0;
  for (int i = 0; i < polyphony; i++) {
    m.voices[i].idx = i;
    m.voices[i].note = -1;
    m.voices[i].velocity = 0.0;
    m.voices[i].state = VS_AVAILABLE;
    m.available[m.availableCount++] = i;
  }
  for (int i = polyphony; i < kMaxVoices; i++) {
    m.voices[i].idx = i;
    m.voices[i].note = -1;
    m.voices[i].velocity = 0.0;
    m.voices[i].state = VS_AVAILABLE;
  }
  clear_status(m);
}

static void add_note_to_history(Manager& m, int note) {
  if (m.noteHistoryCount >= kMidiNotes) return;
  for (int i = m.noteHistoryCount; i > 0; i--) {
    m.noteHistory[i] = m.noteHistory[i - 1];
  }
  m.noteHistory[0] = note;
  m.noteHistoryCount += 1;
}

static void remove_note_from_history(Manager& m, int note) {
  int found = -1;
  for (int i = 0; i < m.noteHistoryCount; i++) {
    if (m.noteHistory[i] == note) {
      found = i;
      break;
    }
  }
  if (found < 0) return;
  for (int i = found; i < m.noteHistoryCount - 1; i++) {
    m.noteHistory[i] = m.noteHistory[i + 1];
  }
  m.noteHistoryCount -= 1;
}

static int erase_from_list(int* list, int& count, int voiceIdx) {
  for (int i = 0; i < count; i++) {
    if (list[i] == voiceIdx) {
      for (int j = i; j < count - 1; j++) list[j] = list[j + 1];
      count -= 1;
      return 1;
    }
  }
  return 0;
}

static void push_list(int* list, int& count, int voiceIdx) {
  if (count >= kMaxVoices) return;
  list[count++] = voiceIdx;
}

static int steal_releasing_same_note(Manager& m, int note) {
  for (int i = 0; i < m.releasingCount; i++) {
    const int vi = m.releasing[i];
    if (m.voices[vi].note == note) {
      erase_from_list(m.releasing, m.releasingCount, vi);
      push_list(m.sustaining, m.sustainingCount, vi);
      m.voices[vi].state = VS_SUSTAINING;
      return vi;
    }
  }
  return -1;
}

static int add_voice(Manager& m, int note, double velocity) {
  int vi = steal_releasing_same_note(m, note);
  if (vi >= 0) {
    m.voices[vi].note = note;
    m.voices[vi].velocity = velocity;
    return vi;
  }

  if (m.availableCount > 0) {
    vi = m.available[0];
    for (int i = 0; i < m.availableCount - 1; i++) m.available[i] = m.available[i + 1];
    m.availableCount -= 1;
    push_list(m.sustaining, m.sustainingCount, vi);
    m.voices[vi].state = VS_SUSTAINING;
    m.voices[vi].note = note;
    m.voices[vi].velocity = velocity;
    return vi;
  }

  if (m.releasingCount > 0) {
    // Steal oldest releasing.
    vi = m.releasing[0];
    for (int i = 0; i < m.releasingCount - 1; i++) m.releasing[i] = m.releasing[i + 1];
    m.releasingCount -= 1;
    push_list(m.sustaining, m.sustainingCount, vi);
    m.voices[vi].state = VS_SUSTAINING;
    m.voices[vi].note = note;
    m.voices[vi].velocity = velocity;
    return vi;
  }

  if (m.sustainingCount > 0) {
    // Steal oldest sustaining (rotate to back as newest).
    vi = m.sustaining[0];
    for (int i = 0; i < m.sustainingCount - 1; i++) m.sustaining[i] = m.sustaining[i + 1];
    m.sustaining[m.sustainingCount - 1] = vi;
    m.voices[vi].note = note;
    m.voices[vi].velocity = velocity;
    return vi;
  }
  return -1;
}

static int release_voice_by_note(Manager& m, int note) {
  for (int i = 0; i < m.sustainingCount; i++) {
    const int vi = m.sustaining[i];
    if (m.voices[vi].note == note) {
      erase_from_list(m.sustaining, m.sustainingCount, vi);
      push_list(m.releasing, m.releasingCount, vi);
      m.voices[vi].state = VS_RELEASING;
      return vi;
    }
  }
  return -1;
}

static int find_voice_by_index(Manager& m, int idx) {
  if (idx < 0 || idx >= m.polyphony) return -1;
  return idx;
}

static void move_voice_to_sustaining_by_index(Manager& m, int idx) {
  const int vi = find_voice_by_index(m, idx);
  if (vi < 0) return;
  erase_from_list(m.available, m.availableCount, vi);
  erase_from_list(m.releasing, m.releasingCount, vi);
  erase_from_list(m.sustaining, m.sustainingCount, vi);
  push_list(m.sustaining, m.sustainingCount, vi);
  m.voices[vi].state = VS_SUSTAINING;
}

static void move_voice_to_releasing_by_index(Manager& m, int idx) {
  const int vi = find_voice_by_index(m, idx);
  if (vi < 0) return;
  erase_from_list(m.available, m.availableCount, vi);
  erase_from_list(m.sustaining, m.sustainingCount, vi);
  int already = 0;
  for (int i = 0; i < m.releasingCount; i++) {
    if (m.releasing[i] == vi) already = 1;
  }
  if (!already) push_list(m.releasing, m.releasingCount, vi);
  m.voices[vi].state = VS_RELEASING;
}

static void handle_polyphony_note_on(Manager& m, int note, double velocity) {
  const int vi = add_voice(m, note, velocity);
  if (vi < 0) return;
  m.indexForLegato = m.voices[vi].idx;
  m.lastAttackSlot = vi;
  if (m.slideMode == SLIDE_ALWAYS) {
    m.lastEventKind = EV_SLIDE;
  } else {
    m.lastEventKind = EV_ATTACK;
  }
}

static void handle_polyphony_note_off(Manager& m, int note) {
  const int vi = release_voice_by_note(m, note);
  if (vi >= 0) {
    m.lastEventKind = EV_RELEASE;
    m.lastAttackSlot = vi;
  }
}

static void handle_monophony_note_on(Manager& m, int note, double velocity) {
  move_voice_to_sustaining_by_index(m, m.indexForLegato);
  const int vi = find_voice_by_index(m, m.indexForLegato);
  if (vi < 0) return;
  m.voices[vi].note = note;
  m.voices[vi].velocity = velocity;
  m.lastAttackSlot = vi;

  const int hadSustaining = (m.sustainingCount > 1) || (m.sustainingCount == 1 && m.noteHistoryCount > 1);
  // After add_note_to_history, count includes this note. Empty before = attack.
  // Simpler: if history had only this note (count==1), attack; else legato/slide.
  if (m.noteHistoryCount <= 1) {
    if (m.slideMode == SLIDE_ALWAYS) {
      m.lastEventKind = EV_SLIDE;
    } else {
      m.lastEventKind = EV_ATTACK;
    }
  } else {
    if (m.slideMode == SLIDE_NEVER) {
      m.lastEventKind = EV_ATTACK;
    } else {
      m.lastEventKind = EV_LEGATO;
    }
  }
  (void)hadSustaining;
}

static void handle_monophony_note_off(Manager& m, int note) {
  const int vi = find_voice_by_index(m, m.indexForLegato);
  if (vi < 0) return;

  if (m.noteHistoryCount == 0) {
    move_voice_to_releasing_by_index(m, m.indexForLegato);
    m.voices[vi].note = note;
    m.lastEventKind = EV_RELEASE;
    m.lastAttackSlot = vi;
    return;
  }

  // Still holding other notes — retarget to most recent held.
  const int retarget = m.noteHistory[0];
  move_voice_to_sustaining_by_index(m, m.indexForLegato);
  m.voices[vi].note = retarget;
  m.previousNoteOn = retarget;
  m.lastAttackSlot = vi;
  if (m.slideMode == SLIDE_NEVER) {
    m.lastEventKind = EV_ATTACK;
  } else if (m.slideMode == SLIDE_ALLOW || m.slideMode == SLIDE_ALWAYS) {
    m.lastEventKind = EV_LEGATO;
  }
}

static void end_all_voices(Manager& m) {
  m.availableCount = 0;
  m.sustainingCount = 0;
  m.releasingCount = 0;
  for (int i = 0; i < m.polyphony; i++) {
    m.voices[i].note = -1;
    m.voices[i].velocity = 0.0;
    m.voices[i].state = VS_AVAILABLE;
    m.available[m.availableCount++] = i;
  }
  clear_status(m);
}

static Manager* get(int handle) {
  if (handle < 1 || handle > kMaxInstances) return nullptr;
  Manager& m = gPool[handle - 1];
  return m.active ? &m : nullptr;
}

}  // namespace

extern "C" int soemdsp_voice_manager_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      Manager& m = gPool[i];
      m.active = true;
      m.phonyMode = PHONY_POLY;
      m.slideMode = SLIDE_NEVER;
      rebuild_pools(m, 4);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_voice_manager_destroy(int handle) {
  Manager* m = get(handle);
  if (!m) {
    if (handle >= 1 && handle <= kMaxInstances) gPool[handle - 1].active = false;
    return;
  }
  m->active = false;
}

extern "C" void soemdsp_voice_manager_set_polyphony(int handle, int n) {
  Manager* m = get(handle);
  if (!m) return;
  if (n == m->polyphony) return;
  rebuild_pools(*m, n);
}

extern "C" void soemdsp_voice_manager_set_phony_mode(int handle, int mode) {
  Manager* m = get(handle);
  if (!m) return;
  m->phonyMode = (mode == PHONY_MONO) ? PHONY_MONO : PHONY_POLY;
}

extern "C" void soemdsp_voice_manager_set_slide_mode(int handle, int mode) {
  Manager* m = get(handle);
  if (!m) return;
  if (mode < SLIDE_NEVER) mode = SLIDE_NEVER;
  if (mode > SLIDE_ALWAYS) mode = SLIDE_ALWAYS;
  m->slideMode = mode;
}

extern "C" void soemdsp_voice_manager_note_on(int handle, int note, double velocity01) {
  Manager* m = get(handle);
  if (!m) return;
  if (note < 0 || note >= kMidiNotes) return;
  if (m->midiNoteStatus[note]) return; // already on — ignore (VoiceManager contract)

  double vel = safe(velocity01);
  if (vel < 0.0) vel = 0.0;
  if (vel > 1.0) vel = 1.0;
  if (!(vel > 0.0)) vel = 100.0 / 127.0;

  m->midiNoteStatus[note] = true;
  add_note_to_history(*m, note);
  m->lastEventKind = EV_NONE;

  if (m->phonyMode == PHONY_MONO) {
    handle_monophony_note_on(*m, note, vel);
  } else {
    handle_polyphony_note_on(*m, note, vel);
  }
  m->previousNoteOn = note;
}

extern "C" void soemdsp_voice_manager_note_off(int handle, int note) {
  Manager* m = get(handle);
  if (!m) return;
  if (note < 0 || note >= kMidiNotes) return;
  if (!m->midiNoteStatus[note]) return; // already off — ignore

  m->midiNoteStatus[note] = false;
  remove_note_from_history(*m, note);
  m->lastEventKind = EV_NONE;

  if (m->phonyMode == PHONY_MONO) {
    handle_monophony_note_off(*m, note);
  } else {
    handle_polyphony_note_off(*m, note);
  }

  // Stay in Releasing until clean() — driven by explicit isIdle wiring
  // (ADSR/reverb/delay → Voice Idle). Steal still prefers releasing first.
}

static void free_releasing_voice(Manager& m, int vi) {
  if (!erase_from_list(m.releasing, m.releasingCount, vi)) return;
  m.voices[vi].note = -1;
  m.voices[vi].velocity = 0.0;
  m.voices[vi].state = VS_AVAILABLE;
  if (m.availableCount < kMaxVoices) {
    for (int i = m.availableCount; i > 0; i--) {
      m.available[i] = m.available[i - 1];
    }
    m.available[0] = vi;
    m.availableCount += 1;
  }
}

/** Free all releasing voices when idleFlag > 0 (legacy shared Voice Idle). */
extern "C" void soemdsp_voice_manager_clean(int handle, int idleFlag) {
  Manager* m = get(handle);
  if (!m || !(idleFlag > 0)) return;
  while (m->releasingCount > 0) {
    free_releasing_voice(*m, m->releasing[m->releasingCount - 1]);
  }
}

/** Free one releasing slot when that voice's isIdle is high (per-voice envelopes). */
extern "C" void soemdsp_voice_manager_clean_slot(int handle, int slot, int idleFlag) {
  Manager* m = get(handle);
  if (!m || !(idleFlag > 0)) return;
  if (slot < 0 || slot >= m->polyphony) return;
  if (m->voices[slot].state != VS_RELEASING) return;
  free_releasing_voice(*m, slot);
}

extern "C" void soemdsp_voice_manager_all_notes_off(int handle) {
  Manager* m = get(handle);
  if (!m) return;
  end_all_voices(*m);
  m->lastEventKind = EV_RELEASE;
}

extern "C" int soemdsp_voice_manager_sustaining_count(int handle) {
  Manager* m = get(handle);
  return m ? m->sustainingCount : 0;
}

/** Slot index at sustaining[i], or -1 if out of range. */
extern "C" int soemdsp_voice_manager_sustaining_at(int handle, int i) {
  Manager* m = get(handle);
  if (!m || i < 0 || i >= m->sustainingCount) return -1;
  return m->sustaining[i];
}

extern "C" int soemdsp_voice_manager_releasing_count(int handle) {
  Manager* m = get(handle);
  return m ? m->releasingCount : 0;
}

/** Slot index at releasing[i], or -1 if out of range. */
extern "C" int soemdsp_voice_manager_releasing_at(int handle, int i) {
  Manager* m = get(handle);
  if (!m || i < 0 || i >= m->releasingCount) return -1;
  return m->releasing[i];
}

extern "C" int soemdsp_voice_manager_voice_note(int handle, int slot) {
  Manager* m = get(handle);
  if (!m || slot < 0 || slot >= m->polyphony) return -1;
  const Voice& v = m->voices[slot];
  if (v.state == VS_AVAILABLE) return -1;
  return v.note;
}

extern "C" int soemdsp_voice_manager_voice_state(int handle, int slot) {
  Manager* m = get(handle);
  if (!m || slot < 0 || slot >= m->polyphony) return VS_AVAILABLE;
  return m->voices[slot].state;
}

extern "C" double soemdsp_voice_manager_voice_velocity(int handle, int slot) {
  Manager* m = get(handle);
  if (!m || slot < 0 || slot >= m->polyphony) return 0.0;
  return m->voices[slot].velocity;
}

extern "C" int soemdsp_voice_manager_note_is_on(int handle, int note) {
  Manager* m = get(handle);
  if (!m || note < 0 || note >= kMidiNotes) return 0;
  return m->midiNoteStatus[note] ? 1 : 0;
}

extern "C" int soemdsp_voice_manager_history_count(int handle) {
  Manager* m = get(handle);
  return m ? m->noteHistoryCount : 0;
}

extern "C" int soemdsp_voice_manager_history_note(int handle, int i) {
  Manager* m = get(handle);
  if (!m || i < 0 || i >= m->noteHistoryCount) return -1;
  return m->noteHistory[i];
}

extern "C" int soemdsp_voice_manager_last_attack_slot(int handle) {
  Manager* m = get(handle);
  return m ? m->lastAttackSlot : -1;
}

extern "C" int soemdsp_voice_manager_last_event_kind(int handle) {
  Manager* m = get(handle);
  return m ? m->lastEventKind : EV_NONE;
}

extern "C" int soemdsp_voice_manager_polyphony(int handle) {
  Manager* m = get(handle);
  return m ? m->polyphony : 0;
}

extern "C" int soemdsp_voice_manager_version() {
  return 1;
}
