import math


def clamp01(v, fb=0):
    try:
        n = float(v)
    except Exception:
        return max(0, min(1, fb))
    return max(0, min(1, n))


def pureGhostKeep(g):
    g = clamp01(g)
    if g <= 0.0005:
        return 0
    aggressive = g ** 0.55
    sticky = 1 - (1 - g) ** 2.8 * 0.012
    w = g * g
    return max(0, min(0.99975, aggressive * (1 - w) + sticky * w))


def resolveTrailBlend(t):
    t = clamp01(t)
    if t <= 0.5:
        u = t / 0.5
        lw = 0.5 * u
        return 1 - lw, lw, 0
    if t <= 0.75:
        u = (t - 0.5) / 0.25
        lw = 0.5 + 0.5 * u
        return 1 - lw, lw, 0
    u = (t - 0.75) / 0.25
    return 0, 1 - u, u


def residualKeep(trail, ghost):
    gw, lw, fr = resolveTrailBlend(trail)
    if fr >= 0.999:
        return 1
    gKeep = pureGhostKeep(ghost)
    lKeep = 0.94
    mixed = gw * gKeep + lw * lKeep
    if lw > 0.001:
        linearPull = 1 - (1 - lKeep) * min(1, lw * 2.5)
        mixed = min(mixed, linearPull)
    return min(1, fr + (1 - fr) * mixed)


for g in [0, 0.001, 0.0027, 0.05, 0.45, 0.9]:
    print("ghost", g, "keep", round(pureGhostKeep(g), 4))

for t, g in [(0, 0.0027), (0.1, 0.0027), (0.5, 0.0027), (0.1, 0.45), (0, 0)]:
    k = residualKeep(t, g)
    if 0 < k < 1:
        frames = math.log(0.01) / math.log(k)
    else:
        frames = float("inf")
    print(f"trail={t} ghost={g} keep={k:.4f} frames_to_1pct≈{frames:.1f}")
