# QA Baseline — 2026-08-22

## Reviewed worktree

Dirty worktree; no commit/push approval. The baseline includes decision telemetry, `SimulationTestArena`, replay normalization, anomaly detection, corner gate, strong kick tuning, 1v1 Striker test scenario, and DEV inspector hooks.

## Commands

```bash
npm test
npm run typecheck
npm run build
npm run qa:simulation
QA_SEEDS=100 QA_SECONDS=60 npm run qa:simulation
git diff --check
```

## Results

- tests: **PASS**, 7 files / 44 tests;
- typecheck: **PASS**;
- build: **PASS** (Vite chunk-size warning only);
- 50-seed physics/game gate: **PASS**;
- 100-seed physics/game gate: **PASS**;
- goals: 50 = blue 24 / orange 42; 100 = blue 43 / orange 84;
- goal concentration: 50 = 0.636; 100 = 0.661;
- unique signatures: 50 = 50; 100 = 98;
- max same-pair collision: 1;
- max reversal: 4;
- max corner low-speed run: 42 ticks (~0.7 s);
- early goals: 0;
- forced defense: both teams contact 2, goals 0;
- severe anomaly: 0.

## Gameplay anomaly finding

The new rolling-window detector found non-severe gameplay anomalies in the baseline:

- 50 matches: 385 anomaly observations;
- 100 matches: 774 anomaly observations;
- initial kind distribution: local-position dwell and long state dwell.

Representative finding:

```text
seed 1, blue-0:
CARRY state persisted 360 ticks (~6 seconds)
local position stayed within ~30px for 120 ticks (~2 seconds)
```

This is not a numerical physics crash, but it is a gameplay-quality warning and must be reviewed against the role contract. The simulation gate therefore remains numerically PASS but gameplay-quality approval is **BLOCKED/UNVERIFIED until each anomaly is classified as intentional home/cover behavior or fixed as a liveliness defect**.

## Browser evidence

PASS:

- goal ownership colors: top orange, bottom blue;
- 1v1 DEV fixture displays two Strikers;
- normal canvas and controls previously verified;
- no console/overflow blocker in prior Director run.

UNVERIFIED:

- chronological visual proof for every kick contact-to-response;
- chronological corner escape frame;
- full goal entry → hold → center reset visual sequence;
- latest debug overlay readability at normal and accelerated speed.

## QA Lead decision

Do not merge/push this baseline as a gameplay-approved release. The QA infrastructure is implemented and functioning; its first useful result is that it found repeated local/state dwell that the old aggregate gates missed.
