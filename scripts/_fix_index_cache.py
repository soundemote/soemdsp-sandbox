from pathlib import Path
import re

p = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html")
t = p.read_text(encoding="utf-8")
print("rocket", "\U0001F680" in t)
pairs = [
    (r"styles\.css\?v=[^\"']+", "styles.css?v=light-led-1"),
    (r"node-graph-module-definitions\.js\?v=[^\"']+", "node-graph-module-definitions.js?v=light-led-1"),
    (r"node-graph-module-scope-number-readout\.js\?v=[^\"']+", "node-graph-module-scope-number-readout.js?v=light-led-1"),
    (r"helmholtz-pitch-live-evaluator\.js\?v=[^\"']+", "helmholtz-pitch-live-evaluator.js?v=light-led-1"),
    (r"helmholtz-pitch-ui\.js\?v=[^\"']+", "helmholtz-pitch-ui.js?v=light-led-1"),
    (r"node-graph-marquee-selection\.js\?v=[^\"']+", "node-graph-marquee-selection.js?v=snake-select-1"),
    (r"node-graph-module-scope-defaults\.js\?v=[^\"']+", "node-graph-module-scope-defaults.js?v=light-led-1"),
    (r"node-graph-module-scope-normalize\.js\?v=[^\"']+", "node-graph-module-scope-normalize.js?v=light-led-1"),
    (r"phosphor-residual\.js\?v=[^\"']+", "phosphor-residual.js?v=light-led-1"),
]
for pat, rep in pairs:
    t, n = re.subn(pat, rep, t, count=1)
    print(rep, "n=", n)
p.write_text(t, encoding="utf-8", newline="\n")
print("rocket after", "\U0001F680" in t)
print("mojibake", "ðŸ" in t)
