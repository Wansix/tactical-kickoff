import { describe, expect, it } from 'vitest';
import { MatchSimulation, GOAL_AREA, type Team, type RobotArchetype, type StartSlot } from '../src/simulation/MatchSimulation';

describe('3v3 roster and pre-match composition', () => {
  it('creates a deterministic goalkeeper plus two field robots per team', () => {
    const composition = MatchSimulation.default3v3Composition();
    const match = new MatchSimulation(303, composition);
    expect(match.state.robots).toHaveLength(6);
    for (const team of ['blue', 'orange'] as Team[]) {
      const robots = match.state.robots.filter(robot => robot.team === team);
      expect(robots.map(robot => robot.archetype)).toEqual(['striker', 'sweeper', 'goalkeeper']);
      expect(robots.find(robot => robot.archetype === 'goalkeeper')).toMatchObject({ x: 270 });
    }
    expect(match.snapshot()).toEqual(new MatchSimulation(303, composition).snapshot());
  });

  it('tracks the ball laterally on the goal line without leaving the goal mouth', () => {
    const match = new MatchSimulation(304, MatchSimulation.default3v3Composition());
    match.start();
    const goalkeeper = match.state.robots.find(robot => robot.team === 'blue' && robot.archetype === 'goalkeeper')!;
    for (const robot of match.state.robots) if (robot !== goalkeeper) { robot.maxSpeed=0; robot.acceleration=0; }
    const homeY = goalkeeper.homeY;
    match.state.ball.x = 80; match.state.ball.y = 120;
    for (let tick = 0; tick < 120; tick++) match.tick(1 / 60);
    const leftX = goalkeeper.x;
    match.state.ball.x = 460;
    for (let tick = 0; tick < 180; tick++) match.tick(1 / 60);
    expect(goalkeeper.x).toBeGreaterThan(leftX + 20);
    expect(goalkeeper.x).toBeGreaterThanOrEqual(GOAL_AREA.left + 18);
    expect(goalkeeper.x).toBeLessThanOrEqual(GOAL_AREA.right - 18);
    expect(goalkeeper.moveTargetX).not.toBe(270);
    expect(goalkeeper.y).toBe(homeY);
    expect(goalkeeper.action).toBe('COVER');
  });

  it('validates field start slots and snapshots the selected composition', () => {
    const match = new MatchSimulation(305, MatchSimulation.default3v3Composition());
    const selected: Record<Team, [RobotArchetype, RobotArchetype]> = {
      blue: ['scout', 'cannon'], orange: ['dribbler', 'striker'],
    };
    const slots: Record<Team, [StartSlot, StartSlot]> = {
      blue: ['left', 'right'], orange: ['right', 'left'],
    };
    match.setComposition('blue', selected.blue, slots.blue);
    match.setComposition('orange', selected.orange, slots.orange);
    expect(match.state.robots.map(robot => [robot.id, robot.archetype, robot.startSlot])).toEqual([
      ['blue-0', 'scout', 'left'], ['blue-1', 'cannon', 'right'], ['blue-2', 'goalkeeper', 'goalkeeper'],
      ['orange-0', 'dribbler', 'right'], ['orange-1', 'striker', 'left'], ['orange-2', 'goalkeeper', 'goalkeeper'],
    ]);
    expect(() => match.setComposition('blue', ['scout', 'cannon'], ['left', 'left'])).toThrow(/distinct/);
    expect(match.snapshot().robots.find((robot: { id: string }) => robot.id === 'blue-0')).toMatchObject({ archetype: 'scout', startSlot: 'left' });
  });
});
