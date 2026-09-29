// Policy B: Display follows Title; portal jack = effective display.
// node scripts/smoke_display_follows_title.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sandbox = {
  normalizeNodeGraphPatchNodeAlias: (a) => String(a ?? "").trim().slice(0, 64),
  nodeGraphNodeLabels: {
    namedPortalIn: "Portal →",
    namedPortalOut: "Portal ←",
    ladderFilter: "Ladder Filter",
    knob: "Knob",
  },
  nodeGraphNodeType: (node) => (typeof node === "string" ? "" : node?.type) || "",
  nodeGraphPatchNode: (id) => sandbox.__nodes?.find((n) => n.id === id) || null,
  nodeGraphModuleDefinitions: {
    namedPortalIn: { defaultAlias: "A" },
    namedPortalOut: { defaultAlias: "A" },
  },
  nodeGraphIsNamedPortalType: (type) => type === "namedPortalIn" || type === "namedPortalOut",
  nodeGraphKnobFaceNormalizeLabelText: (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 48),
  nodeGraphKnobDisplayNameForNode: (node) => {
    const t = String(node?.__KEEP_waterfallSettings__?.labelText ?? "").trim();
    return t;
  },
  console,
};
vm.createContext(sandbox);

const cloneSrc = fs.readFileSync(path.join(root, "public", "node-graph-patch-clone.js"), "utf8");
// Extract only the helpers we need by running the whole file may fail on deps —
// eval the specific functions by loading a stubbed subset.
const helperChunk = cloneSrc.slice(
  cloneSrc.indexOf("const nodeGraphModuleTitleAppendIdSuffix"),
  cloneSrc.indexOf("function cloneNodeGraphTypedDisplaySettings"),
);
vm.runInContext(helperChunk, sandbox, { filename: "patch-clone-helpers.js" });

const factoriesSrc = fs.readFileSync(path.join(root, "public", "node-graph-module-factories.js"), "utf8");
const jackFnStart = factoriesSrc.indexOf("function nodeGraphPatchNodePortDisplayLabel");
const jackFnEnd = factoriesSrc.indexOf("\nfunction applyNodeGraphInputUnboundedValue");
if (jackFnStart < 0 || jackFnEnd < 0) throw new Error("port label fn not found");
// Also need stereo passthrough stub
sandbox.nodeGraphStereoJackDisplayLabel = (v) => v;
sandbox.normalizeNodeGraphPatchMetadataAlias = (a) => String(a ?? "").trim();
vm.runInContext(factoriesSrc.slice(jackFnStart, jackFnEnd), sandbox, { filename: "factories-label.js" });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const {
  normalizeNodeGraphPatchNodeDisplay,
  nodeGraphPatchNodeDisplayOverride,
  nodeGraphPatchNodeEffectiveDisplay,
  nodeGraphPatchNodeTitle,
  nodeGraphPatchNodePortDisplayLabel,
} = sandbox;

assert(typeof nodeGraphPatchNodeEffectiveDisplay === "function", "effective helper missing");
assert(normalizeNodeGraphPatchNodeDisplay("  Hi  ") === "Hi", "normalize trim");
assert(normalizeNodeGraphPatchNodeDisplay("") === "", "normalize empty");

const portal = { id: "pin-1", type: "namedPortalIn", alias: "Cutoff" };
assert(nodeGraphPatchNodeTitle(portal) === "Cutoff", "title");
assert(nodeGraphPatchNodeDisplayOverride(portal) === "", "no override");
assert(nodeGraphPatchNodeEffectiveDisplay(portal) === "Cutoff", "effective follows title");

portal.display = "  Bus X  ";
assert(nodeGraphPatchNodeDisplayOverride(portal) === "Bus X", "override stored");
assert(nodeGraphPatchNodeEffectiveDisplay(portal) === "Bus X", "effective override");
assert(nodeGraphPatchNodeTitle(portal) === "Cutoff", "title unchanged");

delete portal.display;
portal.display = "";
assert(nodeGraphPatchNodeEffectiveDisplay(portal) === "Cutoff", "clear snaps to title");

const jack = nodeGraphPatchNodePortDisplayLabel(portal, "namedPortalIn", "In", "input");
assert(jack === "Cutoff", `jack follows title when display empty, got ${jack}`);

portal.display = "JackLabel";
const jack2 = nodeGraphPatchNodePortDisplayLabel(portal, "namedPortalIn", "In", "input");
assert(jack2 === "JackLabel", `jack uses display override, got ${jack2}`);

const knob = {
  id: "k1",
  type: "knob",
  alias: "Drive",
  __KEEP_waterfallSettings__: { labelText: "" },
};
assert(nodeGraphPatchNodeEffectiveDisplay(knob) === "Drive", "knob follows title");
knob.__KEEP_waterfallSettings__.labelText = "Amount";
assert(nodeGraphPatchNodeDisplayOverride(knob) === "Amount", "knob override");
assert(nodeGraphPatchNodeEffectiveDisplay(knob) === "Amount", "knob effective");

// Context menu: hide-title restored for InletOutlet; other chrome still gated.
const ctx = fs.readFileSync(path.join(root, "public", "node-graph-context-menu.js"), "utf8");
assert(ctx.includes("showTitleVisibilityChrome"), "title visibility chrome flag");
assert(ctx.includes("showFullVisibilityChrome"), "full visibility chrome flag");
assert(ctx.includes("toggleTitleButton.hidden = !showTitleVisibilityChrome"), "title toggle uses title chrome");
assert(ctx.includes("Policy B: Display field app-wide"), "display field app-wide");

const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
assert(html.includes('id="nodeSceneAliasLabel"'), "Title label in settings");
assert(html.includes("scene-context-module-bypass-button"), "settings disable is bypass button");
assert(html.includes('id="nodeSceneToggleModuleEnabled"'), "settings disable control id");
assert(ctx.includes("syncNodeGraphBypassButtonElement"), "settings syncs shared bypass button");
assert(ctx.includes("showInletOutletVisibilityChrome"), "InletOutlet still gates disable");
assert(html.includes("b048-bypass-ssot-1"), "cache token");

// B-048: bypass chrome SSOT on wiring panel (settings + face share vars).
const styles = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");
assert(styles.includes(".node-wiring-panel"), "wiring panel rule");
assert(
  /\.node-wiring-panel\s*\{[\s\S]*?--node-bypass-off-bg:\s*#000000/.test(styles),
  "B-048: black off-bg default on wiring panel",
);
assert(
  /\.node-wiring-panel\s*\{[\s\S]*?--node-bypass-on-bg:\s*#5c1818/.test(styles),
  "B-048: red on-bg default on wiring panel",
);
assert(
  styles.includes("background: var(--node-bypass-off-bg, #000000)"),
  "B-048: bypass button off-bg fallback",
);
assert(
  styles.includes('scene-context-module-bypass-button[aria-pressed="true"]'),
  "B-048: settings pressed red rule",
);
const sync = fs.readFileSync(path.join(root, "public", "node-graph-ui-settings-sync.js"), "utf8");
assert(sync.includes('getElementById("nodeWiringPanel")'), "B-048: sync writes bypass vars to wiring panel");
assert(sync.includes("--node-bypass-off-bg"), "B-048: sync sets off-bg");

console.log("ok: display-follows-title (Policy B) + portal jack effective display + hide-title restore + B-048 bypass SSOT");
