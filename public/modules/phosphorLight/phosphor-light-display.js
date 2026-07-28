// phosphorLight — retired alias of 2D Phosphor (scope2d).
//
// Shop: hidden. Patches migrate type → "scope2d" on load
// (migrateNodeGraphPhosphorLightToScope2d). This file only keeps the
// renderer registry entry so any leftover phosphorLight displayType still
// draws through the canonical energy path.

function drawNodeGraphPhosphorLightItem(renderer, item, pixelRatio) {
  if (typeof drawNodeGraphScope2dItem === "function") {
    return drawNodeGraphScope2dItem(renderer, item, pixelRatio);
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.phosphorLight = drawNodeGraphPhosphorLightItem;
}
