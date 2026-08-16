registerNodeGraphChromelessModule("portalInlet", {
  label: "Inlet",
  definition: {
    chrome: "LayoutC",
    planRole: "source",
    planFreeRun: true,
    defaultWidthGu: 3,
    defaultHeightGu: 4,
    defaultUi: { buttonsHidden: true, titleHidden: false },
    inputAliases: { In: "Mono", M: "Mono", L: "Left", R: "Right" },
    inputLabels: { Mono: "M", Left: "L", Right: "R" },
    inputs: ["Mono", "Left", "Right"],
    outputAliases: { Out: "Mono", M: "Mono", L: "Left", R: "Right" },
    outputLabels: { Mono: "M", Left: "L", Right: "R" },
    outputs: ["Mono", "Left", "Right"],
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Live input into the patch. Sandbox I/O is 3: Mono, Left, Right.",
    notes: ["portal", "inlet", "input", "mono", "left", "right"],
  },
});
