// Portal Title/bus = C++ identifier; Display free-form; Wire-RC splice sanitizes.
// node scripts/smoke_portal_cpp_ident.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = path.join(root, "public", "modules", "portal", "portal-named.js");

const sandbox = {
  normalizeNodeGraphPatchNodeAlias: (a) => String(a ?? "").trim().slice(0, 64),
  nodeGraphPatchNodeTitle: (node) => String(node?.alias || node?.type || "").trim(),
  nodeGraphPatchNodePortDisplayLabel: (_node, type, port, io) => {
    if (io === "output" && type === "keyboard" && port === "pitch") return "\u266f/\u266d";
    return String(port || "");
  },
  console,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(helperPath, "utf8"), sandbox, { filename: helperPath });

const {
  normalizeNodeGraphNamedPortalAlias,
  nodeGraphNamedPortalAliasFromSourceOutlet,
  nodeGraphNamedPortalSyncBusAlias,
  nodeGraphNamedPortalBusKey,
} = sandbox;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(typeof normalizeNodeGraphNamedPortalAlias === "function", "sanitizer missing");
assert(normalizeNodeGraphNamedPortalAlias("Cutoff") === "Cutoff", "plain");
assert(normalizeNodeGraphNamedPortalAlias("Cut off!") === "Cut_off", "spaces/punct");
assert(normalizeNodeGraphNamedPortalAlias("9lives") === "_9lives", "leading digit");
assert(normalizeNodeGraphNamedPortalAlias("Keyboard ♯/♭ Out") === "Keyboard_Out", "unicode outlet");
assert(nodeGraphNamedPortalAliasFromSourceOutlet(
  { nodes: [{ id: "keyboard-1", type: "keyboard", alias: "Keyboard" }] },
  "keyboard-1",
  "pitch",
) === "Keyboard_pitch", "splice keeps port when label is symbolic");
assert(normalizeNodeGraphNamedPortalAlias("") === "", "empty stays empty");
assert(normalizeNodeGraphNamedPortalAlias("@@@", "A") === "A", "fallback");

const patch = {
  nodes: [
    { id: "src", type: "ladderFilter", alias: "My Filter" },
    { id: "pin", type: "namedPortalIn", alias: "__portal_splice_1" },
    { id: "pout", type: "namedPortalOut", alias: "__portal_splice_1" },
  ],
};
const spliced = nodeGraphNamedPortalAliasFromSourceOutlet(patch, "src", "Out");
assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(spliced), `splice name illegal: ${spliced}`);
assert(spliced.includes("My") || spliced.includes("Filter") || spliced.includes("Out"), `splice weak: ${spliced}`);

nodeGraphNamedPortalSyncBusAlias(patch, "pin", "Bus Tone!");
assert(patch.nodes[1].alias === "Bus_Tone", `in alias ${patch.nodes[1].alias}`);
assert(patch.nodes[2].alias === "Bus_Tone", `out alias ${patch.nodes[2].alias}`);
assert(nodeGraphNamedPortalBusKey(patch.nodes[1]) === "bus_tone", "bus key");

// Display remains free-form (not run through portal sanitizer).
const cloneSrc = fs.readFileSync(path.join(root, "public", "node-graph-patch-clone.js"), "utf8");
assert(cloneSrc.includes("normalizeNodeGraphPatchNodeDisplay"), "display helper present");
assert(!cloneSrc.includes("normalizeNodeGraphNamedPortalAlias(node.display)"), "display not portal-sanitized");

const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
assert(html.includes("b048-bypass-ssot-1"), "cache token");
assert(html.includes("scene-context-module-bypass-button"), "mirrored bypass in settings");

console.log("ok: portal C++ ident + splice sanitize + SyncBusAlias + settings bypass mirror token");
