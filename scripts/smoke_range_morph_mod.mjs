// Prove Range Out magnitude decides unit-band vs domain-add Morph MOD.
// |v|≤1 → unit-band (Morph can move). |v|>1 → domain-add (Morph pegs after clamp).
function mapRange(input, inLow, inHigh, outLow, outHigh) {
  const den = inHigh - inLow;
  if (Math.abs(den) < 1e-30) return outLow;
  return outLow + ((input - inLow) / den) * (outHigh - outLow);
}

function classify(v) {
  return Math.abs(v) <= 1 ? "unit" : "domain";
}

function morphAfterMod(base, rangeOut) {
  let unitAdd = 0;
  let domainAdd = 0;
  if (rangeOut > 1 || rangeOut < -1) domainAdd += rangeOut;
  else unitAdd += rangeOut;
  const minV = 0;
  const maxV = 1;
  const range = maxV - minV;
  let result = base + domainAdd;
  if (unitAdd !== 0) {
    const baseUnit = (base - minV) / range;
    result = minV + (baseUnit + unitAdd) * range + domainAdd;
  }
  if (result < 0) result = 0;
  if (result > 1) result = 1;
  return result;
}

const knobs = [0, 0.25, 0.5, 0.75, 1];

// Broken defaults (−10…+10, in −1…1): Morph pegs after a tiny knob move
{
  const base = 0.5;
  const outs = knobs.map((k) => mapRange(k, -1, 1, -10, 10));
  const morphs = outs.map((o) => morphAfterMod(base, o));
  console.log("old −10…+10 outs ", outs.map((x) => x.toFixed(2)).join(", "));
  console.log("old −10…+10 morph", morphs.map((x) => x.toFixed(3)).join(", "));
  // knob 0 → out 0 (unit, morph stays); anything else domain-pegs to 1
  if (morphs[0] !== 0.5) throw new Error("expected rest morph 0.5 at knob 0");
  if (!morphs.slice(1).every((m) => m === 1)) {
    throw new Error("expected old path to peg Morph at 1 for knob>0");
  }
}

// Fixed defaults (in/out 0…1): with Morph base 0, full sweep
{
  const base = 0;
  const outs = knobs.map((k) => mapRange(k, 0, 1, 0, 1));
  const morphs = outs.map((o) => morphAfterMod(base, o));
  console.log("new 0…1 outs  ", outs.map((x) => x.toFixed(3)).join(", "));
  console.log("new 0…1 morph ", morphs.map((x) => x.toFixed(3)).join(", "));
  console.log("new classes   ", outs.map(classify).join(", "));
  if (outs.some((o) => classify(o) !== "unit")) {
    throw new Error("expected all 0…1 Range outs to be unit-band");
  }
  const spread = Math.max(...morphs) - Math.min(...morphs);
  if (!(spread > 0.9)) {
    throw new Error(`expected full Morph sweep with base 0, spread=${spread}`);
  }
  if (Math.abs(morphs[0] - 0) > 1e-9 || Math.abs(morphs[4] - 1) > 1e-9) {
    throw new Error("expected morph 0 at knob 0 and 1 at knob 1");
  }
}

console.log("smoke_range_morph_mod OK");
