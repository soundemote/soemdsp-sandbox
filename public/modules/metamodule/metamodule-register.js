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
// Default shell I/O: Polyphony (keys on/off) + Gate (presence from Keyboard Gate);
// Left + Right out (always). No Velocity inlet — Voice Velocity = 1 for now.
// Interior Voice bus (Frequency / Gate / Trigger) seeded inside Meta view.
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
    inputs: ["Polyphony", "Gate"],
    inputChannels: { Polyphony: "black" },
    inputLabels: { Polyphony: "Polyphony", Gate: "Gate" },
    outputs: ["Left", "Right"],
    outputLabels: { Left: "Left", Right: "Right" },
    parameters: [
      {
        defaultValue: "4",
        key: "voices",
        label: "Voices",
        max: "32",
        mid: "4",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Voice lane count (1–32). Changing this recompiles the Meta circuit.",
      },
      {
        choices: ["Off", "Mono", "Legato Ties", "Legato Always", "Voices"],
        defaultValue: "0",
        displayChoices: true,
        key: "playmode",
        label: "Playmode",
        linearSmoothing: false,
        max: "4",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Off = thru. Mono / Legato / Voices use Polyphony (voice manager).",
      },
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
    description: "Voice host. Shell: Polyphony + Gate in, Left/Right out. Inside: Voice Frequency/Gate/Trigger. Use Group for simple boxing.",
    notes: ["metamodule", "voice host", "polyphony", "gate", "voice manager", "container", "portal"],
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
