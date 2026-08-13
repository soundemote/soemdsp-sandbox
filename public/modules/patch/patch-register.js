// Patch plate: single in-world editor for patch.info (name / bank / program / …).
registerNodeGraphChromelessModule("patch", {
  label: "Patch",
  uniqueInPatch: true,
  customDisplayArea: true,
  definition: {
    planRole: "monitor",
    layoutOnly: true,
    displayType: "patchFace",
    defaultWidthGu: 10,
    displayHeightGu: 12,
    defaultAlias: "PATCH",
    // Always spawn with header buttons locally forced on (survives global Buttons off).
    defaultUi: {
      buttonsForceShow: true,
    },
    inputs: [],
    outputs: [],
    parameters: [],
  },
  catalog: {
    category: "object",
    description: "Patch identity plate. Name, bank, program, tags, author, and description live here — one per patch.",
    notes: [
      "patch info",
      "name",
      "bank",
      "program",
      "description",
      "unique",
      "annotation",
    ],
  },
});
