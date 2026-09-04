// Simulates sync_soundemote_site release omit list and checks required globals
// are defined by kept scripts (including release-debug-stubs.js).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const omit = [
  "node-graph-execution-debug-api.js",
  "node-graph-execution-debug-view.js",
  "node-graph-debug-copy.js",
  "legacy-evidence-checklist-view.js",
  "legacy-evidence-proof-view.js",
  "legacy-evidence-views.js",
  "hands-on-readiness-waveform-labels.js",
  "hands-on-readiness-primary-labels.js",
  "hands-on-readiness-artifact-labels.js",
  "hands-on-readiness-signal-inspection-labels.js",
  "hands-on-readiness-phase-parameter-labels.js",
  "hands-on-readiness-probe-labels.js",
  "hands-on-readiness.js",
  "artifact-report-utils.js",
  "artifact-report-reports.js",
  "artifact-list-view.js",
  "artifact-coverage-view.js",
  "manifest-source-view.js",
  "legacy-evidence",
];

const tags = [...html.matchAll(/<script\b[^>]*>\s*<\/script>/g)]
  .map((m) => m[0])
  .filter((tag) => !omit.some((frag) => tag.includes(frag)));

const defs = new Set();
let stubKept = false;
for (const tag of tags) {
  if (tag.includes("release-debug-stubs.js")) stubKept = true;
  const m = tag.match(/src="\.\/public\/([^"]+)"/);
  if (!m) continue;
  const rel = m[1].replace(/\?.*$/, "");
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error("MISSING FILE", rel);
    process.exit(1);
  }
  const txt = fs.readFileSync(p, "utf8");
  for (const fm of txt.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) {
    defs.add(fm[1]);
  }
}

const needed = [
  "renderNodeGraphExecutionSummarySelection",
  "validateConsumerChecklist",
  "renderArtifactCoverage",
  "renderHandsOnReadiness",
  "renderSource",
  "installNodeGraphDebugApi",
  "copyNodeGraphRuntimeSketch",
  "downloadNodeGraphLivePlanJson",
  "startNodeGraphMockInputDebug",
  "toggleDebugSections",
  "renderReports",
  "renderProducerProof",
  "renderChecklist",
];

console.log({ keptTags: tags.length, defs: defs.size, stubKept });
let failed = false;
if (!stubKept) {
  console.error("FAIL: release-debug-stubs.js omitted from release shell");
  failed = true;
}
for (const n of needed) {
  if (!defs.has(n)) {
    console.error("MISS", n);
    failed = true;
  } else {
    console.log("OK", n);
  }
}
if (failed) process.exit(1);
console.log("release debug stubs smoke OK");
