// Evolve Field — UNDER CONSTRUCTION.
//
// NOTE (do not implement yet): Evolve Field is reserved for our eventual
// noise flow-field experiment — a full-square evolving noise / flow plate,
// not Julia and not kaleidoscope Soft Fractal territory.
//
// Catalog shows as under-construction (not spawnable from the shop until
// nodeGraphModuleStoreUnderConstructionTypes drops "evolveField").
registerNodeGraphChromelessModule("evolveField", {
  label: "Evolve Field",
  solidModule: false,
  customDisplayArea: true,
  definition: {
    chrome: "LayoutA",
    bufferedInputs: [],
    defaultWidthGu: 5,
    displayHeightGu: 5,
    displayType: "evolveFieldFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "evolveFieldFace",
        settingsSchema: "evolveFieldFace",
        source: {},
      },
    ],
    defaultDisplayMode: "face",
    inputs: [],
    outputs: [],
    parameters: [],
    visualSink: true,
  },
  catalog: {
    category: "rgb",
    description:
      "Under construction. Reserved for an eventual noise flow-field experiment "
      + "(full-plate evolving noise / flow — not Julia / kaleidoscope).",
    notes: [
      "under construction",
      "noise",
      "flow field",
      "full plate",
      "rgb",
      "reserved",
      "do not implement yet",
    ],
  },
});
