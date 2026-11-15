# Picotlab

**A free, open-source crochet companion.** Paste a crochet pattern and Picotlab walks you
through it stitch by stitch, in plain words, with an animated hook. It checks every round's stitch
count and shows any line it can't read as "needs a human" rather than guessing. Today it reads
patterns worked in rounds (hats, amigurumi); rows and granny squares come next. Describe a piece
("slouchy beanie for a 58 cm head in worsted, ribbed brim") and it works out a true-size pattern
from your gauge, checks it on a simulated stitch fabric, shows it on a head, neck or bed, and writes
a printable pattern sheet. No AI is needed for any of it: the pattern maths is plain, tested code.

> Status: early prototype (a single-page app). The pattern maths is tested; real-yarn fit is still
> being checked against hooked swatches. Expect changes.

## What it does today

- **Plain-language requests → pattern spec**: item, size, yarn weight, hook, gauge, stitch, brim,
  stripes. US terms (UK on request), cm or inches.
- **True-size design** for hats (beanie, slouch, beret, bucket), scarves and cowls, blankets (rows or
  granny squares) and amigurumi. Counts are searched per round to hit the target size with even,
  crochetable increases.
- **3D fabric preview**: the piece is rebuilt stitch by stitch as a spring network and shown on a
  head form, a neck or a bed. Ruffles and puckers come from the simulation, not from drawing.
- **Hook walkthrough**: play, pause and scrub through every stitch in order ("R3, st 4 of 18: inc").
- **Fit check, colourwork with yardage per colour, pattern sheet, photo → shape, swatch calibration.**
- **Blender export** (OBJ or a bpy script) and a CPU-safe headless render script.

Everything above runs in your browser. No account, no server, no AI calls.

## Try it

Open `index.html` in a modern browser. It loads three.js from a CDN, so the first load needs a
connection.

## Develop

```bash
./build.sh          # assembles index.html from src/ and runs the core tests
node test/core.test.js index.html
```

Layout:

| path | what |
|---|---|
| `src/core.js` | the pattern engine (pure logic between `CORE-START` and `CORE-END`) |
| `src/app.js`, `walk.js`, `calib.js`, `photo.js`, `shell.html` | the page: UI, 3D, walkthrough, calibration, photo tracing |
| `test/core.test.js` | headless tests for the engine |
| `blender/` | Blender bridge: `export.js`, `render.py`, `render.sh` (CPU by default, resource-limited) |
| `ARCHITECTURE.md` | the plan from prototype to production |

The Blender bridge works with these MIT-licensed projects, which are not included here:
[mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) and [blender-claude-skill](https://github.com/MartinRapcan/blender-claude-skill). See
`blender/SETUP.md`.

## Roadmap (short)

1. Repository, CI, phone and dark-mode pass, real swatch checks.
2. `@picotlab/core` as a TypeScript npm package with full tests and an open pattern file format.
3. A real web app (offline-capable, row counter, print/PDF).
4. Optional AI help (free-text requests, photo of a finished piece, pattern tech-edit), always
   checked by the same maths, with a bring-your-own-key option.
5. v1.0, then community features for clubs, teachers and designers.

Details: `ARCHITECTURE.md`.

## Contributing

Issues and pull requests are welcome once the repository is public. Crocheters are especially
welcome: a measured swatch or a hooked test piece is worth more than code. Please include your yarn,
hook, gauge and measurements.

## Licence

Apache License 2.0. See `LICENSE` and `NOTICE`. Patterns you make with Picotlab are yours.
The Picotlab name and logo are not covered by the code licence.
