registerNodeGraphChromelessModule("portalOutlet", {
  label: "Outlet",
  definition: {
    chrome: "LayoutC",
    planRole: "sink",
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
    description: "Patch into the speaker bus. Sandbox I/O is 3: Mono, Left, Right.",
    notes: ["portal", "outlet", "output", "mono", "left", "right"],
  },
});
