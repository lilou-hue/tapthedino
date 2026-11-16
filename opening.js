/* The first phase: a small, native-resolution reimplementation of Chromium's offline
   runner (idle blink, first jump, widening intro, run, cacti, crash and in-place retry).
   Constants, sprite geometry and collision boxes are from Chromium's bundled runner;
   see THIRD_PARTY_NOTICES.md. It is stepped by game.js at a fixed 60 Hz and never owns
   its own animation loop. Ducking and pterodactyls are not part of this short phase. */
(() => {
  'use strict';
  const FRAME_MS = 1000 / 60, HEIGHT = 150, DEFAULT_WIDTH = 600;
  const SPRITES = {
    ldpi:{cactusLarge:{x:332,y:2},cactusSmall:{x:228,y:2},cloud:{x:86,y:2},moon:{x:484,y:2},restart:{x:2,y:68},text:{x:655,y:2},tRex:{x:848,y:2},star:{x:645,y:2}},
    hdpi:{cactusLarge:{x:652,y:2},cactusSmall:{x:446,y:2},cloud:{x:166,y:2},moon:{x:954,y:2},restart:{x:2,y:130},text:{x:1294,y:2},tRex:{x:1678,y:2},star:{x:1276,y:2}}
  };
  const OBSTACLES = [
    {type:'cactusSmall',width:17,height:35,yPos:105,multipleSpeed:4,minGap:120,minSpeed:0,boxes:[[0,7,5,27],[4,0,6,34],[10,4,7,14]]},
    {type:'cactusLarge',width:25,height:50,yPos:90,multipleSpeed:7,minGap:120,minSpeed:0,boxes:[[0,12,7,38],[8,0,7,49],[13,10,10,38]]},
    // Never reached at this phase's speeds, but it still takes part in Chromium's re-roll.
    {type:'pterodactyl',width:46,height:40,minSpeed:8.5}
  ];
  const TREX = {width:44,height:47,groundY:HEIGHT-47-10,minJump:HEIGHT-47-10-30,maxJump:30,gravity:.6,initialVelocity:-10,dropVelocity:-5,startX:50,introDuration:1500};
  const RUNNING_BOXES = [[22,0,17,16],[1,18,30,9],[10,35,14,8],[1,24,29,5],[5,30,21,4],[9,34,15,4]];
  const ANIM = {waiting:{frames:[44,0],ms:1000/3},running:{frames:[88,132],ms:1000/12},crashed:{frames:[220],ms:1000/60},jumping:{frames:[0],ms:1000/60}};
  const CONFIG = {speed:6,acceleration:.001,maxSpeed:8.3,gapCoefficient:.6,mobileSpeedCoefficient:1.2,clearTime:3000,gameoverClearTime:1200,maxObstacleDuplication:2,maxClouds:6,cloudFrequency:.5,bgCloudSpeed:.2};
  const MOON_PHASES = [140,120,100,60,40,20,0];
  // CSS "ease-out" (cubic-bezier(0,0,.58,1)), as used by the runner's .4s intro keyframes.
  const easeOut = t => {
    if(t<=0) return 0; if(t>=1) return 1;
    const bx=u=>3*u*(1-u)*(1-u)*0+3*(1-u)*u*u*.58+u*u*u, by=u=>3*(1-u)*(1-u)*u*0+3*(1-u)*u*u+u*u*u;
    let lo=0, hi=1;
    for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(bx(mid)<t)lo=mid;else hi=mid;}
    return by((lo+hi)/2);
  };
  const mulberry = seed => () => {
    seed=(seed+0x6D2B79F5)|0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;
  };

  class ChromeOpening {
    constructor(container, canvas, fallback, seed=null) {
      this.container=container;this.canvas=canvas;this.fallback=fallback;
      this.ctx=canvas.getContext('2d');
      this.random=seed===null?Math.random:mulberry(seed);
      this.sheets={};this.failed={};this.ready=false;this.dark=false;this.hideRunner=false;this.sheetKey=null;
      for(const key of ['1x','2x'])this.loadSheet(key,0);
      this.layout();this.reset();
    }
    get hideRunner() { return !!this._hideRunner; }
    set hideRunner(value) {
      this._hideRunner=!!value;
      // The world renderer owns the hero during handoff/fold, including a DPR reload.
      if(this.fallback)this.fallback.hidden=this._hideRunner||this.ready;
    }
    loadSheet(key,attempt) {
      // A few spaced retries; if one density never arrives the other is used (scaled).
      const image=new Image();image.decoding='async';
      image.onload=()=>{this.sheets[key]=image;this.onSheet?.(key,image);this.checkReady();};
      image.onerror=()=>{
        if(attempt<3)setTimeout(()=>this.loadSheet(key,attempt+1),1000*2**attempt);
        else {this.failed[key]=true;this.checkReady();}
      };
      image.src=`assets/chrome-sprites${key==='2x'?'@2x':''}.png?v=1${attempt?'&retry='+attempt:''}`;
    }
    rand(min,max) { return Math.floor(this.random()*(max-min+1))+min; }
    checkReady() {
      // The reference idle crop stays until the sheet this display needs has decoded.
      const want=this.hidpi?'2x':'1x',other=this.hidpi?'1x':'2x';
      this.sheetKey=this.sheets[want]?want:this.failed[want]&&this.sheets[other]?other:null;
      const ready=!!this.sheetKey;
      if(ready===this.ready)return;
      this.ready=ready;this.canvas.hidden=!ready;this.fallback.hidden=ready||this.hideRunner;
      if(ready){this.layout();this.draw();}
    }
    get sheet() { return this.sheetKey?this.sheets[this.sheetKey]:null; }
    get k() { return this.sheetKey==='2x'?2:1; }
    get sprites() { return this.k===2?SPRITES.hdpi:SPRITES.ldpi; }
    get sheetStatus() { return this.ready?'ready:'+this.sheetKey:this.failed['1x']&&this.failed['2x']?'failed':'loading'; }
    layout() {
      // Chromium: interstitial-wrapper offsetWidth minus twice its left padding.
      const wrapper=this.container.parentElement, style=getComputedStyle(wrapper);
      const width=Math.max(44,wrapper.offsetWidth-(parseFloat(style.paddingLeft)||0)*2);
      this.hidpi=devicePixelRatio>1;
      const ratio=Math.floor(devicePixelRatio)||1;
      const changed=width!==this.width||ratio!==this.ratio;
      this.width=width;this.ratio=ratio;
      if(changed) {
        const pixels=Math.floor(width);
        this.canvas.width=pixels*ratio;this.canvas.height=HEIGHT*ratio;
        this.canvas.style.width=pixels+'px';this.canvas.style.height=HEIGHT+'px';
      }
      if(this.o) this.o.meterX=this.width-11*6;
      this.checkReady();
      if(this.o) this.applyContainer();
    }
    reset() {
      const r=this;
      const o=this.o={
        playing:false,activated:false,playingIntro:false,introMs:0,started:false,crashed:false,crashMs:0,
        runningTime:0,distanceRan:0,speed:CONFIG.speed,attempts:0,crashes:0,clock:0,serial:0,
        meterX:this.width-66,
        trex:{x:0,xInitial:0,y:TREX.groundY,v:0,jumping:false,reachedMin:false,status:'waiting',frameIndex:0,timer:0,
          shown:0,blinkDelay:Math.ceil(r.random()*7000),blinkStart:0,blinkCount:0,jumpCount:0},
        horizon:{x:[0,600],src:[0,600]},clouds:[],obstacles:[],history:[],
        meter:{achievement:false,flashTimer:0,flashIterations:0,digits:'00000',paint:true,high:'HI 00000',highest:0},
        night:{opacity:0,phase:0,x:0,stars:[],drawStars:false},
        panel:{frame:0,timer:0,shownFrames:0}
      };
      this.setSpeed();
      this.addCloud();this.placeStars();
      this.applyContainer();
      this.draw();
    }
    setSpeed(next) {
      const o=this.o, speed=Math.min(next||o.speed,this.maxSpeed||CONFIG.maxSpeed);
      if(this.width<DEFAULT_WIDTH) {
        const mobile=speed*this.width/DEFAULT_WIDTH*CONFIG.mobileSpeedCoefficient;
        o.speed=mobile>speed?speed:mobile;
      } else if(next) o.speed=speed;
    }
    containerWidth() {
      const o=this.o;
      if(!o.activated) return TREX.width;
      if(o.playingIntro) return TREX.width+(this.width-TREX.width)*easeOut(o.introMs/400);
      return this.width;
    }
    applyContainer() {
      const width=this.containerWidth()+'px';
      if(this.container.style.width!==width)this.container.style.width=width;
    }
    // --- Input, with Chromium's semantics -------------------------------------------
    jump() {
      const o=this.o;
      if(o.crashed) return {};
      const events={};
      if(!o.playing){o.playing=true;events.started=!o.started;o.started=true;}
      if(!o.trex.jumping){this.startJump();events.jumped=true;}
      return events;
    }
    release() { const o=this.o; if(o.playing&&!o.crashed)this.endJump(); }
    canRetry(key) {
      const o=this.o;
      return o.crashed && (key==='Enter' || key==='tap' || o.crashMs>=CONFIG.gameoverClearTime);
    }
    restart() {
      // In-place, as Chromium does: no second intro, clouds and history survive.
      const o=this.o;
      o.attempts++;o.runningTime=0;o.playing=true;o.crashed=false;o.crashMs=0;o.distanceRan=0;
      o.speed=CONFIG.speed;this.setSpeed(CONFIG.speed);
      Object.assign(o.meter,{achievement:false,flashTimer:0,flashIterations:0,digits:'00000',paint:true});
      o.obstacles=[];o.horizon.x=[0,600];
      o.night.phase=0;o.night.opacity=0;this.nightUpdate(false);
      this.resetTrex();
      Object.assign(o.panel,{frame:0,timer:0,shownFrames:0});
    }
    advanceTail(dt=FRAME_MS) {
      // Presentation only after the phase ends: no collisions, clears, or new spawns.
      const o=this.o,travel=Math.floor(o.speed*60/1000*dt);
      for(const obstacle of o.obstacles)obstacle.x-=travel;
      o.obstacles=o.obstacles.filter(obstacle=>obstacle.x+obstacle.width>0);
    }
    recoverContact() {
      // Later-lap session damage is owned by game.js, not Chromium's free-attempt reset.
      const o=this.o;o.obstacles.shift();o.playing=true;o.crashed=false;o.crashMs=0;
      this.resetTrex();
    }
    // --- Simulation ------------------------------------------------------------------
    setStatus(status) {
      const t=this.o.trex;t.status=status;t.frameIndex=0;
      if(status==='waiting'){t.blinkStart=this.o.clock;t.blinkDelay=Math.ceil(this.random()*7000);}
    }
    startJump() {
      const t=this.o.trex;
      this.setStatus('jumping');
      t.v=TREX.initialVelocity-this.o.speed/10;t.jumping=true;t.reachedMin=false;
    }
    endJump() { const t=this.o.trex; if(t.reachedMin&&t.v<TREX.dropVelocity)t.v=TREX.dropVelocity; }
    resetTrex() {
      const t=this.o.trex;
      Object.assign(t,{x:t.xInitial,y:TREX.groundY,v:0,jumping:false});
      this.setStatus('running');t.jumpCount=0;
    }
    updateJump(dt) {
      const t=this.o.trex, frames=dt/ANIM[t.status].ms;
      t.y+=Math.round(t.v*frames);t.v+=TREX.gravity*frames;
      if(t.y<TREX.minJump)t.reachedMin=true;
      if(t.y<TREX.maxJump)this.endJump();
      if(t.y>TREX.groundY){this.resetTrex();t.jumpCount++;return true;}
      return false;
    }
    trexUpdate(dt) {
      const o=this.o,t=o.trex,anim=ANIM[t.status];
      t.timer+=dt;
      if(o.playingIntro&&t.x<TREX.startX){t.x+=Math.round(TREX.startX/TREX.introDuration*dt);t.xInitial=t.x;}
      if(t.status==='waiting') {
        if(o.clock-t.blinkStart>=t.blinkDelay) {
          t.shown=anim.frames[t.frameIndex];
          if(t.frameIndex===1){t.blinkDelay=Math.ceil(this.random()*7000);t.blinkStart=o.clock;t.blinkCount++;}
        }
      } else t.shown=anim.frames[t.frameIndex];
      if(t.timer>=anim.ms){t.frameIndex=t.frameIndex===anim.frames.length-1?0:t.frameIndex+1;t.timer=0;}
    }
    idle(dt) {
      // Chromium keeps its loop alive only for the first three idle blinks.
      const o=this.o;
      if(o.playing||o.trex.blinkCount>=3) return;
      o.clock+=dt;this.trexUpdate(dt);
    }
    addCloud() { this.o.clouds.push({x:this.width,y:this.rand(30,71),gap:this.rand(100,400)}); }
    placeStars() {
      // Chromium passes the canvas HEIGHT as the night layer's width; preserved.
      const segment=Math.round(HEIGHT/2);
      this.o.night.stars=[0,1].map(i=>({x:this.rand(segment*i,segment*(i+1)),y:this.rand(0,70),i}));
    }
    nightUpdate(active) {
      const n=this.o.night;
      if(active&&n.opacity===0){n.phase++;if(n.phase>=MOON_PHASES.length)n.phase=0;}
      if(active&&(n.opacity<1||n.opacity===0))n.opacity+=.035;
      else if(n.opacity>0)n.opacity-=.035;
      if(n.opacity>0) {
        n.x=n.x<-20?HEIGHT:n.x-.25;
        if(n.drawStars)for(const star of n.stars)star.x=star.x<-20?HEIGHT:star.x-.3;
      } else {n.opacity=0;this.placeStars();}
      n.drawStars=true;
    }
    addObstacle() {
      const o=this.o;
      for(let guard=0;guard<50;guard++) {
        const type=OBSTACLES[this.rand(0,2)];
        let duplicate=0;
        for(const old of o.history)duplicate=old===type.type?duplicate+1:0;
        if(duplicate>=CONFIG.maxObstacleDuplication||o.speed<type.minSpeed) continue;
        let size=this.rand(1,3);
        if(size>1&&type.multipleSpeed>o.speed)size=1;
        const width=type.width*size;
        const boxes=type.boxes.map(b=>b.slice());
        if(size>1){boxes[1][2]=width-boxes[0][2]-boxes[2][2];boxes[2][0]=width-boxes[2][2];}
        const minGap=Math.round(width*o.speed+type.minGap*CONFIG.gapCoefficient);
        o.obstacles.push({type:type.type,size,width,height:type.height,x:this.width+type.width,y:type.yPos,boxes,
          gap:this.rand(minGap,Math.round(minGap*1.5)),following:false,passed:false,id:++o.serial});
        o.history.unshift(type.type);o.history.splice(CONFIG.maxObstacleDuplication);
        return;
      }
    }
    horizonUpdate(dt,updateObstacles,night) {
      const o=this.o,h=o.horizon;
      const increment=Math.floor(o.speed*(60/1000)*dt);
      const line=h.x[0]<=0?0:1, other=line?0:1;
      h.x[line]-=increment;h.x[other]=h.x[line]+600;
      if(h.x[line]<=-600){h.x[line]+=1200;h.x[other]=h.x[line]-600;h.src[line]=this.random()>.5?600:0;}
      this.nightUpdate(night);
      const cloudSpeed=CONFIG.bgCloudSpeed/1000*dt*o.speed;
      if(!o.clouds.length)this.addCloud();
      else {
        for(let i=o.clouds.length-1;i>=0;i--)o.clouds[i].x-=Math.ceil(cloudSpeed);
        const last=o.clouds[o.clouds.length-1];
        if(o.clouds.length<CONFIG.maxClouds&&this.width-last.x>last.gap&&CONFIG.cloudFrequency>this.random())this.addCloud();
        o.clouds=o.clouds.filter(c=>c.x+46>0);
      }
      if(updateObstacles) {
        for(const obstacle of o.obstacles)obstacle.x-=Math.floor(o.speed*60/1000*dt);
        o.obstacles=o.obstacles.filter(obstacle=>obstacle.x+obstacle.width>0);
        const last=o.obstacles[o.obstacles.length-1];
        if(!last)this.addObstacle();
        else if(!last.following&&last.x+last.width+last.gap<this.width){this.addObstacle();last.following=true;}
      }
    }
    collides(obstacle) {
      const t=this.o.trex;
      const a=[t.x+1,t.y+1,TREX.width-2,TREX.height-2], b=[obstacle.x+1,obstacle.y+1,obstacle.width-2,obstacle.height-2];
      const hit=(p,q)=>p[0]<q[0]+q[2]&&p[0]+p[2]>q[0]&&p[1]<q[1]+q[3]&&p[3]+p[1]>q[1];
      if(!hit(a,b)) return false;
      for(const tb of RUNNING_BOXES)for(const ob of obstacle.boxes)
        if(hit([tb[0]+a[0],tb[1]+a[1],tb[2],tb[3]],[ob[0]+b[0],ob[1]+b[1],ob[2],ob[3]])) return true;
      return false;
    }
    meterUpdate(dt) {
      const m=this.o.meter;let reached=false;m.paint=true;
      if(!m.achievement) {
        const distance=Math.round(Math.ceil(this.o.distanceRan)*.025);
        if(distance>0) {
          if(distance%100===0){m.achievement=true;m.flashTimer=0;reached=true;}
          m.digits=('00000'+distance).slice(-5);
        } else m.digits='00000';
      } else if(m.flashIterations<=3) {
        m.flashTimer+=dt;
        if(m.flashTimer<250)m.paint=false;
        else if(m.flashTimer>500){m.flashTimer=0;m.flashIterations++;}
      } else {m.achievement=false;m.flashIterations=0;m.flashTimer=0;}
      return reached;
    }
    // One Chromium frame. Returns gameplay events for game.js to interpret.
    frame(dt=FRAME_MS) {
      const o=this.o,t=o.trex,events={landed:false,cleared:0,crashed:false,reached:false};
      if(!o.playing&&!o.crashed){this.idle(dt);return events;}
      if(o.crashed) {
        o.crashMs+=dt;const p=o.panel;p.timer+=dt;
        if(p.frame===0&&p.timer>875){p.timer=0;p.frame++;}
        else if(p.frame>0&&p.frame<8&&p.timer>=875/8)p.frame++;
        p.shownFrames=Math.max(p.shownFrames,Math.min(p.frame,7));
        return events;
      }
      o.clock+=dt;
      if(t.jumping&&this.updateJump(dt))events.landed=true;
      o.runningTime+=dt;
      const hasObstacles=o.runningTime>CONFIG.clearTime;
      if(t.jumpCount===1&&!o.playingIntro&&!o.activated){o.playingIntro=true;o.activated=true;o.introMs=0;}
      let delta=dt;
      if(o.playingIntro)this.horizonUpdate(0,hasObstacles,false);
      else {delta=o.activated?dt:0;this.horizonUpdate(delta,hasObstacles,this.dark);}
      const first=o.obstacles[0];
      if(hasObstacles&&first&&this.collides(first)) {
        o.playing=false;o.crashed=true;o.crashMs=0;o.crashes++;
        this.setStatus('crashed');t.shown=ANIM.crashed.frames[0];
        Object.assign(o.panel,{frame:0,timer:0,shownFrames:0});
        if(o.distanceRan>o.meter.highest){o.meter.highest=o.distanceRan;o.meter.high='HI '+('00000'+Math.round(Math.ceil(o.distanceRan)*.025)).slice(-5);}
        this.meterUpdate(delta);
        events.crashed=true;return events;
      }
      o.distanceRan+=o.speed*delta/FRAME_MS;
      if(o.speed<(this.maxSpeed||CONFIG.maxSpeed))o.speed=Math.min(this.maxSpeed||CONFIG.maxSpeed,o.speed+CONFIG.acceleration);
      events.reached=this.meterUpdate(delta);
      this.trexUpdate(delta);
      // Chromium starts the game on the intro's animationend; here at its 400 ms end.
      if(o.playingIntro){o.introMs+=dt;if(o.introMs>=400){o.playingIntro=false;o.runningTime=0;}}
      for(const obstacle of o.obstacles) if(!obstacle.passed&&obstacle.x+obstacle.width<t.x) {
        obstacle.passed=true;if(t.jumping)events.cleared++;
      }
      return events;
    }
    // --- Drawing (Chromium order: horizon, night, clouds, obstacles, meter, T-rex) ---
    blit(sx,sy,sw,sh,dx,dy,dw,dh) {
      const k=this.k;
      this.ctx.drawImage(this.sheet,sx,sy,sw*k,sh*k,dx,dy,dw,dh);
    }
    draw() {
      const c=this.ctx,o=this.o;
      if(!o)return;
      this.applyContainer();
      if(!this.ready)return;
      const sp=this.sprites,k=this.k;
      c.setTransform(this.ratio,0,0,this.ratio,0,0);c.globalAlpha=1;
      c.clearRect(0,0,this.width,HEIGHT);
      if(!this.hideRunner) for(let i=0;i<2;i++)
        c.drawImage(this.sheet,2*k+o.horizon.src[i],52*k,600*k,12*k,o.horizon.x[i],127,600,12);
      const n=o.night;
      if(n.opacity>0) {
        c.globalAlpha=n.opacity;
        if(n.drawStars)for(const star of n.stars)c.drawImage(this.sheet,sp.star.x,sp.star.y+9*k*star.i,9*k,9*k,Math.round(star.x),star.y,9,9);
        const wide=n.phase===3?40:20;
        c.drawImage(this.sheet,sp.moon.x+MOON_PHASES[n.phase]*k,sp.moon.y,wide*k,40*k,Math.round(n.x),30,wide,40);
        c.globalAlpha=1;
      }
      for(const cloud of o.clouds)this.blit(sp.cloud.x/k,sp.cloud.y/k,46,14,cloud.x,cloud.y,46,14);
      for(const obstacle of o.obstacles) {
        const pos=sp[obstacle.type],w=obstacle.width/obstacle.size;
        c.drawImage(this.sheet,w*k*obstacle.size*(.5*(obstacle.size-1))+pos.x,pos.y,w*k*obstacle.size,obstacle.height*k,obstacle.x,obstacle.y,obstacle.width,obstacle.height);
      }
      const digit=(i,value,x)=>c.drawImage(this.sheet,10*value*k+sp.text.x,sp.text.y,10*k,13*k,x+i*11,10,10,13);
      if(o.meter.paint||!o.playing&&!o.crashed)for(let i=0;i<5;i++)digit(i,+o.meter.digits[i],o.meterX);
      if(o.started) {
        c.globalAlpha=.8;
        for(let i=0;i<o.meter.high.length;i++){const ch=o.meter.high[i],v=ch==='H'?10:ch==='I'?11:parseInt(ch,10);if(!isNaN(v))digit(i,v,o.meterX-100);}
        c.globalAlpha=1;
      }
      if(!this.hideRunner) c.drawImage(this.sheet,o.trex.shown*k+sp.tRex.x,sp.tRex.y,44*k,47*k,o.trex.x,o.trex.y,44,47);
      if(o.crashed) {
        c.drawImage(this.sheet,sp.text.x,13*k+sp.text.y,191*k,11*k,Math.round(this.width/2-95.5),Math.round((HEIGHT-25)/3),191,11);
        for(let f=0;f<=o.panel.shownFrames;f++)c.drawImage(this.sheet,sp.restart.x+36*f*k,sp.restart.y,36*k,32*k,this.width/2-16,HEIGHT/2,36,32);
      }
    }
    // Screen geometry of the visible runner, for the continuous handoff.
    geometry() {
      const rect=this.canvas.hidden?this.fallback.getBoundingClientRect():this.canvas.getBoundingClientRect();
      const t=this.o.trex;
      return {left:rect.left,top:rect.top,width:this.width,containerWidth:this.containerWidth(),
        heroLeft:rect.left+t.x,heroTop:rect.top+t.y,heroWidth:TREX.width,heroHeight:TREX.height,
        groundY:rect.top+134,lineY:rect.top+133,horizonX:this.o.horizon.x.slice(),horizonSrc:this.o.horizon.src.slice(),ratio:this.ratio,hidpi:this.hidpi};
    }
    snapshot() {
      const o=this.o,t=o.trex,next=o.obstacles.find(ob=>!ob.passed);
      return {state:o.crashed?'crashed':!o.playing?'idle':!o.activated?'first-jump':o.playingIntro?'intro':'running',
        ready:this.ready,sheet:this.sheetStatus,width:this.width,containerWidth:this.containerWidth(),ratio:this.ratio,hidpi:this.hidpi,
        speed:o.speed,distanceRan:o.distanceRan,meter:o.meter.digits,high:o.meter.high,runningTime:o.runningTime,introMs:o.introMs,
        attempts:o.attempts,crashes:o.crashes,crashMs:o.crashMs,
        trex:{x:t.x,y:t.y,v:t.v,jumping:t.jumping,status:t.status,frame:t.shown,blinks:t.blinkCount},
        nextObstacle:next?{type:next.type,size:next.size,x:next.x,gapToTrex:next.x-(t.x+TREX.width)}:null,
        obstacles:o.obstacles.map(ob=>({type:ob.type,size:ob.size,x:ob.x,passed:ob.passed})),
        clouds:o.clouds.length,night:o.night.opacity};
    }
  }
  ChromeOpening.TREX = TREX;
  ChromeOpening.FRAME_MS = FRAME_MS;
  window.ChromeOpening = ChromeOpening;
})();
