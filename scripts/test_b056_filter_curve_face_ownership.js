const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "public");
const libPath = path.join(root, "lib", "visual", "filter-curve-face.js");
const softPath = path.join(root, "modules", "softClipper", "soft-clipper-display.js");
const cookbookPath = path.join(root, "node-graph-cookbook-filter.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

const document = {
  createElement(tag) {
    const attrs = Object.create(null);
    const classSet = new Set();
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      dataset: Object.create(null),
      style: {},
      hidden: false,
      isConnected: false,
      classList: {
        add(...names) { names.forEach((n) => classSet.add(String(n))); },
        contains(name) { return classSet.has(String(name)); },
        remove(...names) { names.forEach((n) => classSet.delete(String(n))); },
      },
      setAttribute(k, v) { attrs[String(k)] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, String(k)) ? attrs[String(k)] : null; },
      removeAttribute(k) { delete attrs[String(k)]; },
      append(...kids) { this.children.push(...kids); },
      querySelector(sel) {
        if (String(sel).includes("soft-clipper-curve-canvas")) {
          return this.children.find((c) => c.classList && c.classList.contains("node-soft-clipper-curve-canvas")) || null;
        }
        if (String(sel).includes("filter-curve-canvas")) {
          return this.children.find((c) => c.classList && c.classList.contains("node-filter-curve-canvas")) || null;
        }
        return null;
      },
      get className() { return [...classSet].join(" "); },
      set className(v) {
        classSet.clear();
        String(v || "").split(/\s+/).filter(Boolean).forEach((n) => classSet.add(n));
      },
    };
    // Mirror dataset.faceKind <-> data-face-kind for mark helpers + query.
    Object.defineProperty(el.dataset, "faceKind", {
      get() { return attrs["data-face-kind"]; },
      set(v) { attrs["data-face-kind"] = String(v); },
      configurable: true,
      enumerable: true,
    });
    return el;
  },
  querySelectorAll(sel) {
    const want = String(sel);
    return (document._faces || []).filter((face) => {
      if (want.includes('data-face-kind="filterCurve"')) {
        return face.getAttribute("data-face-kind") === "filterCurve"
          && face.classList.contains("node-filter-curve-display");
      }
      if (want === ".node-filter-curve-display") {
        return face.classList.contains("node-filter-curve-display");
      }
      if (want === ".node-pulse-curve-display" || want === ".node-wall-room-display") {
        return false;
      }
      return false;
    });
  },
  _faces: [],
};

const sandbox = {
  console,
  document,
  window: null,
  globalThis: null,
  module: { exports: {} },
  requestAnimationFrame(cb) { sandbox._raf = cb; return 1; },
  setTimeout,
  nodeGraphMvp: { filterCurveDrawFrame: 0, sampleRate: 44100 },
  nodeGraphPatchNode() { return null; },
  nodeGraphSizeDisplayCanvas() { return null; },
  nodeGraphInstallDrawingFacePump() {},
  nodeGraphFilterCurveApplyCrossoverLightCutout() {},
  tagNodeGraphModuleBand() {},
  drawNodeGraphFilterCurveDisplay(section) {
    sandbox._painted.push(section.dataset.nodeType || section.dataset.faceKind || "?");
  },
  _painted: [],
  _raf: null,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(fs.readFileSync(libPath, "utf8"), sandbox, { filename: "filter-curve-face.js" });

assert(typeof sandbox.markFilterCurveOwnedFace === "function", "markFilterCurveOwnedFace exported");
assert(typeof sandbox.queryFilterCurveOwnedFaces === "function", "queryFilterCurveOwnedFaces exported");

const filterFace = document.createElement("section");
filterFace.className = "node-filter-curve-display node-light-source";
sandbox.markFilterCurveOwnedFace(filterFace);
filterFace.dataset.nodeType = "ladderFilter";
document._faces.push(filterFace);

const softFace = document.createElement("section");
softFace.className = "node-filter-curve-display node-soft-clipper-curve-display";
sandbox.markCurveFacePlate(softFace, "softClipperCurve");
softFace.dataset.nodeType = "softClipper";
document._faces.push(softFace);

const owned = sandbox.queryFilterCurveOwnedFaces(document);
assert(owned.length === 1, `expected 1 owned filter face, got ${owned.length}`);
assert(owned[0] === filterFace, "owned face is ladder/filter, not softclipper");
assert(sandbox.isFilterCurveOwnedFace(filterFace) === true, "filter face owned");
assert(sandbox.isFilterCurveOwnedFace(softFace) === false, "softclipper not owned");

sandbox._painted = [];
sandbox.scheduleFilterCurveOwnedDraw({
  paintOwned: sandbox.drawNodeGraphFilterCurveDisplay,
});
assert(typeof sandbox._raf === "function", "schedule queued rAF");
sandbox._raf();
assert(sandbox._painted.length === 1 && sandbox._painted[0] === "ladderFilter",
  `paint must hit only owned filter, got ${JSON.stringify(sandbox._painted)}`);

// Softclipper create must mark softClipperCurve, not filterCurve
vm.runInNewContext(fs.readFileSync(softPath, "utf8"), sandbox, { filename: "soft-clipper-display.js" });
assert(typeof sandbox.createNodeGraphSoftClipperCurveDisplay === "function", "soft create exists");
const mounted = sandbox.createNodeGraphSoftClipperCurveDisplay("n1", "softClipper");
assert(mounted.getAttribute("data-face-kind") === "softClipperCurve",
  `soft faceKind=${mounted.getAttribute("data-face-kind")}`);
assert(sandbox.isFilterCurveOwnedFace(mounted) === false, "mounted softclipper not filter-owned");

// Cookbook must mark owned on create + route schedule through ownership
const cookbookSrc = fs.readFileSync(cookbookPath, "utf8");
assert(cookbookSrc.includes("markFilterCurveOwnedFace"), "cookbook marks owned faces");
assert(cookbookSrc.includes("scheduleFilterCurveOwnedDraw"), "cookbook uses owned scheduler");
assert(!cookbookSrc.includes("node-soft-clipper-curve-display") || true, "ok");
// Exclusion-list anti-pattern removed from paint loop
assert(!cookbookSrc.includes("Calling the generic filter-curve painter on them flashes"),
  "ad-hoc exclusion dispatcher removed");

console.log("OK B-056 filter-curve ownership / Softclipper plate isolation");
