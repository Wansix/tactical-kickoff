import { describe, expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';
import { prepareStrikerKick } from './fixtures';

describe('physics-first simulation contract', () => {
  it('starts with a stationary free ball', () => {
    const match = new MatchSimulation(101);
    match.start();
    expect(match.state.ball.vx).toBe(0);
    expect(match.state.ball.vy).toBe(0);
  });

  it('moves the ball through robot contact and records the causal event', () => {
    const match = new MatchSimulation(102);
    match.start();
    for(let i=0;i<600;i++) match.tick(1/60);
    const contacts=match.getEvents().filter(event=>event.type==='robot-ball-collision');
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.some(event=>(event.impulse??0)>0&&event.vxAfter!==event.vxBefore||event.vyAfter!==event.vyBefore)).toBe(true);
  });

  it('kicks hard and sends the ball away on striker contact', () => {
    const match=new MatchSimulation(104);
    prepareStrikerKick(match);
    const kick=match.getEvents().find(event=>event.type==='kick');
    expect(kick?.power).toBeGreaterThanOrEqual(300);
    expect(kick?.vyAfter).toBeLessThan(-250);
    match.tick(1/30);
    expect(match.state.ball.y).toBeLessThan(400);
  });

  it('debug kick mode draws and applies only the robot center line', () => {
    const match=new MatchSimulation(105); match.setKickDebugLine(true); prepareStrikerKick(match);
    const kick=match.getEvents().find(event=>event.type==='kick');
    const robot=match.state.robots.find(candidate=>candidate.id===kick?.ids?.[0]);
    expect(kick?.direction?.x).toBe(robot?.facingX);
    expect(kick?.direction?.y).toBe(robot?.facingY);
    expect(Math.abs((kick?.vxAfter??0)*robot!.facingY-(kick?.vyAfter??0)*robot!.facingX)).toBeLessThan(1e-9);
  });
  it('escapes each physical corner with one bounded recovery', () => {
    for(const [index,corner] of [[18,18],[522,18],[18,882],[522,882]].entries()){
      const match=new MatchSimulation(200+index); match.start(); (match as any).kickoffTimer=0; (match as any).kickoffSafetyTimer=0;
      match.state.ball.x=corner[0]; match.state.ball.y=corner[1]; match.state.ball.vx=0; match.state.ball.vy=0;
      for(let tick=0;tick<60;tick++) match.tick(1/60);
      expect(match.getEvents().filter(event=>event.type==='stuck-recovery')).toHaveLength(1);
    }
  });

  it('resets a goal stationary inside the kickoff state', () => {
    const match = new MatchSimulation(103);
    match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match.state as any).goalResetTimer=0; (match as any).kickoffSafetyTimer=0;
    match.state.ball.x=match.field.width/2; match.state.ball.y=-3; match.state.ball.vy=-10;
    match.tick(1/60);
    expect(match.state.score.blue).toBe(1);
    expect(match.state.ball.y).toBeLessThan(-3);
    expect(match.state.ball.vy).toBeLessThan(0);
    expect(match.state.goalResetTimer).toBeGreaterThan(0.9);
    const goalEvent=match.getEvents().filter(event=>event.type==='goal').at(-1);
    expect(goalEvent?.y).toBe(match.state.ball.y);
    expect(goalEvent?.decision?.scoringTeam).toBe('blue');
    expect(match.getEvents().some(event=>event.type==='goal')).toBe(true);
    match.tick(1);
    expect(match.state.ball).toMatchObject({x:270,y:match.field.height/2,vx:0,vy:0});
  });

  it('does not score outside the goal mouth', () => {
    const match = new MatchSimulation(104);
    match.start();
    match.state.ball.x=40; match.state.ball.y=-3; match.state.ball.vy=-10;
    match.tick(1/60);
    expect(match.state.score.blue).toBe(0);
    expect(match.state.ball.y).toBeGreaterThanOrEqual(18);
  });

  it('holds the scored ball inside the external goal frame for either team', () => {
    const match = new MatchSimulation(105); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match.state as any).goalResetTimer=0;
    match.state.ball.x=match.field.width/2; match.state.ball.y=match.field.height+3; match.state.ball.vy=10;
    match.tick(1/60);
    expect(match.state.score.orange).toBe(1);
    expect(match.state.ball.y).toBeGreaterThan(match.field.height);
    expect(match.state.goalResetTimer).toBeGreaterThan(0.9);
  });

  it('allows a fast goal shot to enter the mouth instead of bouncing at the kickoff gate', () => {
    const match=new MatchSimulation(113); match.start();
    match.state.ball.x=match.field.width/2; match.state.ball.y=30; match.state.ball.vy=-500;
    (match as any).kickoffFirstKickPending=false; (match as any).kickoffSafetyTimer=0;
    match.tick(1/30);
    expect(match.state.score.blue).toBe(1);
    expect(match.getEvents().filter(event=>event.type==='wall-bounce')).toHaveLength(0);
    expect(match.state.ball.y).toBeLessThan(18);
    expect(match.state.ball.vy).toBeLessThan(0);
  });
  it('accepts shots through the widened goal mouth near both posts', () => {
    for(const x of [200,340]){
      const match=new MatchSimulation(114+x); match.start();
      match.state.ball.x=x; match.state.ball.y=30; match.state.ball.vy=-500;
      (match as any).kickoffFirstKickPending=false; (match as any).kickoffSafetyTimer=0;
      match.tick(1/30);
      expect(match.state.score.blue).toBe(1);
      expect(match.getEvents().filter(event=>event.type==='wall-bounce')).toHaveLength(0);
    }
  });  it('finishes only after a goal pause started on the final tick', () => {
    const match=new MatchSimulation(106); match.start(); match.tick(5); match.state.score={blue:0,orange:0};
    match.state.elapsed=match.duration-1/60;
    match.state.ball.x=match.field.width/2; match.state.ball.y=-3; match.state.ball.vy=-10;
    match.tick(1/60);
    expect(match.state.score.blue).toBe(1);
    expect(match.state.status).toBe('running');
    expect(match.state.goalResetTimer).toBeGreaterThan(0.9);
    match.tick(1);
    expect(match.state.ball).toMatchObject({x:270,y:match.field.height/2,vx:0,vy:0});
    expect(match.state.status).toBe('finished');
  });

  it('does not allow manual pause to freeze the goal reset timer', () => {
    const match=new MatchSimulation(107); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match as any).kickoffSafetyTimer=0;
    match.state.ball.x=match.field.width/2; match.state.ball.y=-3; match.state.ball.vy=-10;
    match.tick(1/60);
    match.setPaused(true);
    expect(match.state.status).toBe('running');
    match.tick(1);
    expect(match.state.goalResetTimer).toBe(0);
    expect(match.getEvents().some(event=>event.type==='kickoff')).toBe(true);
  });

  it('runs every archetype through the selectable 2v2 roster', () => {
    const match=new MatchSimulation(108,{blue:['scout','cannon'],orange:['dribbler','sweeper']});
    expect(match.state.robots.map(robot=>robot.archetype)).toEqual(['scout','cannon','dribbler','sweeper']);
    expect(match.state.robots.map(robot=>robot.shape)).toEqual(['diamond','hex','circle','square']);
    match.start();
    for(let i=0;i<120;i++)match.tick(1/60);
    expect(match.state.robots.every(robot=>Number.isFinite(robot.x)&&Number.isFinite(robot.y))).toBe(true);
    expect(match.state.robots.some(robot=>robot.action!=='RESET')).toBe(true);
  });

  it('produces identical telemetry for identical seeds and fixed ticks', () => {
    const a=new MatchSimulation(105); const b=new MatchSimulation(105);
    a.start(); b.start();
    for(let i=0;i<180;i++){a.tick(1/60);b.tick(1/60);}
    expect(a.getTelemetry()).toEqual(b.getTelemetry());
    for(const robot of a.state.robots){
      expect(robot.x).toBeGreaterThanOrEqual(28);
      expect(robot.x).toBeLessThanOrEqual(a.field.width-28);
      expect(robot.y).toBeGreaterThanOrEqual(28);
      expect(robot.y).toBeLessThanOrEqual(a.field.height-28);
    }
  });

  it('keeps every kick pointed toward the kicking team attack goal', () => {
    const match=new MatchSimulation(42); match.start();
    for(let i=0;i<60*60;i++)match.tick(1/60);
    const kicks=match.getEvents().filter(event=>event.type==='kick');
    expect(kicks.length).toBeGreaterThan(0);
    for(const kick of kicks){
      const team=kick.ids?.[0].startsWith('blue')?'blue':'orange';
      expect(team==='blue'?(kick.vyAfter??0)<0:(kick.vyAfter??0)>0).toBe(true);
    }
  });

  it('does not let sequential robot updates give every kickoff to blue', () => {
    let blue=0,orange=0;
    for(let seed=1;seed<=20;seed++){
      const match=new MatchSimulation(seed); match.start();
      for(let i=0;i<6*60;i++)match.tick(1/60);
      const first=match.getEvents().find(event=>event.type==='kick')?.ids?.[0]??'';
      if(first.startsWith('blue'))blue++;
      if(first.startsWith('orange'))orange++;
    }
    expect(blue).toBeGreaterThan(0);
    expect(orange).toBeGreaterThan(0);
    expect(Math.max(blue,orange)).toBeLessThanOrEqual(16);
  });

  it('escapes a ball held motionless in a chamfered corner after a bounded delay', () => {
    const match = new MatchSimulation(109); match.start();
    match.state.ball.x = 18; match.state.ball.y = 18;
    match.state.robots.forEach(robot => { robot.maxSpeed=0; robot.acceleration=0; });
    for(let i=0;i<64;i++) match.tick(1/60);
    expect(Math.hypot(match.state.ball.vx,match.state.ball.vy)).toBeGreaterThan(0);
    expect(match.getEvents().filter(event=>event.type==='stuck-recovery')).toHaveLength(1);
  });

  it('does not repeatedly overwrite a recovered ball velocity every tick', () => {
    const match = new MatchSimulation(110); match.start();
    match.state.ball.x = 18; match.state.ball.y = 18;
    match.state.robots.forEach(robot => { robot.maxSpeed=0; robot.acceleration=0; });
    for(let i=0;i<45+30;i++) match.tick(1/60);
    const recoveredVelocity = {...match.state.ball};
    match.tick(1/60);
    expect(match.state.ball.vx).not.toBe(recoveredVelocity.vx);
    expect(match.getEvents().filter(event=>event.type==='stuck-recovery')).toHaveLength(1);
  });

  it('allows a real goal immediately after a scored kickoff reset', () => {
    const match = new MatchSimulation(112); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match.state as any).goalResetTimer=0;
    match.state.ball.x=match.field.width/2; match.state.ball.y=-3; match.state.ball.vy=-10;
    match.tick(1/60); expect(match.state.score.blue).toBe(1);
    match.tick(1);
    const beforeSecondGoalEvents=match.getEvents().length;
    match.state.ball.y=17; match.state.ball.vy=-10;
    match.tick(1/60);
    expect(match.state.score.blue).toBe(2);
    expect(match.getEvents().slice(beforeSecondGoalEvents).filter(event=>event.type==='wall-bounce'&&event.y<=18)).toHaveLength(0);
  });
  it('keeps the goal sensor separate from the chamfered wall', () => {
    const match = new MatchSimulation(111); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match.state as any).goalResetTimer=0;
    match.state.ball.x = match.field.width/2; match.state.ball.y = 17;
    match.state.ball.vy = -10;
    match.tick(1/60);
    expect(match.state.score.blue).toBe(1);
  });
});
