# SEED 🌱

A daily puzzle built on Conway's Game of Life. No build step, no dependencies, no backend.

**Play:** https://egens.github.io/life/

## How it plays

- Plant a handful of cells (7–12, depending on the day) inside the green zone.
- Press **Run**. Life takes over under Conway's rules for 200 generations.
- A star lights up when a live cell comes within 2 cells of it. Light as many of the 10 stars as you can.
- Walls are always dead. Ties go to whoever lit their last star in fewer generations.
- Everyone gets the same puzzle each day. **Endless** mode serves random levels.
- **Share** copies an emoji map and a link. The link carries your seed, so a friend sees your score (recomputed from the seed, so it can't be faked) and can try to beat it.

The old free-play board is at [sandbox.html](sandbox.html).

## Files

- `core.js` — level generator, simulation, scoring and seed encoding. Works in the browser and in Node, so you can test balance with scripts.
- `index.html` — the game UI.
- `sandbox.html` — classic Game of Life playground.

## Deploy

[.github/workflows/pages.yml](.github/workflows/pages.yml) publishes the repo to GitHub Pages on every push to `main`.
Once, in the repo settings, set **Pages → Source** to **GitHub Actions**.
