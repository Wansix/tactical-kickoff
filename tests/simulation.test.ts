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
  });

  it('assigns distinct visual shapes to all four players', () => {
    expect(new MatchSimulation().state.robots.map(r => r.shape)).toEqual(['circle','square','diamond','hex']);
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
});
