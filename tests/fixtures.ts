import { MatchSimulation } from '../src/simulation/MatchSimulation';

export function configureStriker1v1(match:MatchSimulation){
  match.state.robots=match.state.robots.filter(robot=>robot.id.endsWith('-0'));
  match.setComposition('blue',['striker','striker']);
  match.setComposition('orange',['striker','striker']);
  for(const robot of match.state.robots){robot.vx=0;robot.vy=0;robot.action='RESET';robot.target='BALL';}
  const blue=match.state.robots.find(robot=>robot.team==='blue');
  const orange=match.state.robots.find(robot=>robot.team==='orange');
  if(blue){blue.x=180;blue.y=match.field.height-170;}
  if(orange){orange.x=360;orange.y=170;}
}

export function prepareStrikerKick(match:MatchSimulation){
  match.start();
  (match as any).kickoffTimer=0; (match as any).kickoffSafetyTimer=0; (match as any).kickoffFirstKickPending=false;
  const robot=match.state.robots.find(candidate=>candidate.id==='blue-0')!;
  robot.x=270; robot.y=405; robot.vx=0; robot.vy=-20; robot.facingX=0; robot.facingY=-1;
  match.state.ball.x=270; match.state.ball.y=400; match.state.ball.vx=0; match.state.ball.vy=0;
  (match as any).resolveRobotBallCollisions();
  (match as any).recordTelemetry();
}
