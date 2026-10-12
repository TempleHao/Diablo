# Continuous human source mesh

This directory contains unmodified graphical assets from the MakeHuman Community
repository, fixed at revision `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`.
Download URLs, byte lengths and SHA-256 hashes are recorded in `manifest.json`.

## License evidence

The upstream `LICENSE.md`, section C, explicitly defines the base mesh, proxies,
targets, textures, clothes, poses and expressions as graphical assets released
under **CC0 1.0 Universal**. Section D also distinguishes exported graphical data
from the application's separately AGPL-licensed program logic. The complete
asset license is preserved in `LICENSE.ASSETS.md`.

`base.obj` and the downloaded `.target` files additionally carry their own header
stating that the asset was explicitly released as CC0 in September 2020.
`default.mhskel` and `default_weights.mhw` contain `"license": "CC0"` metadata.
No MakeHuman application code is included or imported by the game.

Upstream authors identified in these files include Data Collection AB, Joel
Palmius, Jonas Hauquier and, for the original macro targets, Manuel Bastioni.

## Geometry and build notes

- `base.obj` contains 19,158 vertex records, 18,486 face records and 21,334 UV
  records, including helper meshes and bone location markers.
- Its `g body` group contains 13,378 faces and uses 13,380 vertices. A graph
  connectivity check found **one connected body component**, including the
  anatomically modeled face; it is not a set of attached primitive shapes.
- Original coordinate space is Y-up, approximately 16.659 units tall. The body
  bounds before targets are X `[-4.9627, 4.9627]`, Y `[-8.1676, 8.4913]`, and
  Z `[-1.0154, 3.2147]`. These include the extended arms.
- The `.target` files are additive offsets keyed to the original zero-based
  vertex index. Apply targets before removing helper vertices or reindexing.
- The supplied young/old male macro targets, age detail target and height target
  are authoring inputs. They are not a prebuilt dressed game character.
- `default.mhskel` supplies default rig definitions; `default_weights.mhw`
  contains original-index skin weights. A build must account for its chosen
  coordinate conversion and any topology changes.
- `high-poly.obj` and `brown_eye.png` are bundled eye assets with their own UVs.
  They must be fitted to the final deformed character, not placed blindly.

These sources establish continuous anatomy and clear redistribution rights.
They do not by themselves supply production skin textures, authored mage
clothing, final animation, a facial rig or a finished high-budget character.
