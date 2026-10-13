# ART-02 D1 — cloth surface checkpoint

Run auto-ART-02-D1-20261013032228-df3abdbf; saved 2026-10-13T03:27:17Z. Current published 3D remains0.3.0-preview.2; independent 2D v0.3 stays untouched.

First saved change: source-only generator mode rebuilds the editable complete rig, packs referenced images, saves SHA/count receipt, and leaves published GLBs/statistics unchanged. Python compilation passed. Actual source generation is running; no new model or visual repair is validated yet.

Read-only source review found pre-decimation self-normal bake, reused per-material cloth UV and thin-shell collapse risks; these are hypotheses/production gaps, not proven exclusive causes of black spots. Native same-camera/pose ablation is being collected. Upcoming experimental budget source will separate final low-model normal UV and isolated high-to-low cloth baking while retaining base color/ORM/emission and hair/face allocation. Do not claim a normal-strength-zero experiment as the final fix.

Next concrete action: verify regenerated source receipt/count/hash and source images, freeze it for the budget experiment; inspect actual baseline normal/matte ablations, then implement/test bounded cloth UV/normal/geometry repair. Save source changes before binary verification, then L0/L1 hashes, poses, actual screenshots and required regressions. Keep <=35k/15k triangles,60 joints,2 materials/4 images; commercial/user art and real-device performance still unaccepted/untested.

## Source checkpoint 2 — 2026-10-13T03:31:24Z

Actual fresh source-only build passes:45,710 triangles/163 bones/three clips/22 packed images; source SHA b78ee35ce2b8f1e91ef7be5a9da30645bd09aaf07abc9c3c7c0aae5b2ddec503, generator SHA b255e064a4d5c7aabff0fb716f16fb07df13cde0bd15dceec95f2cb9e5e5de9c. Published high/combat hashes remain e7e16b.../79db8b..., verified unchanged.

Experimental budget source is saved and Python compilation passes. It reconstructs coat-tail single-layer reduction/thickness and proposes isolated final-low cloth NormalUV/high-to-low baking per LOD. Actual first candidate generation is running in scratch; no experimental model is integrated or accepted. Planned tail error gates must be measured, not moved just to force pass.

Native baseline viewer checked fixed Idle/front/back normal/zero-normal/neutral materials; normal-vs-zero RGB difference is tiny and old offline black spots were not reproduced there. Neutral material still shows pointed/folded tail geometry. More fixed Walk/Cast evidence is being collected. Do not claim exclusive normal-map cause or elimination of an unobserved defect.

Next: inspect scratch budget result/failures, final exported texCoord1 compatibility and full-cycle coat-tail errors, then compare real native/offline pictures. Source receipt and generation command permit rebuilding without the old machine. ART-02 remains in_progress and all final assets/tests/deployment are pending.

## Checkpoint3 — 2026-10-13T03:44:06Z

Real source-shell root issue measured: original 6mm paired coat layers separate to20.38097mm at Walk9 because corresponding inside/outside nearest-bone groups differ. Generator now copies paired outer weights before rest-pose bake. Fresh corrected source SHA958e42d3864cf7a71fc2728f3329d59f875e377e2ec93e5598ec83774eadd70c.

Independent Blender comparison passes across215 parts: source topology/rest positions/UV, all rest bones/actions, outer coat and every other part's weights unchanged.84 source layer samples (full Walk and selected Idle/Cast) give corrected max6.000096mm. Source-check helper, receipts and actual original/corrected measurements are saved in docs/qa.

Baseline renderer result:36 actual viewer ablations +6 Cycles8 studio crops +portable6-image quick execution pass; no specific black-spot disappearance was demonstrated when normal was removed. Do not turn old studio concern into claimed unique normal root cause.

Experimental budget remains unverified. Earlier low-shell even-offset created a24.934mm reverse-direction spike and was rejected; uniform6mm fixed it. Fresh coherent-source L0 bidirectional surface max5.977mm passed12mm target, but actual NormalUV pixel overlap gate rejected atlas; no new GLB was exported or integrated. Current source snapshot is saved while packing/bake diagnostics continue. Keep12/25mm tail gates and zero overlap/coverage gates; do not loosen to declare pass.

Next: finish non-overlapping final-low normal charts/high-to-low projections, verify native texCoord1/PBR/frame behavior on L0/L1 and actual pictures, then save final binaries/report before integration. Face/scalp/material polish and commercial/user acceptance remain pending ART-02.

## Checkpoint4 — 2026-10-13T03:52:28Z

Experimental full scratch export reached both LODs, but is REJECTED for publication. Coherent-source bidirectional tail surface limits pass (L0 max5.977mm, L1 max13.952mm; fixed limits12/25mm). Both published GLBs remain unchanged.

New L0 candidate001c67... has actual native6-view compatibility (normal texCoord1/baseColor0, finite UV1/60 bones/2 material draws/no page errors). Native pictures expose NEW chest/sleeve black triangles that remain with normalScale0 and disappear in neutral gray. This is a visual regression, not a passed asset. Existing baseline same camera/pose lacks these conspicuous spots. Separately the bake report exposes poor linen normal coverage and reverse/near-zero normals despite zero sentinel/black-hole metrics; these gates are insufficient. Work is held while chart packing, ray projection and original AtlasUV/base material invariants are investigated. No claim that cloth normals or art quality are fixed.

Saved latest diagnostic/generator/checker/test source; Python/JavaScript syntax passes, final full asset check and game regression not run on these rejected assets. Source weight repair and215-part/84-sample invariance remain reliable. Next: isolate native base-only regression and improve coherent cloth charts/projection with original base UV preservation; retain strict geometric/coverage gates, then actual visuals and gameplay checks before any main integration.
