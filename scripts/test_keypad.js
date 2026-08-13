var fs = require("fs");
var path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "keypad", "keypad-math.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphKeypadWrap(-1) === 11, "wrap -1");
assert(nodeGraphKeypadWrap(12) === 0, "wrap 12");
assert(nodeGraphKeypadAnalogSlot(0) === null, "analog 0 is idle");
assert(nodeGraphKeypadAnalogSlot(0.99) === 11, "analog near 1");
assert(nodeGraphKeypadDigitalToSlot(0) === null, "digital 0 is idle");
assert(nodeGraphKeypadDigitalToSlot(1) === 0, "digital 1 is key 1");
assert(nodeGraphKeypadSlotToDigital(0) === 1, "slot 0 is digital 1");
assert(nodeGraphKeypadSlotToAnalog(0) > 0, "key 1 analog is not 0");
assert(Math.abs(nodeGraphKeypadSlotToAnalog(0) - 1 / 12) < 1e-9, "key 1 analog is 1/12");
assert(nodeGraphKeypadSlotToAnalog(null) === 0, "idle analog 0");
assert(nodeGraphKeypadResolveSlot({ hasDigital: true, digital: 0, offset: 2 }) === null, "digital 0 stays idle");
assert(nodeGraphKeypadResolveSlot({ hasDigital: true, digital: 1, offset: 0 }) === 0, "digital 1 is key 1");
assert(nodeGraphKeypadResolveSlot({ hasDigital: true, digital: 1, offset: 1 }) === 1, "digital 1 + offset 1 is key 2");
assert(nodeGraphKeypadResolveSlot({ hasDigital: true, digital: 12, offset: 1 }) === 0, "digital 12 + offset wraps to key 1");
assert(nodeGraphKeypadResolveSlot({ hasAnalog: true, analog: 0, offset: 0 }) === null, "analog 0 is idle");
assert(nodeGraphKeypadResolveSlot({ pointerSlot: 10, offset: 3 }) === null, "pointer ignored until down");
assert(nodeGraphKeypadResolveSlot({ pointerSlot: 10, offset: 3, down: 1 }) === 10, "pointer ignores offset");
assert(nodeGraphKeypadResolveSlot({ offset: 0 }) === null, "offset 0 idle has no highlight slot");
var idle = nodeGraphKeypadSample(createNodeGraphKeypadState(), { offset: 0 });
assert(idle.Analog === 0 && idle.Digital === 0 && idle.Index === 0 && idle.Gate === 0, "idle is 0");
var state = createNodeGraphKeypadState();
state.pointerSlot = 0;
state.down = 1;
var one = nodeGraphKeypadSample(state, { offset: 0 });
assert(one.Index === 1, "key 1 digital");
assert(one.Digital === 1, "key 1 digital alias");
assert(one.Analog > 0, "key 1 analog non-zero");
assert(one.Gate === 1, "key 1 gate");
state.pointerSlot = 4;
var out = nodeGraphKeypadSample(state, { offset: 0 });
assert(out.Index === 5, "sample index is 1-based");
assert(out.Digital === 5, "sample digital alias");
assert(out.Analog === nodeGraphKeypadSlotToAnalog(4), "sample analog");
assert(out.Gate === 1, "sample gate");
assert(out.X === 0.5 && Math.abs(out.Y - (1 - 1 / 3)) < 1e-9, "slot 4 is center-topish XY");
assert(nodeGraphKeypadSlotToXY(0).X === 0 && nodeGraphKeypadSlotToXY(0).Y === 1, "slot 1 XY");
assert(nodeGraphKeypadSlotToXY(2).X === 1 && nodeGraphKeypadSlotToXY(2).Y === 1, "slot 3 XY");
assert(nodeGraphKeypadSlotToXY(10).X === 0.5 && nodeGraphKeypadSlotToXY(10).Y === 0, "slot 0 XY");
assert(nodeGraphKeypadIsLatch(1) === true, "latch 1");
assert(nodeGraphKeypadIsLatch("Latch") === true, "latch name");
assert(nodeGraphKeypadIsLatch(0) === false, "momentary 0");
assert(nodeGraphKeypadDragEnabled() === true, "drag default on");
assert(nodeGraphKeypadDragEnabled(1) === true, "drag 1");
assert(nodeGraphKeypadDragEnabled("On") === true, "drag On");
assert(nodeGraphKeypadDragEnabled(0) === false, "drag 0");
assert(nodeGraphKeypadDragEnabled("off") === false, "drag off");
assert(nodeGraphKeypadNormalizeFont("poiret-one") === "poiret-one", "font id");
assert(nodeGraphKeypadNormalizeFont("nope") === "poiret-one", "font fallback");
assert(nodeGraphKeypadNormalizeFont() === "poiret-one", "font default");
assert(nodeGraphKeypadClampTextSize(0) === 0, "text size 0");
assert(nodeGraphKeypadClampTextSize(1) === 1, "text size 1");
assert(nodeGraphKeypadClampWidth(0) === 0, "width 0");
assert(nodeGraphKeypadClampHeight(0) === 0, "height 0");
assert(nodeGraphKeypadClampWeight(550) === 600, "weight snap");
var look = normalizeNodeGraphKeypadLayout({
  backgroundColor: "#123",
  buttonColor: "#abc",
  textColor: "nope",
  font: "Comic Sans",
  textWeight: 550,
  buttonWidth: 0.2,
  buttonHeight: 2,
  textSize: 0,
});
assert(look.backgroundColor === "#112233", "background hex expand");
assert(look.buttonColor === "#aabbcc", "button hex expand");
assert(look.textColor === "#2d2d2d", "text color fallback");
assert(look.font === "poiret-one", "font case fallback");
assert(look.textWeight === 600, "layout weight snap");
assert(look.buttonWidth === 0.2, "width stays below 0.5");
assert(look.buttonHeight === 1, "height ceil");
assert(look.textSize === 0, "text size hide");
var defaults = normalizeNodeGraphKeypadLayout();
assert(defaults.font === "poiret-one", "default font");
assert(defaults.buttonWidth === 0.94, "default width");
assert(defaults.buttonSize === 1, "default button size");
assert(defaults.squareRatio === true, "default square ratio");
assert(defaults.padPx === 0, "default pad 0");
assert(defaults.backgroundImage && defaults.backgroundImage.dataUrl === "", "default no background image");
assert(normalizeNodeGraphKeypadLayout({
  backgroundImage: { dataUrl: "data:image/png;base64,xx", fileName: "wall.png" },
}).backgroundImage.fileName === "wall.png", "background image kept");
assert(normalizeNodeGraphKeypadLayout({ squareRatio: false, padPx: 12 }).squareRatio === false, "square off");
assert(normalizeNodeGraphKeypadLayout({ padPx: 99 }).padPx === 64, "pad ceil");
var squareBox = nodeGraphKeypadGridMetrics(300, 400, true);
assert(squareBox.width === 300 && squareBox.height === 400 && squareBox.cell === 100, "3x4 square pack fills 3:4");
var squareWide = nodeGraphKeypadGridMetrics(400, 400, true);
assert(squareWide.width === 300 && squareWide.height === 400 && squareWide.cell === 100, "square on leaves leftover width");
var stretch = nodeGraphKeypadGridMetrics(400, 400, false);
assert(stretch.width === 400 && stretch.height === 400, "square off fills inner");
var oneFill = 1 * 1 * 100;
assert(oneFill === 100, "1.0 width/height fills the cell");
assert(defaults.buttonColor === "#f3f1ec", "default button color");
assert(normalizeNodeGraphKeypadLayout({ buttonSize: 0 }).buttonSize === 0, "button size hide");
assert(normalizeNodeGraphKeypadLayout({ buttonSize: 2 }).buttonSize === 1, "button size ceil");
assert(defaults.cornerShape === "squircle", "default corner");
assert(defaults.rounding === 50, "default rounding");
assert(defaults.stroke === 0, "default stroke");
assert(defaults.strokeColor === "#2d2d2d", "stroke color follows text default");
assert(defaults.hoverColor === "#ddd9d2", "default hover color");
assert(defaults.downColor === "#c4bdb3", "default down color");
assert(normalizeNodeGraphKeypadLayout({ textColor: "#abc", strokeColor: "#f00" }).strokeColor === "#ff0000", "stroke color own");
assert(normalizeNodeGraphKeypadLayout({ cornerShape: "pill", rounding: 140, stroke: -2 }).cornerShape === "pill", "pill");
assert(normalizeNodeGraphKeypadLayout({ rounding: 140 }).rounding === 100, "rounding ceil");
assert(normalizeNodeGraphKeypadLayout({ stroke: 20 }).stroke === 1, "stroke ceil");
assert(Math.abs(normalizeNodeGraphKeypadLayout({ strokePx: 8 }).stroke - 0.5) < 1e-9, "legacy stroke px");
assert(nodeGraphKeypadStrokePixels(0, 40, 40) === 0, "stroke 0 px");
assert(nodeGraphKeypadStrokePixels(1, 40, 40) === 20, "stroke fill px");
assert(nodeGraphKeypadStrokePixels(0.5, 40, 40) === 10, "stroke half px");
console.log("ok keypad math");
