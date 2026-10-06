var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..", "public");
eval(fs.readFileSync(path.join(root, "lib", "note-mask-128.js"), "utf8"));
eval(fs.readFileSync(path.join(root, "lib", "polyphony-voices.js"), "utf8"));

var vmOn = [];
var vmOff = [];
globalThis.sendNodeGraphLiveVmNoteOn = function (midi) { vmOn.push(midi); };
globalThis.sendNodeGraphLiveVmNoteOff = function (midi) { vmOff.push(midi); };
globalThis.syncNodeGraphKeyboardPolyphonyFromHeldNotes = function () {};
globalThis.renderNodeGraphMidiKeyboardHeldKeys = function () {};
globalThis.renderNodeGraphMidiKeyboardActiveKeys = function () {};
globalThis.renderNodeGraphGridKeyboardPads = function () {};
globalThis.renderNodeGraphMidiKeyboardSignal = function () {};
globalThis.sendNodeGraphLiveKeyboardModuleSignal = function () {};

// Each keyboard owns its own gold Arp latch and runtime (view-controls stubs).
var goldByNode = {};
globalThis.setNodeGraphKeyboardArpLatch = function (nodeId, mask) {
  goldByNode[String(nodeId)] = Uint8Array.from(mask);
};
function gold(nodeId) {
  return goldByNode[nodeId] || noteMaskCreate();
}
function setGold(nodeId, notes) {
  var mask = noteMaskCreate();
  notes.forEach(function (n) { noteMaskSet(mask, n, true); });
  goldByNode[nodeId] = mask;
}
var runtimeByNode = {};
globalThis.nodeGraphKeyboardRuntime = function (nodeId) {
  var id = String(nodeId);
  if (!runtimeByNode[id]) runtimeByNode[id] = { signal: null };
  return runtimeByNode[id];
};

var patchNodes = {
  "keyboard-1": {
    id: "keyboard-1",
    type: "keyboard",
    chordMemory: { slots: { "60": [60, 64, 67], "62": [62, 66, 69] } },
  },
  "keyboard-2": {
    id: "keyboard-2",
    type: "keyboard",
    chordMemory: { slots: { "60": [60, 63, 67], "65": [65, 69, 72] } },
  },
};
globalThis.nodeGraphPatchNode = function (id) { return patchNodes[String(id)] || null; };
globalThis.nodeGraphMvp = {
  patchDirtyState: "clean",
};

eval(fs.readFileSync(path.join(root, "node-graph-keyboard-chord-memory.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphChordMemoryHasSlot("keyboard-1", 60), "C4 is a chord slot");
assert(!nodeGraphChordMemoryHasSlot("keyboard-1", 61), "C# is not a slot");

vmOn.length = 0;
vmOff.length = 0;
nodeGraphChordMemoryActivateSlot("keyboard-1", 60, true, 100);
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "trigger key is on while held");
assert(nodeGraphChordMemoryNoteIsSounding("keyboard-1", 64), "ghost E while chord is held");
assert(nodeGraphChordMemoryNoteIsSounding("keyboard-1", 67), "ghost G while chord is held");
assert(vmOn.length === 0 && vmOff.length === 0, "UI latch does not poke VoiceManager (Voices want-set is SSOT)");

var host = nodeGraphChordMemoryHost();
nodeGraphChordMemoryActivateSlot("keyboard-1", 60, false);
assert(!nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "trigger key off after mouse up");
assert(!nodeGraphChordMemoryNoteIsSounding("keyboard-1", 64), "ghost E off after mouse up");
assert(!nodeGraphChordMemoryNoteIsSounding("keyboard-1", 67), "ghost G off after mouse up");

nodeGraphChordMemoryActivateSlot("keyboard-1", 60, true, 100);
host.chordMemoryOutLatchByNode = new Map();
host.chordMemoryOutLatchByNode.set("keyboard-1", Uint8Array.from(nodeGraphChordMemoryLiveMaskForNode("keyboard-1")));
assert(nodeGraphChordMemoryNoteIsSounding("keyboard-1", 64), "live mask still sounds");
nodeGraphChordMemoryActivateSlot("keyboard-1", 60, false);
assert(
  !nodeGraphChordMemoryNoteIsSounding("keyboard-1", 64),
  "ghost keys follow live play, not the Chord Memory OUT latch",
);
assert(
  nodeGraphChordMemoryOutMaskForNode("keyboard-1")[64],
  "OUT jack may stay latched for arp during rests",
);

nodeGraphChordMemoryStartMomentaryPlay("keyboard-1", 60, 99, 100);
nodeGraphChordMemoryActivateSlot("keyboard-1", 60, true, 100);
nodeGraphChordMemoryReleaseNode("keyboard-1");
assert(!nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "delete keyboard clears trigger");
assert(!nodeGraphChordMemoryNoteIsSounding("keyboard-1", 60), "delete keyboard clears ghosts");
assert(nodeGraphChordMemoryMomentaryMaskForNode("keyboard-1") == null, "delete keyboard clears pointer capture");

globalThis.nodeGraphMidiKeyboardModeForNode = function () { return "chordMemory"; };
setGold("keyboard-1", [60, 64, 67]);

var goldToggles = [];
var clickEv = {
  type: "pointerdown",
  pointerId: 11,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  preventDefault: function () {},
};
assert(
  nodeGraphChordMemoryHandlePointer(clickEv, { setPointerCapture: function () {} }, 60, {
    nodeId: "keyboard-1",
    onArpToggle: function (midi) { goldToggles.push(midi); },
  }),
  "chordMemory click on a green slot is handled",
);
assert(goldToggles.length === 0, "plain click with no edit target does not touch gold");
assert(!nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "plain click does not latch the chord");
assert(nodeGraphChordMemoryMomentaryMaskForNode("keyboard-1"), "green slot plays the chord on Play Keys");
assert(noteMaskGet(nodeGraphChordMemoryMomentaryMaskForNode("keyboard-1"), 64), "momentary chord includes tones");
assert(noteMaskGet(gold("keyboard-1"), 60), "plain click does not touch gold");
nodeGraphChordMemoryReleasePointerPlay("keyboard-1");
assert(!nodeGraphChordMemoryMomentaryMaskForNode("keyboard-1"), "mouse up clears momentary chord play");

var blankPlayEv = {
  type: "pointerdown",
  pointerId: 14,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  preventDefault: function () {},
};
assert(
  !nodeGraphChordMemoryHandlePointer(blankPlayEv, { setPointerCapture: function () {} }, 61, {
    nodeId: "keyboard-1",
  }),
  "plain click on a non-chord key falls through to a single play key",
);

var ctrlEv = {
  type: "pointerdown",
  pointerId: 12,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  preventDefault: function () {},
};
assert(
  nodeGraphChordMemoryHandlePointer(ctrlEv, { setPointerCapture: function () {} }, 72, {
    nodeId: "keyboard-1",
  }),
  "ctrl+click blank is handled",
);
assert(!nodeGraphChordMemoryHasSlot("keyboard-1", 72), "ctrl+click blank does not copy the current chord");
assert(nodeGraphChordMemoryEditIs("keyboard-1", 72), "ctrl+click blank selects the empty slot for edit");
assert(noteMaskGet(gold("keyboard-1"), 60), "blank edit does not clear gold");

vmOn.length = 0;
vmOff.length = 0;
assert(nodeGraphChordMemoryToggleLatch("keyboard-1", 60, 100), "latch on");
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "latched slot stays on");
var outMask = nodeGraphChordMemoryOutMaskForNode("keyboard-1");
assert(noteMaskGet(outMask, 60), "latched chord root is on Chord Memory OUT");
assert(noteMaskGet(outMask, 64), "latched chord third is on Chord Memory OUT");
assert(noteMaskGet(outMask, 67), "latched chord fifth is on Chord Memory OUT");
assert(nodeGraphChordMemoryLatchedSetFor("keyboard-1").has(60), "latch set remembers the slot");
assert(nodeGraphChordMemoryEditIs("keyboard-1", 60), "active chord is the edit target");
assert(nodeGraphChordMemoryToggleLatch("keyboard-1", 62, 100), "latch a second chord");
assert(!nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "previous chord unlatches");
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 62), "only the new chord is on");
assert(nodeGraphChordMemoryLatchedSetFor("keyboard-1").size === 1, "one latched slot");
assert(nodeGraphChordMemoryEditIs("keyboard-1", 62), "edit target follows the active chord");
assert(nodeGraphChordMemoryToggleLatch("keyboard-1", 60, 100), "switch back to first chord");
nodeGraphChordMemoryToggleLatch("keyboard-1", 60, 100);
assert(!nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "unlatch before inlet overlap test");
var overlapIn = noteMaskCreate();
noteMaskSet(overlapIn, 60, true);
noteMaskSet(overlapIn, 62, true);
nodeGraphChordMemoryApplyInletMask("keyboard-1", overlapIn, null);
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 62), "overlapping sequencer notes keep the highest slot");
assert(!nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "overlapping sequencer notes do not stack the previous slot");
nodeGraphChordMemoryApplyInletMask("keyboard-1", noteMaskCreate(), null);
assert(nodeGraphChordMemoryToggleLatch("keyboard-1", 60, 100), "re-latch after overlap test");
nodeGraphChordMemoryApplyInletMask("keyboard-1", noteMaskCreate(), null);
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "empty Chord Memory IN does not drop a latched chord");
var outAfterIn = nodeGraphChordMemoryOutMaskForNode("keyboard-1");
assert(noteMaskGet(outAfterIn, 64), "user latch still owns Chord Memory OUT after empty IN");
var slideEv = {
  type: "pointerdown",
  pointerId: 13,
  ctrlKey: false,
  shiftKey: false,
  altKey: true,
  metaKey: false,
  preventDefault: function () {},
};
globalThis.nodeGraphMidiKeyboardModeForNode = function () { return "slide"; };
assert(
  nodeGraphChordMemoryHandlePointer(slideEv, { setPointerCapture: function () {} }, 60, {
    nodeId: "keyboard-1",
  }),
  "alt+click in slide mode is handled",
);
assert(!nodeGraphChordMemorySlotIsOn("keyboard-1", 60), "alt+click in slide mode unlatches the chord");
assert(
  !nodeGraphChordMemoryNoteIsSounding("keyboard-1", 64),
  "unlatch clears live Chord Memory keys (Voices want-set follows)",
);

var nativeGraph = fs.readFileSync(path.join(root, "node-live-audio-worklet-native-graph.js"), "utf8");
assert(nativeGraph.indexOf("const paramTargets = []") >= 0, "clone params share the main loop");
assert(nativeGraph.indexOf("Mirror face params onto Meta Voices-mode lane clones") < 0, "no type-whitelist clone param block");
assert(nativeGraph.indexOf('if (type === "pingEnvelope")') >= 0, "ping envelope stays in the shared param loop");
assert(nativeGraph.indexOf("chordPlayMask") >= 0, "Voices mixes live Chord Memory keys");
assert(nativeGraph.indexOf("state !== 2") >= 0, "isIdle only frees releasing voices");
assert(nativeGraph.indexOf("_vmBitOnOrder") >= 0, "bitmask history ranks newest notes for the voice pool");
assert(nativeGraph.indexOf("_vmKeepNotes") >= 0, "keep-set notes always get a sustaining voice");
assert(nativeGraph.indexOf('port === "Arp Keys"') >= 0, "Voices mixes Arp Keys");
assert(nativeGraph.indexOf('port === "Play Keys"') >= 0, "Voices mixes Play Keys");
assert(nativeGraph.indexOf("_vmRetriggerQueue") < 0, "no Gate-dip retrigger queue");
assert(nativeGraph.indexOf("sustaining && held") >= 0, "Gate stays off when the slot's MIDI is not wanted");

var defs = fs.readFileSync(path.join(root, "node-graph-module-definitions.js"), "utf8");
assert(defs.indexOf('digitalOutputs: ["Polyphony", "Play Keys", "Arp Keys", "Chord Memory"]') < 0, "keyboard has no Polyphony jack");
assert(defs.indexOf('digitalOutputs: ["Polyphony", "Play Keys"]') < 0, "MIDI/sequencer have no Polyphony jack");
assert(defs.indexOf('Polyphony: "Monophony"') < 0, "arp no longer outputs Monophony");
assert(defs.indexOf('Monophony: "Play Keys"') >= 0, "old arp Monophony aliases to Play Keys");

var migrations = fs.readFileSync(path.join(root, "node-graph-patch-migrations.js"), "utf8");
assert(migrations.indexOf('srcPort === "Play Keys" || srcPort === "Arp Keys"') < 0, "do not rewrite Play/Arp into Polyphony");
var migStart = migrations.indexOf("function nodeGraphPatchMigrateMetaPolyphonyToVoices");
var migEnd = migrations.indexOf("function nodeGraphPatchMigrateValueSliderToKnob");
assert(migStart >= 0 && migEnd > migStart, "voices migration is present");
eval(migrations.slice(migStart, migEnd));
var migrated = nodeGraphPatchMigrateMetaPolyphonyToVoices({
  nodes: [
    { id: "keyboard-1", type: "keyboard" },
    { id: "metamodule-1", type: "metamodule" },
  ],
  connections: [
    {
      sourceNode: "keyboard-1",
      sourcePort: "Polyphony",
      destinationNode: "metamodule-1",
      destinationPort: "Voices",
    },
  ],
});
var ports = migrated.connections.map(function (c) { return c.sourcePort; }).sort();
assert(ports.join(",") === "Arp Keys,Chord Memory,Play Keys", "old Polyphony fans into play/arp/chord at Voices");

setGold("keyboard-1", [50, 52]);
assert(nodeGraphChordMemoryToggleLatch("keyboard-1", 60, 100), "re-latch after unlatch");
assert(noteMaskGet(gold("keyboard-1"), 50), "latch does not steal gold");
assert(noteMaskGet(gold("keyboard-1"), 52), "latch does not steal gold");
assert(!noteMaskGet(gold("keyboard-1"), 64), "latch does not copy chord into gold");

globalThis.nodeGraphMidiKeyboardModeForNode = function () { return "chordMemory"; };
var ctrlChordEv = {
  type: "pointerdown",
  pointerId: 20,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  preventDefault: function () {},
};
assert(
  nodeGraphChordMemoryHandlePointer(ctrlChordEv, { setPointerCapture: function () {} }, 62, {
    nodeId: "keyboard-1",
  }),
  "ctrl+click chord is handled",
);
assert(noteMaskGet(gold("keyboard-1"), 50), "ctrl+click in CM mode does not replace gold");
assert(noteMaskGet(gold("keyboard-1"), 52), "ctrl+click in CM mode leaves gold third");
assert(!noteMaskGet(gold("keyboard-1"), 66), "ctrl+click in CM mode does not copy chord into gold");
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 62), "ctrl+click in CM mode latches for edit");
assert(nodeGraphChordMemoryEditIs("keyboard-1", 62), "ctrl+click in CM mode is the edit target");

assert(
  nodeGraphChordMemoryHandlePointer(clickEv, { setPointerCapture: function () {} }, 61, {
    nodeId: "keyboard-1",
  }),
  "plain click while editing is handled",
);
assert(nodeGraphChordMemoryNotesForSlot("keyboard-1", 62).indexOf(61) >= 0, "plain click places a red edit note");

var altSaveEv = {
  type: "pointerdown",
  pointerId: 22,
  ctrlKey: false,
  shiftKey: false,
  altKey: true,
  metaKey: false,
  preventDefault: function () {},
};
assert(
  nodeGraphChordMemoryHandlePointer(altSaveEv, { setPointerCapture: function () {} }, 72, {
    nodeId: "keyboard-1",
  }),
  "alt+click saves current red chord",
);
assert(nodeGraphChordMemoryHasSlot("keyboard-1", 72), "alt+click writes a slot from red keys");
assert(nodeGraphChordMemoryNotesForSlot("keyboard-1", 72).indexOf(61) >= 0, "saved chord includes red edit notes");
assert(nodeGraphChordMemoryNotesForSlot("keyboard-1", 72).indexOf(66) >= 0, "saved chord includes previous red tones");
assert(!noteMaskGet(gold("keyboard-1"), 66), "alt+click save does not write gold");
assert(nodeGraphChordMemoryEditIs("keyboard-1", 72), "alt+click save edits the destination key");
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 72), "saved slot becomes the active chord");
assert(!nodeGraphChordMemorySlotIsOn("keyboard-1", 62), "previous edit chord unlatches");

globalThis.nodeGraphMidiKeyboardModeForNode = function () { return "slide"; };
var shiftEv = {
  type: "pointerdown",
  pointerId: 21,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
  metaKey: false,
  preventDefault: function () {},
};
assert(
  nodeGraphChordMemoryHandlePointer(shiftEv, { setPointerCapture: function () {} }, 60, {
    nodeId: "keyboard-1",
  }),
  "shift+click chord is handled",
);
assert(nodeGraphChordMemoryMomentaryMaskForNode("keyboard-1"), "shift+click is momentary Play Keys");
assert(noteMaskGet(nodeGraphChordMemoryMomentaryMaskForNode("keyboard-1"), 64), "momentary includes chord tones");
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 72), "momentary does not steal the latched chord");
nodeGraphChordMemoryReleasePointerPlay("keyboard-1");
assert(!nodeGraphChordMemoryMomentaryMaskForNode("keyboard-1"), "mouse up clears momentary play");
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 72), "momentary release leaves the latched chord on");

var ctrlArpEv = {
  type: "pointerdown",
  pointerId: 23,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  preventDefault: function () {},
};
assert(
  nodeGraphChordMemoryHandlePointer(ctrlArpEv, { setPointerCapture: function () {} }, 60, {
    nodeId: "keyboard-1",
  }),
  "ctrl+click chord in slide mode is handled",
);
assert(noteMaskGet(gold("keyboard-1"), 60), "non-CM ctrl+click copies chord root to gold");
assert(noteMaskGet(gold("keyboard-1"), 64), "non-CM ctrl+click copies chord third to gold");
assert(noteMaskGet(gold("keyboard-1"), 67), "non-CM ctrl+click copies chord fifth to gold");
assert(!noteMaskGet(gold("keyboard-1"), 50), "non-CM ctrl+click replaces previous gold");

// Two keyboards never share chord / momentary / gold / edit state.
setGold("keyboard-2", [40]);
var k2ShiftEv = {
  type: "pointerdown",
  pointerId: 31,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
  metaKey: false,
  preventDefault: function () {},
};
assert(
  nodeGraphChordMemoryHandlePointer(k2ShiftEv, { setPointerCapture: function () {} }, 60, {
    nodeId: "keyboard-2",
  }),
  "keyboard-2 shift+click chord is handled",
);
assert(noteMaskGet(nodeGraphChordMemoryMomentaryMaskForNode("keyboard-2"), 63), "keyboard-2 plays its own chord");
assert(!nodeGraphChordMemoryMomentaryMaskForNode("keyboard-1"), "keyboard-2 momentary is not on keyboard-1");
nodeGraphChordMemoryReleasePointerPlay("keyboard-1");
assert(nodeGraphChordMemoryMomentaryMaskForNode("keyboard-2"), "keyboard-1 mouse up does not release keyboard-2");
nodeGraphChordMemoryReleasePointerPlay("keyboard-2");
assert(!nodeGraphChordMemoryMomentaryMaskForNode("keyboard-2"), "keyboard-2 mouse up releases its chord");
var k2CtrlEv = {
  type: "pointerdown",
  pointerId: 32,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  preventDefault: function () {},
};
nodeGraphChordMemoryHandlePointer(k2CtrlEv, { setPointerCapture: function () {} }, 65, { nodeId: "keyboard-2" });
assert(noteMaskGet(gold("keyboard-2"), 69), "keyboard-2 ctrl+click writes keyboard-2 gold");
assert(!noteMaskGet(gold("keyboard-2"), 40), "keyboard-2 ctrl+click replaces keyboard-2 gold");
assert(noteMaskGet(gold("keyboard-1"), 64) && !noteMaskGet(gold("keyboard-1"), 69), "keyboard-1 gold untouched");
assert(nodeGraphChordMemoryToggleLatch("keyboard-2", 65, 100), "keyboard-2 latches its own chord");
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 72), "keyboard-2 latch leaves keyboard-1 latch on");
assert(nodeGraphChordMemoryEditIs("keyboard-2", 65) && nodeGraphChordMemoryEditIs("keyboard-1", 72), "edit targets are per keyboard");
nodeGraphChordMemoryReleaseNode("keyboard-2");
assert(!nodeGraphChordMemorySlotIsOn("keyboard-2", 65), "deleting keyboard-2 clears its latch");
assert(nodeGraphChordMemorySlotIsOn("keyboard-1", 72), "deleting keyboard-2 leaves keyboard-1 latched");

console.log("test_keyboard_chord_memory ok");
