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

// Metamodule shell â€” group + optional polyphony (Playmode Off = group only).
// Chromeless: Polyphony (voice-manager in, black) + Amplitude inlets.
registerNodeGraphChromelessModule("metamodule", {
  label: "Metamodule",
  // Not LayoutB shell â€” MetamoduleLayout stacks shared IO above the face.
  solidModule: false,
  customDisplayArea: true,
  definition: {
    planRole: "monitor",
    layoutOnly: true,
    // IO above face (shared LayoutA jack/label chrome â€” no private dialect).
    chrome: "MetamoduleLayout",
    defaultWidthGu: 4,
    // Outer auto-height from MetamoduleLayout content (header+IO+face+params).
    // Do not pin defaultHeightGu â€” a short outer crushed the param band.
    displayHeightGu: 2,
    // Polyphony = voice-manager inlet (black). Amplitude = group VCA CV (gold).
    inputs: ["Polyphony", "Amplitude"],
    inputChannels: { Polyphony: "black" },
    inputLabels: { Polyphony: "Polyphony", Amplitude: "Amp" },
    outputs: [],
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
        tooltip: "Off = group only. Mono / Legato / Voices use the Polyphony inlet (voice manager).",
      },
    ],
  },
  catalog: {
    category: "portal",
    description: "Group selected modules into a shell. Amplitude inlet scales Meta Outs. Polyphony inlet = voice-manager in (black).",
    notes: ["metamodule", "group", "polyphony", "voice manager", "container", "portal"],
  },
});
