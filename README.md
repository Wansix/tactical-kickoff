# Tactical Kickoff — Robot Soccer Prototype

A focused, playable 2v2 top-down robot soccer simulation built with **Phaser 3, TypeScript, and Vite**. Watch a deterministic 90-second match, read each robot's live role/action/target tags, pause or change speed, then swap the blue composition and replay.

## Controls

- **START MATCH** — deploys the four robots and starts the clock.
- **PAUSE** — freezes simulation time and movement.
- **RESTART / REPLAY MATCH** — resets to the same seeded opening state.
- **0.5× / 1× / 2× / 4×** — changes watch speed.
- **SWAP BLUE ROLES** — exchanges striker and anchor duties for the blue team.

The two roles are intentionally legible: a **STRIKER** presses the ball and shoots toward the opponent goal; an **ANCHOR** covers a defensive lane. There are exactly two robots per team and no separate goalkeeper.

## Architecture

- `src/simulation/MatchSimulation.ts` — engine-independent domain model and deterministic update loop. It owns match state, seeded random reset bounces, robot steering, role/action decisions, score, pause, duration, and composition swapping. This boundary is designed to be portable to Godot.
- `src/presentation/GameScene.ts` — Phaser-only field, robot, ball, score, and telemetry rendering.
- `src/main.ts` + `src/style.css` — Vite bootstrap and control-panel UI.
- `tests/simulation.test.ts` — Vitest behavior tests for deterministic setup, scoring, clock/pause, and composition constraints.

## Verification

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Then open the Vite URL (normally `http://localhost:5173`). Production output is written to `dist/`.

## Scope notes

This first demo prioritizes a readable tactical loop over physics complexity: robots use deterministic steering, the ball has lightweight friction and wall bounces, and a goal is awarded when the ball crosses the end line. The simulation is intentionally free of Phaser imports so a future Godot adapter can consume the same concepts.
