# Robot Behavior Contracts

Contracts are requirements for AI intent, not guarantees about the final physical outcome. Physics may deflect a ball after an intentional kick; that is reported as a physical result, not silently classified as an AI decision failure.

## Striker / 돌격대장

MUST:

- pursue the ball using the attack-axis staging rule;
- enter the collision envelope before attempting a kick;
- kick only when forward angle, range, cooldown, kickoff, and burst conditions pass;
- aim the impulse toward the opponent goal axis;
- leave a decision/event trace explaining the action.

MUST NOT:

- own or lock the ball;
- overwrite ball velocity every tick;
- intentionally aim at its own goal;
- remain in a repeated local-position/contact loop without an anomaly.

MAY:

- be deflected by a robot or wall collision;
- fail to score after a physically valid kick.

## Bulwark / 앵커

MUST:

- identify its own half using the team attack axis;
- prioritize the goal-ball intercept line when the ball moves toward its own goal;
- use lateral staging when on the wrong side of the ball;
- produce a causal robot-ball contact or a measured interception attempt in a forced defense scenario;
- return toward its cover/home position when threat is absent.

MUST NOT:

- be judged successful only because its action label says `PRESS`;
- intentionally push the ball toward its own goal;
- leave the defensive area without a traceable reason.

## Physics contract

- fixed `1/60` timestep;
- mass-based collision and kick impulse;
- bounded velocities;
- no possession, dribble lock, or scripted per-tick ball velocity;
- deterministic collision ordering;
- corner recovery is bounded, cooldown-protected, and event-recorded.

## Contract test format

Every new archetype adds:

- normal scenario;
- range/angle/cooldown boundary;
- target change;
- collision case;
- failure/fallback case;
- deterministic replay case;
- regression ID for every discovered bug.
