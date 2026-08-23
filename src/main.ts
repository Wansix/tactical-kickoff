import * as Phaser from 'phaser';
import { GameScene } from './presentation/GameScene';
import './style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header><div><span class="kicker">로보컵 / 모바일 관전 시뮬레이션</span><h1>택티컬 킥오프</h1></div><div class="legend"><span class="blue-dot"></span> 파랑 ↑ <span class="orange-dot"></span> 주황 ↓</div></header><main><div id="game"></div><aside><div class="panel"><h2>경기 조작</h2><button id="start">▶ 경기 시작</button><button id="pause">Ⅱ 일시정지</button><button id="restart">↻ 다시 시작</button><button id="debug">◎ 킥 기준선</button><label>시뮬레이션 속도 <select id="speed"><option value="0.5">0.5배</option><option value="1" selected>1배</option><option value="2">2배</option><option value="4">4배</option></select></label></div><div class="panel"><h2>로봇 조합</h2><p class="hint">경기 중 직접 조작하지 않습니다. 경기 전 로봇 역할과 배치를 바꾸고 관전합니다.</p><button id="swap-blue">⇄ 파랑 역할 바꾸기</button><button id="replay">⟲ 경기 다시 보기</button></div><div class="panel telemetry"><h2>역할 안내</h2><p><b>돌격대장</b><br>공의 현재 위치를 직접 추적해 대각선으로 돌진합니다.<br>공에 닿으면 강하게 튕겨 공격 방향으로 보냅니다.</p><p><b>스위퍼</b><br>우리 골대 앞에서 대기하다가<br>공이 자기 진영에 오면 돌진해 강하게 걷어냅니다.<br>위협이 사라지면 수비 위치로 돌아옵니다.</p><small>경기장 위 로봇 이름과 동작 태그를 확인하세요<br>결정론 seed / 2025</small></div></aside></main><footer>90초 관전 모드 <span>•</span> 물리 기반 경기 시뮬레이션 <span>•</span> 플레이어는 경기 전 조합만 선택</footer>`;
const button=(id:string)=>document.querySelector<HTMLButtonElement>(`#${id}`)!;
const controls=[button('start'),button('pause'),button('restart'),button('replay'),button('swap-blue'),button('debug')];
const speed=document.querySelector<HTMLSelectElement>('#speed')!;
controls.forEach((control)=>control.disabled=true);speed.disabled=true;
const bindControls=(scene:GameScene)=>{
  button('start').onclick=()=>scene.start();
  button('pause').onclick=()=>scene.togglePause();
  button('restart').onclick=()=>scene.reset();
  button('replay').onclick=()=>scene.reset();
  button('debug').onclick=()=>{const enabled=scene.toggleDebug();button('debug').textContent=enabled?'◎ 킥 기준선 끄기':'◎ 킥 기준선';};
  button('swap-blue').onclick=()=>scene.swap('blue');
  speed.onchange=()=>scene.setMatchSpeed(Number(speed.value));
  controls.forEach((control)=>control.disabled=false);speed.disabled=false;
};
const scene=new GameScene(bindControls);
new Phaser.Game({type:Phaser.AUTO,width:580,height:1100,parent:'game',backgroundColor:'#08111d',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:580,height:1100},scene:[scene]});
if(import.meta.env.DEV){
  const configureSweeper=()=>{const state=scene.getState() as any;const blue=state.robots.find((r:any)=>r.id==='blue-1');const orange=state.robots.find((r:any)=>r.id==='orange-1');for(const r of [blue,orange]){if(r){r.archetype='sweeper';r.role='sweeper';r.shape='square';r.vx=0;r.vy=0;r.action='COVER';r.target='BALL';r.sweeperState='HOLD_POST';r.backpedal=false;r.clearImpulse=0;r.clearCooldown=0;}}if(blue){blue.x=270;blue.y=650;blue.moveTargetX=270;blue.moveTargetY=650;blue.facingX=0;blue.facingY=-1;}if(orange){orange.x=270;orange.y=210;orange.moveTargetX=270;orange.moveTargetY=210;orange.facingX=0;orange.facingY=1;}state.ball.x=270;state.ball.y=560;state.ball.vx=0;state.ball.vy=180;state.status='running';};
  (window as Window & {__tacticalKickoffQA?:{configureSweeper:()=>void;toggleDebug:()=>boolean;inspect:()=>unknown[];getState:()=>unknown;getTelemetry:()=>unknown[]}}).__tacticalKickoffQA={configureSweeper,toggleDebug:()=>scene.toggleDebug(),inspect:()=>scene.inspect(),getState:()=>scene.getState(),getTelemetry:()=>scene.getTelemetry()};
}
