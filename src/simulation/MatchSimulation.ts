export type Team = 'blue' | 'orange';
export type Role = RobotArchetype;
export type RobotShape = 'circle' | 'square' | 'diamond' | 'hex';
export type RobotArchetype = 'striker' | 'bulwark' | 'scout' | 'dribbler' | 'cannon' | 'sweeper';
export type Action = 'PRESS' | 'COVER' | 'CARRY' | 'KICK' | 'SHOOT' | 'RESET';
export type SweeperState = 'HOLD_POST' | 'INTERCEPT_STAGE' | 'INTERCEPT' | 'CLEAR_KICK' | 'RETURN_TO_POST';

type MatchStatus = 'ready' | 'running' | 'paused' | 'finished';
export type EventType = 'robot-ball-collision' | 'robot-robot-collision' | 'kick' | 'goal' | 'kickoff' | 'wall-bounce' | 'stuck-recovery' | 'state-change' | 'target-change' | 'decision' | 'ai-warning';

export interface Robot {
  id:string; team:Team; role:Role; shape:RobotShape; archetype:RobotArchetype;
  x:number; y:number; vx:number; vy:number; facingX:number; facingY:number;
  radius:number; mass:number; maxSpeed:number; acceleration:number;
  action:Action; target:string; kickCooldown:number; kickLockout:number;
  moveTargetX:number; moveTargetY:number; distanceToBall:number; distanceToTarget:number;
  sweeperState:SweeperState; backpedal:boolean; interceptReason:string; clearImpulse:number; returnTick:number; clearCooldown:number;
  lastDecisionReason:string; stateChangedAt:number; lastKickAt?:number; kickTarget?:string; kickDirectionX?:number; kickDirectionY?:number; kickPower?:number;
}

export interface MatchState {
  elapsed:number; status:MatchStatus; score:Record<Team,number>; goalResetTimer:number;
  ball:{x:number;y:number;vx:number;vy:number;radius:number;mass:number}; robots:Robot[];
}

export interface SimulationEvent {
  type:EventType; tick:number; elapsed:number; ids?:string[];
  candidate?:string; reason?:string;
  x:number; y:number; impulse?:number; vxBefore?:number; vyBefore?:number; vxAfter?:number; vyAfter?:number;
  state?:Action; targetPosition?:{x:number;y:number}; direction?:{x:number;y:number}; power?:number; decision?:Record<string,unknown>;
}

export interface TelemetryFrame {
  tick:number; elapsed:number; status:MatchStatus; goalResetTimer:number; score:Record<Team,number>;
  ball:{x:number;y:number;vx:number;vy:number};
  robots:Array<{id:string;team:Team;role:Role;archetype:RobotArchetype;x:number;y:number;vx:number;vy:number;maxSpeed:number;facingX:number;facingY:number;kickCooldown:number;kickLockout:number;target:string;action:Action;moveTargetX:number;moveTargetY:number;distanceToBall:number;distanceToTarget:number;sweeperState:SweeperState;backpedal:boolean;interceptReason:string;clearImpulse:number;returnTick:number;clearCooldown:number;lastDecisionReason:string;stateChangedAt:number;lastKickAt?:number;kickTarget?:string;kickDirectionX?:number;kickDirectionY?:number;kickPower?:number}>;
  events:SimulationEvent[];
}

export const ARCHETYPES:RobotArchetype[]=['striker','bulwark','scout','dribbler','cannon','sweeper'];
export type TeamComposition={blue:[RobotArchetype,RobotArchetype];orange:[RobotArchetype,RobotArchetype]};
export const KICK_RANGE_PROFILES={
  scout:{distance:30,halfAngleDeg:40},
  striker:{distance:34,halfAngleDeg:35},
  dribbler:{distance:32,halfAngleDeg:45},
  cannon:{distance:36,halfAngleDeg:28},
  bulwark:{distance:40,halfAngleDeg:50},
  sweeper:{distance:44,halfAngleDeg:50},
} as const;
const SWEEPER_HOME_DEPTH=120;
const FIXED_DT=1/60;
export const GOAL_GEOMETRY={mouthLeft:195,mouthRight:345,postLeft:170,postRight:370,postThickness:50,barLeft:145,barRight:395,depth:105} as const;
export const GOAL_AREA={left:110,right:430,depth:180} as const;
const GOAL_LEFT=GOAL_GEOMETRY.mouthLeft;
const GOAL_RIGHT=GOAL_GEOMETRY.mouthRight;
const BALL_RADIUS=10;
const ROBOT_RADIUS=20;
const MAX_SPEED=1040;
const DAMPING=0.82;
const ROBOT_BALL_RESTITUTION=1.85;
const WALL_BOUNCE=0.75;
const KICK_POWER=300;
const SWEEPER_CLEAR_SPEED=900;
const SWEEPER_OPPONENT_DAMPING=0.12;
const SWEEPER_OPPONENT_DAMPING_DEPTH=180;
export const SWEEPER_FORWARD_LIMIT=90;
const CANNON_KICK_POWER=315;
const ROBOT_SPEED_MULT=2;
const ROBOT_ACCEL_MULT=2;

export class MatchSimulation {
  readonly field={width:540,height:860}; readonly duration=90; readonly seed:number; private paused=false; private accumulator=0; private tickIndex=0;
  private kickoffTimer=0; private kickoffRaceTicks=0; private kickoffSafetyTimer=0; private initialKickoffSafety=true; private kickoffPreferredTeam:Team='blue'; private kickoffFirstKickPending=false; private kickDebugLine=false; private ballKickInvuln=0; private ballContactCooldown:Record<string,number>={}; private robotCollisionCooldown:Record<string,number>={}; private ballStuckTicks=0; private cornerStuckTicks=0; private sideWallStuckTicks=0; private sideWallRecoveryLatched=false; private stuckRecoveryCooldown=0; private cornerRecoveryCooldown=0; private centralDeflectionCooldown=0; private goalTeam:Team|undefined; private sweeperClearTeam:Team|undefined; private wallContact={left:false,right:false,top:false,bottom:false}; private lastBallX=270; private lastBallY=430; private lastKickTeam:Team|undefined; private lastKickX=0; private lastKickY=0; private lastKickElapsed=-10; private kickBurstCount=0; private kickBurstStart=-10; private events:SimulationEvent[]=[]; private telemetry:TelemetryFrame[]=[];
  private readonly seedFormation:Record<string,{x:number;y:number}>;
  state:MatchState;

  constructor(seed=42,composition?:Partial<TeamComposition>){
    this.seed=seed;

    const formationOffset=((seed*37)%121)-60;
    const blue=composition?.blue??['striker','bulwark'];
    const orange=composition?.orange??['striker','bulwark'];
    this.state={elapsed:0,status:'ready',score:{blue:0,orange:0},goalResetTimer:0,ball:{x:270,y:this.field.height/2,vx:0,vy:0,radius:BALL_RADIUS,mass:1},robots:[
      this.robot('blue',0,blue[0]==='bulwark'||blue[0]==='sweeper'?this.field.width/2-90:180+formationOffset,blue[0]==='bulwark'||blue[0]==='sweeper'?this.field.height-SWEEPER_HOME_DEPTH:this.field.height-170,blue[0]),
      this.robot('blue',1,blue[1]==='bulwark'||blue[1]==='sweeper'?this.field.width/2+90:360-formationOffset,blue[1]==='bulwark'||blue[1]==='sweeper'?this.field.height-SWEEPER_HOME_DEPTH:this.field.height-310,blue[1]),
      this.robot('orange',0,orange[0]==='bulwark'||orange[0]==='sweeper'?this.field.width/2+90:360-formationOffset,orange[0]==='bulwark'||orange[0]==='sweeper'?SWEEPER_HOME_DEPTH:170,orange[0]),
      this.robot('orange',1,orange[1]==='bulwark'||orange[1]==='sweeper'?this.field.width/2-90:180+formationOffset,orange[1]==='bulwark'||orange[1]==='sweeper'?SWEEPER_HOME_DEPTH:310,orange[1]),
    ]};
    this.seedFormation=Object.fromEntries(this.state.robots.map(robot=>[robot.id,{x:robot.x,y:robot.y}]));
    this.lastBallX=this.state.ball.x; this.lastBallY=this.state.ball.y;
    this.kickoffPreferredTeam=seed%2===0?'blue':'orange';
  }

  private robot(team:Team,index:number,x:number,y:number,archetype:RobotArchetype):Robot {
    const role:Role=archetype;
    const profile=this.profileForArchetype(archetype);
    return {id:`${team}-${index}`,team,role,shape:this.shapeForRole(role),archetype,x,y,vx:0,vy:0,facingX:team==='blue'?0:0,facingY:team==='blue'?-1:1,radius:ROBOT_RADIUS,
      mass:profile.mass,maxSpeed:profile.maxSpeed*ROBOT_SPEED_MULT,acceleration:profile.acceleration*ROBOT_ACCEL_MULT,
      action:'RESET',target:'BALL',kickCooldown:0,kickLockout:0,moveTargetX:x,moveTargetY:y,distanceToBall:0,distanceToTarget:0,sweeperState:'HOLD_POST',backpedal:false,interceptReason:'initial formation',clearImpulse:0,returnTick:0,clearCooldown:0,lastDecisionReason:'initial formation',stateChangedAt:0};
  }

  private shapeForRole(role:Role):RobotShape { return ({striker:'circle',bulwark:'square',scout:'diamond',dribbler:'circle',cannon:'hex',sweeper:'square'} as Record<Role,RobotShape>)[role]; }
  private profileForArchetype(archetype:RobotArchetype){return ({striker:{mass:2,maxSpeed:230,acceleration:1000},bulwark:{mass:3.2,maxSpeed:156,acceleration:600},scout:{mass:1.6,maxSpeed:290,acceleration:1240},dribbler:{mass:2.1,maxSpeed:210,acceleration:920},cannon:{mass:2.5,maxSpeed:184,acceleration:760},sweeper:{mass:3,maxSpeed:172,acceleration:680}} as const)[archetype];}

  start(){
    if(this.state.status==='ready') { this.paused=false; this.kickoffTimer=0.75; this.kickoffRaceTicks=180; this.kickoffSafetyTimer=5; this.kickoffFirstKickPending=true; this.state.status='running'; this.recordEvent({type:'kickoff',x:this.state.ball.x,y:this.state.ball.y}); }
  }

  setKickDebugLine(enabled:boolean){this.kickDebugLine=enabled;}
  setPaused(value:boolean){
    if(this.state.status==='finished') return;
    if(this.state.goalResetTimer>0) return;
    if(value && this.state.status==='running'){ this.paused=true; this.state.status='paused'; }
    if(!value && this.state.status==='paused'){ this.paused=false; this.state.status='running'; }
  }

  setSpeed(_speed:number){ /* presentation controls render cadence; physics remains fixed-step */ }

  swapComposition(team:Team){
    const teamRobots=this.state.robots.filter(r=>r.team===team);
    const next=teamRobots.map(robot=>(robot.archetype==='striker'?'bulwark':'striker') as RobotArchetype);
    teamRobots.forEach((r,i)=>this.applyArchetype(r,next[i]));
  }

  setComposition(team:Team,archetypes:[RobotArchetype,RobotArchetype]){this.state.robots.filter(r=>r.team===team).forEach((robot,i)=>this.applyArchetype(robot,archetypes[i]));}
  private applyArchetype(robot:Robot,archetype:RobotArchetype){const profile=this.profileForArchetype(archetype);robot.role=archetype;robot.archetype=archetype;robot.shape=this.shapeForRole(archetype);robot.mass=profile.mass;robot.maxSpeed=profile.maxSpeed*ROBOT_SPEED_MULT;robot.acceleration=profile.acceleration*ROBOT_ACCEL_MULT;}
  tick(dt:number){
    if(this.paused||this.state.status==='finished'||this.state.status==='ready'||this.state.status==='paused') return;
    const safeDt=Math.max(0,Math.min(dt,120));
    this.accumulator+=safeDt;
    while(this.accumulator+1e-9>=FIXED_DT){ this.stepFixed(); this.accumulator-=FIXED_DT; }
  }

  private stepFixed(){
    const dt=FIXED_DT;
    this.tickIndex++;
    this.state.elapsed=Math.min(this.duration,this.state.elapsed+dt);
    this.kickoffTimer=Math.max(0,this.kickoffTimer-dt);
    this.kickoffRaceTicks=Math.max(0,this.kickoffRaceTicks-1);
    this.kickoffSafetyTimer=Math.max(0,this.kickoffSafetyTimer-dt);
    if(this.kickoffRaceTicks===0)this.kickoffFirstKickPending=false;
    this.ballKickInvuln=Math.max(0,this.ballKickInvuln-dt);
    for(const key of Object.keys(this.ballContactCooldown)) this.ballContactCooldown[key]=Math.max(0,this.ballContactCooldown[key]-dt);
    for(const key of Object.keys(this.robotCollisionCooldown)) this.robotCollisionCooldown[key]=Math.max(0,this.robotCollisionCooldown[key]-dt);

    this.stuckRecoveryCooldown=Math.max(0,this.stuckRecoveryCooldown-dt);
    this.cornerRecoveryCooldown=Math.max(0,this.cornerRecoveryCooldown-dt);
    this.centralDeflectionCooldown=Math.max(0,this.centralDeflectionCooldown-dt);
    if(this.state.elapsed-this.kickBurstStart>0.8){this.kickBurstCount=0;this.kickBurstStart=this.state.elapsed;}
    for(const robot of this.state.robots){ robot.kickCooldown=Math.max(0,robot.kickCooldown-dt); robot.kickLockout=Math.max(0,robot.kickLockout-dt); robot.clearCooldown=Math.max(0,robot.clearCooldown-dt); robot.clearImpulse=0; }

    if(this.state.goalResetTimer>0){
      this.state.goalResetTimer=Math.max(0,this.state.goalResetTimer-dt);
      this.advanceGoalBall(dt);
      if(this.state.goalResetTimer===0){this.resetBall();if(this.state.elapsed>=this.duration-1e-9)this.state.status='finished';}
      this.recordTelemetry();
      return;
    }

    this.decideAndMoveRobots(dt);
    this.resolveRobotRobotCollisions();
    if(this.kickoffTimer<=0) this.resolveRobotBallCollisions();
    this.integrateBall(dt);
    this.resolveGoalOrWalls();
    this.resolveStuckBall();
    for(const robot of this.state.robots){if(robot.archetype==='bulwark'||robot.archetype==='sweeper'){const dx=this.state.ball.x-robot.x,dy=this.state.ball.y-robot.y,len=Math.hypot(dx,dy)||1;robot.facingX=dx/len;robot.facingY=dy/len;}}
    this.recordTelemetry();
    if(this.state.elapsed>=this.duration-1e-9&&this.state.goalResetTimer===0) this.state.status='finished';
  }

  private decideAndMoveRobots(dt:number){
    const b=this.state.ball;
    const canonicalRobots=[...this.state.robots].sort((a,b2)=>a.id.localeCompare(b2.id));
    const orderedRobots=this.kickoffRaceTicks>0?(this.tickIndex%2===0?canonicalRobots.slice().sort((a,b2)=>a.team===b2.team?a.id.localeCompare(b2.id):a.team==='orange'?-1:1):canonicalRobots.slice().sort((a,b2)=>a.team===b2.team?a.id.localeCompare(b2.id):a.team==='blue'?-1:1)):canonicalRobots;
    for(const robot of orderedRobots){
      const attack=robot.team==='blue'?-1:1;
      const side=robot.id.endsWith('1')?90:-90;
      const centerX=this.field.width/2;
      const centerY=this.field.height/2;
      let targetX=centerX+side,targetY=this.field.height/2-attack*150+(b.y-this.field.height/2)*0.25;
      let action:Action='COVER';
      switch(robot.archetype){
        case 'striker': {
          const attackY=robot.team==='blue'?-1:1;
          const toBallX=b.x-robot.x,toBallY=b.y-robot.y,toBallLen=Math.hypot(toBallX,toBallY)||1;
          const facingOwnGoal=robot.facingY*attackY<-0.25;
          const ballTowardOwnGoal=attackY*b.vy<-20;
          if(facingOwnGoal&&toBallX*robot.facingX+toBallY*robot.facingY>toBallLen*0.25&&(ballTowardOwnGoal||Math.abs(b.vy)<20)&& (attackY<0?b.y>centerY:b.y<centerY)){
            const blockTarget=this.goalAngleBlockTarget(robot.team,b.x,b.y); targetX=blockTarget.x; targetY=blockTarget.y; action='PRESS'; robot.target='GOAL_BLOCK'; break;
          }
          const approachOffset=20;
          const wrongSide=attack*(robot.y-b.y)>28;
          const lateralClear=Math.abs(robot.x-b.x)>60;
          if(wrongSide&&!lateralClear){
            targetX=b.x+side; targetY=b.y+attack*50; action='PRESS';
          }else{
            targetX=b.x-b.vx*0.12; targetY=b.y-attack*approachOffset-b.vy*0.08; action='PRESS';
          }
          break;
        }
        case 'scout': {
          targetX=b.x+b.vx*0.18; targetY=b.y+b.vy*0.18; action='PRESS'; break;
        }
        case 'dribbler': {
          targetX=b.x-Math.sign(b.x-centerX||1)*28+side*0.25; targetY=b.y-attack*24; action='CARRY'; break;
        }
        case 'cannon': {
          const attackY=robot.team==='blue'?-1:1;
          const toBallX=b.x-robot.x,toBallY=b.y-robot.y,toBallLen=Math.hypot(toBallX,toBallY)||1;
          if(robot.facingY*attackY<-0.25&&toBallX*robot.facingX+toBallY*robot.facingY>toBallLen*0.25&&(attackY*b.vy<-20||Math.abs(b.vy)<20)&&(attackY<0?b.y>centerY:b.y<centerY)){
            const blockTarget=this.goalAngleBlockTarget(robot.team,b.x,b.y); targetX=blockTarget.x; targetY=blockTarget.y; action='SHOOT'; robot.target='GOAL_BLOCK'; break;
          }
          targetX=b.x-Math.sign(b.x-centerX||1)*70; targetY=b.y-attack*34; action='SHOOT'; break; }
        case 'bulwark': {
          const ballInOwnHalf=attack<0?b.y>centerY:b.y<centerY;
          const ballMovingTowardOwnGoal=attack<0?b.vy>60:b.vy< -60;
          const goalThreat=ballInOwnHalf&&ballMovingTowardOwnGoal;
          const distanceToBall=Math.hypot(b.x-robot.x,b.y-robot.y);
          if(goalThreat||ballInOwnHalf){
            const urgent=distanceToBall<220;
            const blockTarget=urgent?this.clampSweeperTarget(robot.team,b.x,b.y-attack*30):this.goalAngleBlockTarget(robot.team,b.x,b.y);
            targetX=blockTarget.x; targetY=blockTarget.y;
          }
          action=goalThreat||ballInOwnHalf?'PRESS':'COVER';
          break;
        }
        case 'sweeper': {
          const homeY=attack<0?this.field.height-SWEEPER_HOME_DEPTH:SWEEPER_HOME_DEPTH;
          const homeX=centerX+side;
          const ballInOwnHalf=attack<0?b.y>centerY:b.y<centerY;
          const ballTowardOwnGoal=attack<0?b.vy>45:b.vy< -45;
          const distanceToBall=Math.hypot(b.x-robot.x,b.y-robot.y);
          const arbitrationBlocked=robot.id.endsWith('-0')&&this.state.robots.some(other=>other.team===robot.team&&other.id.endsWith('-1')&&(other.archetype==='bulwark'||other.archetype==='sweeper'));
          const threat=ballInOwnHalf&&(ballTowardOwnGoal||distanceToBall<260)&&!arbitrationBlocked;
          const previousState=robot.sweeperState;
          if(robot.sweeperState==='HOLD_POST'&&!threat) { /* hold */ }
          else if(robot.sweeperState==='HOLD_POST'&&threat) robot.sweeperState='INTERCEPT_STAGE';
          else if(robot.sweeperState==='RETURN_TO_POST'){
            const atHome=Math.hypot(robot.x-homeX,robot.y-homeY)<24&&Math.hypot(robot.vx,robot.vy)<80;
            if(robot.clearCooldown<=0&&threat&&this.tickIndex-robot.returnTick>=120) robot.sweeperState='INTERCEPT_STAGE';
            else if(!threat&&atHome) robot.sweeperState='HOLD_POST';
          }
          else if(robot.sweeperState==='INTERCEPT_STAGE'&&!threat) robot.sweeperState='RETURN_TO_POST';
          else if(robot.sweeperState==='INTERCEPT_STAGE'&&distanceToBall<220) robot.sweeperState='INTERCEPT';
          else if(robot.sweeperState==='CLEAR_KICK') robot.sweeperState='RETURN_TO_POST';
          if(previousState!==robot.sweeperState){
            robot.interceptReason=threat?'own-half risk / deterministic intercept threshold':'risk cleared / return to home post';
            if(robot.sweeperState==='RETURN_TO_POST') robot.returnTick=this.tickIndex;
            this.recordEvent({type:'state-change',ids:[robot.id],x:robot.x,y:robot.y,reason:`sweeper ${previousState} -> ${robot.sweeperState}`,decision:{previousState,currentState:robot.sweeperState,interceptReason:robot.interceptReason}});
          }
          if(robot.sweeperState==='INTERCEPT_STAGE'||robot.sweeperState==='INTERCEPT'){
            const predictedX=b.x-b.vx*0.15;
            const urgent=distanceToBall<220;
            const blockTarget=urgent?this.clampSweeperTarget(robot.team,predictedX,b.y-attack*30):this.goalAngleBlockTarget(robot.team,predictedX,b.y);
            targetX=blockTarget.x; targetY=blockTarget.y;
            action='PRESS'; robot.target='GOAL_BLOCK';
          } else if(robot.sweeperState==='RETURN_TO_POST'){
            targetX=homeX; targetY=homeY; action='RESET'; robot.target='HOME_POST';
          } else {
            const blockTarget=this.goalAngleBlockTarget(robot.team,b.x,b.y);
            targetX=blockTarget.x; targetY=blockTarget.y; action='COVER'; robot.target='GOAL_BLOCK';
          }
          const faceX=b.x-robot.x,faceY=b.y-robot.y,faceLen=Math.hypot(faceX,faceY)||1;
          robot.facingX=faceX/faceLen; robot.facingY=faceY/faceLen;
          robot.interceptReason=robot.sweeperState==='HOLD_POST'?'holding designated home post':robot.interceptReason;
          break;
        }
      }
      if(robot.archetype==='striker'&&(b.x<50||b.x>this.field.width-50)){
        const inward=b.x<this.field.width/2?1:-1;
        targetX=this.clamp(b.x+inward*50,60,this.field.width-60);
        targetY=b.y-attack*20-b.vy*0.08;
      }
      {
        const avoidanceWeight=robot.archetype==='striker'?1.35:1.1;
        for(const other of canonicalRobots){
          if(other.id===robot.id)continue;
          const awayX=robot.x-other.x,awayY=robot.y-other.y,dist=Math.hypot(awayX,awayY);
          if(dist>0&&dist<64){const push=(64-dist)/dist;const closeBoost=dist<44?4.5:1;targetX+=awayX*push*avoidanceWeight*closeBoost;targetY+=awayY*push*avoidanceWeight*closeBoost;}
        }
        if(robot.x<70||robot.x>this.field.width-70){
          const slotBias=robot.id.endsWith('0')?-28:28;
          targetX+=robot.x<70?36:-36;
          targetY+=slotBias;
        }
      }
      const previousAction=robot.action; const previousTargetX=robot.moveTargetX; const previousTargetY=robot.moveTargetY;
      const dx=targetX-robot.x,dy=targetY-robot.y,len=Math.hypot(dx,dy)||1;
      const distanceToBallBefore=Math.hypot(b.x-robot.x,b.y-robot.y);
      const velocityTowardTarget=robot.vx*dx+robot.vy*dy;
      const closingOnBall=(action==='PRESS')&&distanceToBallBefore<60&&(Math.hypot(robot.vx,robot.vy)<1||velocityTowardTarget>=-robot.maxSpeed*20);
      const desiredSpeed=(robot.archetype==='striker'||robot.archetype==='bulwark')&&action==='PRESS'?robot.maxSpeed:(closingOnBall?robot.maxSpeed:Math.min(robot.maxSpeed,len*2.2));
      const desiredX=dx/len*desiredSpeed,desiredY=dy/len*desiredSpeed;
      const maxDelta=robot.acceleration*dt;
      robot.vx+=this.clamp(desiredX-robot.vx,-maxDelta,maxDelta);
      robot.vy+=this.clamp(desiredY-robot.vy,-maxDelta,maxDelta);
      const speed=Math.hypot(robot.vx,robot.vy);
      if(speed>robot.maxSpeed){robot.vx=robot.vx/speed*robot.maxSpeed;robot.vy=robot.vy/speed*robot.maxSpeed;}
      if(robot.archetype!=='bulwark'&&robot.archetype!=='sweeper'&&Math.hypot(robot.vx,robot.vy)>1){const facingLen=Math.hypot(robot.vx,robot.vy);robot.facingX=robot.vx/facingLen;robot.facingY=robot.vy/facingLen;}
      robot.x=this.clamp(robot.x+robot.vx*dt,28,this.field.width-28);
      robot.y=this.clamp(robot.y+robot.vy*dt,28,this.field.height-28);
      if(robot.archetype==='bulwark'||robot.archetype==='sweeper'){const minY=robot.team==='orange'?28:this.field.height/2-SWEEPER_FORWARD_LIMIT;const maxY=robot.team==='orange'?this.field.height/2+SWEEPER_FORWARD_LIMIT:this.field.height-28;if((robot.y<=minY&&robot.vy<0)||(robot.y>=maxY&&robot.vy>0))robot.vy=0;}
      if(robot.archetype==='bulwark'||robot.archetype==='sweeper'){
        const rawX=robot.x,rawY=robot.y; const bounded=this.clampSweeperTarget(robot.team,robot.x,robot.y); robot.x=bounded.x; robot.y=bounded.y;
        if(rawX<robot.x&&robot.vx<0||rawX>robot.x&&robot.vx>0)robot.vx=0;
        if(rawY<robot.y&&robot.vy<0||rawY>robot.y&&robot.vy>0)robot.vy=0;
      }
      if(robot.archetype==='bulwark'||robot.archetype==='sweeper'){const lookX=b.x-robot.x,lookY=b.y-robot.y,lookLen=Math.hypot(lookX,lookY)||1;robot.facingX=lookX/lookLen;robot.facingY=lookY/lookLen;}
      robot.backpedal=robot.facingX*robot.vx+robot.facingY*robot.vy<0;
      if(robot.archetype!=='bulwark'&&robot.archetype!=='sweeper'&&robot.target!=='GOAL_BLOCK') robot.target='BALL';
      robot.moveTargetX=targetX; robot.moveTargetY=targetY; robot.distanceToBall=Math.hypot(b.x-robot.x,b.y-robot.y); robot.distanceToTarget=len;
      robot.lastDecisionReason=this.decisionReason(robot,action);
      robot.action=action;
      const targetChanged=Math.hypot(targetX-previousTargetX,targetY-previousTargetY)>24;
      if(previousAction!==action){robot.stateChangedAt=this.state.elapsed;this.recordEvent({type:'state-change',ids:[robot.id],x:robot.x,y:robot.y,state:action,reason:robot.lastDecisionReason,targetPosition:{x:targetX,y:targetY}});}
      if(targetChanged)this.recordEvent({type:'target-change',ids:[robot.id],x:robot.x,y:robot.y,reason:robot.lastDecisionReason,targetPosition:{x:targetX,y:targetY}});
      this.recordEvent({type:'decision',ids:[robot.id],x:robot.x,y:robot.y,state:action,reason:robot.lastDecisionReason,targetPosition:{x:targetX,y:targetY},decision:{sense:{robotX:robot.x,robotY:robot.y,ballX:b.x,ballY:b.y,distanceToBall:robot.distanceToBall,kickAvailable:robot.kickCooldown<=0&&robot.kickLockout<=0},target:robot.target,distanceToBall:robot.distanceToBall,distanceToTarget:len,desiredSpeed,action,sweeperState:robot.sweeperState,backpedal:robot.backpedal,interceptReason:robot.interceptReason}});
    }
  }

  private isOwnGoalKickRisk(robot:Robot,nx:number,ny:number,b:MatchState['ball']):boolean{
    const attackY=robot.team==='blue'?-1:1;
    const facingOwnGoal=robot.facingY*attackY<-0.25;
    const ballInFront=robot.facingX*nx+robot.facingY*ny>0.25;
    const ballTowardOwnGoal=attackY*b.vy<-20;
    return facingOwnGoal&&ballInFront&&(ballTowardOwnGoal||Math.abs(b.vy)<20);
  }

  private resolveRobotRobotCollisions(){
    const robots=[...this.state.robots].sort((a,b)=>a.id.localeCompare(b.id));
    for(let i=0;i<robots.length;i++) for(let j=i+1;j<robots.length;j++){
      const a=robots[i],b=robots[j]; const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;
      const pairKey=`${a.id}+${b.id}`;
      if((this.robotCollisionCooldown[pairKey]??0)>0) continue;
      const minDist=a.radius+b.radius;
      if(dist<minDist){
        const nx=dx/dist,ny=dy/dist,penetration=minDist-dist;
        const invA=1/a.mass,invB=1/b.mass,totalInvMass=invA+invB;
        const correctionBias=1.25;
        const correctionA=penetration*correctionBias*invA/totalInvMass,correctionB=penetration*correctionBias*invB/totalInvMass;
        a.x=this.clamp(a.x-nx*correctionA,28,this.field.width-28); a.y=this.clamp(a.y-ny*correctionA,28,this.field.height-28);
        b.x=this.clamp(b.x+nx*correctionB,28,this.field.width-28); b.y=this.clamp(b.y+ny*correctionB,28,this.field.height-28);
        const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(relative<0){const impulse=-(1+0.25)*relative/(1/a.mass+1/b.mass);a.vx-=nx*impulse/a.mass;a.vy-=ny*impulse/a.mass;b.vx+=nx*impulse/b.mass;b.vy+=ny*impulse/b.mass;this.clampRobotVelocity(a);this.clampRobotVelocity(b);}
        else { const separation=64; a.vx-=nx*separation/a.mass; a.vy-=ny*separation/a.mass; b.vx+=nx*separation/b.mass; b.vy+=ny*separation/b.mass; this.clampRobotVelocity(a); this.clampRobotVelocity(b); }
        this.robotCollisionCooldown[pairKey]=2/60;
        this.recordEvent({type:'robot-robot-collision',ids:[a.id,b.id],x:(a.x+b.x)/2,y:(a.y+b.y)/2,impulse:Math.max(0,-relative)});
        this.tryCentralKickoffDeflection(a,b);
      }
    }
  }

  private tryCentralKickoffDeflection(a:Robot,b:Robot){
    if(this.kickoffTimer<=0||this.kickoffRaceTicks<=0||this.centralDeflectionCooldown>0||a.archetype!=='striker'||b.archetype!=='striker'||a.team===b.team)return;
    const ball=this.state.ball; const centerX=this.field.width/2,centerY=this.field.height/2;
    if(Math.hypot(ball.x-centerX,ball.y-centerY)>78||Math.hypot(ball.vx,ball.vy)>28)return;
    const midpointX=(a.x+b.x)/2,midpointY=(a.y+b.y)/2;
    if(Math.hypot(midpointX-ball.x,midpointY-ball.y)>82)return;
    const hash=Math.abs(this.seed*73856093+this.tickIndex*19349663+([...a.id+b.id].reduce((sum,char)=>sum+char.charCodeAt(0),0)*83492791));
    const normalized=(hash%1000)/999;
    const angle=(normalized*2-1)*0.34;
    const attackY=hash%2===0?-1:1;
    const impulse=260;
    const beforeX=ball.vx,beforeY=ball.vy;
    this.applyBallImpulse(Math.sin(angle)*impulse,attackY*Math.cos(angle)*impulse);
    this.centralDeflectionCooldown=0.6;
    this.recordEvent({type:'stuck-recovery',ids:[a.id,b.id],x:ball.x,y:ball.y,impulse,vxBefore:beforeX,vyBefore:beforeY,vxAfter:ball.vx,vyAfter:ball.vy,reason:'deterministic central kickoff deflection'});
  }

  private resolveRobotBallCollisions(){
    if(this.ballKickInvuln>0)return;
    const b=this.state.ball;
    const candidates:Array<{robot:Robot;nx:number;ny:number;distance:number;score:number}>=[];
    for(const robot of [...this.state.robots].sort((a,b2)=>a.id.localeCompare(b2.id))){
      if((this.ballContactCooldown[robot.id]??0)>0) continue;

      const dx=b.x-robot.x,dy=b.y-robot.y,dist=Math.hypot(dx,dy)||1,minDist=robot.radius+b.radius;
      const isSweeper=robot.archetype==='bulwark'||robot.archetype==='sweeper';
      const contactReach=isSweeper?KICK_RANGE_PROFILES[robot.archetype].distance:minDist;
      if(dist>contactReach+1) continue;
      const nx=dx/dist,ny=dy/dist;
      const penetration=minDist-dist;
      if(penetration>0){const invBall=1/b.mass,invRobot=1/robot.mass,total=invBall+invRobot;b.x+=nx*penetration*invBall/total;b.y+=ny*penetration*invBall/total;robot.x=this.clamp(robot.x-nx*penetration*invRobot/total,28,this.field.width-28);robot.y=this.clamp(robot.y-ny*penetration*invRobot/total,28,this.field.height-28);}
      const relative=b.vx*nx+b.vy*ny-(robot.vx*nx+robot.vy*ny);
      const ownGoalRisk=this.isOwnGoalKickRisk(robot,nx,ny,b);
      const attackY=robot.team==='blue'?-1:1;
      if(relative<0){
        const impulse=-ROBOT_BALL_RESTITUTION*relative/(1/b.mass+1/robot.mass);
        const beforeX=b.vx,beforeY=b.vy;
        if(ownGoalRisk){
          b.vx*=0.15; b.vy=attackY*80;
          this.recordEvent({type:'robot-ball-collision',ids:[robot.id],x:b.x,y:b.y,impulse:0,vxBefore:beforeX,vyBefore:beforeY,vxAfter:b.vx,vyAfter:b.vy,reason:'body block prevented own-goal kick'});
        } else {
          b.vx=this.clamp(b.vx+nx*impulse/b.mass,-MAX_SPEED,MAX_SPEED); b.vy=this.clamp(b.vy+ny*impulse/b.mass,-MAX_SPEED,MAX_SPEED);
          robot.vx-=nx*impulse/robot.mass; robot.vy-=ny*impulse/robot.mass;
          this.clampRobotVelocity(robot);
          this.recordEvent({type:'robot-ball-collision',ids:[robot.id],x:b.x,y:b.y,impulse,vxBefore:beforeX,vyBefore:beforeY,vxAfter:b.vx,vyAfter:b.vy});
        }
        this.ballContactCooldown[robot.id]=8/60;
        if(!ownGoalRisk&&(robot.archetype==='bulwark'||robot.archetype==='sweeper')&&robot.clearCooldown<=0&&(robot.team==='blue'?b.y>this.field.height/2:b.y<this.field.height/2)) this.applySweeperClear(robot);
      } else {
        if(ownGoalRisk){
          const beforeX=b.vx,beforeY=b.vy; b.vx*=0.15; b.vy=attackY*80;
          this.recordEvent({type:'robot-ball-collision',ids:[robot.id],x:b.x,y:b.y,impulse:0,vxBefore:beforeX,vyBefore:beforeY,vxAfter:b.vx,vyAfter:b.vy,reason:'body block prevented own-goal kick'});
        } else {
          this.recordEvent({type:'robot-ball-collision',ids:[robot.id],x:b.x,y:b.y,impulse:0,vxBefore:b.vx,vyBefore:b.vy,vxAfter:b.vx,vyAfter:b.vy,reason:'physical contact without inward relative velocity'});
        }
        this.ballContactCooldown[robot.id]=8/60;
        if(!ownGoalRisk&&(robot.archetype==='bulwark'||robot.archetype==='sweeper')&&robot.clearCooldown<=0&&(robot.team==='blue'?b.y>this.field.height/2:b.y<this.field.height/2)) this.applySweeperClear(robot);
      }
      const forward=robot.facingX*nx+robot.facingY*ny;
      const lineDistance=Math.abs((b.x-robot.x)*robot.facingY-(b.y-robot.y)*robot.facingX);
      const kickProfile=KICK_RANGE_PROFILES[robot.archetype as keyof typeof KICK_RANGE_PROFILES];
      const kickHalfAngle=Math.cos(kickProfile.halfAngleDeg*Math.PI/180);
      if((robot.archetype==='striker'||robot.archetype==='cannon')&&dist<=kickProfile.distance&&((forward>=kickHalfAngle)||(robot.archetype==='striker'&&robot.action==='PRESS'))&&(!this.isOwnGoalKickRisk(robot,nx,ny,b))&&(!this.kickDebugLine||lineDistance<=8)) candidates.push({robot,nx,ny,distance:dist,score:forward-dist/100});
    }
    candidates.sort((a,b2)=>b2.score-a.score||a.robot.id.localeCompare(b2.robot.id));
    if(candidates[0])this.tryKick(candidates[0].robot,candidates[0].nx,candidates[0].ny);
  }

  private applySweeperClear(robot:Robot){
    const b=this.state.ball; const attackY=robot.team==='blue'?-1:1;
    const beforeX=b.vx,beforeY=b.vy;
    const desiredVy=attackY*Math.max(Math.abs(beforeY),SWEEPER_CLEAR_SPEED);
    const impulse=Math.abs(desiredVy-beforeY)*b.mass;
    this.applyBallImpulse(0,desiredVy-beforeY);
    this.sweeperClearTeam=robot.team;
    robot.clearImpulse=impulse; robot.clearCooldown=0.35; robot.sweeperState='CLEAR_KICK'; robot.action='KICK'; robot.kickCooldown=0.45; robot.kickLockout=0.1;
    this.recordEvent({type:'kick',ids:[robot.id],x:b.x,y:b.y,impulse,vyBefore:beforeY,vxBefore:beforeX,vxAfter:b.vx,vyAfter:b.vy,reason:'sweeper clear after physical contact',direction:{x:0,y:attackY},power:impulse,candidate:robot.id});
  }

  private tryKick(robot:Robot,nx:number,ny:number){
    const b=this.state.ball;
    if((robot.archetype!=='striker'&&robot.archetype!=='cannon')||robot.kickCooldown>0||robot.kickLockout>0||this.kickoffTimer>0||this.ballKickInvuln>0) return;
    if(this.kickoffFirstKickPending&&robot.team!==this.kickoffPreferredTeam)return;
    const attackY=robot.team==='blue'?-1:1;
    if(robot.facingY*attackY< -0.25)return;
    const forward=robot.facingX*nx+robot.facingY*ny;
    const kickProfile=KICK_RANGE_PROFILES[robot.archetype];
    if(forward<Math.cos(kickProfile.halfAngleDeg*Math.PI/180)&&!(robot.archetype==='striker'&&robot.action==='PRESS')||Math.hypot(b.x-robot.x,b.y-robot.y)>kickProfile.distance||this.kickBurstCount>=3) return;
    const goalX=this.field.width/2;
    const goalBias=this.clamp((goalX-b.x)/160,-1,1)*0.5;
    const aimX=this.kickDebugLine?robot.facingX:goalBias,aimY=this.kickDebugLine?robot.facingY:attackY;
    const aimLen=Math.hypot(aimX,aimY)||1;
    const power=robot.archetype==='cannon'?CANNON_KICK_POWER:KICK_POWER;
    const opposingVelocity=Math.max(0,-attackY*b.vy);
    const impulsePower=power+opposingVelocity*0.9;
    const beforeX=b.vx,beforeY=b.vy;
    const lateralImpulse=aimX/aimLen*impulsePower;
    const kickVy=aimY/aimLen*impulsePower/b.mass;
    const desiredVy=attackY*Math.max(Math.abs(beforeY),Math.abs(kickVy));
    const longitudinalImpulse=(desiredVy-beforeY)*b.mass;
    if(this.kickDebugLine)this.applyBallImpulse(aimX/aimLen*impulsePower,aimY/aimLen*impulsePower);
    else this.applyBallImpulse(lateralImpulse,longitudinalImpulse);
    robot.vx*=0.55;robot.vy*=0.55;robot.kickCooldown=robot.archetype==='cannon'?1.1:0.85;robot.kickLockout=0.10;robot.action=robot.archetype==='cannon'?'SHOOT':'KICK';robot.lastKickAt=this.state.elapsed;robot.kickTarget='OPPONENT_GOAL';robot.kickDirectionX=aimX/aimLen;robot.kickDirectionY=aimY/aimLen;robot.kickPower=impulsePower;robot.lastDecisionReason=`kick: forward=${forward.toFixed(3)}, range=${Math.hypot(b.x-robot.x,b.y-robot.y).toFixed(1)}, cooldown=0, candidate=${robot.id}`;
    this.ballKickInvuln=0.18;this.lastKickTeam=robot.team;this.lastKickX=b.x;this.lastKickY=b.y;this.lastKickElapsed=this.state.elapsed;this.kickoffFirstKickPending=false;if(this.state.elapsed-this.kickBurstStart>0.8)this.kickBurstStart=this.state.elapsed;this.kickBurstCount++;
    this.recordEvent({type:'kick',ids:[robot.id],x:b.x,y:b.y,impulse:power,vxBefore:beforeX,vyBefore:beforeY,vxAfter:b.vx,vyAfter:b.vy,reason:robot.lastDecisionReason,direction:{x:robot.kickDirectionX,y:robot.kickDirectionY},power:impulsePower,candidate:robot.id});
  }

  private integrateBall(dt:number){
    const b=this.state.ball;b.x+=b.vx*dt;b.y+=b.vy*dt;
    b.vx*=Math.pow(DAMPING,dt);b.vy*=Math.pow(DAMPING,dt);
    if(this.sweeperClearTeam){const inOpponentHalf=this.sweeperClearTeam==='blue'?b.y<this.field.height/2:b.y>this.field.height/2;if(inOpponentHalf){const depth=Math.min(SWEEPER_OPPONENT_DAMPING_DEPTH,Math.abs(b.y-this.field.height/2));const progress=depth/SWEEPER_OPPONENT_DAMPING_DEPTH;const damping=1-(1-SWEEPER_OPPONENT_DAMPING)*progress;b.vx*=Math.pow(damping,dt);b.vy*=Math.pow(damping,dt);}}
    const speed=Math.hypot(b.vx,b.vy);if(speed>MAX_SPEED){b.vx=b.vx/speed*MAX_SPEED;b.vy=b.vy/speed*MAX_SPEED;}
    if(Math.hypot(b.vx,b.vy)<2){b.vx=0;b.vy=0;}
  }

  private resolveGoalOrWalls(){
    const b=this.state.ball; const inGoalMouth=b.x>=GOAL_LEFT&&b.x<=GOAL_RIGHT;
    const goalAllowed=true;
    if(goalAllowed&&b.y<=18&&b.vy<0&&inGoalMouth){this.state.score.blue++;this.beginGoalReset('blue');return;}
    if(goalAllowed&&b.y>=this.field.height-18&&b.vy>0&&inGoalMouth){this.state.score.orange++;this.beginGoalReset('orange');return;}
    if(b.x>20)this.wallContact.left=false;
    if(b.x<this.field.width-20)this.wallContact.right=false;
    if(b.y>20)this.wallContact.top=false;
    if(b.y<this.field.height-20)this.wallContact.bottom=false;
    if(b.x<18){b.x=18;if(b.vx< -0.5){if(!this.wallContact.left){b.vx=Math.abs(b.vx)*WALL_BOUNCE;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}else b.vx=0;this.wallContact.left=true;}}
    if(b.x>this.field.width-18){b.x=this.field.width-18;if(b.vx>0.5){if(!this.wallContact.right){b.vx=-Math.abs(b.vx)*WALL_BOUNCE;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}else b.vx=0;this.wallContact.right=true;}}
    if(b.y<18){b.y=18;if(b.vy< -0.5){if(!this.wallContact.top){b.vy=Math.abs(b.vy)*WALL_BOUNCE;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}else b.vy=0;this.wallContact.top=true;}}
    if(b.y>this.field.height-18){b.y=this.field.height-18;if(b.vy>0.5){if(!this.wallContact.bottom){b.vy=-Math.abs(b.vy)*WALL_BOUNCE;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}else b.vy=0;this.wallContact.bottom=true;}}
    this.resolveChamferedCorner();
  }

  private resolveChamferedCorner(){
    const b=this.state.ball; const edge=18, chamfer=26;
    const corners=[{x:edge,y:edge,nx:1,ny:1},{x:this.field.width-edge,y:edge,nx:-1,ny:1},{x:edge,y:this.field.height-edge,nx:1,ny:-1},{x:this.field.width-edge,y:this.field.height-edge,nx:-1,ny:-1}];
    for(const corner of corners){
      const dx=b.x-corner.x,dy=b.y-corner.y;
      const length=Math.hypot(corner.nx,corner.ny); const nx=corner.nx/length,ny=corner.ny/length;
      const normalVelocity=b.vx*nx+b.vy*ny;
      if(Math.abs(dx)<=chamfer&&Math.abs(dy)<=chamfer&&corner.nx*dx+corner.ny*dy<chamfer&&normalVelocity<0){
        const penetration=chamfer-(corner.nx*dx+corner.ny*dy); b.x+=nx*penetration;b.y+=ny*penetration;
        b.vx-=normalVelocity*1.7*nx;b.vy-=normalVelocity*1.7*ny;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});
        break;
      }
    }
  }

  private beginGoalReset(scoringTeam:Team){const b=this.state.ball;this.initialKickoffSafety=false;this.goalTeam=scoringTeam;this.ballStuckTicks=0;this.state.goalResetTimer=1;this.recordEvent({type:'goal',x:b.x,y:b.y,vxBefore:b.vx,vyBefore:b.vy,decision:{scoringTeam}});}
  private advanceGoalBall(dt:number){const b=this.state.ball;const topGoal=this.goalTeam==='blue',goalMin=GOAL_LEFT+BALL_RADIUS,goalMax=GOAL_RIGHT-BALL_RADIUS;b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.x<goalMin){b.x=goalMin;if(b.vx<0)b.vx=Math.abs(b.vx)*0.28;}else if(b.x>goalMax){b.x=goalMax;if(b.vx>0)b.vx=-Math.abs(b.vx)*0.28;}b.vx*=Math.pow(0.78,dt);b.vy*=Math.pow(0.78,dt);const netHoldDepth=GOAL_GEOMETRY.depth-BALL_RADIUS;if(topGoal&&b.y<-netHoldDepth){b.y=-netHoldDepth;b.vy=0;}if(!topGoal&&b.y>this.field.height+netHoldDepth){b.y=this.field.height+netHoldDepth;b.vy=0;}if(Math.hypot(b.vx,b.vy)<8){b.vx=0;b.vy=0;}}
  private resetBall(){const b=this.state.ball;b.x=this.field.width/2;b.y=this.field.height/2;b.vx=0;b.vy=0;this.goalTeam=undefined;this.sweeperClearTeam=undefined;this.centralDeflectionCooldown=0;this.wallContact={left:false,right:false,top:false,bottom:false};this.resetRobots();this.ballStuckTicks=0;this.lastBallX=b.x;this.lastBallY=b.y;this.state.goalResetTimer=0;this.kickoffTimer=0.75;this.kickoffRaceTicks=180;this.kickoffSafetyTimer=5;this.kickoffPreferredTeam=this.kickoffPreferredTeam==='blue'?'orange':'blue';this.kickoffFirstKickPending=true;this.recordEvent({type:'kickoff',x:b.x,y:b.y});}
  private resetRobots(){for(const robot of this.state.robots){const formation=this.seedFormation[robot.id];robot.x=formation.x;robot.y=formation.y;robot.vx=0;robot.vy=0;robot.facingX=0;robot.facingY=robot.team==='blue'?-1:1;robot.action='RESET';robot.target='BALL';robot.kickCooldown=0;robot.kickLockout=0;robot.sweeperState='HOLD_POST';robot.backpedal=false;robot.interceptReason='reset to home post';robot.clearImpulse=0;robot.returnTick=0;robot.clearCooldown=0;}}
  private resolveStuckBall(){
    const b=this.state.ball; const movement=Math.hypot(b.x-this.lastBallX,b.y-this.lastBallY); this.lastBallX=b.x;this.lastBallY=b.y;
    if(this.kickoffTimer>0||this.state.goalResetTimer>0){this.ballStuckTicks=0;return;}
    const corners=[{x:18,y:18,nx:1,ny:1},{x:this.field.width-18,y:18,nx:-1,ny:1},{x:18,y:this.field.height-18,nx:1,ny:-1},{x:this.field.width-18,y:this.field.height-18,nx:-1,ny:-1}];
    const corner=corners.reduce<{x:number;y:number;nx:number;ny:number;distance:number}|null>((best,current)=>{const distance=Math.hypot(b.x-current.x,b.y-current.y);return !best||distance<best.distance?{...current,distance}:best;},null);
    const speed=Math.hypot(b.vx,b.vy);
    if(corner&&corner.distance<75&&speed<40&&movement<1) this.cornerStuckTicks++; else this.cornerStuckTicks=0;
    if(this.cornerStuckTicks>=20&&this.cornerRecoveryCooldown<=0&&corner){
      const len=Math.hypot(corner.nx,corner.ny);
      b.x=this.clamp(b.x+corner.nx*10,18,this.field.width-18); b.y=this.clamp(b.y+corner.ny*10,18,this.field.height-18);
      b.vx=corner.nx/len*260; b.vy=corner.ny/len*260;
      this.wallContact={left:false,right:false,top:false,bottom:false};
      this.cornerRecoveryCooldown=0.75; this.cornerStuckTicks=0;
      this.recordEvent({type:'stuck-recovery',reason:'corner trap for 20 fixed ticks',x:b.x,y:b.y,impulse:260});
      return;
    }
    const nearSideWall=b.x<=34||b.x>=this.field.width-34;
    if(!nearSideWall)this.sideWallRecoveryLatched=false;
    if(nearSideWall&&speed<20&&movement<1) this.sideWallStuckTicks++; else this.sideWallStuckTicks=0;
    if(this.sideWallStuckTicks>=60&&this.stuckRecoveryCooldown<=0&&!this.sideWallRecoveryLatched){
      const inward=b.x<this.field.width/2?1:-1;
      this.applyBallImpulse(inward*180-b.vx,0); this.stuckRecoveryCooldown=0.75; this.sideWallStuckTicks=0; this.sideWallRecoveryLatched=true;
      this.recordEvent({type:'stuck-recovery',reason:'side-wall low-speed trap for 60 fixed ticks',x:b.x,y:b.y,impulse:180});
      return;
    }
    if(movement<0.25&&Math.hypot(b.vx,b.vy)<4)this.ballStuckTicks++;else this.ballStuckTicks=0;
    if(this.ballStuckTicks>=90&&this.stuckRecoveryCooldown<=0){
      const dx=this.field.width/2-b.x,dy=this.field.height/2-b.y,len=Math.hypot(dx,dy)||1;
      b.vx=dx/len*96;b.vy=dy/len*96;this.stuckRecoveryCooldown=0.75;this.ballStuckTicks=0;
      this.recordEvent({type:'stuck-recovery',reason:'near-zero movement for 90 fixed ticks',x:b.x,y:b.y,impulse:96});
    }
  }

  private decisionReason(robot:Robot,action:Action){
    if(robot.archetype==='bulwark'||robot.archetype==='sweeper') return robot.sweeperState==='HOLD_POST'?'holding designated home post':robot.interceptReason;
    if(robot.archetype==='striker') return action==='CARRY'?'inside approach envelope':'tracking ball behind attack axis';
    if(robot.archetype==='cannon') return 'shooting lane target selected';
    if(robot.archetype==='dribbler') return 'carry lane selected';
    return 'ball pursuit target selected';
  }

  private recordEvent(event:Omit<SimulationEvent,'tick'|'elapsed'>){
    this.events.push({...event,tick:this.tickIndex,elapsed:this.state.elapsed});
    if(this.events.length>20000)this.events.shift();
  }

  private recordTelemetry(){
    const frame:TelemetryFrame={tick:this.tickIndex,elapsed:this.state.elapsed,status:this.state.status,goalResetTimer:this.state.goalResetTimer,score:{...this.state.score},ball:{x:this.state.ball.x,y:this.state.ball.y,vx:this.state.ball.vx,vy:this.state.ball.vy},robots:[...this.state.robots].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({id:r.id,team:r.team,role:r.role,archetype:r.archetype,x:r.x,y:r.y,vx:r.vx,vy:r.vy,maxSpeed:r.maxSpeed,facingX:r.facingX,facingY:r.facingY,kickCooldown:r.kickCooldown,kickLockout:r.kickLockout,target:r.target,action:r.action,moveTargetX:r.moveTargetX,moveTargetY:r.moveTargetY,distanceToBall:r.distanceToBall,distanceToTarget:r.distanceToTarget,sweeperState:r.sweeperState,backpedal:r.backpedal,interceptReason:r.interceptReason,clearImpulse:r.clearImpulse,returnTick:r.returnTick,clearCooldown:r.clearCooldown,lastDecisionReason:r.lastDecisionReason,stateChangedAt:r.stateChangedAt,lastKickAt:r.lastKickAt,kickTarget:r.kickTarget,kickDirectionX:r.kickDirectionX,kickDirectionY:r.kickDirectionY,kickPower:r.kickPower})),events:this.events.filter(e=>e.tick===this.tickIndex).map(e=>({...e}))};
    this.telemetry.push(frame);if(this.telemetry.length>10000)this.telemetry.shift();
  }

  getEvents(){return this.events.map(event=>({...event}));}
  getTelemetry(){return this.telemetry.map(frame=>({...frame,score:{...frame.score},ball:{...frame.ball},robots:frame.robots.map(robot=>({...robot})),events:frame.events.map(event=>({...event}))}));}
  private goalAngleBlockTarget(team:Team,ballX:number,ballY:number){
    const goalX=this.field.width/2;
    const goalY=team==='blue'?this.field.height-18:18;
    const distance=Math.max(110,Math.abs(ballY-goalY));
    const ratio=this.kickoffRaceTicks>0?Math.min(1,110/distance):(distance<=150?Math.min(1,110/distance):0.72);
    return this.clampSweeperTarget(team,goalX+(ballX-goalX)*ratio,goalY+(ballY-goalY)*ratio);
  }
  private clampSweeperTarget(team:Team,x:number,y:number){
    const minY=team==='orange'?28:this.field.height/2-SWEEPER_FORWARD_LIMIT;
    const maxY=team==='orange'?this.field.height/2+SWEEPER_FORWARD_LIMIT:this.field.height-28;
    return {x:this.clamp(x,GOAL_AREA.left+ROBOT_RADIUS,GOAL_AREA.right-ROBOT_RADIUS),y:this.clamp(y,minY,maxY)};
  }
  private clampRobotVelocity(robot:Robot){const speed=Math.hypot(robot.vx,robot.vy);if(speed>robot.maxSpeed){robot.vx=robot.vx/speed*robot.maxSpeed;robot.vy=robot.vy/speed*robot.maxSpeed;}}
  private applyBallImpulse(ix:number,iy:number){const b=this.state.ball;b.vx=this.clamp(b.vx+ix/b.mass,-MAX_SPEED,MAX_SPEED);b.vy=this.clamp(b.vy+iy/b.mass,-MAX_SPEED,MAX_SPEED);}
  private clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
  snapshot(){ return JSON.parse(JSON.stringify(this.state)); }
  checkpoint(){ return JSON.parse(JSON.stringify({seed:this.seed,seedFormation:this.seedFormation,state:this.state,paused:this.paused,accumulator:this.accumulator,tickIndex:this.tickIndex,kickoffTimer:this.kickoffTimer,kickoffRaceTicks:this.kickoffRaceTicks,kickoffSafetyTimer:this.kickoffSafetyTimer,initialKickoffSafety:this.initialKickoffSafety,kickoffPreferredTeam:this.kickoffPreferredTeam,kickoffFirstKickPending:this.kickoffFirstKickPending,ballKickInvuln:this.ballKickInvuln,ballContactCooldown:this.ballContactCooldown,robotCollisionCooldown:this.robotCollisionCooldown,ballStuckTicks:this.ballStuckTicks,cornerStuckTicks:this.cornerStuckTicks,sideWallStuckTicks:this.sideWallStuckTicks,sideWallRecoveryLatched:this.sideWallRecoveryLatched,stuckRecoveryCooldown:this.stuckRecoveryCooldown,cornerRecoveryCooldown:this.cornerRecoveryCooldown,centralDeflectionCooldown:this.centralDeflectionCooldown,goalTeam:this.goalTeam,sweeperClearTeam:this.sweeperClearTeam,wallContact:this.wallContact,lastBallX:this.lastBallX,lastBallY:this.lastBallY,lastKickTeam:this.lastKickTeam,lastKickX:this.lastKickX,lastKickY:this.lastKickY,lastKickElapsed:this.lastKickElapsed,kickBurstCount:this.kickBurstCount,kickBurstStart:this.kickBurstStart,events:this.events,telemetry:this.telemetry})); }
  restoreCheckpoint(checkpoint:ReturnType<MatchSimulation['checkpoint']>){const value=JSON.parse(JSON.stringify(checkpoint)) as ReturnType<MatchSimulation['checkpoint']>; Object.assign(this,value,{seed:value.seed,seedFormation:value.seedFormation,state:value.state,events:value.events,telemetry:value.telemetry});}
}
