# Interaction Polish Implementation Plan

**Goal:** Audit the existing interface and improve evidence-backed gallery, dialog and motion usability without another redesign.
**Architecture:** Preserve React/Vite, Embla, Radix, Motion, existing Cal Sans and semantic Blue/Ink/Paper tokens. No new dependencies. No automatic deployment or commit in this pass.
**Spec:** docs/REDESIGN_SPEC.md; user-requested comprehensive interface audit.

## Tasks
- [x] Audit public Ikman/Riyasewana browsing content and shared MotorMila interaction code; record verified findings separately from unperformed visual checks.
- [x] Add focused regression tests for gallery keyboard scoping and photo control semantics; confirm failures.
- [x] Scope gallery arrow navigation to its own region, preserve nested controls, use live reduced-motion/low-data preferences, enlarge dot targets and replace incomplete thumbnail-tab semantics with pressed buttons.
- [x] Bound shared dialogs to the viewport with contained vertical scrolling and safe margins; preserve Radix focus/dismissal behavior.
- [x] Run gallery tests and existing listing tests plus typecheck; inspect final diff; reuse healthy preview.

## Additional completed finding
Combobox closed-Enter selection and Escape focus recovery reproduced with two failing tests, then repaired. Final verification: 23 focused tests, typecheck, targeted ESLint and diff whitespace checks passed. Existing React act warnings remain in mocked detail tests. No rendered browser/device certification performed.

## Review focus
- Arrow keys in unrelated sliders/selects must not change gallery photos.
- Reduced motion and low-data changes apply without a page reload.
- Long photo sets remain usable without overlapping hit targets.
- Small screens and long dialogs retain access to close controls.
- No claim of full visual/device coverage without actual browser review.
