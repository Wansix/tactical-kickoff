# 시뮬레이션·관전성 QA Gate v1

## 상태

2026-08-21 회의에서 Game Director, Tech Lead, Simulation QA가 합의한 **릴리스 전 필수 기준**이다. 기존 `npm test`는 기본 회귀 계약일 뿐이며, 아래 Gate를 통과하지 못한 빌드는 시뮬레이션 정상으로 승인하지 않는다.

## 회의 결론

현재 구현은 조건부 FAIL이다.

- 동일 로봇 충돌쌍이 61 fixed ticks 연속 반복되는 사례가 관측됐다.
- arrival steering 변경 후 100 seed에서 blue 0골, orange 4골인 편향이 관측됐다.
- 기존 테스트는 “한 번 움직였는가”를 검사했지만 목표점 왕복, 반복 충돌, 팀 대칭성, 공 추적을 보장하지 않았다.
- 따라서 테스트 개수나 단일 seed의 녹색 결과만으로 승인하지 않는다.

## Gate A — 물리·결정론 불변식

모든 seed와 고정 `1/60` tick에서 다음을 만족해야 한다.

- NaN/Infinity 없음
- 로봇·공이 허용 bounds 밖으로 이탈하지 않음
- 같은 seed와 같은 입력은 로봇 위치·속도·action·충돌·킥·골 event가 동일
- 킥은 유효 접촉에서만 발생하며 tick당 중복 킥 없음
- 골은 mouth 범위와 입구 방향을 모두 만족
- 골 hold 후 중앙 정지 kickoff reset

## Gate B — 역할 행동

각 시나리오에서 공을 2초씩 고정한다: 중앙, blue 자기 진영, orange 자기 진영, 좌측, 우측.

- 돌격대장: 공의 x/y가 바뀌면 목표 방향도 바뀌고, 공까지의 거리가 감소하는 구간이 있어야 한다. 공 뒤쪽에서 공격 방향으로 접근하며 접촉 후 킥이 발생해야 한다.
- 앵커: 평소 홈 커버 위치를 유지하되 자기 진영 공에는 x·y 모두 공 쪽으로 이동해야 한다. 공이 상대 진영이면 커버로 복귀해야 한다.
- 모든 역할: 목표점에 도착한 뒤 무제한 최대속도로 통과하지 않고 arrival 감속 또는 동등한 안정화가 있어야 한다.

## Gate C — 궤적·왕복

각 로봇의 60초 telemetry를 분석한다.

- 위치를 16px grid로 양자화했을 때 고유 grid가 1개 또는 2개뿐이면 FAIL
- 목표점 근처에서 동일 축 방향 반전이 연속 6회 이상이면 FAIL
- 동일 pair의 robot-robot collision이 연속 3 ticks 초과면 FAIL
- 30 tick 동안 같은 pair가 2회 초과 재충돌하면 FAIL
- 로봇별 x 또는 y 이동 범위가 40px 미만이면 해당 시나리오 FAIL

## Gate D — seed 다양성·팀 대칭성

최소 100개 seed, 경기당 60초를 실행한다.

- unique physical signature 20개 이상 / 50경기
- blue와 orange 모두 최소 1회 이상 득점
- scoring seed 수가 한 팀에 80% 이상 몰리면 FAIL
- 전체 목표골은 10개 이상이어야 하며, 단 한 팀만 계속 득점하면 FAIL
- 킥, robot-ball contact, wall bounce가 0으로 고정되지 않아야 한다.

팀 대칭성은 “매 seed에서 같은 점수”가 아니라, 여러 seed에서 양 팀이 대칭적으로 공격 기회를 얻는지를 판정한다.

## Gate E — 브라우저 관전성

자동 테스트와 별도로 실제 브라우저에서 확인한다.

- 돌격대장이 공의 이동 방향으로 실제 화면에서 접근
- 앵커가 세로선처럼만 왕복하지 않고 x/y 모두 공을 지원
- 공 접촉·강한 킥·벽 반사·골 장면이 시각적으로 확인 가능
- 골대 내부에 공이 약 1초 보이고 중앙 reset
- console error 0, canvas/page overflow 없음

## 승인 규칙

- Gate A~E 중 하나라도 FAIL이면 commit/push 및 완료 보고를 보류한다.
- `npm test`, typecheck, build는 필요조건이지 충분조건이 아니다.
- 실패 시 원인 telemetry, 재현 seed, 최소 수정, 재실행 결과를 기록한다.
- 수정 후 개발팀 재실행 → 독립 검수팀 재검수 순서를 반복한다.

## 추가 검수 지표

`npm run qa:simulation`은 기본 50 seed/60초를 실행한다. 장기 sweep는 `QA_SEEDS=100 QA_SECONDS=60 npm run qa:simulation`으로 실행한다.

필수 telemetry:

- `firstKickBlue`, `firstKickOrange`: kickoff 선입 팀 독점 방지
- 팀별 득점·득점 seed·`goalConcentration`: 팀 대칭성 확인; 한 팀 전체 득점 비중 `>70%`는 release blocker
- `earlyGoals`: kickoff 후 5초 이내 골은 0이어야 함
- `defensiveBlue`/`defensiveOrange`: 강제 자기 골 방향 scenario에서 앵커 contact 1회 이상·실점 0
- `maxCollisionRun`, `maxDirectionReversalRun`: 반복 충돌·왕복 확인
- `uniqueSignatures`, `totalGoals`: 상황 다양성과 실제 진행 확인
- wall bounce와 corner recovery: 벽 접촉 반복과 stuck 탈출 분리
- goal reset 후 formation/속도/cooldown 회귀 테스트

첫 킥 arbitration은 kickoff/reset 직후에만 허용하고, 일반 경기 중에는 공 소유권이나 팀 잠금을 사용하지 않는다. QA가 통과해도 브라우저에서 실제 canvas와 console error를 별도로 확인한다.

## 2026-08-22 quality-loop cycle evidence

- Worktree: feature branch `fix/gameplay-quality-loop`; pre-existing dirty edits were preserved. No commit/push was made.
- Root causes reproduced before changes: goal sensor used `kickoffTimer` instead of the documented five-second `kickoffSafetyTimer`, producing 50/50 early goals; arrival controller's minimum closing speed caused seed 31 striker oscillation (24 consecutive vector reversals); repeated robot-ball recontacts damped play into a center deadlock.
- Minimal changes: restore safety-timer goal gating; use vector-dot trajectory reversal detection that resets across goal-hold/RESET discontinuities; restore distance-based arrival speed; add per-robot 8/60 fixed-tick non-kick recontact cooldown; extend bounded post-kick guard to 0.18s; serialize the new cooldown in checkpoints.
- Regression evidence: `npx vitest run tests/qa-system.test.ts -t 'does not oscillate'` was RED at `24 > 6` before the arrival-speed correction and GREEN after; final `npm test` was GREEN (49 tests).
- Final 50-seed/60-second gate: PASS — unique signatures 48, goals 362 (blue 172/orange 190), goal concentration 0.525, first kicks 25/25, collision run 1, reversal run 3, corner low-speed run 45 ticks, anomalies 0, early goals 0, defensive contacts 1/1 with goals 0.
- Final 100-seed/60-second gate: PASS in the serial run after the 8/60 cooldown — unique signatures 86, goals 718 (blue 341/orange 377), goal concentration 0.525, first kicks 50/50, collision run 1, reversal run 3, corner low-speed run 57 ticks, anomalies 0, early goals 0, defensive contacts 1/1 with goals 0. A prior intermediate run with the shorter cooldown had anomaly findings; it is not the release result.
- Disposable telemetry: same seed/tick serialized trace comparison PASS. Representative 10-seed totals included wall bounces 4–28, robot-ball contacts 26–144, robot-robot contacts 0–13, kicks 7–32; observed ball x/y ranges materially exceeded center dead-zone. Seed 1 still exhibited a 484-tick `<20 px/s` interval, so numerical liveliness has remaining edge risk even though the current canonical gate does not fail it.
- Browser: dev server default port 4173 was occupied; fresh server URL was `http://127.0.0.1:4174/`. Chrome headless generated 1x evidence (`/tmp/tactical-1x.png`, 306150 bytes) and DOM evidence (canvas present, Korean controls present). 4x capture timed out, and chronological visual contact/kick, corner escape, goal-entry/hold/reset, and console-clean evidence were not independently verified.
- Verdict: numerical simulation PASS; gameplay anomaly gate PASS for the final serial 100-seed run but low-speed seed-1 edge risk remains; observability/replay partial PASS (same-seed and checkpoint tests exist, actual replay-engine/browser fixture not independently reviewed); browser visual UNVERIFIED. Release remains BLOCKED; do not commit, merge, or push. Next hypothesis: add a bounded low-speed/central-dwell gate and obtain independent Tech Lead/Game Director browser review before any candidate commit.

## 2026-08-22 final near-ball approach cycle

- Root cause fixed: distance-based arrival braking no longer applies to `PRESS` while the robot is within 60px of the ball and still moving toward its target; `CARRY` retains normal arrival braking to avoid overshoot/possession bias.
- Decision telemetry now records `desiredSpeed`, and a deterministic regression test proves near-ball `PRESS` selects `robot.maxSpeed`.
- Full gate: 50/50 tests, typecheck, build, `QA_SEEDS=50`, `QA_SEEDS=100`, and `git diff --check` PASS.
- QA100: 702 goals, blue/orange 375/327, concentration 0.534, first kicks 50/50, reversal 4, collision run 1, early goals 0, severe anomalies 0; one non-severe `state-stuck` classification remains observable and corner low-speed max was 105 ticks.
- Browser: live `5197` run showed near-ball `PRESS` telemetry, both teams scored, goal reset timer observed at 0.483s then returned to 0, console errors 0.
- Independent release review must use this latest authoritative run; historical values above are retained as prior cycles only.

## 2026-08-23 autonomous quality-loop cycle

- Worktree/revision: `fix/gameplay-quality-loop` at `00dfac6` before the test-contract edit; no pre-existing dirty files. A concurrent QA lock was observed once and respected. A concurrent presentation edit appeared during the review and was preserved; the current worktree is dirty in `src/presentation/GameScene.ts`, `tests/goal-geometry.test.ts`, and this project note.
- Root cause reproduced: goal geometry fixtures injected a normal shot during the five-second initial kickoff safety window. Production correctly rejected the shot and emitted wall-bounce; the fixtures incorrectly expected an immediate goal. The same failure appeared in full `npm test` and isolated `npx vitest run tests/goal-geometry.test.ts`.
- Minimal test-only correction: advance the fixture 300 fixed ticks before injecting normal goal shots, and compare only post-injection events so historical wall bounces do not contaminate the assertion. Targeted geometry tests then PASS (3/3), followed by full `npm test -- --run` PASS (70 tests).
- Current canonical QA: `QA_SEEDS=50 npm run qa:simulation` PASS — 50/50 unique signatures, 307 goals (blue 143/orange 164), concentration 0.534, scoring seeds 49/49, first kicks 28/22, wrong-direction kicks 0/0, early goals 0, defensive contacts/goals 1/0 and 1/0, collision run 1, reversal run 3, corner low-speed run 19 ticks, anomalies 0. `QA_SEEDS=100 QA_SECONDS=60 npm run qa:simulation` PASS — 100 unique signatures, 639 goals (295/344), concentration 0.538, scoring seeds 95/97, first kicks 53/47, collision run 1, reversal run 3, corner run 19, anomalies 0.
- Typecheck/build PASS. Build still reports the existing >500 kB chunk warning. Disposable `/tmp/tactical-telemetry.mts` (10 seeds × 3600 fixed ticks, 60 seconds) reported deterministic equality, totals of 611 robot-ball contacts / 625 robot-robot contacts / 453 kicks / 496 wall bounces / 69 goals, ball ranges x=504/y=1050, pair run max 1, contact burst max 1, central low-speed max 42 ticks; corner low-speed max 0. The coarse rolling 120-tick local window metric observed stable defensive/home windows (max 120 ticks), requiring role-aware interpretation rather than a blanket blocker.
- Browser track: fresh Vite server `http://127.0.0.1:5199/` booted and served the Korean app (HTTP 200); no browser automation/screenshot/console/frame measurement was available in this environment. Canvas lifecycle, actual CSS bounds, causal contact/kick visuals, corner escape, and goal entry→hold→reset remain **UNVERIFIED**.
- Independent review verdict: numerical simulation PASS; gameplay quality PASS for current canonical thresholds with local-window role caveat; observability/replay partial PASS (checkpoint tests and deterministic traces exist, actual replay-engine/browser fixture not independently exercised); browser visual UNVERIFIED. Release remains BLOCKED by the mandatory browser and independent-review gates. No commit or push was made.

## 2026-08-23 concurrent-tree recheck blocker

- A later committed revision `742804a` widened Sweeper interception and removed the debug panel while this loop was running. Those edits were preserved, but they invalidate earlier full-test/QA evidence from `00dfac6`.
- On the latest revision, one `QA_SEEDS=50` run passed (50 signatures, 262 goals, 106/156, concentration 0.595, reversal 5, collision 1, corner 0, early goals 0). A concurrent `QA_SEEDS=100 QA_SECONDS=60` run reported 29 early goals despite first ten goal ticks being >300; an independent disposable 100-seed fixed-tick probe on the same workspace reported zero early seeds. This disagreement is a reproducibility/ordering blocker, not a green result.
- A fresh canonical 100-seed rerun was attempted but blocked by the active shared QA lock. Current worktree remains dirty in the QA note and goal-geometry test; no commit/push was made. Full tests and independent Tech Lead/Game Director review must be rerun after the newest tree stabilizes.

## 2026-08-23 autonomous loop recheck — latest observed tree

- Worktree: `fix/gameplay-quality-loop`; dirty changes were preserved while correcting an unsafe branch switch. No commit/push.
- Baseline commands: `npm test -- --run` PASS (72 tests), `npm run typecheck` PASS after resolving the preserved merge artifact, `npm run build` PASS with the existing >500 kB warning, `git diff --check` PASS. These results are not release evidence until the tree is stable because concurrent edits changed the simulation between runs.
- Canonical QA evidence: one `QA_SEEDS=50 npm run qa:simulation` run on the current tree reported 50 unique signatures, 151 goals (blue 58/orange 93; concentration 0.616), first kicks 28/22, wrong-direction kicks 0/0, collision run 1, reversal run 5, corner run 0, early goals 0, anomalies 0, but defensiveBlue/Orange contacts were both 0/0; the command failed on the required defensive contact gate. A disposable forced trace on the same apparent tree then showed both bulwarks physically contacting and clearing at tick 45, proving the QA result was from a concurrently changing revision and is not reproducible evidence.
- Earlier baseline on another concurrently observed tree reported QA50 earlyGoals=8 and QA100 earlyGoals=16 with max reversal=8>6; this disagreement is retained as a determinism/reproducibility blocker, not averaged away. Repeated canonical QA attempts were blocked by an active `/tmp/tactical-kickoff-simulation-qa.lock` held by another `vite-node` process.
- Root-cause hypothesis for the current defensive discrepancy: the canonical QA runner and disposable trace imported different live source revisions during concurrent edits; the trace itself showed `robot-ball-collision -> kick` for `blue-1`/`orange-1` at tick 45, while the failed QA aggregate saw no defender contact. Do not tune role behavior until one frozen checkout produces identical canonical and disposable results.
- Browser track remains **UNVERIFIED**: no independent screenshot/console/CSS-canvas measurement or chronological contact→response and goal entry→hold→reset evidence was available. Release remains **BLOCKED**; no commit/push.
