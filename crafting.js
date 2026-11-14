/* =====================================================================================================
   crafting.js  -  Mars Crafting Table, base blueprint hologram, NASA-style recipes, welding torch
   -----------------------------------------------------------------------------------------------------
   FLOW (plugged into the existing Salvage / Tasks state machine, no new game states):
     1. SALVAGE      [E] on the descent stage now also recovers a folded MARS CRAFTING TABLE and 30x SCRAP
                     ALLOY (backpack). Hotbar contents are unchanged.
     2. DEPLOY       [G] puts the table down in front of you (or picks it up again when you stand next to it).
     3. TABLE        [E] at the table opens the crafting UI. The first visit unlocks the BASE MAP / BLUEPRINT
                     for FREE and projects a glowing wireframe hologram of the modular base
                     (hab dome, airlock, corridor, greenhouse dome, solar field, ISRU O2 plant).
     4. CRAFT        Raw resources (regolith, water ice or bucket meltwater, broken stone/minerals, scrap alloy)
                     -> components (bricks, aerogel, solar cells, MOXIE unit) -> base kits.
     5. BUILD        Equip the WELDING TORCH, aim at a hologram module and HOLD LEFT-CLICK: sparks fly, the module
                     rises out of the ground and one matching kit is consumed. [N] shows / hides the hologram.
   Objectives (Task 3-5) continue the existing Task 1 (ice) and Task 2 (rocks) panel after Task 2 completes.
   Hooks used by mars.js / tasks.js (class Salvage):  cr.onWalkStart() / onSalvage() / interact() / update(dt,dead)
   / reset() / begin()   and   cr.sparks(x,y,z,n,[r,g,b],speed)   and   cr.open
   ===================================================================================================== */
import * as THREE from 'three';
import {makeFist,makeArm,stdMat,MAXW} from './tasks.js';
const V3=THREE.Vector3,MU=THREE.MathUtils,clamp=MU.clamp,rnd=(a,b)=>a+Math.random()*(b-a),$=id=>document.getElementById(id),TAU=Math.PI*2,PI=Math.PI;
const ease=t=>t*t*(3-2*t);
const G=3.71,REACH=11,TABLE_USE=3.4;

/* ---- tune first-person offsets here (camera space: +x right, +y up, -z forward) ---- */
export const HAND={root:{x:.30,y:-.30,z:-.72},item:{x:0,y:.08,z:-.03},torch:{x:.30,y:-.31,z:-.74,rx:.04,ry:.16}};

/* ---------------------------------------------- recipes ---------------------------------------------- */
export const RL={regolith:'MARTIAN REGOLITH',ice:'WATER ICE',mineral:'BROKEN STONE / MINERALS',scrap:'SCRAP ALLOY',brick:'SINTERED REGOLITH BRICK',nitrate:'NITRATE-RICH SOIL',rare:'RARE MINERALS',seeds:'POTATO SEEDS',aerogel:'SILICA AEROGEL PANEL',solar:'SOLAR CELL ARRAY',moxie:'MOXIE O\u2082 UNIT'};
export const RECIPES=[
 /* SURVIVAL: each one feeds one of the HUD bars (use with [Q]) */
 {id:'o2can',cat:0,n:1,req:{scrap:2,ice:2,mineral:1},info:'Oxygen canister \u00b7 meltwater split by electrolysis (MOXIE principle) and bottled for your suit \u00b7 +60% OXYGEN',note:'Equip it in the hotbar and press [Q] to refill your astronaut suit.'},
 {id:'ration',cat:0,n:1,req:{seeds:2,ice:1,nitrate:1},info:'Hydroponic potato ration \u00b7 nitrate-fertilised crop paste \u00b7 +45% FOOD',note:'Needs NITRATE-RICH SOIL from the boundary zone. Press [Q] to eat.'},
 {id:'medkit',cat:0,n:1,req:{scrap:1,mineral:2,ice:1},info:'Trauma kit \u00b7 sterile dressings, sealant gel and a coagulant \u00b7 +50% HEALTH',note:'Press [Q] to use.'},
 {id:'radpill',cat:0,n:2,req:{mineral:2,rare:1,ice:1},info:'Radioprotector tablets \u00b7 rare-earth chelators flush absorbed dose \u00b7 -45% RADIATION',note:'Press [Q] to take one.'},
 /* EQUIPMENT: processing gear */
 {id:'o2big',cat:1,n:1,req:{scrap:4,ice:3,rare:2},info:'Large oxygen cylinder \u00b7 tops up the whole suit \u00b7 +100% OXYGEN',note:'Press [Q] to use.'},
 {id:'crucible',cat:1,n:1,req:{scrap:3,regolith:6,mineral:2},info:'Thermal crucible \u00b7 solar-heated melter for water ice (equipment processing)',note:'Press [F] to deploy it. Ice melts into water over a progress bar, then pours into your bucket.'}];
const KITCOL={kit_dome:0xff7a1f,kit_green:0x3fae52,kit_corr:0x5de6ff,kit_air:0xffd23a,kit_solar:0x3a7bd5,kit_isru:0xe05a4a};
const TABS=['SURVIVAL','EQUIPMENT','BASE AREAS'];      /* no tools, no kits: base areas unlock by completing tasks */

/* ---------------------------------------------- textures + shared materials ---------------------------------------------- */
function ctex(w,h,fn,rep){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');fn(x,w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1])}t.userData2={c,x};return t}
let _M=null;
function mats(){if(_M)return _M;
 const brickT=ctex(256,256,(x,w,h)=>{x.fillStyle='#4a2a1c';x.fillRect(0,0,w,h);for(let r=0;r<16;r++)for(let c=-1;c<8;c++){x.fillStyle=`hsl(${12+rnd(-3,5)},${45+rnd(-8,8)}%,${27+rnd(-5,7)}%)`;x.fillRect(c*32+(r%2?16:0)+1,r*16+1,30,14)}},[5,2.5]),
  hazT=ctex(128,32,(x,w,h)=>{x.fillStyle='#f2c200';x.fillRect(0,0,w,h);x.fillStyle='#16181a';for(let i=-2;i<10;i++){x.beginPath();x.moveTo(i*16,h);x.lineTo(i*16+10,h);x.lineTo(i*16+26,0);x.lineTo(i*16+16,0);x.fill()}},[4,1]),
  solT=ctex(128,64,(x,w,h)=>{x.fillStyle='#0d2350';x.fillRect(0,0,w,h);x.strokeStyle='#8fb4e8';x.lineWidth=1;for(let i=0;i<=8;i++){x.beginPath();x.moveTo(i*16,0);x.lineTo(i*16,h);x.stroke()}for(let j=0;j<=4;j++){x.beginPath();x.moveTo(0,j*16);x.lineTo(w,j*16);x.stroke()}x.strokeStyle='#d8d8d8';x.lineWidth=2;x.strokeRect(1,1,w-2,h-2)}),
  tileT=ctex(128,128,(x,w,h)=>{for(let j=0;j<4;j++)for(let i=0;i<4;i++){x.fillStyle=(i+j)%2?'#d9d9d4':'#25262a';x.fillRect(i*32,j*32,31,31)}x.fillStyle='rgba(20,10,5,.45)';for(let k=0;k<30;k++)x.fillRect(rnd(0,w),rnd(0,h),rnd(4,20),rnd(2,8))});
 return _M={brick:stdMat(0xffffff,{map:brickT,roughness:.95,metalness:0}),steel:stdMat(0xaab3bc,{metalness:.8,roughness:.4}),dark:stdMat(0x2c3138,{metalness:.7,roughness:.5}),black:stdMat(0x141517,{roughness:.9,metalness:0}),
  white:stdMat(0xe9edf0,{roughness:.55,metalness:.2}),orange:stdMat(0xff7a1f,{roughness:.55,metalness:.1}),haz:stdMat(0xffffff,{map:hazT,roughness:.6,metalness:0}),conc:stdMat(0x8d6a55,{roughness:1,metalness:0}),
  foil:stdMat(0xd9a521,{metalness:.9,roughness:.3}),solar:stdMat(0xffffff,{map:solT,metalness:.5,roughness:.25}),tile:stdMat(0xffffff,{map:tileT,roughness:.8,metalness:0}),plant:stdMat(0x3fae52,{roughness:.8,metalness:0}),
  glass:stdMat(0x9fe8ff,{transparent:true,opacity:.34,roughness:.05,metalness:.1,emissive:0x1a5a70,emissiveIntensity:.4,side:THREE.DoubleSide,depthWrite:false}),
  aero:stdMat(0xbcd9ff,{transparent:true,opacity:.78,roughness:.2,metalness:0,emissive:0x2a4a88,emissiveIntensity:.5}),
  glowC:new THREE.MeshBasicMaterial({color:0x7defff}),glowG:new THREE.MeshBasicMaterial({color:0x7dff9a}),glowA:new THREE.MeshBasicMaterial({color:0xffb347})}}
const box=(w,h,d,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);return o};
const cyl=(r0,r1,h,m,x=0,y=0,z=0,seg=24)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r0,r1,h,seg),m);o.position.set(x,y,z);return o};
const tor=(r,t,m,y=0,rx=PI/2,arc=TAU,seg=36)=>{const o=new THREE.Mesh(new THREE.TorusGeometry(r,t,8,seg,arc),m);o.rotation.x=rx;o.position.y=y;return o};

/* ---------------------------------------------- base modules (local frame: +y up, ground at y=0) ---------------------------------------------- */
function mDome(R,glassy){const q=mats(),g=new THREE.Group();
 const sh=new THREE.Mesh(new THREE.SphereGeometry(R,28,14,0,TAU,0,PI/2),glassy?q.glass:q.brick);sh.userData.wire=true;g.add(sh);
 for(let i=0;i<6;i++){const rb=new THREE.Mesh(new THREE.TorusGeometry(R+.04,.07,6,36,PI),q.steel);rb.rotation.y=i*PI/6;g.add(rb)}
 g.add(cyl(R+.7,R+.9,1.8,q.conc,0,-.65,0,40));g.add(tor(R+.05,.16,q.steel,.15));
 if(!glassy)for(let i=0;i<7;i++){const a=i/7*TAU+.3,el=.5,p=new V3(Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el)),w=new THREE.Mesh(new THREE.CircleGeometry(.5,14),q.glowC);w.position.copy(p).multiplyScalar(R*.992);w.lookAt(p.clone().multiplyScalar(R*2));g.add(w)}
 else for(let r=0;r<3;r++)for(let i=0;i<5;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),q.plant);s.position.set(-R*.45+i*R*.22,.28,-1.8+r*1.8);g.add(s)}
 g.add(cyl(.9,1,.5,q.steel,0,R+.05,0));
 g.beacon=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshBasicMaterial({color:0xff4030}));g.beacon.position.y=R+.45;g.add(g.beacon);return g}
function mAir(){const q=mats(),g=new THREE.Group();
 g.add(box(3.6,2.9,3.4,q.white,0,1.45,0),box(3.7,.12,3.5,q.steel,0,2.95,0),box(3.65,.28,3.45,q.haz,0,.45,0),box(4.6,1.6,4.4,q.conc,0,-.7,0));
 for(const sx of[-1,1]){const d=cyl(.95,.95,.25,q.dark,sx*1.85,1.45,0,24);d.rotation.z=PI/2;g.add(d);const w=cyl(.4,.4,.28,q.glowC,sx*1.85,1.8,0,16);w.rotation.z=PI/2;g.add(w);const rg=tor(.95,.05,q.steel,1.45,0);rg.rotation.set(0,PI/2,0);rg.position.x=sx*1.85;g.add(rg)}
 g.beacon=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),new THREE.MeshBasicMaterial({color:0xffb347}));g.beacon.position.set(0,3.2,0);g.add(g.beacon);return g}
function mCorr(){const q=mats(),g=new THREE.Group(),t=cyl(1.45,1.45,7.6,q.white,0,1.1,0,28);t.rotation.z=PI/2;g.add(t);
 for(let i=0;i<7;i++){const r=tor(1.47,.07,q.steel,1.1,0);r.rotation.set(0,PI/2,0);r.position.x=-3.3+i*1.1;g.add(r)}
 g.add(box(7.6,.9,2.9,q.conc,0,-.35,0),box(7,.06,.5,q.steel,0,2.56,0));
 for(let i=0;i<3;i++)g.add(box(.5,.3,.05,q.glowC,-2.2+i*2.2,1.7,1.45));return g}
function mSolar(){const q=mats(),g=new THREE.Group();g.add(box(11.5,.4,7.2,q.conc,0,-.15,0));
 for(const rz of[-1.9,1.9])for(let i=0;i<4;i++){const x=-4.5+i*3,pn=new THREE.Group();pn.add(box(2.7,.07,1.9,q.solar),box(2.8,.05,2,q.steel,0,-.05,0));pn.rotation.x=-.55;pn.position.set(x,1.4,rz);g.add(pn,cyl(.06,.06,1.4,q.steel,x,.7,rz,8))}
 g.add(box(.8,.7,.5,q.dark,5.2,.55,0));return g}
function mIsru(){const q=mats(),g=new THREE.Group();g.add(box(9.4,.35,7.2,q.conc,0,-.1,0));
 for(const z of[-1.9,1.9]){const t=cyl(1,1,3.6,q.white,-1.8,1.4,z,24);t.rotation.z=PI/2;g.add(t);for(const s of[-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),q.white);e.position.set(-1.8+s*1.8,1.4,z);e.scale.x=.4;g.add(e)}
  const b=tor(1.02,.07,q.orange,1.4,0);b.rotation.set(0,PI/2,0);b.position.set(-1.8,1.4,z);g.add(b)}
 g.add(box(2.6,2.2,2.4,q.dark,2.6,1.3,0),box(2,.12,.05,q.glowG,2.6,1.95,1.22));for(let i=0;i<4;i++)g.add(box(1.8,.06,.05,q.steel,2.6,.7+i*.18,1.22));
 g.add(cyl(.28,.34,3.6,q.steel,3.7,3.2,-2.4,14),cyl(.36,.36,.2,q.orange,3.7,4.5,-2.4,14));g.vent=new V3(3.7,5.1,-2.4);
 const p=cyl(.1,.1,3,q.steel,.6,1.2,0,8);p.rotation.z=PI/2;g.add(p);return g}
const MODS=[
 {k:'dome',name:'HAB DOME',kit:'kit_dome',x:0,z:0,r:6.8,time:4.2,build:()=>mDome(6,false),col:[{x:0,z:0,r:5.7,h:3.2}]},
 {k:'air',name:'AIRLOCK',kit:'kit_air',x:-8.2,z:0,r:3,time:2.6,build:mAir,col:[{x:0,z:0,r:2,h:2.8}]},
 {k:'corr',name:'CORRIDOR',kit:'kit_corr',x:9.7,z:0,r:4.2,time:3,build:mCorr,col:[{x:-2.6,z:0,r:1.5,h:2.5},{x:0,z:0,r:1.5,h:2.5},{x:2.6,z:0,r:1.5,h:2.5}]},
 {k:'green',name:'GREENHOUSE DOME',kit:'kit_green',x:17.7,z:0,r:5.4,time:3.6,build:()=>mDome(4.4,true),col:[{x:0,z:0,r:4.1,h:3}]},
 {k:'solar',name:'SOLAR FIELD',kit:'kit_solar',x:0,z:16.5,r:6.6,time:3.2,build:mSolar,col:[]},
 {k:'isru',name:'ISRU O\u2082 PLANT',kit:'kit_isru',x:15,z:-11,r:5.2,time:3.4,build:mIsru,col:[{x:-1.8,z:-1.9,r:1.5,h:2.5},{x:-1.8,z:1.9,r:1.5,h:2.5},{x:2.6,z:0,r:1.7,h:2.5}]}];

/* ---------------------------------------------- hologram ---------------------------------------------- */
const HOLO={fill:new THREE.MeshBasicMaterial({color:0x2fd8ff,transparent:true,opacity:.07,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}),
 line:new THREE.LineBasicMaterial({color:0x5de6ff,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}),
 hi:new THREE.LineBasicMaterial({color:0xffb347,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false})};
function holoFrom(solid){const h=solid.clone(true),ms=[];h.traverse(o=>{if(o.isMesh)ms.push(o)});h.lines=[];
 for(const o of ms){if(o.material.isMeshBasicMaterial){o.visible=false;continue}
  const geo=o.userData.wire?new THREE.WireframeGeometry(o.geometry):new THREE.EdgesGeometry(o.geometry,25),l=new THREE.LineSegments(geo,HOLO.line);o.add(l);h.lines.push(l);o.material=HOLO.fill;o.castShadow=o.receiveShadow=false}
 return h}

/* ---------------------------------------------- the Mars Crafting Table (placed model) ---------------------------------------------- */
function mTable(){const q=mats(),g=new THREE.Group();
 for(const[sx,sz]of[[-1,-.4],[1,-.4],[-1,.4],[1,.4]])g.add(cyl(.055,.07,.9,q.steel,sx*1.1,.45,sz,12));
 g.add(box(2.2,.06,.06,q.dark,0,.25,.4),box(2.2,.06,.06,q.dark,0,.25,-.4),box(.06,.06,.8,q.dark,-1.1,.25,0),box(.06,.06,.8,q.dark,1.1,.25,0),box(2.1,.05,.85,q.steel,0,.3,0));
 g.add(box(2.4,.09,1,q.steel,0,.95,0),box(2.42,.03,1.02,q.orange,0,.915,0),box(2.4,.05,.05,q.haz,0,.99,.48),box(.05,.56,.92,q.tile,1.22,.62,0));
 const rv=new THREE.InstancedMesh(new THREE.CylinderGeometry(.014,.014,.012,6),q.dark,28),M=new THREE.Matrix4();for(let i=0;i<28;i++){M.makeTranslation(-1.1+(i%14)*.17,1.005,i<14?.44:-.44);rv.setMatrixAt(i,M)}g.add(rv);
 const tank=new THREE.Mesh(new THREE.SphereGeometry(.28,16,10),q.white);tank.position.set(-.6,.58,0);tank.scale.y=.8;g.add(tank,tor(.285,.02,q.orange,.58),box(.5,.3,.5,q.orange,.6,.47,0),box(.52,.04,.52,q.dark,.6,.64,0));
 const tex=ctex(256,160,()=>{});const scr=new THREE.Mesh(new THREE.PlaneGeometry(.64,.4),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));
 const mon=new THREE.Group();mon.add(box(.72,.48,.06,q.dark),scr);scr.position.z=.034;mon.position.set(0,1.34,-.3);mon.rotation.x=-.12;g.add(mon,cyl(.03,.03,.3,q.dark,0,1.15,-.31,8),box(.5,.025,.18,q.dark,0,1.0,.05));
 g.add(box(2.2,.7,.04,q.dark,0,1.55,-.48));for(let i=0;i<5;i++){g.add(box(.05,.3,.04,q.steel,-.9+i*.45,1.55,-.45),box(.14,.06,.04,q.orange,-.9+i*.45,1.72,-.45))}
 g.add(box(.22,.14,.2,q.dark,.85,1.05,.1),box(.05,.1,.2,q.steel,.97,1.07,.1));
 for(const z of[-.3,-.05]){g.add(cyl(.1,.1,.7,q.white,1.55,.35,z,14),cyl(.04,.04,.1,q.orange,1.55,.75,z,8))}
 g.add(cyl(.17,.2,.04,q.dark,-.85,1.0,.12,20));const ring=tor(.15,.012,q.glowC,1.06,PI/2);ring.position.x=-.85;ring.position.z=.12;g.add(ring);g.ring=ring;
 g.sx=tex.userData2.x;g.tex=tex;g.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true});return g}
function drawScreen(x,w,h,T,info){x.fillStyle='#04111a';x.fillRect(0,0,w,h);x.fillStyle='rgba(93,230,255,.16)';x.fillRect(0,0,w,20);x.font='700 12px Consolas,monospace';x.textBaseline='middle';x.fillStyle='#5de6ff';x.textAlign='left';x.fillText('MARS FAB-1  \u00b7  STAGE SALVAGE',8,10);
 info.forEach((s,i)=>{x.fillStyle=i===0?'#ffb347':'#9fe9ff';x.font='600 13px Consolas,monospace';x.fillText(s,10,38+i*19)});
 x.fillStyle='rgba(125,255,154,.9)';x.fillRect(10,h-26,(w-20)*(.5+.5*Math.sin(T*1.7)),6);x.strokeStyle='rgba(93,230,255,.6)';x.strokeRect(1,1,w-2,h-2);
 const y=(T*60)%h;x.fillStyle='rgba(93,230,255,.12)';x.fillRect(0,y,w,3)}

/* ---------------------------------------------- spark particles (additive points) ---------------------------------------------- */
class Sparks{constructor(parent,N=420){this.N=N;this.i=0;this.P=new Float32Array(N*3).fill(-9999);this.C=new Float32Array(N*3);this.V=new Float32Array(N*3);this.L=new Float32Array(N);this.M=new Float32Array(N).fill(1);this.K=new Float32Array(N*3);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.P,3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('color',new THREE.BufferAttribute(this.C,3).setUsage(THREE.DynamicDrawUsage));this.geo=geo;
  const tex=ctex(32,32,(x,w,h)=>{const g=x.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'#fff');g.addColorStop(.4,'rgba(255,255,255,.7)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h)});
  this.pts=new THREE.Points(geo,new THREE.PointsMaterial({size:.13,map:tex,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));this.pts.frustumCulled=false;parent.add(this.pts)}
 emit(x,y,z,n,col,sp){for(let k=0;k<n;k++){const i=this.i;this.i=(i+1)%this.N;const j=i*3,a=rnd(0,TAU),u=rnd(.15,1);
   this.P[j]=x;this.P[j+1]=y;this.P[j+2]=z;this.V[j]=Math.cos(a)*sp*u;this.V[j+1]=rnd(.25,1)*sp;this.V[j+2]=Math.sin(a)*sp*u;this.L[i]=this.M[i]=rnd(.35,.95);this.K[j]=col[0];this.K[j+1]=col[1];this.K[j+2]=col[2]}}
 update(dt,H){for(let i=0;i<this.N;i++){if(this.L[i]<=0)continue;const j=i*3;this.L[i]-=dt;
   if(this.L[i]<=0){this.P[j+1]=-9999;this.C[j]=this.C[j+1]=this.C[j+2]=0;continue}
   this.V[j+1]-=G*dt;this.P[j]+=this.V[j]*dt;this.P[j+1]+=this.V[j+1]*dt;this.P[j+2]+=this.V[j+2]*dt;
   const gh=H(this.P[j],this.P[j+2])+.02;if(this.P[j+1]<gh){this.P[j+1]=gh;this.V[j+1]*=-.3;this.V[j]*=.6;this.V[j+2]*=.6}
   const f=this.L[i]/this.M[i];this.C[j]=this.K[j]*f;this.C[j+1]=this.K[j+1]*f;this.C[j+2]=this.K[j+2]*f}
  this.geo.attributes.position.needsUpdate=true;this.geo.attributes.color.needsUpdate=true}}

/* ---------------------------------------------- item models + first-person rigs ---------------------------------------------- */
function modelScrap(){const q=mats(),g=new THREE.Group();
 [[0,.03,0,.34,.02,.24,.2,.5,.1],[.05,.07,-.03,.28,.02,.2,-.3,.9,.2],[-.06,.1,.05,.22,.018,.3,.5,-.4,.35],[.1,.04,.1,.2,.02,.16,-.8,.3,-.5]].forEach(([x,y,z,w,h,d,rx,ry,rz])=>{const p=box(w,h,d,q.steel,x,y,z);p.rotation.set(rx*.5,ry,rz*.4);g.add(p)});
 const t=cyl(.025,.025,.3,q.dark,-.08,.05,-.08,10);t.rotation.z=1.2;g.add(t);const f=box(.2,.01,.16,q.foil,.02,.14,0);f.rotation.set(.3,.4,.2);g.add(f);return g}
function modelBrick(){const q=mats(),g=new THREE.Group();[[0,.05,0,0],[.02,.15,.01,.15],[-.03,.25,0,-.1]].forEach(([x,y,z,r])=>{const b=box(.3,.09,.14,q.brick,x,y,z);b.rotation.y=r;g.add(b)});return g}
function modelAerogel(){const q=mats(),g=new THREE.Group();g.add(box(.3,.04,.22,q.aero,0,.03,0));const b=box(.3,.04,.22,q.aero,.02,.09,.01);b.rotation.y=.3;g.add(b,box(.26,.05,.18,q.aero,-.02,.15,0));return g}
function modelSolar(){const q=mats(),g=new THREE.Group(),p=new THREE.Group();p.add(box(.36,.02,.24,q.solar),box(.38,.015,.26,q.steel,0,-.012,0));p.rotation.set(-.5,.4,0);p.position.y=.14;g.add(p,box(.04,.12,.04,q.steel,0,.06,-.02));return g}
function modelMoxie(){const q=mats(),g=new THREE.Group();g.add(box(.3,.22,.26,q.dark,0,.12,0),box(.22,.02,.01,q.glowG,0,.2,.132));for(let i=0;i<4;i++)g.add(box(.2,.012,.01,q.steel,0,.05+i*.025,.132));for(const x of[-.09,.09]){const c=cyl(.03,.03,.14,q.steel,x,.3,0,10);g.add(c)}return g}
function modelCase(){const q=mats(),g=new THREE.Group();g.add(box(.46,.26,.32,q.dark,0,.13,0),box(.47,.05,.33,q.orange,0,.13,0),box(.2,.025,.02,q.haz,0,.2,.165));
 g.add(box(.05,.05,.04,q.steel,-.15,.13,.17),box(.05,.05,.04,q.steel,.15,.13,.17));const h=tor(.08,.01,q.steel,.26,0,PI,16);h.rotation.set(0,0,0);g.add(h);return g}
function modelKit(id){const q=mats(),g=new THREE.Group(),col=new THREE.MeshStandardMaterial({color:KITCOL[id],roughness:.5,metalness:.1,emissive:KITCOL[id],emissiveIntensity:.25});
 g.add(box(.4,.22,.3,q.steel,0,.11,0),box(.41,.05,.31,col,0,.11,0),box(.42,.03,.02,q.dark,0,.23,.14),box(.42,.03,.02,q.dark,0,.23,-.14));
 if(id==='kit_dome'||id==='kit_green'){const s=new THREE.Mesh(new THREE.SphereGeometry(.1,14,8,0,TAU,0,PI/2),id==='kit_dome'?q.brick:q.glass);s.position.y=.24;g.add(s)}
 else if(id==='kit_air'){g.add(box(.15,.1,.15,q.white,0,.28,0),cyl(.04,.04,.16,q.dark,0,.28,0,12))}
 else if(id==='kit_corr'){const t=cyl(.06,.06,.28,q.white,0,.3,0,14);t.rotation.z=PI/2;g.add(t)}
 else if(id==='kit_solar'){const p=box(.24,.012,.16,q.solar,0,.3,0);p.rotation.x=-.4;g.add(p)}
 else{const t=cyl(.05,.05,.22,q.white,-.04,.31,0,12);t.rotation.z=PI/2;g.add(t,cyl(.02,.025,.14,q.steel,.1,.31,0,8))}return g}
function modelTorch(){const q=mats(),g=new THREE.Group(),hx=-.01,hz=-.036;
 g.add(cyl(.022,.025,.15,q.black,hx,0,hz,14),box(.05,.05,.08,q.dark,hx,.095,hz-.01),cyl(.012,.012,.03,q.orange,hx+.035,.12,hz,8));
 const bar=cyl(.011,.011,.36,q.steel,hx,.1,hz-.2,12);bar.rotation.x=PI/2;g.add(bar);
 const nz=cyl(.009,.017,.05,q.steel,hx,.1,hz-.405,12);nz.rotation.x=-PI/2;g.add(nz);
 for(const[o,m]of[[0,q.black],[.02,q.orange]]){const c=new THREE.CatmullRomCurve3([new V3(hx+o,.07,hz+.03),new V3(hx+o+.02,0,hz+.2),new V3(.08+o,-.15,.35),new V3(.2+o,-.38,.5)]);g.add(new THREE.Mesh(new THREE.TubeGeometry(c,24,.008,6,false),m))}
 const fl=new THREE.Group(),fm=c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
 const o1=new THREE.Mesh(new THREE.ConeGeometry(.013,.15,10),fm(0x6fc8ff)),o2=new THREE.Mesh(new THREE.ConeGeometry(.006,.08,8),fm(0xffffff));o1.rotation.x=o2.rotation.x=-PI/2;o1.position.z=-.075;o2.position.z=-.04;fl.add(o1,o2);fl.position.set(hx,.1,hz-.43);g.add(fl);
 g.fl=fl;g.tip=new THREE.Object3D();g.tip.position.copy(fl.position);g.add(g.tip);return g}
function rigTorch(){const root=new THREE.Group(),piv=new THREE.Group(),t=modelTorch(),H=HAND.torch;piv.add(t,makeFist(),makeArm());piv.rotation.set(H.rx,H.ry,0);root.add(piv);root.position.set(H.x,H.y,H.z);root.tip=t.tip;
 root.userData.pose=P=>{const w=P.wd||0,T=performance.now()/1000;t.fl.scale.set(1+.15*Math.sin(T*55),1+.15*Math.sin(T*47+1),(.3+.9*w)*(1+.25*Math.sin(T*63)));
  piv.position.set(Math.sin(T*43)*.002*w,Math.sin(T*37)*.002*w,.03*w);piv.rotation.set(H.rx+.05*w,H.ry-.08*w,0)};return root}
function handRig(d,fit){const root=new THREE.Group(),piv=new THREE.Group(),h=d.hold||{},m=fit(d.build(),d.size,d.ref,d.cy);
 m.position.set(HAND.item.x,HAND.item.y,HAND.item.z);m.rotation.set((h.rx||0)*.6,h.ry||0,h.rz||0);piv.add(m,makeFist(),makeArm());root.add(piv);root.position.set(HAND.root.x,HAND.root.y,HAND.root.z);return root}

/* register the new items in mars.js ITEMS and give EVERY held item a glove + sleeve rig (hand fix for hotbar 1-4 / wheel) */
export function patchCraftItems(I,{fit}){const hold={x:.28,y:-.26,z:-.68,rx:.3};
 const add=(id,name,unit,info,build,size,ref,cy,icon,x)=>{I[id]=Object.assign({name,unit,info,build,size,ref,cy,icon,hold},x)};
 add('scrap','SCRAP ALLOY','','Al-Li alloy plate & foil cut from the descent stage \u00b7 fabrication feedstock',modelScrap,.34,.5,.1,{rx:.5,ry:.6});
 add('brick','SINTERED BRICK','','Regolith brick \u00b7 foundation & shell material',modelBrick,.3,.4,.14,{rx:.5,ry:.6});
 add('aerogel','AEROGEL PANEL','','Silica aerogel \u00b7 thermal insulation',modelAerogel,.3,.34,.1,{rx:.5,ry:.6});
 add('solar','SOLAR CELL ARRAY','','Photovoltaic panel part',modelSolar,.3,.4,.12,{rx:.4,ry:.5});
 add('moxie','MOXIE O\u2082 UNIT','','Solid-oxide electrolysis cell stack \u00b7 CO\u2082 \u2192 O\u2082',modelMoxie,.3,.4,.15,{rx:.4,ry:.5});
 add('crafting_table','MARS CRAFTING TABLE','','Folded fabrication bench from descent-stage struts \u00b7 press [G] to deploy',modelCase,.38,.5,.13,{rx:.4,ry:.5});
 add('torch','WELDING TORCH','','Oxy-hydrogen builder tool \u00b7 aim at a blueprint module and HOLD LEFT-CLICK',()=>{const t=modelTorch();t.fl.visible=false;return t},.55,.6,.05,{rx:.25,ry:-.7},{rig:()=>rigTorch()});
  for(const id in I)if(!I[id].rig){const d=I[id];d.rig=dd=>handRig(dd,fit)}}

/* ---------------------------------------------- DOM / CSS ---------------------------------------------- */
const CSS=`
#cf-pr{position:fixed;left:50%;bottom:34%;transform:translateX(-50%) translateY(10px);z-index:25;padding:11px 26px;font:700 19px "Segoe UI",Arial,sans-serif;letter-spacing:2.5px;color:#fff;background:rgba(6,10,18,.78);border:1px solid rgba(255,179,71,.75);border-radius:6px;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;text-shadow:0 0 10px #000;text-align:center;white-space:nowrap}
#cf-pr.on{opacity:1;transform:translateX(-50%)}#cf-pr .kb{color:#ffb347;border:2px solid #ffb347;border-radius:4px;padding:0 9px;margin:0 4px}#cf-pr b{color:#ffb347}#cf-pr small{display:block;font:600 12px Consolas,monospace;letter-spacing:2px;opacity:.7;margin-top:3px}
#cf{position:fixed;inset:0;z-index:41;display:flex;align-items:center;justify-content:center;background:rgba(2,6,12,.6);opacity:0;pointer-events:none;transition:opacity .2s;font-family:Consolas,monospace;color:#e8f4f8;user-select:none}
#cf.on{opacity:1;pointer-events:auto}
#cf .cfw{width:min(1020px,96vw);max-height:92vh;display:flex;flex-direction:column;padding:18px 24px 14px;background:linear-gradient(160deg,rgba(14,28,40,.97),rgba(5,9,16,.97));border:1px solid rgba(93,230,255,.5);border-radius:6px;box-shadow:0 10px 50px rgba(0,0,0,.75)}
#cf .cfh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;font-size:18px;letter-spacing:5px;color:#5de6ff}#cf .cfh span{font-size:12px;letter-spacing:2px;color:#ffb347}
#cf-tabs{display:flex;gap:6px;margin-bottom:10px}#cf-tabs div{padding:7px 14px;font-size:12px;letter-spacing:3px;border:1px solid rgba(93,230,255,.3);border-radius:3px;cursor:pointer;color:#8fd9ee}
#cf-tabs div:hover{border-color:#fff}#cf-tabs div.on{background:rgba(93,230,255,.16);border-color:#5de6ff;color:#fff}
#cf .cfb{display:flex;gap:16px;min-height:0;flex:1}#cf-list{width:330px;overflow:auto;display:flex;flex-direction:column;gap:6px;padding-right:4px}
.cf-r{display:flex;align-items:center;gap:10px;padding:6px 10px;border:1px solid rgba(93,230,255,.28);border-radius:3px;cursor:pointer;background:rgba(10,20,30,.7)}
.cf-r:hover{border-color:#fff}.cf-r.sel{border-color:#ffb347;background:rgba(60,38,10,.6)}.cf-r img{width:42px;height:42px;object-fit:contain}.cf-r .nm{flex:1;font-size:12px;letter-spacing:1.5px}
.cf-r .st{font-size:10px;letter-spacing:2px;color:#ff8a7a}.cf-r.can .st{color:#7dff9a}.cf-r .st.bt{color:#7dff9a}.cf-r .st.wp{color:#ffb347}
#cf-det{flex:1;min-width:0;padding:4px 6px;overflow:auto}
#cf-det .hd{display:flex;align-items:center;gap:16px;margin-bottom:8px}#cf-det .hd img{width:96px;height:96px;object-fit:contain;filter:drop-shadow(0 4px 8px #000)}
#cf-det h3{margin:0 0 4px;font-size:18px;letter-spacing:4px;color:#ffb347}#cf-det p{margin:0;font:12px "Segoe UI",Arial,sans-serif;letter-spacing:.8px;line-height:1.5;opacity:.88}
.cf-q{position:relative;display:flex;justify-content:space-between;margin:5px 0;padding:6px 10px;font-size:12px;letter-spacing:1.5px;border:1px solid rgba(255,255,255,.14);border-radius:3px;overflow:hidden}
.cf-q i{position:absolute;left:0;top:0;bottom:0;background:rgba(255,90,74,.22);z-index:0}.cf-q.ok i{background:rgba(125,255,154,.2)}.cf-q span{position:relative;z-index:1}.cf-q.ok span:last-child{color:#7dff9a}.cf-q.no span:last-child{color:#ff8a7a}
.cf-b{margin-top:10px;padding:10px 30px;font:700 15px Consolas,monospace;letter-spacing:4px;color:#031;background:#7dff9a;border:0;border-radius:3px;cursor:pointer}.cf-b:disabled{background:#2b3a44;color:#6d8594;cursor:not-allowed}.cf-b.alt{background:#5de6ff;margin-right:8px}
.cf-pg{position:relative;margin-top:10px;height:38px;border:1px solid #5de6ff;border-radius:3px;background:rgba(10,30,44,.8);overflow:hidden}.cf-pg i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#1a8fb0,#5de6ff);box-shadow:0 0 14px #5de6ff}.cf-pg span{position:relative;z-index:1;display:block;text-align:center;line-height:38px;font:700 13px Consolas,monospace;letter-spacing:4px;color:#fff;text-shadow:0 1px 3px #000}
#cf-map{display:block;margin:6px 0;border:1px solid rgba(93,230,255,.4);background:#04111a}
#cf .cff{margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.14);font:11px "Segoe UI",Arial,sans-serif;letter-spacing:1px;color:#9fb6c2;text-align:center}#cf kbd{font:700 11px Consolas,monospace;border:1px solid #ffb347;color:#ffb347;border-radius:3px;padding:1px 5px;margin:0 2px}`;

/* ---------------------------------------------- Crafting controller ---------------------------------------------- */
export class Crafting{
 constructor(mp,salv,H){this.mp=mp;this.s=salv;this.tk=salv.tk;this.H=H;this.open=false;this.root=null;this.table=null;this.job=null;this.pg=null;this.bp=false;this.vis=true;this.mods=[];this.made={};this.cols=[];this.tab=0;this.sel='o2can';
  this.on=false;this.t=0;this.wdOn=false;this.wdI=0;this.aimed=null;this.stage='';this.pr='';this.anchor=null;this.ang=0;this.tdir=new V3(1,0,0);this.scT=0;this.ventT=0;this.blink=0;this.doneT=0;this.sp=null;this.light=null;this.deco=null;this.dir=new V3();this.tmp=new V3();this.t2=new V3();this.hr=null;this.flags={};
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend',`<div id="cf-pr"></div><div id="cf"><div class="cfw"><div class="cfh"><b>MARS CRAFTING TABLE</b><span id="cf-res"></span></div><div id="cf-tabs"></div><div class="cfb"><div id="cf-list"></div><div id="cf-det"></div></div><div class="cff"><kbd>E</kbd> / <kbd>ESC</kbd> close &middot; craft survival items &middot; use them with <kbd>Q</kbd> &middot; <kbd>N</kbd> toggles the hologram &middot; <kbd>G</kbd> deploy / pick up table</div></div></div>`);
  this.el=$('cf');this.el.addEventListener('click',e=>{const t=e.target.closest('[data-a]');if(t)this.act(t.dataset.a,t.dataset.id)});
  addEventListener('keydown',e=>{if(e.repeat||!this.mp.walk||!this.root)return;if(e.code==='Escape'&&this.open)this.close();else if(e.code==='KeyG'&&!this.open)this.deploy();else if(e.code==='KeyN'&&!this.open)this.toggleHolo()});
  addEventListener('mousedown',e=>this.onDown(e));addEventListener('mouseup',e=>{if(e.button===0)this.wdOn=false});addEventListener('blur',()=>{this.wdOn=false});
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement&&this.open)this.close()})}

 /* ---------- inventory helpers (backpack 10 stacks + 4 hotbar slots) ---------- */
 count(k){const A=[...this.s.inv,...this.s.bag];
  if(k==='mineral')return A.reduce((a,it)=>a+(it&&it.id.startsWith('rk_')?(it.n||1):0),0);
  if(k==='ice')return A.reduce((a,it)=>a+(it?(it.id==='ice'?(it.n||1):it.id==='bucket'?Math.floor((it.w||0)/2):0):0),0);   // 2 L of meltwater = 1 unit
  return A.reduce((a,it)=>a+(it&&it.id===k?(it.n||1):0),0)}
 drain(pred,n){for(const A of[this.s.bag,this.s.inv])for(let i=0;i<A.length&&n>0;i++){const it=A[i];if(it&&pred(it)){const u=Math.min(n,it.n||1);it.n=(it.n||1)-u;n-=u;if(it.n<=0)A[i]=null}}return n}
 take(k,n){if(k==='ice'){n=this.drain(it=>it.id==='ice',n);for(const A of[this.s.bag,this.s.inv])for(const it of A)if(n>0&&it&&it.id==='bucket'&&(it.w||0)>=2){const u=Math.min(n,Math.floor(it.w/2));it.w-=u*2;n-=u}return n<=0}
  return this.drain(k==='mineral'?(it=>it.id.startsWith('rk_')):(it=>it.id===k),n)<=0}
 has(id){return this.count(id)>0}
 can(r){return Object.keys(r.req).every(k=>this.count(k)>=r.req[k])}
 name(id){return this.s.ITEMS_()[id].name}
 hasKit(m){return this.count(m.d.kit)>0}
 built(){return this.mods.filter(m=>m.state==='built').length}
 toHotbar(id){const s=this.s,from=s.bag.findIndex(x=>x&&x.id===id);if(from<0)return;let j=s.inv.findIndex(x=>!x);
  if(j<0){j=s.inv.findIndex(x=>x&&x.id==='seeds');if(j<0)j=s.inv.findIndex(x=>x&&x.id==='regolith');if(j<0)return;const k=s.bag.findIndex(x=>!x);if(k>=0){s.bag[k]=s.inv[j];s.inv[j]=null}else return}
  s.inv[j]=s.bag[from];s.bag[from]=null;s.sel=j;s.syncSel();this.tk.after();s.showName();this.tk.toast(this.name(id)+' EQUIPPED  \u00b7  SLOT ['+(j+1)+']','#ffb347')}

 /* ---------- lifecycle ---------- */
 onSalvage(){this.tk.give('crafting_table',1);this.tk.give('scrap',30);this.tk.give('crucible',1);this.tk.toast('+ MARS CRAFTING TABLE  \u00b7  press [G] to deploy','#ffb347');this.tk.toast('+30 SCRAP ALLOY','#ffb347');this.tk.toast('+ THERMAL CRUCIBLE','#ffb347')}
 onWalkStart(){if(this.root||!this.mp.near)return;this.root=new THREE.Group();this.mp.near.add(this.root);this.sp=new Sparks(this.root);
  this.light=new THREE.PointLight(0xffb060,0,16,2);this.light.position.set(0,-50,0);this.root.add(this.light);this.setupBase();if(!this._pu){this._pu=1;addEventListener('keydown',e=>{if(e.code==='PageUp'){e.preventDefault();if(e.repeat)return;this.admToggle()}else if(e.code==='Escape'&&this.admOn)this.admHide()})}}
 cheatUnlock(){if(!this.root||!this.mods.length||!this.s.walking)return;this.close();for(const m of this.mods){m.state='built';m.prog=1;m.solid.visible=false;m.holo.visible=false}if(this.hr)this.hr.visible=false;const b=this.mp.base;if(b&&b.mode==='off')b.arm(true)}   /* silent unlock: old modules never shown, base loads instantly under the fade */
 /* The base site is fixed by code (chosen once in MarsPhase.worldOn: flattest, rock-free plain). Its areas are unlocked by finishing tasks. */
 setupBase(){const B=this.s.bnd&&this.s.bnd.base;if(!B||this.bp)return;this.bp=true;const a=PI/2,ca=Math.cos(a),sa=Math.sin(a),cu=5.25,cv=3;
  this.tdir.set(1,0,0);this.placeAnchor(B.x-(cu*ca-cv*sa),B.z-(cu*sa+cv*ca),this.tdir)}
 award(k){if(this.flags[k]||!this.root)return;this.flags[k]=1;this.unlockNext()}
 unlockNext(){const m=this.mods.find(q=>q.state!=='built');if(m)this.finish(m)}
 reset(){this.close();this.admHide(true);const mp=this.mp;for(const c of this.cols){const i=mp.rockCols.indexOf(c);if(i>=0)mp.rockCols.splice(i,1)}this.cols=[];
  if(this.root){if(mp.near)mp.near.remove(this.root);this.root.traverse(o=>{if(o.geometry)o.geometry.dispose()})}
  this.flags={};this.root=null;this.table=null;this.job=null;this.pg=null;this.bp=false;this.vis=true;this.mods=[];this.made={};this.tab=0;this.sel='o2can';this.on=false;this.wdOn=false;this.wdI=0;this.aimed=null;this.stage='';this.pr='';this.deco=null;this.sp=null;this.light=null;this.doneT=0;this.hr=null;
  $('cf-pr').classList.remove('on');this.tk.pose.wd=0}
 begin(){this.on=true;this.stage='';this.doneT=0}
 addCol(c){this.mp.rockCols.push(c);this.cols.push(c)}
 dust(x,y,z,n,sp,size){const p=this.mp.puffs;if(p)for(let k=0;k<n;k++){const a=rnd(0,TAU),v=rnd(.4,sp);p.emit(x,y,z,Math.cos(a)*v,rnd(.3,sp*.8),Math.sin(a)*v,rnd(.7,1.5),rnd(.3,.6)*size,rnd(1.4,2.6)*size,.80,.55,.42,.5,.8,.2,-.2)}}
 sparks(x,y,z,n,col,sp){if(this.sp)this.sp.emit(x,y,z,n,col,sp)}
 nearTable(){const P=this.mp.pk;return !!(this.table&&P&&Math.hypot(P.x-this.table.x,P.z-this.table.z)<=TABLE_USE)}

 /* ---------- table: deploy / pick up / use ---------- */
 deploy(){const mp=this.mp,P=mp.pk,dead=mp.sv&&mp.sv.dead;if(!this.root||!this.s.walking||dead||!P)return;
  if(this.table){if(!this.nearTable()){this.tk.toast('TABLE ALREADY DEPLOYED','#ffb347');return}
   if(!this.tk.give('crafting_table',1)){this.tk.toast('BACKPACK FULL','#ff5a4a');return}this.cancelJob();this.root.remove(this.table.g);const i=mp.rockCols.indexOf(this.table.col);if(i>=0)mp.rockCols.splice(i,1);this.table=null;this.tk.toast('CRAFTING TABLE PACKED UP','#5de6ff');this.mp.tone&&this.mp.tone(330,.2,.05,'triangle');return}
  if(!this.has('crafting_table')){this.tk.toast('NO CRAFTING TABLE IN PACK','#ff5a4a');return}
  if(mp.base&&mp.base.interior){this.tk.toast('GO OUTSIDE TO DEPLOY THE CRAFTING TABLE','#ffb347');return}
  const sp=this.tk.spot(P,2.8,1.6);if(!sp){this.tk.toast('NO ROOM HERE  \u00b7  MOVE TO CLEAR GROUND','#ff5a4a');return}
  const fx=Math.cos(sp.a),fz=Math.sin(sp.a),x=sp.x,z=sp.z;
  this.take('crafting_table',1);this.tk.after();this.s.showName();
  const g=mTable();g.position.set(x,this.H(x,z),z);g.rotation.y=Math.atan2(-fx,-fz);this.root.add(g);const col={x,z,r:1.3,h:1.3};this.mp.rockCols.push(col);this.cols.push(col);
  this.table={g,x,z,col,sT:0};this.tdir.set(fx,0,fz);this.dust(x,this.H(x,z)+.1,z,22,3,.8);this.sparks(x,this.H(x,z)+.6,z,40,[1,.8,.45],4);
  this.mp.tone&&(this.mp.tone(220,.3,.06,'triangle'),setTimeout(()=>this.mp.tone(330,.3,.06,'triangle'),120));this.tk.toast('MARS CRAFTING TABLE DEPLOYED  \u00b7  [E] to use','#7dff9a');this.award('table')}
 interact(){if(!this.root||!this.s.walking||(this.mp.sv&&this.mp.sv.dead))return false;if(this.open){this.close();return true}
  if(this.table&&this.nearTable()){this.openUI();return true}return false}
 openUI(){this.award('open');this.open=true;this.wdOn=false;this.el.classList.add('on');try{document.exitPointerLock()}catch(e){}this.render()}
 close(){if(!this.open)return;this.open=false;this.el.classList.remove('on');const cv=this.mp.r&&this.mp.r.domElement;try{const r=cv&&cv.requestPointerLock();if(r&&r.catch)r.catch(()=>{})}catch(e){}}

 /* ================= ADMIN PANEL  ([PAGE UP] opens / closes, [ESC] closes) =================
    time skip + speed, fill bucket, add ANY item, vitals / god mode, greenhouse helpers, mission skip.
    All state lives in existing objects (dn.spd / dn.god in daynight.js, tk.ui counts the panel as an open menu). */
 get admOn(){return !!this.adm&&this.adm.classList.contains('on')}
 admToggle(){if(this.admOn){this.admHide();return}const mp=this.mp;if(!mp.walk||!this.root||(mp.sv&&mp.sv.dead)||(mp.dn&&mp.dn.dead))return;
  this.admBuild();if(this.tk.bp.open)this.tk.bp.close();if(this.open)this.close();
  this.admItems();this.adm.classList.add('on');try{document.exitPointerLock()}catch(e){}this.admRefresh();clearInterval(this._adT);this._adT=setInterval(()=>this.admRefresh(),250)}
 admHide(noLock){if(!this.adm||!this.admOn)return;this.adm.classList.remove('on');clearInterval(this._adT);try{document.activeElement&&document.activeElement.blur()}catch(e){}
  const cv=this.mp.r&&this.mp.r.domElement;if(!noLock&&this.mp.walk&&cv)try{const r=cv.requestPointerLock();if(r&&r.catch)r.catch(()=>{})}catch(e){}}
 admBuild(){if(this.adm)return;const st=document.createElement('style');st.textContent=ADM_CSS;document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend',ADM_HTML);const el=this.adm=$('ad');this.admIds=Object.keys(this.s.ITEMS_());
  el.addEventListener('click',e=>{const t=e.target.closest('[data-a]');if(t)this.admAct(t.dataset.a,t.dataset.id)});
  for(const ev of['mousedown','mouseup','wheel'])el.addEventListener(ev,e=>e.stopPropagation());
  $('ad-f').addEventListener('input',()=>this.admItems());
  addEventListener('keydown',e=>{if(!this.admOn||e.code==='PageUp'||e.code==='Escape')return;e.stopPropagation()},true)}   /* typing in the panel never reaches the game (no accidental [E] / [Q] / WASD) */
 admItems(){const q=($('ad-f').value||'').trim().toLowerCase(),I=this.s.ITEMS_(),ic=this.s.icons||{};
  $('ad-il').innerHTML=this.admIds.filter(id=>!q||id.toLowerCase().includes(q)||I[id].name.toLowerCase().includes(q)).map(id=>{const d=I[id],src=ic[id];
   return '<div class="adi"><span class="adic">'+(src?'<img src="'+src+'" alt="">':'<em>'+d.name[0]+'</em>')+'</span><span class="adn">'+d.name+'<small>'+id+'</small></span><button data-a="add" data-id="'+id+'">ADD</button></div>'}).join('')||'<div class="adx">NO MATCHING ITEM</div>'}
 admRefresh(){const mp=this.mp,dn=mp.dn;if(!dn||!this.adm)return;const h=dn.hour()%24,sp=dn.spd||1;
  $('ad-st').textContent='SOL '+dn.sol+'  \u00b7  '+(dn.night?'NIGHT':'DAY')+' '+String(Math.floor(h)).padStart(2,'0')+':'+String(Math.floor((h%1)*60)).padStart(2,'0')+'  \u00b7  \u00d7'+sp;
  for(const b of this.adm.querySelectorAll('[data-a="spd"]'))b.classList.toggle('on',+b.dataset.id===sp);
  for(const b of this.adm.querySelectorAll('[data-a="goto"]'))b.disabled=+b.dataset.id<=dn.sol||!!dn.j5;
  const g=$('ad-god');g.classList.toggle('on',!!dn.god);g.textContent='GOD MODE: '+(dn.god?'ON':'OFF');
  $('ad-sol').textContent=dn.sol<5?'JUMP TO SOL 5 (TEST)':dn.sol===5?'JUMP TO SOL 6 (TEST)':dn.sol===6?'COMPLETE SOL 6 \u2192 SOL 7 (TEST)':mp.base&&mp.base.mode==='off'?'UNLOCK THE WHOLE BASE':'COMPLETE MISSIONS \u2192 NEXT SOL'}
 admAct(a,id){const mp=this.mp,dn=mp.dn,tk=this.tk,sv=mp.sv,I=this.s.ITEMS_(),f=mp.base&&mp.base.farm,ok=(t,c)=>tk.toast(t,c||'#ffb347'),bad=t=>tk.toast(t,'#ff5a4a');
  const farm=()=>{if(f&&f.ready)return f.plots;bad('GREENHOUSE NOT BUILT YET');return null};
  switch(a){
   case'spd':dn.spd=+id||1;ok('TIME SPEED \u00d7'+dn.spd);break;
   case'night':if(dn.dead||dn.sol>=5){bad('CANNOT SKIP NOW');break}if(!dn.night){ok('IT IS DAYTIME  \u00b7  USE \u201cSKIP TO NIGHT\u201d FIRST');break}dn.dawn();break;
   case'tonight':{if(dn.dead||dn.sol>=5){bad('CANNOT SKIP NOW');break}if(dn.night){ok('IT IS ALREADY NIGHT');break}const x=dn.dayFail();if(x){bad(x[1]+'  \u00b7  FINISH THE MISSIONS FIRST');break}dn.t=dn.len;ok('SKIPPING TO NIGHTFALL');break}
   case'sol':if(dn.sol<6&&dn.jumpTo){dn.jumpTo(dn.sol<5?5:6);this.admHide();break}if(dn.sol===6&&dn.skipStep&&mp.base&&mp.base.mode!=='off'){dn.skipStep();this.admHide();break}if(!mp.skipSol)break;if(dn.sol>=6&&mp.base&&mp.base.mode!=='off'){bad('NO FURTHER SOL TO SKIP');break}mp.skipSol();break;
   case'goto':{const N=+id;if(dn.dead||!N)break;if(dn.sol>=N){bad('ALREADY ON SOL '+dn.sol+' OR LATER  \u00b7  YOU CAN ONLY JUMP FORWARD');break}if(dn.j5){bad('JUMP IN PROGRESS');break}if(dn.jumpTo&&dn.jumpTo(N))this.admHide();else bad('CANNOT JUMP RIGHT NOW');break}
   case'bucket':{let n=0;for(const A of[this.s.inv,this.s.bag])for(const it of A)if(it&&it.id==='bucket'){it.w=MAXW;n++}
    if(!n&&!tk.give('bucket',1,{w:MAXW})){bad('BACKPACK FULL  \u00b7  NO ROOM FOR A BUCKET');break}tk.after();this.s.showName();ok('BUCKET FILLED  \u00b7  '+MAXW+' L','#5de6ff');break}
   case'melt':{const c=tk.cru;if(c&&c.state==='melting'){c.prog=1;ok('MELTING FINISHED','#5de6ff')}else if(c&&c.state==='done')ok('WATER IS READY  \u00b7  [E] AT THE CRUCIBLE TO POUR','#5de6ff');else bad('NOTHING MELTING  \u00b7  LOAD ICE INTO THE CRUCIBLE');break}
   case'vitals':if(sv&&!sv.dead){dn.godTick();ok('HEALTH \u00b7 OXYGEN \u00b7 WATER \u00b7 FOOD  \u2192  100%','#7dff9a')}break;
   case'god':dn.god=!dn.god;ok('GOD MODE '+(dn.god?'ON  \u00b7  VITALS LOCKED, NO FREEZING':'OFF'),dn.god?'#7dff9a':'#ffb347');this.admRefresh();break;
   case'water':{const P=farm();if(!P)break;let n=0;for(const p of P)if(p.s==='growing'){p.w=1;f.paint(p);n++}n?ok('ALL GROWING BEDS WATERED','#5de6ff'):bad('NOTHING GROWING');break}
   case'fert':{const P=farm();if(!P)break;let n=0;for(const p of P)if(p.s==='growing'){p.fert=true;f.paint(p);n++}n?ok('FERTILISER APPLIED  \u00b7  GROWTH \u00d71.5','#7dff9a'):bad('NOTHING GROWING');break}
   case'grow':{const P=farm();if(!P)break;let n=0;for(const p of P)if(p.s==='growing'){p.g=1;p.s='ready';p.w=Math.max(p.w,.5);p.said=true;f.paint(p);n++}n?ok('CROPS FULLY GROWN  \u00b7  GO HARVEST','#7dff9a'):bad('NOTHING GROWING');break}
   case'add':{const d=I[id];if(!d)break;const one=['bucket','hammer','torch','crafting_table','crucible'].includes(id),n=one?1:Math.max(1,Math.min(999,parseInt($('ad-q').value,10)||1));
    if(tk.give(id,n,id==='bucket'?{w:MAXW}:undefined)){ok('+'+n+'  '+d.name,'#7dff9a');this.s.showName()}else bad('BACKPACK FULL');break}
   case'preset':{const P=ADM_KITS[id];if(!P)break;let miss=0;for(const k in P){if(!I[k])continue;if(k==='bucket'){this.admAct('bucket');continue}if(!tk.give(k,P[k]))miss++}
    miss?bad('BACKPACK FULL  \u00b7  '+miss+' ITEM(S) NOT ADDED'):ok('KIT ADDED TO BACKPACK','#7dff9a');break}
  }}

 /* ---------- blueprint: free unlock + hologram ---------- */
 unlockBlueprint(){if(this.bp)return;this.bp=true;this.placeAnchor(this.table.x+this.tdir.x*17,this.table.z+this.tdir.z*17,this.tdir);
  this.tk.toast('BASE MAP / BLUEPRINT UNLOCKED  \u00b7  FREE','#5de6ff');this.mp.cap('BASE BLUEPRINT UNLOCKED  \u00b7  HOLOGRAM ONLINE',3200);this.mp.tone&&(this.mp.tone(660,.2,.05),setTimeout(()=>this.mp.tone(990,.4,.05),150))}
 toggleHolo(){if(!this.bp)return;this.vis=!this.vis;this.tk.toast('BLUEPRINT HOLOGRAM '+(this.vis?'ON':'OFF'),'#5de6ff');if(this.open)this.render()}
 disposeHolo(){if(this.hr){this.root.remove(this.hr);this.hr.traverse(o=>{if(o.geometry)o.geometry.dispose()})}for(const m of this.mods)for(const c of m.cols||[]){const i=this.mp.rockCols.indexOf(c);if(i>=0)this.mp.rockCols.splice(i,1)}this.mods=[];this.hr=null}
 placeAnchor(x,z,dir){this.disposeHolo();const a=Math.atan2(dir.z,dir.x)+PI/2,ca=Math.cos(a),sa=Math.sin(a),H=this.H;this.ang=a;this.anchor={x,z};this.hr=new THREE.Group();this.root.add(this.hr);
  for(const d of MODS){const wx=x+d.x*ca-d.z*sa,wz=z+d.x*sa+d.z*ca,gy=Math.max(H(wx,wz),H(wx+d.r*.5,wz),H(wx-d.r*.5,wz),H(wx,wz+d.r*.5),H(wx,wz-d.r*.5))-.05;
   const solid=d.build();solid.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true});const holo=holoFrom(solid);
   for(const o of[solid,holo]){o.position.set(wx,gy,wz);o.rotation.y=-a}solid.visible=false;this.hr.add(solid,holo);
   this.mods.push({d,solid,holo,lines:holo.lines,state:'pending',prog:0,wx,wz,gy,hi:false,cols:[]})}
  /* footprint outline, corner pylons and a scanning ring */
  const dec=new THREE.Group(),X0=-12.5,X1=23,Z0=-15.5,Z1=21.5,pts=[],P=(u,v)=>{const wx=x+u*ca-v*sa,wz=z+u*sa+v*ca;pts.push(new V3(wx,H(wx,wz)+.2,wz))};
  for(let u=X0;u<X1;u+=2)P(u,Z0);for(let v=Z0;v<Z1;v+=2)P(X1,v);for(let u=X1;u>X0;u-=2)P(u,Z1);for(let v=Z1;v>Z0;v-=2)P(X0,v);
  dec.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xffb347,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false})));
  const bm=new THREE.MeshBasicMaterial({color:0x5de6ff,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false});
  for(const[u,v]of[[X0,Z0],[X1,Z0],[X1,Z1],[X0,Z1]]){const wx=x+u*ca-v*sa,wz=z+u*sa+v*ca,gy=H(wx,wz);dec.add(cyl(.09,.09,2.2,new THREE.MeshBasicMaterial({color:0x7defff}),wx,gy+1.1,wz,8),cyl(.05,.05,7,bm,wx,gy+3.5,wz,8))}
  this.scan=new THREE.Mesh(new THREE.RingGeometry(.97,1,72),new THREE.MeshBasicMaterial({color:0x5de6ff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));this.scan.rotation.x=-PI/2;
  const cu=(X0+X1)/2,cv=(Z0+Z1)/2,cx=x+cu*ca-cv*sa,cz=z+cu*sa+cv*ca;this.scan.position.set(cx,H(cx,cz)+.9,cz);dec.add(this.scan);this.deco=dec;this.hr.add(dec)}
 recenter(){if(!this.bp||this.built()>0){this.tk.toast('CANNOT MOVE  \u00b7  MODULES ALREADY BUILT','#ff5a4a');return}const P=this.mp.pk,f=this.tmp.set(Math.cos(P.yaw),0,Math.sin(P.yaw));this.placeAnchor(P.x+f.x*17,P.z+f.z*17,f.clone());this.tk.toast('HOLOGRAM RE-CENTRED IN FRONT OF YOU','#5de6ff');this.render()}

 /* ---------- crafting ---------- */
 act(a,id){const mp=this.mp;
  if(a==='tab'){this.tab=+id;if(this.tab<2){const r=RECIPES.find(x=>x.cat===this.tab);if(!r||r.cat!==(RECIPES.find(x=>x.id===this.sel)||{}).cat)this.sel=r.id}this.render()}
  else if(a==='sel'){this.sel=id;this.render()}
  else if(a==='craft')this.craft(id);
  else if(a==='holo'){this.toggleHolo()}
  else if(a==='recenter')this.recenter()}
 /* craft sound: three metal clanks, then a rising chime (loud enough to hear over the ambience) */
 craftSfx(){const mp=this.mp,a=mp.audio;if(!a||!mp.tone)return;try{a.ac.resume&&a.ac.resume()}catch(e){}
  const noise=(d,v,f)=>{try{const ac=a.ac,s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=a.buf;fl.type='highpass';fl.frequency.value=f;g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);s.connect(fl);fl.connect(g);g.connect(ac.destination);s.start(0,Math.random()*1.5,d+.05)}catch(e){}};
  for(const t of[0,110,230])setTimeout(()=>{mp.tone(140+Math.random()*70,.1,.18,'square');mp.tone(2300,.06,.06,'triangle');noise(.08,.14,1800)},t);
  setTimeout(()=>mp.tone(660,.24,.14,'sine'),380);setTimeout(()=>mp.tone(880,.24,.14,'sine'),480);setTimeout(()=>mp.tone(1320,.5,.13,'sine'),580)}
 /* ---------- timed crafting: 3-5 s progress bar (UI + floating bar over the table + sparks / sound) ---------- */
 craftTime(r){return clamp(r.t||(2.6+.45*Object.keys(r.req).length+(r.cat===1?.7:0)),3,5)}
 craft(id){const r=RECIPES.find(x=>x.id===id);if(!r||this.job)return;if(!this.can(r)||!this.nearTable()){this.mp.tone&&this.mp.tone(150,.22,.12,'sawtooth');return}
  this.job={id,t:0,T:this.craftTime(r),sp:0,tk:-1};this.mp.tone&&this.mp.tone(240,.14,.08,'triangle');this.tk.toast('FABRICATING '+this.name(id)+'  \u00b7  '+this.job.T.toFixed(0)+' s','#5de6ff');this.render()}
 cancelJob(msg){if(!this.job)return;this.job=null;if(this.pg)this.pg.s.visible=false;if(msg)this.tk.toast(msg,'#ff5a4a');this.mp.tone&&this.mp.tone(150,.2,.1,'sawtooth');if(this.open)this.render()}
 jobTick(dt,dead){const j=this.job;if(!j)return;if(dead||!this.table||!this.nearTable()){this.cancelJob(dead?'':'CRAFTING CANCELLED  \u00b7  STAY AT THE TABLE');return}
  j.t+=dt;const k=clamp(j.t/j.T,0,1),tb=this.table,y=this.H(tb.x,tb.z);j.sp-=dt;
  if(j.sp<=0){j.sp=.11;this.sparks(tb.x+rnd(-.35,.35),y+1.05,tb.z+rnd(-.35,.35),5,[1,.82,.5],2.2);this.mp.tone&&this.mp.tone(rnd(1400,2400),.04,.03,'square')}
  const hb=Math.floor(j.t*2.5);if(hb!==j.tk){j.tk=hb;this.mp.tone&&this.mp.tone(170+k*170,.07,.07,'triangle')}
  this.pgDraw(k,j);const pi=$('cf-pgi'),pt=$('cf-pgt');if(pi)pi.style.width=(k*100)+'%';if(pt)pt.textContent='CRAFTING  '+Math.round(k*100)+'%  \u00b7  '+Math.max(0,j.T-j.t).toFixed(1)+' s';
  if(k>=1){this.job=null;if(this.pg)this.pg.s.visible=false;this.craftNow(j.id)}}
 pgDraw(k,j){const t=this.table;if(!t)return;
  if(!this.pg){const c=document.createElement('canvas');c.width=256;c.height=72;const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,depthTest:false}));sp.scale.set(1.5,.42,1);sp.renderOrder=9;this.pg={c,x:c.getContext('2d'),tex,s:sp}}
  const P=this.pg;if(P.s.parent!==t.g){t.g.add(P.s);P.s.position.set(0,2.15,0)}P.s.visible=true;const x=P.x;x.clearRect(0,0,256,72);x.fillStyle='rgba(4,17,26,.85)';x.fillRect(0,0,256,72);x.strokeStyle='#5de6ff';x.lineWidth=3;x.strokeRect(1.5,1.5,253,69);
  x.font='700 15px Consolas,monospace';x.fillStyle='#5de6ff';x.textAlign='center';x.fillText('FABRICATING  '+this.name(j.id),128,25);x.fillStyle='rgba(255,255,255,.15)';x.fillRect(14,38,228,16);x.fillStyle='#7dff9a';x.fillRect(14,38,228*k,16);x.fillStyle='#e8f4f8';x.font='600 12px Consolas,monospace';x.fillText(Math.round(k*100)+'%',128,66);P.tex.needsUpdate=true}
 craftNow(id){const r=RECIPES.find(x=>x.id===id);if(!r)return;if(!this.can(r)){this.tk.toast('CRAFT FAILED  \u00b7  MATERIALS CHANGED','#ff5a4a');this.mp.tone&&this.mp.tone(150,.22,.12,'sawtooth');if(this.open)this.render();return}const s=this.s,arrs=[s.inv,s.bag],snap=arrs.map(A=>A.map(it=>it&&{ref:it,copy:Object.assign({},it)}));
  for(const k in r.req)this.take(k,r.req[k]);
  if(!this.tk.give(r.id,r.n)){arrs.forEach((A,j)=>A.forEach((_,i)=>{const e=snap[j][i];A[i]=e?Object.assign(e.ref,e.copy):null}));this.tk.toast('BACKPACK FULL  \u00b7  FREE A SLOT','#ff5a4a');this.render();return}
  this.made[id]=(this.made[id]||0)+1;this.tk.toast('+'+r.n+' '+this.name(id),'#7dff9a');this.tk.after();this.s.showName();
  this.craftSfx();
  if(this.table)this.sparks(this.table.x,this.H(this.table.x,this.table.z)+1.1,this.table.z,26,[1,.82,.5],3);
  if(r.cat===0||id==='o2big')this.toHotbar(r.id);this.render()}

 /* ---------- crafting UI ---------- */
 icon(id){const s=this.s.icons&&this.s.icons[id];return s?`<img src="${s}" alt="">`:`<img alt="" style="visibility:hidden">`}
 render(){if(!this.open)return;const rg=this.count('regolith'),ic=this.count('ice'),mn=this.count('mineral'),sc=this.count('scrap');
  $('cf-res').textContent=`REGOLITH ${rg} kg  \u00b7  ICE ${ic}  \u00b7  MINERALS ${mn}  \u00b7  SCRAP ${sc}  \u00b7  NITRATE ${this.count('nitrate')}  \u00b7  RARE ${this.count('rare')}`;
  $('cf-tabs').innerHTML=TABS.map((t,i)=>`<div class="${i===this.tab?'on':''}" data-a="tab" data-id="${i}">${t}</div>`).join('');
  const L=$('cf-list'),D=$('cf-det');
  if(this.tab<2){const rs=RECIPES.filter(r=>r.cat===this.tab);if(!rs.some(r=>r.id===this.sel))this.sel=rs[0].id;
   L.innerHTML=rs.map(r=>`<div class="cf-r ${r.id===this.sel?'sel':''} ${this.can(r)?'can':''}" data-a="sel" data-id="${r.id}">${this.icon(r.id)}<span class="nm">${this.name(r.id)}</span><span class="st">${this.can(r)?'READY':'NEED'}${this.made[r.id]?' \u00b7 \u00d7'+this.made[r.id]:''}</span></div>`).join('');
   const r=RECIPES.find(x=>x.id===this.sel),ok=this.can(r);
   D.innerHTML=`<div class="hd">${this.icon(r.id)}<div><h3>${this.name(r.id)}${r.n>1?' \u00d7'+r.n:''}</h3><p>${r.info}</p></div></div>`+Object.keys(r.req).map(k=>{const need=r.req[k],have=this.count(k);return `<div class="cf-q ${have>=need?'ok':'no'}"><i style="width:${Math.min(100,have/need*100)}%"></i><span>${RL[k]}</span><span>${have} / ${need}${k==='regolith'?' kg':''}</span></div>`}).join('')+
    (this.job&&this.job.id===r.id?'<div class="cf-pg"><i id="cf-pgi"></i><span id="cf-pgt">CRAFTING</span></div>':`<button class="cf-b" data-a="craft" data-id="${r.id}" ${ok&&!this.job?'':'disabled'}>${this.job?'BUSY':'CRAFT'}</button>`)+(r.note?'<p style="margin-top:8px">'+r.note+'</p>':'')}
  else{const order=['TASK 1','TASK 2','TASK 3','TASK 4','TASK 5','TASK 6'];
   L.innerHTML=this.mods.map((m,i)=>`<div class="cf-r">${this.icon(m.d.kit)}<span class="nm">${i+1}. ${m.d.name}</span>${m.state==='built'?'<span class="st bt">UNLOCKED</span>':'<span class="st">LOCKED \u00b7 '+order[i]+'</span>'}</div>`).join('');
   D.innerHTML=`<h3>BASE AREAS  \u00b7  FIXED SITE</h3><p>The base stands on a flat, rock-free plain chosen by the survey computer. Every completed task unlocks the next area \u00b7 ${this.built()}/${this.mods.length} unlocked.</p><canvas id="cf-map" width="440" height="300"></canvas>`+
    `<button class="cf-b alt" data-a="holo">${this.vis?'HIDE':'SHOW'} HOLOGRAM [N]</button>`;this.drawMap()}}
 drawMap(){const c=$('cf-map');if(!c||!this.anchor)return;const x=c.getContext('2d'),w=c.width,h=c.height,X0=-14,X1=25,Z0=-17,Z1=23,s=Math.min(w/(X1-X0),h/(Z1-Z0)),ox=(w-(X1-X0)*s)/2,oz=(h-(Z1-Z0)*s)/2,U=u=>ox+(u-X0)*s,Vv=v=>oz+(v-Z0)*s,ca=Math.cos(this.ang),sa=Math.sin(this.ang);
  x.fillStyle='#04111a';x.fillRect(0,0,w,h);x.strokeStyle='rgba(93,230,255,.12)';for(let i=0;i<w;i+=22){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke()}for(let j=0;j<h;j+=22){x.beginPath();x.moveTo(0,j);x.lineTo(w,j);x.stroke()}
  this.mods.forEach((m,i)=>{const d=m.d,col=m.state==='built'?'#7dff9a':m.prog>0?'#ffb347':'#5de6ff';x.strokeStyle=col;x.fillStyle=m.state==='built'?'rgba(125,255,154,.3)':m.prog>0?'rgba(255,179,71,.25)':'rgba(93,230,255,.08)';x.lineWidth=2;x.setLineDash(m.state==='built'?[]:[5,4]);x.beginPath();
   if(d.k==='dome'||d.k==='green')x.arc(U(d.x),Vv(d.z),(d.k==='dome'?6:4.4)*s,0,TAU);else{const hw={air:1.8,corr:3.8,solar:5.7,isru:4.7}[d.k],hd={air:1.7,corr:1.45,solar:3.6,isru:3.6}[d.k];x.rect(U(d.x-hw),Vv(d.z-hd),hw*2*s,hd*2*s)}x.fill();x.stroke();x.setLineDash([]);x.fillStyle=col;x.font='700 13px Consolas,monospace';x.textAlign='center';x.fillText(String(i+1),U(d.x),Vv(d.z)+4)});
  const proj=(wx,wz)=>{const dx=wx-this.anchor.x,dz=wz-this.anchor.z;return[dx*ca+dz*sa,-dx*sa+dz*ca]};
  if(this.table){const[u,v]=proj(this.table.x,this.table.z);x.fillStyle='#ffb347';x.fillRect(U(u)-4,Vv(v)-4,8,8);x.textAlign='left';x.fillText('TABLE',U(u)+8,Vv(v)+4)}
  const P=this.mp.pk;if(P){const[u,v]=proj(P.x,P.z);x.fillStyle='#fff';x.beginPath();x.arc(U(u),Vv(v),4,0,TAU);x.fill();x.fillText('YOU',U(u)+7,Vv(v)+4)}}

 /* ---------- welding input ---------- */
 onDown(e){const mp=this.mp,it=this.tk.held();if(e.button!==0||!this.root||!this.s.walking||!mp.walk||this.open||document.pointerLockElement!==mp.r.domElement||(mp.sv&&mp.sv.dead))return;
  if(!it||it.id!=='torch')return;this.wdOn=true;if(this.aimed&&!this.hasKit(this.aimed))this.tk.toast('NEED '+this.name(this.aimed.d.kit)+'  \u00b7  CRAFT IT AT THE TABLE','#ff5a4a')}
 aim(){return null;const mp=this.mp,cp=mp.cp,d=this.dir.subVectors(mp.cl,cp).normalize();let best=null;   /* welding the old test modules is disabled */
  for(const m of this.mods){if(m.state==='built')continue;const oc=this.tmp.set(m.wx,m.gy+2,m.wz).sub(cp),t=oc.dot(d),d2=oc.lengthSq()-t*t,R=m.d.r;if(t<0||d2>R*R)continue;const tin=t-Math.sqrt(R*R-d2);if(tin>REACH)continue;if(!best||tin<best.tin)best={m,tin}}
  return best}
 finish(m){m.state='built';m.prog=1;m.solid.visible=false;m.holo.visible=false;   /* the old test modules are never built or shown: each finished task just unlocks an area, the REAL base loads after the 6th */
  this.tk.after();this.s.showName();
  const n=this.built();this.tk.toast('BASE AREA UNLOCKED  \u00b7  '+m.d.name+'  \u00b7  '+n+'/'+this.mods.length,'#7dff9a');this.mp.cap('BASE AREA UNLOCKED  \u00b7  '+m.d.name,2600);this.mp.tone&&(this.mp.tone(440,.2,.06),setTimeout(()=>this.mp.tone(660,.2,.06),130),setTimeout(()=>this.mp.tone(880,.4,.06),260));
  if(this.mods.length&&n>=this.mods.length){setTimeout(()=>this.mp.cap('MARS BASE ONLINE  \u00b7  ALL AREAS UNLOCKED',4200),2700);setTimeout(()=>{const b=this.mp.base;if(b&&b.mode==='off'&&this.built()>=this.mods.length){this.close();b.arm(true)}},9000)}}

 /* ---------- per frame ---------- */
 update(dt,dead){if(!this.root)return;this.t+=dt;const T=this.t,mp=this.mp,P=mp.pk,H=this.H;
  if(dead&&this.open)this.close();this.jobTick(dt,dead);
  const it=this.tk.held(),torch=!!it&&it.id==='torch'&&!dead&&!this.open&&mp.walk;
  /* table: animated terminal + holo emitter ring */
  if(this.table){const g=this.table.g;g.ring.rotation.z=T*2;this.table.sT-=dt;if(this.table.sT<=0&&this.nearTableish(30)){this.table.sT=.2;drawScreen(g.sx,256,160,T,[this.bp?'BLUEPRINT ACTIVE':'BLUEPRINT LOCKED','REGOLITH '+this.count('regolith')+' kg','ICE '+this.count('ice')+'  MINERALS '+this.count('mineral'),'SCRAP '+this.count('scrap'),'MODULES '+this.built()+'/'+(this.mods.length||MODS.length)]);g.tex.needsUpdate=true}}
  /* hologram */
  let want=false,wp=null;
  if(this.bp&&this.hr){const all=this.built()>=this.mods.length;HOLO.line.opacity=.55+.25*Math.sin(T*3);HOLO.hi.opacity=.8+.2*Math.sin(T*9);HOLO.fill.opacity=.05+.03*Math.sin(T*2);
   const a=torch&&this.vis?this.aim():null;this.aimed=a?a.m:null;
   for(const m of this.mods){const hi=m===this.aimed;if(hi!==m.hi){m.hi=hi;for(const l of m.lines)l.material=hi?HOLO.hi:HOLO.line}
    m.holo.visible=this.vis&&m.state!=='built';m.solid.visible=false}
   this.deco.visible=this.vis&&!all;this.scT=(this.scT+dt*.35)%1;this.scan.scale.setScalar(3+this.scT*28);this.scan.material.opacity=.55*(1-this.scT);
   const m=this.aimed;
   if(m&&this.wdOn&&this.hasKit(m)){want=true;m.prog=Math.min(1,m.prog+dt/m.d.time);m.state='welding';const k=ease(m.prog);m.solid.scale.set(.88+.12*k,Math.max(.02,k),.88+.12*k);
    wp=this.tmp.copy(this.dir).multiplyScalar(clamp(a.tin,1.5,REACH)).add(mp.cp);
    if(m.prog>=1)this.finish(m)}
   /* built modules: blinking beacons, ISRU steam */
   this.blink+=dt;for(const o of this.mods)if(o.state==='built'&&o.solid.beacon)o.solid.beacon.material.color.setHex((this.blink%1.2)<.4?(o.d.k==='air'?0xffb347:0xff4030):0x331008);
   this.ventT-=dt;if(this.ventT<=0){this.ventT=.22;for(const o of this.mods)if(o.d.k==='isru'&&o.state==='built'&&mp.puffs){const v=o.solid.vent.clone().applyEuler(new THREE.Euler(0,-this.ang,0)).add(new V3(o.wx,o.gy,o.wz));mp.puffs.emit(v.x,v.y,v.z,rnd(-.2,.2),rnd(1,1.8),rnd(-.2,.2),rnd(2.5,4),.25,1.6,.92,.94,.97,.3,.6,.25,0)}}}
  else this.aimed=null;
  /* torch: flame ramp, sparks, light, sound */
  this.wdI+=((want?1:0)-this.wdI)*Math.min(1,dt*10);this.tk.pose.wd=this.wdI;
  if(want&&wp){const n=Math.round(dt*170*(.6+Math.random()));this.sparks(wp.x,wp.y,wp.z,n,[1,.78,.4],4.5);this.sparks(wp.x,wp.y,wp.z,Math.round(n*.3),[.6,.85,1],3);
   if(mp.puffs&&Math.random()<dt*10)mp.puffs.emit(wp.x,wp.y,wp.z,rnd(-.4,.4),rnd(.8,1.6),rnd(-.4,.4),rnd(1,2),.15,.9,.5,.5,.52,.3,.7,.2,0);
   const tp=this.s.vmItems.torch&&this.s.vmItems.torch.tip;if(tp){tp.getWorldPosition(this.t2);this.sparks(this.t2.x,this.t2.y,this.t2.z,Math.round(dt*40),[.7,.9,1],1.4)}
   this.light.position.set(wp.x-this.dir.x*.6,wp.y+.3,wp.z-this.dir.z*.6);this.light.intensity=30+Math.random()*30;
   if(Math.random()<dt*14)this.mp.tone&&this.mp.tone(rnd(1200,2600),.05,.018,'sawtooth')}
  else this.light.intensity=Math.max(0,this.light.intensity-dt*220);
  if(this.sp)this.sp.update(dt,H);
  this.prompt(dead,torch);this.objective(dt,P)}
 nearTableish(r){const P=this.mp.pk;return !!(P&&this.table&&Math.hypot(P.x-this.table.x,P.z-this.table.z)<r)}

 prompt(dead,torch){let h='';
  if(!dead&&!this.open&&this.s.walking){
   if(this.table){if(this.nearTable())h='Press <span class="kb">[E]</span> to use the <b>MARS CRAFTING TABLE</b><small>[G] PICK UP</small>'}
   else if(this.has('crafting_table')&&this.on&&this.stage==='table'&&!this.tk.pr)h='Press <span class="kb">[G]</span> to deploy the <b>MARS CRAFTING TABLE</b>';
   if(!h&&this.bp&&this.vis&&torch&&this.aimed){const m=this.aimed;h=!this.hasKit(m)?'<b>NEED '+this.name(m.d.kit)+'</b><small>CRAFT IT AT THE TABLE</small>':m.prog>0&&this.wdOn?'WELDING '+m.d.name+' &hellip; '+Math.round(m.prog*100)+'%':'Hold <span class="kb">LEFT-CLICK</span> to weld <b>'+m.d.name+'</b>'}}
  const e=$('cf-pr');if(h!==this.pr)e.innerHTML=h;this.pr=h;e.classList.toggle('on',!!h)}

 /* ---------- objectives (Task 3-5), shown in the shared mission panel after Task 2 ---------- */
 objective(dt,P){if(!this.on)return;const n=this.mods.length||MODS.length,b=this.built();
  const F=this.flags;let st='done';if(!F.table)st='table';else if(!F.open)st='bp';else if(!F.o2)st='o2';else if(!F.eat)st='eat';
  const key=st;
  if(key!==this.stage){this.stage=key;const o=(h,ok,dr)=>this.tk.obj(h,ok,dr);
   if(st==='table'){o('<b>Task 3:</b> Deploy the <b>Mars Crafting Table</b> salvaged from the rocket \u2014 press <kbd>G</kbd>.',false,false);this.mp.cap('NEW TASK  \u00b7  DEPLOY CRAFTING TABLE',2600)}
   else if(st==='bp')o('<b>Task 3 complete.</b> <b>Task 4:</b> Walk to the table and press <kbd>E</kbd> \u2014 the base blueprint is free.',false,true);
   else if(st==='o2')o('<b>Task 5:</b> Open the table, craft an <b>OXYGEN CANISTER</b> (SURVIVAL tab), equip it and press <kbd>Q</kbd> to refill your suit.',false,true);
   else if(st==='eat')o('<b>Task 6:</b> Craft a <b>FOOD RATION</b> and eat it with <kbd>Q</kbd> \u00b7 needs <b>NITRATE-RICH SOIL</b> from the boundary zone.',false,true);
   else{o('<b>All tasks complete:</b> '+b+'/'+n+' base areas unlocked.',true,false);this.doneT=8}}
  if(st==='done'&&this.doneT>0){this.doneT-=dt;if(this.doneT<=0){$('sv-obj').classList.remove('on');this.on=false}}
  if(st!=='done'&&st!=='table'&&P){let tx,tz,lab;if(st==='eat'&&this.count('nitrate')<1){let bd=1e9,bm=null;for(const r of this.tk.rocks)if(r.dep==='nitrate'){const d=Math.hypot(r.x-P.x,r.z-P.z);if(d<bd){bd=d;bm=r}}if(bm){tx=bm.x;tz=bm.z;lab='NITRATE DEPOSIT  \u00b7  '}}
   if(tx===undefined&&this.table){tx=this.table.x;tz=this.table.z;lab='CRAFTING TABLE  \u00b7  '}
   
   if(tx!==undefined){const dx=tx-P.x,dz=tz-P.z,fx=Math.cos(P.yaw),fz=Math.sin(P.yaw),f=dx*fx+dz*fz,r=dx*-fz+dz*fx;$('sv-ar').style.transform=`rotate(${Math.atan2(r,f)*57.2958}deg)`;$('sv-di').textContent=lab+Math.round(Math.hypot(dx,dz))+' m'}}}
}

/* ---------------------------------------------- admin panel (see Crafting.admToggle) ---------------------------------------------- */
const ADM_KITS={farm:{seeds:24,nitrate:4,bucket:1},build:{regolith:100,scrap:100,ice:30,mineral:40,brick:30,rare:10},supplies:{o2big:2,o2can:4,ration:4,spudration:4,medkit:3}};
const ADM_CSS=`
#ad{position:fixed;inset:0;z-index:52;display:none;justify-content:flex-end;background:rgba(2,6,12,.4);font:600 13px Consolas,monospace;color:#e8f4f8;letter-spacing:1px;user-select:none}
#ad.on{display:flex}
#ad .adw{width:min(430px,94vw);height:100%;box-sizing:border-box;overflow-y:auto;padding:16px 18px 22px;background:rgba(6,10,18,.96);border-left:2px solid #ffb347;box-shadow:-8px 0 30px rgba(0,0,0,.6)}
#ad .adh{display:flex;flex-direction:column;gap:4px;padding-bottom:10px;border-bottom:1px solid rgba(255,179,71,.4)}
#ad .adh b{font-size:18px;letter-spacing:5px;color:#ffb347}#ad #ad-st{color:#5de6ff;font-size:12px;letter-spacing:2px}
#ad h4{margin:16px 0 7px;font-size:11px;letter-spacing:4px;color:#ffb347;opacity:.85}
#ad .adg{display:grid;grid-template-columns:1fr 1fr;gap:6px}#ad .adg.g3{grid-template-columns:repeat(3,1fr)}#ad .adg.g4{grid-template-columns:repeat(4,1fr)}#ad .adg .wide{grid-column:1/-1}
#ad button{font:700 12px Consolas,monospace;letter-spacing:1.5px;color:#e8f4f8;background:rgba(255,179,71,.1);border:1px solid rgba(255,179,71,.55);border-radius:4px;padding:8px 6px;cursor:pointer;transition:background .15s}
#ad button:disabled{opacity:.28;cursor:default;pointer-events:none}
#ad button:hover{background:rgba(255,179,71,.3)}#ad button:active{background:rgba(255,179,71,.5)}#ad button.on{background:#ffb347;color:#0a0f18}
#ad .note{margin-top:6px;font-size:11px;opacity:.55;letter-spacing:1px;line-height:1.4}
#ad .adq{display:flex;gap:6px;margin-bottom:6px}
#ad input{box-sizing:border-box;font:700 13px Consolas,monospace;color:#e8f4f8;background:rgba(0,0,0,.45);border:1px solid rgba(93,230,255,.5);border-radius:4px;padding:7px 9px;outline:none}
#ad input:focus{border-color:#5de6ff}#ad #ad-f{flex:1;min-width:0}#ad #ad-q{width:78px}
#ad #ad-il{max-height:36vh;overflow-y:auto;border:1px solid rgba(255,255,255,.12);border-radius:4px}
#ad .adi{display:flex;align-items:center;gap:9px;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.07)}#ad .adi:last-child{border-bottom:0}
#ad .adic{width:30px;height:30px;flex:none;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);border-radius:4px}
#ad .adic img{width:28px;height:28px;object-fit:contain}#ad .adic em{color:#ffb347;font-style:normal}
#ad .adn{flex:1;min-width:0;font-size:12px}#ad .adn small{display:block;font-size:10px;opacity:.45;letter-spacing:1px}
#ad .adi button{padding:5px 12px}#ad .adx{padding:14px;text-align:center;opacity:.5}
#ad .adf{margin-top:16px;font-size:11px;opacity:.55;text-align:center}
#ad kbd{border:1px solid #ffb347;border-radius:3px;padding:0 5px;color:#ffb347}
`;
const ADM_HTML=`<div id="ad"><div class="adw">
<div class="adh"><b>ADMIN PANEL</b><span id="ad-st"></span></div>
<h4>TIME</h4>
<div class="adg"><button data-a="night">SKIP NIGHT \u2192 DAWN</button><button data-a="tonight">SKIP TO NIGHT</button></div>
<h4 style="margin-top:12px">TIME SPEED</h4>
<div class="adg g4"><button data-a="spd" data-id="1">\u00d71</button><button data-a="spd" data-id="2">\u00d72</button><button data-a="spd" data-id="5">\u00d75</button><button data-a="spd" data-id="10">\u00d710</button></div>
<div class="note">Speeds up the day clock, sleep, sol missions and greenhouse growth. Night outside is faster too: use GOD MODE if you want to stay out.</div>
<h4>QUICK ACTIONS</h4>
<div class="adg"><button data-a="bucket">FILL BUCKET (10 L)</button><button data-a="melt">FINISH MELTING</button><button data-a="vitals">MAX VITALS</button><button id="ad-god" data-a="god">GOD MODE: OFF</button><button id="ad-sol" class="wide" data-a="sol">COMPLETE MISSIONS \u2192 NEXT SOL</button></div>
<h4>JUMP TO SOL  (EARLIER SOLS COMPLETED)</h4>
<div class="adg g3"><button data-a="goto" data-id="2">SOL 2</button><button data-a="goto" data-id="3">SOL 3</button><button data-a="goto" data-id="4">SOL 4</button><button data-a="goto" data-id="5">SOL 5</button><button data-a="goto" data-id="6">SOL 6</button><button data-a="goto" data-id="7">SOL 7</button></div>
<div class="note">Completes every task of the sols before the one you pick, adds a supply kit and starts the chosen sol. You can only jump forward.</div>
<h4>GREENHOUSE</h4>
<div class="adg g3"><button data-a="water">WATER ALL</button><button data-a="fert">FERTILISE</button><button data-a="grow">GROW NOW</button></div>
<h4>ITEM KITS</h4>
<div class="adg g3"><button data-a="preset" data-id="farm">FARM KIT</button><button data-a="preset" data-id="build">BUILD KIT</button><button data-a="preset" data-id="supplies">SUPPLIES</button></div>
<h4>ADD ANY ITEM</h4>
<div class="adq"><input id="ad-q" type="number" min="1" max="999" value="10" title="amount"><input id="ad-f" type="text" placeholder="SEARCH ITEMS\u2026" autocomplete="off" spellcheck="false"></div>
<div id="ad-il"></div>
<div class="adf"><kbd>PAGE UP</kbd> / <kbd>ESC</kbd> close</div>
</div></div>`;
