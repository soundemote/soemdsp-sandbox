# B-065 - Multi-wire portal action creates duplicate portals instead of one Portal In / multiple Portal Outs

Report ID: B-065  
Status: open  
Severity: see  
Source: user 2026-09-28  
Related: Portal IO; B-052 (Portal Out rename to ChordKeys); B-053 (Catalog Portal In/Out replaced by linked Portal IO)

## User symptom

Making a portal on multiple wires creates multiple portals for the same signal instead of one Portal In and multiple Portal Outs.

## Repro

1. Use one signal with multiple wires or destinations.
2. Invoke the action to make a portal on multiple wires.
3. Observe that the same signal receives multiple portal instances.

## Expected behavior

The action creates one shared Portal In for the signal and the required Portal Outs for its destinations, without duplicating the source portal per wire.

## Investigation / fix shape

- Trace the multi-wire portal action selection grouping and portal identity/reuse logic.
- Group wires carrying the same signal, reuse one Portal In, and create only the necessary Portal Outs.
- Keep unrelated signals in distinct portal groups.
- This report is docs-only; no code fix is included.