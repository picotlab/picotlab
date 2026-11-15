# Picotlab ↔ Blender

## Render limits (read first)

Env overrides: `PICOTLAB_TIMEOUT`, `PICOTLAB_MIN_FREE` (the old `HOOKLOOP_*` names still work as a fallback). Old exports whose object is named `Hookloop` still load.

On 2026-11-14 a Cycles render on the Metal GPU (1600×1200, 96 samples, plus a fuzz bug that made 2.4 m fibres) starved WindowServer, and this MacBook kernel-panicked ("userspace watchdog timeout"). The machine has 12 cores and 18 GB, shared with the desktop. So:

- **CPU by default.** `render.py` renders Cycles on the CPU with 6 fixed threads. The Metal GPU is opt-in (`--gpu`). Use it only on an idle machine, never while you're working.
- **Small preview by default:** 800×600, 24 samples, adaptive sampling with the denoiser, fuzz off. `--final` gives 1600×1200 at 96 samples, still on the CPU unless you also pass `--gpu`.
- **Always go through `render.sh`.** It runs Blender under `nice -n 15` with a 300 s kill (`perl alarm`, because macOS has no `timeout`). It refuses to start when another Picotlab render is running, and skips the render when free memory is below 30% (`memory_pressure`).
- One render at a time: never in parallel, never in the background behind another.
- **Fuzz is opt-in (`--fuzz 0..1`).** The old particle-hair fuzz rendered metres-long streaks: Blender rescaled the fibre length from the velocity settings at evaluation time, and one preview took 187 s. Fuzz now makes each fibre directly as hair curves, at most 2× yarn thickness, and capped at 60k fibres; the render refuses to start above the cap, and an assert rejects any over-long fibre. Measured on 2026-11-14 (CPU, 6 threads): tiny test `samples/fuzz-test.png` <1 s; beanie at 800×600 with 38k fibres `samples/beanie-fuzz.png` 9 s. At preview size the fuzz is subtle.

## 1. Headless render (no MCP needed)

```bash
lab/hookloop/blender/render.sh lab/hookloop/blender/samples/beanie.obj ~/Desktop/beanie.png
```

The input is a Picotlab export saved to a file. Use either **Copy OBJ** (save the text as `something.obj`) or **Copy Blender script** (save as `something.py`; it gets executed, so pass only scripts Picotlab wrote). Options: `--final`, `--gpu`, `--threads N`, `--res WxH`, `--samples N`, `--color #rrggbb`, `--view three-quarter|front|side|top`, `--fuzz 0..1`, `--form auto|on|off`, `--stitches auto|on|off`, `--engine eevee` (EEVEE always uses the GPU), and `--blend out.blend` to save the scene for the Blender UI. Run `render.py` with no arguments for the full list.

What it does:

- Imports the export. The OBJ is already in Blender axes (Z-up, metres), so it's imported without axis conversion.
- Recovers each round and ring from the mesh topology (rounds = graph distance from the magic-ring vertex). Each stitch is rebuilt as two yarn legs in a V, like the page's stitch view. hdc and dc stitches get a yarn-over bar, and rib rounds alternate front and back posts. Stitch types come from the pattern comment (`# R16–R18 (rib)`).
- Adds a twisted-ply yarn shader (diagonal wave bands along each strand, fibre noise, sheen, a little subsurface), and an optional fibre halo made of hair particles.
- Rebuilds the page's head form (cranium, jaw, neck, shoulders) for hats. The camera is an 85 mm lens with three soft area lights and a sweep backdrop, rendered in AgX.

Verified on 2026-11-14 (Blender 5.3.0): a 56 cm worsted hdc beanie with 969 stitches rendered from both the `.obj` and the `.py` in 7 s each on 6 CPU threads at 800×600 → `samples/beanie-preview.png`, `samples/beanie-from-py.png`. Not verified yet: `--final`, fuzz after the fibre-length fix, EEVEE, and non-hat pieces. Scarves and blankets fall back to a plain yarn shader with no per-stitch geometry.

**A sample export without the browser:** `node lab/hookloop/blender/export.js "beanie for a 56 cm head in worsted" lab/hookloop/blender/samples/beanie` runs the page's own core and hat simulation from `index.html` (read-only) and writes the same `.obj` and `.py` the buttons produce. For scarves, cowls and blankets it runs the page's own `buildCloth` and cloth sim to rest and writes `x.obj` (metres, with UVs) plus `x.json` (rod/box/form props, stripes sequence, palette): `node export.js "chunky scarf 180 cm" samples/scarf` (add `--on neck` for a scarf round a neck), then `render.sh samples/scarf.obj out.png`; `render.py` picks up the `.json` next to the `.obj` and adds the props and a stitch-scale yarn texture (V-stitches, one stitch per UV unit, stripes from the colour sequence). Verified 2026-11-14: scarf and blanket previews 7-8 s each on CPU (`samples/scarf-preview.png`, `samples/blanket-preview.png`). Cloth pieces are a textured sheet, not per-stitch geometry; the Blender cloth sim is not used (the app's own drape is exported).

## 2. Live link: Claude drives your open Blender (MCP for Blender, ahujasid)

The add-on runs a socket server inside Blender (localhost:9876). The MCP server (`uvx mcp-for-blender`, old name `blender-mcp`) relays Claude's tool calls to it. Source: `lab/hookloop/vendor/mcp-for-blender` (README, `addon.py`).

1. **Install the add-on in Blender 5.3:** Edit → Preferences → Add-ons → the ⌄ menu at the top right → **Install from Disk…** → pick `vendor/mcp-for-blender/addon.py` (clone https://github.com/ahujasid/mcp-for-blender into `vendor/`) → tick **MCP for Blender**. Alternatively, run `uvx mcp-for-blender install-addon` (from the README; not tried here).
2. **Connect:** in the 3D viewport press **N** → **MCP for Blender** tab. The server auto-starts when Blender loads. If it doesn't, click **Connect to MCP server** (port 9876). Leave Poly Haven, Hyper3D and the other online options off unless you want them: they call external services, and Hyper3D/Meshy can spend credits.
3. **Register the MCP server with Claude Code.** Run this yourself: agents here may not change MCP or harness config.

   ```bash
   claude mcp add blender -- uvx mcp-for-blender
   ```

   `uvx` is at `~/.local/bin/uvx`. If Claude Desktop can't find it (`spawn uvx ENOENT`), use that full path. `uvx blender-mcp` still works as an alias. Restart Claude Code, then ask it to "get the Blender scene info".
4. **Picotlab workflow:** export from Picotlab, then either open the `.blend` from `render.sh … --blend hat.blend`, or ask Claude to run the saved `.py` through the MCP `execute_blender_code` tool, then light and render it. Keep the render limits above: in the GUI, set Render Properties → Device to CPU.

Verified on 2026-11-14: `addon.py` (v2.0, protocol 16) registers and unregisters cleanly in Blender 5.3.0 headless (`--factory-startup`). Its scene properties, server class and operators all load. In background mode it does **not** start the socket server (by design). Not verified: the GUI install, the socket connection, `claude mcp add`, and any MCP tool call.

## 3. Skill (reference only)

`skill/` is a copy of `vendor/blender-claude-skill/blender` (SKILL.md, references, scripts, examples): headless bpy patterns. It isn't installed into `~/.claude`.
