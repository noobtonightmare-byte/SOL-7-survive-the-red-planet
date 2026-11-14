/* =====================================================================================================
   basebuild.js  -  geometry for the Mars Research Base (built once, in slices, as a generator)

   Two separate roots share one coordinate frame (root-local: y=0 is the top of the foundation):
     S.ext  -> added to MarsPhase.near   (hull, glass, solar field, dishes, rover ... what you see outside)
     S.int  -> its own THREE.Scene       (interior only; drawn on top of the exterior pass when you are inside,
                                          windows are real holes so the dusty Martian world shows through)
   Static meshes are merged per room / per material (Batch) so the whole base is a few dozen draw calls.
   ===================================================================================================== */
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Screen,drawTime,drawWeather,drawPower,drawComms,drawTable,mapGen} from './basescreens.js';

const PI=Math.PI,TAU=PI*2,rnd=(a,b)=>a+Math.random()*(b-a),clamp=THREE.MathUtils.clamp;
/* ---- dimensions (metres) ---- */
export const D={F:1.2,RH:8.4,RO:8.8,HW:3.4,DH:4.2,RS:10.5,RSO:10.8,OCU:3.2,
 AXT:1.1,RTI:1.7,RTO:1.9,AXM:2.0,RMI:3.0,RMO:3.2,AXA:1.1,RAI:1.9,RAO:2.15,RF:47,HATCH:5.0};
const {F,RH,RO,HW,DH,RS,RSO,OCU,AXT,RTI,RTO,AXM,RMI,RMO,AXA,RAI,RAO}=D;
export const SPOKES=[
 {id:'air',name:'AIRLOCK 1',ang:0,tl:0,len:5.0},
 {id:'liv',name:'LIVING & RESEARCH QUARTERS',ang:72,tl:6,len:18},
 {id:'gre',name:'GREENHOUSE',ang:144,tl:6,len:16},
 {id:'sto',name:'STORAGE & LOGISTICS',ang:216,tl:6,len:14},
 {id:'pow',name:'POWER STATION',ang:288,tl:11,len:10}].map(s=>{const a=s.ang*PI/180;
  return Object.assign(s,{a,dx:Math.sin(a),dz:-Math.cos(a),nx:-Math.cos(a),nz:-Math.sin(a),yaw:Math.atan2(Math.sin(a),-Math.cos(a)),s0:s.id==='air'?RH:RO+s.tl,tz:s.tl+RO-RH,regions:[],obs:[]})});
export const spoke=id=>SPOKES.find(s=>s.id===id);

/* ---------------------------------------------- tiny helpers ---------------------------------------- */
const _c=new THREE.Color(),_e=new THREE.Euler(),_q=new THREE.Quaternion(),_m=new THREE.Matrix4(),_p=new THREE.Vector3(),_s=new THREE.Vector3();
class Batch{
 constructor(){this.l={}}
 add(key,g,col,x=0,y=0,z=0,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1){const n=g.attributes.position.count,a=new Float32Array(n*3);_c.set(col);
  for(let i=0;i<n;i++){a[i*3]=_c.r;a[i*3+1]=_c.g;a[i*3+2]=_c.b}g.setAttribute('color',new THREE.BufferAttribute(a,3));
  _e.set(rx,ry,rz,'YXZ');_q.setFromEuler(_e);_m.compose(_p.set(x,y,z),_q,_s.set(sx,sy,sz));g.applyMatrix4(_m);(this.l[key]||(this.l[key]=[])).push(g)}
 box(key,col,w,h,d,x,y,z,ry=0,rx=0,rz=0){this.add(key,new THREE.BoxGeometry(w,h,d),col,x,y,z,rx,ry,rz)}
 cyl(key,col,rt,rb,h,x,y,z,rx=0,ry=0,rz=0,seg=14,open=false){this.add(key,new THREE.CylinderGeometry(rt,rb,h,seg,1,open),col,x,y,z,rx,ry,rz)}
 sph(key,col,r,x,y,z,sx=1,sy=1,sz=1,seg=10){this.add(key,new THREE.SphereGeometry(r,seg,Math.max(4,seg>>1)),col,x,y,z,0,0,0,sx,sy,sz)}
 pln(key,col,w,h,x,y,z,rx=0,ry=0,rz=0){this.add(key,new THREE.PlaneGeometry(w,h),col,x,y,z,rx,ry,rz)}
 build(parent,M,cast=true){for(const k in this.l){const g=mergeGeometries(this.l[k],false);if(!g){console.warn('merge failed',k);continue}const m=new THREE.Mesh(g,M[k]);m.castShadow=cast&&M[k].transparent!==true&&!M[k].isMeshBasicMaterial;m.receiveShadow=!M[k].isMeshBasicMaterial;parent.add(m)}this.l={}}
}
const cvs=(w,h,fn)=>{const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);return c};
const ctex=(c,rx=1,ry=1,srgb=true)=>{const t=new THREE.CanvasTexture(c);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=4;return t};
const rep=(t,a,b)=>{const c=t.clone();c.repeat.set(a,b);c.needsUpdate=true;return c};
function labelTex(text,sub,w=512,h=128,fg='#ffb347',bg='#0c1218'){return ctex(cvs(w,h,(x,W,H)=>{x.fillStyle=bg;x.fillRect(0,0,W,H);x.strokeStyle=fg;x.lineWidth=4;x.strokeRect(5,5,W-10,H-10);
 x.fillStyle=fg;x.textAlign='center';x.textBaseline='middle';x.font=`700 ${sub?H*.36:H*.42}px Consolas,monospace`;x.fillText(text,W/2,sub?H*.38:H/2);if(sub){x.font=`600 ${H*.19}px Consolas,monospace`;x.globalAlpha=.7;x.fillText(sub,W/2,H*.76)}}),1,1)}
const ring=(r0,r1)=>{const s=new THREE.Shape();s.absarc(0,0,r1,0,TAU);const h=new THREE.Path();h.absarc(0,0,r0,0,TAU,true);s.holes.push(h);return s};
const frm=(ox,oz,ry)=>({ox,oz,ry,x:(lx,lz)=>ox+lx*Math.cos(ry)+lz*Math.sin(ry),z:(lx,lz)=>oz-lx*Math.sin(ry)+lz*Math.cos(ry)});
const fbx=(b,key,col,f,w,h,d,lx,y,lz,ry=0)=>b.box(key,col,w,h,d,f.x(lx,lz),y,f.z(lx,lz),f.ry+ry);
const PAL=[0xd9742b,0x3f6fb3,0x7a8a4a,0x8a8f96,0xe4e4e0,0xc9a23a];

/* ---------------------------------------------- assets ---------------------------------------- */
function assets(S){
 const T={},M={};
 T.panIn=ctex(cvs(256,256,(x,w,h)=>{x.fillStyle='#dcd7cc';x.fillRect(0,0,w,h);for(let i=0;i<700;i++){x.fillStyle=`rgba(${110+rnd(0,60)|0},${105+rnd(0,55)|0},${95+rnd(0,50)|0},.06)`;x.fillRect(rnd(0,w),rnd(0,h),rnd(1,6),rnd(1,6))}
  x.strokeStyle='#8f8b82';x.lineWidth=4;x.strokeRect(2,2,w-4,h-4);x.strokeStyle='rgba(120,116,108,.45)';x.lineWidth=1;x.strokeRect(14,14,w-28,h-28);x.fillStyle='#7b786f';for(const[a,b]of[[8,8],[w-8,8],[8,h-8],[w-8,h-8]]){x.beginPath();x.arc(a,b,2.5,0,7);x.fill()}}));
 T.panOut=ctex(cvs(256,256,(x,w,h)=>{x.fillStyle='#ece8e0';x.fillRect(0,0,w,h);const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(200,130,90,0)');g.addColorStop(1,'rgba(200,125,85,.28)');x.fillStyle=g;x.fillRect(0,0,w,h);
  for(let i=0;i<500;i++){x.fillStyle=`rgba(${150+rnd(0,40)|0},${100+rnd(0,30)|0},${70+rnd(0,30)|0},.05)`;x.fillRect(rnd(0,w),rnd(0,h),rnd(1,3),rnd(4,26))}
  x.strokeStyle='#a9a69d';x.lineWidth=3;x.strokeRect(1.5,1.5,w-3,h-3);x.strokeStyle='rgba(150,146,138,.5)';x.lineWidth=1;x.beginPath();x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke()}));
 T.deck=ctex(cvs(256,256,(x,w,h)=>{x.fillStyle='#4d5055';x.fillRect(0,0,w,h);for(let i=0;i<1400;i++){x.fillStyle=`rgba(${rnd(20,90)|0},${rnd(22,90)|0},${rnd(25,95)|0},.18)`;x.fillRect(rnd(0,w),rnd(0,h),2,2)}
  x.strokeStyle='#26282b';x.lineWidth=3;x.strokeRect(1.5,1.5,w-3,h-3);x.beginPath();x.moveTo(w/2,0);x.lineTo(w/2,h);x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke()}));
 T.hubFloor=ctex(cvs(1024,1024,(x,w,h)=>{x.fillStyle='#4a4d52';x.fillRect(0,0,w,h);for(let i=0;i<6000;i++){x.fillStyle=`rgba(${rnd(20,90)|0},${rnd(22,90)|0},${rnd(25,95)|0},.16)`;x.fillRect(rnd(0,w),rnd(0,h),3,3)}
  x.strokeStyle='rgba(20,22,25,.8)';x.lineWidth=2;for(let i=0;i<=16;i++){x.beginPath();x.moveTo(i*64,0);x.lineTo(i*64,h);x.moveTo(0,i*64);x.lineTo(w,i*64);x.stroke()}
  x.translate(w/2,h/2);x.strokeStyle='rgba(255,179,71,.85)';x.lineWidth=7;const R=w/2/8.5;for(const r of[2.6,6.2]){x.beginPath();x.arc(0,0,r*R,0,TAU);x.stroke()}
  x.strokeStyle='rgba(255,210,80,.45)';x.lineWidth=14;x.setLineDash([36,24]);for(const a of[0,72,144,216,288]){const t=a*PI/180;x.beginPath();x.moveTo(Math.sin(t)*2.8*R,-Math.cos(t)*2.8*R);x.lineTo(Math.sin(t)*8.2*R,-Math.cos(t)*8.2*R);x.stroke()}}),1,1);
 T.gravel=ctex(cvs(256,256,(x,w,h)=>{x.fillStyle='#8a5a46';x.fillRect(0,0,w,h);for(let i=0;i<4000;i++){const v=rnd(60,150)|0;x.fillStyle=`rgba(${v+30},${v*.6|0},${v*.45|0},.5)`;x.fillRect(rnd(0,w),rnd(0,h),rnd(1,4),rnd(1,4))}}),14,14);
 T.solar=ctex(cvs(128,128,(x,w,h)=>{x.fillStyle='#14234a';x.fillRect(0,0,w,h);x.strokeStyle='#6a88c8';x.lineWidth=2;for(let i=0;i<=4;i++){x.beginPath();x.moveTo(i*32,0);x.lineTo(i*32,h);x.moveTo(0,i*32);x.lineTo(w,i*32);x.stroke()}x.strokeStyle='rgba(180,200,255,.35)';x.lineWidth=1;for(let i=0;i<8;i++){x.beginPath();x.moveTo(i*16+8,0);x.lineTo(i*16+8,h);x.stroke()}}));
 T.grate=ctex(cvs(128,128,(x,w,h)=>{x.fillStyle='#2d2f33';x.fillRect(0,0,w,h);x.strokeStyle='#6d7178';x.lineWidth=3;for(let i=0;i<=8;i++){x.beginPath();x.moveTo(i*16,0);x.lineTo(i*16,h);x.moveTo(0,i*16);x.lineTo(w,i*16);x.stroke()}}),2,6);
 T.stripe=ctex(cvs(128,128,(x,w,h)=>{x.fillStyle='#e8b923';x.fillRect(0,0,w,h);x.fillStyle='#1a1a1a';for(let i=-2;i<6;i++){x.beginPath();x.moveTo(i*32,0);x.lineTo(i*32+32,0);x.lineTo(i*32+32-h,h);x.lineTo(i*32-h,h);x.fill()}}),6,1);
 T.glow=ctex(cvs(128,128,(x,w,h)=>{const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128)}),1,1);
 const std=o=>new THREE.MeshStandardMaterial(o),bas=o=>new THREE.MeshBasicMaterial(o),vc={vertexColors:true};
 M.paint=std({...vc,roughness:.5,metalness:.04});M.paint2=std({...vc,roughness:.5,metalness:.04,side:THREE.DoubleSide});
 M.matte=std({...vc,roughness:.95,metalness:0});M.metal=std({...vc,roughness:.55,metalness:.08});
 M.hullOut=std({...vc,map:T.panOut,roughness:.55,metalness:.15});M.hullIn=std({...vc,map:T.panIn,roughness:.82,metalness:.04,side:THREE.BackSide});
 M.domeOut=std({...vc,map:rep(T.panOut,28,5),roughness:.55,metalness:.15});M.domeIn=std({...vc,map:rep(T.panIn,24,4),roughness:.82,metalness:.04,side:THREE.BackSide});
 M.glass=std({color:0x8fc4d8,transparent:true,opacity:.22,roughness:.05,metalness:.1,depthWrite:false});M.glassGre=std({color:0xa8e8b8,transparent:true,opacity:.2,roughness:.05,metalness:.1,depthWrite:false});
 M.glassIn=std({color:0x9fd0e0,transparent:true,opacity:.14,roughness:.05,metalness:.1,side:THREE.DoubleSide,depthWrite:false});M.glassGreIn=std({color:0xb8f0c4,transparent:true,opacity:.14,roughness:.05,metalness:.1,side:THREE.DoubleSide,depthWrite:false});
 M.glow=bas(vc);M.glowBack=bas({...vc,side:THREE.BackSide});M.solar=std({...vc,map:T.solar,roughness:.3,metalness:.5,side:THREE.DoubleSide});
 M.stripe=std({map:T.stripe,roughness:.7});M.grate=std({map:T.grate,roughness:.6,metalness:.4});
 M.led={G:bas({color:0x4dff88}),A:bas({color:0xffb347}),R:bas({color:0xff4a3a}),B:bas({color:0x55c8ff})};
 M.ledG=M.led.G;M.ledA=M.led.A;M.ledR=M.led.R;M.ledB=M.led.B;
 M.floor=std({map:T.deck,roughness:.8,metalness:.15});M.hubFloor=std({map:T.hubFloor,roughness:.8,metalness:.15});
 M.gravel=std({map:T.gravel,roughness:1,metalness:0});M.beacon=bas({color:0xff3a2a});M.storm=bas({color:0xffb347});
 S.A={T,M};return S.A}

/* shell of cells: a cylinder along +Z cut into (angle x length) panels so some of them can be windows */
function shell(b,key,col,{r,len,ax,nS=16,nL,skip,cut=0,z0=0}){const dt=TAU/nS,dz=len/nL;
 for(let i=0;i<nS;i++){if(cut&&((i+1)*dt<=cut||i*dt>=TAU-cut))continue;for(let j=0;j<nL;j++){if(skip&&skip(i,j))continue;
  b.add(key,new THREE.CylinderGeometry(r,r,dz,4,1,true,i*dt,dt),col,0,ax,z0+(j+.5)*dz,PI/2)}}}
/* vertical drum sectors (hub wall) - kind(i) -> 'solid' | 'door' | 'win' */
function drum(b,key,col,r,i0,kind,glass){const dt=TAU/20;
 for(let i=0;i<20;i++){const k=kind(i),t0=PI-i*dt-dt/2;const P=(y0,y1)=>b.add(key,new THREE.CylinderGeometry(r,r,y1-y0,5,1,true,t0,dt),col,0,(y0+y1)/2,0);
  if(k==='solid')P(0,HW);else if(k==='door')P(2.2,HW);else{P(0,.9);P(2.5,HW);if(glass)glass.add('glass',new THREE.CylinderGeometry(r+.01,r+.01,1.6,5,1,true,t0,dt),0xffffff,0,1.7,0)}}}
const hubDir=i=>{const a=i*TAU/20;return{dx:Math.sin(a),dz:-Math.cos(a)}};   // sector i centre direction (i=0 -> airlock, -Z)

/* ---------------------------------------------- the generator ---------------------------------------- */
export function* buildBase(S){
 const {T,M}=assets(S);S.rigs={};S.anim=[];S.screens=[];S.cols=[];S.hubObs=[];S.consoles=[];S.rooms={};S.leaf={};S.extOnly=[];   /* extOnly: backdrop/liner meshes that only exist for the outside view (hidden while the interior pass is active) */
 S.glowTex=T.glow;
 const hubB=new Batch(),hubExt=new Batch(),gExt=new THREE.Group(),gInt=new THREE.Group(),deckE=new THREE.Group(),deckI=new THREE.Group();
 deckE.position.y=F;deckI.position.y=F;S.ext.add(gExt,deckE);S.int.add(gInt,deckI);S.deckE=deckE;S.deckI=deckI;S.fndGroup=gExt;
 const spr=(par,x,y,z,size,col,op=.8)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:T.glow,color:col,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:op,fog:false}));s.position.set(x,y,z);s.scale.setScalar(size);par.add(s);return s};
 const sign=(par,tex,w,h,x,y,z,ry,rx=0)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));m.position.set(x,y,z);m.rotation.set(rx,ry,0,'YXZ');par.add(m);return m};
 const screenMesh=(par,scr,w,h,x,y,z,ry,room)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:scr.tex,toneMapped:false}));m.position.set(x,y,z);m.rotation.y=ry;par.add(m);scr.room=room;S.screens.push(scr);return m};
 const mini={A:new Screen(256,160,S.draw.map,4),B:new Screen(256,160,S.draw.graph,10),C:new Screen(256,160,S.draw.log,6)};mini.A.room=mini.B.room=mini.C.room='*';S.screens.push(mini.A,mini.B,mini.C);
 M.scrA=new THREE.MeshBasicMaterial({map:mini.A.tex,toneMapped:false});M.scrB=new THREE.MeshBasicMaterial({map:mini.B.tex,toneMapped:false});M.scrC=new THREE.MeshBasicMaterial({map:mini.C.tex,toneMapped:false});
 const scrKey=['scrA','scrB','scrC'];
 yield;

 /* ======================================== HUB: exterior ======================================== */
 {const yc=HW+DH-RS,thM=Math.asin(RO/RSO),thO=Math.asin(OCU/RS),thOO=Math.asin(OCU/RSO);
  const b=hubExt,glass=new Batch();
  b.cyl('hullOut',0xdcd8d0,RO+.6,RO+.6,F,0,-F/2,0,0,0,0,64);                       // plinth under the hub
  drum(b,'hullOut',0xffffff,RO,0,i=>i%4===0?'door':(i%4===2?'win':'solid'),glass);   // door every 72 deg, window between
  b.add('domeOut',new THREE.SphereGeometry(RSO,64,16,0,TAU,thOO,thM-thOO),0xffffff,0,yc,0);
  b.cyl('paint',0xb9b5ad,RO+.12,RO+.12,.34,0,HW,0,0,0,0,64);                         // cornice
  for(let k=0;k<12;k++){const a=k*TAU/12;b.add('paint',new THREE.SphereGeometry(RSO+.05,2,16,a,.05,thOO,thM-thOO),0xcfcac2,0,yc,0)}   // dome ribs
  b.add('metal',new THREE.TorusGeometry(OCU+.1,.12,8,40),0x8d9298,0,yc+RSO*Math.cos(thOO),0,PI/2);
  glass.add('glass',new THREE.SphereGeometry(RSO+.04,32,8,0,TAU,0,thOO),0xffffff,0,yc,0);
  /* masts / whips on the dome */
  for(const[x,z,h]of[[3.6,3,3.2],[-3,4.5,2.4],[0,-5,1.8]]){b.cyl('metal',0x9aa0a6,.03,.05,h,x,yc+Math.sqrt(Math.max(RSO*RSO-x*x-z*z,0))+h/2-.2,z)}
  /* warm interior glow seen through the windows (front-face only, so invisible from inside) */
  for(let i=2;i<20;i+=4){const t0=PI-i*TAU/20-TAU/40;glass.add('glowOut',new THREE.CylinderGeometry(RO-.25,RO-.25,1.6,5,1,true,t0,TAU/20),0xffc27a,0,1.7,0)}
  hubExt.glass=glass;
  S.hubGlow=new THREE.Mesh(new THREE.CylinderGeometry(OCU,OCU,.01,24),new THREE.MeshBasicMaterial({color:0xffc890}));S.hubGlow.position.set(0,yc+RSO*Math.cos(thOO)-.35,0);S.hubGlow.visible=false;deckE.add(S.hubGlow);}
 yield;

 /* ======================================== HUB: interior ======================================== */
 {const b=hubB,yc=HW+DH-RS,thM=Math.asin(RH/RS),thO=Math.asin(OCU/RS);
  /* floor + shell */
  const fl=new THREE.Mesh(new THREE.CircleGeometry(RH+.1,64),M.hubFloor);fl.rotation.x=-PI/2;fl.position.y=.01;fl.receiveShadow=false;deckI.add(fl);
  const ig=new Batch();drum(b,'hullIn',0xffffff,RH,0,i=>i%4===0?'door':(i%4===2?'win':'solid'),ig);   // ig = inside glass panes
  b.add('domeIn',new THREE.SphereGeometry(RS,64,16,0,TAU,thO,thM-thO),0xffffff,0,yc,0);
  b.add('metal',new THREE.TorusGeometry(OCU,.14,8,40),0x9aa0a6,0,yc+RS*Math.cos(thO),0,PI/2);
  /* warm LED strips: ceiling ring, skirting ring, dome ribs, oculus ring */
  b.add('glowBack',new THREE.CylinderGeometry(RH-.05,RH-.05,.12,64,1,true),0xffc27a,0,HW-.2,0);
  b.add('glowBack',new THREE.CylinderGeometry(RH-.04,RH-.04,.06,64,1,true),0xff9a50,0,.12,0);
  for(let k=0;k<12;k++){const a=k*TAU/12;b.add('glowBack',new THREE.SphereGeometry(RS-.06,2,14,a,.025,thO+.02,thM-thO-.05),0xffd7a0,0,yc,0)}
  b.add('glow',new THREE.TorusGeometry(OCU-.1,.05,6,48),0xffe2b0,0,yc+RS*Math.cos(thO)-.05,0,PI/2);
  /* door frames + signs (5 doors) */
  const dn=['AIRLOCK 1','LIVING & RESEARCH','GREENHOUSE','STORAGE & LOGISTICS','POWER STATION'];
  SPOKES.forEach((sp,k)=>{const R=RH-.12,fr=frm(sp.dx*R,sp.dz*R,sp.yaw);
   fbx(b,'metal',0x6f757c,fr,.3,2.4,.3,-1.5,1.2,0);fbx(b,'metal',0x6f757c,fr,.3,2.4,.3,1.5,1.2,0);fbx(b,'metal',0x6f757c,fr,3.3,.3,.3,0,2.35,0);
   fbx(b,'ledA',0xffb347,fr,.05,2.0,.04,-1.33,1.2,-.08);fbx(b,'ledA',0xffb347,fr,.05,2.0,.04,1.33,1.2,-.08);
   sign(deckI,labelTex(dn[k],'',512,96),2.6,.5,sp.dx*(RH-.2),2.95,sp.dz*(RH-.2),sp.yaw+PI)});
  /* hub-level collision: central table + console arc + window benches */
  S.hubObs.push([0,0,2.3]);
  /* tactical holo-table */
  {b.cyl('metal',0x2b3036,.8,1.1,.9,0,.45,0,0,0,0,24);b.cyl('metal',0x2a2e33,1.95,1.95,.14,0,.97,0,0,0,0,48);b.cyl('glow',0x55e6ff,1.99,1.99,.05,0,.99,0,0,0,0,48);
   const tm=new Screen(512,512,drawTable(S.mapImg),4);tm.room='hub';S.screens.push(tm);S.tableScr=tm;
   const mp=new THREE.Mesh(new THREE.CircleGeometry(1.82,48),new THREE.MeshBasicMaterial({map:tm.tex,toneMapped:false}));mp.rotation.x=-PI/2;mp.position.y=1.05;deckI.add(mp);
   const sw=new THREE.Mesh(new THREE.CircleGeometry(1.8,32,0,.55),new THREE.MeshBasicMaterial({color:0x55e6ff,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));sw.rotation.x=-PI/2;sw.position.y=1.07;deckI.add(sw);
   const holo=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.8,1.2,32,1,true),new THREE.MeshBasicMaterial({color:0x55e6ff,transparent:true,opacity:.06,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));holo.position.y=1.7;deckI.add(holo);
   const wf=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(.55,14,10)),new THREE.LineBasicMaterial({color:0x7fe8ff,transparent:true,opacity:.7}));wf.position.y=1.85;deckI.add(wf);
   S.anim.push((dt,t)=>{sw.rotation.z=-t*1.4;wf.rotation.y=t*.35;holo.material.opacity=.05+.025*Math.sin(t*3)})}
  /* wall display wall: 4 big screens flanking the windows */
  const big=[[7,'time',drawTime,'TIME'],[9,'weather',drawWeather,'WEATHER'],[11,'power',drawPower,'POWER'],[13,'comms',drawComms,'COMMS']];
  for(const[i,id,fn]of big){const th=PI-i*TAU/20,R=RH-.07,x=Math.sin(th)*R,z=Math.cos(th)*R,ry=th+PI,sc=new Screen(1024,576,fn,5);sc.room='hub';sc.tag=id;
   const fr=frm(x,z,ry);fbx(b,'metal',0x1e2226,fr,2.55,1.5,.09,0,2.0,0);screenMesh(deckI,sc,2.4,1.35,fr.x(0,.06),2.0,fr.z(0,.06),ry,'hub');
   fbx(b,'ledG',0x4dff88,fr,.06,.06,.03,-1.15,1.2,.07);fbx(b,'ledA',0xffb347,fr,.06,.06,.03,-1.05,1.2,.07);
   sign(deckI,labelTex(id.toUpperCase(),'',256,56,'#5de6ff'),.9,.2,fr.x(0,.07),1.12,fr.z(0,.07),ry)}
  /* operator consoles: 5 workstations in an arc, operators face the north windows */
  for(let k=0;k<3;k++){const a=(158+k*22)*PI/180,dx=Math.sin(a),dz=-Math.cos(a),px=dx*5.5,pz=dz*5.5,ry=Math.atan2(-dx,-dz),f=frm(px,pz,ry);
   fbx(b,'metal',0x2c3238,f,2.0,.72,.72,0,.36,0);fbx(b,'metal',0x3a4149,f,2.1,.06,.8,0,.75,0);                                    // desk body + top
   fbx(b,'metal',0x15181b,f,.55,.025,.2,0,.79,.22);                                                                              // keyboard
   for(let q=0;q<9;q++)fbx(b,'metal',0x2a2f35,f,.04,.012,.04,-.22+q*.055,.805,.2);
   fbx(b,'metal',0x15181b,f,.12,.02,.1,.5,.79,.24);                                                                              // trackpad
   for(const[mx,mz,mr,w]of[[-.62,-.12,.35,.62],[0,-.2,0,.7],[.62,-.12,-.35,.62]]){fbx(b,'metal',0x1b1e22,f,w+.06,.4,.04,mx,1.18,mz,mr);b.pln(scrKey[(k+(mx>0?1:mx<0?2:0))%3],0xffffff,w,.34,f.x(mx,mz+.025*Math.cos(mr)),1.18,f.z(mx,mz+.025*Math.cos(mr)),0,f.ry+mr);fbx(b,'metal',0x1b1e22,f,.06,.4,.06,mx,.95,mz-.03)}
   for(let q=0;q<6;q++)fbx(b,['ledG','ledA','ledB'][(k+q)%3],0xffffff,f,.05,.03,.03,-.8+q*.3,.47,.37);                              // status lights
   const cf=frm(px-dx*1.15,pz-dz*1.15,ry+PI);fbx(b,'matte',0x2a3a4c,cf,.5,.08,.5,0,.5,0);fbx(b,'matte',0x2a3a4c,cf,.5,.55,.08,0,.8,-.22);b.cyl('metal',0x6a7076,.03,.03,.5,cf.ox,.25,cf.oz);b.cyl('metal',0x6a7076,.25,.25,.04,cf.ox,.03,cf.oz,0,0,0,10);
   S.hubObs.push([px,pz,.9]);S.consoles.push({x:px,z:pz})}   /* NEW: console positions for the storm-telemetry mini-game */
  /* window benches, plants, cabinets */
  for(const i of[2,6,14,18]){const d=hubDir(i),f=frm(d.dx*7.55,d.dz*7.55,Math.atan2(-d.dx,-d.dz));fbx(b,'matte',0x3b4654,f,2.0,.45,.5,0,.22,0);fbx(b,'matte',0x4e5c6e,f,2.0,.12,.46,0,.5,0);S.hubObs.push([d.dx*7.3,d.dz*7.3,1.0]);
   const pf=frm(d.dx*7.9+d.dz*1.5,d.dz*7.9-d.dx*1.5,0);b.cyl('matte',0x6a4a3a,.22,.17,.4,pf.ox,.2,pf.oz);b.sph('matte',0x3f8a45,.3,pf.ox,.7,pf.oz,1,1.3,1,8);S.hubObs.push([pf.ox,pf.oz,.55])}
  for(const i of[1,5,15,19]){const d=hubDir(i),f=frm(d.dx*7.95,d.dz*7.95,Math.atan2(-d.dx,-d.dz));fbx(b,'metal',0x56606b,f,1.5,1.9,.4,0,.95,0);fbx(b,'ledG',0xffffff,f,.05,.05,.03,.55,1.6,.22);fbx(b,'matte',0xd23a2a,f,.4,.3,.08,-.3,1.5,.22);S.hubObs.push([d.dx*7.6,d.dz*7.6,.9])}
  /* window frames: sill, head and jambs close the wall cavity so no sky / hull slivers show at the edges */
  for(let i=2;i<20;i+=4){const d=hubDir(i),fr=frm(d.dx*8.6,d.dz*8.6,Math.atan2(-d.dx,-d.dz));
   fbx(b,'metal',0x9aa0a6,fr,2.76,.09,.5,0,.87,0);fbx(b,'metal',0x9aa0a6,fr,2.76,.09,.5,0,2.53,0);
   for(const sx of[-1,1])fbx(b,'metal',0x9aa0a6,fr,.07,1.62,.5,sx*1.37,1.7,0)}
  ig.add('glass',new THREE.CircleGeometry(OCU+.05,32),0xffffff,0,yc+RS*Math.cos(thO)+.04,0,-PI/2);   // oculus glazing seen from below
  ig.build(deckI,{glass:M.glassIn},false);
  /* storm beacon on the north rafters */
  b.cyl('metal',0x4a5058,.18,.22,.2,0,HW+.6,5.6);S.stormBeacon=new THREE.Mesh(new THREE.SphereGeometry(.2,12,8),M.storm);S.stormBeacon.position.set(0,HW+.8,5.6);deckI.add(S.stormBeacon);
  S.anim.push((dt,t)=>{const on=S.sim.s.alert>0&&Math.sin(t*(S.sim.s.alert===2?8:3))>0;M.storm.color.setHex(on?0xffa020:0x3a2a14)});
  S.rigs.hub=[[0,5.2,0,0xffd2a0,150],[4,4.2,0,0xffc890,60],[-4,4.2,0,0xffc890,60],[0,4.2,4,0xffc890,60],[0,4.2,-4,0xffc890,60]];
  b.build(deckI,M,false);S.rooms.hub=deckI;}
 yield;

 /* ======================================== mesh the hub exterior ======================================== */
 hubExt.build(deckE,M,true);{const gl=hubExt.glass;gl.build(deckE,{...M,glass:M.glass,glowOut:M.glow},false)}
 yield;

 /* ======================================== SPOKES ======================================== */
 for(const sp of SPOKES){
  if(sp.id==='air')buildAirlock(S,sp,M,T,{Batch,shell,spr,sign,frm,fbx,labelTex});
  else{buildTunnel(S,sp,M,{Batch,frm,fbx,labelTex,sign});yield;buildModule(S,sp,M,T,{Batch,shell,frm,fbx,spr,sign,labelTex,screenMesh,scrKey,mini});}
  yield}

 /* ======================================== SITE (outside) ======================================== */
 buildSite(S,M,T,{Batch,frm,fbx,spr,sign,labelTex});
 S.hubObsDone=true;yield;
 buildFoundation(S);
 /* interior rigs for tunnels/rooms are set inside the builders; interior ambient lives in S.intScene */
 yield}

/* ---------------------------------------------- foundation (rebuilt if the site changes) ---------------------------------------------- */
export function buildFoundation(S){const {M}=S.A,g=S.fndGroup;if(S.fnd){g.remove(S.fnd);S.fnd.traverse(o=>{if(o.geometry)o.geometry.dispose()})}
 const dep=Math.max(1.2,S.site.depth),grp=new THREE.Group();
 const top=new THREE.Mesh(new THREE.CylinderGeometry(D.RF,D.RF,dep,64),[new THREE.MeshStandardMaterial({map:S.A.T.gravel,roughness:1}),M.gravel,M.gravel]);
 top.position.y=-dep/2;top.receiveShadow=true;
 const skirt=new THREE.Mesh(new THREE.CylinderGeometry(D.RF,D.RF+dep*1.8,dep,64,1,true),M.gravel);skirt.position.y=-dep/2;skirt.receiveShadow=true;
 top.material=[M.gravel,M.gravel,M.gravel];grp.add(skirt);
 const disc=new THREE.Mesh(new THREE.CircleGeometry(D.RF,64),M.gravel);disc.rotation.x=-PI/2;disc.position.y=.01;disc.receiveShadow=true;grp.add(disc);
 S.fnd=grp;g.add(grp)}

/* ======================================== TUNNEL ======================================== */
function buildTunnel(S,sp,M,{Batch,frm,fbx}){
 const L=sp.tz,gE=new THREE.Group(),gI=new THREE.Group(),bE=new Batch(),bI=new Batch();
 for(const g of[gE,gI]){g.position.set(sp.dx*RH,0,sp.dz*RH);g.rotation.y=sp.yaw;}
 S.deckE.add(gE);S.deckI.add(gI);S.rooms[sp.id+'_t']=gI;
 /* interior */
 bI.add('hullIn',new THREE.CylinderGeometry(RTI,RTI,L+.2,24,1,true),0xffffff,0,AXT,L/2,PI/2);
 const fl=new THREE.Mesh(new THREE.PlaneGeometry(2*Math.sqrt(RTI*RTI-AXT*AXT),L+.2),M.floor);fl.rotation.x=-PI/2;fl.position.set(0,.01,L/2);gI.add(fl);
 for(let z=1;z<L;z+=2.2)bI.add('metal',new THREE.TorusGeometry(RTI-.02,.045,6,28),0x9aa0a6,0,AXT,z);
 for(const sx of[-1,1]){bI.box('glow',0xffd7a0,.07,.035,L-.6,sx*.9,AXT+1.5,L/2,0,0,-sx*.5);bI.box('glow',0x9fd8ff,.04,.03,L-.6,sx*1.25,.12,L/2);
  bI.cyl('paint',sx<0?0xd98a3a:0x4a8ad0,.055,.055,L-.3,sx*1.2,.62,L/2,PI/2)}
 /* region + door frame at the module end is created by the module (start wall) */
 sp.regions.push({s0:RH-1.0,s1:RH+L+.3,hw:.95});
 S.rigs[sp.id+'_t']=[[0,AXT+1.4,L*.28,0xffc890,26,sp],[0,AXT+1.4,L*.72,0xffc890,26,sp]];
 /* exterior */
 bE.add('hullOut',new THREE.CylinderGeometry(RTO,RTO,L-.05,24,1,true),0xffffff,0,AXT,(L+.05)/2,PI/2);   // starts inside the hub wall thickness, ends at the module cap
 for(let z=.6;z<L;z+=1.0)bE.add('paint',new THREE.TorusGeometry(RTO+.02,.06,6,24),0xd9d5cc,0,AXT,z);
 bE.box('metal',0x4d545c,.5,.12,L-.6,0,AXT+RTO+.08,L/2);bE.box('matte',0x2b2f34,.12,.12,L,.9,AXT+RTO*.85,L/2,0,0,-.4);
 for(const z of[L*.3,L*.7]){bE.box('metal',0x62696f,1.5,.55,.5,0,-F+.275,z);bE.box('metal',0x62696f,2.4,.12,.7,0,-F+.06,z)}                     // support piers
 bE.build(gE,M,true);bI.build(gI,M,false);
 /* outside collision (capsule) */
 S.cols.push({ax:sp.dx*RO,az:sp.dz*RO,bx:sp.dx*(RO+L),bz:sp.dz*(RO+L),r:RTO+.45})}

/* ======================================== AIRLOCK ======================================== */
function buildAirlock(S,sp,M,T,{Batch,shell,spr,sign,frm,fbx,labelTex}){
 const L=D.HATCH,gE=new THREE.Group(),gI=new THREE.Group(),bE=new Batch(),bI=new Batch(),bL=new Batch(),gL=new THREE.Group();gE.add(gL);S.extOnly.push(gL);
 for(const g of[gE,gI]){g.position.set(sp.dx*RH,0,sp.dz*RH);g.rotation.y=sp.yaw}
 S.deckE.add(gE);S.deckI.add(gI);S.rooms.air=gI;
 const hw=Math.sqrt(RAI*RAI-AXA*AXA);
 /* interior */
 bI.add('hullIn',new THREE.CylinderGeometry(RAI,RAI,L,24,1,true),0xffffff,0,AXA,L/2,PI/2);
 const fl=new THREE.Mesh(new THREE.PlaneGeometry(hw*2,L),M.floor);fl.rotation.x=-PI/2;fl.position.set(0,.01,L/2);gI.add(fl);
 const st=new THREE.Mesh(new THREE.PlaneGeometry(hw*1.2,1.2),M.stripe);st.rotation.x=-PI/2;st.position.set(0,.02,L-.9);gI.add(st);
 for(const sx of[-1,1]){bI.box('glow',0xfff0d8,.07,.035,L-.4,sx*.8,AXA+1.55,L/2,0,0,-sx*.5);
  bI.box('matte',0x3b4654,.4,.45,3.0,sx*1.3,.22,2.3);bI.box('matte',0x4e5c6e,.42,.1,3.0,sx*1.3,.5,2.3)}
 S.rigs.air=[[0,AXA+1.4,1.3,0xffe0c0,38,sp],[0,AXA+1.4,3.7,0xffe0c0,38,sp]];
 /* hatch frames: inner (hub) door and outer hatch */
 for(const z of[.12,L-.1]){bI.add('metal',new THREE.TorusGeometry(RAI-.12,.14,8,32),0x6f757c,0,AXA,z);}
 bI.box('ledA',0xffffff,.1,.1,.05,hw-.2,AXA+1.0,L-.2);bI.box('ledR',0xffffff,.1,.1,.05,-(hw-.2),AXA+1.0,L-.2);
 /* suits hung on the walls */
 for(const[sx,z]of[[-1,1.4],[1,3.4]])suit(bI,sx*1.5,z,sx<0?PI/2:-PI/2);
 bI.box('metal',0x20252b,.9,.6,.08,-.9,1.6,L-.12);
 /* leaves (animated): outer hatch in both scenes, inner door in the interior scene */
 const lg=new THREE.BoxGeometry(2.3,2.3,.14),lm=new THREE.MeshStandardMaterial({color:0xb8bcc2,roughness:.45,metalness:.5});
 const outI=new THREE.Mesh(lg,lm),outE=new THREE.Mesh(lg,lm),inn=new THREE.Mesh(lg,lm);
 outI.position.set(0,AXA,L);outE.position.set(0,AXA,L);inn.position.set(0,AXA,.2);gI.add(outI,inn);gE.add(outE);
 const wm=new THREE.Mesh(new THREE.TorusGeometry(.35,.05,8,20),new THREE.MeshStandardMaterial({color:0xd9a23a,metalness:.5,roughness:.4}));wm.position.set(0,AXA,L-.1);gI.add(wm);
 S.leaf={outI,outE,inn,baseY:AXA};
 sign(gI,labelTex('EVA  ·  OUTER HATCH','CYCLE FROM CONSOLE [E]',512,128,'#ff7a5a'),1.2,.3,.9,AXA+.9,L-.14,PI);
 sp.regions.push({s0:RH-1.0,s1:RH+L-.7,hw:1.0});
 sp.obs.push([RH+.6,RH+L-1.0,-1.6,-.98],[RH+.6,RH+L-1.0,.98,1.6]);
 /* exterior shell */
 bE.add('hullOut',new THREE.CylinderGeometry(RAO,RAO,L+.15,24,1,true),0xffffff,0,AXA,(L+.15)/2+.05,PI/2);
 bE.add('paint',new THREE.TorusGeometry(RAO,.1,8,32),0xe8a23a,0,AXA,L);bE.add('paint',new THREE.TorusGeometry(RAO,.1,8,32),0xe8a23a,0,AXA,L-1.2);
 bL.add('hullIn',new THREE.CylinderGeometry(RAI-.05,RAI-.05,L-.2,20,1,true),0xcfc9bd,0,AXA,L/2,PI/2);      // see-through-proof liner for when the hatch is open
 bL.pln('paint2',0xcfc9bd,hw*2,L-.2,0,.02,L/2,-PI/2);bL.pln('paint2',0x4a4f55,3.4,3.4,0,AXA,.35,0);
 /* porch + ramp + rails + lights */
 bE.box('metal',0x4d545c,3.6,.25,2.0,0,-.12,L+1.05);for(const sx of[-1,1])for(const z of[L+.25,L+1.85])bE.box('metal',0x4d545c,.16,.96,.16,sx*1.6,-.72,z);   // porch legs reach the ground
 const pk=new THREE.Mesh(new THREE.PlaneGeometry(3.2,2.0),M.grate);pk.rotation.x=-PI/2;pk.position.set(0,.01,L+1.05);gE.add(pk);
 const rl=Math.hypot(7,F),rp=new THREE.Mesh(new THREE.PlaneGeometry(3.2,rl),M.grate);rp.rotation.x=-PI/2+Math.atan2(F,7);rp.position.set(0,-F/2,L+2.05+3.5);gE.add(rp);
 for(const sx of[-1,1])bE.cyl('metal',0xe8a23a,.04,.04,2.0,sx*1.7,.45,L+1.05,PI/2);
 for(const sx of[-1,1])for(const z of[L+.2,L+1.9])bE.cyl('metal',0xc9ccd0,.04,.04,.9,sx*1.7,.45,z);
 bE.box('ledA',0xffffff,.3,.12,.1,0,AXA+RAO+.05,L+.15);
 const lamp=spr(gE,0,AXA+RAO+.25,L+.3,3,0xffd9a0,.7);S.anim.push((dt,t)=>{lamp.material.opacity=.55+.15*Math.sin(t*2)});
 sign(gE,labelTex('AIRLOCK 1','EVA ENTRY',512,128),1.4,.35,0,AXA+RAO-.05,L+.12,PI);
 bE.build(gE,M,true);bI.build(gI,M,false);
 bL.build(gL,M,false);
 S.cols.push({ax:sp.dx*RH,az:sp.dz*RH,bx:sp.dx*(RH+L-2.8),bz:sp.dz*(RH+L-2.8),r:RAO+.5});
 S.airlockInfo={hatchS:RH+L,porchS:RH+L+2.05,rampEnd:RH+L+2.05+7}}

/* EVA suit on a stand/hook, facing +x after rotation ry */
function suit(b,x,z,ry){const f=frm(x,z,ry),W=0xeeeeea;
 fbx(b,'paint',W,f,.28,.6,.46,0,1.25,0);fbx(b,'paint',0xd9742b,f,.29,.12,.47,0,1.38,0);fbx(b,'paint',0xdcdcd6,f,.18,.5,.4,-.2,1.25,0);   // torso, stripe, pack
 b.sph('paint',W,.17,f.x(0,0),1.74,f.z(0,0),1,1,1,10);b.sph('metal',0xc8a24a,.12,f.x(.07,0),1.74,f.z(.07,0),.6,.8,1.1,8);
 for(const s of[-1,1]){fbx(b,'paint',W,f,.16,.72,.17,0,.62,s*.11);fbx(b,'matte',0x3a3d42,f,.2,.14,.2,.03,.08,s*.11);fbx(b,'paint',W,f,.12,.5,.12,0,1.28,s*.27,.0);}}

/* ======================================== MODULES ======================================== */
function buildModule(S,sp,M,T,{Batch,shell,frm,fbx,spr,sign,labelTex,screenMesh,scrKey,mini}){
 const L=sp.len,id=sp.id,gE=new THREE.Group(),gI=new THREE.Group(),bE=new Batch(),bI=new Batch(),gl=new Batch();
 for(const g of[gE,gI]){g.position.set(sp.dx*sp.s0,0,sp.dz*sp.s0);g.rotation.y=sp.yaw}
 S.deckE.add(gE);S.deckI.add(gI);S.rooms[id]=gI;
 const nL=Math.round(L/1.8),hwF=Math.sqrt(RMI*RMI-AXM*AXM),cut=Math.acos(AXM/RMI);
 const win=(id==='liv')?((i,j)=>(i===4||i===12)&&j%2===1):(id==='gre')?((i,j)=>i===7||i===8):null;
 const glassKey=id==='gre'?'glassGre':'glass';
 /* ---- interior shell, floor, end walls ---- */
 const glI=new Batch();
 shell(bI,'hullIn',0xffffff,{r:RMI,len:L,ax:AXM,nL,cut,skip:win?((i,j)=>{if(win(i,j)){glI.add(glassKey+'In',new THREE.CylinderGeometry(RMI+.01,RMI+.01,L/nL,4,1,true,i*TAU/16,TAU/16),0xffffff,0,AXM,(j+.5)*L/nL,PI/2);return true}return false}):null});
 const fl=new THREE.Mesh(new THREE.PlaneGeometry(hwF*2,L),M.floor);fl.rotation.x=-PI/2;fl.position.set(0,.01,L/2);gI.add(fl);
 {const sh=new THREE.Shape();sh.absarc(0,AXM,RMI-.01,0,TAU);const h=new THREE.Path();h.absarc(0,AXT,RTI,0,TAU,true);sh.holes.push(h);bI.add('paint2',new THREE.ShapeGeometry(sh,32),0xcfc9bd,0,0,.02);   // start wall with tunnel opening
  const e=new THREE.CircleGeometry(RMI-.01,36);bI.add('paint2',e,0xcfc9bd,0,AXM,L-.02,0,PI);}
 /* tunnel mouth frame */
 bI.add('metal',new THREE.TorusGeometry(RTI+.02,.12,8,32),0x6f757c,0,AXT,.05);
 for(const sx of[-1,1]){bI.box('glow',0xffd7a0,.08,.04,L-1,sx*1.17,AXM+RMI*Math.cos(.4)-.02,L/2,0,0,sx*.4);bI.box('glow',0x9fd8ff,.05,.03,L-1,sx*(hwF-.08),.1,L/2)}
 for(let z=2.4;z<L;z+=3.6)bI.add('metal',new THREE.TorusGeometry(RMI-.03,.06,6,36),0x9aa0a6,0,AXM,z);
 /* ---- exterior shell + caps + accents ---- */
 shell(bE,'hullOut',0xffffff,{r:RMO,len:L,ax:AXM,nL,skip:win?((i,j)=>{if(win(i,j)){gl.add(glassKey,new THREE.CylinderGeometry(RMO+.01,RMO+.01,L/nL,4,1,true,i*TAU/16,TAU/16),0xffffff,0,AXM,(j+.5)*L/nL,PI/2);return true}return false}):null});
 bE.add('hullOut',new THREE.SphereGeometry(RMO,28,10,0,TAU,0,PI/2),0xffffff,0,AXM,L,PI/2);
 {const sh=new THREE.Shape();sh.absarc(0,AXM,RMO-.005,0,TAU);const h=new THREE.Path();h.absarc(0,AXT,RTO+.01,0,TAU,true);sh.holes.push(h);bE.add('hullOut',new THREE.ShapeGeometry(sh,28),0xffffff,0,0,.01,0,PI)}   // start cap WITH the tunnel opening
 const acc={liv:0xe8742a,gre:0x4fae5a,sto:0x3f78c8,pow:0xd9362b}[id];
 for(const z of[.7,L-.7])bE.add('paint',new THREE.TorusGeometry(RMO+.03,.16,8,40),acc,0,AXM,z);
 for(const z of[L*.2,L*.5,L*.8])bE.box('matte',0x383d43,2.4,.5,1.0,0,-F+.25,z);                                    // skids on the ground
 bE.cyl('paint',0xd8d4cc,.5,.5,.1,0,AXM+1.0,L+RMO-.05,PI/2,0,0,20);bE.add('metal',new THREE.TorusGeometry(.5,.06,8,20),0x777d84,0,AXM+1.0,L+RMO-.08);
 sign(gE,labelTex(sp.name.split(' & ')[0],id.toUpperCase()+'  ·  HAB-1',512,128,'#e9e2d4','#2a2f36'),1.3,.32,RMO+.05,AXM+.4,L*.5,PI/2);
 sign(gE,labelTex(sp.name.split(' & ')[0],id.toUpperCase()+'  ·  HAB-1',512,128,'#e9e2d4','#2a2f36'),1.3,.32,-RMO-.05,AXM+.4,L*.5,-PI/2);
 sp.regions.push({s0:sp.s0+.3,s1:sp.s0+L-.7,hw:2.0});
 S.cols.push({ax:sp.dx*(sp.s0),az:sp.dz*(sp.s0),bx:sp.dx*(sp.s0+L),bz:sp.dz*(sp.s0+L),r:RMO+.5});
 const O=(z0,z1,x0,x1)=>sp.obs.push([sp.s0+z0,sp.s0+z1,x0,x1]);
 const T3=(k)=>scrKey[k%3];
 const P2=(lx,lz)=>[sp.dx*(sp.s0+lz)+sp.nx*lx,sp.dz*(sp.s0+lz)+sp.nz*lx];
 const colSeg=(lx,z0,z1,r)=>{const a=P2(lx,z0),c=P2(lx,z1);S.cols.push({ax:a[0],az:a[1],bx:c[0],bz:c[1],r})};
 /* outside-only backdrop so the windows look into a lit room (and never show the world behind the module) */
 const bL=new Batch(),gLn=new THREE.Group();gE.add(gLn);S.extOnly.push(gLn);
 if(win){const lc=id==='gre'?0xd9a8d0:0xcfa97f;
  bL.add('glowBack',new THREE.CylinderGeometry(RMI+.12,RMI+.12,L-.1,28,1,true),lc,0,AXM,L/2,PI/2);
  bL.pln('glow',0x8a7358,4.7,L-.1,0,.03,L/2,-PI/2);
  bL.add('glow',new THREE.CircleGeometry(RMI+.12,28),0xb89874,0,AXM,L-.06,0,PI);bL.add('glow',new THREE.CircleGeometry(RMI+.12,28),0xb89874,0,AXM,.06);
  for(const sx of[-1,1])bL.box('glow',0xfff0d0,.14,.05,L-1,sx*1.2,AXM+2.7,L/2)}
 /* =========== per-module content =========== */
 if(id==='sto'){
  for(let k=0;k<6;k++){const z=1.3+k*2.0;
   for(const[px,pz]of[[-2.15,z],[-1.65,z],[-2.15,z+1.8],[-1.65,z+1.8]])bI.box('metal',0x5a6470,.05,2.3,.05,px,1.15,pz);
   for(const y of[.15,.85,1.55,2.25])bI.box('metal',0x6a7480,.55,.04,1.85,-1.9,y,z+.9);
   if(k<3){for(const y of[.15,.85,1.55]){let zz=z+.1;while(zz<z+1.6){const w=rnd(.3,.55);bI.box('matte',PAL[(Math.random()*PAL.length)|0],w,rnd(.3,.55),.42,-1.9,y+.04+.2,zz+w/2,rnd(-.05,.05));zz+=w+.08}}}
   else if(k===3){for(const y of[.15,.85,1.55])for(let q=0;q<5;q++){bI.cyl('metal',0xc5cad0,.13,.13,.34,-1.9,y+.21,z+.25+q*.33);bI.cyl('matte',[0x3f78c8,0xd9742b,0x4fae5a][q%3],.14,.14,.07,-1.9,y+.4,z+.25+q*.33)}}
   else{for(const y of[.15,.85])for(let q=0;q<3;q++){const zz=z+.35+q*.55;bI.cyl('metal',0xb8bec6,.17,.17,1.2,-1.9,y+.64,zz,0,0,0,12);bI.cyl('matte',0x3fae5a,.175,.175,.18,-1.9,y+1.02,zz,0,0,0,12);bI.sph('metal',0xb8bec6,.17,-1.9,y+1.24,zz,1,.6,1,10)}
    bI.cyl('metal',0x8a9098,.04,.04,1.8,-1.55,2.3,z+.9,PI/2)}}
  O(1.0,13.2,-2.4,-1.45);
  for(let k=0;k<9;k++){const z=1.3+k*.62;bI.box('metal',0x59687a,.5,2.05,.58,1.95,1.02,z);bI.box('metal',0x2a3038,.03,.5,.03,1.69,1.1,z+.2);bI.box('ledG',0xffffff,.04,.04,.02,1.69,1.85,z-.2)}
  for(let k=0;k<4;k++){const z=7.9+k*1.6;suit(bI,1.72,z,-PI/2);bI.cyl('metal',0x6a7076,.03,.03,2.0,1.95,1.0,z-.3);bI.box('metal',0x4a5058,.5,.04,.5,1.8,.02,z)}
  bI.cyl('metal',0x6a7076,.03,.03,5.8,1.98,2.05,10.4,PI/2);
  O(1.0,13.2,1.45,2.4);
  for(const[x,z,n]of[[-.85,4.2,3],[-.9,10.0,2]]){for(let q=0;q<n;q++)bI.box('matte',PAL[(q+(z|0))%PAL.length],1.0,.8,.8,x,.4+q*.8,z,rnd(-.08,.08));O(z-.7,z+.7,x-.65,x+.65)}
  bI.box('metal',0x3a4149,.8,.9,.6,.3,.45,6.3);for(let q=0;q<4;q++)bI.cyl('metal',0xc5cad0,.12,.12,.3,.3-.25+q*.17,1.05,6.3);
  O(6.0,6.6,-.15,.75);
  sign(gI,labelTex('STORAGE BAY 3','SUPPLIES · SAMPLES · EVA',512,128),2.2,.55,0,2.8,L-.05,PI);
  S.rigs.sto=[0.14,.37,.6,.85].map((q,i)=>[0,AXM+RMI*.8,L*q,0xffd8b0,55,sp]);
 }
 else if(id==='liv'){
  const f0=frm(0,0,0);
  /* galley (right wall, z 1.0-4.2) */
  bI.box('metal',0xd8dadd,.7,.9,3.2,1.75,.45,2.6);bI.box('matte',0x2a2f36,.74,.05,3.25,1.75,.92,2.6);bI.box('metal',0xc9ccd0,.45,.7,3.2,1.85,2.25,2.6);bI.box('metal',0xeeeeee,.75,1.95,.75,1.7,.98,4.6);
  bI.box('ledR',0xffffff,.28,.01,.28,1.75,.95,1.9);bI.box('metal',0x6a7076,.3,.02,.45,1.75,.95,3.2);bI.cyl('metal',0xb8bec6,.03,.03,.28,1.55,1.1,3.2);
  O(.9,5.0,1.35,2.3);
  /* dining table + bench (left wall, z 5-7) */
  bI.box('matte',0xcdbd9a,1.0,.05,2.0,-1.0,.76,6.0);bI.cyl('metal',0x555b62,.07,.07,.74,-1.0,.37,6.0);bI.box('matte',0x3b4654,.38,.46,1.9,-.18,.23,6.0);bI.box('matte',0x3b4654,.38,.46,1.9,-1.85,.23,6.0);
  for(let q=0;q<3;q++){bI.cyl('matte',0xe8e2d4,.045,.04,.1,-1.0+rnd(-.2,.2),.83,5.3+q*.7,0,0,0,10)}
  O(4.9,7.1,-2.3,.05);
  /* left cabinets */
  bI.box('metal',0x59687a,.5,1.9,3.0,-1.95,.95,2.6);for(let q=0;q<4;q++)bI.box('ledB',0xffffff,.03,.04,.03,-1.69,1.5,1.5+q*.7);O(1.0,4.2,-2.4,-1.45);
  /* lounge (z 8-10) */
  bI.box('matte',0x7a3d2e,.9,.42,1.6,-1.5,.21,9.0);bI.box('matte',0x7a3d2e,.18,.7,1.6,-1.95,.6,9.0);
  bI.cyl('matte',0x2a2f36,.4,.4,.45,-.5,.22,9.0,0,0,0,18);bI.box('matte',0x2f6a8a,.9,.42,.9,1.4,.21,8.6,.3);O(8.1,10.0,-2.4,-.9);O(8.0,9.2,.8,2.1);
  bI.box('matte',0x8a3a2a,2.6,.015,2.4,-.2,.02,9.0);
  sign(gI,labelTex('MARS-1 CREW','HAB-1 · SOL 1',256,128),.9,.45,-RMI*.97+.1,2.4,9.0,PI/2);
  /* workstations (z 10-12.5) */
  for(const sx of[-1,1])for(let q=0;q<2;q++){const z=10.6+q*1.3;bI.box('metal',0x3a4149,.75,.05,1.2,sx*1.85,.78,z);bI.box('metal',0x2c3238,.7,.7,1.15,sx*1.85,.38,z);
   const f=frm(sx*1.95,z,sx<0?PI/2:-PI/2);fbx(bI,'metal',0x1b1e22,f,.64,.38,.04,0,1.2,0);bI.pln(T3(q+(sx>0?1:0)),0xffffff,.6,.33,f.x(0,.025),1.2,f.z(0,.025),0,f.ry);fbx(bI,'metal',0x15181b,f,.45,.02,.16,0,.82,.3);
   bI.cyl('metal',0x6a7076,.03,.03,.45,sx*1.0,.25,z);bI.box('matte',0x2a3a4c,.48,.08,.48,sx*1.0,.5,z);bI.box('matte',0x2a3a4c,.48,.5,.08,sx*1.22,.8,z);bI.box('ledG',0xffffff,.04,.03,.03,sx*1.6,.74,z+.55)}
  O(10.0,12.4,-2.4,-1.4);O(10.0,12.4,1.4,2.4);
  /* lab sample benches */
  for(const sx of[-1,1]){bI.box('metal',0xd8dadd,.8,.9,4.2,sx*1.85,.45,15.2);bI.box('matte',0x20262c,.84,.05,4.25,sx*1.85,.92,15.2);
   for(let q=0;q<5;q++){const z=13.4+q*.85;if(sx<0){bI.cyl('metal',0x222831,.1,.12,.06,-1.85,.97,z);bI.cyl('metal',0x2a3038,.04,.04,.34,-1.85,1.17,z,-.4);bI.sph('metal',0x6a7076,.05,-1.85,1.35,z-.14)}
    else{bI.box('matte',0xe8e8e8,.3,.04,.22,1.85,.96,z);for(let r=0;r<4;r++)bI.cyl('matte',[0xd9742b,0x3f78c8,0x4fae5a,0xc9a23a][(q+r)%4],.03,.03,.1,1.7+r*.1,1.02,z,0,0,0,8)}}
   bI.box('metal',0xc9ccd0,.4,.05,3.6,sx*2.0,1.9,15.0);for(let q=0;q<6;q++)bI.cyl('metal',0xc5cad0,.09,.09,.25,sx*2.0,2.02,13.5+q*.6)}
  bI.box('metal',0x59687a,.5,.42,.5,1.85,1.15,16.7);bI.box('ledB',0xffffff,.3,.04,.02,1.6,1.2,16.45);
  bI.box('metal',0x9aa0a6,1.1,.9,.6,-1.85,1.4,16.8);bI.box('glow',0xb8e6ff,.9,.55,.03,-1.85,1.45,16.5);
  O(12.8,17.6,-2.4,-1.4);O(12.8,17.6,1.4,2.4);
  sign(gI,labelTex('RESEARCH LAB','SAMPLE ANALYSIS',512,128),2.2,.55,0,2.8,L-.05,PI);
  S.rigs.liv=[.1,.3,.5,.72,.92].map(q=>[0,AXM+RMI*.8,L*q,0xffd8b0,50,sp]);
 }
 else if(id==='gre'){
  for(const sx of[-1,1]){for(const[y,x,w]of[[.4,1.55,.8],[1.35,1.45,.7]]){bI.box('metal',0xb9bec4,w,.14,13.4,sx*x,y,8.0);bI.box('matte',0x4a3326,w-.1,.1,13.2,sx*x,y+.1,8.0);
    /* decorative bushes removed: the shelves now hold the farm.js potato beds */
    bI.box('glow',0xff6ad8,.45,.03,12.8,sx*x,y+.95,8.0)}
   for(const z of[1.5,5,8.5,12,15])for(const y of[.2,1.2])bI.box('metal',0x6a7076,.05,y>1?1.15:.4,.05,sx*1.9,y>1?.65:.2,z)}
  O(1.2,14.8,-2.4,-1.15);O(1.2,14.8,1.15,2.4);
  for(const x of[-.7,.7]){bI.cyl('metal',0xdde5ea,.6,.6,1.8,x,.9,15.2,0,0,0,18);bI.cyl('matte',0x2f9ad0,.58,.58,.9,x,1.1,15.2,0,0,0,18)}O(14.4,16,-1.4,1.4);
  bI.cyl('metal',0x4a8ad0,.05,.05,13,0,2.45,8.0,PI/2);
  sign(gI,labelTex('GREENHOUSE','HYDROPONICS · BIOREGEN',512,128,'#7dff9a'),2.2,.55,0,2.8,L-.05,PI);
  S.rigs.gre=[.14,.38,.62,.86].map((q,i)=>[0,AXM+RMI*.7,L*q,i%2?0xffd2f0:0xffb0e8,55,sp]);
 }
 else if(id==='pow'){
  for(let k=0;k<5;k++){const z=1.3+k*1.5;bI.box('metal',0x41505f,.8,2.1,1.3,-1.65,1.05,z);bI.box('matte',0x111418,.04,1.7,1.1,-1.24,1.05,z);
   for(let r=0;r<4;r++)bI.box(['ledG','ledG','ledA','ledG'][(k+r)%4],0xffffff,.03,.05,.9,-1.22,.5+r*.35,z)}
  O(.7,8.5,-2.4,-1.15);
  for(let k=0;k<3;k++){const z=2.2+k*2.4;bI.cyl('metal',0xc2c8cf,.55,.55,2.3,1.6,1.15,z,0,0,0,20);bI.cyl('metal',0x3a3f46,.57,.57,.12,1.6,2.3,z,0,0,0,20);bI.cyl('metal',0x3a3f46,.57,.57,.12,1.6,.06,z,0,0,0,20);
   bI.cyl('matte',0xd9362b,.06,.06,.1,1.07,1.3,z,0,0,PI/2);bI.sph('metal',0xe8e8e8,.07,1.06,1.5,z+.1,1,1,.3,8)}
  bI.cyl('metal',0x9a8a3a,.06,.06,5.6,1.15,2.0,4.6,PI/2);bI.cyl('metal',0x4a8ad0,.06,.06,5.6,1.15,1.7,4.6,PI/2);
  O(.9,8.3,1.0,2.4);
  bI.box('metal',0x3a4149,3.2,2.0,.5,0,1.0,L-.4);for(const[mx,k]of[[-.95,0],[0,1],[.95,2]]){bI.box('metal',0x1b1e22,.82,.5,.04,mx,1.5,L-.62);bI.pln(T3(k),0xffffff,.78,.46,mx,1.5,L-.65,0,PI)}
  for(let q=0;q<8;q++)bI.box(['ledG','ledA','ledG','ledB'][q%4],0xffffff,.06,.06,.03,-1.1+q*.31,.85,L-.65);O(L-1.1,L,-1.7,1.7);
  const st=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.4),M.stripe);st.rotation.x=-PI/2;st.position.set(0,.02,L-1.5);gI.add(st);
  sign(gI,labelTex('POWER STATION','CONTROL · DISTRIBUTION',512,128,'#ff7a5a'),2.2,.55,0,2.9,L-.05,PI);
  S.rigs.pow=[.2,.5,.8].map(q=>[0,AXM+RMI*.8,L*q,0xffe0c0,60,sp]);
 }
 /* =========== exterior extras per module =========== */
 if(id==='liv'){for(const z of[3,6.5,10])bE.box('metal',0xc9ccd0,1.2,.5,1.0,0,AXM+RMO+.2,z);bE.cyl('metal',0x8a9098,.18,.18,1.4,.9,5.67,14)}
 if(id==='sto'){for(const sx of[-1,1]){bE.cyl('metal',0xcfd4da,.55,.55,3.6,sx*(RMO+.9),-F+.55,L*.45,PI/2,0,0,18);for(const dz of[-1.2,1.2])bE.box('matte',0x383d43,.9,.2,.3,sx*(RMO+.9),-F+.1,L*.45+dz);colSeg(sx*(RMO+.9),L*.45-1.8,L*.45+1.8,1.0)}
  for(const z of[9.6,11.4,13.2]){bE.box('matte',PAL[(z|0)%PAL.length],1.4,1.0,1.6,RMO+1.0,-F+.5,z);colSeg(RMO+1.0,z,z,1.1)}bE.box('matte',PAL[1],1.2,.8,1.4,RMO+1.0,-F+1.4,11.4);bE.cyl('metal',0x8a9098,.15,.15,1.6,0,AXM+RMO+.7,5)}
 if(id==='gre'){for(const sx of[-1,1]){bE.cyl('metal',0xdde5ea,.7,.7,2.2,sx*(RMO+1.0),-F+.7,L*.8,PI/2,0,0,18);for(const dz of[-.7,.7])bE.box('matte',0x383d43,1.0,.25,.3,sx*(RMO+1.0),-F+.12,L*.8+dz);colSeg(sx*(RMO+1.0),L*.8-1.1,L*.8+1.1,1.15)}for(let q=0;q<4;q++)bL.box('glow',0xff6ad8,.5,.03,L-4,(q-1.5)*.35,AXM+1.6,L/2);}
 if(id==='pow'){for(let q=0;q<10;q++)bE.box('metal',0x4a525b,2.2,1.1,.06,0,AXM+RMO+.4,.9+q*.85);bE.box('metal',0x6a737d,2.4,.14,9,0,AXM+RMO-.05,L/2);bE.cyl('metal',0x8a9098,.35,.35,2.4,1.2,AXM+RMO+1.0,L-1.2);bE.cyl('matte',0x3a3d42,.5,.5,.14,1.2,AXM+RMO+2.2,L-1.2,0,0,0,18);
  for(const sx of[-1,1]){bE.box('metal',0x7a8a9c,2.0,2.2,3.0,sx*(RMO+1.7),-F+1.1,3.0+(sx>0?3:0));bE.box('ledG',0xffffff,.1,.1,.05,sx*(RMO+1.7),-F+1.9,3.0+(sx>0?3:0)-1.52);colSeg(sx*(RMO+1.7),3.0+(sx>0?3:0),3.0+(sx>0?3:0),1.9)}}
 gl.build(gE,{...M,glass:M.glass,glassGre:M.glassGre,glowOut:M.glow},false);bE.build(gE,M,true);bI.build(gI,M,false);glI.build(gI,M,false);bL.build(gLn,M,false)}

/* ======================================== EXTERIOR SITE ======================================== */
function buildSite(S,M,T,{Batch,frm,fbx,spr,sign,labelTex}){
 const b=new Batch(),g=new THREE.Group();S.ext.add(g);const add=(x,z,r)=>S.cols.push({ax:x,az:z,bx:x,bz:z,r});
 add(0,0,RO+.9);S.siteGroup=g;
 const cable=(x0,z0,x1,z1,w=.3,key='matte',col=0x1c1f23)=>{const dx=x1-x0,dz=z1-z0;b.box(key,col,w,.06,Math.hypot(dx,dz),(x0+x1)/2,.04,(z0+z1)/2,Math.atan2(dx,dz))};
 /* ---- solar field: 4 rows x 6 panels, tilted 25 deg, each panel on a rail carried by 4 posts that really touch the ground ---- */
 {const cx=-40,cz=8,tilt=.44,ca=Math.cos(tilt),sa=Math.sin(tilt),pw=3.2,ph=3.0,yc=1.2;
  for(let r=0;r<4;r++)for(let c=0;c<6;c++){const x=cx+r*3.6,z=cz-10+c*3.7;
   const g=new THREE.PlaneGeometry(pw,ph);g.rotateX(-PI/2);g.rotateZ(tilt);b.add('solar',g,0xffffff,x,yc,z);                // low edge toward -x, high edge toward +x
   const lowY=yc-1.45*sa-.06,hiY=yc+1.45*sa-.06,lowX=x-1.45*ca,hiX=x+1.45*ca;
   b.box('metal',0xc9ccd0,.1,.1,3.3,lowX,lowY,z);b.box('metal',0xc9ccd0,.1,.1,3.3,hiX,hiY,z);                                   // rails under both long edges
   for(const dz of[-1.1,1.1]){b.box('metal',0xc9ccd0,.1,lowY-.05,.1,lowX,(lowY-.05)/2,z+dz);b.box('metal',0xc9ccd0,.1,hiY-.05,.1,hiX,(hiY-.05)/2,z+dz)}}
  S.cols.push({rect:[cx-2.2,cx+14.2,cz-12.2,cz+11]});
  cable(cx+14.4,cz-10,cx+14.4,cz+10);cable(cx+14.4,cz+4,-9.6,3.2);b.box('metal',0x6a7076,.8,.6,.8,-9.4,.3,3.1)}                    // collector line + feeder to the hub
 /* ---- comms: 8 m dish + 3 m dish + lattice mast ---- */
 {S.comm=new THREE.Group();S.comm.position.set(0,0,24);g.add(S.comm);const dm=new THREE.Mesh(new THREE.SphereGeometry(4.2,28,8,0,TAU,0,.62),new THREE.MeshStandardMaterial({color:0xe8e6e0,roughness:.5,metalness:.3,side:THREE.DoubleSide}));
  dm.rotation.x=-PI/2+.9;dm.position.set(0,5.6,0);dm.castShadow=true;S.comm.add(dm);const arm=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,3.0,6),new THREE.MeshStandardMaterial({color:0x888d93}));arm.position.set(0,6.6,-1.6);arm.rotation.x=.9;S.comm.add(arm);
  S.comm.userData.dish=dm;S.anim.push((dt,t)=>{S.comm.rotation.y=Math.sin(t*.05)*.6});
  b.cyl('metal',0x8a9098,.5,.7,4.6,0,2.3,24);b.box('metal',0x6a7076,3.4,.4,3.4,0,.2,24);add(0,24,2.4);
  b.cyl('metal',0x8a9098,.35,.45,2.4,12,1.2,29);const d2=new THREE.Mesh(new THREE.SphereGeometry(1.7,20,6,0,TAU,0,.7),new THREE.MeshStandardMaterial({color:0xdcdad4,roughness:.5,metalness:.3,side:THREE.DoubleSide}));d2.position.set(12,3.1,29);d2.rotation.x=-PI/2+.7;d2.rotation.z=.5;g.add(d2);add(12,29,1.3);
  /* mast with beacon */
  b.cyl('metal',0xb7bcc2,.12,.12,14,-14,7,32);for(let k=0;k<5;k++){b.box('metal',0xb7bcc2,1.2,.08,.08,-14,2+k*2.4,32);b.cyl('metal',0xb7bcc2,.03,.03,2.4,-14+(k%2?.5:-.5),3+k*2.4,32,0,0,.2)}
  b.box('metal',0x6a7076,1.2,.5,1.2,-14,.25,32);add(-14,32,1);const bc=spr(g,-14,14.4,32,3,0xff3a2a,.9);S.anim.push((dt,t)=>{const on=Math.sin(t*3.2)>.2;bc.material.opacity=on?.95:.12;M.beacon.color.setHex(on?0xff3a2a:0x401410)});
  const bm=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),M.beacon);bm.position.set(-14,14.1,32);g.add(bm)}
 /* ---- atmospheric sensor rigs (rotating cup anemometer + vane) ---- */
 for(const[x,z]of[[30,-26],[-12,-36]]){b.cyl('metal',0xb7bcc2,.05,.07,6,x,3,z);b.box('metal',0x6a7076,.8,.1,.1,x,2.0,z);b.box('metal',0x2d3a5a,.7,.5,.04,x+1.2,1.2,z,0,0,0);b.cyl('metal',0x8a9098,.04,.04,1.2,x+1.2,.6,z);
   b.box('metal',0xe8e8e8,.3,.4,.3,x-.6,2.1,z);b.box('metal',0x222831,.5,.3,.3,x+.4,3.6,z);b.cyl('metal',0x8a9098,.02,.02,1.2,x-.5,4,z+.6,0,0,.3);
   const rot=new THREE.Group();rot.position.set(x,6.1,z);g.add(rot);for(let k=0;k<3;k++){const a=k*TAU/3,arm=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.5,4),new THREE.MeshStandardMaterial({color:0x888d93}));arm.rotation.z=PI/2;arm.rotation.y=-a;arm.position.set(Math.cos(a)*.25,0,Math.sin(a)*.25);rot.add(arm);
    const cup=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6,0,TAU,0,PI/2),new THREE.MeshStandardMaterial({color:0xdddddd,side:THREE.DoubleSide}));cup.position.set(Math.cos(a)*.5,0,Math.sin(a)*.5);cup.rotation.z=PI/2;rot.add(cup)}
   const vane=new THREE.Mesh(new THREE.BoxGeometry(.7,.14,.02),new THREE.MeshStandardMaterial({color:0xd9742b}));vane.position.set(x,5.4,z);g.add(vane);
   S.anim.push((dt,t)=>{rot.rotation.y+=dt*(2+S.sim.s.wind*.6);vane.rotation.y=S.sim.s.wdir*PI/180+Math.sin(t)*.1});add(x,z,.8)}
 /* ---- floodlights: 7 poles, additive glare, soft ground pools ---- */
 for(const[x,z]of[[5,-16],[-5,-16],[12,-8],[-12,-8],[-24,-18],[-8,30],[22,20]]){b.cyl('metal',0x6a7076,.07,.1,6.2,x,3.1,z);b.box('metal',0x2a2f36,.7,.3,.4,x,6.3,z,Math.atan2(-x,-z)+PI);b.box('glow',0xfff0d0,.55,.12,.05,x,6.25,z);
   const gx=x-Math.sin(Math.atan2(-x,-z)+PI)*0,fx=spr(g,x,6.2,z,5,0xfff0d0,.55);S.anim.push((dt,t)=>{fx.material.opacity=.5+.08*Math.sin(t*2+x)});
   const pool=new THREE.Mesh(new THREE.CircleGeometry(7,24),new THREE.MeshBasicMaterial({map:T.glow,color:0xffd9a0,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));pool.rotation.x=-PI/2;pool.position.set(x,.06,z);g.add(pool);add(x,z,.5)}
 /* ---- rover (detailed + destructible) and usable telescope: see the end of this file ---- */
 buildRover(S,g,add,spr);buildTelescope(S,g,add,spr);
 /* ---- fuel / water tanks + pipes near the power station: lying tanks rest on saddles on the ground ---- */
 for(const[x,z]of[[-34,-24],[-30,-28]]){b.cyl('metal',0xdde5ea,1.1,1.1,5,x,1.2,z,PI/2,0,0,18);for(const dz of[-1.5,1.5])b.box('metal',0x5a6068,2.0,.5,.3,x,.25,z+dz);add(x,z,3)}
 cable(-34,-21.4,-34,-16,.2,'metal',0x5a6068);cable(-30,-25.4,-29.2,-12.8,.2,'metal',0x5a6068);cable(-34,-24,-30,-28,.2,'metal',0x5a6068);
 b.build(g,M,true);
 /* extra obstacles for rocks etc. are handled by MarsPhase.rockCols */
 }

/* =====================================================================================================
   ROVER (detailed, destructible)  +  TELESCOPE (usable, see base.js Scope)      -- added to buildSite()
   ===================================================================================================== */
const _V=(x,y,z)=>new THREE.Vector3(x,y,z),_WIND=_V(.498,0,.867);   /* base-local direction the Sol 4 storm blows TOWARD (mirrors WD in daynight.js) */
const rmesh=(par,geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;m.receiveShadow=true;par.add(m);return m};
function strut(par,a,b,r,mat){const d=_V(b.x-a.x,b.y-a.y,b.z-a.z),l=d.length(),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,8),mat);m.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);m.quaternion.setFromUnitVectors(_V(0,1,0),d.normalize());m.castShadow=true;par.add(m);return m}
const sstp=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
function wheelGeo(){const p=[],t=new THREE.CylinderGeometry(.38,.38,.3,24,1);t.rotateX(PI/2);p.push(t);
 for(let i=0;i<14;i++){const a=i/14*TAU,b=new THREE.BoxGeometry(.07,.13,.31);b.rotateZ(a);b.translate(Math.cos(a)*.4,Math.sin(a)*.4,0);p.push(b)}return mergeGeometries(p)}
function hubGeo(){const p=[],h=new THREE.CylinderGeometry(.2,.2,.34,16);h.rotateX(PI/2);p.push(h);
 for(const z of[-.165,.165])for(let i=0;i<5;i++){const s=new THREE.BoxGeometry(.34,.045,.02);s.rotateZ(i/5*PI);s.translate(0,0,z);p.push(s)}return mergeGeometries(p)}

function buildRover(S,g,add,spr){
 const rv=new THREE.Group();rv.rotation.order='YXZ';const P0=_V(6.5,0,-20.5),Y0=.5;rv.position.copy(P0);rv.rotation.y=Y0;g.add(rv);
 const std=(c,r,m,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...o});
 const MT={white:std(0xeceae4,.42,.06),orange:std(0xd9742b,.5,.1),dark:std(0x24282e,.55,.55,{emissive:0x000000}),steel:std(0x9aa1a9,.35,.85),rubber:std(0x17181a,.95,0),
  glass:std(0x1d3550,.08,.7,{emissive:0x0a1a2a,emissiveIntensity:.5}),panel:std(0x1a2c5c,.3,.5),dish:std(0xeeeeee,.4,.2,{side:THREE.DoubleSide}),led:new THREE.MeshBasicMaterial({color:0xfff2d0})};
 for(const k in MT)MT[k].userData.c0=MT[k].color.clone();
 const CHAR=new THREE.Color(.045,.038,.034),body=new THREE.Group();rv.add(body);
 /* --- chassis, nose, cabin, cargo bay --- */
 rmesh(body,new THREE.BoxGeometry(2.5,.5,1.5),MT.white,0,.98,0);rmesh(body,new THREE.BoxGeometry(2.52,.09,1.52),MT.orange,0,.78,0);rmesh(body,new THREE.BoxGeometry(2.1,.12,1.4),MT.dark,0,.66,0);
 rmesh(body,new THREE.BoxGeometry(.9,.28,1.4),MT.white,1.45,.93,0,0,0,-.32);rmesh(body,new THREE.BoxGeometry(.12,.3,1.52),MT.dark,1.8,.8,0);
 rmesh(body,new THREE.BoxGeometry(1.15,.62,1.32),MT.white,.3,1.54,0);rmesh(body,new THREE.BoxGeometry(.05,.42,1.12),MT.glass,.9,1.55,0,0,0,.28);
 for(const s of[-1,1]){rmesh(body,new THREE.BoxGeometry(.7,.32,.04),MT.glass,.25,1.58,s*.67);rmesh(body,new THREE.BoxGeometry(.06,.1,.28),MT.led,1.84,.95,s*.5);rmesh(body,new THREE.BoxGeometry(.1,.1,.1),MT.dark,1.8,1.25,s*.45);
  for(let i=0;i<4;i++)rmesh(body,new THREE.BoxGeometry(.28,.05,.02),MT.dark,-.5+i*.38,1.0,s*.76)}
 rmesh(body,new THREE.BoxGeometry(1.05,.52,1.38),MT.white,-.88,1.48,0);rmesh(body,new THREE.BoxGeometry(1.05,.06,1.4),MT.orange,-.88,1.76,0);rmesh(body,new THREE.BoxGeometry(.5,.18,.03),MT.orange,.3,1.0,.76);rmesh(body,new THREE.BoxGeometry(.5,.18,.03),MT.orange,.3,1.0,-.76);
 /* --- tilted solar array (tears off) --- */
 const sol=new THREE.Group();sol.position.set(-.9,1.98,0);sol.rotation.z=.12;rv.add(sol);rmesh(sol,new THREE.BoxGeometry(1.5,.04,1.5),MT.panel);
 for(let i=1;i<4;i++)rmesh(sol,new THREE.BoxGeometry(.01,.045,1.46),MT.steel,-.75+i*.375,0,0);for(let i=1;i<3;i++)rmesh(sol,new THREE.BoxGeometry(1.46,.045,.01),MT.steel,0,0,-.75+i*.5);
 for(const s of[-1,1])rmesh(sol,new THREE.CylinderGeometry(.03,.03,.24,6),MT.steel,.4,-.13,s*.5);
 /* --- mast with camera head + high-gain dish (snaps off) --- */
 const mast=new THREE.Group();mast.position.set(.55,1.85,-.45);rv.add(mast);
 rmesh(mast,new THREE.CylinderGeometry(.04,.05,1.1,10),MT.steel,0,.55,0);rmesh(mast,new THREE.BoxGeometry(.34,.16,.2),MT.dark,0,1.16,0);
 for(const s of[-1,1])rmesh(mast,new THREE.CylinderGeometry(.045,.045,.08,10),MT.glass,.19,1.16,s*.06,0,0,PI/2);rmesh(mast,new THREE.BoxGeometry(.1,.1,.1),MT.white,-.12,1.3,0);
 rmesh(mast,new THREE.SphereGeometry(.36,22,8,0,TAU,0,.55),MT.dish,-.12,.62,-.3,0,0,-.75);rmesh(mast,new THREE.CylinderGeometry(.012,.012,.3,6),MT.steel,.02,.78,-.3,0,0,-.75);
 /* --- whip antenna (bends) --- */
 const whip=new THREE.Group();whip.position.set(-1.3,1.78,.62);rv.add(whip);rmesh(whip,new THREE.CylinderGeometry(.008,.014,1.3,6),MT.steel,0,.65,0);rmesh(whip,new THREE.SphereGeometry(.03,8,6),MT.dark,0,1.3,0);
 /* --- robotic sampling arm with drill (droops) --- */
 const arm=new THREE.Group();arm.position.set(1.15,1.0,.72);rv.add(arm);rmesh(arm,new THREE.SphereGeometry(.09,10,8),MT.steel);
 const up=new THREE.Group();up.rotation.z=.55;arm.add(up);rmesh(up,new THREE.CylinderGeometry(.045,.045,.7,8),MT.white,.35,0,0,0,0,PI/2);
 const el=new THREE.Group();el.position.x=.7;el.rotation.z=-1.9;up.add(el);rmesh(el,new THREE.SphereGeometry(.07,10,8),MT.steel);rmesh(el,new THREE.CylinderGeometry(.04,.04,.55,8),MT.white,.28,0,0,0,0,PI/2);
 const tur=new THREE.Group();tur.position.x=.58;el.add(tur);rmesh(tur,new THREE.BoxGeometry(.18,.2,.2),MT.dark);rmesh(tur,new THREE.CylinderGeometry(.03,.012,.22,8),MT.steel,.17,0,0,0,0,-PI/2);
 /* --- rocker-bogie suspension + 6 cleated wheels --- */
 const WG=wheelGeo(),HG=hubGeo(),wheels=[];
 for(const s of[-1,1]){for(const x of[-1.15,0,1.15]){const w=new THREE.Group();w.position.set(x,.38,s*1.12);rmesh(w,WG,MT.rubber);rmesh(w,HG,MT.steel);rv.add(w);wheels.push(w);strut(rv,_V(x,.38,s*1.0),_V(-.2,.8,s*.95),.035,MT.steel)}
  rmesh(rv,new THREE.BoxGeometry(.2,.14,.12),MT.dark,-.2,.8,s*.95)}
 strut(rv,_V(-.2,.8,-.95),_V(-.2,.8,.95),.035,MT.steel);
 /* headlight glow */
 const hl=[spr(rv,1.9,.95,.5,1.1,0xfff0d0,.5),spr(rv,1.9,.95,-.5,1.1,0xfff0d0,.5)];
 add(6.5,-20.5,1.9);S.rover=rv;
 /* ============ destruction state ============ */
 const pieces=[[mast,.7],[sol,.8],[whip,.6],[wheels[5],.4]].map(([o,r])=>({o,r,par:o.parent,p0:o.position.clone(),q0:o.quaternion.clone(),on:false,v:_V(0,0,0),w:_V(0,0,0),rest:false}));
 const armRest=[up.rotation.z,el.rotation.z,tur.rotation.z];
 const soot=new THREE.Mesh(new THREE.PlaneGeometry(7,7),new THREE.MeshBasicMaterial({map:(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),gr=x.createRadialGradient(64,64,4,64,64,62);gr.addColorStop(0,'rgba(8,6,5,.95)');gr.addColorStop(.55,'rgba(14,10,8,.6)');gr.addColorStop(1,'rgba(14,10,8,0)');x.fillStyle=gr;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})(),transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
 soot.rotation.x=-PI/2;soot.position.set(P0.x,.07,P0.z);soot.visible=false;g.add(soot);
 const HS=[_V(.9,1.25,.3),_V(1.15,1.0,.72),_V(-.9,1.5,-.4)],glow=HS.map(h=>spr(rv,h.x,h.y,h.z,.9,0xff7a2a,0)),bt=[.2,.7,1.2];
 const N=90,sp={p:new Float32Array(N*3).fill(-999),v:new Float32Array(N*3),l:new Float32Array(N)},sgeo=new THREE.BufferGeometry();sgeo.setAttribute('position',new THREE.BufferAttribute(sp.p,3));
 const sparks=new THREE.Points(sgeo,new THREE.PointsMaterial({size:.16,map:S.glowTex,color:0xffb050,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,fog:false}));sparks.frustumCulled=false;sparks.visible=false;g.add(sparks);
 const smoke=[0,1,2,3].map(i=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:S.glowTex,color:0x2b2724,transparent:true,opacity:0,depthWrite:false,fog:true}));s.visible=false;s.userData={t:i*.9,h:i%2?2:0};g.add(s);return s});
 let si=0;const tmp=_V(0,0,0);
 const fx=S.roverFx={g:rv,p:0,want:false,L:0,onSpark:null,t:0,hot:0};
 const scorch=k=>{for(const key in MT){const m=MT[key];if(key==='led'){m.color.setHex(0xfff2d0).lerp(CHAR,k);continue}m.color.copy(m.userData.c0).lerp(CHAR,k*.9);if(key==='steel'||key==='dark'){m.metalness=lerp0(.85,.3,k)}}};
 const lerp0=(a,b,t)=>a+(b-a)*t;
 const detach=pc=>{if(pc.on)return;rv.updateWorldMatrix(true,true);g.attach(pc.o);pc.on=true;pc.rest=false;pc.v.set(_WIND.x*rnd(6,10)+rnd(-1,1),rnd(3,5.5),_WIND.z*rnd(6,10)+rnd(-1,1));pc.w.set(rnd(-4,4),rnd(-3,3),rnd(-4,4))};
 const restore=()=>{for(const pc of pieces){pc.par.add(pc.o);pc.o.position.copy(pc.p0);pc.o.quaternion.copy(pc.q0);pc.on=false;pc.rest=false}
  up.rotation.z=armRest[0];el.rotation.z=armRest[1];tur.rotation.z=armRest[2];rv.position.copy(P0);rv.rotation.set(0,Y0,0);scorch(0);MT.dark.emissive.setRGB(0,0,0);MT.glass.emissiveIntensity=.5;
  soot.visible=false;soot.material.opacity=0;sparks.visible=false;sp.p.fill(-999);sp.l.fill(0);for(const s of smoke){s.visible=false;s.material.opacity=0}for(const q of glow)q.material.opacity=0;for(const q of hl)q.visible=true};
 const burst=i=>{rv.updateWorldMatrix(true,false);tmp.copy(HS[i]);rv.localToWorld(tmp);g.worldToLocal(tmp);const n=8+Math.floor(Math.random()*10);
  for(let k=0;k<n;k++){const j=si++%N;sp.p[j*3]=tmp.x;sp.p[j*3+1]=tmp.y;sp.p[j*3+2]=tmp.z;sp.v[j*3]=rnd(-2.6,2.6);sp.v[j*3+1]=rnd(1.2,4.8);sp.v[j*3+2]=rnd(-2.6,2.6);sp.l[j]=rnd(.35,1.0)}
  glow[i].material.opacity=1;if(fx.onSpark)fx.onSpark(i)};
 fx.step=function(dt,t){const f=fx;
  if(!f.want&&(f.p>0||pieces[0].on)){f.p=0;restore()}
  if(f.p===0&&f.L<.03&&!f.want)return;
  f.t+=dt;if(f.want&&f.p<1)f.p=Math.min(1,f.p+dt/9);
  const p=f.p,L=f.L,k=Math.sin(f.t);
  /* wind battering: rocking + shuddering that grows with the storm, then the topple */
  const roll=sstp(.18,.78,p)*1.22+Math.sin(sstp(.55,.95,p)*PI)*.12,shake=(p<1?Math.max(L*.6,p*.8):0);
  const yaw=Y0+sstp(.2,.9,p)*.6,lift=Math.max(0,1.12*Math.sin(roll)-.38*Math.cos(roll)),dr=sstp(.15,.9,p)*1.7;
  rv.position.set(P0.x+_WIND.x*dr+Math.sin(f.t*37)*.012*shake,lift+Math.abs(Math.sin(f.t*11))*.03*shake*(p<.5?1:0),P0.z+_WIND.z*dr+Math.sin(f.t*29+1)*.012*shake);
  rv.rotation.set(roll+Math.sin(f.t*6)*.035*shake*(p<.6?1:0),yaw,Math.sin(f.t*4.3)*.02*shake);
  /* parts breaking off */
  if(p>.2)detach(pieces[2]);if(p>.3)detach(pieces[0]);if(p>.42)detach(pieces[1]);if(p>.62)detach(pieces[3]);
  const dr2=sstp(.5,.9,p);up.rotation.z=armRest[0]-dr2*1.1;el.rotation.z=armRest[1]+dr2*1.2;tur.rotation.z=armRest[2]+dr2*.5;
  for(const pc of pieces){if(!pc.on||pc.rest)continue;const o=pc.o;pc.v.y-=6*dt;o.position.addScaledVector(pc.v,dt);o.rotation.x+=pc.w.x*dt;o.rotation.y+=pc.w.y*dt;o.rotation.z+=pc.w.z*dt;
   if(o.position.y<pc.r*.35){o.position.y=pc.r*.35;if(pc.v.y<-1.5){pc.v.y*=-.28;pc.v.x*=.55;pc.v.z*=.55;pc.w.multiplyScalar(.6)}else{pc.v.set(0,0,0);pc.w.set(0,0,0);pc.rest=true;o.rotation.x=Math.round(o.rotation.x/1.2)*1.2}}}
  /* scorching, soot, dead headlights */
  const sc=sstp(.12,.8,p);scorch(sc);soot.visible=sc>.02;soot.material.opacity=sc*.9;if(sc>.6)for(const q of hl)q.visible=false;
  const hot=p>=1?1:0;sparks.visible=p>.55;
  if(p>.55){const em=.35+.65*(.5+.5*Math.sin(f.t*13)*Math.sin(f.t*5.3));MT.dark.emissive.setRGB(.55*em,.1*em,.015*em);MT.glass.emissiveIntensity=.5*(1-sc);
   for(let i=0;i<3;i++){if((bt[i]-=dt)<=0){bt[i]=.25+Math.random()*1.5;burst(i)}glow[i].material.opacity=Math.max(0,glow[i].material.opacity-dt*3.2)}
   for(let j=0;j<N;j++){if(sp.l[j]<=0){sp.p[j*3+1]=-999;continue}sp.l[j]-=dt;sp.v[j*3+1]-=7*dt;sp.p[j*3]+=sp.v[j*3]*dt;sp.p[j*3+1]+=sp.v[j*3+1]*dt;sp.p[j*3+2]+=sp.v[j*3+2]*dt;if(sp.p[j*3+1]<.02&&sp.v[j*3+1]<0){sp.p[j*3+1]=.02;sp.v[j*3+1]*=-.35;sp.v[j*3]*=.6;sp.v[j*3+2]*=.6}}
   sgeo.attributes.position.needsUpdate=true}
  /* smoke columns from the wreck */
  if(p>.7){rv.updateWorldMatrix(true,false);for(const s of smoke){const u=s.userData;u.t+=dt;if(u.t>3.6)u.t-=3.6;const a=u.t/3.6;tmp.copy(HS[u.h]);rv.localToWorld(tmp);g.worldToLocal(tmp);
    s.visible=true;s.position.set(tmp.x+_WIND.x*a*3.2,tmp.y+a*3.4,tmp.z+_WIND.z*a*3.2);s.scale.setScalar(.5+a*2.4);s.material.opacity=.5*Math.sin(a*PI)*sstp(.7,1,p)}}
 };
 S.anim.push((dt,t)=>fx.step(dt,t));
}

function buildTelescope(S,g,add,spr){
 const tel=new THREE.Group(),TX=-9.5,TZ=-22.5;tel.position.set(TX,0,TZ);g.add(tel);
 const std=(c,r,m,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...o});
 const W=std(0xf1f1ee,.32,.12),WD=std(0xf1f1ee,.32,.12,{side:THREE.DoubleSide}),DK=std(0x1d2025,.5,.6),ST=std(0x9aa1a9,.3,.9),LN=std(0x3a2a6a,.05,.9,{emissive:0x140a30,emissiveIntensity:.6,side:THREE.DoubleSide}),RB=std(0x141517,.95,0),OR=std(0xd9742b,.5,.1);
 /* --- tripod: three splayed legs, triangular accessory tray, feet --- */
 const top=_V(0,1.3,0);for(let i=0;i<3;i++){const a=i/3*TAU+.3,fx=Math.cos(a)*1.05,fz=Math.sin(a)*1.05;strut(tel,top,_V(fx,.03,fz),.032,ST);rmesh(tel,new THREE.CylinderGeometry(.06,.07,.04,10),RB,fx,.02,fz);
  strut(tel,_V(fx*.55,.64,fz*.55),_V(0,.64,0),.014,ST)}
 rmesh(tel,new THREE.CylinderGeometry(.32,.32,.025,3),DK,0,.64,0,0,.3);rmesh(tel,new THREE.CylinderGeometry(.13,.17,.14,16),DK,0,1.33,0);rmesh(tel,new THREE.CylinderGeometry(.06,.06,.5,10),ST,0,1.5,0);
 /* --- azimuth head with fork --- */
 const az=new THREE.Group();az.position.y=1.42;tel.add(az);rmesh(az,new THREE.CylinderGeometry(.2,.22,.1,20),OR,0,.04,0);rmesh(az,new THREE.BoxGeometry(.2,.1,.54),DK,0,.14,0);
 for(const s of[-1,1]){rmesh(az,new THREE.BoxGeometry(.1,.62,.07),W,0,.46,s*.27);rmesh(az,new THREE.CylinderGeometry(.06,.06,.06,12),ST,0,.62,s*.32,PI/2,0,0)}
 const alt=new THREE.Group();alt.position.y=.62;az.add(alt);
 /* --- optical tube along +x: main OTA, dew shield, lens cell, focuser, eyepiece, finder, counterweight --- */
 rmesh(alt,new THREE.CylinderGeometry(.17,.17,1.5,28),W,.45,0,0,0,0,PI/2);rmesh(alt,new THREE.CylinderGeometry(.19,.19,.42,28,1,true),WD,1.4,0,0,0,0,PI/2);rmesh(alt,new THREE.CylinderGeometry(.18,.18,.04,28),DK,1.2,0,0,0,0,PI/2);
 {const l=new THREE.Mesh(new THREE.CircleGeometry(.16,28),LN);l.position.x=1.23;l.rotation.y=PI/2;alt.add(l)}
 rmesh(alt,new THREE.CylinderGeometry(.1,.1,.08,18),ST,-.3,0,0,0,0,PI/2);rmesh(alt,new THREE.CylinderGeometry(.06,.06,.24,14),DK,-.4,.1,0);rmesh(alt,new THREE.CylinderGeometry(.03,.03,.3,12),DK,-.4,.3,0);rmesh(alt,new THREE.CylinderGeometry(.045,.04,.07,12),RB,-.4,.46,0);
 rmesh(alt,new THREE.CylinderGeometry(.04,.04,.4,12),DK,.62,.27,0,0,0,PI/2);rmesh(alt,new THREE.BoxGeometry(.04,.12,.04),ST,.46,.2,0);rmesh(alt,new THREE.BoxGeometry(.04,.12,.04),ST,.8,.2,0);rmesh(alt,new THREE.CylinderGeometry(.034,.034,.02,12),LN,.83,.27,0,0,0,PI/2);
 rmesh(alt,new THREE.CylinderGeometry(.02,.02,.9,8),ST,-.55,-.18,0,0,0,PI/2);for(const x of[-.9,-.78])rmesh(alt,new THREE.CylinderGeometry(.09,.09,.1,16),DK,x,-.18,0,0,0,PI/2);
 const led=spr(alt,.9,.05,.17,.35,0xff3030,.9);S.anim.push((dt,t)=>{led.material.opacity=Math.sin(t*2.6)>.4?.95:.1});
 az.rotation.y=-1.15;alt.rotation.z=.85;
 const eye=_V(TX,1.7,TZ);
 S.telescope={g:tel,az,alt,x:TX,z:TZ,eyeY:1.7,
  aim(d){az.rotation.y=-Math.atan2(d.z,d.x);alt.rotation.z=Math.asin(clamp(d.y,-1,1))}};   /* d = unit view direction in base-local coordinates */
 add(TX,TZ,1.0);
}
