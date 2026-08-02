// Compatibility shim — canonical implementation lives at:
//   public/lib/phosphor/phosphor-energy-gl.js
// Load residual + energy-gl from lib/phosphor via index.html (this file kept so
// old absolute references still resolve if something still points here).
(function phosphorEnergyGlShim() {
  if (typeof console !== "undefined" && console.info) {
    // Only warn once if the real module is missing (load order bug).
    if (typeof globalThis.nodeGraphPhosphorEnergyGlEnsure !== "function") {
      console.info(
        "[phosphor] node-graph-phosphor-energy-gl.js is a shim; load public/lib/phosphor/phosphor-energy-gl.js",
      );
    }
  }
})();
