// Boundary thru portals (flat-graph safe â€” no mic bleed / speaker mix).
// TitleBarAndPorts: title + In/Out jacks only (no face, no compactTile port hack).
registerNodeGraphChromelessModule("metamoduleIn", {
  label: "Meta In",
  compactTile: false,
  definition: {
    chrome: "TitleBarAndPorts",
    planRole: "processor",
    planFreeRun: true,
    // Spawn size only â€” user may still resize freely (no min clamp).
    defaultWidthGu: 4,
    defaultHeightGu: 3,
    hasFace: false,
    defaultUi: { buttonsHidden: true },
    inputs: ["In"],
    outputs: ["Out"],
    inputAliases: { Mono: "In" },
    outputAliases: { Mono: "Out" },
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Metamodule boundary inlet (unity thru). Place inside a Metamodule.",
    notes: ["metamodule", "portal", "inlet", "boundary"],
  },
});

registerNodeGraphChromelessModule("metamoduleOut", {
  label: "Meta Out",
  compactTile: false,
  definition: {
    chrome: "TitleBarAndPorts",
    planRole: "processor",
    planFreeRun: true,
    // Spawn size only â€” user may still resize freely (no min clamp).
    defaultWidthGu: 4,
    defaultHeightGu: 3,
    hasFace: false,
    defaultUi: { buttonsHidden: true },
    inputs: ["In"],
    outputs: ["Out"],
    inputAliases: { Mono: "In" },
    outputAliases: { Mono: "Out" },
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Metamodule boundary outlet (unity thru). Place inside a Metamodule.",
    notes: ["metamodule", "portal", "outlet", "boundary"],
  },
});

// Metamodule shell — voice host.
// Shell I/O: Voices (Midi Note + Velocity; on/off = velocity) in; Left/Right out.
// Interior Voice Frequency/Gate/Trigger. No shell Gate — Voices already tracks hold.
registerNodeGraphChromelessModule("metamodule", {
  label: "Metamodule",
  // Not LayoutB shell — MetamoduleLayout stacks shared IO above the face.
  solidModule: false,
  customDisplayArea: true,
  definition: {
    planRole: "monitor",
    layoutOnly: true,
    // IO above face (shared LayoutA jack/label chrome — no private dialect).
    chrome: "MetamoduleLayout",
    defaultWidthGu: 4,
    // Outer auto-height from MetamoduleLayout content (header+IO+face+params).
    // Do not pin defaultHeightGu — a short outer crushed the param band.
    displayHeightGu: 2,
    digitalInputs: ["Voices"],
    inputs: ["Voices"],
    inputChannels: { Voices: "black" },
    inputLabels: { Voices: "Voices" },
    inputAliases: { Polyphony: "Voices" },
    outputs: ["Left", "Right"],
    outputLabels: { Left: "Left", Right: "Right" },
    // Voice Count + Playmode live on node.metamodule (Module Settings only) —
    // not face parameters (not modulatable).
    parameters: [
      {
        defaultValue: "0",
        key: "octave",
        label: "Octave",
        max: "4",
        mid: "0",
        min: "-4",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Shared octave offset into Voice Frequency.",
      },
      {
        defaultValue: "0",
        key: "semitones",
        label: "Semitones",
        max: "12",
        mid: "0",
        min: "-12",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Shared semitone offset into Voice Frequency.",
      },
      {
        defaultValue: "0",
        key: "cents",
        label: "Cents",
        max: "100",
        mid: "0",
        min: "-100",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Shared cents offset into Voice Frequency.",
      },
      {
        defaultValue: "0",
        key: "frequency",
        label: "Frequency",
        max: "100",
        mid: "0",
        min: "-100",
        nonlinearSlider: false,
        step: "0.1",
        tooltip: "Shared Hz offset after octave/semitone/cents (param domain).",
      },
    ],
  },
  catalog: {
    category: "portal",
    description: "Voice host. Shell: Voices in (Midi Note + Velocity), Left/Right out. Inside: Voice Frequency/Gate/Trigger. Wire Keyboard/MIDI Polyphony → Voices.",
    notes: ["metamodule", "voice host", "voices", "polyphony", "voice manager", "container", "portal"],
  },
});

// Interior voice-bus sources (owned by Metamodule; not Root shell jacks).
registerNodeGraphChromelessModule("voiceFrequency", {
  label: "Voice Frequency",
  compactTile: false,
  definition: {
    chrome: "TitleBarAndPorts",
    planRole: "processor",
    planFreeRun: true,
    defaultWidthGu: 4,
    defaultHeightGu: 3,
    hasFace: false,
    defaultUi: { buttonsHidden: true },
    inputs: [],
    outputs: ["Frequency"],
    outputAliases: { Out: "Frequency", Freq: "Frequency", f: "Frequency" },
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Metamodule voice pitch CV (Hz). Place/seeded inside a Metamodule; wire to oscillator pitch.",
    notes: ["metamodule", "voice", "frequency", "portal"],
  },
});

registerNodeGraphChromelessModule("voiceGate", {
  label: "Voice Gate",
  compactTile: false,
  definition: {
    chrome: "TitleBarAndPorts",
    planRole: "processor",
    planFreeRun: true,
    defaultWidthGu: 4,
    defaultHeightGu: 3,
    hasFace: false,
    defaultUi: { buttonsHidden: true },
    inputs: [],
    outputs: ["Gate"],
    outputAliases: { Out: "Gate" },
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Metamodule voice gate (1 open / 0 closed). Place/seeded inside a Metamodule.",
    notes: ["metamodule", "voice", "gate", "portal"],
  },
});

registerNodeGraphChromelessModule("voiceTrigger", {
  label: "Voice Trigger",
  compactTile: false,
  definition: {
    chrome: "TitleBarAndPorts",
    planRole: "processor",
    planFreeRun: true,
    defaultWidthGu: 4,
    defaultHeightGu: 3,
    hasFace: false,
    defaultUi: { buttonsHidden: true },
    inputs: [],
    outputs: ["Trigger"],
    outputAliases: { Out: "Trigger" },
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Metamodule voice trigger (pulse on note-on). Place/seeded inside a Metamodule.",
    notes: ["metamodule", "voice", "trigger", "portal"],
  },
});

// Explicit isIdle sink — wire envelope/reverb/delay isIdle here. Not auto-pooled.
registerNodeGraphChromelessModule("voiceIdle", {
  label: "Voice Idle",
  compactTile: false,
  definition: {
    chrome: "TitleBarAndPorts",
    planRole: "monitor",
    planFreeRun: true,
    defaultWidthGu: 4,
    defaultHeightGu: 3,
    hasFace: false,
    defaultUi: { buttonsHidden: true },
    digitalInputs: ["Idle"],
    inputs: ["Idle"],
    inputChannels: { Idle: "black" },
    inputLabels: { Idle: "Idle" },
    inputAliases: { isIdle: "Idle", In: "Idle" },
    outputs: [],
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Metamodule voice idle (explicit). Wire ADSR/reverb/delay isIdle → Idle. When high, releasing voices return to available.",
    notes: ["metamodule", "voice", "idle", "isIdle", "portal"],
  },
});

// Group shell — simple one-level copy-paste circuit box (Amplitude only; no polyphony).
registerNodeGraphChromelessModule("group", {
  label: "Group",
  solidModule: false,
  customDisplayArea: true,
  definition: {
    planRole: "monitor",
    layoutOnly: true,
    chrome: "MetamoduleLayout",
    defaultWidthGu: 4,
    displayHeightGu: 2,
    inputs: ["Amplitude"],
    inputLabels: { Amplitude: "Amp" },
    outputs: [],
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Simple group / copy-paste circuit box (one nesting level). Amplitude inlet scales Meta Outs. Use Metamodule for voice hosting.",
    notes: ["group", "container", "box", "portal", "nesting"],
  },
});
