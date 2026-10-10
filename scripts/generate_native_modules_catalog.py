"""Regenerate public/native-modules-catalog.json — a static fallback for the
"/api/native-modules" endpoint, used when the sandbox runs without server.py
behind it (e.g. embedded as a static export on soundemote-io). Mirrors the
scan logic in server.py's native_module_entry_from_source/serve_native_modules
exactly; wasmUrl is a relative path so it resolves correctly regardless of
what subdirectory the sandbox is mounted under.

Run this after adding/changing a native module, before syncing to a static
host.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NATIVE_MODULES = ROOT / "native_modules"
OUTPUT = ROOT / "public" / "native-modules-catalog.json"

NATIVE_MODULE_HEADER_RE = re.compile(
    r"^\s*//\s*soemdsp-native-([a-zA-Z0-9_-]+)\s*:\s*(.*?)\s*$"
)

SANDBOX_LICENSE = "Soundemote Noncommercial"
SANDBOX_LICENSE_URL = (
    "https://github.com/soundemote/soemdsp-sandbox/blob/master/LICENSE"
)
NOTICE_URL = (
    "https://github.com/soundemote/soemdsp-sandbox/blob/master/docs/THIRD_PARTY.md"
)
SOEMDSP_LICENSE_URL = (
    "https://github.com/soundemote/soemdsp/blob/main/LICENSE"
)


def license_fields_for_module(headers: dict[str, str], lib_url: str, module_name: str) -> dict[str, str]:
    """Short Module Settings labels + links. Header keys override URL-derived defaults."""
    license_label = headers.get("license") or SANDBOX_LICENSE
    license_url = headers.get("license-url") or SANDBOX_LICENSE_URL
    upstream = headers.get("upstream-license") or ""
    upstream_url = headers.get("upstream-license-url") or ""
    if not upstream and lib_url:
        if "soundemote/soemdsp/" in lib_url:
            upstream = "MIT"
            upstream_url = upstream_url or SOEMDSP_LICENSE_URL
        elif "RobinSchmidt/RS-MET" in lib_url:
            upstream = "RS-MET (permission)"
            upstream_url = upstream_url or f"{NOTICE_URL}#rs-met"
        elif "soemdsp-sandbox" in lib_url and "originalcode" in lib_url:
            anchor = module_name.replace("_", "-")
            upstream = "See notice"
            upstream_url = upstream_url or f"{NOTICE_URL}#{anchor}"
    return {
        "license": license_label,
        "licenseUrl": license_url,
        "upstreamLicense": upstream,
        "upstreamLicenseUrl": upstream_url,
        "noticeUrl": NOTICE_URL,
    }


def native_module_entry_from_source(source_path: Path) -> dict[str, object] | None:
    headers: dict[str, str] = {}
    try:
        for line in source_path.read_text(encoding="utf-8").splitlines()[:48]:
            match = NATIVE_MODULE_HEADER_RE.match(line)
            if match:
                headers[match.group(1).lower()] = match.group(2).strip()
    except OSError:
        return None
    name = headers.get("module") or headers.get("name") or source_path.parent.name
    target_type = headers.get("target") or name
    label = headers.get("label") or name
    wasm_path = source_path.with_suffix(".wasm")
    relative_source = source_path.relative_to(ROOT).as_posix()
    relative_wasm = wasm_path.relative_to(ROOT).as_posix()
    lib_url = headers.get("lib") or ""
    entry: dict[str, object] = {
        "name": name,
        "label": label,
        "targetType": target_type,
        "kind": headers.get("kind") or "",
        "source": relative_source,
        "sourceUrl": f"https://github.com/soundemote/soemdsp-sandbox/blob/master/{relative_source}",
        "localSourceUrl": f"/{relative_source}",
        "libUrl": lib_url,
        "wasm": relative_wasm,
        "wasmUrl": relative_wasm,
        "wasmAvailable": wasm_path.exists(),
    }
    entry.update(license_fields_for_module(headers, lib_url, name))
    return entry


def main() -> None:
    modules = []
    if NATIVE_MODULES.exists():
        for source_path in sorted(NATIVE_MODULES.glob("*/*.cpp")):
            # Canonical layout is <name>/<name>.cpp — skip sibling helpers
            # (e.g. soem_reverb/stub_test.cpp) and the combined/ tree.
            if source_path.parent.name == "combined":
                continue
            if source_path.stem != source_path.parent.name:
                continue
            entry = native_module_entry_from_source(source_path)
            if entry:
                modules.append(entry)
    payload = json.dumps({"ok": True, "modules": modules}, indent=2) + "\n"
    OUTPUT.write_text(payload, encoding="utf-8", newline="\n")
    print(f"Wrote {len(modules)} module entries to {OUTPUT}")


if __name__ == "__main__":
    main()
