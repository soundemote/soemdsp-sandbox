/**
 * B-080 smoke: choice labels collapse empty unit column so text can use full track width.
 * String/static checks only (no browser).
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
let failed = 0;
function assert(name, cond) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", name);
  } else {
    console.log("ok", name);
  }
}

const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
assert("css-b080-comment", css.includes("B-080: Choice divide/segment labels"));
assert("css-displays-choices-gap", css.includes(".node-slider-readout.displays-choices:has(> .node-slider-readout-unit.is-empty)") && css.includes("column-gap: 0"));
assert("css-single-column", /displays-choices:has\(> \.node-slider-readout-unit\.is-empty\)\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css));
assert("css-layout-exceptions", css.includes('data-slider-layout="value-outside"') && css.includes("label-value-slider") && css.includes("grid-template-columns: minmax(0, 1fr) auto"));
assert("css-empty-unit-display-none", /displays-choices[\s\S]*?\.node-slider-readout-unit\.is-empty\s*\{[\s\S]*?display:\s*none/.test(css));
assert(
  "css-no-force-span",
  !/displays-choices[^{]*\{[^}]*grid-column:\s*1\s*\/\s*-1/.test(css)
);

const js = fs.readFileSync(path.join(root, "public/node-graph-slider-readout.js"), "utf8");
assert("js-toggle-displays-choices", js.includes('classList.toggle("displays-choices", usesChoices)'));

const index = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
assert("index-styles-bust", index.includes("styles.css?v=b080-choice-fullwidth-2"));
assert("index-readout-bust", index.includes("node-graph-slider-readout.js?v=b080-choice-fullwidth-2"));

const doc = fs.readFileSync(path.join(root, "docs/B-080_CHOICE_SEGMENT_TEXT_FULLWIDTH.md"), "utf8");
assert("doc-exists", doc.includes("B-080"));

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nB-080 smoke passed");
