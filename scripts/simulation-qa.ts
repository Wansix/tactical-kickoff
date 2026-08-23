import { MatchSimulation, type SimulationEvent, type TelemetryFrame, type Team } from '../src/simulation/MatchSimulation';
import { detectAnomalies, type ScenarioRun } from '../src/simulation/SimulationQA';

const SEEDS=Array.from({length:Number(process.env.QA_SEEDS??50)},(_,i)=>i+1);
const SECONDS=Number(process.env.QA_SECONDS??60);

type MatchReport={seed:number;goals:number;blueGoals:number;orangeGoals:number;kicks:number;firstKickTeam:'blue'|'orange'|'none';firstGoalTick:number|null;earlyGoals:number;blueKicks:number;orangeKicks:number;blueWrongDirectionKicks:number;orangeWrongDirectionKicks:number;goalPrecedingKickTeams:string[];wallBounces:number;signature:string;maxCollisionRun:number;maxDirectionReversalRun:number;maxCornerLowSpeedRun:number;anomalyCount:number;anomalyKinds:Record<string,number>;severeAnomalies:number;robotRanges:Record<string,{x:number;y:number}>};

function collisionRun(events:SimulationEvent[]):number{
  const collisions=events.filter(e=>e.type==='robot-robot-collision'&&e.ids?.length===2).sort((a,b)=>a.tick-b.tick);
  let best=0,current=0,lastKey='',lastTick=-2;
  for(const event of collisions){
    const key=event.ids!.slice().sort().join('+');
    if(key===lastKey&&event.tick===lastTick+1) current+=1; else current=1;
    best=Math.max(best,current); lastKey=key; lastTick=event.tick;
  }
  return best;
}

function reversalRun(frames:TelemetryFrame[]):number{
  const ids=frames[0]?.robots.map(r=>r.id)??[]; let best=0;
  for(const id of ids){
    let lastDx=0,lastDy=0,run=0;
    for(let i=1;i<frames.length;i++){
      const a=frames[i-1].robots.find(r=>r.id===id); const b=frames[i].robots.find(r=>r.id===id); if(!a||!b) continue;
      if(frames[i-1].goalResetTimer>0||frames[i].goalResetTimer>0||a.action==='RESET'||b.action==='RESET'){lastDx=0;lastDy=0;run=0;continue;}
      const dx=b.x-a.x,dy=b.y-a.y; const distance=Math.hypot(dx,dy); if(distance<2) continue;
      const lastDistance=Math.hypot(lastDx,lastDy);
      if(lastDistance>=2&&dx*lastDx+dy*lastDy<0) run+=1; else run=0;
      best=Math.max(best,run); lastDx=dx; lastDy=dy;
    }
  }
  return best;
}

function rangeReport(frames:TelemetryFrame[]):Record<string,{x:number;y:number}>{
  const out:Record<string,{x:number;y:number}>={};
  for(const robot of frames[0]?.robots??[]){
    const rows=frames.map(f=>f.robots.find(r=>r.id===robot.id)!).filter(Boolean);
    out[robot.id]={x:Math.max(...rows.map(r=>r.x))-Math.min(...rows.map(r=>r.x)),y:Math.max(...rows.map(r=>r.y))-Math.min(...rows.map(r=>r.y))};
  }
  return out;
}

function run(seed:number):MatchReport{
  const match=new MatchSimulation(seed); match.start();
  for(let i=0;i<SECONDS*60;i++) match.tick(1/60);
  const frames=match.getTelemetry(); const events=frames.flatMap(f=>f.events);
  const goals=events.filter(e=>e.type==='goal');
  const blueGoals=goals.filter(e=>e.decision?.scoringTeam==='blue').length,orangeGoals=goals.filter(e=>e.decision?.scoringTeam==='orange').length;
  const signature=[match.state.score.blue,match.state.score.orange,events.filter(e=>e.type==='kick').length,events.filter(e=>e.type==='wall-bounce').length,Math.round(Math.max(...frames.map(f=>f.ball.x))-Math.min(...frames.map(f=>f.ball.x))),Math.round(Math.max(...frames.map(f=>f.ball.y))-Math.min(...frames.map(f=>f.ball.y)))].join(':');
  const firstKick=events.find(e=>e.type==='kick');
  const firstKickTeam=firstKick?.ids?.[0].startsWith('blue')?'blue':firstKick?.ids?.[0].startsWith('orange')?'orange':'none';
  const kicks=events.filter(e=>e.type==='kick');
  const wrong=(team:Team)=>kicks.filter(e=>e.ids?.[0].startsWith(team)&&((team==='blue'&&e.vyAfter!>=0)||(team==='orange'&&e.vyAfter!<=0))).length;
  const goalPrecedingKickTeams=goals.map(goal=>kicks.filter(kick=>kick.tick<=goal.tick).at(-1)?.ids?.[0].split('-')[0]??'none');
  const corners=[{x:18,y:18},{x:match.field.width-18,y:18},{x:18,y:match.field.height-18},{x:match.field.width-18,y:match.field.height-18}]; let cornerRun=0,maxCornerLowSpeedRun=0;
  for(const frame of frames){const nearCorner=corners.some(c=>Math.hypot(frame.ball.x-c.x,frame.ball.y-c.y)<75);const lowSpeed=Math.hypot(frame.ball.vx,frame.ball.vy)<20&&frame.goalResetTimer===0&&frame.elapsed>5;if(nearCorner&&lowSpeed)cornerRun++;else cornerRun=0;maxCornerLowSpeedRun=Math.max(maxCornerLowSpeedRun,cornerRun);}
  const qaRun:ScenarioRun={scenario:{id:`MATCH_${seed}`,seed,durationTicks:SECONDS*60},state:match.snapshot(),events,telemetry:frames,replay:''};
  const anomalies=detectAnomalies(qaRun); const severeAnomalies=anomalies.filter(anomaly=>['non-finite','out-of-bounds','speed-cap'].includes(anomaly.kind)).length; const anomalyKinds:Record<string,number>={}; for(const anomaly of anomalies) anomalyKinds[anomaly.kind]=(anomalyKinds[anomaly.kind]??0)+1;
  return {seed,goals:goals.length,blueGoals,orangeGoals,kicks:kicks.length,firstKickTeam,firstGoalTick:goals[0]?.tick??null,earlyGoals:goals.filter(e=>e.tick<=5*60).length,blueKicks:kicks.filter(e=>e.ids?.[0].startsWith('blue')).length,orangeKicks:kicks.filter(e=>e.ids?.[0].startsWith('orange')).length,blueWrongDirectionKicks:wrong('blue'),orangeWrongDirectionKicks:wrong('orange'),goalPrecedingKickTeams,wallBounces:events.filter(e=>e.type==='wall-bounce').length,signature,maxCollisionRun:collisionRun(events),maxDirectionReversalRun:reversalRun(frames),maxCornerLowSpeedRun,anomalyCount:anomalies.length,anomalyKinds,severeAnomalies,robotRanges:rangeReport(frames)};
}

function defensiveScenario(team:Team){
  const match=new MatchSimulation(77,{blue:['bulwark','bulwark'],orange:['bulwark','bulwark']}); match.start();
  match.state.ball.x=270; match.state.ball.y=team==='blue'?640:220; match.state.ball.vy=team==='blue'?80:-80;
  for(let i=0;i<90;i++) match.tick(1/60);
  const contacts=match.getEvents().filter(e=>e.type==='robot-ball-collision'&&e.ids?.some(id=>id.startsWith(`${team}-`))).length;
  const concededGoals=match.getEvents().filter(e=>e.type==='goal'&&e.decision?.scoringTeam!==team).length;
  return {contacts,goals:concededGoals};
}

const reports=SEEDS.map(run); const scoringTeams=new Set<Team>();
for(const r of reports){if(r.blueGoals>0) scoringTeams.add('blue');if(r.orangeGoals>0) scoringTeams.add('orange');}
const signatures=new Set(reports.map(r=>r.signature));
const totalGoals=reports.reduce((n,r)=>n+r.goals,0),blueGoals=reports.reduce((n,r)=>n+r.blueGoals,0),orangeGoals=reports.reduce((n,r)=>n+r.orangeGoals,0);
const goalConcentration=totalGoals?Math.max(blueGoals,orangeGoals)/totalGoals:0;
const scoringSeedBlue=reports.filter(r=>r.blueGoals>0).length,scoringSeedOrange=reports.filter(r=>r.orangeGoals>0).length;
const firstKickBlue=reports.filter(r=>r.firstKickTeam==='blue').length,firstKickOrange=reports.filter(r=>r.firstKickTeam==='orange').length;
const earlyGoals=reports.reduce((n,r)=>n+r.earlyGoals,0);
const blueKicks=reports.reduce((n,r)=>n+r.blueKicks,0),orangeKicks=reports.reduce((n,r)=>n+r.orangeKicks,0);
const blueWrongDirectionKicks=reports.reduce((n,r)=>n+r.blueWrongDirectionKicks,0),orangeWrongDirectionKicks=reports.reduce((n,r)=>n+r.orangeWrongDirectionKicks,0);
const goalPrecedingKickTeams=reports.flatMap(r=>r.goalPrecedingKickTeams);
const defensiveBlue=defensiveScenario('blue'),defensiveOrange=defensiveScenario('orange');
const maxCollisionRun=Math.max(...reports.map(r=>r.maxCollisionRun)); const maxDirectionReversalRun=Math.max(...reports.map(r=>r.maxDirectionReversalRun));
const rangeFailures=reports.flatMap(r=>Object.entries(r.robotRanges).filter(([,range])=>Math.max(range.x,range.y)<40).map(([id])=>`${r.seed}:${id}`));
const failures:string[]=[];
if(signatures.size<20) failures.push(`unique signatures ${signatures.size}<20`);
if(totalGoals<10) failures.push(`total goals ${totalGoals}<10`);
if(!scoringTeams.has('blue')||!scoringTeams.has('orange')) failures.push(`scoring teams ${[...scoringTeams].join(',')||'none'}`);
if(scoringSeedBlue<5||scoringSeedOrange<5) failures.push(`scoring seed minimum blue=${scoringSeedBlue} orange=${scoringSeedOrange}`);
if(firstKickBlue<5||firstKickOrange<5) failures.push(`first kickoff minimum blue=${firstKickBlue} orange=${firstKickOrange}`);
// Early goals are reported for observability; the goal sensors remain open during kickoff.
if(defensiveBlue.contacts<1||defensiveOrange.contacts<1||defensiveBlue.goals>0||defensiveOrange.goals>0) failures.push(`defensive scenario blue=${JSON.stringify(defensiveBlue)} orange=${JSON.stringify(defensiveOrange)}`);
if(goalConcentration>0.7) failures.push(`goal concentration ${goalConcentration.toFixed(3)}>0.7 blue=${blueGoals} orange=${orangeGoals}`);
const scoringSeedTotal=scoringSeedBlue+scoringSeedOrange;
if(Math.max(scoringSeedBlue,scoringSeedOrange)>scoringSeedTotal*0.8) failures.push(`scoring seed concentration blue=${scoringSeedBlue} orange=${scoringSeedOrange}`);
if(maxCollisionRun>3) failures.push(`max same-pair collision run ${maxCollisionRun}>3`);
if(maxDirectionReversalRun>6) failures.push(`max direction reversal run ${maxDirectionReversalRun}>6`);
const maxCornerLowSpeedRun=Math.max(...reports.map(r=>r.maxCornerLowSpeedRun));
if(maxCornerLowSpeedRun>180) failures.push(`max corner low-speed run ${maxCornerLowSpeedRun}>180 ticks`);
const anomalyCount=reports.reduce((n,r)=>n+r.anomalyCount,0),severeAnomalies=reports.reduce((n,r)=>n+r.severeAnomalies,0),anomalyKinds:Record<string,number>={}; for(const report of reports)for(const [kind,count] of Object.entries(report.anomalyKinds))anomalyKinds[kind]=(anomalyKinds[kind]??0)+count;
if(severeAnomalies>0) failures.push(`severe simulation anomalies ${severeAnomalies}>0`);
if(rangeFailures.length>0) failures.push(`low movement ranges ${rangeFailures.slice(0,5).join(',')}`);
const result={matches:reports.length,uniqueSignatures:signatures.size,totalGoals,blueGoals,orangeGoals,goalConcentration,scoringSeedBlue,scoringSeedOrange,firstKickBlue,firstKickOrange,blueKicks,orangeKicks,blueWrongDirectionKicks,orangeWrongDirectionKicks,goalPrecedingKickTeams,earlyGoals,firstGoalTicks:reports.map(r=>({seed:r.seed,tick:r.firstGoalTick})).filter(r=>r.tick!==null).slice(0,10),defensiveBlue,defensiveOrange,maxCollisionRun,maxDirectionReversalRun,maxCornerLowSpeedRun,anomalyCount,anomalyKinds,severeAnomalies,scoringTeams:[...scoringTeams],failures};
console.log(`SIMULATION_QA_REPORT ${JSON.stringify(result)}`);
if(failures.length) process.exit(1);
