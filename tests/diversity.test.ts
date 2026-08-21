import { describe, expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';

describe('multi-match emergent behavior inspection', () => {
  it('produces diverse physical situations across deterministic seeds', () => {
    const reports=[] as Array<{
      seed:number; score:string; goals:number; wallBounces:number; robotBall:number;
      robotRobot:number; kicks:number; ballRange:number; finalQuadrant:number; signature:string;
    }>;

    for(let seed=1;seed<=50;seed++){
      const match=new MatchSimulation(seed); match.start();
      const initial={...match.state.ball};
      let minX=initial.x,maxX=initial.x,minY=initial.y,maxY=initial.y;
      for(let tick=0;tick<60*60;tick++){
        match.tick(1/60);
        minX=Math.min(minX,match.state.ball.x); maxX=Math.max(maxX,match.state.ball.x);
        minY=Math.min(minY,match.state.ball.y); maxY=Math.max(maxY,match.state.ball.y);
      }
      const events=match.getEvents();
      const goals=events.filter(event=>event.type==='goal');
      const wallBounces=events.filter(event=>event.type==='wall-bounce').length;
      const robotBall=events.filter(event=>event.type==='robot-ball-collision').length;
      const robotRobot=events.filter(event=>event.type==='robot-robot-collision').length;
      const kicks=events.filter(event=>event.type==='kick').length;
      const finalQuadrant=(match.state.ball.x>=match.field.width/2?1:0)+(match.state.ball.y>=match.field.height/2?2:0);
      const ballRange=Math.max(maxX-minX,maxY-minY);
      const signature=[match.state.score.blue,match.state.score.orange,goals.length,Math.min(5,wallBounces),Math.min(5,kicks),Math.min(9,Math.floor(robotBall/20)),finalQuadrant].join(':');
      reports.push({seed,score:`${match.state.score.blue}-${match.state.score.orange}`,goals:goals.length,wallBounces,robotBall,robotRobot,kicks,ballRange,finalQuadrant,signature});
    }

    const signatures=new Set(reports.map(report=>report.signature));
    const scoringTeams=new Set(reports.flatMap(report=>report.goals===0?[]:[report.score.split('-')[0]!=='0'?'blue':'orange']));
    const totalGoals=reports.reduce((sum,report)=>sum+report.goals,0);
    const totalKicks=reports.reduce((sum,report)=>sum+report.kicks,0);
    const totalWallBounces=reports.reduce((sum,report)=>sum+report.wallBounces,0);
    const maxRange=Math.max(...reports.map(report=>report.ballRange));

    console.log('DIVERSITY_REPORT',JSON.stringify({matches:reports.length,uniqueSignatures:signatures.size,totalGoals,totalKicks,totalWallBounces,maxRange,scoringTeams:[...scoringTeams]}));
    expect(signatures.size).toBeGreaterThanOrEqual(8);
    expect(totalGoals).toBeGreaterThan(0);
    expect(totalKicks).toBeGreaterThan(0);
    expect(totalWallBounces).toBeGreaterThan(0);
    expect(maxRange).toBeGreaterThan(300);
  });
});
