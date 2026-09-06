// Image Burn — energy-driven residual image stamp (In brightness × Feedback deposit).
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
    inputLabels: { In: "Brightness" },
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [
      {
        defaultValue: "1",
        key: "size",
        label: "Size",
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Image scale on the face. 1 ≈ fit; >1 zooms past edges. Dial range is metadata-owned.",
      },
      {
        defaultValue: "1",
        key: "brightness",
        label: "Brightness",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Dry image gain on In energy (0…1). Independent of Feedback.",
      },
      {
        bipolar: true,
        defaultValue: "0",
        key: "feedback",
        label: "Feedback",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "How much of the lit image prints into Hang. "
          + "0 = hang only (no new print / no stack). "
          + ">0 = accumulate brighter. "
          + "<0 = print a dimmer stamp into Hang.",
      },
      {
        defaultValue: "0.75",
        key: "burn",
        label: "Burn",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Highlights outlast darks in the residual. 0 = whole image fades together; 1 = darks die, peaks stick.",
      },
      {
        defaultValue: "0.45",
        key: "blur",
        label: "Blur",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip: "Bloom recirculation on the residual. Fine near 0; high = soft glow.",
      },
    ],
    visualInputs: [
      { key: "imageBurn", label: "Brightness", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "oscilloscope",
    description:
      "Load an image and print it into a dedicated Hang/Burn residual. "
      + "In × Brightness lights the dry image. Feedback (−1…+1) controls deposit: "
      + "0 = hang without stacking, >0 accumulates, <0 prints a dimmer stamp. "
      + "Image Blacks and Hang live in Display Settings.",
    notes: [
      "image burn",
      "residual",
      "picture",
      "feedback",
      "hang",
      "burn",
      "blur",
      "oscilloscope",
      "LayoutB",
    ],
  },
});
