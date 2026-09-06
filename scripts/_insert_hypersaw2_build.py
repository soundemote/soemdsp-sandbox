from pathlib import Path

p = Path(__file__).resolve().parents[1] / "scripts" / "build_native_modules.ps1"
t = p.read_text(encoding="utf-8")
if 'Name = "hypersaw2"' in t:
  print("already has hypersaw2")
  raise SystemExit(0)
idx = t.find('@{ Name = "hypersaw";')
if idx < 0:
  raise SystemExit("hypersaw not found")
end = t.find("\n  @{ Name =", idx + 10)
if end < 0:
  raise SystemExit("next module not found")
block = (
  '  @{ Name = "hypersaw2"; Simd = $false; Exports = @('
  '"soemdsp_hypersaw2_create", "soemdsp_hypersaw2_destroy", "soemdsp_hypersaw2_reset", '
  '"soemdsp_hypersaw2_sample", "soemdsp_hypersaw2_left", "soemdsp_hypersaw2_right", '
  '"soemdsp_hypersaw2_voice_phase", "soemdsp_hypersaw2_voice_count", '
  '"soemdsp_hypersaw2_voice_last_frac", "soemdsp_hypersaw2_max_voices", '
  '"soemdsp_hypersaw2_version") }\n'
)
t = t[:end] + "\n" + block + t[end:]
p.write_text(t, encoding="utf-8")
print("inserted hypersaw2 build entry at", end)
