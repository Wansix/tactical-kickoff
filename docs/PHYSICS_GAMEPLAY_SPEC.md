# Robot Soccer Physics / Gameplay Spec v0.1

> 프로토타입 기준: 540×860 field, fixed 1/60 s simulation, top-down 2D. 길이 단위는 px, 시간은 s, 속도는 px/s, 질량은 임의 mass unit이다.

## 1. 목표와 기본 원칙

- 공은 소유권이 없는 물리 오브젝트다. 로봇은 `Sense → Decide → Move → Kick` 순서로 매 tick 계산한다.
- 일반 접촉은 물리 충돌 임펄스로만 공을 움직인다.
- 킥은 공의 위치/속도를 직접 대입하지 않고, 유효한 접촉 순간에 추가 임펄스를 한 번 적용한다.
- 모든 판정은 fixed-step에서만 수행한다. 한 tick의 결과는 로봇 배열 순서와 무관하게 결정론적이어야 한다.
- Blue의 공격 방향은 `(0,-1)`, Orange의 공격 방향은 `(0,+1)`이다.

## 2. 공·로봇 기본 물리 파라미터

### 2.1 공

| 파라미터 | 기본값 | 설명 |
|---|---:|---|
| radius | 10 | 원형 collider 반지름 |
| mass | 1.0 | 임펄스 계산 기준 |
| maxSpeed | 520 | 어떤 충돌/킥 뒤에도 clamp |
| linearDrag | 0.88/s | 기존 모델과 호환: `v *= pow(0.88, dt)` |
| wallRestitution | 0.70 | 좌우/골라인 외곽 반발 |
| groundFriction | 0.985/tick | 선택 사항. 기본은 drag만 사용 |

공의 운동은 `p += v*dt`, 이후 drag를 적용한다. 속도는 매 tick `length(v) <= 520`으로 제한한다.

### 2.2 로봇 공통

| 파라미터 | 기본값 | 허용 범위 | 설명 |
|---|---:|---:|---|
| radius | 20 | 16–24 | 로봇-로봇 최소 중심거리 = 합산 radius |
| mass | 2.0 | 1.2–3.5 | 무거울수록 밀리지 않고 공에 주는 일반 충돌량도 커짐 |
| maxSpeed | 100 | 70–135 | 이동 속도 |
| acceleration | 420 | 250–650 | 목표 속도까지 가속 |
| braking | 520 | 300–800 | 목표 변경/정지 시 감속 |
| maxTurnRate | 540°/s | 240–900°/s | 전면 방향 회전 |
| bodyRestitution | 0.25 | 0.1–0.6 | 로봇-로봇 반발 |
| ballRestitution | 0.55 | 0.35–0.8 | 로봇-공 충돌 반발 |
| bodyFriction | 0.90 | 0.75–0.97 | 로봇 접촉 시 접선 속도 보정 |
| contactOffset | 1 | - | collider 겹침 방지 여유 |

로봇 몸체는 원형 collider로 시작한다. 시각적으로만 클래스별 shape를 달리하고, 불공정한 모서리 끼임이 관찰될 때만 `circle + facing wedge`의 복합 collider로 확장한다.

## 3. 로봇-공 접촉과 일반 충돌

접촉 조건은 `distance(robot, ball) <= robot.radius + ball.radius + 1`이다.

1. 법선 `n = normalize(ball.pos - robot.pos)`를 계산한다.
2. 상대 법선속도 `vn = dot(ball.v - robot.v, n)`가 음수일 때만 충돌 임펄스를 적용한다.
3. `j = -(1+e)*vn / (1/ball.mass + 1/robot.mass)`.
4. `ball.v += n * j / ball.mass`; 로봇도 반대 방향 임펄스를 받는다.
5. 겹침은 inverse-mass 비율로 positional correction 한다.
6. 공 속도는 최종적으로 `maxSpeed`에 clamp 한다.

실제 구현에서는 킥 판정 전의 `v`를 `preContactBallVelocity`로 보관한다. 한 tick에 공에 대한 일반 충돌은 각 접촉자당 최대 1회만 처리한다.

## 4. 킥 발동 조건

킥은 공이 로봇 전면에 있는 명확한 접촉 기회일 때만 허용한다. 전면 벡터 `facing`은 현재 로봇의 회전 방향이다.

### 4.1 공 기준 조건

- 전면 각도: `angle(facing, ball - robot) <= 35°`.
- 킥 거리: 중심거리 `d <= 32 px` (기본 합산 반지름 30 + 여유 2).
- 전면 깊이: `dot(ball - robot, facing) >= 18 px`.
- 공의 상대 접근/근접 조건: `dot(ball.v - robot.v, facing) <= 180 px/s` 또는 일반 충돌이 이번 tick에 발생해야 한다.
- 로봇이 `stunTimer <= 0`, `kickCooldown <= 0`, `kickLockout <= 0`이어야 한다.
- 킥 의도는 해당 tick의 Decide 결과에 있어야 한다. 단순히 범위 안에 들어왔다고 자동 킥하지 않는다.

### 4.2 의도(aim) 조건

`aim = normalize(attackDirection * 0.65 + desiredTargetDirection * 0.35)`로 시작한다.

- 공격/슈터 계열은 `attackDirection` 가중치를 0.35까지 낮춰 목표 조준을 허용한다.
- 수비형은 기본 `attackDirection` 0.80을 사용한다.
- `angle(facing, aim) <= 25°`일 때만 킥한다. 아니면 Move가 먼저 회전한다.
- 목표는 골 중앙, 전방 지원점, 또는 가장 가까운 안전한 side-lane 중 하나다. 상대 로봇을 관통하는 aim은 금지한다.

### 4.3 이동 중 킥

- 이동 중 킥은 허용한다.
- 킥 시점의 이동 속도는 킥 임펄스에 20%만 전달한다: `carry = clamp(dot(robot.v, aim), -100, 100) * 0.20`.
- 정면으로 전진 중인 경우 킥이 약간 강해지고, 옆으로 미끄러지는 경우 방향이 무너지지 않는다.
- 킥 유효 판정 후 로봇 이동을 즉시 멈추지 않는다. 대신 `kickBrakeTimer = 0.08` 동안 목표 속도의 55%를 사용한다.
- 따라서 킥 순간 정지는 **하지 않는다**. 시각적 readability를 위해 1 frame(16.7 ms) 동안 animation/FX만 강조한다.

## 5. 킥 power와 적용식

각 로봇은 `kickPowerMin`, `kickPowerMax`를 갖는다. 실제 power는 접촉 품질에 따라 계산한다.

```text
quality = 1 - clamp((angle(facing, aim) / 35°), 0, 1) * 0.35
alignment = clamp(dot(facing, normalize(ball-robot)), 0, 1)
charge = robot.kickCharge            // 0..1, 클래스별 준비 규칙
power = lerp(minPower, maxPower, charge) * (0.70 + 0.30*quality) * (0.80 + 0.20*alignment)
```

킥 임펄스는 `Jkick = aim * power`로 해석한다. 공에는 `ball.v += Jkick / ball.mass`를 적용하되, 이는 직접 속도 설정이 아니라 impulse다.

| 등급 | power 범위 | 체감 역할 |
|---|---:|---|
| light | 70–120 | 방향 전환/짧은 패스 |
| medium | 110–190 | 표준 패스/압박 탈출 |
| heavy | 170–270 | 슈팅/클리어 |
| burst | 240–330 | 강력하지만 긴 cooldown |

기본 로봇은 medium을 사용한다. 한 킥으로 공 속도가 520을 넘으면 520으로 clamp한다. power는 양 팀에 동일한 등급이면 동일하게 취급한다.

## 6. cooldown, lockout, anti-chain

### 6.1 기본 시간

- 로봇별 `kickCooldown`: 킥 직후 0.85 s. 기본형은 0.75–1.20 s 범위.
- 로봇별 `kickLockout`: 킥 후 0.10 s 동안 재킥 불가.
- 공 `kickInvuln`: 킥 후 0.12 s 동안 **킥 임펄스만** 재적용 불가. 일반 충돌은 적용하되 power를 추가하지 않는다.
- 킥커의 재접촉 방지: 같은 로봇은 킥 후 0.18 s 동안 공에 대한 킥 후보에서 제외한다.

### 6.2 anti-chain 규칙

1. `ball.lastKickTeam`과 같은 팀은 마지막 킥 후 0.24 s 동안 두 번째 킥을 할 수 없다.
2. 예외: 공이 마지막 킥 지점에서 40 px 이상 이동했거나, 상대 로봇과 유효 충돌을 겪었으면 팀 lock을 해제한다.
3. 같은 tick에 여러 로봇이 킥 가능하면 후보를 `valid > distanceToBall > rolePriority > stableId` 순으로 정렬해 1명만 승인한다.
4. 한 tick에 공에 적용 가능한 킥 임펄스는 최대 1회다.
5. 0.8 s 안에 킥 이벤트가 3회 발생하면 네 번째부터 0.20 s 동안 킥을 억제한다. 일반 물리 충돌은 계속한다.
6. 벽 반사 직후의 가짜 핑퐁을 막기 위해 벽 충돌 뒤 0.06 s 동안 같은 방향 반대편 킥 power를 50%로 낮춘다.

이 규칙은 “A가 차고 B가 즉시 되받아 중앙에서 고정”되는 루프를 막되, 상대가 가로채면 정상적인 연속 플레이를 허용한다.

## 7. 충돌 + 킥 동시 처리 순서

fixed tick의 authoritative 순서는 다음과 같다.

```text
1. Sense: 이전 tick 상태에서 센서 스냅샷 생성
2. Decide: 모든 로봇의 우선순위 규칙 평가, MoveIntent/KickIntent 생성
3. Move: 가속·회전·경계 처리 전의 목표 속도 계산
4. Robot-Robot broad phase 및 positional correction
5. Robot-Ball 일반 충돌 임펄스 계산 (접촉자 stableId 순)
6. Kick 후보 검증 및 승자 1명 선택
7. 승자의 킥 임펄스 1회 적용
8. 공/로봇 속도 clamp, drag, 남은 위치 적분
9. goal sensor 판정 및 이벤트 로그 기록
10. cooldown/timer 감소, snapshot 생성
```

킥 후보는 일반 충돌 결과 후의 위치를 사용하지만, 각도/의도 판정에는 Sense 시점의 공 위치와 로봇 facing을 사용한다. 같은 tick에 일반 충돌과 킥이 모두 발생하면 **일반 충돌 먼저, 킥 추가 임펄스 나중**이다. 킥은 일반 충돌을 대체하지 않는다.

## 8. 초기 로봇 8종

수치는 공통 몸체 기준에서의 차이이다. `S/D/M/K`는 Sense/Decide/Move/Kick을 뜻한다.

| 로봇 | 몸체·수치 | Sense | Decide | Move | Kick | 약점 | 시너지 | 카운터 |
|---|---|---|---|---|---|---|---|---|
| **Striker** | r20, mass 2.0, max 115, accel 500, 110–210, CD 0.85s | 공·골·상대 최근접, 전방 35° | 골 진행 가능하면 SHOOT, 아니면 공 압박, 위험 시 후퇴 | 공 뒤 34px의 공격 방향 접근점 | medium, aim 골/side-lane, charge 0.75 | 몸싸움 약함, 후방 커버 빈약 | Anchor, Support | Bulwark의 몸막기, Interceptor의 측면 차단 |
| **Bulwark** | r23, mass 3.2, max 78, accel 300, 90–150, CD 1.0s | 자기 골대 180px, 공 속도, 적 진입 | 골대 위험 > 공 차단 > 전진 | 골대-공 선분 위 차단점, 좁은 lane 유지 | light/medium, 0.9× 몸싸움, 공격 방향 클리어 | 느리고 회전 느림 | Cannon의 전방 스크린 | Scout가 뒤를 흔들고 반대편 전환 |
| **Scout** | r18, mass 1.4, max 135, accel 650, 80–135, CD 0.75s | 넓은 반경 공/상대 위치, 빈 공간 | 공 선점 또는 상대 킥각 차단 | 공의 예상 0.25s intercept point | light, 짧은 터치·각도 전환 | 충돌에 튕김, 파워 부족 | Striker의 선행 압박 | Bulwark, 넓은 벽 플레이 |
| **Dribbler** | r19, mass 1.8, max 105, accel 420, 100–170, CD 0.70s | 공 상대속도, side-lane 여유, 근접 적 2명 | 적 2명 이상이면 탈출 킥, 아니면 공 주변 곡선 접근 | 공의 측후방을 유지하며 작은 호를 그린다 | light/medium, 0.6s 준비, 15° aim 보정 | 긴 직선 슈팅 약함 | Scout의 공간 창출 | Interceptor가 side-lane 차단 |
| **Cannon** | r21, mass 2.4, max 88, accel 360, 190–300, CD 1.25s | 골까지 거리, 장애물, 공 정지 시간 | 정렬된 장거리면 CHARGE, 아니면 Anchor | 공 뒤 42px까지 느리게 정렬, 무리한 추격 금지 | heavy, charge 0.6–1.0, aim 오차 ±12° | 준비 중 취약, 근거리 대응 느림 | Bulwark가 시간 벌기 | Scout의 빠른 압박, 측면 충돌 |
| **Interceptor** | r19, mass 2.0, max 120, accel 560, 110–190, CD 0.90s | 상대 킥 의도/공 진행선/두 번째 공 경로 | 상대가 킥 가능하면 차단, 아니면 전환 | 공과 상대 사이의 선분을 가로지른다 | medium, 상대 방향 반대 클리어 | 공 소유 전진력이 낮음 | Bulwark, Counter 전술 | Dribbler의 지연, Cannon의 긴 power |
| **Support** | r20, mass 1.9, max 98, accel 400, 80–160, CD 0.80s | 아군-공 거리, 패스 lane, 아군 전방 위치 | Striker가 공을 가지면 지원, 아니면 cover | 공격 방향 90–130px 옆 지원점, 공과 겹치지 않음 | light/medium, 0.7 charge, 25° side aim | 단독 득점력 낮음 | Striker/Dribbler, 삼각 패스 | Bulwark의 좁은 수비, 고립 압박 |
| **Sweeper** | r22, mass 2.6, max 92, accel 380, 120–200, CD 0.95s | 자기 진영 공 속도, 벽/골대 반사 위험, 뒤 공간 | 위험 공이면 즉시 clear, 아니면 중앙 복귀 | 공과 자기 골 사이를 우선, 160px 이상 추격 금지 | medium/heavy, 0.85× 방향 안정성, 긴 클리어 | 전방 공격 전환 느림 | Cannon, Anchor류 | 빠른 Striker의 재압박, side switch |

### 8.1 KickCharge 규칙

- Striker/Scout/Interceptor/Support: 공이 유효 범위에 들어온 tick부터 0.15 s에 1.0까지 선형 충전.
- Dribbler: 0.30 s에 1.0, 단 power는 light 상한 135.
- Cannon: 0.60 s에 1.0. 이동/회전 중에는 charge가 0.5/s로 감소.
- Bulwark/Sweeper: 즉시 0.8 charge, 목표는 항상 공격 방향 또는 안전한 측면.

## 9. FSM이 아닌 우선순위 규칙 구조

상태 이름을 전환하는 FSM 대신 매 tick 독립적으로 점수를 계산한다. 단, `actionLock`과 hysteresis만 사용해 떨림을 막는다.

### 9.1 공통 우선순위

```text
P0  match paused/finished 또는 stun > 0       → HOLD
P1  goal line imminent / 자기 골 위험          → CLEAR 또는 BLOCK
P2  내가 유효 킥 후보이고 적보다 먼저 처리 가능 → KICK
P3  상대가 0.20s 내 킥 가능, 차단 가능         → INTERCEPT
P4  공이 160px 내이고 내가 가장 가까움          → PRESS
P5  아군이 공을 압박 중                         → SUPPORT/COVER
P6  전술 위치 이탈                              → RECOVER
P7  그 외                                      → LANE/IDLE
```

각 규칙은 `score = basePriority + urgency + roleBonus - distancePenalty - lockPenalty`로 평가한다. 가장 높은 점수를 선택하되 현재 의도보다 새 점수가 12점 이상 높을 때만 교체한다. 동일 점수는 `distance`, `rolePriority`, `stableId` 순으로 결정한다.

### 9.2 의사코드

```ts
const observations = sense(snapshot, robot);
const candidates = rules
  .filter(rule => rule.guard(observations))
  .map(rule => ({ intent: rule.intent(observations), score: rule.score(observations) }))
  .sort(byScoreDistanceRoleId);

const chosen = candidates[0] ?? recoverIntent(observations);
const move = moveController(chosen, observations, dt);
const kick = kickController(chosen, observations, cooldowns);
```

`Sense`는 순수 함수, `Decide`는 부작용 없음, `Move`와 `Kick`만 intent를 소비한다. 로봇별 현재 action 문자열은 디버그/UI용이며 gameplay의 권위 있는 상태가 아니다.

## 10. 튜닝 기준과 검증 로그

초기 밸런스 목표:

- 정지 공의 일반 충돌 후 속도: 40–120 px/s.
- light 킥의 평균 이동 속도: 100–180 px/s.
- heavy 킥의 평균 이동 속도: 260–420 px/s.
- 한 로봇의 킥 빈도: 경기 중 평균 0.6–1.3회/s 이하.
- 같은 팀 연속 킥 간격: 평균 0.24 s 이상.
- 중앙에서 30 s 이상 정체하는 경기 0건/100 seed.
- 60 s 시뮬레이션 동안 양 팀 모두 최소 1회 공격 방향으로 300px 이상 공 진행.

각 이벤트에 `tick, ballPos, preBallVel, postCollisionVel, kickerId, aim, power, cooldown, chainCount`를 기록한다. 밸런스 변경은 이 로그와 deterministic seed replay로 비교한다.
