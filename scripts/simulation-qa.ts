import { MatchSimulation, type SimulationEvent, type TelemetryFrame, type Team } from '../src/simulation/MatchSimulation';

const SEEDS=Array.from({length:Number(process.env.QA_SEEDS??50)},(_,i)=>i+1);
const SECONDS=Number(process.env.QA_SECONDS??60);

type MatchReport={seed:number;goals:number;blueGoals:number;orangeGoals:number;kicks:number;firstKickTeam:'blue'|'orange'|'none';wallBounces:number;signature:string;maxCollisionRun:number;maxDirectionReversalRun:number;robotRanges:Record<string,{x:number;y:number}>};

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
    let lastSign=0,run=0;
    for(let i=1;i<frames.length;i++){
      const a=frames[i-1].robots.find(r=>r.id===id); const b=frames[i].robots.find(r=>r.id===id); if(!a||!b) continue;
      const dx=b.x-a.x,dy=b.y-a.y; if(Math.hypot(dx,dy)<2) continue; const sign=Math.abs(dx)>=Math.abs(dy)?Math.sign(dx):Math.sign(dy);
      if(sign!==0&&lastSign!==0&&sign!==lastSign) run+=1; else if(sign!==0) run=0;
      best=Math.max(best,run); if(sign!==0) lastSign=sign;
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
  const blueGoals=goals.filter(e=>e.y<0).length,orangeGoals=goals.filter(e=>e.y>match.field.height).length;
  const signature=[match.state.score.blue,match.state.score.orange,events.filter(e=>e.type==='kick').length,events.filter(e=>e.type==='wall-bounce').length,Math.round(Math.max(...frames.map(f=>f.ball.x))-Math.min(...frames.map(f=>f.ball.x))),Math.round(Math.max(...frames.map(f=>f.ball.y))-Math.min(...frames.map(f=>f.ball.y)))].join(':');
  const firstKick=events.find(e=>e.type==='kick');
  const firstKickTeam=firstKick?.ids?.[0].startsWith('blue')?'blue':firstKick?.ids?.[0].startsWith('orange')?'orange':'none';
  return {seed,goals:goals.length,blueGoals,orangeGoals,kicks:events.filter(e=>e.type==='kick').length,firstKickTeam,wallBounces:events.filter(e=>e.type==='wall-bounce').length,signature,maxCollisionRun:collisionRun(events),maxDirectionReversalRun:reversalRun(frames),robotRanges:rangeReport(frames)};
}

const reports=SEEDS.map(run); const scoringTeams=new Set<Team>();
for(const r of reports){if(r.blueGoals>0) scoringTeams.add('blue');if(r.orangeGoals>0) scoringTeams.add('orange');}
const signatures=new Set(reports.map(r=>r.signature));
const totalGoals=reports.reduce((n,r)=>n+r.goals,0),blueGoals=reports.reduce((n,r)=>n+r.blueGoals,0),orangeGoals=reports.reduce((n,r)=>n+r.orangeGoals,0);
const scoringSeedBlue=reports.filter(r=>r.blueGoals>0).length,scoringSeedOrange=reports.filter(r=>r.orangeGoals>0).length;
const firstKickBlue=reports.filter(r=>r.firstKickTeam==='blue').length,firstKickOrange=reports.filter(r=>r.firstKickTeam==='orange').length;
const maxCollisionRun=Math.max(...reports.map(r=>r.maxCollisionRun)); const maxDirectionReversalRun=Math.max(...reports.map(r=>r.maxDirectionReversalRun));
const rangeFailures=reports.flatMap(r=>Object.entries(r.robotRanges).filter(([,range])=>Math.max(range.x,range.y)<40).map(([id])=>`${r.seed}:${id}`));
const failures:string[]=[];
if(signatures.size<20) failures.push(`unique signatures ${signatures.size}<20`);
if(totalGoals<10) failures.push(`total goals ${totalGoals}<10`);
if(!scoringTeams.has('blue')||!scoringTeams.has('orange')) failures.push(`scoring teams ${[...scoringTeams].join(',')||'none'}`);
if(scoringSeedBlue<5||scoringSeedOrange<5) failures.push(`scoring seed minimum blue=${scoringSeedBlue} orange=${scoringSeedOrange}`);
if(firstKickBlue<5||firstKickOrange<5) failures.push(`first kickoff minimum blue=${firstKickBlue} orange=${firstKickOrange}`);
const scoringSeedTotal=scoringSeedBlue+scoringSeedOrange;
if(Math.max(scoringSeedBlue,scoringSeedOrange)>scoringSeedTotal*0.8) failures.push(`scoring seed concentration blue=${scoringSeedBlue} orange=${scoringSeedOrange}`);
if(maxCollisionRun>3) failures.push(`max same-pair collision run ${maxCollisionRun}>3`);
if(maxDirectionReversalRun>6) failures.push(`max direction reversal run ${maxDirectionReversalRun}>6`);
if(rangeFailures.length>0) failures.push(`low movement ranges ${rangeFailures.slice(0,5).join(',')}`);
const result={matches:reports.length,uniqueSignatures:signatures.size,totalGoals,blueGoals,orangeGoals,scoringSeedBlue,scoringSeedOrange,firstKickBlue,firstKickOrange,maxCollisionRun,maxDirectionReversalRun,scoringTeams:[...scoringTeams],failures};
console.log(`SIMULATION_QA_REPORT ${JSON.stringify(result)}`);
if(failures.length) process.exit(1);
