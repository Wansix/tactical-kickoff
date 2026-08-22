# Simulation QA System

## Purpose

This project treats implementation and verification as separate outcomes. A feature is complete only when its behavior contract, deterministic scenario, automatic gate, decision trace, and runtime evidence agree.

## Current architecture

- `src/simulation/MatchSimulation.ts`: authoritative fixed-step simulation (`1/60`), seeded formation, AI target/action selection, robot/ball physics, kick impulse, goal/reset, wall/corner recovery.
- `src/simulation/SimulationQA.ts`: `SimulationTestArena`, replay normalization/equality, robot inspector projection, kick-cause lookup, and anomaly detection.
- `scripts/simulation-qa.ts`: multi-seed 50/100 match gate for goals, direction, collisions, reversals, defenses, ranges, and corner low-speed dwell.
- `src/presentation/GameScene.ts`: Phaser renderer plus DEV-only inspector/1v1 hooks.
- `tests/`: physics, simulation contracts, diversity, seed sweep, analyzer, responsive, and QA-system tests.

## Evidence classes

- **PASS**: backed by an executed command, deterministic trace, or direct browser observation.
- **UNVERIFIED**: telemetry or code supports a claim but the required direct evidence was not observed.
- **BLOCKER**: a requirement, invariant, reproducibility check, or behavior gate failed.

A green unit suite is only a baseline. Do not merge or push a release candidate with a BLOCKER or required UNVERIFIED review.

## Determinism contract

Every scenario records:

- scenario ID;
- RNG seed;
- fixed tick duration;
- duration in ticks;
- composition;
- ball position/velocity;
- robot position/velocity/facing/action/target overrides.

`SimulationTestArena.step(n)` advances exactly `n` fixed ticks. `normalizeReplay()` removes irrelevant array order and `replayEquivalent()` compares the semantic trace. A bug report must include the scenario ID, seed, tick, robot ID, expected/actual behavior, event trace, and reproduction command.

`replayDiff()` is the failure-oriented counterpart: it returns `equal`, `firstDivergenceTick`, `path`, and the left/right values. This prevents a replay failure from collapsing into a boolean-only result.

## Decision observability

Each robot exposes:

- action/state;
- target label and target position;
- distance to ball and target;
- current speed and cap;
- kick cooldown/lockout;
- kick target/direction/power;
- last decision reason and state-change time.

Decision events also preserve a compact sense input: robot/ball positions, distance to ball, kick availability, selected target, action, and reason. This is not a full architectural Sense/Decide split yet, but it is sufficient to audit the decision input/output at fixed checkpoints.

Each fixed tick may emit structured decision, target-change, state-change, collision, kick, goal, wall, recovery, and warning events. Events are retained in JSON-compatible form and attached to snapshots.

## Scenario Arena

Use `SimulationTestArena` instead of mutating a full match ad hoc for new QA cases. A scenario may fix ball state, robot state, composition, seed, and duration. The arena supports `start()`, `step(n)`, `pause()`, `resume()`, and `result()`.

Required scenario families:

1. Striker 1v1 baseline;
2. blue own-half anchor interception;
3. orange own-half anchor interception;
4. corner recovery for all four corners;
5. wall/chamfer bounce;
6. kick range/cooldown/forward-angle boundary;
7. pass/target selection once Passer exists;
8. goal entry/hold/reset;
9. same-seed replay;
10. array-order-independent replay.

## Anomaly gates

`detectAnomalies()` checks non-finite values, bounds, speed caps, rolling local-position windows, and long action-state dwell. The canonical simulation QA additionally checks:

- unique signatures;
- both teams scoring and goal concentration;
- early kickoff goals;
- defensive causal contacts and zero forced-scenario goals;
- same-pair collision run;
- direction reversal run;
- robot movement ranges;
- corner low-speed dwell.

A future iteration should add repeated-position bucket alternation and robot-ball contact bursts to the canonical command once the baseline thresholds are recorded.

## Browser QA

DEV-only APIs:

```js
window.__tacticalKickoffQA.configureStriker1v1()
window.__tacticalKickoffQA.toggleDebug()
window.__tacticalKickoffQA.inspect()
```

The normal match UI never exposes these controls. Browser review must separately verify normal/accelerated running, pause/reset, field bounds, goal colors, goal hold/reset, causal contact-to-ball movement, and debug inspector readability.

## Release workflow

1. Write/update a behavior contract.
2. Add a failing scenario or regression test.
3. Implement the smallest change.
4. Run targeted tests.
5. Run full tests, typecheck, build, 50-seed QA, and 100-seed QA.
6. Compare normalized replay before/after.
7. Review decision/event traces for the worst seed.
8. Run Game Director browser review.
9. Run independent Tech Lead/QA review.
10. Only QA Lead may mark the change approved.

## First ten mandatory scenarios

1. `STRIKER_1V1_TRACE`: both Strikers sense, approach, contact, kick, and leave the contact region.
2. `ANCHOR_BLUE_OWN_HALF`: blue Bulwark intercepts a ball moving toward the blue goal.
3. `ANCHOR_ORANGE_OWN_HALF`: orange Bulwark intercepts a ball moving toward the orange goal.
4. `KICK_RANGE_BOUNDARY`: one tick outside range does not kick; one tick inside may kick.
5. `KICK_COOLDOWN_BOUNDARY`: cooldown blocks a valid candidate and the trace explains why.
6. `KICK_DIRECTION_MASS`: same impulse on different masses produces the expected delta-v.
7. `CORNER_ESCAPE_4X`: all four corners escape within the bounded recovery window.
8. `GOAL_HOLD_RESET`: goal entry, visible hold, center reset, formation and cooldown reset.
9. `REPLAY_EQUALITY`: same scenario/seed/ticks produce the same normalized trace.
10. `ANOMALY_SCAN_100`: 100 natural matches report local dwell, state dwell, target thrash, non-finite, bounds, and cap anomalies with seed/tick/robot examples.

## Explicit non-goals

Do not build a database, server, enterprise CI, full-frame permanent event store, or large dashboard framework. Keep traces in memory and JSON-compatible files/console output. Add only the instrumentation needed to answer a concrete behavior question.
