/* =====================================================================================================
   farm.js  -  Greenhouse potato farm for the Mars Research Base  (new module, additive)
   -----------------------------------------------------------------------------------------------------
   8 soil beds are laid into the GREENHOUSE spoke of the base interior. Walk up to a bed and press [E]:
     EMPTY    -> plant POTATO SEEDS (uses 1 seed; a NITRATE-RICH SOIL in the pack is spent as fertiliser = faster growth, bigger yield)
     GROWING  -> water it with the WATER BUCKET (1 L per watering). Plants only grow while the soil is moist.
     READY    -> harvest: potatoes go to the backpack, one seed potato is returned.
   Also registers: POTATO, POTATO RATION, POTATO SOUP and BIOMASS FUEL items, their crafting-table recipes,
   and the [Q] food effects for the two edible items.
   Hooks: base.js constructs  new Farm(base),  calls farm.update(dt) every frame, farm.interact() on [E],
   and farm.reset() on retry.  mars.js calls patchFarmItems(ITEMS) once.
   ===================================================================================================== */
import * as THREE from 'three';
import {stdMat,USE} from './tasks.js';
import {RECIPES} from './crafting.js';
import {spoke} from './basebuild.js';

const $=id=>document.getElementById(id),clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
export const GROW=80,FERT_BOOST=1.5,WATER_LIFE=55,REACH=2.1,ROW_SEEDS=12,YMIN=24,YMAX=26;   // a row = 2 beds: needs 12 seeds/potatoes, harvest gives 24-26 potatoes          // watered seconds to mature, fertiliser speed-up, seconds one litre keeps soil moist, interaction range (m)
const XS=[-1.55,1.55],ZS=[3.4,8.0,12.6];                         // bed positions in the greenhouse spoke frame

/* ---------------------------------------------- items ---------------------------------------------- */
const mk=(geo,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);return o};
function modelPotato(){const g=new THREE.Group(),m=stdMat(0xb78f5a,{roughness:.9,metalness:0}),e=stdMat(0x6b4a2a,{roughness:1,metalness:0});
 [[0,.05,0,.07,1.35,.9,1],[.12,.04,.05,.055,1.2,.85,1],[-.09,.04,.07,.06,1.25,.8,1.05]].forEach(([x,y,z,r,sx,sy,sz],i)=>{const k=mk(new THREE.SphereGeometry(r,14,10),m,x,y,z);k.scale.set(sx,sy,sz);k.rotation.y=i*1.7;g.add(k);
  for(let j=0;j<3;j++)g.add(mk(new THREE.SphereGeometry(.007,6,5),e,x+Math.cos(j*2.1+i)*r*.8,y+.01,z+Math.sin(j*2.1+i)*r*.7))});return g}
function modelSpudRation(){const g=new THREE.Group(),f=stdMat(0xe0b050,{metalness:.55,roughness:.35}),b=stdMat(0x6b4a2a,{roughness:.7}),w=stdMat(0xf2f2ea,{roughness:.6});
 g.add(mk(new THREE.BoxGeometry(.24,.05,.17),f,0,.03,0),mk(new THREE.BoxGeometry(.05,.054,.172),b,.04,.03,0),mk(new THREE.BoxGeometry(.12,.052,.08),w,-.04,.03,0));return g}
function modelSoup(){const g=new THREE.Group(),s=stdMat(0xb9c2cb,{metalness:.85,roughness:.38}),o=stdMat(0xe69a3a,{roughness:.4,emissive:0x5a2a08,emissiveIntensity:.4}),d=stdMat(0x2a2f36,{metalness:.7,roughness:.5});
 g.add(mk(new THREE.CylinderGeometry(.065,.055,.11,20),s,0,.065,0),mk(new THREE.CylinderGeometry(.058,.058,.012,20),o,0,.115,0));const r=mk(new THREE.TorusGeometry(.066,.007,6,20),d,0,.122,0);r.rotation.x=Math.PI/2;g.add(r);return g}
function modelBiofuel(){const g=new THREE.Group(),p=stdMat(0x3a2a1a,{roughness:.8,emissive:0x2a1204,emissiveIntensity:.5}),b=stdMat(0xff7a1f,{roughness:.5});
 [[0,0],[.08,.03],[-.07,.05],[.02,-.07]].forEach(([x,z],i)=>{const c=mk(new THREE.CylinderGeometry(.035,.035,.07,12),p,x,.04+(i>2?.07:0),z);g.add(c,mk(new THREE.CylinderGeometry(.036,.036,.012,12),b,x,.045+(i>2?.07:0),z))});return g}

/* ---- floating timer label above every bed ---- */
const fmt=t=>{t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
function mkLabel(){const c=document.createElement('canvas');c.width=256;c.height=112;const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));spr.scale.set(.95,.416,1);spr.renderOrder=6;spr.visible=false;return{c,x:c.getContext('2d'),tex,spr,key:''}}
export function patchFarmItems(I){
 const hold={x:.28,y:-.26,z:-.68,rx:.3};
 const add=(id,name,info,build)=>{I[id]={name,unit:'',info,build,size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold}};
 add('potato','POTATO','Greenhouse-grown tuber \u00b7 replant 12 per row, or craft rations, soup and biomass fuel',modelPotato);
 add('spudration','POTATO RATION','Baked potato & regolith-mineral paste \u00b7 press [Q] to eat (+60% food)',modelSpudRation);
 add('spudsoup','POTATO SOUP','Hot meltwater potato soup \u00b7 press [Q] to drink (+30% food)',modelSoup);
 add('biofuel','BIOMASS FUEL','Compressed potato-starch pellets with a regolith binder \u00b7 stored for the base generators',modelBiofuel);
 USE.spudration={k:'food',v:60,msg:'+60% FOOD  \u00b7  POTATO RATION',col:'#ffb347',name:'FOOD'};
 USE.spudsoup={k:'food',v:30,msg:'+30% FOOD  \u00b7  POTATO SOUP',col:'#ffb347',name:'FOOD'};
}
for(const r of[
 {id:'spudration',cat:0,n:1,req:{potato:3,regolith:1,ice:1},info:'Baked potato paste fortified with sintered regolith minerals \u00b7 +60% FOOD',note:'Grow potatoes in the base greenhouse. Press [Q] to eat.'},
 {id:'spudsoup',cat:0,n:2,req:{potato:1,ice:2},info:'Hot potato soup from melted ice \u00b7 +30% FOOD each',note:'Press [Q] to drink.'},
 {id:'biofuel',cat:1,n:2,req:{potato:3,regolith:2},info:'Biomass fuel pellets \u00b7 potato starch pressed with a regolith binder',note:'Stockpile for the base generators.'}])
 if(!RECIPES.some(q=>q.id===r.id))RECIPES.push(r);

/* ---------------------------------------------- the farm ---------------------------------------------- */
/* A ROW (the 3 beds down one side; the greenhouse has 2 rows) is planted, watered and harvested as one unit:
   plant 12 (seeds OR potatoes)  ->  water  ->  harvest 24-26 potatoes, which can be replanted or crafted. */
export class Farm{
 constructor(base){this.b=base;this.ready=false;this.plots=[];this.g=null;this.sp=null;this.lastPrompt='';this.fx=[]}
 reset(){this.ready=false;this.plots=[];this.g=null;this.sp=null;this.lastPrompt='';this.fx=[]}
 get s(){return this.b.mp.salv}
 build(gI){this.sp=spoke('gre');this.g=new THREE.Group();gI.add(this.g);
  const leafGeo=new THREE.SphereGeometry(.075,8,6),tubGeo=new THREE.SphereGeometry(.07,10,8),stemGeo=new THREE.CylinderGeometry(.008,.014,.3,6),ringGeo=new THREE.TorusGeometry(.33,.012,6,28),flGeo=new THREE.SphereGeometry(.028,7,5),
   flM=stdMat(0xf4eaff,{emissive:0x7a6a9a,emissiveIntensity:.5,roughness:.5}),seedM=stdMat(0xa07a48,{roughness:.9,metalness:0,emissive:0x4a3014,emissiveIntensity:.3});this.tubGeo=tubGeo;
  for(const x of XS)for(const z of ZS){const p={x,z,s:'empty',g:0,w:0,fert:false,said:false},grp=new THREE.Group();grp.position.set(x,.6,z);
   p.soilM=stdMat(0x6a4630,{roughness:1,metalness:0});grp.add(mk(new THREE.CylinderGeometry(.36,.4,.07,20),p.soilM,0,.02,0));
   p.ring=mk(ringGeo,new THREE.MeshBasicMaterial({color:0x3d9bff,transparent:true,opacity:.7}),0,.065,0);p.ring.rotation.x=Math.PI/2;grp.add(p.ring);
   /* potato plant: low leafy bush of arching stems with pairs of oval leaflets (no tall cactus-like stalk) */
   p.plant=new THREE.Group();p.plant.position.y=.05;p.leafM=stdMat(0x3fae52,{roughness:.8,metalness:0});
   for(let i=0;i<7;i++){const a=i/7*6.283+(i%2)*.3,arm=new THREE.Group();arm.rotation.y=-a;
    const st=mk(stemGeo,p.leafM,.06+.02*(i%2),.12,0);st.rotation.z=-.9-.15*(i%3);arm.add(st);
    for(let k=0;k<3;k++)for(const sz of[-1,1]){const l=mk(leafGeo,p.leafM,.05+.07*k+.01*(i%2),.1+.075*k,sz*.045);l.scale.set(1.5-.2*k,.28,.85);l.rotation.y=sz*.6;l.rotation.z=-.25;arm.add(l)}
    p.plant.add(arm)}
   p.plant.add(mk(leafGeo,p.leafM,0,.2,0));
   p.flower=new THREE.Group();for(let i=0;i<5;i++){const a=i*1.26;p.flower.add(mk(flGeo,flM,Math.cos(a)*.1,.3+.03*(i%2),Math.sin(a)*.1))}p.plant.add(p.flower);
   p.tubM=stdMat(0xb78f5a,{roughness:.9,metalness:0,emissive:0x6a4a1a,emissiveIntensity:.35});p.tubers=new THREE.Group();
   for(let i=0;i<5;i++){const t=mk(tubGeo,p.tubM,Math.cos(i*1.26)*.22,.07,Math.sin(i*1.26)*.22);t.scale.set(1.35,.85,1);t.rotation.y=i;p.tubers.add(t)}
   p.mound=new THREE.Group();for(let i=0;i<6;i++){const m=mk(tubGeo,seedM,Math.cos(i*1.05)*.18,.07,Math.sin(i*1.05)*.18);m.scale.set(1.2,.65,1);m.rotation.y=i;p.mound.add(m)}
   p.lab=mkLabel();p.lab.spr.position.set(0,.95,0);grp.add(p.plant,p.tubers,p.mound,p.lab.spr);p.grp=grp;this.g.add(grp);this.plots.push(p);this.paint(p)}
  this.ready=true}
 paint(p){const on=p.s!=='empty';p.plant.visible=on;p.tubers.visible=p.s==='ready';p.plant.scale.setScalar(.3+.7*clamp(p.g,0,1));p.mound.visible=p.s==='growing'&&p.g<.35;this.label(p);p.flower.visible=p.g>.7&&p.s!=='ready';
  p.ring.visible=p.w>.02;p.ring.material.opacity=.25+.55*clamp(p.w,0,1);
  const wet=clamp(p.w*1.6,0,1);p.soilM.color.setHex(0x6a4630).lerp(_wet,wet*.75);
  const dry=p.s==='growing'&&p.w<=0;p.leafM.color.setHex(dry?0x8a7a3a:p.s==='ready'?0x2f8a3c:0x3fae52)}
 label(p){const L=p.lab;if(!L)return;if(p.s==='empty'){L.spr.visible=false;return}L.spr.visible=true;
  const rate=(p.fert?FERT_BOOST:1)/GROW,left=(1-p.g)/rate,wl=p.w*WATER_LIFE;let t1,t2,t3,col;
  if(p.s==='ready'){t1='READY TO HARVEST';t2='PRESS [E]  \u00b7  '+YMIN+'-'+YMAX+' POTATOES';t3='';col='#7dff9a'}
  else if(p.w<=0){t1='NEEDS WATER';t2='TIME LEFT '+fmt(left)+' (WHEN WATERED)';t3='GROWTH '+Math.round(p.g*100)+'%';col='#ff5a4a'}
  else{t1='GROWING '+Math.round(p.g*100)+'%';t2='TIME LEFT '+fmt(left)+(p.fert?'  \u00b7  FERTILISED':'');t3='WATER '+fmt(wl)+(wl<left?'  \u00b7  REFILL SOON':'');col=wl<left?'#ffb347':'#5de6ff'}
  const key=t1+t2+t3;if(L.key===key)return;L.key=key;const x=L.x;x.clearRect(0,0,256,112);x.fillStyle='rgba(4,17,26,.82)';x.fillRect(0,0,256,112);x.strokeStyle=col;x.lineWidth=3;x.strokeRect(1.5,1.5,253,109);
  x.font='700 21px Consolas,monospace';x.fillStyle=col;x.textAlign='center';x.fillText(t1,128,28);x.font='600 15px Consolas,monospace';x.fillStyle='#e8f4f8';x.fillText(t2,128,54);if(t3)x.fillText(t3,128,76);
  x.fillStyle='rgba(255,255,255,.15)';x.fillRect(16,90,224,10);x.fillStyle=col;x.fillRect(16,90,224*clamp(p.g,0,1),10);L.tex.needsUpdate=true}
 row(p){return this.plots.filter(q=>q.x===p.x)}   // one ROW = the 3 beds down one side of the greenhouse
 /* inventory helpers (hotbar + backpack) */
 stacks(id){const S=this.s,o=[];for(const A of[S.inv,S.bag])for(const it of A)if(it&&it.id===id)o.push(it);return o}
 count(id){return this.stacks(id).reduce((a,it)=>a+(it.n||1),0)}
 take(id,n){const S=this.s;if(this.count(id)<n)return false;for(const A of[S.inv,S.bag])for(let i=0;i<A.length&&n>0;i++){const it=A[i];if(it&&it.id===id){const u=Math.min(n,it.n||1);it.n=(it.n||1)-u;n-=u;if(it.n<=0)A[i]=null}}S.tk.after();return true}
 bucket(){return this.stacks('bucket').find(it=>(it.w||0)>=1)||null}
 toast(t,c){this.s.tk.toast(t,c)}
 near(){const P=this.b.p,sp=this.sp;let best=null,bd=REACH;for(const p of this.plots){const wx=sp.dx*sp.s0+sp.nx*p.x+sp.dx*p.z,wz=sp.dz*sp.s0+sp.nz*p.x+sp.dz*p.z,d=Math.hypot(P.x-wx,P.z-wz);if(d<bd){bd=d;best=p}}return best}
 update(dt){const b=this.b;if(!this.ready){if(b.S&&b.S.rooms&&b.S.rooms.gre)this.build(b.S.rooms.gre);return}
  for(let i=this.fx.length-1;i>=0;i--){const f=this.fx[i];f.t+=dt;f.vy-=7*dt;f.m.position.x+=f.vx*dt;f.m.position.y+=f.vy*dt;f.m.position.z+=f.vz*dt;f.m.scale.multiplyScalar(f.t>.5?.9:1);if(f.t>.85){f.q.grp.remove(f.m);this.fx.splice(i,1)}}
  for(const p of this.plots){if(p.s!=='growing')continue;p.w=Math.max(0,p.w-dt/WATER_LIFE);
   if(p.w>0){p.g=Math.min(1,p.g+dt/GROW*(p.fert?FERT_BOOST:1));if(p.g>=1){p.s='ready';p.g=1;if(!p.said){p.said=true;if(p.z===ZS[0]){this.toast('POTATOES READY TO HARVEST  \u00b7  GREENHOUSE ROW','#7dff9a');b.mp.tone&&b.mp.tone(660,.25,.05)}}}}
   }
  const inGre=b.mode==='inside'&&b.zoneKey.replace('t','')==='gre';
  if(!inGre){this.vis=false;return}   /* PERF: nothing to draw/update while the greenhouse is not the room you are in */
  this.pt=(this.pt||0)-dt;if(!this.vis||this.pt<=0){this.vis=true;this.pt=.2;for(const q of this.plots)this.paint(q)}
  const pr=$('b-prompt'),p=this.near();if(!p||!pr)return;let h;const have=this.count('seeds')+this.count('potato');
  if(p.s==='empty')h='<b>E</b>PLANT ROW  \u00b7  '+ROW_SEEDS+' SEEDS / POTATOES'+(have<ROW_SEEDS?'  \u00b7  HAVE '+have:'');
  else if(p.s==='ready')h='<b>E</b>HARVEST ROW  \u00b7  '+YMIN+'-'+YMAX+' POTATOES';
  else h=(p.w<.6?'<b>E</b>WATER ROW':'SOIL MOIST')+'  \u00b7  GROWTH '+Math.round(p.g*100)+'%'+(p.w<=0?'  \u00b7  DRY':'');
  if(pr.innerHTML!==h)pr.innerHTML=h;pr.classList.add('on')}
 interact(){if(!this.ready||this.b.mode!=='inside'||this.b.zoneKey.replace('t','')!=='gre')return false;const p=this.near();if(!p)return false;const tk=this.s.tk,R=this.row(p),tone=(f,d,v)=>this.b.mp.tone&&this.b.mp.tone(f,d,v);
  if(p.s==='empty'){const sd=this.count('seeds'),have=sd+this.count('potato');
   if(have<ROW_SEEDS){this.toast('A ROW NEEDS '+ROW_SEEDS+' SEEDS OR POTATOES  \u00b7  YOU HAVE '+have,'#ff5a4a');return true}
   const fs=Math.min(ROW_SEEDS,sd);if(fs)this.take('seeds',fs);if(ROW_SEEDS-fs)this.take('potato',ROW_SEEDS-fs);
   const fert=this.take('nitrate',1);for(const q of R){q.fert=fert;q.s='growing';q.g=0;q.w=0;q.said=false;this.paint(q)}
   this.toast('ROW PLANTED  \u00b7  -'+ROW_SEEDS+'  \u00b7  '+(fert?'NITRATE FERTILISER APPLIED':'WATER IT TO START GROWTH'),'#7dff9a');tone(330,.15,.05);return true}
  if(p.s==='growing'){if(p.w>=.6){this.toast('SOIL ALREADY MOIST','#ffb347');return true}
   const bk=this.bucket();if(!bk){this.toast('NEED WATER IN THE BUCKET  \u00b7  MELT ICE OUTSIDE','#ff5a4a');return true}
   bk.w=Math.max(0,bk.w-1);for(const q of R){q.w=1;this.paint(q)}tk.after();this.toast('ROW WATERED  \u00b7  -1 L  \u00b7  BUCKET '+bk.w.toFixed(1)+' L','#5de6ff');tone(520,.12,.04);return true}
  if(p.s==='ready'){const n=YMIN+Math.floor(Math.random()*(YMAX-YMIN+1));if(!tk.give('potato',n)){this.toast('BACKPACK FULL','#ff5a4a');return true}
   for(const q of R){for(let i=0;i<6;i++){const m=new THREE.Mesh(this.tubGeo,q.tubM),a=i*1.05;m.position.set(Math.cos(a)*.15,.12,Math.sin(a)*.15);m.scale.set(1.3,.85,1);q.grp.add(m);this.fx.push({m,q,t:0,vx:Math.cos(a)*.7,vy:2.6+Math.random(),vz:Math.sin(a)*.7})}q.s='empty';q.g=0;q.w=0;q.fert=false;q.said=false;this.paint(q)}this.toast('+'+n+' POTATOES  \u00b7  PLANT THEM AGAIN OR CRAFT','#7dff9a');tone(660,.2,.05);return true}
  return true}
}
const _wet=new THREE.Color(0x3a2418);
