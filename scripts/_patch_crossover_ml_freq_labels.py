"""Update crossover defs: 3-way ML/MR ports; Frequency # labels → Freq L#."""
from pathlib import Path
import re
import json


def band_pair(n, i):
    if i == 0:
        return "LFL", "LFR"
    if i == n - 1:
        return "HFL", "HFR"
    if n == 3:
        return "ML", "MR"
    return f"L{i}", f"R{i}"


def outputs(n):
    outs = []
    for i in range(n):
        L, R = band_pair(n, i)
        outs.extend([L, R])
    return outs


def aliases(n):
    legacy = {
        2: ["Low", "High"],
        3: ["Low", "Mid", "High"],
        4: ["Low", "Low-Mid", "High-Mid", "High"],
        5: ["Band 1", "Band 2", "Band 3", "Band 4", "Band 5"],
        6: ["Band 1", "Band 2", "Band 3", "Band 4", "Band 5", "Band 6"],
    }
    titles = legacy[n]
    a = {}
    for i, title in enumerate(titles):
        L, R = band_pair(n, i)
        a[f"{title} Left"] = L
        a[f"{title} Right"] = R
        a[f"{title} L"] = L
        a[f"{title} R"] = R
        a[f"Left {title}"] = L
        a[f"Right {title}"] = R
        if 0 < i < n - 1:
            a[f"{i} L"] = L
            a[f"{i} R"] = R
            a[f"{i} Left"] = L
            a[f"{i} Right"] = R
            a[f"L {i}"] = L
            a[f"R {i}"] = R
            a[f"L{i}"] = L
            a[f"R{i}"] = R
        a[L] = L
        a[R] = R
    lowL, lowR = band_pair(n, 0)
    highL, highR = band_pair(n, n - 1)
    for k, v in [
        ("Low L", lowL),
        ("Low R", lowR),
        ("Low Left", lowL),
        ("Low Right", lowR),
        ("High L", highL),
        ("High R", highR),
        ("High Left", highL),
        ("High Right", highR),
        ("0 L", lowL),
        ("0 R", lowR),
        ("0 Left", lowL),
        ("0 Right", lowR),
        (f"{n - 1} L", highL),
        (f"{n - 1} R", highR),
        (f"{n - 1} Left", highL),
        (f"{n - 1} Right", highR),
    ]:
        a[k] = v
    if n == 3:
        mL, mR = band_pair(n, 1)
        a["L1"] = mL
        a["R1"] = mR
        a["Mid L"] = mL
        a["Mid R"] = mR
        a["Mid Left"] = mL
        a["Mid Right"] = mR
        a["ML"] = mL
        a["MR"] = mR
    return a


def fmt_outputs(outs, indent=4):
    sp = " " * indent
    return f"{sp}outputs: {json.dumps(outs)},"


def fmt_aliases(a, indent=4):
    sp = " " * indent
    lines = [f"{sp}outputAliases: {{"]
    items = list(a.items())
    for i, (k, v) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(f'{sp}  {json.dumps(k)}: {json.dumps(v)}{comma}')
    lines.append(f"{sp}}},")
    return "\n".join(lines)


def rename_freq_labels(body: str) -> str:
    # Single split (crossover2): label "Frequency" → "Freq L1"
    body = re.sub(
        r'(key:\s*"frequency",\s*\n\s*kind:\s*"frequency",\s*\n\s*label:\s*)"Frequency"',
        r'\1"Freq L1"',
        body,
    )
    # Multi splits: Frequency 1 → Freq L1, Frequency 2 → Freq L2, …
    def repl_num(m):
        return f'{m.group(1)}"Freq L{m.group(2)}"'

    body = re.sub(
        r'(key:\s*"frequency\d+",\s*\n\s*kind:\s*"frequency",\s*\n\s*label:\s*)"Frequency (\d+)"',
        repl_num,
        body,
    )
    # Also catch label-only if key order differs
    body = re.sub(
        r'label:\s*"Frequency (\d+)"',
        lambda m: f'label: "Freq L{m.group(1)}"',
        body,
    )
    body = re.sub(
        r'label:\s*"Frequency"',
        'label: "Freq L1"',
        body,
    )
    return body


def main():
    path = Path("public/node-graph-module-definitions.js")
    text = path.read_text(encoding="utf-8")

    for n in range(2, 7):
        if n < 6:
            next_pat = rf"\n  crossover{n + 1}:"
        else:
            next_pat = r"\n  [a-zA-Z][a-zA-Z0-9_]*:"
        pat = re.compile(rf"(  crossover{n}:\s*\{{)(.*?)({next_pat})", re.S)
        m = pat.search(text)
        if not m:
            print("FAIL find", n)
            continue
        body = m.group(2)
        outs = outputs(n)
        als = aliases(n)
        body, c1 = re.subn(
            r"outputs:\s*\[[^\]]*\]\s*,",
            fmt_outputs(outs).lstrip() + "\n",
            body,
            count=1,
        )
        body, c2 = re.subn(
            r"outputAliases:\s*\{.*?\n    \},",
            fmt_aliases(als).lstrip() + "\n",
            body,
            count=1,
            flags=re.S,
        )
        body = rename_freq_labels(body)
        print(f"crossover{n}: outs={c1} aliases={c2}")
        print("  outputs", outs)
        text = text[: m.start(2)] + body + text[m.end(2) :]

    path.write_text(text, encoding="utf-8")
    print("done")
    for n in range(2, 7):
        m = re.search(
            r"crossover%d:.*?parameters:\s*\[(.*?)\]\s*\n  \}" % n,
            text,
            re.S,
        )
        labels = re.findall(r'label:\s*"([^"]+)"', m.group(1) if m else "")
        print(n, "labels", labels, "outs", outputs(n))


if __name__ == "__main__":
    main()
