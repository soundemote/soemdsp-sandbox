# B-067 - Bottom lip leaves less than 2 px clearance

Report ID: B-067  
Status: open  
Severity: see  
Source: user 2026-09-28  
Related: B-057 (hide-unused bottom-lip recalculation); B-064 (hidden-title module geometry / Text Box background overflow)

## User symptom

Bottom-lip geometry can leave less than the required **2 px** of clearance between the last rendered element and the bottom lip. The error appears related to whether the module title is hidden: title-hidden layout can produce a different last-element/bottom-lip relationship than title-visible layout. This is a remaining bottom-lip calculation issue related to B-057, even after the hide-unused height path was corrected; compare with the hidden-title geometry described in B-064.

## Repro

1. Open a module/layout state where the last visible control or I/O is close to the bottom lip.
2. Compare the measured gap from the last element's rendered edge to the bottom-lip boundary.
3. Repeat with the module title visible and hidden, keeping the module content and sizing otherwise unchanged.
4. Observe whether the title-hidden state produces less than 2 px of clearance.

## Expected behavior

The gap between the last element and the bottom lip must be at least 2 px. If the calculated geometry cannot provide that clearance, the bottom lip must be placed **1 GU lower** rather than leaving a sub-2 px gap.

## Investigation / fix shape

- Audit the bottom-lip calculation after the last visible element, including title-visible/title-hidden, hide-unused, and zoom/scaling paths.
- Compare the title-hidden layout/reflow path with the title-visible path; verify that removing the title track does not shift the last element or lip calculation incorrectly.
- Enforce the 2 px minimum clearance using rendered/pixel geometry, not only nominal GU totals.
- When the minimum is not met, lower the bottom lip by 1 GU.
- Recheck B-057 scenarios to ensure the correction does not restore an oversized unused lip.
- Cross-check B-064's hidden-title geometry findings so the bottom-lip fix does not mask or recreate the title-hidden background/layout issue.
- This report is docs-only; no code fix is included.
