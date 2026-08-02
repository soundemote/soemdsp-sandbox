function createNodeGraphChordMemoryState() {
  return {
    latchWasHigh: false,
    clearWasHigh: false,
    advanceWasHigh: false,
    writeIndex: 0,
    arpIndex: 0,
    slots: [0, 0, 0, 0],
    slotsActive: [false, false, false, false],
    // Shuffle-bag remaining indices (slot indices).
    bag: [],
    lastArpPitch: 0,
  };
}

function nodeGraphChordMemoryActiveIndices(state) {
  const activeIndices = [];
  for (let i = 0; i < 4; i += 1) {
    if (state.slotsActive[i]) {
      activeIndices.push(i);
    }
  }
  return activeIndices;
}

function nodeGraphChordMemoryRefillBag(state, activeIndices) {
  const bag = activeIndices.slice();
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  state.bag = bag;
}

// Records a chord one note at a time from a mono Pitch input. Advance walks
// active slots. Walk modes avoid dumb endless up-stairs:
//   0 Order   — latch order (original)
//   1 Bag     — shuffle without repeat until bag empties, then reshuffle
//   2 Mutate  — usually next in order, sometimes jump / swap bag memory
// leap: chance to jump to a random active slot (or +octave decoration)
// octaves: extra octave jumps on leap (0–3)
function nodeGraphChordMemorySample(state, options = {}) {
  const latchHigh = Number(options.latch) > 0;
  const clearHigh = Number(options.clear) > 0;
  const advanceHigh = Number(options.advance) > 0;
  const pitch = Number(options.pitch) || 0;
  const walk = Math.max(0, Math.min(2, Math.round(Number(options.walk) || 0)));
  const leap = Math.max(0, Math.min(1, Number(options.leap) || 0));
  const octaves = Math.max(0, Math.min(3, Math.round(Number(options.octaves) || 0)));
  const mutate = Math.max(0, Math.min(1, Number(options.mutate) || 0.2));

  if (clearHigh && !state.clearWasHigh) {
    state.slots = [0, 0, 0, 0];
    state.slotsActive = [false, false, false, false];
    state.writeIndex = 0;
    state.arpIndex = 0;
    state.bag = [];
    state.lastArpPitch = 0;
  }
  state.clearWasHigh = clearHigh;

  if (latchHigh && !state.latchWasHigh) {
    state.slots[state.writeIndex] = pitch;
    state.slotsActive[state.writeIndex] = true;
    state.writeIndex = (state.writeIndex + 1) % 4;
    state.bag = []; // invalidate bag when chord changes
  }
  state.latchWasHigh = latchHigh;

  const activeIndices = nodeGraphChordMemoryActiveIndices(state);
  let trigger = 0;
  let octaveShift = 0;

  if (advanceHigh && !state.advanceWasHigh && activeIndices.length > 0) {
    trigger = 1;
    const doLeap = Math.random() < leap;

    if (walk === 1) {
      // Shuffle bag — no repeat until exhausted.
      if (!state.bag.length) {
        nodeGraphChordMemoryRefillBag(state, activeIndices);
      }
      // Drop bag entries that are no longer active.
      state.bag = state.bag.filter((idx) => state.slotsActive[idx]);
      if (!state.bag.length) {
        nodeGraphChordMemoryRefillBag(state, activeIndices);
      }
      if (doLeap && state.bag.length > 1) {
        const ri = Math.floor(Math.random() * state.bag.length);
        state.arpIndex = state.bag[ri];
        state.bag.splice(ri, 1);
      } else {
        state.arpIndex = state.bag.shift();
      }
    } else if (walk === 2) {
      // Mutate: usually sequential, sometimes random / skip.
      const currentPos = activeIndices.indexOf(state.arpIndex);
      let nextPos = currentPos === -1 ? 0 : (currentPos + 1) % activeIndices.length;
      if (doLeap || Math.random() < mutate) {
        nextPos = Math.floor(Math.random() * activeIndices.length);
      }
      state.arpIndex = activeIndices[nextPos];
    } else {
      // Order (default).
      if (doLeap) {
        state.arpIndex = activeIndices[Math.floor(Math.random() * activeIndices.length)];
      } else {
        const currentPos = activeIndices.indexOf(state.arpIndex);
        const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % activeIndices.length;
        state.arpIndex = activeIndices[nextPos];
      }
    }

    if (doLeap && octaves > 0 && Math.random() < 0.55) {
      octaveShift = (1 + Math.floor(Math.random() * octaves)) * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  state.advanceWasHigh = advanceHigh;

  let arp = activeIndices.length > 0 ? state.slots[state.arpIndex] : 0;
  if (octaveShift !== 0) {
    arp = (Number(arp) || 0) + octaveShift * (12 / 120);
  }
  if (activeIndices.length > 0) {
    state.lastArpPitch = arp;
  }
  const gate = activeIndices.length > 0 ? 1 : 0;

  return {
    "Note 1": state.slots[0],
    "Note 2": state.slots[1],
    "Note 3": state.slots[2],
    "Note 4": state.slots[3],
    Arp: arp,
    Gate: gate,
    Trigger: trigger,
  };
}
