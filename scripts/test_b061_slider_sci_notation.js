const fs = require("fs");
const src = fs.readFileSync(
  "C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/node-graph-slider-metadata.js",
  "utf8",
);

function nodeGraphFiniteNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeNodeGraphMetadataMaxDigits(value, kind) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return kind === "integer" ? 3 : 5;
  return Math.max(1, Math.min(12, n));
}

const start = src.indexOf("const nodeSliderNumberFormatSmokeCases");
const end = src.indexOf("function parseNodeSliderMathExpression");
const chunk = src.slice(start, end);
const sandbox = { nodeGraphFiniteNumber, normalizeNodeGraphMetadataMaxDigits };
const fn = new Function(
  "nodeGraphFiniteNumber",
  "normalizeNodeGraphMetadataMaxDigits",
  chunk + "\nreturn { nodeSliderNumberFormatSmokeCases, formatNodeSliderNumber, limit_decimals, nodeSliderPlainDecimalSource };",
);
const {
  nodeSliderNumberFormatSmokeCases,
  formatNodeSliderNumber,
  limit_decimals,
  nodeSliderPlainDecimalSource,
} = fn(nodeGraphFiniteNumber, normalizeNodeGraphMetadataMaxDigits);

let failed = 0;
for (const c of nodeSliderNumberFormatSmokeCases) {
  const got = formatNodeSliderNumber(c.value, {
    maxDigits: c.maxDigits,
    showSign: c.showSign,
    reserveSignSpace: c.reserveSignSpace,
    removeTrailingZeros: c.removeTrailingZeros,
  });
  const ok = got === c.expected;
  console.log(
    ok ? "PASS" : "FAIL",
    JSON.stringify(c.value),
    "=>",
    JSON.stringify(got),
    "expected",
    JSON.stringify(c.expected),
  );
  if (!ok) failed += 1;
}

// Prove old bug: String → limit_decimals without expansion would truncate
const sci = String(8.0357e-7);
const match = sci.replace(/^[+-]/, "").match(/^(\d*)(\.?)(\d*)/);
const oldBug = (match?.[1] || "") + (match?.[2] || "") + (match?.[3] || "");
console.log("String(8.0357e-7)=", sci, "old mantissa extract=", oldBug);
console.log("plain=", nodeSliderPlainDecimalSource(8.0357e-7));
console.log("limit_decimals(String)=", limit_decimals(sci, 12, 12, 12, true));

if (oldBug !== "8.0357") {
  console.log("NOTE: old mantissa extract unexpected:", oldBug);
}
if (failed) {
  console.log("FAILED", failed);
  process.exit(1);
}
console.log("ALL PASS");
