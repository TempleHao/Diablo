# AmbientCG material source maps

These unmodified 1K material maps are mirrored in the public PlayCanvas engine
examples at revision `3e1e7c35f00692f3bb8aad105406b6a6d7896b7c`.
Their original author is ambientCG / Lennart Demes. Source URLs and SHA-256 hashes
are recorded in `manifest.json`.

Each directory preserves its upstream `*-textures.txt` notice. Those notices
identify the exact ambientCG asset and state that it is released under **CC0 1.0
Universal**, including commercial use without attribution. This is the asset
license; the engine repository's software license is not used as a substitute.

- `bricks076a`: weathered gray stone masonry, suitable for ruin walls and blocks.
- `ground092c`: rippled sand. It is included as a separate investigated surface,
  not a claim that a sandy surface suits the dungeon.

Each set includes color, OpenGL-convention normal (green +Y), roughness,
ambient occlusion and height maps. All are 1024 × 1024 WebP images. PlayCanvas's
notices document its conversion from the original PNG set and quality settings.

The color map is interpreted as sRGB. Normal, roughness, AO and height maps are
linear data. Runtime files may be copied or resized into `dist/textures/`; the
game should not request the upstream URLs at runtime. These maps supplement
scene geometry and lighting; they are not a finished environment scene.
