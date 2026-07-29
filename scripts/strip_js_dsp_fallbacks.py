#!/usr/bin/env python3
"""
Strip pure-JS DSP fallbacks (SampleJs) from native-backed worklet evaluators.

For each *-worklet-evaluator.js that falls back via this.xxxSampleJs:
  - Remove prototype.xxxSampleJs = function ... bodies (brace-safe)
  - Replace `return this.xxxSampleJs(...)` with silence / dry-passthrough
  - Also strip SampleJs methods in node-live-audio-worklet-core.js
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULES = ROOT / "public" / "modules"
CORE = ROOT / "public" / "node-live-audio-worklet-core.js"


def find_matching_brace(text: str, open_idx: int) -> int:
    """Match `{` at open_idx, skipping strings and // /* comments (apostrophes in comments!)."""
    depth = 0
    i = open_idx
    in_s = in_d = in_t = False
    escape = False
    n = len(text)
    while i < n:
        ch = text[i]
        if escape:
            escape = False
            i += 1
            continue
        if ch == "\\" and (in_s or in_d or in_t):
            escape = True
            i += 1
            continue
        if in_s:
            if ch == "'":
                in_s = False
            i += 1
            continue
        if in_d:
            if ch == '"':
                in_d = False
            i += 1
            continue
        if in_t:
            if ch == "`":
                in_t = False
            i += 1
            continue
        # line comment
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            nl = text.find("\n", i)
            i = n if nl < 0 else nl + 1
            continue
        # block comment
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        if ch == "'":
            in_s = True
        elif ch == '"':
            in_d = True
        elif ch == "`":
            in_t = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def find_function_body_open(text: str, fn_keyword_end: int) -> int:
    """
    After 'function name', find the '{' that opens the function body.
    Skips default-arg braces like options = {}.
    Strategy: find matching ')' of parameter list starting at first '(' after fn keyword.
    """
    paren = text.find("(", fn_keyword_end)
    if paren < 0:
        return -1
    depth = 0
    i = paren
    in_s = in_d = in_t = False
    escape = False
    while i < len(text):
        ch = text[i]
        if escape:
            escape = False
            i += 1
            continue
        if ch == "\\" and (in_s or in_d or in_t):
            escape = True
            i += 1
            continue
        if in_s:
            if ch == "'":
                in_s = False
            i += 1
            continue
        if in_d:
            if ch == '"':
                in_d = False
            i += 1
            continue
        if in_t:
            if ch == "`":
                in_t = False
            i += 1
            continue
        if ch == "'":
            in_s = True
        elif ch == '"':
            in_d = True
        elif ch == "`":
            in_t = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                # body brace after optional whitespace / default junk is just ` {`
                j = i + 1
                while j < len(text) and text[j] in " \t\r\n":
                    j += 1
                if j < len(text) and text[j] == "{":
                    return j
                return -1
        i += 1
    return -1


def extract_proto_method(text: str, name: str) -> tuple[int, int] | None:
    pat = re.compile(
        rf"NodeLiveAudioProcessor\.prototype\.{re.escape(name)}\s*=\s*function\b"
    )
    m = pat.search(text)
    if not m:
        return None
    start = m.start()
    brace = find_function_body_open(text, m.end())
    if brace < 0:
        return None
    end_brace = find_matching_brace(text, brace)
    if end_brace < 0:
        return None
    end = end_brace + 1
    while end < len(text) and text[end] in " \t":
        end += 1
    if end < len(text) and text[end] == ";":
        end += 1
    while end < len(text) and text[end] in "\r\n":
        end += 1
    # one extra blank line
    if end < len(text) and text[end] == "\n":
        end += 1
    return start, end


def extract_core_method(text: str, name: str) -> tuple[int, int] | None:
    pat = re.compile(rf"^([ \t]*){re.escape(name)}\s*\(", re.M)
    m = pat.search(text)
    if not m:
        return None
    # find body open after params
    brace = find_function_body_open(text, m.start())
    if brace < 0:
        # class methods: name(a, b) {  — find_function_body_open needs 'function' end;
        # reuse paren scan from m.start()
        paren = text.find("(", m.start())
        if paren < 0:
            return None
        depth = 0
        i = paren
        while i < len(text):
            if text[i] == "(":
                depth += 1
            elif text[i] == ")":
                depth -= 1
                if depth == 0:
                    j = i + 1
                    while j < len(text) and text[j] in " \t\r\n":
                        j += 1
                    if j < len(text) and text[j] == "{":
                        brace = j
                    break
            i += 1
    if brace is None or brace < 0:
        return None
    end_brace = find_matching_brace(text, brace)
    if end_brace < 0:
        return None
    end = end_brace + 1
    while end < len(text) and text[end] in "\r\n":
        end += 1
    return m.start(), end


def top_level_object_keys(obj_inner: str) -> list[str]:
    """Extract property keys from object literal body, ignoring nested () and {}."""
    keys: list[str] = []
    depth_brace = depth_paren = depth_bracket = 0
    i = 0
    # scan for `key:` at depth 0
    token_start = 0
    n = len(obj_inner)
    while i < n:
        ch = obj_inner[i]
        if ch == "{":
            depth_brace += 1
        elif ch == "}":
            depth_brace = max(0, depth_brace - 1)
        elif ch == "(":
            depth_paren += 1
        elif ch == ")":
            depth_paren = max(0, depth_paren - 1)
        elif ch == "[":
            depth_bracket += 1
        elif ch == "]":
            depth_bracket = max(0, depth_bracket - 1)
        elif ch == ":" and depth_brace == depth_paren == depth_bracket == 0:
            # key is text from last comma/start to here
            key_region = obj_inner[token_start:i].strip()
            # last identifier or quoted string in region
            m = re.search(r"[\"']([^\"']+)[\"']\s*$", key_region)
            if m:
                keys.append(m.group(1))
            else:
                m2 = re.search(r"([\w$]+)\s*$", key_region)
                if m2:
                    keys.append(m2.group(1))
        elif ch == "," and depth_brace == depth_paren == depth_bracket == 0:
            token_start = i + 1
        i += 1
    return keys


def silence_object(keys: list[str]) -> str:
    parts = []
    for k in keys:
        if re.match(r"^[\w$]+$", k):
            parts.append(f"{k}: 0")
        else:
            parts.append(f'"{k}": 0')
    return "{ " + ", ".join(parts) + " }"


def infer_silence(sample_js_body: str, call_args: str, native_returns: list[str]) -> str:
    args = [a.strip() for a in call_args.split(",") if a.strip()]
    # Filter-like: second arg is input / signalIn
    if len(args) >= 2 and args[1] in ("input", "signalIn", "signal", "dry"):
        arg = args[1]
        # Multi-out modules pass signalIn but return objects — prefer object if present
        pass  # fall through; object check below may win
        filter_passthrough = (
            f"this.safeFilterNumber({arg}, state) ?? 0"
            if args and "state" in args[0]
            else f"Number({arg}) || 0"
        )
    else:
        filter_passthrough = None

    # Prefer object returns from SampleJs or native sample method
    for blob in (sample_js_body, "\n".join(reversed(native_returns))):
        # multiline return { ... };
        for m in re.finditer(r"return\s*\{", blob):
            open_idx = m.end() - 1
            close = find_matching_brace(blob, open_idx)
            if close < 0:
                continue
            inner = blob[open_idx + 1 : close]
            keys = top_level_object_keys(inner)
            if keys:
                return silence_object(keys)

    if filter_passthrough:
        return filter_passthrough
    return "0"


def process_worklet_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if "SampleJs" not in text:
        return False
    original = text

    defined = set(re.findall(r"prototype\.(\w+SampleJs)\s*=\s*function", text))
    called = set(re.findall(r"this\.(\w+SampleJs)\s*\(", text))
    names = defined | called
    if not names:
        return False

    silence_map: dict[str, str] = {}
    for name in names:
        span = extract_proto_method(text, name)
        body = text[span[0] : span[1]] if span else ""
        call_m = re.search(rf"return this\.{re.escape(name)}\s*\(([^)]*)\)", text)
        call_args = call_m.group(1) if call_m else ""
        # native returns from sibling Sample function
        base = name
        if name.endswith("SampleJs"):
            base = name[: -len("Js")]
        sample_span = extract_proto_method(text, base)
        native_returns: list[str] = []
        if sample_span:
            sample_body = text[sample_span[0] : sample_span[1]]
            native_returns = re.findall(r"return\s+(\{[^;]*\}|[^;]+);", sample_body)
        silence_map[name] = infer_silence(body, call_args, native_returns)

    for name, silence in silence_map.items():
        # Bare call, or call scaled by a trailing expression (e.g. * level).
        text = re.sub(
            rf"return this\.{re.escape(name)}\s*\([^;]*\)(?:\s*[\/*+-]\s*[^;]+)?;",
            f"return {silence};",
            text,
        )

    # Remove definitions (longest names first)
    for name in sorted(defined, key=len, reverse=True):
        # loop in case of duplicates
        for _ in range(5):
            span = extract_proto_method(text, name)
            if not span:
                break
            text = text[: span[0]] + text[span[1] :]

    text = re.sub(r"\n{3,}", "\n\n", text)
    if text != original:
        path.write_text(text, encoding="utf-8", newline="\n")
        return True
    return False


def process_core_file() -> bool:
    text = CORE.read_text(encoding="utf-8")
    original = text
    core_js = [
        ("yellowjacketFilterSampleJs", "this.safeFilterNumber(input, state) ?? 0"),
        ("superloveFilterSampleJs", "this.safeFilterNumber(input, state) ?? 0"),
        ("chaoticPhaseLockingFilterSampleJs", "this.safeFilterNumber(input, state) ?? 0"),
        ("resonatorFilterSampleJs", "this.safeFilterNumber(input, state) ?? 0"),
        ("humanFilterSampleJs", "this.safeFilterNumber(input, state) ?? 0"),
        ("archimedesSampleJs", "0"),
    ]
    for name, silence in core_js:
        text = re.sub(
            rf"return this\.{re.escape(name)}\s*\([^;]*\);",
            f"return {silence};",
            text,
        )
        for _ in range(3):
            span = extract_core_method(text, name)
            if not span:
                break
            text = text[: span[0]] + text[span[1] :]

    text = re.sub(r"\n{3,}", "\n\n", text)
    if text != original:
        CORE.write_text(text, encoding="utf-8", newline="\n")
        return True
    return False


def main() -> int:
    changed = []
    for path in sorted(MODULES.rglob("*-worklet-evaluator.js")):
        try:
            if process_worklet_file(path):
                changed.append(str(path.relative_to(ROOT)))
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR {path}: {exc}", file=sys.stderr)
            return 1
    if process_core_file():
        changed.append(str(CORE.relative_to(ROOT)))
    print(f"Updated {len(changed)} files")
    for c in changed:
        print(f"  {c}")
    # sanity: leftover SampleJs fallback calls or definitions
    bad = []
    for path in MODULES.rglob("*-worklet-evaluator.js"):
        t = path.read_text(encoding="utf-8")
        if re.search(r"this\.\w+SampleJs\s*\(", t):
            bad.append(f"CALL {path}")
        if re.search(r"prototype\.\w+SampleJs\s*=", t):
            bad.append(f"DEF {path}")
    if bad:
        print("SANITY ISSUES:")
        for b in bad:
            print(f"  {b}")
        return 2
    print("Sanity OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
