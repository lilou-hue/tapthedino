/* World-space renderer: shared projection, depth queue and bounded art-medium passes. */
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
  const GRAY = [83,83,83], CHROME = [174,218,233], LIME = [193,255,105];
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
  // Painted valley: asymmetric groups with quiet gaps, looping every 84 units.
  // Decorative cacti stay far from the hazard corridor.
  const VALLEY = [[3,-7.6,'boulder',1.9],[6,-10,'mushroom',3.7],[19,8,'arch',3.2],[21.5,10.8,'mushroom',4.4],[23.5,8.6,'boulder',1.5],
    [38,-8.8,'arch',3],[44,-21,'mushroom',9.5],[51,9.4,'boulder',2.3],[54,13,'mushroom',5],[62,-15.5,'cactus',3.1],[66,-12.2,'mushroom',4.6],[76,24,'mushroom',10]];
  const VALLEY_LOOP = 84;
  // Only scenery primitives are remembered; no key enumeration or gameplay copy.
  const SCENERY_FIELDS=['mode','scene','previousScene','sceneTime','simTime','beat','speed','distance',
    'score','combo','multiplier','success','target','health','maxHealth','recovery','lap','variant',
    'lapEarned','lapScore','banked','impact','burst','earned','fallback','projectionBlend',
    'extrusion','pending','nextSpawn','serial','sceneDistance','morph','morphTarget','lastJumpTime','finalInput',
    'completion','reported','debugAssisted','reducedMotion','run','previousBest',
    'worldRoll','rollFrom','rollTarget','rollTime','stageConfig'];

  class DinoRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.faces = [];this.sink=null;this.cost=0;this.sceneryLimit=2000;
      this.art=new DinoArt();this.medium='chrome';
      // One reusable outgoing world target for cross-medium handoffs.
      this.blendCanvas=document.createElement('canvas');
      this.blendContext=this.blendCanvas.getContext('2d',{alpha:false});
      this.lastScenery={};this.handoff=null;this.lastRun=null;
      this.visual={bend:0};this.hudTop=12;this.hudSize=36;this.hudRight=12;this.neonFrom=null;this.foldFrom=null;this.neonFoot=null;
      this.stats = { polygons: 0, renderMs: 0, maxPolygons: 0, assets:{}, budgets:{scenery:2000,gameplay:2600,used:0,reservedGameplay:600,packCap:0}, transition:{} };
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
      // Auxiliary targets: live blend <=4M + exact static sky <=4M pixels
      // (aggregate <=8M / 32MB RGBA, excluding the main canvas).
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
      // [azimuth, distance, eye height, target height, target z, screen y of target, screen x of feet]
      // Tall-enough screens frame a little lower, trimming the empty foreground.
      const narrow=this.w<600,low=this.h>=500?.04:0;
      return ({corkscrew:[-.5,16,5.5,.9,5.5,.45,.5],jelly:[-.34,17,6.4,1,6,.44,.36],moon:[-.32,19,6,1,6,.46,.36],dream:[narrow?-.42:-.48,narrow?15.5:16.5,6.4,1,6,.43+(narrow?low:0),.4],collapse:[-.30,15,5.5,1,6,.45,.5]})[scene]||[narrow?-.56:-.5,narrow?13.5:12,4.8,.9,5.5,.43+low,narrow?.34:.3];
    }
    camera(s) {
      this.s=s;this.hero=false;
      if(s.scene==='extreme') {
        this.neonCamera(s);return;
      }
      const b=s.projectionBlend, blend=smooth(s.sceneTime/1.2);
      const from=this.pose(s.previousScene), to=this.pose(s.scene);
      const pose=to.map((v,i)=>mix(from[i],v,blend));
      if(s.scene==='collapse')pose.splice(0,6,...this.pose('collapse'));
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
      // Frame the hero's feet at an authored screen x, blended in with the projection.
      this.cam.cx+=(this.w*pose[6]-this.footScreen()[0])*b;
      // A single rigid projected floor frame rotates about the hero's FOOT.
      // Nothing counter-rotates the hero: every jump's screen-space normal turns.
      if(['corkscrew','jelly','moon'].includes(s.scene)) {
        const ink=s.scene==='corkscrew',foot=this.footScreen();
        const x=this.w*(ink?.5:.36),y=ink?(this.h+70)/2:this.h*.66;
        const cfg=s.stageConfig,headroom=cfg?cfg.jump*cfg.jump/(2*cfg.gravity)+(cfg.bodyHeight||1.9):6.1;
        const safeTop=this.hudTop+this.hudSize+48;
        const maxK=ink?Math.min(this.w*.105,(this.h-130)/7.8,45):Math.min(this.w*.115,Math.max(10,(y-safeTop)/headroom),48);
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
      const rgb = color.map((n, i) => Math.round(mix(clamp(n * shade, 0, 255), this.background[i], fog)));
      this.cost++;
      const face={ points, depth, layer: this.layer, color: `rgb(${rgb.join(',')})`, edge, width:this.edgeWidth, opacity:this.opacity??1, order: this.faces.length };
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
    landingScale(s) {
      const t=1-clamp(s.impact/.32);
      // Feet/atlas anchors stay fixed: a small compression that keeps anatomy coherent.
      return 1-Math.sin(t*Math.PI*2)*(1-t)*.09*(s.reducedMotion?.35:1);
    }
    clearWave(s,z) {
      let pulse=0;
      for(const effect of s.effects) {
        if(effect.puff)continue;
        const age=effect.age-Math.max(0,z)/70;
        if(age>0 && age<.55)pulse=Math.max(pulse,Math.sin(age/.55*Math.PI)*(effect.big?1:.6));
      }
      return pulse*(s.reducedMotion?.25:1);
    }
    build(s) {
      const duration=({track:14,dream:12})[s.scene];
      if(!duration || !s.success)return 0;
      const progress=Math.max(s.sceneTime/duration,s.success/Math.max(1,s.target));
      return smooth((progress-.55)/.45)*(s.reducedMotion?.25:1);
    }
    sculptedHero(s,o={}) {
      if(this.cost+44>(this.gameplay?2600:this.sceneryLimit))return;
      const fallback=this.medium==='gouache-fallback',e=smooth(s.extrusion),ext=mix(.035,1,e);
      const base=this.hero&&s.recovery>0?[202,116,65]:this.medium==='ink-paper'?[241,231,208]:this.medium==='gummy'?[236,137,178]:this.medium==='lunar'?[222,224,240]:fallback?[72,170,142]:(this.anchor?this.theme.ink:GRAY).map((n,i)=>mix(n,CHROME[i],s.extrusion));
      const tones=[mixRGB(base,fallback?[34,62,78]:[22,28,64],.46*e),base,mixRGB(base,[255,255,255],.24*e)];
      const edge=mixRGB(base,[12,16,40],.62*e).map(Math.round);
      const accent=mixRGB(base,this.medium==='ink-paper'?[203,59,57]:this.medium==='gummy'?[149,245,215]:this.medium==='lunar'?[150,175,216]:fallback?[244,190,76]:LIME,e);
      const y0=o.y??s.player.height,scale=this.anchor&&this.hero?mix(.87,1,smooth(s.projectionBlend/.35)):1;
      const squash=this.medium==='gummy'?Math.min(1,this.landingScale(s)):this.landingScale(s),lean=s.player.stumble>0?-.1:0;
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
    paintedGround(s) {
      this.layer=0;
      const image=this.art.images.valley,rect=this.art.groundSample;
      // Fine sampled brushwork only along the corridor, along the same bent world-space path.
      for(let i=-4;i<27;i++) {
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
      // Broad, cheap outer coverage past the frustum edges: one coarse quad per cell,
      // so the valley floor never ends as a rectangular carpet.
      for(let i=-1;i<10;i++) {
        const z=i*12-s.distance%12,far=z+6>79;
        const worldIndex=i+Math.floor(s.distance/12),flip=((worldIndex%2)+2)%2;
        const cells=far?[[0,52.5],[-94.5,42],[94.5,42]]:[[-31.5,21],[31.5,21],[-94.5,42],[94.5,42]];
        for(const [x,half] of cells) {
          const za=flip?z+6.02:z-6.02,zb=flip?z-6.02:z+6.02;
          this.imageQuad(image,rect,[[x-half,-.1,za],[x+half,-.1,za],[x+half,-.1,zb],[x-half,-.1,zb]]);
        }
      }
    }
    valleyProps(s) {
      this.layer=2;
      // Projected bounds of the hero and the next hazard: a near prop fades out before
      // its painted silhouette can overlap either, not merely by world x.
      const live=this.live,next=live.obstacles?.find(o=>!o.resolved&&o.z>-.4);
      const keep=[this.spriteRect(0,live.player.height,0,2.6,3.1,[.66,.92]),next?this.spriteRect(0,0,next.z,1.6,1.65):null].filter(Boolean);
      const mirror=s.variant===1?-1:1,shift=s.variant===2?VALLEY_LOOP/2:0;
      for(const [pz,px,name,size] of VALLEY) {
        const z=((pz+shift-s.sceneDistance)%VALLEY_LOOP+VALLEY_LOOP)%VALLEY_LOOP-8,x=px*mirror;
        const breath=this.clearWave(s,z)*.1+this.build(s)*.012*Math.sin(s.beat*Math.PI-z*.09);
        const width=size*(1-breath*.3),height=size*(1+breath);
        let alpha=smooth((z+4)/6)*smooth((VALLEY_LOOP-10-z)/10);
        const r=this.spriteRect(x,0,z,width,height);
        if(!r)continue;
        for(const k of keep) {
          if(r.depth>k.depth+8)continue;
          const gap=Math.max(r.left-k.right,k.left-r.right,r.top-k.bottom,k.top-r.bottom);
          alpha=Math.min(alpha,smooth(gap/36));
        }
        if(alpha<=.02)continue;
        // Breathe the actual painted cutouts, not a synthetic replacement or glow pass.
        this.opacity=alpha;this.sprite(this.art.frames[name],x,0,z,width,height);
      }
      this.opacity=1;
    }
    fallbackValley(s) {
      // Explicit procedural fallback (never reported as generated art): a warm
      // sculpted dune valley at the painted camera, with the same playable framing.
      this.layer=0;
      for(let i=-4;i<27;i++) {
        const z=i*3-s.distance%3;
        this.polygon([[-2.9,0,z-1.51],[2.9,0,z-1.51],[2.9,0,z+1.51],[-2.9,0,z+1.51]],i%2?[238,190,150]:[241,195,156]);
      }
      this.fins(s,1,[[226,150,120],[196,120,104]],10);
    }
    fins(s,e,colors,offset=9.5) {
      // A few broad folded fins, leaving the corridor clear and quiet.
      this.layer=2;
      for(let i=0;i<4;i++)for(const side of [-1,1]) {
        const zf=10+i*16-(s.distance*.35)%16+(side>0?7:0),x=side*(offset+i*.8+(side>0?1.6:0));
        const wave=this.clearWave(s,zf)*.5,fade=smooth((zf+4)/8)*smooth((66-zf)/10);
        const h=(3.4+((i+(side>0?1:0))%3)*1.5)*e*(1+wave*.12)*fade;
        if(h<.05)continue;
        this.polygon([[x,0,zf-4],[x+side*6,h,zf+1],[x+side*2.4,0,zf+6]],mixRGB(colors[0],[120,150,210],wave*.3));
        this.polygon([[x,0,zf-4],[x+side*6,h,zf+1],[x+side*10,0,zf-1]],colors[1]);
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
      if(this.medium==='ai-gouache') {
        const landing=this.landingScale(s);
        const frame=!s.player.grounded?'jump':s.mode==='idle'?'idle':Math.floor(s.distance*2)%2?'runA':'runB';
        this.sprite(this.art.frames[frame],0,options.y??s.player.height,0,2.6/landing,3.1*landing);return;
      }
      this.sculptedHero(s,options);
    }
    cactus(z, x = 0, base = 0) {
      if(this.medium==='ai-gouache'){this.sprite(this.art.frames.cactus,x,base,z,1.6,1.65);return;}
      // Saturated teal against the indigo night; warm coral in the fallback valley.
      this.sculptedCactus(z,1,x,base,this.medium==='ink-paper'?[201,54,57]:this.medium==='gummy'?[214,45,99]:this.medium==='lunar'?[178,205,239]:this.medium==='gouache-fallback'?[226,104,92]:[36,206,190]);
    }
    inkWorld(s) {
      this.layer=0;
      // One cream paper lane, inked margins and joined arch ribs. No bar field.
      for(let i=-5;i<29;i++) {
        const z=i*3-s.distance%3;
        this.polygon([[-2.9,0,z],[2.9,0,z],[2.9,0,z+3.02],[-2.9,0,z+3.02]],[239,225,195]);
        for(const side of [-1,1]) {
          const x=side*2.9;
          this.polygon([[x-.035,.015,z],[x+.035,.015,z],[x+.035,.015,z+3.02],[x-.035,.015,z+3.02]],[45,40,38]);
        }
      }
      this.layer=2;
      for(let i=0;i<6;i++) {
        const z=12+i*12-s.distance%12;
        for(const side of [-1,1]) {
          // Joined sculptural paper ribs sit OUTSIDE the playable corridor.
          const x=side*5.7;
          const points=[[x,0,z],[x+side*.5,3.4,z],[x+side*2.4,5,z],[x+side*2.6,4.8,z],[x+side*.8,3.2,z],[x+side*.26,0,z]];
          this.polygon(points,[214,198,169],1,[65,52,43]);
          this.polygon(points.map(([a,b,c])=>[a,b,c+.3]),[245,236,215],1,[65,52,43]);
          // Tiny halftone clusters, not competing silhouettes in the lane.
          for(let j=0;j<3;j++)this.polygon([[x+side*(1+j*.3),.02,z+1],[x+side*(1.1+j*.3),.02,z+1.1],[x+side*(1.2+j*.3),.02,z+1]],[165,145,118]);
        }
      }
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
        const sway=Math.sin(s.simTime*1.4+i)*.10;
        // Soft, rooted gumdrop caps with rounded shoulders, not floating crystals.
        const stem=[[-.24,0],[-.32,.12],[-.30,h*.55],[.30,h*.55],[.32,.12],[.24,0]];
        this.polygon(stem.map(([a,b])=>[x+a,b,z]),[108,178,157]);
        const cap=Array.from({length:24},(_,j)=>{const t=j*Math.PI/12;return [x+Math.cos(t)*h*.48+sway,h*.67+Math.sin(t)*h*.34,z-.04];});
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
    world(s) {
      if(s.scene==='corkscrew'){this.inkWorld(s);return;}
      if(s.scene==='jelly'){this.jellyWorld(s);return;}
      if(s.scene==='moon'){this.moonWorld(s);return;}
      if(s.scene==='dream') {
        if(this.medium==='ai-gouache'){this.paintedGround(s);this.valleyProps(s);}
        else this.fallbackValley(s);
        return;
      }
      const e = smooth(s.extrusion), b = s.projectionBlend, chrome=this.medium==='chrome', a=this.anchor, collapse=s.scene==='collapse';
      this.layer=0;
      const width = mix(.035,5.8,e);
      const travel = s.distance % 3;
      // Anchored lap-one views reach the viewport edges, not the old fixed span.
      const zLo=a?Math.min(-15,Math.floor((-this.cam.cx/a.scale-2)/3)*3):-15, zHi=a?Math.max(84,(this.w-this.cam.cx)/a.scale+3):84;
      if(chrome)this.chromeHorizon(s);
      else for (let i = Math.round(zLo/3); i < Math.ceil(zHi/3)+1; i++) {
        const z = i * 3 - travel;
        const ripple = s.scene === 'rupture' ? this.ripple(s,z) : 0;
        // A quiet, continuous dark road: joints differ by a hair, never stripes.
        const color = this.base.map((n,j) => mix(n,(i%2 ? [29,32,57] : [31,34,60])[j],e));
        this.layer=0;this.box(0,ripple-.10,z,width,.20,3.015,color);
        if (e > .02) {
          const light=this.clearWave(s,z)*.7+this.build(s)*.12*(.5+.5*Math.sin(z*.55-s.beat*Math.PI*2));
          // Hairline rails lie flush on the road edge; a decal layer, not a bright wall.
          this.layer=1;
          for (const side of [-1,1]) {
            const x0=side*(width*.5-.03),x1=side*(width*.5+.015+light*.03);
            this.polygon([[x0,ripple+.004,z-1.5],[x1,ripple+.004,z-1.5],[x1,ripple+.004,z+1.5],[x0,ripple+.004,z+1.5]],[64+light*90,150+light*70,172+light*50]);
          }
          if (i%2 === 0) this.polygon([[-.025,ripple+.004,z-.35],[.025,ripple+.004,z-.35],[.025,ripple+.004,z+.35],[-.025,ripple+.004,z+.35]],[66,72,108]);
        }
      }
      if (e < .01 && s.scene !== 'rupture' && !chrome) {
        this.layer=0;this.box(0,-.10,28,.06,.035,100,GRAY);
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
      // The fold returns only the sculpted ribbon and its one hero to the page.
      if (e > .01 && !collapse) {
        // The original page physically folds into two wings off the unfolding ribbon.
        const fold = smooth(s.extrusion), wing = mix(0,1.45,fold);
        this.layer=-1;
        if (fold < .995) for (const side of [-1,1]) {
          const x = side * width / 2;
          this.polygon([[x,-.15,-10],[x,-.15,60],[x+side*26*Math.cos(wing),-26*Math.sin(wing),60],[x+side*26*Math.cos(wing),-26*Math.sin(wing),-10]],a?this.theme.page.map(n=>mix(n,237,.04)):[237,239,247]);
        }
        this.layer=2;
        // One suspended faceted sun near the vanishing point, below the HUD band.
        const z = 70, y = 9, radius = 7 * e;
        const top = [0,y+radius,z], bottom = [0,y-radius,z];
        const ring = Array.from({length:8},(_,i) => { const a = i*Math.PI/4 + (s.reducedMotion ? .2 : s.simTime*.035); return [Math.cos(a)*radius,y, z+Math.sin(a)*radius]; });
        for (let i=0;i<8;i++) {
          this.polygon([top,ring[i],ring[(i+1)%8]],[244,108,175],.62+i*.05);
          this.polygon([bottom,ring[(i+1)%8],ring[i]],[117,76,199],.62+i*.035);
        }
        this.fins(s,e,[[50,44,100],[29,26,64]]);
        // At most two quiet background cactiforms, outside the corridor, sinking
        // away before they reach the camera; no crossbeams or reward rows.
        const live=this.live,next=live.obstacles?.find(o=>!o.resolved&&o.z>-.4);
        // The hero's whole jump envelope, not its current height: no pumping while it jumps.
        const low=this.spriteRect(0,0,0,2.4,2.5,[.45,.95]),high=this.spriteRect(0,1.7,0,2.4,2.5,[.45,.95]);
        const keep=[low&&high?{...low,top:Math.min(low.top,high.top)}:low,next?this.spriteRect(0,0,next.z,1.4,1.6,[.5,.95]):null].filter(Boolean);
        for (const m of s.monuments.slice(-2)) {
          const wave=this.clearWave(s,m.z);let grow=smooth(m.age/1.0)*smooth((m.z-4)/10);
          const full=Math.min(m.scale*.42,4.2),r=this.spriteRect(m.side*(10+full*.6),0,m.z,full*1.25,full*1.45,[.5,.97]);
          // Sink away before the projected silhouette touches the hero or next hazard.
          if(r)for(const k of keep){const gap=Math.max(r.left-k.right,k.left-r.right,r.top-k.bottom,k.top-r.bottom);grow*=smooth((gap-6)/50);}
          const h=full*grow*(1+wave*.08);
          if(h<.05)continue;
          this.sculptedCactus(m.z,h,m.side*(10+h*.6),0,m.side<0?[86,72,156]:[52,104,134],false);
        }
      }
    }
    contactAccents(s,painted) {
      // A short (.36 s) contact accent, radius <= 1.3: two arcs for a clear, two
      // more for a big clear. Painted landings are soft cream dust and umber strokes.
      this.layer=3;
      for(const effect of s.effects) {
        if(effect.puff)continue;
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
    palette(scene) {
      return ({corkscrew:[249,241,220],jelly:[179,233,224],moon:[39,36,65],dream:[250,208,167],extreme:[17,13,43],breath:[247,247,247]})[scene] || [9,11,29];
    }
    gameplayWorld(s,showHero=true) {
      this.gameplay=true;this.layer=3;
      const painted=this.medium==='ai-gouache',warm=painted||this.medium==='gouache-fallback';
      const next=s.obstacles.find(o=>!o.resolved && o.kind!=='ceiling' && o.z>-.3);
      if(next && s.projectionBlend>.1) {
        // Same take-off line and colour switch, drawn as two quiet ticks and a hairline.
        const z=next.z-s.speed*.42,near=next.z/s.speed<.60;
        const color=warm?(near?[190,112,66]:[142,104,84]):(near?[236,214,132]:[88,102,150]);
        this.opacity=near?.92:.6;this.layer=1;
        this.polygon([[-.55,.03,z-.025],[.55,.03,z-.025],[.55,.03,z+.025],[-.55,.03,z+.025]],color);
        for(const side of [-1,1])this.polygon([[side*1.2,.03,z-.05],[side*1.6,.03,z-.05],[side*1.6,.03,z+.05],[side*1.2,.03,z+.05]],color);
        this.opacity=1;
      }
      if(showHero && s.projectionBlend>.05) {
        const lift=1/(1+s.player.height*.55);
        if(painted)this.softShadow(.18,.12,.6*(.7+lift*.3),.72*(.7+lift*.3),[112,70,54],.42*lift);
        else if(s.extrusion>.05)this.softShadow(0,-.05,.5*(.7+lift*.3),.95*(.7+lift*.3),warm?[118,72,56]:[3,4,14],(warm?.4:.62)*lift*smooth(s.extrusion));
      }
      this.layer=4;
      if(showHero) {
        // Continuity probe: where the one hero's feet project this frame, and at what scale.
        const hv=this.view([0,s.player.height,0]);
        if(hv[2]>.35){const hp=this.project(hv);this.stats.hero={x:hp[0],y:hp[1],pxPerUnit:this.cam.focal/mix(24,Math.max(.35,hv[2]),this.cam.b),medium:this.medium};}
        const first=this.faces.length;
        this.hero=true;this.dino(s);this.hero=false;
        const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
        for(let i=first;i<this.faces.length;i++) {
          const face=this.faces[i];face.hero=true;
          for(const part of face.group||[face])for(const point of part.points||[]) {
            bounds.left=Math.min(bounds.left,point[0]);bounds.right=Math.max(bounds.right,point[0]);
            bounds.top=Math.min(bounds.top,point[1]);bounds.bottom=Math.max(bounds.bottom,point[1]);
          }
        }
        if(Number.isFinite(bounds.left))this.stats.hero.bounds=bounds;
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
        if(s.extrusion>.05)this.softShadow(0,o.z,.5,.3,warm?[118,72,56]:[3,4,14],warm?.3:.5);
        this.layer=4;if(o.kind==='ceiling')this.canopy(o);else this.cactus(o.z);
      }
      this.contactAccents(s,warm);
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
        c.save();c.translate(x,y);c.scale(unit,unit);c.globalAlpha=opacity;
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
        c.save();c.translate(x,y);c.scale(unit*(.35+t*.6),unit*(.35+t*.6));c.globalAlpha=(1-t)*.65;
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
    remember(s) {
      // Two bounded scenery records, never old gameplay or a frozen screenshot.
      const out=this.lastScenery;
      for(const key of SCENERY_FIELDS)out[key]=s[key];
      for(const key of ['monuments','effects']) {
        const items=out[key]||(out[key]=[]),source=s[key];
        for(let i=0;i<source.length;i++)Object.assign(items[i]||(items[i]={}),source[i]);
        items.length=source.length;
      }
      out.player=s.player;out.obstacles=[];out.flatAnchor=s.flatAnchor;out.extreme=s.extreme?{...s.extreme}:null;
    }
    renderWorld(s,live,medium,target,showHero=true) {
      this.medium=medium;this.opacity=1;
      if(medium==='neon-doodle')return {commands:this.extremeWorld(s,target,showHero),images:0,resolution:[target.canvas.width,target.canvas.height]};
      const w=this.w,h=this.h,c=target;
      c.imageSmoothingEnabled=true;c.imageSmoothingQuality=medium==='ai-gouache'?'high':'low';
      const e = smooth(s.extrusion);
      const palette=this.palette(s.scene), prev=this.palette(s.previousScene);
      const tone=palette.map((n,i)=>mix(prev[i],n,smooth(s.sceneTime/1.1)));
      // Lap one's flat views start from the actual page colour (light or dark).
      this.base=['offline','rupture','extrusion','collapse','breath'].includes(s.scene)?this.theme.page:[247,247,247];
      const bg = this.base.map((n,i)=>Math.round(mix(n,tone[i],e)));
      this.background=bg;
      c.fillStyle = `rgb(${bg})`; c.fillRect(0,0,w,h);
      if (e > .01 && ['extrusion','track'].includes(s.scene)) {
        // One soft dusk glow behind the sun, centred on its projected position.
        const v=this.view([0,9,70]),p=v[2]>.35?this.project(v):[w*.53,h*.38];
        const gradient = c.createRadialGradient(p[0],p[1],0,p[0],p[1],Math.max(w,h)*.62);
        gradient.addColorStop(0,`rgba(104,49,121,${e*.42})`); gradient.addColorStop(1,'rgba(9,11,29,0)');
        c.fillStyle=gradient; c.fillRect(0,0,w,h);
      }
      if(this.medium==='lunar')this.lunarSky(c);
      if(this.medium==='ai-gouache')this.paintedSky(c);
      this.faces.length = 0;this.cost=0;this.gameplay=false;this.sink=null;this.live=live;
      this.world(s);this.gameplayWorld(live,showHero);
      // Ground/decal passes avoid average-depth floor polygons cutting through feet.
      // Above-ground meshes retain stable camera-space painter ordering.
      this.faces.sort((a,b)=>a.layer-b.layer || b.depth-a.depth || a.order-b.order);
      let images=(this.medium==='ai-gouache'?1:0)+this.drawFaces(c,this.faces);
      c.globalAlpha=1;
      return {commands:this.cost,images,resolution:[target.canvas.width,target.canvas.height]};
    }
    drawFaces(c,faces) {
      c.lineJoin='round';
      const path=points=>{c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);c.closePath();};
      const fill=(f,opacity)=>{
        c.globalAlpha=opacity;path(f.points);c.fillStyle=f.color;c.fill();
        // Translucent decals are never stroked (no compounding edges).
        if(opacity<.999)return;
        let left=Infinity,right=-Infinity;
        for(const p of f.points){if(p[0]<left)left=p[0];if(p[0]>right)right=p[0];}
        // Ground is a continuous material, never a wireframe. Internal joints are quiet.
        c.strokeStyle=f.edge&&right-left>=4?'rgb('+f.edge.join(',')+')':f.color;
        c.lineWidth=f.edge?f.width||.8:.65;c.stroke();
      };
      let images=0;
      for (const f of faces) {
        // A cross-medium handoff draws the one incoming hero above the fading world.
        if(f.hero&&this.deferred&&faces===this.faces){this.deferred.push(f);continue;}
        if(f.image){c.globalAlpha=f.opacity??1;this.texture(c,f);images+=f.units;continue;}
        if(f.group){for(const part of f.group)fill(part,part.opacity??1);continue;}
        fill(f,f.opacity??1);
      }
      c.globalAlpha=1;
      return images;
    }
    hud(s,c,alpha) {
      const w=this.w,h=this.h,top=this.hudTop,size=this.hudSize;
      const painted=['ai-gouache','gouache-fallback'].includes(this.medium),light=painted||['ink-paper','gummy'].includes(this.medium)||(this.medium==='chrome'&&!this.theme.dark);
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
      if(reset){this.handoff=null;this.lastScenery={};this.currentMedium=desired;this.lastScene=s.scene;this.neonFrom=null;this.foldFrom=null;this.neonFoot=null;this.visual={bend:s.scene==='dream'?this.bend(s):0};}
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
        for(const effect of old.effects||[])effect.age+=dt;
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
        if(deferred){this.camera(s);this.medium=desired;images+=this.drawFaces(c,deferred);}
        if(this.deferredNeon){this.neonCamera(s);const extra=this.deferredNeon();this.deferredNeon=null;incoming.commands+=extra;commands+=extra;}
      }
      this.medium=desired;
      if(document.documentElement.dataset.medium!==desired)document.documentElement.dataset.medium=desired;
      this.remember(s);
      if(this.art.status!=='ready'&&this.skyImage){this.skyCanvas.width=0;this.skyCanvas.height=0;this.skyImage=null;}
      const bufferPixels=this.blendCanvas.width*this.blendCanvas.height+(this.skyCanvas?this.skyCanvas.width*this.skyCanvas.height:0);
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
      // A moderate painted path bend that grows a little with each clear.
      return 1.1+Math.min(s.morph,6)*.15;
    }
  }
  window.DinoRenderer = DinoRenderer;
})();
