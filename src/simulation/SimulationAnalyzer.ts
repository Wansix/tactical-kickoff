import type { TelemetryFrame } from './MatchSimulation';

export interface SimulationAnalysisReport {
  pass:boolean;
  durationSec:number;
  tickCount:number;
  finite:boolean;
  allRobotsMoved:boolean;
  ballMoved:boolean;
  robotBallContacts:number;
  robotRobotContacts:number;
  kickEvents:number;
  goals:number;
  maxBallRange:number;
  maxCentralStuckSec:number;
  findings:string[];
}

export function analyzeTelemetry(telemetry:TelemetryFrame[], field={width:540,height:960}):SimulationAnalysisReport {
  const findings:string[]=[];
  const first=telemetry[0];
  const last=telemetry[telemetry.length-1];
  const finite=telemetry.every(frame=>[
    frame.elapsed,frame.ball.x,frame.ball.y,frame.ball.vx,frame.ball.vy,
    ...frame.robots.flatMap(robot=>[robot.x,robot.y,robot.vx,robot.vy]),
  ].every(Number.isFinite));
  if(!finite) findings.push('non-finite numeric state');

  const ids=first?.robots.map(robot=>robot.id)??[];
  const allRobotsMoved=ids.every(id=>{
    const initial=first.robots.find(robot=>robot.id===id);
    return telemetry.some(frame=>{const robot=frame.robots.find(candidate=>candidate.id===id);return robot&&initial&&Math.hypot(robot.x-initial.x,robot.y-initial.y)>10;});
  });
  if(!allRobotsMoved) findings.push('robot movement below threshold');

  const xs=telemetry.map(frame=>frame.ball.x); const ys=telemetry.map(frame=>frame.ball.y);
  const maxBallRange=Math.max((Math.max(...xs)-Math.min(...xs)),(Math.max(...ys)-Math.min(...ys)));
  const ballMoved=maxBallRange>30;
  if(!ballMoved) findings.push('ball movement below threshold');

  const events=telemetry.flatMap(frame=>frame.events);
  const robotBallContacts=events.filter(event=>event.type==='robot-ball-collision').length;
  const robotRobotContacts=events.filter(event=>event.type==='robot-robot-collision').length;
  const kickEvents=events.filter(event=>event.type==='kick').length;
  const goals=events.filter(event=>event.type==='goal').length;
  if(robotBallContacts===0) findings.push('no robot-ball contact event');

  let currentStuck=0; let maxCentralStuckSec=0;
  for(const frame of telemetry){
    const central=Math.abs(frame.ball.y-field.height/2)<120&&Math.hypot(frame.ball.vx,frame.ball.vy)<5;
    currentStuck=central?currentStuck+1:0;
    maxCentralStuckSec=Math.max(maxCentralStuckSec,currentStuck/60);
  }
  if(maxCentralStuckSec>3) findings.push(`central stuck interval ${maxCentralStuckSec.toFixed(2)}s`);

  const bounded=telemetry.every(frame=>{const ballInGoalPause=frame.goalResetTimer>0;return (ballInGoalPause|| (frame.ball.x>=0&&frame.ball.x<=field.width&&frame.ball.y>=0&&frame.ball.y<=field.height))&&frame.robots.every(robot=>robot.x>=28&&robot.x<=field.width-28&&robot.y>=28&&robot.y<=field.height-28);});
  if(!bounded) findings.push('position bounds violated');

  return {pass:finite&&allRobotsMoved&&ballMoved&&robotBallContacts>0&&maxCentralStuckSec<=3&&bounded,
    durationSec:last?.elapsed??0,tickCount:telemetry.length,finite,allRobotsMoved,ballMoved,robotBallContacts,robotRobotContacts,kickEvents,goals,maxBallRange,maxCentralStuckSec,findings};
}
