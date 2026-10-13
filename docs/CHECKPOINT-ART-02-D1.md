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
