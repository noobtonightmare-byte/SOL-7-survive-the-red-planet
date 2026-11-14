import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MarsPhase} from './mars.js';   /* NEW: Going to Mars + interactive landing */
const V3=THREE.Vector3,MU=THREE.MathUtils,clamp=MU.clamp,lerp=MU.lerp,rnd=(a,b)=>a+Math.random()*(b-a);
const sstep=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
const $=id=>document.getElementById(id);
/* ---- volume notices: "lower your volume" when boarding the rocket, "you can raise it" after landing.
   One shared banner, parked at 24% from the top-centre: clear of the countdown (centre), caption / subtitles (bottom),
   clock (top-left), Mars HUD (right / bottom-left) and the SOL bar (top-centre, 22 px). ---- */
(function(){const st=document.createElement('style');
 st.textContent='#volw{position:fixed;left:50%;top:24%;transform:translate(-50%,-10px);width:min(480px,44vw);box-sizing:border-box;padding:12px 22px 14px;text-align:center;background:rgba(6,10,18,.84);border:2px solid #ffb347;border-radius:6px;opacity:0;transition:opacity .6s,transform .6s;pointer-events:none;z-index:38;color:#f2f5fa;font:600 15px "Segoe UI",Arial,sans-serif;line-height:1.5;box-shadow:0 4px 24px rgba(0,0,0,.55)}'
 +'#volw.on{opacity:1;transform:translate(-50%,0)}#volw b{display:block;font:800 13px Consolas,monospace;letter-spacing:5px;margin-bottom:6px;color:#ffb347}#volw.up{border-color:#7dff9a}#volw.up b{color:#7dff9a}';
 document.head.appendChild(st);const el=document.createElement('div');el.id='volw';document.body.appendChild(el);let tm=0;
 window.SolVolWarn={
  show(kind){clearTimeout(tm);const up=kind==='raise';el.className=up?'up':'';
   el.innerHTML=up?'<b>\u2714 SAFE TO RAISE VOLUME</b>You have landed \u2014 Mars is much quieter. You can turn your volume back up now.'
                  :'<b>\u26a0 LOWER YOUR VOLUME</b>The launch is very LOUD. Turn your speakers / headphones down before liftoff.';
   void el.offsetWidth;el.classList.add('on');tm=setTimeout(()=>el.classList.remove('on'),up?9000:11000)},
  hide(){clearTimeout(tm);el.classList.remove('on')}}})();

/* ================= RENDERER ================= */
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);
renderer.autoClear=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
document.body.insertBefore(renderer.domElement,document.body.firstChild);
const scene=new THREE.Scene(),space=new THREE.Scene();
const cam=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.3,90000);cam.rotation.order='YXZ';
const scam=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,200,4e7);
const SUN=new V3(-.55,.30,.55).normalize(),R_E=6371000,EC=new V3(0,-R_E,0);
const FOG0=.00022;scene.fog=new THREE.FogExp2(0xd0a58c,FOG0);

/* ================= TEXTURE HELPERS ================= */
function canvasTex(w,h,fn,rx=1,ry=1,clamped=false){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=clamped?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=8;return t}
function speckle(x,w,h,r,g,b,amp){const d=x.createImageData(w,h),p=d.data;for(let i=0;i<w*h;i++){const n=(Math.random()-.5)*amp,k=i*4;p[k]=r+n;p[k+1]=g+n;p[k+2]=b+n;p[k+3]=255}x.putImageData(d,0,0)}
function blotch(x,w,h,n,r0,r1,col,al){for(let i=0;i<n;i++){x.fillStyle=`rgba(${col},${rnd(al*.3,al)})`;x.beginPath();x.arc(rnd(0,w),rnd(0,h),rnd(r0,r1),0,7);x.fill()}}
const concBase=canvasTex(512,512,(x,w,h)=>{speckle(x,w,h,165,165,160,26);blotch(x,w,h,260,6,50,'40,40,36',.07);blotch(x,w,h,160,6,40,'210,210,200',.06);
 x.strokeStyle='rgba(30,30,28,.6)';x.lineWidth=3;x.strokeRect(0,0,w,h);for(let i=0;i<14;i++){x.lineWidth=rnd(.5,1.4);x.beginPath();let a=rnd(0,w),b=rnd(0,h);x.moveTo(a,b);for(let k=0;k<8;k++){a+=rnd(-30,30);b+=rnd(-30,30);x.lineTo(a,b)}x.stroke()}});
const sootBase=canvasTex(512,512,(x,w,h)=>{speckle(x,w,h,70,66,62,24);blotch(x,w,h,200,10,60,'0,0,0',.18);blotch(x,w,h,80,6,30,'120,100,80',.08)});
const rep=(t,a,b)=>{const c=t.clone();c.repeat.set(a,b);c.needsUpdate=true;return c};
const grassTex=canvasTex(512,512,(x,w,h)=>{speckle(x,w,h,76,92,52,50);blotch(x,w,h,200,10,60,'40,60,25',.12);blotch(x,w,h,120,8,40,'130,105,62',.1);blotch(x,w,h,100,8,40,'110,130,60',.08)},6000,6000);
const gravelTex=canvasTex(512,512,(x,w,h)=>{speckle(x,w,h,128,122,112,80);blotch(x,w,h,150,6,40,'60,55,50',.12)},40,40);
const roadTex=canvasTex(256,512,(x,w,h)=>{speckle(x,w,h,54,54,58,26);blotch(x,w,h,80,10,40,'20,20,20',.12);x.fillStyle='#d9d9d0';x.fillRect(w*.04,0,5,h);x.fillRect(w*.96-5,0,5,h);x.fillStyle='#e8c84a';x.fillRect(w/2-4,0,8,h*.5)},1,60);
const asphaltTex=canvasTex(256,256,(x,w,h)=>{speckle(x,w,h,58,58,62,26);blotch(x,w,h,60,8,40,'20,20,20',.12)},40,2);
const fenceTex=canvasTex(128,128,(x,w,h)=>{x.strokeStyle='rgba(215,220,225,.95)';x.lineWidth=2.2;for(let i=-128;i<256;i+=16){x.beginPath();x.moveTo(i,0);x.lineTo(i+128,128);x.stroke();x.beginPath();x.moveTo(i+128,0);x.lineTo(i,128);x.stroke()}});
const glowTex=canvasTex(128,128,(x,w,h)=>{const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.2,'rgba(255,255,255,.55)');g.addColorStop(.5,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h)},1,1,true);
function puffTex(){return canvasTex(128,128,(x,w,h)=>{for(let i=0;i<40;i++){const a=rnd(0,6.28),d=rnd(0,34),r=rnd(14,34),cx=64+Math.cos(a)*d,cy=64+Math.sin(a)*d;const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h)}
 x.globalCompositeOperation='destination-in';const m=x.createRadialGradient(64,64,0,64,64,64);m.addColorStop(0,'rgba(0,0,0,1)');m.addColorStop(.55,'rgba(0,0,0,.9)');m.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=m;x.fillRect(0,0,w,h)},1,1,true)}
function stageTex(rings,text,soot){return canvasTex(1024,1024,(x,w,h)=>{speckle(x,w,h,238,238,240,8);
 x.strokeStyle='rgba(120,125,135,.55)';x.lineWidth=2;for(let i=1;i<rings;i++){const y=i*h/rings;x.beginPath();x.moveTo(0,y);x.lineTo(w,y);x.stroke()}
 x.lineWidth=1.2;for(let i=0;i<16;i++){x.beginPath();x.moveTo(i*w/16,0);x.lineTo(i*w/16,h);x.stroke()}
 x.fillStyle='rgba(90,95,105,.5)';for(let i=1;i<rings;i++)for(let k=0;k<128;k++){x.beginPath();x.arc(k*w/128,i*h/rings+5,1.3,0,7);x.fill()}
 blotch(x,w,h,40,10,60,'150,150,155',.05);
 if(soot){const g=x.createLinearGradient(0,h,0,h*.6);g.addColorStop(0,'rgba(10,8,6,.85)');g.addColorStop(1,'rgba(10,8,6,0)');x.fillStyle=g;x.fillRect(0,h*.6,w,h*.4)}
 if(text){x.save();x.translate(w*.5,h*.5);x.rotate(-Math.PI/2);x.fillStyle='#16181d';x.font='bold 118px Arial';x.textAlign='center';x.fillText(text,0,40);x.restore();
  x.fillStyle='#1b2f6b';x.fillRect(w*.56,h*.08,w*.06,h*.05);x.fillStyle='#c8202a';x.fillRect(w*.56,h*.13,w*.06,h*.012)}})}
const blackTex=canvasTex(512,256,(x,w,h)=>{speckle(x,w,h,26,26,30,14);x.strokeStyle='rgba(90,90,100,.6)';x.lineWidth=2;for(let i=0;i<24;i++){x.beginPath();x.moveTo(i*w/24,0);x.lineTo(i*w/24,h);x.stroke()}});
const gridTex=canvasTex(128,128,(x,w,h)=>{x.strokeStyle='#2a2d33';x.lineWidth=7;x.strokeRect(3,3,w-6,h-6);x.lineWidth=5;for(let i=1;i<6;i++){x.beginPath();x.moveTo(i*w/6,0);x.lineTo(i*w/6,h);x.stroke();x.beginPath();x.moveTo(0,i*h/6);x.lineTo(w,i*h/6);x.stroke()}});
const facadeTex=canvasTex(512,512,(x,w,h)=>{speckle(x,w,h,214,214,210,10);x.strokeStyle='rgba(120,120,125,.5)';x.lineWidth=1.5;for(let i=0;i<w;i+=10){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke()}
 x.fillStyle='rgba(60,64,72,.85)';for(let y=70;y<h-120;y+=110)x.fillRect(0,y,w,26);
 x.fillStyle='#111';x.fillRect(w*.3,h*.42,w*.4,h*.58);x.strokeStyle='#333';x.lineWidth=3;for(let y=h*.42;y<h;y+=34){x.beginPath();x.moveTo(w*.3,y);x.lineTo(w*.7,y);x.stroke()}
 x.fillStyle='#16307a';x.beginPath();x.arc(w*.14,h*.2,50,0,7);x.fill();x.fillStyle='#fff';x.fillRect(w*.14-50,h*.2-6,100,12)});
const winTex=canvasTex(256,256,(x,w,h)=>{speckle(x,w,h,170,168,160,16);x.fillStyle='#2b3a4a';for(let i=0;i<8;i++)for(let j=0;j<6;j++){x.fillRect(12+i*30,18+j*40,18,22)}});

/* ================= SKY / STARS / EARTH ================= */
const skyFrag=`uniform vec3 uSun;uniform float uA,uDip;varying vec3 vD;
void main(){vec3 d=normalize(vD);float h=d.y+uDip;float sd=max(dot(d,uSun),0.);
vec3 zen=vec3(.10,.22,.50),mid=vec3(.52,.50,.62),hor=vec3(.96,.66,.44);
vec3 c=mix(zen,mid,pow(1.-clamp(h,0.,1.),2.5));c=mix(c,hor,pow(1.-clamp(h,0.,1.),9.)*(.6+.8*sd));
c+=vec3(1.,.55,.25)*pow(sd,6.)*.55+vec3(1.,.85,.6)*pow(sd,64.)*.9;
if(h<0.)c=mix(c,hor*.6,clamp(-h*8.,0.,1.));
c*=uA;c+=vec3(1.,.95,.85)*pow(sd,3000.)*8.;gl_FragColor=vec4(c,1.);}`;
const makeSky=()=>new THREE.ShaderMaterial({uniforms:{uSun:{value:SUN},uA:{value:1},uDip:{value:0}},vertexShader:`varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:skyFrag,side:THREE.BackSide,depthWrite:false,depthTest:false});
const skyMat=makeSky(),sky=new THREE.Mesh(new THREE.SphereGeometry(1e6,32,16),skyMat);sky.frustumCulled=false;sky.renderOrder=-10;space.add(sky);
{const n=4500,p=new Float32Array(n*3),b=new Float32Array(n);for(let i=0;i<n;i++){const u=rnd(-1,1),t=rnd(0,6.283),r=Math.sqrt(1-u*u);p.set([r*Math.cos(t)*3e6,u*3e6,r*Math.sin(t)*3e6],i*3);b[i]=Math.pow(Math.random(),3)*.8+.2}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('aB',new THREE.BufferAttribute(b,1));
 var starMat=new THREE.ShaderMaterial({uniforms:{uAl:{value:0}},vertexShader:`attribute float aB;varying float vB;void main(){vB=aB;gl_PointSize=1.3+aB*2.4;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float uAl;varying float vB;void main(){float a=(1.-smoothstep(0.,1.,length(gl_PointCoord-.5)*2.));gl_FragColor=vec4(vec3(.8,.88,1.)*vB,a*vB*uAl);}`,transparent:true,depthWrite:false});
 var stars=new THREE.Points(g,starMat);stars.frustumCulled=false;space.add(stars)}
const NOISE=`float hs(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hs(i),hs(i+vec3(1,0,0)),f.x),mix(hs(i+vec3(0,1,0)),hs(i+vec3(1,1,0)),f.x),f.y),mix(mix(hs(i+vec3(0,0,1)),hs(i+vec3(1,0,1)),f.x),mix(hs(i+vec3(0,1,1)),hs(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<8;i++){s+=a*vn(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/.996;}`;
/* ---- REAL-WORLD EARTH: continents come from hand-placed coastline polygons (GEO) painted once into two equirectangular canvases, then sampled by the bake shader below.
   LAUNCH_LAT / LAUNCH_LON = where on the real planet the pad is. East (+x) is the rocket's downrange direction, so the orbit sweep looks north over East Africa, the Red Sea and Arabia. Change them to launch from anywhere. ---- */
const LAUNCH_LAT=2.0,LAUNCH_LON=45.0;   /* Somali coast: Africa on the left, Indian Ocean on the right */
const _la=THREE.MathUtils.degToRad(LAUNCH_LAT),_lo=THREE.MathUtils.degToRad(LAUNCH_LON);
const GP0=new V3(Math.cos(_la)*Math.cos(_lo),Math.cos(_la)*Math.sin(_lo),Math.sin(_la)),GE0=new V3(-Math.sin(_lo),Math.cos(_lo),0),GN0=new V3(-Math.sin(_la)*Math.cos(_lo),-Math.sin(_la)*Math.sin(_lo),Math.cos(_la));
const GEO={
land:[
/* AFRICA */[[-5.9,35.8],[-2.9,35.3],[-1,35.3],[1,36.5],[3.1,36.8],[5.1,36.75],[8,36.9],[10.2,37.2],[11,37.1],[10.4,35.8],[10.8,34.7],[10.1,33.9],[11.5,33.1],[13.2,32.9],[15.2,32.4],[16.5,31.1],[19.2,30.3],[20.1,32.1],[21.5,32.9],[22.6,32.8],[24,32],[25.2,31.6],[27.2,31.35],[29.9,31.2],[31.5,31.5],[32.3,31.3],[32.55,29.97],[33.8,27.2],[33.9,26.7],[35.5,23.9],[36.9,21.5],[37.2,19.6],[38.4,18],[39.5,15.6],[41.5,13.9],[42.7,13],[43.3,12.6],[43.1,11.6],[45,10.4],[47,11.2],[49.2,11.3],[51.3,11.8],[51.1,10.4],[50.8,9],[49.8,8],[48.5,5.3],[47.9,4.3],[47.3,3.6],[46.6,3.1],[46.0,2.5],[45.3,2.05],[44.8,1.6],[44.1,1.1],[43.5,0.6],[42.9,0.1],[42.5,-0.4],[40.9,-2.3],[40.1,-3.2],[39.7,-4.1],[39.3,-6.8],[39.7,-10],[40.2,-10.3],[40.5,-12.9],[40.7,-14.5],[40.3,-15.8],[36.9,-17.9],[34.9,-19.8],[35.5,-22],[35.6,-24.1],[32.6,-26],[31,-29.9],[27.9,-33],[25.6,-34],[22,-34.2],[20,-34.8],[18.4,-34.2],[18,-32],[17,-29.5],[16.5,-28.6],[15.2,-26.6],[14.5,-23],[13.3,-20],[11.8,-17.3],[12.1,-15.2],[13.4,-12.6],[13.2,-8.8],[12.2,-6],[11.8,-4.8],[8.7,-0.7],[9.4,0.4],[9.8,3.2],[9.7,4],[8.3,4.5],[6,4.3],[5,5],[3.4,6.4],[1,6.1],[-0.2,5.5],[-1.8,4.9],[-4,5.2],[-7.5,4.4],[-10.8,6.3],[-13.2,8.5],[-13.7,9.5],[-15.6,11.9],[-17.5,14.7],[-16.5,16],[-16.3,19],[-17,20.8],[-15.9,23.7],[-14.5,26.1],[-12.9,27.9],[-10.1,29.5],[-9.6,30.4],[-9.8,31.5],[-7.6,33.6],[-5.9,35.8]],
/* MADAGASCAR */[[49.3,-12],[50.2,-14.8],[49.4,-18.2],[48.9,-19.9],[47.9,-24.9],[45.2,-25.6],[43.7,-23.4],[44.3,-20.3],[44.4,-16.5],[46.3,-15.7],[47.5,-14],[48,-13.3]],
/* EURASIA */[[-5.4,36.1],[-4.4,36.7],[-2.4,36.8],[-0.9,37.6],[0.2,38.7],[-0.3,39.4],[2.2,41.4],[3.3,42.3],[5.4,43.3],[7.3,43.7],[8.9,44.4],[10.3,43.5],[12.3,41.7],[14.2,40.8],[15.6,38],[17.1,39.1],[17.2,40.4],[18.5,40.1],[16.9,41.1],[15.9,41.9],[13.5,43.6],[12.4,45.4],[13.7,45.6],[14.4,45.3],[16.4,43.5],[18.1,42.6],[19.4,41.8],[19.4,40.4],[20.2,39.5],[21.7,38.2],[22.5,36.5],[23.2,36.4],[23.7,37.9],[22.9,40.6],[24.4,40.9],[25.9,40.8],[26.4,40],[26.8,38.4],[27.4,37],[28.3,36.8],[30.7,36.9],[32,36.5],[34.6,36.8],[36.2,36.6],[35.8,35.5],[35.5,33.9],[35,32.8],[34.4,31.5],[34.3,31.3],[32.5,31.1],[32.6,30],[33.2,28.5],[34.25,27.75],[34.4,28],[34.95,29.5],[35.7,27.3],[38,24.1],[39.1,21.5],[41,19.1],[42.6,16.9],[42.9,14.8],[43.2,13.3],[43.4,12.7],[45,12.8],[49.1,14.5],[52.2,15.9],[54.1,17],[57.8,18.9],[58.7,20.5],[59.8,22.5],[58.6,23.6],[56.7,24.4],[56.4,25.1],[56.4,26.4],[55.2,25.2],[54.4,24.4],[52.6,24.1],[51.6,24.3],[51.2,25],[51,26.1],[50.1,26.4],[48.6,28],[48,29.5],[48.5,30],[50.8,28.9],[52.7,27.4],[54.9,26.6],[56.3,27.2],[57.3,25.9],[61.6,25.2],[62.3,25.1],[67,24.8],[68,23.8],[69,22.5],[69.6,21.6],[71,20.7],[72.8,21.1],[72.8,19],[73.3,17],[73.8,15.4],[74.8,12.9],[76.3,9.9],[77.5,8.1],[78.2,8.8],[79.9,10.3],[80.3,13.1],[80.1,14.4],[82.3,16.9],[83.3,17.7],[85.8,19.8],[87,20.3],[88.1,21.6],[89,21.8],[91.8,22.3],[92,21],[92.9,20.1],[94.2,16],[96.2,16.5],[97.6,16.4],[98.6,12.4],[98.3,8],[100.3,6.3],[101,3.7],[101.3,3],[103.8,1.3],[103.4,3.8],[102.3,6.2],[100.6,7.2],[99.2,10.4],[100.5,13.4],[103,11.5],[104.8,10.4],[104.8,8.6],[106.8,10.4],[109.2,12.2],[108.2,16.1],[105.7,18.7],[106.8,20.8],[108.5,21.6],[110.4,21.2],[113.5,22.2],[116.7,23.4],[118.1,24.5],[119.6,26],[120.7,28],[121.9,30.9],[121,30.4],[120.4,36.1],[122.6,37.4],[119,37.2],[117.8,39],[119.6,39.9],[121.6,38.9],[122.3,40.5],[124.4,39.9],[126.6,37.5],[126.4,34.8],[129.1,35.1],[129.4,37],[127.5,39.2],[129.8,41.8],[131.9,43.1],[135,43.5],[138.5,47],[140.5,48.5],[140.7,53.1],[143.2,59.4],[150.8,59.6],[155.5,59.4],[156,57],[155.6,55],[156.7,51],[158.6,53],[162.5,56.2],[163.2,59],[166,60.5],[170,60],[177.5,64.7],[180,65],[180,69],[170,69.7],[161,69.4],[150,71],[140,72.5],[129,73],[113,73.7],[104.3,77.7],[100,76.5],[87,75],[80,72.8],[73.5,72.9],[70,68.5],[66.5,68.5],[60,69.5],[54,68.5],[46,68.3],[44,66.2],[40,66.2],[41,67.3],[36,69],[33,69.3],[25.8,71.1],[19,70],[14.5,68.5],[10.5,63.5],[5.2,60.4],[5.6,58.9],[8,58.1],[10.5,59.5],[11.2,58.5],[11.9,57.7],[12.8,56.7],[13,55.6],[14.3,55.4],[16.4,56.7],[18.5,59.3],[17.5,62.5],[20.3,63.8],[24.2,65.8],[25.4,65],[21.6,63.1],[22.2,60.4],[25,60.2],[30.3,59.9],[24.7,59.4],[24.1,57],[21,56.5],[21.1,55.7],[18.6,54.4],[14.5,53.9],[12.1,54.1],[10.1,54.4],[10.2,56],[10.6,57.7],[8.1,56.5],[8.3,55.4],[8.7,54],[4.7,52.9],[4,51.9],[1.8,51],[0.1,49.5],[-1.6,49.7],[-4.5,48.4],[-1.2,46.2],[-1.2,44.7],[-1.8,43.4],[-3.8,43.5],[-5.7,43.5],[-8.4,43.4],[-9.3,42.9],[-8.8,42.2],[-8.7,41.2],[-9.5,38.7],[-8.9,37.9],[-9,37],[-7.9,37],[-6.9,37.2],[-6.3,36.5],[-5.6,36]],
/* CHUKOTKA east of 180 */[[-180,65],[-173,64.4],[-169.7,66.2],[-175,67.6],[-180,68.9]],
/* NORTH AMERICA */[[-168,65.5],[-165,68.5],[-156.5,71.3],[-141,69.6],[-124,69.5],[-110,68.2],[-95,68],[-85,69.5],[-82,66.5],[-86,64],[-94,61.5],[-93,57.5],[-87,56],[-82,55],[-79,51.5],[-79,55],[-77,59],[-78,62.4],[-72,61.5],[-68,58.5],[-64,60.3],[-61.5,56.5],[-57,53.5],[-55.7,51.5],[-59,48.5],[-64.5,49.2],[-64.2,46],[-61,45.5],[-65.8,43.6],[-70,43.7],[-70.5,41.7],[-74,40.5],[-75.5,38],[-75.8,35.2],[-78,33.8],[-81,31.8],[-80.1,26.8],[-80.4,25.2],[-81.8,26.2],[-82.8,28],[-84,30],[-86.5,30.4],[-89,30.2],[-90,29],[-93.5,29.7],[-97.2,27.5],[-97.4,25.2],[-97.8,22.2],[-96.2,19.2],[-94.5,18.1],[-91.5,18.5],[-90.4,21.2],[-87,21.5],[-87.5,18.2],[-88.3,16],[-83.5,15],[-83.7,11],[-82.5,9.5],[-79.5,9.5],[-77.5,8.7],[-77.9,7.4],[-80,7.3],[-81.8,8.2],[-83.5,8.4],[-85.7,10],[-87.5,13],[-91,13.9],[-94.5,16.2],[-97,15.8],[-101,17.3],[-105.5,20],[-105.5,22.5],[-106,23.2],[-109.5,26.5],[-112.5,29.5],[-114.7,31.7],[-114.5,29.5],[-112,26],[-110,23],[-112,24.8],[-114.5,27.8],[-117,32.5],[-120.5,34.5],[-122.5,37.5],[-124.2,40.3],[-124.1,46.2],[-124.7,48.4],[-125,50],[-128,51.5],[-131,54.5],[-135,58.5],[-140,59.8],[-147,60.7],[-152,59],[-158,56.5],[-163,54.8],[-160,58.5],[-162,60],[-165,62.5],[-166,64.5]],
/* SOUTH AMERICA */[[-77.5,8.7],[-75.5,10.8],[-72,12],[-71.5,10.8],[-68,10.6],[-64,10.5],[-61.5,10.7],[-60,8.5],[-57,6],[-52,5],[-50,1.8],[-49.5,0],[-47,-0.8],[-44,-2.5],[-40,-3],[-35.2,-5.5],[-34.8,-8],[-37,-11],[-39,-13.5],[-39.2,-17.8],[-40.5,-20.5],[-42,-23],[-45,-23.8],[-48.5,-26],[-48.8,-28.5],[-51,-31.5],[-53.5,-34],[-56,-34.9],[-58.3,-34.5],[-57,-36.5],[-57.5,-38.2],[-62,-39],[-62.3,-41],[-64.5,-42.2],[-65,-45],[-67.5,-46.5],[-68.5,-50.2],[-69,-52.3],[-67.5,-55],[-72,-53.5],[-75.3,-50],[-75.5,-46],[-73.7,-42],[-73.4,-37.5],[-71.7,-33],[-71.5,-28.5],[-70.3,-23.5],[-70.2,-18.4],[-73,-15.5],[-76.2,-13.5],[-79.5,-7.5],[-81.3,-4.7],[-80.2,-2.5],[-80.9,-1],[-80,0.5],[-78.8,1.5],[-77.3,3.8],[-77.5,6.2],[-77.4,8]],
/* AUSTRALIA */[[113.5,-22],[114.1,-26],[115,-30],[115.7,-32.5],[115,-34.3],[118,-35],[123.5,-33.9],[126,-32.3],[131.5,-31.5],[134,-32.7],[135.8,-34.8],[137.8,-35.5],[139.5,-36],[140.5,-38],[143.5,-38.8],[146.3,-39],[148.2,-37.8],[150.2,-37],[151.3,-33.8],[153,-30],[153.5,-27.5],[152.5,-25],[150.5,-22.5],[149,-20.5],[146.5,-19],[145.3,-15],[143.5,-13.8],[142.5,-10.7],[141.5,-13],[141.6,-16.5],[139.5,-17.4],[137,-16],[136,-12.2],[133,-11.5],[131,-12.2],[129.5,-14.9],[127.5,-14],[125.5,-14.3],[123.5,-17],[121.5,-19],[118.5,-20.4],[116,-20.7]],
/* GREENLAND */[[-73,78],[-60,82],[-30,83.5],[-18,80.5],[-20,75],[-22,70.5],[-32,68],[-42,60.5],[-44,60],[-50,63],[-54,67],[-55,70.5],[-62,76]],
/* ANTARCTICA */[[-180,-90],[-180,-78],[-160,-78],[-135,-74],[-100,-73.5],[-75,-72],[-62,-65],[-58,-63.5],[-65,-66],[-60,-75],[-45,-78.5],[-25,-76.5],[0,-70],[20,-70],[45,-67],[70,-67.5],[90,-66],[110,-66],[135,-66],[160,-70],[170,-72],[180,-78],[180,-90]],
/* ISLANDS */
[[-24,65.5],[-22.5,66.4],[-16,66.4],[-14,65],[-18,63.4],[-22.7,63.8]],
[[-5.7,50.1],[1.3,51.2],[1.7,52.7],[0,53.6],[-1.5,55],[-2,57.6],[-3.5,57.7],[-5,58.6],[-6.2,57.5],[-5.5,56],[-4.8,54.8],[-3.2,54.8],[-3.1,53.4],[-4.5,53.3],[-4.2,52],[-5.2,51.7],[-3,51.4],[-4.5,50.3]],
[[-10,51.8],[-6,52.2],[-6,54],[-5.5,55.2],[-8,55.3],[-10.2,54.2]],
[[130.9,34],[132.5,35.5],[135.5,35.7],[137,37.2],[139.5,38.5],[140,40.5],[141.5,41.3],[141.8,39.5],[141,37],[140.8,35.7],[139.8,35],[138.2,34.6],[136.8,34.3],[135.2,33.5],[134.3,34.5],[132.5,34.2]],
[[129.6,33.2],[130.9,33.9],[131.8,33],[131.3,31.4],[130.2,31.2],[129.8,32.7]],
[[140,41.5],[140.6,43.3],[141.6,45.4],[144,44.2],[145.5,43.3],[143.2,42],[141.5,42.5]],
[[120.2,22.9],[121,25.1],[121.9,24.9],[121,22]],
[[108.7,19.2],[110.5,20.1],[111,19.6],[110,18.3]],
[[79.8,9.3],[81.8,7.5],[81.2,6.1],[80,6],[79.7,7.9]],
[[95.3,5.6],[97.5,5.2],[100.3,2.5],[103.5,-0.5],[106,-3.2],[105.8,-5.8],[104.5,-5.9],[102.3,-4],[100.4,-1],[98.8,1.8],[97,3.5]],
[[105.2,-6.8],[108,-6.3],[111,-6.5],[114.5,-7.8],[114.4,-8.7],[110,-8.2],[106.5,-7.4]],
[[109,1.5],[110.5,2],[113,3.2],[115.2,5.2],[117,7],[119.2,5.3],[118,4.2],[117.8,1],[116.5,-1.8],[116.2,-3.9],[114.5,-4.1],[111.5,-3.3],[110.2,-2.8],[109.2,-0.5]],
[[119.5,-5.5],[120.4,-2.8],[119.8,0.5],[121,1.3],[125,1.5],[123,0.3],[121.5,-1],[123.2,-3.2],[122.5,-5],[121.5,-3.5],[120.4,-5.6]],
[[131,-0.8],[135,-3.3],[138,-1.8],[141,-2.6],[145,-4.8],[147.5,-6.2],[147.8,-8],[150.5,-10.5],[147,-10.2],[144.5,-7.6],[143,-9],[141,-9.2],[139,-8.2],[138,-8.4],[137.5,-5.5],[135,-4.2],[133.5,-4],[132.5,-2.5]],
[[120.3,18.5],[122.2,18.4],[122.5,16],[124,13.8],[122.5,13.6],[120.8,14],[120,16]],
[[122,7],[123.5,8.5],[125.5,9.8],[126.5,7.5],[125.5,5.8],[123.5,7.2]],
[[172.7,-34.5],[174.5,-36.5],[176,-37.5],[178.5,-37.7],[177,-39.5],[175.2,-41.5],[174.7,-39.7],[173.8,-39.2],[174.6,-37.5]],
[[172.7,-40.5],[174.3,-41.7],[173,-43.5],[171.2,-44.5],[170.5,-46],[167,-46.2],[166.5,-45.5],[168.5,-44],[171,-42.5]],
[[144.7,-40.7],[148.2,-40.9],[148,-43.2],[146,-43.6]],
[[-85,22],[-82.5,23.1],[-79,22.7],[-75.5,20.7],[-77.7,19.9],[-80.5,21.7]],
[[-74.4,18.5],[-72.5,19.9],[-68.5,18.6],[-70,18.2],[-71.4,17.7]],
[[-59.4,47.6],[-56,51.5],[-52.8,47.5],[-53.5,46.6],[-57,47.6]],
[[-80,73.5],[-68,70.5],[-62,67],[-65,63.5],[-72,64],[-78,64.5],[-73,68.5]],
[[-118,72],[-102,73],[-100,69],[-117,69.5]],
[[-90,76.5],[-70,78],[-62,82],[-90,82.5],[-95,79]],
[[52,71.5],[57,75],[68,77],[60,73],[55,70.8]],
[[11,78.5],[20,80.2],[27,79.5],[17,77]],
[[142,46],[143.5,49],[142.5,54.3],[141.8,52],[142,49]],
[[32.3,35],[34.6,35.7],[34,34.9],[32.8,34.6]],
[[12.4,38.1],[15.6,38.2],[15.2,36.7],[12.5,37.6]],
[[8.2,39],[9.7,39.2],[9.6,41.2],[8.2,40.9]],
[[23.5,35.3],[26.3,35.2],[24.8,35]],
[[53.3,12.7],[54.5,12.6],[54,12.2],[53.4,12.3]],
[[39.2,-5.6],[39.5,-6.4],[39.2,-6.4]]
],
/* lakes / inland seas (drawn as water): [lon,lat,rx,ry] */
water:[[33,-1.2,1.7,1.5],[29.9,-6,0.6,3.0],[34.8,-12,0.5,2.2],[36.1,3.6,0.4,1.1],[34.5,43,6.5,2.5],[51.5,41.8,2.2,4.6],[31.5,2.1,0.5,0.9]],
/* biome / relief ellipses: [lon,lat,rx,ry,strength] */
desert:[[10,23,27,8,1],[-8,26,10,5,1],[30,22,7,5,1],[47,22,11,8,1],[46,6,6,6,.6],[38,3,5,3,.5],[20,-24,8,7,.8],[14.5,-23,1.5,7,.9],[55,32,10,5,.9],[71,27,4,3.5,.9],[105,42,14,4,.9],[82,39.5,7,2.5,.9],[62,40,8,4,.6],[130,-25,14,7,.9],[145,-27,5,5,.5],[-111,34,6,4,.8],[-105,28,5,3,.6],[-69,-44,4,6,.7],[-70,-22,1.5,5,.9],[5,14,25,2.5,.45]],
jungle:[[22,-1,9,6,1],[-6,6.5,6,2.5,.8],[7,5.5,6,2,.8],[36,7,2.5,2.5,.5],[49,-17,1.5,5,.8],[-62,-4,11,6,1],[-76,5,3,5,.7],[-85,11,4,3,.7],[102,16,7,6,.6],[101,-0.5,4,3,1],[114,0,4,3,1],[141,-5,6,2,1],[110,-7.4,4,1,.5],[75.5,12,1,6,.6],[93,25,4,3,.7],[110,25,6,3,.5],[-123,45,2,6,.6],[30,1,3,2.5,.7]],
mount:[[85,30,10,3.5,1],[90,34,9,4,.7],[-70,-20,2.5,14,.6],[-72,-40,1.5,8,.5],[-76,0,1.5,8,.6],[-110,45,4,15,.5],[-122,40,1.5,5,.4],[10,46.5,6,1.5,.7],[-4,32,8,1.5,.5],[39,9,4,4,.6],[36,-3,3,5,.35],[29,-29,3,3,.4],[50,32,5,3,.5],[70,37,6,3,.8],[80,42,8,1.5,.7],[44,42.5,4,1,.6],[60,57,1,8,.3],[14,64,3,6,.3],[-40,73,14,9,1],[57,23,2,1,.5],[44,15,2,2,.5],[35,39,5,2,.4],[-103,24,3,7,.5],[-80,38,2,6,.25],[169,-44,1.5,3,.5]]
};
function makeGeoMaps(){
 const W=4096,H=2048,X=lo=>(lo+180)/360*W,Y=la=>(90-la)/180*H;
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,W,H);return[c,x]};
 const poly=(x,p)=>{x.beginPath();p.forEach((v,i)=>i?x.lineTo(X(v[0]),Y(v[1])):x.moveTo(X(v[0]),Y(v[1])));x.closePath();x.fill()};
 const ell=(x,e)=>{x.beginPath();x.ellipse(X(e[0]),Y(e[1]),e[2]/360*W,e[3]/180*H,0,0,6.2832);x.fill()};
 const tint=(x,list,col)=>list.forEach(e=>{x.fillStyle=col(e[4]);ell(x,e)});
 /* map 1: R = sharp land, G = desert, B = jungle */
 const[c1,x1]=mk();x1.fillStyle='#f00';GEO.land.forEach(p=>poly(x1,p));
 x1.fillStyle='#000';GEO.water.forEach(ell.bind(null,x1));
 x1.globalCompositeOperation='lighter';x1.filter='blur(5px)';
 tint(x1,GEO.desert,s=>'rgb(0,'+(s*255|0)+',0)');tint(x1,GEO.jungle,s=>'rgb(0,0,'+(s*255|0)+')');
 /* map 2: R = blurred land (continental shelf / coast distance), G = mountain ranges */
 const[c2,x2]=mk();x2.filter='blur(14px)';x2.fillStyle='#f00';GEO.land.forEach(p=>poly(x2,p));
 x2.globalCompositeOperation='lighter';x2.filter='blur(4px)';tint(x2,GEO.mount,s=>'rgb(0,'+(s*255|0)+',0)');
 return[c1,c2].map(c=>{const t=new THREE.CanvasTexture(c);t.generateMipmaps=false;t.minFilter=t.magFilter=THREE.LinearFilter;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;return t})}

/* ---- Earth: the procedural surface is baked ONCE at start-up into two cube maps (no UVs, so no seam), then drawn with a cheap lookup ---- */
const bakeFrag=`precision highp float;uniform vec3 uSun,uP0,uE0,uN0;uniform int uPass;uniform sampler2D uL1,uL2;varying vec3 vN;${NOISE}
float fb4(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/.9375;}
float gs(float x){return exp(-x*x);}
void main(){vec3 N=normalize(vN);
/* local pad frame (+x east, +y up, -z north) -> Earth-fixed unit vector G (z = north pole) -> latitude / longitude */
vec3 G=N.y*uP0+N.x*uE0-N.z*uN0;float lat=asin(clamp(G.z,-1.,1.)),lon=atan(G.y,G.x);vec3 q=vec3(G.x,G.z,G.y);
/* wobble the lookup so the hand-drawn coastlines get natural, fractal edges */
vec2 jt=(vec2(fbm(q*45.),fbm(q*45.+7.3))-.5)*.034+(vec2(fbm(q*13.+4.1),fbm(q*13.+9.7))-.5)*.05+(vec2(fb4(q*500.),fb4(q*500.+3.7))-.5)*.006;   /* extra coarse wobble: long straight polygon edges (the Somali coast) no longer read as a ruler cut from orbit */
vec2 uv=vec2((lon+jt.x/max(cos(lat),.25))*.1591549+.5,(lat+jt.y)*.3183099+.5);
vec4 T=texture2D(uL1,uv),Tb=texture2D(uL2,uv);
float land=smoothstep(.42,.58,T.r);
float rough=fbm(q*16.+2.),rid=1.-abs(2.*fb4(q*90.+5.)-1.);
float hh=land*clamp(.06+.26*rough*rough+Tb.g*(.42+.55*rid)*(.55+.9*rough),0.,1.25);      /* terrain height: foothills + real mountain ranges */
float ndl=dot(N,uSun);float day=smoothstep(-.1,.25,ndl);
if(uPass==1){float night=1.-smoothstep(-.1,.05,ndl);float city=smoothstep(.72,.9,fb4(q*45.))*land*night*smoothstep(.1,.9,fb4(q*5.));gl_FragColor=vec4(land,city,clamp(hh,0.,1.),1.);return;}   /* b = terrain height, used for relief shading at run time */
/* ocean: royal blue, turquoise over the shelf near coasts */
float depth=clamp(1.-Tb.r*2.6+(fb4(q*7.+4.)-.5)*.3,0.,1.);
vec3 ocean=mix(vec3(.10,.52,.62),vec3(.05,.27,.50),smoothstep(0.,.35,depth));ocean=mix(ocean,vec3(.03,.14,.36),smoothstep(.3,1.,depth));ocean*=.9+.2*fb4(q*60.);
/* land: tan Sahara / Arabia, dark green jungle, olive savanna, green temperate zones, rock and snow on the ranges */
float la=abs(lat)*.6366198;
float dz=smoothstep(.22,.7,T.g+(fb4(q*22.)-.5)*.55),jg=smoothstep(.22,.7,T.b+(fb4(q*26.+3.)-.5)*.55);
vec3 sav=mix(vec3(.50,.45,.19),vec3(.32,.38,.14),fb4(q*18.));
vec3 temp=mix(vec3(.12,.28,.08),vec3(.24,.36,.12),fb4(q*24.));
vec3 forest=mix(vec3(.06,.20,.05),vec3(.13,.30,.08),fb4(q*30.));
vec3 base=mix(temp,sav,1.-smoothstep(0.,.33,la));base=mix(base,forest,jg);
base=mix(base,vec3(.17,.26,.13),smoothstep(.58,.74,la));base=mix(base,vec3(.46,.46,.40),smoothstep(.80,.90,la));
vec3 dc=mix(vec3(.66,.43,.24),vec3(.82,.60,.36),fb4(q*40.));
vec3 ground=mix(base,dc,dz);ground=mix(ground,vec3(.30,.26,.21),smoothstep(.40,.78,hh));ground=mix(ground,vec3(.95),smoothstep(.80,1.,hh));
vec3 col=mix(ocean,ground,land);
float sl=abs(q.y),nz=(fb4(q*6.)-.5)*.04,ice=mix(smoothstep(.95,.98,sl+nz),smoothstep(.87,.91,sl+nz),land);col=mix(col,vec3(.93,.96,1.),ice);
/* clouds: warped swirls, wet equator + storm belts, clear subtropical deserts */
vec3 w=q*2.2;w+=.55*vec3(vn(w*1.7),vn(w*1.7+4.),vn(w*1.7+9.));w+=.22*vec3(vn(w*4.3+2.),vn(w*4.3+6.),vn(w*4.3+11.));
float lt=abs(lat);
float cov=.5+.10*gs((lt-.08)/.17)+.13*gs((lt-.86)/.22)-.20*gs((lt-.46)/.17)*(1.+1.3*dz*land);
float thr=.60-.8*(cov-.5);
float cl=smoothstep(thr,thr+.16,fbm(w))*(1.-ice*.3);
gl_FragColor=vec4(clamp(col,0.,1.),cl);}`;
const BAKE_RES=1536;   /* per cube face; lower to 1024 on very weak GPUs */
function bakeEarth(){
 const [m1,m2]=makeGeoMaps(),mat=new THREE.ShaderMaterial({uniforms:{uSun:{value:SUN},uPass:{value:0},uL1:{value:m1},uL2:{value:m2},uP0:{value:GP0},uE0:{value:GE0},uN0:{value:GN0}},vertexShader:`varying vec3 vN;void main(){vN=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:bakeFrag,side:THREE.BackSide,depthTest:false,depthWrite:false});
 const bs=new THREE.Scene(),box=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),mat);bs.add(box);
 const opt={generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,type:THREE.UnsignedByteType},out=[],ac=renderer.autoClear;renderer.autoClear=true;
 for(let p=0;p<2;p++){const rt=new THREE.WebGLCubeRenderTarget(BAKE_RES,opt),cc=new THREE.CubeCamera(.1,10,rt);mat.uniforms.uPass.value=p;cc.update(renderer,bs);out.push(rt.texture)}
 renderer.autoClear=ac;renderer.setRenderTarget(null);m1.dispose();m2.dispose();mat.dispose();box.geometry.dispose();return out}
const [earthA,earthB]=bakeEarth();
const earthMat=new THREE.ShaderMaterial({uniforms:{uSun:{value:SUN},uA:{value:earthA},uB:{value:earthB},uC:{value:EC},uR:{value:R_E}},
 vertexShader:`varying vec3 vN;varying vec3 vW;void main(){vN=normalize(position);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`precision highp float;uniform vec3 uSun,uC;uniform float uR;uniform samplerCube uA,uB;varying vec3 vN;varying vec3 vW;${NOISE}
float fb4(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/.9375;}
void main(){vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);vec4 A=textureCube(uA,N),B=textureCube(uB,N);
float dist=length(cameraPosition-vW);float kd=1.-smoothstep(3e5,2.5e6,dist);float rk=1.-smoothstep(1.2e6,7e6,dist);
float land=B.r,city=B.g;float dn=0.,d2=0.;if(kd>0.){dn=fb4(N*3000.)-.5;d2=fb4(N*12000.)-.5;}   /* the baked cube is ~6 km/texel: add 2 octaves of detail when close */
vec3 col=A.rgb*(1.+(dn*.9+d2*.7)*kd*(.4+.6*land));
float ndl=dot(N,uSun);float day=smoothstep(-.1,.25,ndl);
/* terrain relief: slope of the baked height map tilts the surface normal so ranges and valleys catch the sun */
vec3 T=cross(N,vec3(0.,1.,0.));T=length(T)<.01?vec3(1.,0.,0.):normalize(T);vec3 Bt=cross(N,T);const float ep=.0018;
float hx=textureCube(uB,normalize(N+T*ep)).b-textureCube(uB,normalize(N-T*ep)).b,hy=textureCube(uB,normalize(N+Bt*ep)).b-textureCube(uB,normalize(N-Bt*ep)).b;
vec3 nr=normalize(N-(T*hx+Bt*hy)*44.*land*rk);float ndr=mix(ndl,dot(nr,uSun),land*rk);
/* clouds live ~14 km above the ground: look up the cloud map where the VIEW RAY crosses that shell (parallax), so the terrain slides under them */
vec3 ro=cameraPosition-uC,rd=normalize(vW-cameraPosition);float Rc=uR+14000.;vec3 Nc=N;
{float b2=dot(ro,rd),q2=b2*b2-(dot(ro,ro)-Rc*Rc);if(q2>0.){float t=-b2-sqrt(q2);if(t>0.&&t<dist)Nc=normalize(ro+rd*t);}}
vec4 AC=textureCube(uA,Nc);float cdn=kd>0.?fb4(Nc*3000.)-.5:0.;
float cl=clamp(AC.a+cdn*1.1*kd*sqrt(AC.a*(1.-AC.a)),0.,1.);
/* cloud shadow on the ground: follow the sun ray from the surface up to the cloud shell */
vec3 pg=normalize(vW-uC)*uR;float b3=dot(pg,uSun),q3=b3*b3-(dot(pg,pg)-Rc*Rc);vec3 Ns=normalize(pg+uSun*(-b3+sqrt(max(q3,0.))));
float sh=textureCube(uA,Ns).a*.6*smoothstep(.02,.22,ndl);
float spec=pow(max(dot(reflect(-uSun,N),V),0.),70.)*(1.-land)*(1.-cl)*day*1.6;
vec3 tint=mix(vec3(1.),vec3(1.,.62,.4),(1.-smoothstep(0.,.35,ndl))*day);
vec3 lit=col*tint*(.04+day*(.40+max(ndr,0.)*1.05))*(1.-sh*.6)+vec3(1.,.85,.6)*spec*(1.-sh);
vec3 cloud=vec3(.96,.97,1.)*tint*(.06+day*(.40+max(ndl,0.)*1.05));
vec3 o=mix(lit,cloud,cl*.86);o+=vec3(1.,.7,.35)*city*(1.-cl)*.9;
float mu=max(dot(N,V),0.);o=mix(o*vec3(.5,.65,1.),o,smoothstep(0.,.3,mu));   /* blue, darker limb: no grey rim line */
gl_FragColor=vec4(pow(o,vec3(.85)),1.);}`});
const earth=new THREE.Mesh(new THREE.SphereGeometry(R_E,128,96),earthMat);earth.position.copy(EC);earth.frustumCulled=false;space.add(earth);
const shell=new THREE.Mesh(new THREE.SphereGeometry(R_E+100000,128,64),new THREE.ShaderMaterial({uniforms:{uSun:{value:SUN},uC:{value:EC},uR:{value:R_E},uH:{value:100000},uF:{value:0}},
 vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform vec3 uSun,uC;uniform float uR,uH,uF;varying vec3 vW;
vec2 rs(vec3 o,vec3 d,float r){float b=dot(o,d),c=dot(o,o)-r*r,q=b*b-c;if(q<0.)return vec2(1e9,-1e9);q=sqrt(q);return vec2(-b-q,-b+q);}
void main(){vec3 ro=cameraPosition-uC,rd=normalize(vW-cameraPosition);vec2 a=rs(ro,rd,uR+uH);
 if(a.y<=0.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 vec2 p=rs(ro,rd,uR);float t0=max(a.x,0.),t1=a.y;if(p.x>0.)t1=min(t1,p.x);
 float L=t1-t0;if(L<=0.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 const int N=24;float dt=L/float(N);vec3 bR=vec3(5.5e-6,13.0e-6,22.4e-6);vec3 sc=vec3(0.);float od=0.;
 for(int i=0;i<N;i++){vec3 pos=ro+rd*(t0+(float(i)+.5)*dt);float h=max(length(pos)-uR,0.);float dn=exp(-h/8000.);
  float mu=dot(normalize(pos),uSun);float sod=8000.*dn/clamp(mu+.18,.06,1.2);float sh=smoothstep(-.22,.04,mu);
  od+=dn*dt;sc+=exp(-bR*(od+sod))*dn*dt*sh;}
 float cg=dot(rd,uSun);vec3 col=sc*bR*(.75*(1.+cg*cg))*.9;
 col=1.-exp(-col);if(p.x>0.)col*=.4;gl_FragColor=vec4(col*uF,1.);}`,
 side:THREE.BackSide,transparent:true,depthWrite:false,depthTest:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor}));
shell.renderOrder=5;
shell.position.copy(EC);shell.frustumCulled=false;space.add(shell);
{const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),makeSky()));
 scene.environment=new THREE.PMREMGenerator(renderer).fromScene(envScene,0,.1,100).texture;scene.environmentIntensity=.55}

/* ================= PARTICLES ================= */
class PS{constructor(n,map,add){this.n=n;this.i=0;this.act=0;const F=k=>new Float32Array(n*k);
 this.p=F(3);this.v=F(3);this.age=F(1).fill(1);this.life=F(1).fill(1);this.s0=F(1);this.s1=F(1);this.a0=F(1);this.hot=F(1);this.drag=F(1);this.buoy=F(1);this.col=F(3);this.rv=F(1);
 this.aS=F(1).fill(1);this.aA=F(1);this.aC=F(3);this.aR=F(1);const g=this.g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(this.p,3));g.setAttribute('aSize',new THREE.BufferAttribute(this.aS,1));g.setAttribute('aAlpha',new THREE.BufferAttribute(this.aA,1));g.setAttribute('aColor',new THREE.BufferAttribute(this.aC,3));g.setAttribute('aRot',new THREE.BufferAttribute(this.aR,1));
 for(const k of Object.values(g.attributes))k.setUsage(THREE.DynamicDrawUsage);
 this.m=new THREE.ShaderMaterial({uniforms:{map:{value:map},uScale:{value:800},uMax:{value:256}},transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending,
  vertexShader:`attribute float aSize;attribute float aAlpha;attribute vec3 aColor;attribute float aRot;uniform float uScale,uMax;varying float vA,vR;varying vec3 vC;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);float d=-mv.z;gl_Position=projectionMatrix*mv;float s=aSize*uScale/max(d,.1);gl_PointSize=min(s,uMax);
vA=aAlpha*smoothstep(aSize*.25,aSize*.9,d)*min(1.,uMax/max(s,1.));vC=aColor;vR=aRot;}`,
  fragmentShader:`uniform sampler2D map;varying float vA,vR;varying vec3 vC;void main(){vec2 u=gl_PointCoord-.5;float c=cos(vR),s=sin(vR);u=vec2(c*u.x-s*u.y,s*u.x+c*u.y)+.5;gl_FragColor=vec4(vC,texture2D(map,u).a*vA);}`});
 this.o=new THREE.Points(g,this.m);this.o.frustumCulled=false}
 add(x,y,z,vx,vy,vz,life,s0,s1,a,hot=0,drag=.5,buoy=0,r=.86,g=.82,b=.78){const i=this.i,k=i*3;if(this.age[i]>=this.life[i])this.act++;this.i=(i+1)%this.n;this.o.visible=true;
  this.p[k]=x;this.p[k+1]=y;this.p[k+2]=z;this.v[k]=vx;this.v[k+1]=vy;this.v[k+2]=vz;this.age[i]=0;this.life[i]=life;this.s0[i]=s0;this.s1[i]=s1;this.a0[i]=a;this.hot[i]=hot;this.drag[i]=drag;this.buoy[i]=buoy;
  this.col[k]=r;this.col[k+1]=g;this.col[k+2]=b;this.aR[i]=rnd(0,6.28);this.rv[i]=rnd(-.4,.4);this.aS[i]=s0;this.aC[k]=r;this.aC[k+1]=g;this.aC[k+2]=b;this.aA[i]=life>1e8?a:0}
 update(dt){if(!this.act)return;this._upd(dt);this.o.visible=this.act>0}
 _upd(dt){const n=this.n;for(let i=0;i<n;i++){const L=this.life[i];if(L>1e8)continue;let a=this.age[i];if(a>=L){this.aA[i]=0;continue}
  a+=dt;this.age[i]=a;const t=a/L;if(t>=1){this.aA[i]=0;this.act--;continue}const k=i*3,dm=Math.exp(-this.drag[i]*dt);
  this.v[k]*=dm;this.v[k+1]=this.v[k+1]*dm+this.buoy[i]*dt;this.v[k+2]*=dm;this.p[k]+=this.v[k]*dt;this.p[k+1]+=this.v[k+1]*dt;this.p[k+2]+=this.v[k+2]*dt;
  this.aS[i]=this.s0[i]+(this.s1[i]-this.s0[i])*Math.sqrt(t);this.aA[i]=this.a0[i]*sstep(0,.06,t)*Math.pow(1-t,1.3);this.aR[i]+=this.rv[i]*dt;
  const h=this.hot[i]*(1-sstep(0,.35,t));this.aC[k]=this.col[k]*(1-h)+h;this.aC[k+1]=this.col[k+1]*(1-h)+h*.6;this.aC[k+2]=this.col[k+2]*(1-h)+h*.25}
  const A=this.g.attributes;A.position.needsUpdate=A.aSize.needsUpdate=A.aAlpha.needsUpdate=A.aColor.needsUpdate=A.aRot.needsUpdate=true}
 flush(){const A=this.g.attributes;A.position.needsUpdate=A.aSize.needsUpdate=A.aAlpha.needsUpdate=A.aColor.needsUpdate=A.aRot.needsUpdate=true}}
const smoke=new PS(6000,puffTex(),false);scene.add(smoke.o);
const cloudPS=new PS(1100,puffTex(),false);scene.add(cloudPS.o);
{const cl=(y0,y1,clusters,per,s0,s1,a0,a1,rg,ox=0,oz=0)=>{for(let c=0;c<clusters;c++){const cx=ox+rnd(-rg,rg),cz=oz+rnd(-rg,rg),cy=rnd(y0,y1);for(let k=0;k<per;k++){const s=rnd(s0,s1);cloudPS.add(cx+rnd(-.8,.8)*s,cy+rnd(-.12,.12)*s,cz+rnd(-.8,.8)*s,0,0,0,1e9,s,s,rnd(a0,a1),0,0,0,rnd(.9,.98),rnd(.86,.93),rnd(.84,.9))}}};
 cl(2300,3500,55,9,900,2200,.28,.5,16000);cl(2400,3300,7,10,900,1900,.32,.5,1400,300,-400);cl(7000,9200,22,10,2600,5200,.14,.26,22000);cloudPS.flush()}

/* ================= LIGHTS ================= */
const sun=new THREE.DirectionalLight(0xffc78f,3.1);sun.position.copy(SUN).multiplyScalar(400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-130,right:130,top:130,bottom:-130,near:50,far:900});sun.shadow.bias=-.0004;sun.shadow.normalBias=.4;scene.add(sun,sun.target);
scene.add(new THREE.HemisphereLight(0x8ea4d0,0x4a4030,.6));

/* ================= WORLD BUILDERS ================= */
const world=new THREE.Group();scene.add(world);const walls=[];
const M=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.7,metalness:.1},o));
function add(g,m,x,y,z,p=world,sh=true){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=sh;o.receiveShadow=true;p.add(o);return o}
const B=(w,h,d,m,x,y,z,p,sh)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z,p,sh);
const CY=(rt,rb,h,m,x,y,z,p,seg=24)=>add(new THREE.CylinderGeometry(rt,rb,h,seg),m,x,y,z,p);
function glow(x,y,z,size,color,op,p=world){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:op,fog:false,toneMapped:false}));s.position.set(x,y,z);s.scale.set(size,size,1);p.add(s);return s}
function strut(a,b,r){const d=new V3().subVectors(b,a),L=d.length(),g=new THREE.CylinderGeometry(r,r,L,6,1);
 g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new V3(0,1,0),d.normalize()),new V3(1,1,1)));return g}
function lattice(w,d,h,n,r){const G=[],hx=w/2,hz=d/2,sh=h/n,C=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]];
 for(const[x,z]of C)G.push(strut(new V3(x,0,z),new V3(x,h,z),r*1.7));
 for(let i=0;i<=n;i++)for(let k=0;k<4;k++){const a=C[k],b=C[(k+1)%4];G.push(strut(new V3(a[0],i*sh,a[1]),new V3(b[0],i*sh,b[1]),r))}
 for(let i=0;i<n;i++)for(let k=0;k<4;k++){const a=C[k],b=C[(k+1)%4],y0=i*sh,y1=y0+sh;G.push((i+k)%2?strut(new V3(a[0],y0,a[1]),new V3(b[0],y1,b[1]),r):strut(new V3(b[0],y0,b[1]),new V3(a[0],y1,a[1]),r))}
 return mergeGeometries(G)}
const mSteel=M(0xd2521c,{roughness:.55,metalness:.55}),mGray=M(0x8c9096,{roughness:.5,metalness:.6}),mWhite=M(0xe6e8ea,{roughness:.35,metalness:.7}),mDark=M(0x2a2c30,{roughness:.6,metalness:.5});
const mConc=M(0xffffff,{map:rep(concBase,1,1),roughness:.92}),mSoot=M(0xffffff,{map:rep(sootBase,6,2),roughness:1}),lampMat=new THREE.MeshBasicMaterial({color:0xfff2cc,toneMapped:false});
const cmat=(rx,ry)=>M(0xffffff,{map:rep(concBase,rx,ry),roughness:.92});
const poly=(m)=>{m.polygonOffset=true;m.polygonOffsetFactor=-2;m.polygonOffsetUnits=-2;return m};

/* ground */
const groundMat=new THREE.MeshStandardMaterial({map:grassTex,roughness:1,metalness:0});groundMat.transparent=true;groundMat.color.setRGB(1.35,1.2,1.3);   /* match the terrain tint so the flat pad disc does not stand out from the hills */
groundMat.polygonOffset=true;groundMat.polygonOffsetFactor=2;groundMat.polygonOffsetUnits=2;
const ground=add(new THREE.PlaneGeometry(80000,80000),groundMat,0,-.5,0,world,false);ground.rotation.x=-Math.PI/2;ground.renderOrder=-5;
/* SEA + BEACH: the shoreline follows coast(z) (a winding natural coastline, see heightAt) instead of a ruler-straight edge.
   Water is a strip mesh whose colour/alpha fade from foamy turquoise shallows into deep blue; a wet-sand ribbon softly blends the grass into the water. */
const oceanMat=M(0xffffff,{roughness:.2,metalness:.15,transparent:true,vertexColors:true,side:THREE.DoubleSide}),
 sandMat=M(0xffffff,{roughness:1,metalness:0,transparent:true,vertexColors:true,side:THREE.DoubleSide});
sandMat.polygonOffset=true;sandMat.polygonOffsetFactor=-3;sandMat.polygonOffsetUnits=-3;
function coastStrip(mat,zMax,offs,ys,cols,order){const zs=[];for(let z=-zMax;z<=zMax;z+=Math.abs(z)<4000?50:300)zs.push(z);
 const C=offs.length,pos=new Float32Array(zs.length*C*3),col=new Float32Array(zs.length*C*4),nrm=new Float32Array(zs.length*C*3),idx=[];
 zs.forEach((z,i)=>{const c0=coast(z);offs.forEach((o,j)=>{const k=i*C+j;pos.set([c0+o,ys[j],z],k*3);col.set(cols[j],k*4);nrm.set([0,1,0],k*3)})});
 for(let i=0;i<zs.length-1;i++)for(let j=0;j<C-1;j++){const a=i*C+j,b=a+1,c=a+C,d=c+1;idx.push(a,b,c,b,d,c)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,4));g.setAttribute('normal',new THREE.BufferAttribute(nrm,3));g.setIndex(idx);
 const m=new THREE.Mesh(g,mat);m.frustumCulled=false;m.renderOrder=order;world.add(m);return m}
coastStrip(oceanMat,40000,[0,5,22,60,150,350,800,2000,6000,30000],[-.2,.25,.6,.6,.6,.6,.6,.6,.6,.6],
 [[.22,.52,.46,0],[.14,.46,.44,.7],[.06,.34,.40,.92],[.04,.26,.36,1],[.03,.20,.32,1],[.025,.17,.29,1],[.02,.15,.27,1],[.016,.13,.24,1],[.016,.13,.24,1],[.016,.13,.24,1]],0);
coastStrip(sandMat,16000,[-90,-35,-9,0,12],[-.44,-.44,-.42,-.4,-.38],
 [[.45,.38,.20,0],[.55,.45,.26,.9],[.40,.31,.17,1],[.17,.13,.08,1],[.07,.06,.05,1]],-4.5);
const gravel=add(new THREE.PlaneGeometry(240,240),poly(M(0xffffff,{map:gravelTex,roughness:1})),0,-.35,0,world,false);gravel.rotation.x=-Math.PI/2;
const road=add(new THREE.PlaneGeometry(12,620),poly(M(0xffffff,{map:roadTex,roughness:.85})),0,-.2,45+310,world,false);road.rotation.x=-Math.PI/2;
for(const z of[-70,72]){const r=add(new THREE.PlaneGeometry(200,9),poly(M(0xffffff,{map:asphaltTex,roughness:.85})),0,-.19,z,world,false);r.rotation.x=-Math.PI/2}

/* launch pad, trench, deflector, table */
B(90,3,40,cmat(15,7),0,-1.5,25);B(90,3,40,cmat(15,7),0,-1.5,-25);
B(90,.5,10,mSoot,0,-3.25,0);B(90,.2,.5,mDark,0,.1,5.2);B(90,.2,.5,mDark,0,.1,-5.2);
for(const s of[1,-1]){const d=B(10,.8,9,mSoot,s*4.64,-.85,0);d.rotation.z=-s*.38}
const table=add(new THREE.LatheGeometry([new THREE.Vector2(3,4.4),new THREE.Vector2(6,4.4),new THREE.Vector2(6,5.2),new THREE.Vector2(3,5.2),new THREE.Vector2(3,4.4)],64),new THREE.MeshStandardMaterial({color:0x9a9a96,roughness:.8,metalness:.3,side:THREE.DoubleSide}),0,0,0);
for(const sx of[-1,1])for(const sz of[-1,1])CY(.8,1,7.4,mConc,sx*3.2,.7,sz*3.2);
for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4,c=B(1.4,.55,.6,mDark,Math.sin(a)*2.55,6.4,Math.cos(a)*2.55);c.rotation.y=a}
for(let i=0;i<8;i++){const a=i*Math.PI/4;B(.5,.5,2.5,mGray,Math.sin(a)*4.5,5.45,Math.cos(a)*4.5).rotation.y=a}
for(const x of[-12,12])for(const z of[-3.2,3.2]){CY(.35,.35,.4,mDark,x,.2,z)}

/* launch tower with umbilical arms */
const TX=14,tower=new THREE.Group();tower.position.set(TX,0,0);world.add(tower);
{const t=add(lattice(5,5,90,18,.12),mSteel,0,0,0,tower);const P=[];for(let y=15;y<=90;y+=15)P.push(boxG(5.8,.25,5.8,0,y,0));
 function boxG(w,h,d,x,y,z){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);return g}
 add(mergeGeometries(P),mGray,0,0,0,tower);
 add(boxG(2.4,88,2.2,3.4,44,0),M(0x6d7177,{roughness:.6,metalness:.6}),0,0,0,tower);
 B(9,2,9,mConc,0,1,0,tower);
 const jib=lattice(1.6,1.6,16,6,.07);jib.rotateZ(-Math.PI/2);add(jib,mSteel,0,90,0,tower);B(3,2,2.4,mDark,-4.5,90.6,0,tower);
 CY(.12,.2,16,mGray,0,98,0,tower,8);const beacon=glow(0,106.4,0,6,0xff2020,1,tower);tower.userData.beacon=beacon;
 for(const[x,z]of[[-2.5,-2.5],[2.5,2.5],[-2.5,2.5],[2.5,-2.5]])glow(x,60,z,2.4,0xff3030,.9,tower)}
const arms=[];
for(const[y,i]of[[28,0],[44,1],[56,2]]){const g=new THREE.Group();g.position.set(-2.5,y,0);tower.add(g);
 const L=9.3,lt=lattice(2.4,2,L,4,.07);lt.rotateZ(Math.PI/2);add(lt,mSteel,0,0,0,g);B(1.2,2.6,2.4,mDark,-L-.4,0,0,g);
 for(const s of[-1,1]){const c=new THREE.CatmullRomCurve3([new V3(-L,.4,s*.5),new V3(-L-.5,-1.5,s*.5),new V3(-L-.9,-3.6,s*.5),new V3(-L-1.2,-5.4,s*.4)]);add(new THREE.TubeGeometry(c,16,.14,6),mDark,0,0,0,g,false)}
 arms.push({g,t0:-6.8+i*1.7})}

/* floodlight towers + road lamps */
const flood=[];
for(const[x,z]of[[-38,-38],[38,38],[-38,38],[38,-38]]){CY(.28,.4,30,mGray,x,15,z,world,10);const h=new THREE.Group();h.position.set(x,30.5,z);h.lookAt(0,30.5,0);world.add(h);B(6,2.6,.5,mDark,0,0,0,h);
 for(let i=0;i<3;i++)for(let j=0;j<2;j++){B(1.4,.9,.2,lampMat,-2+i*2,-.55+j*1.1,.35,h,false)}
 glow(x*.97,30.5,z*.97,16,0xfff0d0,.55);const sp=new THREE.SpotLight(0xfff0d0,3.5,0,.5,.6,0);sp.position.set(x,30.5,z);sp.target.position.set(0,32,0);scene.add(sp,sp.target);flood.push(sp)}
for(let i=0;i<14;i++){const x=i%2?7.5:-7.5,z=102+Math.floor(i/2)*22;CY(.12,.16,9,mGray,x,4.5,z,world,8);B(1.6,.18,.5,lampMat,x+(x>0?-.8:.8),9,z,world,false);glow(x+(x>0?-.8:.8),8.9,z,8,0xffe2a8,.5)}

/* water tower, tanks, pipes */
{const wt=add(lattice(6,6,46,8,.16),mSteel,44,0,-34);const tk=add(new THREE.SphereGeometry(8.5,32,20),mWhite,44,55,-34);add(new THREE.TorusGeometry(8.5,.25,8,40),mDark,44,55,-34).rotation.x=Math.PI/2;
 CY(1.2,1.2,10,mGray,44,47,-34,world,10);const p=new THREE.CatmullRomCurve3([new V3(44,1.8,-34),new V3(30,1.8,-24),new V3(18,1.8,-8)]);add(new THREE.TubeGeometry(p,24,.7,8),mGray,0,0,0)}
for(const z of[-22,-48]){const x=-50;add(new THREE.SphereGeometry(8.5,40,28),mWhite,x,13,z);add(new THREE.TorusGeometry(8.5,.3,8,48),mDark,x,13,z).rotation.x=Math.PI/2;
 for(let k=0;k<8;k++){const a=k*Math.PI/4,r=7.4;add(strut(new V3(x+Math.cos(a)*r,0,z+Math.sin(a)*r),new V3(x+Math.cos(a)*r,13,z+Math.sin(a)*r),.3),mGray,0,0,0)}
 const pc=new THREE.CatmullRomCurve3([new V3(x+8,3,z),new V3(x+20,2.4,-30),new V3(-10,2.4,-30),new V3(11,2.4,-6)]);add(new THREE.TubeGeometry(pc,60,.55,8),mWhite,0,0,0);
 CY(.5,.5,13,mWhite,x+8,6.5,z,world,10)}
for(let i=0;i<8;i++)B(.5,2.4,.5,mGray,-38+i*6.6,1.2,-30.4);
for(const z of[18,34,50]){const c=add(new THREE.CapsuleGeometry(3.2,18,8,24),mWhite,62,4.8,z);c.rotation.z=Math.PI/2;for(const dx of[-7,0,7])B(1,2.6,5,mConc,62+dx,1.3,z);glow(62,9,z,3,0xff2020,.7)}

/* bunker with mound, antenna */
{const g=new THREE.CylinderGeometry(11,26,7,4);g.rotateY(Math.PI/4);add(g,M(0xffffff,{map:rep(grassTex,6,6),color:0x8a9a6a,roughness:1}),-55,3.5,38);
 CY(.2,.3,22,mGray,-60,18,32,world,8);const d=add(new THREE.SphereGeometry(3,24,12,0,6.283,0,1.1),mWhite,-60,22,32);d.rotation.set(-1,.6,0);glow(-60,29.5,32,5,0xff2020,.9)}

/* ---------- terrain height field (pure functions) ---------- */
function h2(a,b){const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n)}
function vn2(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);return lerp(lerp(h2(xi,yi),h2(xi+1,yi),u),lerp(h2(xi,yi+1),h2(xi+1,yi+1),u),v)}
function fb2(x,y,o){let a=.5,s=0;for(let i=0;i<o;i++){s+=a*vn2(x,y);x=x*2.03+17.1;y=y*2.03+3.7;a*=.5}return s}
function rdg(x,y,o){let a=.5,s=0,w=1;for(let i=0;i<o;i++){let n=1-Math.abs(vn2(x,y)*2-1);n*=n;s+=a*n*w;w=clamp(n*1.6,0,1);x=x*2.1+11.3;y=y*2.1+5.9;a*=.5}return s}
/* flat launch site out to ~1.5 km, alpine ridges beyond, sea level to the east */
function heightAt(x,z){const d=Math.hypot(x,z),m=sstep(1500,3800,d)*sstep(900,-700,x);
 let h=m*(rdg(x/2400+4,z/2400+9,6)*2300+fb2(x/700,z/700,3)*220);
 h+=sstep(1300,2400,d)*sstep(500,-200,x)*Math.max(0,fb2(x/420,z/420,3)-.38)*70;
 h*=1-sstep(9000,15000,d);const c=coast(z);h*=sstep(c-60,c-1900,x);   /* mountains melt into a coastal plain instead of ending in a cliff at the sea */
 const co=sstep(c-60,c-5,x);return h*(1-co)-co*4}
/* winding natural coastline: x of the shoreline at a given z (kept >=480 m from the pad, bays and headlands grow with distance) */
function coast(z){const a=Math.abs(z);let c=660+80*Math.sin(z/1300+1.3)+45*Math.sin(z/430+.4)+(fb2(z/700+31,5.5,3)-.5)*120;
 c+=(fb2(z/3200+9,2.2,3)-.5)*sstep(1200,6000,a)*2600+(fb2(z/260+3,8.1,2)-.5)*40*sstep(600,3000,a);return clamp(c,480,6000)}

/* ================= BUILDINGS (every one is collidable and placed on a clear footprint) ================= */
const FP=[];                                        // reserved footprints [x0,x1,z0,z1]
const rsv=(x,z,w,d)=>FP.push([x-w/2,x+w/2,z-d/2,z+d/2]);
const clear=(x,z,w,d,m=0)=>!FP.some(f=>x+w/2+m>f[0]&&x-w/2-m<f[1]&&z+d/2+m>f[2]&&z-d/2-m<f[3]);
let _s=20261106;const sr=()=>{let t=_s=(_s+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
const sR=(a,b)=>a+sr()*(b-a);
/* fixed reservations: fenced compound, road corridor, cinematic camera zone */
rsv(0,0,210,210);rsv(0,365,48,670);rsv(-48,147,54,86);

const FT={
 office:{bay:4.5,fl:3.8,roof:0x6c7076,tex:canvasTex(128,128,(x,w,h)=>{x.fillStyle='#7f8991';x.fillRect(0,0,w,h);const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#5d84a8');g.addColorStop(.5,'#2c4560');g.addColorStop(1,'#1a2a3c');x.fillStyle=g;x.fillRect(6,8,w-12,h-22);x.fillStyle='rgba(255,255,255,.25)';x.fillRect(10,12,w-40,6);x.fillStyle='#aab1b8';x.fillRect(w/2-2,8,4,h-22);x.fillStyle='#c4c8cc';x.fillRect(0,h-14,w,14)})},
 dorm:{bay:3.6,fl:3.2,roof:0x8a4f3c,tex:canvasTex(128,128,(x,w,h)=>{speckle(x,w,h,222,208,180,10);x.fillStyle='#f2efe6';x.fillRect(24,20,w-48,h-48);x.fillStyle='#2f4358';x.fillRect(30,26,w-60,h-60);x.fillStyle='#f2efe6';x.fillRect(w/2-2,26,4,h-60);x.fillStyle='rgba(0,0,0,.12)';x.fillRect(0,h-6,w,6)})},
 ware:{bay:6,fl:4.5,roof:0x8a9096,tex:canvasTex(128,128,(x,w,h)=>{x.fillStyle='#a6adb2';x.fillRect(0,0,w,h);for(let i=0;i<w;i+=8){x.fillStyle=i%16?'rgba(255,255,255,.18)':'rgba(0,0,0,.16)';x.fillRect(i,0,4,h)}x.fillStyle='#38424b';x.fillRect(0,18,w,16);x.fillStyle='rgba(255,255,255,.2)';x.fillRect(0,18,w,3)})},
 ctrl:{bay:4,fl:3.5,roof:0x55585d,tex:canvasTex(128,128,(x,w,h)=>{speckle(x,w,h,176,176,170,16);x.fillStyle='#22313f';x.fillRect(18,34,w-36,22);x.fillStyle='rgba(0,0,0,.18)';x.fillRect(0,h-8,w,8)})}};
const fmat={};
function facade(type,rx,ry,dbl){const k=type+rx+'x'+ry+(dbl?'d':'');if(!fmat[k]){const t=FT[type].tex.clone();t.repeat.set(rx,ry);t.needsUpdate=true;fmat[k]=M(0xffffff,{map:t,roughness:.75,metalness:.05,side:dbl?THREE.DoubleSide:THREE.FrontSide})}return fmat[k]}
/* large landmark box (VAB etc.) with a single stretched facade */
function bigBox(w,h,d,x,z,tex){const s=M(0xffffff,{map:tex,roughness:.7}),r=M(0x777a7e,{roughness:.8}),b=add(new THREE.BoxGeometry(w,h,d),[s,s,r,r,s,s],x,h/2,z);walls.push([x-w/2,x+w/2,z-d/2,z+d/2]);rsv(x,z,w,d);return b}
/* generic building: windows tile per bay/floor so nothing is stretched */
function bld(type,x,z,w,d,h){const T=FT[type],near=Math.hypot(x,z)<250,rx=Math.max(1,Math.round(w/T.bay)),rz=Math.max(1,Math.round(d/T.bay)),ry=Math.max(1,Math.round(h/T.fl));
 const mx=facade(type,rz,ry),mz=facade(type,rx,ry),mr=M(T.roof,{roughness:.9});
 add(new THREE.BoxGeometry(w,h,d),[mx,mx,mr,mr,mz,mz],x,h/2,z,world,near);
 if(type==='dorm'){const rh=Math.min(w,d)*.32,g=new THREE.ConeGeometry(1,rh,4);g.rotateY(Math.PI/4);const r=add(g,mr,x,h+rh/2,z,world,near);r.scale.set((w/2+.5)*1.4142,1,(d/2+.5)*1.4142)}
 else if(type==='ware'){const s=new THREE.Shape();s.moveTo(-w/2-.3,0);s.lineTo(w/2+.3,0);s.lineTo(0,2.4);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:d+.6,bevelEnabled:false});g.translate(0,0,-(d+.6)/2);add(g,mr,x,h,z,world,near)}
 else{const n=1+Math.floor(sr()*3);for(let i=0;i<n;i++)B(sR(2,4),sR(1,1.8),sR(2,3.4),mGray,x+sR(-w*.3,w*.3),h+.7,z+sR(-d*.3,d*.3),world,false);
  if(type==='office'&&h>26){CY(.12,.2,12,mGray,x+w*.25,h+6,z,world,6);glow(x+w*.25,h+12.3,z,5,0xff2020,.8)}}
 B(w>10?3:1.8,2.6,.25,mDark,x,1.3,z+d/2+.05,world,false);
 walls.push([x-w/2,x+w/2,z-d/2,z+d/2]);rsv(x,z,w,d)}
function hangar(x,z,w,d){const r=w/2,k=.62,T=FT.ware,mat=facade('ware',Math.max(2,Math.round(Math.PI*r/T.bay)),Math.max(1,Math.round(d/T.fl)),true),near=Math.hypot(x,z)<250;
 const g=new THREE.CylinderGeometry(r,r,d,28,1,true,Math.PI/2,Math.PI);g.rotateX(Math.PI/2);add(g,mat,x,0,z,world,near).scale.y=k;
 const e=new THREE.CircleGeometry(r,28,0,Math.PI),em=M(0x7c838a,{roughness:.8,side:THREE.DoubleSide});
 for(const s of[-1,1])add(e,em,x,0,z+s*d/2,world,false).scale.y=k;
 B(w*.5,r*k*.7,.3,mDark,x,r*k*.35,z+d/2+.05,world,false);
 walls.push([x-r,x+r,z-d/2,z+d/2]);rsv(x,z,w,d)}

/* --- landmarks (moved clear of the fence; old ones straddled it) --- */
/* HMSA facade: cream ribbed walls, brown bands, tall navy HMSA logo ellipse, big dark slatted door.
   Drawn in world units (u) so the logo keeps its true proportions on any building size. */
function hmsaFacade(W,Hh,logoRX,logoRY,doorW,doorH,bands){return canvasTex(512,512,(x,w,h)=>{const sx=w/W,sy=h/Hh;
 speckle(x,w,h,226,219,203,9);x.strokeStyle='rgba(130,120,105,.38)';x.lineWidth=1.2;for(let i=0;i<w;i+=Math.max(4,sx*.9)){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke()}
 for(const b of bands){x.fillStyle='#6d6155';x.fillRect(0,b[0]*sy,w,b[1]*sy);x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,(b[0]+b[1])*sy-2,w,2)}
 const dx=w*.56,dw=doorW*sx,dy=h-doorH*sy;x.fillStyle='#1b1613';x.fillRect(dx,dy,dw,h-dy);x.strokeStyle='#4a3f37';x.lineWidth=3;for(let y=dy+doorH*sy/7;y<h-2;y+=doorH*sy/7){x.beginPath();x.moveTo(dx,y);x.lineTo(dx+dw,y);x.stroke()}
 /* the HMSA badge, copied from the Sol 4 / Sol 6 message logo (.lg): rounded navy->purple plate, amber border, HM amber + SA cyan, two name lines */
 {const BW=logoRX*2,BH=logoRY*2,K=Math.min(BW*sx/320,BH*sy/112);x.save();x.translate(w*.22-BW*sx/2,h*.1-BH*sy/2);x.scale(BW*sx/320,BH*sy/112);
 const rr=(X,Y,Wd,Ht,r)=>{x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+Wd,Y,X+Wd,Y+Ht,r);x.arcTo(X+Wd,Y+Ht,X,Y+Ht,r);x.arcTo(X,Y+Ht,X,Y,r);x.arcTo(X,Y,X+Wd,Y,r);x.closePath()};
 rr(3,3,314,106,22);const gr=x.createLinearGradient(0,0,320,112);gr.addColorStop(0,'#0a1630');gr.addColorStop(.55,'#17315f');gr.addColorStop(1,'#3a1d3f');x.fillStyle=gr;x.fill();x.lineWidth=5;x.strokeStyle='#ffb347';x.stroke();
 x.textBaseline='middle';x.textAlign='left';const F="'Segoe UI',Arial,sans-serif";
 x.font='900 46px '+F;try{x.letterSpacing='5px'}catch(e){}x.shadowBlur=10;x.shadowColor='rgba(255,179,71,.65)';x.fillStyle='#ffb347';x.fillText('HM',20,34);
 x.shadowColor='rgba(93,230,255,.6)';x.fillStyle='#5de6ff';x.fillText('SA',20,78);x.shadowBlur=0;
 x.fillStyle='rgba(255,179,71,.75)';x.fillRect(106,14,3,40);x.fillStyle='rgba(93,230,255,.75)';x.fillRect(106,58,3,40);
 x.font='700 19px '+F;try{x.letterSpacing='2.5px'}catch(e){}x.fillStyle='#f2f5fa';x.fillText('Huraira Meerab',118,34);x.fillStyle='#bfe8ff';x.fillText('Space Agency',118,78);
 x.restore()}})}
const vabTex=hmsaFacade(72,98,11,3.85,24,40,[[18,6],[34,6],[50,6]]);
bigBox(72,98,66,150,-130,vabTex);
bigBox(58,34,44,-145,-110,hmsaFacade(58,34,7,2.45,20,20,[[8,3],[18,3]]));
{const s=new THREE.Shape();s.moveTo(-18,0);s.lineTo(18,0);s.lineTo(0,10);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:60,bevelEnabled:false});g.translate(0,0,-30);add(g,M(0x777a7e,{roughness:.8}),-140,22,150)}
bigBox(36,22,60,-140,150,rep(winTex,2,1));
for(let i=0;i<3;i++){CY(4,4,16,mWhite,-75+i*10,8,-62);add(new THREE.SphereGeometry(4,16,8,0,6.283,0,1.57),mWhite,-75+i*10,16,-62)}
walls.push([-79.5,-50.5,-66.5,-57.5]);
{bigBox(5,3.2,5,13,98,rep(winTex,1,1));
 const sc=canvasTex(512,128,(x,w,h)=>{x.fillStyle='#14305c';x.fillRect(0,0,w,h);x.strokeStyle='#fff';x.lineWidth=6;x.strokeRect(6,6,w-12,h-12);x.fillStyle='#fff';x.font='bold 44px Arial';x.textAlign='center';x.fillText('LAUNCH COMPLEX 7',w/2,58);x.font='24px Arial';x.fillText('AUTHORIZED PERSONNEL ONLY',w/2,100)},1,1,true);
 B(.2,3,.2,mGray,-14,1.5,95);B(.2,3,.2,mGray,-8,1.5,95);add(new THREE.PlaneGeometry(6,1.5),new THREE.MeshBasicMaterial({map:sc,color:0xbbbbbb}),-11,2.2,95.05,world,false)}

/* --- support buildings inside the fence (hand-placed, checked against tanks/silos/mound) --- */
bld('office',70,78,26,16,18);bld('dorm',-80,82,20,14,12);bld('ctrl',-52,82,14,10,7);
bld('ware',62,-80,26,16,9);bld('ctrl',87,-70,18,12,8);bld('office',-88,-84,16,12,10);
bld('ctrl',-30,-82,12,9,6);bld('ware',30,-84,22,14,9);bld('office',78,-20,20,14,10);
bld('ware',-80,-30,26,20,10);bld('dorm',-82,2,16,14,10);

/* --- town strip along the access road --- */
for(const side of[-1,1]){let z=side<0?205:132;while(z<600){const type=sr()<.55?'dorm':'office',w=Math.round(sR(14,22)),d=Math.round(sR(13,19)),h=type==='dorm'?Math.round(sR(9,16)):Math.round(sR(14,34)),x=side*(26+w/2);
 if(clear(x,z+d/2,w,d,4))bld(type,x,z+d/2,w,d,h);z+=d+sR(8,16)}}

/* --- fill the rest of the environment: industrial / hangars / offices, no overlaps --- */
{const kinds=['ware','ware','ware','office','office','dorm','dorm','ctrl','hangar','hangar'];let n=0;
 for(let att=0;n<80&&att<4000;att++){const a=sr()*6.2832,r=sR(125,480),x=Math.cos(a)*r,z=Math.sin(a)*r;if(x>400||z>640||z<-440)continue;
  const k=kinds[Math.floor(sr()*kinds.length)];let w,d,h;
  if(k==='ware'){w=sR(26,56);d=sR(20,34);h=sR(8,12)}else if(k==='office'){w=sR(16,30);d=sR(14,24);h=sR(16,42)}else if(k==='dorm'){w=sR(14,24);d=sR(12,16);h=sR(9,18)}else if(k==='ctrl'){w=sR(10,18);d=sR(8,14);h=sR(5,9)}else{w=sR(26,40);d=sR(36,56);h=0}
  w=Math.round(w);d=Math.round(d);h=Math.round(h);
  if(!clear(x,z,w,d,10))continue;
  if(k==='hangar')hangar(x,z,w,d);else bld(k,x,z,w,d,h);n++}}

/* fence */
const posts=[];
function fence(x0,z0,x1,z1){const L=Math.hypot(x1-x0,z1-z0),a=Math.atan2(z1-z0,x1-x0),t=rep(fenceTex,L/2.4,1);
 const p=new THREE.Mesh(new THREE.PlaneGeometry(L,2.6),new THREE.MeshBasicMaterial({map:t,transparent:true,alphaTest:.4,side:THREE.DoubleSide,color:0x70757a}));p.position.set((x0+x1)/2,1.5,(z0+z1)/2);p.rotation.y=-a;world.add(p);
 const w=new THREE.Mesh(new THREE.BoxGeometry(L,.07,.07),new THREE.MeshBasicMaterial({color:0x303236}));w.position.set((x0+x1)/2,3,(z0+z1)/2);w.rotation.y=-a;world.add(w);
 for(let d=0;d<=L;d+=4)posts.push([x0+Math.cos(a)*d,z0+Math.sin(a)*d]);
 const e=.3;walls.push([Math.min(x0,x1)-e,Math.max(x0,x1)+e,Math.min(z0,z1)-e,Math.max(z0,z1)+e])}
fence(-100,100,-9,100);fence(9,100,100,100);fence(-100,-100,100,-100);fence(-100,-100,-100,100);fence(100,-100,100,100);
{const im=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.07,3.1,6),mGray,posts.length),m=new THREE.Matrix4();posts.forEach((p,i)=>{m.makeTranslation(p[0],1.55,p[1]);im.setMatrixAt(i,m)});world.add(im)}

/* ================= MOUNTAINS + TREES ================= */
const terrainMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,transparent:true});
{const cG=new THREE.Color().setRGB(.10,.13,.045),cD=new THREE.Color().setRGB(.17,.15,.075),cF=new THREE.Color().setRGB(.03,.065,.028),cR=new THREE.Color().setRGB(.21,.18,.155),cK=new THREE.Color().setRGB(.10,.09,.085),cS=new THREE.Color().setRGB(.80,.82,.86),cT=new THREE.Color();
 function tcol(x,z,y,ny){const n=fb2(x/110,z/110,3),n2=vn2(x/26,z/26),sl=1-ny;
  cT.copy(cG).lerp(cD,sstep(.35,.7,n));
  cT.lerp(cF,clamp(1-y/650,0,1)*sstep(.25,.6,n2)*(1-sstep(.25,.5,sl)));
  cT.lerp(n2>.5?cR:cK,clamp(sstep(.22,.5,sl)+sstep(600,950,y+n*160),0,1));
  cT.lerp(cS,sstep(1000,1250,y+n*260)*(1-sstep(.55,.8,sl)*.6));return cT}
 const NA=360,NR=130,R0=1300,R1=15000,cnt=NA*(NR+1),pos=new Float32Array(cnt*3),col=new Float32Array(cnt*3),H=new Float32Array(cnt),idx=new Uint32Array(NA*NR*6);
 for(let i=0;i<=NR;i++){const r=R0+(R1-R0)*Math.pow(i/NR,1.7);for(let j=0;j<NA;j++){const a=j/NA*6.28319,x=Math.cos(a)*r,z=Math.sin(a)*r,k=i*NA+j,h=heightAt(x,z);H[k]=h;pos[k*3]=x;pos[k*3+1]=h-2;pos[k*3+2]=z}}
 let q=0;for(let i=0;i<NR;i++)for(let j=0;j<NA;j++){const a=i*NA+j,b=i*NA+(j+1)%NA,c=(i+1)*NA+j,d=(i+1)*NA+(j+1)%NA;idx[q++]=a;idx[q++]=b;idx[q++]=c;idx[q++]=b;idx[q++]=d;idx[q++]=c}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(new THREE.BufferAttribute(idx,1));g.computeVertexNormals();
 const nr=g.attributes.normal;for(let k=0;k<cnt;k++){const c=tcol(pos[k*3],pos[k*3+2],H[k],nr.getY(k));col[k*3]=c.r;col[k*3+1]=c.g;col[k*3+2]=c.b}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));
 const terrain=new THREE.Mesh(g,terrainMat);terrain.frustumCulled=false;terrain.renderOrder=-4;world.add(terrain)}
/* forests: foothills and slopes up to the tree line, never inside a building footprint */
{const geo=new THREE.ConeGeometry(2.6,10,6);geo.translate(0,5.5,0);const N=1800,im=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({roughness:1}),N),m=new THREE.Matrix4(),c=new THREE.Color();let n=0,tries=0;
 while(n<N&&tries++<40000){const a=rnd(0,6.283),r=150+Math.pow(Math.random(),.8)*3300,x=Math.cos(a)*r,z=Math.sin(a)*r;if(x>440||(Math.abs(x)<22&&z>0))continue;
  if(FP.some(f=>x>f[0]-5&&x<f[1]+5&&z>f[2]-5&&z<f[3]+5))continue;
  const hy=heightAt(x,z);if(hy>650)continue;const s=rnd(.8,1.9)*(r>1500?2.4:1);
  m.compose(new V3(x,Math.max(-.5,hy-2),z),new THREE.Quaternion(),new V3(s,s*rnd(.9,1.4),s));im.setMatrixAt(n,m);im.setColorAt(n,c.setHSL(rnd(.25,.33),rnd(.3,.5),rnd(.1,.18)));n++}
 im.count=n;world.userData.trees=im;world.add(im)}

/* player collision */
walls.push([TX-3,TX+3,-3,3],[40,48,-38,-30],[-60,-40,-60,-10],[46,78,10,56],[-74,-36,19,57],[-40.5,-18.5,35.5,40.5]);

/* ================= ROCKET ================= */
const RR=1.85,rocket=new THREE.Group();rocket.position.set(0,3.2,0);scene.add(rocket);
const mHull=M(0xffffff,{map:stageTex(12,'ORBITAL',true),roughness:.4,metalness:.3}),mHull2=M(0xffffff,{map:stageTex(5,'',false),roughness:.4,metalness:.3}),mBlack=M(0xffffff,{map:blackTex,roughness:.5,metalness:.5});
const bellMat=new THREE.MeshStandardMaterial({color:0x303236,roughness:.4,metalness:.9,side:THREE.DoubleSide,emissive:0xff6a1a,emissiveIntensity:0});
function cyl(m,r,h,y,rotY=0,seg=64){const o=add(new THREE.CylinderGeometry(r,r,h,seg),m,0,y,0,rocket);o.rotation.y=rotY;return o}
cyl(mBlack,RR*.96,1,3.5);cyl(mHull,RR,38,23,Math.PI);cyl(mBlack,RR+.03,4,44);cyl(mHull2,RR,12,52,Math.PI);
{const pts=[];for(let i=0;i<=30;i++){const t=i/30;pts.push(new THREE.Vector2(Math.max(RR*Math.pow(1-Math.pow(t,2.1),.62),.001),t*12))}
 const f=add(new THREE.LatheGeometry(pts,64),new THREE.MeshStandardMaterial({map:stageTex(2,'',false),roughness:.35,metalness:.3,side:THREE.DoubleSide}),0,58,0,rocket);f.rotation.y=Math.PI}
for(const y of[4.05,42,46,58]){const t=add(new THREE.TorusGeometry(RR+.03,.06,6,64),mDark,0,y,0,rocket,false);t.rotation.x=Math.PI/2}
{const bp=[];[[.15,3.],[.18,2.7],[.30,2.],[.42,1.2],[.52,.5],[.58,0]].forEach(p=>bp.push(new THREE.Vector2(p[0],p[1])));const bg=new THREE.LatheGeometry(bp,20);
 for(let i=0;i<9;i++){const a=i*Math.PI/4,r=i?1.15:0;add(bg,bellMat,Math.sin(a)*r,0,Math.cos(a)*r,rocket,false);if(i)CY(.12,.12,.8,mDark,Math.sin(a)*r,3.1,Math.cos(a)*r,rocket,8)}}
for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2,fin=new THREE.Mesh(new THREE.PlaneGeometry(1.7,2),new THREE.MeshStandardMaterial({map:gridTex,alphaTest:.5,side:THREE.DoubleSide,roughness:.5,metalness:.7,color:0x555a60}));
 fin.position.set(Math.sin(a)*(RR+.15),41,Math.cos(a)*(RR+.15));fin.rotation.y=a;rocket.add(fin);
 const lg=B(.35,9,.9,mDark,Math.sin(k*Math.PI/2)*(RR+.3),9.5,Math.cos(k*Math.PI/2)*(RR+.3),rocket);lg.rotation.y=k*Math.PI/2;
 const hg=B(.5,.6,.6,mGray,Math.sin(k*Math.PI/2)*(RR+.2),5.2,Math.cos(k*Math.PI/2)*(RR+.2),rocket);hg.rotation.y=k*Math.PI/2}
{const a=2.2,rc=B(.35,37,.5,mGray,Math.sin(a)*(RR+.12),23,Math.cos(a)*(RR+.12),rocket);rc.rotation.y=a;
 for(const[y,aa]of[[40,.4],[44.5,1.9],[56,3.6],[50,5.2]]){const v=CY(.08,.08,2,mGray,Math.sin(aa)*(RR+.1),y,Math.cos(aa)*(RR+.1),rocket,8)}}

/* exhaust */
const flameMat=(core)=>new THREE.ShaderMaterial({uniforms:{uT:{value:0},uI:{value:0},uC:{value:core}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
 vertexShader:`varying vec2 vUv;varying vec3 vNo,vVi;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vNo=normalMatrix*normal;vVi=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
 fragmentShader:`uniform float uT,uI,uC;varying vec2 vUv;varying vec3 vNo,vVi;${NOISE}
void main(){float a=1.-vUv.y;float n=vn(vec3(vUv.x*14.,a*7.-uT*16.,uT*2.))*.6+vn(vec3(vUv.x*30.,a*16.-uT*28.,3.))*.4;
float fr=pow(abs(dot(normalize(vNo),normalize(vVi))),1.4);float body=pow(1.-a,1.6)*(.55+.9*n);
vec3 hot=mix(vec3(1.,.97,.85),vec3(1.,.62,.2),smoothstep(0.,.45,a));hot=mix(hot,vec3(.9,.25,.06),smoothstep(.45,1.,a));hot=mix(hot,vec3(.75,.85,1.),uC*(1.-smoothstep(0.,.5,a)));
gl_FragColor=vec4(hot*1.6,body*fr*uI);}`});
const plume=new THREE.Group();rocket.add(plume);const fg=new THREE.CylinderGeometry(1.9,.25,1,24,10,true);fg.translate(0,-.5,0);
const fOut=new THREE.Mesh(fg,flameMat(0)),fIn=new THREE.Mesh(fg,flameMat(1)),fHalo=new THREE.Mesh(fg,flameMat(0));fHalo.material.uniforms.uT.value=3;
for(const f of[fOut,fIn,fHalo]){f.frustumCulled=false;plume.add(f)}
const glare=glow(0,-1.5,0,30,0xffb060,0,rocket);glare.material.depthTest=false;
const pLight=new THREE.PointLight(0xff9a4a,0,0,2);pLight.position.set(0,-3,0);rocket.add(pLight);
/* ---- NEW: exhaust control shared with mars.js (same visuals the launch cutscene drives) ---- */
function setExhaust(th,vac,dens){const T=performance.now()/1000;
 const L=(26+10*vac)*th,sx=(1+2.4*vac)*(.6+.4*th),I=th*(.55+.45*dens)+.15*vac*th;plume.visible=th>.01;
 fOut.scale.set(sx,L,sx);fOut.material.uniforms.uI.value=I;fOut.material.uniforms.uT.value=T;
 fIn.scale.set(sx*.45,L*.6,sx*.45);fIn.material.uniforms.uI.value=I*1.2;fIn.material.uniforms.uT.value=T+1;
 fHalo.scale.set(sx*1.9,L*1.5,sx*1.9);fHalo.material.uniforms.uI.value=I*.22;fHalo.material.uniforms.uT.value=T*.7;
 pLight.intensity=2600*th*(.35+.65*dens)*(.85+.3*Math.random());glare.scale.setScalar(14+34*th);glare.material.opacity=th*(.35+.6*dens);bellMat.emissiveIntensity=th*1.4}
const mars=new MarsPhase({renderer,rocket,exhaust:setExhaust});
window.__gfx={renderer,lights:()=>[sun,mars.sun]};window.SolSettings&&SolSettings.applyRender();   /* settings menu: rendering quality hook */

/* ================= GAME STATE ================= */
const st={mode:'play',cs:0,lift:false,v:0,A:0,pitch:0,n:-1,go:false,si:-2,shot:'',snap:true,telT:0,cstr:'',fired:{},t0:0};
const pl={x:0,z:70,yaw:0,pitch:.1,walked:0},keys={};
const pPos=new V3(),pLook=new V3(),lookS=new V3();let prevPos=new V3(0,3.2,0);
/* ---- 35 s master timeline (seconds since the cutscene started) ----
   0-10  countdown 10..1 + engine ignition (T-00:10 .. T+00:00)
   10-22 liftoff, atmosphere ascent, both cloud layers
   22-35 Karman line, orbital speed, Earth reveal, recap, fade to black (all subtitles end before FADE_AT) */
const CUT_LEN=35,FADE_AT=33.2;
const SUBS=[
 [.4,5.4,'NASA FACT','Shuttle main engines start about 7 seconds before liftoff; at T-0 the solid boosters ignite.'],
 [6.0,10.2,'NASA FACT','The pad’s 290-ft water tower holds 300,000 gallons and empties in 41 s to absorb damaging engine sound.'],
 [11.0,16.2,'NASA FACT','About 11 s after liftoff the Shuttle rolls heads-up, then pitches toward orbit. Reaching space means going sideways.'],
 [16.8,20.6,'NASA FACT','Max-Q: peak aerodynamic pressure, about T+1:00. The engines throttle down to ~70% beforehand.'],
 [21.2,25.0,'MISSION DATA · NASA','Solid boosters separate about 2 minutes in. Space begins at 100 km, the Kármán line.'],
 [26.0,29.8,'MISSION DATA · NASA','Orbit needs ≈7.85 km/s (17,500 mph). The Shuttle took 8.5 minutes; here time is compressed.'],
 [30.3,33.0,'NASA FACT','The ISS orbits about 400 km up, circling the Earth every 90 minutes.']];
function caption(t){const c=$('cap');c.textContent=t;c.style.opacity=1;clearTimeout(caption.t);caption.t=setTimeout(()=>c.style.opacity=0,2400)}
/* walk-phase subtitles use a small timed queue; the cutscene uses the SUBS timeline above */
const subQ=[];let subBusy=false,subTimer=0;
function sub(text,tag='NASA FACT'){subQ.push([text,tag]);pumpSub()}
function pumpSub(){if(subBusy||!subQ.length||st.mode!=='play')return;subBusy=true;const[t,g]=subQ.shift();$('subt').textContent=t;$('subg').textContent=g;$('sub').style.opacity=1;
 subTimer=setTimeout(()=>{$('sub').style.opacity=0;subTimer=setTimeout(()=>{subBusy=false;pumpSub()},600)},Math.max(5200,t.length*52))}
function killSubs(){subQ.length=0;clearTimeout(subTimer);subBusy=false;$('sub').style.opacity=0}
/* audio */
let AC,rg;function audioInit(){if(AC)return;try{AC=new AudioContext();const b=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate),d=b.getChannelData(0);let l=0;for(let i=0;i<d.length;i++){l=(l+(Math.random()*2-1)*.04)*.985;d[i]=l*4}
 const s=AC.createBufferSource();s.buffer=b;s.loop=true;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=260;rg=AC.createGain();rg.gain.value=0;s.connect(f);f.connect(rg);rg.connect(AC.destination);s.start()}catch(e){}}
function beep(f,d){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;g.gain.value=.08;g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+d);o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+d)}
addEventListener('keydown',e=>{keys[e.code]=true;audioInit();if(e.code==='KeyR'&&st.mode==='end')location.reload()});addEventListener('keyup',e=>keys[e.code]=false);
renderer.domElement.addEventListener('click',()=>renderer.domElement.requestPointerLock&&renderer.domElement.requestPointerLock());
document.addEventListener('mousemove',e=>{if(document.pointerLockElement&&st.mode==='play'){pl.yaw=clamp(pl.yaw-e.movementX*.0022,-1.2,1.2);pl.pitch=clamp(pl.pitch-e.movementY*.0022,-1.2,1.2)}});
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()});
const gl=renderer.getContext(),maxPt=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];smoke.m.uniforms.uMax.value=cloudPS.m.uniforms.uMax.value=Math.min(maxPt,512);

/* ================= PLAY PHASE ================= */
/* painted guide arrows along the road toward the rocket (pulse in sequence) + idle auto-start */
const arrowTex=canvasTex(128,256,(x,w,h)=>{x.clearRect(0,0,w,h);x.fillStyle='#f2f0e6';x.beginPath();x.moveTo(w/2,8);x.lineTo(w-14,h*.52);x.lineTo(w*.68,h*.52);x.lineTo(w*.68,h-10);x.lineTo(w*.32,h-10);x.lineTo(w*.32,h*.52);x.lineTo(14,h*.52);x.closePath();x.fill()},1,1,true);
const arrows=[];for(let z=104,i=0;z>=14;z-=10,i++){const m=new THREE.MeshBasicMaterial({map:arrowTex,transparent:true,opacity:.5,depthWrite:false,fog:true,toneMapped:false});m.polygonOffset=true;m.polygonOffsetFactor=-6;m.polygonOffsetUnits=-6;
 const a=new THREE.Mesh(new THREE.PlaneGeometry(2.2,4.4),m);a.rotation.x=-Math.PI/2;a.position.set(0,z>45?-.16:-.3,z);a.renderOrder=3;world.add(a);arrows.push(a)}
let lastIn=performance.now();for(const ev of['keydown','mousemove','mousedown'])addEventListener(ev,()=>{lastIn=performance.now()});
function updatePlay(dt){
 setFov(72);
 {const T=performance.now()/1000;arrows.forEach((a,i)=>{a.material.opacity=.25+.65*Math.pow(Math.max(0,Math.sin(T*3.2+i*.7)),2)});
  if(performance.now()-lastIn>120000){lastIn=performance.now();pl.x=0;pl.z=9;pl.yaw=0;pl.pitch=.1;cam.position.set(0,1.75,9);cam.rotation.set(.1,0,0);arrows.forEach(a=>a.visible=false);startCut();return}}
 const f=new V3(-Math.sin(pl.yaw),0,-Math.cos(pl.yaw)),r=new V3(Math.cos(pl.yaw),0,-Math.sin(pl.yaw));let mx=0,mz=0;
 if(keys.KeyW){mx+=f.x;mz+=f.z}
 
 const l=Math.hypot(mx,mz);if(l>0){const s=9*dt/l,rad=.85;for(const[px,pz]of[[mx*s,0],[0,mz*s]]){const nx=pl.x+px,nz=pl.z+pz;if(!walls.some(w=>nx>w[0]-rad&&nx<w[1]+rad&&nz>w[2]-rad&&nz<w[3]+rad)){pl.walked+=Math.hypot(px,pz);pl.x=clamp(nx,-5.4,5.4);pl.z=clamp(nz,-440,640)}}}
 const bob=l>0?Math.sin(pl.walked*2.2)*.06:0;cam.position.set(pl.x,1.75+bob,pl.z);cam.rotation.set(pl.pitch,pl.yaw,0);
 window.SolMusic&&SolMusic.walk&&SolMusic.walk(pl.x,pl.z,dt,'pad');
 if(pl.walked>6)$('prompt').style.opacity=0;
 if(pl.walked>5&&!st.f0){st.f0=1;sub('Space officially begins 100 km (62 miles) above sea level, a boundary called the Kármán line.')}
 if(pl.walked>30&&!st.f1){st.f1=1;sub('The Space Shuttle stack stood about 56 m tall and used its engines and boosters for roughly 8.5 minutes to reach orbit.')}
 if(Math.hypot(pl.x,pl.z)<7.2)startCut()}
function startCut(){arrows.forEach(a=>a.visible=false);window.SolMusic&&SolMusic.mode('launch');window.SolVolWarn&&SolVolWarn.show('lower');killSubs();st.mode='cut';st.t0=performance.now();pPos.copy(cam.position);pLook.copy(cam.position).add(new V3(-Math.sin(pl.yaw)*Math.cos(pl.pitch),Math.sin(pl.pitch),-Math.cos(pl.yaw)*Math.cos(pl.pitch)).multiplyScalar(60));lookS.copy(pLook);
 $('prompt').style.opacity=0;$('clock').style.opacity=1;$('tel').style.opacity=1;caption('TERMINAL COUNT')}

/* ================= CUTSCENE ================= */
const _p=new V3(),_l=new V3(),_d=new V3(),_sd=new V3(),_t=new V3(),_e=new V3(),_w=new V3(0,0,1);
let curFov=60;function setFov(f){if(Math.abs(f-curFov)>.02){curFov=f;cam.fov=f;cam.updateProjectionMatrix()}}
function setCount(t,go){const c=$('count');c.className='';void c.offsetWidth;c.textContent=t;c.className=go?'go':'p'}
const ease=sstep;

/* ---- deterministic ascent: integrate the climb once, then sample it by flight time (frame-rate independent) ---- */
const TRAJ=(()=>{const N=8600,T1=172,dT=T1/N,X=new Float32Array(N+1),Y=new Float32Array(N+1),V=new Float32Array(N+1),Pt=new Float32Array(N+1);
 const pit=T=>{const p=T<20?0:.7*(1-Math.exp(-(T-20)/45));return p+(1.25-p)*sstep(120,172,T)};
 let x=0,y=0,v=0;for(let i=1;i<=N;i++){const T=(i-1)*dT;v=Math.min(v+(2.6+.75*T)*dT,T<141?7900:8150);const p=pit(T);x+=Math.sin(p)*v*dT;y+=Math.cos(p)*v*dT;X[i]=x;Y[i]=y;V[i]=v;Pt[i]=pit(i*dT)}
 return{N,dT,X,Y,V,Pt}})();
function trajAt(T,o){const f=clamp(T/TRAJ.dT,0,TRAJ.N-1e-6),i=f|0,k=f-i;o.x=lerp(TRAJ.X[i],TRAJ.X[i+1],k);o.y=lerp(TRAJ.Y[i],TRAJ.Y[i+1],k);o.v=lerp(TRAJ.V[i],TRAJ.V[i+1],k);o.p=lerp(TRAJ.Pt[i],TRAJ.Pt[i+1],k)}
/* real flight time u (s since liftoff) -> simulated ascent time. Gentler than before: peak time-compression ~12x (was ~16x) and nearly real-time once in orbit. Clouds u 7-10, Karman u 14.3, orbital speed u 19.5, end u 25 */
const TSP=[[0,0],[2.5,2.5],[4.8,7.3],[7.2,22],[9.6,38],[12.8,75],[17,128],[21,146],[25,152]];
const TSM=(()=>{const n=TSP.length,d=[],m=[];for(let i=0;i<n-1;i++)d.push((TSP[i+1][1]-TSP[i][1])/(TSP[i+1][0]-TSP[i][0]));m[0]=d[0];m[n-1]=d[n-2];
 for(let i=1;i<n-1;i++)m[i]=d[i-1]*d[i]<=0?0:2*d[i-1]*d[i]/(d[i-1]+d[i]);
 for(let i=0;i<n-1;i++){const a=m[i]/d[i],b=m[i+1]/d[i],s=a*a+b*b;if(s>9){const t=3/Math.sqrt(s);m[i]=t*a*d[i];m[i+1]=t*b*d[i]}}return m})();
function tsOf(u){u=clamp(u,0,TSP[TSP.length-1][0]);let i=0;while(i<TSP.length-2&&u>TSP[i+1][0])i++;
 const a=TSP[i],b=TSP[i+1],h=b[0]-a[0],t=(u-a[0])/h,t2=t*t,t3=t2*t;
 return(2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*h*TSM[i]+(-2*t3+3*t2)*b[1]+(t3-t2)*h*TSM[i+1]}

/* ---- cinematography (all shots are pure functions of the rocket state, so cuts are clean) ----
   A  launch: wide low-angle ground camera, tilts up with the rocket      (to u=4.6)
   B  ascent: overhead rig above the nose, looking down at flame + ground (u 4.6-8.6, passes cloud layer 1)
   C  atmosphere: side chase parallel to the velocity vector              (u 8.6-12.4, cloud layer 2)
   D  space: orbit sweep, pulls back exponentially to reveal the planet   (u 12.4-25)                         */
const SHOT_B=4.8,SHOT_C=9.0,SHOT_D=12.8,U_END=25;
function director(dt,cs,tl,th,dens){
 const P=rocket.position,dir=_d,pi=st.pitch;let fov=50;const vol=1-ease(FADE_AT,CUT_LEN,cs);
 _sd.set(Math.cos(pi),-Math.sin(pi),0);
 const shot=!st.lift||tl<SHOT_B?'A':tl<SHOT_C?'B':tl<SHOT_D?'C':'D';
 if(!st.lift&&cs<9.2){const s=cs;
  if(s<5){_p.set(lerp(-30,-24,s/5),2.5,lerp(62,50,s/5));_l.set(2,28+s*.5,0);fov=48}
  else{const u=ease(5,9.2,s);_p.set(lerp(-24,-15,u),lerp(2.5,1.4,u),lerp(50,26,u));_l.set(0,lerp(30,14,u),0);fov=lerp(48,56,u)}
  const b=ease(0,3.5,s);_p.lerpVectors(pPos,_p,b);_l.lerpVectors(pLook,_l,b);fov=lerp(72,fov,b);lookS.copy(_l);st.shot='pre'}
 else{
  if(st.shot!==shot){st.shot=shot;st.snap=true}
  if(shot==='A'){const e=ease(-.8,SHOT_B,tl);
   _p.set(lerp(-46,-42,e),lerp(2,3.2,e),lerp(128,112,e));_t.copy(P).addScaledVector(dir,28);
   if(st.snap){lookS.copy(_t);st.snap=false}else lookS.lerp(_t,1-Math.exp(-5*dt));
   _l.copy(lookS);fov=lerp(58,52,e)}
  else if(shot==='B'){const e=ease(SHOT_B,SHOT_C,tl),ph=lerp(.35,1.9,e);
   _t.copy(_sd).multiplyScalar(Math.cos(ph)).addScaledVector(_w,Math.sin(ph)).multiplyScalar(lerp(22,40,e));
   _p.copy(P).addScaledVector(dir,lerp(90,140,e)).add(_t);_l.copy(P).addScaledVector(dir,lerp(30,-14,e));fov=lerp(60,54,e)}
  else if(shot==='C'){const e=ease(SHOT_C,SHOT_D,tl);
   _p.copy(P).addScaledVector(_w,lerp(125,170,e)).addScaledVector(dir,lerp(-18,25,e));_l.copy(P).addScaledVector(dir,lerp(10,16,e));fov=lerp(44,52,e)}
  else{const e=ease(SHOT_D,U_END,tl),az=lerp(1.5708,2.3,e),Dh=lerp(170,240,e);   /* slow sweep around the rocket while rising above it: Earth stays below, rocket stays in frame */
   _p.set(Math.cos(az)*Dh,150*e,Math.sin(az)*Dh).add(P).addScaledVector(dir,25*(1-e));
   _l.copy(P).addScaledVector(dir,lerp(16,4,e));fov=lerp(52,46,e)}}
 cam.position.copy(_p);setFov(fov);cam.lookAt(_l);
 /* shake */
 const dist=cam.position.distanceTo(P),amp=th*(.9/(1+dist/25))*(.15+.85*dens),n=t=>Math.sin(t*43.1)+.6*Math.sin(t*71.7+1.3)+.8*Math.sin(t*19.3+4.1),T=performance.now()/1000;
 cam.position.x+=n(T)*.1*amp;cam.position.y+=n(T+7)*.1*amp;cam.position.z+=n(T+13)*.08*amp;cam.rotation.x+=n(T+3)*.008*amp;cam.rotation.y+=n(T+5)*.008*amp;cam.rotation.z+=n(T+9)*.012*amp;
 if(rg)rg.gain.value=th*Math.min(1,.15+50/(30+dist))*(.25+.75*dens)*.9*vol}

const acc={vent:0,gb:0,rad:0,col:0,trail:0,steam:0};
function emit(dt,tl,th,A,dens,step,dir){
 const P=rocket.position,sp=(n,fn)=>{while(n.v>=1){n.v--;fn()}};
 if(tl<0&&tl>-10){acc.vent+=dt*26;while(acc.vent>=1){acc.vent--;const a=rnd(0,6.28);smoke.add(Math.cos(a)*1.9,rnd(26,60),Math.sin(a)*1.9,Math.cos(a)*rnd(.5,2),-rnd(2,6),Math.sin(a)*rnd(.5,2),3.5,.8,5,.45,0,.3,-1.5,.95,.97,1)}}
 if(tl>-3&&tl<16&&A<40){acc.steam+=dt*90;while(acc.steam>=1){acc.steam--;const a=rnd(0,6.28),r=rnd(5,12);smoke.add(Math.cos(a)*r,rnd(.5,3),Math.sin(a)*r,Math.cos(a)*rnd(3,10),rnd(10,26),Math.sin(a)*rnd(3,10),5,3,22,.5,.2,.5,0,.95,.96,1)}}
 if(th>.2&&A<260){const k=th*(1-ease(0,200,A));acc.gb+=dt*190*k;acc.rad+=dt*80*k;acc.col+=dt*(A<130?100:0)*k;
  while(acc.gb>=1){acc.gb--;const s=Math.random()<.5?1:-1;smoke.add(s*rnd(4,10),rnd(.5,3),rnd(-4,4),s*rnd(20,60),rnd(2,10),rnd(-10,10),rnd(6,12),rnd(5,9),rnd(30,60),.55,.8,.7,1.2)}
  while(acc.rad>=1){acc.rad--;const a=rnd(0,6.28),v=rnd(10,25);smoke.add(Math.cos(a)*7,rnd(1,3),Math.sin(a)*7,Math.cos(a)*v,rnd(1,6),Math.sin(a)*v,rnd(5,10),rnd(4,8),rnd(25,45),.5,.8,.8,1.5)}
  while(acc.col>=1){acc.col--;smoke.add(rnd(-4,4),rnd(1,4),rnd(-4,4),rnd(-6,6),rnd(8,30),rnd(-6,6),rnd(8,14),rnd(8,12),rnd(40,70),.5,.7,.6,4)}}
 if(th>.2&&dens>.004){acc.trail+=(dt*50+Math.min(step/9,12))*th*Math.sqrt(dens);while(acc.trail>=1){acc.trail--;const b=_e.copy(P).addScaledVector(dir,-rnd(0,step)-1);
  smoke.add(b.x,b.y,b.z,-dir.x*rnd(25,80)+rnd(-4,4),-dir.y*rnd(25,80)+rnd(-4,4),rnd(-4,4),rnd(5,10),rnd(3,5),rnd(9,18),.4*Math.sqrt(dens),.8,.4,0)}}}

const _tr={x:0,y:0,v:0,p:0};
const MILES=[['TOWER CLEARED',()=>st.A>=95],['MAX-Q',()=>st.A>=11000],['ENTERING SPACE',()=>st.A>=1e5],['ORBITAL VELOCITY',()=>st.v>=7800]];
/* free VRAM + draw calls once we are in space: geometry/textures of the pad, buildings, terrain and forests are released.
   Materials are deliberately NOT disposed (the rocket shares some) so no shader ever recompiles mid-flight. */
function releaseGround(){if(st.released)return;
 if(!st.relQ){const kM=new Set(),kG=new Set();rocket.traverse(o=>{if(o.geometry)kG.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>kM.add(m))});
  st.kM=kM;st.kG=kG;st.seen=new Set();st.relQ=[];world.traverse(o=>st.relQ.push(o));st.relI=0}
 const end=Math.min(st.relI+25,st.relQ.length);   /* 25 objects per frame */
 for(;st.relI<end;st.relI++){const o=st.relQ[st.relI];if(o.isInstancedMesh)o.dispose();if(o.geometry&&!st.kG.has(o.geometry))o.geometry.dispose();
  if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material])){if(st.kM.has(m))continue;for(const k of['map','emissiveMap','normalMap','roughnessMap']){const t=m[k];if(t&&!st.seen.has(t)){st.seen.add(t);t.dispose()}}}}
 if(st.relI>=st.relQ.length){st.released=true;scene.remove(world);for(const s of flood)s.intensity=0;st.relQ=null}}
function updateCut(dt){
 const cs=Math.min((performance.now()-st.t0)/1000,CUT_LEN);st.cs=cs;const tl=cs-10;
 if(!st.lift&&tl>=0)st.lift=true;
 let th=tl<-3?0:tl<0?.2+.6*ease(-3,0,tl):1;if(tl<0)th*=.9+.1*Math.random();
 /* countdown HUD */
 if(!st.lift){const n=Math.ceil(-tl);if(n!==st.n){st.n=n;setCount(String(n));beep(880,.1)}}
 else if(!st.go){st.go=true;setCount('LIFTOFF',true);beep(440,.5)}
 const sec=tl<0?Math.ceil(-tl):Math.floor(tl),cstr=`T${tl<0?'-':'+'}${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
 if(cstr!==st.cstr){st.cstr=cstr;$('clock').textContent=cstr}
 /* arms */
 for(const a of arms)a.g.rotation.y=-1.35*ease(a.t0,a.t0+2.2,tl);
 /* physics: position comes straight from the pre-integrated trajectory */
 const dir=_d;let step=0;
 if(!st.lift){rocket.position.set((Math.random()-.5)*.03*th,3.2,(Math.random()-.5)*.03*th);st.A=0;st.v=0;st.pitch=0}
 else{trajAt(tsOf(tl),_tr);prevPos.copy(rocket.position);rocket.position.set(_tr.x,3.2+_tr.y,0);st.A=_tr.y;st.v=_tr.v;st.pitch=_tr.p;rocket.rotation.z=-_tr.p;step=prevPos.distanceTo(rocket.position)}
 dir.set(Math.sin(st.pitch),Math.cos(st.pitch),0);
 const A=st.A,dens=Math.exp(-A/8500),vac=1-dens,T=performance.now()/1000;
 /* captions + subtitle timeline */
 if(cs<2.8&&!st.fired.tc){st.fired.tc=1;caption('TERMINAL COUNT')}
 if(cs>=7&&!st.fired.eng){st.fired.eng=1;caption('MAIN ENGINE START')}
 for(let i=0;i<MILES.length;i++)if(!st.fired['m'+i]&&MILES[i][1]()){st.fired['m'+i]=1;caption(MILES[i][0])}
 let si=-1;for(let i=0;i<SUBS.length;i++)if(cs>=SUBS[i][0]&&cs<SUBS[i][1]){si=i;break}
 if(si!==st.si){st.si=si;if(si<0)$('sub').style.opacity=0;else{$('subt').textContent=SUBS[si][3];$('subg').textContent=SUBS[si][2];$('sub').style.opacity=1}}
 /* exhaust visuals */
 const L=(26+10*vac)*th,sx=(1+2.4*vac)*(.6+.4*th),I=th*(.55+.45*dens)+.15*vac*th;plume.visible=th>.01;
 fOut.scale.set(sx,L,sx);fOut.material.uniforms.uI.value=I;fOut.material.uniforms.uT.value=T;
 fIn.scale.set(sx*.45,L*.6,sx*.45);fIn.material.uniforms.uI.value=I*1.2;fIn.material.uniforms.uT.value=T+1;
 fHalo.scale.set(sx*1.9,L*1.5,sx*1.9);fHalo.material.uniforms.uI.value=I*.22;fHalo.material.uniforms.uT.value=T*.7;
 pLight.intensity=2600*th*(.35+.65*dens)*(.85+.3*Math.random());glare.scale.setScalar(14+34*th);glare.material.opacity=th*(.35+.6*dens);bellMat.emissiveIntensity=th*1.4;
 if(!st.released)tower.userData.beacon.material.opacity=.4+.6*(Math.sin(T*3)>0?1:0);
 emit(dt,tl,th,A,dens,step,dir);
 director(dt,cs,tl,th,dens);
 /* DOM is touched ~11x/s instead of every frame (layout thrash was a stutter source) */
 const now=performance.now();if(now-st.telT>90){st.telT=now;$('tel').innerHTML=`ALT &nbsp;${(A/1000).toFixed(1)} km<br>VEL &nbsp;${Math.round(st.v).toLocaleString()} m/s<br>THRUST ${Math.round(th*100)}%`}
 /* space: stop shadow passes, then release the ground */
 if(cam.position.y>25000)renderer.shadowMap.autoUpdate=false;
 if(A>40000&&!st.released)releaseGround();
 if(cs>=FADE_AT&&!st.fading){st.fading=true;const f=$('fade');f.style.transition=`opacity ${CUT_LEN-FADE_AT}s linear`;f.style.opacity=1;$('clock').style.opacity=0;$('tel').style.opacity=0}
 if(cs>=CUT_LEN){st.mode='mars';if(rg)rg.gain.value=0;mars.begin()}}   /* NEW: was st.mode='end' */

/* ================= PER-FRAME ENVIRONMENT + RENDER ================= */
const _sz=new THREE.Vector2();
function draw(){
 const alt=cam.position.y,a=1-ease(12000,75000,alt);
 /* depth-buffer fix: the ocean/ground/terrain layers sit a few cm apart and z-fought (speckled ocean) once the camera was km away. Push the near plane out with altitude (rocket is always >=60 m from the lens). */
 const nn=clamp(alt*.01,.3,30);if(Math.abs(nn-cam.near)>.08*cam.near){cam.near=nn;cam.updateProjectionMatrix()}
 if(world.userData.trees)world.userData.trees.visible=alt<2500;   /* tiny floating cones when seen from high up */
 skyMat.uniforms.uA.value=a;skyMat.uniforms.uDip.value=Math.acos(R_E/(R_E+Math.max(alt,0)));
 starMat.uniforms.uAl.value=ease(.15,.9,1-a);shell.material.uniforms.uF.value=ease(20000,60000,alt);
 scene.fog.density=FOG0*(1-ease(0,12000,alt));if(!st.released)world.visible=alt<30000;
 groundMat.opacity=terrainMat.opacity=oceanMat.opacity=sandMat.opacity=1-ease(5000,30000,alt);
 earth.visible=alt>3000;shell.visible=alt>20000;cloudPS.o.visible=alt<16000;
 sky.position.copy(cam.position);stars.position.copy(cam.position);
 const sc=renderer.getDrawingBufferSize(_sz).y/(2*Math.tan(MU.degToRad(cam.fov/2)));smoke.m.uniforms.uScale.value=cloudPS.m.uniforms.uScale.value=sc;
 scam.position.copy(cam.position);scam.quaternion.copy(cam.quaternion);scam.fov=cam.fov;scam.aspect=cam.aspect;scam.updateProjectionMatrix();
 renderer.clear();renderer.render(space,scam);renderer.clearDepth();renderer.render(scene,cam)}

/* ================= WARM-UP (runs before the first visible frame, under the black fade) =================
   Everything that is normally toggled by altitude is forced visible once, so every shader is compiled and every
   texture / buffer / shadow map is uploaded now instead of mid-flight. */
async function warmUp(){
 const flags=[world,earth,shell,cloudPS.o,smoke.o,plume];flags.forEach(o=>o.visible=true);
 try{await Promise.all([renderer.compileAsync(space,scam),renderer.compileAsync(scene,cam)])}catch(e){renderer.compile(space,scam);renderer.compile(scene,cam)}
 const p0=cam.position.clone(),f0=cam.fov;
 smoke.add(0,50,0,0,0,0,.05,5,5,.01,0,0,0);cloudPS.flush();
 for(const[y,tgt]of[[2,new V3(0,30,0)],[9000,new V3(300,8000,0)],[26000,EC],[4.2e5,EC],[1.4e7,EC]]){cam.position.set(y>1e5?-3e5:0,y,y>1e5?4e5:60);setFov(60);cam.lookAt(tgt);draw()}
 smoke.update(.1);smoke.update(.1);smoke.o.visible=false;plume.visible=false;
 cam.position.copy(p0);setFov(f0);renderer.shadowMap.autoUpdate=true}

/* ================= MAIN LOOP ================= */
const clk=new THREE.Clock();
function frame(){requestAnimationFrame(frame);if(window.__paused){clk.getDelta();return}
 if(st.mode==='end'){if(!st.blank){st.blank=1;renderer.clear()}return}
 const dt=Math.min(clk.getDelta(),.05);
 if(st.mode==='mars'){mars.update(dt);return}   /* NEW */
 if(st.mode==='play')updatePlay(dt);else if(st.mode==='cut')updateCut(dt);
 smoke.update(dt);draw()}
/* SAVE SYSTEM - CONTINUE: skip the pad scene and the launch cutscene, go straight to the Mars phase under a black screen */
window.__solGo=function(){if(st.mode==='mars')return;st.mode='mars';try{if(rg)rg.gain.value=0}catch(e){}const f=$('fade');f.style.transition='none';f.style.opacity=1;mars.begin()};
warmUp().then(()=>{clk.getDelta();$('fade').style.opacity=0;window.__gameReady=true;frame()});

/* audio plays without waiting for a click */
try{audioInit();}catch(e){}
setInterval(()=>{try{if(AC&&AC.state==='suspended')AC.resume()}catch(e){}},500);