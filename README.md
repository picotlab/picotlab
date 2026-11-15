# Picotlab

**A free, open-source crochet companion that explains the line you're stuck on.**

## Explain a line

Paste the one line of a pattern that has you stuck. Picotlab gives it back in plain steps, tells you
where the hook goes, and checks the stitch count against the one printed in the pattern.

For example, paste:

```
Rnd 4: (sc in next 2 sts, inc) x6 (24)
```

and you get the steps in order, where the hook goes for each one, and a check that the round really
ends on 24.

## Check a whole pattern

Paste a pattern worked in rounds, rows or granny squares and Picotlab checks it first. Each
round's stitch count is added up against the printed count. A line it can't read is shown as
"needs a human", and a doubtful reading is never shown as steps. Then you can step through it
stitch by stitch.

Everything runs in your browser. No AI is needed, no account, no server.

> Status: early prototype (a single-page app). Expect changes. Please paste only your own text, or a
> line short enough to quote, not a whole copyrighted pattern.

## And the older features, below the explainer

- **Design**: describe a piece and get a true-size pattern from your gauge, for hats, scarves,
  cowls, blankets and amigurumi.
- **3D preview**: the piece shown on a simulated stitch fabric, on a head, neck or bed.
- **Walkthrough**: an animated hook, stitch by stitch.
- **Swatch calibration** (measure your swatch so sizes follow your hands) and a **printable pattern sheet**.
- Works at phone width, in light and dark themes.

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

More on where it is going: `ARCHITECTURE.md`.

## Contributing

Issues and pull requests are welcome. Crocheters are especially welcome: a measured swatch or a
hooked test piece is worth more than code. Please include your yarn, hook, gauge and measurements.
Just want to try it? See [TESTING.md](TESTING.md) for how to tell us how it went.

## Licence

Apache License 2.0. See `LICENSE` and `NOTICE`. Patterns you make with Picotlab are yours.
The Picotlab name and logo are not covered by the code licence.
