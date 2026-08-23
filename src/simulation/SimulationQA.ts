import { MatchSimulation, GOAL_GEOMETRY, type Action, type MatchState, type Robot, type RobotArchetype, type SimulationEvent, type Team, type TelemetryFrame } from './MatchSimulation';

export interface ScenarioSpec {
  id:string;
  seed:number;
  durationTicks:number;
  ball?:{x:number;y:number;vx?:number;vy?:number};
  robots?:Array<{id:string;x:number;y:number;vx?:number;vy?:number;facingX?:number;facingY?:number;action?:Action;target?:string}>;
  composition?:{blue?:['striker'|'bulwark'|'scout'|'dribbler'|'cannon'|'sweeper','striker'|'bulwark'|'scout'|'dribbler'|'cannon'|'sweeper'];orange?:['striker'|'bulwark'|'scout'|'dribbler'|'cannon'|'sweeper','striker'|'bulwark'|'scout'|'dribbler'|'cannon'|'sweeper']};
}

export interface ScenarioRun {
  scenario:ScenarioSpec;
  state:MatchState;
  events:SimulationEvent[];
  telemetry:TelemetryFrame[];
  replay:string;
}

export type AnomalyKind='local-stuck'|'state-stuck'|'target-thrash'|'non-finite'|'out-of-bounds'|'speed-cap'|'kick-without-cause';
export interface SimulationAnomaly {kind:AnomalyKind;tick:number;elapsed:number;robotId?:string;message:string;details:Record<string,unknown>}

const DT=1/60;

export class SimulationTestArena {
  readonly simulation:MatchSimulation;
  readonly scenario:ScenarioSpec;
  constructor(scenario:ScenarioSpec){
    this.scenario=scenario;
    this.simulation=new MatchSimulation(scenario.seed,scenario.composition);
    this.applyScenario();
  }
  private applyScenario(){
    if(this.scenario.ball){Object.assign(this.simulation.state.ball,this.scenario.ball);}
    for(const setup of this.scenario.robots??[]){
      const robot=this.simulation.state.robots.find(candidate=>candidate.id===setup.id); if(!robot) continue;
      Object.assign(robot,setup);
    }
  }
  start(){this.simulation.start();}
  step(ticks=1){for(let i=0;i<ticks;i++)this.simulation.tick(DT);}
  pause(){this.simulation.setPaused(true);}
  resume(){this.simulation.setPaused(false);}
  run(){this.start();this.step(this.scenario.durationTicks);return this.result();}
  result():ScenarioRun{const telemetry=this.simulation.getTelemetry();const events=this.simulation.getEvents();return {scenario:this.scenario,state:this.simulation.snapshot(),events,telemetry,replay:JSON.stringify({scenario:this.scenario,events,telemetry})};}
}

export function normalizeReplay(run:ScenarioRun){
  return JSON.stringify({scenario:run.scenario,telemetry:run.telemetry.map(frame=>({tick:frame.tick,ball:frame.ball,robots:[...frame.robots].sort((a,b)=>a.id.localeCompare(b.id)).map(robot=>({id:robot.id,x:robot.x,y:robot.y,vx:robot.vx,vy:robot.vy,action:robot.action,target:robot.target,moveTargetX:robot.moveTargetX,moveTargetY:robot.moveTargetY,lastDecisionReason:robot.lastDecisionReason})),events:frame.events.map(event=>({type:event.type,ids:event.ids,x:event.x,y:event.y,reason:event.reason,vxAfter:event.vxAfter,vyAfter:event.vyAfter}))}))});
}

export function detectAnomalies(run:ScenarioRun,field={width:540,height:860},windowTicks=120):SimulationAnomaly[]{
  const anomalies:SimulationAnomaly[]=[]; const frames=run.telemetry;
  for(const frame of frames){
    const ball=frame.ball; if(!Number.isFinite(ball.x)||!Number.isFinite(ball.y)||!Number.isFinite(ball.vx)||!Number.isFinite(ball.vy)) anomalies.push({kind:'non-finite',tick:frame.tick,elapsed:frame.elapsed,message:'ball contains non-finite value',details:{ball}});
    const goalNetDepth=frame.goalResetTimer>0?GOAL_GEOMETRY.depth:60;
    if(ball.x<0||ball.x>field.width||ball.y<-goalNetDepth||ball.y>field.height+goalNetDepth) anomalies.push({kind:'out-of-bounds',tick:frame.tick,elapsed:frame.elapsed,message:'ball outside allowed bounds',details:{x:ball.x,y:ball.y,goalResetTimer:frame.goalResetTimer}});
    for(const robot of frame.robots){
      const speed=Math.hypot(robot.vx,robot.vy); if(![robot.x,robot.y,robot.vx,robot.vy].every(Number.isFinite)) anomalies.push({kind:'non-finite',tick:frame.tick,elapsed:frame.elapsed,robotId:robot.id,message:'robot contains non-finite value',details:{x:robot.x,y:robot.y,vx:robot.vx,vy:robot.vy}});
      if(robot.x<0||robot.x>field.width||robot.y<0||robot.y>field.height) anomalies.push({kind:'out-of-bounds',tick:frame.tick,elapsed:frame.elapsed,robotId:robot.id,message:'robot outside field',details:{x:robot.x,y:robot.y}});
      if(speed>robot.maxSpeed+1e-6) anomalies.push({kind:'speed-cap',tick:frame.tick,elapsed:frame.elapsed,robotId:robot.id,message:'robot speed exceeds cap',details:{speed,maxSpeed:robot.maxSpeed}});
    }
  }
  const ids=frames[0]?.robots.map(robot=>robot.id)??[];
  for(const id of ids){
    for(let end=windowTicks;end<frames.length;end++){
      const window=frames.slice(end-windowTicks,end).map(frame=>frame.robots.find(robot=>robot.id===id)).filter(Boolean) as NonNullable<TelemetryFrame['robots'][number]>[];
      const xs=window.map(robot=>robot.x),ys=window.map(robot=>robot.y); const width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys); const averageSpeed=window.reduce((sum,robot)=>sum+Math.hypot(robot.vx,robot.vy),0)/window.length; const active=window.some(robot=>robot.action!=='RESET'); const currentAction=window.at(-1)?.action; const currentRole=window.at(-1)?.archetype;
      const last=frames[end-1]; const recoveryNear=run.events.some(event=>event.type==='stuck-recovery'&&event.tick>=last.tick-180&&event.tick<=last.tick+180);
      if(width<10&&height<10&&averageSpeed<5&&active&&currentRole!=='goalkeeper'&&!['COVER','RESET','KICK'].includes(currentAction??'')&&!((currentRole==='bulwark'||currentRole==='sweeper')&&currentAction==='PRESS')&&!recoveryNear){anomalies.push({kind:'local-stuck',tick:last.tick,elapsed:last.elapsed,robotId:id,message:`robot stayed within ${Math.max(width,height).toFixed(1)}px at ${averageSpeed.toFixed(1)}px/s for ${windowTicks} ticks`,details:{width,height,averageSpeed,action:currentAction}});break;}
    }
  }
  for(const id of ids){let previousAction:Action|undefined;let stateRun=0;let targetChanges=0;for(let index=0;index<frames.length;index++){const frame=frames[index];const robot=frame.robots.find(candidate=>candidate.id===id);const previous=index>0?frames[index-1].robots.find(candidate=>candidate.id===id):undefined;if(!robot)continue;if(robot.action===previousAction)stateRun++;else stateRun=1;previousAction=robot.action;if(previous&&Math.hypot(robot.moveTargetX-previous.moveTargetX,robot.moveTargetY-previous.moveTargetY)>18)targetChanges++;else targetChanges=0;const recent=frames.slice(Math.max(0,index-59),index+1).filter(candidate=>candidate.robots.some(candidateRobot=>candidateRobot.id===id));const recentRobot=recent.map(candidate=>candidate.robots.find(candidateRobot=>candidateRobot.id===id)).filter(Boolean) as NonNullable<TelemetryFrame['robots'][number]>[];const averageSpeed=recentRobot.reduce((sum,current)=>sum+Math.hypot(current.vx,current.vy),0)/(recentRobot.length||1);const recoveryNear=run.events.some(event=>event.type==='stuck-recovery'&&event.tick>=frame.tick-180&&event.tick<=frame.tick+180);if(targetChanges>=30&&averageSpeed<5&&!recoveryNear)anomalies.push({kind:'target-thrash',tick:frame.tick,elapsed:frame.elapsed,robotId:id,message:'move target changed on 30 consecutive ticks while nearly stationary',details:{targetChanges,averageSpeed,action:robot.action}});if(stateRun>=windowTicks*3&&['CARRY','PRESS'].includes(robot.action)&&averageSpeed<5&&!((robot.archetype==='bulwark'||robot.archetype==='sweeper')&&robot.action==='PRESS')&&!recoveryNear){anomalies.push({kind:'state-stuck',tick:frame.tick,elapsed:frame.elapsed,robotId:id,message:`state ${robot.action} persisted for ${stateRun} ticks while nearly stationary`,details:{state:robot.action,run:stateRun,averageSpeed}});break;}}}
  for(const event of run.events.filter(event=>event.type==='kick'))if(!event.reason||!event.direction||event.power===undefined)anomalies.push({kind:'kick-without-cause',tick:event.tick,elapsed:event.elapsed,robotId:event.ids?.[0],message:'kick event lacks decision cause/direction/power',details:{event}});
  return anomalies;
}

export function replayEquivalent(a:ScenarioRun,b:ScenarioRun){return normalizeReplay(a)===normalizeReplay(b);}

export type SimulationCheckpoint=ReturnType<MatchSimulation['checkpoint']>;
export interface ReplayTape {checkpoint:SimulationCheckpoint;deltas:number[];}
export function replayCheckpoint(tape:ReplayTape,scenario:ScenarioSpec):ScenarioRun{
  const simulation=new MatchSimulation(tape.checkpoint.seed); simulation.restoreCheckpoint(tape.checkpoint);
  for(const delta of tape.deltas) simulation.tick(delta);
  const telemetry=simulation.getTelemetry(),events=simulation.getEvents();
  return {scenario,state:simulation.snapshot(),events,telemetry,replay:JSON.stringify({scenario,events,telemetry})};
}

export interface ReplayDiff {equal:boolean;firstDivergenceTick:number|null;path?:string;left?:unknown;right?:unknown;}
export function replayDiff(a:ScenarioRun,b:ScenarioRun):ReplayDiff{
  const left=a.telemetry,right=b.telemetry; const length=Math.max(left.length,right.length);
  for(let index=0;index<length;index++){
    const l=left[index],r=right[index]; if(!l||!r)return {equal:false,firstDivergenceTick:l?.tick??r?.tick??null,path:'telemetry.length',left:l?.tick,right:r?.tick};
    const lRobots=[...l.robots].sort((x,y)=>x.id.localeCompare(y.id)),rRobots=[...r.robots].sort((x,y)=>x.id.localeCompare(y.id));
    const checks:Array<[string,unknown,unknown]>=[['ball',l.ball,r.ball],['robots',lRobots,rRobots],['events',l.events,r.events]];
    for(const [path,lv,rv] of checks)if(JSON.stringify(lv)!==JSON.stringify(rv))return {equal:false,firstDivergenceTick:l.tick,path,left:lv,right:rv};
  }
  return {equal:true,firstDivergenceTick:null};
}

export function findDecisionEvents(run:ScenarioRun,robotId?:string){return run.events.filter(event=>(event.type==='decision'||event.type==='state-change'||event.type==='target-change')&&(!robotId||event.ids?.includes(robotId)));}

export function findKickCause(run:ScenarioRun,robotId:string){const kick=run.events.find(event=>event.type==='kick'&&event.ids?.includes(robotId));if(!kick)return undefined;const decision=findDecisionEvents(run,robotId).filter(event=>event.tick<=kick.tick).at(-1);const contact=run.events.filter(event=>event.type==='robot-ball-collision'&&event.ids?.includes(robotId)&&event.tick<=kick.tick).at(-1);return {kick,decision,contact,contactAgeTicks:contact?kick.tick-contact.tick:null};}

export function teamRobots(state:MatchState,team:Team){return state.robots.filter(robot=>robot.team===team);}
export function robotDebug(robot:Robot){return {id:robot.id,team:robot.team,archetype:robot.archetype,action:robot.action,sweeperState:robot.sweeperState,backpedal:robot.backpedal,target:robot.target,targetPosition:{x:robot.moveTargetX,y:robot.moveTargetY},distanceToBall:robot.distanceToBall,distanceToTarget:robot.distanceToTarget,speed:Math.hypot(robot.vx,robot.vy),kickAvailable:robot.kickCooldown<=0&&robot.kickLockout<=0,kickCooldown:robot.kickCooldown,lastKickAt:robot.lastKickAt,kickTarget:robot.kickTarget,kickDirection:{x:robot.kickDirectionX,y:robot.kickDirectionY},kickPower:robot.kickPower,clearImpulse:robot.clearImpulse,returnTick:robot.returnTick,interceptReason:robot.interceptReason,reason:robot.lastDecisionReason,stateChangedAt:robot.stateChangedAt};}
