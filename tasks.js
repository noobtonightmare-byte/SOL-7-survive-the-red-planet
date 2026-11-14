/* =====================================================================================================
   tasks.js  -  Mars surface tasks, tools and the 10-slot backpack
   -----------------------------------------------------------------------------------------------------
   TASK 1  Melt ice into drinking water (multi-step thermodynamic process).
           1. HARVEST  Equip the WATER BUCKET, stand on an ice patch and press [E] to scoop solid ice chunks
              into the backpack (or chip single chunks with the hammer).
           2. DEPLOY   Press [F] to set down the THERMAL CRUCIBLE (solar-powered heater).
           3. MELT     Press [E] at the crucible to load the ice. It warms from -60 C to 0 C, absorbs the latent
              heat of fusion at 0 C (phase change) and finishes as liquid water.
           4. TRANSFER Press [E] again to pour the meltwater into the water bucket (10 L).
   TASK 2  Use the hammer to break Mars rocks (HMSA-accurate Martian rock / mineral types).
           Left-click with the HEAVY HAMMER equipped to swing. Rocks take 3 strikes, shatter and drop
           collectible samples that walk straight into the backpack.
   BACKPACK  15 stacks. [TAB] or [B] opens it; click a slot, then another, to move / swap items between
           the backpack and the 4-slot hotbar. SHIFT+click quick-moves. Hover a backpack slot and press
           [1]-[4] to send it to that hotbar slot.
   Hooks used by mars.js (class Salvage):  new Tasks(mp,salv,heightAt) -> tk.start() / onWalkStart() /
   reset() / update(dt,dead) / interact() and  tk.bp.toggle() / tk.bp.numKey(i) / tk.bp.open
   ===================================================================================================== */
import * as THREE from 'three';
const V3=THREE.Vector3,MU=THREE.MathUtils,clamp=MU.clamp,rnd=(a,b)=>a+Math.random()*(b-a),$=id=>document.getElementById(id);
const ease=t=>t*t*(3-2*t);
export const BAG=15,SLOTS=4,MAXW=10;                       // backpack stacks, hotbar slots, bucket litres
const G=3.71,REACH=3.3,SW=.62,FILL=2.1,NEED=3,CRN=2.7;             // gravity, hammer reach (m), swing time (s), fill time (s), rocks for Task 2
const STACKS=id=>id!=='bucket'&&id!=='hammer'&&id!=='torch'&&id!=='crafting_table'&&id!=='crucible';
const ICE_T=2.1,CRU_CAP=5,MELT_BASE=5,MELT_PER=2.2,L_PER_ICE=2;       // scoop time (s), crucible capacity (chunks), melt time = base + per*chunks (s), litres per chunk
export const stdMat=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.6,metalness:.1},o));
function ctex(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
function lumpGeo(geo,amp,seed){const p=geo.attributes.position,v=new V3(),n=new V3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);n.copy(v).normalize();
  const d=1+amp*(Math.sin(n.x*3.1+seed)*Math.sin(n.y*2.7+seed*1.7)+Math.sin(n.z*3.4+seed*.6)*Math.cos(n.x*2.2+seed))*.5;
  v.multiplyScalar(d);p.setXYZ(i,v.x,v.y,v.z)}
 geo.computeVertexNormals();return geo}

/* ---------------------------------------------- inventory label helpers (used by mars.js) --------- */
let _tk=null;   /* the live Tasks instance (used by the hotbar icon + held-bucket pose to show carried ice) */
export const iconKey=it=>it.id==='bucket'&&it.w>0?'bucketw':it.id==='bucket'&&_tk&&_tk.iceCount()>0?'bucketi':it.id;
export const slotText=(it,d)=>it.id==='bucket'?(it.w>0?it.w.toFixed(1)+'L':''):(d.unit?it.n+d.unit:it.n>1?'\u00d7'+it.n:'');
export const nameText=(it,d)=>d.name+'  '+(it.id==='bucket'?(it.w>0?it.w.toFixed(1)+' L':'EMPTY'):(d.unit?it.n+d.unit:'\u00d7'+it.n));

/* ---------------------------------------------- Martian rock & mineral types (HMSA missions) ------ */
export const ROCKS={
 rk_basalt:   {name:'BASALT',             col:'#4a443f',sp:['#2c2724','#6a625a'],info:'Maaz formation lava rock \u00b7 pyroxene + plagioclase \u00b7 Jezero crater floor (Perseverance)'},
 rk_olivine:  {name:'OLIVINE CUMULATE',   col:'#8d9a5b',sp:['#5c6a35','#c5d08a'],info:'Seitah formation \u00b7 coarse olivine-rich igneous rock \u00b7 Jezero crater (Perseverance)'},
 rk_carbonate:{name:'MG-FE CARBONATE',    col:'#d6c7a3',sp:['#a89a78','#f1e7cf'],info:'Carbonate-bearing rock \u00b7 Jezero margin unit (Perseverance & orbital CRISM)'},
 rk_clay:     {name:'SMECTITE CLAY',      col:'#a98878',sp:['#7d5f52','#cdb0a1'],info:'Phyllosilicate mudstone \u00b7 clay-rich terrain at Jezero delta & Mawrth Vallis (CRISM)'},
 rk_hematite: {name:'HEMATITE',           col:'#5a5860',sp:['#34333a','#8a8896'],m:.55,r:.38,info:'Iron-oxide "blueberry" concretions \u00b7 Meridiani Planum (Opportunity)'},
 rk_sulfate:  {name:'CA-SULFATE (GYPSUM)',col:'#eeeadd',sp:['#c9c4b0','#ffffff'],info:'Bright mineral veins \u00b7 Gale Crater (Curiosity) & Endeavour Crater (Opportunity)'}};
const rtc={},rmc={};
/* colour code for the stones the tasks and recipes need: rock = Task 2 (break 3), vein = mixed minerals, nitrate = fertiliser, rare = rare earths */
const HL={rock:{c:0xff9a2e,s:'#ff9a2e',t:'TASK ROCK'},vein:{c:0xf5e24a,s:'#f5e24a',t:'MINERAL VEIN'},nitrate:{c:0x57ff8a,s:'#57ff8a',t:'NITRATE SOIL'},rare:{c:0xe060ff,s:'#e060ff',t:'RARE EARTH'}};
function rockTex(id){return rtc[id]||(rtc[id]=ctex(128,128,(x,w,h)=>{const R=ROCKS[id];x.fillStyle=R.col;x.fillRect(0,0,w,h);
 for(let i=0;i<760;i++){x.fillStyle=R.sp[i&1];x.globalAlpha=rnd(.12,.4);x.fillRect(rnd(0,w),rnd(0,h),rnd(1,3.2),rnd(1,3.2))}
 if(id==='rk_basalt'){x.globalAlpha=.55;x.fillStyle='#14110f';for(let i=0;i<26;i++){x.beginPath();x.ellipse(rnd(0,w),rnd(0,h),rnd(1,2.6),rnd(1,2.2),0,0,7);x.fill()}}   // vesicles
 if(id==='rk_sulfate'){x.globalAlpha=.5;x.strokeStyle='#fff';x.lineWidth=2;for(let i=0;i<5;i++){x.beginPath();x.moveTo(rnd(0,w),0);x.lineTo(rnd(0,w),h);x.stroke()}}      // bright veins
 x.globalAlpha=1}))}
function rockMat(id){const R=ROCKS[id];return rmc[id]||(rmc[id]=stdMat(0xffffff,{map:rockTex(id),roughness:R.r??.92,metalness:R.m??0,flatShading:true}))}
function modelSample(id){if(id==='nitrate')return modelNitrate();if(id==='rare')return modelRare();const g=new THREE.Group(),mat=rockMat(id);
 if(id==='rk_hematite'){for(let i=0;i<9;i++){const r=.035+.012*(i%3),m=new THREE.Mesh(new THREE.SphereGeometry(r,14,10),mat),d=.05*(i%4);m.position.set(Math.cos(i*2.4)*d,r,Math.sin(i*2.4)*d);g.add(m)}}
 else{[[0,.07,0,.1,1.2,.8,1],[.14,.045,.05,.065,1,.8,1.1],[-.1,.04,.09,.06,1.1,.75,1]].forEach(([x,y,z,r,sx,sy,sz],i)=>{
  const m=new THREE.Mesh(lumpGeo(new THREE.IcosahedronGeometry(r,1),.5,i*2.3+id.length),mat);m.scale.set(sx,sy,sz);m.position.set(x,y,z);m.rotation.set(i,i*2,i*.5);g.add(m)})}
 return g}
/* ---------------------------------------------- SURVIVAL consumables (one per HUD bar) ---------------------- */
export const USE={o2can:{k:'o2',v:60,msg:'+60% OXYGEN  \u00b7  SUIT REFILLED',col:'#5de6ff',name:'OXYGEN'},o2big:{k:'o2',v:100,msg:'OXYGEN FULL  \u00b7  SUIT TANKS TOPPED UP',col:'#5de6ff',name:'OXYGEN'},
 ration:{k:'food',v:45,msg:'+45% FOOD',col:'#ffb347',name:'FOOD'},medkit:{k:'hp',v:50,msg:'+50% HEALTH',col:'#ff6a5a',name:'HEALTH'},radpill:{k:'rad',v:-45,msg:'RADIATION -45%',col:'#7dff9a',name:'RADIATION'}};
function modelCanister(big){const g=new THREE.Group(),s=big?1.35:1,body=stdMat(0xdfe8f0,{metalness:.5,roughness:.35}),blue=stdMat(0x2f8fff,{metalness:.3,roughness:.4}),dk=stdMat(0x2a2f36,{metalness:.7,roughness:.5}),or=stdMat(0xff7a1f,{roughness:.5});
 const add=(geo,m,y)=>{const o=new THREE.Mesh(geo,m);o.position.y=y*s;o.scale.setScalar(s);g.add(o)};
 add(new THREE.CylinderGeometry(.07,.07,.26,20),body,.15);add(new THREE.CylinderGeometry(.071,.071,.07,20),blue,.17);add(new THREE.SphereGeometry(.07,16,8,0,6.283,0,1.57),body,.28);
 add(new THREE.CylinderGeometry(.02,.025,.05,10),dk,.34);add(new THREE.TorusGeometry(.03,.008,6,14),or,.37);add(new THREE.CylinderGeometry(.075,.075,.02,20),dk,.02);return g}
function modelRation(){const g=new THREE.Group(),f=stdMat(0x58b36a,{metalness:.55,roughness:.35}),w=stdMat(0xf2f2ea,{roughness:.6}),o=stdMat(0xff8a2a,{roughness:.5});
 const a=new THREE.Mesh(new THREE.BoxGeometry(.24,.05,.17),f);a.position.y=.03;g.add(a);const b=new THREE.Mesh(new THREE.BoxGeometry(.14,.052,.09),w);b.position.y=.03;g.add(b);const c=new THREE.Mesh(new THREE.BoxGeometry(.05,.054,.05),o);c.position.set(-.05,.03,0);g.add(c);return g}
function modelMedkit(){const g=new THREE.Group(),w=stdMat(0xf4f6f8,{roughness:.45,metalness:.1}),r=stdMat(0xe02828,{roughness:.5});
 const a=new THREE.Mesh(new THREE.BoxGeometry(.26,.15,.1),w);a.position.y=.08;g.add(a);const h=new THREE.Mesh(new THREE.TorusGeometry(.04,.008,6,12,Math.PI),stdMat(0x2a2f36));h.position.set(0,.16,0);g.add(h);
 for(const [x,y] of[[0,0],[0,0]]){}const c1=new THREE.Mesh(new THREE.BoxGeometry(.1,.03,.012),r),c2=new THREE.Mesh(new THREE.BoxGeometry(.03,.1,.012),r);c1.position.set(0,.08,.056);c2.position.set(0,.08,.056);g.add(c1,c2);return g}
function modelRadpill(){const g=new THREE.Group(),y=stdMat(0xe8d23a,{roughness:.4,metalness:.1}),k=stdMat(0x1a1c20,{roughness:.6}),gl=stdMat(0x7dff9a,{emissive:0x1a6a2a,emissiveIntensity:.5,roughness:.3});
 const b=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.15,18),y);b.position.y=.09;g.add(b);const c=new THREE.Mesh(new THREE.CylinderGeometry(.062,.062,.04,18),k);c.position.y=.185;g.add(c);
 const s=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.016,3),gl);s.rotation.x=Math.PI/2;s.position.set(0,.09,.061);g.add(s);return g}

/* ---------------------------------------------- mineral deposits & boundary nutrient zones ------------ */
export const DEPS={
 vein:   {name:'MINERAL VEIN',            frag:'rk_hematite',hp:4,info:'Exposed ore vein \u00b7 breaks into assorted rock & mineral samples'},
 nitrate:{name:'NITRATE-RICH DEPOSIT',    frag:'rk_sulfate', hp:4,info:'Nitrate / perchlorate-free evaporite crust \u00b7 greenhouse fertiliser (Curiosity & Phoenix soil chemistry)'},
 rare:   {name:'RARE-MINERAL CRYSTALS',   frag:'rk_olivine', hp:5,info:'Platinum-group & rare-earth bearing crystals \u00b7 catalysts for MOXIE cells'}};
const DEPDROP={nitrate:'NITRATE-RICH SOIL',rare:'RARE MINERALS'};
let _nit=null,_rar=null,_vein=null;
const nitMat=()=>_nit||(_nit=stdMat(0xd7e8c9,{roughness:.8,metalness:0,flatShading:true,emissive:0x1f3a1c,emissiveIntensity:.35}));
const rarMat=()=>_rar||(_rar=stdMat(0x7fe9ff,{roughness:.15,metalness:.35,flatShading:true,emissive:0x1b8fb3,emissiveIntensity:.9}));
const veinMat=()=>_vein||(_vein=stdMat(0xe0b060,{roughness:.35,metalness:.7,flatShading:true,emissive:0x4a2a08,emissiveIntensity:.5}));
function modelNitrate(){const g=new THREE.Group(),m=nitMat();[[0,.06,0,.09,1.3,.8,1],[.13,.04,.05,.06,1,.8,1.2],[-.1,.04,.08,.065,1.1,.7,1]].forEach(([x,y,z,r,sx,sy,sz],i)=>{
 const k=new THREE.Mesh(lumpGeo(new THREE.IcosahedronGeometry(r,1),.45,i*1.7+3),m);k.scale.set(sx,sy,sz);k.position.set(x,y,z);g.add(k)});return g}
function modelRare(){const g=new THREE.Group(),m=rarMat();for(let i=0;i<5;i++){const k=new THREE.Mesh(new THREE.OctahedronGeometry(.045+.012*(i%3),0),m);k.scale.set(.8,1.9+.3*(i%2),.8);
 const a=i*1.26;k.position.set(Math.cos(a)*.06*(i>0),.07+.015*i%2,Math.sin(a)*.06*(i>0));k.rotation.set(.2*i,i,.15*i);g.add(k)}return g}
/* world outcrop: rock base + crystal / crust cluster. kind = vein | nitrate | rare */
function modelDeposit(kind){const g=new THREE.Group(),base=new THREE.Mesh(lumpGeo(new THREE.IcosahedronGeometry(1,1),.4,rnd(0,9)),rockMat(DEPS[kind].frag));base.scale.set(1.1,.55,1);base.position.y=.2;g.add(base);
 const mat=kind==='rare'?rarMat():kind==='nitrate'?nitMat():veinMat();
 const n=kind==='rare'?7:kind==='nitrate'?5:6;
 for(let i=0;i<n;i++){const a=i/n*6.283+rnd(-.3,.3),d=rnd(.15,.75),h=kind==='rare'?rnd(.7,1.7):kind==='vein'?rnd(.25,.6):rnd(.2,.45),w=kind==='rare'?rnd(.1,.17):kind==='nitrate'?rnd(.22,.4):rnd(.14,.26);
  const geo=kind==='rare'?new THREE.OctahedronGeometry(w,0):kind==='nitrate'?lumpGeo(new THREE.IcosahedronGeometry(w,1),.4,i):new THREE.BoxGeometry(w*1.4,h,w);
  const k=new THREE.Mesh(geo,mat);if(kind==='rare')k.scale.set(.75,h/w,.75);else if(kind==='nitrate')k.scale.set(1.2,.6,1.1);
  k.position.set(Math.cos(a)*d,.42+(kind==='rare'?h*.4:kind==='vein'?h*.3:0),Math.sin(a)*d);k.rotation.set(rnd(-.4,.4),rnd(0,6),rnd(-.4,.4));g.add(k)}
 return g}

/* ---------------------------------------------- THERMAL CRUCIBLE: solar-heated ice melter ------------------ */
function modelCrucible(){const g=new THREE.Group(),steel=stdMat(0xb9c2cb,{metalness:.85,roughness:.38}),dark=stdMat(0x2a2f36,{metalness:.7,roughness:.5}),or=stdMat(0xff7a1f,{roughness:.5,metalness:.1});
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.27,.3,.46,28),steel);body.position.y=.31;g.add(body);
 const foot=new THREE.Mesh(new THREE.CylinderGeometry(.33,.35,.08,28),dark);foot.position.y=.04;g.add(foot);
 const ringHeat=new THREE.Mesh(new THREE.TorusGeometry(.295,.022,8,32),stdMat(0xff5a1f,{emissive:0xff3a08,emissiveIntensity:.1,roughness:.4}));ringHeat.rotation.x=Math.PI/2;ringHeat.position.y=.17;g.add(ringHeat);
 const band=new THREE.Mesh(new THREE.TorusGeometry(.282,.012,8,32),or);band.rotation.x=Math.PI/2;band.position.y=.46;g.add(band);
 const lid=new THREE.Mesh(new THREE.CylinderGeometry(.25,.28,.05,28),dark);lid.position.y=.57;g.add(lid);
 const knob=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),or);knob.position.y=.62;g.add(knob);
 /* sight-glass window on the front: ice block shrinks while water rises */
 const win=(r,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.3,18,1,true,-.65,1.3),m);o.position.y=.33;g.add(o);return o};
 const ice=win(.285,iceMat());ice.material=ice.material.clone();ice.material.side=THREE.DoubleSide;
 const wat=win(.287,stdMat(0x3d9bff,{roughness:.05,metalness:0,transparent:true,opacity:.82,emissive:0x0a2a55,emissiveIntensity:.6,side:THREE.DoubleSide}));wat.scale.y=.01;
 /* solar panel that powers the heater loop */
 const pan=new THREE.Mesh(new THREE.BoxGeometry(.52,.02,.34),stdMat(0x153a7a,{metalness:.6,roughness:.25,emissive:0x0a1a3a,emissiveIntensity:.5}));pan.position.set(.28,.5,-.12);pan.rotation.set(.35,0,-.5);g.add(pan);
 const arm=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.26,6),dark);arm.position.set(.2,.42,-.08);arm.rotation.z=-.5;g.add(arm);
 const lamp=new THREE.Mesh(new THREE.SphereGeometry(.03,10,8),new THREE.MeshBasicMaterial({color:0xff4a3a}));lamp.position.set(-.2,.52,.1);g.add(lamp);
 g.userData={ice,wat,ringHeat,lamp,iceH:.3,watH:.3};
 g.userData.lvl=(iceF,watF)=>{const u=g.userData;u.ice.visible=iceF>.01;u.ice.scale.y=Math.max(.01,iceF);u.ice.position.y=.18+.15*iceF;u.wat.visible=watF>.01;u.wat.scale.y=Math.max(.01,watF);u.wat.position.y=.18+.15*watF};
 return g}
let _ice=null;const iceMat=()=>_ice||(_ice=stdMat(0xcfeaff,{roughness:.12,metalness:0,transparent:true,opacity:.84,flatShading:true,emissive:0x15324a,emissiveIntensity:.5}));
function modelIce(){const g=new THREE.Group();[[0,.07,0,.1,1.2,.9,1],[.15,.05,.04,.07,1,1,1.2],[-.11,.045,.09,.065,1.1,.8,1]].forEach(([x,y,z,r,sx,sy,sz],i)=>{
 const m=new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),iceMat());m.scale.set(sx,sy*1.3,sz);m.position.set(x,y,z);m.rotation.set(i*1.1,i*2.3,i*.4);g.add(m)});return g}

/* ---------------------------------------------- WATER BUCKET: steel pail, bail handle, water surface ---- */
function modelBucket(wl){const g=new THREE.Group(),steel=stdMat(0xb9c2cb,{metalness:.85,roughness:.38,side:THREE.DoubleSide}),dark=stdMat(0x3a3f46,{metalness:.7,roughness:.5}),or=stdMat(0xff8a2a,{roughness:.55,metalness:.05});
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.125,.095,.24,32,1,true),steel);body.position.y=-.25;g.add(body);
 const bot=new THREE.Mesh(new THREE.CircleGeometry(.095,28),steel);bot.rotation.x=Math.PI/2;bot.position.y=-.37;g.add(bot);
 const ring=(r,t,m,y)=>{const q=new THREE.Mesh(new THREE.TorusGeometry(r,t,8,32),m);q.rotation.x=Math.PI/2;q.position.y=y;g.add(q)};
 ring(.125,.008,dark,-.13);ring(.112,.007,or,-.25);ring(.104,.006,or,-.31);
 const hd=new THREE.Mesh(new THREE.TorusGeometry(.125,.006,8,32,Math.PI),dark);hd.position.y=-.13;g.add(hd);               // bail handle, apex at y=0
 for(const s of[-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.014,10,8),dark);e.position.set(s*.125,-.13,0);g.add(e)}
 const w=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,.012,28),stdMat(0x3d9bff,{roughness:.05,metalness:0,transparent:true,opacity:.88,emissive:0x0a2a55,emissiveIntensity:.6}));g.add(w);
  /* ICE CHUNKS: translucent 3D chunks that sit inside the pail (resting on the bottom, floating on the meltwater when there is some) */
  const icm=new THREE.MeshStandardMaterial({color:0xd8f3ff,transparent:true,opacity:.66,roughness:.08,metalness:0,emissive:0x4aa8e0,emissiveIntensity:.4,depthWrite:false,flatShading:true}),
   icg=new THREE.Group(),CH=[[0,-.345,0,.046],[.058,-.34,.02,.04],[-.05,-.342,.038,.042],[.012,-.338,-.06,.04],[-.06,-.34,-.04,.036],[.03,-.3,.012,.042],[-.03,-.296,-.02,.04],[.05,-.292,-.03,.034]];
  for(let i=0;i<CH.length;i++){const c=new THREE.Mesh(new THREE.IcosahedronGeometry(CH[i][3],0),icm);c.userData.b=CH[i];c.rotation.set(i*1.3,i*.9,i*.5);c.scale.set(1.15,.85,1);icg.add(c)}icg.visible=false;g.add(icg);
  g.userData.ice=(n,l)=>{n=Math.max(0,Math.min(CH.length,n|0));icg.visible=n>0;const wy=l>.01?-.355+l*.2:-9;icg.children.forEach((c,i)=>{c.visible=i<n;const b=c.userData.b;c.position.set(b[0],Math.max(b[1],wy+.012+(i%3)*.004),b[2])})};
  g.userData.lvl=l=>{w.visible=l>.01;if(l>.01){const y=-.355+l*.2,r=(.095+.03*((y+.37)/.24)-.006)/.1;w.position.y=y;w.scale.set(r,1,r)}};g.userData.lvl(wl);return g}

/* ---------------------------------------------- first-person hand + arm (white EVA sleeve, dark glove) -- */
export function makeFist(){const g=new THREE.Group(),m=stdMat(0x2b2f36,{roughness:.8,metalness:.05});
 const p=new THREE.Mesh(new THREE.SphereGeometry(.05,16,12),m);p.scale.set(1,1.15,1.05);p.position.z=.012;g.add(p);
 for(let i=0;i<4;i++){const f=new THREE.Mesh(new THREE.CapsuleGeometry(.0165,.055,4,8),m);f.rotation.z=Math.PI/2;f.position.set(-.01,.034-i*.023,-.036);g.add(f)}   // fingers wrap the handle
 const t=new THREE.Mesh(new THREE.CapsuleGeometry(.017,.04,4,8),m);t.position.set(.04,.015,-.02);t.rotation.z=-.5;g.add(t);return g}
export function makeArm(){const g=new THREE.Group(),suit=stdMat(0xe6eaee,{roughness:.8,metalness:0}),cuff=stdMat(0xff7a1f,{roughness:.55,metalness:0}),d=new V3(.45,-.7,.55).normalize();
 const a=new THREE.Group();a.quaternion.setFromUnitVectors(new V3(0,1,0),d);                      // sleeve runs from the hand down-right, off the bottom of the screen
 const s=new THREE.Mesh(new THREE.CylinderGeometry(.052,.042,.9,18),suit);s.position.y=.5;a.add(s);
 const c=new THREE.Mesh(new THREE.CylinderGeometry(.056,.056,.04,18),cuff);c.position.y=.075;a.add(c);g.add(a);return g}

/* ---------------------------------------------- register the new items + rigs into mars.js ITEMS ---- */
export function patchItems(I,{modelHammer,fit}){
 const hold={x:.28,y:-.26,z:-.68,rx:.3};
 I.bucket={name:'WATER BUCKET',unit:'',info:'Steel pail \u00b7 [E] on an ice patch scoops ice chunks \u00b7 pour meltwater from the crucible into it \u00b7 holds 10 L',build:()=>modelBucket(0),buildFull:()=>modelBucket(1),buildIce:()=>{const m=modelBucket(0);m.userData.ice(8,0);return m},size:.5,ref:.45,cy:-.18,icon:{rx:.35,ry:-.4},hold,
  rig:()=>{const root=new THREE.Group(),piv=new THREE.Group(),tilt=new THREE.Group(),m=modelBucket(0);tilt.add(m);tilt.rotation.x=.45;     // hangs from the handle, opening tipped toward the viewer
   const fist=makeFist();fist.rotation.z=Math.PI/2;piv.add(tilt,fist,makeArm());root.add(piv);root.position.set(.30,.04,-.78);
   root.userData.pose=(P,dt,it)=>{const lv=clamp(((it&&it.w)||0)/MAXW,0,1);m.userData.lvl(lv);m.userData.ice(_tk?Math.min(8,_tk.iceCount()):0,lv);const dip=P.fl>=0?Math.sin(clamp(P.fl,0,1)*Math.PI):0;
    piv.position.set(-.05*dip,-.26*dip,-.14*dip);piv.rotation.set(.75*dip,0,Math.sin(Math.max(P.fl,0)*16)*.07*dip)};return root}};
 I.ice={name:'WATER ICE',unit:'',info:'Frozen water chunks \u00b7 melt in the thermal crucible for drinking water & propellant (2 L each)',build:modelIce,size:.3,ref:.4,cy:.06,icon:{rx:.4,ry:.5},hold};
 I.crucible={name:'THERMAL CRUCIBLE',unit:'',info:'Solar-heated ice melter \u00b7 press [F] to deploy, [E] to load ice and pour meltwater',build:()=>modelCrucible(),size:.36,ref:.7,cy:.33,icon:{rx:.35,ry:-.5},hold};
 I.o2can={name:'OXYGEN CANISTER',unit:'',info:'Bottled electrolysis oxygen \u00b7 press [Q] to refill your suit (+60%)',build:()=>modelCanister(false),size:.34,ref:.4,cy:.19,icon:{rx:.3,ry:.5},hold};
 I.o2big={name:'LARGE O2 CYLINDER',unit:'',info:'Full suit top-up \u00b7 press [Q] to use (+100% oxygen)',build:()=>modelCanister(true),size:.38,ref:.54,cy:.26,icon:{rx:.3,ry:.5},hold};
 I.ration={name:'FOOD RATION',unit:'',info:'Hydroponic potato ration \u00b7 press [Q] to eat (+45% food)',build:modelRation,size:.3,ref:.28,cy:.03,icon:{rx:.6,ry:.5},hold};
 I.medkit={name:'MEDKIT',unit:'',info:'Trauma kit \u00b7 press [Q] to use (+50% health)',build:modelMedkit,size:.32,ref:.3,cy:.09,icon:{rx:.35,ry:.55},hold};
 I.radpill={name:'RAD-AWAY TABLETS',unit:'',info:'Radioprotector \u00b7 press [Q] to take one (-45% radiation)',build:modelRadpill,size:.3,ref:.22,cy:.1,icon:{rx:.3,ry:.5},hold};
 I.nitrate={name:'NITRATE-RICH SOIL',unit:'',info:'Nitrate evaporite from the canyon rim \u00b7 fertiliser for greenhouse crops',build:modelNitrate,size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold};
 I.rare={name:'RARE MINERALS',unit:'',info:'Platinum-group / rare-earth crystals \u00b7 catalysts for electrolysis & power cells',build:modelRare,size:.3,ref:.4,cy:.07,icon:{rx:.4,ry:.6},hold};
 for(const id in ROCKS)I[id]={name:ROCKS[id].name+' SAMPLE',unit:'',info:ROCKS[id].info,build:()=>modelSample(id),size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold};
 /* HAMMER: the pivot sits exactly in the glove, the model is offset so the rubber grip is in the fist, and the
    whole rig (hammer + hand + sleeve) swings about the wrist */
 const h=I.hammer,gripY=-.84;h.size=.66;
 h.rig=d=>{const s=d.size/d.ref,root=new THREE.Group(),piv=new THREE.Group(),tilt=new THREE.Group(),m=fit(modelHammer(),d.size,d.ref,d.cy);
  m.position.y=-(gripY-d.cy)*s;tilt.add(m);tilt.rotation.set(-.42,Math.PI/2,0);                        // head axis lies in the swing plane
  const fist=makeFist();fist.rotation.set(-.42,0,0);piv.add(tilt,fist,makeArm());root.add(piv);root.position.set(.30,-.30,-.72);
  root.userData.pose=P=>{let rx=0,py=0,pz=0;
   if(P.sw>=0){const t=P.sw;
    if(t<.3){const k=ease(t/.3);rx=.9*k;py=.05*k;pz=.06*k}                                            // wind-up: head tips back over the shoulder
    else if(t<.5){const k=(t-.3)/.2,e=k*k;rx=.9-2.45*e;py=.05-.13*e;pz=.06-.24*e}                    // strike: fast accelerating arc (impact at t=.5)
    else{const k=ease((t-.5)/.5);rx=-1.55*(1-k);py=-.08*(1-k);pz=-.18*(1-k)}}                        // recover
   piv.rotation.x=rx;piv.position.set(0,py,pz)};return root}}

/* ---------------------------------------------- patchy ice (terrain-conforming decal + frost chunks) --- */
function iceTex(seed){return ctex(256,256,(x,w,h)=>{const R=(a,b)=>{const t=Math.sin(seed*91.7+a*12.9898+b*78.233)*43758.5453;return t-Math.floor(t)};
 const blob=(cx,cy,rad,s)=>{x.beginPath();for(let i=0;i<=56;i++){const a=i/56*6.2832,k=1+.22*Math.sin(a*3+s)+.14*Math.sin(a*5+s*2.1)+.08*Math.sin(a*9+s*3.3),px=cx+Math.cos(a)*rad*k,py=cy+Math.sin(a)*rad*k;i?x.lineTo(px,py):x.moveTo(px,py)}x.closePath()};
 const gr=x.createRadialGradient(128,128,10,128,128,110);gr.addColorStop(0,'rgba(238,249,255,.97)');gr.addColorStop(.7,'rgba(192,226,247,.93)');gr.addColorStop(1,'rgba(160,205,235,.82)');
 x.fillStyle=gr;blob(128,128,76,seed);x.fill();
 for(let i=0;i<3;i++){const a=seed*3+i*2.1;blob(128+Math.cos(a)*70,128+Math.sin(a)*70,18+R(i,1)*10,seed+i);x.fill()}                    // satellite pockets: the patch is ragged, not a disc
 x.globalCompositeOperation='source-atop';
 for(let i=0;i<520;i++){x.fillStyle=R(i,2)>.5?'rgba(255,255,255,.35)':'rgba(120,170,210,.3)';x.fillRect(R(i,3)*w,R(i,4)*h,1+R(i,5)*3,1+R(i,6)*3)}
 x.strokeStyle='rgba(90,140,185,.55)';x.lineWidth=1;for(let i=0;i<9;i++){x.beginPath();let px=R(i,7)*w,py=R(i,8)*h;x.moveTo(px,py);for(let j=0;j<5;j++){px+=(R(i,j+9)-.5)*50;py+=(R(i,j+19)-.5)*50;x.lineTo(px,py)}x.stroke()}
 x.globalCompositeOperation='source-over';
 for(let i=0;i<260;i++){const a=R(i,30)*6.2832,rr=78+R(i,31)*34;x.fillStyle=`rgba(225,240,252,${.12+.25*(1-(rr-78)/34)})`;x.fillRect(128+Math.cos(a)*rr,128+Math.sin(a)*rr,1+R(i,32)*2.5,1+R(i,33)*2.5)}})}

/* ---------------------------------------------- CSS + DOM ---------------------------------------- */
const CSS=`
#sv-ot kbd{font:700 12px Consolas,monospace;border:1px solid #ffb347;color:#ffb347;background:rgba(255,179,71,.12);border-radius:3px;padding:1px 7px;margin:0 2px}
#tk-ex{position:fixed;left:8px;top:4px;z-index:31;width:32px;height:32px;border-radius:50%;background:#ff2a2a;color:#fff;font:900 24px/32px Arial,sans-serif;text-align:center;opacity:0;pointer-events:none;transition:opacity .25s;box-shadow:0 0 14px rgba(255,40,40,.9)}
#tk-ex.on{opacity:1;animation:tkEx .7s ease-in-out infinite}
@keyframes tkEx{0%{transform:translateY(0) scale(1) rotate(-8deg);box-shadow:0 0 0 0 rgba(255,50,50,.8)}35%{transform:translateY(-9px) scale(1.2) rotate(8deg)}70%{transform:translateY(0) scale(1) rotate(-8deg)}100%{transform:translateY(0) scale(1) rotate(-8deg);box-shadow:0 0 0 20px rgba(255,50,50,0)}}
#tk-pr{position:fixed;left:50%;bottom:27%;transform:translateX(-50%) translateY(10px);z-index:25;padding:12px 28px;font:700 20px "Segoe UI",Arial,sans-serif;letter-spacing:2.5px;color:#fff;background:rgba(6,10,18,.78);border:1px solid rgba(93,230,255,.7);border-radius:6px;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;text-shadow:0 0 10px #000;text-align:center;white-space:nowrap;min-width:260px}
#tk-pr.on{opacity:1;transform:translateX(-50%)}#tk-pr .kb{color:#ffb347;border:2px solid #ffb347;border-radius:4px;padding:0 9px;margin:0 4px}#tk-pr b{color:#ffb347}
#tk-pr .pb{height:6px;margin-top:9px;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden}#tk-pr .pb i{display:block;height:100%;background:linear-gradient(90deg,#5de6ff,#bff3ff)}
#tk-toasts{position:fixed;right:26px;bottom:120px;z-index:26;display:flex;flex-direction:column;gap:6px;align-items:flex-end;pointer-events:none}
#tk-toasts div{font:700 13px Consolas,monospace;letter-spacing:2px;color:#fff;background:rgba(6,10,18,.82);border-left:3px solid #5de6ff;padding:7px 14px;border-radius:3px;animation:tkT 3.2s forwards}
@keyframes tkT{0%{opacity:0;transform:translateX(24px)}8%{opacity:1;transform:none}82%{opacity:1}100%{opacity:0}}
#bp-pill{position:fixed;left:50%;bottom:34px;margin-left:196px;z-index:25;font:700 12px Consolas,monospace;letter-spacing:2px;color:#8fd9ee;background:rgba(6,10,18,.7);border:1px solid rgba(93,230,255,.38);border-radius:3px;padding:6px 10px;opacity:0;transition:opacity .6s;pointer-events:none}
#bp-pill.on{opacity:1}#bp-pill kbd,#bp kbd{font:700 11px Consolas,monospace;border:1px solid #ffb347;color:#ffb347;border-radius:3px;padding:1px 5px;margin:0 2px}
#bp{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(2,6,12,.55);opacity:0;pointer-events:none;transition:opacity .2s;font-family:Consolas,monospace;color:#e8f4f8;user-select:none}
#bp.on{opacity:1;pointer-events:auto}
#bp .bpw{padding:22px 28px 18px;background:linear-gradient(160deg,rgba(14,28,40,.96),rgba(5,9,16,.96));border:1px solid rgba(93,230,255,.5);border-radius:6px;box-shadow:0 10px 50px rgba(0,0,0,.7)}
#bp .bph{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;font-size:18px;letter-spacing:5px;color:#5de6ff}#bp .bph span{font-size:13px;letter-spacing:3px;color:#ffb347}
#bp .bpl{margin:14px 0 8px;font-size:11px;letter-spacing:4px;color:#8fd9ee}
#bp-g{display:grid;grid-template-columns:repeat(5,72px);gap:10px}#bp-h{display:flex;gap:10px}
.bp-s{position:relative;width:72px;height:72px;box-sizing:border-box;background:linear-gradient(160deg,rgba(14,28,40,.9),rgba(5,9,16,.9));border:1px solid rgba(93,230,255,.38);border-radius:3px;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s}
.bp-s:hover{border-color:#fff;transform:translateY(-2px)}.bp-s.empty{border-style:dashed;border-color:rgba(93,230,255,.2)}
.bp-s .k{position:absolute;left:5px;top:3px;font-size:10px;letter-spacing:1px;color:#8fd9ee}
.bp-s .ic{position:absolute;inset:7px 5px 5px;display:flex;align-items:center;justify-content:center}.bp-s .ic img{width:54px;height:54px;object-fit:contain;filter:drop-shadow(0 3px 5px rgba(0,0,0,.7));pointer-events:none}
.bp-s .ic em{font:700 20px Consolas,monospace;font-style:normal;color:#ffb347}
.bp-s .n{position:absolute;right:5px;bottom:3px;font:800 12px Consolas,monospace;color:#fff;text-shadow:0 1px 3px #000}
.bp-s.eq{border-color:#5de6ff;box-shadow:0 0 12px rgba(93,230,255,.55)}.bp-s.pk{border-color:#ffb347;box-shadow:0 0 16px rgba(255,179,71,.7);transform:translateY(-4px)}
#bp-i{margin-top:14px;min-height:38px;text-align:center}#bp-i b{display:block;font-size:14px;letter-spacing:3px;color:#ffb347}#bp-i span{font:12px "Segoe UI",Arial,sans-serif;letter-spacing:1px;opacity:.85}
#bp .bpf{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.14);font:11px "Segoe UI",Arial,sans-serif;letter-spacing:1px;color:#9fb6c2;text-align:center}`;

/* ---------------------------------------------- BACKPACK (15 stacks) + hotbar transfer ------------- */
class Backpack{
 constructor(s,tk){this.s=s;this.tk=tk;this.open=false;this.pick=null;this.hov=null;
  const d=document.createElement('div');d.id='bp';d.innerHTML=`<div class="bpw"><div class="bph"><b>BACKPACK</b><span id="bp-c"></span></div><div id="bp-g"></div><div class="bpl">HOTBAR</div><div id="bp-h"></div><div id="bp-i"><b>&nbsp;</b><span>&nbsp;</span></div>
<div class="bpf"><kbd>TAB</kbd> / <kbd>B</kbd> close &middot; click a slot, then another, to move or swap &middot; <kbd>SHIFT</kbd>+click quick-moves &middot; hover a pack slot and press <kbd>1</kbd>-<kbd>4</kbd> to send it to the hotbar</div></div>`;
  document.body.appendChild(d);this.el=d;
  const mk=(host,a,n)=>{for(let i=0;i<n;i++){const e=document.createElement('div');e.className='bp-s empty';e.innerHTML=`<span class="k">${a==='h'?'['+(i+1)+']':''}</span><div class="ic"></div><span class="n"></span>`;
    e.addEventListener('click',ev=>this.click(a,i,ev.shiftKey));e.addEventListener('mouseenter',()=>{this.hov={a,i};this.info(a,i)});
    e.addEventListener('mouseleave',()=>{if(this.hov&&this.hov.a===a&&this.hov.i===i)this.hov=null});host.appendChild(e)}};
  mk($('bp-g'),'b',BAG);mk($('bp-h'),'h',SLOTS);
  const pill=document.createElement('div');pill.id='bp-pill';document.body.appendChild(pill);this.pill=pill;
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement&&this.open)this.close()});this.render()}
 arr(a){return a==='b'?this.s.bag:this.s.inv}
 info(a,i){const it=this.arr(a)[i],b=$('bp-i').querySelector('b'),sp=$('bp-i').querySelector('span');
  if(!it){b.innerHTML='&nbsp;';sp.innerHTML='&nbsp;';return}const d=this.s.ITEMS_()[it.id];b.textContent=nameText(it,d);sp.textContent=d.info}
 render(){const I=this.s.ITEMS_(),ic=this.s.icons;
  for(const[a,host]of[['b',$('bp-g')],['h',$('bp-h')]]){const A=this.arr(a);[...host.children].forEach((e,i)=>{const it=A[i],im=e.querySelector('.ic'),n=e.querySelector('.n');
   e.classList.toggle('empty',!it);e.classList.toggle('pk',!!this.pick&&this.pick.a===a&&this.pick.i===i);e.classList.toggle('eq',a==='h'&&i===this.s.sel);
   if(!it){im.innerHTML='';n.textContent=''}else{const d=I[it.id],src=ic&&ic[iconKey(it)];im.innerHTML=src?`<img src="${src}" alt="">`:`<em>${d.name[0]}</em>`;n.textContent=slotText(it,d)}})}
  const used=this.s.bag.filter(Boolean).length;$('bp-c').textContent=used+' / '+BAG+' STACKS';
  this.pill.innerHTML=`<kbd>TAB</kbd> BACKPACK ${used}/${BAG}`}
 toggle(){this.open?this.close():this.show()}
 show(){const mp=this.s.mp;if(this.open||!mp.walk||(mp.sv&&mp.sv.dead)||(this.s.cr&&this.s.cr.open))return;this.open=true;this.pick=null;this.el.classList.add('on');try{document.exitPointerLock()}catch(e){}this.render()}
 close(){if(!this.open)return;this.open=false;this.pick=null;this.hov=null;this.el.classList.remove('on')}
 click(a,i,shift){const A=this.arr(a);
  if(shift){const it=A[i];if(!it)return;const B=this.arr(a==='b'?'h':'b'),j=B.findIndex(x=>!x);if(j<0){this.tk.toast('NO FREE SLOT');return}B[j]=it;A[i]=null;this.done();return}
  if(!this.pick){if(A[i]){this.pick={a,i};this.render()}return}
  const p=this.pick;this.pick=null;if(p.a===a&&p.i===i){this.render();return}this.move(p,{a,i})}
 move(p,q){const SA=this.arr(p.a),SB=this.arr(q.a),x=SA[p.i],y=SB[q.i];
  if(x&&y&&x.id===y.id&&STACKS(x.id)){y.n+=x.n;SA[p.i]=null}else{SA[p.i]=y;SB[q.i]=x}this.done()}
 numKey(n){if(!this.open)return false;if(this.hov&&this.hov.a==='b'){const h=this.hov;this.pick=null;this.move({a:'b',i:h.i},{a:'h',i:n});return true}return false}
 done(){this.s.renderSlots(false);this.s.showName();this.render();if(this.hov)this.info(this.hov.a,this.hov.i)}
}

/* ---------------------------------------------- the tasks ----------------------------------------- */
export class Tasks{
 constructor(mp,salv,heightAt){_tk=this;this.mp=mp;this.s=salv;this.hlK='';this.H=heightAt;this.stage='off';this.on=false;this.tT=0;this.t=0;this.root=null;this.ice=[];this.rocks=[];this.frags=[];this.drops=[];this.broken=0;
  this.cru=null;this.crStep='';this.pose={sw:-1,fl:-1};this.fillT=-1;this.swT=-1;this.hitDone=false;this.lt=0;this.pr='';this.lastFull=0;this.dir=new V3();this.fgeo=null;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend','<div id="tk-pr"></div><div id="tk-toasts"></div><div id="tk-ex">!</div>');
  this.bp=new Backpack(salv,this);addEventListener('mousedown',e=>this.onDown(e));addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='KeyF')this.crDeploy();else if(e.code==='KeyQ')this.useItem()})}

 /* ---------- helpers ---------- */
 rname(r){return r.dep?DEPS[r.dep].name:ROCKS[r.id].name}
 get ui(){return !!(this.bp&&this.bp.open)||!!(this.s.cr&&(this.s.cr.open||this.s.cr.admOn))}
 held(){return this.s.inv[this.s.sel]||null}
 has(id){return this.s.inv.some(x=>x&&x.id===id)||this.s.bag.some(x=>x&&x.id===id)}
 hint(id){const i=this.s.inv.findIndex(x=>x&&x.id===id);return i>=0?'[ '+(i+1)+' ]':'(open backpack [TAB])'}
 tone(f,d,v,t){this.mp.tone&&this.mp.tone(f,d,v,t)}
 toast(t,col){const h=$('tk-toasts');if(!h)return;const e=document.createElement('div');e.textContent=t;if(col)e.style.borderLeftColor=col;h.appendChild(e);while(h.children.length>5)h.removeChild(h.firstChild);setTimeout(()=>e.remove(),3300)}
 dust(x,y,z,n,sp,size,c=[.80,.55,.42]){const p=this.mp.puffs;if(!p)return;for(let k=0;k<n;k++){const a=rnd(0,6.283),v=rnd(.4,sp);p.emit(x,y,z,Math.cos(a)*v,rnd(.3,sp*.8),Math.sin(a)*v,rnd(.7,1.5),rnd(.3,.6)*size,rnd(1.4,2.6)*size,c[0],c[1],c[2],.5,.8,.2,-.2)}}
 give(id,n=1,extra){const s=this.s;
  if(STACKS(id))for(const A of[s.inv,s.bag])for(const it of A)if(it&&it.id===id){it.n+=n;this.after();return true}
  let A=s.bag,j=A.findIndex(x=>!x);if(j<0){A=s.inv;j=A.findIndex(x=>!x)}if(j<0)return false;
  A[j]=Object.assign({id,n},extra);this.after();return true}
 after(){this.s.renderSlots(false);this.bp.render()}
 alertMark(ms=7000){const e=$('tk-ex');if(!e)return;e.classList.remove('on');void e.offsetWidth;e.classList.add('on');clearTimeout(this.exT);this.exT=setTimeout(()=>e.classList.remove('on'),ms)}
 obj(html,ok,dr,quiet){if(!quiet)this.alertMark(ok?3000:7000);const o=$('sv-obj');$('sv-ot').innerHTML=html;o.classList.toggle('ok',!!ok);o.classList.add('on');$('sv-dr').style.display=dr?'':'none'}

 /* ---------- task flow ---------- */
 start(){this.on=true;this.stage='wait';this.tT=5.6}
 t1(){this.stage='t1';this.crStep='';this.obj('<b>Task 1:</b> Melt ice into drinking water.',false,true);this.mp.cap('NEW TASK  \u00b7  MELT ICE FOR WATER',2600)}
 t1done(){if(this.s.cr)this.s.cr.award('t1');this.stage='t1d';this.tT=4.5;this.obj('<b>Task 1 complete:</b> Ice melted and water collected.',true,false)}
 t2(){this.stage='t2';this.obj('<b>Task 2:</b> Use the hammer to break Mars rocks (using HMSA-accurate Martian rock/mineral types) \u00b7 <kbd>LEFT-CLICK</kbd> to swing.',false,true);this.mp.cap('NEW TASK  \u00b7  BREAK MARS ROCKS',2600);this.t2check()}
 t2check(){if(this.stage==='t2'&&this.broken>=NEED){if(this.s.cr)this.s.cr.award('t2');this.stage='t2d';this.tT=7;this.obj('<b>Task 2 complete:</b> Rock samples collected \u00b7 open the BACKPACK with <kbd>TAB</kbd>.',true,false);
  this.tone(523,.2,.06);setTimeout(()=>this.tone(784,.4,.06),160)}}

 /* ---------- world (built once per walk, centred on the debris site) ---------- */
 onWalkStart(){this.buildWorld();this.pill_(true)}
 pill_(on){this.bp.pill.classList.toggle('on',on)}
 buildWorld(){if(this.root||!this.mp.near)return;const mp=this.mp,S=mp.pk,Q=mp.pod,C={x:this.s.tx||mp.L.x,z:0},H=this.H;this.C=C;
  this.root=new THREE.Group();mp.near.add(this.root);this.fgeo=lumpGeo(new THREE.IcosahedronGeometry(1,0),.3,1);
  const BS=this.s.bnd&&this.s.bnd.base,CR=(this.s.bnd&&this.s.bnd.craters)||[],busy=(x,z,r)=>{if(BS&&Math.hypot(x-BS.x,z-BS.z)<BS.r+r)return true;for(const c of CR)if(Math.hypot(x-c.x,z-c.z)<c.r*1.3+r)return true;if(Math.hypot(x-C.x,z-C.z)<7+r)return true;if(Q&&Math.hypot(x-Q.x,z-Q.z)<4+r)return true;
   for(const p of this.ice)if(Math.hypot(x-p.x,z-p.z)<p.rad+r+1.5)return true;
   for(const c of mp.rockCols)if(Math.hypot(x-c.x,z-c.z)<c.r+r+1)return true;
   for(const k of this.rocks)if(Math.hypot(x-k.x,z-k.z)<k.r+r+1.5)return true;return false};
  const spot=(x,z,r,spread)=>{for(let i=0;i<40;i++){const a=rnd(0,6.283),d=i?rnd(2,spread)*(1+i/20):0,px=x+Math.cos(a)*d,pz=z+Math.sin(a)*d;if(!busy(px,pz,r))return[px,pz]}return[x,z]};
  /* patchy ice: five pockets around the debris area, one on the way from the capsule */
  const mx=(S.x+C.x)/2,mz=(S.z+C.z)/2,pl=Math.hypot(C.z-S.z,C.x-S.x)||1,nx=-(C.z-S.z)/pl,nz=(C.x-S.x)/pl;
  [[C.x+11,C.z+9,3.6],[C.x-13,C.z-10,4.6],[C.x+4,C.z-17,3],[C.x-20,C.z+12,3.8],[mx+nx*6,mz+nz*6,3.2]].forEach(([x,z,r],i)=>{const[px,pz]=spot(x,z,r,5);this.addIce(px,pz,r,i+1)});
  /* EXPANDED VALLEY: extra ice patches + exposed mineral veins scattered across the playable ground */
  const B=this.s.bnd||null,span=B?B.R*.66:95;
  for(let i=0;i<8;i++){const a=rnd(0,6.283),d=rnd(26,span),r=rnd(2.4,4.4),[px,pz]=spot(C.x+Math.cos(a)*d,C.z+Math.sin(a)*d,r,6);this.addIce(px,pz,r,10+i)}
  for(let i=0;i<9;i++){const a=rnd(0,6.283),d=rnd(14,span),[px,pz]=spot(C.x+Math.cos(a)*d,C.z+Math.sin(a)*d,1.2,5);this.addDeposit('vein',px,pz)}
  /* CANYON RIM: nutrient-rich, high-risk ground just inside the fractured edge */
  if(B){const place=(n,fn)=>{for(let i=0;i<n;i++){const a=(i+rnd(.1,.9))/n*6.283,e=B.edge(a),dd=e-rnd(7,24),px=B.cx+Math.cos(a)*dd,pz=B.cz+Math.sin(a)*dd;fn(px,pz,i)}};
   place(9,(px,pz)=>this.addDeposit('nitrate',px,pz));
   place(7,(px,pz)=>this.addDeposit('rare',px,pz));
   for(let i=0;i<5;i++){const a=(i+rnd(.2,.8))/5*6.283,e=B.edge(a),dd=e-rnd(11,20),px=B.cx+Math.cos(a)*dd,pz=B.cz+Math.sin(a)*dd;this.addIce(px,pz,rnd(3,4.6),30+i,true)}}
  /* HMSA-type rocks: four close to the capsule, the rest scattered around the debris site */
  const yaw=S.yaw||0;['rk_basalt','rk_olivine','rk_carbonate','rk_basalt'].forEach((id,i)=>{const a=yaw+(i-1.5)*.55,d=rnd(8,15),[px,pz]=spot(S.x+Math.cos(a)*d,S.z+Math.sin(a)*d,1,3);this.addRock(id,px,pz)});
  ['rk_clay','rk_hematite','rk_sulfate','rk_basalt','rk_olivine','rk_basalt','rk_carbonate','rk_olivine','rk_clay','rk_hematite','rk_sulfate','rk_basalt','rk_olivine','rk_carbonate','rk_basalt','rk_clay','rk_hematite','rk_sulfate','rk_olivine','rk_basalt','rk_carbonate','rk_clay'].forEach(id=>{const a=rnd(0,6.283),d=rnd(10,62),[px,pz]=spot(C.x+Math.cos(a)*d,C.z+Math.sin(a)*d,1,4);this.addRock(id,px,pz)})}
 addIce(cx,cz,rad,seed,rich){const H=this.H,half=rad*1.8,N=32,geo=new THREE.PlaneGeometry(half*2,half*2,N,N);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i)+cx,z=p.getZ(i)+cz;p.setXYZ(i,x,H(x,z)+.06,z)}geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,stdMat(0xffffff,{map:iceTex(seed*1.7),transparent:true,depthWrite:false,roughness:.22,metalness:.05,emissive:0x1b3042,emissiveIntensity:.35,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  m.receiveShadow=true;m.frustumCulled=false;m.renderOrder=1;this.root.add(m);
  const ch=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),iceMat(),40),D=new THREE.Object3D();
  for(let i=0;i<40;i++){const a=rnd(0,6.283),d=Math.pow(Math.random(),.7)*rad*.95,s=rnd(.06,.2),x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;D.position.set(x,H(x,z)+.04+s*.3,z);D.rotation.set(rnd(0,6),rnd(0,6),rnd(0,6));D.scale.set(s*1.2,s*.8,s);D.updateMatrix();ch.setMatrixAt(i,D.matrix)}
  ch.frustumCulled=false;this.root.add(ch);this.ice.push({x:cx,z:cz,rad,rich:!!rich})}
 addDeposit(kind,x,z){const D=DEPS[kind],s=rnd(.9,1.35),m=modelDeposit(kind);m.scale.setScalar(s);m.rotation.y=rnd(0,6.28);m.position.set(x,this.H(x,z)-.02,z);m.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true}});this.root.add(m);
  const col={x,z,r:s*.95,h:s*.8};this.mp.rockCols.push(col);const rk=this.rocks[this.rocks.push({id:D.frag,dep:kind,m,x,z,r:s*1.05,hp:D.hp,shake:0,base:new V3(s,s,s),col})-1];this.hlMake(rk)}
 addRock(id,x,z){const s=rnd(.55,.95),m=new THREE.Mesh(lumpGeo(new THREE.IcosahedronGeometry(1,1),.5,rnd(0,9)),rockMat(id)),base=new V3(s*1.1,s*.85,s*1.05);
  m.scale.copy(base);m.rotation.y=rnd(0,6.28);m.position.set(x,this.H(x,z)+s*.55,z);m.castShadow=m.receiveShadow=true;this.root.add(m);
  const col={x,z,r:s*.95,h:s*.75};this.mp.rockCols.push(col);const rk=this.rocks[this.rocks.push({id,m,x,z,r:s,hp:NEED,shake:0,base,col})-1];this.hlMake(rk)}
 /* ---------- COLOUR-CODED RESOURCE STONES: one thin glowing ground ring per stone, only drawn when you are close ---------- */
 hlMake(r){const k=r.dep||'rock',H=HL[k];r.hk=k;r.ph=Math.random()*6.28;const R=r.r*1.3,ring=new THREE.Mesh(new THREE.RingGeometry(R,R+.075,44),new THREE.MeshBasicMaterial({color:H.c,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,fog:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
  ring.rotation.x=-Math.PI/2;ring.position.set(r.x,this.H(r.x,r.z)+.1,r.z);ring.renderOrder=3;ring.visible=false;this.root.add(ring);r.hl=ring}
 hlDrop(r){if(!r.hl)return;this.root.remove(r.hl);r.hl.geometry.dispose();r.hl.material.dispose();r.hl=null}
 hlUpdate(dt){const P=this.mp.pk,leg=this.hlLeg||(this.hlLeg=(()=>{const st=document.createElement('style');st.textContent='#tk-leg{position:fixed;right:24px;bottom:150px;z-index:21;pointer-events:none;font:700 10px Consolas,monospace;letter-spacing:2px;color:#e9dccf;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .5s;background:rgba(6,10,18,.5);border-right:3px solid #ffb347;border-radius:3px;padding:6px 10px;text-align:right}#tk-leg.on{opacity:.9}#tk-leg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-left:7px;vertical-align:-1px;box-shadow:0 0 6px currentColor}';document.head.appendChild(st);const e=document.createElement('div');e.id='tk-leg';document.body.appendChild(e);return e})());
  if(!P||!this.root||this.stage==='off'){leg.classList.remove('on');return}const T=this.t,near={};
  for(const r of this.rocks){const q=r.hl;if(!q)continue;const d=Math.hypot(P.x-r.x,P.z-r.z);if(d>48){q.visible=false;continue}
   const rel=r.hk==='rock'?(this.broken<NEED?1:.5):1,fade=clamp((48-d)/26,0,1),pulse=.62+.28*Math.sin(T*2.6+r.ph);q.visible=true;q.material.opacity=fade*pulse*rel;if(d<24&&rel>=1)near[r.hk]=1}
  const key=Object.keys(near).sort().join();if(key!==this.hlK){this.hlK=key;leg.innerHTML=key?['rock','vein','nitrate','rare'].filter(k=>near[k]).map(k=>HL[k].t+'<i style="background:'+HL[k].s+';color:'+HL[k].s+'"></i>').join('<br>'):'';leg.classList.toggle('on',!!key)}}

 reset(){const mp=this.mp;this.hlK='';if(this.hlLeg)this.hlLeg.classList.remove('on');if(this.cru){const i=mp.rockCols.indexOf(this.cru.col);if(i>=0)mp.rockCols.splice(i,1);this.cru=null}this.crStep='';{const ex=$('tk-ex');if(ex)ex.classList.remove('on')}for(const k of this.rocks){const i=mp.rockCols.indexOf(k.col);if(i>=0)mp.rockCols.splice(i,1)}
  if(this.root){if(mp.near)mp.near.remove(this.root);this.root.traverse(o=>{if(o.geometry)o.geometry.dispose()})}
  this.root=null;this.ice=[];this.rocks=[];this.frags=[];this.drops=[];this.stage='off';this.on=false;this.broken=0;this.pose.sw=this.pose.fl=-1;this.fillT=this.swT=-1;this.pr='';
  this.bp.close();this.pill_(false);$('tk-pr').classList.remove('on');$('tk-toasts').innerHTML='';this.bp.render()}

 /* ---------- interaction: [E] on ice with the bucket ---------- */
 nearIce(){const P=this.mp.pk;if(!P)return null;let b=null,bd=1e9;for(const p of this.ice){const d=Math.hypot(P.x-p.x,P.z-p.z);if(d<=p.rad+1&&d<bd){bd=d;b=p}}return b}
 interact(){if(!this.root||!this.s.walking||this.ui||(this.mp.sv&&this.mp.sv.dead))return false;
  if(this.crNear())return this.crInteract();
  const it=this.held(),pt=this.nearIce();if(!pt||!it||it.id!=='bucket')return false;if(this.fillT>=0)return true;
  this.fillT=0;this.fillIce=pt;this.fillItem=it;this.pose.fl=0;this.tone(300,.5,.04,'triangle');return true}

 /* ---------- [Q] use the held item: feeds the HUD bars ---------- */
 useItem(){const mp=this.mp,S=mp.sv;if(!this.root||!this.s.walking||this.ui||!S||S.dead)return;const it=this.held();if(!it)return;
  if(it.id==='bucket'){if((it.w||0)<1){this.toast('BUCKET EMPTY  \u00b7  MELT SOME ICE FIRST','#ff5a4a');return}if(S.wat>=99){this.toast('NOT THIRSTY','#ffb347');return}
   it.w=Math.max(0,it.w-1);S.wat=clamp(S.wat+12,0,100);this.after();this.s.showName();this.toast('DRANK 1 L  \u00b7  +12% WATER','#5de6ff');this.tone(500,.15,.05,'sine');setTimeout(()=>this.tone(700,.18,.05,'sine'),120);return}
  const u=USE[it.id];if(!u)return;if(u.k==='rad'?S.rad<1:S[u.k]>=99.5){this.toast(u.name+' ALREADY '+(u.k==='rad'?'CLEAR':'FULL'),'#ffb347');return}
  S[u.k]=clamp(S[u.k]+u.v,0,100);if(--it.n<=0){const i=this.s.inv.indexOf(it);if(i>=0)this.s.inv[i]=null}
  this.after();this.s.showName();this.toast(u.msg,u.col);this.tone(440,.12,.05,'triangle');setTimeout(()=>this.tone(660,.2,.05,'triangle'),110);
  if(this.s.cr){if(u.k==='o2')this.s.cr.award('o2');else if(u.k==='food')this.s.cr.award('eat')}}

 /* ---------- thermal crucible: deploy / load / melt / pour ---------- */
 removeOne(id){for(const A of[this.s.bag,this.s.inv])for(let i=0;i<A.length;i++){const it=A[i];if(it&&it.id===id){if(it.n>1)it.n--;else A[i]=null;return true}}return false}
 iceCount(){let n=0;for(const A of[this.s.inv,this.s.bag])for(const it of A)if(it&&it.id==='ice')n+=it.n;return n}
 takeIce(n){let got=0;for(const A of[this.s.bag,this.s.inv])for(let i=0;i<A.length&&got<n;i++){const it=A[i];if(it&&it.id==='ice'){const u=Math.min(n-got,it.n);it.n-=u;got+=u;if(it.n<=0)A[i]=null}}return got}
 crNear(){const P=this.mp.pk,c=this.cru;return !!(c&&P&&Math.hypot(P.x-c.x,P.z-c.z)<=CRN)}
 spot(P,d0,rad){const mp=this.mp,ok=(x,z)=>{for(const c of mp.rockCols)if(Math.hypot(x-c.x,z-c.z)<c.r+rad)return false;return !(mp.pod&&Math.hypot(x-mp.pod.x,z-mp.pod.z)<3)};
  for(const[d,da]of[[d0,0],[d0,.7],[d0,-.7],[d0+.9,0],[d0,1.5],[d0,-1.5],[d0-.7,0],[d0,Math.PI]]){const a=P.yaw+da,x=P.x+Math.cos(a)*d,z=P.z+Math.sin(a)*d;if(ok(x,z))return{x,z,a}}return null}   /* first free spot around the player */
 crDeploy(){const mp=this.mp,P=mp.pk;if(!this.root||!this.s.walking||!mp.walk||this.ui||!P||(mp.sv&&mp.sv.dead))return;
  if(this.cru){if(!this.crNear()){this.toast('CRUCIBLE ALREADY DEPLOYED','#ffb347');return}
   if(this.cru.load>0||this.cru.water>0){this.toast('EMPTY THE CRUCIBLE FIRST','#ff5a4a');return}
   if(!this.give('crucible',1)){this.toast('BACKPACK FULL','#ff5a4a');return}
   this.root.remove(this.cru.g);const i=mp.rockCols.indexOf(this.cru.col);if(i>=0)mp.rockCols.splice(i,1);this.cru=null;this.crStep='';this.toast('THERMAL CRUCIBLE PACKED UP','#5de6ff');this.tone(330,.2,.05,'triangle');return}
  if(!this.has('crucible')){this.toast('NO THERMAL CRUCIBLE IN PACK','#ff5a4a');return}
  if(mp.base&&mp.base.interior){this.toast('GO OUTSIDE TO DEPLOY THE CRUCIBLE','#ffb347');return}
  const sp=this.spot(P,2.4,1.1);if(!sp){this.toast('NO ROOM HERE  \u00b7  MOVE TO CLEAR GROUND','#ff5a4a');return}
  const x=sp.x,z=sp.z;
  this.removeOne('crucible');this.after();this.s.showName();
  const g=modelCrucible();g.scale.setScalar(1.5);g.position.set(x,this.H(x,z),z);g.rotation.y=rnd(0,6.28);this.root.add(g);
  const col={x,z,r:.62,h:1};mp.rockCols.push(col);
  this.cru={g,x,z,col,state:'idle',load:0,water:0,prog:0,ph:0,temp:-60,steam:0,heatK:0};g.userData.lvl(0,0);
  this.dust(x,this.H(x,z)+.1,z,10,2,.5);this.tone(220,.25,.05,'triangle');setTimeout(()=>this.tone(330,.25,.05,'triangle'),110);
  this.toast('THERMAL CRUCIBLE DEPLOYED  \u00b7  [E] to use','#7dff9a')}
 crInteract(){const c=this.cru;
  if(c.state==='idle'){const have=this.iceCount();if(have<=0){this.toast('NO ICE IN PACK  \u00b7  HARVEST SOME FIRST','#ff5a4a');return true}
   const n=this.takeIce(Math.min(CRU_CAP,have));c.load=n;c.prog=0;c.state='melting';c.temp=-60;this.after();this.s.showName();
   this.toast('LOADED '+n+' ICE CHUNK'+(n>1?'S':'')+'  \u00b7  HEATING','#ffb347');this.tone(260,.3,.05,'sawtooth');return true}
  if(c.state==='melting'){this.toast('MELTING  \u00b7  '+Math.round(c.prog*100)+'%  \u00b7  '+c.temp.toFixed(0)+' \u00b0C','#5de6ff');return true}
  if(c.state==='done'){let b=null;for(const A of[this.s.inv,this.s.bag])for(const it of A)if(!b&&it&&it.id==='bucket'&&(it.w||0)<MAXW-.05)b=it;
   if(!b){const has=this.has('bucket');this.toast(has?'BUCKET FULL  \u00b7  '+MAXW.toFixed(1)+' L':'NO WATER BUCKET IN PACK',has?'#ffb347':'#ff5a4a');return true}
   const amt=Math.min(c.water,MAXW-(b.w||0));b.w=(b.w||0)+amt;c.water-=amt;this.after();this.s.showName();
   this.toast('+'+amt.toFixed(1)+' L WATER  \u00b7  BUCKET '+b.w.toFixed(1)+' L','#5de6ff');this.tone(659,.25,.06);setTimeout(()=>this.tone(880,.4,.06),140);
   c.g.userData.lvl(0,c.water/(CRU_CAP*L_PER_ICE));if(c.water<=.05){c.water=0;c.load=0;c.state='idle';c.prog=0;c.g.userData.lvl(0,0)}
   if(this.stage==='wait'||this.stage==='t1')this.t1done();return true}
  return true}
 crPhase(p){return p<.35?'WARMING':p<.8?'PHASE CHANGE  \u00b7  LATENT HEAT':'SUPERHEATING'}
 crTemp(p){return p<.35?-60+60*(p/.35):p<.8?0:4*((p-.8)/.2)}
 crUpdate(dt){const c=this.cru;if(!c)return;c.ph+=dt;const u=c.g.userData;
  if(c.state==='melting'){const dur=MELT_BASE+MELT_PER*c.load;c.prog=Math.min(1,c.prog+dt/dur);c.temp=this.crTemp(c.prog);c.heatK+=(1-c.heatK)*Math.min(1,dt*3);
   const mf=clamp((c.prog-.35)/.45,0,1);u.lvl(c.load/CRU_CAP*(1-mf)+.03*(c.load>0?1:0)*(1-mf),mf*c.load/CRU_CAP);
   c.steam-=dt;if(c.steam<=0&&c.prog>.2){c.steam=.28;this.dust(c.x,this.H(c.x,c.z)+1.05,c.z,1,.7,.35,[.93,.97,1])}
   if(c.prog>=1){c.state='done';c.water=c.load*L_PER_ICE;c.heatK=0;this.tone(523,.2,.06);setTimeout(()=>this.tone(784,.4,.06),160);this.toast('MELT COMPLETE  \u00b7  '+c.water.toFixed(1)+' L READY  \u00b7  [E] POUR','#5de6ff');u.lvl(0,c.water/(CRU_CAP*L_PER_ICE))}}
  else c.heatK+=(0-c.heatK)*Math.min(1,dt*2);
  u.ringHeat.material.emissiveIntensity=.1+2.2*c.heatK*(.8+.2*Math.sin(c.ph*9));
  u.lamp.material.color.setHex(c.state==='melting'?(c.prog<.35?0xff4a3a:0xffb347):c.state==='done'?0x7dff9a:0x556070)}

 /* ---------- hammer ---------- */
 onDown(e){const mp=this.mp,it=this.held();
  if(e.button!==0||!this.root||!this.s.walking||!mp.walk||this.ui||document.pointerLockElement!==mp.r.domElement||(mp.sv&&mp.sv.dead))return;
  if(!it||it.id!=='hammer'||this.swT>=0||this.fillT>=0)return;
  this.swT=0;this.hitDone=false;this.tone(150,.14,.05,'sawtooth')}
 aim(){const mp=this.mp,cp=mp.cp,cl=mp.cl,d=this.dir.subVectors(cl,cp).normalize();let best=null;
  for(const r of this.rocks){const c=r.m.position,vx=c.x-cp.x,vy=c.y-cp.y,vz=c.z-cp.z,t=vx*d.x+vy*d.y+vz*d.z;if(t<0)continue;
   const d2=vx*vx+vy*vy+vz*vz-t*t,lim=r.r*1.15+.2;if(d2>lim*lim||t-r.r>REACH)continue;if(!best||t<best.t)best={r,t}}
  return best}
 strike(){const mp=this.mp,a=this.aim(),d=this.dir,cp=mp.cp;
  if(a){this.hit(a.r);return}
  const ice=this.nearIce();
  if(ice&&d.y<-.25){const gx=cp.x+d.x*2.2,gz=cp.z+d.z*2.2;this.dust(gx,this.H(gx,gz)+.1,gz,6,2,.4,[.85,.93,1]);this.tone(900,.07,.06,'triangle');
   if(this.give('ice',1)){this.toast('+1 WATER ICE','#bfe9ff');this.s.showName()}else this.toast('BACKPACK FULL','#ff5a4a');return}
  if(d.y<-.2){const gx=cp.x+d.x*2.4,gz=cp.z+d.z*2.4,gy=this.H(gx,gz)+.1;this.dust(gx,gy,gz,4,1.6,.4);const cr=this.s.cr;if(cr)cr.sparks(gx,gy+.05,gz,10,[1,.78,.4],3.2);
   if(this.give('regolith',2)){this.toast('+2 kg REGOLITH','#d9884a');if(Math.random()<.14){const ids=Object.keys(ROCKS),id=ids[Math.floor(Math.random()*ids.length)];if(this.give(id,1))this.toast('+1 '+ROCKS[id].name+' CHIP','#ffb347')}this.s.showName()}else this.toast('BACKPACK FULL','#ff5a4a')}this.tone(90,.1,.07,'square')}
 frag(x,y,z,id,big){if(this.frags.length>120){const o=this.frags.shift();this.root.remove(o.m)}
  const m=new THREE.Mesh(this.fgeo,rockMat(id)),s=rnd(.05,big?.2:.11);m.scale.set(s*rnd(.8,1.3),s*rnd(.6,1),s*rnd(.8,1.3));m.position.set(x,y,z);m.rotation.set(rnd(0,6),rnd(0,6),rnd(0,6));m.castShadow=true;this.root.add(m);
  this.frags.push({m,v:new V3(rnd(-2.4,2.4),rnd(1.5,4.5),rnd(-2.4,2.4)),w:new V3(rnd(-8,8),rnd(-8,8),rnd(-8,8)),age:0,s})}
 hit(r){r.hp--;r.shake=.35;const p=r.m.position;if(this.s.cr)this.s.cr.sparks(p.x,p.y+.3,p.z,r.hp>0?14:30,[1,.85,.5],4.5);this.dust(p.x,p.y+.2,p.z,6,2.2,.5);this.tone(r.hp>0?210:120,.09,.09,'square');
  for(let i=0;i<(r.hp>0?3:0);i++)this.frag(p.x+rnd(-.2,.2),p.y+rnd(.1,.5),p.z+rnd(-.2,.2),r.id,false);
  if(r.hp>0){this.toast(this.rname(r)+'  \u00b7  '+r.hp+' STRIKE'+(r.hp>1?'S':'')+' LEFT');return}this.breakRock(r)}
 breakRock(r){const p=r.m.position,mp=this.mp,x=p.x,z=p.z;this.hlDrop(r);this.root.remove(r.m);r.m.traverse(o=>{if(o.geometry&&o.geometry!==this.fgeo)o.geometry.dispose()});
  this.rocks.splice(this.rocks.indexOf(r),1);const ci=mp.rockCols.indexOf(r.col);if(ci>=0)mp.rockCols.splice(ci,1);
  for(let i=0;i<11;i++)this.frag(x+rnd(-.3,.3),p.y+rnd(0,.5),z+rnd(-.3,.3),r.id,true);this.dust(x,p.y,z,16,4,1);
  const n=(r.dep?(r.dep==='vein'?4:r.dep==='nitrate'?3:2):2)+(Math.random()<.5?1:0),rk=Object.keys(ROCKS);for(let i=0;i<n;i++){const a=i/n*6.283+rnd(0,1),d=rnd(.9,1.7),did=r.dep==='nitrate'?'nitrate':r.dep==='rare'?'rare':r.dep==='vein'?rk[Math.floor(Math.random()*rk.length)]:r.id;this.drop(did,x+Math.cos(a)*d,z+Math.sin(a)*d)}
  if(!r.dep)this.broken++;this.toast(this.rname(r)+' BROKEN'+(r.dep?'':'  \u00b7  '+Math.min(this.broken,NEED)+'/'+NEED),'#7dff9a');this.tone(80,.3,.14,'sawtooth');
  if(this.stage==='t2')this.t2check()}
 drop(id,x,z){const m=modelSample(id);m.scale.setScalar(.01);m.position.set(x,this.H(x,z)+.03,z);m.traverse(o=>{o.castShadow=true});this.root.add(m);this.drops.push({id,m,x,z,age:0})}

 /* ---------- per-frame ---------- */
 update(dt,dead){this.t+=dt;if(!this.root)return;const P=this.mp.pk,H=this.H;
  if(dead||this.ui){if(this.fillT>=0){this.fillT=-1;this.pose.fl=-1}}
  if(this.on){this.tT-=dt;
   if(this.stage==='wait'&&this.tT<=0)this.t1();
   else if(this.stage==='t1d'&&this.tT<=0)this.t2();
   else if(this.stage==='t2d'&&this.tT<=0){this.stage='done';this.on=false;if(this.s.cr)this.s.cr.begin();else $('sv-obj').classList.remove('on')}}
  /* bucket scooping: harvests SOLID ICE CHUNKS into the backpack (no instant water any more) */
  if(this.fillT>=0){const it=this.held(),pt=this.fillIce;this.fillT+=dt/FILL;
   if(!it||it!==this.fillItem||Math.hypot(P.x-pt.x,P.z-pt.z)>pt.rad+2.2){this.fillT=-1;this.pose.fl=-1;this.toast('COLLECTION INTERRUPTED','#ff5a4a')}
   else{this.pose.fl=this.fillT;
    if(Math.random()<dt*7)this.dust(P.x+Math.cos(P.yaw)*1.6,H(P.x,P.z)+.15,P.z+Math.sin(P.yaw)*1.6,2,1.4,.3,[.85,.93,1]);
    if(Math.random()<dt*9&&this.s.cr)this.s.cr.sparks(P.x+Math.cos(P.yaw)*1.7,H(P.x,P.z)+.2,P.z+Math.sin(P.yaw)*1.7,1,[.8,.93,1],2);
    if(this.fillT>=1){this.fillT=-1;this.pose.fl=-1;const want=pt.rich?5:3;let got=0;for(let i=0;i<want;i++)if(this.give('ice',1))got++;this.after();this.s.showName();
     if(got>0){this.toast('+'+got+' WATER ICE CHUNK'+(got>1?'S':'')+(pt.rich?'  \u00b7  RICH SEAM':''),'#bfe9ff');this.tone(659,.2,.05);setTimeout(()=>this.tone(880,.3,.05),120)}else this.toast('BACKPACK FULL','#ff5a4a')}}}
  this.crUpdate(dt);if(this.stage==='t1')this.t1step();this.hlUpdate(dt);
  /* hammer swing */
  if(this.swT>=0){const it=this.held();if(!it||it.id!=='hammer'){this.swT=-1;this.pose.sw=-1}
   else{this.swT+=dt/SW;this.pose.sw=this.swT;if(!this.hitDone&&this.swT>=.5){this.hitDone=true;this.strike()}if(this.swT>=1){this.swT=-1;this.pose.sw=-1}}}
  /* shaking rocks */
  for(const r of this.rocks){if(r.shake>0){r.shake=Math.max(0,r.shake-dt*2);r.m.scale.copy(r.base).multiplyScalar(1+Math.sin(this.t*60)*.05*r.shake)}}
  /* flying fragments */
  for(let i=this.frags.length-1;i>=0;i--){const f=this.frags[i],m=f.m,p=m.position;f.age+=dt;f.v.y-=G*dt;p.addScaledVector(f.v,dt);m.rotation.x+=f.w.x*dt;m.rotation.y+=f.w.y*dt;m.rotation.z+=f.w.z*dt;
   const gh=H(p.x,p.z)+f.s*.4;if(p.y<gh){p.y=gh;if(Math.abs(f.v.y)>.8){f.v.y*=-.32;f.v.x*=.6;f.v.z*=.6}else{f.v.set(0,0,0)}f.w.multiplyScalar(.8)}
   if(f.age>5){const k=1-(f.age-5)/.7;if(k<=0){this.root.remove(m);this.frags.splice(i,1)}else m.scale.multiplyScalar(Math.max(.9,k))}}
  /* sample drops: pop in, bob, and fly into the backpack when walked over */
  for(let i=this.drops.length-1;i>=0;i--){const d=this.drops[i],m=d.m;d.age+=dt;m.scale.setScalar(Math.min(.65,.65*ease(clamp(d.age/.35,0,1))+.01));m.rotation.y+=dt*1.2;m.position.y=H(d.x,d.z)+.04+Math.sin(d.age*3)*.025;
   if(d.age>.7&&Math.hypot(P.x-d.x,P.z-d.z)<2){if(this.give(d.id,1)){this.toast('+1 '+(ROCKS[d.id]?ROCKS[d.id].name+' SAMPLE':DEPDROP[d.id]),d.id==='rare'?'#7fe9ff':'#ffb347');this.tone(740,.1,.05);this.root.remove(m);this.drops.splice(i,1)}
    else if(this.t-this.lastFull>2){this.lastFull=this.t;this.toast('BACKPACK FULL','#ff5a4a')}}}
  this.prompt(dead);this.arrow(P)}
 t1step(){const c=this.cru,have=this.iceCount();let k,t;
  if(c&&c.state==='done'){k='4';t='Pour the meltwater into the <b>WATER BUCKET</b> · press <kbd>E</kbd> at the crucible.'}
  else if(c&&c.state==='melting'){k='3'+Math.floor(c.prog*20);t='Melting ice · <b>'+Math.round(c.prog*100)+'%</b> · '+c.temp.toFixed(0)+' °C · '+this.crPhase(c.prog).toLowerCase()+'.'}
  else if(c&&have>0){k='2';t='Load the ice into the crucible · press <kbd>E</kbd>.'}
  else if(!c&&have>0){k='1';t='Deploy the <b>THERMAL CRUCIBLE</b> · press <kbd>F</kbd>.'}
  else{k='0';t='Harvest ice chunks · <kbd>E</kbd> with the bucket on an ice patch.'}
  if(k!==this.crStep){const quiet=k[0]==='3'&&this.crStep[0]==='3';this.crStep=k;this.obj('<b>Task 1:</b> Melt ice into drinking water.<br><span style="opacity:.85;font-weight:500">'+t+'</span>',false,true,quiet)}}
 prompt(dead){const e=$('tk-pr');let h='';
  if(!dead&&!this.ui){const it=this.held();
   const cn=this.crNear()?this.cru:null;
   if(this.fillT>=0){const p=Math.round(clamp(this.fillT,0,1)*100);h=`HARVESTING ICE &hellip; ${p}%<div class="pb"><i style="display:block;width:${p}%"></i></div>`}
   else if(cn){
    if(cn.state==='melting'){const p=Math.round(cn.prog*100);h=`MELTING &middot; ${this.crPhase(cn.prog)}<br><span style="font:600 14px Consolas,monospace;letter-spacing:2px;color:#ffb347">${cn.temp.toFixed(0)} &deg;C &nbsp;&middot;&nbsp; ${cn.load} CHUNK${cn.load>1?'S':''} &nbsp;&middot;&nbsp; ${p}%</span><div class="pb"><i style="display:block;width:${p}%;background:linear-gradient(90deg,#5de6ff,#ffb347)"></i></div>`}
    else if(cn.state==='done')h=`Press <span class="kb">[E]</span> to pour ${cn.water.toFixed(1)} L into the bucket`;
    else{const n=this.iceCount();h=n>0?`Press <span class="kb">[E]</span> to load ${Math.min(n,CRU_CAP)} ice chunk${n>1?'s':''}`:'THERMAL CRUCIBLE EMPTY &middot; harvest ice first'}}
   else{const ice=this.nearIce(),a=this.aim();
    if(!ice&&!a&&!this.cru&&it&&USE[it.id]&&this.mp.sv&&(USE[it.id].k==='rad'?this.mp.sv.rad>=1:this.mp.sv[USE[it.id].k]<96))h='Press <span class="kb">[Q]</span> to use <b>'+this.s.ITEMS_()[it.id].name+'</b>';
    else if(!ice&&!a&&!this.cru&&this.has('crucible')&&this.iceCount()>0)h='Press <span class="kb">[F]</span> to deploy the <b>THERMAL CRUCIBLE</b>';
    else if(ice){if(it&&it.id==='bucket')h='Press <span class="kb">[E]</span> to harvest ice'+(ice.rich?' <b>(RICH SEAM)</b>':'');
     else if(it&&it.id==='hammer')h='<span class="kb">LEFT-CLICK</span> to chip ice';
     else if(this.has('bucket'))h='Equip the <b>WATER BUCKET</b> '+this.hint('bucket')}
    else if(a){h=it&&it.id==='hammer'?`<span class="kb">LEFT-CLICK</span> to strike ${this.rname(a.r)}`:(this.has('hammer')?'Equip the <b>HEAVY HAMMER</b> '+this.hint('hammer'):'')}}}
  if(h&&h!==this.pr)e.innerHTML=h;this.pr=h;e.classList.toggle('on',!!h)}
 arrow(P){if(this.stage!=='t1'&&this.stage!=='t2')return;let list=this.stage==='t1'?this.ice:this.rocks.filter(r=>!r.dep);if(this.stage==='t1'&&this.cru&&(this.iceCount()>0||this.cru.load>0||this.cru.water>0))list=[this.cru];if(!list.length)return;
  let b=null,bd=1e9;for(const o of list){const d=Math.hypot(o.x-P.x,o.z-P.z);if(d<bd){bd=d;b=o}}
  const dx=b.x-P.x,dz=b.z-P.z,fx=Math.cos(P.yaw),fz=Math.sin(P.yaw),f=dx*fx+dz*fz,r=dx*-fz+dz*fx;
  $('sv-ar').style.transform=`rotate(${Math.atan2(r,f)*57.2958}deg)`;
  $('sv-di').textContent=this.stage==='t1'?(list[0]===this.cru?'THERMAL CRUCIBLE':'NEAREST ICE PATCH')+'  \u00b7  '+Math.round(bd)+' m':'ROCKS BROKEN '+Math.min(this.broken,NEED)+'/'+NEED+'  \u00b7  NEAREST  '+Math.round(bd)+' m'}
}
