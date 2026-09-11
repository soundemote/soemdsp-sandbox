from pathlib import Path

p = Path("public/node-live-audio-worklet-process.js")
t = p.read_text(encoding="utf-8")
start = t.find("    // Legacy ?product=full sample loop (evaluateFrame).")
if start < 0:
    raise SystemExit("start missing")
end = t.find("\n    this.finishSmoothing();\n    // Probe timer tick size once.", start)
if end < 0:
    raise SystemExit("end missing")
replacement = """    // APP_POLICY: JS evaluateFrame path removed. Silence if somehow reached.
    for (const channel of output) {
      if (channel) channel.fill(0);
    }
    if (!this._jsEvaluateFramePathWarned) {
      this._jsEvaluateFramePathWarned = true;
      try {
        this.port.postMessage({
          type: "status",
          status: "error",
          message: "JS evaluateFrame audio path removed — native graph only",
        });
      } catch (_e) { /* ignore */ }
    }
"""
p.write_text(t[:start] + replacement + t[end:], encoding="utf-8", newline="\n")
print("process.js legacy block replaced", end - start, "chars")
