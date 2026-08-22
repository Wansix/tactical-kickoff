import { describe, expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';
import { configureStriker1v1 } from './fixtures';

describe('MatchSimulation', () => {
  it('supports an isolated Striker-vs-Striker 1v1 test scenario', () => {
    const match = new MatchSimulation(31);
    configureStriker1v1(match);
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
    expect(match.state.ball.vy).toBeLessThan(0);
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
    const blueMatch=new MatchSimulation(77,{blue:['bulwark','bulwark'],orange:['bulwark','bulwark']}); blueMatch.start();
    const blueAnchor=blueMatch.state.robots.find(r=>r.id==='blue-1')!;
    blueMatch.state.ball.x=270; blueMatch.state.ball.y=600; blueMatch.state.ball.vy=80;
    const blueStart={x:blueAnchor.x,y:blueAnchor.y};
    for(let i=0;i<90;i++)blueMatch.tick(1/60);
    const blueContacts=blueMatch.getEvents().filter(event=>event.type==='robot-ball-collision'&&event.ids?.includes('blue-1'));
    expect(blueMatch.getTelemetry().some(frame=>frame.robots.find(robot=>robot.id==='blue-1')?.action==='PRESS')).toBe(true);
    expect(Math.hypot(blueAnchor.x-blueStart.x,blueAnchor.y-blueStart.y)).toBeGreaterThan(40);
    expect(blueContacts.length).toBeGreaterThan(0);

    const orangeMatch=new MatchSimulation(77,{blue:['bulwark','bulwark'],orange:['bulwark','bulwark']}); orangeMatch.start();
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

  it('blocks a forced goal during the initial five-second safety window', () => {
    const match=new MatchSimulation(113); match.start(); match.tick(1);
    match.state.ball.x=match.field.width/2; match.state.ball.y=match.field.height-17; match.state.ball.vy=10;
    match.tick(1/60);
    expect(match.state.score.orange).toBe(0);
    expect(match.state.goalResetTimer).toBe(0);
    expect(match.getEvents().filter(event=>event.type==='goal')).toHaveLength(0);
  });

  it('allows a goal during the post-goal kickoff window', () => {
    const match=new MatchSimulation(114); match.start(); match.tick(5);
    match.state.ball.x=match.field.width/2; match.state.ball.y=match.field.height-17; match.state.ball.vy=10;
    match.tick(1/60);
    expect(match.state.score.orange).toBe(1);
    match.tick(1);
    match.state.ball.x=match.field.width/2; match.state.ball.y=match.field.height-17; match.state.ball.vy=10;
    match.tick(1/60);
    expect(match.state.score.orange).toBe(2);
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

  it('runs the migration-safe Sweeper FSM with separated facing and backpedal telemetry', () => {
    const match = new MatchSimulation(4242, {blue:['sweeper','striker'], orange:['striker','striker']});
    match.start();
    const sweeper = match.state.robots.find(robot => robot.id === 'blue-0')!;
    sweeper.x = 270; sweeper.y = 520;
    match.state.ball.x = 270; match.state.ball.y = 650; match.state.ball.vy = 120;
    for (let tick = 0; tick < 180; tick++) match.tick(1/60);
    const frames = match.getTelemetry().map(frame => frame.robots.find(robot => robot.id === sweeper.id)!);
    expect(frames.some(frame => frame.sweeperState === 'INTERCEPT_STAGE')).toBe(true);
    expect(frames.some(frame => frame.sweeperState === 'INTERCEPT')).toBe(true);
    expect(frames.some(frame => frame.backpedal && frame.facingY < 0 && frame.vy > 0)).toBe(true);
    const telemetry=match.getTelemetry();
    for(const frame of telemetry){
      const sample=frame.robots.find(robot => robot.id === sweeper.id)!;
      const dx=frame.ball.x-sample.x,dy=frame.ball.y-sample.y,len=Math.hypot(dx,dy);
      if(len>1) expect(sample.facingX*dx+sample.facingY*dy).toBeGreaterThan(len*0.99);
    }
    expect(frames.every(frame => Number.isFinite(frame.moveTargetX) && Number.isFinite(frame.moveTargetY))).toBe(true);
  });

  it('tracks the ball for the legacy bulwark-backed Sweeper presentation role', () => {
    const match = new MatchSimulation(5151);
    match.start();
    const sweeper = match.state.robots.find(robot => robot.archetype === 'bulwark')!;
    for(let tick=0;tick<90;tick++) { match.state.ball.x=120; match.state.ball.y=260; match.tick(1/60); }
    const dx=match.state.ball.x-sweeper.x,dy=match.state.ball.y-sweeper.y,len=Math.hypot(dx,dy);
    expect(sweeper.role).toBe('bulwark');
    expect(sweeper.facingX*dx+sweeper.facingY*dy).toBeGreaterThan(len*0.99);
  });

  it('stages a Sweeper laterally before crossing to the own-goal side of the ball', () => {
    const match = new MatchSimulation(2027, {blue:['striker','striker'], orange:['sweeper','striker']});
    match.start();
    const sweeper = match.state.robots.find(robot => robot.id === 'orange-0')!;
    for (let tick = 0; tick < 120; tick++) { match.state.ball.x=230; match.state.ball.y=200; match.state.ball.vy=-120; match.tick(1/60); }
    expect(sweeper.sweeperState).toBe('INTERCEPT');
    expect(sweeper.y).toBeLessThan(match.state.ball.y);
    expect(sweeper.moveTargetY).toBeLessThan(match.state.ball.y);
  });

  it('applies a Sweeper clear only after same-tick physical contact and records return tick', () => {
    const match = new MatchSimulation(4343, {blue:['sweeper','striker'], orange:['striker','striker']});
    match.start();
    (match as any).kickoffTimer = 0; (match as any).kickoffFirstKickPending = false;
    const sweeper = match.state.robots.find(robot => robot.id === 'blue-0')!;
    sweeper.x = 270; sweeper.y = 430; sweeper.facingX = 0; sweeper.facingY = -1;
    sweeper.sweeperState = 'INTERCEPT';
    match.state.ball.x = 270; match.state.ball.y = 400; match.state.ball.vx = 0; match.state.ball.vy = 80;
    match.tick(1/60);
    const clear = match.getEvents().find(event => event.type === 'kick' && event.ids?.includes(sweeper.id));
    expect(clear).toBeDefined();
    expect(clear!.tick).toBe(match.getEvents().find(event => event.type === 'robot-ball-collision' && event.ids?.includes(sweeper.id))!.tick);
    expect(clear!.power).toBeGreaterThan(250);
    expect(sweeper.clearImpulse).toBeGreaterThan(0);
    for (let tick = 0; tick < 120; tick++) { match.state.ball.vx = 0; match.state.ball.vy = 0; match.tick(1/60); }
    expect(match.getTelemetry().some(frame => frame.robots.find(robot => robot.id === sweeper.id)?.sweeperState === 'RETURN_TO_POST')).toBe(true);
    expect(sweeper.returnTick).toBeGreaterThan(0);
  });

  it('keeps a wall-side striker from oscillating while pressing a wall-held ball', () => {
    const match = new MatchSimulation(11); match.start();
    for (let tick = 0; tick < 60 * 60; tick++) match.tick(1 / 60);
    const frames = match.getTelemetry();
    const robotId = 'orange-0'; let lastDx = 0; let lastDy = 0; let run = 0; let maximum = 0;
    for (let index = 1; index < frames.length; index++) {
      const previous = frames[index - 1].robots.find(robot => robot.id === robotId)!;
      const current = frames[index].robots.find(robot => robot.id === robotId)!;
      if (previous.action === 'RESET' || current.action === 'RESET' || previous.action === 'COVER' || current.action === 'COVER') { lastDx = 0; lastDy = 0; run = 0; continue; }
      const dx = current.x - previous.x, dy = current.y - previous.y;
      if (Math.hypot(dx, dy) < 2) continue;
      if (Math.hypot(lastDx, lastDy) >= 2 && dx * lastDx + dy * lastDy < 0) run++; else run = 0;
      maximum = Math.max(maximum, run); lastDx = dx; lastDy = dy;
    }
    expect(maximum).toBeLessThanOrEqual(6);
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

  it('deflects a symmetric central kickoff collision deterministically', () => {
    const run=()=>{const match=new MatchSimulation(1); match.start(); for(let tick=0;tick<60;tick++) match.tick(1/60); return match;};
    const first=run(),second=run();
    const recovery=first.getEvents().find(event=>event.type==='stuck-recovery'&&event.reason==='deterministic central kickoff deflection');
    expect(recovery).toBeDefined();
    expect(Math.hypot(first.state.ball.vx,first.state.ball.vy)).toBeGreaterThan(200);
    expect(JSON.stringify(first.state)).toBe(JSON.stringify(second.state));
    expect(first.getEvents().map(event=>[event.type,event.tick,event.reason,event.impulse])).toEqual(second.getEvents().map(event=>[event.type,event.tick,event.reason,event.impulse]));
  });

  it('preserves central deflection cooldown across checkpoint restore', () => {
    const original=new MatchSimulation(1); original.start();
    for(let tick=0;tick<41;tick++) original.tick(1/60);
    const checkpoint=original.checkpoint();
    expect((checkpoint as any).centralDeflectionCooldown).toBeGreaterThan(0);
    const restored=new MatchSimulation(1); restored.restoreCheckpoint(checkpoint);
    expect((restored as any).centralDeflectionCooldown).toBe((checkpoint as any).centralDeflectionCooldown);
    for(let tick=0;tick<30;tick++){original.tick(1/60);restored.tick(1/60);}
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(original.state));
    expect(JSON.stringify(restored.getEvents())).toBe(JSON.stringify(original.getEvents()));
  });

  it('does not use central kickoff deflection after the kickoff window', () => {
    const match=new MatchSimulation(1); match.start();
    (match as any).kickoffTimer=0; (match as any).kickoffRaceTicks=0; (match as any).kickoffFirstKickPending=false;
    for(let tick=0;tick<150;tick++) match.tick(1/60);
    expect(match.getEvents().some(event=>event.reason==='deterministic central kickoff deflection')).toBe(false);
  });

  it('keeps the striker at full approach speed before physical contact', () => {
    const match=new MatchSimulation(42); match.start(); (match as any).kickoffTimer=0; (match as any).kickoffFirstKickPending=false;
    const striker=match.state.robots.find(r=>r.id==='blue-0')!;
    striker.x=270; striker.y=700; striker.vx=0; striker.vy=0;
    match.state.ball.x=270; match.state.ball.y=430; match.state.ball.vx=0; match.state.ball.vy=0;
    const speeds:number[]=[];
    for(let i=0;i<30;i++){match.tick(1/60);speeds.push(Math.hypot(striker.vx,striker.vy));}
    expect(striker.action).toBe('PRESS');
    expect(Math.min(...speeds.slice(15))).toBeGreaterThan(striker.maxSpeed*0.95);
    expect(match.getEvents().some(event=>event.type==='robot-ball-collision'&&event.ids?.includes(striker.id))).toBe(false);
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
