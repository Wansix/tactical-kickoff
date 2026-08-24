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
    expect(kick?.power).toBeGreaterThanOrEqual(250);
    expect(kick?.vyAfter).toBeLessThan(-250);
    match.tick(1/30);
    expect(match.state.ball.y).toBeLessThan(400);
  });

  it('records the actual applied kick impulse direction, not only the aim direction', () => {
    const match=new MatchSimulation(106); prepareStrikerKick(match);
    const kick=match.getEvents().find(event=>event.type==='kick')!;
    const dx=(kick.vxAfter??0)-(kick.vxBefore??0),dy=(kick.vyAfter??0)-(kick.vyBefore??0),length=Math.hypot(dx,dy)||1;
    expect(kick.direction?.x).toBeCloseTo(dx/length,8);
    expect(kick.direction?.y).toBeCloseTo(dy/length,8);
    expect(kick.impulse).toBeCloseTo(Math.hypot(dx,dy),8);
    expect(kick.power).toBeCloseTo(kick.impulse??0,8);
  });
  it('debug kick mode draws and applies only the robot center line', () => {
    const match=new MatchSimulation(105); match.setKickDebugLine(true); prepareStrikerKick(match);
    const kick=match.getEvents().find(event=>event.type==='kick');
    const robot=match.state.robots.find(candidate=>candidate.id===kick?.ids?.[0]);
    expect(kick?.direction?.x).toBeCloseTo(robot?.facingX??0,8);
    expect(kick?.direction?.y).toBeCloseTo(robot?.facingY??0,8);
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

  it('recovers a low-speed ball trapped just inside a side wall', () => {
    const match=new MatchSimulation(206); match.start(); (match as any).kickoffTimer=0; (match as any).kickoffSafetyTimer=0;
    for(const robot of match.state.robots){robot.maxSpeed=0;robot.acceleration=0;}
    match.state.ball.x=38; match.state.ball.y=430; match.state.ball.vx=0; match.state.ball.vy=0; (match as any).lastBallX=38; (match as any).lastBallY=430;
    for(let tick=0;tick<60;tick++) match.tick(1/60);
    const recovery=match.getEvents().find(event=>event.type==='stuck-recovery'&&event.reason?.includes('side-wall'));
    expect(recovery).toBeDefined();
    expect(match.state.ball.vx).toBeGreaterThan(0);
  });

  it('resets a goal stationary inside the kickoff state', () => {
    const match=new MatchSimulation(103);
    match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match as any).kickoffSafetyTimer=0; (match as any).kickoffFirstKickPending=false; (match as any).safetyGoalPending=undefined; (match.state as any).goalResetTimer=0; (match as any).kickoffSafetyTimer=0; (match as any).safetyGoalPending=undefined;
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
    const match = new MatchSimulation(105); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match as any).kickoffSafetyTimer=0; (match as any).kickoffFirstKickPending=false; (match as any).safetyGoalPending=undefined; (match.state as any).goalResetTimer=0;
    match.state.ball.x=match.field.width/2; match.state.ball.y=match.field.height+3; match.state.ball.vy=10;
    match.tick(1/60);
    expect(match.state.score.orange).toBe(1);
    expect(match.state.ball.y).toBeGreaterThan(match.field.height);
    expect(match.state.goalResetTimer).toBeGreaterThan(0.9);
  });

  it('processes physical striker contact during kickoff protection before allowing a kick', () => {
    const match=new MatchSimulation(42,MatchSimulation.default3v3Composition()); match.start();
    for(let i=0;i<120;i++)match.tick(1/60);
    const preferredTeam=(match as any).kickoffPreferredTeam as 'blue'|'orange';
    const preferredStrikerId=`${preferredTeam}-0`;
    const contacts=match.getEvents().filter(event=>event.type==='robot-ball-collision'&&event.ids?.includes(preferredStrikerId));
    const firstContact=contacts[0]!;
    expect(firstContact.elapsed).toBeLessThan(3);
    expect(firstContact.tick).toBeLessThanOrEqual((match.getEvents().find(event=>event.type==='kick')?.tick??Infinity));
    const firstKick=match.getEvents().find(event=>event.type==='kick'&&event.ids?.includes(preferredStrikerId));
    expect(firstKick?.causeContactTick).toBe(firstContact.tick);
    expect(Math.hypot(firstContact.x-match.field.width/2,firstContact.y-match.field.height/2)).toBeLessThan(60);
    expect(match.getEvents().filter(event=>event.type==='kick'&&event.elapsed<0.75)).toHaveLength(1);
  });

  it('does not bounce an early kickoff shot out of the goal mouth', () => {
    const match=new MatchSimulation(42); match.start();
    (match as any).kickoffTimer=0; (match as any).kickoffSafetyTimer=4.9;
    match.state.ball.x=match.field.width/2; match.state.ball.y=30; match.state.ball.vy=-500;
    match.tick(1/30);
    expect(match.state.score.blue).toBe(0);
    expect(match.getEvents().filter(event=>event.type==='wall-bounce')).toHaveLength(0);
    expect(match.state.ball.y).toBeLessThan(18);
    expect(match.state.ball.vy).toBeLessThan(0);
  });

  it('latches a held net ball while its velocity is zero', () => {
    const match=new MatchSimulation(43); match.start();
    (match as any).kickoffTimer=0; (match as any).kickoffSafetyTimer=2;
    match.state.ball.x=match.field.width/2; match.state.ball.y=30; match.state.ball.vy=-500;
    match.tick(1/30); match.state.ball.vy=0;
    for(let i=0;i<60;i++)match.tick(1/60);
    expect(match.state.score.blue).toBe(0);
    expect(match.getEvents().filter(event=>event.type==='wall-bounce')).toHaveLength(0);
    expect(match.state.ball.y).toBeLessThan(-50);
  });

  it('drives an early bottom goal to the far net depth before reset', () => {
    const match=new MatchSimulation(44); match.start();
    (match as any).kickoffTimer=0; (match as any).kickoffSafetyTimer=2;
    match.state.ball.x=match.field.width/2; match.state.ball.y=match.field.height-30; match.state.ball.vy=500;
    for(let i=0;i<60;i++)match.tick(1/60);
    expect(match.state.score.orange).toBe(0);
    expect(match.getEvents().filter(event=>event.type==='wall-bounce')).toHaveLength(0);
    expect(match.state.ball.y).toBeGreaterThan(910);
  });

  it('completes early net hold as a normal goal and kickoff reset', () => {
    const match=new MatchSimulation(42); match.start();
    (match as any).kickoffTimer=0; (match as any).kickoffSafetyTimer=0.5;
    match.state.ball.x=match.field.width/2; match.state.ball.y=30; match.state.ball.vy=-500;
    match.tick(1/30);
    expect(match.state.score.blue).toBe(0);
    expect(match.getEvents().filter(event=>event.type==='wall-bounce')).toHaveLength(0);
    for(let i=0;i<40;i++)match.tick(1/60);
    expect(match.state.score.blue).toBe(1);
    expect(match.state.goalResetTimer).toBeGreaterThan(0);
    match.tick(1);
    expect(match.state.ball).toMatchObject({x:270,y:match.field.height/2,vx:0,vy:0});
    expect(match.getEvents().some(event=>event.type==='kickoff')).toBe(true);
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
    const match=new MatchSimulation(106); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match as any).kickoffSafetyTimer=0; (match as any).kickoffFirstKickPending=false; (match as any).safetyGoalPending=undefined;
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
    const match=new MatchSimulation(107); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match as any).kickoffSafetyTimer=0; (match as any).kickoffFirstKickPending=false; (match as any).safetyGoalPending=undefined; (match as any).kickoffSafetyTimer=0;
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

  it('lets the deployed 3v3 seed kick on the first physical contact', () => {
    const match=new MatchSimulation(2025,MatchSimulation.default3v3Composition()); match.start();
    for(let i=0;i<90;i++) match.tick(1/60);
    const preferred=(match as any).kickoffPreferredTeam as 'blue'|'orange';
    const striker=`${preferred}-0`;
    const events=match.getEvents();
    const kick=events.find(e=>e.type==='kick'&&e.ids?.[0]===striker);
    const contact=events.find(e=>e.type==='robot-ball-collision'&&e.ids?.[0]===striker);
    expect(contact).toBeDefined(); expect(kick).toBeDefined();
    expect(kick!.tick).toBe(contact!.tick); expect(kick!.causeContactTick).toBe(contact!.tick);
    expect(kick!.elapsed).toBeLessThan(1);
    expect(events.some(e=>e.type==='robot-ball-collision'&&e.ids?.[0]!==striker&&e.tick<=kick!.tick)).toBe(false);
  });

  it('keeps every 3v3 kickoff on preferred striker contact then same-tick kick across 100 seeds', () => {
    for(let seed=1;seed<=100;seed++){
      const match=new MatchSimulation(seed,MatchSimulation.default3v3Composition()); match.start();
      const preferred=(match as any).kickoffPreferredTeam as 'blue'|'orange';
      const striker=`${preferred}-0`;
      for(let i=0;i<360;i++)match.tick(1/60);
      const events=match.getEvents();
      const contact=events.find(e=>e.type==='robot-ball-collision'&&e.ids?.[0]===striker);
      const kick=events.find(e=>e.type==='kick'&&e.ids?.[0]===striker);
      expect(contact,`seed ${seed} missing preferred contact`).toBeDefined();
      expect(kick,`seed ${seed} missing preferred kick`).toBeDefined();
      expect(kick!.tick,`seed ${seed} contact/kick tick`).toBe(contact!.tick);
      expect(kick!.causeContactTick,`seed ${seed} causal contact tick`).toBe(contact!.tick);
    }
  });

  it('keeps kickoff defensive clears from preempting the preferred striker first kick', () => {
    let blue=0,orange=0;
    for(let seed=1;seed<=20;seed++){
      const match=new MatchSimulation(seed,MatchSimulation.default3v3Composition()); match.start();
      for(let i=0;i<6*60;i++)match.tick(1/60);
      const first=match.getEvents().find(event=>event.type==='kick')?.ids?.[0]??'';
      if(first.startsWith('blue'))blue++;
      if(first.startsWith('orange'))orange++;
    }
    expect(blue).toBeGreaterThan(0);
    expect(orange).toBeGreaterThan(0);
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
    const match = new MatchSimulation(112); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match as any).kickoffSafetyTimer=0; (match as any).kickoffFirstKickPending=false; (match as any).safetyGoalPending=undefined; (match.state as any).goalResetTimer=0;
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
    const match = new MatchSimulation(111); match.start(); match.tick(5); match.state.score={blue:0,orange:0}; (match as any).kickoffSafetyTimer=0; (match as any).kickoffFirstKickPending=false; (match as any).safetyGoalPending=undefined; (match.state as any).goalResetTimer=0;
    match.state.ball.x = match.field.width/2; match.state.ball.y = 17;
    match.state.ball.vy = -10;
    match.tick(1/60);
    expect(match.state.score.blue).toBe(1);
  });
});
