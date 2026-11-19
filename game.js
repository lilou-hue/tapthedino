(() => {
  'use strict';
  const game = document.getElementById('game');
  const root = document.documentElement;
  const opening = document.getElementById('chrome-opening');
  const openingBody = opening.querySelector('.chrome-body');
  const openingMessage = opening.querySelector('.chrome-message');
  // Match Chrome's current offline instruction, including touch/hybrid devices.
  const instruction = document.getElementById('chrome-instruction');
  if(navigator.maxTouchPoints>0) instruction.textContent=matchMedia('(hover: hover)').matches
    ? 'Tap the dino or press space to play' : 'Tap the dino to play';
  const platform = navigator.platform;
  if(platform.startsWith('Mac')) opening.style.fontFamily='"Helvetica Neue", Helvetica, Arial, sans-serif';
  else if(platform.startsWith('Win')) opening.style.fontFamily='"Segoe UI", Tahoma, sans-serif';
  const pausePanel = document.getElementById('pause-panel');
  const pauseButton = document.getElementById('pause');
  const lapStatus = document.getElementById('lap-status');
  const chapter = document.getElementById('chapter');
  const mute = document.getElementById('mute');
  const bank = document.getElementById('bank');
  const health = document.getElementById('health');
  const hearts = health.querySelector('.hearts');
  const healthCue = health.querySelector('.health-cue');
  const card = document.getElementById('end');
  const bestKey = 'a1NoInternetBest', SHARE_URL = 'https://tapthedino.com/';
  const params = new URLSearchParams(location.search);
  const debugMode = params.has('debug');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const STEP = 1 / 120, BEAT = 60 / 136, MAX_HEALTH = 3, RECOVERY = .35;
  // Lap one's flat view: Chromium's 47px T-rex is the hero's 2.2 world units.
  const UNIT = 47 / 2.2, RUN_FRAMES = [88,132];
  const WORLD_SPEED = 11.2, APPROACH = 1.35;
  const EXTREME = {activeDuration:4.5,minPresses:18};
  // Authored long/short rhythms, rotated by scene and lap; never stacked spawns.
  // Even at the speed cap, 1 s leaves ~.14 s after the unchanged jump arc.
  const GAP_RHYTHMS = [
    [1.05,1.5,1.2,1.65], [1.4,1.1,1.6,1.25],
    [1.65,1.2,1.45,1.05], [1.15,1.55,1.05,1.4]
  ];
  // Contact intervals are authored seconds, never divided by the lap multiplier.
  const NORMAL = {jump:7.7,gravity:18,buffer:.16,airAction:'none'};
  const BODY_HEIGHT = (41-.5)/(47/2.2);
  const PHRASES = {
    track:{...NORMAL,target:6,deadline:14,minimum:10,next:'corkscrew',rhythm:0},
    corkscrew:{...NORMAL,target:4,next:'jelly',intervals:[2.15,2.15,2.15],cells:4,
      turnDuration:.70,reducedTurnDuration:.90,settledDuration:.16,hint:'LAND TO TURN · JUMP AWAY FROM THE FLOOR'},
    jelly:{...NORMAL,jump:10,gravity:12,buffer:0,airAction:'slam',slamVelocity:-16,
      target:6,next:'dream',cells:6,intervals:[1.45],members:[0,.65],
      bodyHeight:BODY_HEIGHT,ceilingClearance:.8,ceilingHeight:BODY_HEIGHT+.8,
      hint:'TAP TO BOUNCE · TAP AGAIN TO DROP'},
    dream:{...NORMAL,target:6,next:'desktop',cells:6,intervals:[1.10,1.80,1.10,1.80,1.10],
      hint:'TWO JUMPS · TAKE A BREATH'},
    // The original desktop: six earned windows, 9.5/11 s, rhythm row 3.
    desktop:{...NORMAL,target:6,deadline:11,minimum:9.5,next:'crash',rhythm:3,firstSpawn:.15},
    moon:{...NORMAL,jump:6,gravity:5,buffer:0,target:6,next:'extreme',cells:3,
      intervals:[3],members:[0,.75],hint:'ONE FLOAT · TWO CACTI'}
  };
  // The original stampede: a fixed 16 s build, spawner open through 13.5 s,
  // nine-clear target and explicit rhythm row 4 (not an array-position index).
  const STAMPEDE = {...NORMAL,target:9,rhythm:4,build:16,spawnUntil:13.5,firstSpawn:.15};
  const stage = scene => PHRASES[scene] || (scene==='stampede'?STAMPEDE:null);
  const physics = () => stage(s.scene) || NORMAL;
  const clamp = (n,a=0,b=1) => Math.max(a,Math.min(b,n));
  const smooth = n => (n=clamp(n),n*n*(3-2*n));
  const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const store = (key,value) => { try { localStorage.setItem(key,String(value)); } catch { /* Private browsing still plays. */ } };
  let muted = stored('a1NoInternetMuted') === '1';
  const renderer = new DinoRenderer(game);
  const audio = new DinoAudio(muted);
  const seed = debugMode && params.has('seed') ? Number(params.get('seed'))|0 : null;
  const runner = new ChromeOpening(document.getElementById('runner'), document.getElementById('runner-canvas'), opening.querySelector('.chrome-dino'), seed);
  runner.onSheet=(key,image)=>renderer.setChromeSheet(key,image);
  let s, accumulator=0, last=performance.now(), paused=document.hidden, runSerial=0, cardShownAt=0, frozen=false, debugUsed=false;
  let userPaused=false, focusPaused=document.hidden;
  let frameCount=0, frameSum=0, slowFrames=0, renderSum=0;

  function hudBand() {
    // The canvas score shares the DOM Pause/hearts band (safe area and touch size).
    const style=getComputedStyle(health);
    renderer.hudTop=parseFloat(style.top)||12;renderer.hudSize=parseFloat(style.height)||36;
    renderer.hudRight=parseFloat(getComputedStyle(pauseButton).left)||12;
  }
  function theme() {
    const dark=darkQuery.matches;
    runner.dark=dark;renderer.chrome.hidpi=devicePixelRatio>1;
    renderer.theme={dark,page:dark?[32,33,36]:[255,255,255],ink:dark?[172,172,172]:[83,83,83]};
  }
  // Lap one's offline phase IS the page's runner; no other game surface exists yet.
  const inOpening = () => (s.mode==='idle' || s.scene==='offline' || s.scene==='breath');
  const inHandoff = () => (s.scene==='rupture' || s.scene==='extrusion');
  const phase = () => inOpening()?'opening':inHandoff()?'handoff':s.scene==='collapse'?'fold':'game';

  function dismissCard() { card.hidden=true; }
  function reset() {
    dismissCard(); audio.pause();audio.setExtreme(false);
    s = {
      mode:'idle', scene:'offline', previousScene:'offline', sceneTime:0, simTime:0, beat:0,
      speed:WORLD_SPEED, speedMultiplier:1, approachTTC:APPROACH, distance:0, score:0, combo:0, multiplier:1, success:0, target:3,
      health:MAX_HEALTH, maxHealth:MAX_HEALTH, recovery:0,
      lap:1, variant:0, lapEarned:0, lapScore:0, banked:false, effects:[], impact:0, burst:0, waveTime:-100,
      earned:0, fallback:0, transitions:[], projectionBlend:0, extrusion:0,
      obstacles:[], clearedTail:[], monuments:[], windows:[], city:[], echoes:1, cascadeCount:0, pending:0, nextSpawn:2.7, serial:0, phraseSpawn:0,
      sceneDistance:0, worldRoll:0,rollFrom:0,rollTarget:0,rollTime:1,rollRest:0,spawnStopped:false,stageConfig:null, morph:0, morphTarget:0, lastJumpTime:-100, finalInput:false, finalJumpTime:0, finalJumpSerial:null,
      dropAt:0, extreme:null, extremeCleared:false, inputCount:0,
      player:{height:0,velocity:0,grounded:true,buffer:0,stumble:0,jumps:0,slam:false},
      completion:null, reported:false, debugAssisted:debugMode&&(seed!==null||debugUsed), reducedMotion,
      run:++runSerial, previousBest:Number(stored(bestKey))||0,
      // Opening/handoff bookkeeping (lap one only).
      ticks:0, chromeJump:false, revealAt:null, flatAnchor:null, handoffAt:null, heroFrame:RUN_FRAMES[0], heroIndex:0, heroTimer:0, openingCrashes:0
    };
    opening.hidden=false;runner.hideRunner=false;runner.layout();runner.maxSpeed=8.3;runner.reset();warmRenderer();
    accumulator=0; last=performance.now();
    chapter.textContent='';root.dataset.spatial='false';root.dataset.scene='offline';
    present(0);
  }
  function warmRenderer() {
    // Allocate the handoff's integer-ratio buffers and compile one hidden frame while the
    // page is idle, so the rupture's first real frame does no reallocation.
    const run=()=>{if(s&&inOpening()){renderer.setNative(Math.floor(devicePixelRatio)||1);renderer.draw(s);}};
    if(window.requestIdleCallback)requestIdleCallback(run,{timeout:1000});else setTimeout(run,100);
  }
  function bankState() {
    // Explicit banking is also available while paused; it never resumes audio.
    const disabled=s.mode!=='running' || s.revealAt===null || s.score<=0 || s.banked || s.debugAssisted;
    if(bank.disabled!==disabled)bank.disabled=disabled;
  }
  function healthState() {
    const cue=s.completion==='death'?'RUN ENDED':s.recovery>0?'RECOVERING':'';
    const label=`${s.health} of ${s.maxHealth} hearts${cue?', '+cue.toLowerCase():''}`;
    if(health.getAttribute('aria-label')===label)return;
    health.setAttribute('aria-label',label);
    health.dataset.recovering=String(s.recovery>0);
    hearts.textContent='♥'.repeat(s.health)+'♡'.repeat(s.maxHealth-s.health);
    healthCue.textContent=cue;
  }
  function nextLap() {
    if(s.mode!=='running' || s.health<=0 || s.scene!=='breath' || !s.extremeCleared) return;
    s.health=Math.min(s.maxHealth,s.health+1);
    // Session identity, time, score, earned totals and captured best survive the breath.
    s.lap++;s.variant=(s.lap-1)%3;
    s.speedMultiplier=Math.min(1.8,1+.18*(s.lap-1));s.speed=WORLD_SPEED*s.speedMultiplier;
    s.approachTTC=Math.max(.95,APPROACH/s.speedMultiplier);
    Object.assign(s,{success:0,target:2,lapEarned:0,lapScore:0,nextSpawn:.65,
      pending:0,combo:0,multiplier:1,morph:0,morphTarget:0,echoes:1,cascadeCount:0,
      finalInput:false,finalJumpTime:0,finalJumpSerial:null,extreme:null,extremeCleared:false,dropAt:0,
      impact:0,burst:0,waveTime:-100,lastJumpTime:-100});
    s.obstacles.length=0;s.monuments.length=0;s.windows.length=0;s.city.length=0;s.effects.length=0;
    Object.assign(s.player,{height:0,velocity:0,grounded:true,buffer:0,stumble:0});
    s.clearedTail.length=0;s.chromeJump=false;s.ticks=0;s.flatAnchor=null;
    enter('offline','lap');
    runner.maxSpeed=8.3;runner.setSpeed(Math.min(8.3,6*s.speedMultiplier));
    // The quiet, original idle page has already breathed; subsequent laps start themselves.
    if(runner.ready){runner.jump();s.player.jumps++;audio.chrome('press');s.revealAt=s.simTime;}
  }
  function begin() {
    // The first input starts the visible idle dinosaur; nothing else changes on screen.
    s.mode='running';audio.unlock();
  }
  function action() {
    // Non-play beats (the desktop crash and the coalescence) take no new jumps, so
    // no airborne state is carried across their timed exits into another gravity.
    if(paused || document.hidden || s.mode==='complete' || ['crash','coalesce','collapse','breath'].includes(s.scene)) return;
    // Like Chromium, the runner cannot start before its sprites exist (no invisible hazards).
    if(s.mode==='idle') {if(!runner.ready)return;begin();}
    if(audio.context?.state!=='running') audio.unlock();
    if(inOpening()) {
      if(runner.o.crashed) return;
      const events=runner.jump();
      if(events.jumped){s.player.jumps++;s.lastJumpTime=s.simTime;s.player.grounded=false;audio.chrome('press');}
      return;
    }
    // While the page's sprite is still the hero, it keeps the page's jump and sound.
    if(chromeArc()) {
      if(s.player.grounded && !s.chromeJump) {
        runner.startJump();s.chromeJump=true;s.player.grounded=false;s.player.jumps++;s.lastJumpTime=s.simTime;audio.chrome('press');
      }
      return;
    }
    // Fresh presses only: the input layer rejects held/repeated events.
    s.inputCount++;
    if(s.scene==='extreme') {
      audio.fart();
      const e=s.extreme;
      s.effects.push({age:0,z:e.visualZ*.45,height:e.visualHeight,puff:true,big:false,seed:s.inputCount});
      if(s.effects.length>8)s.effects.shift();
      if(e.phase!=='rewind')e.puff=s.effects[s.effects.length-1];
      if(e.phase==='active') {
        e.acceptedPresses++;e.boostAt=s.sceneTime;
        if(e.firstPress===null)e.firstPress=e.time;
        // An 8-unit/second ascent envelope makes late bursts fail visibly, not via a hidden time gate.
        s.player.height=Math.min(30,1.35+8*(e.time-e.firstPress),s.player.height+1.35);
        s.player.velocity=Math.min(7,s.player.velocity+4.5);
        s.player.grounded=false;s.player.jumps++;s.lastJumpTime=s.simTime;
      }
      return;
    }
    const cfg=physics(),p=s.player;
    if(!p.grounded && cfg.airAction==='slam') {
      p.buffer=0;
      if(!p.slam){
        p.slam=true;p.velocity=cfg.slamVelocity;audio.stageAction('slam');
        s.effects.push({age:0,z:0,scene:s.scene,slam:true,seed:s.inputCount});
        if(s.effects.length>8)s.effects.shift();
      }
      return;
    }
    if(!p.grounded && !cfg.buffer)return;
    p.buffer=p.grounded?Math.max(STEP,cfg.buffer):cfg.buffer;
    jumpIfReady();
  }
  const chromeArc = () => (s.scene==='rupture' || (s.scene==='extrusion' && s.extrusion<.025));
  function release(key) {
    if(!s || paused) return;
    if(s.chromeJump){if(key!=='Enter')runner.endJump();return;}
    if(!inOpening() || s.scene==='breath') return;
    const o=runner.o;
    if(o.crashed) {if(runner.canRetry(key))retryOpening();}
    else if(key!=='Enter') runner.release();
  }
  function retryOpening() {
    // Chromium's in-place restart; this attempt's clears (and their score) are discarded.
    if(s.lap!==1)return;
    runner.restart();audio.chrome('press');
    Object.assign(s,{success:0,pending:0,score:0,lapScore:0,earned:0,lapEarned:0,combo:0,multiplier:1,sceneTime:0,ticks:0});
    Object.assign(s.player,{height:0,velocity:0,grounded:true,buffer:0,stumble:0});
  }
  function jumpIfReady() {
    const p=s.player;
    if(p.buffer<=0 || !p.grounded) return;
    p.buffer=0; p.grounded=false; p.velocity=physics().jump; p.slam=false; p.jumps++;
    s.lastJumpTime=s.simTime;audio.jump(s.scene==='offline',s.scene);
  }
  function anchorFromRunner() {
    // Snap to device pixels as the compositor does for the runner canvas itself.
    const g=runner.geometry(),a=s.flatAnchor,d=devicePixelRatio||1,snap=n=>Math.round(n*d)/d;
    a.left=snap(g.left);a.width=s.scene==='collapse'?g.containerWidth:g.width;a.cx=a.left+a.heroX+22;a.cy=snap(g.top)+134;
  }
  function beginHandoff() {
    // Transfer the live runner geometry: same hero, same ground row, same horizon texture.
    const t=runner.o.trex,g=runner.geometry();
    s.flatAnchor={scale:UNIT,heroX:t.x,horizonX:g.horizonX,horizonSrc:g.horizonSrc,distance:s.distance,left:0,width:0,cx:0,cy:0};
    anchorFromRunner();
    s.heroIndex=t.status==='running'?t.frameIndex:0;s.heroTimer=t.status==='running'?t.timer:0;
    s.heroFrame=RUN_FRAMES[s.heroIndex];s.handoffAt=s.simTime;s.ticks=0;s.chromeTailTime=0;
    runner.hideRunner=true;
    renderer.setNative(Math.floor(devicePixelRatio)||1);
  }
  function enter(scene, reason) {
    if(reason) {
      s.transitions.push({from:s.scene,to:scene,reason,success:s.success,time:s.simTime,lap:s.lap});
      if(s.transitions.length>48)s.transitions.shift();
      if(reason==='deadline') s.fallback++;
    }
    audio.setExtreme(scene==='extreme');
    s.previousScene=s.scene;s.scene=scene;s.sceneTime=0;s.sceneDistance=0;
    // Only cleared geometry survives a phrase boundary; it has no collision/score path.
    s.clearedTail.push(...s.obstacles.filter(o=>o.clear && !o.hit).map(o=>({...o})));
    if(s.clearedTail.length>8)s.clearedTail.splice(0,s.clearedTail.length-8);
    s.obstacles.length=0;s.pending=0;s.phraseSpawn=0;s.spawnStopped=false;
    s.stageConfig=stage(scene);
    if(s.player.grounded){s.player.buffer=0;s.player.slam=false;}
    s.worldRoll=0;s.rollFrom=0;s.rollTarget=0;s.rollTime=1;s.rollRest=0;
    // A phrase-ending landing still gets its brief response through the handoff.
    // Keep only genuine earned feedback; deadlines and non-play transitions reset it.
    if(reason!=='earned' || s.impact<=0){s.effects.length=0;s.impact=0;s.burst=0;}
    if(scene==='rupture') {
      s.dropAt=Math.ceil((s.simTime+1.2)/BEAT)*BEAT;
      audio.stopVoices();
      beginHandoff();
    } else if(scene==='extrusion') {
      s.monuments=[{z:28,side:-1,scale:7,age:0},{z:43,side:1,scale:9,age:0}];
    } else if(PHRASES[scene]) {
      s.success=0;s.target=PHRASES[scene].target;s.nextSpawn=scene==='track'?.65:PHRASES[scene].firstSpawn??1;
      s.morphTarget=0;
      if(scene==='track'){s.flatAnchor=null;if(s.revealAt===null)s.revealAt=s.simTime;}
      if(scene==='desktop'){s.windows.length=0;s.morph=0;}
      // After the coalescence, the moon starts from one body: no echoes, city or windows.
      if(scene==='moon'){s.echoes=1;s.city.length=0;s.windows.length=0;}
    } else if(scene==='crash') {
      s.target=0;audio.stopVoices();
    } else if(scene==='stampede') {
      s.success=0;s.target=STAMPEDE.target;s.nextSpawn=STAMPEDE.firstSpawn;s.echoes=1;s.waveTime=-100;
      s.city=Array.from({length:24},(_,i)=>({id:i,z:18+i*9,brokenAt:null,height:5+(i%4)*2}));
    } else if(scene==='coalesce') {
      s.target=0;s.success=0;audio.stopVoices();
    } else if(scene==='extreme') {
      // Straight from the grounded moon exit into the existing 1.5 s READY.
      s.finalInput=false;s.extremeCleared=false;s.target=1;s.success=0;
      Object.assign(s.player,{height:0,velocity:0,grounded:true,buffer:0});
      s.morph=0;s.morphTarget=0;s.monuments.length=0;s.effects.length=0;s.impact=0;s.burst=0;
      s.extreme={...EXTREME,phase:'ready',time:0,targetHeight:24,ttc:EXTREME.activeDuration,acceptedPresses:0,
        firstPress:null,firstCross:null,forwardCues:[],hit:false,progress:0,cleared:false,contact:false,cactusZ:24,
        caption:'MASH FAST · 1.5s · TAPS START AT GO',cue:-1,
        rewindPosition:0,history:[[0,24,0,0,10,10,0,0,0]],sample:0,visualHeight:0,visualZ:0,pose:0,
        boostAt:-100,recoilAge:10,puff:null};
      audio.stopVoices();
    } else if(scene==='collapse') {
      s.success=1;s.target=1;s.player.buffer=0;s.revealAt=null;s.chromeJump=false;
      // Hidden DOM has no geometry: reveal transparently, lay out, then acquire the true idle anchor.
      opening.hidden=false;root.dataset.phase='fold';openingBody.style.opacity='0';
      runner.hideRunner=true;runner.layout();runner.reset();beginHandoff();
      s.heroFrame=0;anchorFromRunner();
    } else if(scene==='breath') {
      s.extrusion=0;s.projectionBlend=0;audio.stopVoices();
    }
    const names={extrusion:'01 · The other side',track:'01 · The other side',corkscrew:'02 · Inside out',jelly:'03 · Soft landing',
      dream:'04 · Something remembers',desktop:'05 · Dinosaur OS',stampede:'06 · Every one of us',moon:'07 · A little space'};
    chapter.textContent=names[scene]||'';
    root.dataset.spatial=String(!['offline','rupture','breath'].includes(scene));
    root.dataset.scene=scene;
  }
  function successfulTransformation() {
    if(s.scene==='track') growMonument();
    else if(s.scene==='dream') s.morphTarget=s.success;
    else if(s.scene==='desktop') {
      // Each earned desktop clear opens a stack of five windows (bounded pool).
      s.morphTarget=s.success;
      for(let i=0;i<5;i++) s.windows.push({x:(i%2?-1:1)*(3.7+i*.6),y:i*.55,z:8+i*2.4,age:-i*.09,seed:s.success*5+i});
      if(s.windows.length>24)s.windows.splice(0,s.windows.length-24);
    } else if(s.scene==='stampede') {
      // Earned echoes double the pack (cap 32/40) and break the next three towers.
      s.echoes=Math.min(s.variant?40:32,2**s.success);s.waveTime=s.simTime;
      const targets=s.city.filter(t=>t.z>0 && t.brokenAt===null).slice(0,3);
      targets.forEach((t,i)=>{t.brokenAt=s.simTime+i*(s.echoes===32?.95:.22);});
      s.cascadeCount+=targets.length;
    }
  }
  function growMonument() {
    const side=s.success%2?-1:1;
    // A finite pool. Each earned landing makes a new piece of the world.
    if(s.monuments.length>=8) s.monuments.shift();
    s.monuments.push({z:17+s.success*1.5,side,scale:6+Math.min(s.success,4)*1.5,age:0});
  }
  function landed() {
    if(s.mode!=='running') return;
    if(!s.pending) return;
    // The page's runner has no clear chime, ring or impact; only the hidden count moves.
    const quiet=inOpening();
    const count=s.pending;s.pending=0;let big=false;
    for(let i=0;i<count;i++) {
      s.success++;s.earned++;s.lapEarned++;s.combo++;
      s.multiplier=Math.min(3,1+Math.floor(s.combo/3));
      const points=(30+Math.min(s.combo,4)*5)*s.multiplier;
      s.score+=points;s.lapScore+=points;
      if(quiet) continue;
      s.impact=.32;
      big ||= s.combo%3===0 && s.scene!=='offline';
      successfulTransformation();
    }
    // Compound Moon cells earn two credits but ONE landing response. No transport
    // replay: the audio accent is fired here, never by polling the burst state.
    if(!quiet) {
      if(big)s.burst=1.5;
      s.effects.push({age:0,z:0,big,scene:s.scene,seed:s.earned});
      if(s.effects.length>8)s.effects.shift();
      audio.clear(false,s.scene,big,s.variant);
    }
    // One quarter turn per earned LANDING, not per pending obstacle credit.
    if(s.scene==='corkscrew') turnWorld(s.rollTarget+(s.lap%2?1:-1)*Math.PI/2);
    if(s.scene==='offline' && s.success>=s.target) enter('rupture','earned');
  }
  function turnWorld(target) {
    s.rollFrom=s.worldRoll;s.rollTarget=target;s.rollTime=0;s.rollRest=0;
  }
  function obstacles(dt) {
    const cfg=physics(),members=cfg.members||[0];
    s.nextSpawn-=dt;
    if(!s.spawnStopped && s.nextSpawn<=0 && s.obstacles.length+members.length<=5) {
      // Compound cells reserve capacity for BOTH visible members, never half a cell.
      for(let i=0;i<members.length;i++)s.obstacles.push({id:++s.serial,
        z:s.speed*(s.approachTTC+members[i]),kind:s.scene==='jelly'&&i===1?'ceiling':'ground',
        ceilingHeight:cfg.ceilingHeight,ceilingClearance:cfg.ceilingClearance,
        resolved:false,clear:false,hit:false});
      const index=s.phraseSpawn++;
      if(cfg.cells) {
        s.nextSpawn=cfg.intervals[index%cfg.intervals.length];
        if(s.phraseSpawn>=cfg.cells)s.spawnStopped=true;
      } else {
        const stage=cfg.rhythm,rhythm=GAP_RHYTHMS[(stage+s.lap-1)%GAP_RHYTHMS.length];
        s.nextSpawn=Math.max(1,rhythm[(index+stage+s.lap-1)%rhythm.length]/Math.sqrt(s.speedMultiplier));
      }
    }
    for(const o of s.obstacles) {
      o.z-=s.speed*dt;
      const contact=o.kind==='ceiling'?s.player.height>o.ceilingClearance:s.player.height<.58;
      if(!o.resolved && !o.hit && Math.abs(o.z)<.40 && contact) {
        o.hit=true;o.resolved=true;o.clear=false;
        s.combo=0;s.multiplier=1;audio.impact();
        s.obstacles=s.obstacles.filter(item=>item!==o);
        s.clearedTail=s.clearedTail.filter(item=>item.id!==o.id);
        if(s.recovery<=0) {
          s.health=Math.max(0,s.health-1);s.recovery=RECOVERY;s.player.stumble=.42;
          if(s.health===0) {finishRun('death');return;}
        }
      }
      if(!o.resolved && o.z<-.42) {
        o.resolved=true;
        if(o.kind==='ceiling'){o.clear=true;continue;}
        o.clear=!o.hit && !s.player.grounded && s.player.jumps>0;
        if(o.clear) s.pending++;
        else {s.combo=0;s.multiplier=1;s.player.stumble=.42;}
      }
    }
    s.obstacles=s.obstacles.filter(o=>o.z>-8);
  }
  function stepOpening(dt) {
    // Chromium's runner advances at a fixed 60 Hz: one runner frame per two steps.
    if(s.lap>1 && !runner.o.started && runner.ready){runner.jump();s.player.jumps++;s.revealAt=s.simTime;audio.chrome('press');}
    const o=runner.o,tick=++s.ticks%2===0;
    s.recovery=Math.max(0,s.recovery-dt);
    if(o.crashed) {if(tick)runner.frame();return;}
    s.simTime+=dt;s.sceneTime+=dt;s.beat=s.simTime/BEAT;
    let justLanded=false;
    if(tick) {
      const events=runner.frame();
      if(events.crashed) {
        // The attempt ends visibly, in place. No heart, no deadline, no score write.
        s.openingCrashes++;s.combo=0;s.multiplier=1;s.pending=0;audio.impact();
        if(s.lap>1) {
          if(s.recovery<=0){s.health=Math.max(0,s.health-1);s.recovery=RECOVERY;}
          if(s.health===0){finishRun('death');return;}
          runner.recoverContact();
          Object.assign(s.player,{height:0,velocity:0,grounded:true,buffer:0});
          return;
        }
        if(navigator.vibrate && navigator.maxTouchPoints>0 && /Android/.test(navigator.userAgent))navigator.vibrate(200);
        return;
      }
      if(events.reached)audio.chrome('reached');
      s.pending+=events.cleared;justLanded=events.landed;
    }
    const t=o.trex;
    s.player.grounded=!t.jumping;s.player.height=(ChromeOpening.TREX.groundY-t.y)/UNIT;s.player.velocity=-t.v*60/UNIT;
    if(justLanded){landed();if(s.scene!=='offline')return;}
    if(s.sceneTime>=12.5 && s.player.grounded) enter('rupture','deadline');
  }
  function update(dt) {
    if(s.mode==='idle'){if(++s.ticks%2===0)runner.frame();return;}
    if(s.mode!=='running') return;
    if(inOpening() && s.scene!=='breath') {stepOpening(dt);return;}
    s.simTime+=dt;s.sceneTime+=dt;
    for(const o of s.clearedTail)o.z-=s.speed*dt;
    s.clearedTail=s.clearedTail.filter(o=>o.z>-8);
    s.beat=s.simTime/BEAT;
    s.recovery=Math.max(0,s.recovery-dt);
    s.impact=Math.max(0,s.impact-dt);s.burst=Math.max(0,s.burst-dt);
    for(const effect of s.effects) {effect.age+=dt;effect.z-=s.speed*dt*.35;}
    s.effects=s.effects.filter(effect=>effect.age<1.5);
    const p=s.player;
    let justLanded=false;
    p.buffer=Math.max(0,p.buffer-dt);p.stumble=Math.max(0,p.stumble-dt);
    if(s.chromeJump) {
      // A page-physics jump (60 Hz, pixel rounding) finishes as it began, even if the morph starts.
      if(++s.ticks%2===0) {
        const t=runner.o.trex;
        if(runner.updateJump(ChromeOpening.FRAME_MS)){s.chromeJump=false;p.height=0;p.velocity=0;p.grounded=true;justLanded=true;landed();}
        else {p.height=(ChromeOpening.TREX.groundY-t.y)/UNIT;p.velocity=-t.v*60/UNIT;}
      }
    } else {
    if(s.scene!=='extreme')jumpIfReady();
    if(!p.grounded && s.scene!=='extreme') {
      p.velocity-=physics().gravity*dt;p.height+=p.velocity*dt;
      if(p.height<=0) {p.height=0;p.velocity=0;p.grounded=true;justLanded=true;landed();jumpIfReady();}
    }
    }
    if(inHandoff()) {
      // The runner's existing cacti also travel out of its box, without gameplay events.
      s.chromeTailTime+=dt;
      if(s.chromeTailTime>=1/60){s.chromeTailTime-=1/60;runner.advanceTail();}
      // The runner's two-frame gait carries on through the handoff.
      s.heroTimer+=dt*1000;
      if(s.heroTimer>=1000/12){s.heroTimer=0;s.heroIndex^=1;}
      s.heroFrame=RUN_FRAMES[s.heroIndex];
    }
    // The suspense arrests forward travel, not the meaning of a jump input.
    if(!['rupture','crash','coalesce','extreme','collapse','breath'].includes(s.scene)) {
      s.distance+=s.speed*dt;s.sceneDistance+=s.speed*dt;
    }
    if(s.scene==='corkscrew') {
      const cfg=physics();s.rollTime=Math.min(1,s.rollTime+dt/(reducedMotion?cfg.reducedTurnDuration:cfg.turnDuration));
      s.worldRoll=s.rollFrom+(s.rollTarget-s.rollFrom)*smooth(s.rollTime);
      if(s.rollTime===1)s.rollRest+=dt;
    }
    s.morph+=(s.morphTarget-s.morph)*Math.min(1,dt*3.8);
    for(const m of s.monuments) {m.age+=dt;if(s.scene==='track')m.z-=s.speed*dt*.44;}
    s.monuments=s.monuments.filter(m=>m.z>-14);
    for(const w of s.windows) {w.age+=dt;if(s.scene==='desktop')w.z-=s.speed*dt*.48;}
    s.windows=s.windows.filter(w=>w.z>-12);
    if(s.scene==='stampede')for(const tower of s.city)tower.z-=s.speed*dt;
    if(s.scene==='rupture') {
      if(s.simTime>=s.dropAt) enter('extrusion');
    } else if(s.scene==='extrusion') {
      s.extrusion=smooth(s.sceneTime/2.9);
      // Reduced motion keeps the dimensional reveal, with a longer, gentler orbit.
      s.projectionBlend=smooth(s.sceneTime/(reducedMotion?5.1:4.2));
      // The game's own HUD arrives only once the page has visibly become a world.
      if(s.revealAt===null && s.projectionBlend>=.3) s.revealAt=s.simTime;
      if(s.sceneTime>=(reducedMotion?5.3:4.4)) {
        s.extrusion=1;s.projectionBlend=1;enter('track');
      }
    } else if(PHRASES[s.scene]) {
      const phrase=PHRASES[s.scene];
      obstacles(dt);
      if(s.mode!=='running') return;
      const earned=s.success>=phrase.target && s.sceneTime>=(phrase.minimum||0);
      if(!phrase.cells && (earned || s.sceneTime>=phrase.deadline))s.spawnStopped=true;
      const resolved=s.spawnStopped && s.obstacles.every(o=>o.resolved) && !s.pending;
      if(resolved && p.grounded) {
        // A missed ink cactus must not strand a surviving run sideways. The exit
        // completes the revolution without inventing a landing, credit or points.
        const fullTurn=(s.lap%2?1:-1)*Math.PI*2;
        if(s.scene==='corkscrew' && s.rollTime===1 && s.rollTarget!==fullTurn)turnWorld(fullTurn);
        if(s.scene!=='corkscrew' || (s.rollTime===1 && s.rollRest>=phrase.settledDuration))enter(phrase.next,earned?'earned':'resolved');
      }
    } else if(s.scene==='crash') {
      if(s.sceneTime>=2.2 && p.grounded) enter('stampede');
    } else if(s.scene==='stampede') {
      // A fixed musical build, never lengthened by misses. The deadline closes the
      // spawner only; every presented cactus still resolves before a grounded exit.
      if(s.sceneTime>=STAMPEDE.spawnUntil)s.spawnStopped=true;
      obstacles(dt);
      if(s.mode!=='running') return;
      const resolved=s.spawnStopped && s.obstacles.every(o=>o.resolved) && !s.pending;
      if(s.sceneTime>=STAMPEDE.build && resolved && p.grounded) enter('coalesce',s.success>=s.target?'earned':'resolved');
    } else if(s.scene==='coalesce') {
      if(s.sceneTime>=2.2 && p.grounded) enter('moon');
    } else if(s.scene==='extreme') {
      updateExtreme(dt);
    } else if(s.scene==='collapse') {
      const fold=smooth(s.sceneTime/2.25);
      s.projectionBlend=1-fold;s.extrusion=1-fold;
      if(s.sceneTime>=2.4) enter('breath');
    } else if(s.scene==='breath') {
      if(++s.ticks%2===0)runner.frame();
      if(s.sceneTime>=1.15 && s.extremeCleared && runner.ready) nextLap();
    }
  }
  // Fixed-time collision; the small scalar tape is presentation only, never simulation replay.
  function updateExtreme(dt) {
    const e=s.extreme,p=s.player;e.time+=dt;
    if(e.phase!=='rewind')e.recoilAge=s.sceneTime-e.boostAt;
    if(e.phase==='ready') {
      e.caption='MASH FAST · '+Math.max(0,1.5-e.time).toFixed(1)+'s · TAPS START AT GO';
      if(e.time>=1.2 && e.cue<0){e.cue=0;forwardCue('click-it',1.35);}
      if(e.time>=1.5){e.phase='active';e.time=0;e.cue=0;e.caption='GO! Click it!';}
      return;
    }
    if(e.phase==='active') {
      p.velocity=Math.max(-9,p.velocity-5*dt);
      p.height=clamp(p.height+p.velocity*dt,0,e.firstPress===null?0:Math.min(30,1.35+8*(e.time-e.firstPress)));
      if(p.height===0){p.velocity=0;p.grounded=true;}
      e.ttc=Math.max(0,e.activeDuration-e.time);e.cactusZ=24*e.ttc/e.activeDuration;
      e.progress=clamp(p.height/e.targetHeight);
      if(e.firstCross===null && p.height>=e.targetHeight){e.firstCross=s.simTime;audio.stopForward();}
      if(e.firstCross===null) {
        const cue=e.time>=1.65?2:e.time>=.55?1:0;
        if(cue>e.cue){e.cue=cue;forwardCue(cue===1?'click-harder':'click-it',1.35);}
      }
      // A height crossing is not a win, and cannot re-arm speech after a dip.
      e.caption=e.firstCross!==null?'KEEP GOING · CONTACT PENDING':e.time<.55?'GO! Click it!':e.time<1.65?'Click harder!':e.time<2.6?'Click it!':'KEEP TAPPING · REACH THE TOP';
      if(e.time>=e.activeDuration && !e.contact) {
        e.contact=true;
        if(e.acceptedPresses<e.minPresses || e.firstPress===null || p.height<e.targetHeight) {
          e.hit=true;e.caption='MISSED · RUN OVER';s.combo=0;s.multiplier=1;audio.impact();s.health=0;finishRun('death');return;
        }
        // Legacy finalInput is an alias for this genuine contact proof, not a fabricated jump.
        e.cleared=true;s.extremeCleared=true;s.finalInput=true;s.success=1;
        // Exactly one capped bonus, never points per press or a fallback success.
        s.score+=150;s.lapScore+=150;s.earned++;s.lapEarned++;
        e.phase='payoff';e.time=0;e.clearHeight=p.height;e.cue=-1;e.caption='CLEARED · TOP NOTCH!';audio.stopForward();audio.payoff();
      }
    } else if(e.phase==='payoff') {
      const t=clamp(e.time/1.4);
      e.visualZ=8*t*t;e.cactusZ=-12*t*t;
      p.height=e.clearHeight+(30-e.clearHeight)*Math.sin(t*Math.PI/2);
      if(e.time>=1.4){e.phase='rewind';e.time=0;e.cue=-1;audio.rewind();}
    } else if(e.phase==='rewind') {
      e.rewindPosition=clamp(e.time/2.2);
      const index=(1-e.rewindPosition)*(e.history.length-1),i=Math.floor(index),f=index-i;
      const a=e.history[i],b=e.history[Math.min(i+1,e.history.length-1)];
      e.visualHeight=a[0]+(b[0]-a[0])*f;e.cactusZ=a[1]+(b[1]-a[1])*f;
      e.visualZ=a[2]+(b[2]-a[2])*f;e.pose=a[3]+(b[3]-a[3])*f;
      e.recoilAge=a[4]+(b[4]-a[4])*f;
      // Reuse the scalar tape: the most recent cloud shrinks back into its boost.
      e.puff={age:a[5],height:a[6],z:a[7],seed:a[8]};
      e.caption='REWIND ◀◀';
      if(e.time>=2.2){Object.assign(p,{height:0,velocity:0,grounded:true,buffer:0});enter('collapse','extreme-cleared');}
      return;
    }
    e.visualHeight=p.height;e.pose+=dt*(e.phase==='payoff'?1+e.time*8:1);
    e.sample+=dt;
    if(e.sample>=1/30){e.sample-=1/30;if(e.history.length<240)e.history.push([e.visualHeight,e.cactusZ,e.visualZ,e.pose,e.recoilAge,e.puff?.age??10,e.puff?.height??0,e.puff?.z??0,e.puff?.seed??0]);}
    if(e.phase==='rewind'){e.caption='REWIND ◀◀';return;}
  }
  function forwardCue(name,rate) {
    const e=s.extreme;
    e.forwardCues.push({name,time:s.simTime,height:s.player.height,phase:e.phase});
    audio.announce(name,rate);
  }
  function finishRun(reason) {
    if(s.mode!=='running' || s.reported) return;
    if(reason==='banked' && (s.score<=0 || s.debugAssisted || s.revealAt===null)) return;
    // Latch the terminal state first, including zero-score deaths.
    s.banked=reason==='banked';s.completion=reason;s.mode='complete';
    s.player.buffer=0;s.player.velocity=0;s.pending=0;s.recovery=0;
    if(reason==='death') {s.combo=0;s.multiplier=1;}
    userPaused=false;pausePanel.hidden=true;pauseButton.hidden=true;
    if(reason==='death')audio.terminal();else audio.pause();bankState();healthState();
    if(s.debugAssisted) return;
    s.reported=true;
    const score=s.score, previousBest=s.previousBest;
    store(bestKey,Math.max(previousBest,score));
    showCard(reason,score,previousBest);
  }
  function showCard(reason,score,previousBest) {
    document.getElementById('end-title').textContent=reason==='banked'?'Score banked':'Run over';
    document.getElementById('end-score').textContent=String(score);
    document.getElementById('end-best').textContent=String(Math.max(score,previousBest));
    document.getElementById('end-new').hidden=!(score>previousBest && score>0);
    const share=document.getElementById('end-share');share.textContent='Share';share.dataset.score=String(score);
    card.hidden=false;cardShownAt=performance.now();
    document.getElementById('end-again').focus({preventScroll:true});
  }
  async function shareScore() {
    const button=document.getElementById('end-share');
    const text=`I scored ${button.dataset.score} on Tap the Dino. Keep jumping.`;
    try {
      if(navigator.share && navigator.maxTouchPoints>0) {await navigator.share({title:'Tap the Dino',text,url:SHARE_URL});return;}
      await navigator.clipboard.writeText(text+'\n'+SHARE_URL);
      button.textContent='Copied!';setTimeout(()=>{button.textContent='Share';},2000);
    } catch { /* A cancelled share sheet or blocked clipboard changes nothing. */ }
  }
  function present(elapsed) {
    // One presentation pass for live frames and debug-stepped captures alike.
    const current=phase();
    if(root.dataset.mode!==s.mode)root.dataset.mode=s.mode;
    if(root.dataset.phase!==current)root.dataset.phase=current;
    const revealed=String(s.revealAt!==null);
    if(root.dataset.revealed!==revealed)root.dataset.revealed=revealed;
    // Fold and handoff share the real page; the canvas owns the hero until the swap.
    const pageVisible=current!=='game';
    if(opening.hidden===pageVisible){opening.hidden=!pageVisible;if(pageVisible)runner.layout();}
    let dissolve=0;
    if(current==='handoff') {
      anchorFromRunner();dissolve=smooth((s.simTime-s.handoffAt)/(reducedMotion?1.6:1.3));
    } else if(current==='fold') {anchorFromRunner();dissolve=1-smooth((s.sceneTime-1.65)/.6);}
    if(pageVisible) {
      const opacity=String(1-dissolve),shift=current==='handoff'&&!reducedMotion&&dissolve?`translateY(${(dissolve*10).toFixed(2)}px)`:'';
      if(openingBody.style.opacity!==opacity)openingBody.style.opacity=opacity;
      if(openingMessage.style.transform!==shift)openingMessage.style.transform=shift;
      runner.hideRunner=current==='handoff'||current==='fold';runner.draw();
    }
    if(current!=='opening') renderer.draw(s);
    bankState();healthState();
    pauseButton.hidden=s.mode!=='running'||s.revealAt===null||userPaused;
    lapStatus.hidden=s.lap===1||s.revealAt===null||s.mode!=='running';
    if(!lapStatus.hidden)lapStatus.textContent=`${s.score} · LAP ${s.lap} · ${s.speedMultiplier.toFixed(2)}×`;
    if(current!=='opening'){frameCount++;frameSum+=Math.min(elapsed,1)*1000;renderSum+=renderer.stats.renderMs;if(elapsed>.025)slowFrames++;}
  }
  function frame(now) {
    const elapsed=Math.max(0,(now-last)/1000);last=now;
    if(!paused && !document.hidden && !frozen) {
      accumulator+=Math.min(elapsed,.075);
      let steps=0;
      while(accumulator>=STEP && steps++<9) {update(STEP);accumulator-=STEP;}
      if(steps>9)accumulator=0;
      audio.sync(s);
    }
    if(!document.hidden) present(elapsed);
    requestAnimationFrame(frame);
  }
  function syncPause() {
    const value=userPaused||focusPaused||document.hidden;
    if(paused===value)return;
    paused=value;accumulator=0;last=performance.now();s.player.buffer=0;
    if(value)audio.pause();else if(s.mode==='running')audio.unlock();
  }
  function setUserPause(value) {
    if(s.mode==='complete')return;
    userPaused=value;pausePanel.hidden=!value;bankState();syncPause();
    if(value)document.getElementById('resume').focus({preventScroll:true});
    else document.activeElement?.blur();
  }
  function restart() {userPaused=false;pausePanel.hidden=true;reset();syncPause();document.activeElement?.blur();}
  function toggleMute() {muted=!muted;store('a1NoInternetMuted',muted?'1':'0');audio.setMuted(muted,!paused&&s.mode==='running');muteLabel();}
  const editable = target => target.closest?.('button,a,input,textarea,select,[contenteditable]');
  document.addEventListener('keydown',e=>{
    // The end card's own keys: Space/Enter play again, Escape dismisses.
    if(card.hidden || e.repeat) return;
    if(e.key==='Escape'){e.preventDefault();dismissCard();return;}
    if((e.code==='Space'||e.key==='Enter') && !editable(e.target)) {
      e.preventDefault();
      if(performance.now()-cardShownAt>300)restart();
    }
  });
  addEventListener('keydown',e=>{
    if(e.defaultPrevented || e.repeat) return;
    if(e.key==='Escape' && s.mode!=='complete'){e.preventDefault();setUserPause(!userPaused);return;}
    if(e.code==='KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey){e.preventDefault();toggleMute();return;}
    if(userPaused || editable(e.target)) return;
    if(e.code==='Space' || e.code==='ArrowUp') {e.preventDefault();action();}
    else if(e.code==='KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey) toggleMute();
  });
  addEventListener('keyup',e=>{
    if(editable(e.target)) return;
    if(e.code==='Space' || e.code==='ArrowUp') release('Space');
    else if(e.key==='Enter') release('Enter');
  });
  const insideRunner = e => {
    const r=runner.canvas.getBoundingClientRect();
    return e.clientX>=r.left&&e.clientX<=r.left+runner.containerWidth()&&e.clientY>=r.top&&e.clientY<=r.bottom;
  };
  game.addEventListener('pointerdown',e=>{
    if(!e.isPrimary || (e.pointerType==='mouse' && e.button!==0))return;
    e.preventDefault();action();
  });
  game.addEventListener('pointerup',e=>{if(e.isPrimary)release(insideRunner(e)?'tap':'Space');});
  game.addEventListener('pointercancel',()=>{s.player.buffer=0;});
  addEventListener('blur',()=>{focusPaused=true;syncPause();});
  addEventListener('focus',()=>{focusPaused=false;syncPause();});
  document.addEventListener('visibilitychange',()=>{focusPaused=document.hidden;syncPause();});
  pauseButton.addEventListener('click',()=>setUserPause(true));
  document.getElementById('resume').addEventListener('click',()=>setUserPause(false));
  pausePanel.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const buttons=[...pausePanel.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);
    e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
  });
  addEventListener('resize',()=>{theme();hudBand();renderer.resize();runner.layout();});
  darkQuery.addEventListener('change',theme);
  bank.addEventListener('click',()=>finishRun('banked'));
  document.getElementById('again').addEventListener('click',restart);
  document.getElementById('end-again').addEventListener('click',e=>{if(e.detail===0&&performance.now()-cardShownAt<300)return;restart();});
  document.getElementById('end-share').addEventListener('click',shareScore);
  document.getElementById('end-close').addEventListener('click',dismissCard);
  function muteLabel() {
    mute.classList.toggle('off',muted);mute.setAttribute('aria-label',muted?'Enable sound (M)':'Mute sound (M)');
    mute.setAttribute('aria-pressed',String(muted));
  }
  mute.addEventListener('click',toggleMute);
  const freeze = value => {
    if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}return value;
  };
  function snapshot() {
    const next=s.obstacles.find(o=>!o.resolved),a=s.flatAnchor;
    // A restart can display the native page before its hidden renderer warmup.
    const camera=renderer.lastRun===s.run?renderer.stats.transition.camera??null:null;
    // Nested lens/probe bounds and authored intervals belong to the live renderer
    // and simulation. Freeze a detached diagnostic, never those shared records.
    return freeze(structuredClone({
      version:7,speed:s.speed,speedMultiplier:s.speedMultiplier,approachTTC:s.approachTTC,distance:s.distance,userPaused,focusPaused,clearedTail:s.clearedTail.map(o=>({...o})),health:s.health,maxHealth:s.maxHealth,recovery:s.recovery,lap:s.lap,variant:s.variant,multiplier:s.multiplier,lapEarned:s.lapEarned,sessionEarned:s.earned,lapScore:s.lapScore,banked:s.banked,impact:s.impact,burst:s.burst,
      effectCounts:{puffs:s.effects.filter(e=>e.puff).length,impacts:s.effects.length,bursts:s.effects.filter(e=>e.big).length,transitions:s.transitions.length},mode:s.mode,scene:s.scene,sceneTime:s.sceneTime,success:s.success,target:s.target,
      earned:s.earned,fallback:s.fallback,transitions:s.transitions.map(t=>({...t})),
      simTime:s.simTime,beat:s.beat,playerHeight:s.player.height,player:{...s.player},
      nextTTC:next?next.z/s.speed:null,spawnIn:s.nextSpawn,score:s.score,combo:s.combo,echoes:s.echoes,
      projectionBlend:s.projectionBlend,extrusion:s.extrusion,worldRoll:s.worldRoll,rollTarget:s.rollTarget,rollProgress:s.rollTime,floorNormal:[Math.sin(s.worldRoll),-Math.cos(s.worldRoll)],physics:{...physics()},stagePattern:{spawned:s.phraseSpawn,stopped:s.spawnStopped,pending:s.pending},morph:s.morph,finalInput:s.finalInput,finalJumpTime:s.finalJumpTime,finalJumpSerial:s.finalJumpSerial,waitingForFinalInput:false,extremeCleared:s.extremeCleared,inputCount:s.inputCount,extreme:s.extreme?{hit:s.extreme.hit,firstCross:s.extreme.firstCross,forwardCues:s.extreme.forwardCues.map(c=>({...c})),phase:s.extreme.phase,phaseTime:s.extreme.time,cueIndex:s.extreme.cue,contact:s.extreme.contact,height:s.player.height,visualHeight:s.extreme.visualHeight,targetHeight:s.extreme.targetHeight,ttc:s.extreme.ttc,activeDuration:s.extreme.activeDuration,minPresses:s.extreme.minPresses,acceptedPresses:s.extreme.acceptedPresses,progress:s.extreme.progress,cleared:s.extreme.cleared,rewindPosition:s.extreme.rewindPosition,caption:s.extreme.caption,cactusZ:s.extreme.cactusZ,historyFrames:s.extreme.history.length}:null,cascadeCount:s.cascadeCount,
      entityCounts:{obstacles:s.obstacles.length,monuments:s.monuments.length,windows:s.windows.length,towers:s.city.length,brokenTowers:s.city.filter(t=>t.brokenAt!==null).length,echoes:s.echoes,effects:s.effects.length,transitions:s.transitions.length,polygons:renderer.stats.polygons},
      obstacles:s.obstacles.map(o=>({...o})),completion:s.completion,reported:s.reported,
      debugAssisted:s.debugAssisted,reducedMotion,paused,run:s.run,previousBest:s.previousBest,
      audio:audio.snapshot,
      art:{perspective:camera,extreme:renderer.stats.extreme?{...renderer.stats.extreme,hero:{...renderer.stats.extreme.hero}}:null,style:renderer.stats.style,assets:{...renderer.stats.assets},images:renderer.stats.images,
        transition:{...renderer.stats.transition,camera},obstacleProbes:(renderer.stats.obstacleProbes||[]).map(o=>({...o,foot:o.foot.slice(),top:o.top.slice()})),
        worldResolution:renderer.stats.worldResolution?renderer.stats.worldResolution.slice():[],budgets:{...renderer.stats.budgets}},
      timing:{frames:frameCount,meanFrameMs:frameCount?frameSum/frameCount:0,meanRenderMs:frameCount?renderSum/frameCount:0,slowFrames,maxPolygons:renderer.stats.maxPolygons},
      // Additive (opening/handoff): the page runner, its geometry and the one hero.
      phase:phase(),revealed:s.revealAt!==null,revealAt:s.revealAt,openingCrashes:s.openingCrashes,
      opening:{...runner.snapshot(),geometry:runner.geometry(),hideRunner:runner.hideRunner,
        pageOpacity:Number(openingBody.style.opacity||1),pageVisible:!opening.hidden},
      handoff:{anchor:a?{cx:a.cx,cy:a.cy,scale:a.scale,left:a.left,width:a.width,heroX:a.heroX}:null,heroFrame:s.heroFrame,
        nativeRatio:renderer.native,canvasRatio:renderer.dpr,hero:renderer.stats.hero?{...renderer.stats.hero}:null,hudAlpha:renderer.stats.hudAlpha??0}
    }));
  }
  const debug={get state(){return snapshot();}};
  if(debugMode) {
    // Accelerated inspection only; no scoring shortcuts, no fabricated clear/landing.
    debug.advance=seconds=>{
      debugUsed=true;s.debugAssisted=true;
      for(let i=0;i<Math.min(30,Math.max(0,Number(seconds)||0))/STEP;i++)update(STEP);
      present(0);return snapshot();
    };
    // Stop real-time stepping so advance() alone moves time (truthful stepped captures).
    debug.freeze=value=>{debugUsed=true;s.debugAssisted=true;frozen=!!value;accumulator=0;last=performance.now();return frozen;};
  }
  Object.defineProperty(window,'DINO_DEBUG',{value:Object.freeze(debug),writable:false,configurable:false});
  theme();hudBand();reset();muteLabel();requestAnimationFrame(frame);
})();
