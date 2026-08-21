export type Team = 'blue' | 'orange';
export type Role = RobotArchetype;
export type RobotShape = 'circle' | 'square' | 'diamond' | 'hex';
export type RobotArchetype = 'striker' | 'bulwark' | 'scout' | 'dribbler' | 'cannon' | 'sweeper';
export type Action = 'PRESS' | 'COVER' | 'CARRY' | 'KICK' | 'SHOOT' | 'RESET';

type MatchStatus = 'ready' | 'running' | 'paused' | 'finished';
type EventType = 'robot-ball-collision' | 'robot-robot-collision' | 'kick' | 'goal' | 'kickoff' | 'wall-bounce' | 'stuck-recovery';

export interface Robot {
  id:string; team:Team; role:Role; shape:RobotShape; archetype:RobotArchetype;
  x:number; y:number; vx:number; vy:number; facingX:number; facingY:number;
  radius:number; mass:number; maxSpeed:number; acceleration:number;
  action:Action; target:string; kickCooldown:number; kickLockout:number;
}

export interface MatchState {
  elapsed:number; status:MatchStatus; score:Record<Team,number>; goalResetTimer:number;
  ball:{x:number;y:number;vx:number;vy:number;radius:number;mass:number}; robots:Robot[];
}

export interface SimulationEvent {
  type:EventType; tick:number; elapsed:number; ids?:string[];
  candidate?:string; reason?:string;
  x:number; y:number; impulse?:number; vxBefore?:number; vyBefore?:number; vxAfter?:number; vyAfter?:number;
}

export interface TelemetryFrame {
  tick:number; elapsed:number; status:MatchStatus; goalResetTimer:number; score:Record<Team,number>;
  ball:{x:number;y:number;vx:number;vy:number};
  robots:Array<{id:string;team:Team;role:Role;archetype:RobotArchetype;x:number;y:number;vx:number;vy:number;facingX:number;facingY:number;kickCooldown:number;kickLockout:number;target:string;action:Action}>;
  events:SimulationEvent[];
}

export const ARCHETYPES:RobotArchetype[]=['striker','bulwark','scout','dribbler','cannon','sweeper'];
export type TeamComposition={blue:[RobotArchetype,RobotArchetype];orange:[RobotArchetype,RobotArchetype]};
const FIXED_DT=1/60;
const GOAL_LEFT=190;
const GOAL_RIGHT=350;
const BALL_RADIUS=10;
const ROBOT_RADIUS=20;
const MAX_SPEED=520;

export class MatchSimulation {
  readonly field={width:540,height:860}; readonly duration=90; readonly seed:number; private paused=false; private accumulator=0; private tickIndex=0;
  private kickoffTimer=0; private ballKickInvuln=0; private ballStuckTicks=0; private stuckRecoveryCooldown=0; private lastBallX=270; private lastBallY=430; private lastKickTeam:Team|undefined; private lastKickX=0; private lastKickY=0; private lastKickElapsed=-10; private kickBurstCount=0; private kickBurstStart=-10; private events:SimulationEvent[]=[]; private telemetry:TelemetryFrame[]=[];
  private readonly seedFormation:Record<string,{x:number;y:number}>;
  state:MatchState;

  constructor(seed=42,composition?:Partial<TeamComposition>){
    this.seed=seed;

    const formationOffset=((seed*37)%121)-60;
    const blue=composition?.blue??['striker','bulwark'];
    const orange=composition?.orange??['striker','bulwark'];
    this.state={elapsed:0,status:'ready',score:{blue:0,orange:0},goalResetTimer:0,ball:{x:270,y:this.field.height/2,vx:0,vy:0,radius:BALL_RADIUS,mass:1},robots:[
      this.robot('blue',0,180+formationOffset,this.field.height-170,blue[0]), this.robot('blue',1,360-formationOffset,this.field.height-310,blue[1]),
      this.robot('orange',0,360-formationOffset,170,orange[0]), this.robot('orange',1,180+formationOffset,310,orange[1]),
    ]};
    this.seedFormation=Object.fromEntries(this.state.robots.map(robot=>[robot.id,{x:robot.x,y:robot.y}]));
    this.lastBallX=this.state.ball.x; this.lastBallY=this.state.ball.y;
  }

  private robot(team:Team,index:number,x:number,y:number,archetype:RobotArchetype):Robot {
    const role:Role=archetype;
    const profile=this.profileForArchetype(archetype);
    return {id:`${team}-${index}`,team,role,shape:this.shapeForRole(role),archetype,x,y,vx:0,vy:0,facingX:team==='blue'?0:0,facingY:team==='blue'?-1:1,radius:ROBOT_RADIUS,
      mass:profile.mass,maxSpeed:profile.maxSpeed,acceleration:profile.acceleration,
      action:'RESET',target:'BALL',kickCooldown:0,kickLockout:0};
  }

  private shapeForRole(role:Role):RobotShape { return ({striker:'circle',bulwark:'square',scout:'diamond',dribbler:'circle',cannon:'hex',sweeper:'square'} as Record<Role,RobotShape>)[role]; }
  private profileForArchetype(archetype:RobotArchetype){return ({striker:{mass:2,maxSpeed:230,acceleration:1000},bulwark:{mass:3.2,maxSpeed:156,acceleration:600},scout:{mass:1.6,maxSpeed:290,acceleration:1240},dribbler:{mass:2.1,maxSpeed:210,acceleration:920},cannon:{mass:2.5,maxSpeed:184,acceleration:760},sweeper:{mass:3,maxSpeed:172,acceleration:680}} as const)[archetype];}

  start(){
    if(this.state.status==='ready') { this.paused=false; this.kickoffTimer=0.75; this.state.status='running'; this.recordEvent({type:'kickoff',x:this.state.ball.x,y:this.state.ball.y}); }
  }

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
  private applyArchetype(robot:Robot,archetype:RobotArchetype){const profile=this.profileForArchetype(archetype);robot.role=archetype;robot.archetype=archetype;robot.shape=this.shapeForRole(archetype);robot.mass=profile.mass;robot.maxSpeed=profile.maxSpeed;robot.acceleration=profile.acceleration;}

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
    this.ballKickInvuln=Math.max(0,this.ballKickInvuln-dt);
    this.stuckRecoveryCooldown=Math.max(0,this.stuckRecoveryCooldown-dt);
    if(this.state.elapsed-this.kickBurstStart>0.8){this.kickBurstCount=0;this.kickBurstStart=this.state.elapsed;}
    for(const robot of this.state.robots){ robot.kickCooldown=Math.max(0,robot.kickCooldown-dt); robot.kickLockout=Math.max(0,robot.kickLockout-dt); }

    if(this.state.goalResetTimer>0){
      this.state.goalResetTimer=Math.max(0,this.state.goalResetTimer-dt);
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
    this.recordTelemetry();
    if(this.state.elapsed>=this.duration-1e-9&&this.state.goalResetTimer===0) this.state.status='finished';
  }

  private decideAndMoveRobots(dt:number){
    const b=this.state.ball;
    for(const robot of this.state.robots){
      const attack=robot.team==='blue'?-1:1;
      const side=robot.id.endsWith('1')?90:-90;
      const centerX=this.field.width/2;
      const centerY=this.field.height/2;
      let targetX=centerX+side,targetY=this.field.height/2-attack*150+(b.y-this.field.height/2)*0.25;
      let action:Action='COVER';
      switch(robot.archetype){
        case 'striker': {
          const approachOffset=20;
          const wrongSide=attack*(robot.y-b.y)>28;
          const lateralClear=Math.abs(robot.x-b.x)>60;
          if(wrongSide&&!lateralClear){
            targetX=b.x+side; targetY=b.y+attack*50; action='PRESS';
          }else{
            targetX=b.x-b.vx*0.12; targetY=b.y-attack*approachOffset-b.vy*0.08; action=Math.hypot(targetX-robot.x,targetY-robot.y)<52?'CARRY':'PRESS';
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
          targetX=b.x-Math.sign(b.x-centerX||1)*70; targetY=b.y-attack*34; action='SHOOT'; break;
        }
        case 'sweeper': {
          targetX=centerX+side*0.55; targetY=attack>0?this.field.height-150:150; action='RESET'; break;
        }
        case 'bulwark': {
          const homeY=attack<0?this.field.height-160:160;
          const ballInOwnHalf=attack>0?b.y>centerY:b.y<centerY;
          const homeX=centerX+side;
          const wrongSide=attack*(robot.y-b.y)>28;
          const lateralClear=Math.abs(robot.x-b.x)>60;
          if(ballInOwnHalf&&wrongSide&&!lateralClear){
            targetX=b.x+side; targetY=b.y+attack*50; action='PRESS';
          }else{
            targetY=ballInOwnHalf?homeY+(b.y-homeY)*0.55:homeY;
            targetX=ballInOwnHalf?homeX+(b.x-homeX)*0.45:homeX+(b.x-centerX)*0.12;
          }
          action=ballInOwnHalf?'PRESS':'COVER'; break;
        }
      }
      {
        const avoidanceWeight=robot.archetype==='striker'?1.35:1.1;
        for(const other of this.state.robots){
          if(other.id===robot.id)continue;
          const awayX=robot.x-other.x,awayY=robot.y-other.y,dist=Math.hypot(awayX,awayY);
          if(dist>0&&dist<64){const push=(64-dist)/dist;const closeBoost=dist<44?4.5:1;targetX+=awayX*push*avoidanceWeight*closeBoost;targetY+=awayY*push*avoidanceWeight*closeBoost;}
        }
      }
      const dx=targetX-robot.x,dy=targetY-robot.y,len=Math.hypot(dx,dy)||1;
      const desiredSpeed=Math.min(robot.maxSpeed,len*2.2);
      const desiredX=dx/len*desiredSpeed,desiredY=dy/len*desiredSpeed;
      const maxDelta=robot.acceleration*dt;
      robot.vx+=this.clamp(desiredX-robot.vx,-maxDelta,maxDelta);
      robot.vy+=this.clamp(desiredY-robot.vy,-maxDelta,maxDelta);
      const speed=Math.hypot(robot.vx,robot.vy);
      if(speed>robot.maxSpeed){robot.vx=robot.vx/speed*robot.maxSpeed;robot.vy=robot.vy/speed*robot.maxSpeed;}
      if(Math.hypot(robot.vx,robot.vy)>1){const facingLen=Math.hypot(robot.vx,robot.vy);robot.facingX=robot.vx/facingLen;robot.facingY=robot.vy/facingLen;}
      robot.x=this.clamp(robot.x+robot.vx*dt,28,this.field.width-28);
      robot.y=this.clamp(robot.y+robot.vy*dt,28,this.field.height-28);
      robot.target=robot.archetype==='sweeper'?'GOAL_COVER':robot.archetype==='bulwark'?'BALL_SUPPORT':'BALL';
      robot.action=action;
    }
  }

  private resolveRobotRobotCollisions(){
    const robots=[...this.state.robots].sort((a,b)=>a.id.localeCompare(b.id));
    for(let i=0;i<robots.length;i++) for(let j=i+1;j<robots.length;j++){
      const a=robots[i],b=robots[j]; const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;
      const minDist=a.radius+b.radius;
      if(dist<minDist){
        const nx=dx/dist,ny=dy/dist,penetration=minDist-dist;
        const correction=penetration*0.75;
        a.x=this.clamp(a.x-nx*correction,28,this.field.width-28); a.y=this.clamp(a.y-ny*correction,28,this.field.height-28);
        b.x=this.clamp(b.x+nx*correction,28,this.field.width-28); b.y=this.clamp(b.y+ny*correction,28,this.field.height-28);
        const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(relative<0){const impulse=-(1+0.25)*relative/(1/a.mass+1/b.mass);a.vx-=nx*impulse/a.mass;a.vy-=ny*impulse/a.mass;b.vx+=nx*impulse/b.mass;b.vy+=ny*impulse/b.mass;this.clampRobotVelocity(a);this.clampRobotVelocity(b);}
        this.recordEvent({type:'robot-robot-collision',ids:[a.id,b.id],x:(a.x+b.x)/2,y:(a.y+b.y)/2,impulse:Math.max(0,-relative)});
      }
    }
  }

  private resolveRobotBallCollisions(){
    if(this.ballKickInvuln>0)return;
    const b=this.state.ball;
    const candidates:Array<{robot:Robot;nx:number;ny:number;distance:number;score:number}>=[];
    for(const robot of [...this.state.robots].sort((a,b2)=>a.id.localeCompare(b2.id))){
      const dx=b.x-robot.x,dy=b.y-robot.y,dist=Math.hypot(dx,dy)||1,minDist=robot.radius+b.radius;
      if(dist>minDist+1) continue;
      const nx=dx/dist,ny=dy/dist;
      const penetration=minDist-dist;
      if(penetration>0){const invBall=1/b.mass,invRobot=1/robot.mass,total=invBall+invRobot;b.x+=nx*penetration*invBall/total;b.y+=ny*penetration*invBall/total;robot.x=this.clamp(robot.x-nx*penetration*invRobot/total,28,this.field.width-28);robot.y=this.clamp(robot.y-ny*penetration*invRobot/total,28,this.field.height-28);}
      const relative=b.vx*nx+b.vy*ny-(robot.vx*nx+robot.vy*ny);
      if(relative<0){
        const impulse=-(1+0.55)*relative/(1/b.mass+1/robot.mass);
        const beforeX=b.vx,beforeY=b.vy;
        b.vx=this.clamp(b.vx+nx*impulse/b.mass,-MAX_SPEED,MAX_SPEED); b.vy=this.clamp(b.vy+ny*impulse/b.mass,-MAX_SPEED,MAX_SPEED);
        robot.vx-=nx*impulse/robot.mass; robot.vy-=ny*impulse/robot.mass;
        this.clampRobotVelocity(robot);
        this.recordEvent({type:'robot-ball-collision',ids:[robot.id],x:b.x,y:b.y,impulse,vxBefore:beforeX,vyBefore:beforeY,vxAfter:b.vx,vyAfter:b.vy});
      }
      const forward=robot.facingX*nx+robot.facingY*ny;
      if((robot.archetype==='striker'||robot.archetype==='cannon')&&dist<=32&&forward>=Math.cos(35*Math.PI/180)) candidates.push({robot,nx,ny,distance:dist,score:forward-dist/100});
    }
    candidates.sort((a,b2)=>b2.score-a.score||a.robot.id.localeCompare(b2.robot.id));
    if(candidates[0])this.tryKick(candidates[0].robot,candidates[0].nx,candidates[0].ny);
  }

  private tryKick(robot:Robot,nx:number,ny:number){
    const b=this.state.ball;
    if((robot.archetype!=='striker'&&robot.archetype!=='cannon')||robot.kickCooldown>0||robot.kickLockout>0||this.kickoffTimer>0||this.ballKickInvuln>0) return;
    const forward=robot.facingX*nx+robot.facingY*ny;
    if(forward<Math.cos(35*Math.PI/180)||Math.hypot(b.x-robot.x,b.y-robot.y)>32||this.kickBurstCount>=3) return;
    if(this.lastKickTeam===robot.team&&this.state.elapsed-this.lastKickElapsed<0.24&&Math.hypot(b.x-this.lastKickX,b.y-this.lastKickY)<40)return;
    const attackY=robot.team==='blue'?-1:1;
    const goalX=this.field.width/2;
    const goalBias=this.clamp((goalX-b.x)/160,-1,1)*0.5;
    const aimX=goalBias,aimY=attackY;
    const aimLen=Math.hypot(aimX,aimY)||1;
    const power=robot.archetype==='cannon'?230:220;
    const opposingVelocity=Math.max(0,-attackY*b.vy);
    const impulsePower=power+opposingVelocity*0.9;
    const beforeX=b.vx,beforeY=b.vy;
    b.vx=this.clamp(b.vx+aimX/aimLen*impulsePower/b.mass,-MAX_SPEED,MAX_SPEED);
    b.vy=this.clamp(b.vy+aimY/aimLen*impulsePower/b.mass,-MAX_SPEED,MAX_SPEED);
    robot.vx*=0.55;robot.vy*=0.55;robot.kickCooldown=robot.archetype==='cannon'?1.1:0.85;robot.kickLockout=0.10;robot.action=robot.archetype==='cannon'?'SHOOT':'KICK';
    this.ballKickInvuln=0.12;this.lastKickTeam=robot.team;this.lastKickX=b.x;this.lastKickY=b.y;this.lastKickElapsed=this.state.elapsed;if(this.state.elapsed-this.kickBurstStart>0.8)this.kickBurstStart=this.state.elapsed;this.kickBurstCount++;
    this.recordEvent({type:'kick',ids:[robot.id],x:b.x,y:b.y,impulse:power,vxBefore:beforeX,vyBefore:beforeY,vxAfter:b.vx,vyAfter:b.vy});
  }

  private integrateBall(dt:number){
    const b=this.state.ball;b.x+=b.vx*dt;b.y+=b.vy*dt;
    b.vx*=Math.pow(0.88,dt);b.vy*=Math.pow(0.88,dt);
    const speed=Math.hypot(b.vx,b.vy);if(speed>MAX_SPEED){b.vx=b.vx/speed*MAX_SPEED;b.vy=b.vy/speed*MAX_SPEED;}
    if(Math.hypot(b.vx,b.vy)<2){b.vx=0;b.vy=0;}
  }

  private resolveGoalOrWalls(){
    const b=this.state.ball; const inGoalMouth=b.x>=GOAL_LEFT&&b.x<=GOAL_RIGHT;
    if(b.y<=18&&b.vy<0&&inGoalMouth){this.state.score.blue++;this.beginGoalReset('blue');return;}
    if(b.y>=this.field.height-18&&b.vy>0&&inGoalMouth){this.state.score.orange++;this.beginGoalReset('orange');return;}
    if(b.x<18&&b.vx<-0.5){b.x=18;b.vx=Math.abs(b.vx)*0.7;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}
    if(b.x>this.field.width-18&&b.vx>0.5){b.x=this.field.width-18;b.vx=-Math.abs(b.vx)*0.7;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}
    if(b.y<18&&b.vy<-0.5){b.y=18;b.vy=Math.abs(b.vy)*0.7;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}
    if(b.y>this.field.height-18&&b.vy>0.5){b.y=this.field.height-18;b.vy=-Math.abs(b.vy)*0.7;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}
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

  private beginGoalReset(scoringTeam:Team){const b=this.state.ball;b.y=scoringTeam==='blue'?-35:this.field.height+35;b.vx=0;b.vy=0;this.ballStuckTicks=0;this.state.goalResetTimer=1;this.recordEvent({type:'goal',x:b.x,y:b.y});}
  private resetBall(){const b=this.state.ball;b.x=this.field.width/2;b.y=this.field.height/2;b.vx=0;b.vy=0;this.resetRobots();this.ballStuckTicks=0;this.lastBallX=b.x;this.lastBallY=b.y;this.state.goalResetTimer=0;this.kickoffTimer=0.75;this.recordEvent({type:'kickoff',x:b.x,y:b.y});}
  private resetRobots(){for(const robot of this.state.robots){const formation=this.seedFormation[robot.id];robot.x=formation.x;robot.y=formation.y;robot.vx=0;robot.vy=0;robot.facingX=0;robot.facingY=robot.team==='blue'?-1:1;robot.action='RESET';robot.target='BALL';robot.kickCooldown=0;robot.kickLockout=0;}}
  private resolveStuckBall(){
    const b=this.state.ball; const movement=Math.hypot(b.x-this.lastBallX,b.y-this.lastBallY); this.lastBallX=b.x;this.lastBallY=b.y;
    if(this.kickoffTimer>0||this.state.goalResetTimer>0){this.ballStuckTicks=0;return;}
    if(movement<0.25&&Math.hypot(b.vx,b.vy)<4)this.ballStuckTicks++;else this.ballStuckTicks=0;
    if(this.ballStuckTicks>=90&&this.stuckRecoveryCooldown<=0){
      const dx=this.field.width/2-b.x,dy=this.field.height/2-b.y,len=Math.hypot(dx,dy)||1;
      b.vx=dx/len*96;b.vy=dy/len*96;this.stuckRecoveryCooldown=0.75;this.ballStuckTicks=0;
      this.recordEvent({type:'stuck-recovery',reason:'near-zero movement for 90 fixed ticks',x:b.x,y:b.y,impulse:96});
    }
  }

  private recordEvent(event:Omit<SimulationEvent,'tick'|'elapsed'>){
    this.events.push({...event,tick:this.tickIndex,elapsed:this.state.elapsed});
    if(this.events.length>20000)this.events.shift();
  }

  private recordTelemetry(){
    const frame:TelemetryFrame={tick:this.tickIndex,elapsed:this.state.elapsed,status:this.state.status,goalResetTimer:this.state.goalResetTimer,score:{...this.state.score},ball:{x:this.state.ball.x,y:this.state.ball.y,vx:this.state.ball.vx,vy:this.state.ball.vy},robots:this.state.robots.map(r=>({id:r.id,team:r.team,role:r.role,archetype:r.archetype,x:r.x,y:r.y,vx:r.vx,vy:r.vy,facingX:r.facingX,facingY:r.facingY,kickCooldown:r.kickCooldown,kickLockout:r.kickLockout,target:r.target,action:r.action})),events:this.events.filter(e=>e.tick===this.tickIndex).map(e=>({...e}))};
    this.telemetry.push(frame);if(this.telemetry.length>10000)this.telemetry.shift();
  }

  getEvents(){return this.events.map(event=>({...event}));}
  getTelemetry(){return this.telemetry.map(frame=>({...frame,score:{...frame.score},ball:{...frame.ball},robots:frame.robots.map(robot=>({...robot})),events:frame.events.map(event=>({...event}))}));}
  private clampRobotVelocity(robot:Robot){const speed=Math.hypot(robot.vx,robot.vy);if(speed>robot.maxSpeed){robot.vx=robot.vx/speed*robot.maxSpeed;robot.vy=robot.vy/speed*robot.maxSpeed;}}
  private clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
  snapshot(){ return JSON.parse(JSON.stringify(this.state)); }
}
