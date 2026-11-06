# Eval fixture photos: credits

The analyze cases of the eval set (`src/lib/ai/eval/sets/shared/cases.ts`) use the 480 px renditions of the dev
fixture photos in `public/dev-fixtures/` (credits in `public/dev-fixtures/CREDITS.md`, Unsplash License) and the one
derived file below. Each file is hashed in its fixture, so a change to the bytes changes the family's fixtures hash.

| File | Made from | How |
|---|---|---|
| `blender-blurred-480.webp` | `public/dev-fixtures/1303e53b29a3006ef1381930643c87e2-480.webp` (blender-hand, BlendJet, https://unsplash.com/photos/daa-gr83Mf0, Unsplash License: modifications allowed) | Gaussian blur, sigma 9, WebP quality 70 (sharp); the out-of-focus case (`photoQuality.sharp = false`) |
