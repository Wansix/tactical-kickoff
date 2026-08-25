# Simulation QA 회의안: 체감 버벅임·재진입·인과성 Red Tests

## 1. 목적과 게이트 분리

- **문제:** 기존 QA50/100은 `unique signatures`, max collision run, direction reversal, severe anomaly를 통과해도 같은 팀이 서로 밀어 느려지는 체감 문제와 충돌 후 재진입 실패를 놓칠 수 있다.
- **원칙:** 아래 테스트는 기존 QA50/100의 지표·임계치를 변경하지 않는 **추가 QA-UX/인과성 계약**이다.
- **실행:** `MatchSimulation`의 실제 `start()` + `tick(1/60)` 고정 스텝, `getTelemetry()`/`getEvents()`만 관측한다. 상태 주입은 fixture 초기 배치·속도 설정에만 허용하고, 접촉/킥/공 속도 변경을 직접 호출하지 않는다.
- **Red 상태:** 테스트를 먼저 추가하고 현재 구현에서 실패하는지 확인한다. 실패를 숨기기 위해 seed, 충돌 이벤트, anomaly 제외 목록, 기존 QA50/100 임계치를 완화하지 않는다.

## 2. Red Test A — 로봇-로봇 1회 충돌 후 공을 향한 재진입

### Fixture

- `REENTRY_AFTER_SINGLE_ROBOT_COLLISION`.
- 2v2 `blue: ['striker','scout']`, `orange: ['striker','scout']`; 공은 중앙에서 한쪽 striker가 접근하도록 배치한다.
- 두 로봇을 고정된 수평/대각 접근 경로에 두어 **동일 pair의 실제 `robot-robot-collision` 1회**가 발생하게 한다. 반대편 로봇은 공에서 충분히 멀리 둔다.
- 충돌 전후 telemetry와 event chronology를 기록한다. 충돌 직전 10 ticks와 이후 60 ticks를 별도 trace로 보존한다.

### 판정 계약

충돌 이벤트 `c`와 해당 pair `(a,b)`마다:

1. **단일 충돌:** `c.tick+1..c.tick+60`에 같은 pair의 `robot-robot-collision`이 없어야 한다. 즉, 재접촉 간격 최소 60 fixed ticks(1초).
2. **재진입:** 충돌한 각 로봇은 `c.tick+30..c.tick+60` 중 최소 1개 tick에서 `action === 'PRESS'` 또는 공을 향한 명시적 접근 상태가 되고, 그 tick의 이동 벡터와 `ball - robot` 벡터 내적이 `> 0`이어야 한다.
3. **실제 진행:** 재진입 구간의 시작/끝 공-로봇 거리가 `>= 20px`(한 fixed step 이상) 감소하거나, 10-tick rolling distance가 `>= 20px` 감소해야 한다. 단순히 facing/target만 바뀌고 위치가 그대로인 것은 통과로 보지 않는다.
4. **속도 회복:** 충돌 후 60 ticks 안에 해당 로봇의 평균 속도 `>= 0.35 * maxSpeed`인 10-tick window가 적어도 1개 있어야 한다. `maxSpeed=0` fixture는 별도 저속 회귀로 분리한다.
5. **공 인과성:** robot-robot collision event가 발생한 tick에서 공의 `(vx,vy)` 변화는 `<= 1e-9`이어야 하며, 그 event 자체에 ball impulse/ball velocity before-after를 기록하지 않는다. 공 속도 변화가 있으면 같은 tick의 `robot-ball-collision` 또는 `kick`가 먼저/같이 존재해야 한다.

### Acceptance threshold

- canonical fixture: 위 5개 조건 **100% pass**, 같은 pair 재접촉 **0회**, 공의 비인과적 속도 변경 **0회**.
- seed sweep 1..50: fixture 성공률 **>= 49/50**; threshold 미달 또는 재현 가능한 실패 seed가 있으면 release **BLOCKED**, 원인 분류 후 수정한다. 기존 QA50의 49/50 의미를 대체하지 않는다.
- 대칭 fixture(blue/orange 교환)도 동일 임계치.

## 3. Red Test B — 같은 팀 2v2 교착/느린 이동

### Fixture matrix

`SAME_TEAM_APPROACH_2V2`를 같은 팀 접근 fixture로 고정한다. 공은 상대 골 방향이 아닌 중앙/자기 진영 경계에 두고, 같은 팀 두 로봇의 초기 위치·속도를 서로 다른 각도로 공에 접근시킨다. 반대 팀은 공과 250px 이상 떨어뜨려 로봇-공 상호작용을 방해하지 않게 한다.

- B1: `blue:['striker','striker']` vs `orange:['scout','scout']`
- B2: `blue:['striker','scout']` vs `orange:['scout','scout']`
- B3: `blue:['striker','striker']`에서 두 striker가 같은 ball target을 공유하는 정면 접근
- 각 fixture에 좌우/상하 mirrored variant를 추가한다.

### 관측량

- actor별 위치 이동량, 10/30-tick 평균 속도, 공까지 거리 감소량, `moveTargetX/Y`, action/state run, 같은 팀 collision pair와 collision tick.
- `detectAnomalies()`의 `local-stuck`, `state-stuck`, `target-thrash`는 보조 신호로 사용하되, 통과의 유일한 근거로 삼지 않는다.

### Acceptance threshold

- 활성 로봇(골키퍼 및 `RESET/COVER` 전용 actor 제외) 2명 모두:
  - 180 ticks(3초) 내 위치 이동량 **>= 80px** 또는 공까지 거리 **>= 60px 감소**;
  - 어느 30-tick window에서도 평균 속도 **< 0.10 * maxSpeed**가 2회 이상이면 실패;
  - 60 consecutive ticks 동안 위치 폭/높이 **< 10px**이고 평균 속도 **< 5px/s**이면 실패;
  - `target-thrash` **0건**, `state-stuck` **0건**.
- 같은 팀 동일 pair의 충돌 연속 run은 **최대 1 tick**, 60 ticks 동안 재접촉 **0회**. 기존 QA100의 global max collision run gate와 별도로 pair별 UX 계약을 추가한다.
- B1/B2/B3 및 mirror variant **각각 100% pass**; seed 1..50 sweep에서 fixture별 **>= 48/50**. 실패는 “접촉이 있었으므로 이동”으로 면책하지 않는다.
- 공 속도는 robot-robot collision만으로 바뀌지 않아야 한다(비인과 변화 0).

## 4. Red Test C — 대칭성·결정성·실제 접촉 인과

### C1. 대칭성

- `MIRROR_2V2_STRIKER_SCOUT`: 동일 seed와 동일 초기 state에서 Blue/Orange를 교환하고 y를 `field.height - y`로 반사한다. x는 유지한다.
- 역할·slot·공 초기 속도도 y축 반사하고 공격 방향만 팀 규칙에 따라 반전한다.
- event는 `ids`의 팀 prefix를 교환하고, 좌표/속도 y 성분을 반사해 비교한다.

**Threshold:** fixed tick 0..360에서 대응 actor/ball의 `x` 오차 `<=1e-6`, 반사 `y`/`vy` 오차 `<=1e-6`; event type, tick, pair cardinality, kick/contact chronology가 100% 일치. score/kick 팀도 교환되어야 한다. 50 seed 중 **50/50**.

### C2. 결정성

- 같은 `ScenarioSpec`·seed를 두 번 실행하고 `replayEquivalent`/`replayDiff`로 telemetry와 event를 비교한다.
- 같은 실행을 `tick(1/60)` 단위와 `tick(1/30)` 두 번 단위로 각각 수행해 fixed-step 결과를 비교한다.
- checkpoint 180 ticks에서 restore 후 180 ticks를 진행한 trace도 원본 continuation과 비교한다.

**Threshold:** 동일 입력 재실행 및 checkpoint replay는 `replayDiff.equal === true`, first divergence `null`; chunking 차이도 대응 fixed tick에서 오차 `<=1e-9`. 50 seed 전부 pass.

### C3. 실제 접촉 인과

- `kick`가 있는 모든 사례에서 `causeContactTick`가 존재하고, 동일 robot의 실제 `robot-ball-collision` tick이며 `0 <= kick.tick-causeContactTick <= 1`.
- contact 없는 kick, aim/target만으로 발생한 ball impulse, robot-robot event만으로 발생한 ball `(vx,vy)` 변화는 금지.
- 무접촉 접근 fixture에서는 180 ticks 동안 `robot-ball-collision`/`kick`가 0이고 공 속도 변화도 0이어야 한다.

**Threshold:** canonical + mirror + seed 1..50에서 kick/contact causal violation **0건**; 모든 ball velocity delta는 같은 tick의 물리 contact/kick event와 일치해야 한다.

## 5. 기존 QA50/100과의 병합 규칙

- 기존 결과 필드(`uniqueSignatures`, `maxCollisionRun`, `maxDirectionReversalRun`, `severeAnomalies`)와 기존 임계치는 그대로 유지한다.
- 새 결과는 별도 namespace로 보고한다: `reentry`, `sameTeamMobility`, `symmetry`, `determinism`, `causality`.
- **PASS 조건:** 기존 QA50/100 PASS **그리고** 본 red-test suite의 모든 canonical threshold PASS. 새 suite를 기존 signature 수에 합산하거나, 기존 collision run 계산에서 충돌을 삭제해 통과시키지 않는다.
- 실패 보고는 `scenario / seed / tick / event chronology / before-after telemetry` 최소 행으로 남긴다. 첫 실패 tick에서 trace를 중단해 재현성을 보장한다.

## 회의 결론 제안

1. 위 A/B/C를 먼저 red로 추가한다.
2. 공 속도는 robot-robot collision이 직접 변경하지 않는 불변식을 최우선으로 고정한다.
3. 같은 팀 2v2는 “충돌이 적다”가 아니라 **각 actor의 실제 이동·거리 진행**으로 판정한다.
4. 기존 QA50/100 gate는 회귀 보호용으로 유지하고, 본 suite는 체감 성능·대칭성·결정성·인과성의 release blocker로 병렬 운영한다.
