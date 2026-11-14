/* =====================================================================================================
   mars.js  -  "GOING TO MARS" phase: title -> approach -> entry -> player retro-propulsive landing
   Plugs into launch.js through   new MarsPhase({renderer, rocket, exhaust})   .begin()   .update(dt)
   World units: metres. +Y up. Landing site = local origin (Jezero Crater direction on the globe).
   ===================================================================================================== */
import * as THREE from 'three';
import {Tasks,patchItems,slotText,iconKey,nameText,BAG} from './tasks.js';
import {Crafting,patchCraftItems} from './crafting.js';   /* NEW: crafting table, blueprints, torch */   /* NEW: tasks, bucket, rocks, backpack */
import {MarsBase} from './base.js';
import {DayNight,patchSol2Items,patchSol3Items} from './daynight.js';
import {NightSky,SKY_FS as NIGHT_SKY_FS} from './nightsky.js';   /* NEW: day/night cycle, sol counter, night death */
import {patchFarmItems} from './farm.js';   /* NEW: Mars Research Base & Operations Hub */

const V3=THREE.Vector3,MU=THREE.MathUtils,clamp=MU.clamp,lerp=MU.lerp;
const sstep=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
const $=id=>document.getElementById(id);
const WIND_VOL=.3;   /* surface wind loudness (1 = old level, lower = quieter) */
const rnd=(a,b)=>a+Math.random()*(b-a);
const srgb=(r,g,b)=>new THREE.Color().setRGB(r,g,b,THREE.SRGBColorSpace);

/* ---------------------------------------------- constants ---------------------------------------- */
const R_M=3389500, G=3.71, COM=26, FOOT=9.5;                 // Mars radius, Mars gravity, lander centre of mass above base, foot radius
const DQ=new THREE.Quaternion(),DQ2=new THREE.Quaternion(),DV=new V3(),DH=new V3(),DM=new THREE.Matrix4();
const SUN=new V3(-.60,.17,.78).normalize();
const MARS_C=new V3(0,-R_M,0);
const E={A0:55000,AE:4200,VE:140,XE:-420,X0:-1700,VXE:22,T:20};   // scripted entry profile (time-compressed)
const LIM={vy:9,vx:6,th:.35};                                   // safe touchdown limits (m/s, m/s, rad ~10 deg)
const FUEL_BURN=1.1;                                             // % per second at full throttle
const APP_T=15, APP_A1=3.0e6;                                    // approach cutscene length (s) / start altitude (m)
const entryAlt=(u,T)=>E.AE+(E.A0-E.AE)*Math.pow(1-u,2.2)+E.VE*T*(1-u);
const entryX=(u,T)=>E.XE+(E.X0-E.XE)*Math.pow(1-u,2.2)-E.VXE*T*(1-u);
const entryVy=(u,T)=>-((E.A0-E.AE)*2.2*Math.pow(1-u,1.2)/T+E.VE);
const entryVx=(u,T)=>-(E.X0-E.XE)*2.2*Math.pow(1-u,1.2)/T+E.VXE;   // d(entryX)/dt, ends at +VXE
const dens=a=>Math.exp(-Math.max(a,0)/11100);                    // Mars density, relative to surface (scale height ~11.1 km)
const HEAT_PEAK=(()=>{let m=0;for(let i=0;i<=200;i++){const u=i/200,v=-entryVy(u,E.T),h=dens(entryAlt(u,E.T))*v*v*v;if(h>m)m=h}return m})();
const heatAt=u=>{const v=-entryVy(u,E.T),h=dens(entryAlt(u,E.T))*v*v*v/HEAT_PEAK;return clamp(h,0,1)};

/* ---------------------------------------------- noise / terrain --------------------------------- */
const hsh=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n)};
function vn(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
 return lerp(lerp(hsh(xi,yi),hsh(xi+1,yi),u),lerp(hsh(xi,yi+1),hsh(xi+1,yi+1),u),v)}
function fbm(x,y,o){let a=.5,s=0;for(let i=0;i<o;i++){s+=a*vn(x,y);x=x*2.03+17.1;y=y*2.03+3.7;a*=.5}return s}
function ridge(x,y,o){let a=.5,s=0,w=1;for(let i=0;i<o;i++){let n=1-Math.abs(vn(x,y)*2-1);n*=n;s+=a*n*w;w=clamp(n*1.6,0,1);x=x*2.1+11.3;y=y*2.1+5.9;a*=.5}return s}
let _seed=20260611;const rand=()=>{_seed=(_seed*1664525+1013904223)>>>0;return _seed/4294967296};
const CRATERS=[];
for(let i=0;i<80;i++){const r=Math.pow(rand(),2.2)*300+10,d=150+r+rand()*2800,a=rand()*6.2832;CRATERS.push({x:Math.cos(a)*d,z:Math.sin(a)*d,r,dp:r*(.1+rand()*.1)})}
for(let i=0;i<12;i++){const r=400+rand()*1500,d=3500+r+rand()*7000,a=rand()*6.2832;CRATERS.push({x:Math.cos(a)*d,z:Math.sin(a)*d,r,dp:r*(.08+rand()*.07)})}
function craterH(x,z){let h=0;for(const c of CRATERS){const dx=x-c.x;if(dx>c.r*1.8||dx<-c.r*1.8)continue;const dz=z-c.z;if(dz>c.r*1.8||dz<-c.r*1.8)continue;
 const d=Math.hypot(dx,dz)/c.r;if(d<1)h-=c.dp*(1-d*d);if(d<1.8){const q=(d-1.04)/.17;h+=c.dp*.38*Math.exp(-q*q)}if(d>1)h+=c.dp*.1*Math.exp(-(d-1)*2.2)}return h}
function heightBase(x,z){const r=Math.hypot(x,z),far=sstep(400,3500,r),mesa=sstep(6500,15000,r);
 let h=(fbm(x*.0007,z*.0007,4)-.5)*420*far;
 h+=(fbm(x*.004,z*.004,3)-.5)*14*sstep(150,900,r);
 h+=(fbm(x*.09+9,z*.09,3)-.5)*.5;           // micro relief
 const m=ridge(x*.00022,z*.00022,5),ter=Math.floor(m*5)/5;h+=lerp(m,ter,.55)*1500*mesa;    // terraced mesas / red cliffs
 h+=craterH(x,z);
 return h*sstep(22,90,r)}

/* ---------------------------------------------- WORLD BOUNDARY (invisible wall) + SURFACE CRATERS -------------------
   Once the capsule has landed the playable valley is limited by an invisible wall (see updWalk). A handful of
   shallow impact craters are pressed into the ground in a few areas only - the rest of the valley stays flat.   */
const BND={on:false,cx:0,cz:0,R:170,craters:[],base:null};
function craterAt(x,z){let h=0;for(const c of BND.craters){const dx=x-c.x,dz=z-c.z,d2=dx*dx+dz*dz;if(d2>c.r2)continue;const u=Math.sqrt(d2)/c.r;
 if(u<1){const k=1-u*u;h-=c.dp*k*k}h+=c.dp*.16*Math.exp(-Math.pow((u-1.02)/.2,2))}return h}
function heightAt(x,z){let h=heightBase(x,z);if(!BND.on)return h;const B=BND.base;if(B){const d=Math.hypot(x-B.x,z-B.z);if(d<B.r)h=lerp(B.h,h,sstep(B.r*.7,B.r,d))}   /* base plain is dead flat */
 return BND.craters.length?h+craterAt(x,z):h}
const groundAt=x=>heightAt(x,0);

/* ---------------------------------------------- landing physics (exported for testing) ----------- */
export function stepLander(L,dt,inp,gnd){
 const fuelOK=L.fuel>0,want=inp.up&&fuelOK?1:0;
 L.thr+=clamp(want-L.thr,-1.8*dt,1.2*dt);
 const rcs=!!inp.rcs&&fuelOK,tilt=(inp.right?1:0)-(inp.left?1:0);
 L.om+=tilt*(fuelOK?.85:.25)*dt;if(!tilt)L.om-=L.th*1.2*dt;L.om*=Math.exp(-(tilt?.25:2.2)*(rcs?3:1)*dt);
 L.th=clamp(L.th+L.om*dt,-1.3,1.3);if(Math.abs(L.th)>=1.3)L.om=0;
 const a0=13/(.62+.38*L.fuel/100),aT=L.thr*a0,s=Math.sin(L.th),c=Math.cos(L.th);   // thrust accel grows as propellant is burnt
 let ax=aT*s,ay=aT*c-G;
 ax-=.25*L.vx*Math.min(1,L.thr*2)*(L.y-COM<1500?1:.3);
 if(rcs){ax+=clamp(-L.vx*.9,-2.2,2.2);ay+=.3*G}
 const rho=.02*dens(L.y-COM),k=.5*rho*Math.hypot(L.vx,L.vy)/120;                 // ballistic coefficient ~120 kg/m^2
 ax-=k*L.vx;ay-=k*L.vy;
 L.vx+=ax*dt;L.vy+=ay*dt;L.x+=L.vx*dt;L.y+=L.vy*dt;
 L.fuel=Math.max(0,L.fuel-(FUEL_BURN*L.thr+(rcs?.5:0)+(tilt?.1:0))*dt);if(L.fuel<=0)L.thr=0;
 let pen=-1e9;for(const fx of[-FOOT,FOOT]){const fy=L.y-fx*s-COM*c,fxw=L.x+fx*c-COM*s;pen=Math.max(pen,gnd(fxw)-fy)}
 return pen}

/* ---------------------------------------------- small texture helpers ---------------------------- */
function canvasTex(w,h,fn,srgbTex=true){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);if(srgbTex)t.colorSpace=THREE.SRGBColorSpace;return t}
const glowTex=()=>canvasTex(128,128,(x,w,h)=>{const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h)});
const puffTex=()=>canvasTex(128,128,(x,w,h)=>{for(let i=0;i<26;i++){const a=rnd(0,6.28),d=rnd(0,30),r=rnd(14,34),cx=64+Math.cos(a)*d,cy=64+Math.sin(a)*d,g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h)}
 x.globalCompositeOperation='destination-out';const g=x.createRadialGradient(64,64,28,64,64,64);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,1)');x.fillStyle=g;x.fillRect(0,0,w,h)});
function tileNoise(x,y,per){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),m=a=>((a%per)+per)%per,g=(a,b)=>hsh(m(a)+per*3.1,m(b)+per*1.7);
 return lerp(lerp(g(xi,yi),g(xi+1,yi),u),lerp(g(xi,yi+1),g(xi+1,yi+1),u),v)}
function makeDetail(){const N=512,H=new Float32Array(N*N);let mn=1e9,mx=-1e9;
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){let s=0,a=.5,p=4;for(let o=0;o<6;o++){s+=a*tileNoise(x/N*p,y/N*p,p);p*=2;a*=.5}H[y*N+x]=s}
 for(let i=0;i<220;i++){const cx=Math.floor(rnd(0,N)),cy=Math.floor(rnd(0,N)),r=rnd(1.2,3.5),hh=rnd(.03,.09);
  for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){const d=Math.hypot(dx,dy)/r;if(d<1)H[((cy+dy+N)%N)*N+(cx+dx+N)%N]+=hh*Math.sqrt(1-d*d)}}
 for(let i=0;i<H.length;i++){mn=Math.min(mn,H[i]);mx=Math.max(mx,H[i])}
 const cc=document.createElement('canvas');cc.width=cc.height=N;const cx=cc.getContext('2d'),ci=cx.createImageData(N,N),
  nc=document.createElement('canvas');nc.width=nc.height=N;const nx=nc.getContext('2d'),ni=nx.createImageData(N,N);
 const at=(x,y)=>(H[((y+N)%N)*N+(x+N)%N]-mn)/(mx-mn);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const k=(y*N+x)*4,h=at(x,y),gr=clamp(.74+.4*(h-.42)+(Math.random()-.5)*.05,.4,1)*255;
  ci.data[k]=gr;ci.data[k+1]=gr*.97;ci.data[k+2]=gr*.94;ci.data[k+3]=255;
  let dx=(at(x+1,y)-at(x-1,y))*7,dy=(at(x,y+1)-at(x,y-1))*7;const l=Math.hypot(dx,dy,1);
  ni.data[k]=(-dx/l*.5+.5)*255;ni.data[k+1]=(dy/l*.5+.5)*255;ni.data[k+2]=(1/l*.5+.5)*255;ni.data[k+3]=255}
 cx.putImageData(ci,0,0);nx.putImageData(ni,0,0);
 const map=new THREE.CanvasTexture(cc),nm=new THREE.CanvasTexture(nc);map.colorSpace=THREE.SRGBColorSpace;
 for(const t of[map,nm]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8}return{map,nm}}

/* ---------------------------------------------- particle system ---------------------------------- */
class Puffs{
 constructor(scene,cap,additive,tex){this.cap=cap;this.i=0;const n=cap;
  this.pos=new Float32Array(n*3);this.vel=new Float32Array(n*3);this.age=new Float32Array(n).fill(1e9);this.life=new Float32Array(n).fill(1);
  this.s0=new Float32Array(n);this.s1=new Float32Array(n);this.col=new Float32Array(n*3);this.a0=new Float32Array(n);
  this.drag=new Float32Array(n);this.buoy=new Float32Array(n);this.grav=new Float32Array(n);this.size=new Float32Array(n);this.rgba=new Float32Array(n*4);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize',new THREE.BufferAttribute(this.size,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol',new THREE.BufferAttribute(this.rgba,4).setUsage(THREE.DynamicDrawUsage));
  this.mat=new THREE.ShaderMaterial({uniforms:{uMap:{value:tex},uScale:{value:600},uMax:{value:300}},transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
   vertexShader:`attribute float aSize;attribute vec4 aCol;uniform float uScale,uMax;varying vec4 vC;void main(){vC=aCol;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(aSize*uScale/max(-mv.z,.1),uMax);}`,
   fragmentShader:`uniform sampler2D uMap;varying vec4 vC;void main(){float a=texture2D(uMap,gl_PointCoord).a*vC.a;if(a<.004)discard;gl_FragColor=vec4(vC.rgb,a);}`});
  this.obj=new THREE.Points(g,this.mat);this.obj.frustumCulled=false;scene.add(this.obj)}
 emit(x,y,z,vx,vy,vz,life,s0,s1,r,g,b,a,drag=.5,buoy=0,grav=0){const i=this.i,k=i*3;this.i=(i+1)%this.cap;
  this.pos[k]=x;this.pos[k+1]=y;this.pos[k+2]=z;this.vel[k]=vx;this.vel[k+1]=vy;this.vel[k+2]=vz;this.age[i]=0;this.life[i]=life;this.s0[i]=s0;this.s1[i]=s1;
  this.col[k]=r;this.col[k+1]=g;this.col[k+2]=b;this.a0[i]=a;this.drag[i]=drag;this.buoy[i]=buoy;this.grav[i]=grav}
 update(dt){const{pos,vel,age,life}=this;
  for(let i=0;i<this.cap;i++){if(age[i]>=life[i]){this.size[i]=0;this.rgba[i*4+3]=0;continue}
   age[i]+=dt;const t=age[i]/life[i],k=i*3,d=Math.exp(-this.drag[i]*dt);
   vel[k]*=d;vel[k+1]=vel[k+1]*d+(this.buoy[i]+this.grav[i])*dt;vel[k+2]*=d;
   pos[k]+=vel[k]*dt;pos[k+1]+=vel[k+1]*dt;pos[k+2]+=vel[k+2]*dt;
   if(pos[k+1]<.15&&pos[k+1]>-50){pos[k+1]=.15;vel[k+1]*=-.25;vel[k]*=.8;vel[k+2]*=.8}
   this.size[i]=lerp(this.s0[i],this.s1[i],Math.sqrt(t));
   const a=this.a0[i]*sstep(0,.08,t)*Math.pow(1-t,1.5),q=i*4;this.rgba[q]=this.col[k];this.rgba[q+1]=this.col[k+1];this.rgba[q+2]=this.col[k+2];this.rgba[q+3]=a}
  const A=this.obj.geometry.attributes;A.position.needsUpdate=A.aSize.needsUpdate=A.aCol.needsUpdate=true}
 clear(){this.age.fill(1e9);this.size.fill(0);this.rgba.fill(0);const A=this.obj.geometry.attributes;A.aSize.needsUpdate=A.aCol.needsUpdate=true}}

/* ---------------------------------------------- shaders ------------------------------------------ */
const MARS_VS=`varying vec3 vP,vN,vW;void main(){vP=position;vN=mat3(modelMatrix)*position;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const MARS_FS=`precision highp float;uniform vec3 uSun;uniform sampler2D uMap,uHm;uniform float uHas,uHasH;varying vec3 vP,vN,vW;
const float PI=3.14159265;
float hs(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(hs(i),hs(i+vec3(1,0,0)),f.x),mix(hs(i+vec3(0,1,0)),hs(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hs(i+vec3(0,0,1)),hs(i+vec3(1,0,1)),f.x),mix(hs(i+vec3(0,1,1)),hs(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn3(p);p=p*2.03+vec3(7.1,3.3,1.7);a*=.5;}return s;}
vec3 ld(float la,float lo){la=radians(la);lo=radians(lo);return vec3(cos(la)*cos(lo),sin(la),-cos(la)*sin(lo));}
float ang(vec3 p,float la,float lo){return degrees(acos(clamp(dot(p,ld(la,lo)),-1.,1.)));}
float bl(vec3 p,float la,float lo,float r){float a=ang(p,la,lo)/r;return exp(-a*a);}
float craters(vec3 p,float f,float dens){vec3 q=p*f,ic=floor(q);float h=0.;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){vec3 c=ic+vec3(float(x),float(y),float(z));float r1=hs(c);if(r1>dens)continue;
  float r2=hs(c+7.3),r3=hs(c+3.1);vec3 cc=c+vec3(hs(c+1.7),hs(c+4.4),hs(c+9.9));float rad=.25+.3*r2,k=length(q-cc)/rad;
  if(k<1.6){float bowl=k<1.?-(1.-k*k):0.;float qq=(k-1.05)/.14;h+=(bowl*(.4+.6*r3)+exp(-qq*qq)*.35)*rad;}}
 return h;}
float elev(vec3 p,float lat,float lon,out float dark){
 float latb=25.*cos(radians(lon-15.));float hl=smoothstep(-6.,6.,latb-lat);
 float e=mix(-2.6,2.2,hl);
 e+=(fbm3(p*3.1)-.5)*3.4+(fbm3(p*10.)-.5)*1.2;
 e+=6.5*bl(p,2.,-113.,24.)*(.6+.8*fbm3(p*5.));                                  // Tharsis bulge
 e+=3.*bl(p,25.,147.,9.)+4.*(1.-smoothstep(3.,9.,ang(p,40.5,-109.6)));          // Elysium, Alba Mons
 e-=8.5*bl(p,-42.4,70.5,11.);float hr=(ang(p,-42.4,70.5)-15.)/3.;e+=2.*exp(-hr*hr);   // Hellas basin + rim
 e-=3.5*bl(p,-49.,-43.,6.5)+3.*bl(p,13.,88.,7.);                                // Argyre, Isidis
 e+=21.*(1.-smoothstep(2.,5.2,ang(p,18.65,-133.8)));                             // Olympus Mons
 e+=13.*(1.-smoothstep(1.,3.6,ang(p,-8.35,-120.1)));                             // Arsia
 e+=13.*(1.-smoothstep(1.,3.6,ang(p,1.5,-112.8)));                               // Pavonis
 e+=14.*(1.-smoothstep(1.,3.6,ang(p,11.8,-104.5)));                              // Ascraeus
 float clat=-8.-6.*smoothstep(-95.,-40.,lon),vw=1.1+.7*sin(lon*.35),q=(lat-clat)/vw;
 float vm=exp(-q*q)*smoothstep(-98.,-88.,lon)*(1.-smoothstep(-48.,-30.,lon));   // Valles Marineris
 e-=5.5*vm*(.7+.5*fbm3(p*14.));
 e+=craters(p,34.,.46)*89.*.17*mix(.3,1.,hl);
 dark=.9*bl(p,8.,69.,9.)+.7*bl(p,48.,-32.,15.)+.6*bl(p,-3.,-5.,8.)+.6*bl(p,-35.,-150.,13.)+.5*bl(p,-28.,105.,9.)+.45*bl(p,-20.,-175.,9.);
 dark-=.5*bl(p,0.,-110.,26.)+.3*bl(p,22.,5.,16.)+.4*bl(p,-42.4,70.5,9.)+.3*bl(p,25.,147.,9.);
 dark+=(fbm3(p*6.+4.)-.5)*.55+vm*.4+smoothstep(60.,75.,lat)*.5;dark=clamp(dark,0.,1.);
 return e;}
void main(){
 vec3 p=normalize(vP),N=normalize(vN);
 float lat=degrees(asin(clamp(p.y,-1.,1.))),lon=degrees(atan(-p.z,p.x)),dark;
 float e=elev(p,lat,lon,dark);vec2 uv=vec2((radians(lon)+PI)/(2.*PI),lat/180.+.5);
 if(uHasH>.5)e=-8.2+29.4*texture2D(uHm,uv).r;
 vec3 bright=vec3(.80,.50,.31),mid=vec3(.62,.36,.22),dk=vec3(.27,.21,.19);
 vec3 alb=mix(mix(bright,mid,smoothstep(.25,.75,fbm3(p*7.))),dk,dark*.92);alb*=.88+.22*smoothstep(-6.,10.,e);alb*=.9+.2*fbm3(p*46.)*(.6+.4*fbm3(p*13.));
 if(uHas>.5)alb=texture2D(uMap,uv).rgb;
 else{float nc=smoothstep(82.5,85.5,lat+(fbm3(p*10.)-.5)*5.),sc=1.-smoothstep(-87.,-84.,lat+(fbm3(p*10.+3.)-.5)*5.);alb=mix(alb,vec3(.93,.92,.90),max(nc,sc*.9));}
 vec3 dpx=dFdx(vW),dpy=dFdy(vW),r1=cross(dpy,N),r2=cross(N,dpx);float det=dot(dpx,r1);
 vec3 gr=sign(det)*(dFdx(e)*r1+dFdy(e)*r2);vec3 Nb=normalize(abs(det)*N-11.*gr);
 float nl=dot(N,uSun),dl=max(dot(Nb,uSun),0.)*smoothstep(-.12,.32,nl);
 float cl=smoothstep(.64,.84,fbm3(p*4.5+vec3(2.,1.,5.))+(fbm3(p*13.)-.5)*.18)*(.35+.65*smoothstep(-.1,.7,abs(p.y)+bl(p,10.,-125.,30.)*.6))*.5;alb=mix(alb,vec3(.96,.93,.9),cl);
 vec3 lin=alb*alb*(dl*1.45+.06+.05*smoothstep(-.4,.1,nl));vec3 V=normalize(-vW);float rim=pow(1.-max(dot(N,V),0.),3.);
 lin=mix(lin,vec3(.55,.28,.2)*(.15+.85*smoothstep(-.1,.5,nl)),rim*.5);
 gl_FragColor=vec4(sqrt(lin),1.);}`;
const ATMO_FS=`uniform vec3 uSun;varying vec3 vN,vW;void main(){vec3 N=normalize(vN),V=normalize(-vW);float f=pow(1.-max(dot(N,V),0.),3.2),nl=dot(N,uSun);
 float lit=smoothstep(-.28,.35,nl);vec3 c=mix(vec3(.95,.58,.42),vec3(.5,.62,.9),smoothstep(.35,-.05,nl)*.8);gl_FragColor=vec4(c*1.25,f*lit*.8);}`;
const SKY_FS=NIGHT_SKY_FS;
const PLASMA_VS=`varying vec2 vUv;varying vec3 vNo,vVi;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vNo=normalMatrix*normal;vVi=-mv.xyz;gl_Position=projectionMatrix*mv;}`;
const PLASMA_FS=`uniform float uT,uI,uWake;varying vec2 vUv;varying vec3 vNo,vVi;
float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){float n=n3(vec3(vUv.x*10.,vUv.y*(uWake>.5?5.:8.)-uT*(uWake>.5?-14.:10.),uT*1.5))*.65+n3(vec3(vUv.x*26.,vUv.y*14.-uT*22.,4.))*.35;
 float fr=pow(1.-abs(dot(normalize(vNo),normalize(vVi))),1.2);float fade=uWake>.5?pow(1.-vUv.y,1.3):1.;
 vec3 hot=mix(vec3(1.,.93,.78),vec3(1.,.5,.15),smoothstep(0.,.6,n));hot=mix(hot,vec3(.62,.72,1.),(1.-fr)*.35);
 gl_FragColor=vec4(hot*1.7,clamp((.25+fr)*n*1.7*fade*uI,0.,1.));}`;

/* ---------------------------------------------- UI --------------------------------------------- */
const CSS=`
#m-title{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 1.8s;pointer-events:none;color:#fff;font-family:"Segoe UI",Arial,sans-serif;z-index:30}
#m-title.on{opacity:1;transition:opacity 1.2s}
#m-title h1{margin:0;font-size:clamp(34px,7.2vw,118px);font-weight:900;letter-spacing:.28em;padding-left:.28em;text-align:center;text-shadow:0 0 16px rgba(255,130,60,.95),0 0 46px rgba(255,80,30,.75),0 0 110px rgba(255,60,20,.55);animation:mT 4.2s ease-out both}
#m-title small{margin-top:22px;letter-spacing:.5em;font-size:clamp(10px,1.1vw,15px);color:#ffd0a8;opacity:.85}
@keyframes mT{0%{transform:scale(1.25);letter-spacing:.62em;opacity:0}28%{opacity:1}100%{transform:scale(1);letter-spacing:.28em}}
#m-cap{position:fixed;left:50%;top:15%;transform:translateX(-50%);font:600 20px "Segoe UI",Arial,sans-serif;letter-spacing:6px;color:#fff;opacity:0;transition:opacity .6s;text-shadow:0 0 12px #000;pointer-events:none;z-index:20;text-align:center;white-space:nowrap}
#m-status{position:fixed;left:50%;top:7%;transform:translateX(-50%);font:700 22px Consolas,monospace;letter-spacing:5px;opacity:0;transition:opacity .25s;text-shadow:0 0 10px #000;pointer-events:none;z-index:20}
#m-status.blink{animation:mB .5s steps(2) infinite}@keyframes mB{50%{opacity:.25}}
#m-hud{position:fixed;left:28px;bottom:26px;width:290px;padding:14px 18px 12px;background:rgba(6,10,18,.62);border-left:4px solid #ff8a4c;border-radius:4px;font:600 14px Consolas,monospace;letter-spacing:2px;color:#f4e8e0;opacity:0;transition:opacity .7s;pointer-events:none;z-index:20;text-shadow:0 0 6px #000;box-shadow:0 4px 24px rgba(0,0,0,.5)}
#m-hud.on{opacity:1}
#m-hud .r{display:flex;justify-content:space-between;align-items:baseline;margin:3px 0}
#m-hud .k{font-size:11px;opacity:.65}#m-hud .v{font-size:26px}#m-hud .v.s{font-size:15px}#m-hud .u{font-size:12px;opacity:.7}#m-hud .sm{font-size:13px}
#m-hud .bar{height:7px;background:rgba(255,255,255,.12);border-radius:3px;overflow:hidden;margin:2px 0 7px}
#m-hud .bar i{display:block;height:100%;width:100%;background:#ff7a3a;transition:width .1s}#m-hud .bar.t i{background:#7fd0ff;width:0}
#m-hud .lim{font-size:10px;opacity:.55;letter-spacing:1px;margin-top:4px;line-height:1.5}
#m-tut{position:fixed;right:34px;top:50%;transform:translateY(-50%) translateX(30px);width:min(430px,38vw);padding:18px 22px;background:rgba(6,10,18,.8);border-left:4px solid #ffb347;border-radius:4px;color:#f2f5fa;font:15px "Segoe UI",Arial,sans-serif;line-height:1.4;opacity:0;transition:opacity .7s,transform .7s;pointer-events:none;z-index:25;box-shadow:0 6px 34px rgba(0,0,0,.6)}
#m-tut.on{opacity:1;transform:translateY(-50%)}
#m-tut .th{font-weight:800;letter-spacing:4px;color:#ffb347;font-size:15px;margin-bottom:12px}#m-tut .th span{display:block;font-weight:500;font-size:11px;color:#fff;opacity:.6;margin-top:3px;letter-spacing:3px}
#m-tut .tr{display:flex;gap:10px;align-items:flex-start;margin:11px 0}#m-tut .tr b{letter-spacing:1px;font-size:13px}#m-tut .tr div{font-size:13px;opacity:.9}
#m-tut .kc{flex:none;min-width:30px;text-align:center;font:700 14px Consolas,monospace;color:#ffb347;border:2px solid #ffb347;border-radius:4px;padding:2px 6px}#m-tut .kc.wide{min-width:74px}
#m-tut .tn{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.18);font-size:12px;opacity:.85}
#m-tut .tf{margin-top:10px;font:700 11px Consolas,monospace;letter-spacing:2px;color:#ffb347;animation:mP 1.4s infinite}@keyframes mP{50%{opacity:.35}}
#m-hint{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);font:600 12px Consolas,monospace;letter-spacing:3px;color:#fff;opacity:0;transition:opacity .8s;text-shadow:0 0 8px #000;pointer-events:none;z-index:20}
#m-hint.on{opacity:.65}
#m-win{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 1.6s;pointer-events:none;z-index:26;color:#fff;font-family:"Segoe UI",Arial,sans-serif;text-align:center}
#m-win.on{opacity:1}#m-win h1{margin:0;font-size:clamp(32px,6.4vw,100px);font-weight:900;letter-spacing:.24em;padding-left:.24em;text-shadow:0 0 18px rgba(255,140,70,.95),0 0 60px rgba(255,80,30,.6),0 2px 4px #000}
#m-win p{margin:18px 0 0;font:600 15px Consolas,monospace;letter-spacing:3px;color:#ffe0c0;text-shadow:0 0 8px #000;line-height:1.8}
#m-flash{position:fixed;inset:0;background:#fff7e0;opacity:0;pointer-events:none;z-index:28}
#m-cross{position:fixed;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#fff;box-shadow:0 0 3px rgba(0,0,0,.7);pointer-events:none;z-index:30}
#m-sol{position:fixed;right:28px;top:22px;text-align:right;font:600 15px Consolas,monospace;letter-spacing:3px;color:#f4e8e0;opacity:0;transition:opacity .8s;pointer-events:none;z-index:20;text-shadow:0 0 8px #000;background:rgba(6,10,18,.55);border-right:4px solid #ff8a4c;border-radius:4px;padding:8px 14px}
#m-sol.on{opacity:1}#m-sol b{display:block;font-size:20px;color:#ffb347;letter-spacing:5px}#m-sol small{display:block;font-size:10px;opacity:.6;letter-spacing:3px}
#m-walk{position:fixed;right:28px;top:50%;transform:translateY(-50%);width:330px;padding:14px 18px;background:rgba(6,10,18,.72);border-left:4px solid #ffb347;border-radius:4px;color:#f2f5fa;font:14px "Segoe UI",Arial,sans-serif;opacity:0;transition:opacity .6s;pointer-events:none;z-index:25;box-shadow:0 4px 24px rgba(0,0,0,.5)}
#m-walk.on{opacity:1}#m-walk .h{font:700 11px Consolas,monospace;letter-spacing:3px;color:#ffb347;margin-bottom:8px}
#m-walk .s{display:flex;align-items:center;gap:10px;padding:5px 0;opacity:.45}#m-walk .s.a{opacity:1}#m-walk .s.d{opacity:.7}
#m-walk .c{width:16px;height:16px;border:2px solid #fff;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px}#m-walk .s.d .c{background:#7dff9a;border-color:#7dff9a;color:#031}
#m-walk kbd{font:700 12px Consolas,monospace;border:1px solid #ffb347;color:#ffb347;border-radius:3px;padding:1px 6px;margin-left:6px}#m-walk .x{font-size:12px;opacity:.7;margin:2px 0 4px 26px}
#m-over{position:fixed;inset:0;background:#000;opacity:0;transition:opacity 1.2s;pointer-events:none;z-index:40;display:flex;align-items:center;justify-content:center}
#m-over.on{opacity:1}#m-over h1{margin:0;color:#ff5a4a;font:800 clamp(24px,3.6vw,54px) "Segoe UI",Arial,sans-serif;letter-spacing:.16em;text-align:center;text-shadow:0 0 22px rgba(255,60,40,.7)}`;
const HTML=`
<div id="m-title"><h1>GOING TO MARS</h1><small>EARTH ORBIT &rarr; MARS &nbsp;&middot;&nbsp; ~7 MONTHS IN TRANSIT</small></div>
<div id="m-cap"></div><div id="m-status"></div>
<div id="m-hud">
 <div class="r"><span class="k">ALTITUDE</span><span><span class="v" id="mh-alt">0</span><span class="u"> m</span></span></div>
 <div class="r"><span class="k">VERT. VELOCITY</span><span><span class="v" id="mh-vy">0</span><span class="u"> m/s</span></span></div>
 <div class="r sm"><span class="k">H. VELOCITY</span><span id="mh-vx">0.0 m/s</span></div>
 <div class="r sm"><span class="k">TILT</span><span id="mh-th">0.0&deg;</span></div>
 <div class="r sm"><span class="k">PAD OFFSET</span><span id="mh-pad">0 m</span></div>
 <div class="r"><span class="k">FUEL</span><span class="v s" id="mh-fp">100%</span></div><div class="bar"><i id="mh-fuel"></i></div>
 <div class="r"><span class="k">THROTTLE</span><span class="v s" id="mh-tp">0%</span></div><div class="bar t"><i id="mh-thr"></i></div>
 <div class="lim">SAFE TOUCHDOWN: V &lt; 9 m/s &middot; DRIFT &lt; 6 m/s &middot; TILT &lt; 20&deg;</div>
</div>
<div id="m-tut"><div class="th">LANDING GUIDE<span>RETRO-PROPULSIVE DESCENT</span></div>
 <div class="tr"><span class="kc">W</span><span class="kc">&uarr;</span><div><b>MAIN RETRO-THRUST</b><br>Controls descent velocity. Hold to burn, release to coast. Hovering takes about 35% throttle.</div></div>
 <div class="tr"><span class="kc">A</span><span class="kc">D</span><div><b>PITCH / TILT ADJUSTMENT</b><br>Controls lateral drift. Thrust pushes the way the nose leans, so tilt toward the pad to cancel your drift.</div></div>
 <div class="tr"><span class="kc wide">SPACE</span><div><b>DESCENT THRUSTERS / FINE RCS</b><br>Hold for fine trim: damps drift and spin and adds a little lift. Costs fuel.</div></div>
 <div class="tn">Touch down under 9 m/s vertical, 6 m/s drift and 20&deg; tilt. Mars&rsquo; air is too thin to brake with drag alone: light the engine late, burn hard, and watch your fuel.</div>
 <div class="tf">PRESS ANY CONTROL TO TAKE OVER &middot; TIME IS SLOWED UNTIL YOU ACT</div></div>
<div id="m-hint">[W] THRUST &nbsp;&middot;&nbsp; [A][D] TILT &nbsp;&middot;&nbsp; [SPACE] FINE RCS &nbsp;&middot;&nbsp; [R] RETRY</div>
<div id="m-win"><h1>WELCOME TO MARS</h1><p id="mw-s"></p></div>
<div id="m-flash"></div>
<div id="m-cross"></div><div id="m-sol"><b>SOL 1</b><span id="m-clock">16:20:00</span><small>LOCAL MEAN SOLAR TIME</small></div><div id="m-walk"></div><div id="m-over"><h1>CRASHED! PRESS [R] TO RETRY</h1></div>`;

/* =====================================================================================================
   SALVAGE LOOP  -  descent-stage soft landing  ·  rocket-debris salvage  ·  4-slot hotbar inventory
   -----------------------------------------------------------------------------------------------------
   1. EJECTION    : at EJECT_ALT the crew capsule is fired clear (see MarsPhase.eject). The unmanned descent
                    stage then flies itself down (Salvage.autoLand) and is scorched by atmospheric friction and
                    breaks apart on touchdown a short walk from the capsule: burn marks, charred debris and ONE intact
                    component that the player must find, inspect and harvest.
   2. OBJECTIVE   : "Objective: Locate and inspect the undamaged rocket debris." + distance / bearing arrow.
   3. SALVAGE     : walk up to the intact component -> "Press [E] to Inspect" (2.4 s scan) -> it is harvested
                    and fills the hotbar. An invisible wall limits the valley; a few shallow craters dot the ground.
   4. HOTBAR      : slots [1]-[4]; keys 1-4 or mouse wheel. Icons are rendered from real 3D models, and the
                    selected item is also held in first person. A short tutorial appears after salvaging.
   The old Mars Research Base (base.js) is still imported and constructed, but its activation is switched
   off in MarsPhase.startWalk / updLanding (search "BASE PHASE DISABLED") so it can be re-enabled later.
   ===================================================================================================== */
const EJECT_ALT=600;            // m above ground at which the capsule ejects from the descent stage
const STAGE_OFFSET=25;          // m the unmanned stage steers sideways so it lands clear of the capsule
const SALVAGE_RANGE=11,INSPECT_RANGE=4.2;         // m (horizontal, from the stage's axis) within which [E] works
const SLOTS=4;

/* ---------------------------------------------- 3D item models ---------------------------------------- */
const stdMat=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.6,metalness:.1},o));
/* smooth, position-keyed lumpiness (no cracks at sphere seams) */
function lumpGeo(geo,amp,seed){const p=geo.attributes.position,v=new V3(),n=new V3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);n.copy(v).normalize();
  const d=1+amp*(Math.sin(n.x*3.1+seed)*Math.sin(n.y*2.7+seed*1.7)+Math.sin(n.z*3.4+seed*.6)*Math.cos(n.x*2.2+seed))*.5;
  v.multiplyScalar(d);p.setXYZ(i,v.x,v.y,v.z)}
 geo.computeVertexNormals();return geo}
/* centre + scale a model into a wrapper group (nominal extents are passed in, so no bounding-box guessing) */
function fit(o,size,ref,cy){o.position.y-=cy;const w=new THREE.Group();w.add(o);w.scale.setScalar(size/ref);return w}
/* ---- reflection environment: without one, every metallic material (steel, bucket, crucible, panels, tools) renders almost black.
   kind 0 = Martian outdoors (butterscotch sky, red ground, small sun), kind 1 = lit habitat interior. Baked once per renderer via PMREM. ---- */
function makeEnv(rend,kind){const sc=new THREE.Scene(),vs='varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
 const fs=kind?'varying vec3 vD;void main(){vec3 d=normalize(vD);float h=d.y;vec3 c=mix(vec3(.30,.27,.25),vec3(.80,.77,.72),h*.5+.5);c+=vec3(1.,.93,.80)*smoothstep(.8,1.,h)*2.2;c+=vec3(.9,.6,.4)*pow(max(1.-abs(h),0.),6.)*.25;gl_FragColor=vec4(c,1.);}'
  :'varying vec3 vD;void main(){vec3 d=normalize(vD);float h=d.y;vec3 sky=mix(vec3(.82,.57,.44),vec3(.50,.37,.36),pow(max(h,0.),.5));vec3 gnd=mix(vec3(.58,.35,.24),vec3(.28,.16,.11),clamp(-h*2.,0.,1.));vec3 c=h>0.?sky:gnd;c+=vec3(1.,.86,.66)*pow(max(dot(d,normalize(vec3(-.6,.45,.78))),0.),60.)*3.;gl_FragColor=vec4(c,1.);}';
 sc.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:vs,fragmentShader:fs})));
 const pm=new THREE.PMREMGenerator(rend),t=pm.fromScene(sc,0,.1,100).texture;pm.dispose();return t}

/* POTATO SEEDS: a small heap of lumpy seed potatoes, a couple already sprouting */
function modelSeeds(){const g=new THREE.Group(),
 tex=canvasTex(128,128,(x,w,h)=>{x.fillStyle='#b88d55';x.fillRect(0,0,w,h);
  for(let i=0;i<520;i++){x.fillStyle=`rgba(${rnd(70,130)|0},${rnd(50,90)|0},${rnd(25,50)|0},${rnd(.08,.3).toFixed(2)})`;x.fillRect(rnd(0,w),rnd(0,h),rnd(1,3),rnd(1,3))}
  for(let i=0;i<9;i++){x.fillStyle='rgba(58,36,18,.7)';x.beginPath();x.ellipse(rnd(8,w-8),rnd(8,h-8),rnd(2,4),rnd(1.5,3),rnd(0,3),0,7);x.fill()}}),
 mat=stdMat(0xffffff,{map:tex,roughness:.88,metalness:0}),sprM=stdMat(0xd9d3a6,{roughness:.7,metalness:0}),tipM=stdMat(0x7b4b9c,{roughness:.6,metalness:0});
 const T=[[0,.075,0,.11,1.25,.9,1,.3],[.2,.065,.07,.095,1.2,.85,1,1.2],[-.19,.07,.06,.1,1.1,.9,1.05,2.1],[.07,.062,-.2,.09,1.25,.85,1,3.3],[-.05,.17,-.02,.085,1.15,.9,1,4.4],[.14,.15,-.12,.075,1.2,.9,1,5.5]];
 T.forEach(([x,y,z,r,sx,sy,sz,s],i)=>{const m=new THREE.Mesh(lumpGeo(new THREE.SphereGeometry(r,22,16),.5,s),mat);m.scale.set(sx,sy,sz);m.position.set(x,y,z);m.rotation.set(i*1.3,i*2.1,i*.7);g.add(m);
  if(i%2===0){const sp=new THREE.Mesh(new THREE.ConeGeometry(.012,.07,6),sprM);sp.position.set(r*.25,r*.95,0);sp.rotation.z=-.3;m.add(sp);
   const tp=new THREE.Mesh(new THREE.SphereGeometry(.014,8,6),tipM);tp.position.set(r*.25+.012,r*.95+.04,0);m.add(tp)}});
 return g}

/* HEAVY HAMMER: forged steel sledge head with a bolted collar, fibreglass shaft, rubber grip and pommel */
function modelHammer(){const g=new THREE.Group(),
 steel=stdMat(0xa7b0b9,{metalness:.92,roughness:.3}),dark=stdMat(0x3a3f46,{metalness:.8,roughness:.45}),grip=stdMat(0x17181a,{roughness:.9,metalness:0}),
 shaft=stdMat(0xd9632a,{roughness:.5,metalness:.05}),yel=stdMat(0xffc21a,{roughness:.5,metalness:.1});
 const cyl=(r0,r1,h,m,seg=20)=>new THREE.Mesh(new THREE.CylinderGeometry(r0,r1,h,seg),m),
  ring=(r,t,m,y)=>{const q=new THREE.Mesh(new THREE.TorusGeometry(r,t,8,24),m);q.rotation.x=Math.PI/2;q.position.y=y;g.add(q)};
 const h=cyl(.028,.034,1.0,shaft,18);h.position.y=-.48;g.add(h);                                   // shaft
 const gp=cyl(.04,.043,.3,grip,20);gp.position.y=-.84;g.add(gp);for(let i=0;i<4;i++)ring(.043,.005,dark,-.72-i*.07);   // rubber grip + ridges
 const pom=cyl(.05,.042,.035,dark,20);pom.position.y=-1.0;g.add(pom);ring(.036,.007,yel,-.52);   // pommel + safety band
 const head=cyl(.078,.078,.34,steel,28);head.rotation.z=Math.PI/2;g.add(head);                      // head barrel
 for(const s of[-1,1]){const f=cyl(.092,.078,.07,steel,28);f.rotation.z=-s*Math.PI/2;f.position.x=s*.2;g.add(f);                // flared strike faces
  const pl=cyl(.07,.07,.012,dark,28);pl.rotation.z=-s*Math.PI/2;pl.position.x=s*.238;g.add(pl)}
 const col=new THREE.Mesh(new THREE.BoxGeometry(.13,.15,.13),dark);g.add(col);                       // collar around the shaft
 for(const sx of[-.035,.035]){const b=cyl(.014,.014,.02,dark,6);b.rotation.x=Math.PI/2;b.position.set(sx,0,.07);g.add(b)}
 const top=cyl(.03,.03,.04,steel,16);top.position.y=.085;g.add(top);                                 // shaft end poking through
 return g}

/* MARTIAN REGOLITH: mound of fine red soil with crushed rock fragments on top */
function modelRegolith(){const g=new THREE.Group(),cols=[0xa9552f,0x8a4328,0xb8683c,0x6e3822,0x9a5a3a,0x7d4a30];
 const base=new THREE.Mesh(lumpGeo(new THREE.ConeGeometry(.28,.13,24,1),.15,9),stdMat(0x7a3d26,{roughness:1,metalness:0}));base.position.y=.065;g.add(base);
 for(let i=0;i<9;i++){const r=rnd(.04,.085),m=new THREE.Mesh(lumpGeo(new THREE.IcosahedronGeometry(r,0),.7,i*3.7),stdMat(cols[i%cols.length],{roughness:.95,metalness:0,flatShading:true})),a=i*2.4,d=rnd(0,.17);
  m.position.set(Math.cos(a)*d,r*.55+.1*(1-d/.2),Math.sin(a)*d);m.rotation.set(rnd(0,6),rnd(0,6),rnd(0,6));g.add(m)}
 const N=220,gm=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),stdMat(0xffffff,{roughness:1,metalness:0,flatShading:true}),N),M=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),c=new THREE.Color();
 for(let i=0;i<N;i++){const a=rnd(0,6.283),d=Math.pow(Math.random(),.6)*.27,s=rnd(.008,.022),y=Math.max(0,.12*(1-(d/.27)**2))*Math.random()+s*.5;
  M.compose(new V3(Math.cos(a)*d,y,Math.sin(a)*d),q.setFromEuler(e.set(rnd(0,6),rnd(0,6),rnd(0,6))),new V3(s,s*.8,s));gm.setMatrixAt(i,M);c.setHSL(.04+rnd(0,.03),.5,rnd(.22,.4));gm.setColorAt(i,c)}
 gm.instanceMatrix.needsUpdate=true;if(gm.instanceColor)gm.instanceColor.needsUpdate=true;g.add(gm);return g}

const ITEMS={
 seeds:   {name:'POTATO SEEDS',    unit:'',    info:'Seed potatoes · plant them in the greenhouse',      build:modelSeeds,   size:.30,ref:.62,cy:.10, icon:{rx:.45,ry:-.5},      hold:{x:.30,y:-.27,z:-.72,rx:.35,ry:-.6}},
 hammer:  {name:'HEAVY HAMMER',    unit:'',    info:'Mechanical sledge · demolition & fabrication',      build:modelHammer,  size:.80,ref:1.15,cy:-.46,icon:{rz:-.75,ry:-.35},    hold:{x:.34,y:-.30,z:-.78,rx:-.55,ry:.2,rz:-.2}},
 regolith:{name:'MARTIAN REGOLITH',unit:' kg', info:'Crushed red soil & rock · for future base building',build:modelRegolith,size:.28,ref:.62,cy:.08, icon:{rx:.3,ry:.6},        hold:{x:.28,y:-.26,z:-.68,rx:.35}}};
patchItems(ITEMS,{modelHammer,fit});patchCraftItems(ITEMS,{fit,modelHammer});patchFarmItems(ITEMS);patchSol2Items(ITEMS);patchSol3Items(ITEMS);   /* crafting items, torch rig, hand rigs for every held item */   /* bucket, ice, HMSA rock samples, hammer hand-rig */
const ITEM_FALLBACK=id=>({name:String(id).toUpperCase().replace(/_/g,' '),unit:'',info:'',build:()=>new THREE.Group(),size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold:{x:.28,y:-.26,z:-.68,rx:.3}});
const itemDef=id=>ITEMS[id]||ITEM_FALLBACK(id);   /* SAFETY: an item id with no definition can no longer throw "reading 'name'" */
const ITEMS_SAFE=new Proxy(ITEMS,{get:(o,k)=>(typeof k==='string'&&!(k in o))?ITEM_FALLBACK(k):o[k]});

/* one-off offscreen render of every item model into a PNG data-URL for the hotbar */
function renderIcons(){const out={};let rr=null;
 try{rr=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});rr.setPixelRatio(1);rr.setSize(192,192,false);rr.setClearColor(0x000000,0);
  const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(30,1,.1,20);sc.add(new THREE.HemisphereLight(0xffe6d0,0x6a3a28,1.5));sc.environment=makeEnv(rr,0);sc.environmentIntensity=.9;
  const key=new THREE.DirectionalLight(0xffffff,2.8);key.position.set(2,3,2.5);sc.add(key);const rim=new THREE.DirectionalLight(0x9fd8ff,1.1);rim.position.set(-3,1,-2);sc.add(rim);
  cam.position.set(0,.3,2.7);cam.lookAt(0,0,0);
  for(const id of[...Object.keys(ITEMS),'bucketw','bucketi']){const d=ITEMS[id==='bucketw'||id==='bucketi'?'bucket':id],m=fit(id==='bucketw'?d.buildFull():id==='bucketi'?d.buildIce():d.build(),1,d.ref,d.cy);m.rotation.set(d.icon.rx||0,d.icon.ry||0,d.icon.rz||0);sc.add(m);rr.render(sc,cam);out[id]=rr.domElement.toDataURL('image/png');sc.remove(m)}}
 catch(e){console.warn('hotbar icon render failed',e)}
 finally{if(rr){rr.dispose();try{rr.forceContextLoss()}catch(e){}}}
 return out}

/* ---------------------------------------------- wreck textures: soot / burn marks --------------------------- */
let _soot=null;
const sootTex=()=>_soot||(_soot=canvasTex(256,256,(x,w,h)=>{x.fillStyle='#1b1613';x.fillRect(0,0,w,h);
 for(let i=0;i<900;i++){x.fillStyle=`rgba(${rnd(0,50)},${rnd(0,36)},${rnd(0,30)},${rnd(.2,.6)})`;x.fillRect(rnd(0,w),rnd(0,h),rnd(1,6),rnd(1,14))}
 for(let i=0;i<26;i++){const gx=rnd(0,w),gr=x.createLinearGradient(gx,0,gx+rnd(-20,20),h);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.5,`rgba(0,0,0,${rnd(.25,.6)})`);gr.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gr;x.fillRect(gx-rnd(2,9),0,rnd(4,18),h)}   // soot streaks
 for(let i=0;i<70;i++){x.fillStyle=`rgba(${rnd(120,210)},${rnd(50,90)},${rnd(10,30)},${rnd(.08,.35)})`;x.beginPath();x.arc(rnd(0,w),rnd(0,h),rnd(1,5),0,7);x.fill()}                       // heat tint / rust
 for(let i=0;i<50;i++){x.fillStyle=`rgba(${rnd(120,170)},${rnd(115,160)},${rnd(110,150)},${rnd(.15,.4)})`;x.fillRect(rnd(0,w),rnd(0,h),rnd(1,3),rnd(1,3))}}));                           // bare metal flecks
const scorchTex=()=>canvasTex(512,512,(x,w,h)=>{x.clearRect(0,0,w,h);const c=w/2,gr=x.createRadialGradient(c,c,6,c,c,c);
 gr.addColorStop(0,'rgba(6,4,3,.97)');gr.addColorStop(.35,'rgba(10,7,5,.9)');gr.addColorStop(.7,'rgba(22,13,8,.5)');gr.addColorStop(1,'rgba(30,18,10,0)');x.fillStyle=gr;x.beginPath();x.arc(c,c,c,0,7);x.fill();
 for(let i=0;i<90;i++){const a=rnd(0,6.2832),r0=rnd(20,90),r1=rnd(150,252);const lg=x.createLinearGradient(c+Math.cos(a)*r0,c+Math.sin(a)*r0,c+Math.cos(a)*r1,c+Math.sin(a)*r1);lg.addColorStop(0,`rgba(4,3,2,${rnd(.3,.7)})`);lg.addColorStop(1,'rgba(4,3,2,0)');x.strokeStyle=lg;x.lineWidth=rnd(1.5,9);x.beginPath();x.moveTo(c+Math.cos(a)*r0,c+Math.sin(a)*r0);x.lineTo(c+Math.cos(a)*r1,c+Math.sin(a)*r1);x.stroke()}   // blast streaks
 for(let i=0;i<5;i++){x.strokeStyle=`rgba(120,60,25,${rnd(.08,.2)})`;x.lineWidth=rnd(2,6);x.beginPath();x.arc(c,c,rnd(70,200),0,7);x.stroke()}});                                                      // scorched ring halos
const CHAR=new THREE.Color(0x120d0b),EMB=new THREE.Color(.2,.045,0);

/* ---------------------------------------------- Salvage controller ---------------------------------------- */
const SV_CSS=`
#sv-obj{position:fixed;left:28px;top:22px;z-index:24;max-width:380px;padding:12px 18px 12px;background:rgba(6,10,18,.74);border-left:4px solid #ffb347;border-radius:4px;color:#f2f5fa;font:600 14px "Segoe UI",Arial,sans-serif;letter-spacing:.5px;opacity:0;transform:translateX(-20px);transition:opacity .6s,transform .6s,border-color .4s;pointer-events:none;box-shadow:0 4px 24px rgba(0,0,0,.5)}
#sv-obj.on{opacity:1;transform:none}#sv-obj.ok{border-left-color:#7dff9a}
#sv-obj .h{font:700 10px Consolas,monospace;letter-spacing:4px;color:#ffb347;margin-bottom:6px}#sv-obj.ok .h{color:#7dff9a}
#sv-obj .t b{color:#ffb347;letter-spacing:1px}#sv-obj.ok .t b{color:#7dff9a}
#sv-obj .dr{display:flex;align-items:center;gap:10px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.16);font:700 13px Consolas,monospace;letter-spacing:2px;color:#9fe9ff}
#sv-obj .dr span:first-child{display:inline-block;font-size:18px;color:#ffb347;transition:transform .08s linear;text-shadow:0 0 8px rgba(255,179,71,.8)}
#sv-prompt{position:fixed;left:50%;bottom:27%;transform:translateX(-50%) translateY(10px);z-index:25;padding:13px 30px;font:700 22px "Segoe UI",Arial,sans-serif;letter-spacing:3px;color:#fff;background:rgba(6,10,18,.78);border:1px solid rgba(255,179,71,.7);border-radius:6px;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;text-shadow:0 0 10px #000;animation:svGlow 1.5s infinite}
#sv-prompt.on{opacity:1;transform:translateX(-50%)}#sv-prompt .kb{color:#ffb347;border:2px solid #ffb347;border-radius:4px;padding:0 10px;margin:0 4px}
@keyframes svGlow{50%{box-shadow:0 0 24px rgba(255,179,71,.6)}}
#sv-hb{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:12px;z-index:25;opacity:0;transition:opacity .6s;pointer-events:none;font-family:Consolas,monospace}
#sv-hb.on{opacity:1}
.sv-s{position:relative;width:78px;height:78px;box-sizing:border-box;background:linear-gradient(160deg,rgba(14,28,40,.9),rgba(5,9,16,.9));border:1px solid rgba(93,230,255,.38);border-radius:3px;transition:transform .15s,border-color .15s,box-shadow .15s,background .15s}
.sv-s::before,.sv-s::after{content:"";position:absolute;width:11px;height:11px;border:2px solid #5de6ff;opacity:.85;transition:border-color .15s}
.sv-s::before{left:-4px;top:-4px;border-right:0;border-bottom:0}.sv-s::after{right:-4px;bottom:-4px;border-left:0;border-top:0}
.sv-s .k{position:absolute;left:6px;top:3px;font:700 11px Consolas,monospace;letter-spacing:1px;color:#8fd9ee}
.sv-s .ic{position:absolute;inset:8px 6px 6px 6px;display:flex;align-items:center;justify-content:center}
.sv-s .ic img{width:62px;height:62px;object-fit:contain;filter:drop-shadow(0 3px 5px rgba(0,0,0,.7))}
.sv-s .ic em{font:700 22px Consolas,monospace;color:rgba(143,217,238,.28);font-style:normal}
.sv-s .n{position:absolute;right:5px;bottom:3px;font:800 12px Consolas,monospace;color:#fff;text-shadow:0 1px 3px #000,0 0 6px #000}
.sv-s.empty{border-style:dashed;border-color:rgba(93,230,255,.2)}.sv-s.empty::before,.sv-s.empty::after{opacity:.35}
.sv-s.sel{border-color:#ffb347;background:linear-gradient(160deg,rgba(60,38,10,.92),rgba(14,10,6,.92));transform:translateY(-8px) scale(1.07);box-shadow:0 0 18px rgba(255,179,71,.55),inset 0 0 14px rgba(255,179,71,.18)}
.sv-s.sel::before,.sv-s.sel::after{border-color:#ffb347}.sv-s.sel .k{color:#ffb347}
.sv-s.pop .ic img{animation:svPop .55s cubic-bezier(.2,1.6,.4,1) both}
@keyframes svPop{0%{transform:scale(0) rotate(-40deg);opacity:0}100%{transform:none;opacity:1}}
#sv-name{position:fixed;left:50%;bottom:122px;transform:translateX(-50%);z-index:25;text-align:center;opacity:0;transition:opacity .35s;pointer-events:none;text-shadow:0 0 10px #000,0 1px 3px #000}
#sv-name b{display:block;font:800 16px Consolas,monospace;letter-spacing:4px;color:#ffb347}#sv-name span{font:500 12px "Segoe UI",Arial,sans-serif;letter-spacing:1.5px;color:#e8f2f8;opacity:.85}
#sv-tut{position:fixed;left:50%;bottom:158px;transform:translateX(-50%) translateY(14px);z-index:25;width:min(460px,86vw);padding:14px 20px 14px;background:rgba(6,10,18,.8);border-left:4px solid #5de6ff;border-radius:4px;color:#f2f5fa;font:14px "Segoe UI",Arial,sans-serif;opacity:0;transition:opacity .5s,transform .5s;pointer-events:none;box-shadow:0 4px 24px rgba(0,0,0,.55)}
#sv-tut.on{opacity:1;transform:translateX(-50%)}
#sv-tut .h{font:700 11px Consolas,monospace;letter-spacing:4px;color:#5de6ff;margin-bottom:9px}
#sv-tut .r{display:flex;align-items:center;gap:10px;margin:7px 0;opacity:.95}#sv-tut .r.d{opacity:.55}
#sv-tut .r .c{flex:none;width:18px;height:18px;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px}#sv-tut .r.d .c{background:#7dff9a;border-color:#7dff9a;color:#031}
#sv-tut kbd{font:700 12px Consolas,monospace;border:1px solid #ffb347;color:#ffb347;border-radius:3px;padding:1px 6px;margin-right:3px}
`;
class Salvage{
 constructor(mp){this.mp=mp;this.stage='off';this.inv=new Array(SLOTS).fill(null);this.sel=0;this.icons=null;this.walking=false;this.tx=0;
  this.vm=null;this.vmItems={};this.vmDip=0;this.px=0;this.pz=0;this.sp=0;
  this.comp=null;this.wk=null;this.wkCols=[];this.wkMats=[];this.smoke=[];this.wkT=0;this.insp=-1;this.scMats=null;this.scT=0;this.bnd=null;this.pt='';this.emberMat=null;this.wkLight=null;
  this.tutOn=false;this.tutT=0;this.tutKeys=false;this.tutWheel=false;this.tutDone=0;this.tutStart=-1;this.objT=0;this.nameT=0;this.wheelT=0;this.promptOn=false;
  this.bag=new Array(BAG).fill(null);this.build();this.tk=new Tasks(mp,this,heightAt);this.cr=new Crafting(mp,this,heightAt);addEventListener('wheel',e=>this.onWheel(e),{passive:true});setTimeout(()=>this.makeIcons(),2500)}

 /* ---------- DOM ---------- */
 build(){const st=document.createElement('style');st.textContent=SV_CSS;document.head.appendChild(st);
  const d=document.createElement('div');d.innerHTML=
   `<div id="sv-obj"><div class="h">MISSION OBJECTIVE</div><div class="t" id="sv-ot"></div><div class="dr" id="sv-dr"><span id="sv-ar">&#9650;</span><span id="sv-di"></span></div></div>
<div id="sv-prompt">Press <span class="kb">[E]</span> to Salvage Resources</div>
<div id="sv-name"><b></b><span></span></div>
<div id="sv-tut"><div class="h">INVENTORY HOTBAR</div>
 <div class="r" id="sv-t1"><span class="c"></span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> Press a number key to select a slot</span></div>
 <div class="r" id="sv-t2"><span class="c"></span><span><kbd>MOUSE WHEEL</kbd> Scroll to cycle through the slots</span></div></div>
<div id="sv-hb"></div>`;
  while(d.firstChild)document.body.appendChild(d.firstChild);
  const hb=$('sv-hb');for(let i=0;i<SLOTS;i++)hb.insertAdjacentHTML('beforeend',`<div class="sv-s empty" id="sv-s${i}"><span class="k">[${i+1}]</span><div class="ic"><em>&mdash;</em></div><span class="n"></span></div>`);
  $('sv-s0').classList.add('sel')}
 ITEMS_(){return ITEMS_SAFE}
 makeIcons(){if(this.icons)return;this.icons=renderIcons();this.renderSlots(false)}
 renderSlots(pop){for(let i=0;i<SLOTS;i++){const el=$('sv-s'+i),it=this.inv[i],ic=el.querySelector('.ic'),n=el.querySelector('.n');
   el.classList.toggle('empty',!it);el.classList.remove('pop');
   if(!it){ic.innerHTML='<em>&mdash;</em>';n.textContent=''}
   else{const d=itemDef(it.id),src=this.icons&&this.icons[iconKey(it)];ic.innerHTML=src?`<img src="${src}" alt="${d.name}">`:`<em style="color:#ffb347">${d.name[0]}</em>`;n.textContent=slotText(it,d);
    if(pop){const im=ic.querySelector('img');if(im)im.style.animationDelay=i*.18+'s';el.classList.add('pop')}}}
  this.syncSel()}
 syncSel(){for(let i=0;i<SLOTS;i++)$('sv-s'+i).classList.toggle('sel',i===this.sel)}
 showName(){const it=this.inv[this.sel],e=$('sv-name'),b=e.querySelector('b'),s=e.querySelector('span');
  if(it){const d=itemDef(it.id);b.textContent=nameText(it,d);s.textContent=d.info}
  else{b.textContent='EMPTY SLOT';s.textContent='Nothing equipped'}
  e.style.opacity=1;this.nameT=2.6}

 /* ---------- input ---------- */
 select(i,src){if(!this.walking||(this.mp.sv&&this.mp.sv.dead))return;i=((i%SLOTS)+SLOTS)%SLOTS;
  if(this.tutOn){if(src==='key')this.tutKeys=true;else if(src==='wheel')this.tutWheel=true;$('sv-t1').classList.toggle('d',this.tutKeys);$('sv-t1').firstChild.innerHTML=this.tutKeys?'&#10003;':'';$('sv-t2').classList.toggle('d',this.tutWheel);$('sv-t2').firstChild.innerHTML=this.tutWheel?'&#10003;':''}
  if(i===this.sel){this.showName();return}
  this.sel=i;this.vmDip=1;this.syncSel();this.showName();this.mp.tone&&this.mp.tone(520+i*70,.07,.04,'square')}
 onWheel(e){if(!this.walking||!this.mp.walk||this.tk.ui||Math.abs(e.deltaY)<1)return;const now=performance.now();if(now-this.wheelT<90)return;this.wheelT=now;this.select(this.sel+(e.deltaY>0?1:-1),'wheel')}
 interact(){if(this.stage!=='down'||!this.comp||!this.inRange()||(this.mp.sv&&this.mp.sv.dead))return false;if(this.insp<0){this.insp=0;this.mp.tone&&this.mp.tone(420,.25,.05,'triangle')}return true}
 inRange(){const P=this.mp.pk,c=this.comp;return !!P&&!!c&&Math.hypot(c.x-P.x,c.z-P.z)<=INSPECT_RANGE}

 /* ---------- descent stage: autonomous soft landing ---------- */
 begin(){this.stage='descending';this.tx=this.mp.L.x+STAGE_OFFSET;this.scT=0}
 hear(){const p=this.mp.cp,L=this.mp.L;return clamp(1-Math.hypot(p.x-L.x,p.y-L.y,p.z)/700,.06,1)}
 autoLand(dt){if(this.stage!=='descending')return;this.scT=Math.min(1,this.scT+dt/14);this.scorch(this.scT);const mp=this.mp,L=mp.L,gm=x=>Math.max(groundAt(x-FOOT),groundAt(x+FOOT)),alt=L.y-COM-gm(L.x);
  /* sideways: steer to the landing point, fading out near the ground so it touches down upright */
  const nr=sstep(4,60,alt),vxT=clamp((this.tx-L.x)*.22,-11,11)*nr;
  L.vx+=(vxT-L.vx)*Math.min(1,dt*.9);L.th+=(clamp((vxT-L.vx)*.08,-.22,.22)*nr-L.th)*Math.min(1,dt*2.2);L.om=0;
  /* vertical: the crew has ejected, so the abandoned stage is NOT brought to a hover - engine cut, it dives straight in and blows up
     (about 6-8 s) well before the capsule's parachute touches down */
  L.thr+=(0-L.thr)*Math.min(1,dt*6);
  if(L.vy>-30)L.vy+=(-30-L.vy)*Math.min(1,dt*3);          // never hangs in the air
  L.vy=Math.max(-120,L.vy-(G+9)*dt);
  L.x+=L.vx*dt;L.y+=L.vy*dt;
  const g2=gm(L.x);if(L.y-COM-g2<=.02)this.touchDown(g2)}
 touchDown(g){const mp=this.mp,L=mp.L;L.y=g+COM;L.vx=L.vy=L.om=L.th=0;L.thr=0;this.stage='down';mp.exhaust(0,0,0);this.scorch(.95);this.wreck(g);
  mp.cap('DESCENT STAGE IMPACT  \u00b7  STRUCTURAL FAILURE',3400);mp.sub('Heat-soaked by atmospheric friction and crushed on touchdown, the descent stage broke apart. Of the whole vehicle only ONE component survived undamaged - find it among the burnt wreckage.','WRECKAGE',7000)}

 /* ---------- atmospheric-friction char on the real hull (restored on retry) ---------- */
 scorch(k){const mp=this.mp;if(!this.scMats){this.scMats=[];const seen=new Set();mp.rocket.traverse(o=>{if(!o.isMesh)return;for(const m of(Array.isArray(o.material)?o.material:[o.material])){if(!m||seen.has(m)||!m.color)continue;seen.add(m);this.scMats.push({m,c:m.color.clone(),e:m.emissive?m.emissive.clone():null})}})}
  for(const o of this.scMats){o.m.color.copy(o.c).lerp(CHAR,k*.82);if(o.e)o.m.emissive.copy(o.e).lerp(EMB,k)}}
 scorchReset(){if(!this.scMats)return;for(const o of this.scMats){o.m.color.copy(o.c);if(o.e)o.m.emissive.copy(o.e)}this.scT=0}

 /* ---------- the wreck: scorched decal, charred hull fragments, smouldering vents, ONE intact component ---------- */
 wreck(g){const mp=this.mp,L=mp.L,cx=L.x,H=heightAt,grp=new THREE.Group(),hr=this.hear();mp.lander.visible=false;mp.rocket.visible=false;mp.near.add(grp);this.wk=grp;this.wkCols=[];this.wkMats=[];this.smoke=[];this.wkT=0;
  /* violent impact: fireball, black smoke, shock-dust ring, flash */
  const q=.7;for(let i=0;i<Math.round(110*q);i++){const a=rnd(0,6.28),e=rnd(.05,1.4),sp=rnd(4,48),ca=Math.cos(a)*Math.cos(e),sa=Math.sin(a)*Math.cos(e);mp.fire.emit(cx+rnd(-4,4),g+rnd(1,16),rnd(-4,4),ca*sp,Math.sin(e)*sp+4,sa*sp,rnd(.7,1.9),rnd(10,20),rnd(26,52),1,rnd(.45,.7),rnd(.12,.3),.9,.7,3)}
  for(let i=0;i<Math.round(120*q);i++){const a=rnd(0,6.28),e=rnd(.1,1.2),sp=rnd(2,26);mp.puffs.emit(cx+rnd(-5,5),g+rnd(1,14),rnd(-5,5),Math.cos(a)*Math.cos(e)*sp,Math.sin(e)*sp+6,Math.sin(a)*Math.cos(e)*sp,rnd(3.5,7.5),rnd(14,24),rnd(55,110),.12,.10,.09,.7,.5,3.5)}
  for(let i=0;i<170;i++){const a=rnd(0,6.28),sp=rnd(30,95);mp.puffs.emit(cx,g+rnd(.5,3),0,Math.cos(a)*sp,rnd(0,5),Math.sin(a)*sp,rnd(3,6.5),rnd(10,18),rnd(40,80),.80,.54,.40,.6,.9,.3,-.2)}
  for(let i=0;i<110;i++){const a=rnd(0,6.28),e=rnd(.1,1.5),sp=rnd(20,85);mp.fire.emit(cx,g+rnd(1,6),0,Math.cos(a)*Math.cos(e)*sp,Math.sin(e)*sp,Math.sin(a)*Math.cos(e)*sp,rnd(.8,2.2),rnd(1,2),.5,1,rnd(.7,.9),rnd(.3,.5),1,.15,0,-G)}
  mp.flash.position.set(cx,g+16,0);mp.flashI=3.2e5;mp.shockRing.visible=true;mp.shockRing.position.set(cx,g+.4,0);mp.ringT=0;mp.kick=Math.max(mp.kick,2.6*hr);mp.fovKick=Math.max(mp.fovKick,7*hr);mp.boom&&hr>.25&&mp.boom();
  /* scorched ground decal, conformed to the terrain */
  const dh=27,N=40,geo=new THREE.PlaneGeometry(dh*2,dh*2,N,N);geo.rotateX(-Math.PI/2);const pp=geo.attributes.position;for(let i=0;i<pp.count;i++){const x=pp.getX(i)+cx,z=pp.getZ(i);pp.setXYZ(i,x,H(x,z)+.07,z)}geo.computeVertexNormals();
  const dm=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:scorchTex(),transparent:true,depthWrite:false,roughness:1,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));dm.receiveShadow=true;dm.renderOrder=1;dm.frustumCulled=false;grp.add(dm);this.wkMats.push(dm.material);
  /* charred materials: soot map over blackened metal, plus blackened clones of the real hull paint */
  const mk=(c,o={})=>{const m=new THREE.MeshStandardMaterial(Object.assign({map:sootTex(),color:c,roughness:.95,metalness:.25,emissive:0x1c0700,emissiveIntensity:.5,side:THREE.DoubleSide},o));this.wkMats.push(m);return m};
  const M4=[mk(0x8a8480),mk(0x55504b),mk(0x2d2825),mk(0x93603c)],hull=(mp.debMats||[]).map(m=>{const c=m.clone();c.color.multiplyScalar(.26);c.emissive=new THREE.Color(0x1c0700);c.emissiveIntensity=.45;c.roughness=1;this.wkMats.push(c);return c});
  const pick=()=>Math.random()<.4&&hull.length?hull[Math.floor(Math.random()*hull.length)]:M4[Math.floor(Math.random()*M4.length)];
  this.wkPieces=[];this.wkBorn=performance.now();
  const put=(geo,mat,x,z,rx,ry,rz,lift,cl)=>{const m=new THREE.Mesh(geo,mat);this.wkPieces.push({m,cl:null});m.position.set(x,H(x,z)+lift,z);m.rotation.set(rx,ry,rz);m.castShadow=m.receiveShadow=true;grp.add(m);if(cl){const c={x,z,r:cl[0],h:cl[1]};mp.rockCols.push(c);this.wkCols.push(c);this.wkPieces[this.wkPieces.length-1].cl=c}return m};
  /* big recognisable wreckage */
  put(new THREE.CylinderGeometry(.55,2.1,3.4,18,1,true),M4[2],cx+3,2.5,1.2,.4,.5,1.0,[1.9,1.6]);                         // engine bell, tipped over
  put(new THREE.CylinderGeometry(1.85,1.85,7.5,20,1,true,0,3.9),hull[0]||M4[1],cx-6,-4,1.5,.7,.1,1.3,[2.3,1.8]);          // peeled tank shell
  put(new THREE.SphereGeometry(2.4,18,10,0,6.283,0,1.9),M4[1],cx-12,6,.5,0,.4,.3,[2.2,1.4]);                              // crushed tank dome
  put(new THREE.BoxGeometry(.42,.42,6.6),M4[2],cx+8,-8,.1,.8,.25,.9);put(new THREE.BoxGeometry(.4,.4,4.2),M4[2],cx+10.5,-5.5,-.3,2.1,.5,.7);   // bent landing-leg strut
  put(new THREE.BoxGeometry(5.2,.24,3.4),hull[1]||M4[0],cx+1,9.5,.12,.4,.55,1.1,[2.0,1.3]);                                // fairing panel leaning on debris
  for(let i=0;i<3;i++)put(new THREE.CylinderGeometry(.45,.7,1.8,10),M4[i%4],cx-3+i*1.1,-10.5+i*.6,rnd(0,1.6),rnd(0,6),rnd(0,1.6),.5);   // thruster cluster
  put(new THREE.TorusGeometry(2.4,.2,8,22,4.3),M4[1],cx+14,-3,.5,rnd(0,6),.3,.9);                                          // crumpled frame ring
  /* scattered shards of every size */
  for(let i=0;i<30;i++){const kind=i%3,sz=rnd(.3,1.6),a=rnd(0,6.28),d=rnd(3.5,30),x=cx+Math.cos(a)*d,z=Math.sin(a)*d;if(Math.hypot(x-(cx+10),z-7)<5)continue;
   const geo=kind===0?new THREE.CylinderGeometry(1.85,1.85,rnd(1.5,6),10,1,true,rnd(0,6),rnd(.8,2.2)):kind===1?new THREE.BoxGeometry(rnd(.5,3),rnd(.25,1.4),rnd(.4,2)):new THREE.CylinderGeometry(rnd(.2,.8),rnd(.3,1.1),rnd(.8,3),8);
   put(geo,pick(),x,z,rnd(0,6),rnd(0,6),rnd(0,6),sz*.25,sz>1.1?[sz*.8,sz*.6]:null)}
  /* glowing embers, a dying fire-light and smouldering vents */
  this.emberMat=new THREE.MeshStandardMaterial({color:0x331100,emissive:0xff4a10,emissiveIntensity:1.1,roughness:1});this.wkMats.push(this.emberMat);
  for(let i=0;i<14;i++){const a=rnd(0,6.28),d=rnd(1,9),x=cx+Math.cos(a)*d,z=Math.sin(a)*d;put(new THREE.BoxGeometry(rnd(.2,.7),rnd(.1,.3),rnd(.2,.7)),this.emberMat,x,z,rnd(0,6),rnd(0,6),rnd(0,6),.08)}
  this.wkLight=new THREE.PointLight(0xff6a20,46,26,2);this.wkLight.position.set(cx,H(cx,0)+2.2,0);grp.add(this.wkLight);
  for(let i=0;i<6;i++){const a=rnd(0,6.28),d=rnd(1,8),x=cx+Math.cos(a)*d,z=Math.sin(a)*d;this.smoke.push({x,y:H(x,z)+1.2,z})}
  /* THE ONE intact, undamaged, salvageable component */
  const px=cx+10,pz=7,cg=this.makeComponent(),cy=H(px,pz);cg.position.set(px,cy,pz);cg.rotation.y=-.5;grp.add(cg);
  const ring=new THREE.Mesh(new THREE.RingGeometry(1.3,1.5,48),new THREE.MeshBasicMaterial({color:0x7defff,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));ring.rotation.x=-Math.PI/2;ring.position.set(px,cy+.08,pz);grp.add(ring);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,18,14,1,true),new THREE.MeshBasicMaterial({color:0x7defff,transparent:true,opacity:.14,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));beam.position.set(px,cy+9,pz);grp.add(beam);
  const lt=new THREE.PointLight(0x7defff,7,13,2);lt.position.set(px,cy+2.2,pz);grp.add(lt);
  const cl={x:px,z:pz,r:1.15,h:1.6};this.comp={g:cg,x:px,z:pz,ring,beam,light:lt}}

 makeComponent(){const g=new THREE.Group(),M=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.4,metalness:.3},o));
  const white=M(0xeef1f4,{roughness:.35}),or=M(0xff7a1f,{roughness:.5,metalness:.1}),dk=M(0x2a2f36,{metalness:.7,roughness:.5}),st=M(0xb9c2cb,{metalness:.85,roughness:.35});
  const add=(geo,m,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o};
  add(new THREE.BoxGeometry(1.7,1.15,1.1),white,0,.85,0);add(new THREE.BoxGeometry(1.72,.2,1.12),or,0,.85,0);add(new THREE.BoxGeometry(1.76,.08,1.16),dk,0,1.45,0);
  add(new THREE.BoxGeometry(.95,.55,.05),dk,0,.95,.57);
  [[-.3,0x7dff9a],[0,0x7defff],[.3,0xffb347]].forEach(([x,c])=>add(new THREE.BoxGeometry(.14,.1,.03),new THREE.MeshBasicMaterial({color:c}),x,1.02,.6));
  add(new THREE.BoxGeometry(.7,.06,.03),new THREE.MeshBasicMaterial({color:0x7defff}),0,.82,.6);
  for(const sx of[-1,1]){const h=add(new THREE.TorusGeometry(.2,.03,8,16,Math.PI),st,sx*.55,1.52,0);h.rotation.set(0,0,0);add(new THREE.BoxGeometry(.1,.2,.06),dk,sx*.78,.75,.58);for(const sz of[-1,1])add(new THREE.CylinderGeometry(.08,.1,.28,10),st,sx*.7,.14,sz*.4)}
  return g}

 /* ---------- salvage ---------- */
 salvage(){const mp=this.mp,L=mp.L,cp=this.comp,cx0=cp?cp.x:L.x,cz0=cp?cp.z:0,g=heightAt(cx0,cz0);this.stage='salvaged';mp.lander.visible=false;this.insp=-1;
  if(cp){this.wk.remove(cp.g,cp.ring,cp.beam,cp.light);cp.g.traverse(o=>{if(o.geometry)o.geometry.dispose()});cp.ring.geometry.dispose();cp.beam.geometry.dispose();this.comp=null}
  for(let k=0;k<260;k++){const a=rnd(0,6.2832),d=rnd(1,5),sp=rnd(3,12);mp.puffs.emit(cx0+Math.cos(a)*d,g+rnd(.3,2.5),cz0+Math.sin(a)*d,Math.cos(a)*sp,rnd(.5,6),Math.sin(a)*sp,rnd(3,6),rnd(3,6),rnd(14,32),.80,.54,.40,.4,.8,.2,-.2)}
  if(mp.tone){mp.tone(392,.25,.06);setTimeout(()=>mp.tone(523,.25,.06),130);setTimeout(()=>mp.tone(659,.5,.06),260)}
  this.inv=[{id:'seeds',n:14},{id:'hammer',n:1},{id:'regolith',n:25},{id:'bucket',n:1,w:0}];this.bag.fill(null);this.cr.onSalvage();this.sel=0;this.makeIcons();this.renderSlots(true);this.showName();this.vmDip=1;
  const o=$('sv-obj');o.classList.add('ok');$('sv-ot').innerHTML='<b>Objective complete:</b> Intact component salvaged from the wreck.';$('sv-dr').style.display='none';this.objT=5;this.tutStart=1.8;this.tk.start();
  mp.cap('COMPONENT SALVAGED  ·  ADDED TO HOTBAR & BACKPACK',3000);this.tk.alertMark(3000)}

 /* ---------- lifecycle ---------- */
 onWalkStart(){this.walking=true;const P=this.mp.pk,Q=this.mp.pod,tx=this.tx||this.mp.L.x;this.px=P.x;this.pz=P.z;
  if(Q)this.bnd=this.mp.worldOn((Q.x+tx)/2,Q.z/2,150+Math.hypot(Q.x-tx,Q.z)/2,[{x:Q.x,z:Q.z},{x:tx,z:0}]);   /* invisible boundary wall + craters */
  this.ensureVM();this.makeIcons();this.renderSlots(false);this.tk.onWalkStart();this.cr.onWalkStart();
  $('sv-hb').classList.add('on');
  if(this.stage==='descending'||this.stage==='down'){$('sv-obj').classList.remove('ok');$('sv-ot').innerHTML='<b>Objective:</b> Locate the <b>one intact component</b> in the burnt wreckage and inspect it with <kbd>E</kbd>.';$('sv-dr').style.display='';$('sv-obj').classList.add('on');this.tk.alertMark()}}
 clearWreck(){const mp=this.mp;for(const c of this.wkCols){const i=mp.rockCols.indexOf(c);if(i>=0)mp.rockCols.splice(i,1)}this.wkCols=[];
  if(this.wk){mp.near.remove(this.wk);this.wk.traverse(o=>{if(o.geometry)o.geometry.dispose()});this.wk=null}this.wkPieces=[];for(const m of this.wkMats)m.dispose();this.wkMats=[];this.smoke=[];this.comp=null;this.emberMat=null;this.wkLight=null}
 reset(){this.clearWreck();this.scorchReset();this.insp=-1;this.pt='';this.bnd=null;this.mp.worldOff();this.stage='off';this.walking=false;this.inv.fill(null);this.bag.fill(null);this.tk.reset();this.cr.reset();this.sel=0;this.tutOn=false;this.tutStart=-1;this.tutKeys=this.tutWheel=false;this.promptOn=false;this.vmDip=0;
  for(const id of['sv-obj','sv-prompt','sv-hb','sv-tut'])$(id).classList.remove('on','ok');$('sv-name').style.opacity=0;$('sv-dr').style.display='';
  $('sv-t1').classList.remove('d');$('sv-t2').classList.remove('d');$('sv-t1').firstChild.innerHTML='';$('sv-t2').firstChild.innerHTML='';
  if(this.vm)this.vm.visible=false;this.renderSlots(false)}
 wkUpdate(dt){const mp=this.mp,T=performance.now()/1000;
  /* debris we do not need shrinks away 10 s after impact (scorch mark + the intact component stay) */
  if(this.wkPieces&&this.wkPieces.length){const age=(performance.now()-this.wkBorn)/1000;
   if(age>8.5){const k=clamp(1-(age-8.5)/1.5,0,1);for(const p of this.wkPieces)p.m.scale.setScalar(Math.max(.001,k));
    if(k<=0){for(const p of this.wkPieces){const q=p.m.position;if(Math.random()<.5)mp.puffs.emit(q.x,q.y+.4,q.z,rnd(-.5,.5),rnd(.5,1.5),rnd(-.5,.5),rnd(1.5,2.5),rnd(1,2),rnd(4,7),.5,.4,.35,.35,.1,2);
      this.wk.remove(p.m);p.m.geometry.dispose();if(p.cl){const i=mp.rockCols.indexOf(p.cl);if(i>=0)mp.rockCols.splice(i,1)}}
     this.wkPieces=[];this.wkCols=[];this.smoke=[];if(this.wkLight){this.wk.remove(this.wkLight);this.wkLight=null}this.emberMat=null}}}
  if(this.emberMat)this.emberMat.emissiveIntensity=Math.max(.15,(1.1-this.wkT*.004)+.5*Math.sin(T*7)*Math.sin(T*3.1));
  if(this.wkLight){this.wkT+=dt;this.wkLight.intensity=Math.max(0,46-this.wkT*.5)*(.8+.2*Math.sin(T*11))}
  if(this.wkT<120&&this.smoke.length){const fade=1-this.wkT/130;for(const v of this.smoke){if(Math.random()<dt*2.2)mp.puffs.emit(v.x+rnd(-.4,.4),v.y,v.z+rnd(-.4,.4),rnd(-.4,.4),rnd(1.5,3.2),rnd(-.4,.4),rnd(5,8),rnd(1.2,2.2),rnd(7,14),.12,.1,.09,.38*fade,.35,3)}
   if(Math.random()<dt*1.2){const v=this.smoke[(Math.random()*this.smoke.length)|0];mp.fire.emit(v.x,v.y,v.z,rnd(-.5,.5),rnd(1,3),rnd(-.5,.5),rnd(.4,.8),rnd(.8,1.5),rnd(2,4),1,.5,.18,.6*fade,.5,3)}}
  if(this.comp){const c=this.comp,k=(T*.9)%1;c.ring.scale.setScalar(.8+k*1.8);c.ring.material.opacity=.7*(1-k);c.beam.material.opacity=.13+.05*Math.sin(T*3);c.light.intensity=7+2*Math.sin(T*3)}}
 update(dt){if(!this.walking)return;const mp=this.mp,P=mp.pk,L=mp.L,dead=!!(mp.sv&&mp.sv.dead);this.wkUpdate(dt);
  if(this.insp>=0){if(!this.inRange()||dead){this.insp=-1;this.pt='';mp.tone&&mp.tone(160,.2,.05,'sawtooth')}else{this.insp+=dt/2.4;if(Math.random()<dt*10)mp.puffs&&mp.puffs.emit(this.comp.x+rnd(-.8,.8),heightAt(this.comp.x,this.comp.z)+rnd(.2,1.4),this.comp.z+rnd(-.8,.8),0,rnd(.3,1),0,rnd(.5,1),rnd(.15,.3),rnd(.4,.8),.5,.9,1,.4,.2,1);if(this.insp>=1){this.insp=-1;this.pt='';this.salvage()}}}
  /* objective arrow + distance */
  if(this.stage==='descending'||this.stage==='down'){const tx=this.comp?this.comp.x:L.x,tz=this.comp?this.comp.z:0,dx=tx-P.x,dz=tz-P.z,d=Math.hypot(dx,dz),fx=Math.cos(P.yaw),fz=Math.sin(P.yaw),f=dx*fx+dz*fz,r=dx*-fz+dz*fx;
   $('sv-ar').style.transform=`rotate(${Math.atan2(r,f)*57.2958}deg)`;$('sv-di').textContent=(this.stage==='descending'?'DESCENT STAGE INBOUND  ·  ':'INTACT COMPONENT  ·  ')+Math.round(d)+' m'}
  else if(this.stage==='salvaged'&&this.objT>0&&!this.tk.on&&!this.cr.on){this.objT-=dt;if(this.objT<=0)$('sv-obj').classList.remove('on')}
  /* interaction prompt */
  const want=this.stage==='down'&&!dead&&this.inRange();if(want!==this.promptOn){this.promptOn=want;$('sv-prompt').classList.toggle('on',want)}
  if(want){const t=this.insp>=0?'INSPECTING COMPONENT &hellip; '+Math.round(this.insp*100)+'%':'Press <span class="kb">[E]</span> to Inspect the Intact Component';if(t!==this.pt){this.pt=t;$('sv-prompt').innerHTML=t}}
  /* hotbar tutorial, right after collecting */
  if(this.tutStart>0){this.tutStart-=dt;if(this.tutStart<=0){this.tutStart=-1;this.tutOn=true;this.tutT=0;this.tutDone=0;$('sv-tut').classList.add('on')}}
  if(this.tutOn){this.tutT+=dt;if(this.tutKeys&&this.tutWheel)this.tutDone+=dt;if(this.tutDone>2.5||this.tutT>28){this.tutOn=false;$('sv-tut').classList.remove('on')}}
  if(this.nameT>0){this.nameT-=dt;if(this.nameT<=0)$('sv-name').style.opacity=0}
  this.tk.update(dt,dead);this.cr.update(dt,dead);this.updVM(dt,dead)}

 /* ---------- first-person held item (child of the near camera) ---------- */
 mkVM(id){try{const d=ITEMS[id],h=d.hold,m=d.rig?d.rig(d):fit(d.build(),d.size,d.ref,d.cy);if(!d.rig){m.position.set(h.x,h.y,h.z);m.rotation.set(h.rx||0,h.ry||0,h.rz||0)}m.visible=false;
  m.traverse(o=>{o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false});this.vm.add(m);this.vmItems[id]=m;return m}catch(e){console.error('[viewmodel]',id,e)}}
 ensureVM(){if(this.vm)return;const mp=this.mp;this.vm=new THREE.Group();
  for(const id in ITEMS)this.mkVM(id);
  this.vm.visible=false;if(!mp.ncam.parent)mp.near.add(mp.ncam);mp.ncam.add(this.vm)}
 updVM(dt,dead){const vm=this.vm;if(!vm)return;const it=this.inv[this.sel],show=!!it&&!dead;vm.visible=show;if(!show)return;
  const rg=this.vmItems[it.id]||this.mkVM(it.id);for(const id in this.vmItems)this.vmItems[id].visible=id===it.id;if(rg&&rg.userData.pose)rg.userData.pose(this.tk.pose,dt,it);
  const P=this.mp.pk,sp=Math.hypot(P.x-this.px,P.z-this.pz)/Math.max(dt,1e-3);this.px=P.x;this.pz=P.z;this.sp+=(clamp(sp/5,0,2)-this.sp)*Math.min(1,dt*8);
  const T=performance.now()/1000;this.vmDip=Math.max(0,this.vmDip-dt*3.2);const dip=this.vmDip*this.vmDip;
  vm.position.set(Math.sin(T*4.5)*.006*(.3+this.sp),-dip*.42+Math.abs(Math.sin(T*9))*.012*this.sp+Math.sin(T*1.3)*.003,0);
  vm.rotation.set(dip*.5,0,Math.sin(T*4.5)*.01*this.sp)}
}

/* =====================================================================================================
   MarsPhase
   state:  idle -> building -> approach -> entry -> landing -> ( landed | crashed ) --R--> entry ...
   ===================================================================================================== */
export class MarsPhase{
 constructor({renderer,rocket,exhaust}){
  this.r=renderer;this.rocket=rocket;this.exhaust=exhaust;
  this.state='idle';this.camUp=null;this.t=0;this.keys={};this.ts=1;this.retry=false;this.built=false;
  this.kick=0;this.fovKick=0;this.L={x:0,y:0,vx:0,vy:0,th:0,om:0,thr:0,fuel:100};this.rcsOn=[0,0,0];this.hudT=0;this.cap_t=0;this.subT=0;
  this.cp=new V3();this.cl=new V3();this.camX=0;this.crashPos=new V3();this.debris=[];this.lastBase=new V3();this.audio=null;
  addEventListener('keydown',e=>this.onKey(e,true));addEventListener('keyup',e=>this.onKey(e,false));addEventListener('resize',()=>this.resize());this.base=new MarsBase(this,heightAt);this.dn=new DayNight(this);this.salv=new Salvage(this)}

 /* ---------- input ---------- */
 onKey(e,down){if(this.state==='idle')return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  this.keys[e.code]=down;
  if(down&&this.walk){const hk=/^(?:Digit|Numpad)([1-4])$/.exec(e.code);if(hk&&!this.salv.tk.bp.numKey(+hk[1]-1))this.salv.select(+hk[1]-1,'key');if(e.code==='Tab'||e.code==='KeyB'){e.preventDefault();this.salv.tk.bp.toggle()}if(e.code==='KeyE'){if(this.base.active){if(!(this.base.mode==='outside'&&(this.salv.tk.interact()||this.salv.cr.interact())))this.base.interact()}else if(this.salv.interact()){/* salvaged the rocket debris */}else if(this.salv.tk.interact()){/* filled the bucket */}else if(this.salv.cr.interact()){/* crafting table */}else if(this.base.active)this.base.interact();else this.resupply()}if(e.code==='BracketRight')this.vitResize(.1);if(e.code==='BracketLeft')this.vitResize(-.1)}
  if(down){this.initAudio();if(e.code==='KeyR'&&this.dn.dead&&this.dn.cp&&!e.shiftKey){this.dn.retry()}else if(e.code==='KeyR'&&['landing','landed','crashed'].includes(this.state)&&!(this.base.active&&!e.shiftKey&&!this.dn.dead)){if(!this.midGame())this.resetEntry()}}}
 get inp(){const k=this.keys;return{up:k.KeyW||k.ArrowUp,left:k.KeyA||k.ArrowLeft,right:k.KeyD||k.ArrowRight,rcs:k.Space}}

 /* ---------- entry point from launch.js (screen is already black) ---------- */
 begin(){if(this.state!=='idle')return;this.state='building';
  document.exitPointerLock&&document.exitPointerLock();
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);document.body.insertAdjacentHTML('beforeend',HTML);
  $('m-title').classList.add('on');
  const t0=performance.now();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{this.build();const wait=Math.max(0,4300-(performance.now()-t0));setTimeout(()=>this.startApproach(),wait)}))}

 /* ---------- scene construction (runs once, under the black title card) ---------- */
 build(){
  const r=this.r;r.shadowMap.autoUpdate=true;r.toneMappingExposure=1.0;
  this.near=new THREE.Scene();this.far=new THREE.Scene();this.near.environment=makeEnv(r,0);this.near.environmentIntensity=.9;this.envInt=makeEnv(r,1);
  this.ncam=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.5,250000);this.fcam=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,1,2e7);
  const hazeC=srgb(.74,.56,.47);this.near.fog=new THREE.FogExp2(hazeC,0);
  /* ---- lights ---- */
  this.sun=new THREE.DirectionalLight(0xffe6d0,3.4);this.sun.castShadow=true;const sc=this.sun.shadow.camera;sc.left=sc.bottom=-120;sc.right=sc.top=120;sc.near=10;sc.far=900;
  this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.bias=-.0005;this.sun.shadow.normalBias=.4;this.near.add(this.sun,this.sun.target);
  this.hemi=new THREE.HemisphereLight(srgb(.80,.66,.62),srgb(.55,.32,.22),1.7);this.near.add(this.hemi);
  this.flash=new THREE.PointLight(0xffaa55,0,0,2);this.near.add(this.flash);
  /* ---- far scene: stars, Mars globe, atmosphere limb ---- */
  const sp=new Float32Array(3000*3),scol=new Float32Array(3000*3);
  for(let i=0;i<3000;i++){const a=rnd(0,6.283),z=rnd(-1,1),q=Math.sqrt(1-z*z),b=rnd(.35,1);sp.set([Math.cos(a)*q*9e6,z*9e6,Math.sin(a)*q*9e6],i*3);scol.set([b,b*rnd(.85,1),b*rnd(.8,1)],i*3)}
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));sg.setAttribute('color',new THREE.BufferAttribute(scol,3));
  this.starMat=new THREE.PointsMaterial({size:1.7,sizeAttenuation:false,vertexColors:true,transparent:true,depthWrite:false,fog:false});this.far.add(new THREE.Points(sg,this.starMat));
  this.marsU={uSun:{value:SUN},uMap:{value:null},uHm:{value:null},uHas:{value:0},uHasH:{value:0}};
  this.mars=new THREE.Mesh(new THREE.SphereGeometry(1,192,128),new THREE.ShaderMaterial({uniforms:this.marsU,vertexShader:MARS_VS,fragmentShader:MARS_FS,extensions:{derivatives:true}}));
  this.mars.scale.setScalar(R_M/1000);
  {const ld=(la,lo)=>{la=MU.degToRad(la);lo=MU.degToRad(lo);return new V3(Math.cos(la)*Math.cos(lo),Math.sin(la),-Math.cos(la)*Math.sin(lo))};
   const up=new V3(0,1,0),q1=new THREE.Quaternion().setFromUnitVectors(ld(18.38,77.58),up);          // Jezero Crater straight below the lander
   const n=up.clone().applyQuaternion(q1);n.y=0;n.normalize();const t=new V3(0,0,-1),ang=Math.atan2(new V3().crossVectors(n,t).y,n.dot(t));
   this.mars.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(up,ang).multiply(q1))}
  this.atmo=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.ShaderMaterial({uniforms:{uSun:{value:SUN}},vertexShader:MARS_VS,fragmentShader:ATMO_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  this.atmo.scale.setScalar(R_M/1000*1.022);this.far.add(this.mars,this.atmo);
  const sunS=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(),color:0xfff0d8,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));sunS.position.copy(SUN).multiplyScalar(6e6);sunS.scale.setScalar(5e5);this.far.add(sunS);
  /* optional real NASA data: drop equirectangular images into ./assets (see README) and they replace the procedural globe */
  const TL=new THREE.TextureLoader();
  TL.load('assets/mars_color.jpg',t=>{t.colorSpace=THREE.NoColorSpace;t.anisotropy=8;this.marsU.uMap.value=t;this.marsU.uHas.value=1},undefined,()=>{});
  TL.load('assets/mars_height.jpg',t=>{t.colorSpace=THREE.NoColorSpace;this.marsU.uHm.value=t;this.marsU.uHasH.value=1},undefined,()=>{});
  /* ---- sky dome ---- */
  this.skyMat=new THREE.ShaderMaterial({uniforms:{uSun:{value:SUN},uT:{value:0}},vertexShader:`varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:SKY_FS,side:THREE.BackSide,transparent:true,depthWrite:false,depthTest:true,fog:false});
  this.ns=new NightSky(this,SUN,this.skyMat);this.sky=new THREE.Mesh(new THREE.SphereGeometry(100000,32,16),this.skyMat);this.sky.renderOrder=-10;this.sky.frustumCulled=false;this.near.add(this.sky);
  /* ---- terrain: polar grid, dense near the pad and stretching to 120 km (distant red cliffs/mesas live in the height function) ---- */
  const dt=makeDetail(),NR=170,NS=320,r0=4,Rm=120000,nv=NR*NS+1,pos=new Float32Array(nv*3),uv=new Float32Array(nv*2),col=new Float32Array(nv*3),idx=[];
  for(let i=0;i<NR;i++){const rr=i===0?0:r0*Math.pow(Rm/r0,(i-1)/(NR-1));const ns=i===0?1:NS;
   for(let j=0;j<ns;j++){const a=j/NS*6.2832,x=Math.cos(a)*rr,z=Math.sin(a)*rr,v=i===0?0:1+(i-1)*NS+j;pos[v*3]=x;pos[v*3+1]=heightAt(x,z);pos[v*3+2]=z;uv[v*2]=x/9+.6*fbm(x*.012,z*.012,2);uv[v*2+1]=z/9+.6*fbm(x*.012+9,z*.012+4,2)}}
  for(let j=0;j<NS;j++)idx.push(0,1+(j+1)%NS,1+j);
  for(let i=1;i<NR-1;i++)for(let j=0;j<NS;j++){const a=1+(i-1)*NS+j,b=1+(i-1)*NS+(j+1)%NS,c=1+i*NS+j,d=1+i*NS+(j+1)%NS;idx.push(a,b,c,b,d,c)}
  const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(pos,3));tg.setAttribute('uv',new THREE.BufferAttribute(uv,2));tg.setIndex(idx);tg.computeVertexNormals();
  {const nm=tg.attributes.normal,cA=srgb(.86,.52,.35),cB=srgb(.70,.40,.27),cC=srgb(.97,.67,.47),cR1=srgb(.50,.29,.21),cR2=srgb(.66,.40,.29),t=new THREE.Color();
   for(let v=0;v<nv;v++){const x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2],sl=1-nm.getY(v),rr=Math.hypot(x,z);
    const n=fbm(x*.0009,z*.0009,3),m=fbm(x*.02+3,z*.02,2);t.copy(cA).lerp(cB,sstep(.35,.7,n)).lerp(cC,sstep(.5,.85,m)*.5);
    t.lerp(cB,clamp(-craterH(x,z)/40,0,.5));
    if(rr<5000){const pl=fbm(x*.045+7,z*.045+2,3),slab=sstep(.46,.52,pl)*(1-sstep(.60,.66,pl)),crk=1-sstep(0,.025,Math.abs(pl-.5));t.lerp(cC,slab*.3)}
    const band=sstep(.3,.7,fbm(x*.004+y*.02,z*.004+y*.02,3));t.lerp(cR1.clone().lerp(cR2,band),clamp(sl*4,0,1)*.7);
    const k=.85+.3*fbm(x*.15,z*.15,2);col[v*3]=t.r*k;col[v*3+1]=t.g*k;col[v*3+2]=t.b*k}}
  tg.setAttribute('color',new THREE.BufferAttribute(col,3));
  this.terrainMat=new THREE.MeshStandardMaterial({vertexColors:true,map:dt.map,normalMap:dt.nm,normalScale:new THREE.Vector2(.55,.55),roughness:1,metalness:0});
  this.terrain=new THREE.Mesh(tg,this.terrainMat);this.terrain.receiveShadow=true;this.terrain.frustumCulled=false;this.near.add(this.terrain);
  /* ---- boulders & rocks (instanced, three size classes) ---- */
  this.rocks=new THREE.Group();this.near.add(this.rocks);this.rockCols=[];
  const rockGeo=sd=>{const g=new THREE.IcosahedronGeometry(1,2),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=.75+.55*fbm(x*1.6+sd+z*1.3,y*1.6+z*.7+sd,3);p.setXYZ(i,x*n,y*n*.68,z*n)}g.computeVertexNormals();return g};
  const rockMat=new THREE.MeshStandardMaterial({roughness:.95,metalness:0,normalMap:dt.nm,color:0xffffff}),dummy=new THREE.Object3D(),c1=new THREE.Color();
  const slabGeo=sd=>{const g=rockGeo(sd),p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)*.45);g.computeVertexNormals();return g};
  for(const[cnt,s0,s1,rmax,sd,sh,slab]of[[3600,.15,.7,2600,1,false],[1100,.7,2.4,4200,5,true],[260,2.4,7,5200,9,true],[900,.5,3.2,3600,13,false,true],[40,6,16,6000,21,true]]){
   const geoR=slab?slabGeo(sd):rockGeo(sd),inst=[];
   for(let i=0;i<cnt;i++){let x=0,z=0;for(let tr=0;tr<5;tr++){const a=rand()*6.2832,d=26+Math.pow(rand(),1.5)*rmax;x=Math.cos(a)*d;z=Math.sin(a)*d;if(rand()<.25+.75*fbm(x*.004+3,z*.004+1,2))break}
    const s=lerp(s0,s1,Math.pow(rand(),2.2));
    const sxz=s*(.7+rand()*.8),syy=s*(.6+rand()*.6),szz=s*(.7+rand()*.8),rr=Math.max(sxz,szz)*.85,hm=Math.min(heightAt(x,z),heightAt(x+rr,z),heightAt(x-rr,z),heightAt(x,z+rr),heightAt(x,z-rr));dummy.position.set(x,hm-s*(slab?.05:.15),z);dummy.rotation.set(rand()*.12,rand()*6.28,rand()*.12);dummy.scale.set(sxz,syy,szz);dummy.updateMatrix();const mt=dummy.matrix.clone();
    const g=.17+rand()*.20,tn=rand();c1.setRGB(g*(1.0+.2*tn),g*(.70+.12*rand()),g*(.56+.2*(1-tn)));inst.push({x,z,m:mt,c:c1.clone()});if(s0>=.5&&!slab&&s>=.7)this.rockCols.push({x,z,r:s*.9,h:s*.7})}
   /* PERF: one giant InstancedMesh can never be frustum-culled (its bounding sphere covers the whole world), so all ~5900 rocks were drawn every frame, plus ~1400 again in the shadow pass.
      Split each class into polar cells (rings double in radius, 4-10 sectors) -> every cell is culled on its own, in the camera pass and in the sun-shadow pass. Same rocks, same look. */
   {const ns=cnt>=2000?10:cnt>=800?8:4,bk=new Map();
    for(const q of inst){const r=Math.hypot(q.x,q.z),k=r<26?0:Math.floor(Math.log2(r/26))+1,a=Math.min(ns-1,Math.floor((Math.atan2(q.z,q.x)+Math.PI)/6.2832*ns)),key=k*16+a;let A=bk.get(key);if(!A)bk.set(key,A=[]);A.push(q)}
    for(const A of bk.values()){const im=new THREE.InstancedMesh(geoR,rockMat,A.length);im.castShadow=sh;im.receiveShadow=true;
     for(let i=0;i<A.length;i++){im.setMatrixAt(i,A[i].m);im.setColorAt(i,A[i].c)}im.computeBoundingSphere();this.rocks.add(im)}}}
  /* ---- landing pad ---- */
  const padTex=canvasTex(512,512,(x,w,h)=>{x.fillStyle='#3c3532';x.fillRect(0,0,w,h);for(let i=0;i<5000;i++){x.fillStyle=`rgba(${rnd(20,90)},${rnd(18,70)},${rnd(18,60)},.35)`;x.fillRect(rnd(0,w),rnd(0,h),rnd(1,3),rnd(1,3))}
   x.strokeStyle='#e9eef2';x.lineWidth=10;x.beginPath();x.arc(256,256,236,0,7);x.stroke();x.strokeStyle='#ff9a3c';x.lineWidth=14;x.beginPath();x.arc(256,256,150,0,7);x.stroke();
   x.lineWidth=6;x.strokeStyle='#e9eef2';x.beginPath();x.moveTo(256,30);x.lineTo(256,482);x.moveTo(30,256);x.lineTo(482,256);x.stroke();x.fillStyle='#ff9a3c';for(let k=0;k<4;k++){x.save();x.translate(256,256);x.rotate(k*Math.PI/2+Math.PI/4);x.fillRect(180,-14,40,28);x.restore()}});
  const pad=new THREE.Mesh(new THREE.CircleGeometry(27,64),new THREE.MeshStandardMaterial({map:padTex,roughness:.9,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));pad.rotation.x=-Math.PI/2;pad.position.y=.05;pad.receiveShadow=true;this.pad=pad;   // landing pad removed (not added to scene)
  const gt=glowTex();this.beacons=[];for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4,x=Math.cos(a)*25,z=Math.sin(a)*25;
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,2.4,8),new THREE.MeshStandardMaterial({color:0x555a60,metalness:.7,roughness:.5}));pole.position.set(x,1.2,z);pole.castShadow=true;
   const s=new THREE.Sprite(new THREE.SpriteMaterial({map:gt,color:0xff8030,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));s.scale.setScalar(5);s.position.set(x,2.6,z);this.beacons.push(s)}
  /* ---- lander: reuse the rocket from the launch scene, pivoting about its centre of mass ---- */
  this.lander=new THREE.Group();this.near.add(this.lander);
  if(this.rocket.parent)this.rocket.parent.remove(this.rocket);this.rocket.rotation.set(0,0,0);this.rocket.position.set(0,-COM,0);this.lander.add(this.rocket);
  const legM=new THREE.MeshStandardMaterial({color:0x2c2f34,metalness:.8,roughness:.45}),RR=1.85,LL=15.95;this.legs=[];
  for(let k=0;k<4;k++){const root=new THREE.Group();root.rotation.y=k*Math.PI/2+Math.PI/4;root.position.y=-COM+14;this.lander.add(root);
   const piv=new THREE.Group();piv.position.x=RR;root.add(piv);const sg2=new THREE.CylinderGeometry(.22,.3,LL,8);sg2.translate(0,-LL/2,0);const strut=new THREE.Mesh(sg2,legM);strut.castShadow=true;piv.add(strut);
   const fp=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.7,.35,16),legM);fp.position.y=-LL;fp.castShadow=true;piv.add(fp);this.legs.push(piv)}
  /* entry plasma: shock cap under the base + wake along the hull */
  const pu=w=>({uT:{value:0},uI:{value:0},uWake:{value:w}});
  this.plasmaCap=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),new THREE.ShaderMaterial({uniforms:pu(0),vertexShader:PLASMA_VS,fragmentShader:PLASMA_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  this.plasmaCap.scale.set(7.5,6,7.5);this.plasmaCap.position.y=-COM-2;this.plasmaCap.frustumCulled=false;
  const wg=new THREE.CylinderGeometry(15,3.4,115,32,10,true);wg.translate(0,57.5,0);
  this.plasmaWake=new THREE.Mesh(wg,new THREE.ShaderMaterial({uniforms:pu(1),vertexShader:PLASMA_VS,fragmentShader:PLASMA_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  this.plasmaWake.position.y=-COM;this.plasmaWake.frustumCulled=false;this.lander.add(this.plasmaCap,this.plasmaWake);
  this.heatLight=new THREE.PointLight(0xff7a30,0,0,2);this.heatLight.position.y=-COM-4;this.lander.add(this.heatLight);
  /* RCS jets (visible puffs of cold gas / hypergolic flame) */
  this.jets=[[-2.4,36,0],[2.4,36,0],[0,-6,0]].map(p=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:gt,color:0xcfe8ff,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,opacity:0,transparent:true}));s.scale.setScalar(5);s.position.set(...p);s.position.y-=COM-26;this.lander.add(s);return s});
  /* ---- particles ---- */
  this.puffs=new Puffs(this.near,12000,false,puffTex());this.fire=new Puffs(this.near,4500,true,glowTex());
  this.shockRing=new THREE.Mesh(new THREE.RingGeometry(.92,1,96),new THREE.MeshBasicMaterial({color:0xffd9a0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
  this.shockRing.rotation.x=-Math.PI/2;this.shockRing.visible=false;this.near.add(this.shockRing);
  /* debris materials: clones of the real hull materials so the wreck looks like the rocket */
  this.debMats=[];this.rocket.traverse(o=>{if(o.isMesh&&o.material&&!Array.isArray(o.material)&&o.material.isMeshStandardMaterial&&o.material.map&&this.debMats.length<4&&!this.debMats.some(m=>m.map===o.material.map)){const m=o.material.clone();m.side=THREE.DoubleSide;this.debMats.push(m)}});
  this.debMats.push(legM);
  this.resize();this.setLegs(0);
  /* compile everything now so nothing hitches mid-landing */
  this.mars.visible=this.atmo.visible=this.terrain.visible=true;this.ncam.position.set(0,50,200);this.ncam.lookAt(0,30,0);
  try{r.compile(this.near,this.ncam);r.compile(this.far,this.fcam)}catch(e){}
  this.built=true}

 resize(){if(!this.ncam)return;for(const c of[this.ncam,this.fcam]){c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix()}}

 /* ---------- world: invisible boundary wall + a few surface craters (coarse terrain grid is re-sampled around them) ---------- */
 worldOn(cx,cz,R,keep){this.worldOff();BND.on=true;BND.cx=cx;BND.cz=cz;BND.R=R;BND.craters=[];BND.base=null;
  /* BASE SITE: fixed by code - deterministic search for the flattest ground with the fewest boulders, then cleared and levelled */
  {const BR=40;let best=null;for(let i=0;i<220;i++){const a=i*2.39996,d=18+(R*.62-18)*Math.sqrt(i/220),x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;
    if(d+BR>R-8)continue;let bad=false;for(const k of keep||[])if(Math.hypot(x-k.x,z-k.z)<BR+22)bad=true;if(bad)continue;
    let sc=0;for(const c of this.rockCols)if(Math.hypot(c.x-x,c.z-z)<BR+4)sc+=3+c.r;
    let lo=1e9,hi=-1e9;for(let u=-2;u<=2;u++)for(let v=-2;v<=2;v++){const hh=heightBase(x+u*BR*.45,z+v*BR*.45);lo=Math.min(lo,hh);hi=Math.max(hi,hh)}sc+=(hi-lo)*6;
    if(!best||sc<best.sc)best={x,z,sc}}
   if(!best)best={x:cx,z:cz,sc:0};BND.base={x:best.x,z:best.z,r:BR,h:heightBase(best.x,best.z)};
   this.rockHide=[];const M=new THREE.Matrix4(),Z=new THREE.Matrix4().makeScale(0,0,0);
   for(const o of this.rocks.children)if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,M);if(Math.hypot(M.elements[12]-best.x,M.elements[14]-best.z)<BR+3){this.rockHide.push([o,i,M.clone()]);o.setMatrixAt(i,Z)}}o.instanceMatrix.needsUpdate=true}
   this.colHide=[];for(let i=this.rockCols.length-1;i>=0;i--){const c=this.rockCols[i];if(Math.hypot(c.x-best.x,c.z-best.z)<BR+3)this.colHide.push(...this.rockCols.splice(i,1))}}
  for(let n=0,t=0;n<6&&t<300;t++){const a=rnd(0,6.2832),d=rnd(35,R*.78),r=rnd(18,34),x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;let ok=d+r<R-15;
   for(const k of keep||[])if(Math.hypot(x-k.x,z-k.z)<r+30)ok=false;if(Math.hypot(x-cx,z-cz)<r+25||Math.hypot(x-BND.base.x,z-BND.base.z)<r+BND.base.r+12)ok=false;
   for(const c of BND.craters)if(Math.hypot(x-c.x,z-c.z)<r+c.r+18)ok=false;
   if(ok){BND.craters.push({x,z,r,dp:rnd(1.6,3.2),r2:r*r*2.9});n++}}
  /* NO ROCKS IN CRATERS: hide every instanced boulder (and drop its collider) inside / on the rim of each crater */
  {const M=new THREE.Matrix4(),Z=new THREE.Matrix4().makeScale(0,0,0),inC=(x,z)=>BND.craters.some(c=>Math.hypot(x-c.x,z-c.z)<c.r*1.3+1.5);
   if(!this.rockHide)this.rockHide=[];if(!this.colHide)this.colHide=[];
   for(const o of this.rocks.children)if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,M);if(M.elements[0]===0&&M.elements[5]===0&&M.elements[10]===0)continue;if(inC(M.elements[12],M.elements[14])){this.rockHide.push([o,i,M.clone()]);o.setMatrixAt(i,Z)}}o.instanceMatrix.needsUpdate=true}
   for(let i=this.rockCols.length-1;i>=0;i--){const c=this.rockCols[i];if(inC(c.x,c.z))this.colHide.push(...this.rockCols.splice(i,1))}}
  const tg=this.terrain.geometry,tp=tg.attributes.position,ca=tg.attributes.color;
  if(!this.tOrigY){this.tOrigY=new Float32Array(tp.count);for(let i=0;i<tp.count;i++)this.tOrigY[i]=tp.getY(i);this.tOrigC=Float32Array.from(ca.array)}
  for(let i=0;i<tp.count;i++){const x=tp.getX(i),z=tp.getZ(i);if(Math.hypot(x-BND.base.x,z-BND.base.z)<BND.base.r+30)tp.setY(i,heightAt(x,z));for(const c of BND.craters){const d=Math.hypot(x-c.x,z-c.z);if(d>c.r*1.75)continue;
   tp.setY(i,heightAt(x,z));const u=d/c.r,k=1-.38*clamp(1-u*u,0,1);ca.setXYZ(i,ca.getX(i)*k,ca.getY(i)*k*.97,ca.getZ(i)*k*.94);break}}
  tp.needsUpdate=true;ca.needsUpdate=true;tg.computeVertexNormals();
  return{cx,cz,R,edge:()=>R,base:BND.base,craters:BND.craters}}
 worldOff(){if(!BND.on)return;BND.on=false;BND.craters=[];BND.base=null;
  if(this.rockHide){for(const[o,i,m]of this.rockHide){o.setMatrixAt(i,m);o.instanceMatrix.needsUpdate=true}this.rockHide=null}if(this.colHide){this.rockCols.push(...this.colHide);this.colHide=null}
  if(this.tOrigY&&this.terrain){const tg=this.terrain.geometry,tp=tg.attributes.position,ca=tg.attributes.color;for(let i=0;i<tp.count;i++)tp.setY(i,this.tOrigY[i]);ca.array.set(this.tOrigC);tp.needsUpdate=true;ca.needsUpdate=true;tg.computeVertexNormals()}}

 /* ---------- audio (procedural: engine rumble, plasma roar, explosion, chime) ---------- */
 initAudio(){if(this.audio)return;try{const ac=new AudioContext(),b=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate),d=b.getChannelData(0);let l=0;for(let i=0;i<d.length;i++){l=(l+(Math.random()*2-1)*.05)*.97;d[i]=l*5}
   const mk=(type,f,q)=>{const s=ac.createBufferSource();s.buffer=b;s.loop=true;const fl=ac.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=ac.createGain();g.gain.value=0;s.connect(fl);fl.connect(g);g.connect(ac.destination);s.start();return{g,fl}};
   this.audio={ac,eng:mk('lowpass',200,.7),wind:mk('bandpass',900,.6),buf:b};this.audio.amb=this.ambBuild(ac,b);ac.resume&&ac.resume()}catch(e){this.audio=null}}
 /* ---------- AMBIENT BED (surface + base): gusting Martian wind, deep habitat drone, sparse pad notes. Reuses the same AudioContext / noise buffer, no extra files ---------- */
 ambBuild(ac,b){const out=ac.createGain();out.gain.value=0;out.connect(ac.destination);
  const ws=ac.createBufferSource();ws.buffer=b;ws.loop=true;ws.playbackRate.value=.8;const wf=ac.createBiquadFilter();wf.type='bandpass';wf.frequency.value=420;wf.Q.value=.5;
  const gu=ac.createGain();gu.gain.value=.6;const lf=ac.createOscillator(),lg=ac.createGain();lf.frequency.value=.11;lg.gain.value=.4;lf.connect(lg);lg.connect(gu.gain);lf.start();   /* slow gusts */
  const wg=ac.createGain();wg.gain.value=0;ws.connect(wf);wf.connect(gu);gu.connect(wg);wg.connect(out);ws.start();
  const dl=ac.createBiquadFilter();dl.type='lowpass';dl.frequency.value=180;const dg=ac.createGain();dg.gain.value=0;dl.connect(dg);dg.connect(out);
  for(const f of[49,49.4,73.4]){const o=ac.createOscillator();o.type='sine';o.frequency.value=f;o.connect(dl);o.start()}
  const pf=ac.createBiquadFilter();pf.type='lowpass';pf.frequency.value=1400;pf.connect(out);
  return{out,wf,wg,dg,pf,next:3,i:0}}
 ambNote(f,v,len){const a=this.audio,m=a.amb,ac=a.ac,t=ac.currentTime,g=ac.createGain(),o=ac.createOscillator(),o2=ac.createOscillator();o.type='sine';o2.type='triangle';o.frequency.value=f;o2.frequency.value=f*2.005;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+len*.35);g.gain.exponentialRampToValueAtTime(.0005,t+len);o.connect(g);o2.connect(g);g.connect(m.pf);o.start(t);o2.start(t);o.stop(t+len+.1);o2.stop(t+len+.1)}
 stepUpdate(dt){const S=window.SolMusic;if(!S||!S.walk||window.__paused||(this.sv&&this.sv.dead)||(this.dn&&this.dn.dead))return;const bs=this.base,on=!!(bs&&bs.active),P=on?bs.p:this.pk;if(!P)return;
  const air=!on&&P.y!==undefined&&P.y>heightAt(P.x,P.z)+.15;S.walk(P.x,P.z,dt,on&&bs.interior?'metal':'dust',air)}   /* footsteps: regolith crunch outside, metal grating inside the base */
 ambUpdate(dt){const a=this.audio;if(!a||!a.amb)return;const m=a.amb,t=a.ac.currentTime,bs=this.base,dn=this.dn,
   on=!!this.walk&&!(dn&&dn.dead)&&!(this.sv&&this.sv.dead),ins=!!(bs&&bs.interior),night=!!(dn&&dn.night),dusk=dn?1-dn.k:0,cold=dn&&night&&!ins?clamp(dn.cold/25,0,1):0;
  m.out.gain.setTargetAtTime(on?1:0,t,on?2.5:.6);
  m.wg.gain.setTargetAtTime((ins?.03:.11+.07*dusk+.14*cold)*WIND_VOL,t,.6);
  m.wf.frequency.setTargetAtTime(ins?140:night?300+500*cold:420,t,.6);
  m.dg.gain.setTargetAtTime(ins?.05:night?.035:.02,t,1.2);
  m.pf.frequency.setTargetAtTime(ins?900:night?700:1400,t,1);
  if(!on)return;m.next-=dt;if(m.next>0)return;
  const day=[196,293.7,392,440,587.3],nite=[98,146.8,196,233.1],room=[196,293.7,349.2],sc=ins?room:night?nite:day;
  this.ambNote(sc[(Math.random()*sc.length)|0],ins?.03:.04,night?9:6);if(!night&&!ins&&Math.random()<.4)setTimeout(()=>this.audio&&this.audio.amb&&this.ambNote(sc[(Math.random()*sc.length)|0]*.5,.03,7),1800);
  m.next=(night?10:6)+Math.random()*(night?6:4)}
 tone(f,d,v=.08,type='sine'){const a=this.audio;if(!a)return;const o=a.ac.createOscillator(),g=a.ac.createGain();o.type=type;o.frequency.value=f;g.gain.value=v;g.gain.exponentialRampToValueAtTime(.001,a.ac.currentTime+d);o.connect(g);g.connect(a.ac.destination);o.start();o.stop(a.ac.currentTime+d)}
 boom(){const a=this.audio;if(!a)return;const s=a.ac.createBufferSource();s.buffer=a.buf;const fl=a.ac.createBiquadFilter();fl.type='lowpass';fl.frequency.value=500;const g=a.ac.createGain();g.gain.setValueAtTime(1.4,a.ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.ac.currentTime+2.8);s.connect(fl);fl.connect(g);g.connect(a.ac.destination);s.start()}
 audioUpdate(thr,heat){const a=this.audio;if(!a)return;const t=a.ac.currentTime;a.eng.g.gain.setTargetAtTime(this.state==='crashed'||this.state==='landed'?0:thr*.55,t,.08);a.eng.fl.frequency.setTargetAtTime(160+thr*520,t,.1);a.wind.g.gain.setTargetAtTime(heat*.22,t,.15);a.wind.fl.frequency.setTargetAtTime(500+heat*1400,t,.2)}

 /* ---------- small UI helpers ---------- */
 cap(text,ms=2600){const c=$('m-cap');c.textContent=text;c.style.opacity=1;clearTimeout(this.cap_t);this.cap_t=setTimeout(()=>c.style.opacity=0,ms)}
 sub(text,tag='NASA FACT',ms=5200){$('subt').textContent=text;$('subg').textContent=tag;$('sub').style.opacity=1;clearTimeout(this.subT);this.subT=setTimeout(()=>$('sub').style.opacity=0,ms)}
 status(text,color,blink){const s=$('m-status');if(!text){s.style.opacity=0;s.classList.remove('blink');return}s.textContent=text;s.style.color=color;s.style.opacity=1;s.classList.toggle('blink',!!blink)}
 setLegs(k){for(const l of this.legs)l.rotation.z=.5*k}

 /* ---------- state transitions ---------- */
 startApproach(){window.SolMusic&&SolMusic.mode('space');this.initAudio();this.state='approach';this.t=0;this.V0=-entryVy(0,E.T);this.fired={};
  const f=$('fade');f.style.transition='opacity 2.6s ease';f.style.opacity=0;$('m-title').classList.remove('on');this.audioUpdate(0,0)}
 startEntry(){window.SolMusic&&SolMusic.mode('entry');this.state='entry';this.t=0;this.fired={};this.entryT=this.retry?11:E.T;this.acted=false;this.ts=1;
  this.L.fuel=100;this.L.thr=0;this.L.th=0;this.L.om=0;this.setLegs(0);this.lastBase.set(0,1e9,0);$('m-hud').classList.add('on');this.exhaust(0,1,0);for(const j of this.jets)j.material.opacity=0}
 startLanding(){window.SolMusic&&SolMusic.mode('landing');this.state='landing';this.t=0;const L=this.L;L.vx=E.VXE;L.vy=-E.VE;L.th=0;L.om=0;this.camX=L.x;this.acted=false;this.actT=0;this.ts=.2;
  this.plasmaCap.visible=this.plasmaWake.visible=false;this.heatLight.intensity=0;this.cap('CONTROL TRANSFER  ·  YOU HAVE THE LANDER',3200);
  $('m-tut').classList.add('on');this.tutUp=true;this.status('')}
 /* [R] retry only works once the run is over (crashed / dead / game over); it is ignored while you are alive and playing */
 midGame(){const ov=$('m-over');return this.state!=='crashed'&&!(this.sv&&this.sv.dead)&&!this.dn.dead&&!(ov&&ov.classList.contains('on'))}
 /* [PAGE UP]: 1st press = Sol 1 (base unlocked), then +1 sol per press (Sol 2, Sol 3) with the previous sol's missions completed */
 skipSol(){const b=this.base,dn=this.dn;if(!this.walk||!this.pod||dn.dead||(this.sv&&this.sv.dead))return;
  if(b.mode==='off'){
   /* ADMIN SKIP FIX: skipping used to jump over the Sol 1 salvage, so you reached the later sols with an EMPTY pack (no hammer / bucket / table /
      crucible / seeds) and the "locate the intact component" objective still on screen. Now the skip really completes Sol 1: salvage the
      component (starter kit), mark every Sol 1 task done, and top the pack up with what Sols 2-4 need. */
   const S=this.salv,cr=S.cr,tk=S.tk;
   try{if(S.stage==='down'||S.stage==='descending')S.salvage()}catch(e){console.error('[skip salvage]',e)}
   try{tk.stage='done';tk.on=false;cr.on=false;cr.stage='done';for(const k of['t1','t2','table','open','o2','eat'])cr.flags[k]=1;const so=$('sv-obj');if(so)so.classList.remove('on');
    if(cr.count('hammer')<1)tk.give('hammer',1);if(cr.count('bucket')<1)tk.give('bucket',1,{w:0});if(cr.count('crucible')<1&&!tk.cru)tk.give('crucible',1);if(cr.count('crafting_table')<1&&!cr.table)tk.give('crafting_table',1);
    const kit={seeds:14,regolith:25,scrap:30,mineral:14,ice:8,nitrate:2,rare:2};for(const id in kit){const have=cr.count(id);if(have<kit[id])tk.give(id==='mineral'?'rk_basalt':id,kit[id]-have)}
    tk.toast('SOL 1 SKIPPED  \u00b7  STARTER KIT + SOL 2-4 SUPPLIES ADDED TO YOUR PACK','#7dff9a')}catch(e){console.error('[skip kit]',e)}
   cr.cheatUnlock();return}
  if(!b.active||!['inside','outside'].includes(b.mode))return;dn.skipStep()}
 /* CONTINUE (save system): skip approach / entry / landing - the capsule comes straight down on its chute, the old stage crashes as usual, then the normal walk starts */
 fastLand(){if(this.state!=='approach'&&this.state!=='entry')return false;const L=this.L;this.exhaust(0,1,0);this.setJets([0,0,0]);this.plasmaCap.visible=this.plasmaWake.visible=false;this.heatLight.intensity=0;
  L.x=0;L.y=groundAt(0)+COM+30;L.vx=0;L.vy=-8;L.th=0;L.om=0;L.thr=0;L.fuel=100;try{this.setLegs(0)}catch(e){}this.setPose();
  this.state='landing';this.t=0;this.acted=true;this.actT=0;this.ts=1;this.camX=L.x;$('m-hud').classList.remove('on');$('m-tut').classList.remove('on');this.tutUp=false;
  const f=$('fade');if(f){f.style.transition='none';f.style.opacity=1}this.eject();return true}
 resetEntry(){window.SolSave&&SolSave.onReset();if(this.audio&&this.audio.amb)this.audio.amb.out.gain.setTargetAtTime(0,this.audio.ac.currentTime,.3);
  this.base.reset();this.salv.reset();this.dn.reset();if(this.ns)this.ns.reset();
  if(this.pod){this.near.remove(this.pod.g);this.pod=null}this.walk=false;this.ejected=false;this.tut=null;this.sv=null;if(this.vitEl)this.vitEl.classList.remove('on');$('m-sol').classList.remove('on');$('m-walk').classList.remove('on');try{document.exitPointerLock()}catch(e){}$('m-hint').innerHTML='[W] THRUST &nbsp;&middot;&nbsp; [A][D] TILT &nbsp;&middot;&nbsp; [SPACE] FINE RCS &nbsp;&middot;&nbsp; [R] RETRY';
  for(const id of['m-over','m-win','m-flash']){const e=$(id);e.style.transition='none';e.classList.remove('on');e.style.opacity=0;void e.offsetWidth;e.style.transition=''}
  $('m-tut').classList.remove('on');$('m-hint').classList.remove('on');this.status('');
  this.puffs.clear();this.fire.clear();this.shockRing.visible=false;this.flash.intensity=0;
  for(const d of this.debris){this.near.remove(d.m);d.m.geometry.dispose()}this.debris.length=0;
  this.rocket.visible=true;this.lander.visible=true;this.lander.rotation.set(0,0,0);this.kick=0;this.fovKick=0;this.retry=true;this.crashT=0;this.landT=0;
  this.plasmaCap.visible=this.plasmaWake.visible=true;this.startEntry();this.cap('RETRY  ·  ATMOSPHERIC ENTRY',2200)}

 /* ---------- per-frame ---------- */
 update(dt){
  window.SolSave&&SolSave.tick(this,dt);   /* SAVE SYSTEM: autosave + continue loader */
  if(this.audio&&this.audio.ac.state==='suspended')this.audio.ac.resume();
  if(!this.built||this.state==='idle'||this.state==='building')return;
  if(this.state==='approach'){this.t+=dt;this.updApproach(dt)}
  else if(this.state==='entry'){this.t+=dt;this.updEntry(dt)}
  else{this.t+=dt;this.updLanding(dt)}
  this.finish(dt)}

 setPose(){const L=this.L;this.lander.position.set(L.x,L.y,0);this.lander.rotation.z=-L.th}
 setJets(arr){for(let i=0;i<3;i++){const j=this.jets[i];j.material.opacity=arr[i]?(.6+.4*Math.random()):0;j.scale.setScalar(arr[i]?rnd(4,7):5)}}

 updApproach(dt){const T=APP_T,t=Math.min(this.t,T),s=t/T,L=this.L;
  const alt=E.A0+(APP_A1-E.A0)*Math.pow(1-s,1.7)+this.V0*T*(1-s);L.x=0;L.y=alt+COM;
  const thF=tt=>1.35*(1-sstep(2.5,9,tt));L.th=thF(t);const w=(thF(t+.05)-thF(t))/.05,ww=(thF(t+.15)-thF(t+.1))/.05;L.vy=-(this.V0+1e3);this.setPose();
  const flip=Math.abs(w)>.02;this.setJets([flip&&ww<w,flip&&ww>w,0]);                       // RCS fires to start and stop the flip
  const burn=sstep(8.6,9.6,t)*(1-sstep(13.2,14.6,t));this.exhaust(burn*.9,1,0);
  const e=sstep(0,T,t),az=lerp(.9,-.15,e),dist=lerp(250,125,e),hgt=lerp(95,28,e);
  this.cp.set(L.x+Math.sin(az)*dist,L.y+hgt,Math.cos(az)*dist);this.cl.set(L.x,L.y+2,0);this.kick=0;
  const f=this.fired,at=(k,tt,fn)=>{if(!f[k]&&t>=tt){f[k]=1;fn()}};
  at('a',.6,()=>{this.cap('MARS APPROACH',2800);this.sub('Mars is about 6,780 km across, roughly half of Earth’s diameter, and its gravity is only 38% of ours (3.71 m/s²).','NASA FACT',6200)});
  at('b',3.2,()=>this.cap('ALIGNING FOR ENTRY',2400));
  at('c',7.2,()=>this.sub('Mars’ atmosphere is about 95% carbon dioxide and under 1% as dense as Earth’s at the surface.','NASA FACT',5600));
  at('d',9.2,()=>this.cap('RETRO BURN  ·  SHEDDING SPEED',2600));
  at('e',12.6,()=>this.sub('NASA’s Perseverance entered Mars’ atmosphere at about 20,000 km/h (12,000 mph) and landed in Jezero Crater, a 45 km-wide ancient lake bed.','MISSION DATA · NASA',6200));
  this.audioUpdate(burn*.5,0);
  if(this.t>=T)this.startEntry()}

 updEntry(dt){const T=this.entryT,u=Math.min(this.t/T,1),L=this.L,heat=heatAt(u);
  L.x=entryX(u,T);L.y=entryAlt(u,T)+COM;L.vy=entryVy(u,T);L.vx=entryVx(u,T);
  L.th=.035*Math.sin(this.t*4.3)*heat+.02*Math.sin(this.t*9.1)*heat;L.thr=0;this.setPose();this.setJets([0,0,0]);this.exhaust(0,1,0);
  const alt=L.y-COM,dn=dens(alt);
  /* plasma sheath + heating glow */
  const T2=performance.now()/1000,gl=Math.pow(heat,.7);
  for(const m of[this.plasmaCap,this.plasmaWake]){m.material.uniforms.uI.value=gl*(.8+.4*Math.random());m.material.uniforms.uT.value=T2;m.visible=gl>.02}
  this.plasmaCap.scale.set(7.5+3*gl,6+5*gl,7.5+3*gl);this.heatLight.intensity=9000*gl*(.8+.4*Math.random());
  /* aerodynamic trail: fire + dark ablation smoke, emitted along the path travelled this frame */
  if(gl>.03){const base=new V3(L.x,L.y-COM,0);if(this.lastBase.y>1e8)this.lastBase.copy(base);const n=Math.min(16,1+Math.ceil(base.distanceTo(this.lastBase)/14));
   for(let i=0;i<n;i++){const k=(i+Math.random())/n,x=lerp(this.lastBase.x,base.x,k),y=lerp(this.lastBase.y,base.y,k);
    for(let q=0;q<2;q++)this.fire.emit(x+rnd(-3,3),y+rnd(-2,10),rnd(-3,3),rnd(-4,4),rnd(2,14),rnd(-4,4),rnd(.6,1.5),rnd(5,9),rnd(18,34),1,rnd(.45,.65),rnd(.15,.3),.55*gl,.8);
    this.puffs.emit(x+rnd(-3,3),y+rnd(0,20),rnd(-3,3),rnd(-5,5),rnd(0,8),rnd(-5,5),rnd(3,5.5),rnd(8,14),rnd(40,95),.42,.33,.30,.4*gl,.3)}
   this.lastBase.copy(base)}
  /* low-altitude dust kicked up by the supersonic descent as the ground comes up */
  this.kick=0;const shake=gl*(.5+2.4*gl);this.entryShake=shake;
  /* camera: low side shot looking up at the plasma, then blends into the landing chase cam */
  const b=sstep(.62,1,u),sd=lerp(135,150,b);
  const ent=new V3(L.x+lerp(52,0,b),L.y+lerp(-34,16,b),sd),land=this.landCam(L,dt,true);this.cp.copy(ent).lerp(land.p,b);this.cl.set(L.x,L.y+lerp(-6,0,b),0).lerp(land.l,b);
  const f=this.fired,at=(k,uu,fn)=>{if(!f[k]&&u>=uu){f[k]=1;fn()}};
  at('a',.02,()=>this.cap('ATMOSPHERIC ENTRY  ·  ENTRY INTERFACE 55 KM',2800));
  at('b',.22,()=>{this.cap('PEAK HEATING',2200);if(!this.retry)this.sub('The heat shield and plasma can reach thousands of degrees. Here the clock is compressed; real Mars entry takes about 7 minutes.','NASA FACT',5600)});
  at('c',.52,()=>this.cap('SUPERSONIC  ·  PREPARE FOR RETRO-PROPULSION',2600));
  at('d',.84,()=>{$('m-tut').classList.add('on');this.tutUp=true});
  this.audioUpdate(0,gl);this.hudTick(dt);
  if(this.t>=T)this.startLanding()}

 /* chase camera used by landing (and blended into at the end of entry) */
 landCam(L,dt,peek){const gnd=groundAt(L.x),ba=L.y-COM-gnd,k=sstep(0,380,ba);
  if(!peek)this.camX+=(L.x-this.camX)*Math.min(1,dt*1.9);const cx=peek?L.x:this.camX;
  return{p:new V3(cx,lerp(gnd+9,L.y+16+Math.min(ba*.035,70),k),lerp(70,105,k)),l:new V3(L.x,lerp(L.y-4,L.y,k),0)}}

 /* GUIDED DESCENT: whatever the player does, the lander is steered back over the landing site (x=0) and held inside a safe
    descent-speed corridor, so it can never leave the survey area or hover forever. Keys still tilt it, fire the plume and burn fuel. */
 assist(L,dt,inp){const alt=L.y-COM-Math.max(groundAt(L.x-FOOT),groundAt(L.x+FOOT)),tilt=(inp.right?1:0)-(inp.left?1:0),k=Math.min(1,dt*1.2);
  const vxT=clamp((0-L.x)*.15,-22,22)*sstep(500,800,alt)+tilt*5*sstep(700,1500,alt);   // pull to site + small player nudge
  L.vx+=(vxT-L.vx)*k;
  const thT=tilt*.3*sstep(300,1000,alt)+clamp((vxT-L.vx)*.04,-.2,.2);L.th+=(thT-L.th)*Math.min(1,dt*2.5);L.om=0;
  const sq=Math.sqrt(2*4.2*Math.max(alt-600,0)),vT=-(sq+12),vMin=-(sq*.6+8);   // corridor: brake if too fast, drop if hovering/climbing
  if(L.vy<vT){const a0=13/(.62+.38*L.fuel/100);L.thr=Math.max(L.thr,clamp(((vT-L.vy)*3.4+G)/a0,0,1));L.vy+=(vT-L.vy)*Math.min(1,dt*3)}
  else if(L.vy>vMin)L.vy+=(vMin-L.vy)*Math.min(1,dt*2);
  L.fuel=Math.max(L.fuel,12)}
 updLanding(dt){const L=this.L,inp=this.ejected?{}:this.inp,gnd=groundAt(L.x);
  if(this.state==='landing'&&!this.ejected&&L.y-COM-gnd<=EJECT_ALT)this.eject();
  this.updPod(dt);if(this.pod&&this.pod.mode==='landed'&&this.pod.landT>2.4){if(!this.walk)this.startWalk();try{const bo=this.base.update(dt);this.dn.update(dt);this.ambUpdate(dt);this.stepUpdate(dt);if(this.ns)this.ns.update(dt);if(bo)this.vitBase(dt);if(!bo){if(!this.salv.tk.ui)this.updWalk(dt);this.salv.update(dt)}else if(this.base.mode==='outside'){this.syncPk();this.salv.update(dt)}else this.salv.updVM(dt,!!(this.sv&&this.sv.dead))}catch(err){if(this._lastErr!==String(err)){this._lastErr=String(err);console.error('[walk/salvage update]',err)}}}
  const act=inp.up||inp.left||inp.right||inp.rcs;
  if(this.state==='landing'){
   if(act&&!this.acted){this.acted=true;this.actT=this.t}
   this.ts=this.acted?Math.min(1,this.ts+dt*2.4):lerp(.2,1,sstep(1.5,9,this.t));          // bullet-time hand-off until the first input
   if(this.tutUp&&((this.acted&&this.t-this.actT>3.5)||this.t>20)){this.tutUp=false;$('m-tut').classList.remove('on');$('m-hint').classList.add('on')}
   this.setLegs(sstep(0,1.8,this.t));
   const sdt=dt*this.ts,n=Math.max(1,Math.ceil(sdt/.02));if(this.ejected){for(let i=0;i<n;i++)this.salv.autoLand(sdt/n)}   /* NEW: unmanned descent stage lands itself, undamaged */
   else{let pen=-1e9;for(let i=0;i<n&&this.state==='landing';i++){pen=stepLander(L,sdt/n,inp,groundAt);if(pen>0){this.touchdown(pen);break}this.assist(L,sdt/n,inp)}}
   const tilt=(inp.right?1:0)-(inp.left?1:0);this.setJets([tilt>0&&L.fuel>0,tilt<0&&L.fuel>0,inp.rcs&&L.fuel>0]);
   this.setPose();const alt=L.y-COM-gnd,dn=dens(alt);this.exhaust(L.thr,1-clamp(dn*2.2,0,1),dn*.35);
   this.dustFromEngine(sdt,alt);this.entryShake=this.ejected?0:L.thr*clamp(1-alt/600,.15,1)*.5;
   this.audioUpdate(this.ejected?L.thr*this.salv.hear():L.thr,0);if(this.state==='landing'&&!this.ejected)this.statusUpdate(alt);if(!this.ejected)this.hudTick(dt);
   if(!this.ejected){const c=this.landCam(L,dt,false);this.cp.copy(c.p);this.cl.copy(c.l)}}
  else if(this.state==='landed'){this.landT+=dt;const k=1-Math.exp(-3*dt);L.th*=1-k;L.y+=(gnd+COM-L.y)*k;this.setPose();this.exhaust(0,0,0);this.setJets([0,0,0]);this.entryShake=0;
   const az=Math.min(this.landT*.1,.9);this.cp.set(L.x+Math.sin(az)*118,lerp(14,30,sstep(0,6,this.landT)),Math.cos(az)*118);this.cl.set(L.x,28,0);
   if(this.landT>1.6&&!this.winShown){this.winShown=true;$('m-win').classList.add('on');$('m-hint').classList.remove('on');this.tone(523,1.4,.07);setTimeout(()=>this.tone(659,1.4,.07),180);setTimeout(()=>this.tone(784,2,.07),360)}
   this.audioUpdate(0,0);this.hudTick(dt)}
  else if(this.state==='crashed'){this.crashT+=dt;this.entryShake=0;this.ts=lerp(.3,1,sstep(0,1.3,this.crashT));
   if(this.crashT<14)this.crashFire(dt);
   if(!this.survive&&this.crashT>2.4&&!$('m-over').classList.contains('on')){$('m-over').classList.add('on');$('m-hud').classList.remove('on')}
   this.audioUpdate(0,0)}}

 statusUpdate(alt){const L=this.L,a0=13/(.62+.38*L.fuel/100),net=Math.max(.5,a0*.97-G),stop=L.vy<0?L.vy*L.vy/(2*net):0;
  if(L.fuel<=0&&alt>2)return this.status('FUEL EMPTY','#ff5a4a',true);
  if(L.vy<-8&&alt<stop*1.12+60)return this.status('BURN NOW','#ff5a4a',true);
  if(L.vy<-8&&alt<stop*1.9+400)return this.status('PREPARE TO BURN','#ffc15a',false);
  if(alt<120&&Math.abs(L.vy)<LIM.vy&&Math.abs(L.vx)<LIM.vx&&Math.abs(L.th)<LIM.th)return this.status('GOOD TO LAND','#7dff9a',false);
  if(alt<120&&(Math.abs(L.th)>LIM.th||Math.abs(L.vx)>LIM.vx))return this.status(Math.abs(L.th)>LIM.th?'LEVEL THE LANDER':'KILL THE DRIFT','#ffc15a',false);
  this.status('')}

 /* ---------- engine dust: huge clouds blasted radially across the pad ---------- */
 dustFromEngine(dt,alt){const L=this.L;if(L.thr<.03||alt>170||dt<=0)return;
  const st=L.thr*(1-sstep(15,170,alt)),sn=Math.sin(L.th),cs=Math.max(.35,Math.cos(L.th)),bx=L.x-COM*sn,hb=Math.max(0,L.y-COM*cs-groundAt(bx));
  const gx=bx-sn*hb/cs,gh=groundAt(gx),n=Math.floor(st*1100*dt+Math.random());   // plume hits the ground along the thrust axis
  for(let i=0;i<n;i++){const a=rnd(0,6.2832),sp=rnd(14,85)*(.45+st),rr=Math.pow(Math.random(),.5)*6;
   this.puffs.emit(gx+Math.cos(a)*rr,gh+rnd(.3,1.5),Math.sin(a)*rr,Math.cos(a)*sp,rnd(1,5+9*st),Math.sin(a)*sp,rnd(2.8,6),rnd(3,6),rnd(22,48),.80,.54,.40,.5*Math.min(1,st*1.3),.75,.35,-.3)}}

 /* ---------- touchdown: judge it, then land or blow up ---------- */
 touchdown(pen){window.SolMusic&&SolMusic.mode('aftermath');const L=this.L,vy=-L.vy,vx=Math.abs(L.vx),th=Math.abs(L.th);L.y+=pen;
  this.impact={vy,vx,th};this.exhaust(0,0,0);
  this.mild=false;this.survive=true;this.crash();if(this.ejected)this.kick=Math.min(this.kick,.5)}   // every touchdown blows the rocket up; if it's still upright the player survives and walks out, if it's tipped over -> retry screen   // upright touchdown = damaged but alive; on its side / sliding / way too fast = explosion   // no safe landing exists: good touchdown = light damage, bad = destroyed
 land(){const L=this.L;this.state='landed';this.landT=0;this.winShown=false;L.thr=0;L.vx=L.vy=0;L.om=0;this.status('');this.tutUp=false;$('m-tut').classList.remove('on');
  const i=this.impact;$('mw-s').innerHTML=`TOUCHDOWN ${i.vy.toFixed(1)} m/s &nbsp;·&nbsp; DRIFT ${i.vx.toFixed(1)} m/s &nbsp;·&nbsp; TILT ${(MU.radToDeg(i.th)).toFixed(1)}°<br>${Math.abs(L.x).toFixed(0)} m FROM PAD CENTRE &nbsp;·&nbsp; ${L.fuel.toFixed(0)}% FUEL LEFT<br><span style="opacity:.6;font-size:12px">PRESS [R] TO FLY IT AGAIN</span>`;
  for(let k=0;k<160;k++){const a=rnd(0,6.2832),sp=rnd(8,40);this.puffs.emit(L.x+Math.cos(a)*4,groundAt(L.x)+.5,Math.sin(a)*4,Math.cos(a)*sp,rnd(.5,4),Math.sin(a)*sp,rnd(3,6),rnd(3,6),rnd(18,40),.80,.54,.40,.45,.8,.2,-.2)}
  this.tone(220,.5,.06,'triangle')}
 crash(){const L=this.L,q=this.mild?.18:1;{const h=document.querySelector('#m-over h1');if(h)h.innerHTML=this.mild?'HARD LANDING &mdash; LANDER DAMAGED<br><small style="font-size:.45em;letter-spacing:4px">PRESS [R] TO RETRY</small>':'CRASHED! PRESS [R] TO RETRY'}this.state='crashed';this.crashT=0;L.thr=0;this.status('');this.tutUp=false;this.ejected=this.ejected||false;$('m-tut').classList.remove('on');$('m-hint').classList.remove('on');
  this.crashPos.set(L.x,groundAt(L.x),0);const P=this.crashPos;this.rocket.updateMatrixWorld(true);
  /* rigid-body debris built from the real hull materials */
  for(let i=0;i<Math.round(46*(this.mild?.4:1));i++){const kind=i%3,g=kind===0?new THREE.CylinderGeometry(1.85,1.85,rnd(2,9),10,1,true,rnd(0,6),rnd(.8,2.2)):kind===1?new THREE.BoxGeometry(rnd(.5,3),rnd(.3,2),rnd(.3,2)):new THREE.CylinderGeometry(rnd(.3,1),rnd(.5,1.4),rnd(1,4),8);
   const m=new THREE.Mesh(g,this.debMats[Math.floor(rand()*this.debMats.length)]);m.castShadow=true;g.computeBoundingSphere();
   const wp=this.rocket.localToWorld(new V3(rnd(-1.4,1.4),rnd(0,68),rnd(-1.4,1.4)));m.position.copy(wp);m.rotation.set(rnd(0,6),rnd(0,6),rnd(0,6));
   const out=new V3(wp.x-L.x,wp.y-L.y,wp.z).normalize(),sp=rnd(8,42);
   this.near.add(m);this.debris.push({m,v:new V3(out.x*sp+L.vx*.4+rnd(-6,6),Math.abs(out.y)*sp*.8+rnd(6,30),out.z*sp+rnd(-12,12)),w:new V3(rnd(-6,6),rnd(-6,6),rnd(-6,6)),r:Math.max(.4,g.boundingSphere.radius*.7)})}
  this.rocket.visible=!!this.mild;this.lander.visible=!!this.mild;this.exhaust(0,0,0);this.setJets([0,0,0]);
  /* fireball, smoke, shock-dust ring, sparks */
  const gy=P.y;
  for(let i=0;i<Math.round(110*q);i++){const a=rnd(0,6.28),e=rnd(.05,1.4),sp=rnd(4,48),cx=Math.cos(a)*Math.cos(e),cz=Math.sin(a)*Math.cos(e);this.fire.emit(P.x+rnd(-4,4),gy+rnd(1,16),rnd(-4,4),cx*sp,Math.sin(e)*sp+4,cz*sp,rnd(.7,1.9),rnd(10,20),rnd(26,52),1,rnd(.45,.7),rnd(.12,.3),.9,.7,3)}
  for(let i=0;i<Math.round(40*q);i++){const a=rnd(0,6.28),sp=rnd(2,18);this.fire.emit(P.x,gy+rnd(2,12),0,Math.cos(a)*sp,rnd(2,18),Math.sin(a)*sp,rnd(.35,.9),rnd(8,16),rnd(22,40),1,.95,.8,1,1,1)}
  for(let i=0;i<Math.round(120*q);i++){const a=rnd(0,6.28),e=rnd(.1,1.2),sp=rnd(2,26);this.puffs.emit(P.x+rnd(-5,5),gy+rnd(1,14),rnd(-5,5),Math.cos(a)*Math.cos(e)*sp,Math.sin(e)*sp+6,Math.sin(a)*Math.cos(e)*sp,rnd(3.5,7.5),rnd(14,24),rnd(55,110),.12,.10,.09,.7,.5,3.5)}
  for(let i=0;i<Math.round(170*q);i++){const a=rnd(0,6.28),sp=rnd(35,105);this.puffs.emit(P.x,gy+rnd(.5,3),0,Math.cos(a)*sp,rnd(0,5),Math.sin(a)*sp,rnd(3,6.5),rnd(10,18),rnd(40,80),.80,.54,.40,.6,.9,.3,-.2)}
  for(let i=0;i<Math.round(150*q);i++){const a=rnd(0,6.28),e=rnd(.1,1.5),sp=rnd(20,95);this.fire.emit(P.x,gy+rnd(1,6),0,Math.cos(a)*Math.cos(e)*sp,Math.sin(e)*sp,Math.sin(a)*Math.cos(e)*sp,rnd(.8,2.2),rnd(1,2),.5,1,rnd(.7,.9),rnd(.3,.5),1,.15,0,-G)}
  this.flash.position.set(P.x,gy+16,0);this.flashI=5e5*q;this.shockRing.visible=true;this.shockRing.position.set(P.x,gy+.4,0);this.ringT=0;
  this.kick=3.4*(this.mild?.4:1);this.fovKick=9*q;const f=$('m-flash');f.style.transition='none';f.style.opacity=this.ejected?.2:.85;void f.offsetWidth;f.style.transition='opacity .7s ease-out';f.style.opacity=0;this.boom()}
 ejectPodMesh(){const g=new THREE.Group(),M=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.6,metalness:.2},o));
  const mw=M(0xe8e4dc,{roughness:.5,metalness:.25}),mo=M(0xd0501f,{roughness:.55}),md=M(0x2a2e34,{roughness:.5,metalness:.5}),mc=M(0x15181c,{roughness:.9,metalness:.1}),
   mg=M(0x9aa3ad,{roughness:.35,metalness:.8}),mgl=M(0x6fd0ff,{roughness:.1,metalness:.6,emissive:0x1a5a80,emissiveIntensity:.6}),mr=M(0xff3a2a,{emissive:0xff2a1a,emissiveIntensity:1.2});
  const add=(geo,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);g.add(o);return o};
  /* tapered crew body (top r .9, bottom r 1.15, 2.2 m tall, base at y=-1.1) */
  add(new THREE.CylinderGeometry(.9,1.15,2.2,32),mw);
  /* ablative heat shield on the underside + rim */
  add(new THREE.CylinderGeometry(1.15,1.05,.22,32),mc,0,-1.2,0);
  add(new THREE.TorusGeometry(1.15,.045,8,40),md,0,-1.08,0).rotation.x=Math.PI/2;
  /* orange stripe bands */
  add(new THREE.CylinderGeometry(.96,1.0,.16,32,1,true),mo,0,.55,0);
  add(new THREE.CylinderGeometry(1.08,1.12,.1,32,1,true),mo,0,-.7,0);
  /* nose cone + shoulder ring + tip */
  add(new THREE.ConeGeometry(.9,1.3,32),mo,0,1.75,0);
  add(new THREE.TorusGeometry(.9,.05,8,40),md,0,1.1,0).rotation.x=Math.PI/2;
  add(new THREE.CylinderGeometry(.05,.05,.28,8),mg,0,2.55,0);
  add(new THREE.SphereGeometry(.07,10,8),mr,0,2.72,0);
  /* hatch (front, +Z) with frame, window, handle, seal lines */
  const tilt=Math.atan(.25/2.2),hz=1.03;
  const fr=add(new THREE.BoxGeometry(1.0,1.25,.1),md,0,-.05,hz);fr.rotation.x=-tilt;
  const hd=add(new THREE.BoxGeometry(.86,1.11,.06),M(0x3a4047,{roughness:.45,metalness:.6}),0,-.05,hz+.06);hd.rotation.x=-tilt;
  const wn=add(new THREE.CylinderGeometry(.2,.2,.05,20),mgl,0,.22,hz+.1);wn.rotation.x=Math.PI/2-tilt;
  const hn=add(new THREE.BoxGeometry(.3,.05,.06),mg,0,-.3,hz+.11);hn.rotation.x=-tilt;
  for(const sx of[-.3,.3])for(const sy of[.25,-.35]){const bt=add(new THREE.SphereGeometry(.03,8,6),mg,sx*1.35,sy-.05,hz+.1);bt.rotation.x=-tilt}
  /* small side portholes */
  for(const sd of[-1,1]){const p=add(new THREE.CylinderGeometry(.13,.13,.06,16),mgl,sd*.98,.25,.0);p.rotation.z=Math.PI/2}
  /* braking jet nozzles + crush-pad landing feet */
  for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,x=Math.cos(a)*.72,z=Math.sin(a)*.72;
   const n=add(new THREE.CylinderGeometry(.1,.17,.28,14),md,x,-1.36,z);add(new THREE.CylinderGeometry(.075,.075,.03,12),mr,x,-1.5,z)}
  for(let i=0;i<3;i++){const a=i*2.094+.5,c=Math.cos(a),sn=Math.sin(a);
   const leg=add(new THREE.CylinderGeometry(.03,.04,.5,8),mg,c*1.22,-1.15,sn*1.22);leg.rotation.set(sn*.35,0,-c*.35);
   add(new THREE.CylinderGeometry(.16,.16,.05,12),md,c*1.32,-1.4,sn*1.32)}
  /* HMSA-style marking strip and rear antenna */
  add(new THREE.BoxGeometry(.5,.08,.02),mo,-.0,.02,-1.01).rotation.x=tilt;
  add(new THREE.CylinderGeometry(.015,.015,.5,6),mg,-.5,1.3,-.4);
  /* parachute canopy (animated by updPod: can + lines) */
  const can=new THREE.Mesh(new THREE.SphereGeometry(5.5,28,12,0,6.2832,0,1.55),M(0xff7a2c,{side:THREE.DoubleSide,roughness:.9,metalness:0}));can.position.y=9;
  const att=[[.9,0],[-.9,0],[0,.9],[0,-.9]].map(([x,z])=>[x,1.1,z]),rim=[[5.4,0],[-5.4,0],[0,5.4],[0,-5.4]].map(([x,z])=>[x,9.4,z]),pts=[];
  for(let i=0;i<4;i++)pts.push(att[i],rim[i],att[i],[0,2.45,0]);
  const ln=new THREE.BufferGeometry().setFromPoints(pts.map(a=>new V3(...a)));
  const lines=new THREE.LineSegments(ln,new THREE.LineBasicMaterial({color:0xdddddd}));
  g.add(can,lines);g.traverse(o=>{o.castShadow=true});this.near.add(g);return{g,can,lines}}
 eject(){const L=this.L,m=this.ejectPodMesh();this.ejected=true;this.acted=true;this.ts=1;this.salv.begin();
  this.pod={...m,x:L.x,y:L.y+40,z:0,vx:L.vx*.25+2.5,vy:0,vz:1.5,t:0,mode:'chute',landT:0};
  $('m-hud').classList.remove('on');$('m-tut').classList.remove('on');$('m-hint').classList.remove('on');this.status('');
  this.kick=1.6;this.fovKick=7;this.tone&&this.tone(660,.5,.08);
  this.cap('EJECT!  ·  CREW CAPSULE AWAY',3200);
  this.sub(`At ${EJECT_ALT} m the abort system fired the crew capsule clear of the descent stage. A parachute and braking jets bring it down safely while the abandoned, heat-scorched stage plunges toward the surface nearby. It will not survive the impact.`,'ESCAPE SYSTEM',7000)}
 updPod(dt){const P=this.pod;if(!P)return;
  if(P.mode==='chute'){P.t+=dt;const gd=heightAt(P.x,P.z),alt=P.y-gd-1.1,sp=alt>200?48:lerp(4.5,48,sstep(0,200,alt)),boost=38*Math.max(0,1-P.t/1.1),vt=boost>1?boost:-sp;
   P.vy+=(vt-P.vy)*Math.min(1,dt*2.2);P.vx+=(2.2-P.vx)*Math.min(1,dt*.5);P.vz+=(1.2-P.vz)*Math.min(1,dt*.5);P.x+=P.vx*dt;P.y+=P.vy*dt;P.z+=P.vz*dt;
   const cs=sstep(1,1.9,P.t);P.can.scale.setScalar(Math.max(.05,cs));P.lines.visible=cs>.5;
   P.g.position.set(P.x,P.y,P.z);P.g.rotation.z=.12*Math.sin(P.t*1.3);P.g.rotation.x=.08*Math.sin(P.t*1.7);
   if(alt<90&&P.t>2)for(let i=0;i<2;i++)this.fire.emit(P.x+rnd(-.3,.3),P.y-1.3,P.z+rnd(-.3,.3),rnd(-1,1),rnd(-9,-4),rnd(-1,1),rnd(.3,.6),rnd(1.5,2.5),rnd(3,5),1,.7,.3,.8,.6,1);
   if(!this.walk){this.cp.set(P.x+12,P.y+7,P.z+34);this.cl.set(P.x,P.y-12,P.z)}
   if(alt<=0){P.mode='landed';P.landT=0;P.y=gd+1.1;P.g.position.y=P.y;P.g.rotation.set(0,0,0);this.cap('CAPSULE DOWN',2400);this.kick=.5}}
  else{P.landT+=dt;const c=Math.max(.05,1-P.landT/1.2);P.can.scale.set(1,c,1);P.can.position.y=lerp(2.4,9,c);P.lines.visible=P.landT<.4;if(P.landT>3)P.can.visible=false;
   if(!this.walk){this.cp.set(P.x+8,P.y+3,P.z+12);this.cl.set(P.x,P.y+1,P.z)}}}
 tutDraw(){const T=this.tut;if(!T)return;const st=[['LOOK AROUND','<kbd>MOUSE</kbd>','Click the screen once to capture the mouse. Arrow keys also turn.'],['WALK','<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>','Walk about 8 metres.'],['SPRINT','<kbd>SHIFT</kbd>','Hold Shift while walking.'],['JUMP','<kbd>SPACE</kbd>','Mars gravity is only 38% of Earth&rsquo;s, so you jump high.']];
  let h='<div class="h">TUTORIAL</div>';
  if(T.i>=4)h+='<div class="s a"><span class="c">&#10003;</span><b>TUTORIAL COMPLETE</b></div><div class="x">Explore Mars. Press [R] to restart.</div>';
  else st.forEach((q,i)=>{h+=`<div class="s ${i<T.i?'d':i===T.i?'a':''}"><span class="c">${i<T.i?'&#10003;':''}</span><span>${q[0]}${q[1]}</span></div>`;if(i===T.i)h+=`<div class="x">${q[2]}</div>`});
  $('m-walk').innerHTML=h}
 tutTick(dt,dyaw,dmove,sprint){const T=this.tut;if(!T)return;
  const e=(performance.now()-this.clk0)/1000*1.0275,t=((16*3600+20*60+e)%88775|0),hh=Math.floor(t/3600)%25,mm=Math.floor(t%3600/60),ss=t%60;$('m-clock').textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  if(T.i>=4){T.done+=dt;if(T.done>6)$('m-walk').classList.remove('on');return}
  const was=T.i;
  if(T.i===0){T.look+=dyaw;if(T.look>1.3)T.i=1}
  else if(T.i===1){T.dist+=dmove;if(T.dist>8)T.i=2}
  else if(T.i===2){if(sprint)T.spr+=dmove;if(T.spr>8)T.i=3}
  else if(T.i===3){if(this.tutJump){this.tutJump=0;T.i=4}}
  if(T.i!==was){this.tone&&this.tone(660+T.i*90,.25,.05);this.tutDraw()}}

 /* ---------- survival vitals: health / oxygen / radiation / water / food ---------- */
 vitInit(){if(this.vitEl)return;
  const st=document.createElement('style');st.textContent=`
#m-vit{position:fixed;left:28px;bottom:22px;z-index:22;pointer-events:none;opacity:0;transition:opacity .8s;transform-origin:bottom left;font-family:Consolas,monospace;width:300px}
#m-vit.on{opacity:1}
#m-vit .vb{position:relative;height:50px;margin-bottom:5px}
#m-vit .em{position:absolute;left:0;top:2px;width:46px;height:46px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.7))}
#m-vit .lb{position:absolute;left:58px;top:0;right:0;display:flex;justify-content:space-between;font:700 10px Consolas,monospace;letter-spacing:2px;color:#e9dccf;text-shadow:0 1px 3px #000}
#m-vit .tk{position:absolute;left:46px;top:14px;right:0;height:16px;background:rgba(14,12,16,.82);clip-path:polygon(0 0,100% 0,calc(100% - 13px) 100%,0 100%);border:0}
#m-vit .tk::before{content:"";position:absolute;inset:0;border-top:1px solid rgba(255,255,255,.22)}
#m-vit .fl{position:absolute;left:0;top:0;bottom:0;width:100%;transition:width .15s}
#m-vit .tb{position:absolute;left:46px;top:31px;right:18px;height:6px;background:rgba(14,12,16,.7);clip-path:polygon(0 0,100% 0,calc(100% - 6px) 100%,0 100%)}
#m-vit .tr{position:absolute;left:0;top:0;bottom:0;background:#f0a030;width:100%}
#m-vit .vb.low .fl{animation:vp .8s infinite}#m-vit .vb.low .em{animation:vp .8s infinite}
@keyframes vp{50%{filter:brightness(1.9)}}
#m-vit .hn{font:600 9px Consolas,monospace;letter-spacing:2px;color:#fff;opacity:.55;margin:6px 0 0 4px;text-shadow:0 1px 3px #000}`;document.head.appendChild(st);
  const IC={hp:'<path d="M12 21s-7.5-4.6-9.5-9.2C1 8 3.2 4.5 6.8 4.5c2 0 3.700 1.100 5.200 3 1.500-1.900 3.200-3 5.200-3 3.600 0 5.800 3.500 4.300 7.300C19.500 16.400 12 21 12 21z" fill="currentColor"/>',
   o2:'<text x="12" y="16" text-anchor="middle" font-size="11" font-weight="800" font-family="Consolas,monospace" fill="currentColor">O&#8322;</text><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>',
   rad:'<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="9" stroke-dasharray="5.236 5.236" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="2.200" fill="currentColor"/>',
   wat:'<path d="M12 3C12 3 5 11 5 15a7 7 0 0014 0c0-4-7-12-7-12z" fill="currentColor"/>',
   food:'<path d="M12 7c-1-2-3-3-5-2-3 1-4 5-3 9 1 3 3 6 5 6 1 0 2-.7 3-.7s2 .7 3 .7c2 0 4-3 5-6 1-4 0-8-3-9-2-1-4 0-5 2z" fill="currentColor"/><path d="M12 7c0-2 1-4 3-5" stroke="currentColor" stroke-width="1.800" fill="none"/>'};
  const defs=[['hp','HEALTH','#ff5a4a','#8e1414','#ff9a7a'],['o2','OXYGEN','#42d0ff','#0b5a8a','#aef0ff'],['rad','RADIATION','#b8ff3a','#3f7a10','#eaff9a'],['wat','WATER','#4a90ff','#14407f','#a8cbff'],['food','FOOD','#ffa63b','#8a4a0c','#ffd9a0']];
  const el=document.createElement('div');el.id='m-vit';this.vit={};let h='';
  for(const[k,n,c1,c2,c3]of defs)h+=`<div class="vb" id="vb-${k}"><svg class="em" viewBox="0 0 46 46"><defs><linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c3}"/><stop offset=".5" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><polygon points="23,1 45,23 23,45 1,23" fill="url(#g${k})"/><polygon points="23,5 41,23 23,41 5,23" fill="#14121a" stroke="rgba(255,255,255,.25)" stroke-width="1"/><g transform="translate(11,11) scale(1)" style="color:${c1}">${IC[k]}</g></svg><div class="lb"><span>${n}</span><span id="vv-${k}">100%</span></div><div class="tk"><div class="fl" id="vf-${k}" style="background:linear-gradient(180deg,${c3} 0%,${c1} 45%,${c2} 100%)"></div></div><div class="tb"><div class="tr" id="vt-${k}"></div></div></div>`;
  h+='<div class="hn">[E] RESUPPLY AT CAPSULE &nbsp;&middot;&nbsp; [ ] RESIZE HUD</div>';el.innerHTML=h;document.body.appendChild(el);this.vitEl=el;
  for(const[k]of defs)this.vit[k]={f:el.querySelector('#vf-'+k),t:el.querySelector('#vt-'+k),v:el.querySelector('#vv-'+k),b:el.querySelector('#vb-'+k),tr:100};
  let sc=1;try{sc=parseFloat(localStorage.getItem('marsVitScale'))||1}catch(e){}this.vitScale=sc;el.style.transform=`scale(${sc})`}
 vitResize(d){if(!this.vitEl)return;this.vitScale=clamp((this.vitScale||1)+d,.6,1.7);this.vitEl.style.transform=`scale(${this.vitScale})`;try{localStorage.setItem('marsVitScale',this.vitScale)}catch(e){}}
 /* keeps the surface player (pk) in step with the base-controller camera so hammer, ice, crucible and table work outside the base */
 syncPk(){const b=this.base,P=this.pk;if(!P||!b.root)return;const w=b.root.localToWorld(new V3(b.p.x,0,b.p.z));P.x=w.x;P.z=w.z;P.y=heightAt(w.x,w.z);const dx=this.cl.x-this.cp.x,dz=this.cl.z-this.cp.z;P.yaw=Math.atan2(dz,dx);P.pitch=Math.atan2(this.cl.y-this.cp.y,Math.hypot(dx,dz))}
 resupply(){const S=this.sv,P=this.pk,Q=this.pod;if(!S||S.dead||!Q)return;if(Math.hypot(P.x-Q.x,P.z-Q.z)>5){this.cap('GET CLOSER TO THE CAPSULE',1600);return}
  S.o2=S.wat=S.food=100;S.rad=Math.max(0,S.rad-40);S.hp=Math.min(100,S.hp+15);this.cap('SUPPLIES RESTOCKED',1800);this.tone&&this.tone(880,.3,.06)}
 survTick(dt,sprint,moving,inBaseMode){const S=this.sv;if(!S||S.dead)return;const Q=this.pod,P=this.pk,bs=this.base,inside=!!(inBaseMode&&bs&&bs.interior),near=!inBaseMode&&Q&&P&&Math.hypot(P.x-Q.x,P.z-Q.z)<5;
  /* VITALS BALANCE: the lower HEALTH gets, the faster FOOD / OXYGEN / WATER drain (x1.0 at full health ... x2.8 at zero) */
  const stress=1+(1-clamp(S.hp,0,100)/100)*1.8;
  S.wat=Math.max(0,S.wat-.11*stress*dt);
  if(inside){   /* BASE LIFE SUPPORT: oxygen + food are held at 98-99 % (no drain inside) and the hull shields you from radiation */
   const k=Math.min(1,dt*3);S.o2=Math.min(99,S.o2+(98.5-S.o2)*k);S.food=Math.min(99,S.food+(98.5-S.food)*k);if(S.o2>97.9)S.o2=Math.max(98,S.o2);if(S.food>97.9)S.food=Math.max(98,S.food);
   S.rad=Math.max(0,S.rad-1.2*dt)}
  else{S.o2=Math.max(0,S.o2-(.16+(sprint&&moving?.22:0))*stress*dt);S.food=Math.max(0,S.food-.065*stress*dt);S.rad=near?Math.max(0,S.rad-.8*dt):Math.min(100,S.rad+.09*dt)}
  let dmg=0;if(S.o2<=0)dmg+=2.2;if(S.wat<=0)dmg+=.6;if(S.food<=0)dmg+=.4;
  if(!inside&&S.rad>0)dmg+=.02+.0105*S.rad;   /* RADIATION: even a small dose bleeds health outside, harder as the dose builds (100 % ~ 1.1 hp/s) */
  if(dmg)S.hp=Math.max(0,S.hp-dmg*dt);else if(S.o2>30&&S.wat>20&&S.food>15&&S.rad<80)S.hp=Math.min(100,S.hp+.25*dt);
  for(const k of['hp','o2','rad','wat','food']){const v=this.vit[k],val=S[k];v.f.style.width=val+'%';v.tr+=(val-v.tr)*Math.min(1,dt*1.8);v.t.style.width=v.tr+'%';v.v.textContent=Math.round(val)+'%';
   v.b.classList.toggle('low',k==='rad'?val>70:val<25)}
  if(S.hp<=0){S.dead=true;try{document.exitPointerLock()}catch(e){}const h=document.querySelector('#m-over h1');
   if(h)h.innerHTML=(S.o2<=0?'YOU RAN OUT OF OXYGEN':S.rad>=25?'RADIATION SICKNESS':S.wat<=0?'DEHYDRATION':S.food<=0?'STARVATION':'YOU DIED')+'<br><small style="font-size:.45em;letter-spacing:4px">PRESS [R] TO RETRY</small>';
   $('m-over').classList.add('on');this.cap('',1)}}
 /* vitals while the base controller owns the camera (airlock, hab, outside the dome) */
 vitBase(dt){const b=this.base,k=this.keys;if(!this.sv||this.sv.dead||(this.dn&&this.dn.dead))return;
  if(!['inside','outside','walkin','walkout','cycle','cycleOut','walkin2'].includes(b.mode))return;
  const mv=!!b.moving;this.survTick(dt,mv&&!!(k.ShiftLeft||k.ShiftRight),mv,true)}
 startWalk(){window.SolMusic&&SolMusic.mode('off');const L=this.L;this.walk=true;const Q=this.pod;this.pk={x:Q.x+2.2,z:Q.z+2.2,vy:0,yaw:0,pitch:-.05};this.pk.yaw=Math.atan2(0-this.pk.z,L.x-this.pk.x);this.mdx=0;this.mdy=0;
  $('m-hud').classList.remove('on');$('m-hint').classList.remove('on');this.tut={i:0,look:0,dist:0,spr:0,jump:0,done:0};this.vitInit();this.sv={hp:100,o2:100,wat:100,food:100,rad:0,dead:false};this.vitEl.classList.add('on');this.clk0=performance.now();$('m-sol').classList.add('on');$('m-walk').classList.add('on');this.tutDraw();
  this.status('');this.cap('SOL 1  ·  WELCOME TO MARS',3000);/* base phase arms itself when crafting.js unlocks the last base area */this.salv.onWalkStart();window.SolVolWarn&&SolVolWarn.show('raise');
  this.lockPtr();const cv=this.r.domElement;if(!this.mlInit){this.mlInit=true;cv.addEventListener('click',()=>this.lockPtr());addEventListener('keydown',e=>{if(e.code!=='Escape'&&e.code!=='Tab'&&e.code!=='KeyB')this.lockPtr()});addEventListener('mousedown',()=>this.lockPtr());
   document.addEventListener('mousemove',e=>{if(this.walk&&document.pointerLockElement===cv){this.mdx+=e.movementX;this.mdy+=e.movementY}})}}
 lockPtr(){const cv=this.r&&this.r.domElement;if(!cv||!this.walk||(this.sv&&this.sv.dead)||document.pointerLockElement===cv)return;if(this.salv&&this.salv.tk&&this.salv.tk.ui)return;try{const p=cv.requestPointerLock();if(p&&p.catch)p.catch(()=>{})}catch(e){}}
 updWalk(dt){if(this.sv&&this.sv.dead)return;const P=this.pk,k=this.keys,L=this.L,yaw0=P.yaw,ox=P.x,oz=P.z;
  P.yaw+=this.mdx*.0025+((k.ArrowRight?1:0)-(k.ArrowLeft?1:0))*1.8*dt;P.pitch=clamp(P.pitch-this.mdy*.0025+((k.ArrowUp?1:0)-(k.ArrowDown?1:0))*1.2*dt,-1.3,1.3);this.mdx=this.mdy=0;
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw),rx=-fz,rz=fx,f=(k.KeyW?1:0)-(k.KeyS?1:0),sd=(k.KeyD?1:0)-(k.KeyA?1:0),sp=(k.ShiftLeft||k.ShiftRight?9:4.5)*dt;
  let mx=fx*f+rx*sd,mz=fz*f+rz*sd;const ml=Math.hypot(mx,mz)||1;P.x+=mx/ml*sp*(f||sd?1:0);P.z+=mz/ml*sp*(f||sd?1:0);
  const gh0=heightAt(P.x,P.z),push=(cx,cz,cr,top)=>{const qx=P.x-cx,qz=P.z-cz,q2=qx*qx+qz*qz,rr=cr+.45;if(q2<rr*rr&&top>(P.y===undefined?gh0:P.y)-gh0+(-.3)+0.0&&top+heightAt(cx,cz)>(P.y===undefined?gh0:P.y)+.3){const q=Math.sqrt(q2)||.01;P.x=cx+qx/q*rr;P.z=cz+qz/q*rr}};
  if(this.pod)push(this.pod.x,this.pod.z,1.2,2.4);if(this.salv.comp&&this.salv.stage==='down')push(this.salv.comp.x,this.salv.comp.z,1.15,1.6);   /* the intact component is solid; wreck pieces use rockCols */
  for(const c of this.rockCols)push(c.x,c.z,c.r,c.h);
  for(const d of this.debris)if(d.he)push(d.m.position.x,d.m.position.z,d.cr,d.he.y*2);
  const g=heightAt(P.x,P.z);let y=(P.y===undefined?g:P.y);if(P.y===undefined)P.y=g;
  P.vy-=G*dt;if(k.Space&&P.y<=g+.02){P.vy=3.2;this.tutJump=1}P.y+=P.vy*dt;if(P.y<g){P.y=g;P.vy=0}
  if(BND.on){this.edgeT=(this.edgeT||0)-dt;const wx=P.x-BND.cx,wz=P.z-BND.cz,wd=Math.hypot(wx,wz),lim=BND.R-1;   /* invisible wall */
   if(wd>lim){P.x=BND.cx+wx/wd*lim;P.z=BND.cz+wz/wd*lim;if(this.edgeT<=0){this.edgeT=3;this.cap('END OF SURVEY AREA  \u00b7  TURN BACK',1600)}}}
  this.tutTick(dt,Math.abs(P.yaw-yaw0),Math.hypot(P.x-ox,P.z-oz),!!(k.ShiftLeft||k.ShiftRight)&&Math.hypot(P.x-ox,P.z-oz)>0);this.survTick(dt,!!(k.ShiftLeft||k.ShiftRight),Math.hypot(P.x-ox,P.z-oz)>0);
  const ey=P.y+1.8;this.cp.set(P.x,ey,P.z);const cp=Math.cos(P.pitch);this.cl.set(P.x+fx*cp*10,ey+Math.sin(P.pitch)*10,P.z+fz*cp*10)}
 crashFire(dt){const P=this.crashPos;if(this.crashT<(this.mild?5:11))for(let i=0;i<(this.mild?1:2);i++)this.fire.emit(P.x+rnd(-7,7),P.y+rnd(0,3),rnd(-7,7),rnd(-2,2),rnd(3,9),rnd(-2,2),rnd(.8,1.7),rnd(5,9),rnd(12,26),1,rnd(.4,.6),.15,.7*(1-this.crashT/12),.8,5);
  for(let i=0;i<2;i++)this.puffs.emit(P.x+rnd(-6,6),P.y+rnd(1,5),rnd(-6,6),rnd(-2,2),rnd(4,9),rnd(-2,2),rnd(5,8),rnd(8,14),rnd(40,90),.10,.09,.08,.5*(1-this.crashT/16),.4,4)}

 /* ---------- effects, environment, camera, render ---------- */
 fx(dt){
  if(this.state==='crashed'||this.debris.length||this.shockRing.visible||(this.flashI||0)>.5){
   for(const d of this.debris){const m=d.m,p=m.position;
    if(!d.he){m.geometry.computeBoundingBox();const bb=m.geometry.boundingBox;d.he=new V3().subVectors(bb.max,bb.min).multiplyScalar(.5);d.ax=d.he.x<=d.he.y&&d.he.x<=d.he.z?0:d.he.y<=d.he.z?1:2;d.cr=Math.min(2.2,Math.max(d.he.x,d.he.z)*.9+.2)}
    d.v.y-=G*dt;p.addScaledVector(d.v,dt);
    const ang=d.w.length()*dt;if(ang>1e-6){DQ.setFromAxisAngle(DV.copy(d.w).normalize(),ang);m.quaternion.premultiply(DQ)}
    DM.makeRotationFromQuaternion(m.quaternion);const te=DM.elements,sup=Math.abs(te[1])*d.he.x+Math.abs(te[5])*d.he.y+Math.abs(te[9])*d.he.z,gh=heightAt(p.x,p.z);
    if(p.y-sup<gh){p.y=gh+sup;d.touched=true;
     if(d.v.y<-1.6){const k=-d.v.y;d.v.y=k*.28;d.v.x*=.7;d.v.z*=.7;d.w.multiplyScalar(.55);d.w.x+=rnd(-1,1)*k*.12;d.w.z+=rnd(-1,1)*k*.12}
     else{d.v.y=0;const f=Math.exp(-2.6*dt);d.v.x*=f;d.v.z*=f;d.w.multiplyScalar(Math.exp(-4*dt));
      /* topple until the longest axis lies flat on the ground */
      DV.set(te[d.ax*4],te[d.ax*4+1],te[d.ax*4+2]);if(Math.abs(DV.y)<.985){DH.set(0,DV.y>=0?1:-1,0);DQ.setFromUnitVectors(DV,DH);DQ2.identity().slerp(DQ,Math.min(1,dt*2.6));m.quaternion.premultiply(DQ2)}}}
    if(d.touched){d.age=(d.age||0)+dt;if(d.age>6){const k=1-(d.age-6)/.7;if(k<=0)d.dead=true;else m.scale.setScalar(k)}}
    /* collision with boulders and beacon poles */
    for(const c of this.rockCols){const dx=p.x-c.x,dz=p.z-c.z,rr=c.r+d.cr,dd=dx*dx+dz*dz;if(dd<rr*rr&&p.y<heightAt(c.x,c.z)+c.h){const q=Math.sqrt(dd)||.01,nx=dx/q,nz=dz/q,vn=d.v.x*nx+d.v.z*nz;p.x=c.x+nx*rr;p.z=c.z+nz*rr;if(vn<0){d.v.x-=1.4*vn*nx;d.v.z-=1.4*vn*nz}}}
    if(this.crashT<7&&Math.random()<dt*2.5)this.fire.emit(p.x,p.y,p.z,rnd(-1,1),rnd(1,4),rnd(-1,1),rnd(.6,1.2),rnd(2,4),rnd(6,12),1,.5,.18,.6,.5,3);
    if(this.crashT<10&&Math.random()<dt*2)this.puffs.emit(p.x,p.y,p.z,rnd(-1,1),rnd(2,5),rnd(-1,1),rnd(3,5),rnd(3,6),rnd(18,40),.1,.09,.08,.4,.4,3)}
   for(let i=this.debris.length-1;i>=0;i--){const d=this.debris[i];if(d.dead){this.near.remove(d.m);d.m.geometry.dispose();this.debris.splice(i,1)}}
   if(this.shockRing.visible){this.ringT+=dt;const k=this.ringT/1.5;this.shockRing.scale.setScalar(6+240*(1-Math.pow(1-clamp(k,0,1),2.2)));this.shockRing.material.opacity=.85*(1-clamp(k,0,1));if(k>=1)this.shockRing.visible=false}
   this.flashI*=Math.exp(-2.8*dt);this.flash.intensity=this.flashI}
  this.puffs.update(dt);this.fire.update(dt);this.kick=Math.max(0,this.kick*Math.exp(-2.2*dt)-.02*dt);this.fovKick*=Math.exp(-3*dt)}

 finish(dt){
  const sdt=dt*((this.state==='landing'||this.state==='crashed')?this.ts:1);this.fx(sdt);
  const ncam=this.ncam,fcam=this.fcam,L=this.L;
  /* camera shake: engine rumble / plasma buffeting / explosion shock */
  const T=performance.now()/1000,amp=Math.max(this.kick,this.entryShake||0);
  ncam.position.copy(this.cp);ncam.position.x+=(Math.sin(T*41)+.6*Math.sin(T*27.3+1.3))*amp;ncam.position.y+=(Math.sin(T*37+2)+.6*Math.sin(T*23.1))*amp;ncam.position.z+=Math.sin(T*33+4)*amp*.5;
  if(this.camUp)ncam.up.copy(this.camUp);else ncam.up.set(0,1,0);   /* capsule view supplies its own up vector: no roll flip when looking straight down */
  ncam.lookAt(this.cl);ncam.rotateZ(Math.sin(T*29)*amp*.004);
  const fov=55+this.fovKick+this.base.fovAdd+(this.state==='entry'?4*heatAt(Math.min(this.t/this.entryT,1)):0);if(Math.abs(ncam.fov-fov)>.02){ncam.fov=fcam.fov=fov;ncam.updateProjectionMatrix();fcam.updateProjectionMatrix()}
  /* environment keyed to the camera's altitude */
  const ca=Math.max(ncam.position.y,0),t=Math.pow(1-sstep(3000,70000,ca),1.8);
  this.skyMat.uniforms.uT.value=t;this.sky.visible=t>.004;this.sky.position.copy(ncam.position);this.starMat.opacity=1-t*.97;
  this.near.fog.density=.000034*Math.exp(-ca/4500)+this.base.fogExtra;
  const op=1-sstep(30000,48000,ca);this.terrain.visible=ca<52000;this.terrainMat.opacity=op;this.terrainMat.transparent=op<.999;this.terrainMat.depthWrite=op>.999;
  this.rocks.visible=ca<7000;this.pad.visible=ca<20000;
  for(let i=0;i<4;i++)this.beacons[i].material.opacity=.45+.55*(Math.sin(T*3+i*1.57)>0?1:.2);
  const near=this.base.active?.2:clamp(ca*.004,.4,60);if(Math.abs(near-ncam.near)>.05*ncam.near){ncam.near=near;ncam.updateProjectionMatrix()}
  /* sun + shadows follow the lander */
  const tg=this.sun.target.position;(this.base.focus?tg.copy(this.base.focus):tg.set(L.x,Math.max(L.y-40,0),0));this.sun.position.copy(tg).addScaledVector(this.ns?this.ns.ldir:SUN,420);this.sun.castShadow=ca<2500;
  {const sm=this.r.shadowMap;if(this.base.active&&!this.base.interior){sm.autoUpdate=false;this._shf=((this._shf|0)+1)%3;if(!this._shf)sm.needsUpdate=true}}   /* PERF: base outdoors -> shadow pass 20x/s, not 60x/s (interior already freezes it in base.js) */
  /* far scene: Mars globe & atmosphere positioned relative to the camera (floating origin, km units) */
  fcam.position.set(0,0,0);fcam.quaternion.copy(ncam.quaternion);
  this.mars.position.copy(MARS_C).sub(ncam.position).multiplyScalar(1e-3);this.atmo.position.copy(this.mars.position);
  this.mars.visible=this.atmo.visible=ca>5000;
  const sc=this.r.getDrawingBufferSize(this._v2||(this._v2=new THREE.Vector2())).y/(2*Math.tan(MU.degToRad(ncam.fov/2)));this.puffs.mat.uniforms.uScale.value=this.fire.mat.uniforms.uScale.value=sc;
  this.r.clear();if(!this.base.skipExt){this.r.render(this.far,fcam);this.r.clearDepth();this.r.render(this.near,ncam)}if(this.base.interior)this.base.renderInterior(ncam)}

 /* ---------- HUD (throttled DOM writes) ---------- */
 hudTick(dt){this.hudT-=dt;if(this.hudT>0)return;this.hudT=.05;const L=this.L,alt=Math.max(0,L.y-COM-groundAt(L.x)),vy=L.vy;
  const set=(id,v)=>{const e=$(id);if(e.textContent!==v)e.textContent=v};
  set('mh-alt',alt>1000?Math.round(alt).toLocaleString():alt>100?Math.round(alt)+'':alt.toFixed(1));
  set('mh-vy',Math.abs(vy)>=100?Math.round(vy).toLocaleString():vy.toFixed(1));
  const vyE=$('mh-vy');vyE.style.color=this.state==='landing'||this.state==='landed'?(-vy<=LIM.vy?'#7dff9a':-vy<=LIM.vy*2.4?'#ffc15a':'#ff6a5a'):'#f4e8e0';
  set('mh-vx',(L.vx>=0?'+':'')+L.vx.toFixed(1)+' m/s');set('mh-th',(L.th>=0?'+':'')+MU.radToDeg(L.th).toFixed(1)+'°');
  const pd=L.x;set('mh-pad',Math.abs(pd)<1?'ON PAD':Math.abs(pd).toFixed(0)+' m '+(pd>0?'EAST':'WEST'));
  set('mh-fp',L.fuel.toFixed(0)+'%');$('mh-fuel').style.width=L.fuel+'%';$('mh-fuel').style.background=L.fuel<20?'#ff4a3a':L.fuel<45?'#ffb347':'#ff7a3a';
  set('mh-tp',Math.round(L.thr*100)+'%');$('mh-thr').style.width=L.thr*100+'%'}}