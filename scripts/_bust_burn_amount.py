from pathlib import Path
import re

p = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html")
t = p.read_text(encoding="utf-8")
pairs = [
    (r"phosphor-residual\.js\?v=[^\"']+", "phosphor-residual.js?v=burn-amount-1"),
    (r"phosphor-energy-gl\.js\?v=[^\"']+", "phosphor-energy-gl.js?v=burn-amount-1"),
    (r"node-graph-module-scope-number-readout\.js\?v=[^\"']+", "node-graph-module-scope-number-readout.js?v=burn-amount-1"),
    (r"node-graph-module-scope-defaults\.js\?v=[^\"']+", "node-graph-module-scope-defaults.js?v=burn-amount-1"),
    (r"node-graph-module-scope-normalize\.js\?v=[^\"']+", "node-graph-module-scope-normalize.js?v=burn-amount-1"),
    (r"node-graph-module-scope-settings-controls\.js\?v=[^\"']+", "node-graph-module-scope-settings-controls.js?v=burn-amount-1"),
    (r"node-graph-module-scope-settings-form\.js\?v=[^\"']+", "node-graph-module-scope-settings-form.js?v=burn-amount-1"),
    (r"node-graph-module-scope-settings-form-io\.js\?v=[^\"']+", "node-graph-module-scope-settings-form-io.js?v=burn-amount-1"),
    (r"node-graph-module-scope-trace-controls\.js\?v=[^\"']+", "node-graph-module-scope-trace-controls.js?v=burn-amount-1"),
    (r"node-graph-module-scope-spectrum\.js\?v=[^\"']+", "node-graph-module-scope-spectrum.js?v=burn-amount-1"),
    (r"node-graph-module-scope-draw-burn\.js\?v=[^\"']+", "node-graph-module-scope-draw-burn.js?v=burn-amount-1"),
    (r"node-graph-module-scope-draw-basic\.js\?v=[^\"']+", "node-graph-module-scope-draw-basic.js?v=burn-amount-1"),
    (r"styles\.css\?v=[^\"']+", "styles.css?v=burn-amount-1"),
]
for pat, rep in pairs:
    t, n = re.subn(pat, rep, t, count=1)
    print(rep, n)
p.write_text(t, encoding="utf-8", newline="\n")
print("rocket", "\U0001F680" in t)
