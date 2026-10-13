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

## Checkpoint5 — exported-byte gate and native root cause

Actual native controls normal/zero/none/flat identify new001c... candidate chest/sleeve spots in the normal map path. Three Raycaster maps three visible triangles to original normal PNG texels[128,128,0,255], decodedZ=-1; exact normalMap removal and flat positive-Z map restore these sampled regions while retaining UV1 and all other PBR maps. UV0 corners match baseline for24,429 position-matched triangles (including3,194 linen), and the three sampled UV0 triangles are nondegenerate. Screenshots and diagnostic hashes are saved underdocs/qa/surface-d1-images andsurface-candidate-normal-diagnosis.json.

New checker decodes actual embedded PNG with Node zlib, verifies its SHA against bake report and inspects entirecloth tile including background/margins, not just pixel-center interiors. Frozen rejectedL0/L1 actually run:26pinned sources/GLB budgets/weights/dualUV/hashes pass, then checker correctly fails with239,354 reverse PNG pixels inL0 linen tile. Independent Pillow decoding agrees exactly. Bake report mask had reported only90. This expected rejection validates the gate, not the model. Fixed goals determined before next build:zero reverse/invalidvectors across actualtile; interior coverage>=15%; encodedvector length.85..1.02; zeroUVoverlap/unprojected/blackholes; no pixel clipping to manufacture pass.

Published assets still unchanged; source-coherence proof remains valid. Current unmodified3D save61 and independent2D unit23 pass (no finalnewasset game tests claimed). Next: quantization-safe sentinel/bake coverage, larger valid cloth charts, matching high shell projection; actualcandidate bytes and same native controls must pass before integration. OverallART-02 and user art acceptance remain pending.

## Checkpoint6 — 2026-10-13T08:37:32Z; resumed with new lease

Prior03:22run lease expired05:59; currentmain was aa939bd81e20d581b01f1aa0f922c656233ae863 with independent2D roadmap/audit additions. Fresh CAS lease auto-ART-02-D1-source-20261013082918-bbb4f48c acquired; checkpoint refreshed onto latestmain tree while retaining all experiment evidence. No observed quota error; no quota-query claim. Independent2D updates and published dist remain unchanged.

Important naming correction from independent actual Blender review: Solidify first425vertices are original/base-layer, not always physicaloutside. Tail-1 original layer is outward; tail+1 original layer is inward. Only duplicate-layer weights change. Prior‘outerWeightsChanged=false’ and‘outer weights invariant’ are legacy first-block labels, not a physical-outside guarantee; currentgenerator/receipt/helper/experiment labels corrected without changing copy/reduction logic.

Accurately named generator actually rebuilt source with22packedimages/45710tris163bones; newsourceSHA d02212c51ab4c1f130789f28e0c884a2d37d3dffa4045ca8fe6c45d7c06dd64b / generatorf7bdbc36ce8fc646818f4eb1aacac3d118d7d05c58313dc97efe12b8d7542d7a. Independent215-part and42time×2panel=84sample comparison rerunpasses max6.000096mm vs20.380971mm. Source F-curve path/index/keyframe values compared; no comprehensive NLA/handle interpolation comparisonclaimed. Main subsetcandidate actualnpmcheck61save+23independent2Drules+26sources/oldmodels passes, new2Dfinalaudit9tests andstatusaudit pass. Onlysourcegenerator/helper/receipt/proof/readme/validation planned for main integration; no newgameGLBs, runtimechecker or experimentalbudget source.

Latestexperimentalbudget SHA0a5d23df600da2aee38a91936c5a9e49fe90f0a6228409ce64ce05176d0d4b7c staticpy_compile/diffcheckpasses. The3072separate normal layout andfloat-buffer/15%occupancy/fulltilevector gates are UNEXECUTED. It carries NORMAL_FOOTPRINT_VALIDATED=False and blocks export; do not flip it to claimvalidation. Face/hair1024 andothermaterial512physicalresolution retained byproposal; theoretical RGBA8normal+mipmap~48MiB vs~21.3MiB at2048, notdevice-memorymeasurement; mobilebudget/2048fallbackunverified.

Nextsmalltask: implement actualUVtriangle/filter texel footprint projection verification and matchinghigh sourcebase/duplicate/rim isolation. First run a limitedcloth projection case; retain positive actualPNG byte gates and native mapped-pixel controls. After genuineverification, runBlender budget experiment innew scratchusing source d022... and tracked original-shell diagnostic docs/qa/surface-original-shell-diagnostic.json plusbaseline-source-sha256 b78...; do notdepend onoldmachine caches or publishfailedcandidate. FinalnewLODgameplay/poses/lifecycle andartacceptance remainpending. Sourcefixonly does notaltercurrentplayerpicture.
