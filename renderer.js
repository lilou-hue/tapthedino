/* World-space renderer: shared projection, depth queue and bounded art-medium passes.
   The original medium journey (vector, ink, gouache, 16-bit desktop, cel crowd) plus
   the sculpted Jelly/Moon stages and the native fold. */
(() => {
  'use strict';
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const mixRGB = (a, b, t) => a.map((n, i) => mix(n, b[i], t));
  const smooth = n => (n = clamp(n), n * n * (3 - 2 * n));
  const sub = (a, b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const d = Math.hypot(...a) || 1; return a.map(v => v / d); };
  const CUBE = [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];
  const FACES = [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];
  const SHADE = [.60,.86,.75,.94,1.12,.45];
  const GRAY = [83,83,83], CHROME = [174,218,233], LIME = [193,255,105], GREEN = LIME;
  const PX = 47 / 2.2;
  // The sculpted hero: ONE hand-authored side profile in Chromium runner pixels
  // (44 wide, ground row 41), so the flat page sprite and the volume share a
  // silhouette. Each point carries a half-width: tapered tail, deep haunch, snout.
  const toHero = ([x, y, w]) => [(x - 22) / PX, (41 - y) / PX, w];
  const HERO = [[.5,15.5,.04],[8,21,.17],[15,18.5,.4],[21,12,.36],[22.5,3,.33],[37,.5,.3],[43.5,3,.25],[43.5,8.5,.22],
    [35,10,.25],[39,13,.2],[30,15.5,.28],[27,20,.32],[28.5,26,.4],[25,31,.44],[16,32.5,.44],[8,26,.2]].map(toHero);
  const HAUNCH = [[11,24],[17,20.5],[23,22],[25.2,28],[21,32.4],[13.5,31]].map(p => toHero([...p,0]));
  const ARM = [[25.5,18.6],[30,19.4],[33.6,21.6],[34.8,24.6],[32.6,24.8],[30.2,22.8],[25.5,23]].map(p => toHero([...p,0]));
  const SPIKES = [[[20.2,13.3],[17.6,7.4],[16.9,16.8]],[[15.6,18.3],[13,11.8],[11.7,19.6]],[[10.4,20.4],[8,15],[7,20.6]]]
    .map(t => t.map(p => toHero([...p,0])));
  const LEG = [[-3.2,-2],[3,-2],[2,8.5],[5.8,9.6],[5.8,12],[-2.4,12],[-2.6,8]];
  // The sculpted hazard: trunk, both arms and root as one joined silhouette
  // (screen-right u, up v, half-depth), not separate boxes.
  const CACTUS = [[-.3,0,.2],[-.2,.14,.2],[-.2,.46,.2],[-.46,.46,.14],[-.56,.56,.14],[-.56,.98,.14],[-.48,1.06,.12],[-.4,.98,.12],
    [-.4,.66,.13],[-.2,.66,.2],[-.2,1.28,.2],[-.1,1.4,.16],[.1,1.4,.16],[.2,1.28,.2],[.2,.8,.2],[.38,.8,.13],[.38,1.1,.12],
    [.46,1.18,.12],[.54,1.1,.12],[.54,.72,.14],[.44,.6,.14],[.2,.6,.2],[.2,.14,.2],[.3,0,.2]];
  // Three controlled values from one upper-left key: tops catch it, the side
  // reads as the middle value, undersides and away-facing planes fall dark.
  const heroTone = (u, v) => v > .45 ? 2 : v < -.35 ? 0 : u < 0 ? 1 : 0;
  const cactusTone = (u, v) => v > .45 ? 2 : v < -.35 ? 0 : u < 0 ? 2 : 0;
  // The existing four size/LOD tiers, not screen-space geometry. Preserve even
  // the tiny floating-point pole rings; perspective and bend are applied afresh.
  const SOLIDS=new Map();
  for(const [n,rows] of [[12,6],[6,3],[4,3],[8,4]]) {
    const vertices=[],facets=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<n;i++) {
      const a=Math.PI*j/rows,b=i*Math.PI*2/n;
      vertices.push([Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)]);
    }
    for(let j=0;j<rows;j++)for(let i=0;i<n;i++)facets.push([j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i]);
    SOLIDS.set(n+':'+rows,{vertices,facets});
  }
  // Only scenery primitives are remembered; no key enumeration or gameplay copy.
  const SCENERY_FIELDS=['mode','scene','previousScene','sceneTime','simTime','beat','speed','distance',
    'score','combo','multiplier','success','target','health','maxHealth','recovery','lap','variant',
    'lapEarned','lapScore','banked','impact','burst','waveTime','earned','fallback','projectionBlend',
    'extrusion','pending','nextSpawn','serial','sceneDistance','worldRoll','rollFrom','rollTarget',
    'rollTime','morph','morphTarget','lastJumpTime','finalInput','finalJumpTime','finalJumpSerial',
    'dropAt','cascadeCount','echoes','completion','reported','debugAssisted','reducedMotion','run','previousBest','stageConfig'];
  // Media that keep the current sculpted hero: Jelly, Moon and the fold bridge only.
  const MODERN = ['gummy','lunar'];

  class DinoRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.faces = [];this.sink=null;this.cost=0;this.sceneryLimit=2000;
      this.art=new DinoArt();this.medium='chrome';this.modern=false;
      this.pixelCanvas=document.createElement('canvas');this.pixelContext=this.pixelCanvas.getContext('2d',{alpha:false});
      this.patterns={};
      // One reusable outgoing world target, plus the shared nearest-pixel raster.
      this.blendCanvas=document.createElement('canvas');
      this.blendContext=this.blendCanvas.getContext('2d',{alpha:false});
      this.lastScenery={};this.handoff=null;this.lastRun=null;
      this.visual={bend:0,lift:0};this.hudTop=12;this.hudSize=36;this.hudRight=12;this.hudDesktop=0;this.neonFrom=null;this.foldFrom=null;this.neonFoot=null;
      this.stats = { polygons: 0, renderMs: 0, maxPolygons: 0, assets:{}, budgets:{scenery:2000,gameplay:2600,used:0,reservedGameplay:600,packCap:40}, transition:{} };
      this.solidView=Array.from({length:84},()=>[0,0,0]);
      this.skyCanvas=null;this.skyImage=null;
      // Opening handoff: Chromium sprite sheets (plain and dark-inverted), page theme and
      // an optional integer backing ratio matching the runner canvas while it is drawn here.
      this.chrome={sheets:{},hidpi:false};this.theme={dark:false,page:[255,255,255],ink:[83,83,83]};this.native=null;
      this.resize();
    }
    setChromeSheet(key,image) {
      const dark=document.createElement('canvas');dark.width=image.naturalWidth;dark.height=image.naturalHeight;
      const c=dark.getContext('2d');c.drawImage(image,0,0);
      const data=c.getImageData(0,0,dark.width,dark.height);
      for(let i=0;i<data.data.length;i+=4){data.data[i]=255-data.data[i];data.data[i+1]=255-data.data[i+1];data.data[i+2]=255-data.data[i+2];}
      c.putImageData(data,0,0);
      this.chrome.sheets[key]={light:image,dark};
    }
    setNative(ratio) {
      if(ratio && innerWidth*innerHeight*ratio*ratio>9000000)ratio=null;
      if(ratio===this.native)return;
      const before=this.dpr;this.native=ratio;
      // Same backing ratio (e.g. 1x displays): keep the existing buffers, no reallocation.
      if(this.dprFor()===before && this.w===innerWidth && this.h===innerHeight)return;
      this.resize();
    }
    dprFor() {
      return this.native || Math.min(devicePixelRatio || 1, 1.6, Math.sqrt(4000000 / (innerWidth * innerHeight)));
    }
    scheduleSky() {
      // Warm the static sky off the critical frame (idle time), never mid-handoff.
      if(this.skyPending)return;this.skyPending=true;
      const run=()=>{this.skyPending=false;if(this.art.status==='ready'&&!this.native)this.prepareSky();};
      if(window.requestIdleCallback)requestIdleCallback(run,{timeout:500});else setTimeout(run,200);
    }
    resize() {
      this.w = innerWidth; this.h = innerHeight;
      this.dpr = this.dprFor();
      this.canvas.width = Math.max(1,Math.floor(this.w * this.dpr));
      this.canvas.height = Math.max(1,Math.floor(this.h * this.dpr));
      this.ctx.setTransform(this.canvas.width/this.w, 0, 0, this.canvas.height/this.h, 0, 0);
      // Auxiliary targets: live blend <=4M + exact static sky <=4M + pixel raster
      // <=~231K pixels (aggregate <=~8.231M / 32.924MB RGBA, excluding the main).
      // Matching backing dimensions avoids reallocating the pixel raster between passes.
      this.blendCanvas.width=this.canvas.width;this.blendCanvas.height=this.canvas.height;
      this.blendContext.setTransform(this.blendCanvas.width/this.w,0,0,this.blendCanvas.height/this.h,0,0);
      if(this.skyCanvas){this.skyCanvas.width=0;this.skyCanvas.height=0;}
      this.skyImage=null;
    }
    horizonY(pose) {
      // Where the painted camera's ground plane meets infinity (no bend at the horizon).
      const eye=[Math.sin(pose[0])*pose[1],pose[2],pose[4]-Math.cos(pose[0])*pose[1]];
      const forward=norm(sub([0,pose[3],pose[4]],eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward);
      return this.h*pose[5]-up[2]/Math.max(.05,forward[2])*Math.min(this.w*1.2,this.h*.94);
    }
    prepareSky() {
      const image=this.art.images.valley;
      if(this.skyImage!==image) {
        if(!this.skyCanvas)this.skyCanvas=document.createElement('canvas');
        const sky=this.skyCanvas;sky.width=this.canvas.width;sky.height=this.canvas.height;
        const context=sky.getContext('2d'),w=this.w,h=this.h;
        // Aspect-aware crop: the painting's own horizon (row 312 of 720) sits on the
        // camera horizon, so narrow screens reveal its distant valley, not more ground.
        const horizon=clamp(this.horizonY(this.pose('dream')),h*.08,h*.6);
        const k=Math.max(w/image.width,horizon/312,(h-horizon)/(image.height-312));
        context.setTransform(sky.width/w,0,0,sky.height/h,0,0);
        context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
        context.drawImage(image,(w-image.width*k)/2,horizon-312*k,image.width*k,image.height*k);
        this.skyImage=image;
      }
    }
    paintedSky(c) {
      this.prepareSky();
      // Only the already-static sky is cached, at the exact backing resolution.
      c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(this.skyCanvas,0,0);c.restore();
    }
    pose(scene) {
      // [azimuth, distance, eye height, target height, target z, screen y of target(, screen x of feet)]
      // The original journey's cameras; Jelly/Moon/fold keep their authored foot framing.
      const base=[-.36,this.w<600?15:13,5.2,.9,6,.43];
      return ({corkscrew:[-.14,18,3.4,0,7,.46],dream:[-.42,21,18,0,7,.45],
        desktop:[-.12,18,8,.4,8,.46],crash:[-.12,18,8,.4,8,.46],
        stampede:[-.14,24,10,1,11,.47],coalesce:[-.12,24,8,3,14,.47],
        jelly:[-.34,17,6.4,1,6,.44,.36],moon:[-.32,19,6,1,6,.46,.36],collapse:[-.30,15,5.5,1,6,.45,.5]})[scene]||base;
    }
    camera(s) {
      this.s=s;this.hero=false;
      if(s.scene==='extreme') {
        this.neonCamera(s);return;
      }
      const b=s.projectionBlend, blend=smooth(s.sceneTime/1.2);
      const from=this.pose(s.previousScene), to=this.pose(s.scene);
      const pose=to.slice(0,6).map((v,i)=>mix(from[i],v,blend));
      if(s.scene==='collapse')pose.splice(0,6,...this.pose('collapse').slice(0,6));
      if(s.reducedMotion && !['corkscrew','jelly','moon'].includes(s.scene)) {
        const stable=this.pose('track');
        for(let i=0;i<pose.length;i++)pose[i]=mix(stable[i],pose[i],.4);
      }
      const angle=mix(-Math.PI/2,pose[0],b), distance=mix(24,pose[1],b);
      const target=[0,mix(0,pose[3],b),mix(0,pose[4],b)];
      const eye=[Math.sin(angle)*distance,mix(0,pose[2],b),target[2]-Math.cos(angle)*distance];
      const forward=norm(sub(target,eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward);
      // Lap one's flat view is anchored to the live Chromium runner (hero centre, ground row).
      const a=s.flatAnchor;this.anchor=a;
      const scale=mix(a?a.scale:this.w<600?23:28,Math.min(this.w*1.2,this.h*.94)/24,b);
      const fold=smooth(s.sceneTime/2.0);
      this.collapseScale=1-fold;
      const foldAngle=s.reducedMotion?0:fold*2.1;
      this.foldCos=Math.cos(foldAngle);this.foldSin=Math.sin(foldAngle);
      this.cam={eye,forward,right,up,b,focal:scale*24,
        cx:mix(a?a.cx:this.w*(this.w<600?.19:.22),this.w*.5,b),cy:mix(a?a.cy:this.h*.70,this.h*pose[5],b)};
      // Poses with an authored foot x frame the hero there; original poses keep their own framing.
      const natural=this.footScreen()[0],offset=p=>p[6]==null?0:this.w*p[6]-natural;
      this.cam.cx+=(s.scene==='collapse'?offset(this.pose('collapse')):mix(offset(from),offset(to),blend))*b;
      // A single rigid projected floor frame rotates about the hero's FOOT.
      // Nothing counter-rotates the hero: every jump's screen-space normal turns.
      if(['corkscrew','jelly','moon'].includes(s.scene)) {
        const ink=s.scene==='corkscrew',foot=this.footScreen();
        const x=this.w*(ink?.5:.36),y=ink?(this.h+70)/2:this.h*.66;
        const cfg=s.stageConfig,headroom=cfg?cfg.jump*cfg.jump/(2*cfg.gravity)+(cfg.bodyHeight||1.9):6.1;
        const safeTop=this.hudTop+this.hudSize+48;
        const maxK=ink?Math.min(this.w*.105,(this.h-130)/7.8,64):Math.min(this.w*.115,Math.max(10,(y-safeTop)/headroom),48);
        this.cam.focal*=Math.min(1,maxK/foot[2]);
        const moved=this.footScreen(),amount=smooth(s.sceneTime/1.2);
        this.cam.cx+=(x-moved[0])*amount;this.cam.cy+=(y-moved[1])*amount;
      }
      // The fold starts where the neon hero's feet were, at its size, then hands the
      // camera back to its own framing well before the Chromium pixel anchor.
      if(s.scene==='collapse' && this.foldFrom) {
        const k=smooth(s.sceneTime/1.1);
        if(k<1) {
          const natural=this.footScreen(),zoom=mix(clamp(this.foldFrom.height/(1.92*natural[2]),.6,2.5),1,k);
          this.cam.focal*=zoom;
          const moved=this.footScreen();
          this.cam.cx+=mix(this.foldFrom.x,natural[0],k)-moved[0];
          this.cam.cy+=mix(this.foldFrom.y,natural[1],k)-moved[1];
        }
      }
    }
    footScreen() {
      // Unrotated foot anchor; a floor rotation about this point leaves it fixed.
      const c=this.cam,d=sub([0,0,0],c.eye),z=dot(d,c.forward),k=c.focal/mix(24,Math.max(.35,z),c.b);
      return [c.cx+dot(d,c.right)*k,c.cy-dot(d,c.up)*k,k];
    }
    transform(p) {
      const s=this.s;let [x,y,z]=p;
      x+=Math.sin(z*.085)*this.visual.bend*smooth(Math.max(0,z)/12);
      y+=this.visual.lift;
      // The desktop falls away during the crash; an outgoing crash world keeps falling
      // from its own scenery clock while the live stampede camera/gameplay are untouched.
      const fall=s.scene==='crash'?s.sceneTime:!this.gameplay&&this.scenery?.scene==='crash'?this.scenery.sceneTime:null;
      if(fall!==null) {y-=fall*fall*7;x+=Math.sin(z)*fall;}
      if(s.scene==='collapse' && !this.gameplay && this.medium!=='chrome') {
        const k=this.collapseScale,co=this.foldCos,si=this.foldSin;
        const xx=x*co-y*si;
        y=(x*si+y*co)*k;x=xx*k;z*=k;
      }
      return [x,y,z];
    }
    view(p) {
      if(this.s.scene==='extreme')return [p[2],p[1],50+p[0]];
      const d=sub(this.transform(p),this.cam.eye);
      return [dot(d,this.cam.right),dot(d,this.cam.up),dot(d,this.cam.forward)];
    }
    project(p) {
      const c = this.cam, k = c.focal / mix(24, Math.max(.35, p[2]), c.b);
      const x=c.cx+p[0]*k,y=c.cy-p[1]*k,roll=this.s.worldRoll||0;
      if(!roll)return [x,y];
      const foot=this.footScreen(),dx=x-foot[0],dy=y-foot[1],co=Math.cos(roll),si=Math.sin(roll);
      return [foot[0]+dx*co-dy*si,foot[1]+dx*si+dy*co];
    }
    polygon(vertices, color, shade = 1, edge = null, viewed = false, cull = false) {
      // Leave 600 of the 2600 commands for the hero, nearest hazards, shadow and marker.
      if (this.cost >= (this.gameplay?2600:this.sceneryLimit)) return null;
      let v = viewed ? vertices : vertices.map(p => this.view(p));
      // Clip in camera space before division; geometry can safely pass behind the viewer.
      const clipped = [];
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length], ai = a[2] >= .35, bi = b[2] >= .35;
        if (ai) clipped.push(a);
        if (ai !== bi) {
          const t = (.35 - a[2]) / (b[2] - a[2]);
          clipped.push(a.map((n, j) => mix(n, b[j], t)));
        }
      }
      v = clipped;
      if (v.length < 3) return null;
      const points = v.map(p => this.project(p));
      if (points.every(p => p[0] < -2) || points.every(p => p[0] > this.w + 2) || points.every(p => p[1] < -2) || points.every(p => p[1] > this.h + 2)) return null;
      if (cull) {
        // Authored outlines are clockwise from outside: one screen winding test culls.
        let area = 0;
        for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; }
        if (area <= 0) return null;
      }
      const depth = v.reduce((n, p) => n + p[2], 0) / v.length;
      const fog = this.cam.b * clamp((depth - 28) / 100) * .6;
      if(this.medium==='ink-comic') {color=shade<.7?[33,28,33]:color[0]>color[1]*1.18?[214,54,52]:[248,231,196];shade=1;}
      else if(this.medium==='cel-cartoon')shade=shade<.8?.8:1.05;
      else if(this.medium==='pixel-16')shade=Math.round(shade*4)/4;
      const rgb = color.map((n, i) => Math.round(mix(clamp(n * shade, 0, 255), this.background[i], fog)));
      this.cost++;
      const face={ points, depth, layer: this.layer, color: `rgb(${rgb.join(',')})`, edge, width:this.edgeWidth, opacity:this.opacity??1, material:color.join(','), order: this.faces.length };
      (this.sink||this.faces).push(face);
      return face;
    }
    box(x, y, z, sx, sy, sz, color, angle = 0) {
      if(this.cost>=(this.gameplay?2600:this.sceneryLimit))return;
      const co = Math.cos(angle), si = Math.sin(angle);
      const verts = CUBE.map(p => this.view([x + p[0] * sx * co - p[1] * sy * si, y + p[0] * sx * si + p[1] * sy * co, z + p[2] * sz]));
      for (let f = 0; f < 6; f++) {
        const indices = FACES[f];
        const a = verts[indices[0]], b = verts[indices[1]], c = verts[indices[2]];
        // Positive-forward view coordinates reverse handedness.
        if (dot(cross(sub(b,a), sub(c,a)), a) <= 0) continue;
        this.polygon(indices.map(i => verts[i]), color, SHADE[f],null,true);
      }
    }
    // A fixed authored outline extruded once: one side quad per edge, two caps, all
    // culled by screen winding. Caps fill as a single path; no per-frame triangulation.
    extrude(outline,at,tone,tones,edge=null) {
      const near=[],far=[],sides=[],sink=this.sink;
      for(const p of outline){near.push(this.view(at(p[0],p[1],-p[2])));far.push(this.view(at(p[0],p[1],p[2])));}
      this.sink=sides;
      for(let i=0;i<outline.length;i++) {
        const j=(i+1)%outline.length,du=outline[j][0]-outline[i][0],dv=outline[j][1]-outline[i][1],len=Math.hypot(du,dv)||1;
        this.polygon([near[i],far[i],far[j],near[j]],tones[tone(-dv/len,du/len)],1,null,true,true);
      }
      this.sink=sink;
      sides.sort((a,b)=>b.depth-a.depth);
      for(const face of sides)(sink||this.faces).push(face);
      this.polygon(far.slice().reverse(),tones[1],1,null,true,true);
      this.edgeWidth=edge?1:null;
      this.polygon(near,tones[1],1,edge,true,true);
      this.edgeWidth=null;
    }
    group(depth,build) {
      // A hand-ordered part list keeps one depth against the world (no self-sorting fights).
      const parts=[],sink=this.sink;this.sink=parts;
      build();
      this.sink=sink;
      if(parts.length)(sink||this.faces).push({group:parts,depth,layer:this.layer,opacity:this.opacity??1,order:this.faces.length});
    }
    imageQuad(image,rect,vertices,anchor=null,billboard=false) {
      if(this.cost>=(this.gameplay?2600:this.sceneryLimit))return;
      const v=vertices.map(p=>this.view(p));
      if(v.some(p=>p[2]<.35))return;
      const points=v.map(p=>this.project(p));
      if(points.every(p=>p[0]<-2)||points.every(p=>p[0]>this.w+2)||points.every(p=>p[1]<-2)||points.every(p=>p[1]>this.h+2))return;
      const error=Math.hypot(points[0][0]+points[2][0]-points[1][0]-points[3][0],points[0][1]+points[2][1]-points[1][1]-points[3][1]);
      const affine=error<(billboard?.75:.05) || (billboard && error<Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])*.035);
      const units=affine?1:2;
      if(this.cost+units>(this.gameplay?2600:this.sceneryLimit))return;
      this.cost+=units;
      this.faces.push({image,rect,points,billboard,affine,units,opacity:this.opacity??1,depth:anchor?this.view(anchor)[2]:v.reduce((sum,p)=>sum+p[2],0)/4,layer:this.layer,order:this.faces.length});
    }
    sprite(frame,x,y,z,width,height) {
      if(!frame)return;
      const a=frame.anchor||[.5,1],r=norm([this.cam.right[0],0,this.cam.right[2]]);
      // Painted assets already contain an elevated perspective. Camera-facing up
      // avoids projecting that elevation twice; corners still traverse view/transform.
      const up=frame.billboard?this.cam.up:[0,1,0];
      const p=(u,v)=>[x+r[0]*(u-a[0])*width+up[0]*(a[1]-v)*height,y+up[1]*(a[1]-v)*height,z+r[2]*(u-a[0])*width+up[2]*(a[1]-v)*height];
      this.imageQuad(frame.image,frame.rect,[p(0,0),p(1,0),p(1,1),p(0,1)],[x,y,z],true);
    }
    pixelSprite(name,x,y,z,width,height) {
      const image=this.art.pixel[name];
      this.sprite({image,rect:[0,0,image.width,image.height],anchor:[.5,1]},x,y,z,width,height);
    }
    spriteRect(x,y,z,width,height,anchor=[.5,.92]) {
      // Screen bounds of a camera-facing sprite (for projected-overlap fades).
      const v=this.view([x,y,z]);if(v[2]<.35)return null;
      const p=this.project(v),k=this.cam.focal/mix(24,v[2],this.cam.b);
      return {left:p[0]-anchor[0]*width*k,right:p[0]+(1-anchor[0])*width*k,top:p[1]-anchor[1]*height*k,bottom:p[1]+(1-anchor[1])*height*k,depth:v[2]};
    }
    texture(c,f) {
      const [x,y,w,h]=f.rect,p=f.points,uv=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
      // A camera-facing sprite is one affine image, not two antialiased transparent halves.
      if(f.affine) {
        c.save();c.transform((p[1][0]-p[0][0])/w,(p[1][1]-p[0][1])/w,(p[3][0]-p[0][0])/h,(p[3][1]-p[0][1])/h,p[0][0],p[0][1]);
        c.drawImage(f.image,x,y,w,h,0,0,w,h);c.restore();return;
      }
      for(const tri of [[0,1,2],[0,2,3]]) {
        const [a,b,d]=tri.map(i=>p[i]),[u,v,t]=tri.map(i=>uv[i]);
        const det=(v[0]-u[0])*(t[1]-u[1])-(t[0]-u[0])*(v[1]-u[1]);
        const aa=((b[0]-a[0])*(t[1]-u[1])-(d[0]-a[0])*(v[1]-u[1]))/det;
        const bb=((b[1]-a[1])*(t[1]-u[1])-(d[1]-a[1])*(v[1]-u[1]))/det;
        const cc=((d[0]-a[0])*(v[0]-u[0])-(b[0]-a[0])*(t[0]-u[0]))/det;
        const dd=((d[1]-a[1])*(v[0]-u[0])-(b[1]-a[1])*(t[0]-u[0]))/det;
        c.save();c.beginPath();
        // Offset triangle EDGES, not radii: long thin ground strips still get half a pixel of coverage.
        const triangle=[a,b,d],sign=Math.sign((b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]))||1;
        const cover=(q,i)=>{
          if(f.billboard)return q;
          const before=triangle[(i+2)%3],after=triangle[(i+1)%3];
          const normal=(from,to)=>{const dx=to[0]-from[0],dy=to[1]-from[1],len=Math.hypot(dx,dy)||1;return [dy/len*sign,-dx/len*sign];};
          const u=normal(before,q),v=normal(q,after),k=Math.min(3,.6/Math.max(.05,1+u[0]*v[0]+u[1]*v[1]));
          return [q[0]+(u[0]+v[0])*k,q[1]+(u[1]+v[1])*k];
        };
        c.moveTo(...cover(a,0));c.lineTo(...cover(b,1));c.lineTo(...cover(d,2));c.closePath();c.clip();
        c.transform(aa,bb,cc,dd,a[0]-aa*u[0]-cc*u[1],a[1]-bb*u[0]-dd*u[1]);
        const pad=f.billboard?0:1;
        c.drawImage(f.image,x-pad,y-pad,w+pad*2,h+pad*2,x-pad,y-pad,w+pad*2,h+pad*2);c.restore();
      }
    }
    // Rounded, genuinely world-space solids. One depth command retains each solid's
    // silhouette; its visible facets are shaded inside, not outlined like a wireframe.
    organic(x,y,z,sx,sy,sz,color,lod=false,outline=true) {
      if(this.cost+4>(this.gameplay?2600:this.sceneryLimit))return;
      const ink=this.medium==='ink-comic';
      const depth=this.view([x,y,z])[2],size=Math.max(sx,sy,sz)*this.cam.focal/mix(24,Math.max(.35,depth),this.cam.b);
      // Three projected-size tiers. Big heads get a round contour, distant pack members stay cheap.
      const n=size>100?12:lod?(size>20?6:4):size<18?6:8,rows=size>100?6:lod||size<18?3:4;
      const topology=SOLIDS.get(n+':'+rows),viewed=this.solidView,all=[];
      for(let i=0;i<topology.vertices.length;i++) {
        const p=topology.vertices[i],v=this.view([x+p[0]*sx*.5,y+p[1]*sy*.5,z+p[2]*sz*.5]);
        if(v[2]<.35)return;
        viewed[i][0]=v[0];viewed[i][1]=v[1];viewed[i][2]=v[2];
        all.push(this.project(v));
      }
      const facets=[],centerDepth=depth;
      for(let f=0;f<topology.facets.length;f++) {
        const indices=topology.facets[f],i=f%n,j=Math.floor(f/n);
        const depth=(viewed[indices[0]][2]+viewed[indices[1]][2]+viewed[indices[2]][2]+viewed[indices[3]][2])/4;
        if(depth>centerDepth+.015)continue;
        const shade=ink?(i%3===0?.82:1):j===0?1.13:i<n/2?.83:1;
        facets.push({points:indices.map(i=>all[i]),depth,color:'rgb('+color.map(v=>Math.round(clamp(v*shade,0,255))).join(',')+')'});
      }
      const points=all.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const half=arr=>{const hull=[];for(const p of arr){while(hull.length>1&&turn(hull[hull.length-2],hull[hull.length-1],p)<=0)hull.pop();hull.push(p);}hull.pop();return hull;};
      const hull=half(points).concat(half(points.slice().reverse()));
      if(hull.length<3||hull.every(p=>p[0]<0)||hull.every(p=>p[0]>this.w)||hull.every(p=>p[1]<0)||hull.every(p=>p[1]>this.h))return;
      if(this.cost+facets.length+1>(this.gameplay?2600:this.sceneryLimit))return;
      this.cost+=facets.length+1;
      this.faces.push({points:hull,facets:facets.sort((a,b)=>b.depth-a.depth),color:facets[0].color,depth:centerDepth,layer:this.layer,order:this.faces.length,organic:true,outline,opacity:this.opacity??1,material:color.join(',')});
    }
    landingScale(s) {
      const t=1-clamp(s.impact/.32);
      // Feet/atlas anchors stay fixed. Original media keep their bouncy squash; the
      // sculpted Jelly/Moon/fold hero keeps its small, anatomy-safe compression.
      return 1-Math.sin(t*Math.PI*2)*(1-t)*(this.modern?.09:.24)*(s.reducedMotion?.35:1);
    }
    clearWave(s,z) {
      let pulse=0;
      for(const effect of s.effects) {
        if(effect.puff||effect.slam)continue;
        const age=effect.age-Math.max(0,z)/70;
        if(age>0 && age<.55)pulse=Math.max(pulse,Math.sin(age/.55*Math.PI)*(effect.big?1:.78));
      }
      return pulse*(s.reducedMotion?.25:1);
    }
    build(s) {
      const duration=({track:14,corkscrew:11,dream:12,desktop:11,stampede:16})[s.scene];
      if(!duration || !s.success)return 0;
      const progress=Math.max(s.sceneTime/duration,s.success/Math.max(1,s.target));
      return smooth((progress-.55)/.45)*(s.reducedMotion?.25:1);
    }
    drawnDino(s,o={}) {
      if(this.cost>=(this.gameplay?2600:this.sceneryLimit))return;
      const ink=this.medium==='ink-comic',k=o.scale||1,x=o.x||0,z=o.z||0,y=o.y??s.player.height;
      const recoil=o.boost||0;
      const squash=o.lod?1:this.landingScale(s)*(1+recoil*.23);
      const color=this.hero&&s.recovery>0?[231,144,69]:(o.color||(ink?[245,231,200]:[65,200,142]));
      const accent=ink?[210,57,55]:[255,149,61],dark=ink?[28,25,31]:[29,47,72];
      const run=recoil?recoil*.65:(s.player.grounded?Math.sin(s.distance*3.8)*.16:.14);
      let part=0;
      const ball=(px,py,pz,sx,sy,sz,c=color)=>this.organic(x+px*k,y+py*k*squash,z+(pz-recoil*py*.12)*k,sx*k/squash,sy*k*squash,sz*k/squash,c,!!o.lod,![3,5].includes(part++));
      if(o.lod) {
        // Near pack members retain the hero's neck and articulated feet. At distance,
        // merge hidden joints, not head/body proportions, leaving room for the city.
        const near=z<8;
        ball(0,.95,0,.95,1.2,1.18);
        if(near)ball(0,1.55,.38,.68,.83,.64);
        ball(0,1.9,ink?.67:.45,ink?.98:1.25,.85,ink?1.22:1.05);
        ball(0,.78,-.95,.58,.53,1.55);
        for(const side of [-1,1]) {
          if(near)ball(side*.32,.3,side*run,.44,.6,.69,accent);
          else this.polygon([[x+(side*.32-.22)*k,y+.05*k,z+side*run*k],[x+(side*.32+.22)*k,y+.05*k,z+side*run*k],[x+(side*.32+.17)*k,y+.58*k,z-.12*k],[x+(side*.32-.17)*k,y+.58*k,z-.12*k]],accent);
        }
        this.polygon([[x-.12*k,y+1.48*k,z-.27*k],[x,y+1.88*k,z-.39*k],[x+.12*k,y+1.48*k,z-.57*k]],accent,1,dark);
        return;
      }
      ball(0,.95,0,.95,1.2,1.18);ball(0,.73,-.73,.58,.53,1.1);ball(0,.95,-1.25,.27,.28,.7);
      ball(0,1.55,.38,.68,.83,.64);ball(0,1.9,ink?.67:.45,ink?.98:1.25,.85,ink?1.22:1.05);
      // The cel hero glances back at the player; its cheek and oversized eyes read from this camera.
      ball(0,1.62,ink?.91:.04,ink?.87:1.05,.30,.64,ink?accent:[255,223,142]);
      for(const side of [-1,1]) {
        ball(side*.32,.35,-.13+side*run,.4,.63,.48);ball(side*.32,.12,.04+side*run,.44,.24,.69,accent);
        if(!o.lod || k>1.5) {
          ball(side*.46,1.13,.52,.24,.22,.56);
          ball(side*(ink?.5:.34),2.06,ink?.77:.06,ink?.14:.38,.38,.23,[255,250,222]);
          ball(side*(ink?.57:.34),2.07,ink?.85:-.07,ink?.07:.17,.21,.09,dark);
          this.box(x+side*(ink?.55:.34)*k,y+2.28*k*squash,z+(ink?.77:.04)*k,(ink?.16:.42)*k,.07*k,.20*k,dark);
        }
      }
      for(let i=0;i<(o.lod?2:3);i++) {
        const zz=-.27-i*.36;
        this.polygon([[x-.12*k,y+(1.48-i*.14)*k*squash,z+zz*k],[x,y+(1.88-i*.16)*k*squash,z+(zz-.12)*k],[x+.12*k,y+(1.48-i*.14)*k*squash,z+(zz-.3)*k]],accent,1,dark);
      }
    }
    drawnCactus(z,scale=1,x=0,base=0) {
      const ink=this.medium==='ink-comic',color=ink?[220,59,54]:[120,85,209];
      const ball=(px,py,sx,sy)=>this.organic(x+px*scale,base+py*scale,z,sx*scale,sy*scale,.4*scale,color);
      ball(0,.74,.56,1.48);ball(-.35,.57,.65,.26);ball(-.58,.88,.31,.82);ball(.35,.43,.6,.26);ball(.58,.7,.32,.72);
      for(const side of [-1,1])this.box(x+side*.11*scale,base+.72*scale,z-.22*scale,.035*scale,.72*scale,.035,ink?[250,232,201]:[227,194,255]);
    }
    sculptedHero(s,o={}) {
      if(this.cost+44>(this.gameplay?2600:this.sceneryLimit))return;
      const fallback=this.medium==='gouache-fallback',e=smooth(s.extrusion),ext=mix(.035,1,e);
      const base=this.hero&&s.recovery>0?[202,116,65]:this.medium==='gummy'?[236,137,178]:this.medium==='lunar'?[222,224,240]:fallback?[72,170,142]:(this.anchor?this.theme.ink:GRAY).map((n,i)=>mix(n,CHROME[i],s.extrusion));
      const tones=[mixRGB(base,fallback?[34,62,78]:[22,28,64],.46*e),base,mixRGB(base,[255,255,255],.24*e)];
      const edge=mixRGB(base,[12,16,40],.62*e).map(Math.round);
      const accent=mixRGB(base,this.medium==='gummy'?[149,245,215]:this.medium==='lunar'?[150,175,216]:fallback?[244,190,76]:LIME,e);
      const y0=o.y??s.player.height,scale=this.anchor&&this.hero?mix(.87,1,smooth(s.projectionBlend/.35)):1;
      const squash=this.medium==='gummy'?Math.min(1,1-(1-this.landingScale(s))*2):this.landingScale(s),lean=s.player.stumble>0?-.1:0;
      const at=(z,y,x)=>[x*ext*scale/squash,y0+y*scale*squash,(z+lean*y)*scale];
      const grounded=s.player.grounded,phase=s.distance*1.7;
      const leg=(side,p)=>{
        // A planted foot sits exactly on the ground row; only the swinging foot lifts.
        const hip=side<0?[15.5,29]:[22.5,29];
        const stride=grounded?Math.sin(p)*3.2:side<0?2.4:-1.8,lift=grounded?Math.max(0,Math.cos(p))*3.4:2.4;
        const outline=LEG.map(([x,y],i)=>toHero([hip[0]+x+(i>1?stride:0),hip[1]+y-(i>1?lift:0),.1]));
        this.extrude(outline,(z,y,w)=>at(z,y,side*.25+w),heroTone,tones,side<0?edge:null);
      };
      const flat=(points,x,color,edgeColor=null)=>{this.edgeWidth=edgeColor?.8:null;this.polygon(points.map(p=>at(p[0],p[1],x)),color,1,edgeColor);this.edgeWidth=null;};
      this.group(this.view(at(0,.9,0))[2],()=>{
        leg(1,phase+Math.PI);
        flat(ARM,.37,tones[0]);
        this.extrude(HERO,at,heroTone,tones,edge);
        flat(HAUNCH,-.47,tones[2]);
        const grow=smooth((s.extrusion-.2)/.4);
        if(grow>0)for(const [a,apex,b] of SPIKES) {
          const tip=[mix((a[0]+b[0])/2,apex[0],grow),mix((a[1]+b[1])/2,apex[1],grow)];
          // Three modest dorsal spines: a lit and a shaded plane rising from the ridge.
          this.polygon([at(a[0],a[1],-.12),at(tip[0],tip[1],0),at(b[0],b[1],-.12)],mixRGB(accent,[255,255,255],.1),1,null,false,true);
          this.polygon([at(b[0],b[1],.12),at(tip[0],tip[1],0),at(a[0],a[1],.12)],mixRGB(accent,[30,60,40],.35),1,null,false,true);
        }
        // A three-quarter eye: dark pupil and a single glint, white like the page sprite when flat.
        const eye=e>.4?[16,22,40]:this.theme.page,ring=n=>Array.from({length:6},(_,i)=>{const a=i*Math.PI/3;return toHero([27.4+Math.cos(a)*n,4.6+Math.sin(a)*n,0]);});
        flat(ring(1.7),-.345,eye);
        if(e>.4)flat(ring(.55).map(p=>[p[0]+.03,p[1]+.03]),-.35,[236,255,214]);
        leg(-1,phase);
        flat(ARM,-.39,tones[1],edge);
      });
    }
    sculptedCactus(z,scale,x,base,color,layered=true) {
      if(this.cost+32>(this.gameplay?2600:this.sceneryLimit))return;
      const tones=[mixRGB(color,[10,26,48],.5),color,mixRGB(color,[236,255,246],.38)];
      const at=(u,v,d)=>[x-u*scale,base+v*scale,z+d*scale];
      this.group(this.view(at(0,.7,0))[2],()=>{
        this.extrude(CACTUS,at,cactusTone,tones,mixRGB(color,[6,14,30],.68).map(Math.round));
        // Two facet planes on the trunk give it a lit ridge, not a block outline.
        if(layered) {
          this.polygon([at(-.17,.16,-.21),at(-.04,.19,-.21),at(-.04,1.32,-.17),at(-.17,1.26,-.17)],tones[2]);
          this.polygon([at(.07,.19,-.21),at(.17,.16,-.21),at(.17,1.26,-.17),at(.07,1.32,-.17)],mixRGB(tones[1],tones[0],.45));
        }
      });
    }
    softShadow(x,z,rx,rz,color,alpha) {
      // Three bounded 24-vertex world ellipses at low opacity: a faint penumbra
      // that darkens towards a small contact core, never a flat blob.
      if(alpha<=.01)return;
      const layer=this.layer;this.layer=3;
      for(const [r,a] of [[1,.28],[.68,.34],[.38,.5]]) {
        this.opacity=alpha*a;
        this.polygon(Array.from({length:24},(_,i)=>{const t=i*Math.PI/12;return [x+Math.cos(t)*rx*r,.02,z+Math.sin(t)*rz*r];}),color);
      }
      this.opacity=1;this.layer=layer;
    }
    paintedWorld(s) {
      this.layer=0;
      const image=this.art.images.valley,rect=this.art.groundSample;
      // Sampled real brushwork travels along the same bent world-space path.
      for(let i=-5;i<27;i++) {
        const z=i*3-s.distance%3;
        // A continuous 48-unit brushwork sample, mirrored at its ends: no repeated strip seams.
        const worldIndex=i+Math.floor(s.distance/3);
        const phase=((worldIndex%16)+16)%16,row=phase<8?phase:15-phase;
        for(const side of [-1,0,1]) {
          const x=side*7,cut=[rect[0]+(side+1)*rect[2]/3,rect[1]+row*rect[3]/8,rect[2]/3,rect[3]/8];
          const front=z-1.51,back=z+1.51;
          const a=phase<8?front:back,b=phase<8?back:front;
          const pieces=z<24?2:1;
          for(let j=0;j<pieces;j++) {
            const za=mix(a,b,j/pieces),zb=mix(a,b,(j+1)/pieces);
            this.imageQuad(image,[cut[0],cut[1]+cut[3]*j/pieces,cut[2],cut[3]/pieces],[[x-3.5,-.08,za],[x+3.5,-.08,za],[x+3.5,-.08,zb],[x-3.5,-.08,zb]]);
          }
        }
      }
      this.layer=2;
      // Light occlusion fix: a near prop fades before its projected silhouette meets
      // the hero's or the next hazard's (the props, rhythm and sizes are unchanged).
      const live=this.live,next=live.obstacles?.find(o=>!o.resolved&&o.kind!=='ceiling'&&o.z>-.4);
      const keep=[this.spriteRect(0,live.player.height,0,2.6,3.1,[.66,.92]),next?this.spriteRect(0,0,next.z,1.6,1.65):null].filter(Boolean);
      const prop=(frame,x,z,width,height)=>{
        const r=this.spriteRect(x,0,z,width,height,frame.anchor);if(!r)return;
        let alpha=1;
        for(const k of keep) {
          if(r.depth>k.depth+8)continue;
          alpha=Math.min(alpha,smooth(Math.max(r.left-k.right,k.left-r.right,r.top-k.bottom,k.top-r.bottom)/36));
        }
        if(alpha<=.02)return;
        this.opacity=alpha;this.sprite(frame,x,0,z,width,height);this.opacity=1;
      };
      for(let i=0;i<10;i++)for(const side of [-1,1]) {
        const worldIndex=i+Math.floor(s.sceneDistance/8);
        const z=5+i*8-s.sceneDistance%8,x=side*(7.2+(worldIndex%3)*2.1),size=(3.3+(worldIndex%4)*.8)*smooth((z-1)/8);
        const names=['mushroom','cactus','boulder','arch'];
        const breath=this.clearWave(s,z)*.17+this.build(s)*.018*Math.sin(s.beat*Math.PI-z*.09);
        // Breathe the actual painted cutouts, not a synthetic replacement or glow pass.
        prop(this.art.frames[names[(worldIndex+s.variant+(side>0?1:0))%4]],x,z,size*(1-breath*.35),size*(1+breath));
        if(worldIndex%4===0)prop(this.art.frames.mushroom,side*(15+worldIndex%9),z+9,size*2.2,size*2.2);
      }
    }
    chromeImage() {
      const set=this.chrome.sheets[this.chrome.hidpi?'2x':'1x']||this.chrome.sheets['1x']||this.chrome.sheets['2x'];
      if(!set)return null;
      return {image:this.theme.dark?set.dark:set.light,k:set.light.naturalWidth>2000?2:1};
    }
    chromeHero(s,options) {
      const sheet=this.chromeImage(),a=this.anchor;
      if(!sheet||!a)return;
      const k=sheet.k,frame=s.player.grounded?(s.heroFrame??88):0;
      // Rows 93..140 of the 150px runner; ground (world y=0) is runner row 134.
      this.sprite({image:sheet.image,rect:[frame*k+(k===2?1678:848),2,44*k,47*k],anchor:[.5,41/47],billboard:true},
        0,options.y??s.player.height,0,44/a.scale,47/a.scale);
    }
    chromeHorizon(s) {
      const sheet=this.chromeImage(),a=this.anchor;
      if(!sheet||!a)return;
      const k=sheet.k,unit=a.scale,rupture=s.scene==='rupture';
      const origin=a.heroX+22, scroll=(s.distance-(a.distance||0))*unit;
      const [zMin,zMax]=this.chromeSpan(s),uMin=origin+zMin*unit,uMax=origin+zMax*unit;
      const base=Math.min(a.horizonX[0],a.horizonX[1])-scroll;
      const first=a.horizonX[0]<=a.horizonX[1]?0:1;
      const top=7/unit,bottom=-5/unit,step=rupture?8:40;
      this.layer=0;
      for(let j=Math.floor((uMin-base)/600);j<=Math.floor((uMax-base)/600);j++) {
        const start=base+j*600,src=j===0?a.horizonSrc[first]:j===1?a.horizonSrc[1-first]:(Math.sin(j*91.7)*43758.5453%1+1)%1>.5?600:0;
        // Interior slices stay on whole runner pixels; only the escaping ends are partial.
        for(let n=Math.max(0,Math.floor((uMin-start)/step));start+n*step<Math.min(start+600,uMax);n++) {
          const u=Math.max(start+n*step,uMin),v=Math.min(start+(n+1)*step,start+600,uMax);
          if(v<=u)continue;
          const za=(u-origin)/unit,zb=(v-origin)/unit;
          const ra=rupture?this.ripple(s,za):0,rb=rupture?this.ripple(s,zb):0;
          this.imageQuad(sheet.image,[(2+(u-start))*k+src,52*k,(v-u)*k,12*k],[[0,top+ra,za],[0,top+rb,zb],[0,bottom+rb,zb],[0,bottom+ra,za]]);
        }
      }
    }
    chromeSpan(s) {
      // The line starts exactly at the runner box, then tears out to the viewport edges.
      const a=this.anchor,unit=a.scale,origin=a.heroX+22;
      const grow=s.scene==='collapse'?1-smooth(s.sceneTime/2.25):s.scene==='rupture'?smooth(s.sceneTime/(s.reducedMotion?1.6:1.0)):1;
      const lo=mix(-origin,Math.min(-a.left-origin,-14*unit),grow),hi=mix(a.width-origin,Math.max(this.w-a.left-origin,70*unit),grow);
      return [lo/unit,hi/unit];
    }
    ripple(s,z) {
      // Lap one holds the runner's exact line for its first frames, then the wave builds.
      const hold=smooth((s.sceneTime-.06)/.3);
      return Math.sin(z*.9-s.sceneTime*6)*Math.exp(-Math.abs(z)/14)*Math.sin(clamp(s.sceneTime/1.35)*Math.PI)*(s.reducedMotion?.35:.85)*hold;
    }
    dino(s, options={}) {
      if(this.medium==='chrome') {this.chromeHero(s,options);return;}
      if(this.modern) {this.sculptedHero(s,options);return;}
      const landing=options.lod?1:this.landingScale(s);
      if(this.medium==='ai-gouache') {
        const frame=!s.player.grounded?'jump':s.mode==='idle'?'idle':Math.floor(s.distance*2)%2?'runA':'runB';
        this.sprite(this.art.frames[frame],options.x||0,options.y??s.player.height,options.z||0,2.6*(options.scale||1)/landing,3.1*(options.scale||1)*landing);return;
      }
      if(['ink-comic','cel-cartoon','gouache-fallback'].includes(this.medium)){this.drawnDino(s,options);return;}
      const ext = mix(.035, 1, smooth(s.extrusion));
      const color = options.color || (this.hero && s.recovery>0 ? [202,116,65] : null) || (this.anchor?this.theme.ink:GRAY).map((n, i) => mix(n, s.scene==='dream'?[64,78,133][i]:CHROME[i], s.extrusion));
      const y = options.y ?? s.player.height, run = s.player.grounded ? Math.sin(s.distance * 3.8) * .17 : .10;
      const lean = s.player.stumble > 0 ? -.12 : 0;
      // Lap one: the volumetric hero starts at the runner sprite's height, then grows.
      const scale=options.scale || (s.scene==='dream'?1+s.morph*.10:this.anchor&&this.hero?mix(.87,1,smooth(s.projectionBlend/.35)):1);
      const squash=options.lod?1:this.landingScale(s);
      let index=0;
      const part = (x,py,z,sx,sy,sz,c=color) => {
        const split=options.fragment||0, n=index++;
        this.box((options.x||0)+x*ext*scale+Math.sin(n*2.4)*split,y+py*scale*squash+Math.cos(n*1.2)*split,
          (options.z||0)+(z+lean*py)*scale+Math.sin(n*1.8)*split,sx*ext*scale/squash,sy*scale*squash,sz*scale,c,split*.12);
      };
      if(options.lod) {
        part(0,.9,0,.65,.85,.85);part(0,1.6,.45,.7,.9,.75);
        part(0,.83,-.75,.35,.28,.85);
        part(-.23,.28,-.1+run,.22,.56,.35);part(.23,.28,-.1-run,.22,.56,.35);
        part(0,1.35,-.3,.18,.15,.3,GREEN);return;
      }
      part(0,.96,-.04,.68,.86,.96); // body
      part(0,1.40,.31,.53,.65,.48); // upright neck
      part(0,1.85,.66,.79,.65,.96); // oversized square head
      part(0,1.42,.80,.70,.16,.73); // jaw joins the neck, leaving a small mouth gap below the head
      part(0,.88,-.77,.46,.35,.75); part(0,1.03,-1.23,.27,.23,.42); // stepped tail
      part(-.39,1.10,.52,.13,.15,.40); part(.39,1.10,.52,.13,.15,.40); // little arms
      part(-.23,.36,-.18+run,.23,.65,.27); part(.23,.36,-.18-run,.23,.65,.27);
      part(-.23,.09,run,.27,.18,.48); part(.23,.09,-run,.27,.18,.48);
      const eye = s.extrusion > .4 ? [13,25,37] : [247,247,247];
      part(-.403,1.99,.76,.018,.14,.14, eye); part(.403,1.99,.76,.018,.14,.14, eye);
      if (s.extrusion > .4) {
        part(-.416,2.01,.78,.015,.05,.05,[203,255,130]);
        part(.416,2.01,.78,.015,.05,.05,[203,255,130]);
        // A bright dorsal ridge maintains the dinosaur silhouette from the rear.
        for (let i = 0; i < 4; i++) part(0,1.40-i*.12,-.26-i*.23,.18,.15,.14,GREEN);
      }
    }
    cactus(z, extrusion, scale = 1, x = 0, base = 0, color = null, tilt = 0) {
      if(this.medium==='ai-gouache'){this.sprite(this.art.frames.cactus,x,base,z,1.6*scale,1.65*scale);return;}
      if(['ink-comic','cel-cartoon','gouache-fallback'].includes(this.medium)){this.drawnCactus(z,scale,x,base);return;}
      // Jelly/Moon/fold keep the joined sculpted hazard, in their own material.
      if(this.modern){this.sculptedCactus(z,scale,x,base,color||(this.medium==='gummy'?[214,45,99]:this.medium==='lunar'?[178,205,239]:[36,206,190]));return;}
      const ext = mix(.035, .64, smooth(extrusion));
      const c = color || GRAY.map((n, i) => mix(n, GREEN[i], extrusion));
      const spread = smooth(extrusion);
      const box = (px,py,pz,sx,sy,sz) => {
        const xx=px*scale, yy=py*scale;
        this.box(x+xx*Math.cos(tilt)-yy*Math.sin(tilt),base+xx*Math.sin(tilt)+yy*Math.cos(tilt),z+pz*scale,sx*scale,sy*scale,sz*scale,c,tilt);
      };
      // The flat branches grow lateral volume as well as depth: still readable from behind.
      box(0,.65,0,ext*.62,1.3,.25);
      box(-.30*spread,.62,-.25,ext,.20,.65);
      box(-.51*spread,.89,-.51,ext*.38,.65,.20);
      box(.30*spread,.46,.27,ext,.19,.69);
      box(.51*spread,.68,.56,ext*.38,.52,.19);
    }
    world(s) {
      if(s.scene==='jelly'){this.jellyWorld(s);return;}
      if(s.scene==='moon'){this.moonWorld(s);return;}
      if(s.scene==='collapse'){this.foldRibbon(s);return;}
      if(!['offline','rupture','extrusion','track','breath'].includes(s.scene)) {this.showWorld(s);return;}
      const e = smooth(s.extrusion), b = s.projectionBlend, chrome=this.medium==='chrome', a=this.anchor;
      this.layer=0;
      const width = mix(.035,5.8,e);
      const travel = s.distance % 3;
      // Anchored lap-one views reach the viewport edges, not the old fixed span.
      const zLo=a?Math.min(-15,Math.floor((-this.cam.cx/a.scale-2)/3)*3):-15, zHi=a?Math.max(84,(this.w-this.cam.cx)/a.scale+3):84;
      if(chrome)this.chromeHorizon(s);
      else for (let i = Math.round(zLo/3); i < Math.ceil(zHi/3)+1; i++) {
        const z = i * 3 - travel;
        const ripple = s.scene === 'rupture' ? this.ripple(s,z) : 0;
        const color = this.base.map((n,j) => mix(n,(i%2 ? [34,38,65] : [40,44,72])[j],e));
        this.box(0,ripple-.10,z,width,.20,3.015,color);
        if (e > .02) {
          const light=this.clearWave(s,z)+this.build(s)*.18*(.5+.5*Math.sin(z*.55-s.beat*Math.PI*2));
          for (const side of [-1,1]) this.box(side*width*.5,ripple+.015,z,.045+light*.12,.035,3.02,[103+light*90,224,233-light*65]);
          // One sparse centre dash, not a wallpaper grid.
          if (i%2 === 0) this.box(0,ripple+.018,z,.06,.025,.75,[116,123,153]);
        }
      }
      if (e < .01 && s.scene !== 'rupture' && !chrome) {
        this.box(0,-.10,28,.06,.035,100,GRAY);
      }
      this.layer=2;
      const tear = s.scene==='rupture' ? smooth(s.sceneTime/1.35) : s.scene==='extrusion' ? 1-smooth(s.sceneTime/1.4) : 0;
      if(tear>0) {
        const edge=[];
        let lo=Math.min(-10,Math.floor(zLo/3)),hi=Math.max(22,Math.ceil(zHi/3));
        // Lap one: the tear opens only under the line that has already escaped its box.
        if(a){const span=this.chromeSpan(s);lo=Math.ceil(span[0]/3);hi=Math.floor(span[1]/3);this.opacity=smooth(tear/.2);}
        for(let i=lo;i<=hi;i++) {
          const z=i*3;
          edge.push([-.08,-.24-Math.abs(Math.sin(i*2.9))*.28*tear,z]);
        }
        for(let i=hi;i>=lo;i--) {
          const z=i*3;
          edge.push([-.08,-.24-tear*(1.6+Math.abs(Math.sin(i*1.7))*1.3)*Math.exp(-Math.abs(z)/52),z]);
        }
        if(hi>lo)this.polygon(edge,[24,20,43]);
        this.opacity=1;
      }
      if (e > .01) {
        // The original page physically folds into two wings off the unfolding ribbon.
        const fold = smooth(s.extrusion), wing = mix(0,1.45,fold);
        this.layer=-1;
        if (fold < .995) for (const side of [-1,1]) {
          const x = side * width / 2;
          this.polygon([[x,-.15,-10],[x,-.15,60],[x+side*26*Math.cos(wing),-26*Math.sin(wing),60],[x+side*26*Math.cos(wing),-26*Math.sin(wing),-10]],a?this.theme.page.map(n=>mix(n,237,.04)):[237,239,247]);
        }
        this.layer=2;
        // Suspended, faceted sun: a solid object with a rotating equatorial ring.
        const z = 67, y = 14, radius = 12 * e;
        const top = [0,y+radius,z], bottom = [0,y-radius,z];
        const ring = Array.from({length:8},(_,i) => { const a = i*Math.PI/4 + (s.reducedMotion ? .2 : s.simTime*.035); return [Math.cos(a)*radius,y, z+Math.sin(a)*radius]; });
        for (let i=0;i<8;i++) {
          this.polygon([top,ring[i],ring[(i+1)%8]],[244,108,175],.55+i*.055);
          this.polygon([bottom,ring[(i+1)%8],ring[i]],[117,76,199],.6+i*.04);
        }
        // Broad folded fins open with the first drop, leaving the central corridor clear.
        for (let i=0;i<7;i++) for (const side of [-1,1]) {
          const zf = 8+i*8 - (s.distance*.35)%8, x = side*(7+i*.35);
          const wave=this.clearWave(s,zf);
          const h = (5+(i%3)*4)*e*(1+wave*.26);
          this.polygon([[x,0,zf-3],[x+side*7,h,zf+2],[x+side*3,0,zf+5]],[66+wave*45,51+wave*65,116+wave*55],.8+i*.05);
          this.polygon([[x,0,zf-3],[x+side*7,h,zf+2],[x+side*9,0,zf-1]],[37,33,77]);
        }
        for (const m of s.monuments) {
          // Monumental scenery recedes before it can engulf the near camera/corridor.
          const wave=this.clearWave(s,m.z),grow = smooth(m.age / 1.0)*smooth((m.z-2)/10), h = m.scale * grow*(1+wave*.18);
          if(h<.05)continue;
          const x = m.side*(5.5+h*.4);
          this.cactus(m.z,1,h,x,-.1,m.side < 0 ? [145,105,225] : [72,169,186],m.side*.12*grow);
          // Later laps unfold paired arches, with the same clear central corridor.
          const unfold=s.variant?smooth(m.age/1.4):0;
          this.box(x*.5,h*.95,m.z,Math.abs(x),.16+wave*.25,.45,[174+wave*55,233,241-wave*60],m.side*unfold*.25);
          if(s.variant) {
            this.cactus(m.z+2,1,h*.72,-x,-.1,[94,189,183],-m.side*.25*unfold);
            this.box(0,h*1.15,m.z,Math.abs(x)*1.6,.32,.65,[212,191,244],Math.sin(unfold*Math.PI)*.15);
          }
          this.layer=-1;
          this.box(x,-1.1,m.z,h*1.3,1.8,h*1.1,[38,44,70]);
          this.layer=2;
        }
      }
      this.rewards(s);
    }
    foldRibbon(s) {
      // The native fold: only the quiet dark ribbon and its one hero return to the page.
      const e=smooth(s.extrusion),chrome=this.medium==='chrome',a=this.anchor,width=mix(.035,5.8,e),travel=s.distance%3;
      const zLo=a?Math.min(-15,Math.floor((-this.cam.cx/a.scale-2)/3)*3):-15, zHi=a?Math.max(84,(this.w-this.cam.cx)/a.scale+3):84;
      this.layer=0;
      if(chrome)this.chromeHorizon(s);
      else for(let i=Math.round(zLo/3);i<Math.ceil(zHi/3)+1;i++) {
        const z=i*3-travel;
        this.layer=0;this.box(0,-.10,z,width,.20,3.015,this.base.map((n,j)=>mix(n,(i%2?[29,32,57]:[31,34,60])[j],e)));
        if(e>.02) {
          this.layer=1;
          for(const side of [-1,1]) {
            const x0=side*(width*.5-.03),x1=side*(width*.5+.015);
            this.polygon([[x0,.004,z-1.5],[x1,.004,z-1.5],[x1,.004,z+1.5],[x0,.004,z+1.5]],[64,150,172]);
          }
          if(i%2===0)this.polygon([[-.025,.004,z-.35],[.025,.004,z-.35],[.025,.004,z+.35],[-.025,.004,z+.35]],[66,72,108]);
        }
      }
      if(e<.01 && !chrome){this.layer=0;this.box(0,-.10,28,.06,.035,100,GRAY);}
      this.layer=2;
    }
    jellyWorld(s) {
      this.layer=0;
      // A bounded glassy road: an opaque base plus a few local gloss facets.
      for(let i=-5;i<29;i++) {
        const z=i*3-s.distance%3;
        this.polygon([[-2.9,0,z],[2.9,0,z],[2.9,0,z+3.02],[-2.9,0,z+3.02]],[92,186,179]);
        this.polygon([[-2.7,.012,z],[2.7,.012,z],[2.7,.012,z+3.02],[-2.7,.012,z+3.02]],[148,223,208]);
        for(const side of [-1,1]) {
          const x=side*2.55;
          this.polygon([[x,.02,z],[x+side*.16,.02,z],[x+side*.16,.02,z+3],[x,.02,z+3]],[214,249,229]);
        }
        if(i%3===0){this.opacity=.26;this.polygon([[-2.3,.025,z],[.3,.025,z+.7],[1.7,.025,z+1],[-1.4,.025,z+.4]],[255,255,245]);this.opacity=1;}
      }
      this.layer=2;
      for(let i=0;i<8;i++)for(const side of [-1,1]) {
        const z=i*10+5-s.distance%10,x=side*(6.6+(i%3)*1.5),h=2.2+(i%3)*.65;
        const kick=this.clearWave(s,z)*.6,drive=0;
        const sway=s.reducedMotion?0:Math.sin(s.simTime*(2.1+drive*.45)+i)*(.10+drive*.07)+Math.sin(kick*5+i)*kick*.65;
        const jelly=s.reducedMotion?1:1+kick*.42*Math.sin(s.simTime*12+i);
        // Soft, rooted gumdrop caps with rounded shoulders, not floating crystals.
        const stem=[[-.24,0],[-.32,.12],[-.30,h*.55],[.30,h*.55],[.32,.12],[.24,0]];
        this.polygon(stem.map(([a,b])=>[x+a,b,z]),[108,178,157]);
        const cap=Array.from({length:24},(_,j)=>{const t=j*Math.PI/12;return [x+Math.cos(t)*h*.48*jelly+sway,h*.67+Math.sin(t)*h*.34/jelly,z-.04];});
        this.opacity=.9;this.polygon(cap,i%3===0?[235,163,192]:[109,194,166],1,[91,157,148]);this.opacity=1;
        this.opacity=.3;
        this.polygon(Array.from({length:16},(_,j)=>{const t=j*Math.PI/8;return [x-h*.15+Math.cos(t)*h*.16+sway,h*.83+Math.sin(t)*h*.09,z-.06];}),[255,255,231]);
        this.opacity=1;
      }
    }
    canopy(o) {
      const z=o.z,y=o.ceilingHeight;
      // The rounded cherry slab has an opaque, flat underside at EXACTLY the
      // published head-contact plane. Supports stay beyond the lane's margins.
      this.layer=4;
      const rim=[213,55,108],top=[247,139,174],side=[157,43,90];
      for(const x of [-3.2,3.2]) {
        const post=[[-.14,.12],[-.12,0],[.12,0],[.14,.12],[.14,y+.4],[-.14,y+.4]];
        this.polygon(post.map(([a,b])=>[x+a,b,z]),rim);
        this.polygon([[x-.07,.18,z-.02],[x-.02,.18,z-.02],[x-.02,y+.3,z-.02],[x-.07,y+.3,z-.02]],top);
      }
      this.polygon([[-3.0,y,z-.4],[3.0,y,z-.4],[3.0,y,z+.4],[-3.0,y,z+.4]],side,1,[111,36,72]);
      const front=[];
      for(const [cx,cy,start] of [[3.0,y+.3,-Math.PI/2],[3.0,y+.36,0],[-3.0,y+.36,Math.PI/2],[-3.0,y+.3,Math.PI]])
        for(let j=0;j<=4;j++){const a=start+j*Math.PI/8;front.push([cx+Math.cos(a)*.3,cy+Math.sin(a)*.3,z-.4]);}
      this.polygon(front,rim,1,[142,43,85]);
      this.polygon([[-2.95,y+.66,z-.4],[2.95,y+.66,z-.4],[2.95,y+.66,z+.4],[-2.95,y+.66,z+.4]],top);
      this.polygon([[-2.65,y+.51,z-.41],[1.8,y+.51,z-.41],[2.2,y+.58,z-.41],[-2.4,y+.58,z-.41]],[255,197,211]);
      this.layer=1;this.opacity=.65;
      for(const x of [-1.1,0,1.1])this.polygon([[x-.3,.03,z-.4],[x+.3,.03,z-.4],[x+.3,.03,z+.4],[x-.3,.03,z+.4]],[178,80,121]);
      this.opacity=1;
    }
    moonWorld(s) {
      this.layer=0;
      // Flat regolith corridor: the distant member of a pair is never hidden by
      // a curved planet mesh. Only the non-colliding backdrop suggests a globe.
      for(let i=-3;i<12;i++) {
        const z=i*10-s.distance%10;
        this.layer=0;
        this.polygon([[-110,-.08,z],[110,-.08,z],[110,-.08,z+10.03],[-110,-.08,z+10.03]],i%2?[154,150,175]:[155,151,176]);
        this.layer=1;
        this.polygon([[-2.9,0,z],[2.9,0,z],[2.9,0,z+10.03],[-2.9,0,z+10.03]],[180,176,196]);
        for(const side of [-1,1])this.polygon([[side*2.9,.01,z],[side*3.02,.01,z],[side*3.02,.01,z+10],[side*2.9,.01,z+10]],[211,205,219]);
      }
      this.layer=2;
      for(let i=0;i<8;i++)for(const side of [-1,1]) {
        const z=i*12+4-s.distance%12,x=side*(7.5+i%3*3),r=1.5+i%3*.6;
        const ring=(rad,y)=>Array.from({length:16},(_,j)=>{const a=j*Math.PI/8;return [x+Math.cos(a)*rad,y,z+Math.sin(a)*rad*.8];});
        this.polygon(ring(r,.015),[121,117,145]);
        const outer=ring(r,.02),inner=ring(r*.72,.025);
        for(let j=0;j<16;j++)this.polygon([outer[j],outer[(j+1)%16],inner[(j+1)%16],inner[j]],j<8?[203,196,214]:[144,137,163]);
        this.polygon(ring(r*.60,.03),[138,131,157]);
      }
    }
    lunarSky(c) {
      const w=this.w,h=this.h;
      c.fillStyle='#b8b5cd';
      for(let i=0;i<24;i++){const x=((i*173.7+37)%997)/997*w,y=((i*93.3+19)%317)/317*h*.35;c.fillRect(x,y,i%5?1:2,i%5?1:2);}
      const x=w*.78,y=h*.16,r=Math.min(w,h)*.034;
      c.fillStyle='#99b9dd';c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
      c.fillStyle='#e1e5e3';c.beginPath();c.ellipse(x-r*.2,y-r*.15,r*.6,r*.3,-.4,0,Math.PI*2);c.fill();
      c.fillStyle='#5d839f';c.beginPath();c.ellipse(x+r*.2,y+r*.28,r*.5,r*.25,.5,0,Math.PI*2);c.fill();
      // Curved distant silhouette is scenery behind the flat playable floor.
      c.fillStyle='#817b9b';c.beginPath();c.ellipse(w*.56,h*.87,w*.92,h*.43,0,0,Math.PI*2);c.fill();
    }
    palette(scene) {
      return ({corkscrew:[245,231,203],jelly:[179,233,224],dream:[250,208,167],desktop:[77,102,162],crash:[35,64,162],stampede:[105,205,237],coalesce:[105,205,237],moon:[39,36,65],extreme:[17,13,43],breath:[247,247,247]})[scene] || [9,11,29];
    }
    runway(s,style) {
      const colors={corkscrew:[[245,223,164],[231,206,144],[37,44,64]],dream:[[210,192,231],[226,211,240],[115,88,157]],
        desktop:[[127,148,190],[113,132,175],[241,219,150]],stampede:[[255,148,83],[255,171,93],[255,246,206]],
        ending:[[255,148,83],[255,171,93],[255,246,206]]};
      const c=(colors[style]||colors.ending).map(v=>v.slice());
      const pulse=Math.exp(-(s.beat%1)*6);
      c[2]=c[2].map(n=>Math.min(255,n+pulse*20));
      const wide=['stampede','ending'].includes(style)?5.8+7.5*smooth((s.echoes-1)/16):5.8;
      this.layer=0;
      for(let i=-5;i<26;i++) {
        const z=i*3-s.distance%3;
        this.polygon([[-wide/2,0,z-1.51],[wide/2,0,z-1.51],[wide/2,0,z+1.51],[-wide/2,0,z+1.51]],c[Math.abs(i)%2]);
        const light=this.clearWave(s,z),drive=this.build(s)*(.5+.5*Math.sin(z*.6-s.beat*Math.PI*2));
        for(const side of [-1,1])this.box(side*wide*.5,.016,z,.055+light*.14+drive*.025,.035,3.01,c[2]);
        if(style==='desktop') {
          this.box(0,.025,z+1.12,wide-.15,.03,.35,[58,88,151]);
          this.box(-1.5,.028,z-.15,1.8,.03,.11,[154,168,187]);
          this.box(-1.5,.028,z-.48,1.8,.03,.11,[154,168,187]);
          this.box(1.7,.028,z-.25,.65,.03,.55,[187,200,216]);
        } else if(i%2===0) this.box(0,.025,z,.06,.03,.7,c[2]);
      }
    }
    windowBox(x,y,z,w,h,seed=0,player=false,hazard=false) {
      if(this.medium==='pixel-16') {
        const landing=player?this.landingScale(this.s):1;
        // Hazard windows and background windows use distinct 16-bit sprites.
        this.pixelSprite(player?(Math.floor(this.s.distance*2)%2?'windowA':'windowB'):hazard?'hazard':'decor',x,y,z,w/landing,h*landing);
        return;
      }
      this.box(x,y+h*.5,z,w,h,.20,[229,235,241]);
      this.box(x,y+h*.86,z-.115,w*.96,h*.20,.035,player?(this.s.recovery>0?[157,83,42]:[41,94,108]):[57,83,155]);
      this.box(x+w*.39,y+h*.86,z-.145,w*.085,h*.10,.03,[248,206,167]);
      if(player) {
        // The player itself is a dimensional window, with a tiny voxel dinosaur inside.
        const ink=[46,77,91];
        this.box(x-.05,y+h*.42,z-.14,w*.29,h*.30,.05,ink);
        this.box(x+w*.12,y+h*.61,z-.14,w*.33,h*.19,.05,ink);
        this.box(x-w*.25,y+h*.39,z-.14,w*.28,h*.08,.05,ink);
        for(const side of [-1,1])this.box(x+side*w*.09,y+h*.19,z-.14,w*.07,h*.19,.05,ink);
        this.box(x+w*.19,y+h*.65,z-.18,w*.03,h*.03,.04,[240,251,233]);
      } else {
        this.box(x-w*.28,y+h*.47,z-.14,w*.11,h*.23,.04,[221,109,91]);
        this.box(x+w*.09,y+h*.52,z-.14,w*.43,h*.05,.04,[137,151,171]);
        this.box(x+w*.03,y+h*.39,z-.14,w*.30,h*.05,.04,[137,151,171]);
        this.box(x+w*.21,y+h*.17,z-.14,w*.29,h*.14,.04,seed%2?[171,193,211]:[196,202,219]);
      }
    }
    corkscrew(s) {
      // Actual ribs and jaws surround the ribbon; the whole vertex space quarter-turns.
      for(let i=0;i<8;i++) {
        const z=6+i*8-s.sceneDistance%8;
        for(let j=0;j<8;j++) {
          const wave=this.clearWave(s,z);
          const a=j*Math.PI/4+i*(s.variant===1?-.32:s.variant===2?.25:.065),r=4.8+wave*1.35;
          // One outward snap travels through the jaws after each clear, not a camera kick.
          this.layer=Math.sin(a)<-.1?-1:2;
          this.box(Math.cos(a)*r,Math.sin(a)*r,z,3.25,.28+wave*.23,.50,wave>.3?[214,54,52]:[40,44,62],a+Math.PI/2);
          if(j%2===0 && i<4) {
            const t=a+.12;
            this.polygon([[Math.cos(a-.12)*r,Math.sin(a-.12)*r,z-.25],[Math.cos(a+.12)*r,Math.sin(a+.12)*r,z-.25],[Math.cos(t)*(3.65+wave*.85),Math.sin(t)*(3.65+wave*.85),z+.4]],[255,239,193]);
          }
        }
      }
      if(s.variant)for(let strand=0;strand<2;strand++)for(let i=0;i<12;i++) {
        const a=i*.72*(s.variant===1?-1:1)+strand*Math.PI;
        this.layer=Math.sin(a)<-.1?-1:2;
        this.box(Math.cos(a)*6.2,Math.sin(a)*6.2,7+i*5.4-s.sceneDistance%5.4,1.4,.65,2.4,strand?[255,238,173]:[68,164,171],a);
      }
      this.layer=2;
    }
    dream(s) {
      if(this.medium==='ai-gouache'){this.paintedWorld(s);return;}
      // Explicit procedural fallback, never reported as generated art.
      this.layer=2;
      for(let i=0;i<10;i++)for(const side of [-1,1]){const z=8+i*7-s.sceneDistance%7;this.drawnCactus(z,(2+i%3)*(1+this.clearWave(s,z)*.17),side*(6+i%3*2));}
    }
    desktop(s) {
      for(let i=0;i<4;i++) {
        const left=this.clearWave(s,18+i*5),right=this.clearWave(s,28+i*4);
        this.windowBox(-7-i*.65-left*.45,.2+i*.45+left*.8,18+i*5,4.4,3.1,i);
        this.windowBox(8+i*.55+right*.45,.3+i*.9+right*.8,28+i*4,4.4,3.1,i+1);
      }
      for(const w of s.windows) {
        if(w.age<0)continue;
        const wave=this.clearWave(s,w.z),pop=smooth(w.age/.35)*(1+wave*.10);
        const fan=(s.variant?Math.sin(w.seed*.65)*3:0)+Math.sign(w.x)*wave*.45;
        this.windowBox(w.x+fan,w.y+(1-pop)*2+(s.variant?(w.seed%3)*1.3:0),w.z,3.3*pop,2.5*pop,w.seed);
        if(s.variant===2 && w.seed%3===0)this.windowBox(w.x+fan,w.y+3,w.z+1,2.1*pop,1.6*pop,w.seed+1);
        this.layer=-1;
        this.box(w.x,-.8+w.y*.3,w.z,3.5,1.5,2.2,[116,145,159]);
        this.layer=2;
      }
    }
    stampede(s,gather=0) {
      const k=1-gather;if(k<.02)return;
      const box=(x,y,z,sx,sy,sz,color,angle=0)=>this.box(x*k,y*k,mix(z,27,gather),sx*k,sy*k,sz*k,color,angle);
      for(const tower of s.city) {
        if(tower.z<-13)continue;
        const age=tower.brokenAt===null?-1:s.simTime-tower.brokenAt;

        for(const side of [-1,1]) {
          const x=side*(8+(tower.id%3)*1.5), z=tower.z;
          const wave=this.clearWave(s,z),height=tower.height*(1-wave*.14);
          if(age>2.2) {
            box(x,.22,z,3.8,.44,4.4,[123,81,196]);
            box(x+side*.6,.9,z+.5,2.3,1.6,2.4,[255,208,88],side*.8);
          } else if(age<0) {
            box(x,height*.5,z,2.3+wave*.45,height,2.7,[255,205,79]);
            box(x,height+.25,z,3+wave*.45,.5,3.3,[229,72,126]);
            // Oversized candy roof and face-like windows make this a squashable cartoon city.
            this.polygon([[x*k-1.5*k,height*k,z*k+27*gather],[x*k,(height+1.8)*k,z*k+27*gather],[x*k+1.5*k,height*k,z*k+27*gather]],[229,72,126]);
            for(const eye of [-1,1])box(x+eye*.5,height*.7,z-1.4,.35,.65,.06,[255,250,227]);
            for(let n=1;n<4;n++)box(x-.02,height*n/4,z-1.37,1.4,.18,.05,[92,76,180]);
          } else {
            for(let n=0;n<3;n++) {
              const flight=Math.max(0,Math.sin(clamp(age/1.7)*Math.PI));
              box(x+side*age*(2+n),Math.max(-2,tower.height*(n+.5)/3*(1-age*.7))+flight*2,z+Math.sin(n*2)*age*3,
                2.3,tower.height/3,2.7,n===2?[229,72,126]:[255,205,79],side*age*(.7+n*.3));
            }
          }
        }
      }
    }
    pack(s,gather=0) {
      const positions=[-.95,.95,-2.4,2.4,-3.85,3.85];
      const next=this.live?.obstacles?.find(o=>!o.resolved&&o.z>-.4);
      const hazard=next&&gather<.01?this.spriteRect(0,0,next.z,1.4,1.6,[.5,.95]):null;
      for(let i=1;i<Math.min(40,s.echoes);i++) {
        const row=Math.floor((i-1)/6),col=(i-1)%6;
        const delay=(row+1)*.06, jumpAge=s.simTime-s.lastJumpTime-delay;
        const waveAge=s.simTime-s.waveTime-(row+1)*.12;
        const wave=waveAge>=0?Math.max(0,7.2*waveAge-8.5*waveAge*waveAge)*(s.reducedMotion?.35:1):0;
        const jump=Math.max(wave,jumpAge>=0?Math.max(0,7.7*jumpAge-9*jumpAge*jumpAge):0);
        const scale=(.88+(i%3)*.045)*(1-gather*.94);
        const fan=s.variant===1?1+row*.22:1;
        const spiral=s.variant===2?Math.sin(i*.8)*1.1:0;
        const x=(positions[col]*fan+spiral)*(1-gather),y=jump*(1-gather)+gather*(i%6)*2.5,z=mix(3+row*2.5+(s.variant?Math.abs(positions[col])*.7:0),24,gather);
        // Light occlusion fix: only a member nearer than, and overlapping, the projected
        // nearest live hazard fades; pack count, layout and style are unchanged.
        let alpha=1;
        if(hazard) {
          const r=this.spriteRect(x,y,z,1.7*scale,2.5*scale,[.5,.95]);
          if(r&&r.depth<hazard.depth)alpha=Math.max(.18,smooth(Math.max(r.left-hazard.right,hazard.left-r.right,r.top-hazard.bottom,hazard.top-r.bottom)/18));
        }
        this.opacity=alpha;
        this.dino(s,{x,y,z,scale,lod:true,color:i%3?[61,115,133]:[235,242,210]});
        this.opacity=1;
      }
    }
    ending(s) {
      // Only the coalescence gathers the pack and city into the giant; Moon and the fold never draw it.
      if(s.scene!=='coalesce')return;
      const gather=smooth(s.sceneTime/2.2);
      this.stampede(s,gather);this.pack(s,gather);
      const scale=12*gather;
      if(scale>.05) {
        this.dino(s,{x:0,y:0,z:27,scale,color:[224,240,198]});
        // Monumental broken ribs of the whole journey converge behind the giant.
        for(let i=0;i<9;i++) {
          const a=i*Math.PI/8;
          const x=Math.cos(a)*20,y=Math.sin(a)*23;
          this.box(x,y,39,4,.6,1.2,i%2?[102,174,167]:[233,143,136],a+Math.PI/2);
        }
      }
    }
    showWorld(s) {
      const style=s.scene==='coalesce'?'ending':s.scene==='crash'?'desktop':s.scene;
      if(this.medium!=='ai-gouache')this.runway(s,style);this.layer=2;
      if(s.scene==='corkscrew')this.corkscrew(s);
      else if(s.scene==='dream')this.dream(s);
      else if(s.scene==='desktop'||s.scene==='crash')this.desktop(s);
      else if(s.scene==='stampede') {this.pack(s);this.stampede(s);}
      else if(s.scene==='coalesce')this.ending(s);
      this.rewards(s);
    }
    gameplayWorld(s,showHero=true) {
      this.gameplay=true;this.layer=3;
      const modern=this.modern,painted=this.medium==='ai-gouache',warm=painted||this.medium==='gouache-fallback';
      const next=s.obstacles.find(o=>!o.resolved && o.kind!=='ceiling' && o.z>-.3);
      if(next && s.projectionBlend>.1) {
        const z=next.z-s.speed*.42,near=next.z/s.speed<.60;
        if(modern||warm) {
          // Jelly/Moon/painted: the same take-off line as two quiet ticks and a hairline.
          const color=warm?(near?[190,112,66]:[142,104,84]):(near?[236,214,132]:[88,102,150]);
          this.opacity=near?.92:.6;this.layer=1;
          this.polygon([[-.55,.03,z-.025],[.55,.03,z-.025],[.55,.03,z+.025],[-.55,.03,z+.025]],color);
          for(const side of [-1,1])this.polygon([[side*1.2,.03,z-.05],[side*1.6,.03,z-.05],[side*1.6,.03,z+.05],[side*1.2,.03,z+.05]],color);
          this.opacity=1;this.layer=3;
        } else {
          const c=near?[252,237,112]:s.scene==='dream'?[124,85,138]:[47,87,99];
          this.box(0,.035,z,2.9,.035,.14,c);
          for(const side of [-1,1])this.box(side*1.45,.035,z+.36,.09,.035,.72,c);
        }
      }
      if(showHero && s.projectionBlend>.05) {
        if(modern) {
          const lift=1/(1+s.player.height*.55);
          if(s.extrusion>.05)this.softShadow(0,-.05,.5*(.7+lift*.3),.95*(.7+lift*.3),[3,4,14],.62*lift*smooth(s.extrusion));
        } else if(warm) {
          // Soft layered contact shadow under the painted hero (no hard brown disc).
          const lift=1/(1+s.player.height*.55);
          if(painted)this.softShadow(.18,.12,.6*(.7+lift*.3),.72*(.7+lift*.3),[112,70,54],.42*lift);
          else this.softShadow(0,-.05,.5*(.7+lift*.3),.95*(.7+lift*.3),[118,72,56],.4*lift);
        } else if(s.extrusion>.05)this.box(0,.025,-.1,.95+s.player.height*.16,.025,1.6+s.player.height*.12,[42,48,69]);
      }
      this.layer=4;
      if(showHero) {
        // Continuity probe: where the one hero's feet project this frame, and at what scale.
        const hv=this.view([0,s.player.height,0]);
        if(hv[2]>.35){const hp=this.project(hv);this.stats.hero={x:hp[0],y:hp[1],pxPerUnit:this.cam.focal/mix(24,Math.max(.35,hv[2]),this.cam.b),medium:this.medium};}
        const first=this.faces.length;
        this.hero=true;
        if(this.medium==='pixel-16')this.windowBox(0,s.player.height,0,1.6,2.05,0,true);
        else this.dino(s);
        this.hero=false;
        const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
        for(let i=first;i<this.faces.length;i++) {
          const face=this.faces[i];face.hero=true;
          for(const part of face.group||[face])for(const point of part.points||[]) {
            bounds.left=Math.min(bounds.left,point[0]);bounds.right=Math.max(bounds.right,point[0]);
            bounds.top=Math.min(bounds.top,point[1]);bounds.bottom=Math.max(bounds.bottom,point[1]);
          }
        }
        if(Number.isFinite(bounds.left)&&this.stats.hero)this.stats.hero.bounds=bounds;
        if(s.recovery>0&&painted) {
          this.layer=3;this.opacity=.7;
          // A steady amber ground halo keeps the real painted character unobscured.
          for(let i=0;i<12;i++) {
            const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
            this.polygon([[Math.cos(a)*.85,.05,Math.sin(a)*.85],[Math.cos(b)*.85,.05,Math.sin(b)*.85],[Math.cos(b)*1,.05,Math.sin(b)],[Math.cos(a),.05,Math.sin(a)]],[223,145,56]);
          }
          this.opacity=1;
        }
      }
      this.stats.obstacleProbes=s.obstacles.map(o=>({id:o.id,kind:o.kind,z:o.z,
        foot:this.project(this.view([0,0,o.z])),
        top:this.project(this.view([0,o.kind==='ceiling'?o.ceilingHeight:1.4,o.z]))}));
      for(const o of [...s.obstacles,...(s.clearedTail||[])]) {
        if(o.z<=-8)continue;
        // Clearance is a score flag, never a shrink/eat animation. Keep full-height geometry.
        if(modern||warm) {
          if(s.extrusion>.05)this.softShadow(0,o.z,.5,.3,warm?[118,72,56]:[3,4,14],warm?.3:.5);
        } else {
          this.layer=3;
          if(s.extrusion>.05)this.polygon(Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return [Math.cos(a)*.48,.025,o.z+Math.sin(a)*.30];}),painted?[183,142,119]:[42,48,69]);
        }
        this.layer=4;
        if(o.kind==='ceiling')this.canopy(o);
        else if(this.medium==='pixel-16')this.windowBox(0,0,o.z,1.8,1.25,o.id,false,true);
        else this.cactus(o.z,1,1,0,0,modern?null:s.scene==='dream'?[227,115,122]:s.scene==='stampede'?[44,99,112]:[89,223,213]);
      }
      // Original media keep their earned ground rings (reserved gameplay budget);
      // Jelly/Moon keep their short contact arcs.
      if(modern)this.contactAccents(s,false);
      else this.rewards(s,true);
    }
    contactAccents(s,painted) {
      // A short (.36 s) contact accent, radius <= 1.3: two arcs for a clear, two
      // more for a big clear. Painted landings are soft cream dust and umber strokes.
      this.layer=3;
      for(const effect of s.effects) {
        if(effect.puff || effect.slam || effect.scene!==s.scene)continue;
        const t=effect.age/.36;if(t>=1)continue;
        const ease=1-(1-t)*(1-t),z=effect.z;
        const arc=(from,to,radius,thick,color,alpha)=>{
          const outer=[],inner=[];
          for(let i=0;i<=6;i++){const a=mix(from,to,i/6);outer.push([Math.cos(a)*(radius+thick),.03,z+Math.sin(a)*(radius+thick)*.8]);inner.push([Math.cos(a)*radius,.03,z+Math.sin(a)*radius*.8]);}
          this.opacity=alpha;this.polygon(outer.concat(inner.reverse()),color);
        };
        if(painted) {
          for(const [dx,dz,size] of [[-.7,-.15,1],[.55,-.35,.8],[-.1,.45,.7]]) {
            this.opacity=.42*(1-t);const r=(.18+ease*.34)*size;
            this.polygon(Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return [dx*(1+ease*.4)+Math.cos(a)*r,.04+ease*.12,z+dz*(1+ease*.4)+Math.sin(a)*r*.7];}),[255,240,212]);
          }
          if(effect.big)for(const from of [.4,3.6])arc(from,from+1.1,mix(.8,1.2,ease),.07*(1-t)+.02,[140,94,68],.38*(1-t));
        } else {
          for(const from of [.25,3.4])arc(from,from+1.15,mix(.55,1.0,ease),.06*(1-t)+.015,[118,226,214],.7*(1-t));
          if(effect.big)for(const from of [1.8,4.95])arc(from,from+.6,mix(.8,1.3,ease),.05*(1-t)+.012,[214,236,255],.55*(1-t));
        }
      }
      this.opacity=1;
    }
    meter() {
      const y=this.hudTop+this.hudSize+8;
      return {y,bottom:y+30};
    }
    neonCamera(s) {
      const e=s.extreme,entry=smooth(s.sceneTime/1.35),height=e.visualHeight;
      // Close vertical framing never zooms out to expose the giant. The shared
      // orthographic contact plane is compressed horizontally on narrow screens.
      const k=this.h*.095*(s.reducedMotion?1:mix(.94,1,entry));
      const unit=Math.min(this.h*.065,this.w*.105,54);
      // Reserve the full head below the meter, including short landscape screens.
      const follow=Math.max(0,Math.min(this.h*.24,this.h-90-unit*2.72-(this.meter().bottom+12)));
      const x=Math.min(k,this.w*.49/10.8),rise=follow*smooth(height/24);
      // The painted hero's last projected feet are where the neon hero first stands.
      const from=this.neonFrom||{x:this.w*.34,y:this.h*.77};
      this.cam={b:0,focal:24*k,cx:mix(from.x,this.w*.27,entry),cy:mix(from.y,this.h-90,entry)+height*k-rise};
      this.extremeScale=k;this.extremeX=x;this.extremeUnit=unit;
    }
    extremeWorld(s,c,showHero=true) {
      this.neonCamera(s);
      const e=s.extreme,w=this.w,h=this.h,k=this.extremeScale,kx=this.extremeX;
      const cx=this.cam.cx,cy=this.cam.cy,z=e.cactusZ*.45;
      const ink='#17102e',cyan='#60ffeb',lime='#d2ff67',pink='#ff64d8';
      let commands=1;
      c.fillStyle='#110d2b';c.fillRect(0,0,w,h);
      c.lineCap='round';c.lineJoin='round';
      // A stable notebook of small stars, two quiet sizes; no grain or blur pass.
      c.strokeStyle='#352c5f';c.lineWidth=1.1;c.beginPath();
      for(let i=0;i<22;i++) {
        const x=(i*197+43)%w,y=(i*113+59)%h,r=i%4?2.2:3.6;
        c.moveTo(x-r,y);c.lineTo(x+r,y);c.moveTo(x,y-r);c.lineTo(x,y+r);
      }c.stroke();commands++;
      const stroke=(path,fill,colour,width=2.5)=>{
        if(fill){c.fillStyle=fill;c.fill(path);commands++;}
        c.strokeStyle=colour;c.lineWidth=width;c.stroke(path);commands++;
      };
      // World coordinates become one continuous, rounded outline, including arms.
      // Anatomy uses the same contact-plane map as the hero's feet and top marker.
      // A neon world leaving for the fold lets its giant go first (sky last).
      const giant=this.giantAlpha??1;
      if(!e.hit && giant>.01) {
        c.globalAlpha=giant;
        const point=(x,y)=>[cx+(z+x)*kx,cy-y*k];
        const path=new Path2D();
        const move=(x,y)=>path.moveTo(...point(x,y)),line=(x,y)=>path.lineTo(...point(x,y));
        const curve=(a,b,d,f,g,j)=>path.bezierCurveTo(...point(a,b),...point(d,f),...point(g,j));
        move(-1.1,0);curve(-1.3,2,-1.05,5,-1.12,7.6);
        curve(-3.5,7.5,-3.7,8.4,-3.65,10);line(-3.6,13.4);
        curve(-3.6,14.5,-2.25,14.5,-2.25,13.4);line(-2.25,10.2);
        curve(-2.2,9.5,-1.5,9.6,-1.12,9.7);line(-1.08,22.8);
        curve(-1.05,24.4,1.15,24.4,1.12,22.8);line(1.1,15.4);
        curve(1.7,15.3,2.5,15.5,2.5,16.1);line(2.48,19.3);
        curve(2.45,20.5,3.85,20.4,3.83,19.2);line(3.8,15.6);
        curve(3.8,13.5,2.6,13.1,1.08,13.2);curve(.97,9,1.3,4,1.1,0);path.closePath();
        // Three cheap stroke layers give neon edge light without shadowBlur.
        stroke(path,'#163c43','#2b777c',8);stroke(path,null,cyan,2.8);
        c.save();c.clip(path);
        c.strokeStyle=lime;c.lineWidth=1.5;c.beginPath();
        for(let i=0;i<3;i++) {
          const x=-.66+i*.63;c.moveTo(...point(x,.2));
          c.bezierCurveTo(...point(x+.23,7),...point(x-.24,16),...point(x,23.4));
        }
        for(let i=0;i<18;i++) {
          const y=i*1.34+.5,x=i%2?.75:-.8;
          c.moveTo(...point(x-.17,y-.12));c.lineTo(...point(x+.16,y+.13));
          c.moveTo(...point(x-.13,y+.03));c.lineTo(...point(x+.2,y+.28));
        }c.stroke();commands++;c.restore();
        // Attached face: its eyes and elastic mouth live below the real top.
        const surprise=smooth((e.visualHeight-16)/8);
        for(const side of [-1,1]) {
          const [x,y]=point(side*.48,22.5);
          c.fillStyle=lime;c.beginPath();c.ellipse(x,y,kx*.29,k*(.29+surprise*.09),0,0,Math.PI*2);c.fill();
          c.fillStyle=ink;c.beginPath();c.ellipse(x-kx*.06,y+k*.04,kx*.11,k*.13,0,0,Math.PI*2);c.fill();commands+=2;
        }
        const [mx,my]=point(0,21.65);c.fillStyle=ink;c.strokeStyle=lime;c.lineWidth=1.5;c.beginPath();
        c.ellipse(mx,my,kx*.38,k*(.10+surprise*.28),0,0,Math.PI*2);c.fill();c.stroke();commands+=2;
        c.globalAlpha=1;
      }
      // A thin scribbled floor scrolls below the camera, rather than shrinking the world.
      if(cy<h+8){c.strokeStyle='#7762b0';c.lineWidth=2;c.beginPath();c.moveTo(0,cy+5);c.bezierCurveTo(w*.3,cy+2,w*.7,cy+9,w,cy+3);c.stroke();commands++;}
      const unit=this.extremeUnit;
      const hero=(height,travel,opacity=1)=>{
        const x=cx+travel*.45*kx,y=cy-height*k;
        const recoil=s.reducedMotion?0:Math.sin(clamp(e.recoilAge/.22)*Math.PI)*(1-clamp(e.recoilAge/.22));
        c.save();c.translate(x-recoil*unit*.13,y);c.scale(unit*(1+recoil*.08),unit*(1-recoil*.06));c.globalAlpha=opacity;
        // The same anatomy as the sculpted and painted heroes: three dorsal spikes.
        const spikes=new Path2D('M -.86 -1.17 L -.86 -1.42 L -.62 -1.2 Z M -.55 -1.2 L -.5 -1.5 L -.3 -1.25 Z M -.24 -1.36 L -.12 -1.7 L .02 -1.58 Z');
        stroke(spikes,lime,ink,.06);
        // One authored silhouette connects tail, haunch, neck, snout and head.
        const body=new Path2D('M -.55 -.45 C -1.05 -.5 -1.36 -.94 -1.42 -1.42 C -.91 -1.08 -.65 -1.22 -.29 -1.18 C -.28 -1.65 -.02 -1.88 .27 -1.94 C .18 -2.57 .61 -2.67 1.16 -2.49 C 1.46 -2.42 1.63 -2.04 1.51 -1.77 L .73 -1.7 C .86 -1.39 .64 -1.05 .45 -.84 C .17 -.47 -.22 -.35 -.55 -.45 Z');
        stroke(body,'#793b92','#593f8b',.16);stroke(body,null,pink,.06);
        const belly=new Path2D('M .48 -1.62 C .60 -1.26 .31 -.81 -.17 -.72 C -.51 -.64 -.65 -.78 -.7 -.86');
        stroke(belly,null,cyan,.055);
        const stride=Math.sin(e.pose*10)*(s.reducedMotion?.08:.17);
        const legs=new Path2D();legs.moveTo(-.47,-.58);legs.quadraticCurveTo(-.64,-.22,-.48-stride,-.04);legs.lineTo(-.14-stride,-.04);
        legs.moveTo(.17,-.6);legs.quadraticCurveTo(.39,-.30,.27+stride,-.06);legs.lineTo(.6+stride,-.06);
        stroke(legs,null,ink,.23);stroke(legs,null,cyan,.095);
        const arm=new Path2D('M .54 -1.28 Q .85 -1.12 .94 -1.36 L 1.11 -1.28');
        stroke(arm,null,ink,.16);stroke(arm,null,pink,.065);
        c.fillStyle=cyan;c.beginPath();c.ellipse(.84,-2.18,.22,.25,-.12,0,Math.PI*2);c.fill();
        c.fillStyle=ink;c.beginPath();c.ellipse(.92,-2.17,.085,.13,0,0,Math.PI*2);c.fill();
        c.fillStyle='#fff6b9';c.beginPath();c.arc(.94,-2.22,.035,0,Math.PI*2);c.fill();commands+=3;
        const grin=new Path2D('M .91 -1.88 Q 1.18 -1.92 1.43 -1.86');stroke(grin,null,cyan,.035);
        const hatch=new Path2D('M -.39 -.99 L -.22 -1.14 M -.23 -.91 L -.06 -1.06 M .36 -2.35 L .46 -2.42');stroke(hatch,null,pink,.03);
        c.restore();return {left:x-1.53*unit,right:x+1.72*unit,top:y-2.72*unit,bottom:y+.08*unit};
      };
      const tape=e.history,index=e.phase==='rewind'?Math.floor((1-e.rewindPosition)*(tape.length-1)):tape.length-1;
      if(showHero && ['payoff','rewind'].includes(e.phase))for(let n=3;n>=1;n--) {
        const f=tape[Math.max(0,index-n*6)];hero(f[0],f[2]-n*.8,.08+(3-n)*.05);
      }
      const puffs=e.phase==='rewind'?[e.puff]:s.effects;
      for(const puff of puffs)if(puff && puff.age<.65 && (e.phase==='rewind'||puff.puff)) {
        const t=puff.age/.65,x=cx+puff.z*kx-unit*(1.1+t),y=cy-puff.height*k-unit*.6;
        c.save();c.translate(x,y);c.scale(unit*(.40+t*.85),unit*(.40+t*.65));c.globalAlpha=(1-t)*.65;
        const cloud=new Path2D('M -1 0 C -1.6 -.7 -.8 -1.3 -.3 -.9 C .2 -1.5 1 -.9 .8 -.4 C 1.6 0 .8 .8 .3 .5 C -.3 1.2 -1 .7 -1 0 Z');
        stroke(cloud,'#302351',puff.seed%2?cyan:pink,.08);c.restore();
      }
      // A deferred hero (drawn above the outgoing world) reports its own commands.
      if(showHero==='defer'){this.deferredNeon=()=>{const before=commands;c.lineCap='round';c.lineJoin='round';const b=hero(e.visualHeight,e.visualZ);this.stats.extreme={scale:k,horizontalScale:kx,cameraY:cy,top:cy-24*k,cactusX:cx+z*kx,hero:b};this.neonFoot={x:cx+e.visualZ*.45*kx,y:cy-e.visualHeight*k,height:2.72*unit};return commands-before;};}
      else if(showHero) {
        const bounds=hero(e.visualHeight,e.visualZ);
        this.stats.extreme={scale:k,horizontalScale:kx,cameraY:cy,top:cy-24*k,cactusX:cx+z*kx,hero:bounds};
        this.neonFoot={x:cx+e.visualZ*.45*kx,y:cy-e.visualHeight*k,height:2.72*unit};
      }
      return commands;
    }
    rewards(s,groundOnly=false) {
      // Brief, bounded world-space rings; no screen-space flashes or particle pool.
      this.layer=1;
      for(const effect of s.effects) {
        if(effect.puff||effect.slam)continue;
        const t=effect.age/1.5, radius=.6+t*(s.reducedMotion?2:effect.big?12:5);
        const color=s.scene==='offline'?[135,145,148]:s.scene==='dream'?[151,98,174]:[109,210,196];
        if(groundOnly && t<.75)for(let i=0;i<16;i++) {
          const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
          const p=(angle,r)=>[Math.cos(angle)*r,.055,effect.z+Math.sin(angle)*r];
          this.polygon([p(a,radius),p(b,radius),p(b,radius+.26*(1-t)),p(a,radius+.26*(1-t))],color);
        }
        if(groundOnly || !effect.big || effect.scene!==s.scene)continue;
        this.layer=2;
        const lift=Math.sin(t*Math.PI)*(s.reducedMotion?2:4);
        if(s.scene==='desktop') {
          for(let side of [-1,1])for(let i=0;i<2;i++)
            this.windowBox(side*(5+i*1.8),2+i*.9+lift,9+i*3,3.8,2.8,i);
        } else if(s.scene==='track') {
          for(const side of [-1,1])for(let i=0;i<3;i++)
            this.cactus(14+i*8,1,2.8+lift*.5,side*(5.8+i*2),0,[137,211,184],side*(s.reducedMotion?.12:t*.5));
        } else if(s.scene==='corkscrew') {
          for(let i=0;i<12;i++) {
            const a=i*Math.PI/6,r=6+t*7;
            this.box(Math.cos(a)*r,Math.sin(a)*r,15,2,.7,2,[246,232,159],a);
          }
        } else if(s.scene==='stampede') {
          for(const side of [-1,1])for(let i=0;i<8;i++)
            this.box(side*(5+i*.3),.1+Math.sin(clamp(t*2-i*.09)*Math.PI)*2,4+i*4,1,.4,2,[246,239,196]);
        }
        this.layer=1;
      }
    }
    remember(s) {
      // Two bounded scenery records, never old gameplay or a frozen screenshot.
      const out=this.lastScenery;
      for(const key of SCENERY_FIELDS)out[key]=s[key];
      for(const key of ['monuments','windows','city','effects']) {
        const items=out[key]||(out[key]=[]),source=s[key];
        for(let i=0;i<source.length;i++)Object.assign(items[i]||(items[i]={}),source[i]);
        items.length=source.length;
      }
      out.player=s.player;out.obstacles=[];out.flatAnchor=s.flatAnchor;out.extreme=s.extreme?{...s.extreme}:null;
    }
    renderWorld(s,live,medium,target,showHero=true) {
      this.medium=medium;this.opacity=1;this.scenery=s;
      this.modern=MODERN.includes(medium)||(medium==='vector-3d'&&live.scene==='collapse');
      if(medium==='neon-doodle')return {commands:this.extremeWorld(s,target,showHero),images:0,resolution:[target.canvas.width,target.canvas.height]};
      const w=this.w,h=this.h,pixel=medium==='pixel-16';
      // Integer nearest-neighbour expansion happens in BACKING pixels, not CSS pixels.
      const step=Math.max(2,Math.ceil(Math.max(target.canvas.width,target.canvas.height)/480));
      let c=target;this.pixelStep=step;
      if(pixel) {
        const pw=Math.ceil(target.canvas.width/step),ph=Math.ceil(target.canvas.height/step);
        if(this.pixelCanvas.width!==pw||this.pixelCanvas.height!==ph){this.pixelCanvas.width=pw;this.pixelCanvas.height=ph;}
        c=this.pixelContext;c.setTransform(target.canvas.width/step/w,0,0,target.canvas.height/step/h,0,0);
      }
      c.imageSmoothingEnabled=!pixel;c.imageSmoothingQuality=medium==='ai-gouache'?'high':'low';
      const e = smooth(s.extrusion);
      const palette=this.palette(s.scene), prev=this.palette(s.previousScene);
      const tone=palette.map((n,i)=>mix(prev[i],n,smooth(s.sceneTime/1.1)));
      // Lap one's flat views start from the actual page colour (light or dark).
      this.base=['offline','rupture','extrusion','collapse','breath'].includes(s.scene)?this.theme.page:[247,247,247];
      const bg = this.base.map((n,i)=>Math.round(mix(n,tone[i],e)));
      this.background=bg;
      c.fillStyle = `rgb(${bg})`; c.fillRect(0,0,w,h);
      if (e > .01 && ['extrusion','track'].includes(s.scene)) {
        const gradient = c.createRadialGradient(w*.53,h*.38,0,w*.53,h*.38,w*.7);
        gradient.addColorStop(0,`rgba(104,49,121,${e*.5})`); gradient.addColorStop(1,'rgba(9,11,29,0)');
        c.fillStyle=gradient; c.fillRect(0,0,w,h);
      }
      if(medium==='lunar')this.lunarSky(c);
      if(medium==='ai-gouache')this.paintedSky(c);
      this.faces.length = 0;this.cost=0;this.gameplay=false;this.sink=null;this.live=live;
      this.world(s);
      if(s!==live && this.modern)this.contactAccents(s,false);
      this.gameplayWorld(live,showHero);
      // Ground/decal passes avoid average-depth floor polygons cutting through feet.
      // Above-ground meshes retain stable camera-space painter ordering.
      this.faces.sort((a,b)=>a.layer-b.layer || b.depth-a.depth || a.order-b.order);
      let images=(medium==='ai-gouache'?1:0)+this.drawFaces(c,this.faces);
      c.globalAlpha=1;
      if(pixel){
        c=target;c.save();c.setTransform(1,0,0,1,0,0);c.imageSmoothingEnabled=false;
        c.drawImage(this.pixelCanvas,0,0,this.pixelCanvas.width*step,this.pixelCanvas.height*step);c.restore();images++;
      }
      return {commands:this.cost,images,resolution:pixel?[this.pixelCanvas.width,this.pixelCanvas.height]:[target.canvas.width,target.canvas.height]};
    }
    drawFaces(c,faces) {
      c.lineJoin='round';
      const ink=this.medium==='ink-comic',cel=this.medium==='cel-cartoon',modern=this.modern;
      const path=points=>{c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);c.closePath();};
      const span=points=>{let left=Infinity,right=-Infinity;for(const p of points){if(p[0]<left)left=p[0];if(p[0]>right)right=p[0];}return right-left;};
      const fill=(f,opacity)=>{
        c.globalAlpha=opacity;path(f.points);c.fillStyle=f.color;c.fill();
        // Translucent decals are never stroked (no compounding edges).
        if(opacity<.999)return;
        // Ground is a continuous material, never a wireframe. Internal joints are quiet.
        let stroke=f.edge?'rgb('+f.edge.join(',')+')':ink?'#211c24':cel?'#23324b':f.color;
        if(f.layer===0 || span(f.points)<(modern||f.width?4:6))stroke=f.color;
        c.strokeStyle=stroke;c.lineWidth=f.width||(f.edge&&modern?.8:ink?1.1:cel?.8:.65);c.stroke();
        if(ink&&f.layer>0&&f.material==='248,231,196') {
          if(!this.patterns.hatch)this.patterns.hatch=c.createPattern(this.art.hatch,'repeat');
          c.fillStyle=this.patterns.hatch;c.fill();
        } else if(this.medium==='pixel-16'&&f.layer===0&&f.material==='127,148,190') {
          if(!this.patterns.dither)this.patterns.dither=c.createPattern(this.art.dither,'repeat');
          c.fillStyle=this.patterns.dither;c.fill();
        }
      };
      let images=0;
      for (const f of faces) {
        // A cross-medium handoff draws the one incoming hero above the fading world.
        if(f.hero&&this.deferred&&faces===this.faces){this.deferred.push(f);continue;}
        if(f.image){c.globalAlpha=f.opacity??1;this.texture(c,f);images+=f.units;continue;}
        if(f.group){for(const part of f.group)fill(part,part.opacity??1);continue;}
        if(f.facets) {
          // Organic solids: one silhouette, shaded facets inside, a contour outside.
          const fading=(f.opacity??1)<.999;c.globalAlpha=f.opacity??1;
          // During a fade, translucent facets must not be painted over an equally
          // translucent hull or edge strokes (which compound the alpha).
          if(!fading){path(f.points);c.fillStyle=f.color;c.fill();}
          for(const part of f.facets){path(part.points);c.fillStyle=part.color;c.fill();if(!fading){c.strokeStyle=part.color;c.lineWidth=.65;c.stroke();}}
          if(fading)continue;
          path(f.points);
          const width=span(f.points);
          c.strokeStyle=!f.outline||width<6?f.color:ink?'#211c24':cel?'#23324b':f.color;
          c.lineWidth=clamp(width*.018,.45,1.25);c.stroke();
          continue;
        }
        fill(f,f.opacity??1);
      }
      c.globalAlpha=1;
      return images;
    }
    hud(s,c,alpha) {
      const w=this.w,h=this.h,top=this.hudTop,size=this.hudSize;
      const painted=['ai-gouache','gouache-fallback'].includes(this.medium),light=painted||['ink-comic','gummy','cel-cartoon'].includes(this.medium)||(this.medium==='chrome'&&!this.theme.dark);
      const glass=painted?'rgba(255,248,234,.82)':light?'rgba(255,255,255,.92)':'rgba(14,16,36,.62)';
      const line=painted?'rgba(112,74,52,.22)':light?'rgba(60,64,67,.18)':'rgba(255,255,255,.13)';
      const ink=painted?'#4b2f25':light?'#3c4043':'#eef2ff',soft=painted?'#7a5a48':light?'#5f6368':'#a9b3d6';
      c.save();c.globalAlpha=alpha;
      // One compact two-line score chip, aligned with the Pause/hearts band.
      const score=String(s.score).padStart(4,'0');
      const detail='LAP '+s.lap+(s.lap>1?' · '+s.speedMultiplier.toFixed(2)+'×':'')+(s.combo>1?' · '+s.combo+' ×'+s.multiplier:'');
      const longest='LAP '+s.lap+(s.lap>1?' · 0.00×':'')+' · 00 ×3';
      c.font='600 15px ui-monospace, monospace';const a=c.measureText(score).width;
      c.font='10px ui-monospace, monospace';const b=c.measureText(longest).width;
      const width=Math.ceil(Math.max(a,b))+22,x=w-this.hudRight-width;
      c.fillStyle=glass;c.strokeStyle=line;c.lineWidth=1;c.beginPath();c.roundRect(x+.5,top+.5,width-1,size-1,8);c.fill();c.stroke();
      c.textAlign='right';c.fillStyle=ink;c.font='600 15px ui-monospace, monospace';
      c.fillText(score,x+width-11,top+size/2-1);
      c.fillStyle=soft;c.font='10px ui-monospace, monospace';
      c.fillText(detail,x+width-11,top+size/2+12);
      if(s.stageConfig?.hint) {
        c.textAlign='center';c.font='600 '+(w<450?10:11)+'px ui-monospace, monospace';
        const text=s.stageConfig.hint,tw=c.measureText(text).width,y=top+size+20;
        c.fillStyle=glass;c.beginPath();c.roundRect((w-tw)/2-9,y-13,tw+18,21,6);c.fill();
        c.fillStyle=ink;c.fillText(text,w/2,y+1);
      }
      // The original dinosaurOS bars sit below the shared HUD band, never under it.
      if(this.hudDesktop>.001) {
        const y=top+size+8;
        c.save();c.globalAlpha=alpha*this.hudDesktop;
        c.fillStyle='#253d72';c.fillRect(0,y,w,27);
        c.fillStyle='#fff';c.textAlign='left';c.font='11px ui-monospace, monospace';
        c.fillText('dinosaurOS  /  workspace '+String(s.success+1).padStart(2,'0'),18,y+18);
        c.fillStyle='#fff3d0';c.fillText('windows: '+(s.windows.length+1)+'    memory: unreasonably full',18,h-54);c.restore();
      }
      if(s.scene==='crash' && s.sceneTime>.7) {
        c.save();c.globalAlpha=alpha*smooth((s.sceneTime-.7)/.3)*(1-smooth((s.sceneTime-1.85)/.35));
        c.fillStyle='#2340a2';c.fillRect(0,0,w,h);
        c.textAlign='left';c.fillStyle='#edf4ff';c.font='bold 18px ui-monospace, monospace';
        c.fillText('WINDOW LIMIT EXCEEDED',w*.09,h*.36);
        c.font='12px ui-monospace, monospace';c.fillText('The desktop could not contain it.',w*.09,h*.36+38);
        c.fillText('Restoring the dinosaur…',w*.09,h*.36+63);c.restore();
      }
      if(s.scene==='extreme') {
        const ex=s.extreme,topLine=this.cam.cy-ex.targetHeight*this.extremeScale,m=this.meter();
        c.textAlign='center';
        c.fillStyle='rgba(25,19,51,.94)';c.fillRect(0,h-65,w,65);
        c.strokeStyle='#ff64d8';c.lineWidth=1.5;c.beginPath();c.moveTo(15,h-65);c.lineTo(w-15,h-65);c.stroke();
        c.fillStyle='#caff72';c.font='bold '+(w<450?10:13)+'px ui-monospace, monospace';
        c.fillText('MASH SPACE / TAP TO CLIMB • MISS = GAME OVER',w/2,h-43);
        c.fillStyle='#faf2ff';c.font='bold '+(w<450?12:16)+'px ui-monospace, monospace';
        c.fillText(ex.caption,w/2,h-18);
        // The actual top is intentionally absent initially. An arrow and the meter
        // explain the offscreen goal without moving its contact line into view.
        if(!ex.hit && topLine>m.bottom+9 && topLine<h-76) {
          c.strokeStyle='#caff72';c.lineWidth=1.5;c.setLineDash([5,5]);c.beginPath();
          c.moveTo(w*.1,topLine);c.lineTo(w*.9,topLine);c.stroke();c.setLineDash([]);
          c.fillStyle='#caff72';c.textAlign='left';c.font='bold 10px ui-monospace, monospace';c.fillText('TOP · 24',18,topLine-8);
        }
        c.fillStyle='rgba(25,19,51,.94)';c.beginPath();c.roundRect(10,m.y,w-20,30,7);c.fill();
        c.textAlign='left';c.fillStyle='#60ffeb';c.font='bold '+(w<450?9:11)+'px ui-monospace, monospace';
        const label=ex.phase==='active'?'TOP ↑ 24 · '+ex.ttc.toFixed(1)+'s · '+ex.acceptedPresses+'/'+ex.minPresses+' TAPS':ex.phase==='payoff'?'TOP NOTCH! · CLEARED':ex.phase==='rewind'?'REWIND ◀◀ · BACK TO THE BEGINNING':'TOP ↑ 24 · '+ex.minPresses+' TAPS · WAIT FOR GO';
        c.fillText(label,20,m.y+13);
        c.fillStyle='#4c376c';c.fillRect(20,m.y+19,w-40,4);c.fillStyle='#caff72';c.fillRect(20,m.y+19,(w-40)*ex.progress,4);
        c.fillRect(w-22,m.y+16,2,10);
        const puff=ex.phase==='rewind'?ex.puff:s.effects[s.effects.length-1];
        if(puff && puff.age<.5 && (ex.phase==='rewind'||puff.puff) && this.stats.extreme) {
          const b=this.stats.extreme.hero;
          c.globalAlpha=alpha*(1-puff.age/.5);c.fillStyle='#ff9ce5';c.textAlign='left';c.font='bold 12px ui-monospace, monospace';
          c.fillText(['PFFT!','BRRRP!','POOT!'][puff.seed%3],Math.max(18,b.left-12),Math.min(h-80,b.bottom+14));
        }
      }
      c.restore();
    }
    draw(s) {
      const start=performance.now(),c=this.ctx;
      // Warm on readiness/resize, not at the first painted handoff.
      if(this.art.status==='ready'&&!this.skyImage&&!this.native)this.scheduleSky();
      let desired=this.art.medium(s);
      // Readiness is reported immediately; an airborne fallback hero is not replaced mid-jump.
      if(desired==='ai-gouache' && this.currentMedium==='gouache-fallback' && !s.player.grounded)desired=this.currentMedium;
      const reset=this.lastRun!==s.run || s.simTime<(this.lastTime??0);
      if(reset){this.hudDesktop=0;this.handoff=null;this.lastScenery={};this.currentMedium=desired;this.lastScene=s.scene;this.neonFrom=null;this.foldFrom=null;this.neonFoot=null;this.visual={bend:s.scene==='dream'?this.bend(s):0,lift:s.scene==='desktop'?s.morph*.24:0};}
      if(!reset && s.scene!==this.lastScene) {
        // Live handoff anchors: the next medium starts where this hero's feet were.
        if(s.scene==='extreme')this.neonFrom=this.stats.hero&&this.lastScene==='moon'?{x:clamp(this.stats.hero.x,this.w*.15,this.w*.6),y:clamp(this.stats.hero.y,this.h*.4,this.h-80)}:null;
        if(s.scene==='collapse')this.foldFrom=this.lastScene==='extreme'&&this.neonFoot?{...this.neonFoot}:null;
      }
      if(!reset && (desired!==this.currentMedium || (this.handoff && s.scene!==this.lastScene))) {
        // Rapid changes replace, rather than chain, the outgoing style. Only the page
        // sprite <-> sculpted morph shows both heroes; otherwise the outgoing world
        // continues live without its hero, so exactly one hero is ever drawn.
        const morph=this.currentMedium==='chrome'||desired==='chrome';
        this.handoff={medium:this.currentMedium,scenery:this.lastScenery,start:s.simTime,duration:s.reducedMotion?.24:morph?.65:.42,hero:morph};
        this.lastScenery={};
      }
      this.currentMedium=desired;this.lastScene=s.scene;this.lastRun=s.run;
      const dt=clamp(s.simTime-(this.lastTime??s.simTime),0,.1);this.lastTime=s.simTime;
      const ease=1-Math.exp(-dt/ .18);
      this.visual.bend=mix(this.visual.bend,s.scene==='dream'?this.bend(s):0,ease);
      this.visual.lift=mix(this.visual.lift,s.scene==='desktop'?s.morph*.24:0,ease);
      this.hudDesktop=mix(this.hudDesktop||0,s.scene==='desktop'?1:0,ease);
      if(s.mode!=='running')this.handoff=null;
      let blend=this.handoff?smooth((s.simTime-this.handoff.start)/this.handoff.duration):1;
      if(this.handoff?.medium==='chrome'&&desired==='vector-3d'&&s.scene==='extrusion')blend=smooth((s.extrusion-.025)/.22);
      if(this.handoff?.medium==='vector-3d'&&desired==='chrome'&&s.scene==='collapse')blend=smooth((.12-s.projectionBlend)/.1);
      if(blend>=1)this.handoff=null;
      // The integer runner ratio is only held while the Chromium sprites are on screen.
      if(desired==='chrome'&&!this.native)this.setNative(Math.floor(devicePixelRatio)||1);
      if(this.native && desired!=='chrome' && !this.handoff)this.setNative(null);
      // Both visible gameplay passes use this single current camera and transform.
      this.camera(s);
      const deferHero=!!this.handoff&&!this.handoff.hero;
      this.deferred=deferHero&&desired!=='neon-doodle'?[]:null;this.deferredNeon=null;
      const incoming=this.renderWorld(s,s,desired,c,deferHero&&desired==='neon-doodle'?'defer':true);
      const deferred=this.deferred;this.deferred=null;
      let commands=incoming.commands,images=incoming.images,passes=1,outgoingCommands=0;
      if(this.handoff) {
        const old=this.handoff.scenery;
        const advance=dt*s.speed;
        old.sceneTime+=dt;old.simTime=s.simTime;old.distance+=advance;old.sceneDistance+=advance;old.player=s.player;
        for(const m of old.monuments||[]){m.age+=dt;m.z-=advance*.44;}
        for(const win of old.windows||[]){win.age+=dt;win.z-=advance*.48;}
        for(const tower of old.city||[])tower.z-=advance;
        for(const effect of old.effects||[])effect.age+=dt;
        // The final earned landing can happen between the last outgoing render
        // and enter(). Keep that actual event in its original medium, not the
        // quiet incoming world. Copy only on handoff creation, after aging the
        // previous frame: new events retain their exact simulation age.
        if(this.handoff.start===s.simTime)for(const effect of s.effects) {
          if(effect.scene!==old.scene)continue;
          const previous=old.effects.find(e=>e.scene===effect.scene&&e.seed===effect.seed&&!!e.slam===!!effect.slam&&!!e.puff===!!effect.puff);
          if(previous)Object.assign(previous,effect);
          else {old.effects.push({...effect});if(old.effects.length>8)old.effects.shift();}
        }
        // A painted world leaving for EXTREME keeps its own camera while it fades.
        const ownCamera=s.scene==='extreme'&&old.scene!=='extreme';
        if(ownCamera)this.camera(old);
        this.giantAlpha=this.handoff.medium==='neon-doodle'?1-smooth((s.simTime-this.handoff.start)/.2):1;
        const outgoing=this.renderWorld(old,s,this.handoff.medium,this.blendContext,this.handoff.hero);
        this.giantAlpha=1;
        if(ownCamera)this.camera(s);
        c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=1-blend;
        c.imageSmoothingEnabled=false;c.drawImage(this.blendCanvas,0,0);c.restore();
        outgoingCommands=outgoing.commands;commands+=outgoingCommands;images+=outgoing.images+1;passes=2;
        if(desired==='neon-doodle')this.neonCamera(s);
        if(deferred){
          this.camera(s);this.medium=desired;this.modern=MODERN.includes(desired)||(desired==='vector-3d'&&s.scene==='collapse');
          if(desired==='pixel-16') {
            // The incoming 16-bit hero goes through the same nearest-pixel raster, then
            // only its own quad is composited above the fading world (still one hero).
            images+=this.drawFaces(this.pixelContext,deferred);
            c.save();c.beginPath();
            for(const f of deferred)for(const part of f.group||[f]){const q=part.points;c.moveTo(...q[0]);for(let i=1;i<q.length;i++)c.lineTo(...q[i]);c.closePath();}
            c.clip();c.setTransform(1,0,0,1,0,0);c.imageSmoothingEnabled=false;
            const step=this.pixelStep;c.drawImage(this.pixelCanvas,0,0,this.pixelCanvas.width*step,this.pixelCanvas.height*step);c.restore();images++;
          } else images+=this.drawFaces(c,deferred);
        }
        if(this.deferredNeon){this.neonCamera(s);const extra=this.deferredNeon();this.deferredNeon=null;incoming.commands+=extra;commands+=extra;}
      }
      this.medium=desired;
      if(document.documentElement.dataset.medium!==desired)document.documentElement.dataset.medium=desired;
      this.remember(s);
      if(this.art.status!=='ready'&&this.skyImage){this.skyCanvas.width=0;this.skyCanvas.height=0;this.skyImage=null;}
      const bufferPixels=this.blendCanvas.width*this.blendCanvas.height+this.pixelCanvas.width*this.pixelCanvas.height+(this.skyCanvas?this.skyCanvas.width*this.skyCanvas.height:0);
      this.stats.style=desired;this.art.snapshot(this.stats.assets);this.stats.images=images;
      this.stats.worldResolution=incoming.resolution;
      this.stats.budgets.used=incoming.commands;
      Object.assign(this.stats.transition,{active:!!this.handoff,blend,passes,commands,incomingCommands:incoming.commands,outgoingCommands,images,bufferPixels,bufferBytes:bufferPixels*4});
      this.stats.peakImages=Math.max(this.stats.peakImages||0,images);
      this.stats.maxCombinedCommands=Math.max(this.stats.maxCombinedCommands||0,commands);
      this.stats.peakPassCommands=Math.max(this.stats.peakPassCommands||0,incoming.commands,outgoingCommands);
      c.imageSmoothingEnabled=true;
      // Nothing of the game's own HUD exists before lap one's transformation is underway.
      const hud=s.revealAt==null?0:smooth((s.simTime-s.revealAt)/.6);
      this.stats.hudAlpha=hud;
      if(hud>0)this.hud(s,c,hud);
      this.stats.polygons=commands;
      this.stats.maxPolygons=Math.max(this.stats.maxPolygons,commands);
      this.stats.renderMs=performance.now()-start;
      this.stats.transition.renderMs=this.stats.renderMs;
      this.stats.transition.peakCommands=this.stats.maxCombinedCommands;
      this.stats.transition.peakPassCommands=this.stats.peakPassCommands;
      this.stats.transition.peakImages=this.stats.peakImages;
      this.stats.peakRenderMs=Math.max(this.stats.peakRenderMs||0,this.stats.renderMs);
      this.stats.transition.peakRenderMs=this.stats.peakRenderMs;
    }
    bend(s) {
      // The original earned painted morph: every clear bends the valley path further.
      return 1.6+s.morph*.8;
    }
  }
  window.DinoRenderer = DinoRenderer;
})();
