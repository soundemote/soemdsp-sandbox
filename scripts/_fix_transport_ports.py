from pathlib import Path

root = Path(__file__).resolve().parents[1] / "patches"
for p in root.glob("*.json"):
  t = p.read_text(encoding="utf-8")
  n = t.replace('"sourcePort": "0..1"', '"sourcePort": "Gate Uni"')
  n = n.replace('"sourcePort": "-1..1"', '"sourcePort": "Gate Bi"')
  if n != t:
    p.write_text(n, encoding="utf-8")
    print("updated", p.name)
