const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto("http://127.0.0.1:8765/", { waitUntil: "domcontentloaded" });
  await page.click("#nodeBootStartButton");
  await page.waitForFunction(
    () => document.body?.dataset?.nodeBootFinished,
    null,
    { timeout: 120000 },
  );
  const info = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const id = showNodeGraphModule("expoPluckEnvelope2", null, { record: false });
    await wait(800);
    const el = document.querySelector(".node-expo-pluck2-display");
    const def = nodeGraphModuleDefinitions?.expoPluckEnvelope2;
    const preview = typeof expoPluckEnvelope2PreviewCurve === "function"
      ? expoPluckEnvelope2PreviewCurve({
        attack: 0.002,
        transientHeight: 0.25,
        transientLength: 0.02,
        lingerHeight: 0,
        lingerLength: 1.5,
      }, 128, 800)
      : null;
    return {
      id,
      hasFace: !!el,
      laidOut: !!el?._expoPluck2LaidOut,
      previewPts: preview?.points?.length || 0,
      attackEndT: preview?.attackEndT,
      transientEndT: preview?.transientEndT,
      paramKeys: (def?.parameters || []).map((p) => p.key),
      layout: def?.layout || null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  if (!info.id || !info.hasFace || info.previewPts < 48) process.exit(2);
  await browser.close();
  console.log("PASS expo pluck 2");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
