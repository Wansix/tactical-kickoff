import { describe, expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';

describe('goal mouth geometry contract',()=>{
  it('scores through the visible top and bottom mouth without wall bounce',()=>{
    for(const [team,y,vy] of [['blue',17,-100],['orange',843,100] ] as const){
      const match=new MatchSimulation(900+(team==='blue'?1:2));
      match.start();
      match.state.ball.x=270; match.state.ball.y=y; match.state.ball.vx=0; match.state.ball.vy=vy;
      match.tick(1/60);
      expect(match.getEvents().some(event=>event.type==='goal')).toBe(true);
      expect(match.getEvents().filter(event=>event.type==='wall-bounce')).toHaveLength(0);
      expect(match.state.goalResetTimer).toBeGreaterThan(0);
    }
  });

  it('rejects a shot through the post occupied area',()=>{
    for(const [x,y,vy] of [[190,17,-100],[350,17,-100],[190,843,100],[350,843,100]] as const){
      const match=new MatchSimulation(910+x+y);
      match.start();
      match.state.ball.x=x; match.state.ball.y=y; match.state.ball.vx=0; match.state.ball.vy=vy;
      match.tick(1/60);
      expect(match.getEvents().some(event=>event.type==='goal')).toBe(false);
      expect(match.state.goalResetTimer).toBe(0);
    }
  });

  it('holds the scored ball inside the net instead of reflecting it back through the mouth',()=>{
    const match=new MatchSimulation(920); match.start();
    match.state.ball.x=270; match.state.ball.y=17; match.state.ball.vy=-700;
    match.tick(1/60);
    expect(match.state.goalResetTimer).toBeGreaterThan(0);
    for(let i=0;i<30;i++)match.tick(1/60);
    expect(match.state.goalResetTimer).toBeGreaterThan(0);
    expect(match.state.ball.y).toBe(-95);
    expect(match.state.ball.vy).toBe(0);
  });
});
