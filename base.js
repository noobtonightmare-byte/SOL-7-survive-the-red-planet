/* =====================================================================================================
   base.js  -  MarsBase: state machine for the "Mars Research Base & Operations Hub" phase

   mode:  off -> build -> fly -> walkin -> cycle -> walkin2 -> inside <-> (cycleOut -> walkout) <-> outside
          (outside --[E at ramp]--> walkin -> cycle ...)

   Hooks into MarsPhase (see INTEGRATION.md for the 7 tiny patches):
     arm()            called from startWalk(), the moment "SOL 1 - WELCOME TO MARS" is shown
     update(dt)       called every frame while walking; returns true once it owns the camera
     renderInterior() called from finish() after the exterior pass
     interact()       [E]       reset()  [Shift+R / retry]
   ===================================================================================================== */
import * as THREE from 'three';
import {D,SPOKES,buildBase} from './basebuild.js';
import {Farm} from './farm.js';
import {Sim,mapGen,drawMiniMap,drawMiniGraph,drawMiniLog} from './basescreens.js';

const V3=THREE.Vector3,MU=THREE.MathUtils,clamp=MU.clamp,lerp=MU.lerp,TAU=Math.PI*2,$=id=>document.getElementById(id);
const sstep=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
const {F,RH,RF}=D;
const FLY=17,EYE_IN=1.65,EYE_OUT=1.75,_c=new THREE.Color(),_red=new THREE.Color(0xff3a20),_v=new THREE.Vector3();
const CSS=`
#b-zone{position:fixed;left:28px;top:22px;padding:9px 16px;background:rgba(6,10,18,.62);border-left:4px solid #ffb347;border-radius:4px;font:700 15px Consolas,monospace;letter-spacing:3px;color:#f4e8e0;opacity:0;transition:opacity .6s;pointer-events:none;z-index:22;text-shadow:0 0 6px #000}
#b-zone small{display:block;font-size:10px;opacity:.6;letter-spacing:3px;margin-top:3px}#b-zone.on{opacity:1}
#b-sol{position:fixed;right:28px;top:22px;text-align:right;font:600 13px Consolas,monospace;letter-spacing:3px;color:#f4e8e0;opacity:0;transition:opacity .6s;pointer-events:none;z-index:22;background:rgba(6,10,18,.55);border-right:4px solid #ff8a4c;border-radius:4px;padding:8px 14px;text-shadow:0 0 8px #000}
#b-sol b{display:block;font-size:20px;color:#ffb347;letter-spacing:5px}#b-sol small{display:block;font-size:10px;opacity:.65;margin-top:3px}#b-sol.on{opacity:1}
#b-prompt{position:fixed;left:50%;bottom:27%;transform:translateX(-50%);padding:10px 24px;font:700 16px Consolas,monospace;letter-spacing:3px;color:#fff;background:rgba(6,10,18,.7);border:1px solid rgba(255,179,71,.6);border-radius:5px;opacity:0;transition:opacity .35s;pointer-events:none;z-index:24}
#b-prompt b{color:#ffb347;border:2px solid #ffb347;border-radius:4px;padding:0 8px;margin-right:8px}#b-prompt.on{opacity:1}
#b-alert{position:fixed;left:50%;top:80px;transform:translateX(-50%);padding:8px 26px;font:800 17px Consolas,monospace;letter-spacing:4px;border-radius:4px;opacity:0;transition:opacity .5s;pointer-events:none;z-index:24;white-space:nowrap}
#b-alert.a1{opacity:1;background:rgba(80,50,0,.8);color:#ffc15a;border:2px solid #ffb347}#b-alert.a2{opacity:1;background:rgba(90,10,6,.85);color:#ff8a7a;border:2px solid #ff5a4a;animation:bB .7s steps(2) infinite}@keyframes bB{50%{opacity:.45}}
#b-hint{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);font:600 11px Consolas,monospace;letter-spacing:3px;color:#fff;opacity:0;transition:opacity .8s;pointer-events:none;z-index:20;text-shadow:0 0 8px #000;white-space:nowrap}#b-hint.on{opacity:.6}
#b-fade{position:fixed;inset:0;background:#000;opacity:0;transition:opacity .45s;pointer-events:none;z-index:44}
#b-cycle{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:460px;padding:18px 24px;background:rgba(6,10,18,.82);border:2px solid #ffb347;border-radius:6px;font:600 14px Consolas,monospace;letter-spacing:2px;color:#f2f5fa;opacity:0;transition:opacity .4s;pointer-events:none;z-index:30;box-shadow:0 0 40px rgba(255,160,60,.35)}
#b-cycle.on{opacity:1}#b-cycle h2{margin:0 0 10px;font-size:15px;letter-spacing:5px;color:#ffb347}#b-cycle .r{display:flex;justify-content:space-between;margin:6px 0;font-size:13px}#b-cycle .bar{height:9px;background:rgba(255,255,255,.12);margin:10px 0 4px;border-radius:3px;overflow:hidden}#b-cycle .bar i{display:block;height:100%;width:0;background:#ff7a3a}
#b-load{position:fixed;inset:0;z-index:45;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;opacity:0;pointer-events:none;transition:opacity .35s;font:700 20px Consolas,monospace;letter-spacing:10px;color:#f2f5fa}#b-load.on{opacity:1}
#b-load .sp{width:64px;height:64px;border:4px solid rgba(255,255,255,.12);border-top-color:#ffb347;border-right-color:#ff7a3a;border-radius:50%;animation:bLs .9s linear infinite}@keyframes bLs{to{transform:rotate(360deg)}}
#b-load .ld{width:260px;height:4px;background:rgba(255,255,255,.12);overflow:hidden;border-radius:2px}#b-load .ld i{display:block;width:40%;height:100%;background:linear-gradient(90deg,#ff7a3a,#ffb347);animation:bLb 1.3s ease-in-out infinite}@keyframes bLb{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
#b-load small{font-size:11px;letter-spacing:5px;opacity:.6}#b-load .d::after{content:'';animation:bLd 1.2s steps(4) infinite}@keyframes bLd{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}`;
const HTML=`<div id="b-zone"><span></span><small></small></div><div id="b-sol"><b>SOL 0001</b><span></span><small></small></div><div id="b-alert"></div><div id="b-prompt"></div>
<div id="b-hint">[W][A][S][D] MOVE &nbsp;·&nbsp; MOUSE LOOK &nbsp;·&nbsp; [SHIFT] SPRINT &nbsp;·&nbsp; [E] INTERACT</div><div id="b-fade"></div>
<div id="b-cycle"><h2>AIRLOCK CYCLE</h2><div class="r"><span>PHASE</span><span id="bc-ph">-</span></div><div class="r"><span>CHAMBER PRESSURE</span><span id="bc-p">-</span></div><div class="bar"><i id="bc-bar"></i></div><div class="r"><span>DUST PURGE</span><span id="bc-d">-</span></div></div>
<div id="b-load"><div class="sp"></div><div>LOADING<span class="d"></span></div><div class="ld"><i></i></div><small>PREPARING MARS RESEARCH BASE</small></div>`;
const FLY_P=[[-26,24,-82],[-60,19,-26],[-44,14,34],[-6,17,52],[44,13,38],[50,8,-6],[24,4.5,-34],[0,1.75+F,-28]];
const FLY_L=[[-8,4,-10],[-30,3,-4],[-14,5,18],[0,6,22],[18,3,18],[14,3,-4],[2,3,-16],[0,1.9+F,-13]];
const CAPS=[[.4,'MARS RESEARCH BASE  ·  HAB-1'],[4.2,'POWER STATION  ·  SOLAR FIELD'],[8,'STORAGE  ·  COMMS ARRAY'],[11.4,'GREENHOUSE  ·  LIVING QUARTERS'],[14.2,'EVA ENTRY  ·  AIRLOCK 1']];

const CSS2=`
/* ---- NEW: telemetry mini-game + telescope overlays ---- */
#tm-ui{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(2,6,12,.62);font-family:Consolas,monospace;color:#e8f4f8;pointer-events:none}#tm-ui.on{display:flex}
#tm-box{width:640px;max-width:92vw;padding:20px 28px 16px;background:rgba(6,14,22,.94);border:2px solid #5de6ff;border-radius:6px;box-shadow:0 0 50px rgba(93,230,255,.28)}
#tm-box.bad{animation:tmS .3s}@keyframes tmS{20%{transform:translateX(-9px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
#tm-h{display:flex;justify-content:space-between;font-weight:800;font-size:15px;letter-spacing:4px;color:#5de6ff}#tm-h small{font-size:12px;color:#ffb347;letter-spacing:3px}
#tm-tm{display:flex;align-items:baseline;gap:10px;margin:14px 0 6px}#tm-t{font-size:44px;font-weight:800;letter-spacing:2px;color:#7dff9a}#tm-tm span{font-size:12px;letter-spacing:4px;opacity:.6}
#tm-bar{height:10px;background:rgba(255,255,255,.12);border-radius:4px;overflow:hidden}#tm-bi{display:block;height:100%;width:100%;background:#7dff9a;transition:background .2s}
#tm-sq{display:flex;gap:12px;justify-content:center;margin:22px 0 14px;min-height:74px;flex-wrap:wrap}
#tm-sq i{font-style:normal;width:62px;height:62px;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:800;border:2px solid rgba(93,230,255,.5);border-radius:8px;color:#9fd8ff;background:rgba(93,230,255,.07)}
#tm-sq i.ok{border-color:#7dff9a;color:#7dff9a;background:rgba(125,255,154,.16);transform:scale(.9)}#tm-sq i.cur{border-color:#ffb347;color:#ffb347;box-shadow:0 0 18px rgba(255,179,71,.55);animation:tmC .7s steps(2) infinite}@keyframes tmC{50%{opacity:.6}}
#tm-ms{text-align:center;font-size:15px;font-weight:700;letter-spacing:3px;min-height:22px;color:#ffb347}#tm-ms.r{color:#ff5a4a}#tm-ms.g{color:#7dff9a}
#tm-rs{display:none;margin-top:8px;font-size:14px;letter-spacing:2px;line-height:1.75}#tm-rs .row{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.1);padding:2px 0}#tm-rs b{color:#5de6ff}#tm-rs .v{color:#ffb347;font-weight:800}
#tm-ft{margin-top:14px;text-align:center;font-size:11px;letter-spacing:3px;opacity:.55}
#sc-ui{position:fixed;inset:0;z-index:19;pointer-events:none;opacity:0;transition:opacity .35s;font-family:Consolas,monospace;color:#cfe6ff}#sc-ui.on{opacity:1}
#sc-lens{position:absolute;left:50%;top:50%;width:86vmin;height:86vmin;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 160vmax #000,inset 0 0 90px 24px rgba(0,0,0,.78);border:5px solid #1c1f24}
#sc-h,#sc-v{position:absolute;background:rgba(255,90,74,.55)}#sc-h{left:calc(50% - 11vmin);width:22vmin;top:50%;height:1px}#sc-v{top:calc(50% - 11vmin);height:22vmin;left:50%;width:1px}
#sc-ring{position:absolute;left:50%;top:50%;width:9vmin;height:9vmin;transform:translate(-50%,-50%);border:1px solid rgba(255,90,74,.5);border-radius:50%}
#sc-box{position:absolute;border:2px solid #5de6ff;border-radius:50%;opacity:0;transform:translate(-50%,-50%);box-shadow:0 0 14px rgba(93,230,255,.5)}#sc-box.l{border-color:#7dff9a;box-shadow:0 0 18px rgba(125,255,154,.7)}#sc-box span{position:absolute;left:50%;top:-22px;transform:translateX(-50%);font:700 11px Consolas,monospace;letter-spacing:3px;white-space:nowrap}
#sc-top{position:absolute;left:50%;top:5vh;transform:translateX(-50%);font:700 14px Consolas,monospace;letter-spacing:4px;text-shadow:0 0 8px #000;white-space:nowrap;text-align:center;background:rgba(6,10,18,.6);padding:7px 18px;border-radius:4px}#sc-top small{display:block;font-size:11px;opacity:.7;letter-spacing:3px;margin-top:3px}
#sc-info{position:absolute;right:3vw;top:50%;transform:translateY(-50%);width:min(320px,26vw);padding:14px 16px;background:rgba(6,10,18,.78);border-left:4px solid #5de6ff;border-radius:4px;font-size:12px;line-height:1.6;letter-spacing:1px;text-shadow:0 0 5px #000}#sc-info.l{border-color:#7dff9a}#sc-info h3{margin:0 0 6px;font-size:15px;letter-spacing:5px;color:#ffb347}#sc-info .k{opacity:.6}
#sc-help{position:absolute;left:50%;bottom:4vh;transform:translateX(-50%);font:600 11px Consolas,monospace;letter-spacing:3px;opacity:.7;text-shadow:0 0 8px #000;white-space:nowrap}
`;
const HTML2=`<div id="tm-ui"><div id="tm-box"><div id="tm-h"><span>STORM TELEMETRY UPLINK</span><small id="tm-rd">PACKET 1 / 2</small></div><div id="tm-tm"><b id="tm-t">10.0</b><span>SEC</span></div><div id="tm-bar"><i id="tm-bi"></i></div><div id="tm-sq"></div><div id="tm-ms"></div><div id="tm-rs"></div><div id="tm-ft"></div></div></div>
<div id="sc-ui"><div id="sc-lens"></div><div id="sc-h"></div><div id="sc-v"></div><div id="sc-ring"></div><div id="sc-box"><span></span></div><div id="sc-top"><span id="sc-mag"></span><small id="sc-az"></small></div><div id="sc-info"></div><div id="sc-help">[MOUSE] SLEW &nbsp;&middot;&nbsp; [SCROLL] ZOOM &nbsp;&middot;&nbsp; [F] LOCK / RELEASE &nbsp;&middot;&nbsp; [E] / [ESC] STEP AWAY</div></div>`;
/* =====================================================================================================
   NEW  ·  STORM TELEMETRY MINI-GAME  (hub consoles)
   Walk up to any operator console in the central hub and press [E]. Enter an arrow-key sequence inside 10 s,
   TWICE IN A ROW with two different random patterns (a miss resets the current pattern, a timeout resets the streak).
   The decoded packets are used to compute the incoming storm speed / ETA from the live base simulation + Sol 4 storm script.
   ===================================================================================================== */
const S4_PREP=300,S4_STORM=90;           /* mirrors daynight.js (Sol 4 countdown to impact / storm length) */
const ARW={ArrowUp:'\u2191',ArrowDown:'\u2193',ArrowLeft:'\u2190',ArrowRight:'\u2192'},AK=Object.keys(ARW),TM_T=10;
const mmss=t=>{t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
class Telemetry{
 constructor(b){this.b=b;this.on=false;this.ph='idle';this.round=0;this.seq=[];this.prev='';this.i=0;this.t=TM_T;this.hold=0;this.bad=0;this.res=null;this.k='';
  addEventListener('keydown',e=>{if(!this.on||e.ctrlKey||e.metaKey||e.altKey||/^F\d+$/.test(e.code))return;e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)this.key(e.code)},true)}
 near(){const b=this.b,S=b.S;if(!S||!S.consoles||b.mode!=='inside'||this.on)return false;if(b.zone(b.p.x,b.p.z).id!=='hub')return false;for(const c of S.consoles)if(Math.hypot(b.p.x-c.x,b.p.z-c.z)<2.3)return true;return false}
 open(){const mp=this.b.mp;this.on=true;this.round=0;this.prev='';this.res=null;this.ui(true);this.newRound();mp.mdx=mp.mdy=0;mp.tone&&mp.tone(660,.12,.05,'square');$('b-prompt').classList.remove('on')}
 close(quiet){if(!this.on&&quiet)return;this.on=false;this.ph='idle';this.ui(false);this.b.mp.mdx=this.b.mp.mdy=0}
 ui(on){const e=$('tm-ui');if(e)e.classList.toggle('on',on)}
 gen(){const n=this.round?6:5;let a,s;do{a=Array.from({length:n},()=>AK[Math.floor(Math.random()*4)]);s=a.join()}while(s===this.prev||a.some((c,i)=>i>1&&c===a[i-1]&&c===a[i-2]));this.prev=s;return a}   /* never the same pattern twice, never 3 identical in a row */
 newRound(){this.seq=this.gen();this.i=0;this.t=TM_T;this.ph='play';this.msg('INPUT THE SEQUENCE  \u00b7  DO NOT MISS','');this.draw();$('tm-rs').style.display='none';$('tm-ft').textContent='[\u2191][\u2193][\u2190][\u2192] INPUT  \u00b7  [ESC] ABORT';$('tm-rd').textContent='PACKET '+(this.round+1)+' / 2'}
 msg(t,c){const m=$('tm-ms');m.textContent=t;m.className=c}
 draw(){$('tm-sq').innerHTML=this.seq.map((c,i)=>'<i class="'+(i<this.i?'ok':i===this.i&&this.ph==='play'?'cur':'')+'">'+ARW[c]+'</i>').join('')}
 key(code){const mp=this.b.mp;
  if(code==='Escape'){this.close();return}
  if(this.ph==='play'&&ARW[code]){if(code===this.seq[this.i]){this.i++;mp.tone&&mp.tone(500+this.i*90,.07,.04,'square');this.draw();
    if(this.i>=this.seq.length){if(this.round===0){this.ph='pass';this.hold=1.1;this.msg('PACKET 1 DECODED  \u00b7  NEXT PATTERN INCOMING','g');mp.tone&&mp.tone(784,.25,.05)}else this.finish()}}
   else{this.i=0;this.bad=.3;this.draw();this.msg('WRONG KEY  \u00b7  SEQUENCE RESET','r');mp.tone&&mp.tone(110,.2,.07,'sawtooth');const bx=$('tm-box');bx.classList.remove('bad');void bx.offsetWidth;bx.classList.add('bad')}return}
  if((this.ph==='fail')&&(code==='Enter'||code==='KeyE'||code==='Space')){this.round=0;this.newRound();return}
  if(this.ph==='result'&&(code==='Enter'||code==='KeyE'||code==='Space'))this.close()}
 fail(){this.ph='fail';this.round=0;this.msg('SIGNAL LOST  \u00b7  STREAK RESET  \u00b7  [ENTER] RETRY','r');$('tm-t').textContent='0.0';$('tm-ft').textContent='[ENTER] RETRY FROM PACKET 1  \u00b7  [ESC] ABORT';this.b.mp.tone&&this.b.mp.tone(90,.6,.08,'sawtooth')}
 /* ---- the "calculation": live wind + storm script -> front speed, ETA, threat ---- */
 finish(){const b=this.b,mp=b.mp,s=b.sim.s,dn=mp.dn,s4=dn&&dn.s4,sol=dn?dn.sol:1;let L=s.L||0,eta='NO FRONT IN RANGE',thr='LOW',st='QUIET';
  if(sol===4&&s4&&s4.on){L=Math.max(L,s4.L||0);if(s4.ph==='prep'){eta=s4.sighted?'IMPACT IN '+mmss(S4_PREP-s4.tm):'FRONT NOT YET SIGHTED  \u00b7  ~'+mmss(S4_PREP-s4.tm);thr='SEVERE';st='APPROACHING'}else if(s4.ph==='storm'){eta='STORM ACTIVE  \u00b7  CLEARS IN '+mmss(S4_STORM-s4.tm);thr='EXTREME';st='OVERHEAD'}else if(s4.ph==='clear'){eta='FRONT PASSING  \u00b7  CLEARING';thr='MODERATE';st='RECEDING'}else if(s4.done){eta='STORM PASSED';thr='LOW';st='CLEARED'}}
  else if(s.alert===2){eta='LOCAL STORM CELL OVERHEAD';thr='HIGH';st='OVERHEAD'}else if(s.alert===1){eta='ADVISORY  \u00b7  OPACITY RISING';thr='MODERATE';st='BUILDING'}
  const ms=Math.max(8,s.wind*1.55+12+34*L),kmh=ms*3.6,dir=Math.round(s.wdir);
  this.res={kmh:Math.round(kmh),ms:ms.toFixed(1),dir,tau:(s.tau||.45).toFixed(2),eta,thr,st,sol};b.stormData=this.res;this.ph='result';this.msg('TELEMETRY COMPUTED','g');
  const r=this.res,row=(k,v)=>'<div class="row"><b>'+k+'</b><span class="v">'+v+'</span></div>';
  const rs=$('tm-rs');rs.innerHTML=row('STORM FRONT SPEED',r.kmh+' km/h  ('+r.ms+' m/s)')+row('WIND FROM',String(r.dir).padStart(3,'0')+'\u00b0')+row('ATMOSPHERIC OPACITY \u03c4',r.tau)+row('FRONT STATUS',r.st)+row('ETA',r.eta)+row('THREAT LEVEL',r.thr);rs.style.display='block';
  $('tm-sq').innerHTML='<i class="ok">\u2713</i><i class="ok">\u2713</i>';$('tm-ft').textContent='[ENTER] CLOSE';$('tm-t').textContent='OK';
  mp.cap&&mp.cap('STORM DATA CALCULATED  \u00b7  FRONT '+r.kmh+' km/h',3600);if(mp.tone){mp.tone(523,.2,.05);setTimeout(()=>mp.tone(659,.2,.05),150);setTimeout(()=>mp.tone(784,.4,.05),300)}}
 update(dt){if(!this.on)return;
  if(this.ph==='play'){this.t-=dt;if(this.t<=0){this.t=0;this.fail()}
   const t=$('tm-t');if(this.ph==='play'){t.textContent=this.t.toFixed(1);t.style.color=this.t<3?'#ff5a4a':this.t<6?'#ffb347':'#7dff9a';const bi=$('tm-bi');bi.style.width=(this.t/TM_T*100)+'%';bi.style.background=this.t<3?'#ff5a4a':this.t<6?'#ffb347':'#7dff9a'}}
  else if(this.ph==='pass'){this.hold-=dt;if(this.hold<=0){this.round=1;this.newRound()}}}
}

/* =====================================================================================================
   NEW  ·  TELESCOPE  (exterior)
   [E] at the telescope -> lens view. Mouse / arrows slew, mouse-wheel (or [+]/[-]) zooms smoothly 0.12 deg .. 32 deg,
   [F] locks onto a moon that is in the field of view (the scope then tracks it) and shows detailed 3D Phobos / Deimos.
   The 3D moon meshes live in nightsky.js (NightSky.setScope / moonDir).
   ===================================================================================================== */
const SC_FMIN=.12,SC_FMAX=32,SC_D2R=Math.PI/180;
const MOON_INFO=[
 {n:'PHOBOS',s:'27 \u00d7 22 \u00d7 18 km',o:'7 h 39 min  (faster than Mars spins)',r:'9,376 km',a:'~0.2\u00b0',x:'Dark, carbon-rich regolith. Stickney crater is 9 km wide. Spiralling inward ~1.8 m per century.'},
 {n:'DEIMOS',s:'15 \u00d7 12 \u00d7 11 km',o:'30 h 18 min',r:'23,463 km',a:'~0.04\u00b0',x:'Smoother than Phobos: loose dust fills many craters. A bright star-like point to the naked eye.'}];
class Scope{
 constructor(b){this.b=b;this.on=false;this.fov=36;this.fT=36;this.yaw=0;this.pitch=.5;this.lock=-1;this.cand=-1;this.k='';this.back=null;this.f=new V3();this.r=new V3();this.u=new V3();this.dl=new V3();this.eye=new V3();
  addEventListener('wheel',e=>{if(!this.on)return;e.stopImmediatePropagation();e.preventDefault();this.fT=clamp(this.fT*Math.exp(Math.sign(e.deltaY)*Math.min(Math.abs(e.deltaY),120)*.0022),SC_FMIN,SC_FMAX)},{capture:true,passive:false});
  addEventListener('keydown',e=>{if(!this.on||e.ctrlKey||e.metaKey||e.altKey)return;
   if(e.code==='KeyF'&&!e.repeat){e.stopImmediatePropagation();this.toggleLock()}
   else if(e.code==='Escape')this.exit();
   else if(e.code==='Equal'||e.code==='NumpadAdd')this.fT=clamp(this.fT/1.35,SC_FMIN,SC_FMAX);
   else if(e.code==='Minus'||e.code==='NumpadSubtract')this.fT=clamp(this.fT*1.35,SC_FMIN,SC_FMAX)},true)}
 tel(){const S=this.b.S;return S&&S.telescope}
 near(){const b=this.b,t=this.tel();if(!t||b.mode!=='outside'||this.on)return false;return Math.hypot(b.p.x-t.x,b.p.z-t.z)<3.2}
 ok(){const dn=this.b.mp.dn;if(dn&&(dn.dead||(dn.frozen&&dn.frozen())))return false;const s4=dn&&dn.s4;if(s4&&s4.stormOn&&s4.stormOn()&&(s4.L||0)>.12)return false;return true}
 enter(){const b=this.b,mp=b.mp,p=b.p,t=this.tel();if(!t||!this.ok())return;this.on=true;this.lock=-1;this.cand=-1;this.k='';this.back={yaw:p.yaw,pitch:p.pitch};
  this.dl.set(Math.cos(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch),Math.sin(p.yaw)*Math.cos(p.pitch)).applyQuaternion(b.root.quaternion);
  this.yaw=Math.atan2(this.dl.z,this.dl.x);this.pitch=Math.max(.45,Math.asin(clamp(this.dl.y,-1,1)));this.fov=this.fT=36;t.g.visible=false;mp.ns&&mp.ns.setScope(true);
  $('sc-ui').classList.add('on');$('b-prompt').classList.remove('on');mp.mdx=mp.mdy=0;mp.tone&&mp.tone(330,.25,.04,'triangle');mp.cap&&mp.cap('TELESCOPE  \u00b7  FIND PHOBOS AND DEIMOS',2600)}
 exit(quiet){if(!this.on)return;const b=this.b,mp=b.mp,t=this.tel(),cam=mp.ncam;this.on=false;this.lock=-1;
  if(cam&&cam.zoom!==1){cam.zoom=1;cam.updateProjectionMatrix()}if(mp.ns)mp.ns.setScope(false);
  if(t){t.g.visible=true;this.dl.set(Math.cos(this.pitch)*Math.cos(this.yaw),Math.sin(this.pitch),Math.cos(this.pitch)*Math.sin(this.yaw)).applyQuaternion(b.root.quaternion.clone().invert());t.aim(this.dl)}   /* leave the tube pointing where you were looking */
  if(this.back&&b.p){b.p.yaw=this.back.yaw;b.p.pitch=this.back.pitch}const ui=$('sc-ui');if(ui)ui.classList.remove('on');mp.mdx=mp.mdy=0;if(!quiet&&mp.tone)mp.tone(260,.2,.04,'triangle')}
 toggleLock(){const ns=this.b.mp.ns;if(this.lock>=0){this.lock=-1;this.k='';this.b.mp.tone&&this.b.mp.tone(300,.12,.04);return}
  if(this.cand>=0&&ns){this.lock=this.cand;const ang=ns.angRad(this.lock)*2*180/Math.PI;this.fT=clamp(ang/.55,SC_FMIN,SC_FMAX);this.k='';this.b.mp.tone&&(this.b.mp.tone(880,.12,.05,'square'),setTimeout(()=>this.b.mp.tone(1320,.2,.04,'square'),110))}}
 update(dt){const b=this.b,mp=b.mp,k=mp.keys,ns=mp.ns,cam=mp.ncam,t=this.tel();
  if(!t||!ns||!this.ok()||b.mode!=='outside'){this.exit(true);return}
  this.fov=Math.exp(lerp(Math.log(this.fov),Math.log(this.fT),1-Math.exp(-9*dt)));const fr=this.fov*SC_D2R,sens=.0025*clamp(this.fov/61,.0015,1);
  if(this.lock<0){this.yaw+=mp.mdx*sens+((k.ArrowRight?1:0)-(k.ArrowLeft?1:0))*dt*fr*.7;this.pitch=clamp(this.pitch-mp.mdy*sens+((k.ArrowUp?1:0)-(k.ArrowDown?1:0))*dt*fr*.7,.02,1.5)}
  mp.mdx=mp.mdy=0;const f=this.f;
  if(this.lock>=0){const m=ns.moonDir(this.lock);if(!ns.moonUp(this.lock)){this.lock=-1;this.k=''}else{let dy=Math.atan2(m.z,m.x)-this.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));const q=1-Math.exp(-8*dt);this.yaw+=dy*q;this.pitch+=(Math.asin(clamp(m.y,-1,1))-this.pitch)*q}}
  f.set(Math.cos(this.pitch)*Math.cos(this.yaw),Math.sin(this.pitch),Math.cos(this.pitch)*Math.sin(this.yaw));
  /* camera sits at the eyepiece, looking along the scope axis */
  this.eye.set(t.x,t.eyeY,t.z);b.root.localToWorld(this.eye);mp.cp.copy(this.eye);mp.cl.copy(this.eye).addScaledVector(f,40);
  const z=Math.tan(cam.fov*SC_D2R/2)/Math.tan(fr/2);if(Math.abs(cam.zoom-z)>z*1e-4){cam.zoom=z;cam.updateProjectionMatrix()}
  /* which moon is in the field of view? */
  this.r.crossVectors(f,_UP).normalize();this.u.crossVectors(this.r,f);let cand=-1,ba=9;
  for(let i=0;i<2;i++){if(!ns.moonUp(i))continue;const m=ns.moonDir(i),a=Math.acos(clamp(f.dot(m),-1,1));if(a<Math.max(fr*.22,ns.angRad(i)*1.4)&&a<ba){ba=a;cand=i}}this.cand=cand;
  const sel=this.lock>=0?this.lock:cand,box=$('sc-box');
  if(sel>=0){const m=ns.moonDir(sel),mz=m.dot(f),th=Math.tan(fr/2),px=(m.dot(this.r)/mz)/(th*cam.aspect),py=(m.dot(this.u)/mz)/th,sz=Math.max(46,ns.angRad(sel)*2/(2*th)*innerHeight*1.35);
   box.style.opacity=mz>0?1:0;box.style.left=((px+1)/2*innerWidth)+'px';box.style.top=((1-py)/2*innerHeight)+'px';box.style.width=box.style.height=sz+'px';box.className=this.lock>=0?'l':'';box.firstChild.textContent=(this.lock>=0?'LOCKED  \u00b7  ':'TARGET  \u00b7  ')+MOON_INFO[sel].n}else box.style.opacity=0;
  const mag=Math.tan(55*SC_D2R/2)/Math.tan(fr/2),fv=this.fov<1?this.fov.toFixed(2):this.fov.toFixed(1),az=(Math.atan2(f.x,-f.z)/SC_D2R+360)%360,el=Math.asin(f.y)/SC_D2R;
  $('sc-mag').textContent='TELESCOPE  \u00b7  \u00d7'+(mag<10?mag.toFixed(1):Math.round(mag))+'  \u00b7  FOV '+fv+'\u00b0';$('sc-az').textContent='AZ '+az.toFixed(1)+'\u00b0   EL '+el.toFixed(1)+'\u00b0'+(this.lock>=0?'   \u00b7   TRACKING':'');
  const key=this.lock+'|'+cand+'|'+(ns.nf>.5?1:0)+'|'+ns.moonUp(0)+ns.moonUp(1);
  if(key!==this.k){this.k=key;const inf=$('sc-info');inf.className=this.lock>=0?'l':'';
   if(this.lock>=0){const M=MOON_INFO[this.lock];inf.innerHTML='<h3>'+M.n+'</h3><span class="k">SIZE</span> '+M.s+'<br><span class="k">ORBIT</span> '+M.o+'<br><span class="k">RADIUS</span> '+M.r+'<br><span class="k">APPARENT</span> '+M.a+'<br><br>'+M.x+'<br><br><span class="k">[F] RELEASE LOCK</span>'}
   else if(cand>=0)inf.innerHTML='<h3>'+MOON_INFO[cand].n+'</h3>TARGET IN FIELD<br><br><span class="k">PRESS</span> [F] <span class="k">TO LOCK ON</span>';
   else inf.innerHTML='<h3>SCANNING</h3>'+(ns.moonUp(0)||ns.moonUp(1)?'Slew toward the low sky and look for Phobos (fast, larger) and Deimos (small, slow).':'No moon above the horizon right now.')+(ns.nf>.5?'':'<br><br><span class="k">DAYTIME: the telescope sensor boosts moons through the sky glare.</span>')}}
}
const _UP=new THREE.Vector3(0,1,0);

export class MarsBase{
 constructor(mp,heightAt){this.mp=mp;this.hAt=heightAt;this.sim=new Sim();this.S=null;this.mode='off';this.active=false;this.interior=false;this.skipExt=false;this.focus=null;this.fogExtra=0;this.fovAdd=0;
  this.p={x:0,z:0,y:EYE_IN,yaw:0,pitch:0};this.hidden=[];this.removedCols=[];this.hudOn=false;this.zoneKey='';this.rigKey='';this.tg=[];this.hz=0;this.stormSaid=false;this.ct=0;this.bob=0;this.farm=new Farm(this);this.tele=new Telemetry(this);this.scope=new Scope(this);this.stormData=null}

 /* ---------------------------------------------- start / stop ---------------------------------------------- */
 arm(force){if(this.mode!=='off')return;const cr=this.mp.salv&&this.mp.salv.cr;if(!force&&!(cr&&cr.mods.length&&cr.built()>=cr.mods.length))return;   /* base phase only after EVERY base area is unlocked */
 this.mode='build';this.armT=0;this.built=false;this.ready=false;this.pre=.6;this.sim.reset();this.hud();const fd=$('b-fade');fd.style.transition='opacity .5s';fd.style.opacity=1;this.fadeT=0;$('b-load').classList.add('on')}   /* no flyover: fade to black, swap old base for the new one under the fade, fade in at the airlock */
 reset(){this.farm.reset();this.tele.close(true);this.scope.exit(true);this.stormData=null;if(this.mode==='off')return;const mp=this.mp;this.mode='off';this.active=false;this.interior=false;this.skipExt=false;this.focus=null;this.fogExtra=0;this.fovAdd=0;mp.r.shadowMap.autoUpdate=true;
  if(this.S){mp.near.remove(this.S.ext);for(const o of[this.S.ext,this.S.int])o.traverse(m=>{if(m.geometry)m.geometry.dispose()});this.S=null}this.job=null;this.restoreRocks();
  for(const id of['b-zone','b-sol','b-prompt','b-hint','b-alert','b-cycle','b-load'])$(id)&&$(id).classList.remove('on','a1','a2');$('b-fade')&&($('b-fade').style.opacity=0);this.audioOff()}
 prompt(h){const pr=$('b-prompt');if(!pr)return;if(pr.innerHTML!==h)pr.innerHTML=h;pr.classList.add('on')}
 hud(){if(this.hudOn)return;this.hudOn=true;const st=document.createElement('style');st.textContent=CSS+CSS2;document.head.appendChild(st);document.body.insertAdjacentHTML('beforeend',HTML+HTML2)}

 /* ---------------------------------------------- site selection ---------------------------------------------- */
 place(){const mp=this.mp,pod=mp.pod,px=pod?pod.x:mp.L.x,pz=pod?pod.z:0;let best=null;
  const BB=mp.salv&&mp.salv.bnd&&mp.salv.bnd.base;for(let k=0;k<(BB?1:12);k++){const a=k/12*TAU+.4,cx=BB?BB.x:px+Math.cos(a)*118,cz=BB?BB.z:pz+Math.sin(a)*118;let mn=1e9,mx=-1e9;
   for(let r=0;r<=RF;r+=11){const n=r?Math.max(6,Math.round(r/5)):1;for(let q=0;q<n;q++){const b=q/n*TAU,h=this.hAt(cx+Math.cos(b)*r,cz+Math.sin(b)*r);if(h<mn)mn=h;if(h>mx)mx=h}}
   let sc=mx-mn;if(Math.hypot(cx-mp.L.x,cz)<RF+30)sc+=100;if(!best||sc<best.sc)best={sc,cx,cz,mn,mx}}
  const level=best.mx+.3;this.site={x:best.cx,z:best.cz,level,depth:level-best.mn+.8};
  this.yaw=Math.atan2(-(px-best.cx),-(pz-best.cz));this.hideRocks()}
 hideRocks(){const m=new THREE.Matrix4(),p=new V3(),z=new THREE.Matrix4().makeScale(0,0,0),S=this.site;
  for(const im of this.mp.rocks.children){if(!im.isInstancedMesh)continue;for(let i=0;i<im.count;i++){im.getMatrixAt(i,m);p.setFromMatrixPosition(m);if(Math.hypot(p.x-S.x,p.z-S.z)<RF+9){this.hidden.push([im,i,m.clone()]);im.setMatrixAt(i,z)}}im.instanceMatrix.needsUpdate=true}
  const c=this.mp.rockCols;for(let i=c.length-1;i>=0;i--)if(Math.hypot(c[i].x-S.x,c[i].z-S.z)<RF+9)this.removedCols.push(...c.splice(i,1))}
 restoreRocks(){const ims=new Set();for(const[im,i,m]of this.hidden){im.setMatrixAt(i,m);ims.add(im)}for(const im of ims)im.instanceMatrix.needsUpdate=true;this.hidden.length=0;this.mp.rockCols.push(...this.removedCols);this.removedCols.length=0}

 /* ---------------------------------------------- scene + build job ---------------------------------------------- */
 makeScene(){const S=this.S={ext:new THREE.Group(),int:new THREE.Group(),sim:this.sim,site:this.site,draw:{map:drawMiniMap,graph:drawMiniGraph,log:drawMiniLog}};
  for(const g of[S.ext,S.int]){g.position.set(this.site.x,this.site.level,this.site.z);g.rotation.y=this.yaw}
  this.intScene=new THREE.Scene();this.intScene.add(new THREE.HemisphereLight(0xffe2c0,0x6a5040,.95),S.int);if(this.mp.envInt){this.intScene.environment=this.mp.envInt;this.intScene.environmentIntensity=.85}   /* metal needs something to reflect */
  this.pool=[];for(let i=0;i<5;i++){const l=new THREE.PointLight(0xffc890,0,18,2);this.pool.push(l);this.intScene.add(l)}
  this.mp.near.add(S.ext);S.ext.updateMatrixWorld(true);S.int.updateMatrixWorld(true);this.root=S.ext}
 *makeJob(){const S=this.S,mg=mapGen();let r;while(!(r=mg.next()).done)yield;S.mapImg=r.value;yield*buildBase(S)}
 stepBuild(){const t0=performance.now();let n=0;while(this.job&&(n===0||performance.now()-t0<5)){const r=this.job.next();n++;if(r.done){this.job=null;this.finishBuild();break}}}
 finishBuild(){this.built=true;const mp=this.mp,S=this.S;S.ext.updateMatrixWorld(true);S.int.updateMatrixWorld(true);this.leaf('inn',0);this.leaf('out',0);
  const done=()=>{this.ready=true};try{Promise.all([mp.r.compileAsync(mp.near,mp.ncam),mp.r.compileAsync(this.intScene,mp.ncam)]).then(done,done)}catch(e){try{mp.r.compile(mp.near,mp.ncam);mp.r.compile(this.intScene,mp.ncam)}catch(_){}done()}}

 /* ---------------------------------------------- helpers ---------------------------------------------- */
 leaf(w,o){const L=this.S.leaf;if(!L||!L.outI)return;if(w==='out'){this.lfOut=o;const y=L.baseY+o*2.45;L.outI.position.y=y;L.outE.position.y=y;L.outI.visible=o<.97;L.outE.visible=o<.97&&!this.interior}else{L.inn.position.x=o*2.8;L.inn.visible=o<.97}}
 groundY(x,z){const a=this.S.airlockInfo,sA=-z;
  if(a&&Math.abs(x)<1.7&&sA>=RH-1&&sA<=a.rampEnd){if(sA<=a.porchS)return F;return F*(1-(sA-a.porchS)/7)}
  const r=Math.hypot(x,z);if(r<RF)return 0;const w=this.root.localToWorld(new V3(x,0,z));return Math.max(this.hAt(w.x,w.z)-this.site.level,-(r-RF)/1.8)}
 zone(x,z){if(x*x+z*z<RH*RH)return{id:'hub',name:'MAIN CONTROL CENTER',sub:'CENTRAL HUB  ·  TELEMETRY & OPERATIONS',win:true};
  for(const sp of SPOKES)for(let i=0;i<sp.regions.length;i++){const r=sp.regions[i],s=x*sp.dx+z*sp.dz,t=x*sp.nx+z*sp.nz;
   if(s>=r.s0&&s<=r.s1&&Math.abs(t)<r.hw+.05){const mod=sp.id!=='air'&&i===1;return{id:sp.id,tun:!mod&&sp.id!=='air',air:sp.id==='air',name:mod?sp.name:sp.id==='air'?'AIRLOCK 1':'CORRIDOR',sub:mod?'':sp.id==='air'?'EVA ENTRY  ·  PRESSURE LOCK':'TO '+sp.name,win:mod?(sp.id==='liv'||sp.id==='gre'):sp.id==='air',s}}}
  return{id:'hub',name:'',sub:'',win:true}}
 free(x,z){const S=this.S;if(x*x+z*z<(RH-.45)*(RH-.45)){for(const o of S.hubObs)if(Math.hypot(x-o[0],z-o[1])<o[2]+.3)return false;return true}
  for(const sp of SPOKES){const s=x*sp.dx+z*sp.dz,t=x*sp.nx+z*sp.nz;for(const r of sp.regions)if(s>=r.s0&&s<=r.s1&&Math.abs(t)<r.hw){let ok=true;for(const o of sp.obs)if(s>o[0]-.3&&s<o[1]+.3&&t>o[2]-.3&&t<o[3]+.3){ok=false;break}if(ok)return true}}return false}
 blockedOut(x,z){const S=this.S,B=this.mp.salv&&this.mp.salv.bnd,ww=this.root.localToWorld(new V3(x,0,z));if(B&&B.R){if(Math.hypot(ww.x-B.cx,ww.z-B.cz)>B.R-1.5)return true}else if(Math.hypot(x,z)>350)return true;
  for(const c of S.cols){if(c.rect){const[x0,x1,z0,z1]=c.rect,qx=clamp(x,x0,x1),qz=clamp(z,z0,z1);if(Math.hypot(x-qx,z-qz)<.45)return true;continue}
   const dx=c.bx-c.ax,dz=c.bz-c.az,l2=dx*dx+dz*dz,t=l2?clamp(((x-c.ax)*dx+(z-c.az)*dz)/l2,0,1):0;if(Math.hypot(x-c.ax-dx*t,z-c.az-dz*t)<c.r)return true}
  const w=this.root.localToWorld(_v.set(x,0,z)),wx=w.x,wz=w.z;for(const c of this.mp.rockCols){const rr=c.r+.45,dx=wx-c.x,dz=wz-c.z;if(dx*dx+dz*dz<rr*rr)return true}return false}

 /* ---------------------------------------------- camera ---------------------------------------------- */
 setCam(){const p=this.p,mp=this.mp,cp=Math.cos(p.pitch);const a=new V3(p.x,p.y+Math.sin(this.bob*9)*.025*(this.moving?1:0),p.z),b=new V3(p.x+Math.cos(p.yaw)*cp*10,a.y+Math.sin(p.pitch)*10,p.z+Math.sin(p.yaw)*cp*10);
  mp.cp.copy(this.root.localToWorld(a));mp.cl.copy(this.root.localToWorld(b))}
 look(dt){const mp=this.mp,k=mp.keys,p=this.p;if(this.tele.on||(mp.dn&&mp.dn.frozen&&mp.dn.frozen())){mp.mdx=mp.mdy=0;return}p.yaw+=mp.mdx*.0025+((k.ArrowRight?1:0)-(k.ArrowLeft?1:0))*1.8*dt;p.pitch=clamp(p.pitch-mp.mdy*.0025+((k.ArrowUp?1:0)-(k.ArrowDown?1:0))*1.2*dt,-1.2,1.2);mp.mdx=mp.mdy=0}
 move(dt,sp,test){if(this.tele.on||(this.mp.dn&&this.mp.dn.frozen&&this.mp.dn.frozen())){this.moving=false;return}const k=this.mp.keys,p=this.p,fx=Math.cos(p.yaw),fz=Math.sin(p.yaw),f=(k.KeyW?1:0)-(k.KeyS?1:0),sd=(k.KeyD?1:0)-(k.KeyA?1:0);let mx=fx*f-fz*sd,mz=fz*f+fx*sd;const l=Math.hypot(mx,mz);this.moving=l>0;if(!l)return;
  const v=sp*dt/l;if(!test(p.x+mx*v,p.z)){p.x+=mx*v}if(!test(p.x,p.z+mz*v)){p.z+=mz*v};this.bob+=sp*dt*.7}

 /* ---------------------------------------------- state machine ---------------------------------------------- */
 /* [SPACE] jump (Mars gravity 3.71 m/s2); height is an offset added to the eye height */
 jmp(dt,v0){const p=this.p;if(this.mp.keys.Space&&!(p.jy>0))p.jv=v0;p.jv=(p.jv||0)-3.71*dt;p.jy=Math.max(0,(p.jy||0)+p.jv*dt);if(p.jy<=0){p.jy=0;if(p.jv<0)p.jv=0}return p.jy}
 update(dt){if(this.mode==='off')return false;if(this.mp.dn&&this.mp.dn.dead)return true;   /* frozen on the death screen */const mp=this.mp;if(this.mode!=='inside'&&this.mode!=='outside'){this.p.jy=0;this.p.jv=0}
  if(this.mode==='build'){if(this.pre>0){this.pre-=dt;if(this.pre<=0){const cr=this.mp.salv&&this.mp.salv.cr;if(cr){for(const m of cr.mods){m.solid.visible=false;m.holo.visible=false}if(cr.hr)cr.hr.visible=false}this.place();this.makeScene();this.job=this.makeJob()}return false}if(this.job)this.stepBuild();if(this.built&&this.ready)this.startDirect();return false}
  const sim=this.sim,s=sim.tick();this.fogExtra=s.L*.0022;
  const fade=$('b-fade');this.t+=dt;
  /* AIRLOCK CUTSCENE FIX: while the lock cycles (and on the walk back into the hub) the exterior pass was still drawn, so the outside world showed through the walls.
     Skip it until the OUTER hatch is actually opening, exactly like the normal in-airlock view. */
  if(this.mode==='cycle'||this.mode==='cycleOut'||this.mode==='walkin2')this.skipExt=!(this.mode==='cycleOut'&&(this.lfOut||0)>.3);
  switch(this.mode){
   case'fly':this.updFly(dt);break;
   case'walkin':this.updWalkIn(dt);break;
   case'cycle':this.updCycle(dt,true);break;
   case'walkin2':this.p.z+=2.2*dt;this.p.pitch*=1-Math.min(1,dt*3);this.moving=true;this.bob+=dt*2;if(this.p.z>-6.2){this.mode='inside';this.moving=false;this.hudMode(true);mp.sub('Mars’ air is about 95% carbon dioxide at under 1% of Earth’s surface pressure, so every module here is a sealed pressure vessel.','MARS FACT',7500)}break;
   case'inside':this.look(dt);this.move(dt,mp.keys.ShiftLeft||mp.keys.ShiftRight?5.5:3.0,(x,z)=>!this.free(x,z));this.p.y=F+EYE_IN+this.jmp(dt,2.7);this.updZone();break;
   case'cycleOut':this.updCycle(dt,false);break;
   case'walkout':this.p.z-=2.4*dt;this.p.yaw=lerp(this.p.yaw,-Math.PI/2,Math.min(1,dt*3));this.moving=true;this.bob+=dt*2;this.p.y=this.groundY(this.p.x,this.p.z)+EYE_OUT;
    if(this.interior&&this.p.z<-13.7){this.setInterior(false)}if(this.p.z<-17){this.mode='outside';this.moving=false;this.hudMode(true);this.leaf('out',0)}break;
   case'outside':if(this.scope.on){this.scope.update(dt);break}this.look(dt);this.move(dt,mp.keys.ShiftLeft||mp.keys.ShiftRight?7:3.6,(x,z)=>this.blockedOut(x,z));this.p.y=this.groundY(this.p.x,this.p.z)+EYE_OUT+this.jmp(dt,3.2);this.updOutside();break}
  if(this.interior)this.updInterior(dt);this.farm.update(dt*((this.mp.dn&&this.mp.dn.spd)||1));
  this.roverDrive();for(const f of this.S.anim)f(dt,s.el);
  this.hudTick(dt,s);this.tele.update(dt);if(!this.scope.on)this.setCam();
  /* fade overlay bookkeeping */
  if(this.fadeT>0){this.fadeT-=dt;if(this.fadeT<=0)fade.style.opacity=0}
  return true}
 dip(ms=450){const f=$('b-fade');f.style.opacity=1;this.fadeT=ms/1000}   // quick dip to black to hide scene swaps

 /* NEW: the parked rover is battered and destroyed by the Sol 4 dust storm (it stays scorched + sparking afterwards).
    Only S.roverFx / S.rover are touched - the orbital shuttle / capsule objects are never modified. Retrying Sol 4 restores the rover. */
 roverDrive(){const fx=this.S&&this.S.roverFx;if(!fx)return;const dn=this.mp.dn,s4=dn&&dn.s4;let want=false,L=0;
  if(dn&&s4){L=s4.L||0;const sol=dn.sol;want=sol>4||(sol===4&&(s4.done||s4.ph==='clear'||(s4.ph==='storm'&&L>.35)))}
  fx.want=want;fx.L=L;
  if(!fx.hooked){fx.hooked=true;fx.onSpark=()=>{const r=fx.g.position,p=this.p;if(this.mode==='off'||Math.hypot(p.x-r.x,p.z-r.z)>30)return;this.mp.tone&&this.mp.tone(1800+Math.random()*2200,.05,.018,'sawtooth')}}}

 startDirect(){const mp=this.mp,p=this.p;this.active=true;this.t=0;this.focus=this.root.position;this.sim.reset();for(const id of['m-walk','m-sol'])$(id)&&$(id).classList.remove('on');if(mp.vitEl)mp.vitEl.classList.add('on');this.fovAdd=0;this.hudMode(false);this.audioOn();$('b-load').classList.remove('on');
  p.x=0;p.z=-28;p.yaw=Math.PI/2;p.pitch=0;p.y=this.groundY(0,-28)+EYE_OUT;this.mode='walkin';this.moving=false;this.fadeT=.7}
 startFly(){const mp=this.mp,root=this.root,S=this.S;this.active=true;this.mode='fly';this.t=0;this.focus=root.position;this.sim.reset();
  for(const id of['m-walk','m-sol'])$(id)&&$(id).classList.remove('on');if(mp.vitEl)mp.vitEl.classList.add('on');
  const v=a=>new V3(a[0],a[1],a[2]);this.cP=new THREE.CatmullRomCurve3([root.worldToLocal(mp.cp.clone()),...FLY_P.map(v)]);this.cL=new THREE.CatmullRomCurve3([root.worldToLocal(mp.cl.clone()),...FLY_L.map(v)]);
  this.capI=0;this.fovAdd=0;mp.sub('Analog habitats such as NASA’s HERA and the Mars Desert Research Station in Utah are used to rehearse long-duration Mars missions on Earth.','HABITAT DESIGN',7000);
  this.hudMode(false);this.audioOn()}
 updFly(dt){const mp=this.mp,t=this.t,x=clamp(t/FLY,0,1),u=lerp(x,x*x*(3-2*x),.55);
  while(this.capI<CAPS.length&&t>=CAPS[this.capI][0]){mp.cap(CAPS[this.capI][1],3000);this.capI++}
  const P=this.cP.getPoint(u),L=this.cL.getPoint(u);this.setCamFrom(P,L);
  if(mp.keys.Enter&&t<FLY-1.5)this.t=FLY-1.5;
  if(t>=FLY){const p=this.p;p.x=0;p.z=-28;p.yaw=Math.PI/2;p.pitch=.0;p.y=this.groundY(0,-28)+EYE_OUT;this.mode='walkin';this.moving=false;this.t=0}}
 setCamFrom(P,L){const mp=this.mp;mp.cp.copy(this.root.localToWorld(P.clone()));mp.cl.copy(this.root.localToWorld(L.clone()))}
 updWalkIn(dt){const p=this.p,tx=0,tz=-11.0,dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);const want=Math.atan2(dz,dx);let da=want-p.yaw;da=Math.atan2(Math.sin(da),Math.cos(da));p.yaw+=da*Math.min(1,dt*4);p.pitch*=1-Math.min(1,dt*3);
  const sp=3.0*dt;p.x+=dx/d*sp*Math.min(1,Math.abs(dz)+.5>1?1:.4);p.z+=dz/d*sp;this.moving=true;this.bob+=dt*2;
  if(!this.interior)p.y=this.groundY(p.x,p.z)+EYE_OUT;else p.y=F+EYE_IN;
  const open=sstep(-26,-21,p.z)*(1-sstep(-14.2,-12.4,p.z));this.leaf('out',this.interior?1-sstep(0,1,this.ct):open);
  if(!this.interior&&p.z>-12.9){this.dip(500);this.setInterior(true);this.ct=0;this.mode='cycle';this.moving=false;this.cycTint=1;$('b-cycle').classList.add('on');$('bc-ph').textContent='CLOSING OUTER HATCH';this.hudMode(false);this.leaf('out',1);this.mp.tone&&this.mp.tone(180,.5,.08,'triangle')}}
 updCycle(dt,inward){const t=this.ct+=dt,p=this.p;const ph=$('bc-ph'),pr=$('bc-p'),bar=$('bc-bar'),dd=$('bc-d');
  const T1=1.2,T2=5.2,T3=6.6;this.moving=false;this.p.pitch*=1-Math.min(1,dt*3);
  if(inward){this.leaf('out',1-sstep(0,1.1,t));const k=sstep(T1,T2,t);pr.textContent=lerp(.7,101.3,k).toFixed(1)+' kPa';bar.style.width=k*100+'%';this.cycTint=1-k;dd.textContent=t<T1?'STANDBY':k<1?'IN PROGRESS':'COMPLETE';
   ph.textContent=t<T1?'CLOSING OUTER HATCH':k<1?'PRESSURIZING':t<T3?'OPENING INNER DOOR':'CYCLE COMPLETE';if(t>T2&&t<T2+.1)this.hiss(.2);if(t>T1&&t<T1+.1)this.hiss(3.6);
   if(t>T2+.2)this.leaf('inn',sstep(T2+.2,T3,t));if(t>T3+.6){this.leaf('inn',1);$('b-cycle').classList.remove('on');this.mode='walkin2';this.cycTint=0}}
  else{this.leaf('inn',1-sstep(0,1.1,t));const k=1-sstep(T1,T2,t);pr.textContent=lerp(.7,101.3,k).toFixed(1)+' kPa';bar.style.width=k*100+'%';this.cycTint=1-k;dd.textContent=t<T1?'STANDBY':k>0?'IN PROGRESS':'COMPLETE';
   ph.textContent=t<T1?'CLOSING INNER DOOR':k>0?'DEPRESSURIZING':t<T3?'OPENING OUTER HATCH':'EVA READY';if(t>T1&&t<T1+.1)this.hiss(3.6);
   if(t>T2+.2)this.leaf('out',sstep(T2+.2,T3,t));if(t>T3+.5){$('b-cycle').classList.remove('on');this.mode='walkout';p.yaw=-Math.PI/2;this.cycTint=0}}
  this.p.y=F+EYE_IN}
 interact(){if(this.mp.dn&&this.mp.dn.dead)return;if(this.scope.on){this.scope.exit();return}if(this.tele.on)return;if(this.mp.dn&&this.mp.dn.modInteract&&this.mp.dn.modInteract())return;if(this.mode==='inside'){if(this.farm.interact())return;if(this.tele.near()){this.tele.open();return}const z=this.zone(this.p.x,this.p.z);if(z.air&&z.s>=RH+3.0){this.mode='cycleOut';this.ct=0;this.cycTint=0;this.hudMode(false);$('b-cycle').classList.add('on');this.mp.tone&&this.mp.tone(180,.5,.08,'triangle')}}
  else if(this.mode==='outside'){if(this.scope.near()&&this.scope.ok()){this.scope.enter();return}const a=this.S.airlockInfo,d=Math.hypot(this.p.x,this.p.z+a.porchS);if(d<7){this.mode='walkin';this.hudMode(false);this.moving=true}}}
 updZone(){const p=this.p,z=this.zone(p.x,p.z),key=z.id+(z.tun?'t':'');
  if(key!==this.zoneKey){this.zoneKey=key;const e=$('b-zone');e.firstElementChild.textContent=z.name;e.lastElementChild.textContent=z.sub;this.skipExt=!z.win;this.rigTo(z.tun?z.id+'_t':z.id);
   for(const sp of SPOKES){const vis=z.id==='hub'||z.id===sp.id,r=this.S.rooms;if(r[sp.id])r[sp.id].visible=vis;if(r[sp.id+'_t'])r[sp.id+'_t'].visible=vis}}
  const pr=$('b-prompt');if(z.air&&z.s>=RH+3.0)this.prompt('<b>E</b>CYCLE AIRLOCK  ·  EXIT TO SURFACE');else if(this.tele.near())this.prompt('<b>E</b>MONITOR STORM TELEMETRY');else pr.classList.remove('on')}
 updOutside(){const a=this.S.airlockInfo,d=Math.hypot(this.p.x,this.p.z+a.porchS),pr=$('b-prompt');if(this.scope.near()&&this.scope.ok())this.prompt('<b>E</b>USE TELESCOPE  \u00b7  PHOBOS & DEIMOS');else if(d<7)this.prompt('<b>E</b>ENTER AIRLOCK 1');else pr.classList.remove('on');
  if(this.sim.s.alert===2&&!this.stormSaid){this.stormSaid=true;this.mp.sub('The 2018 global dust storm blocked so much sunlight that it ended the Opportunity rover’s solar-powered mission.','MARS FACT',7500)}}
 setInterior(on){const r=this.mp.r;this.interior=on;for(const g of this.S.extOnly||[])g.visible=!on;   /* outside-only liners must not hide interior pieces */
 if(on){r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=true;this.fovAdd=14;this.skipExt=false;this.rigTo('air');this.zoneKey='';this.audioHum(1)}else{r.shadowMap.autoUpdate=true;this.fovAdd=6;this.skipExt=false;this.audioHum(0)}}
 hudMode(on){for(const id of['b-zone','b-sol','b-hint'])$(id).classList.toggle('on',on);if(!on)$('b-prompt').classList.remove('on')}

 /* ---------------------------------------------- interior update + lights ---------------------------------------------- */
 rigTo(key){if(key===this.rigKey)return;this.rigKey=key;const R=this.S.rigs[key]||[];
  this.tg=R.map(e=>{const x=e[0],y=e[1],z=e[2];if(e[5]){const sp=e[5],s=key.endsWith('_t')||sp.id==='air'?RH:sp.s0;return{x:sp.dx*s+sp.nx*x+sp.dx*z,y:F+y,z:sp.dz*s+sp.nz*x+sp.dz*z,c:e[3],i:e[4]}}return{x,y:F+y,z,c:e[3],i:e[4]}})}
 updInterior(dt){const S=this.S,k=Math.min(1,dt*4),c=_c;
  for(let i=0;i<5;i++){const l=this.pool[i],t=this.tg[i];if(t){if(l.intensity<1)l.position.set(t.x,t.y,t.z);l.position.x+=(t.x-l.position.x)*k;l.position.y+=(t.y-l.position.y)*k;l.position.z+=(t.z-l.position.z)*k;
    c.setHex(t.c);if(this.rigKey==='air'&&this.cycTint>0)c.lerp(_red,this.cycTint*.8);l.color.copy(c);l.intensity+=(t.i-l.intensity)*k}else l.intensity*=1-k}
  const z=this.mode==='inside'?this.zone(this.p.x,this.p.z):{id:'hub',air:true};
  for(const sc of S.screens){if(sc.room==='*'||(sc.room==='hub'&&(z.id==='hub'||z.tun)))sc.update(dt,this.sim,this.sim.s.el)}}

 /* ---------------------------------------------- HUD text ---------------------------------------------- */
 hudTick(dt,s){this.hz-=dt;if(this.hz>0)return;this.hz=.25;const sol=$('b-sol'),a=$('b-alert');
  sol.firstElementChild.textContent='SOL '+String(s.sol).padStart(4,'0');sol.children[1].textContent=this.sim.hms()+' LMST';sol.lastElementChild.textContent=s.temp.toFixed(0)+' °C  ·  '+s.pres.toFixed(0)+' Pa';
  a.className=s.alert===2?'a2':s.alert===1?'a1':'';a.textContent=s.alert===2?'DUST STORM WARNING  ·  EVA RESTRICTED':s.alert===1?(s.alertName==='CLEARING'?'DUST STORM CLEARING':'DUST ADVISORY  ·  OPACITY RISING'):''}

 /* ---------------------------------------------- rendering hook ---------------------------------------------- */
 renderInterior(cam){const r=this.mp.r;r.render(this.intScene,cam)}   /* NO clearDepth: the interior is depth-tested against the exterior pass, so hulls/glass/tunnels occlude it correctly (no x-ray) */

 /* ---------------------------------------------- audio (hatch hiss + room tone), built on the existing AudioContext ---------------------------------------------- */
 audioOn(){const a=this.mp.audio;if(!a||this.hum)return;try{const ac=a.ac,o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.value=58;g.gain.value=0;o.connect(g);g.connect(ac.destination);o.start();this.hum={o,g}}catch(e){}}
 audioHum(on){if(!this.hum)return;this.hum.g.gain.setTargetAtTime(on?.03:0,this.mp.audio.ac.currentTime,.4)}
 audioOff(){if(this.hum){try{this.hum.o.stop()}catch(e){}this.hum=null}}
 hiss(d){const a=this.mp.audio;if(!a)return;try{const ac=a.ac,s=ac.createBufferSource();s.buffer=a.buf;const f=ac.createBiquadFilter();f.type='highpass';f.frequency.value=2200;const g=ac.createGain();g.gain.setValueAtTime(.0001,ac.currentTime);g.gain.linearRampToValueAtTime(.25,ac.currentTime+.3);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);s.connect(f);f.connect(g);g.connect(ac.destination);s.start();s.stop(ac.currentTime+d+.1)}catch(e){}}
}