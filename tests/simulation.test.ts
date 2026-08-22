import { describe, expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';

describe('MatchSimulation', () => {
  it('supports an isolated Striker-vs-Striker 1v1 test scenario', () => {
    const match = new MatchSimulation(31);
    match.configureStriker1v1ForTest();
    expect(match.state.robots).toHaveLength(2);
    expect(match.state.robots.map(robot => robot.archetype)).toEqual(['striker','striker']);
    expect(new Set(match.state.robots.map(robot => robot.team))).toEqual(new Set(['blue','orange']));
    match.start();
    for(let i=0;i<60*20;i++) match.tick(1/60);
    expect(match.getEvents().some(event => event.type === 'robot-ball-collision')).toBe(true);
    expect(match.getEvents().some(event => event.type === 'kick')).toBe(true);
  });
  it('starts with exactly two robots per team and a deterministic seed', () => {
    const a = new MatchSimulation(42); const b = new MatchSimulation(42);
    expect(a.state.robots.filter(r => r.team === 'blue')).toHaveLength(2);
    expect(a.state.robots.filter(r => r.team === 'orange')).toHaveLength(2);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
  it('scores and resets the ball when it crosses a goal line', () => {
    const match = new MatchSimulation(7); match.start(); match.tick(5);
    match.state.ball.y = -3;
    match.state.ball.x = match.field.width / 2;
    match.state.ball.vy = -10;
    match.tick(1/60);
    expect(match.state.score.blue).toBe(1);
    expect(match.state.goalResetTimer).toBeGreaterThan(0.9);
    expect(match.state.ball.y).toBeLessThan(-2);
    expect(match.state.ball.vx).toBe(0);
    expect(match.state.ball.vy).toBe(0);
    match.tick(1);
    expect(match.state.ball.x).toBeCloseTo(match.field.width / 2);
    expect(match.state.ball.y).toBeCloseTo(match.field.height / 2);
  });

  it('resets robots to their seed formation with no residual motion after a goal hold', () => {
    const match = new MatchSimulation(112); match.start();
    const formation = match.state.robots.map(robot => ({id:robot.id,x:robot.x,y:robot.y}));
    match.tick(5);
    match.state.robots.forEach(robot => { robot.x=270; robot.y=430; robot.vx=90; robot.vy=-40; robot.kickCooldown=0.8; robot.kickLockout=0.1; });
    match.state.ball.x=match.field.width/2; match.state.ball.y=-3; match.state.ball.vy=-10;
    match.tick(1/60); match.tick(1);
    expect(match.state.robots.map(robot => ({id:robot.id,x:robot.x,y:robot.y}))).toEqual(formation);
    expect(match.state.robots.every(robot => robot.vx===0 && robot.vy===0 && robot.kickCooldown===0 && robot.kickLockout===0)).toBe(true);
  });

  it('does not score outside the rendered goal mouth', () => {
    const match = new MatchSimulation(8); match.start();
    match.state.ball.x = 40; match.state.ball.y = -3; match.state.ball.vy = -10; match.tick(1/60);
    expect(match.state.score.blue).toBe(0);
    expect(match.state.ball.y).toBeGreaterThanOrEqual(18);
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
    expect(match.state.robots.filter(r => r.team === 'blue').map(r => r.role)).toEqual(['bulwark','striker']);
    expect(match.state.robots.filter(r => r.team === 'blue').map(r => r.shape)).toEqual(['square','circle']);
    expect(match.state.robots.filter(r => r.team === 'blue').map(r => r.maxSpeed)).toEqual([312,460]);
    expect(match.state.robots.filter(r => r.team === 'blue').map(r => r.acceleration)).toEqual([1200,2000]);
  });

  it('uses the same shape for the same player slot on both teams', () => {
    const robots = new MatchSimulation().state.robots;
    expect(robots.filter(r => r.id.endsWith('-0')).map(r => r.shape)).toEqual(['circle','circle']);
    expect(robots.filter(r => r.id.endsWith('-1')).map(r => r.shape)).toEqual(['square','square']);
  });

  it('sends an anchor to intercept a ball moving toward its own goal', () => {
    const blueMatch=new MatchSimulation(77); blueMatch.start();
    const blueAnchor=blueMatch.state.robots.find(r=>r.id==='blue-1')!;
    blueMatch.state.ball.x=270; blueMatch.state.ball.y=600; blueMatch.state.ball.vy=80;
    const blueStart={x:blueAnchor.x,y:blueAnchor.y};
    for(let i=0;i<90;i++)blueMatch.tick(1/60);
    const blueContacts=blueMatch.getEvents().filter(event=>event.type==='robot-ball-collision'&&event.ids?.includes('blue-1'));
    expect(blueMatch.getTelemetry().some(frame=>frame.robots.find(robot=>robot.id==='blue-1')?.action==='PRESS')).toBe(true);
    expect(Math.hypot(blueAnchor.x-blueStart.x,blueAnchor.y-blueStart.y)).toBeGreaterThan(40);
    expect(blueContacts.length).toBeGreaterThan(0);

    const orangeMatch=new MatchSimulation(77); orangeMatch.start();
    const orangeAnchor=orangeMatch.state.robots.find(r=>r.id==='orange-1')!;
    orangeMatch.state.ball.x=270; orangeMatch.state.ball.y=260; orangeMatch.state.ball.vy=-80;
    const orangeStart={x:orangeAnchor.x,y:orangeAnchor.y};
    for(let i=0;i<90;i++)orangeMatch.tick(1/60);
    const orangeContacts=orangeMatch.getEvents().filter(event=>event.type==='robot-ball-collision'&&event.ids?.includes('orange-1'));
    expect(orangeMatch.getTelemetry().some(frame=>frame.robots.find(robot=>robot.id==='orange-1')?.action==='PRESS')).toBe(true);
    expect(Math.hypot(orangeAnchor.x-orangeStart.x,orangeAnchor.y-orangeStart.y)).toBeGreaterThan(40);
    expect(orangeContacts.length).toBeGreaterThan(0);
  });

  it('does not allow a kickoff to score during the initial alignment window', () => {
    const match=new MatchSimulation(2025); match.start();
    for(let i=0;i<45;i++)match.tick(1/60);
    const earlyGoals=match.getEvents().filter(event=>event.type==='goal');
    expect(earlyGoals).toHaveLength(0);
  });

  it('keeps both goal sensors closed during the initial five-second safety window', () => {
    const match=new MatchSimulation(113); match.start(); match.tick(1);
    match.state.ball.x=match.field.width/2; match.state.ball.y=match.field.height-17; match.state.ball.vy=10;
    match.tick(1/60);
    expect(match.state.score.orange).toBe(0);
    expect(match.state.goalResetTimer).toBe(0);
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
    if(match.state.goalResetTimer>0) match.tick(1);
    expect(match.state.status).toBe('finished');
    expect(match.state.robots.some(r=>r.action!=='RESET')).toBe(true);
  });

  it('moves anchors in response to the changing ball position', () => {
    const match = new MatchSimulation(42); match.start();
    const before=match.state.robots.filter(r=>r.role==='bulwark').map(r=>({...r}));
    match.state.ball.y=200; match.state.ball.x=120;
    for(let i=0;i<2*60;i++){match.state.ball.y=200;match.state.ball.x=120;match.tick(1/60);}
    const after=match.state.robots.filter(r=>r.role==='bulwark');
    expect(after.some((r,i)=>Math.hypot(r.x-before[i].x,r.y-before[i].y)>20)).toBe(true);
  });

  it('sends each anchor toward a ball inside its own half', () => {
    const blueMatch = new MatchSimulation(42); blueMatch.start();
    const blueBefore={...blueMatch.state.robots.find(r=>r.id==='blue-1')!};
    blueMatch.state.ball.y=700; blueMatch.tick(1/60);
    expect(blueMatch.state.robots.find(r=>r.id==='blue-1')!.action).toBe('PRESS');
    for(let i=0;i<2*60;i++){blueMatch.state.ball.y=700;blueMatch.tick(1/60);}
    const blueAfter=blueMatch.state.robots.find(r=>r.id==='blue-1')!;
    expect(Math.hypot(blueAfter.x-blueBefore.x,blueAfter.y-blueBefore.y)).toBeGreaterThan(20);

    const orangeMatch = new MatchSimulation(42); orangeMatch.start();
    const orangeBefore={...orangeMatch.state.robots.find(r=>r.id==='orange-1')!};
    orangeMatch.state.ball.y=200; orangeMatch.tick(1/60);
    expect(orangeMatch.state.robots.find(r=>r.id==='orange-1')!.action).toBe('PRESS');
    for(let i=0;i<2*60;i++){orangeMatch.state.ball.y=200;orangeMatch.tick(1/60);}
    const orangeAfter=orangeMatch.state.robots.find(r=>r.id==='orange-1')!;
    expect(Math.hypot(orangeAfter.x-orangeBefore.x,orangeAfter.y-orangeBefore.y)).toBeGreaterThan(20);
  });

  it('stages a striker that is between the ball and the opponent goal', () => {
    const match=new MatchSimulation(42); match.start();
    const striker=match.state.robots.find(r=>r.id==='blue-0')!;
    match.state.ball.x=270; match.state.ball.y=430;
    striker.x=270; striker.y=300;
    match.tick(1/60);
    expect(Math.abs(striker.vx)).toBeGreaterThan(0);
    expect(striker.action).toBe('PRESS');
  });

  it('keeps PRESS at max approach speed inside the near-ball envelope', () => {
    const match=new MatchSimulation(778); match.start(); (match as any).kickoffTimer=0; (match as any).kickoffFirstKickPending=false;
    const robot=match.state.robots.find(r=>r.id==='orange-0')!;
    robot.x=270; robot.y=250; match.state.ball.x=270; match.state.ball.y=360; match.state.ball.vx=0; match.state.ball.vy=0;
    for(let i=0;i<120;i++)match.tick(1/60);
    const decisionEvents=match.getEvents().filter(event=>event.type==='decision') as any[];
    expect(decisionEvents.some(event=>event.ids?.includes(robot.id)&&event.state==='PRESS'&&event.decision?.desiredSpeed===robot.maxSpeed)).toBe(true);
  });

  it('stages a bulwark that has crossed to the attack side of its own-half ball', () => {
    const match=new MatchSimulation(42); match.start();
    const anchor=match.state.robots.find(r=>r.id==='blue-1')!;
    match.state.ball.x=270; match.state.ball.y=600;
    anchor.x=270; anchor.y=500;
    match.tick(1/60);
    expect(Math.abs(anchor.vx)).toBeGreaterThan(0);
  });

  it('settles robots near a stationary target instead of oscillating forever', () => {
    const match=new MatchSimulation(77,{blue:['bulwark','bulwark'],orange:['bulwark','bulwark']});
    match.start();
    const samples:number[]=[];
    for(let i=0;i<8*60;i++){
      match.tick(1/60);
      if(i>=6*60)samples.push(match.state.robots[1].y);
    }
    expect(Math.max(...samples)-Math.min(...samples)).toBeLessThan(8);
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
  });
});
