import * as Phaser from 'phaser';
import { GameScene } from './presentation/GameScene';
import './style.css';
import { TestLab } from './presentation/TestLab';
import { RobotArchetype } from './simulation/MatchSimulation';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<nav class="mode-tabs" aria-label="화면 모드"><button id="mode-main" class="mode-tab active" type="button" role="tab" aria-selected="true" aria-controls="panel-main">Main 경기</button><button id="mode-test" class="mode-tab" type="button" role="tab" aria-selected="false" aria-controls="panel-main">Test Lab</button></nav><main><div id="game"></div><aside id="panel-main"><div class="panel"><h2>경기 조작</h2><button id="start">▶ 경기 시작</button><button id="pause">Ⅱ 일시정지</button><button id="restart">↻ 다시 시작</button><button id="debug">◎ 킥 기준선</button><label class="seed-toggle"><input id="seed-enabled" type="checkbox"> Seed 사용</label><label>Seed <input id="seed-value" type="number" value="2025" min="1" step="1" disabled></label><label>시뮬레이션 속도 <select id="speed"><option value="0.5">0.5배</option><option value="1" selected>1배</option><option value="2">2배</option><option value="4">4배</option></select></label></div><div class="panel"><h2>로봇 조합</h2><p class="hint">경기 중 직접 조작하지 않습니다. 경기 전 로봇 역할과 배치를 바꾸고 관전합니다.</p><button id="swap-blue">⇄ 파랑 역할 바꾸기</button><button id="replay">⟲ 경기 다시 보기</button></div><div class="panel telemetry"><h2>역할 안내</h2><p><b>돌격대장</b><br>공의 현재 위치를 직접 추적해 대각선으로 돌진합니다.<br>공에 닿으면 강하게 튕겨 공격 방향으로 보냅니다.</p><p><b>스위퍼</b><br>우리 골대 앞에서 대기하다가<br>공이 자기 진영에 오면 돌진해 강하게 걷어냅니다.<br>위협이 사라지면 수비 위치로 돌아옵니다.</p><small>경기장 위 로봇 이름과 동작 태그를 확인하세요<br>결정론 seed / 2025</small></div></aside></main><footer>90초 관전 모드 <span>•</span> 물리 기반 경기 시뮬레이션 <span>•</span> 플레이어는 경기 전 조합만 선택</footer>`;
document.querySelector('aside')!.insertAdjacentHTML('afterbegin',`<div class="panel prematch"><h2>킥오프 전 3v3 편성</h2><p class="hint">골키퍼는 골대 중앙에 자동 배치됩니다. 각 팀은 필드 로봇 2종과 서로 다른 시작 슬롯을 선택합니다.</p><div class="team-config" data-team="blue"><b>파랑 필드 로봇</b><select class="robot-type"><option value="striker">돌격대장</option><option value="sweeper">스위퍼</option><option value="scout">정찰봇</option><option value="dribbler">운반봇</option><option value="cannon">포격봇</option></select><select class="robot-type"><option value="sweeper">스위퍼</option><option value="striker">돌격대장</option><option value="scout">정찰봇</option><option value="dribbler">운반봇</option><option value="cannon">포격봇</option></select><label>필드 로봇 A 시작 위치</label><div class="slot-row"><button class="slot selected" data-slot="left">왼쪽</button><button class="slot" data-slot="right">오른쪽</button></div><label>필드 로봇 B 시작 위치</label><div class="slot-row"><button class="slot" data-slot="left">왼쪽</button><button class="slot selected" data-slot="right">오른쪽</button></div><button class="apply-roster">파랑 편성 적용</button><div class="selection-summary" aria-live="polite">현재 적용: 돌격대장 · 스위퍼 · GK 자동 중앙</div><div class="selection-preview" aria-label="편성 미리보기"></div></div><div class="team-config" data-team="orange"><b>주황 필드 로봇</b><select class="robot-type"><option value="striker">돌격대장</option><option value="sweeper">스위퍼</option><option value="scout">정찰봇</option><option value="dribbler">운반봇</option><option value="cannon">포격봇</option></select><select class="robot-type"><option value="sweeper">스위퍼</option><option value="striker">돌격대장</option><option value="scout">정찰봇</option><option value="dribbler">운반봇</option><option value="cannon">포격봇</option></select><label>필드 로봇 A 시작 위치</label><div class="slot-row"><button class="slot selected" data-slot="left">왼쪽</button><button class="slot" data-slot="right">오른쪽</button></div><label>필드 로봇 B 시작 위치</label><div class="slot-row"><button class="slot" data-slot="left">왼쪽</button><button class="slot selected" data-slot="right">오른쪽</button></div><button class="apply-roster">주황 편성 적용</button><div class="selection-summary" aria-live="polite">현재 적용: 돌격대장 · 스위퍼 · GK 자동 중앙</div><div class="selection-preview" aria-label="편성 미리보기"></div></div></div>`);
document.querySelectorAll<HTMLElement>('.team-config').forEach((card)=>{for(let i=0;i<3;i++){const select=document.createElement('select');select.className='robot-type';select.innerHTML='<option value="striker">돌격대장</option><option value="sweeper">스위퍼</option><option value="scout">정찰봇</option><option value="dribbler">운반봇</option><option value="cannon">포격봇</option>';card.insertBefore(select,card.querySelector('label')!);}});
const button=(id:string)=>document.querySelector<HTMLButtonElement>(`#${id}`)!;
const mainTab=button('mode-main');
const testTab=button('mode-test');
mainTab.disabled=true;
testTab.disabled=true;
const controls=[button('start'),button('pause'),button('restart'),button('replay'),button('swap-blue'),button('debug')];
const speed=document.querySelector<HTMLSelectElement>('#speed')!;
const seedEnabled=document.querySelector<HTMLInputElement>('#seed-enabled')!;
const seedValue=document.querySelector<HTMLInputElement>('#seed-value')!;
controls.forEach((control)=>control.disabled=true);speed.disabled=true;
const bindControls=(scene:GameScene)=>{
  button('start').onclick=()=>scene.start();
  button('pause').onclick=()=>scene.togglePause();
  button('restart').onclick=()=>scene.reset();
  button('replay').onclick=()=>scene.reset();
  button('debug').onclick=()=>{const enabled=scene.toggleDebug();button('debug').textContent=enabled?'◎ 킥 기준선 끄기':'◎ 킥 기준선';};
  button('swap-blue').onclick=()=>scene.swap('blue');
  speed.onchange=()=>scene.setMatchSpeed(Number(speed.value));
  const syncSeed=()=>{const enabled=seedEnabled.checked;seedValue.disabled=!enabled;scene.setSeedMode(enabled,Number(seedValue.value)||2025);};
  seedEnabled.onchange=syncSeed;
  seedValue.onchange=syncSeed;
  const labelMap:Record<string,string>={striker:'돌격대장',bulwark:'스위퍼',sweeper:'스위퍼',scout:'정찰봇',dribbler:'운반봇',cannon:'포격봇'};
  const syncRosterCard=(card:HTMLElement,applied:boolean)=>{const types=Array.from(card.querySelectorAll<HTMLSelectElement>('.robot-type')).map(select=>labelMap[select.value]??select.value);const slots=Array.from(card.querySelectorAll<HTMLElement>('.slot-row')).map(row=>row.querySelector<HTMLButtonElement>('.slot.selected')?.textContent?.trim()??'미선택');const summary=card.querySelector<HTMLElement>('.selection-summary')!;summary.textContent=`${applied?'현재 적용':'변경 대기'}: ${types[0]} · ${types[1]} · A ${slots[0]} / B ${slots[1]} · GK 자동 중앙`;summary.classList.toggle('pending',!applied);card.classList.toggle('has-pending',!applied);card.dataset.dirty=String(!applied);const preview=card.querySelector<HTMLElement>('.selection-preview')!;preview.innerHTML=`<span class="preview-robot">A ${types[0]} · ${slots[0]}</span><span class="preview-robot">B ${types[1]} · ${slots[1]}</span><span class="preview-gk">GK · 중앙</span>`;};
  document.querySelectorAll<HTMLElement>('.team-config').forEach((card)=>{
    const slotRows=Array.from(card.querySelectorAll<HTMLElement>('.slot-row'));
    const selects=Array.from(card.querySelectorAll<HTMLSelectElement>('.robot-type'));
    selects.forEach(select=>select.onchange=()=>syncRosterCard(card,false));
    slotRows.forEach((row)=>{
      const slots=Array.from(row.querySelectorAll<HTMLButtonElement>('.slot'));
      slots.forEach((slot)=>slot.onclick=()=>{slots.forEach(candidate=>candidate.classList.remove('selected'));slot.classList.add('selected');syncRosterCard(card,false);});
    });
    syncRosterCard(card,true);
    card.querySelector<HTMLButtonElement>('.apply-roster')!.onclick=()=>{
      const team=card.dataset.team as 'blue'|'orange';
      const types=selects.map(select=>select.value) as RobotArchetype[];
      const selected=slotRows.map(row=>row.querySelector<HTMLButtonElement>('.slot.selected')!.dataset.slot as 'left'|'right') as ['left','right'];
      scene.configureRoster(team,types,selected); syncRosterCard(card,true);
    };
  });
  controls.forEach((control)=>control.disabled=false);speed.disabled=false;mainTab.disabled=false;testTab.disabled=false;
};
const scene=new GameScene(bindControls);
const lab=new TestLab(document.querySelector('aside')!,config=>scene.configureLab(config.blueBrain,config.blueBody,config.orangeBrain,config.orangeBody,config.opponentEnabled,config.blueRoster,config.orangeRoster,config.bluePlacement,config.orangePlacement),active=>scene.setLabMode(active),()=>scene.start());
scene.setLabRobotMoveHandler((team,index,x,y)=>lab.handleFieldRobotMove(team,index,x,y));
const setMode=(mode:'main'|'test')=>{
  const test=mode==='test';
  if(test !== !document.querySelector<HTMLElement>('.test-lab')?.hidden) document.querySelector<HTMLButtonElement>('.lab-menu-button')?.click();
  mainTab.classList.toggle('active',!test); testTab.classList.toggle('active',test);
  mainTab.setAttribute('aria-selected',String(!test)); testTab.setAttribute('aria-selected',String(test));
};
mainTab.onclick=()=>setMode('main');
testTab.onclick=()=>setMode('test');
mainTab.onkeydown=event=>{if(event.key==='ArrowRight'){event.preventDefault();testTab.focus();setMode('test');}};
testTab.onkeydown=event=>{if(event.key==='ArrowLeft'){event.preventDefault();mainTab.focus();setMode('main');}};
void lab;
new Phaser.Game({type:Phaser.AUTO,width:580,height:1100,parent:'game',backgroundColor:'#08111d',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:580,height:1100},scene:[scene]});
if(import.meta.env.DEV){
  const configureSweeper=()=>{const state=scene.getState() as any;const blue=state.robots.find((r:any)=>r.id==='blue-1');const orange=state.robots.find((r:any)=>r.id==='orange-1');for(const r of [blue,orange]){if(r){r.archetype='sweeper';r.role='sweeper';r.shape='square';r.vx=0;r.vy=0;r.action='COVER';r.target='BALL';r.sweeperState='HOLD_POST';r.backpedal=false;r.clearImpulse=0;r.clearCooldown=0;}}if(blue){blue.x=270;blue.y=650;blue.moveTargetX=270;blue.moveTargetY=650;blue.facingX=0;blue.facingY=-1;}if(orange){orange.x=270;orange.y=210;orange.moveTargetX=270;orange.moveTargetY=210;orange.facingX=0;orange.facingY=1;}state.ball.x=270;state.ball.y=560;state.ball.vx=0;state.ball.vy=180;state.status='running';};
  (window as Window & {__tacticalKickoffQA?:{configureSweeper:()=>void;toggleDebug:()=>boolean;inspect:()=>unknown[];getState:()=>unknown;getTelemetry:()=>unknown[]}}).__tacticalKickoffQA={configureSweeper,toggleDebug:()=>scene.toggleDebug(),inspect:()=>scene.inspect(),getState:()=>scene.getState(),getTelemetry:()=>scene.getTelemetry()};
}
