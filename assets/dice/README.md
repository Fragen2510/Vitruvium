# Vitruvium d6 model asset

The optional Dice So Nice integration looks for this file:

`systems/vitruvium/assets/dice/vitruvium-d6.glb`

The GLB is not included yet. Place the finished model at that path; the system will register it when Dice So Nice is ready.

## Model requirements

- Export one low-poly d6 as a single `.glb` using glTF 2.0.
- Keep the standard d6 silhouette, scale, origin, and orientation. Use the Dice So Nice d6 model as the alignment reference so its standard collision shape remains correct.
- Preserve standard opposing faces: 1 opposite 6, 2 opposite 5, and 3 opposite 4.
- Put the Vitruvium success result on each face: faces 1, 2, and 3 show `0`; faces 4 and 5 show `1`; face 6 shows `2`.
- Make labels high-contrast, centered, and readable at chat-scale. Keep them clear of bevels and decorative elements.
- Use Principled BSDF materials, modest textures (up to 1024 px), and no camera or light objects in the export.
- Do not add an idle animation track. Dice So Nice handles rolling and settling.

A non-cubic silhouette is out of scope for this asset: it would require a separately authored Dice So Nice physics shape and a full face-to-collider mapping.
