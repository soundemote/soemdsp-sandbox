from pathlib import Path
import re

p = Path(__file__).resolve().parents[1] / "scripts" / "smoke_graph_arp.mjs"
t = p.read_text(encoding="utf-8")
t2 = re.sub(r"(arpSample\([^;\n]+),\s*SR\)", r"\1, 0, SR)", t)
t2 = re.sub(r"(arpSample\([^;\n]+),\s*(48000|44100)\)", r"\1, 0, \2)", t2)
t2 = t2.replace(
  "// sample(h, held, hasHeld, trig, hasTrig, reset, rate, mode, steps, seed, sr)",
  "// sample(h, held, hasHeld, trig, hasTrig, reset, rate, mode, steps, seed, octaveOffset, sr)",
)
marker = '  console.log(`arp kernel ok pitches=${pitches.join(",")}`);\n}\n'
insert = '''  console.log(`arp kernel ok pitches=${pitches.join(",")}`);
}

// Octave Offset +1 raises MIDI by 12
{
  const h = arpCreate() | 0;
  const mask = (1 << 0) | (1 << 4) | (1 << 7);
  const tick = (rising) => {
    if (!rising) return arpSample(h, mask, 1, 0, 1, 0, 0, 0, 8, 1, 1, SR);
    arpSample(h, mask, 1, 0, 1, 0, 0, 0, 8, 1, 1, SR);
    return arpSample(h, mask, 1, 1, 1, 0, 0, 0, 8, 1, 1, SR);
  };
  const pitches = [];
  for (let i = 0; i < 3; i++) pitches.push(Math.round(tick(true) * 120));
  const expect = [36, 40, 43];
  for (let i = 0; i < expect.length; i++) {
    if (pitches[i] !== expect[i]) {
      throw new Error(`arp octave+1 pitches ${pitches.join(",")} != ${expect.join(",")}`);
    }
  }
  arpDestroy(h);
  console.log(`arp octaveOffset+1 ok pitches=${pitches.join(",")}`);
}
'''
if marker not in t2:
  raise SystemExit(f"marker missing; count={t2.count('arp kernel ok')}")
if "arp octaveOffset+1" not in t2:
  t2 = t2.replace(marker, insert, 1)
p.write_text(t2, encoding="utf-8")
print("ok calls_with_zero_octave", t2.count(", 0, SR)"))
