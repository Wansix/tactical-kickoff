# Sweeper 전술 게임플레이 Acceptance Matrix + Deterministic/Browser QA

> **목적:** Sweeper가 공을 바라보기만 하는 수비수가 아니라, 자기 zone 안의 공을 향해 폭주기관차처럼 진입하여 실제 접촉 후 상대 골 방향으로 클리어하고, zone 밖의 공에도 가장 가까운 zone 경계(nearest edge)까지 압박하는지 검증한다.
>
> **범위:** Game Director 체감 승인과 Simulation QA release gate를 정의한다. 이 문서는 **계약과 시나리오만 작성하며 구현하지 않는다.**

## 1. 공통 판정 원칙

- 모든 deterministic fixture는 실제 `MatchSimulation.start()` 경로를 거친 뒤 `tick(1/60)` 고정 스텝으로 진행한다.
- 초기 배치·초기 ball velocity만 fixture에서 주입한다. 접촉, 킥, impulse, 로봇 velocity를 매 tick 직접 주입하지 않는다.
- `robot-ball-collision`은 collider overlap의 물리 이벤트다. navigation/threat envelope 안에 있다는 사실만으로 contact나 kick을 인정하지 않는다.
- 모든 kick/clear는 같은 tick 또는 직전 허용 tick의 실제 contact와 연결되어야 한다. `causeContactTick`, `vxBefore/vyBefore`, `vxAfter/vyAfter`, `impulse`, event 위치를 보존한다.
- 동일 seed 재실행은 telemetry/event chronology가 같아야 한다. 실패 시 첫 divergence의 `seed / tick / actor / state / position / velocity / event`를 기록한다.
- 한 개의 passing screenshot, aggregate score, 또는 unit test만으로 PASS하지 않는다. simulation telemetry와 실제 browser pointer/start 증거를 각각 확보한다.
- 실패를 숨기기 위해 seed 삭제, threshold 완화, Sweeper 제외, collision event 필터링을 하지 않는다. 미구현/관측 불가 항목은 `BLOCKED/UNVERIFIED`로 보고한다.

## 2. Acceptance matrix

| ID | 계약 / Game Director 의도 | 결정론적 acceptance | 필수 telemetry / 증거 | 실패 판정 |
|---|---|---|---|---|
| S1 | **폭주기관차 체감:** zone 안의 공을 보자마자 주저 없이 가속하여 압박한다 | `HOLD_ZONE → INTERCEPT_STAGE → INTERCEPT`가 발생. 최초 stage 이후 이동 방향이 robot→ball(또는 명시된 goal-block target)에 계속 닫힌다. 60 fixed ticks 안에 거리 `>=60px` 감소 또는 실제 contact | 매 decision의 `action`, `sweeperState`, `moveTargetX/Y`, `distanceToBall`, `distanceToTarget`, `decision.desiredSpeed`; actor position/velocity trace | facing만 ball을 향하고 위치 진행 없음, `COVER`/정지 유지, target thrash, pre-contact braking이면 FAIL |
| S2 | **속도 체감:** 접촉 직전까지 전속 접근, 접촉 순간에만 물리적으로 속도가 바뀜 | Sweeper `INTERCEPT` 진입 후 collider 전 구간에서 `desiredSpeed`가 configured `maxSpeed`(허용 오차 1%)에 가깝고, 10-tick window 평균 속도 `>=0.70*maxSpeed`. contact 전 scripted stop 없음 | decision event의 `desiredSpeed`; 매 frame `vx/vy`, speed, distance; contact tick의 before/after | 거리에 비례한 조기 감속, 0 velocity 고정, teleport, possession lock, fake velocity kick이면 FAIL |
| S3 | **zone 내부 contact→clear:** zone 안 공을 실제로 쳐내 상대 골 방향으로 보냄 | 고정 overlap fixture에서 `robot-ball-collision → clear/kick` chronology. clear는 non-zero impulse, `causeContactTick` 존재, kick 전후 velocity가 실제 contact 결과와 연속. clear velocity의 공격 방향 성분이 `>0` (Blue `vy<0`, Orange `vy>0`) | event tick/order, ids, x/y, `causeContactTick`, `impulse`, `vx/vyBefore/After`, ball trace | near-miss kick, contact 없는 clear, wrong-direction/own-goal clear, zero impulse, 같은 tick 비인과 ball mutation이면 FAIL |
| S4 | **zone 밖 nearest-edge 압박:** 공을 쫓아 zone 밖으로 roaming하지 않고 공에 가까운 zone 경계까지 압박 | 공을 zone 밖 네 방향에 둔 fixture. `HOLD_ZONE`에서 `INTERCEPT_STAGE/INTERCEPT`로 전환하고 target은 공 전체 좌표가 아니라 공에 가까운 zone edge/그 edge를 향한 bounded point. Sweeper는 zone rectangle 밖으로 나가지 않으며, 120 ticks 내 nearest-edge distance `>=50px` 감소 | zone `{left,top,right,bottom}`, ball 좌표, `interceptReason`, `moveTarget`, robot pos, clamp/edge distance, state-change event | zone 밖 공을 무시하거나 home에만 정지, 반대쪽 edge 선택, zone 탈출, 공까지 teleport/remote clear면 FAIL |
| S5 | **hysteresis:** 경계에서 깜빡이지 않음 | ball을 `boundary-1`, `boundary+17`, `boundary+19`, 다시 안쪽/바깥쪽으로 두는 각 축 fixture. hysteresis band 안에서 state-change thrash 0; outer boundary crossing 때만 의도된 transition | state-change tick, previous/current state, boundary 좌표, target-change count | 1–2px 경계 왕복마다 INTERCEPT↔HOLD 반복, cooldown 무시하면 FAIL |
| S6 | **no teleport / fake velocity:** 실제 달려가서 접촉 | 매 tick displacement `<= maxSpeed/60 + 1e-6`; 접촉 전 robot position 연속. ball velocity delta는 contact/kick/wall event가 있는 tick에만 허용. clear의 velocity는 actual impulse로 재현 가능 | per-tick position delta, speed cap anomaly, contact/kick chronology, ball before/after velocity | 위치 jump, contact 없는 ball velocity 변경, intended aim vector만으로 kick, remote mutation이면 FAIL |
| S7 | **팀 대칭:** Blue/Orange가 좌표·공격 방향만 반사된 동일한 전술을 수행 | 동일 seed/초기 상태를 y축 반사하고 팀 교환. 대응 actor의 state/event tick/cardinality 일치; x 오차 `<=1e-6`, 반사 y/vy 오차 `<=1e-6`; clear 방향만 반전 | transformed telemetry/event diff, contact→clear tick, target kind, zone transformed coordinates | 한 팀만 nearest-edge/clear, state timing 또는 contact 여부가 다르면 FAIL |
| S8 | **goalkeeper regression:** Sweeper 변경이 골키퍼를 전진시키거나 골문을 비우지 않음 | mirrored incoming-own-half fixture에서 GK `targetY`는 derived goal-line home. bounded step-out은 own Goal Area + incoming velocity + punch proximity에서만 허용. threat clear/contact 후 goal-line envelope 복귀 | GK `homeY`, `targetY`, x/y/vx/vy, `action`, punch contact/clear event, conceded goal, zone state | stationary/outgoing/distant ball에 step-out, placed `homeY`를 따라감, goal-line 이탈 지속, goalkeeper contact regression이면 FAIL |
| S9 | **return:** clear 후 zone 중심으로 돌아와 재배치 | clear 후 threat 제거 시 `RETURN_TO_ZONE → HOLD_ZONE`; 180 ticks 안에 zone center 거리 `<24px`, speed `<80px/s`. cooldown 중 재dispatch 금지 | state chronology, `returnTick`, zone center distance, clearCooldown | stale formation post 복귀, 영구 INTERCEPT, 즉시 재출동, center 미복귀면 FAIL |
| S10 | **deterministic replay:** 같은 입력은 같은 경기 | same seed 2회, 1/60 vs 1/30 tick chunk, checkpoint/restore continuation 비교. 대응 fixed tick telemetry/event equal (`<=1e-9` 수치 오차) | replay diff, first divergence, checkpoint tick | render cadence/실행 순서에 따라 state·contact·clear가 달라지면 FAIL |
| S11 | **browser 체감/가독성:** 실제 화면에서 폭주기관차와 zone 관계가 보임 | visible Test Lab 진입 → Sweeper 선택 → zone/center 확인 → 실제 pointer drag/resize → start/lock. 시작 후 zone overlay가 고정되고 actor가 zone 안에서 출발해 압박·접촉·clear하는 장면을 캡처 | screenshot/video path, pointer coordinates, canvas bounds, console/page errors, browser QA telemetry snapshot | synthetic drop/강제 click/빈 canvas만 증거로 제출, overlay와 actor 불일치, console error, 화면상 정지면 FAIL |
| S12 | **seed sweep / match regression:** 새 전술이 전체 경기 생태계를 망가뜨리지 않음 | canonical + mirror + seeds 1..50. 기존 QA50/100 지표와 별도로 Sweeper engagement/contact/clear, wrong-direction, anomaly, goal concentration 기록. canonical fixture 100% pass; sweep은 재현 가능한 실패 seed가 있으면 release BLOCKED | seed별 compact report, unique signatures, contacts, clears, goals, wrong direction, severe anomaly | Sweeper를 report에서 제외, 실패 seed 제거, 기존 gate만 통과했다는 이유로 PASS하면 FAIL/BLOCKED |

### 권장 정량 기준의 해석

- `폭주기관차`는 “최고속도 상수 증가”가 아니라 **decision target이 전진하고, pre-contact speed가 유지되며, 실제 위치/거리 진행과 contact가 이어지는 것**으로 승인한다.
- S2의 수치는 역할 프로필에 맞게 설정하되, `desiredSpeed`와 실제 speed를 별도로 본다. `desiredSpeed=maxSpeed`인데 acceleration/충돌/다른 actor 때문에 실제 진행이 없는 경우도 실패 가능하다.
- S4의 nearest edge는 rectangle의 네 edge 중 ball과의 유클리드 거리가 가장 작은 edge의 bounded point다. edge를 향해 압박하되 zone rectangle 자체를 벗어나지 않는 것이 계약이다.
- 기존 QA50/100의 `uniqueSignatures`, collision run, reversal, severe anomaly threshold는 유지한다. 새 Sweeper gate를 기존 점수에 섞어 threshold를 낮추지 않는다.

## 3. Deterministic QA 시나리오

### D0 — 관측/fixture 위생

1. `MatchSimulation.default3v3Composition()`의 양 팀 Sweeper를 포함한다.
2. `start()` 후 fixed step을 실행한다. 초기 fixture의 ball/robot 배치만 설정하고 contact나 kick을 호출하지 않는다.
3. 각 tick에 robot/ball state와 events를 저장한다.
4. 실패 시 첫 failing tick에서 trace를 중단하되, seed와 직전 10 ticks를 함께 저장한다.

### D1 — zone 내부 직선 폭주 → contact → clear

- Blue Sweeper zone 중심에서 120px 떨어진 ball을 Sweeper 앞에 배치하고 ball은 정지 또는 약한 공격 방향 속도로 둔다. Orange도 y축 반사 fixture로 반복한다.
- 기대 순서: `HOLD_ZONE` (초기) → `INTERCEPT_STAGE` → `INTERCEPT` → `robot-ball-collision` → `CLEAR/kick` → `RETURN_TO_ZONE`.
- 검증: pre-contact `desiredSpeed`, per-tick displacement, 거리 감소, contact event의 위치와 clear event의 `causeContactTick`, non-zero impulse, 공격 방향 velocity를 모두 join한다.
- 반례: collider 밖이지만 sensing envelope 안인 ball을 별도 실행하여 kick/clear/contact가 0인지 확인한다.

### D2 — zone 외부 4방향 nearest-edge

- zone의 위/아래/왼쪽/오른쪽 바깥에 ball을 두고, 각 경우 ball→zone edge의 최소거리가 분명하도록 배치한다.
- 각 case에서 첫 intercept target이 nearest edge 쪽인지, 다른 edge나 stale home으로 가지 않는지 확인한다.
- Sweeper의 모든 position은 zone bounds 안이어야 한다. 120 fixed ticks 후 robot이 선택된 edge에 접근하고, ball까지의 전체 추적을 위해 zone 밖으로 나가지 않아야 한다.
- Blue/Orange를 y축 반사하고 `interceptReason` 및 target kind까지 비교한다.

### D3 — 경계 hysteresis / cooldown

- x축과 y축 각각에 대해 `boundary-1 → boundary+17 → boundary+19 → boundary+17 → boundary-1` 순서로 ball 위치를 바꾼다. 각 위치 사이에는 실제 fixed ticks를 둔다.
- band 내부 state-change와 target-change가 반복되지 않아야 한다. outer boundary를 넘은 경우에만 deliberate transition을 허용한다.
- clear 직후 cooldown 동안 동일 threat를 재입력해도 즉시 재dispatch하지 않는다.

### D4 — no teleport / fake velocity 강제 분리

- 로봇을 ball collider 밖, sensing envelope 안에 고정 가능한 초기 위치로 두고 한 fixed tick 진행한다.
- 기대: `robot-ball-collision=0`, `kick=0`, `clear=0`, ball `(vx,vy)` 변화 `0`.
- paired fixture에서만 실제 collider overlap을 만들고, contact 후 non-zero impulse와 clear를 확인한다.
- 매 tick `distance(robot[t], robot[t-1])`와 speed cap을 계산한다. 위치 jump나 max-speed 초과는 severe anomaly로 기록한다.

### D5 — 대칭성

- canonical Blue/Orange fixture를 y축 반사·팀 교환하여 같은 seed로 실행한다.
- state transition tick, contact tick, clear tick, return tick, event type/cardinality를 비교한다.
- 좌표/속도는 y/vy만 반사하고, clear 공격 방향은 팀 규칙에 맞춰 반전한다. 한 팀만 성공하는 경우 aggregate score가 비슷해도 FAIL이다.

### D6 — replay / chunking / checkpoint

- 동일 ScenarioSpec을 두 번 실행해 모든 Sweeper telemetry/event를 비교한다.
- 같은 실행을 `tick(1/60)`과 `tick(1/30)` 호출 단위로 나눠 대응 fixed tick을 비교한다.
- 180 ticks에서 checkpoint를 만들고 restore 후 180 ticks continuation을 원본과 비교한다.
- 비교 대상은 최종 score만이 아니라 state, target, position, velocity, contact/clear chronology다.

### D7 — goalkeeper regression

- GK를 양 팀 goal-line home에 두고, own-half incoming ball / own-half outgoing ball / distant ball / punch-range ball을 각각 실행한다.
- incoming + own Goal Area + proximity 조건 외에는 goal-line `targetY`를 유지한다.
- Sweeper의 zone intercept/clear가 발생해도 GK의 homeY/goal-line clamp, punch causality, conceded-goal 결과를 기존 계약과 비교한다.
- placed `homeY`를 의도적으로 오염한 fixture도 추가해 simulation-derived goal-line으로 복귀하는지 확인한다.

### D8 — 50 seed locked sweep

- seeds 1..50, canonical과 mirror를 모두 실행한다.
- seed별로 `firstSweeperInterceptTick`, `firstSweeperContactTick`, `clearCount`, `wrongDirectionClear`, `zoneExitCount`, `maxSpeedViolation`, `teleportDelta`, `goalkeeperStepOutCount`, `goalkeeperGoalLineViolation`, `severeAnomaly`를 기록한다.
- 하나라도 재현 가능한 causal failure가 있으면 `BLOCKED`; 성공률을 높이려고 실패 seed를 제외하지 않는다.

## 4. Deterministic telemetry 최소 schema

기존 `TelemetryFrame` 및 `SimulationEvent`를 이용하되, QA report는 다음 compact row를 반드시 남긴다.

```text
scenario, seed, tick, team, robotId, sweeperState, action,
robotX, robotY, robotVx, robotVy, ballX, ballY, ballVx, ballVy,
zoneLeft, zoneTop, zoneRight, zoneBottom, moveTargetX, moveTargetY,
distanceToBall, desiredSpeed, interceptReason, eventType,
causeContactTick, impulse, vxBefore, vyBefore, vxAfter, vyAfter,
goalkeeperHomeY, goalkeeperTargetY, anomaly
```

- `desiredSpeed`는 decision event의 `decision.desiredSpeed`에서 가져오며, frame에 없으면 `UNAVAILABLE`로 명시한다.
- event 위치와 telemetry의 actor/ball 위치를 같은 tick에 join하고, 근접 envelope를 collider contact로 재분류하지 않는다.
- report에는 첫 실패 row와 before/after velocity를 우선 보존한다. 매 tick 전체 dump만 남기고 causal row를 잃지 않는다.

## 5. Browser QA 시나리오 및 증거

### B1 — 실제 Test Lab pointer 경로

1. 앱의 visible mode control로 Test Lab에 진입한다.
2. Sweeper source card를 실제 pointer sequence로 field에 배치한다. source card count가 재사용 계약에 맞게 유지되는지 확인한다.
3. canvas의 Sweeper actor를 click하여 selection ring/inspector identity를 확인한다.
4. zone rectangle의 center를 actor와 비교하고, 실제 pointer drag로 zone 이동/resize한다. `before → resized`가 달라지고 render/tick 후에도 유지되는지 기록한다.
5. `경기 시작`의 실제 visible control을 눌러 live `start()`를 호출한다. 시작 후 zone이 lock되고 편집 pointer가 simulation을 변조하지 않아야 한다.

**증거:** 각 단계 screenshot, pointer page 좌표와 logical canvas 좌표, canvas bounding rect, selected ID, zone rectangle bounds, console/page errors.

### B2 — 실제 화면의 폭주기관차 장면

- deterministic scenario를 UI에서 선택/시작하고, 첫 `INTERCEPT_STAGE`부터 `INTERCEPT → contact → clear`까지 화면 녹화 또는 연속 screenshot을 남긴다.
- 화면상 actor가 zone 중심에서 nearest edge/ball 방향으로 실제 이동하고, contact 순간 전까지 급정지하지 않는지 본다.
- telemetry overlay/DEV QA hook을 사용한다면 browser가 관측한 `status=running`, tick, action/state, distance, desiredSpeed, event chronology를 함께 저장한다.
- canvas screenshot은 telemetry를 대체하지 않는다. 반대로 telemetry만 있고 실제 visible pointer/start 경로를 거치지 않았으면 browser PASS가 아니다.

### B3 — zone 외부 nearest-edge 시각 검증

- 공을 zone 밖 네 방향으로 배치하는 UI fixture를 각각 실행한다.
- overlay가 공을 덮어 ball/robot label을 가리지 않는지, Sweeper가 zone 밖으로 시각적으로 탈출하지 않는지 확인한다.
- nearest-edge target marker 또는 telemetry target이 실제 선택 edge와 일치하는지 screenshot과 event row를 함께 대조한다.

### B4 — 팀 반사 및 GK 동시 검증

- Blue fixture screenshot과 Orange mirror screenshot을 동일 viewport/scale로 캡처한다.
- Sweeper zone 색/위치/반사, actor trajectory, clear 방향을 비교한다.
- GK가 goal-line에 남아 있는 장면과 incoming ball에서 허용된 bounded step-out 장면을 별도로 캡처한다. Sweeper 화면이 보인다고 GK regression이 해결된 것으로 간주하지 않는다.

### B5 — browser failure handling

- console error, uncaught exception, canvas blank, stale bundle, missing QA telemetry, pointer event 미전달을 모두 별도 failure로 기록한다.
- DEV-only telemetry hook은 local debug evidence로 표기한다. production/deployed artifact에서 hook이 없으면 내부 chronology를 검증했다고 주장하지 않고 `UNVERIFIED`로 남긴다.
- synthetic `drop`, forced click, hidden DOM control, empty canvas screenshot은 setup evidence일 뿐 PASS evidence가 아니다.

## 6. Release gate / 보고 형식

### PASS

기존 test/typecheck/build와 locked seed QA가 PASS이고, S1–S12의 canonical·mirror·필수 regression이 PASS하며, D/B 증거가 모두 현재 artifact에서 재실행된다.

### BLOCKED

contact causality, no teleport/fake velocity, team symmetry, goalkeeper regression 중 하나라도 실패하거나, Sweeper zone 외부 계약을 실제 telemetry로 관찰할 수 없거나, browser의 visible start/pointer 경로가 재현되지 않으면 BLOCKED다. 실패를 threshold 완화로 덮지 않는다.

### 결과 row 예시

```text
STATUS=FAILED
scenario=D2_OUTSIDE_RIGHT_NEAREST_EDGE
seed=17 tick=84 robot=blue-1
expected=target nearest right edge; state INTERCEPT_STAGE
observed=target zone center; state HOLD_ZONE; distanceToBall unchanged
chronology=kickoff@1,state-change@...,no-contact,no-clear
browser=not-run
```

최종 보고서는 `deterministic result`, `browser result`, `telemetry evidence path`, `screenshot/video path`, `first failing seed/tick`, `failure classification`을 분리해 적는다. 구현이 완료되지 않은 현재 단계에서는 이 문서를 **acceptance contract**로만 사용하며, 어떠한 항목도 실행 PASS로 보고하지 않는다.
