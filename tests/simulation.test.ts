import { describe, expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';

describe('MatchSimulation', () => {
  it('starts with exactly two robots per team and a deterministic seed', () => {
    const a = new MatchSimulation(42); const b = new MatchSimulation(42);
    expect(a.state.robots.filter(r => r.team === 'blue')).toHaveLength(2);
    expect(a.state.robots.filter(r => r.team === 'orange')).toHaveLength(2);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
  it('scores and resets the ball when it crosses a goal line', () => {
    const match = new MatchSimulation(7); match.start();
    match.state.ball.y = -3;
    match.state.ball.x = match.field.width / 2;
    match.tick(0.016);
    expect(match.state.score.blue).toBe(1);
    expect(match.state.ball.x).toBeCloseTo(match.field.width / 2);
  });
  it('pauses simulation time and ends at 90 seconds', () => {
    const match = new MatchSimulation(9);
    match.start(); match.setPaused(true); match.tick(10); expect(match.state.elapsed).toBe(0);
    expect(match.state.status).toBe('paused');
    match.setPaused(false); match.tick(91);
    expect(match.state.elapsed).toBe(90); expect(match.state.status).toBe('finished');
  });

  it('does not let pausing READY wedge the match', () => {
    const match = new MatchSimulation(3);
    match.setPaused(true);
    expect(match.state.status).toBe('ready');
    match.start();
    match.tick(1);
    expect(match.state.status).toBe('running');
    expect(match.state.elapsed).toBeGreaterThan(0);
  });
  it('composition swaps roles while preserving two robots per team', () => {
    const match = new MatchSimulation(1); match.swapComposition('blue');
    expect(match.state.robots.filter(r => r.team === 'blue')).toHaveLength(2);
    expect(match.state.robots.filter(r => r.team === 'blue').map(r => r.role)).toEqual(['anchor','striker']);
    expect(match.state.robots.filter(r => r.team === 'blue').map(r => r.shape)).toEqual(['square','circle']);
  });

  it('uses the same shape for the same player slot on both teams', () => {
    const robots = new MatchSimulation().state.robots;
    expect(robots.filter(r => r.id.endsWith('-0')).map(r => r.shape)).toEqual(['circle','circle']);
    expect(robots.filter(r => r.id.endsWith('-1')).map(r => r.shape)).toEqual(['square','square']);
  });

  it('keeps robots from occupying the same visual position during play', () => {
    const match = new MatchSimulation(12);
    match.start();
    for(let i=0;i<120;i++) match.tick(1/30);
    for(let i=0;i<match.state.robots.length;i++) for(let j=i+1;j<match.state.robots.length;j++){
      const a=match.state.robots[i], b=match.state.robots[j];
      expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThanOrEqual(37.9);
    }
  });

  it('keeps the match live and reaches a terminal state after 90 seconds', () => {
    const match = new MatchSimulation(2025);
    match.start();
    let movingFrames=0;
    let previousBall={...match.state.ball};
    for(let i=0;i<90*60;i++){
      match.tick(1/60);
      if(Math.hypot(match.state.ball.x-previousBall.x,match.state.ball.y-previousBall.y)>0.01) movingFrames++;
      previousBall={...match.state.ball};
    }
    expect(movingFrames).toBeGreaterThan(90);
    expect(match.state.status).toBe('finished');
    expect(match.state.robots.some(r=>r.action!=='RESET')).toBe(true);
  });

  it('moves anchors in response to the changing ball position', () => {
    const match = new MatchSimulation(42);
    match.start();
    for(let i=0;i<10*60;i++) match.tick(1/60);
    const before = match.state.robots.filter(r=>r.role==='anchor').map(r=>({x:r.x,y:r.y}));
    for(let i=0;i<20*60;i++) match.tick(1/60);
    const after = match.state.robots.filter(r=>r.role==='anchor');
    expect(after.some((r,i)=>Math.hypot(r.x-before[i].x,r.y-before[i].y)>10)).toBe(true);
  });

  it('creates real attacking progression instead of an endless striker pass loop', () => {
    const match = new MatchSimulation(42);
    match.start();
    let minY=match.state.ball.y, maxY=match.state.ball.y;
    for(let i=0;i<60*60;i++){
      match.tick(1/60);
      minY=Math.min(minY,match.state.ball.y); maxY=Math.max(maxY,match.state.ball.y);
    }
    expect(maxY-minY).toBeGreaterThan(300);
    expect(match.state.score.blue+match.state.score.orange).toBeGreaterThan(0);
  });
});
