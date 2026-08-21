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
