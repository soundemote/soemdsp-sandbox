/**
 * Smoke: Show metaparameter expose key helpers + PatchNodeParameterDefinitions.
 * Requires :8765. Run: node scripts/_meta_expose_param_smoke.mjs
 */
import { chromium } from "playwright";

const URL = process.env.SANDBOX_URL || "http://127.0.0.1:8765/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (err) => console.warn("pageerror", err.message));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
const start = page.locator("#nodeBootStartButton");
if (await start.count()) await start.click();
await page.waitForFunction(
  () => document.body?.classList?.contains("node-boot-ready")
    && typeof nodeGraphMetamoduleSetParamExposed === "function"
    && typeof nodeGraphPatchNodeParameterDefinitions === "function",
  null,
  { timeout: 120000 },
);

const result = await page.evaluate(() => {
  const out = { ok: false, steps: [], fail: "" };
  const push = (s) => out.steps.push(s);
  try {
    const patch = {
      nodes: [
        {
          id: "metamodule-9",
          type: "metamodule",
          params: { amplitude: 1, voices: 4, playmode: 0 },
          paramMeta: {},
          metamodule: {
            boundary: [],
            displays: [],
            paramVisibility: {},
          },
        },
        {
          id: "hypersaw2-9",
          type: "hypersaw2",
          ownerMetamoduleId: "metamodule-9",
          params: { amplitude: 0.42, frequency: 220 },
          paramMeta: {},
        },
      ],
      connections: [],
      modulations: [],
    };
    nodeGraphMvp.patch = patch;
    const meta = patch.nodes[0];
    const child = patch.nodes[1];

    const before = nodeGraphPatchNodeParameterDefinitions(meta);
    push(`before count=${before.length} keys=${before.map((p) => p.key).join(",")}`);
    if (!before.some((p) => p.key === "amplitude")) {
      out.fail = "missing built-in amplitude";
      return out;
    }

    nodeGraphMetamoduleSetParamExposed(meta, child.id, "amplitude", true);
    const after = nodeGraphPatchNodeParameterDefinitions(meta);
    const synth = nodeGraphMetamoduleExposeParamKey(child.id, "amplitude");
    push(`after count=${after.length} synth=${synth}`);
    push(`keys=${after.map((p) => p.key).join(",")}`);
    if (!after.some((p) => p.key === synth)) {
      out.fail = `expected synth key ${synth} in defs`;
      return out;
    }
    if (!nodeGraphMetamoduleIsParamExposed(meta, child.id, "amplitude")) {
      out.fail = "isParamExposed false after set";
      return out;
    }

    const okSync = nodeGraphMetamoduleSyncExposedParamFromShell(meta, synth, 0.77, patch);
    push(`sync=${okSync} childAmp=${child.params.amplitude} shell=${meta.params[synth]}`);
    if (!okSync || Number(child.params.amplitude) !== 0.77) {
      out.fail = "write-through failed";
      return out;
    }

    const target = nodeGraphMetamoduleResolveExposeTarget(meta, synth, patch);
    push(`resolve child=${target?.childId} param=${target?.paramKey}`);
    if (target?.childId !== child.id || target?.paramKey !== "amplitude") {
      out.fail = `resolve mismatch ${JSON.stringify(target)}`;
      return out;
    }

    nodeGraphMetamoduleSetParamExposed(meta, child.id, "amplitude", false);
    const cleared = nodeGraphPatchNodeParameterDefinitions(meta);
    if (cleared.some((p) => p.key === synth)) {
      out.fail = "synth key still present after clear";
      return out;
    }
    push("cleared ok");

    out.ok = true;
    return out;
  } catch (err) {
    out.fail = err?.stack || err?.message || String(err);
    return out;
  }
});

await browser.close();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  console.error("FAIL:", result.fail);
  process.exit(1);
}
console.log("OK");
