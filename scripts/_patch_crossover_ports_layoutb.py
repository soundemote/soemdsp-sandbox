from pathlib import Path
import re
import json

def band_pair(n, i):
    if i == 0:
        return "LFL", "LFR"
    if i == n - 1:
        return "HFL", "HFR"
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
        a[L] = L
        a[R] = R
    lowL, lowR = band_pair(n, 0)
    highL, highR = band_pair(n, n - 1)
    a["Low L"] = lowL
    a["Low R"] = lowR
    a["Low Left"] = lowL
    a["Low Right"] = lowR
    a["High L"] = highL
    a["High R"] = highR
    a["High Left"] = highL
    a["High Right"] = highR
    a["0 L"] = lowL
    a["0 R"] = lowR
    a["0 Left"] = lowL
    a["0 Right"] = lowR
    a[f"{n - 1} L"] = highL
    a[f"{n - 1} R"] = highR
    a[f"{n - 1} Left"] = highL
    a[f"{n - 1} Right"] = highR
    return a


def fmt_outputs(outs, indent=4):
    sp = " " * indent
    return f'{sp}outputs: {json.dumps(outs)},'


def fmt_aliases(a, indent=4):
    sp = " " * indent
    lines = [f"{sp}outputAliases: {{"]
    items = list(a.items())
    for i, (k, v) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(f'{sp}  {json.dumps(k)}: {json.dumps(v)}{comma}')
    lines.append(f"{sp}}},")
    return "\n".join(lines)


def main():
    path = Path("public/node-graph-module-definitions.js")
    text = path.read_text(encoding="utf-8")

    for n in range(2, 7):
        if n < 6:
            next_pat = rf"\n  crossover{n + 1}:"
        else:
            next_pat = r"\n  [a-zA-Z][a-zA-Z0-9_]*:"
        pat = re.compile(
            rf"(  crossover{n}:\s*\{{)(.*?)({next_pat})",
            re.S,
        )
        m = pat.search(text)
        if not m:
            print("FAIL find", n)
            continue
        body = m.group(2)
        if 'chrome: "LayoutB"' not in body and "chrome: 'LayoutB'" not in body:
            if re.search(r'layout:\s*"filterCurve"', body):
                body = re.sub(
                    r'layout:\s*"filterCurve"',
                    'layout: "filterCurve",\n    chrome: "LayoutB"',
                    body,
                    count=1,
                )
            else:
                body = body.replace(
                    'planRole: "processor",',
                    'planRole: "processor",\n    chrome: "LayoutB",',
                    1,
                )

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
        print(f"crossover{n}: outs={c1} aliases={c2} chrome={'LayoutB' in body}")
        text = text[: m.start(2)] + body + text[m.end(2) :]

    path.write_text(text, encoding="utf-8")
    print("done")
    for n in range(2, 7):
        m = re.search(rf"crossover{n}:\s*\{{([\s\S]{{0,280}})", text)
        print("---", n)
        print((m.group(0) if m else "missing")[:280])


if __name__ == "__main__":
    main()
