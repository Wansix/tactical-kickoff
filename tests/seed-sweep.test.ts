import { expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';

it('produces an observable goal across a deterministic 100-seed sweep',()=>{
  const results=[] as Array<{seed:number;blue:number;orange:number;contacts:number;goals:number}>;
  for(let seed=1;seed<=100;seed++){
    const match=new MatchSimulation(seed);match.start();
    for(let i=0;i<60*60;i++)match.tick(1/60);
    const events=match.getEvents();
    results.push({seed,blue:match.state.score.blue,orange:match.state.score.orange,contacts:events.filter(event=>event.type==='robot-ball-collision').length,goals:events.filter(event=>event.type==='goal').length});
  }
  const totalGoals=results.reduce((sum,row)=>sum+row.goals,0);
  console.log('SEED_SWEEP_SUMMARY',JSON.stringify({totalGoals,scoringSeeds:results.filter(row=>row.goals>0).map(row=>row.seed),maxContacts:Math.max(...results.map(row=>row.contacts))}));
  expect(totalGoals).toBeGreaterThan(0);
});
