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

## Checkpoint C — 2026-10-12T17:44:52Z

Final budgeted binaries, SHA-matched statistics, 15-sample full per-part budget report and frozen raw studio evidence are saved. Native browser tests are running; this candidate remains unintegrated.

- L0: 34,451 triangles, 4,676,752 bytes, SHA256 e7e16babefac9fac546739721a885c140b68910ae7672edee6ba498e30b4b2f3.
- L1: 14,713 triangles, 3,852,640 bytes, SHA256 79db8bce51b85f97331226e1fc60bcf059c595038326fa4bfb7b8390bae1dfaa.
- Both: 60 joints, 1 glTF mesh / 2 primitives, 2 atlas materials, 4 embedded PBR maps, Idle/Walk/Cast and face_focus. Runtime Three.js expands two primitives into two skinned meshes.
- npm run check passes: eight JS module syntax checks, both LOD/source hashes/top-four normalized skin/budgets/animation parity plus legacy GLB checks, 61 save tests.
- Rig transfer max sampled error 0.0000007685 m. L1 face/hand sampled surface error 1.338 mm, entire bounds max4.814 mm. These are not whole-character surface limits: cloth-tail local sampled error reaches58.1 mm in L1 and16.6 mm in L0.
- Preview preserves rotation on detail replacement and refreshes face anchor when reframing. Initialization failure remains closable. Lifecycle/context/GPU/touch/native rendering acceptance still pending.

This run delivers bounded ART-02 A/B/C steps only. ART-02 remains in_progress because production-quality surface sculpt/bake, facial/scalp/cloth polish and user art acceptance are unmet. Next finite step after a verified preview publication is ART-02 D: refine scalp/hair integration, face UV/detail and skin roughness, and cloth surface/folds/wear with actual high-to-low normal bake; do not skip to ART-03 or D1 while this art feedback is unresolved.
