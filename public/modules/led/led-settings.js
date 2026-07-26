// LED's own settings model + "LED options" floating window.
//
// Mirrors the Music Player's waveform-display-options window
// (node-graph-phosphor-waveform.js) deliberately: same per-node persistence
// spot on the patch, same first-open-at-the-pointer-then-remember policy, and
// the same independent-window rules (opening it must never close another
// window, and nothing else closes it).
//
// Settings live on node.led, normalized by normalizeNodeGraphLedLayout in
// node-graph-patch-clone.js -- that function is the single source of truth for
// defaults and clamping, and this file only reads/writes through it.

// ---------------------------------------------------------------------------
// Light mathematics
// ---------------------------------------------------------------------------
// The input level drives the lamp from off to blown out:
//
//   0.0  black       (no light)
//   0.5  the hue     (fully saturated -- the LED at its rated color)
//   1.0  white       (over-driven, all three channels railed)
//
// Mixing happens in LINEAR light, not in sRGB or HSL, because that is what a
// real emitter does: twice the drive is twice the photons. Doing it in gamma
// space instead makes the lower half look washed out and the upper half read
// as the color simply fading, rather than the hue holding while the other two
// channels catch up to it.

function nodeGraphLedSrgbToLinear(channel) {
  const value = Math.max(0, Math.min(1, Number(channel) || 0));
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function nodeGraphLedLinearToSrgb(channel) {
  const value = Math.max(0, Math.min(1, Number(channel) || 0));
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

// Fully saturated hue at HSL lightness 50% -- the "rated color" of the part.
function nodeGraphLedHueToSrgb(hue) {
  const h = ((((Number(hue) || 0) % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  if (h < 1) return [1, x, 0];
  if (h < 2) return [x, 1, 0];
  if (h < 3) return [0, 1, x];
  if (h < 4) return [0, x, 1];
  if (h < 5) return [x, 0, 1];
  return [1, 0, x];
}

// level 0..1 -> [r, g, b] each 0..255. brightness scales the emitted light in
// linear space AFTER the ramp, so turning it down dims the lamp without
// changing which color it is at a given level.
function nodeGraphLedEmittedRgb(hue, level, brightness = 1) {
  const drive = Math.max(0, Math.min(1, Number(level) || 0));
  const gain = Math.max(0, Math.min(2, Number.isFinite(Number(brightness)) ? Number(brightness) : 1));
  return nodeGraphLedHueToSrgb(hue)
    .map(nodeGraphLedSrgbToLinear)
    .map((channel) => (
      drive <= 0.5
        // Off -> rated color: scale the hue's own light up from nothing.
        ? channel * (drive / 0.5)
        // Rated color -> white: the two dim channels climb to meet the bright
        // one. The already-railed channel stays put, so the hue holds until it
        // physically cannot any more.
        : channel + (1 - channel) * ((drive - 0.5) / 0.5)
    ))
    .map((channel) => Math.round(
      Math.max(0, Math.min(1, nodeGraphLedLinearToSrgb(channel * gain))) * 255,
    ));
}

function nodeGraphLedEmittedColor(hue, level, brightness = 1) {
  const [r, g, b] = nodeGraphLedEmittedRgb(hue, level, brightness);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function nodeGraphLedSettingsForNode(nodeId) {
  return normalizeNodeGraphLedLayout(nodeGraphPatchNode(nodeId)?.led);
}

function renderNodeGraphLedSettingsWindow() {
  const nodeId = nodeGraphMvp.ledSettingsTargetNode;
  const win = document.getElementById("nodeLedSettingsWindow");
  if (!win || !nodeId) {
    return;
  }
  const settings = nodeGraphLedSettingsForNode(nodeId);
  const setValueUnlessFocused = (id, value) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) {
      el.value = String(value);
    }
  };
  setValueUnlessFocused("nodeLedHueInput", settings.hue);
  setValueUnlessFocused("nodeLedBrightnessInput", settings.brightness);
  setValueUnlessFocused("nodeLedBlurInput", settings.blur);
  setValueUnlessFocused("nodeLedRoundingInput", settings.rounding);
  const setPressed = (id, active) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  };
  setPressed("nodeLedCornerSquareButton", settings.cornerShape === "square");
  setPressed("nodeLedCornerSquircleButton", settings.cornerShape === "squircle");
  // Live swatch: off / quarter / rated color / over-driven / white, painted
  // with the exact same ramp the face is.
  const preview = document.getElementById("nodeLedColorPreview");
  if (preview) {
    preview.style.background = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1]
      .map((level) => nodeGraphLedEmittedColor(settings.hue, level, settings.brightness))
      .join(", ")})`;
  }
}

function positionNodeGraphLedSettingsAt(x, y) {
  const win = document.getElementById("nodeLedSettingsWindow");
  if (!win) {
    return;
  }
  win.hidden = false;
  // Shared app-wide policy: spawn at the pointer the FIRST time only, then
  // restore wherever the user left it -- and glow if it did not move.
  if (typeof openNodeGraphFloatingWindowAtPosition === "function") {
    openNodeGraphFloatingWindowAtPosition("ledSettings", win, () => {
      const { left, top } = nodeGraphFloatingWindowPosition(win, x, y);
      setNodeGraphFloatingWindowViewportPosition(win, left, top);
    });
    return;
  }
  const { left, top } = nodeGraphFloatingWindowPosition(win, x, y);
  setNodeGraphFloatingWindowViewportPosition(win, left, top);
}

function openNodeGraphLedSettings(nodeId, event) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || node.type !== "led") {
    return false;
  }
  nodeGraphMvp.ledSettingsTargetNode = nodeId;
  renderNodeGraphLedSettingsWindow();
  positionNodeGraphLedSettingsAt(
    Number.isFinite(Number(event?.clientX)) ? event.clientX : window.innerWidth / 2,
    Number.isFinite(Number(event?.clientY)) ? event.clientY : window.innerHeight / 2,
  );
  return true;
}

function closeNodeGraphLedSettings() {
  const win = document.getElementById("nodeLedSettingsWindow");
  if (win) {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("ledSettings", win, { open: false }, { status: false });
    }
    win.hidden = true;
  }
  nodeGraphMvp.ledSettingsTargetNode = null;
}

function updateNodeGraphLedSettings(patch) {
  const nodeId = nodeGraphMvp.ledSettingsTargetNode;
  if (!nodeId) {
    return;
  }
  const clonedPatch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = clonedPatch.nodes.find((node) => node.id === nodeId);
  if (!targetNode) {
    return;
  }
  targetNode.led = normalizeNodeGraphLedLayout({
    ...normalizeNodeGraphLedLayout(targetNode.led),
    ...patch,
  });
  commitNodeGraphPatch(clonedPatch, { status: "led options changed" });
  renderNodeGraphLedSettingsWindow();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function handleNodeGraphLedHueChange(event) {
  updateNodeGraphLedSettings({ hue: Number(event.target.value) });
}

function handleNodeGraphLedBrightnessChange(event) {
  updateNodeGraphLedSettings({ brightness: Number(event.target.value) });
}

function handleNodeGraphLedBlurChange(event) {
  updateNodeGraphLedSettings({ blur: Number(event.target.value) });
}

function handleNodeGraphLedRoundingChange(event) {
  updateNodeGraphLedSettings({ rounding: Number(event.target.value) });
}

function setNodeGraphLedCornerShape(shape) {
  updateNodeGraphLedSettings({ cornerShape: shape === "squircle" ? "squircle" : "square" });
}

// Same modifier vocabulary as the module sliders (ctrl/cmd+click resets to
// default, shift/ctrl scale the step) -- the shared binder from
// node-graph-slider-dragging.js, not a reimplementation. Defaults come from
// the one settings object so they cannot drift from what normalize* falls
// back to.
const nodeGraphLedSettingInputs = Object.freeze([
  ["nodeLedHueInput", "hue"],
  ["nodeLedBrightnessInput", "brightness"],
  ["nodeLedBlurInput", "blur"],
  ["nodeLedRoundingInput", "rounding"],
]);

function bindNodeGraphLedSettingModifiers() {
  if (typeof bindNodeGraphNativeSliderModifiers !== "function") {
    return;
  }
  for (const [id, key] of nodeGraphLedSettingInputs) {
    bindNodeGraphNativeSliderModifiers(
      document.getElementById(id),
      nodeGraphLedDefaultSettings[key],
    );
  }
}

// Drag by the title bar, matching every other floating window.
function beginNodeGraphLedSettingsDrag(event) {
  const win = document.getElementById("nodeLedSettingsWindow");
  if (!win || win.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, win, "ledSettingsDragging");
}

function dragNodeGraphLedSettings(event) {
  dragNodeGraphFloatingWindow(event, "ledSettingsDragging", document.getElementById("nodeLedSettingsWindow"));
}

function endNodeGraphLedSettingsDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "ledSettingsDragging", () => {
    // Record where the user parked it so the next open restores it instead of
    // jumping back to the pointer.
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "ledSettings",
        document.getElementById("nodeLedSettingsWindow"),
        { open: true },
        { status: false },
      );
    }
  });
}
