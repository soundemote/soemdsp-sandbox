import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchPath = "C:/Users/argit/Desktop/not working patch.json";
const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://127.0.0.1:8765/", { waitUntil: "domcontentloaded", timeout: 60000 });

// Click boot start if present
for (const sel of ["#nodeBootStartButton", "button#nodeBootStartButton", "[data-boot-start]"]) {
  const btn = page.locator(sel);
  if (await btn.count()) {
    await btn.first().click({ timeout: 5000 }).catch(() => {});
    break;
  }
}

await page.waitForTimeout(2500);

const diag = await page.evaluate(async (patchJson) => {
  const out = {
    title: document.title,
    buildToken: document.querySelector("[data-build-token-value]")?.textContent || "",
    bodyClass: document.body.className,
    errors: [],
    audio: null,
    load: null,
    peaks: null,
  };
  try {
    // Prefer existing app loaders
    const mvp = window.nodeGraphMvp || window.NodeGraphMvp || null;
    out.hasMvp = !!mvp;
    out.efficient = typeof window.nodeGraphEfficientProductEnabled === "function"
      ? window.nodeGraphEfficientProductEnabled()
      : mvp?.efficientProduct ?? null;

    // Try to resume audio
    const ac = mvp?.audioContext || mvp?.ctx || window.nodeGraphAudioContext || null;
    if (ac) {
      await ac.resume?.();
      out.audio = { state: ac.state, sr: ac.sampleRate };
    }

    // Load patch if API exists
    const loaders = [
      window.nodeGraphLoadPatch,
      window.loadNodeGraphPatch,
      mvp?.loadPatch?.bind(mvp),
      mvp?.importPatch?.bind(mvp),
      window.nodeGraphMvp?.loadPatchJson,
    ].filter(Boolean);
    out.loaderCount = loaders.length;
    if (loaders[0]) {
      try {
        await loaders[0](patchJson);
        out.load = "ok";
      } catch (e) {
        out.load = String(e?.message || e);
      }
    }

    await new Promise((r) => setTimeout(r, 1500));

    // Probe worklet / native graph status if exposed
    out.nativeStatus = window.__nativeGraphStatus || mvp?.nativeGraphStatus || null;
    out.workletErrors = window.__workletErrors || null;

    // Meter from analyser if any
    const an = mvp?.analyser || mvp?.outputAnalyser;
    if (an && typeof an.getByteTimeDomainData === "function") {
      const buf = new Uint8Array(an.fftSize || 2048);
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      out.peaks = { analyserPeak: peak };
    }
  } catch (e) {
    out.errors.push(String(e?.stack || e));
  }
  return out;
}, patch);

console.log(JSON.stringify(diag, null, 2));
console.log("--- logs (last 80) ---");
for (const line of logs.slice(-80)) console.log(line);

await browser.close();
