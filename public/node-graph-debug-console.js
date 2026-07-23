// In-app debug console for the sandbox. Adds a red 🐞 button next to Download
// that opens a log panel. Mirrors the C++ soemdsp::debug API from sehelper.hpp
// (LOG / WARN / CHECK / FAIL / STOP / BADVAL / WITHINRANGE / WITHINSIZE) as
// window.SE, captures uncaught errors + console.warn/error, and can watch the
// live-audio parameter stream to show what smoothing the engine actually gets.
//
// Self-contained on purpose: the only other edit is the <script> tag in
// index.html. Everything here is guarded so a failure never breaks the app.
(() => {
  "use strict";
  if (window.__seDebugConsole) return;

  const CAP = 4000;
  const entries = [];
  let seq = 0;
  let errorCount = 0;
  let paused = false;
  let filter = "all";
  let search = "";
  const els = {};

  const pad = (n, w = 2) => String(n).padStart(w, "0");
  function stamp() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  // Parse the first stack frame outside this file -> "file:line".
  function callerLoc() {
    const stack = (new Error().stack || "").split("\n");
    for (let i = 2; i < stack.length; i++) {
      const line = stack[i] || "";
      if (line.includes("node-graph-debug-console")) continue;
      const m = line.match(/([^/\\ ()]+\.js):(\d+):\d+/);
      if (m) return `${m[1]}:${m[2]}`;
      return line.trim().replace(/^at\s+/, "").slice(0, 80);
    }
    return "";
  }

  const LEVELS = {
    LOG: { tag: "LOG", color: "#8fd0ff", err: false },
    INFO: { tag: "INFO", color: "#9aa4b2", err: false },
    WARN: { tag: "WARN", color: "#ffcf6b", err: false },
    FAIL: { tag: "FAIL", color: "#ff6b6b", err: true },
    SMOOTH: { tag: "SMTH", color: "#b184ff", err: false },
    ERROR: { tag: "ERR!", color: "#ff5555", err: true },
  };

  function push(level, msg, loc) {
    const lv = LEVELS[level] || LEVELS.LOG;
    const e = { id: ++seq, t: stamp(), level, loc: loc || "", msg: String(msg) };
    entries.push(e);
    if (entries.length > CAP) entries.splice(0, entries.length - CAP);
    if (lv.err) errorCount++;
    render(e);
    updateBadge();
    return e;
  }

  // ---- sehelper.hpp-style API ----------------------------------------------
  const SE = {
    LOG: (msg) => push("LOG", msg || "FAILURE: no error message provided", callerLoc()),
    INFO: (msg) => push("INFO", msg, callerLoc()),
    WARN: (cond, msg) => { if (!cond) push("WARN", msg, callerLoc()); return cond; },
    CHECK: (cond, msg) => { if (!cond) { push("FAIL", msg || "CHECK failed", callerLoc()); try { console.assert(false, msg); } catch (_) {} } return cond; },
    FAIL: (msg) => push("FAIL", msg || "FAIL", callerLoc()),
    STOP: (msg) => push("FAIL", msg || "DEBUG BREAK", callerLoc()),
    WITHINSIZE: (value, container, msg) => {
      const n = container && container.length != null ? container.length : container && container.size;
      if (!(value >= 0 && value < n)) push("FAIL", msg || `Index out of bounds: ${value} / ${n}`, callerLoc());
    },
    WITHINRANGE: (value, min, max, name) => {
      if (!(value >= min && value <= max)) push("FAIL", `${name || "value"} out of range: ${value} not in [${min}, ${max}]`, callerLoc());
    },
    // exploded (>1e9) / inf / nan / denormal — matches BADVAL in sehelper.hpp
    BADVAL: (val, name) => {
      const v = Number(val);
      let bad = null;
      if (!(Math.abs(v) < 999999999)) bad = "exploded";
      else if (!Number.isFinite(v)) bad = Number.isNaN(v) ? "NaN" : "inf";
      else if (v !== 0 && Math.abs(v) < 2.2250738585072014e-308) bad = "denormalized";
      if (bad) push("FAIL", `${name || "number"} is ${bad}: ${val}`, callerLoc());
      return bad === null;
    },
    open: () => showPanel(true),
    close: () => showPanel(false),
    clear: clearLog,
    entries: () => entries.slice(),
    smoothingWatch: (on) => setSmoothingWatch(on),
    devMode: (on) => {
      try { localStorage.setItem("seDebug", on ? "1" : "0"); } catch (_) {}
      if (on) { injectStyles(); buildButton(); buildPanel(); showPanel(true); }
      else if (els.panel) { els.panel.remove(); els.btn && els.btn.remove(); els.panel = null; els.btn = null; }
    },
  };
  window.SE = SE;
  window.__seDebugConsole = SE;

  // ---- capture uncaught errors + console warn/error ------------------------
  window.addEventListener("error", (ev) => {
    if (ev?.message) push("ERROR", `${ev.message}`, `${(ev.filename || "").split("/").pop()}:${ev.lineno || "?"}`);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    push("ERROR", `unhandled rejection: ${ev?.reason?.message || ev?.reason || "?"}`, "");
  });
  ["warn", "error"].forEach((k) => {
    const orig = console[k].bind(console);
    console[k] = (...args) => {
      try {
        const text = args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" ");
        // Skip our own re-logging noise.
        if (!text.includes("[se-debug]")) push(k === "error" ? "ERROR" : "WARN", text, "console");
      } catch (_) {}
      return orig(...args);
    };
  });
  function safeStringify(v) { try { return JSON.stringify(v); } catch (_) { return String(v); } }

  // ---- live-audio smoothing watch ------------------------------------------
  let smoothingWatch = false;
  let hookedPort = null;
  let origPost = null;
  let watchTimer = 0;

  function installPortHook() {
    const port = window.nodeGraphMvp?.live?.node?.port;
    if (!port || port === hookedPort) return;
    uninstallPortHook();
    hookedPort = port;
    origPost = port.postMessage.bind(port);
    port.postMessage = (msg, ...rest) => {
      try {
        if (smoothingWatch && msg) {
          if (msg.type === "setParams") summarizeSetParams(msg);
          else if (msg.type === "setPlan") {
            push("SMOOTH", "⚠ PLAN rebuild sent — every smoother is reset to its target (instant snap). If these flood while you drag, that is why smoothing is not heard.", "live-plan");
          }
        }
      } catch (_) {}
      return origPost(msg, ...rest);
    };
  }
  function uninstallPortHook() {
    if (hookedPort && origPost) { try { hookedPort.postMessage = origPost; } catch (_) {} }
    hookedPort = null; origPost = null;
  }
  let lastSummaryKey = "";
  function summarizeSetParams(msg) {
    const L = window.nodeGraphMvp?.live || {};
    const g = Number(msg.autoSmoothingSeconds);
    const snap = [];
    const modes = {};
    for (const n of msg.nodes || []) {
      for (const [k, m] of Object.entries(n.paramMeta || {})) {
        const mode = m && m.smoothingMode;
        modes[mode] = (modes[mode] || 0) + 1;
        if (mode === "off" || (m && m.linearSmoothing === false) || (mode === "internal" && !m.smoothingSeconds)) {
          snap.push(`${n.type}.${k}${m && m.linearSmoothing === false ? "(linOFF)" : `(${mode})`}`);
        }
      }
    }
    const modeStr = Object.entries(modes).map(([k, v]) => `${k}:${v}`).join(" ");
    const key = `${(g * 1000).toFixed(1)}|${modeStr}|${snap.length}`;
    if (key === lastSummaryKey) return; // only log when something changes
    lastSummaryKey = key;
    push("SMOOTH",
      `global=${(g * 1000).toFixed(1)}ms manual=${L.autoSmoothingManual} worklet=${L.usesWorklet} | modes{${modeStr}}` +
      (snap.length ? ` | SNAP: ${snap.slice(0, 8).join(", ")}${snap.length > 8 ? "…" : ""}` : ""),
      "live-params");
  }
  function setSmoothingWatch(on) {
    smoothingWatch = !!on;
    if (els.watchBtn) {
      els.watchBtn.setAttribute("aria-pressed", smoothingWatch ? "true" : "false");
      els.watchBtn.textContent = smoothingWatch ? "◉ smoothing" : "○ smoothing";
    }
    if (smoothingWatch) {
      lastSummaryKey = "";
      installPortHook();
      if (!watchTimer) watchTimer = window.setInterval(installPortHook, 1000); // re-hook if the engine restarts
      SE.INFO("smoothing watch ON — fine-tune a slider; a line prints when the sent smoothing changes.");
    } else {
      if (watchTimer) { window.clearInterval(watchTimer); watchTimer = 0; }
      uninstallPortHook();
      SE.INFO("smoothing watch OFF");
    }
  }

  // ---- UI -------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById("seDebugStyles")) return;
    const s = document.createElement("style");
    s.id = "seDebugStyles";
    s.textContent = `
      #seDebugButton{width:40px;height:auto;align-self:stretch;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
        font-size:17px;line-height:1;border:1px solid #c0392b;border-radius:7px;cursor:pointer;
        background:linear-gradient(#e74c3c,#c0392b);color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.4);position:relative;padding:0;}
      #seDebugButton:hover{filter:brightness(1.12);}
      #seDebugButton[aria-pressed="true"]{outline:2px solid #fff3;}
      #seDebugButton .se-badge{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:9px;
        background:#000;color:#ff6b6b;font:700 10px/16px ui-monospace,monospace;text-align:center;display:none;border:1px solid #ff6b6b;}
      #seDebugPanel{position:fixed;z-index:2147483646;right:14px;bottom:14px;width:640px;height:380px;min-width:340px;min-height:200px;
        display:none;flex-direction:column;background:#11141a;color:#d8dee9;border:1px solid #2a2f3a;border-radius:10px;
        box-shadow:0 10px 40px rgba(0,0,0,.55);overflow:hidden;resize:both;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;}
      #seDebugPanel.se-open{display:flex;}
      #seDebugPanel .se-head{display:flex;align-items:center;gap:6px;padding:6px 8px;background:#171b22;border-bottom:1px solid #2a2f3a;cursor:move;user-select:none;}
      #seDebugPanel .se-title{font-weight:700;color:#fff;margin-right:auto;}
      #seDebugPanel button.se-tool{background:#232936;color:#cdd6e4;border:1px solid #313a4a;border-radius:5px;padding:2px 8px;cursor:pointer;font:inherit;}
      #seDebugPanel button.se-tool:hover{background:#2c3444;}
      #seDebugPanel .se-filters{display:flex;gap:4px;align-items:center;padding:5px 8px;background:#141821;border-bottom:1px solid #222834;flex-wrap:wrap;}
      #seDebugPanel .se-chip{cursor:pointer;padding:1px 8px;border-radius:10px;border:1px solid #2c3444;color:#9aa4b2;background:#191e28;font-size:11px;}
      #seDebugPanel .se-chip.on{color:#fff;border-color:#4b6;background:#1c2a22;}
      #seDebugPanel input.se-search{flex:1;min-width:80px;background:#0d1016;border:1px solid #2c3444;color:#cdd6e4;border-radius:5px;padding:2px 7px;font:inherit;}
      #seDebugPanel .se-log{flex:1;overflow:auto;padding:4px 8px;-webkit-user-select:text;user-select:text;cursor:text;}
      #seDebugPanel .se-row{white-space:pre-wrap;word-break:break-word;padding:1px 0;border-bottom:1px solid #171b22;-webkit-user-select:text;user-select:text;}
      #seDebugPanel .se-row .se-t{color:#5b6472;}
      #seDebugPanel .se-row .se-lv{font-weight:700;margin:0 6px;}
      #seDebugPanel .se-row .se-loc{color:#6b7688;margin-right:6px;}
      #seDebugPanel .se-empty{color:#5b6472;padding:10px;}
    `;
    document.head.appendChild(s);
  }

  function buildButton() {
    if (document.getElementById("seDebugButton")) return;
    const btn = document.createElement("button");
    btn.id = "seDebugButton";
    btn.type = "button";
    btn.title = "Debug log (soemdsp::debug)";
    btn.setAttribute("aria-label", "Open debug log");
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `🐞<span class="se-badge" data-se-badge>0</span>`;
    btn.addEventListener("click", () => showPanel(els.panel?.classList.contains("se-open") ? false : true));
    els.btn = btn;
    els.badge = btn.querySelector("[data-se-badge]");
    const anchor = document.getElementById("nodeDonateFiveButton");
    if (anchor && anchor.parentNode) anchor.insertAdjacentElement("afterend", btn);
    else (document.querySelector(".node-history-controls") || document.body).appendChild(btn);
  }

  function buildPanel() {
    if (document.getElementById("seDebugPanel")) return;
    const p = document.createElement("div");
    p.id = "seDebugPanel";
    p.innerHTML = `
      <div class="se-head" data-se-drag>
        <span class="se-title">🐞 Debug Log</span>
        <button class="se-tool" data-se-watch aria-pressed="false">○ smoothing</button>
        <button class="se-tool" data-se-pause>Pause</button>
        <button class="se-tool" data-se-copy>Copy</button>
        <button class="se-tool" data-se-clear>Clear</button>
        <button class="se-tool" data-se-close>✕</button>
      </div>
      <div class="se-filters">
        ${["all","LOG","WARN","FAIL","SMOOTH","ERROR"].map((f)=>`<span class="se-chip${f==="all"?" on":""}" data-se-filter="${f}">${f}</span>`).join("")}
        <input class="se-search" data-se-search placeholder="filter text…">
      </div>
      <div class="se-log" data-se-list><div class="se-empty">No log entries yet.</div></div>`;
    document.body.appendChild(p);
    els.panel = p;
    els.list = p.querySelector("[data-se-list]");
    els.watchBtn = p.querySelector("[data-se-watch]");

    p.querySelector("[data-se-close]").addEventListener("click", () => showPanel(false));
    p.querySelector("[data-se-clear]").addEventListener("click", clearLog);
    p.querySelector("[data-se-copy]").addEventListener("click", copyLog);
    const pauseBtn = p.querySelector("[data-se-pause]");
    pauseBtn.addEventListener("click", () => { paused = !paused; pauseBtn.textContent = paused ? "Resume" : "Pause"; if (!paused) rebuild(); });
    els.watchBtn.addEventListener("click", () => setSmoothingWatch(!smoothingWatch));
    p.querySelectorAll("[data-se-filter]").forEach((c) => c.addEventListener("click", () => {
      filter = c.dataset.seFilter;
      p.querySelectorAll("[data-se-filter]").forEach((x) => x.classList.toggle("on", x === c));
      rebuild();
    }));
    p.querySelector("[data-se-search]").addEventListener("input", (e) => { search = e.target.value.toLowerCase(); rebuild(); });

    makeDraggable(p, p.querySelector("[data-se-drag]"));
  }

  function makeDraggable(panel, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      on = true; sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect();
      ox = r.left; oy = r.top;
      panel.style.right = "auto"; panel.style.bottom = "auto"; panel.style.left = ox + "px"; panel.style.top = oy + "px";
      handle.setPointerCapture?.(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!on) return;
      panel.style.left = (ox + e.clientX - sx) + "px";
      panel.style.top = Math.max(0, oy + e.clientY - sy) + "px";
    });
    const end = () => { on = false; };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function matches(e) {
    if (filter !== "all" && e.level !== filter) return false;
    if (search && !(`${e.loc} ${e.msg}`.toLowerCase().includes(search))) return false;
    return true;
  }
  function rowHtml(e) {
    const lv = LEVELS[e.level] || LEVELS.LOG;
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    return `<div class="se-row" data-id="${e.id}"><span class="se-t">${e.t}</span>`
      + `<span class="se-lv" style="color:${lv.color}">${lv.tag}</span>`
      + (e.loc ? `<span class="se-loc">${esc(e.loc)}</span>` : "")
      + `<span class="se-msg">${esc(e.msg)}</span></div>`;
  }
  function render(e) {
    if (!els.list || paused) return;
    const empty = els.list.querySelector(".se-empty");
    if (empty) empty.remove();
    if (!matches(e)) return;
    const atBottom = els.list.scrollHeight - els.list.scrollTop - els.list.clientHeight < 30;
    els.list.insertAdjacentHTML("beforeend", rowHtml(e));
    if (atBottom) els.list.scrollTop = els.list.scrollHeight;
  }
  function rebuild() {
    if (!els.list) return;
    const rows = entries.filter(matches);
    els.list.innerHTML = rows.length ? rows.map(rowHtml).join("") : `<div class="se-empty">No matching entries.</div>`;
    els.list.scrollTop = els.list.scrollHeight;
  }
  function clearLog() { entries.length = 0; errorCount = 0; updateBadge(); rebuild(); }
  function copyLog() {
    const text = entries.filter(matches).map((e) => `[${e.t}] ${(LEVELS[e.level]||{}).tag} ${e.loc} | ${e.msg}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => SE.INFO("log copied to clipboard"), () => {});
  }
  function updateBadge() {
    if (!els.badge) return;
    els.badge.textContent = String(errorCount);
    els.badge.style.display = errorCount > 0 ? "block" : "none";
  }
  function showPanel(open) {
    if (!els.panel) return;
    els.panel.classList.toggle("se-open", open);
    els.btn?.setAttribute("aria-pressed", open ? "true" : "false");
    if (open) { rebuild(); }
  }

  // Dev gate: only show the panel/button in a dev context (localhost, file://,
  // ?debug in the URL, or SE.devMode(true)). A public deploy hides it entirely;
  // the window.SE logging API and error capture stay active regardless.
  function seDevEnabled() {
    try {
      const host = location.hostname || "";
      if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(host) || location.protocol === "file:") return true;
      if (/(^|[?&])debug(=1|=true)?(&|$)/.test(location.search)) return true;
      return localStorage.getItem("seDebug") === "1";
    } catch (_) { return false; }
  }
  function init() {
    try {
      if (!seDevEnabled()) { return; }
      injectStyles();
      buildButton();
      buildPanel();
      SE.INFO(`debug console ready — build ${(document.querySelector("[data-build-number-value]")?.textContent || "?")}`);
    } catch (err) {
      try { console.error("[se-debug] init failed", err); } catch (_) {}
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
