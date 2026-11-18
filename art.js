/* One-time loading of the generated gouache pack, and the retained route's art media. */
(() => {
  'use strict';
  const canvas = (w,h,paint) => {
    const image=document.createElement('canvas');image.width=w;image.height=h;
    paint(image.getContext('2d'));return image;
  };
  class DinoArt {
    constructor() {
      this.status='loading';this.fallbackReason='painted assets loading';this.images={};this.frames={};
      this.loaded=0;
      this.load();
    }
    async load() {
      const timeout=setTimeout(()=>{if(this.status==='loading'){this.status='fallback';this.fallbackReason='painted assets delayed';}},10000);
      try {
        const manifestURL=new URL('assets/painted/manifest.json?v=49',location.href);
        const response=await fetch(manifestURL);
        if(!response.ok)throw new Error('manifest HTTP '+response.status);
        const manifest=await response.json();
        // The installed manifest is validated before any atlas frame is used.
        if(!manifest.atlases || !manifest.background || !manifest.images)throw new Error('invalid painted manifest');
        const load=(file)=>new Promise((resolve,reject)=>{
          if(typeof file!=='string'||!/^[-\w.]+\.webp$/.test(file)){reject(new Error('invalid image path'));return;}
          // Decode off the main thread before use, so no first painted frame pays for it.
          const image=new Image();image.onload=()=>{if(!image.naturalWidth)reject(new Error('empty '+file));else {this.loaded++;(image.decode?image.decode().catch(()=>{}):Promise.resolve()).then(()=>resolve(image));}};
          image.onerror=()=>reject(new Error('image unavailable: '+file));
          const imageURL=new URL(file,manifestURL);imageURL.search='?v=49';image.src=imageURL.href;
        });
        const entries=Object.entries(manifest.atlases);
        const loaded=await Promise.all([...entries.map(async([key,atlas])=>{
          const image=await load(manifest.images[key]);const frames={};
          for(const [name,frame] of Object.entries(atlas.frames)) {
            const r=frame.rect,a=frame.anchor;
            if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>image.naturalWidth||r[1]+r[3]>image.naturalHeight||!Array.isArray(a)||a.length!==2||!a.every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new Error('invalid atlas frame '+name);
            // Extract once; transparent padding isolates atlas neighbours during filtering.
            const isolated=canvas(r[2]+4,r[3]+4,c=>c.drawImage(image,...r,2,2,r[2],r[3]));
            frames[name]={image:isolated,rect:[2,2,r[2],r[3]],anchor:a.slice(),billboard:true};
          }
          return {key,image,frames};
        }),load(manifest.images.valley).then(image=>({key:'valley',image}))]);
        for(const item of loaded){this.images[item.key]=item.image;if(item.frames)Object.assign(this.frames,item.frames);}
        for(const name of ['runA','runB','jump','idle','mushroom','cactus','arch','boulder'])if(!this.frames[name])throw new Error('missing frame '+name);
        const sample=manifest.background.groundSample,valley=this.images.valley;
        if(!Array.isArray(sample)||sample.length!==4||!sample.every(Number.isFinite)||sample[0]<0||sample[1]<0||sample[2]<=0||sample[3]<=0||sample[0]+sample[2]>valley.naturalWidth||sample[1]+sample[3]>valley.naturalHeight)throw new Error('invalid ground sample');
        this.groundSample=sample.slice();
        this.status='ready';this.fallbackReason=null;
      } catch(error) {this.status='fallback';this.fallbackReason=String(error.message||error);}
      finally {clearTimeout(timeout);}
    }
    snapshot(out={}) {out.status=this.status;out.imageCount=this.loaded;out.fallbackReason=this.fallbackReason;return out;}
    medium(s) {
      // Every lap starts/ends with the page's own runner; extrusion carries its sprites.
      // The fold keeps the sculpted hero until the camera is almost flat again.
      if(s.scene==='offline'||s.scene==='breath'||s.scene==='rupture'||(s.scene==='extrusion'&&s.extrusion<.025)||(s.scene==='collapse'&&s.projectionBlend<.12))return 'chrome';
      if(s.scene==='corkscrew')return 'ink-paper';
      if(s.scene==='jelly')return 'gummy';
      if(s.scene==='moon')return 'lunar';
      if(s.scene==='extreme')return 'neon-doodle';
      if(s.scene==='dream')return this.status==='ready'?'ai-gouache':'gouache-fallback';
      return 'vector-3d';
    }
  }
  window.DinoArt=DinoArt;
})();
