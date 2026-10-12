# ART-02 — checkpoint A

Run: auto-ART-02-20261012172128-73c3b1d8. Saved: 2026-10-12T17:33:24Z.

Only source scripts are saved here. Published runtime is still 0.3.0-preview.1. No new binary is integrated or deployed.

- Original alpha-card hair, cloth tension/folds, yoke and grip/gesture revisions are in the character generator. Python compilation passes. Native visual acceptance is in progress; earlier rendered shortcomings triggered further edits.
- Budget tool implements real atlas baking, top-four weight normalization and transfer to 60 retained bones, plus two decimated LOD exports. An independent old-source run produced L0 34,462 / L1 14,469 triangles and 2 materials, and sampled pose transfer max error 0.000000958 m. These are preliminary sample measurements, not the final new character results.
- Inspection-render helper is saved. New source build, final budget build, GLB/weight checks, native viewer/animation/fault/touch/save regressions and deployment have NOT passed yet.

Next concrete action: finish rendered lookdev correction, freeze the raw .blend, then run the budget exporter on that exact source. Add combat-only initial loading and a lazy, persistent-context close-up viewer. Validate final binaries and browser behavior before integration.

D2R/D4 commercial art quality remains unmet; real-device performance and user acceptance are untested. No quota state was queried.
