import { SimulationTestArena, detectAnomalies, replayEquivalent, type ScenarioSpec, type ScenarioRun } from '../simulation/SimulationQA';
import type { RobotArchetype } from '../simulation/MatchSimulation';

type BodyPreset='standard'|'light'|'heavy'|'wide'|'kick-plate';
type Brain=Exclude<RobotArchetype,'goalkeeper'>;
const labels:Record<string,string>={striker:'Striker Brain',sweeper:'Sweeper Brain',scout:'Scout Brain',dribbler:'Dribbler Brain',cannon:'Cannon Brain',bulwark:'Anchor Brain'};
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
  private history:Array<{brain:string;body:string;scenario:string;finalX:number;finalY:number;speed:number;contacts:number;kicks:number;anomalies:number;actions:string;reasons:string}>=[];
  constructor(host:HTMLElement){
    this.root=document.createElement('section');
    this.root.className='test-lab panel';
    this.root.innerHTML=`<h2>Robot Test Lab</h2><p class="hint">실제 fixed-step simulation에서 한 로봇·Brain·Body를 고정하고 행동을 비교합니다.</p>
      <div class="lab-grid"><label>Brain <select data-lab="brain"><option value="striker">Striker</option><option value="sweeper">Sweeper</option><option value="scout">Scout</option><option value="dribbler">Dribbler</option><option value="cannon">Cannon</option><option value="bulwark">Anchor</option></select></label>
      <label>Body <select data-lab="body"><option value="standard">Standard</option><option value="light">Light Frame</option><option value="heavy">Heavy Frame</option><option value="wide">Wide Bumper</option><option value="kick-plate">Kick Plate</option></select></label>
      <label>Scenario <select data-lab="scenario"><option value="approach">정면 공 접근</option><option value="threat">자기 골대 위협</option><option value="wall">벽 반사</option><option value="contact">접촉·킥</option></select></label>
      <label>Seed <input data-lab="seed" type="number" value="2025" min="1" step="1"></label></div>
      <div class="lab-actions"><button data-lab="run">▶ 단독 실행</button><button data-lab="repeat">↻ 동일 seed 재실행</button><button data-lab="clear">지우기</button></div><div data-lab="report" class="lab-report" aria-live="polite">실행 대기</div>`;
    host.append(this.root);
    this.report=this.root.querySelector('[data-lab="report"]')!;
    this.root.querySelector<HTMLButtonElement>('[data-lab="run"]')!.onclick=()=>this.run();
    this.root.querySelector<HTMLButtonElement>('[data-lab="repeat"]')!.onclick=()=>this.repeat();
    this.root.querySelector<HTMLButtonElement>('[data-lab="clear"]')!.onclick=()=>{this.last=undefined;this.report.textContent='실행 대기';};
  }
  private value<T extends string>(key:string){return this.root.querySelector<HTMLSelectElement>(`[data-lab="${key}"]`)!.value as T;}
  private makeScenario():ScenarioSpec{
    const brain=this.value<Brain>('brain'); const body=this.value<BodyPreset>('body'); const scenario=this.value<'approach'|'threat'|'wall'|'contact'>('scenario');
    const seed=Number(this.root.querySelector<HTMLInputElement>('[data-lab="seed"]')!.value)||2025;
    const ball=scenario==='threat'?{x:270,y:760,vx:0,vy:260}:scenario==='wall'?{x:40,y:430,vx:-300,vy:0}:scenario==='contact'?{x:270,y:700,vx:0,vy:180}:{x:270,y:570,vx:0,vy:0};
    return {...{id:`lab-${brain}-${scenario}`,seed,durationTicks:360,composition:{blue:[brain,brain],orange:['striker','striker']},ball,robots:[{id:'blue-0',x:270,y:700,vx:0,vy:0,action:'RESET',target:'BALL'}]},bodyProfile:body} as ScenarioSpec & {bodyProfile:BodyPreset};
  }
  private configureBody(arena:SimulationTestArena){
    const body=this.value<BodyPreset>('body'); const profile=BODY_PROFILES[body];
    const robot=arena.simulation.state.robots.find(candidate=>candidate.id==='blue-0'); if(robot){robot.mass=profile.mass;robot.maxSpeed=profile.maxSpeed;robot.acceleration=profile.acceleration;robot.radius=profile.radius;}
  }
  private run():ScenarioRun{
    const spec=this.makeScenario(); const arena=new SimulationTestArena(spec); this.configureBody(arena); arena.run(); this.last=arena.result(); this.record(this.last); this.render(this.last,undefined); return this.last;
  }
  private repeat(){const first=this.last;if(!first){this.run();return;}const arena=new SimulationTestArena(first.scenario);this.configureBody(arena);arena.run();const next=arena.result();this.render(next,replayEquivalent(first,next));this.record(next);this.last=next;}
  private record(run:ScenarioRun){
    const robot=run.state.robots.find(candidate=>candidate.id==='blue-0'); if(!robot)return;
    const frames=run.telemetry.flatMap(frame=>frame.robots).filter(candidate=>candidate.id==='blue-0');
    const actions=[...new Set(frames.map(frame=>frame.action))].join(' → ');
    const reasons=[...new Set(frames.map(frame=>frame.lastDecisionReason).filter(Boolean))].slice(-4).join(' | ');
    this.history.unshift({brain:this.value('brain'),body:this.value<BodyPreset>('body'),scenario:this.value('scenario'),finalX:robot.x,finalY:robot.y,speed:Math.hypot(robot.vx,robot.vy),contacts:run.events.filter(event=>event.type==='robot-ball-collision').length,kicks:run.events.filter(event=>event.type==='kick').length,anomalies:detectAnomalies(run).length,actions,reasons});
    this.history=this.history.slice(0,8);
  }
  private render(run:ScenarioRun,equal?:boolean){
    const robot=run.state.robots.find(candidate=>candidate.id==='blue-0'); const kicks=run.events.filter(event=>event.type==='kick'); const contacts=run.events.filter(event=>event.type==='robot-ball-collision'); const anomalies=detectAnomalies(run); const status=anomalies.length?'FAIL':'PASS';
    this.report.innerHTML=`<div class="lab-status ${status.toLowerCase()}"><b>${status}</b> ${labels[this.value('brain')]} × ${BODY_PROFILES[this.value<BodyPreset>('body')].label}${equal===undefined?'':` · replay ${equal?'IDENTICAL':'DIVERGED'}`}</div><div>seed ${run.scenario.seed} · ticks ${run.telemetry.length} · final (${robot?.x.toFixed(1)}, ${robot?.y.toFixed(1)}) · speed ${robot?Math.hypot(robot.vx,robot.vy).toFixed(1):'—'}</div><div>contact ${contacts.length} · kick ${kicks.length} · goal ${run.events.filter(event=>event.type==='goal').length} · anomalies ${anomalies.length}</div>${anomalies.length?`<pre>${anomalies.slice(0,3).map(anomaly=>`${anomaly.kind} @${anomaly.tick}: ${anomaly.message}`).join('\n')}</pre>`:'<small>deterministic scenario contract satisfied</small>'}<hr><b>비교 기록 (${this.history.length})</b><div class="lab-history">${this.history.map((row,index)=>`<div class="lab-history-row"><b>#${index+1} ${labels[row.brain]??row.brain} × ${BODY_PROFILES[row.body as BodyPreset]?.label??row.body}</b><br><small>${row.scenario} · final ${row.finalX.toFixed(1)},${row.finalY.toFixed(1)} · speed ${row.speed.toFixed(1)} · contact ${row.contacts} · kick ${row.kicks} · ${row.anomalies?'FAIL':'PASS'}</small><br><small>actions: ${row.actions||'—'}<br>reasons: ${row.reasons||'—'}</small></div>`).join('')}</div>`;
  }
}
