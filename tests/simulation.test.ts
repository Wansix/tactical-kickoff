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
    match.state.ball.x = match.field.width + 3;
    match.state.ball.y = match.field.height / 2;
    match.tick(0.016);
    expect(match.state.score.blue).toBe(1);
    expect(match.state.ball.x).toBeCloseTo(match.field.width / 2);
  });
  it('pauses simulation time and ends at 90 seconds', () => {
    const match = new MatchSimulation(9);
    match.setPaused(true); match.tick(10); expect(match.state.elapsed).toBe(0);
    match.setPaused(false); match.tick(91);
    expect(match.state.elapsed).toBe(90); expect(match.state.status).toBe('finished');
  });
  it('composition swaps roles while preserving two robots per team', () => {
    const match = new MatchSimulation(1); match.swapComposition('blue');
    expect(match.state.robots.filter(r => r.team === 'blue')).toHaveLength(2);
    expect(match.state.robots.filter(r => r.team === 'blue').map(r => r.role)).toEqual(['anchor','striker']);
  });
});
