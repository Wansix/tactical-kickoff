import { describe, expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';
import { SimulationTestArena, detectAnomalies, findDecisionEvents, findKickCause, replayCheckpoint, replayDiff, replayEquivalent } from '../src/simulation/SimulationQA';

describe('deterministic QA system', () => {
  it('runs a named scenario with fixed tick stepping and structured decisions', () => {
    const scenario={id:'STRIKER_1V1_TRACE',seed:31,durationTicks:180,robots:[]};
    const arena=new SimulationTestArena(scenario);
    arena.simulation.configureStriker1v1ForTest();
    arena.start(); arena.step(180);
    const run=arena.result();
    expect(run.telemetry).toHaveLength(180);
    expect(findDecisionEvents(run).length).toBeGreaterThan(0);
    expect(run.telemetry.at(-1)?.robots.every(robot=>robot.lastDecisionReason.length>0)).toBe(true);
  });

  it('replays the same scenario and seed to an identical normalized trace', () => {
    const scenario={id:'ANCHOR_BLUE_OWN_HALF',seed:77,durationTicks:120,ball:{x:270,y:600,vx:0,vy:80}};
    const a=new SimulationTestArena(scenario); const b=new SimulationTestArena(scenario); b.simulation.state.robots.reverse();
    a.start();b.start();a.step(120);b.step(120);
    expect(replayEquivalent(a.result(),b.result())).toBe(true);
    expect(replayDiff(a.result(),b.result())).toEqual({equal:true,firstDivergenceTick:null});
    const altered=b.result(); altered.telemetry[10]={...altered.telemetry[10],ball:{...altered.telemetry[10].ball,x:altered.telemetry[10].ball.x+1}};
    const diff=replayDiff(a.result(),altered);
    expect(diff.equal).toBe(false); expect(diff.firstDivergenceTick).toBe(11); expect(diff.path).toBe('ball');
  });

  it('reports the decision context immediately before a kick when one occurs', () => {
    const match=new MatchSimulation(31); match.start();
    for(let i=0;i<60*20;i++) match.tick(1/60);
    const run={scenario:{id:'KICK_TRACE',seed:31,durationTicks:1200},state:match.snapshot(),events:match.getEvents(),telemetry:match.getTelemetry(),replay:''};
    const kick=run.events.find(event=>event.type==='kick');
    if(kick?.ids?.[0]){const cause=findKickCause(run,kick.ids[0]);expect(cause?.kick.reason).toContain('forward=');expect(cause?.decision).toBeDefined();}
    else expect(run.events.filter(event=>event.type==='decision').length).toBeGreaterThan(0);
  });

  it('restores a full checkpoint and continues with an identical trace', () => {
    const original=new MatchSimulation(19); original.start();
    for(let i=0;i<300;i++) original.tick(1/60);
    const checkpoint=original.checkpoint();
    for(let i=0;i<300;i++) original.tick(1/60);
    const tape=JSON.parse(JSON.stringify({checkpoint,deltas:Array.from({length:300},()=>1/60)}));
    const replay=replayCheckpoint(tape,{id:'CHECKPOINT_REPLAY',seed:19,durationTicks:600});
    expect(replay.state).toEqual(original.snapshot());
    expect(replay.events).toEqual(original.getEvents());
    expect(replay.telemetry).toEqual(original.getTelemetry());
  });

  it('fires side-wall recovery once until the ball leaves the wall zone', () => {
    const match=new MatchSimulation(23); match.start(); match.state.ball.x=20; match.state.ball.y=430; match.state.ball.vx=0; match.state.ball.vy=0;
    for(let i=0;i<240;i++){if(i>60)match.state.ball.x=20;match.tick(1/60);}
    expect(match.getEvents().filter(event=>event.type==='stuck-recovery'&&event.reason?.includes('side-wall')).length).toBe(1);
  });

  it('detects an actor that remains in a small local position window', () => {
    const scenario={id:'LOCAL_STUCK_DETECT',seed:1,durationTicks:240,robots:[{id:'blue-0',x:270,y:700,vx:0,vy:0},{id:'blue-1',x:360,y:700,vx:0,vy:0},{id:'orange-0',x:270,y:160,vx:0,vy:0},{id:'orange-1',x:360,y:160,vx:0,vy:0}]};
    const run=new SimulationTestArena(scenario); const result=run.run();
    for(const frame of result.telemetry.slice(0,240)){const robot=frame.robots.find(candidate=>candidate.id==='blue-0');if(robot){robot.x=270;robot.y=700;robot.vx=0;robot.vy=0;robot.action='CARRY';robot.moveTargetX=270;robot.moveTargetY=700;}} result.events=result.events.filter(event=>event.type!=='stuck-recovery');
    const anomalies=detectAnomalies(result);
    expect(anomalies.some(anomaly=>anomaly.kind==='local-stuck'||anomaly.kind==='state-stuck')).toBe(true);
  });
});
