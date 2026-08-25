import { SimulationTestArena, detectAnomalies, replayEquivalent, type ScenarioSpec, type ScenarioRun } from '../simulation/SimulationQA';
import type { RobotArchetype } from '../simulation/MatchSimulation';

export type BodyPreset='standard'|'light'|'heavy'|'wide'|'kick-plate';
type Brain=Exclude<RobotArchetype,'goalkeeper'>;
export interface LabConfig { blueBrain:Brain; blueBody:BodyPreset; orangeBrain:Brain; orangeBody:BodyPreset; opponentEnabled:boolean; scenario:string; blueRoster?:Brain[]; orangeRoster?:Brain[]; }
export const BRAIN_SHAPES:Record<Brain,'circle'|'square'|'diamond'|'hex'>={striker:'circle',sweeper:'square',scout:'diamond',dribbler:'circle',cannon:'hex',bulwark:'square'};
export function createLabComposition(blueBrain:Brain,orangeBrain:Brain,opponentEnabled:boolean):{blue:Brain[];orange:Brain[]} { return {blue:[blueBrain],orange:opponentEnabled?[orangeBrain]:[]}; }
const labels:Record<string,string>={striker:'Striker Brain',sweeper:'Sweeper Brain',scout:'Scout Brain',dribbler:'Dribbler Brain',cannon:'Cannon Brain',bulwark:'Anchor Brain'};
const brainDescriptions:Record<string,string>={striker:'공을 압박하고 빈틈이 보이면 공격 방향으로 슛합니다.',sweeper:'자기 골대와 공 사이를 지키며 위협을 걷어냅니다.',scout:'공의 이동 경로를 예측해 먼저 도착하려고 합니다.',dribbler:'공을 짧게 여러 번 접촉하며 운반을 시도합니다.',cannon:'좋은 각도와 거리가 나오면 강한 슛을 우선합니다.',bulwark:'뒤쪽을 지키며 위험한 공을 안전한 방향으로 정리합니다.'};
export const BODY_PROFILES:Record<BodyPreset,{mass:number;maxSpeed:number;acceleration:number;radius:number;label:string}>={
  standard:{mass:2,maxSpeed:460,acceleration:2000,radius:20,label:'Standard'},
  light:{mass:1.2,maxSpeed:560,acceleration:2400,radius:18,label:'Light Frame'},
  heavy:{mass:3.8,maxSpeed:360,acceleration:1300,radius:23,label:'Heavy Frame'},
  wide:{mass:2.4,maxSpeed:420,acceleration:1700,radius:28,label:'Wide Bumper'},
  'kick-plate':{mass:2.1,maxSpeed:440,acceleration:1900,radius:20,label:'Kick Plate'},
};

export class TestLab {
  private root:HTMLElement;
  private report:HTMLElement;
  private last?:ScenarioRun;
  private history:Array<{brain:string;body:string;opponentBrain:string;opponentBody:string;opponentEnabled:boolean;scenario:string;finalX:number;finalY:number;speed:number;contacts:number;kicks:number;anomalies:number;actions:string;reasons:string}>=[];
  private onConfig?: (config:LabConfig)=>void;
  private onMode?: (active:boolean)=>void;
  private onStart?: ()=>void;
  private blueRoster:Brain[]=['striker'];
  private orangeRoster:Brain[]=['striker'];
  private availableRoster:Brain[]=['scout','dribbler','cannon'];
  private selectedCard?:{source:'tray'|'blue'|'orange';index:number};
  constructor(host:HTMLElement,onConfig?:(config:LabConfig)=>void,onMode?:(active:boolean)=>void,onStart?:()=>void){
    this.onConfig=onConfig; this.onMode=onMode; this.onStart=onStart;
    const menu=document.createElement('button'); menu.className='lab-menu-button'; menu.textContent='🧪 TEST LAB · 실제 1v1 움직임'; menu.onclick=()=>{this.root.hidden=!this.root.hidden; const active=!this.root.hidden; menu.textContent=active?'← 경기 화면으로 돌아가기':'🧪 TEST LAB · 실제 1v1 움직임'; for(const child of Array.from(host.children)){if(child!==menu&&child!==this.root)(child as HTMLElement).hidden=active;} this.onMode?.(active); if(active)this.syncVisual();}; host.prepend(menu);
    this.root=document.createElement('section');
    this.root.className='test-lab panel';
    this.root.innerHTML=`<h2>Robot Test Lab · 최대 5v5</h2><p class="hint">Brain/Body 카드를 만들어 우리팀 또는 상대팀 drop zone으로 드래그하세요. 팀당 최대 5명, 경기 시작 후에는 배치를 잠급니다.</p>
      <div class="lab-grid"><label class="opponent-toggle"><input type="checkbox" data-lab="opponent-enabled" checked> 상대팀 사용</label><small data-lab="opponent-mode">상대팀 포함 1v1</small><label>내 Brain <select data-lab="brain"><option value="striker">Striker</option><option value="sweeper">Sweeper</option><option value="scout">Scout</option><option value="dribbler">Dribbler</option><option value="cannon">Cannon</option><option value="bulwark">Anchor</option></select><small data-lab="brain-help"></small></label>
      <label>내 Body <select data-lab="body"><option value="standard">Standard</option><option value="light">Light Frame</option><option value="heavy">Heavy Frame</option><option value="wide">Wide Bumper</option><option value="kick-plate">Kick Plate</option></select></label>
      <label>상대 Brain <select data-lab="opponent-brain"><option value="striker">Striker</option><option value="sweeper">Sweeper</option><option value="scout">Scout</option><option value="dribbler">Dribbler</option><option value="cannon">Cannon</option><option value="bulwark">Anchor</option></select><small data-lab="opponent-brain-help"></small></label>
      <label>상대 Body <select data-lab="opponent-body"><option value="standard">Standard</option><option value="light">Light Frame</option><option value="heavy">Heavy Frame</option><option value="wide">Wide Bumper</option><option value="kick-plate">Kick Plate</option></select></label>
      <label>Scenario <select data-lab="scenario"><option value="approach">정면 공 접근</option><option value="threat">자기 골대 위협</option><option value="wall">벽 반사</option><option value="contact">접촉·킥</option></select></label>
      <label>Seed <input data-lab="seed" type="number" value="2025" min="1" step="1"></label></div>
      <div class="lab-roster-builder"><div class="lab-character-tray" data-team-drop="tray"><b>캐릭터 열 · 대기 중</b><small>로봇을 ground로 드래그하세요. 다시 이곳에 놓으면 제거됩니다.</small><div data-lab="available-roster"></div></div><div class="lab-drop-zone" data-team-drop="blue"><b>우리팀 Blue ground</b><div data-lab="blue-roster"></div></div><div class="lab-drop-zone" data-team-drop="orange"><b>상대팀 Orange ground</b><div data-lab="orange-roster"></div></div><aside class="lab-inspector" data-lab="inspector"><b>로봇을 선택하세요</b><small>로봇을 클릭하면 Brain과 Body를 바꿀 수 있습니다.</small></aside><button data-lab="add-card">선택한 Brain/Body 카드 추가</button></div>`+`<div class="lab-actions"><button data-lab="run">▶ roster 실행</button><button data-lab="repeat">↻ 동일 seed 재실행</button><button data-lab="clear">지우기</button></div><div data-lab="report" class="lab-report" aria-live="polite">실행 대기</div>`;
    host.append(this.root); this.root.hidden=true;
    this.report=this.root.querySelector('[data-lab="report"]')!;
    this.root.querySelector<HTMLButtonElement>('[data-lab="run"]')!.onclick=()=>this.run();
    this.root.querySelector<HTMLButtonElement>('[data-lab="repeat"]')!.onclick=()=>this.repeat();
    this.root.querySelector<HTMLButtonElement>('[data-lab="clear"]')!.onclick=()=>{this.last=undefined;this.report.textContent='실행 대기';};
    this.root.querySelector<HTMLButtonElement>('[data-lab="add-card"]')!.onclick=()=>{if(this.availableRoster.length<5)this.availableRoster.push(this.value<Brain>('brain'));this.syncRosterCards();this.syncVisual();};
    this.root.querySelectorAll<HTMLElement>('[data-team-drop]').forEach(zone=>{zone.ondragover=event=>event.preventDefault();zone.ondrop=event=>{event.preventDefault();const raw=event.dataTransfer?.getData('application/x-tactical-roster')||event.dataTransfer?.getData('text/plain');if(!raw)return;let payload:{source:'tray'|'blue'|'orange';index:number};try{payload=JSON.parse(raw)}catch{return;}const destination=zone.dataset.teamDrop as 'blue'|'orange'|'tray';const sourceList=payload.source==='tray'?this.availableRoster:payload.source==='blue'?this.blueRoster:this.orangeRoster;if(!Number.isInteger(payload.index)||!sourceList[payload.index])return;const brain=sourceList.splice(payload.index,1)[0];if(destination==='tray'){this.availableRoster.push(brain);this.selectedCard={source:'tray',index:this.availableRoster.length-1};}else{const target=destination==='blue'?this.blueRoster:this.orangeRoster;if(target.length>=5){sourceList.splice(payload.index,0,brain);return;}target.push(brain);this.selectedCard={source:destination,index:target.length-1};}this.syncRosterCards();this.syncVisual();};});
    this.syncRosterCards();
    this.root.querySelectorAll<HTMLSelectElement>('[data-lab="brain"],[data-lab="opponent-brain"]').forEach(select=>select.onchange=()=>{this.invalidateRepeat();this.updateHelp();this.syncVisual();});
    this.root.querySelector<HTMLInputElement>('[data-lab="opponent-enabled"]')!.onchange=()=>{this.invalidateRepeat();this.updateOpponentControls();this.syncVisual();};
    this.root.querySelectorAll<HTMLSelectElement>('[data-lab="body"],[data-lab="opponent-body"]').forEach(select=>select.onchange=()=>{this.invalidateRepeat();this.syncVisual();});
    this.updateHelp();
    this.updateOpponentControls();
  }
  private invalidateRepeat(){if(this.last){this.last=undefined;this.report.textContent='설정이 변경되었습니다. 새 설정으로 다시 실행하세요.';}}
  private updateOpponentControls(){
    const enabled=this.root.querySelector<HTMLInputElement>('[data-lab="opponent-enabled"]')!.checked;
    this.root.querySelectorAll<HTMLSelectElement>('[data-lab="opponent-brain"],[data-lab="opponent-body"]').forEach(select=>{select.disabled=!enabled;});
    this.root.querySelector<HTMLElement>('[data-lab="opponent-mode"]')!.textContent=enabled?'상대팀 포함 1v1':'상대팀 없음 · 단독 실험';
  }
  private updateHelp(){
    const brain=this.value<Brain>('brain'); const opponent=this.value<Brain>('opponent-brain');
    this.root.querySelector<HTMLElement>('[data-lab="brain-help"]')!.textContent=brainDescriptions[brain];
    this.root.querySelector<HTMLElement>('[data-lab="opponent-brain-help"]')!.textContent=brainDescriptions[opponent];
  }
  private value<T extends string>(key:string){return this.root.querySelector<HTMLSelectElement>(`[data-lab="${key}"]`)!.value as T;}
  private makeScenario():ScenarioSpec{
    const brain=this.value<Brain>('brain'); const opponentBrain=this.value<Brain>('opponent-brain'); const body=this.value<BodyPreset>('body'); const scenario=this.value<'approach'|'threat'|'wall'|'contact'>('scenario');
    const seed=Number(this.root.querySelector<HTMLInputElement>('[data-lab="seed"]')!.value)||2025;
    const ball=scenario==='threat'?{x:270,y:760,vx:0,vy:260}:scenario==='wall'?{x:40,y:430,vx:-300,vy:0}:scenario==='contact'?{x:270,y:700,vx:0,vy:180}:{x:270,y:570,vx:0,vy:0};
    const opponentEnabled=this.root.querySelector<HTMLInputElement>('[data-lab="opponent-enabled"]')!.checked;
    return {...{id:`lab-${brain}-${opponentEnabled?'vs-'+opponentBrain:'solo'}-${scenario}`,seed,durationTicks:360,composition:{blue:[...this.blueRoster],orange:opponentEnabled?[...this.orangeRoster]:[]},ball,robots:[{id:'blue-0',x:270,y:700,vx:0,vy:0,action:'RESET',target:'BALL'}]},bodyProfile:body} as ScenarioSpec & {bodyProfile:BodyPreset};
  }
  private configureBody(arena:SimulationTestArena){
    const apply=(id:string,body:BodyPreset)=>{const profile=BODY_PROFILES[body]; const robot=arena.simulation.state.robots.find(candidate=>candidate.id===id); if(robot)Object.assign(robot,profile);};
    this.blueRoster.forEach((_,index)=>apply(`blue-${index}`,this.value<BodyPreset>('body'))); if(this.root.querySelector<HTMLInputElement>('[data-lab="opponent-enabled"]')!.checked) this.orangeRoster.forEach((_,index)=>apply(`orange-${index}`,this.value<BodyPreset>('opponent-body')));
  }
  private syncRosterCards(){
    const render=(host:HTMLElement,roster:Brain[],source:'tray'|'blue'|'orange',body:BodyPreset)=>{host.innerHTML=roster.map((brain:Brain,index:number)=>{const selected=this.selectedCard?.source===source&&this.selectedCard.index===index?' selected':'';return `<button type="button" class="lab-roster-card${selected}" draggable="true" data-roster-index="${index}" data-roster-source="${source}"><span class="lab-robot-avatar brain-${brain}"><span></span></span><span class="lab-roster-copy"><b>${labels[brain]}</b><small>${body}</small></span></button>`}).join('');host.querySelectorAll<HTMLElement>('[data-roster-index]').forEach(card=>{const index=Number(card.dataset.rosterIndex);card.onclick=()=>{this.selectedCard={source,index};this.renderInspector();this.syncRosterCards();};card.ondragstart=event=>{this.selectedCard={source,index};event.dataTransfer?.setData('application/x-tactical-roster',JSON.stringify({source,index}));event.dataTransfer?.setData('text/plain',JSON.stringify({source,index}));};});};
    const available=this.root.querySelector<HTMLElement>('[data-lab="available-roster"]');
    if(available)render(available,this.availableRoster,'tray',this.value<BodyPreset>('body'));
    for(const [team,roster] of [['blue',this.blueRoster] as const,['orange',this.orangeRoster] as const]){const host=this.root.querySelector<HTMLElement>(`[data-lab="${team}-roster"]`);if(host)render(host,roster,team,team==='blue'?this.value<BodyPreset>('body'):this.value<BodyPreset>('opponent-body'));}
    this.renderInspector();
  }
  private renderInspector(){
    const inspector=this.root.querySelector<HTMLElement>('[data-lab="inspector"]'); if(!inspector)return;
    const selected=this.selectedCard; if(!selected){inspector.innerHTML='<b>로봇을 선택하세요</b><small>로봇을 클릭하면 Brain과 Body를 바꿀 수 있습니다.</small>';return;}
    const list=selected.source==='tray'?this.availableRoster:selected.source==='blue'?this.blueRoster:this.orangeRoster; const brain=list[selected.index]; if(!brain){this.selectedCard=undefined;this.renderInspector();return;}
    const body=selected.source==='orange'?this.value<BodyPreset>('opponent-body'):this.value<BodyPreset>('body');
    inspector.innerHTML=`<div class="inspector-robot"><span class="lab-robot-avatar brain-${brain}"><span></span></span><div><b>${labels[brain]}</b><small>${selected.source==='tray'?'캐릭터 열':selected.source==='blue'?'Blue ground':'Orange ground'}</small></div></div><label>Brain <select data-inspector="brain"><option value="striker">Striker</option><option value="sweeper">Sweeper</option><option value="scout">Scout</option><option value="dribbler">Dribbler</option><option value="cannon">Cannon</option><option value="bulwark">Anchor</option></select></label><label>Body <select data-inspector="body"><option value="standard">Standard</option><option value="light">Light Frame</option><option value="heavy">Heavy Frame</option><option value="wide">Wide Bumper</option><option value="kick-plate">Kick Plate</option></select></label><small>변경 후에도 같은 로봇 카드로 유지됩니다.</small>`;
    const brainSelect=inspector.querySelector<HTMLSelectElement>('[data-inspector="brain"]')!; const bodySelect=inspector.querySelector<HTMLSelectElement>('[data-inspector="body"]')!; brainSelect.value=brain; bodySelect.value=body;
    brainSelect.onchange=()=>{list[selected.index]=brainSelect.value as Brain;this.invalidateRepeat();this.syncRosterCards();this.syncVisual();};
    bodySelect.onchange=()=>{const selector=selected.source==='orange'?'opponent-body':'body';const main=this.root.querySelector<HTMLSelectElement>(`[data-lab="${selector}"]`)!;main.value=bodySelect.value;this.invalidateRepeat();this.syncRosterCards();this.syncVisual();};
  }
  private syncVisual(){this.onConfig?.({blueBrain:this.value<Brain>('brain'),blueBody:this.value<BodyPreset>('body'),orangeBrain:this.value<Brain>('opponent-brain'),orangeBody:this.value<BodyPreset>('opponent-body'),opponentEnabled:this.root.querySelector<HTMLInputElement>('[data-lab="opponent-enabled"]')!.checked,scenario:this.value('scenario'),blueRoster:[...this.blueRoster],orangeRoster:[...this.orangeRoster]});}
  private run():ScenarioRun{
    this.syncVisual(); this.onStart?.(); const spec=this.makeScenario(); const arena=new SimulationTestArena(spec); this.configureBody(arena); arena.run(); this.last=arena.result(); this.record(this.last); this.render(this.last,undefined); return this.last;
  }
  private repeat(){this.syncVisual();this.onStart?.();const first=this.last;if(!first){this.run();return;}const arena=new SimulationTestArena(first.scenario);this.configureBody(arena);arena.run();const next=arena.result();this.render(next,replayEquivalent(first,next));this.record(next);this.last=next;}
  private record(run:ScenarioRun){
    const robot=run.state.robots.find(candidate=>candidate.id==='blue-0'); if(!robot)return;
    const frames=run.telemetry.flatMap(frame=>frame.robots).filter(candidate=>candidate.id==='blue-0');
    const actions=[...new Set(frames.map(frame=>frame.action))].join(' → ');
    const reasons=[...new Set(frames.map(frame=>frame.lastDecisionReason).filter(Boolean))].slice(-4).join(' | ');
    const opponentEnabled=(run.scenario.composition?.orange?.length??0)>0;
    this.history.unshift({brain:this.value('brain'),body:this.value<BodyPreset>('body'),opponentBrain:this.value('opponent-brain'),opponentBody:this.value<BodyPreset>('opponent-body'),opponentEnabled,scenario:this.value('scenario'),finalX:robot.x,finalY:robot.y,speed:Math.hypot(robot.vx,robot.vy),contacts:run.events.filter(event=>event.type==='robot-ball-collision').length,kicks:run.events.filter(event=>event.type==='kick').length,anomalies:detectAnomalies(run).length,actions,reasons});
    this.history=this.history.slice(0,8);
  }
  private render(run:ScenarioRun,equal?:boolean){
    const robot=run.state.robots.find(candidate=>candidate.id==='blue-0'); const kicks=run.events.filter(event=>event.type==='kick'); const contacts=run.events.filter(event=>event.type==='robot-ball-collision'); const anomalies=detectAnomalies(run); const status=anomalies.length?'FAIL':'PASS';
    const opponentEnabled=(run.scenario.composition?.orange?.length??0)>0;
    const modeLabel=opponentEnabled?`1v1 · 상대 ${labels[this.value('opponent-brain')]} × ${BODY_PROFILES[this.value<BodyPreset>('opponent-body')].label}`:'SOLO · 상대팀 없음';
    this.report.innerHTML=`<div class="lab-status ${status.toLowerCase()}"><b>${status}</b> ${modeLabel} · 내 ${labels[this.value('brain')]} × ${BODY_PROFILES[this.value<BodyPreset>('body')].label}${equal===undefined?'':` · replay ${equal?'IDENTICAL':'DIVERGED'}`}</div><div>seed ${run.scenario.seed} · ticks ${run.telemetry.length} · final (${robot?.x.toFixed(1)}, ${robot?.y.toFixed(1)}) · speed ${robot?Math.hypot(robot.vx,robot.vy).toFixed(1):'—'}</div><div>contact ${contacts.length} · kick ${kicks.length} · goal ${run.events.filter(event=>event.type==='goal').length} · anomalies ${anomalies.length}</div>${anomalies.length?`<pre>${anomalies.slice(0,3).map(anomaly=>`${anomaly.kind} @${anomaly.tick}: ${anomaly.message}`).join('\n')}</pre>`:'<small>deterministic scenario contract satisfied</small>'}<hr><b>비교 기록 (${this.history.length})</b><div class="lab-history">${this.history.map((row,index)=>`<div class="lab-history-row"><b>#${index+1} ${row.opponentEnabled?'1v1 · 내 '+(labels[row.brain]??row.brain)+' × '+(BODY_PROFILES[row.body as BodyPreset]?.label??row.body)+' vs 상대 '+(labels[row.opponentBrain]??row.opponentBrain)+' × '+(BODY_PROFILES[row.opponentBody as BodyPreset]?.label??row.opponentBody):'SOLO · 내 '+(labels[row.brain]??row.brain)+' × '+(BODY_PROFILES[row.body as BodyPreset]?.label??row.body)+' · 상대팀 없음'}</b><br><small>${row.scenario} · final ${row.finalX.toFixed(1)},${row.finalY.toFixed(1)} · speed ${row.speed.toFixed(1)} · contact ${row.contacts} · kick ${row.kicks} · ${row.anomalies?'FAIL':'PASS'}</small><br><small>actions: ${row.actions||'—'}<br>reasons: ${row.reasons||'—'}</small></div>`).join('')}</div>`;
  }
}
