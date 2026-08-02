// Ray Bouncer — solid-module layout (XY Pad family): short side ports,
// phosphor X/Y face in the center, ordinary parameter sliders below.
// DSP stays in native_modules/ray_bouncer + node-graph-ray-bouncer.js.

registerNodeGraphChromelessModule("rayBouncer", {
  label: "Ray Bouncer",
  customDisplayArea: true,
  solidModule: true,
  definition: {
    planRole: "source",
    defaultWidthGu: 8,
    displayHeightGu: 5,
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputLabels: {
      Reset: "Rs",
    },
    inputs: ["Reset"],
    outputLabels: {
      X: "X",
      Y: "Y",
    },
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "launchAngle", label: "Launch", defaultValue: "30", min: "0", mid: "180", max: "360", step: "0.1", kind: "phase", unit: "deg", wraparound: true },
      { key: "startX", label: "Start X", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.001" },
      { key: "startY", label: "Start Y", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.001" },
      { key: "size", label: "Size", defaultValue: "1", min: "0.05", mid: "1", max: "2", step: "0.01" },
      { key: "aspect", label: "Aspect", defaultValue: "1.5", min: "0.1", mid: "1", max: "4", step: "0.01" },
      { key: "rotate", label: "Rotate", defaultValue: "0", min: "0", mid: "180", max: "360", step: "0.1", kind: "phase", unit: "deg", wraparound: true },
      { key: "centerX", label: "Center X", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.001" },
      { key: "centerY", label: "Center Y", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.001" },
      { key: "maxDistance", label: "Max Dist", defaultValue: "0", min: "0", mid: "4", max: "32", step: "0.01", title: "Force re-launch after this path length (0 = unlimited)" },
      { key: "bend", label: "Bend", defaultValue: "0", min: "-2", mid: "0", max: "2", step: "0.001" },
      { key: "xToY", label: "X→Y", defaultValue: "0", min: "-2", mid: "0", max: "2", step: "0.001" },
      { key: "yToX", label: "Y→X", defaultValue: "0", min: "-2", mid: "0", max: "2", step: "0.001" },
      { key: "level", label: "Level", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
    ],
  },
  catalog: {
    category: "chaos",
    description: "RS-MET Ray Bouncer in solid shell: particle reflecting inside an ellipse. Short Rs reset jack, X/Y phosphor face, full parameter bank below.",
    notes: ["solid module", "ellipse billiard", "X/Y phosphor", "RS-MET", "native"],
  },
});
