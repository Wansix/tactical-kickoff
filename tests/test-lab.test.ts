import { describe, expect, it } from 'vitest';
import { SimulationTestArena, detectAnomalies, replayEquivalent, replayCheckpoint, type ScenarioSpec } from '../src/simulation/SimulationQA';

type Brain='striker'|'sweeper'|'scout'|'dribbler'|'cannon'|'bulwark';
const brains:Brain[]=['striker','sweeper','scout','dribbler','cannon','bulwark'];
function scenario(brain:Brain,seed:number):ScenarioSpec{return {id:`lab-${brain}`,seed,durationTicks:180,composition:{blue:[brain,brain],orange:['striker','striker']},ball:{x:270,y:570,vx:0,vy:0},robots:[{id:'blue-0',x:270,y:700,vx:0,vy:0,target:'BALL',action:'RESET'}]};}

describe('Robot Test Lab scenarios',()=>{
  it.each(brains)('%s runs through the real fixed-step arena with finite state',brain=>{
    const run=new SimulationTestArena(scenario(brain,2025)).run();
    expect(run.telemetry).toHaveLength(180);
    expect(run.state.robots.every(robot=>[robot.x,robot.y,robot.vx,robot.vy].every(Number.isFinite))).toBe(true);
    const blocking=detectAnomalies(run).filter(anomaly=>['non-finite','out-of-bounds','kick-without-cause'].includes(anomaly.kind));
    expect(blocking).toEqual([]);
  });
  it('runs every brain as a visible 1v1 pair',()=>{
    for(const [index,brain] of brains.entries()){
      const opponent=brains[(index+1)%brains.length];
      const run=new SimulationTestArena({...scenario(brain,300+index),id:`1v1-${brain}-vs-${opponent}`,composition:{blue:[brain],orange:[opponent]} as any}).run();
      expect(run.state.robots).toHaveLength(2);
      expect(run.state.robots.map(robot=>robot.archetype)).toEqual([brain,opponent]);
      expect(run.telemetry.some(frame=>frame.robots.some(robot=>robot.action!=='RESET'))).toBe(true);
      expect(detectAnomalies(run)).toEqual([]);
    }
  });
  it('replays the same Brain scenario identically',()=>{
    const spec=scenario('sweeper',77);
    expect(replayEquivalent(new SimulationTestArena(spec).run(),new SimulationTestArena(spec).run())).toBe(true);
  });
  it('keeps body profile experiment values isolated to the lab robot',()=>{
    const arena=new SimulationTestArena(scenario('striker',88));
    const robot=arena.simulation.state.robots.find(candidate=>candidate.id==='blue-0')!;
    const original={mass:robot.mass,maxSpeed:robot.maxSpeed,acceleration:robot.acceleration,radius:robot.radius};
    Object.assign(robot,{mass:3.8,maxSpeed:360,acceleration:1300,radius:23});
    expect(robot.mass).toBe(3.8); expect(robot.maxSpeed).toBe(360); expect(robot.acceleration).toBe(1300); expect(robot.radius).toBe(23);
    expect(original.mass).not.toBe(robot.mass);
    expect(arena.simulation.state.robots.find(candidate=>candidate.id==='orange-0')!.mass).not.toBe(3.8);
  });
  it('continues from a checkpoint with the same final state',()=>{
    const spec=scenario('striker',99); const arena=new SimulationTestArena(spec); arena.start(); arena.step(90); const checkpoint=arena.simulation.checkpoint(); arena.step(90); const expected=arena.result();
    const replay=replayCheckpoint({checkpoint,deltas:Array.from({length:90},()=>1/60)},spec);
    expect(replay.state).toEqual(expected.state);
  });
});
