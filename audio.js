/* Original 136 BPM score. The simulation's visual beat never depends on AudioContext. */
(() => {
  'use strict';
  const BPM = 136, BEAT = 60 / BPM;
  class DinoAudio {
    constructor(muted) {
      this.muted = muted; this.context = null; this.voices = new Set();
      this.impactSoundCount=0;this.terminalUntil=0;this.terminalTimer=null;this.forwardCues=[];
      this.samples={};this.pendingChrome=null;this.chromePlayed=0;
      // Fetch bytes ahead of the first gesture; decoding waits for the user's AudioContext.
      this.sampleBytes=Object.fromEntries(['press','hit','reached'].map(name=>[name,fetch('assets/chrome-'+name+'.mp3?v=1').then(r=>r.ok?r.arrayBuffer():null).catch(()=>null)]));
      this.extreme=false;this.pendingJump=null;this.jumpsPlayed=0;
      this.epoch=0;this.wantPlaying=false;this.pendingFarts=0;this.fartCount=0;this.fartsPlayed=0;this.speechCount=0;this.fartVoices=[];this.speechVoices=[];this.clips={};this.clipStatus='unloaded';
      this.scene = ''; this.cueRun=null;this.cueLap=null;this.cueScene='';this.entryPlayed=false;this.anticipation=false;this.arrangement=0; this.step = 0; this.origin = 0; this.failed = false;
    }
    loadSamples() {
      if(this.samplesLoading || !this.context)return;
      this.samplesLoading=true;
      for(const name of ['press','hit','reached'])this.sampleBytes[name].then(bytes=>bytes?this.context.decodeAudioData(bytes):null)
        .then(buffer=>{if(buffer)this.samples[name]=buffer;this.flushChrome();}).catch(()=>{});
    }
    chrome(name) {
      if(this.muted || this.failed)return false;
      this.pendingChrome={name,epoch:this.epoch,time:performance.now()};
      this.unlock();return this.flushChrome();
    }
    flushChrome() {
      const pending=this.pendingChrome,a=this.context;
      if(!pending)return false;
      if(pending.epoch!==this.epoch || performance.now()-pending.time>1000 || this.muted || !this.wantPlaying){this.pendingChrome=null;return false;}
      const buffer=this.samples[pending.name];
      if(!buffer || !a || a.state!=='running')return false;
      this.pendingChrome=null;
      const sources=[...this.voices].filter(v=>v.kind==='chrome');
      if(sources.length>=3){try{sources[0].stop();}catch{}this.voices.delete(sources[0]);}
      if(this.voices.size>=38)return false;
      const source=a.createBufferSource();source.buffer=buffer;source.kind='chrome';source.connect(a.destination);
      this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();};
      source.start();this.chromePlayed++;return true;
    }
    unlock() {
      if(this.muted || this.failed)return Promise.resolve();
      this.wantPlaying=true;
      if(this.unlockPromise && this.unlockEpoch===this.epoch)return this.unlockPromise;
      const epoch=this.epoch;this.unlockEpoch=epoch;
      this.unlockPromise=(async()=>{
        try {
          if(!this.context) {
            const Context=window.AudioContext||window.webkitAudioContext;
            if(!Context){this.failed=true;this.pendingFarts=0;this.pendingJump=null;return;}
            const a=this.context=new Context();
            this.master=a.createGain();this.master.gain.value=.42;
            const compressor=a.createDynamicsCompressor();
            compressor.threshold.value=-20;compressor.knee.value=20;compressor.ratio.value=5;
            this.master.connect(compressor);compressor.connect(a.destination);
            this.music=a.createGain();this.music.connect(this.master);
            this.fartBus=a.createGain();this.fartBus.connect(this.master);
            this.noise=a.createBuffer(1,a.sampleRate*.3,a.sampleRate);
            const data=this.noise.getChannelData(0);let seed=127;
            for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
            this.makeFarts();this.makeImpact();this.loadClips();this.loadSamples();
          }
          await this.setPlaying(true);
          if(epoch!==this.epoch || this.muted)return;
          this.flushChrome();this.scene='';
          const count=this.pendingFarts;this.pendingFarts=0;
          if(this.extreme)for(let i=0;i<count;i++)this.playFart();
          const jump=this.pendingJump;this.pendingJump=null;
          if(jump!==null && !this.extreme)this.playJump(jump);
        } catch {if(epoch===this.epoch){this.failed=true;this.pendingFarts=0;this.pendingJump=null;}}
      })().finally(()=>{if(this.unlockEpoch===epoch)this.unlockPromise=null;});
      return this.unlockPromise;
    }
    makeImpact() {
      // A short descending minor wah, deterministic and peak-bounded before mixing.
      const a=this.context,b=a.createBuffer(1,Math.ceil(a.sampleRate*.38),a.sampleRate),d=b.getChannelData(0);
      let p=0,q=0;
      for(let i=0;i<d.length;i++) {
        const t=i/a.sampleRate,u=t/.38,f=310*Math.pow(85/310,u);
        p+=2*Math.PI*f/a.sampleRate;q+=2*Math.PI*f*1.189207/a.sampleRate;
        const envelope=Math.min(1,t/.008)*Math.pow(1-u,1.7);
        d[i]=envelope*(Math.sin(p)*.42+Math.sin(q)*.22+Math.sin(p*2)*.08*(1-u));
      }
      this.impactBuffer=b;
    }
    impact() {
      // Contacts never unlock a cold/suspended context or queue a future surprise.
      const a=this.context;
      if(!a || a.state!=='running' || !this.wantPlaying || this.muted || !this.impactBuffer)return false;
      if(this.voices.size>=40) {
        const old=[...this.voices].find(v=>v.kind==='impact');
        if(!old)return false;
        try{old.stop();}catch{}this.voices.delete(old);
      }
      const o=a.createBufferSource(),g=a.createGain();o.buffer=this.impactBuffer;o.kind='impact';
      g.gain.value=.72;o.connect(g);g.connect(this.master); // Unducked, with two reserved slots.
      this.voices.add(o);o.onended=()=>{this.voices.delete(o);o.disconnect();g.disconnect();};
      o.start();this.impactSoundCount++;return true;
    }
    terminal() {
      // Invalidate pending unlock/sample work but let only an already-audible hit finish.
      this.epoch++;this.pendingChrome=null;this.pendingFarts=0;this.pendingJump=null;this.scene='';
      for(const v of this.voices)if(v.kind!=='impact'){try{v.stop();}catch{}this.voices.delete(v);}
      this.speechVoices=[];this.fartVoices=[];this.fadingFart=null;
      clearTimeout(this.terminalTimer);
      const tail=!this.muted && this.context?.state==='running' && [...this.voices].some(v=>v.kind==='impact');
      this.terminalUntil=tail?performance.now()+430:0;
      this.setPlaying(false).catch(()=>{});
      if(tail){const epoch=this.epoch;this.terminalTimer=setTimeout(()=>{if(epoch===this.epoch)this.pause();},430);}
    }
    stopForward() {
      for(const v of this.speechVoices){try{v.stop();}catch{}this.voices.delete(v);}
      this.speechVoices=[];
    }
    makeFarts() {
      const a=this.context;this.fartBuffers=[];this.reverseFarts=[];
      for(let v=0;v<5;v++) {
        const b=a.createBuffer(1,Math.floor(a.sampleRate*(.24+v*.027)),a.sampleRate),d=b.getChannelData(0);
        let seed=47+v*97,phase=0,low=0,slow=0;
        for(let i=0;i<d.length;i++) {
          const t=i/a.sampleRate,u=i/d.length;
          seed=(Math.imul(seed,1664525)+1013904223)>>>0;
          const noise=seed/2147483648-1;low+=.24*(noise-low);slow+=.035*(noise-slow);
          phase+=2*Math.PI*(105+v*9)*(1-u*.75)/a.sampleRate;
          const flutter=.45+.55*Math.pow(Math.sin(t*(45+v*4)+Math.sin(t*71)*1.5),2);
          const buzz=Math.tanh(Math.sin(phase)*3)*.36*flutter;
          const splat=(low-slow)*1.5*flutter;
          const bubble=Math.sin(2*Math.PI*(420*t-240*t*t))*Math.pow(Math.max(0,Math.sin(t*93+v)),14)*.22;
          d[i]=Math.max(-.82,Math.min(.82,(buzz+splat+bubble)*Math.min(1,t/.006)*Math.pow(1-u,1.3)));
        }
        this.fartBuffers.push(b);this.reverseFarts.push(this.reversed(b));
      }
    }
    reversed(buffer) {
      const b=this.context.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
      for(let c=0;c<b.numberOfChannels;c++)b.getChannelData(c).set(buffer.getChannelData(c).slice().reverse());
      return b;
    }
    async loadClips() {
      if(this.clipStatus!=='unloaded')return;
      this.clipStatus='loading';
      await Promise.all(['click-it','click-harder'].map(async name=>{
        const controller=new AbortController();let timer;
        try {
          const buffer=await Promise.race([(async()=>{
            const r=await fetch('assets/audio/extreme/'+name+'.wav?v=49',{signal:controller.signal});
            if(!r.ok)throw new Error('speech unavailable');
            const bytes=await r.arrayBuffer();if(bytes.byteLength>200000)throw new Error('speech too large');
            return this.context.decodeAudioData(bytes);
          })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('speech timeout'));},4500);})]);
          // Loading only fills a cache. It never starts a stale cue after pause/restart.
          this.clips[name]=buffer;this.clips[name+'-reverse']=this.reversed(buffer);
        } catch { /* Captions and challenge are independent of optional speech. */ }
        finally {clearTimeout(timer);}
      }));
      this.clipStatus=Object.keys(this.clips).length===4?'ready':'unavailable';
    }
    stopVoices(all=false) {
      for(const voice of this.voices) {
        if(!all && ['fart','jump','chrome','impact'].includes(voice.kind))continue;
        try {voice.stop();} catch { /* Already ended. */ }
        this.voices.delete(voice);
      }
      this.speechVoices=[];
      if(all){this.fartVoices=[];this.fadingFart=null;}
    }
    setPlaying(value) {
      this.wantPlaying=value;
      const a=this.context;if(!a)return Promise.resolve();
      // Serialize delayed browser resume/suspend operations. Each queued reconciliation
      // reads the latest intent, so an old pause cannot undo a legitimate new unlock.
      this.transport=(this.transport||Promise.resolve()).catch(()=>{}).then(()=>{
        const playing=(this.wantPlaying || this.terminalUntil>performance.now())&&!this.muted;
        if(playing && a.state==='suspended')return a.resume();
        if(!playing && a.state==='running')return a.suspend();
      });
      return this.transport;
    }
    pause() {
      clearTimeout(this.terminalTimer);this.terminalUntil=0;
      this.epoch++;this.pendingChrome=null;this.pendingFarts=0;this.pendingJump=null;this.stopVoices(true);this.scene='';
      this.setPlaying(false).catch(()=>{});
    }
    setExtreme(value) {
      if(this.extreme===value)return;
      this.extreme=value;this.pendingFarts=0;this.pendingJump=null;
      // Stage-local samples (including reverse speech/fart) cannot cross the exit.
      this.stopVoices(true);
    }
    setMuted(value,playing=this.wantPlaying) {this.muted=value;if(value)this.pause();else if(playing)this.unlock();}
    sample(buffer,kind,rate=1,volume=1) {
      const a=this.context;
      if(!buffer || !a || this.muted || a.state!=='running')return;
      const list=kind==='speech'?this.speechVoices:this.fartVoices,cap=kind==='speech'?2:5;
      if(list.length>=cap) {
        const old=list.shift();
        if(kind==='fart') {
          if(this.fadingFart){try{this.fadingFart.stop();}catch{}this.voices.delete(this.fadingFart);}
          this.fadingFart=old;old.gain.gain.cancelScheduledValues(a.currentTime);
          old.gain.gain.setTargetAtTime(.0001,a.currentTime,.002);old.stop(a.currentTime+.008);
        } else {try{old.stop();}catch{}this.voices.delete(old);}
      }
      if(this.voices.size>=38)return;
      const o=a.createBufferSource(),g=a.createGain();o.buffer=buffer;o.playbackRate.value=rate;
      g.gain.value=volume;o.gain=g;o.kind=kind;o.connect(g);g.connect(kind==='fart'?this.fartBus:this.master);
      list.push(o);this.voices.add(o);
      o.onended=()=>{this.voices.delete(o);const i=list.indexOf(o);if(i>=0)list.splice(i,1);o.disconnect();g.disconnect();};
      o.start();return o;
    }
    fart() {
      if(!this.extreme)return;
      this.fartCount++;
      if(this.muted || this.failed)return;
      if(this.context?.state==='running'){this.playFart();return;}
      this.pendingFarts=Math.min(5,this.pendingFarts+1);this.unlock();
    }
    playFart() {
      if(!this.extreme)return;
      if(this.sample(this.fartBuffers?.[this.fartsPlayed%5],'fart',[1,.9,1.08,1,.96][this.fartsPlayed%5],.64))this.fartsPlayed++;
    }
    announce(name,rate=1) {
      if(!this.extreme || !this.wantPlaying)return;
      if(!name.endsWith('-reverse')){this.forwardCues.push({name,time:this.context?.currentTime??null});if(this.forwardCues.length>24)this.forwardCues.shift();}
      if(this.sample(this.clips[name],'speech',rate,1.25))this.speechCount++;
    }
    rewind() {
      if(!this.extreme)return;
      this.stopVoices();this.announce('click-it-reverse',.85);
      this.sample(this.reverseFarts?.[3],'fart',.65,.7);
    }
    tone(time,frequency,duration,volume,type='triangle',end=null) {
      const a=this.context;
      if (!a || this.muted || a.state!=='running' || this.voices.size>=32) return;
      const o=a.createOscillator(), g=a.createGain();
      o.type=type; o.frequency.setValueAtTime(frequency,time);
      if(end) o.frequency.exponentialRampToValueAtTime(end,time+duration);
      g.gain.setValueAtTime(.0001,time); g.gain.exponentialRampToValueAtTime(volume,time+.006);
      g.gain.exponentialRampToValueAtTime(.0001,time+duration);
      o.connect(g); g.connect(this.music); this.voices.add(o);
      o.onended=()=>{this.voices.delete(o);o.disconnect();g.disconnect();};
      o.start(time);o.stop(time+duration+.015);return o;
    }
    hiss(time,duration,volume,frequency) {
      const a=this.context;
      if(!a || this.muted || a.state!=='running' || this.voices.size>=32) return;
      const o=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();
      o.buffer=this.noise; f.type='highpass'; f.frequency.value=frequency;
      g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.0001,time+duration);
      o.connect(f);f.connect(g);g.connect(this.music);this.voices.add(o);
      o.onended=()=>{this.voices.delete(o);o.disconnect();f.disconnect();g.disconnect();};
      o.start(time);o.stop(time+duration);
    }
    jump(plain,scene) {
      if(this.extreme || this.muted || this.failed)return;
      if(this.context?.state==='running'){if(scene==='jelly'||scene==='moon')this.stageAction(scene);else this.playJump(plain);return;}
      // Only the pending launch, never airborne input spam; pause/reset/mute cancel it.
      this.pendingJump=plain;this.unlock();
    }
    stageAction(kind) {
      if(this.extreme || this.muted || this.failed || this.context?.state!=='running')return;
      const t=this.context.currentTime+.008;
      if(kind==='slam') {
        this.tone(t,260,.13,.032,'triangle',60);
        this.tone(t+.035,95,.18,.025,'sine',170);
      } else if(kind==='jelly') {
        this.tone(t,125,.18,.040,'sine',540);
        this.tone(t+.085,390,.20,.022,'sine',180);
      }
      else this.tone(t,520,.55,.028,'sine',780);
    }
    playJump(plain) {
      if(!this.context || this.extreme)return;
      const voice=this.tone(this.context.currentTime+.008,plain?290:392,.065,plain?.045:.025,plain?'square':'triangle',plain?390:520);
      if(voice){voice.kind='jump';this.jumpsPlayed++;}
    }
    clear(plain,scene,big=false,variant=0) {
      if(!this.context || !this.wantPlaying || this.muted || this.context.state!=='running') return;
      const t=this.context.currentTime+.008;
      const note=({track:587,corkscrew:440,jelly:698,dream:659,moon:880})[scene]||587;
      this.tone(t,plain?520:note,.10,.04,'triangle');
      if(!plain) this.tone(t+.09,note*1.5,.22,.035,'sine');
      // A distinct landing cadence per medium, below the existing music headroom.
      // Offline keeps its single dry beep; these are earned accents, never input rewards.
      if(!plain) {
        if(scene==='track')this.tone(t,110,.14,.075,'sine',55);
        else if(scene==='dream')this.tone(t+.16,note*.75,.48,.025,'sine');
      }
      if(scene==='jelly') {
        this.tone(t,180,.15,.035,'sine',75);
        this.tone(t+.09,110,.20,.020,'sine',240);
      }
      if(big) {
        const moon=scene==='moon',ink=scene==='corkscrew',soft=scene==='dream';
        for(const [i,ratio] of [1,1.5,1.25,2].entries())
          this.tone(t+i*(moon?.11:ink?.055:.075),note*ratio*(variant===2?.5:1),moon?.48:soft?.30:.16,soft?.016:moon?.019:.026,ink?'triangle':'sine');
        if(ink)this.hiss(t+.06,.045,.020,2800);
      }
    }
    payoff() {
      const a=this.context;if(!a || this.muted)return;
      this.stopVoices();const t=a.currentTime+.008;
      this.tone(t,145,.48,.18,'sine',36);
      this.hiss(t,.25,.06,900);
      for(const f of [146.83,220,293.66,369.99])this.tone(t,f,1.1,.055,'triangle');
    }
    sync(s) {
      // Cue ownership follows actual gameplay entries, not the transport's scene
      // reset on mute/pause/unlock. Resuming must resync the beat, not replay a drop.
      if(this.cueRun!==s.run || this.cueLap!==s.lap || this.cueScene!==s.scene) {
        this.cueRun=s.run;this.cueLap=s.lap;this.cueScene=s.scene;
        this.entryPlayed=false;this.anticipation=false;
      }
      const a=this.context;
      if(!a || !this.wantPlaying || this.muted || a.state!=='running')return;
      const speaking=this.speechVoices.length>0;
      this.music.gain.setTargetAtTime(speaking?.28:1,a.currentTime,.04);
      this.fartBus.gain.setTargetAtTime(speaking?.48:1,a.currentTime,.025);
      if(s.scene==='extreme'){this.scene=s.scene;return;}
      if(s.scene==='collapse') {this.scene=s.scene;return;}
      if(s.mode!=='running' || ['rupture','offline','breath'].includes(s.scene)) {
        if(this.scene!==s.scene)this.stopVoices();this.scene=s.scene;return;
      }
      // One transport: both geometry pulses and scheduled notes use simTime / BEAT.
      // Scene changes replace instruments, never secretly reset the musical phase.
      const changed=this.scene!==s.scene;
      if(changed || Math.abs((a.currentTime-this.origin)-s.simTime)>.18) {
        if(changed)this.stopVoices();this.scene=s.scene;
        this.origin=a.currentTime-s.simTime;this.step=Math.ceil(s.simTime/(BEAT/2));
      }
      const duration=({track:14,dream:12})[s.scene];
      const progress=duration?Math.min(1,Math.max(s.sceneTime/duration,s.success/Math.max(1,s.target))):0;
      // Two finite arrangement lifts, including on lap one. Later laps add at most one.
      const drive=s.scene==='track';
      this.arrangement=drive?Math.min(2,(progress>.45?1:0)+(progress>.78?1:0)+(s.lap>1&&s.combo>=3?1:0)):s.sceneTime>1&&['corkscrew','jelly','moon'].includes(s.scene)?Math.min(2,Math.floor(s.combo/3)):0;
      if(duration && progress>.78 && s.success>0 && !this.anticipation) {
        this.anticipation=true;
        const t=a.currentTime+.012,root=({track:146.83,dream:164.81})[s.scene];
        // A short pickup leaves space for the next scene.
        for(let i=0;i<3;i++)this.tone(t+i*BEAT/4,root*[2,3,4][i],s.scene==='dream'?.3:.09,s.scene==='dream'?.018:.025,'sine');
      }
      if(!this.entryPlayed) {
        this.entryPlayed=true;
        if(s.scene==='extrusion') {
          const downbeat=this.origin+Math.ceil(s.simTime/BEAT)*BEAT;
          this.tone(Math.max(a.currentTime+.005,downbeat),155,.26,.24,'sine',38);
        } else if(s.scene==='track') {
          const t=a.currentTime+.008,note=146.83;
          this.tone(t,note,.16,.06,'triangle',note*.5);
          this.tone(t+.06,note*4,.12,.025,'sine');
        } else if(['corkscrew','jelly','moon'].includes(s.scene)) {
          const t=a.currentTime+.008,note=({corkscrew:220,jelly:261.63,moon:440})[s.scene];
          this.tone(t,note,s.scene==='moon'?.65:.22,.035,s.scene==='corkscrew'?'triangle':'sine',note*(s.scene==='jelly'?2:1));
          this.tone(t+.13,note*1.5,.3,.02,'sine');
        }
      }
      let scheduled=0;
      while(this.origin+this.step*BEAT/2<a.currentTime+.12 && scheduled++<4) {
        const n=this.step++,t=Math.max(a.currentTime+.005,this.origin+n*BEAT/2);
        if(s.scene==='moon') {
          if(n%8===0)this.tone(t,[220,261.63,329.63,293.66][Math.floor(n/8)%4],BEAT*5,this.arrangement?.026:.035,'sine');
          if(n%16===4)this.tone(t,880,.65,.016,'sine',660);
          // Syncopation rather than louder pads; at most two short orbit notes.
          if(this.arrangement && n%8===5)this.tone(t,660,.28,.014,'sine',880);
          if(this.arrangement===2 && n%16===11)this.tone(t,1320,.18,.010,'sine',990);
          continue;
        }
        if(s.scene==='corkscrew' || s.scene==='jelly') {
          const jelly=s.scene==='jelly',note=(jelly?130.81:110)*[1,1.5,1.25,2][Math.floor(n/4)%4];
          if(n%4===0)this.tone(t,note,jelly?.24:.11,this.arrangement?.045:.06,jelly?'sine':'triangle',jelly?note*2:note*.8);
          if(n%8===2)this.tone(t,note*3,.13,.022,'sine');
          if(this.arrangement && n%4===3)this.tone(t+BEAT/8,note*(jelly?2.5:4),.085,.019,jelly?'sine':'triangle',note*(jelly?1.5:3));
          if(this.arrangement===2 && n%8===5) {
            this.tone(t,note*2,.095,.018,'sine',jelly?note*3:null);
            if(!jelly)this.hiss(t,.025,.012,4200);
          }
          continue;
        }
        const dream=s.scene==='dream';
        const variation=s.variant||0;
        const bass=[73.42,73.42,87.31,65.41][(Math.floor(n/8)+variation)%4];
        if(variation && n%4===variation)this.tone(t,bass*(variation===1?8:6),BEAT*.6,.022,'sine');
        // Shorter pitched kick and a delayed bass attack separate their transients,
        // rather than making the master louder. Dream stays in half-time.
        if(n%(dream?8:2)===0)this.tone(t,dream?132:158,dream?.18:.135,dream?.15:.24,'sine',43);
        if(n%(dream?16:8)===(dream?8:4)) {
          this.hiss(t,dream?.18:.13,dream?.035:.09,1300);this.tone(t,175,.08,.045,'triangle');
        }
        if(!dream || n%4===2)this.hiss(t,.025,n%2?.025:.018,6500);
        if(n%(dream?4:2)===0)this.tone(t+(dream?0:.032),bass*(n%8===6?2:1),BEAT*(dream?1.5:.52),.078,'triangle');
        if(drive && this.arrangement>0 && n%8===5)this.tone(t+.018,bass*2,.085,.045,'triangle');
        if(drive && this.arrangement===2 && n%8===7) {
          this.tone(t+.02,bass,.09,.055,'triangle');
          this.hiss(t+BEAT/4,.022,.018,7200);
        }
        if(n%8===0)for(const ratio of [2,2.4,3])this.tone(t,bass*ratio,BEAT*(dream?6:3.1),dream?.038:.025,'sine');
        if(dream && n%4===0)this.tone(t,bass*[4,6,4.8,3][Math.floor(n/4)%4],.7,.038,'sine');
        else if(n%4===3)this.tone(t,bass*[4,6,4.8,3][Math.floor(n/4)%4],.16,.025,'triangle');
      }
    }
    get snapshot() { return { impactSoundCount:this.impactSoundCount,terminalTail:this.terminalUntil>performance.now(),forwardCues:this.forwardCues.map(c=>({...c})),chromePlayed:this.chromePlayed,chromeVoices:[...this.voices].filter(v=>v.kind==='chrome').length,pendingChrome:!!this.pendingChrome,available:!!this.context, state:this.context?.state||'uncreated', muted:this.muted, arrangement:this.arrangement, voices:this.voices.size, fartVoices:this.fartVoices.length+(this.fadingFart&&this.voices.has(this.fadingFart)?1:0), speechVoices:this.speechVoices.length, jumpsPlayed:this.jumpsPlayed, pendingJump:this.pendingJump!==null, fartCount:this.fartCount, fartsPlayed:this.fartsPlayed, speechCount:this.speechCount, pendingFarts:this.pendingFarts, desiredPlaying:this.wantPlaying, clipStatus:this.clipStatus, failed:this.failed, transportBeat:this.context?(this.context.currentTime-this.origin)/BEAT:0 }; }
  }
  window.DinoAudio=DinoAudio;
})();
