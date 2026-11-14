/* =====================================================================================================
   nightsky.js - realistic Martian dusk / night sky for the Mars Research Base
   * The sun now SETS: its direction (the shared SUN vector in mars.js) sinks below the horizon at dusk and
     rises again at dawn, so the sun disc disappears at night instead of hanging in the sky.
   * UPGRADE 2: 4 star layers (880-cell crisp star dust), Great Rift + nebulae Milky Way, structured horizon dust glow + zodiacal light,
     and procedural METEORS (varied sizes, plasma trails, fireball flash; a real shower during the Sol 5 meteor night).
   * UPGRADE: astrophotography-grade sky: 3 star layers with real colour temperatures + twinkle, a structured Milky Way
     (bright bulge, dust lanes, fine grain, extra stars inside the band) and a warm dusty horizon glow.
   * PHOBOS and DEIMOS are drawn in the sky shader with real proportions:
       Sun  ~0.35 deg wide from Mars, Phobos ~0.2 deg (about 1/3 of our Moon seen from Earth), Deimos ~0.03 deg
       (a bright star-like dot; drawn ~2x larger than true so it is visible at all).
     Phobos: dark grey-brown, lumpy 27x22x18 km potato, huge Stickney crater + grooves.
     Deimos: smaller, smoother, slightly lighter (dust-filled craters).
   * NASA fact captions appear at night; press [M] to cycle them. Small name tags follow each moon.
   ===================================================================================================== */
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const sst=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};

/* =====================================================================================================
   3D MOON MODELS (telescope view).  Real proportions: Phobos 27x22x18 km, Deimos 15x12x11 km (tri-axial, lumpy).
   Phobos: dark grey-brown, huge Stickney crater with a bluish ejecta tint, radiating grooves, ~70 craters.
   Deimos: lighter and smoother - most craters are half filled with dust.
   Drawn like sky objects (12 km out, after the sky sphere, depth-tested against the terrain) at their TRUE angular size, lit by the real sun direction.
   ===================================================================================================== */
export const MOON_RAD=[.0022,.00037];          /* angular semi-major radius (rad) seen from the ground: Phobos ~0.25 deg wide, Deimos ~0.04 deg */
const MOON_AX=[[1.22,.99,.81],[1.21,.98,.84]],MOON_D=12000,sst2=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
const hh=(x,y,z)=>{const n=Math.sin(x*127.1+y*311.7+z*74.7+.5)*43758.5453;return n-Math.floor(n)};
function vn3(x,y,z){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz,ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy),uz=fz*fz*(3-2*fz),L=(a,b,t)=>a+(b-a)*t,c=(i,j,k)=>hh(ix+i,iy+j,iz+k);
 return L(L(L(c(0,0,0),c(1,0,0),ux),L(c(0,1,0),c(1,1,0),ux),uy),L(L(c(0,0,1),c(1,0,1),ux),L(c(0,1,1),c(1,1,1),ux),uy),uz)}
const fb3=(x,y,z,o=4)=>{let a=0,s=.5,f=1;for(let i=0;i<o;i++){a+=vn3(x*f,y*f,z*f)*s;f*=2.03;s*=.5}return a/(1-Math.pow(.5,o))};
function makeMoonGeo(ph){
 const rnd=(s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296})(ph?1234:98765);
 const ax=MOON_AX[ph?0:1],lump=ph?.1:.05,sd=ph?3.7:11.3,V=THREE.Vector3,craters=[];
 for(let i=0;i<(ph?70:38);i++){const u=rnd()*2-1,a=rnd()*6.2832,s=Math.sqrt(1-u*u);craters.push({d:new V(s*Math.cos(a),u,s*Math.sin(a)),r:(ph?.05:.07)+Math.pow(rnd(),2.6)*(ph?.2:.26),k:ph?1:.42})}
 const st=new V(.93,.1,.35).normalize();
 if(ph)craters.push({d:st,r:.46,k:1.25,stk:true},{d:new V(-.2,.9,.4).normalize(),r:.17,k:1.1},{d:new V(-.8,-.1,.5).normalize(),r:.14,k:1});
 else craters.push({d:new V(-.3,.8,.5).normalize(),r:.5,k:.35},{d:new V(.7,-.4,-.6).normalize(),r:.38,k:.4});
 const gAx=new V(.2,.9,-.3).normalize();
 let g=new THREE.IcosahedronGeometry(1,ph?42:30);g.deleteAttribute('normal');g.deleteAttribute('uv');g=mergeVertices(g,1e-5);
 const P=g.attributes.position,C=new Float32Array(P.count*3),d=new V(),alb=ph?[.36,.30,.27]:[.50,.43,.37];
 for(let i=0;i<P.count;i++){d.fromBufferAttribute(P,i).normalize();
  let h=(fb3(d.x*1.5+sd,d.y*1.5+sd,d.z*1.5+sd,3)-.5)*lump*2,br=0,fl=0,sk=0;
  for(const c of craters){const ca=d.dot(c.d);if(ca<Math.cos(c.r*2.6))continue;const t=Math.acos(Math.min(1,ca))/c.r,bowl=sst2(1,.5,t),e=Math.exp(-Math.pow((t-1.06)/.14,2));
   h-=c.r*.33*c.k*bowl;h+=c.r*.1*c.k*e;fl+=bowl*.35*c.k;br+=e*.32*c.k;if(c.stk)sk+=sst2(2.6,1.0,t)}
  if(ph){const gl=Math.sin(d.dot(gAx)*46+fb3(d.x*4,d.y*4,d.z*4,2)*5),da=d.dot(st);h-=.013*sst2(.9,1,gl)*sst2(.2,.7,da)*sst2(.98,.55,da)}      /* grooves */
  h+=(fb3(d.x*18+sd,d.y*18,d.z*18,3)-.5)*.02;const r=1+h;
  P.setXYZ(i,d.x*ax[0]*r,d.y*ax[1]*r,d.z*ax[2]*r);
  const tex=.74+.5*fb3(d.x*6+sd,d.y*6,d.z*6+sd,4),sh=Math.max(.25,tex*(1-fl*.5)*(1+br)),k=Math.min(1,sk*.55);
  C[i*3]=lerp(alb[0]*sh,.30*tex,k);C[i*3+1]=lerp(alb[1]*sh,.31*tex,k);C[i*3+2]=lerp(alb[2]*sh,.34*tex,k)}
 g.setAttribute('color',new THREE.BufferAttribute(C,3));g.computeVertexNormals();return g}
function makeMoonMat(){return new THREE.ShaderMaterial({uniforms:{uL:{value:new THREE.Vector3(1,.3,0)},uA:{value:1}},transparent:true,depthTest:true,depthWrite:false,fog:false,   /* transparent => drawn AFTER the (transparent) sky sphere; depth-tested so hills hide a low moon */
 vertexShader:'attribute vec3 color;varying vec3 vN,vC;void main(){vN=normalize(mat3(modelMatrix)*normal);vC=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 uL;uniform float uA;varying vec3 vN,vC;void main(){vec3 n=normalize(vN);float d=dot(n,normalize(uL));float lit=smoothstep(-.05,.3,d)*(.3+.95*max(d,0.));gl_FragColor=vec4(vC*(lit+.012)*uA*2.2,1.);\n#include <colorspace_fragment>\n}'})}

export const MOON_FACTS=[
 ['PHOBOS','Phobos is the larger and closer of Mars’ two moons: a dark, cratered, potato-shaped body about 27 × 22 × 18 km. It circles Mars in just 7 h 39 min, faster than Mars spins, so it rises in the west and sets in the east.'],
 ['PHOBOS','Phobos orbits only about 6,000 km above the Martian surface and is slowly spiralling inward (about 1.8 m per century). NASA expects it to break apart or crash in roughly 30–50 million years. Its largest crater, Stickney, is about 9 km across.'],
 ['DEIMOS','Deimos is the smaller, outer moon, only about 15 × 12 × 11 km, orbiting roughly 23,500 km from Mars every 30.3 hours. Its surface looks smoother than Phobos because loose dust fills many craters. From Mars it looks like a bright star.'],
 ['MOONS','Asaph Hall discovered both moons in August 1877. Their names mean Fear (Phobos) and Dread (Deimos). Seen from Mars, Phobos appears about one third as wide as our Moon does from Earth.']
];
const CSS=`.ns-tag{position:fixed;z-index:19;pointer-events:none;font:700 11px Consolas,monospace;letter-spacing:3px;color:#cfe6ff;text-shadow:0 0 6px #000;opacity:0;transform:translate(14px,-50%);transition:opacity .5s}`;

export class NightSky{
 constructor(mp,SUN,skyMat){this.mp=mp;this.SUN=SUN;this.mat=skyMat;this.base=SUN.clone().normalize();this.el0=Math.asin(this.base.y);
  this.hx=this.base.x/Math.hypot(this.base.x,this.base.z);this.hz=this.base.z/Math.hypot(this.base.x,this.base.z);
  this.ldir=this.base.clone();this.nt=0;this.fi=0;this.shown=[false,false];
  const U=skyMat.uniforms;for(const k of['uPh','uPhR','uPhU','uDe','uDeR','uDeU'])U[k]={value:new THREE.Vector3(0,1,0)};U.uNight={value:0};U.uMet={value:1};U.uPhRot={value:0};U.uStorm={value:0};U.uTime={value:0};U.uMz={value:1};U.uMoons={value:1};this.sc=false;this.mm=null;this._l=new THREE.Vector3();
  this.A=new THREE.Vector3(this.hz,0,-this.hx);this.B=new THREE.Vector3(this.hx,0,this.hz);this.UP=new THREE.Vector3(0,1,0);
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  this.tags=['PHOBOS','DEIMOS'].map(n=>{const d=document.createElement('div');d.className='ns-tag';d.textContent=n;document.body.appendChild(d);return d});
  addEventListener('keydown',e=>{if(e.code==='KeyM'&&!e.repeat&&this.nf>.5)this.fact()});this.nf=0;this.tv=new THREE.Vector3()}
 reset(){this.setScope(false);this.mat.uniforms.uMz.value=1;this.SUN.copy(this.base);this.ldir.copy(this.base);this.nt=0;this.fi=0;this.shown=[false,false];this.nf=0;this.mat.uniforms.uNight.value=0;for(const t of this.tags)t.style.opacity=0}
 fact(){const f=MOON_FACTS[this.fi++%MOON_FACTS.length];this.mp.sub(f[1],'NASA FACT  ·  '+f[0],11000)}
 basis(M,R,U){R.crossVectors(this.UP,M);if(R.lengthSq()<1e-6)R.set(1,0,0);R.normalize();U.crossVectors(M,R).normalize()}
 setZoom(z){this.mat.uniforms.uMz.value=z}
 /* ---- telescope support: real 3D Phobos / Deimos, shown only while the lens view is active ---- */
 initMoons(){if(this.mm)return;this.mm=[true,false].map(ph=>{const m=new THREE.Mesh(makeMoonGeo(ph),makeMoonMat());m.renderOrder=-9;m.frustumCulled=false;m.visible=false;m.userData.spin=ph?.06:.035;this.mp.near.add(m);return m})}
 setScope(on){this.sc=!!on;if(on)this.initMoons();this.mat.uniforms.uMoons.value=on?0:1;if(this.mm)for(const m of this.mm)m.visible=!!on;if(on)for(const t of this.tags)t.style.opacity=0}
 moonDir(i){return i?this.mat.uniforms.uDe.value:this.mat.uniforms.uPh.value}
 moonUp(i){return this.moonDir(i).y>.03}
 angRad(i){return MOON_RAD[i]}
 placeMoons(dt){const cam=this.mp.ncam;if(!cam||!this.mm)return;this._l.copy(this.SUN).normalize();const a=Math.max(this.nf,.6);
  for(let i=0;i<2;i++){const m=this.mm[i],d=this.moonDir(i);m.visible=d.y>0;m.position.copy(cam.position).addScaledVector(d,MOON_D);m.scale.setScalar(MOON_RAD[i]*MOON_D/MOON_AX[i][0]);m.rotation.y+=dt*m.userData.spin;m.material.uniforms.uL.value.copy(this._l);m.material.uniforms.uA.value=a}}   /* telescope: enlarges the moon discs so they are resolvable at narrow fields of view */
 update(dt){const dn=this.mp.dn,k=dn?dn.k:1,U=this.mat.uniforms;U.uTime.value+=dt;
  /* ---- the sun sets / rises ---- */
  const e=sst(0,1,k),el=lerp(-.5,this.el0,e);
  if(k>.999)this.SUN.copy(this.base);else this.SUN.set(this.hx*Math.cos(el),Math.sin(el),this.hz*Math.cos(el)).normalize();
  this.ldir.copy(this.SUN);this.ldir.y=Math.max(this.ldir.y,.06);this.ldir.normalize();      /* the shadow-casting light never goes under the ground */
  const nf=this.nf=1-sst(.08,.62,k);U.uNight.value=nf;
  {const s5=dn&&dn.s5,sh=!!(s5&&s5.sw&&s5.sw.t<67&&dn.night);U.uMet.value=lerp(U.uMet.value,sh?5:1,Math.min(1,dt*1.5))}   /* meteor rate: sporadic by default, a real shower during the Sol 5 meteor night */
  /* ---- moons ---- */
  if(dn&&dn.night)this.nt+=dt;else if(!dn||!dn.night)this.nt=0;
  const nt=this.nt;
  const pu=Math.PI*(.08+.84*clamp(nt/26,0,1)),du=Math.PI*(.10+.25*clamp(nt/26,0,1));
  U.uPh.value.copy(this.A).multiplyScalar(Math.cos(pu)).addScaledVector(this.B,.25*Math.sin(pu)).addScaledVector(this.UP,.85*Math.sin(pu)).normalize();
  U.uDe.value.copy(this.A).multiplyScalar(-Math.cos(du)).addScaledVector(this.B,.4*Math.sin(du)).addScaledVector(this.UP,.55*Math.sin(du)).normalize();
  this.basis(U.uPh.value,U.uPhR.value,U.uPhU.value);this.basis(U.uDe.value,U.uDeR.value,U.uDeU.value);U.uPhRot.value=.3+pu*.5;if(this.sc)this.placeMoons(dt);
  /* ---- NASA facts ---- */
  if(dn&&dn.night&&!dn.dead){if(nt>2.5&&!this.shown[0]){this.shown[0]=true;this.fi=0;this.fact()}if(nt>12&&!this.shown[1]){this.shown[1]=true;this.fi=2;this.fact()}}
  else if(!dn||!dn.night){this.shown[0]=this.shown[1]=false}
  /* ---- name tags that follow the moons ---- */
  const cam=this.mp.ncam;[U.uPh.value,U.uDe.value].forEach((m,i)=>{const t=this.tags[i];let op=0;
   if(cam&&nf>.5&&m.y>.03&&!this.sc&&!(this.mp.base&&this.mp.base.interior)){this.tv.copy(m).multiplyScalar(1000).add(cam.position).project(cam);
    if(this.tv.z<1&&Math.abs(this.tv.x)<.96&&Math.abs(this.tv.y)<.96){t.style.left=((this.tv.x+1)/2*innerWidth)+'px';t.style.top=((1-this.tv.y)/2*innerHeight)+'px';op=.8}}
   t.style.opacity=op})}
}

/* ---------- GLSL pieces injected into SKY_FS by mars.js ---------- */
export const SKY_FS=`uniform vec3 uSun;uniform float uT,uNight,uPhRot,uStorm,uTime,uMz,uMoons,uMet;uniform vec3 uPh,uPhR,uPhU,uDe,uDeR,uDeU;varying vec3 vD;
float hsh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float hs3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hsh(i),hsh(i+vec2(1.,0.)),f.x),mix(hsh(i+vec2(0.,1.)),hsh(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){return vn(p)*.55+vn(p*2.1+3.7)*.3+vn(p*4.3+9.1)*.15;}
float vn3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hs3(i),hs3(i+vec3(1,0,0)),f.x),mix(hs3(i+vec3(0,1,0)),hs3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hs3(i+vec3(0,0,1)),hs3(i+vec3(1,0,1)),f.x),mix(hs3(i+vec3(0,1,1)),hs3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){return vn3(p)*.5+vn3(p*2.03+1.7)*.27+vn3(p*4.1+5.3)*.15+vn3(p*8.3+9.1)*.08;}
/* three star layers: faint dust of stars, mid field, a few bright named-star-like points. dens (0..1) packs more stars into the Milky Way band */
vec3 stars(vec3 d,float dens){vec3 acc=vec3(0.);
 for(int i=0;i<4;i++){float sc=i==0?70.:i==1?170.:i==2?420.:880.;vec3 g=d*sc,id=floor(g),f=fract(g)-.5;float h=hs3(id+float(i)*17.);
  float thr=(i==3?.965:i==2?.975:i==1?.955:.93)-dens*(i==3?.07:i==2?.05:.09);
  if(h>thr){vec3 o=vec3(hs3(id+3.1),hs3(id+7.7),hs3(id+11.3))-.5;float r=length(f-o*.6);
   float mag=pow(hs3(id+5.5),i==0?2.4:1.8);float rad=i==0?.16:i==1?.13:i==2?.10:.22;
   float tw=1.+.28*sin(uTime*(2.+hs3(id+2.2)*5.)+hs3(id)*40.)*(i==0?.3:1.);
   float core=smoothstep(rad,.0,r)*(i==0?.9:i==3?.8:1.4),halo=(i==0||i==3)?0.:exp(-r*r*70.)*.18;
   float tc=hs3(id+9.9);vec3 col=tc<.18?vec3(1.,.62,.42):tc<.45?vec3(1.,.86,.68):tc<.75?vec3(1.,.97,.93):tc<.92?vec3(.80,.88,1.):vec3(.62,.76,1.);
   acc+=col*(core+halo)*(.25+.95*mag)*tw*(i==0?.7:i==1?1.:i==2?1.9:.8);}}
 return acc;}
/* one moon: returns rgb in xyz, coverage in w.  q = position on the disc, ellipse axes ax, lumpiness lump */
vec4 moon(vec3 d,vec3 M,vec3 R,vec3 U,float rad,vec2 ax,float rot,float lump,float seed,bool phobos){
 if(dot(d,M)<.998)return vec4(0.);
 vec2 p=vec2(dot(d,R),dot(d,U))/rad;float c=cos(rot),s=sin(rot);p=vec2(c*p.x+s*p.y,-s*p.x+c*p.y);
 vec2 q=p/ax;float r=length(q);r*=1.+(fbm(q*2.2+seed)-.5)*lump;
 float aa=clamp(.0009/rad,.05,.7),mask=1.-smoothstep(1.-aa,1.+aa*.5,r);if(mask<=0.)return vec4(0.);
 float z=sqrt(max(1.-dot(q,q),0.));vec3 n=normalize(vec3(q,-z)+(vec3(fbm(q*5.+seed),fbm(q*5.+seed+5.),0.)-.5)*.25);
 vec3 L=normalize(vec3(dot(uSun,R),dot(uSun,U),dot(uSun,M)));float lit=max(dot(n,L),0.)*.85+.14;
 float tex=.72+.55*fbm(q*6.+seed*2.);vec3 alb=phobos?vec3(.40,.34,.30):vec3(.50,.43,.37);
 float crat=0.;vec2 g=q*(phobos?5.:3.5);vec2 id=floor(g);float h=hsh(id+seed);vec2 cc=id+.5+(vec2(hsh(id+7.),hsh(id+13.))-.5)*.5;float dd=length(g-cc);
 if(h>.62)crat+=smoothstep(.36,.12,dd)*(phobos?.32:.12)-smoothstep(.04,.0,abs(dd-.36))*.1;
 if(phobos){float st=length(q-vec2(.30,.12));crat+=smoothstep(.46,.36,st)*.34-smoothstep(.05,.0,abs(st-.44))*.16;            /* Stickney */
  float gr=sin((q.x*.9+q.y*.45)*46.+fbm(q*4.)*6.);crat+=smoothstep(.93,1.,gr)*.07*smoothstep(.5,.1,abs(q.y-.1));}                /* grooves */
 vec3 col=alb*tex*(1.-crat)*lit*1.9;col*=mix(.82,1.,smoothstep(1.,.55,r));    /* limb darkening */
 return vec4(col,mask);}
/* ---- meteors: 9 independent slots; each cycle may spawn a random streak. size (small .. fireball), speed, arc and fragmentation flash all vary.
   uMet = 1 sporadic (about one per 10 s), 5 during a shower.  Trail colour: white-hot head -> green-cyan ionised plasma -> orange ember tail.  returns rgb + sky flash (w) */
vec4 meteors(vec3 d){vec3 acc=vec3(0.);float fl=0.;
 for(int i=0;i<9;i++){float fi=float(i);float per=4.5+hsh(vec2(fi,1.3))*6.5;float tt=uTime/per+hsh(vec2(fi,7.7))*20.;float cyc=floor(tt);float u=fract(tt)*per;
  vec2 sd=vec2(fi*13.1+cyc*7.31,cyc*3.77+fi*1.7);
  if(hsh(sd+1.1)>.085*uMet)continue;
  float size=pow(hsh(sd+2.2),1.6);float dur=.55+.9*(1.-size*.5)+.5*hsh(sd+3.3);float t=u/dur;if(t>1.25)continue;
  float az=hsh(sd+4.4)*6.2832,el=.25+hsh(sd+5.5)*.95;vec3 s0=vec3(cos(el)*cos(az),sin(el),cos(el)*sin(az));
  vec3 rn=normalize(vec3(hsh(sd+6.6)-.5,hsh(sd+7.7)-.3,hsh(sd+8.8)-.5));vec3 tg=normalize(cross(s0,rn));float arc=.22+.5*hsh(sd+9.9);
  float th=clamp(t,0.,1.),tl=clamp(t-(.2+.18*size),0.,1.);
  vec3 H=normalize(s0*cos(arc*th)+tg*sin(arc*th)),T=normalize(s0*cos(arc*tl)+tg*sin(arc*tl));
  vec3 sg=H-T;float sl=dot(sg,sg);float w=sl>.0000001?clamp(dot(d-T,sg)/sl,0.,1.):1.;
  vec3 dv=d-(T+sg*w);float dist=length(dv);float wid=(.00055+.0021*size)*(.2+.8*w);
  float vis=smoothstep(0.,.08,t)*(1.-smoothstep(.9,1.25,t));
  float body=exp(-dist*dist/(wid*wid))*pow(w,1.3);float glow=exp(-dist*dist/(wid*wid*40.))*pow(w,2.)*.45;
  float hd=length(d-H);float head=exp(-hd*hd/(wid*wid*5.))*step(t,1.)*1.6;
  float fq=(t-.58)*7.,fk=smoothstep(.45,.9,size)*exp(-fq*fq);float fh=exp(-hd*hd/(.0009+.004*size))*fk*2.2;
  vec3 col=mix(vec3(1.,.42,.12),mix(vec3(.35,1.,.78),vec3(1.),smoothstep(.8,1.,w)),smoothstep(0.,.65,w));
  float br=(.7+1.6*size)*vis;acc+=col*(body*1.4+glow+head)*br+vec3(.7,1.,.9)*fh*vis;
  fl+=fk*(.12+.2*size)*smoothstep(-.1,.8,dot(d,H));}
 return vec4(acc,fl);}
void main(){vec3 d=normalize(vD);float h=clamp(d.y,0.,1.);
 float dayK=smoothstep(-.32,.14,uSun.y),gl=smoothstep(-.46,-.04,uSun.y);
 vec3 hor=vec3(.76,.52,.40),zen=vec3(.50,.33,.28);vec3 c=mix(hor,zen,pow(h,.42));c=mix(c,hor*1.04,exp(-pow(d.y*5.5,2.))*.22);
 /* night gradient: deep indigo-black zenith, dusty bronze-violet near the horizon */
 vec3 horN=vec3(.075,.046,.050),zenN=vec3(.002,.004,.014);vec3 cn=mix(horN,zenN,pow(h,.42));
 c=mix(cn,c,dayK);
 float s=max(dot(d,uSun),0.);vec3 g=vec3(.55,.30,.20)*pow(s,3.)*.10+vec3(.10,.22,.50)*pow(s,45.)*.75+vec3(.16,.34,.72)*pow(s,500.)*.55+vec3(.55,.75,1.)*pow(s,9000.)*.9+vec3(4.,4.,4.)*smoothstep(.9999925,.999996,s);
 c+=g*gl*(1.-.93*uStorm);
 float ns=smoothstep(0.,.10,d.y)*uNight*(1.-uStorm);
 /* ---- Milky Way: tilted galactic band, glowing bulge, Great Rift dust lanes, pink emission nebulae, dense star clouds ---- */
 vec3 pl=normalize(vec3(.3,.8,-.5)),ax1=normalize(cross(pl,vec3(0.,1.,.2))),ax2=cross(pl,ax1);
 float lat=dot(d,pl),lon=atan(dot(d,ax2),dot(d,ax1));
 float wob=(fbm3(d*3.1)-.5)*.30;float Lb=lat+wob;
 float band=exp(-pow(Lb*2.7,2.))*(.8+.4*fbm3(d*2.+4.));
 float core=exp(-pow((lat+wob*.6)*6.5,2.));
 float bulge=exp(-pow((lon-.6)*.9,2.))*.95+.3;
 float lanes=smoothstep(.38,.70,fbm3(d*9.+vec3(3.,1.,7.)));float lanes2=smoothstep(.45,.78,fbm3(d*22.+vec3(8.,2.,1.)));
 float rift=exp(-pow((Lb-.035*sin(lon*3.+1.))*12.,2.))*smoothstep(.15,.85,fbm3(d*5.+2.));
 float dust=1.-clamp(lanes*.8*band+lanes2*.35*band+rift*.8,0.,.95);
 float cloud=fbm3(d*14.)*.55+fbm3(d*40.)*.45;float cloud2=fbm3(d*95.);
 float grain=pow(hs3(floor(d*1100.)),9.)*2.4;
 float mw=(band*.5+core*1.05*bulge)*dust*(.38+.95*cloud+.4*cloud2)+grain*band*.4*dust;
 vec3 mwCol=mix(vec3(.50,.60,.92),vec3(1.,.78,.52),clamp(core*bulge*1.2+band*.15,0.,1.));
 float neb=smoothstep(.60,.86,fbm3(d*6.+vec3(11.,5.,2.)))*band;
 mwCol=mix(mwCol,vec3(1.,.45,.58),neb*.4);
 c+=mwCol*mw*ns*.36;
 float dens=clamp(band*.8+core*.6,0.,1.);
 c+=stars(d,dens)*ns*mix(1.7,1.25,dens*.5)*(.55+.45*dust)*mix(vec3(1.,.72,.55),vec3(1.),smoothstep(0.,.3,d.y));
 if(ns>.02){vec4 mt=meteors(d);c+=(mt.rgb+vec3(1.,.8,.55)*mt.w*.4)*ns*step(-.02,d.y);}
 /* warm dusty horizon glow: airborne dust scattering the last light (structured by dust banks) + broad airglow + zodiacal light */
 float nh=uNight*(1.-dayK)*(1.-uStorm);
 float hb=.62+.55*fbm(vec2(atan(d.z,d.x)*2.4,d.y*6.));
 c+=vec3(.46,.21,.09)*exp(-pow(max(d.y,0.)*4.2,2.))*nh*.62*hb;
 c+=vec3(.30,.11,.06)*exp(-pow(max(d.y,0.)*11.,2.))*nh*.62;
 c+=vec3(.11,.045,.03)*exp(-pow(max(d.y,0.)*1.6,2.))*nh*.5;
 vec3 shd=normalize(vec3(uSun.x,0.,uSun.z)+vec3(.0001,0.,0.));float zo=pow(max(dot(normalize(vec3(d.x,0.,d.z)+vec3(.0001,0.,0.)),shd),0.),5.);
 c+=vec3(.34,.22,.13)*zo*exp(-max(d.y,0.)*3.2)*nh*.22*smoothstep(0.,.05,d.y);
 vec4 mp=moon(d,uPh,uPhR,uPhU,.0022*uMz,vec2(1.,.8),uPhRot,.16,3.1,true);c=mix(c,mp.rgb,mp.w*uNight*uMoons);
 vec4 md=moon(d,uDe,uDeR,uDeU,.0011*uMz,vec2(1.,.82),1.1,.07,8.3,false);c=mix(c,md.rgb,md.w*uNight*uMoons);
 vec3 dustc=mix(vec3(.50,.32,.21),vec3(.27,.17,.12),pow(h,.45));dustc=mix(dustc,vec3(.62,.40,.26),exp(-pow(d.y*3.,2.))*.5);dustc*=.35+.65*dayK;dustc+=vec3(.9,.55,.30)*pow(s,24.)*.16*dayK;
 float stm=clamp(uStorm,0.,1.)*.96;c=mix(c,dustc,stm);vec3 gc=mix(mix(horN,hor*.9,dayK),dustc,stm);
 if(d.y<0.)c=mix(gc,c,exp(d.y*8.));gl_FragColor=vec4(c,uT);}`;
