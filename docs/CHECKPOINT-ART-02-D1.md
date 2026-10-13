# ART-02 D1 — cloth surface checkpoint

Run auto-ART-02-D1-20261013032228-df3abdbf; saved 2026-10-13T03:27:17Z. Current published 3D remains0.3.0-preview.2; independent 2D v0.3 stays untouched.

First saved change: source-only generator mode rebuilds the editable complete rig, packs referenced images, saves SHA/count receipt, and leaves published GLBs/statistics unchanged. Python compilation passed. Actual source generation is running; no new model or visual repair is validated yet.

Read-only source review found pre-decimation self-normal bake, reused per-material cloth UV and thin-shell collapse risks; these are hypotheses/production gaps, not proven exclusive causes of black spots. Native same-camera/pose ablation is being collected. Upcoming experimental budget source will separate final low-model normal UV and isolated high-to-low cloth baking while retaining base color/ORM/emission and hair/face allocation. Do not claim a normal-strength-zero experiment as the final fix.

Next concrete action: verify regenerated source receipt/count/hash and source images, freeze it for the budget experiment; inspect actual baseline normal/matte ablations, then implement/test bounded cloth UV/normal/geometry repair. Save source changes before binary verification, then L0/L1 hashes, poses, actual screenshots and required regressions. Keep <=35k/15k triangles,60 joints,2 materials/4 images; commercial/user art and real-device performance still unaccepted/untested.
