// Image Burn — energy-driven phosphor image stamp (LED Dot energy × Picture load).
registerNodeGraphChromelessModule("imageBurn", {
  label: "Image Burn",
  solidModule: true,
  customDisplayArea: true,
  definition: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    defaultWidthGu: 4,
    displayHeightGu: 4,
    displayType: "imageBurnFace",
    displayRenderer: "imageBurnFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "imageBurnFace",
        settingsSchema: "imageBurnFace",
        source: { value: "In" },
      },
    ],
    defaultDisplayMode: "face",
    inputs: ["In"],
    digitalInputs: ["In"],
    inputLabels: { In: "→" },
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "imageBurn", label: "In", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "oscilloscope",
    description:
      "Load an image and print it into the phosphor burn circuit. Buffered In energy sets deposit brightness (LED Dot style). Ghost/Trail fade the burn. Image Size 0…>1 in Display Settings.",
    notes: [
      "image burn",
      "phosphor",
      "picture",
      "led dot",
      "energy",
      "ghost",
      "trail",
      "burn",
      "oscilloscope",
      "LayoutB",
    ],
  },
});
