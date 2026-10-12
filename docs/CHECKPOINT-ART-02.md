# ART-02 — checkpoint A

Run: auto-ART-02-20261012172128-73c3b1d8. Saved: 2026-10-12T17:33:24Z.

Only source scripts are saved here. Published runtime is still 0.3.0-preview.1. No new binary is integrated or deployed.

- Original alpha-card hair, cloth tension/folds, yoke and grip/gesture revisions are in the character generator. Python compilation passes. Native visual acceptance is in progress; earlier rendered shortcomings triggered further edits.
- Budget tool implements real atlas baking, top-four weight normalization and transfer to 60 retained bones, plus two decimated LOD exports. An independent old-source run produced L0 34,462 / L1 14,469 triangles and 2 materials, and sampled pose transfer max error 0.000000958 m. These are preliminary sample measurements, not the final new character results.
- Inspection-render helper is saved. New source build, final budget build, GLB/weight checks, native viewer/animation/fault/touch/save regressions and deployment have NOT passed yet.

Next concrete action: finish rendered lookdev correction, freeze the raw .blend, then run the budget exporter on that exact source. Add combat-only initial loading and a lazy, persistent-context close-up viewer. Validate final binaries and browser behavior before integration.

D2R/D4 commercial art quality remains unmet; real-device performance and user acceptance are untested. No quota state was queried.

## Checkpoint B — 2026-10-12T17:37:25Z

Latest generator and budget source plus combat-only initial loader and lazy persistent-context viewer are saved. JS syntax passes for hero and mage-preview. Loading/retry UI is present. This source candidate is not playable as a complete new build until final combat GLB arrives; runtime has not been browser-tested, published, or accepted. The raw lookdev source was frozen (45,710 triangles, 163 bones, 10 materials) for final budget export. Remaining native lookdev gaps: side scalp silhouette, skin/eyebrow polish, cloth-fold subtlety. These are finite ART-02 results, not commercial-art acceptance.

Next: final atlas-baked high/combat files and actual budget report; verify both binaries/weights, new viewer lifecycle and GPU/context reuse with browser tests, desktop/touch/save regression; review before integration.
