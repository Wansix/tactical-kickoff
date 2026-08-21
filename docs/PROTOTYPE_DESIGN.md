# 자동 로봇축구 물리 우선 하이브리드 프로토타입 기획서

- 작성일: 2026-08-21
- 상태: 기획 확정 / 구현 전
- 대상: `tactical-kickoff`

## 1. 핵심 아이디어

플레이어는 경기 중 로봇을 직접 조작하지 않는다. 경기 전에 로봇 조합과 배치만 고른다. 각 로봇은 단순하고 약간 멍청한 Sense → Decide → Move → Kick 규칙을 실행한다.

공은 소유권이 없는 단일 물리 오브젝트다. 로봇의 몸 충돌이 공의 기본 움직임을 만들고, 일부 로봇의 제한적인 Kick Impulse가 드문 물리 사건을 재점화한다.

목표는 완벽한 자동 축구가 아니라 다음 경험이다.

> 단순한 로봇을 조합했더니 예상 밖의 물리 사고가 팀 전술처럼 보이고, 그 원인을 사후에 이해할 수 있다.

## 2. 순수 물리 vs 하이브리드

| 기준 | 순수 물리 | 물리 우선 하이브리드 |
|---|---|---|
| 재미 | 초기 난장판은 강하나 반복 시 단조로울 수 있음 | 충돌의 우연성과 킥 하이라이트를 함께 제공 |
| 로봇 다양성 | 질량·속도·마찰·크기 중심 | 이동 알고리즘과 킥 조건으로 확장 가능 |
| 가독성 | 결과 원인이 작고 연속적일 수 있음 | 킥 이벤트를 FX/로그로 읽을 수 있음 |
| 예측불가능성 | 가장 높지만 무작위처럼 느껴질 위험 | 의도와 사고를 함께 유지 |
| 전술 표현 | 제한적 | 조합에 따른 행동 차이가 더 잘 보임 |
| 관전성 | 중앙 개싸움/정지 위험 | 킥이 사건을 재점화해 하이라이트 생성 |
| 구현·QA | 상대적으로 단순 | fixed tick·충돌·킥 로그가 필요 |
| 장기 확장 | 물리 파라미터에 수렴할 위험 | 역할·킥 조건을 추가하기 쉬움 |

### 최종 추천

**물리 우선 하이브리드**를 선택한다.

- 로봇 이동·로봇 충돌·일반 공 충돌은 물리로 처리한다.
- 킥은 접촉 순간의 단일 추가 임펄스다.
- 공 소유권, 드리블 고정, 패스 의사결정, 자동 최적 조준은 MVP에서 금지한다.
- 킥은 골을 보장하는 기술이 아니라 정체된 물리에 에너지를 넣는 사건이다.

킥 방향을 골대에 자동 보정하거나, 공의 미래 위치를 계산해 완벽한 패스를 하기 시작하면 일반 축구 AI로 변질되므로 금지한다.

## 3. 프로토타입 경기 규칙

| 항목 | 확정값 |
|---|---|
| 인원 | **2v2** |
| 이유 | 현재 세로 필드에서 행동과 충돌을 읽기 쉽고 중앙 gridlock이 적음 |
| 후속 실험 | 3v3은 물리 샌드박스가 안정된 뒤 Phase 2 비교 모드로 추가 |
| 필드 | 세로 540×860 simulation field |
| 경기 시간 | 본 경기 90초 |
| 연장 | 0-0 또는 동점이면 20초 골든골 |
| 그 이후 | 무승부 |
| 플레이어 개입 | 경기 전 조합·배치 선택만. 경기 중 직접 조작 없음 |
| 공 | 1개, 지상 2D, 소유권 없음 |
| 골 | 골대 mouth 안에서만 판정 |
| 골 후 | 중앙, 속도 0, kickoff delay 후 재개 |
| pause/restart | 물리·시간·로그 상태를 명확히 보존/초기화 |

## 4. 공과 로봇 물리

### 공

- radius `10`
- mass `1.0`
- max speed `520 px/s`
- linear drag `0.88/s`
- wall restitution `0.70`
- 공 속도는 위치를 직접 대입하지 않고 충돌 impulse로 변경한다.

### 로봇 공통

- 원형 collider radius `20`부터 시작
- mass 기본 `2.0`, 허용 `1.2–3.5`
- max speed 기본 `100 px/s`, 허용 `70–135`
- acceleration `420 px/s²`
- braking `520 px/s²`
- robot restitution `0.25`
- ball restitution `0.55`
- fixed simulation tick `1/60 s`

몸체 shape는 시각적 역할 표현으로 먼저 사용한다. 실제 collider는 모두 원형으로 통일해 물리 버그를 줄인다. 차이가 충분히 보인 뒤에만 V자 범퍼나 복합 collider를 실험한다.

### 일반 충돌

접촉 시 법선과 상대 법선속도로 impulse를 계산한다.

```text
n = normalize(ball.position - robot.position)
vn = dot(ball.velocity - robot.velocity, n)
j = -(1 + restitution) * vn / (1/ball.mass + 1/robot.mass)
```

robot-ball 충돌이 공을 움직이는 기본 원인이다. robot-robot 충돌도 위치 밀어내기만 하지 않고 impulse와 반작용을 적용한다.

## 5. 킥 시스템 최소 설계

킥은 별도 소유권 시스템이 아니다. 실제 접촉 순간에만 일반 충돌에 추가 임펄스를 더한다.

### 발동 조건

모든 조건을 만족해야 한다.

- 로봇-공 거리 `≤ 32 px`
- 로봇 전면 기준 각도 `≤ 35°`
- 공이 전면 깊이 `≥ 18 px`
- 로봇의 킥 의도가 이번 tick에 존재
- kick cooldown/lockout/stun이 0
- 이동 중 킥 가능
- 공의 미래 위치나 골 확률을 참조하지 않음

### 방향과 파워

```text
aim = normalize(attackDirection * 0.65 + facing * 0.35)
Jkick = aim * power
```

초기에는 아군을 목표로 하는 명시적 패스 대신, 현재 이동 방향·충돌 법선·공격 방향의 혼합만 사용한다. 이것이 물리 사고를 보존한다.

- light: `70–120`
- medium: `110–190`
- heavy: `170–270`
- absolute cap: 일반 충돌의 약 `1.6배`, 어떤 경우에도 `2배` 초과 금지
- 킥 직후 공 max speed `520` clamp
- 킥 순간 로봇 정지 금지
- 킥 후 `0.08초` 동안 목표 속도의 55% 제동만 적용

### 쿨다운·연속 킥 방지

- 기본 robot cooldown `0.85초`
- 범위 `0.75–1.20초`
- kick lockout `0.10초`
- 킥커 재접촉 킥 금지 `0.18초`
- 공 kick immunity `0.12초`
- 같은 팀 연속 킥 lock `0.24초`
- 0.8초 안에 킥 3회 발생 시 다음 `0.20초` 킥 억제
- 한 tick의 킥 임펄스는 최대 1회
- 일반 충돌을 먼저 적용하고 킥 임펄스를 나중에 적용
- 공의 직접 `vx/vy` 대입 금지

## 6. 초기 로봇 6종

초기에는 6종만 구현한다. 알고리즘과 물리 차이를 동시에 과도하게 넣지 않기 위해 각 로봇의 몸체 차이는 mass/maxSpeed 정도로 제한한다.

| 로봇 | 이동 알고리즘 | 킥 | 약점 | 시너지 / 카운터 |
|---|---|---|---|---|
| Striker | 공 뒤 34px 공격 방향 접근점으로 돌진 | 정렬되면 medium 슛성 임펄스 | 몸싸움·후방 약함 | Bulwark와 조합 / Interceptor에 약함 |
| Bulwark | 자기 골-공 선분 차단점 유지 | light/medium 공격 방향 클리어 | 느리고 회전 느림 | Cannon 보호 / Scout에게 흔들림 |
| Scout | 공의 0.25초 예상 교차점 선점 | light 방향 전환 | 가볍고 충돌에 취약 | Striker 선행 압박 / Bulwark에 약함 |
| Dribbler | 공 측후방을 작은 곡선으로 따라감 | 약한 반복 임펄스, 준비시간 김 | 직선 슈팅 약함 | Scout가 공간 생성 / Interceptor가 측면 차단 |
| Cannon | 공 뒤 42px에서 느리게 정렬 | heavy, 긴 준비시간 | 준비 중 취약 | Bulwark가 시간 확보 / Scout가 압박 |
| Sweeper | 공-자기 골 사이 우선, 과도한 추격 금지 | medium/heavy 클리어 | 공격 전환 느림 | Cannon 수비 / 빠른 Striker에 끌려감 |

### Phase 2 후보

- Interceptor: 상대 킥선 차단
- Support: 아군 옆 지원점 유지

명시적인 패서·전진패서는 Phase 2로 미룬다. MVP에서 패스 대상 계산까지 넣으면 게임이 전략형 축구 AI로 빠르게 변질될 위험이 있다.

## 7. 조합 예시

- **Striker + Bulwark:** 가장 이해하기 쉬운 공격/수비 조합. 안정적이나 느림.
- **Scout + Cannon:** Scout가 난입하고 Cannon이 먼 거리에서 물리 사건을 만든다. Cannon 준비 중 취약.
- **Dribbler + Sweeper:** 공을 오래 살리고 수비적으로 버티지만 득점력이 낮다.
- **Striker + Cannon:** 공격적이고 킥 하이라이트가 많지만 후방이 비어 역습에 취약.
- **Scout + Scout:** 매우 빠르고 웃긴 충돌이 많지만 몸싸움에서 밀리고 공이 통제되지 않는다.

조합 변경이 실제 경기 양상을 바꾸는지 simulation seed sweep과 브라우저 관전으로 검증한다.

## 8. Emergent gameplay 사례

- 벽에 맞은 공이 핀볼처럼 돌아와 예상 밖 골
- 골대 모서리에서 튕긴 공이 다시 골문으로 진입
- 공이 골대와 로봇 사이에 끼었다가 작은 접촉으로 골
- 벽 반사 후 자기 진영으로 돌아오는 역습
- 멈춘 공이 로봇의 미세 접촉으로 갑자기 재가동
- 골라인 위에서 안팎을 반복하는 진자 장면
- 한 로봇이 밀려 두 번째 로봇을 치고 공까지 도미노 전달
- 아군이 킥 순간 뒤에서 충돌해 팀킬 방향 전환
- 세 로봇이 임시 벽을 만들었다가 한 충돌로 폭발
- 회전 중인 로봇에 맞아 공이 직선이 아닌 곡선으로 튐
- 밀려난 수비수가 의도하지 않게 세이브
- 수비 로봇의 반동이 자책골 생성
- 킥이 빗나가 골대 모서리를 타고 들어감
- 전진 중 뒤쪽 공을 건드려 뒤꿈치 킥 발생
- 충돌 중 킥 방향이 틀어져 우연한 패스처럼 보임
- 두 로봇의 짧은 킥 루프가 anti-chain 직전에 깨짐
- 벽 근처 킥이 다시 같은 로봇을 맞혀 재가속
- 킥 반동으로 로봇이 날아가고 공은 약하게 전진
- 빠른 Scout가 계속 돌진하다 경기장 전체를 폭주
- 수비벽 여러 대를 연속으로 맞은 공이 반대편으로 폭발
- 종료 직전 접촉으로 마지막 프레임 골
- 중앙 개싸움이 한 번의 비대칭 충돌로 갑자기 풀림

재미있는 사고는 원인을 어느 정도 추적할 수 있고, 매번 같지 않으며, 다음 판에 이용하거나 피할 수 있어야 한다. 같은 위치의 동일 루프, 3초 이상 정지, 벽 영구 고착은 버그다.

## 9. Emergent 플레이 판정

### 정상

- 로봇이 공을 추적하되 항상 같은 목표점에 겹치지 않음
- 접촉 방향이 매번 조금씩 달라짐
- 킥은 드물고, 킥보다 일반 충돌이 더 많은 공 이동을 만듦
- 양 팀 모두 공격 방향으로 공을 전진시킴
- 짧은 정지는 kickoff/pause/저속 sleep에서만 발생
- 조합에 따라 기억에 남는 사건이 달라짐

### 즉시 실패

- 공 또는 로봇이 NaN/Infinity
- 공이 영구 정지하거나 중앙에서 30초 이상 고착
- 동일 킥 루프 반복
- 킥 한 번으로 매 경기 결과 결정
- 벽·골대·로봇 관통
- 골 판정과 시각 위치 불일치
- 특정 조합 승률 65% 초과 고착
- 킥 없는 조합은 아무것도 못 함

## 10. 구현 구조

FSM보다 매 tick 우선순위 규칙을 사용한다.

```text
Sense(snapshot)
→ Decide(rule scores)
→ Move(acceleration/turn)
→ robot-robot collision
→ robot-ball collision
→ Kick candidate arbitration
→ optional single kick impulse
→ drag/clamp/goal sensor
→ telemetry/event snapshot
```

규칙 우선순위:

```text
P0 pause/finish/stun: HOLD
P1 자기 골 위험: CLEAR/BLOCK
P2 유효 킥 후보: KICK
P3 상대 킥 차단: INTERCEPT
P4 가장 가까운 공 압박: PRESS
P5 아군 지원: SUPPORT/COVER
P6 위치 복귀: RECOVER
P7 대기: LANE/IDLE
```

현재 action 문자열은 디버그/UI용으로만 사용하고, gameplay의 권위 상태로 사용하지 않는다. 각 tick에 hysteresis와 action lock만 두어 떨림을 방지한다.

## 11. 시뮬레이션 검사와 첫 플레이테스트

### 로그

매 fixed tick 또는 10Hz 샘플에 다음을 저장한다.

- seed, commit, tick, elapsed, status
- ball x/y/vx/vy
- robot별 id/team/role/x/y/vx/vy/target/action
- robot-ball·robot-robot collision
- impulse before/after
- kick candidate/winner/cooldown/chainCount
- goal/reset/kickoff
- 중앙 고착·벽 고착·정지 구간

### 자동 지표

- 60초 동안 양 팀 공 공격축 진행 `≥300px`
- 30초 중앙 고착 seed `0/100`
- 의미 없는 정지 시간 전체의 `≤10%`
- 같은 루프 경기 `≤5%`
- 특정 조합 승률 `≤65%`
- 동일 seed telemetry/event trace 동일
- 충돌 없는 공 속도 변화 0건

### 플레이테스트 질문

- 가장 기억에 남는 장면은 무엇인가?
- 왜 공이 그 방향으로 갔다고 생각했는가?
- 조합 선택이 결과에 영향을 줬다고 느꼈는가?
- 킥이 너무 강하거나 장식처럼 느껴졌는가?
- 다음 판에 조합을 바꾸고 싶은가?
- 공이 멈춘 시간이 기다릴 만했는가?
- 이 게임을 친구에게 한 문장으로 어떻게 설명할 것인가?

합격 기준:

- 70% 이상이 기억에 남는 장면 설명
- 60% 이상이 원인 대략 설명
- 60% 이상이 첫 판 후 조합 변경
- 킥이 결과를 직접 결정했다고 느끼는 사람 `≤30%`
- 공 무의미 정지 시간 `≤10%`
- 특정 조합 승률 `≤65%`

## 12. MVP에서 금지할 것

공 소유권, 드리블 고정, 명시적 패스, 자동 조준, 골대 방향 보정, 최적 경로 탐색, 전술 포메이션, 공중볼, 점프, 스태미나, 성장, 아이템, 스킬트리, PvP 서버, 랭크, 과금, 숨은 승률 보정, 화면 밖 물리 보정, 리플레이용 가짜 연출을 넣지 않는다.

## 13. 위험 요소

- 킥이 너무 강하면 일반 축구 AI처럼 보임
- 킥이 너무 약하면 의미 없는 장식이 됨
- 순수 충돌만으로는 공 정지와 중앙 고착 가능
- 2v2는 가독성은 좋지만 조합 다양성이 제한됨
- 원형 몸체만으로는 로봇 개성이 약할 수 있음
- 3v3 이상은 현재 필드에서 혼잡도가 빠르게 증가
- fixed-step과 impulse 순서가 틀리면 결정론·재현성이 깨짐

## 14. Gemini 독립 검토

Gemini 2.5 Flash의 독립 의견:

- 물리-first 조건부 킥 하이브리드가 가장 적합
- 킥은 접촉 프레임에서만 발동하는 임펄스 왜곡이어야 함
- 소유권·자석 드리블 금지
- 전면 킥 아크 약 60도, cooldown 약 2.5초 후보
- 킥은 일반 충돌의 1.3~1.6배부터 시작하고 2배를 넘기지 않음
- 2v2는 단순할 수 있지만 현재 MVP에서는 3v3보다 안정적이고 가독성이 좋음
- 3v3은 물리 샌드박스 안정화 후 비교 실험

기획팀은 Gemini의 2.5초 cooldown보다 구현 스펙의 기본 `0.85초`를 우선 채택한다. 2.5초는 Cannon급 특수 킥 또는 밸런스 실험값으로 남긴다.

## 15. 기획팀 최종 결론

**2v2 물리 우선 하이브리드**로 첫 프로토타입을 만든다.

공은 항상 물리 오브젝트이고, 로봇은 몸으로 공을 밀고 튕긴다. 제한적인 킥은 실제 전면 접촉에서만 발생하며, 방향과 파워를 조금 보정할 뿐 공을 소유하거나 완벽히 조준하지 않는다.

첫 목표는 승률이 아니라 “조합을 바꿔 다른 물리 사고를 보고 싶다”는 재시도다.

## 16. 첫 버전 정확한 스펙

```text
field: 540×860 portrait
teams: 2v2
match: 90s + 20s golden goal if tied
player input: pre-match roster/deployment only
ball: radius 10, mass 1, maxSpeed 520, drag 0.88/s
robot: circle radius 20, base mass 2, base maxSpeed 100
physics: fixed 1/60s, deterministic order
kick: contact-only, distance <=32, front angle <=35°, depth >=18px
kick power: light 70–120, medium 110–190, heavy 170–270
kick cap: normal collision multiplier 1.6x, hard cap 2.0x
cooldown: base 0.85s, class range 0.75–1.20s
anti-chain: same-team 0.24s, one kick/tick, ball immunity 0.12s
robots: Striker, Bulwark, Scout, Dribbler, Cannon, Sweeper
ownership: none
pass target: none in MVP
post-goal: center, zero velocity, kickoff delay
```

## 17. 구현 순서

- 물리 샌드박스: 공·로봇·벽·골대·fixed tick·충돌 시각화
- robot-ball/robot-robot impulse와 deterministic collision ordering
- goal sensor·goal reset·kickoff state
- tick telemetry/event log와 simulation analyzer
- 순수 물리 baseline과 hybrid kick A/B 비교 모드
- 초기 6종을 하나씩 추가하며 행동 차이 검수
- seed sweep·deadlock·balance 분석
- Game Director simulation trace review
- 브라우저 START/PAUSE/RESTART/실제 플레이 검수
- Tech Lead 승인 후에만 커밋·push·main 병합

이 문서의 구현 전제는 기존 UI/골 판정 수정과 분리한다. 물리-first 구현은 별도 feature 단계이며, 기존 코드의 직접 ball velocity 대입은 새 물리 단계에서 제거해야 한다.
