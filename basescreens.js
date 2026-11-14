/* =====================================================================================================
   basescreens.js  -  telemetry simulation + animated canvas screens for the Mars Research Base
   - Sim    : one source of truth for Martian time, weather, dust-storm cycle, power and life support
   - Screen : a canvas texture that redraws at a throttled rate (only when its room is in use)
   ===================================================================================================== */
import * as THREE from 'three';
const clamp=THREE.MathUtils.clamp,TAU=Math.PI*2;
export const RATE=400;                         // Mars seconds per real second  (1 sol ~ 216 s of play)
export const SOL=86400, T0=16*3600+20*60;      // sol length in Mars seconds, landing clock (matches the SOL 1 16:20 panel)
const sst=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
const pad=(n,l=2)=>String(Math.floor(Math.abs(n))).padStart(l,'0');
const C={bg:'#04111a',cy:'#5de6ff',am:'#ffb347',rd:'#ff5a4a',gn:'#7dff9a',dm:'#5f8191',wh:'#e8f4f8'};

/* ---------------------------------------------- simulation ---------------------------------------- */
export class Sim{
 constructor(){this.t0=performance.now();this.s={};this.bat=71;this.last=0;this.hT=0;this.hist={temp:[],pres:[],gen:[],wind:[]};this.tick(0)}
 reset(){this.t0=performance.now();this.bat=71;this.last=0;this.hist={temp:[],pres:[],gen:[],wind:[]};this.tick(0)}
 tick(){
  const el=(performance.now()-this.t0)/1000,dt=Math.max(0,el-this.last);this.last=el;const s=this.s;s.el=el;
  const ms=T0+el*RATE;s.ms=ms;s.sol=1+Math.floor(ms/SOL);s.tod=(ms%SOL)/SOL;s.h=s.tod*24;s.solsEl=(ms-T0)/SOL;if(this.ext){s.sol=this.ext.sol;s.tod=this.ext.tod;s.h=s.tod*24}
  /* dust-storm cycle (240 s): nominal -> advisory -> warning -> clearing */
  const ph=el%240;let L=0,al=0,name='NOMINAL';
  if(ph>=70&&ph<105){L=.4*sst(70,105,ph);al=1;name='ADVISORY'}
  else if(ph>=105&&ph<165){L=.4+.6*sst(105,125,ph);al=2;name='WARNING'}
  else if(ph>=165){L=1-sst(165,225,ph);if(L>.04){al=1;name='CLEARING'}}
  if(this.ext&&typeof this.ext.L==='number'){L=this.ext.L;al=this.ext.al||0;name=this.ext.alName||'NOMINAL'}   /* Sol 4: a scripted storm replaces the demo cycle */
  s.L=L;s.alert=al;s.alertName=name;s.tau=.45+1.9*L;
  const dayS=Math.sin(TAU*(s.h-8.5)/24);
  s.temp=-52+33*(1-.45*L)*dayS+Math.sin(el*1.7)*.25;
  s.pres=730+22*Math.sin(TAU*(s.h-4)/24)+18*L+Math.sin(el*2.3)*.6;
  s.wind=4.6+2.3*Math.sin(el*.31)+1.2*Math.sin(el*1.9)+15*L;s.wdir=(220+40*Math.sin(el*.05)+60*L)%360;
  s.uv=Math.max(0,Math.sin(Math.PI*(s.h-6)/12))*(1-.5*L)*8;
  const sun=s.h>6&&s.h<18?Math.sin(Math.PI*(s.h-6)/12):0;
  s.gen=14*sun*(1-.85*clamp((s.tau-.45)/1.9,0,1));if(this.ext&&this.ext.rtg)s.gen+=this.ext.rtg*2.7;   /* RTGs: constant output, day or night, storm or not */
  s.load=8.6+.6*Math.sin(el*.7)+(sun<.05?1.8:0);
  this.bat=clamp(this.bat+(s.gen-s.load)*dt*RATE/3600/200*100,12,100);s.bat=this.bat;
  s.o2r=clamp(94-el*.004+1.2*Math.sin(el*.08),60,100);s.o2=20.9+.03*Math.sin(el*1.3);s.co2=408+28*Math.sin(el*.21)+6*Math.sin(el*1.1);
  s.cabP=101.3+.08*Math.sin(el*.9);s.cabT=21.4+.4*Math.sin(el*.17);s.hum=41+2*Math.sin(el*.13);s.water=1840-el*.02;
  s.isru=.96*clamp(.55+s.gen/14,.3,1.05);s.light=12.8+4*Math.sin(el*.011);
  this.hT-=dt;if(this.hT<=0){this.hT=1;const h=this.hist;for(const k of['temp','pres','gen','wind']){h[k].push(s[k]);if(h[k].length>60)h[k].shift()}}
  return s}
 hms(){const s=this.s,t=s.tod*86400;return pad(t/3600)+':'+pad(t%3600/60)+':'+pad(t%60)}
}

/* ---------------------------------------------- canvas screen ---------------------------------------- */
export class Screen{
 constructor(w,h,draw,hz=5){this.w=w;this.h=h;this.c=document.createElement('canvas');this.c.width=w;this.c.height=h;this.x=this.c.getContext('2d');
  this.tex=new THREE.CanvasTexture(this.c);this.tex.colorSpace=THREE.SRGBColorSpace;this.tex.anisotropy=4;this.draw=draw;this.every=1/hz;this.acc=1e9;this.tag=''}
 update(dt,sim,t){this.acc+=dt;if(this.acc<this.every)return;this.acc=0;this.draw(this.x,this.w,this.h,sim.s,t,sim);this.tex.needsUpdate=true}
}
const T=(x,s,px,py,size,col,al='left',wt=600)=>{x.font=`${wt} ${size}px Consolas,"Courier New",monospace`;x.fillStyle=col;x.textAlign=al;x.textBaseline='middle';x.fillText(s,px,py)};
function frame(x,w,h,title,sub){x.fillStyle=C.bg;x.fillRect(0,0,w,h);x.strokeStyle='rgba(93,230,255,.06)';x.lineWidth=1;
 for(let i=0;i<w;i+=32){x.beginPath();x.moveTo(i+.5,0);x.lineTo(i+.5,h);x.stroke()}for(let j=0;j<h;j+=32){x.beginPath();x.moveTo(0,j+.5);x.lineTo(w,j+.5);x.stroke()}
 x.fillStyle='rgba(93,230,255,.14)';x.fillRect(0,0,w,Math.round(h*.085));const hh=Math.round(h*.085),f=Math.round(h*.04);
 T(x,title,18,hh/2,f,C.cy,'left',700);if(sub)T(x,sub,w-16,hh/2,Math.round(f*.7),C.dm,'right');
 x.strokeStyle='rgba(93,230,255,.5)';x.lineWidth=2;x.strokeRect(1,1,w-2,h-2)}
function spark(x,arr,px,py,w,h,col,lo,hi){x.strokeStyle='rgba(255,255,255,.12)';x.lineWidth=1;x.strokeRect(px+.5,py+.5,w,h);if(arr.length<2)return;
 x.strokeStyle=col;x.lineWidth=2.5;x.beginPath();for(let i=0;i<arr.length;i++){const X=px+i/(arr.length-1)*w,Y=py+h-clamp((arr[i]-lo)/(hi-lo),0,1)*h;i?x.lineTo(X,Y):x.moveTo(X,Y)}x.stroke()}
function bar(x,px,py,w,h,v,col,bg='rgba(255,255,255,.1)'){x.fillStyle=bg;x.fillRect(px,py,w,h);x.fillStyle=col;x.fillRect(px,py,w*clamp(v,0,1),h)}
const dot=(x,px,py,r,col)=>{x.fillStyle=col;x.beginPath();x.arc(px,py,r,0,7);x.fill()};

/* ---- 1. MARTIAN TIME (Sol counter) ---- */
export function drawTime(x,w,h,s,t){frame(x,w,h,'MARTIAN TIME  ·  SOL CLOCK','JEZERO CRATER  18.4°N 77.6°E');
 T(x,'SOL',40,120,26,C.dm);T(x,pad(s.sol,4),34,222,150,C.am,'left',800);
 T(x,'LOCAL MEAN SOLAR TIME',w-40,100,22,C.dm,'right');
 const tt=s.tod*86400;T(x,pad(tt/3600)+':'+pad(tt%3600/60)+':'+pad(tt%60),w-40,172,92,C.cy,'right',700);
 T(x,'SOLS ELAPSED SINCE LANDING',40,328,22,C.dm);T(x,s.solsEl.toFixed(4),40,392,70,C.wh,'left',700);
 const d=new Date();T(x,'EARTH UTC',w-40,328,22,C.dm,'right');T(x,pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+':'+pad(d.getUTCSeconds()),w-40,386,48,C.wh,'right');
 /* day bar with sun marker */
 const bx=40,bw=w-80,by=470;x.fillStyle='rgba(255,255,255,.08)';x.fillRect(bx,by,bw,18);x.fillStyle='rgba(255,179,71,.35)';x.fillRect(bx+bw*.25,by,bw*.5,18);
 for(let i=0;i<=24;i+=3){x.fillStyle=C.dm;x.fillRect(bx+bw*i/24-1,by+20,2,8);T(x,pad(i),bx+bw*i/24,by+42,16,C.dm,'center')}
 const sx=bx+bw*s.tod;dot(x,sx,by+9,13,s.h>6&&s.h<18?'#ffd070':'#6a7a88');x.strokeStyle='#fff';x.lineWidth=2;x.beginPath();x.moveTo(sx,by-12);x.lineTo(sx,by+30);x.stroke();
 T(x,'SOL LENGTH 24h 39m 35s   ·   SUNRISE ~06:00   SUNSET ~18:00',w/2,h-26,18,C.dm,'center')}

/* ---- 2. WEATHER STATION ---- */
export function drawWeather(x,w,h,s,t,sim){frame(x,w,h,'MARS WEATHER STATION  ·  REMS-NET','AMBIENT SURFACE DATA');const H=sim.hist,cw=w/3;
 T(x,'AMBIENT TEMPERATURE',24,92,20,C.dm);T(x,s.temp.toFixed(1)+' °C',24,158,70,s.temp<-70?C.cy:s.temp>-35?C.am:C.wh,'left',700);spark(x,H.temp,24,206,cw-60,110,C.cy,-95,-10);
 T(x,'PRESSURE',cw+24,92,20,C.dm);T(x,s.pres.toFixed(0)+' Pa',cw+24,158,70,C.wh,'left',700);spark(x,H.pres,cw+24,206,cw-60,110,C.gn,700,780);
 T(x,'WIND',2*cw+24,92,20,C.dm);T(x,s.wind.toFixed(1)+' m/s',2*cw+24,158,60,C.wh,'left',700);
 const cx=2*cw+cw/2+10,cy=266,r=52;x.strokeStyle=C.dm;x.lineWidth=2;x.beginPath();x.arc(cx,cy,r,0,7);x.stroke();T(x,'N',cx,cy-r-12,16,C.dm,'center');
 const a=s.wdir*Math.PI/180;x.strokeStyle=C.am;x.lineWidth=4;x.beginPath();x.moveTo(cx-Math.sin(a)*r*.7,cy+Math.cos(a)*r*.7);x.lineTo(cx+Math.sin(a)*r*.7,cy-Math.cos(a)*r*.7);x.stroke();dot(x,cx+Math.sin(a)*r*.7,cy-Math.cos(a)*r*.7,6,C.am);
 T(x,'DUST OPACITY  τ',24,372,20,C.dm);T(x,s.tau.toFixed(2),24,420,48,s.tau>1.2?C.rd:s.tau>.7?C.am:C.gn,'left',700);bar(x,200,408,w*.4,22,(s.tau-.3)/2.3,s.tau>1.2?C.rd:s.tau>.7?C.am:C.gn);
 T(x,'UV INDEX '+s.uv.toFixed(1),w-30,372,20,C.dm,'right');T(x,'SOL '+pad(s.sol,4),w-30,410,26,C.cy,'right');
 const bl=Math.floor(t*2.2)%2===0;let col=C.gn,msg='ATMOSPHERE NOMINAL   ·   NO DUST ALERTS';
 if(s.alert===1){col=C.am;msg=s.alertName==='CLEARING'?'DUST STORM CLEARING   ·   EVA CAUTION':'DUST ADVISORY   ·   OPACITY RISING   ·   EVA CAUTION'}
 if(s.alert===2){col=C.rd;msg='⚠ DUST STORM WARNING   ·   EVA SUSPENDED   ·   SOLAR OUTPUT DEGRADED'}
 x.fillStyle=s.alert===2&&bl?'rgba(255,90,74,.9)':'rgba(255,255,255,.08)';x.fillRect(16,h-92,w-32,64);x.strokeStyle=col;x.lineWidth=3;x.strokeRect(16,h-92,w-32,64);
 T(x,msg,w/2,h-60,26,s.alert===2&&bl?'#200':col,'center',700)}

/* ---- 3. POWER + LIFE SUPPORT ---- */
export function drawPower(x,w,h,s,t,sim){frame(x,w,h,'POWER GENERATION  &  LIFE SUPPORT','HAB-1 SYSTEMS');const H=sim.hist,mid=w/2;
 T(x,'BATTERY RESERVES',24,86,20,C.dm);T(x,s.bat.toFixed(1)+' %',24,140,64,s.bat<25?C.rd:s.bat<45?C.am:C.gn,'left',700);
 for(let i=0;i<20;i++){x.fillStyle=(i+.5)/20<=s.bat/100?(s.bat<25?C.rd:s.bat<45?C.am:C.gn):'rgba(255,255,255,.09)';x.fillRect(24+i*((mid-60)/20),176,(mid-60)/20-4,30)}
 T(x,'SOLAR ARRAY',24,246,20,C.dm);T(x,s.gen.toFixed(1)+' kW',24,292,50,C.am,'left',700);spark(x,H.gen,24,326,mid-60,86,C.am,0,16);
 T(x,'LOAD '+s.load.toFixed(1)+' kW',24,440,24,C.wh);const net=s.gen-s.load;T(x,'NET '+(net>=0?'+':'')+net.toFixed(1)+' kW',mid-40,440,24,net>=0?C.gn:C.rd,'right');
 x.fillStyle='rgba(93,230,255,.25)';x.fillRect(mid,60,2,h-80);
 const rows=[['O₂ RESERVE',s.o2r.toFixed(1)+' %',s.o2r/100,s.o2r<30?C.rd:C.gn],['CABIN O₂',s.o2.toFixed(2)+' %',s.o2/25,C.gn],['CABIN CO₂',s.co2.toFixed(0)+' ppm',s.co2/1500,s.co2>1000?C.am:C.gn],
  ['CABIN PRESSURE',s.cabP.toFixed(1)+' kPa',s.cabP/110,C.gn],['CABIN TEMP',s.cabT.toFixed(1)+' °C',s.cabT/40,C.gn],['WATER',Math.round(s.water).toLocaleString()+' L',s.water/2000,C.cy],['ISRU O₂ OUTPUT',s.isru.toFixed(2)+' kg/h',s.isru/1.2,C.am]];
 T(x,'LIFE SUPPORT',mid+24,86,20,C.dm);rows.forEach((r,i)=>{const y=134+i*58;T(x,r[0],mid+24,y,19,C.dm);T(x,r[1],w-26,y,26,C.wh,'right',700);bar(x,mid+24,y+20,mid-54,8,r[2],r[3]);});
 const ok=s.bat>20&&s.co2<1000;dot(x,w-34,h-30,9,ok?C.gn:C.am);T(x,ok?'ALL SYSTEMS NOMINAL':'CHECK SYSTEMS',w-54,h-30,19,ok?C.gn:C.am,'right')}

/* ---- 4. DEEP SPACE LINK / TELEMETRY ---- */
const LOG=['HAB-1 STATUS BEACON OK','ISRU O2 PLANT CYCLE COMPLETE','ROVER-1 DOCKED  CHARGE 100%','SAMPLE CACHE 07 LOGGED','GREENHOUSE IRRIGATION CYCLE','AIRLOCK 1 SEALS NOMINAL','COMMS RELAY HANDOVER MRO','CREW CHECK-IN RECEIVED','DUST FILTER BANK B SWAP','THERMAL LOOP A STABLE'];
export function drawComms(x,w,h,s,t){frame(x,w,h,'DEEP SPACE LINK  ·  TELEMETRY','EARTH RELAY');
 const cx=250,cy=250;x.strokeStyle='rgba(93,230,255,.3)';x.lineWidth=1.5;for(const r of[70,130,190]){x.beginPath();x.arc(cx,cy,r,0,7);x.stroke()}
 dot(x,cx,cy,16,'#ffd070');const ea=t*.05,ma=t*.027+1.2;dot(x,cx+Math.cos(ea)*130,cy+Math.sin(ea)*130,9,C.cy);T(x,'EARTH',cx+Math.cos(ea)*130,cy+Math.sin(ea)*130-18,14,C.cy,'center');
 dot(x,cx+Math.cos(ma)*190,cy+Math.sin(ma)*190,9,C.rd);T(x,'MARS',cx+Math.cos(ma)*190,cy+Math.sin(ma)*190-18,14,C.rd,'center');
 x.strokeStyle='rgba(125,255,154,.6)';x.setLineDash([6,6]);x.beginPath();x.moveTo(cx+Math.cos(ea)*130,cy+Math.sin(ea)*130);x.lineTo(cx+Math.cos(ma)*190,cy+Math.sin(ma)*190);x.stroke();x.setLineDash([]);
 const lt=s.light*60;T(x,'LIGHT-TIME ONE WAY',500,92,20,C.dm);T(x,pad(lt/60)+'m '+pad(lt%60)+'s',500,140,52,C.wh,'left',700);
 const dsn=['GOLDSTONE','MADRID','CANBERRA'][Math.floor(s.el/40)%3];T(x,'DSN STATION  '+dsn,500,200,22,C.cy);
 T(x,'DOWNLINK '+(2.0+.15*Math.sin(t*1.3)).toFixed(2)+' Mb/s',500,236,22,C.wh);T(x,'UPLINK   '+(256+8*Math.sin(t*.9)).toFixed(0)+' kb/s',500,266,22,C.wh);
 for(let i=0;i<5;i++){x.fillStyle=i<4?C.gn:'rgba(255,255,255,.15)';x.fillRect(500+i*22,296-i*6,16,10+i*6)}
 const p=(base)=>{const q=(base-s.el)%3600;const v=q<0?q+3600:q;return pad(v/3600)+':'+pad(v%3600/60)+':'+pad(v%60)};
 T(x,'ORBITER PASSES',500,350,20,C.dm);T(x,'MRO     AOS '+p(2470),500,382,20,C.wh);T(x,'MAVEN   AOS '+p(1210),500,408,20,C.wh);T(x,'TGO     AOS '+p(3330),500,434,20,C.wh);
 const k=Math.floor(s.el/3);for(let i=0;i<4;i++)T(x,'> '+LOG[(k+i)%LOG.length],24,h-92+i*22,17,i===3?C.cy:C.dm)}

/* ---- mini console screens (256x160, shared by every workstation) ---- */
export function drawMiniMap(x,w,h,s,t){x.fillStyle='#07151c';x.fillRect(0,0,w,h);x.strokeStyle='rgba(93,230,255,.25)';x.lineWidth=1;for(let i=0;i<w;i+=16){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke()}for(let j=0;j<h;j+=16){x.beginPath();x.moveTo(0,j);x.lineTo(w,j);x.stroke()}
 x.strokeStyle='#c9854f';x.lineWidth=2;x.beginPath();x.arc(120,84,50,0,7);x.stroke();dot(x,120,84,5,C.gn);dot(x,120+Math.cos(t*.6)*38,84+Math.sin(t*.6)*30,4,C.am);T(x,'SURFACE MAP',8,12,13,C.cy)}
export function drawMiniGraph(x,w,h,s,t){x.fillStyle='#07151c';x.fillRect(0,0,w,h);for(let k=0;k<3;k++){x.strokeStyle=[C.cy,C.gn,C.am][k];x.lineWidth=2;x.beginPath();for(let i=0;i<=64;i++){const X=i*4,Y=40+k*40+Math.sin(i*.35+t*(1.5+k)+k)*14*Math.sin(t*.4+k);i?x.lineTo(X,Y):x.moveTo(X,Y)}x.stroke()}T(x,'SENSOR BUS',8,12,13,C.cy)}
export function drawMiniLog(x,w,h,s,t){x.fillStyle='#07151c';x.fillRect(0,0,w,h);const k=Math.floor(t*1.5);for(let i=0;i<9;i++){const n=(k+i)%LOG.length;T(x,(pad((k+i)%100)+' '+LOG[n]).slice(0,30),6,14+i*16,11,i===8?C.cy:'#4f7a89')}}
/* tactical table map overlay (the terrain image itself is generated once, see mapGen) */
export function drawTable(img){return (x,w,h,s,t)=>{x.fillStyle='#02090e';x.fillRect(0,0,w,h);x.save();x.beginPath();x.arc(w/2,h/2,w/2-4,0,7);x.clip();if(img)x.drawImage(img,0,0,w,h);
 x.strokeStyle='rgba(93,230,255,.35)';x.lineWidth=1;for(let r=60;r<w/2;r+=60){x.beginPath();x.arc(w/2,h/2,r,0,7);x.stroke()}x.beginPath();x.moveTo(w/2,0);x.lineTo(w/2,h);x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke();
 const pl=1+.25*Math.sin(t*4);x.strokeStyle=C.gn;x.lineWidth=3;x.beginPath();x.arc(w/2,h/2,14*pl,0,7);x.stroke();dot(x,w/2,h/2,5,C.gn);T(x,'HAB-1',w/2+22,h/2-18,15,C.gn);
 const rx=w/2+Math.cos(t*.12)*120,ry=h/2+Math.sin(t*.12)*90;dot(x,rx,ry,6,C.am);T(x,'ROVER',rx+10,ry-12,13,C.am);dot(x,w/2-150,h/2+90,5,C.rd);T(x,'LANDER',w/2-146,h/2+72,13,C.rd);
 x.restore();x.strokeStyle=C.cy;x.lineWidth=3;x.beginPath();x.arc(w/2,h/2,w/2-4,0,7);x.stroke();T(x,'JEZERO  ·  TACTICAL SURFACE MAP',w/2,18,14,C.cy,'center')}}

/* ---- procedural Jezero-style terrain map, built in slices so it never stalls a frame ---- */
const hs=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n)};
const vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);return(hs(xi,yi)*(1-u)+hs(xi+1,yi)*u)*(1-v)+(hs(xi,yi+1)*(1-u)+hs(xi+1,yi+1)*u)*v};
const fbm=(x,y,o)=>{let a=.5,s=0;for(let i=0;i<o;i++){s+=a*vn(x,y);x=x*2.03+17.1;y=y*2.03+3.7;a*=.5}return s};
export function* mapGen(N=320){const cv=document.createElement('canvas');cv.width=cv.height=N;const cx=cv.getContext('2d'),E=new Float32Array(N*N);
 for(let j=0;j<N;j++){for(let i=0;i<N;i++){const u=i/N,v=j/N;let e=fbm(u*6,v*6,4)*.5;const c=Math.hypot(u-.52,v-.5)/.3;if(c<1)e-=.28*(1-c*c);e+=.10*Math.exp(-(((c-1.05)/.07)**2));
   const d=Math.hypot((u-.3)*1.1,v-.48);e+=.12*Math.exp(-((d/.09)**2))+.05*fbm(u*30,v*30,2)*Math.exp(-((d/.2)**2));E[j*N+i]=e}
  if(j%40===39)yield}
 const im=cx.createImageData(N,N),p=im.data;
 for(let j=1;j<N-1;j++){for(let i=1;i<N-1;i++){const e=E[j*N+i],sh=clamp(.5+(E[j*N+i-1]-E[j*N+i+1]+E[(j-1)*N+i]-E[(j+1)*N+i])*9,0,1),t=clamp((e+.2)/.9,0,1),k=(j*N+i)*4,m=.55+.9*sh;
   let r=(58+t*150)*m,g=(30+t*100)*m,b=(22+t*72)*m;if(((e*18)%1)<.06){r*=.8;g*=.8;b*=.8}p[k]=r;p[k+1]=g;p[k+2]=b;p[k+3]=255}
  if(j%60===59)yield}
 cx.putImageData(im,0,0);return cv}
