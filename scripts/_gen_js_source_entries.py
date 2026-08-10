"""Generate nodeGraphJsSourceEntriesByType fragment from public/modules layout."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODS = ROOT / "public" / "modules"
OUT = ROOT / "scripts" / "_js_source_entries_fragment.js"

ALIASES: dict[str, str | None] = {
    "butterworth": "scientificIir",
    "linkwitzRiley": "scientificIir",
    "bessel": "scientificIir",
    "chebyshev": "scientificIir",
    "elliptic": "scientificIir",
    "bandpass": "scientificIir",
    "allpass": "scientificIir",
    "crossover2": "crossover",
    "crossover3": "crossover",
    "crossover4": "crossover",
    "crossover5": "crossover",
    "crossover6": "crossover",
    "ellipsoidOsc": "ellipsoid",
    "osc": None,
    "sineWavetable": None,
}


def kebab_from_folder(name: str) -> str:
    out: list[str] = []
    for i, c in enumerate(name):
        if c.isupper() and i > 0:
            out.append("-")
            out.append(c.lower())
        else:
            out.append(c.lower())
    return "".join(out)


def prefer_file(folder: Path) -> Path | None:
    for pattern in (
        "*-math.js",
        "*-dsp.js",
        "*-worklet-evaluator.js",
        "*-live-evaluator.js",
        "*-register.js",
        "*-ui.js",
        "*.js",
    ):
        hits = sorted(folder.glob(pattern))
        if hits:
            return hits[0]
    return None


def collect_types() -> set[str]:
    lab_text = (ROOT / "public" / "node-graph-module-definitions.js").read_text(
        encoding="utf-8"
    )
    m = re.search(
        r"const nodeGraphNodeLabels = Object\.freeze\(\{([\s\S]*?)\}\);", lab_text
    )
    keys: set[str] = set()
    if m:
        keys.update(re.findall(r"^\s*([A-Za-z][A-Za-z0-9]*)\s*:", m.group(1), re.M))
    for reg in MODS.glob("*/*-register.js"):
        head = reg.read_text(encoding="utf-8", errors="replace")[:800]
        mm = re.search(
            r'registerNodeGraphChromelessModule\(\s*["\']([A-Za-z0-9_]+)["\']',
            head,
        )
        if mm:
            keys.add(mm.group(1))
    # folder names themselves are often types
    for d in MODS.iterdir():
        if d.is_dir():
            keys.add(d.name)
    return keys


def main() -> None:
    entries: dict[str, str] = {}
    for t in sorted(collect_types()):
        if t in ALIASES and ALIASES[t] is None:
            continue
        folder_name = ALIASES.get(t, t)
        assert folder_name is not None
        folder = MODS / folder_name
        if not folder.is_dir():
            folder = MODS / kebab_from_folder(t)
        if not folder.is_dir():
            continue
        f = prefer_file(folder)
        if not f:
            continue
        entries[t] = f.relative_to(ROOT).as_posix()

    entries["sineWavetable"] = "public/node-graph-oscillator-runtime.js"
    entries["osc"] = "public/node-graph-oscillator-runtime.js"

    lines = ["const nodeGraphJsSourceEntriesByType = Object.freeze({"]
    for t, rel in sorted(entries.items()):
        url = f"https://github.com/soundemote/soemdsp-sandbox/blob/master/{rel}"
        lines.append(f"  {t}: {{")
        lines.append(f'    source: "{rel}",')
        lines.append(f'    sourceUrl: "{url}",')
        lines.append("  },")
    lines.append("});")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {OUT}")
    for k in ("sinepulse", "softpopOscillator", "phaseDisperse", "xyPad", "polyBlep"):
        print(f"  {k}: {entries.get(k)}")


if __name__ == "__main__":
    main()
