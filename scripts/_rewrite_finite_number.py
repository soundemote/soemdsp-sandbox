#!/usr/bin/env python3
"""SAFE rewrite only: Number(expr) || <numeric-literal> → nodeGraphFiniteNumber(...).

Never takes identifier/function fallbacks (those corrupted Math.min / getBoundingClientRect).
Also folds: nodeGraphFiniteNumber(a, b) || <numeric-literal> → nest the literal.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SKIP_DIRS = {"node_modules", ".git"}
LIT = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?")


def find_matching_paren(s: str, open_paren: int) -> int | None:
    depth = 0
    i = open_paren
    in_str = None
    escape = False
    while i < len(s):
        ch = s[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in ('"', "'", "`"):
            in_str = ch
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return None


def skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i] in " \t\r\n":
        i += 1
    return i


def rewrite_source(src: str) -> tuple[str, int]:
    out: list[str] = []
    i = 0
    n = len(src)
    count = 0
    while i < n:
        # Prefer folding existing finite(...) || lit
        j_fin = src.find("nodeGraphFiniteNumber(", i)
        j_num = src.find("Number(", i)
        if j_fin < 0 and j_num < 0:
            out.append(src[i:])
            break
        if j_fin < 0:
            j, kind = j_num, "Number"
        elif j_num < 0:
            j, kind = j_fin, "finite"
        else:
            j, kind = (j_fin, "finite") if j_fin < j_num else (j_num, "Number")

        name = "nodeGraphFiniteNumber" if kind == "finite" else "Number"
        if j > 0 and (src[j - 1].isalnum() or src[j - 1] in "_$"):
            out.append(src[i : j + len(name)])
            i = j + len(name)
            continue
        line_start = src.rfind("\n", 0, j) + 1
        if "//" in src[line_start:j]:
            out.append(src[i : j + len(name)])
            i = j + len(name)
            continue

        open_paren = j + len(name)
        end = find_matching_paren(src, open_paren)
        if end is None:
            out.append(src[i : j + len(name)])
            i = j + len(name)
            continue

        k = skip_ws(src, end)
        if not src.startswith("||", k):
            out.append(src[i:end])
            i = end
            continue
        k = skip_ws(src, k + 2)
        m = LIT.match(src, k)
        if not m:
            out.append(src[i:end])
            i = end
            continue
        lit = m.group(0)
        # Reject if next char continues an identifier (e.g. 1e not fully matched — LIT handles e)
        after = m.end()
        if after < n and (src[after].isalnum() or src[after] in "_$"):
            out.append(src[i:end])
            i = end
            continue

        inner = src[open_paren + 1 : end - 1]
        out.append(src[i:j])
        if kind == "Number":
            if lit in ("0", "0.0"):
                out.append(f"nodeGraphFiniteNumber({inner})")
            else:
                out.append(f"nodeGraphFiniteNumber({inner}, {lit})")
        else:
            # finite(a) || lit  or finite(a, b) || lit → finite(a, lit) / finite(a, finite(b, lit))?
            # Simplest correct: nodeGraphFiniteNumber(INNER_AS_VALUE, lit) where INNER may already
            # contain a fallback arg — wrap whole previous value:
            #   finite(x) || 1 → finite(x, 1)
            #   finite(x, y) || 1 → finite(finite(x, y), 1)  which is wrong if y is fallback
            # Better: finite(x, y) || 1 → finite(x, finite(y, 1)) when inner has one comma at depth 0
            depth = 0
            comma = -1
            in_str = None
            esc = False
            for t, ch in enumerate(inner):
                if in_str:
                    if esc:
                        esc = False
                    elif ch == "\\":
                        esc = True
                    elif ch == in_str:
                        in_str = None
                    continue
                if ch in ('"', "'", "`"):
                    in_str = ch
                    continue
                if ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                elif ch == "," and depth == 0 and comma < 0:
                    comma = t
            if comma < 0:
                out.append(f"nodeGraphFiniteNumber({inner}, {lit})")
            else:
                a = inner[:comma].rstrip()
                b = inner[comma + 1 :].lstrip()
                out.append(f"nodeGraphFiniteNumber({a}, nodeGraphFiniteNumber({b}, {lit}))")
        count += 1
        i = after
    return "".join(out), count


def main() -> int:
    total = 0
    files = 0
    for path in sorted(PUBLIC.rglob("*.js")):
        if any(p in SKIP_DIRS for p in path.parts):
            continue
        original = path.read_text(encoding="utf-8")
        rewritten, n = rewrite_source(original)
        if n == 0:
            continue
        path.write_text(rewritten, encoding="utf-8", newline="\n")
        files += 1
        total += n
        print(f"{n:4d}  {path.relative_to(ROOT)}")
    print(f"\nRewrote {total} sites in {files} files", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
