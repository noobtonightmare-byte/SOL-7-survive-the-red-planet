/* =====================================================================================================
   daynight.js  -  DAY / NIGHT CYCLE + SOL COUNTER + NIGHT SURVIVAL for the Mars Research Base
   -----------------------------------------------------------------------------------------------------
   * SOL 1 is the 6-task phase (salvage, ice, rocks, crafting table, ... -> every base area unlocked). No night
     pressure there: the clock starts the moment the finished base is entered.
   * DAY    : 5 minutes of daylight (DAY_S). The last 20 s the light fades (dusk).
   * NIGHT  : falls after the day ends.
        - INSIDE the base (airlock / hab / any room): stay SLEEP_S = 25 s  ->  dawn, SOL +1, new 5-minute day.
        - OUTSIDE the base: core temperature drops; after DEATH_S = 25 s you freeze to death.
          (Going back inside makes you recover at 2x speed.)
   * DEATH  : black screen "YOU FROZE TO DEATH - PRESS [R] TO RETRY"; [R] restarts from the beginning of Sol 1.
   SOL 4 ("ISOLATION STORM", RTGs + global dust storm) is the Sol4 class at the bottom of this file.
   Hooks: mars.js  -> this.dn=new DayNight(this); dn.update(dt) after base.update; dn.reset() in resetEntry;
                      this.hemi (hemisphere light) for dimming;  [R] allowed while dn.dead
          base.js  -> freeze while dn.dead
          basescreens.js -> Sim honours sim.ext {sol,tod}
   ===================================================================================================== */
import * as THREE from 'three';
import {stdMat} from './tasks.js';
import {RECIPES,RL} from './crafting.js';
import {D,spoke} from './basebuild.js';
const $=id=>document.getElementById(id),clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const sst=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
export const SOL1_S=75,FF_S=60,DAY_S=300,SLEEP_S=25,DEATH_S=25,DUSK_S=20,WARN_S=30;
const RUN=['inside','outside','cycle','cycleOut','walkin','walkin2','walkout'];   // base modes in which the clock runs
const fmt=t=>{t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
const CSS=`
#dn-bar{position:fixed;left:50%;top:22px;transform:translateX(-50%);z-index:23;padding:8px 22px;font:800 14px Consolas,monospace;letter-spacing:3px;white-space:nowrap;border-radius:4px;opacity:0;transition:opacity .5s,background .4s,border-color .4s,color .4s;pointer-events:none;background:rgba(6,10,18,.66);color:#ffd9a0;border:2px solid #ffb347;text-shadow:0 0 6px #000}
#dn-bar.on{opacity:1}#dn-bar.warn{background:rgba(80,40,0,.82);color:#ffc15a}
#dn-bar.cold{background:rgba(90,10,6,.88);color:#ffb0a0;border-color:#ff5a4a;animation:dnB .7s steps(2) infinite}
#dn-bar.sleep{background:rgba(6,24,48,.85);color:#9fd8ff;border-color:#5de6ff}
@keyframes dnB{50%{opacity:.5}}
#dn-fr{position:fixed;inset:0;z-index:21;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 30%,rgba(150,210,255,.45) 70%,rgba(10,25,50,.95) 100%)}
#dn-dawn{position:fixed;inset:0;z-index:43;pointer-events:none;opacity:0;background:#000;display:flex;align-items:center;justify-content:center;color:#ffe0c0;font:700 26px Consolas,monospace;letter-spacing:10px;text-align:center;transition:opacity .6s}
#dn-dawn small{display:block;margin-top:12px;font-size:13px;letter-spacing:5px;opacity:.7}
`;
export class DayNight{
 constructor(mp){this.mp=mp;this.k=1;this.ex=1;this.built=false;this.s2=new Sol2(mp);this.s3=new Sol3(mp,this);this.s4=new Sol4(mp,this);this.s5=new Sol5(mp,this);this.s6=new Sol6(mp,this);this.s7=new Sol7(mp,this);this.init();this.j5=false;addEventListener('keydown',e=>{if(e.code==='PageDown'&&!e.repeat){e.preventDefault();this.jumpTo(this.sol<5?5:this.sol<6?6:7)}})}
 get len(){return this.sol===1?SOL1_S:this.sol===2?540:this.sol===3?480:this.sol===4?S4_DAY:this.sol===5?S5_DAY:this.sol===6?S6_DAY:DAY_S}   /* Sol 2 has a 9-minute day (the repair job needs the time) */
 init(){this.spd=1;this.god=false;this.cp=null;this.suit={worn:false,heat:SUIT_S};this.sol=1;this.ffSol=0;this.t=0;this.night=false;this.sleep=0;this.cold=0;this.dead=false;this.txt='';this.blight=false}
 build(){if(this.built)return;this.built=true;const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend','<div id="dn-bar"></div><div id="dn-fr"></div><div id="dn-dawn"></div>');this.bar=$('dn-bar');this.fr=$('dn-fr');this.dawnEl=$('dn-dawn')}
 reset(){this.s2.reset();this.s3.reset();this.s4.reset();this.s5.reset();this.s6.reset();this.s7.reset();this.init();this.k=1;this.ex=1;if(!this.built)return;this.bar.className='';this.bar.textContent='';this.fr.style.opacity=0;this.dawnEl.style.opacity=0;
  const mp=this.mp;if(mp.r)mp.r.toneMappingExposure=1;if(mp.sun)mp.sun.intensity=3.4;if(mp.near)mp.near.environmentIntensity=.9;if(mp.hemi)mp.hemi.intensity=1.7;
  const b=$('m-sol');if(b&&b.firstElementChild)b.firstElementChild.textContent='SOL 1'}
 /* local mean solar time in hours: day = 06:00 -> 18:00, night clock only runs while you sleep */
 hour(){return this.night?18+11.99*clamp(this.sleep/SLEEP_S,0,1):6+12*clamp(this.t/this.len,0,1)}
 update(dt){const mp=this.mp,b=mp.base;this.build();dt*=this.spd||1;if(this.j5)this.safe('jump5',()=>{if(b.active&&b.S&&b.S.rooms&&b.S.rooms.gre&&['inside','outside'].includes(b.mode))this.doJump5()});if(this.god&&!this.dead)this.godTick();
  if(this.dead){this.hud();return}
  if(this.s7.busy){this.safe('s7',()=>this.s7.update(dt));this.light(dt,true);this.hud(false);return}   /* SOL 7 cinematic owns the camera and the clock */
  const run=b.active&&RUN.includes(b.mode);
  if(!run){this.light(dt,true);this.hud(false);return}
  const sheltered=!!b.interior;
  if(!this.night){const cap=this.len-FF_S;if(this.tasksDone()&&this.t<cap){this.t=Math.min(cap,this.t+dt*12);if(this.ffSol!==this.sol){this.ffSol=this.sol;mp.cap('ALL TASKS COMPLETE  ·  NIGHT FALLS IN 1:00',3400)}}else this.t+=dt;if(this.sol===4&&this.s4.holdDay())this.t=Math.min(this.t,this.len-DUSK_S-6);if(this.sol===7)this.t=Math.min(this.t,this.len-DUSK_S-6);   /* Sol 7: no night, you launch in daylight */if(this.t>=this.len){const f=this.dayFail();if(f){this.die(f[0],f[1]);return}this.night=true;this.sleep=0;this.cold=0;mp.cap('NIGHTFALL  ·  GET INSIDE THE BASE',3400);mp.tone&&mp.tone(220,.6,.06);this.s3.onNight();this.safe('s5.night',()=>this.s5.onNight())}else this.suit.heat=SUIT_S}
  else if(sheltered){this.suit.heat=Math.min(SUIT_S,this.suit.heat+dt*4);if(this.holdSleep())this.sleep=0;else this.sleep+=dt;this.cold=Math.max(0,this.cold-dt*2);if(this.sleep>=SLEEP_S)this.dawn()}
  else if(this.suit.worn&&this.suit.heat>0){this.sleep=0;this.suit.heat=Math.max(0,this.suit.heat-dt);this.cold=Math.max(0,this.cold-dt)}
  else{this.sleep=0;this.cold+=dt;if(this.cold>=DEATH_S){this.die();return}}
  if(b.sim)b.sim.ext=Object.assign({sol:this.sol,tod:(this.hour()%24)/24},this.s4.ext());
  this.light(dt,false);this.hud(true,sheltered);this.safe('s2',()=>this.s2.update(dt));this.safe('s3',()=>this.s3.update(dt));this.safe('s4',()=>this.s4.update(dt));this.safe('s5',()=>this.s5.update(dt));this.safe('s6',()=>this.s6.update(dt));this.safe('s7',()=>this.s7.update(dt))}
 /* one sol module failing must never stop the other (or the clock): log it and show the error on screen once */
 safe(w,fn){try{return fn()}catch(err){if(this._err!==w+String(err)){this._err=w+String(err);console.error('[daynight '+w+']',err);try{this.mp.salv.tk.toast('SOL ERROR ('+w+'): '+(err&&err.message||err),'#ff5a4a')}catch(e){}}}}

 /* ---------------------------------------------- failure, checkpoints, retry ---------------------------------------------- */
 /* every task of the current sol finished (Sol 2: signal received, Sol 3: suit ready) */
 tasksDone(){return this.sol===1?true:this.sol===2?(this.s2.on&&this.s2.done):this.sol===3?(this.s3.on&&this.s3.dayDone):this.sol===4?(this.s4.on&&this.s4.done):this.sol===5?(this.s5.on&&this.s5.stg>=4):this.sol===6?(this.s6.on&&this.s6.stg>=4):false}
 /* PAGE UP skip: finish the current sol's missions and start the next sol */
 /* [PAGE UP] (testing): COMPLETE the current sol's missions exactly as if they had been played - nothing is reset or removed - then start the next sol */
 /* TEST JUMP ([PAGE DOWN] or the admin-panel button): unlock the base, complete Sols 1-4 exactly like the skip does, top up a Sol 5 kit and start Sol 5 */
 jumpTo5(){return this.jumpTo(5)}
 jumpTo(N){const mp=this.mp,b=mp.base;if(this.dead||this.sol>=N||!mp.walk||!mp.pod)return false;this.j5=N;if(b.mode==='off'&&mp.skipSol)mp.skipSol();try{mp.salv.tk.toast('JUMPING TO SOL '+N+' ...','#ffb347')}catch(e){}return true}
 doJump5(){const N=(this.j5>=2&&this.j5<=7)?this.j5:5;this.j5=false;const mp=this.mp,b=mp.base,s=mp.salv,tk=s.tk,cr=s.cr;
  for(let i=0;i<6&&this.sol<N;i++)this.skipStep();
  const kit={scrap:N>=6?10:6,regolith:4,mineral:N>=6?4:2,ice:4,seeds:12,nitrate:1};if(N>=6){kit.ration=7;kit.o2can=7}
  for(const id in kit){const h=cr.count(id);if(h<kit[id])tk.give(id==='mineral'?'rk_basalt':id,kit[id]-h)}   /* 'mineral' is not an item: minerals are the rk_ rock samples */
  if(cr.count('hammer')<1)tk.give('hammer',1);if(cr.count('bucket')<1)tk.give('bucket',1,{w:10});if(!tk.cru&&cr.count('crucible')<1)tk.give('crucible',1);if(!cr.table&&cr.count('crafting_table')<1)tk.give('crafting_table',1);
  try{tk.after();s.renderSlots(false);s.showName()}catch(e){}this.godTick();
  if(b.mode==='outside'){const p=b.p;p.x=0;p.z=-6.2;p.yaw=Math.PI/2;p.pitch=0;p.y=D.F+1.65;b.mode='inside';b.moving=false;b.ct=0;b.cycTint=0;b.setInterior(true);b.leaf('out',1);b.leaf('inn',1);b.zoneKey='';b.hudMode(true);b.dip(900)}
  tk.toast('SOL '+N+' TEST  \u00b7  SOL 1-'+(N-1)+' DONE  \u00b7  KIT ADDED  \u00b7  PLACE YOUR CRAFTING TABLE IF NEEDED','#7dff9a')}
 skipStep(){if(this.dead||this.sol>=7)return false;
  try{if(this.sol===2)this.s2.complete();else if(this.sol===3)this.s3.complete();else if(this.sol===4)this.s4.complete();else if(this.sol===5)this.s5.complete();else if(this.sol===6)this.s6.complete()}catch(err){console.error('[skip sol '+this.sol+']',err)}
  this.dawn();return true}
 holdSleep(){return(this.sol===3&&this.s3.on&&!this.s3.nightDone)||(this.sol===5&&this.s5.holdSleep())}          /* Sol 3: no sleeping until the night EVA upload is done */
 godTick(){const sv=this.mp.sv;if(sv&&!sv.dead){sv.hp=100;sv.o2=100;sv.wat=100;sv.food=100;sv.rad=0}this.cold=0;this.suit.heat=SUIT_S}   /* admin panel: max vitals / no freezing */
 frozen(){const c=this.mp.salv&&this.mp.salv.cr;return this.s2.freeze||this.s3.freeze||this.s4.freeze||this.s5.freeze||this.s6.freeze||this.s7.freeze||!!(c&&c.admOn)}
 modInteract(){return !!(this.safe('s2.interact',()=>this.s2.interact())||this.safe('s3.interact',()=>this.s3.interact())||this.safe('s4.interact',()=>this.s4.interact())||this.safe('s5.interact',()=>this.s5.interact())||this.safe('s6.interact',()=>this.s6.interact())||this.safe('s7.interact',()=>this.s7.interact()))}
 dayFail(){if(this.sol===2&&this.s2.on&&!this.s2.done)return['SOL 2 FAILED','STORM DAMAGE NOT REPAIRED BEFORE NIGHTFALL'];
  if(this.sol===3&&this.s3.on&&!this.s3.dayDone)return['SOL 3 FAILED','MK-II SUIT NOT READY BEFORE NIGHTFALL'];
  if(this.sol===6&&this.s6.on&&!this.s6.done)return['SOL 6 FAILED','CAPSULE NOT READY BEFORE NIGHTFALL'];return null}
 /* snapshot taken at every dawn: everything the player owns at the START of the new sol */
 takeCp(){const mp=this.mp,s=mp.salv,b=mp.base,f=b.farm,cl=A=>A.map(it=>it?Object.assign({},it):null);if(!s||!s.cr)return;
  this.cp={sol:this.sol,inv:cl(s.inv),bag:cl(s.bag),sel:s.sel,made:Object.assign({},s.cr.made),sv:mp.sv?Object.assign({},mp.sv):null,suit:Object.assign({},this.suit),
   farm:f&&f.ready?f.plots.map(p=>({s:p.s,g:p.g,w:p.w,fert:p.fert,said:p.said})):null,cols:b.S?b.S.cols.length:0,hub:b.S?b.S.hubObs.length:0}}
 /* [R] after a failed / fatal sol: back to the START of the same sol, keeping all earlier progress but none of this sol's */
 retry(){const cp=this.cp,mp=this.mp,b=mp.base,s=mp.salv,tk=s.tk,cr=s.cr;if(!cp||!this.dead)return false;
  /* 1. inventory + crafting history as they were at dawn */
  cp.inv.forEach((it,i)=>{s.inv[i]=it?Object.assign({},it):null});cp.bag.forEach((it,i)=>{s.bag[i]=it?Object.assign({},it):null});s.sel=cp.sel;cr.made=Object.assign({},cp.made);
  if(!cr.table&&cr.count('crafting_table')<1)tk.give('crafting_table',1);          /* never soft-lock the table / melter / bucket */
  if(!tk.cru&&cr.count('crucible')<1)tk.give('crucible',1);if(cr.count('bucket')<1)tk.give('bucket',1,{w:0});
  try{tk.after();s.renderSlots(false);s.showName()}catch(e){}
  /* 2. vitals (rested), greenhouse, suit */
  if(mp.sv){if(cp.sv)Object.assign(mp.sv,cp.sv);mp.sv.dead=false;mp.sv.hp=100;for(const k of['o2','wat','food'])mp.sv[k]=Math.max(mp.sv[k]||0,75);mp.sv.rad=Math.min(mp.sv.rad||0,15)}
  const f=b.farm;if(cp.farm&&f&&f.ready)cp.farm.forEach((q,i)=>{const p=f.plots[i];if(p){Object.assign(p,q);f.paint(p)}});
  this.suit=Object.assign({},cp.suit);
  /* 3. clock */
  this.dead=false;this.sol=cp.sol;this.t=0;this.night=false;this.sleep=0;this.cold=0;this.txt='';this.k=1;this.ex=1;
  /* 4. this sol's world objects + task state are rebuilt from scratch */
  if(b.S){b.S.cols.length=Math.min(b.S.cols.length,cp.cols);b.S.hubObs.length=Math.min(b.S.hubObs.length,cp.hub)}
  if(this.sol<=2){this.s2.reset()}if(this.sol<=3){this.s3.reset()}if(this.sol<=4){this.s4.reset()}if(this.sol<=5){this.s5.reset()}if(this.sol<=6){this.s6.reset()}if(this.sol<=7){this.s7.reset()}
  if(this.sol===2)setTimeout(()=>{if(!this.dead)this.s2.start()},700);if(this.sol===3)setTimeout(()=>{if(!this.dead)this.s3.start()},700);if(this.sol===4)setTimeout(()=>{if(!this.dead)this.s4.start()},700);if(this.sol===5)setTimeout(()=>{if(!this.dead)this.s5.start()},700);if(this.sol===6)setTimeout(()=>{if(!this.dead)this.s6.start()},700);if(this.sol===7)setTimeout(()=>{if(!this.dead)this.s7.start()},700);
  /* 5. put the player back inside the base at the inner airlock door */
  const p=b.p;p.x=0;p.z=-6.2;p.yaw=Math.PI/2;p.pitch=0;p.y=D.F+1.65;b.mode='inside';b.moving=false;b.ct=0;b.cycTint=0;b.setInterior(true);b.leaf('out',1);b.leaf('inn',1);b.zoneKey='';b.hudMode(true);
  const cy=$('b-cycle');if(cy)cy.classList.remove('on');b.dip(900);
  const o=$('m-over');if(o){o.style.transition='none';o.classList.remove('on');o.style.opacity=0;void o.offsetWidth;o.style.transition=''}
  this.fr&&(this.fr.style.opacity=0);this.bar&&(this.bar.className='');mp.mdx=mp.mdy=0;
  mp.cap('SOL '+this.sol+'  ·  RETRY  ·  A NEW DAY BEGINS',3600);mp.tone&&(mp.tone(523,.3,.05),setTimeout(()=>mp.tone(659,.35,.05),180));
  try{mp.lockPtr&&mp.lockPtr()}catch(e){}return true}
 dawn(){this.sol++;this.t=0;this.night=false;this.sleep=0;this.cold=0;const mp=this.mp;this.takeCp();if(this.sol===2)setTimeout(()=>this.s2.start(),900);if(this.sol===3)setTimeout(()=>this.s3.start(),900);if(this.sol===4)setTimeout(()=>this.s4.start(),900);if(this.sol===5)setTimeout(()=>this.s5.start(),900);if(this.sol===6)setTimeout(()=>this.s6.start(),900);if(this.sol===7)setTimeout(()=>{this.s6.onSol7();this.s7.start()},900);
  mp.cap('SOL '+this.sol+'  ·  DAWN  ·  A NEW DAY BEGINS',3600);mp.tone&&(mp.tone(523,.3,.05),setTimeout(()=>mp.tone(659,.35,.05),180),setTimeout(()=>mp.tone(784,.5,.05),380))}
 die(title='YOU FROZE TO DEATH IN THE MARTIAN NIGHT',sub=''){this.dead=true;const mp=this.mp;this.s3.ch=null;this.s2.ch=null;this.s4.ch=null;this.s4.lift=null;this.s5.ch=null;this.s6.ch=null;try{this.s4.silence()}catch(e){};['s2-bar','s3-bar','s4-bar','s4-warn','s4-alert','s5-obj','s6-obj'].forEach(i=>$(i)&&$(i).classList.remove('on'));if(mp.sv)mp.sv.dead=true;try{document.exitPointerLock()}catch(e){}
  const h=document.querySelector('#m-over h1');
  if(h)h.innerHTML=title+'<br><small style="font-size:.45em;letter-spacing:4px">'+(sub?sub+'  ·  ':'')+'SOL '+this.sol+'  ·  PRESS [R] TO RETRY</small>';
  const o=$('m-over');if(o){o.style.opacity='';o.classList.add('on')}
  mp.cap('',1);this.bar.className='';this.fr.style.opacity=0;mp.tone&&mp.tone(90,1.2,.1,'sawtooth')}
 /* dusk / night / dawn lighting. Inside the base the interior keeps normal exposure. */
 light(dt,idle){const mp=this.mp,r=mp.r;if(!r||!mp.sun)return;
  let tk=1;if(!idle)tk=this.night?sst(SLEEP_S-4,SLEEP_S,this.sleep):1-sst(this.len-DUSK_S,this.len,this.t);
  this.k+=(tk-this.k)*Math.min(1,dt*2.5);
  const ex=mp.base.interior?1:lerp(.2,1,this.k);this.ex+=(ex-this.ex)*Math.min(1,dt*4);
  r.toneMappingExposure=this.ex;if(mp.near)mp.near.environmentIntensity=.9*lerp(.12,1,this.k);mp.sun.intensity=3.4*lerp(.05,1,this.k);if(mp.hemi)mp.hemi.intensity=1.7*lerp(.3,1,this.k)}
 hud(on=true,sheltered=false){if(!this.built)return;
  const sl=document.querySelector('#m-sol b');if(sl)sl.textContent='SOL '+this.sol;
  let txt='',cls='';
  if(this.dead){this.bar.className='';this.fr.style.opacity=0;return}
  if(on){
   const s4t=!this.night?(this.sol===4?this.s4.hudText():this.sol===5?this.s5.hudText():this.sol===6?this.s6.hudText():this.sol===7?this.s7.hudText():null):null;if(s4t){txt=s4t[0];cls=s4t[1]}else if(!this.night){const left=this.len-this.t;txt='SOL '+this.sol+'  ·  DAYLIGHT '+fmt(left);if(left<=WARN_S){txt='SOL '+this.sol+'  ·  NIGHTFALL IN '+fmt(left)+'  ·  RETURN TO BASE';cls='warn'}}
   else if(sheltered){txt=this.holdSleep()?(this.sol===5?this.s5.nightText():'SOL '+this.sol+'  ·  NIGHT  ·  RELAY WINDOW OPEN  ·  NIGHT EVA REQUIRED'):'SOL '+this.sol+'  ·  NIGHT  ·  SLEEPING IN BASE  ·  DAWN IN '+fmt(SLEEP_S-this.sleep);cls='sleep'}
   else if(this.suit.worn&&this.suit.heat>0){txt='NIGHT EVA  ·  SUIT HEAT '+fmt(this.suit.heat)+(this.sol===3&&this.holdSleep()?'  ·  REACH THE RELAY MAST':'  ·  GET INSIDE');cls=this.suit.heat<=15?'cold':'warn'}
   else{txt='NIGHT  ·  GET INSIDE  ·  FREEZING  '+fmt(DEATH_S-this.cold);cls='cold'}}
  const key=cls+'|'+txt;if(key!==this.txt){this.txt=key;this.bar.textContent=txt;this.bar.className=on?'on '+cls:''}
  this.fr.style.opacity=on&&this.night&&!sheltered?Math.pow(clamp(this.cold/DEATH_S,0,1),1.3):this.cold>0?clamp(this.cold/DEATH_S,0,1):0}
}

/* =====================================================================================================
   SOL 2  -  "STORM DAMAGE"   (lives in this file; no new module)
   -----------------------------------------------------------------------------------------------------
   Pop-up at the Sol 1 -> Sol 2 dawn:  the night storm damaged solar panels.
   TASK 1  REPLACE THE DAMAGED PANELS : craft SOLAR PANEL (crafting table, new recipe) -> walk to the 4 smoking panels,
                                        [E] installs one at a time (drop-in + spark animation).
   TASK 2  CLEAN THE SOLAR ARRAY      : craft PANEL CLEANER (new recipe) -> fill the WATER TANK with 3 buckets (30 L)
                                        -> [E] at a wash point: a spray sweeps along the row (water-jet animation) and the dust washes off.
   TASK 3  RECEIVE THE SIGNAL         : go to the main hub console, [E] receive the transmission -> ROCKET SHUTTLE REPAIR DATA
                                        goes into the backpack -> Sol 2 complete.
   Hooks: mars.js patchSol2Items(ITEMS) | base.js  s2.interact() at the top of interact(), s2.freeze stops walking during animations
   ===================================================================================================== */
const PX=-40,PZ=8,TILT=.44,CA=Math.cos(TILT),SA=Math.sin(TILT),YC=1.2;               /* the solar field of basebuild.js (4 rows x 6 panels) */
const pxz=(r,c)=>[PX+r*3.6,PZ-10+c*3.7];
const BAD=[[0,1],[0,4],[3,1],[3,4]];                                                  /* damaged panels (row, column): outer lanes, reachable from outside the fence */
const STANDS=[{x:-44.4,z:7.5,rows:[0,1],n:'WEST'},{x:-24.4,z:7.5,rows:[3,2],n:'EAST'}];
const NEED_P=4,TANK_CAP=30,WASH_L=7.5,WASH_T=6,PLACE_T=1.8,POUR_T=1.8,SIG_T=6.5,GW=9;
const EXPOP='SOL 2  \u00b7  STORM DAMAGE';
const NEW2={solarpanel:['SOLAR PANEL','Replacement photovoltaic panel \u00b7 install it on a storm-damaged panel in the solar field'],
 cleaner:['PANEL CLEANER','Pressure sprayer \u00b7 needed (not used up) to wash the dust off the solar panels \u00b7 draws water from the wash tank'],
 shuttledata:['SHUTTLE REPAIR DATA','Data chip from Mission Control \u00b7 repair procedure for the rocket shuttle']};
const m2=(geo,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);return o};
function modelPanel2(){const g=new THREE.Group(),f=stdMat(0xd9dde2,{metalness:.8,roughness:.35}),c=stdMat(0x1f4fb0,{metalness:.5,roughness:.25,emissive:0x0a2260,emissiveIntensity:.5});
 g.add(m2(new THREE.BoxGeometry(.34,.025,.24),f,0,.03,0),m2(new THREE.BoxGeometry(.31,.03,.21),c,0,.035,0));
 for(let i=1;i<4;i++)g.add(m2(new THREE.BoxGeometry(.004,.032,.21),f,-.155+i*.0775,.037,0));g.add(m2(new THREE.BoxGeometry(.31,.032,.004),f,0,.037,0));return g}
function modelCleaner(){const g=new THREE.Group(),t=stdMat(0x37c8d2,{metalness:.5,roughness:.4,emissive:0x0d4a50,emissiveIntensity:.4}),d=stdMat(0x2a2f36,{metalness:.7,roughness:.5}),s=stdMat(0xb9c2cb,{metalness:.85,roughness:.38});
 g.add(m2(new THREE.CylinderGeometry(.06,.06,.16,16),t,0,.09,0),m2(new THREE.CylinderGeometry(.045,.045,.03,14),d,0,.185,0));
 const h=m2(new THREE.TorusGeometry(.07,.008,6,18,Math.PI*1.4),d,.06,.04,0);h.rotation.set(0,0,.4);g.add(h);
 const n=m2(new THREE.CylinderGeometry(.012,.018,.17,10),s,.15,.075,0);n.rotation.z=-1.25;g.add(n,m2(new THREE.BoxGeometry(.04,.07,.03),d,.1,.045,0));return g}
function modelChip(){const g=new THREE.Group(),b=stdMat(0x1c2230,{metalness:.6,roughness:.4}),e=stdMat(0x7dff9a,{emissive:0x1a8a3a,emissiveIntensity:.9,roughness:.4});
 g.add(m2(new THREE.BoxGeometry(.18,.025,.12),b,0,.03,0),m2(new THREE.BoxGeometry(.05,.027,.02),e,-.04,.032,.03),m2(new THREE.BoxGeometry(.05,.027,.02),e,-.04,.032,-.01),m2(new THREE.BoxGeometry(.03,.027,.06),stdMat(0xe0b050,{metalness:.9,roughness:.3}),.075,.032,0));return g}
export function patchSol2Items(I){const hold={x:.28,y:-.26,z:-.68,rx:.3},bd={solarpanel:modelPanel2,cleaner:modelCleaner,shuttledata:modelChip};
 for(const id in NEW2)I[id]={name:NEW2[id][0],unit:'',info:NEW2[id][1],build:bd[id],size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold}}
for(const r of[
 {id:'solarpanel',cat:1,n:2,req:{scrap:3,mineral:2},info:'Replacement solar panel \u00b7 alloy frame + sintered photovoltaic cells \u00b7 makes 2',note:'Carry them to the damaged panels in the solar field and press [E] to install each one.'},
 {id:'cleaner',cat:1,n:1,req:{scrap:3,mineral:1,ice:1},info:'Panel cleaner \u00b7 pressure sprayer with a water hose \u00b7 washes dust off the solar panels',note:'Keep it in your pack. Fill the wash tank with water first, then press [E] at a wash point.'}])
 if(!RECIPES.some(q=>q.id===r.id))RECIPES.push(r);

const CSS2=`
#s2-obj{position:fixed;right:28px;top:124px;width:340px;z-index:30;padding:11px 15px;font:600 12px Consolas,monospace;letter-spacing:1px;color:#e8f4f8;background:rgba(6,10,18,.68);border-right:4px solid #ff8a4c;border-radius:4px;opacity:0;transition:opacity .6s;pointer-events:none}
#s2-obj.on{opacity:1}#s2-obj h3{margin:0 0 8px;font-size:13px;letter-spacing:3px;color:#ffb347}#s2-obj .t{margin:7px 0 3px;font-size:12px;letter-spacing:2px;color:#ffb347}#s2-obj .t.d{color:#7dff9a;text-decoration:line-through;opacity:.6}#s2-obj .t.w{opacity:.4;color:#e8f4f8}
#s2-obj .s{margin:2px 0 2px 12px;opacity:.9}#s2-obj .s.d{opacity:.45;text-decoration:line-through;color:#8fa}
#s2-pop{position:fixed;left:50%;top:24%;transform:translate(-50%,-10px);width:min(720px,80vw);z-index:40;padding:18px 30px;text-align:center;background:rgba(6,10,18,.88);border:2px solid #ff8a4c;border-radius:6px;opacity:0;transition:opacity .5s,transform .5s;pointer-events:none;color:#f2f5fa;font:600 17px "Segoe UI",Arial,sans-serif;line-height:1.55}
#s2-pop.on{opacity:1;transform:translate(-50%,0)}#s2-pop b.h{display:block;font:800 13px Consolas,monospace;letter-spacing:6px;color:#ff8a4c;margin-bottom:8px}
#s2-bar{position:fixed;left:50%;bottom:36%;transform:translateX(-50%);width:380px;z-index:31;padding:8px 14px;font:700 13px Consolas,monospace;letter-spacing:2px;color:#fff;text-align:center;background:rgba(6,10,18,.8);border:1px solid #5de6ff;border-radius:4px;opacity:0;transition:opacity .2s;pointer-events:none}
#s2-bar.on{opacity:1}#s2-bar i{display:block;height:8px;margin-top:6px;background:rgba(255,255,255,.14)}#s2-bar u{display:block;height:100%;width:0;background:#5de6ff}`;
function mkLab2(text,col,w=512,h=96){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false}));spr.renderOrder=9;
 spr.set=(t,c2)=>{if(spr.k===t+c2)return;spr.k=t+c2;x.clearRect(0,0,w,h);x.fillStyle='rgba(4,17,26,.82)';x.fillRect(0,0,w,h);x.strokeStyle=c2;x.lineWidth=4;x.strokeRect(2,2,w-4,h-4);x.font='700 30px Consolas,monospace';x.fillStyle=c2;x.textAlign='center';x.textBaseline='middle';x.fillText(t.slice(0,28),w/2,h/2);tex.needsUpdate=true};spr.set(text,col);return spr}
function ctx2(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
const rnd2=(a,b)=>a+Math.random()*(b-a);

export class Sol2{
 constructor(mp){this.mp=mp;this.dom=false;this.objs=[];this.cols=[];this.hubs=[];this.init()}
 get b(){return this.mp.base}
 get s(){return this.mp.salv}
 get freeze(){return !!this.ch}
 init(){this.on=false;this.done=false;this.task=0;this.placed=0;this.craftN=0;this.hadC=false;this.poured=0;this.tank=0;this.washed=0;this.rowDone=[false,false,false,false];this.ch=null;this.bad=[];this.dust=[];this.tankO=null;this.cs=null;
  this.pts=null;this.hissT=0;this.sparkT=0;this.last='';this.popT=null;this.dirty=false}
 reset(){for(const o of this.objs)if(o.parent)o.parent.remove(o);this.objs=[];const S=this.b&&this.b.S;if(S){for(const c of this.cols){const i=S.cols.indexOf(c);if(i>=0)S.cols.splice(i,1)}for(const c of this.hubs){const i=S.hubObs.indexOf(c);if(i>=0)S.hubObs.splice(i,1)}}this.cols=[];this.hubs=[];for(const id of['s2-obj','s2-pop','s2-bar'])$(id)&&$(id).classList.remove('on');clearTimeout(this.popT);this.init()}
 dom0(){if(this.dom)return;this.dom=true;const st=document.createElement('style');st.textContent=CSS2;document.head.appendChild(st);document.body.insertAdjacentHTML('beforeend','<div id="s2-obj"></div><div id="s2-pop"></div><div id="s2-bar"></div>')}
 /* ---------- inventory helpers ---------- */
 stacks(id){const S=this.s,o=[];for(const A of[S.inv,S.bag])for(const it of A)if(it&&(it.id===id||(id==='mineral'&&it.id.startsWith('rk_'))))o.push(it);return o}
 count(id){return this.stacks(id).reduce((a,it)=>a+(it.n||1),0)}
 take(id,n){const S=this.s;if(this.count(id)<n)return false;for(const A of[S.inv,S.bag])for(let i=0;i<A.length&&n>0;i++){const it=A[i];if(it&&it.id===id){const u=Math.min(n,it.n||1);it.n=(it.n||1)-u;n-=u;if(it.n<=0)A[i]=null}}S.tk.after();return true}
 bucket(){return this.stacks('bucket').find(it=>(it.w||0)>=1)||null}
 toast(t,c){try{this.s.tk.toast(t,c)}catch(e){}}
 tone(f,d=.15,v=.04,ty='triangle'){try{this.mp.tone&&this.mp.tone(f,d,v,ty)}catch(e){}}
 hiss(dur=.25,v=.03,f=2500){const a=this.mp.audio;if(!a||!a.buf)return;try{const ac=a.ac,s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=a.buf;fl.type='highpass';fl.frequency.value=f;g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);s.connect(fl);fl.connect(g);g.connect(ac.destination);s.start(0,Math.random()*1.5,dur+.05)}catch(e){}}
 pop(title,body,ms=9000){this.dom0();const e=$('s2-pop');e.innerHTML='<b class="h">'+title+'</b>'+body;e.classList.add('on');clearTimeout(this.popT);this.popT=setTimeout(()=>e.classList.remove('on'),ms)}
 /* ---------- start (called by DayNight at the Sol 1 -> 2 dawn) ---------- */
 start(){if(this.on||this.done)return;const b=this.b;if(!b||!b.S)return;this.on=true;this.dom0();this.build();$('s2-obj').classList.add('on');
  this.pop(EXPOP,'Last night\u2019s dust storm damaged several of the solar panels. Craft replacement panels at the crafting table, then install them on the damaged panels in the solar field.',10500);
  this.tone(392,.25,.05);setTimeout(()=>this.tone(523,.3,.05),160);this.last=''}
 beacon(inside,x,z,col,txt,h=7){const b=this.b,S=b.S,c=new THREE.Color(col),g=new THREE.Group(),y=inside?D.F:b.groundY(x,z);g.position.set(x,y,z);
  const beam=m2(new THREE.CylinderGeometry(inside?.2:.4,inside?.2:.4,inside?2.4:h,12,1,true),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}),0,(inside?2.4:h)/2,0);
  const ring=m2(new THREE.TorusGeometry(inside?.55:1.1,.06,6,32),new THREE.MeshBasicMaterial({color:c,fog:false}),0,.06,0);ring.rotation.x=Math.PI/2;
  const spr=mkLab2(txt,col);spr.position.set(0,(inside?2.4:h)+.5,0);spr.scale.set(inside?1.9:6.5,inside?.36:1.22,1);g.add(beam,ring,spr);(inside?S.int:S.ext).add(g);this.objs.push(g);g.visible=false;return{g,ring,spr}}
 build(){const b=this.b,S=b.S,ext=S.ext;
  const geo=new THREE.PlaneGeometry(3.2,3.0);geo.rotateX(-Math.PI/2);geo.rotateZ(TILT);const ov=(mat,x,z,off,ro)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x-SA*off,YC+CA*off,z);m.renderOrder=ro;ext.add(m);this.objs.push(m);return m};
  const po={polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2};
  const crackT=ctx2(128,128,(x,w,h)=>{x.fillStyle='#0d1118';x.fillRect(0,0,w,h);const g=x.createRadialGradient(w*.55,h*.45,4,w*.55,h*.45,w*.7);g.addColorStop(0,'rgba(255,140,40,.55)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,w,h);
   x.strokeStyle='rgba(190,200,215,.8)';x.lineWidth=1.5;for(let i=0;i<14;i++){let px=w*.55,py=h*.45,a=rnd2(0,6.28);x.beginPath();x.moveTo(px,py);for(let k=0;k<5;k++){a+=rnd2(-.6,.6);px+=Math.cos(a)*rnd2(8,22);py+=Math.sin(a)*rnd2(8,22);x.lineTo(px,py)}x.stroke()}});
  const crackM=new THREE.MeshStandardMaterial({map:crackT,roughness:.6,metalness:.2,...po});
  const dustT=ctx2(128,128,(x,w,h)=>{for(let i=0;i<260;i++){x.fillStyle='rgba('+(150+rnd2(0,40)|0)+','+(95+rnd2(0,30)|0)+','+(60+rnd2(0,20)|0)+','+rnd2(.25,.7)+')';x.beginPath();x.arc(rnd2(0,w),rnd2(0,h),rnd2(3,14),0,6.3);x.fill()}});
  const newT=ctx2(128,128,(x,w,h)=>{x.fillStyle='#1c4ab0';x.fillRect(0,0,w,h);x.strokeStyle='#9bc4ff';x.lineWidth=2;for(let i=0;i<=4;i++){x.beginPath();x.moveTo(i*32,0);x.lineTo(i*32,h);x.moveTo(0,i*32);x.lineTo(w,i*32);x.stroke()}x.strokeStyle='#e0b050';x.lineWidth=5;x.strokeRect(0,0,w,h)});
  this.newM=new THREE.MeshStandardMaterial({map:newT,roughness:.25,metalness:.55,emissive:0x0a2a70,emissiveIntensity:.5,...po});this.ov=ov;
  for(const[r,c]of BAD){const[x,z]=pxz(r,c);this.bad.push({r,c,x,z,done:false,m:ov(crackM,x,z,.04,2),mk:this.beacon(false,x,z,'#ff8a4c','DAMAGED PANEL')})}
  for(let r=0;r<4;r++)for(let c=0;c<6;c++){const[x,z]=pxz(r,c),mat=new THREE.MeshStandardMaterial({map:dustT,transparent:true,opacity:.62,roughness:1,metalness:0,depthWrite:false,...po,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
   this.dust.push({r,c,z,mat,m:ov(mat,x,z,.07,3)})}
  /* particles: water droplets + sparks */
  const N=520,pg=new THREE.BufferGeometry();this.pp=new Float32Array(N*3).fill(-999);this.pc=new Float32Array(N*3);this.pv=new Float32Array(N*3);this.pl=new Float32Array(N);this.pi=0;this.N=N;
  pg.setAttribute('position',new THREE.BufferAttribute(this.pp,3));pg.setAttribute('color',new THREE.BufferAttribute(this.pc,3));
  this.pts=new THREE.Points(pg,new THREE.PointsMaterial({size:.17,vertexColors:true,transparent:true,opacity:.92,depthWrite:false,sizeAttenuation:true}));this.pts.frustumCulled=false;ext.add(this.pts);this.objs.push(this.pts);
  /* wash points */
  for(const st of STANDS)st.mk=this.beacon(false,st.x,st.z,'#5de6ff','WASH POINT');
  /* water tank (solid) */
  let tx=-21,tz=-3;for(const q of[[-4.5,-18],[4.5,-18],[-4.5,-21],[4.5,-21],[-6,-16],[-21,-3],[-21,-7],[-19,-5]])if(!b.blockedOut(q[0],q[1])){tx=q[0];tz=q[1];break}
  const tg=new THREE.Group(),steel=stdMat(0xb9c2cb,{metalness:.85,roughness:.38}),glass=new THREE.MeshStandardMaterial({color:0x7fc8ff,transparent:true,opacity:.28,roughness:.1,metalness:.2,depthWrite:false}),wat=new THREE.MeshStandardMaterial({color:0x2f9bff,emissive:0x0a3a80,emissiveIntensity:.5,roughness:.2,transparent:true,opacity:.85});
  const water=m2(new THREE.CylinderGeometry(.78,.78,1.7,24),wat,0,1.05,0);water.scale.y=.001;
  tg.add(m2(new THREE.CylinderGeometry(.85,.85,1.9,24),glass,0,1.95,0),water,m2(new THREE.CylinderGeometry(.9,.9,.12,24),steel,0,.98,0),m2(new THREE.CylinderGeometry(.9,.9,.12,24),steel,0,2.92,0));
  for(let i=0;i<4;i++){const a=i*1.57+.78;tg.add(m2(new THREE.CylinderGeometry(.05,.05,1,6),steel,Math.cos(a)*.75,.5,Math.sin(a)*.75))}
  tg.add(m2(new THREE.CylinderGeometry(.04,.04,.9,8),steel,1.0,1.3,0));
  tg.position.set(tx,b.groundY(tx,tz),tz);ext.add(tg);this.objs.push(tg);{const c2={ax:tx,az:tz,bx:tx,bz:tz,r:1.2};S.cols.push(c2);this.cols.push(c2)}
  const tl=mkLab2('WATER TANK  0 / 30 L','#5de6ff');tl.position.set(0,3.8,0);tl.scale.set(5.2,.98,1);tg.add(tl);this.tankO={x:tx,z:tz,water,lab:tl,mk:this.beacon(false,tx,tz,'#5de6ff','WATER TANK',9)};
  this.tankO.mk.spr.visible=false;
  /* hub signal console */
  let cx=0,cz=4.6;for(let i=0;i<24;i++){const a=i*.2618,x=Math.cos(a)*4.6,z=Math.sin(a)*4.6;if([[0,0],[.9,0],[-.9,0],[0,.9],[0,-.9]].every(o=>b.free(x+o[0],z+o[1]))){cx=x;cz=z;break}}
  const cg=new THREE.Group(),dk=stdMat(0x3b4654,{metalness:.6,roughness:.45}),sc=stdMat(0x5de6ff,{emissive:0x5de6ff,emissiveIntensity:.9,roughness:.4});
  cg.add(m2(new THREE.BoxGeometry(1.0,.9,.6),dk,0,.45,0),m2(new THREE.BoxGeometry(.8,.04,.5),sc,0,.93,0),m2(new THREE.CylinderGeometry(.03,.03,.9,8),dk,.35,1.4,0));
  const dish=m2(new THREE.SphereGeometry(.28,14,6,0,6.283,0,1.1),stdMat(0xe8e6e0,{metalness:.3,roughness:.5,side:THREE.DoubleSide}),.35,1.9,0);dish.rotation.x=-1.2;cg.add(dish);
  cg.position.set(cx,D.F,cz);S.int.add(cg);this.objs.push(cg);{const h2=[cx,cz,.8];S.hubObs.push(h2);this.hubs.push(h2)}this.cs={x:cx,z:cz,mk:this.beacon(true,cx,cz,'#7dff9a','COMMS CONSOLE'),dish}}
 /* ---------- particles ---------- */
 emit(x,y,z,vx,vy,vz,life,r,g,bl){const i=this.pi=(this.pi+1)%this.N;this.pp[i*3]=x;this.pp[i*3+1]=y;this.pp[i*3+2]=z;this.pv[i*3]=vx;this.pv[i*3+1]=vy;this.pv[i*3+2]=vz;this.pl[i]=life;this.pc[i*3]=r;this.pc[i*3+1]=g;this.pc[i*3+2]=bl;this.dirty=true}
 fxStep(dt){if(!this.pts)return;let any=false;for(let i=0;i<this.N;i++){if(this.pl[i]<=0)continue;any=true;this.pl[i]-=dt;if(this.pl[i]<=0){this.pp[i*3+1]=-999;continue}this.pv[i*3+1]-=GW*dt;this.pp[i*3]+=this.pv[i*3]*dt;this.pp[i*3+1]+=this.pv[i*3+1]*dt;this.pp[i*3+2]+=this.pv[i*3+2]*dt;if(this.pp[i*3+1]<.05&&this.pv[i*3+1]<0){this.pv[i*3+1]*=-.25;this.pv[i*3]*=.5;this.pv[i*3+2]*=.5}}
  if(any||this.dirty){this.pts.geometry.attributes.position.needsUpdate=true;this.pts.geometry.attributes.color.needsUpdate=true;this.dirty=false}}
 spark(x,y,z,n=10){for(let i=0;i<n;i++)this.emit(x,y,z,rnd2(-2.2,2.2),rnd2(1.5,4.5),rnd2(-2.2,2.2),rnd2(.35,.8),1,rnd2(.65,.9),.25)}
 /* ---------- interaction ---------- */
 near(){const b=this.b,P=b.p;if(!this.on)return null;
  if(b.mode==='inside'){if(this.task===2&&!this.done&&this.cs&&Math.hypot(P.x-this.cs.x,P.z-this.cs.z)<3)return{k:'console'};return null}
  if(b.mode!=='outside')return null;
  if(this.task===0){let best=null,bd=5.5;for(const q of this.bad){if(q.done)continue;const d=Math.hypot(P.x-q.x,P.z-q.z);if(d<bd){bd=d;best=q}}return best?{k:'place',q:best}:null}
  if(this.task===1){if(Math.hypot(P.x-this.tankO.x,P.z-this.tankO.z)<3.8)return{k:'tank'};let best=null,bd=4.8;for(const st of STANDS){const d=Math.hypot(P.x-st.x,P.z-st.z);if(d<bd){bd=d;best=st}}return best?{k:'wash',st:best}:null}
  return null}
 interact(){if(!this.on)return false;if(this.ch)return true;const n=this.near();if(!n)return false;
  if(n.k==='place'){if(this.count('solarpanel')<1){this.toast('NEED A SOLAR PANEL  \u00b7  CRAFT IT AT THE CRAFTING TABLE','#ff5a4a');return true}this.take('solarpanel',1);n.q.done=true;
   const m=this.ov(this.newM,n.q.x,n.q.z,.05,2);m.position.y+=3.4;this.ch={k:'place',t:0,dur:PLACE_T,q:n.q,m,y0:m.position.y,lab:'INSTALLING SOLAR PANEL',hit:false};n.q.mk.g.visible=false;n.q.m.visible=false;this.hiss(.4,.03,1500);return true}
  if(n.k==='tank'){const bk=this.bucket();if(this.tank>=TANK_CAP-.05){this.toast('TANK FULL','#ffb347');return true}if(!bk){this.toast('NEED WATER IN THE BUCKET  \u00b7  MELT ICE FIRST','#ff5a4a');return true}
   const amt=Math.min(bk.w,TANK_CAP-this.tank);this.ch={k:'pour',t:0,dur:POUR_T,bk,amt,lab:'POURING WATER INTO TANK'};this.hiss(POUR_T,.04,1800);return true}
  if(n.k==='wash'){if(this.count('cleaner')<1){this.toast('NEED THE PANEL CLEANER  \u00b7  CRAFT IT AT THE CRAFTING TABLE','#ff5a4a');return true}
   const row=n.st.rows.find(r=>!this.rowDone[r]);if(row===undefined){this.toast('THIS SIDE IS ALREADY CLEAN  \u00b7  TRY THE OTHER WASH POINT','#ffb347');return true}
   if(this.tank<WASH_L-.01){this.toast('NOT ENOUGH WATER IN THE TANK  \u00b7  '+this.tank.toFixed(1)+' L','#ff5a4a');return true}
   this.tank-=WASH_L;this.rowDone[row]=true;this.ch={k:'wash',t:0,dur:WASH_T,row,lab:'WASHING PANEL ROW '+(row+1)+' / 4',x:pxz(row,0)[0]};this.hissT=0;this.tone(300,.15,.04,'sine');return true}
  if(n.k==='console'){this.ch={k:'sig',t:0,dur:SIG_T,lab:'RECEIVING TRANSMISSION',tn:0};this.tone(440,.2,.04);return true}
  return false}
 stepCh(dt){const c=this.ch,b=this.b,p=b.p;c.t+=dt;const u=Math.min(1,c.t/c.dur),bar=$('s2-bar');
  bar.innerHTML=c.lab+'<i><u style="width:'+(u*100).toFixed(0)+'%"></u></i>';bar.classList.add('on');
  if(c.k==='place'){const e=1-Math.pow(1-Math.min(1,u*1.25),3);c.m.position.y=c.y0-3.4*e;if(u>.7&&!c.hit){c.hit=true;this.spark(c.q.x,YC+.4,c.q.z,26);this.tone(660,.18,.05,'square');this.hiss(.25,.04,900)}
   const want=Math.atan2(c.q.z-p.z,c.q.x-p.x);p.yaw+=Math.atan2(Math.sin(want-p.yaw),Math.cos(want-p.yaw))*Math.min(1,dt*5)}
  else if(c.k==='pour'){const k=u*c.amt,M=this.tankO;this.tankO.water.scale.y=Math.max(.001,(this.tank+k)/TANK_CAP);
   for(let i=0;i<3;i++)this.emit(M.x+rnd2(-.2,.2)+(p.x-M.x)*.12,3.1,M.z+rnd2(-.2,.2)+(p.z-M.z)*.12,rnd2(-.2,.2),rnd2(-.4,0),rnd2(-.2,.2),.5,.55,.8,1)}
  else if(c.k==='wash'){const zs=pxz(c.row,0)[1]-1.6,ze=pxz(c.row,5)[1]+1.6,sz=zs+u*(ze-zs),T={x:c.x,y:YC+.5,z:sz};
   const fx=Math.cos(p.yaw),fz=Math.sin(p.yaw),M={x:p.x+fx*.6-fz*.25,y:p.y-.55,z:p.z+fz*.6+fx*.25},dx=T.x-M.x,dz=T.z-M.z,dist=Math.hypot(dx,dz),ft=.55+dist*.03;
   const n=Math.floor(dt*90+Math.random());for(let i=0;i<n;i++)this.emit(M.x,M.y,M.z,dx/ft+rnd2(-.35,.35),(T.y-M.y)/ft+.5*GW*ft+rnd2(-.3,.3),dz/ft+rnd2(-.35,.35),ft+.15,.55,.82,1);
   for(let i=0;i<5;i++)this.emit(T.x+rnd2(-.9,.9),T.y+.1,T.z+rnd2(-.9,.9),rnd2(-.6,.6),rnd2(.6,1.6),rnd2(-.6,.6),.45,.9,.95,1);
   for(const d of this.dust){if(d.r!==c.row)continue;const k=Math.min(1,Math.max(0,(sz-(d.z-1.7))/2.6));d.mat.opacity=Math.min(d.mat.opacity,.62*(1-k));d.m.visible=d.mat.opacity>.02}
   const want=Math.atan2(T.z-p.z,T.x-p.x);p.yaw+=Math.atan2(Math.sin(want-p.yaw),Math.cos(want-p.yaw))*Math.min(1,dt*4);p.pitch+=(-.2-p.pitch)*Math.min(1,dt*3);
   this.hissT-=dt;if(this.hissT<=0){this.hissT=.2;this.hiss(.3,.035,2200)}}
  else if(c.k==='sig'){if(this.cs&&this.cs.dish)this.cs.dish.rotation.y+=dt*3;c.tn-=dt;if(c.tn<=0){c.tn=.55;this.tone(600+Math.random()*500,.08,.025,'sine')}}
  if(u>=1)this.finish(c)}
 finish(c){this.ch=null;$('s2-bar').classList.remove('on');
  if(c.k==='place'){this.placed++;this.toast('SOLAR PANEL INSTALLED  \u00b7  '+this.placed+' / '+NEED_P,'#7dff9a');this.tone(523,.2,.05);if(this.placed>=NEED_P)this.next('PANELS REPLACED','Task 1 complete. The solar field is producing power again. Next: craft a panel cleaner and wash the dust off the panels.')}
  else if(c.k==='pour'){c.bk.w=Math.max(0,c.bk.w-c.amt);this.tank+=c.amt;this.poured+=c.amt;this.s.tk.after();try{this.s.showName()}catch(e){}this.toast('+'+c.amt.toFixed(1)+' L  \u00b7  TANK '+this.tank.toFixed(1)+' / '+TANK_CAP+' L','#5de6ff');this.tone(520,.12,.04)}
  else if(c.k==='wash'){this.washed++;for(const d of this.dust)if(d.r===c.row){d.mat.opacity=0;d.m.visible=false}this.toast('ROW '+(c.row+1)+' CLEAN  \u00b7  '+this.washed+' / 4  \u00b7  TANK '+this.tank.toFixed(1)+' L','#7dff9a');this.tone(660,.2,.05);
   if(this.washed>=4)this.next('SOLAR ARRAY CLEAN','Task 2 complete. Panel output is back to full. Head to the main hub: a transmission is coming in.')}
  else if(c.k==='sig'){this.done=true;const ok=this.s.tk.give('shuttledata',1);this.cs.mk.g.visible=false;
   this.pop('TRANSMISSION RECEIVED','Mission Control has sent the repair procedure for the rocket shuttle.'+(ok?' The SHUTTLE REPAIR DATA chip is in your backpack.':' Your backpack is full: free a slot and use the console again.'),9000);
   setTimeout(()=>this.mp.cap('SOL 2 COMPLETE  \u00b7  SHUTTLE REPAIR DATA RECEIVED',4200),1200);this.tone(523,.3,.05);setTimeout(()=>this.tone(659,.3,.05),180);setTimeout(()=>this.tone(784,.5,.05),380)}
  this.last=''}
 /* [PAGE UP] test skip: finish Sol 2 exactly as if it had been played (panels installed, array clean, signal received) - nothing is removed */
 complete(){if(this.done)return;if(!this.on)this.start();if(!this.on)return;
  if(this.ch){if(this.ch.k==='place'&&this.ch.m)this.ch.m.position.y=this.ch.y0-3.4;this.ch=null}$('s2-bar')&&$('s2-bar').classList.remove('on');
  for(const q of this.bad){if(q.done)continue;q.done=true;q.m.visible=false;q.mk.g.visible=false;this.ov(this.newM,q.x,q.z,.05,2)}
  this.placed=Math.max(this.placed,NEED_P);this.craftN=Math.max(this.craftN,NEED_P);this.hadC=true;this.poured=Math.max(this.poured,TANK_CAP);this.washed=4;this.rowDone=[true,true,true,true];
  for(const d of this.dust){d.mat.opacity=0;d.m.visible=false}
  this.task=2;this.done=true;if(this.cs)this.cs.mk.g.visible=false;
  if(this.s.tk&&this.count('shuttledata')<1)this.s.tk.give('shuttledata',1);this.toast('SOL 2 COMPLETED  \u00b7  SHUTTLE REPAIR DATA IN BACKPACK','#7dff9a');this.last=''}
 next(t,body){this.task++;this.mp.cap(t,3200);setTimeout(()=>this.pop(EXPOP,body,7500),900);this.tone(523,.3,.05);setTimeout(()=>this.tone(659,.35,.05),180)}
 /* ---------- per-frame ---------- */
 update(dt){if(!this.on)return;this.dom0();
  if(this.task===0)this.craftN=Math.max(this.craftN,this.count('solarpanel')+this.placed);if(this.count('cleaner')>0)this.hadC=true;
  this.fxStep(dt);
  if(this.task===0){this.sparkT-=dt;if(this.sparkT<=0){this.sparkT=rnd2(.5,1.1);const q=this.bad.filter(x=>!x.done);if(q.length){const k=q[(Math.random()*q.length)|0];this.spark(k.x,YC+.5,k.z,4)}}}
  if(this.ch)this.stepCh(dt);
  const t=performance.now()/1000;
  for(const q of this.bad){q.mk.g.visible=this.task===0&&!q.done&&!this.done;q.mk.ring.scale.setScalar(1+.12*Math.sin(t*4))}
  for(const st of STANDS){st.mk.g.visible=this.task===1&&st.rows.some(r=>!this.rowDone[r]);st.mk.ring.scale.setScalar(1+.12*Math.sin(t*4))}
  const to=this.tankO;if(to){to.mk.g.visible=this.task===1&&this.tank<TANK_CAP-.05;to.mk.ring.scale.setScalar(1+.12*Math.sin(t*4));if(!this.ch||this.ch.k!=='pour')to.water.scale.y=Math.max(.001,this.tank/TANK_CAP);to.lab.set('WATER TANK  '+this.tank.toFixed(0)+' / '+TANK_CAP+' L','#5de6ff')}
  if(this.cs){this.cs.mk.g.visible=this.task===2&&!this.done;this.cs.mk.ring.scale.setScalar(1+.12*Math.sin(t*4))}
  if(!this.ch){const n=this.near(),pr=$('b-prompt');if(n&&pr){let h='';
   if(n.k==='place')h=this.count('solarpanel')>0?'<b>E</b>INSTALL SOLAR PANEL  \u00b7  '+this.placed+' / '+NEED_P:'NEED A SOLAR PANEL  \u00b7  CRAFT IT AT THE CRAFTING TABLE';
   else if(n.k==='tank')h=this.tank>=TANK_CAP-.05?'TANK FULL':this.bucket()?'<b>E</b>POUR BUCKET INTO TANK  \u00b7  '+this.tank.toFixed(0)+' / '+TANK_CAP+' L':'NEED WATER IN THE BUCKET  \u00b7  MELT ICE FIRST';
   else if(n.k==='wash'){const row=n.st.rows.find(r=>!this.rowDone[r]);h=row===undefined?'THIS SIDE IS CLEAN':this.count('cleaner')<1?'NEED THE PANEL CLEANER':this.tank<WASH_L?'NOT ENOUGH WATER IN THE TANK':'<b>E</b>WASH PANEL ROW '+(row+1)+'  \u00b7  USES '+WASH_L+' L'}
   else if(n.k==='console')h='<b>E</b>RECEIVE SIGNAL';
   if(h){pr.innerHTML=h;pr.classList.add('on')}}}
  this.hud()}
 hud(){const L=(s,d)=>'<div class="s'+(d?' d':'')+'">'+(d?'\u2713 ':'\u25b8 ')+s+'</div>',T=(i,n,s)=>'<div class="t'+(this.done||this.task>i?' d':this.task<i?' w':'')+'">TASK '+(i+1)+'/3  \u00b7  '+n+'</div>'+(this.task===i&&!this.done?s:'');
  const html='<h3>SOL 2  \u00b7  STORM DAMAGE</h3>'
   +T(0,'REPLACE THE DAMAGED PANELS',L('Craft 4 solar panels (crafting table) '+Math.min(NEED_P,this.craftN)+'/'+NEED_P,this.craftN>=NEED_P)+L('Install them on the damaged panels '+this.placed+'/'+NEED_P,this.placed>=NEED_P))
   +T(1,'CLEAN THE SOLAR ARRAY',L('Craft a panel cleaner (crafting table)',this.hadC)+L('Fill the wash tank with 3 buckets '+Math.min(TANK_CAP,this.poured).toFixed(0)+'/'+TANK_CAP+' L',this.poured>=TANK_CAP-.05)+L('Wash the dusty panel rows '+this.washed+'/4',this.washed>=4))
   +T(2,'RECEIVE THE SIGNAL',L('Go to the main hub and receive the signal',this.done));
  if(html!==this.last){this.last=html;$('s2-obj').innerHTML=html}}
}

/* =====================================================================================================
   SOL 3  -  (lives in daynight.js, below Sol 2)  "THE LONG NIGHT"
   -----------------------------------------------------------------------------------------------------
   Sol 3 has an 8-minute day.  The orbiter's relay window opens in the dead of night, so the player must go
   OUTSIDE AT NIGHT, which is impossible in the standard suit (you freeze in 25 s).  The job:

   TASK 1  (no supply drop)   : the player gathers scrap, rare minerals, minerals, regolith and ice themselves
   TASK 2  FABRICATE PARTS    : crafting table (EQUIPMENT tab) - four sub-components
                                 INSULATION LINER x2   (regolith 6, ice 2, mineral 2)
                                 HEAT CELL             (rare 1, mineral 2, scrap 2)
                                 PRESSURE BLADDER      (regolith 4, ice 2, scrap 2)
                                 GOLD VISOR            (rare 1, scrap 1, regolith 2)
   TASK 3  ASSEMBLE THE SUIT  : crafting table (SURVIVAL tab) - MK-II THERMAL EVA SUIT
                                 (2 liner, 1 heat cell, 1 bladder, 1 visor, 2 scrap)
   TASK 4  DON THE SUIT       : select it in the hotbar and press [Q]  (3.5 s sealing sequence)
                                 -> helmet-visor overlay + heat gauge.  The suit holds 60 s of night exposure
                                 (recharges when you are inside the base).
   -- nightfall: the day-tasks must be complete or the Sol is FAILED (daynight.js shows PRESS [R] TO RETRY)
   TASK 5  NIGHT EVA          : go outside, reach the RELAY MAST (~60 m), hold [E] to upload the shuttle repair
                                 data, run back inside.  Sleeping is blocked until the upload is done.
   Hooks: mars.js  patchSol3Items(ITEMS)       daynight.js  dn.s3 = new Sol3(mp,dn), dn.suit, retry checkpoints
   ===================================================================================================== */
export const SUIT_S=60;                    /* seconds of night exposure the MK-II suit can take */
const NEED_REG=12,NEED_ICE=4,NEED_SCRAP=7,NEED_RARE=2,NEED_MIN=4;
const M=(geo,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);return o};
const TPOP='SOL 3  \u00b7  THE LONG NIGHT';

/* ---------------------------------------------- items ---------------------------------------------- */
const NEW3={
 liner:['INSULATION LINER','Silica-aerogel thermal liner wrapped in gold-coated Mylar \u00b7 sub-component of the MK-II suit'],
 heatcell:['HEAT CELL','Rare-earth thermoelectric cell \u00b7 powers the heated undersuit \u00b7 sub-component of the MK-II suit'],
 bladder:['PRESSURE BLADDER','Multi-layer gas-tight bladder with a valve \u00b7 sub-component of the MK-II suit'],
 visor:['GOLD VISOR','Sintered quartz visor with a gold sun / cold coating \u00b7 sub-component of the MK-II suit'],
 suit2:['MK-II THERMAL EVA SUIT','Upgraded astronaut suit with a heated undersuit \u00b7 select it and press [Q] to put it on \u00b7 gives 60 s of exposure at night']};

function modelLiner(){const g=new THREE.Group(),f=stdMat(0xd8dde2,{metalness:.85,roughness:.3}),au=stdMat(0xe0b050,{metalness:.9,roughness:.25,emissive:0x4a3008,emissiveIntensity:.25}),k=stdMat(0x2a2f36,{metalness:.6,roughness:.5});
 const r=M(new THREE.CylinderGeometry(.06,.06,.3,22),f,0,.07,0);r.rotation.z=Math.PI/2;g.add(r);
 for(const s of[-1,1]){const e=M(new THREE.CylinderGeometry(.064,.064,.012,22),au,s*.15,.07,0);e.rotation.z=Math.PI/2;g.add(e)}
 for(const x of[-.07,.07]){const t=M(new THREE.TorusGeometry(.062,.006,6,22),k,x,.07,0);t.rotation.y=Math.PI/2;g.add(t)}
 g.add(M(new THREE.BoxGeometry(.26,.004,.075),au,0,.012,.09));return g}
function modelHeatCell(){const g=new THREE.Group(),b=stdMat(0x23282f,{metalness:.7,roughness:.4}),o=stdMat(0xff7a1f,{emissive:0xff5a0a,emissiveIntensity:.9,roughness:.4}),s=stdMat(0xb9c2cb,{metalness:.85,roughness:.35});
 g.add(M(new THREE.CylinderGeometry(.05,.05,.15,20),b,0,.085,0),M(new THREE.CylinderGeometry(.052,.052,.014,20),o,0,.06,0),M(new THREE.CylinderGeometry(.052,.052,.014,20),o,0,.11,0),
  M(new THREE.CylinderGeometry(.015,.015,.02,10),s,0,.17,0),M(new THREE.BoxGeometry(.045,.01,.03),s,0,.012,0));return g}
function modelBladder(){const g=new THREE.Group(),w=stdMat(0xdfe3e8,{roughness:.6,metalness:.05}),k=stdMat(0x2a2f36,{metalness:.6,roughness:.5}),s=stdMat(0xb9c2cb,{metalness:.85,roughness:.35});
 const b=M(new THREE.SphereGeometry(.1,22,14),w,0,.06,0);b.scale.set(1.5,.5,1.1);g.add(b);
 for(let i=-2;i<=2;i++){const r=M(new THREE.TorusGeometry(.09*(1-Math.abs(i)*.06),.004,6,24),k,i*.05,.06,0);r.rotation.y=Math.PI/2;r.scale.set(1,.5,1.1);g.add(r)}
 const vl=M(new THREE.CylinderGeometry(.014,.014,.05,10),s,.15,.07,0);vl.rotation.z=Math.PI/2;g.add(vl);return g}
function modelVisor(){const g=new THREE.Group(),au=new THREE.MeshStandardMaterial({color:0xe3b04a,metalness:.95,roughness:.12,emissive:0x5a3a08,emissiveIntensity:.35,side:THREE.DoubleSide}),k=stdMat(0x2a2f36,{metalness:.6,roughness:.5});
 const d=M(new THREE.SphereGeometry(.11,26,14,0,Math.PI*2,0,Math.PI*.5),au,0,.02,0);d.scale.set(1.05,.85,1.2);d.rotation.x=-1.15;d.position.y=.1;g.add(d);
 const r=M(new THREE.TorusGeometry(.11,.008,8,28),k,0,.1,0);r.rotation.x=Math.PI/2-1.15;r.scale.set(1.05,1.2,1);g.add(r);return g}
function modelSuit(){const g=new THREE.Group(),w=stdMat(0xe9edf0,{roughness:.7,metalness:.05}),o=stdMat(0xff7a1f,{roughness:.55}),au=new THREE.MeshStandardMaterial({color:0xe3b04a,metalness:.95,roughness:.12,emissive:0x5a3a08,emissiveIntensity:.4}),
  k=stdMat(0x2a2f36,{metalness:.6,roughness:.5}),pk=stdMat(0xb9c2cb,{metalness:.7,roughness:.4}),gl=stdMat(0x5de6ff,{emissive:0x5de6ff,emissiveIntensity:.9,roughness:.3});
 g.add(M(new THREE.BoxGeometry(.2,.24,.12),w,0,.33,0),M(new THREE.BoxGeometry(.21,.045,.125),o,0,.26,0),M(new THREE.BoxGeometry(.11,.07,.01),k,0,.35,.066),M(new THREE.BoxGeometry(.03,.012,.011),gl,-.03,.35,.072),M(new THREE.BoxGeometry(.03,.012,.011),o,.03,.35,.072),
  M(new THREE.BoxGeometry(.16,.2,.07),pk,0,.34,-.095),M(new THREE.CylinderGeometry(.075,.085,.025,18),k,0,.465,0));
 const h=M(new THREE.SphereGeometry(.085,22,16),w,0,.52,0);g.add(h);const v=M(new THREE.SphereGeometry(.07,20,14,-1.1,2.2,.45,1.4),au,0,.52,.03);v.scale.set(1,1,1.05);g.add(v);
 for(const s of[-1,1]){const a=M(new THREE.CylinderGeometry(.034,.03,.2,12),w,s*.13,.31,0);a.rotation.z=s*.28;g.add(a,M(new THREE.CylinderGeometry(.037,.037,.03,12),o,s*.165,.22,0),M(new THREE.SphereGeometry(.036,12,10),k,s*.178,.185,0));
  g.add(M(new THREE.CylinderGeometry(.045,.04,.19,12),w,s*.05,.12,0),M(new THREE.BoxGeometry(.06,.045,.1),k,s*.05,.02,.02),M(new THREE.CylinderGeometry(.047,.047,.025,12),o,s*.05,.07,0))}
 return g}
export function patchSol3Items(I){try{patchSol4Items(I)}catch(e){console.error('[sol4 items]',e)}try{patchSol5Items(I)}catch(e){console.error('[sol5 items]',e)}try{patchSol6Items(I)}catch(e){console.error('[sol6 items]',e)}const hold={x:.28,y:-.26,z:-.68,rx:.3},bd={liner:modelLiner,heatcell:modelHeatCell,bladder:modelBladder,visor:modelVisor,suit2:modelSuit};
 for(const id in NEW3){const big=id==='suit2';I[id]={name:NEW3[id][0],unit:'',info:NEW3[id][1],build:bd[id],size:big?.4:.3,ref:big?.58:.4,cy:big?.29:.05,icon:{rx:big?.15:.5,ry:big?.5:.6},hold}}}

/* ---------------------------------------------- recipes (crafting table) ---------------------------------------------- */
Object.assign(RL,{liner:'INSULATION LINER',heatcell:'HEAT CELL',bladder:'PRESSURE BLADDER',visor:'GOLD VISOR'});
for(const r of[
 {id:'liner',cat:1,n:2,req:{regolith:6,ice:2,mineral:2},info:'Insulation liner \u00b7 regolith silica sintered into aerogel, bonded with ice-gel and wrapped in gold Mylar \u00b7 makes 2',note:'MK-II SUIT sub-component 1 of 4. The suit needs 2 liners.'},
 {id:'heatcell',cat:1,n:1,req:{rare:1,mineral:2,scrap:2},info:'Heat cell \u00b7 rare-earth thermoelectric core in an alloy case \u00b7 powers the heated undersuit',note:'MK-II SUIT sub-component 2 of 4.'},
 {id:'bladder',cat:1,n:1,req:{regolith:4,ice:2,scrap:2},info:'Pressure bladder \u00b7 layered polymer from meltwater and regolith binder, with an alloy valve',note:'MK-II SUIT sub-component 3 of 4.'},
 {id:'visor',cat:1,n:1,req:{rare:1,scrap:1,regolith:2},info:'Gold visor \u00b7 regolith quartz melted and shaped, coated with a rare-earth gold film',note:'MK-II SUIT sub-component 4 of 4.'},
 {id:'suit2',cat:0,n:1,req:{liner:2,heatcell:1,bladder:1,visor:1,scrap:2},info:'MK-II thermal EVA suit \u00b7 heated undersuit, aerogel liner, sealed gold visor \u00b7 survive 60 s outside at night',note:'Select it in the hotbar and press [Q] to put it on.'}])
 if(!RECIPES.some(q=>q.id===r.id))RECIPES.push(r);

/* ---------------------------------------------- css / dom ---------------------------------------------- */
const CSS3=`
#s3-obj{position:fixed;right:28px;top:124px;width:350px;z-index:30;padding:11px 15px;font:600 12px Consolas,monospace;letter-spacing:1px;color:#e8f4f8;background:rgba(6,10,18,.68);border-right:4px solid #5de6ff;border-radius:4px;opacity:0;transition:opacity .6s;pointer-events:none}
#s3-obj.on{opacity:1}#s3-obj h3{margin:0 0 8px;font-size:13px;letter-spacing:3px;color:#ffb347}#s3-obj .t{margin:7px 0 3px;font-size:12px;letter-spacing:2px;color:#ffb347}#s3-obj .t.d{color:#7dff9a;text-decoration:line-through;opacity:.6}#s3-obj .t.w{opacity:.4;color:#e8f4f8}
#s3-obj .s{margin:2px 0 2px 12px;opacity:.9}#s3-obj .s.d{opacity:.45;text-decoration:line-through;color:#8fa}#s3-obj .s.h{opacity:.6;font-size:11px;color:#9fd8ff}
#s3-pop{position:fixed;left:50%;top:24%;transform:translate(-50%,-10px);width:min(740px,80vw);z-index:40;padding:18px 30px;text-align:center;background:rgba(6,10,18,.88);border:2px solid #5de6ff;border-radius:6px;opacity:0;transition:opacity .5s,transform .5s;pointer-events:none;color:#f2f5fa;font:600 17px "Segoe UI",Arial,sans-serif;line-height:1.55}
#s3-pop.on{opacity:1;transform:translate(-50%,0)}#s3-pop b.h{display:block;font:800 13px Consolas,monospace;letter-spacing:6px;color:#5de6ff;margin-bottom:8px}
#s3-bar{position:fixed;left:50%;bottom:36%;transform:translateX(-50%);width:400px;z-index:31;padding:8px 14px;font:700 13px Consolas,monospace;letter-spacing:2px;color:#fff;text-align:center;background:rgba(6,10,18,.8);border:1px solid #ffb347;border-radius:4px;opacity:0;transition:opacity .2s;pointer-events:none}
#s3-bar.on{opacity:1}#s3-bar i{display:block;height:8px;margin-top:6px;background:rgba(255,255,255,.14)}#s3-bar u{display:block;height:100%;width:0;background:#ffb347}
#s3-vz{position:fixed;inset:0;z-index:20;pointer-events:none;opacity:0;transition:opacity 1.2s;
 background:radial-gradient(ellipse 80% 76% at 50% 50%,rgba(0,0,0,0) 73%,rgba(255,179,71,.28) 75%,rgba(0,0,0,0) 77%),radial-gradient(ellipse 78% 74% at 50% 50%,rgba(0,0,0,0) 62%,rgba(8,12,20,.5) 82%,rgba(4,6,10,.93) 100%),linear-gradient(180deg,rgba(255,190,90,.08),rgba(0,0,0,0) 32%)}
#s3-vz.on{opacity:1}#s3-vz::before{content:'';position:absolute;left:12%;top:9%;width:20%;height:3px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.35),rgba(255,255,255,0));transform:rotate(-14deg);border-radius:3px}
#s3-vz::after{content:'MK-II  \\00b7  HELMET SEALED';position:absolute;left:50%;top:6.5%;transform:translateX(-50%);font:700 10px Consolas,monospace;letter-spacing:5px;color:rgba(255,179,71,.65)}
#s3-heat{position:fixed;left:28px;top:98px;width:230px;z-index:22;padding:7px 12px;font:700 11px Consolas,monospace;letter-spacing:3px;color:#ffd9a0;background:rgba(6,10,18,.62);border-left:4px solid #ffb347;border-radius:4px;opacity:0;transition:opacity .6s;pointer-events:none}
#s3-heat.on{opacity:1}#s3-heat i{display:block;height:6px;margin-top:5px;background:rgba(255,255,255,.15)}#s3-heat u{display:block;height:100%;background:#5de6ff}#s3-heat.lo{border-left-color:#ff5a4a;color:#ffb0a0}#s3-heat.lo u{background:#ff5a4a}`;
function lab3(text,col,w=512,h=96){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false}));spr.renderOrder=9;
 x.fillStyle='rgba(4,17,26,.82)';x.fillRect(0,0,w,h);x.strokeStyle=col;x.lineWidth=4;x.strokeRect(2,2,w-4,h-4);x.font='700 30px Consolas,monospace';x.fillStyle=col;x.textAlign='center';x.textBaseline='middle';x.fillText(text.slice(0,28),w/2,h/2);tex.needsUpdate=true;return spr}

/* ---------------------------------------------- the Sol ---------------------------------------------- */
export class Sol3{
 constructor(mp,dn){this.mp=mp;this.dn=dn;this.dom=false;this.objs=[];this.cols=[];this.hubs=[];this.init();this.keyHook()}
 get b(){return this.mp.base}
 get s(){return this.mp.salv}
 get freeze(){return !!this.ch}
 init(){this.on=false;this.opened=false;this.left=null;this.lootT=3;this.el3=0;this.fullT=-99;this.m0={};this.dayDone=false;this.nightDone=false;this.ch=null;this.crate=null;this.mast=null;this.last='';this.popT=null;this.pg={};this.cur=0}
 reset(){for(const o of this.objs)if(o.parent)o.parent.remove(o);this.objs=[];const S=this.b&&this.b.S;
  if(S){for(const c of this.cols){const i=S.cols.indexOf(c);if(i>=0)S.cols.splice(i,1)}for(const c of this.hubs){const i=S.hubObs.indexOf(c);if(i>=0)S.hubObs.splice(i,1)}}this.cols=[];this.hubs=[];
  for(const id of['s3-obj','s3-pop','s3-bar','s3-vz','s3-heat'])$(id)&&$(id).classList.remove('on','lo');clearTimeout(this.popT);this.init()}
 dom0(){if(this.dom)return;this.dom=true;const st=document.createElement('style');st.textContent=CSS3;document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend','<div id="s3-obj"></div><div id="s3-pop"></div><div id="s3-bar"></div><div id="s3-vz"></div><div id="s3-heat"></div>')}
 /* [Q] with the suit selected in the hotbar puts it on (captured before the normal [Q] "use item" handler) */
 keyHook(){addEventListener('keydown',e=>{if(e.code!=='KeyQ'||e.repeat||!this.mp.walk||!this.on)return;const tk=this.s.tk,m=this.b.mode;if(tk.ui||(m!=='inside'&&m!=='outside'))return;
  const it=tk.held();if(!it||it.id!=='suit2')return;e.stopImmediatePropagation();e.preventDefault();
  if(this.dn.suit.worn){this.toast('SUIT ALREADY WORN','#ffb347');return}if(this.ch)return;
  this.ch={k:'don',t:0,dur:3.5,lab:'SEALING MK-II SUIT  \u00b7  HELMET LOCK'};this.hiss(.5,.04,1500);this.tone(330,.2,.04)},true)}
 /* ---------- helpers ---------- */
 stacks(id){const S=this.s,o=[];for(const A of[S.inv,S.bag])for(const it of A)if(it&&(it.id===id||(id==='mineral'&&it.id.startsWith('rk_'))))o.push(it);return o}
 count(id){return this.stacks(id).reduce((a,it)=>a+(it.n||1),0)}
 take(id,n){const S=this.s;if(this.count(id)<n)return false;for(const A of[S.inv,S.bag])for(let i=0;i<A.length&&n>0;i++){const it=A[i];if(it&&it.id===id){const u=Math.min(n,it.n||1);it.n=(it.n||1)-u;n-=u;if(it.n<=0)A[i]=null}}S.tk.after();try{S.showName()}catch(e){}return true}
 toast(t,c){try{this.s.tk.toast(t,c)}catch(e){}}
 tone(f,d=.15,v=.04,ty='triangle'){try{this.mp.tone&&this.mp.tone(f,d,v,ty)}catch(e){}}
 hiss(dur=.25,v=.03,f=2500){const a=this.mp.audio;if(!a||!a.buf)return;try{const ac=a.ac,s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=a.buf;fl.type='highpass';fl.frequency.value=f;g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);s.connect(fl);fl.connect(g);g.connect(ac.destination);s.start(0,Math.random()*1.5,dur+.05)}catch(e){}}
 pop(title,body,ms=9000){this.dom0();const e=$('s3-pop');e.innerHTML='<b class="h">'+title+'</b>'+body;e.classList.add('on');clearTimeout(this.popT);this.popT=setTimeout(()=>e.classList.remove('on'),ms)}
 beacon(inside,x,z,col,txt,h=8){const b=this.b,S=b.S,c=new THREE.Color(col),g=new THREE.Group(),y=inside?D.F:b.groundY(x,z);g.position.set(x,y,z);
  const hh=inside?2.4:h,beam=M(new THREE.CylinderGeometry(inside?.2:.4,inside?.2:.4,hh,12,1,true),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}),0,hh/2,0);
  const ring=M(new THREE.TorusGeometry(inside?.55:1.1,.06,6,32),new THREE.MeshBasicMaterial({color:c,fog:false}),0,.06,0);ring.rotation.x=Math.PI/2;
  const spr=lab3(txt,col);spr.position.set(0,hh+.5,0);spr.scale.set(inside?1.9:6.5,inside?.36:1.22,1);g.add(beam,ring,spr);(inside?S.int:S.ext).add(g);this.objs.push(g);g.visible=false;return{g,ring}}
 /* ---------- start ---------- */
 build(){const b=this.b,S=b.S;
  /* SOL 3: no supply drop - the player gathers the suit materials themselves */
  /* relay mast outside, ~60 m north of the airlock */
  let mx=0,mz=-60;for(const q of[[0,-62],[16,-60],[-16,-60],[30,-54],[-30,-54],[0,-50],[22,-46],[-22,-46]]){if(![[0,0],[2,0],[-2,0],[0,2],[0,-2]].some(o=>b.blockedOut(q[0]+o[0],q[1]+o[1]))){mx=q[0];mz=q[1];break}}
  const mg=new THREE.Group(),st=stdMat(0xd8dde2,{metalness:.75,roughness:.35}),lamp=new THREE.MeshStandardMaterial({color:0xff3a2a,emissive:0xff3a2a,emissiveIntensity:1.2});
  mg.add(M(new THREE.CylinderGeometry(.9,1.05,.25,18),st,0,.12,0),M(new THREE.CylinderGeometry(.09,.13,7,10),st,0,3.7,0),M(new THREE.BoxGeometry(1.5,.08,.08),st,0,5.2,0),M(new THREE.BoxGeometry(.08,.08,1.5),st,0,4.4,0));
  const dish=M(new THREE.SphereGeometry(.9,20,8,0,6.283,0,1.05),new THREE.MeshStandardMaterial({color:0xe8e6e0,metalness:.3,roughness:.5,side:THREE.DoubleSide}),0,7.0,0);dish.rotation.x=-.9;mg.add(dish,M(new THREE.SphereGeometry(.12,10,8),lamp,0,7.35,0),M(new THREE.BoxGeometry(1.2,.05,.8),stdMat(0x1f4fb0,{metalness:.5,roughness:.3,emissive:0x0a2260,emissiveIntensity:.5}),1.1,2.2,0));
  mg.position.set(mx,b.groundY(mx,mz),mz);S.ext.add(mg);this.objs.push(mg);const col={ax:mx,az:mz,bx:mx,bz:mz,r:1.0};S.cols.push(col);this.cols.push(col);
  this.mast={x:mx,z:mz,g:mg,dish,lamp,mk:this.beacon(false,mx,mz,'#5de6ff','RELAY MAST',11)}}
 start(){if(this.on)return;const b=this.b;if(!b||!b.S)return;this.on=true;this.dom0();this.auto=0;this.m0=Object.assign({},this.s.cr.made);try{if(this.s.tk&&this.count('shuttledata')<1)this.s.tk.give('shuttledata',1)}catch(e){}try{this.build()}catch(err){console.error('[sol3 build]',err);this.toast('SOL 3 BUILD ERROR: '+(err&&err.message||err),'#ff5a4a')}
  const o2=$('s2-obj');if(o2)o2.classList.remove('on');$('s3-obj').classList.add('on');
  this.pop(TPOP,'The orbiter\u2019s relay window opens in the dead of night \u2014 and your standard suit cannot survive that. Gather scrap, rare minerals, minerals, regolith and water ice, fabricate an MK-II thermal suit at the crafting table and put it on before nightfall. Fail, and the Sol is lost.',11500);
  this.tone(392,.25,.05);setTimeout(()=>this.tone(523,.3,.05),160);this.last=''}
 /* [PAGE UP] test skip: finish Sol 3 as if played (supplies received, MK-II suit made and worn, shuttle data uploaded) */
 complete(){if(!this.on)this.start();if(!this.on)return;if(this.dayDone&&this.nightDone)return;
  const cr=this.s.cr,su=this.dn.suit;this.ch=null;$('s3-bar')&&$('s3-bar').classList.remove('on');
  for(const id of['liner','heatcell','bladder','visor','suit2'])cr.made[id]=Math.max(cr.made[id]||0,(this.m0[id]||0)+1);
  su.worn=true;su.heat=SUIT_S;this.dayDone=true;this.nightDone=true;
  if(this.mast)this.mast.mk.g.visible=false;
  if(this.count('shuttledata')>0)this.take('shuttledata',1);this.toast('SOL 3 COMPLETED','#7dff9a');this.last=''}
 onNight(){if(!this.on||this.dn.sol!==3||!this.dayDone)return;this.pop('NIGHT EVA  \u00b7  RELAY WINDOW OPEN','Go outside to the RELAY MAST (about 60 m north of the airlock) and hold [E] to upload the repair data. Your suit holds 60 seconds of heat \u2014 then run back inside!',9500)}
 /* ---------- interaction ---------- */
 near(){const b=this.b,P=b.p;if(!this.on||this.dn.sol!==3)return null;
  if(b.mode==='inside')return null;
  if(b.mode==='outside'&&this.dn.night&&this.dayDone&&!this.nightDone&&this.mast&&Math.hypot(P.x-this.mast.x,P.z-this.mast.z)<4.2)return{k:'mast'};return null}
 interact(){if(!this.on)return false;if(this.ch)return true;const n=this.near();if(!n)return false;
  if(n.k==='mast'){if(this.count('shuttledata')<1){this.toast('NEED THE SHUTTLE REPAIR DATA CHIP','#ff5a4a');return true}this.ch={k:'mast',t:0,dur:9,lab:'UPLOADING SHUTTLE REPAIR DATA',tn:0};this.tone(440,.2,.04);return true}
  return false}
 stepCh(dt){const c=this.ch,p=this.b.p;c.t+=dt;const u=Math.min(1,c.t/c.dur),bar=$('s3-bar');bar.innerHTML=c.lab+'<i><u style="width:'+(u*100).toFixed(0)+'%"></u></i>';bar.classList.add('on');
  if(c.k==='mast'){this.mast.dish.rotation.y+=dt*3;c.tn-=dt;if(c.tn<=0){c.tn=.5;this.tone(600+Math.random()*500,.08,.025,'sine')}const want=Math.atan2(this.mast.z-p.z,this.mast.x-p.x);p.yaw+=Math.atan2(Math.sin(want-p.yaw),Math.cos(want-p.yaw))*Math.min(1,dt*4)}
  else if(c.k==='don'){p.pitch+=(.35-p.pitch)*Math.min(1,dt*4);if(u>.6&&!c.h){c.h=1;this.hiss(.6,.05,900);this.tone(660,.15,.04,'square')}}
  if(u>=1)this.finish(c)}
 finish(c){this.ch=null;$('s3-bar').classList.remove('on');
  if(c.k==='don'){if(!this.take('suit2',1))return;const su=this.dn.suit;su.worn=true;su.heat=SUIT_S;this.toast('MK-II SUIT SEALED  \u00b7  HEAT RESERVE '+SUIT_S+' s','#7dff9a');this.tone(523,.25,.05);setTimeout(()=>this.tone(784,.4,.05),160);this.mp.cap('MK-II SUIT ON  \u00b7  HELMET SEALED',3200)}
  else if(c.k==='mast'){this.take('shuttledata',1);this.nightDone=true;this.mast.mk.g.visible=false;this.pop('UPLOAD COMPLETE','The orbiter has the shuttle repair data. Get back INSIDE the base \u2014 your suit heat is running down.',7000);this.mp.cap('SOL 3  \u00b7  NIGHT EVA COMPLETE',3800);this.tone(523,.3,.05);setTimeout(()=>this.tone(659,.3,.05),180);setTimeout(()=>this.tone(784,.5,.05),380)}
  this.last=''}
 /* ---------- per frame ---------- */
 update(dt){if(!this.on)return;this.dom0();const dn=this.dn,sol=dn.sol,su=dn.suit,cr=this.s.cr,made=id=>(cr.made[id]||0)-(this.m0[id]||0);
  const p=this.pg={liner:made('liner')>0,cell:made('heatcell')>0,bladder:made('bladder')>0,visor:made('visor')>0,suit:made('suit2')>0,worn:su.worn};p.parts=p.liner&&p.cell&&p.bladder&&p.visor;
  this.cur=!p.parts?0:!p.suit?1:!p.worn?2:!this.nightDone?3:4;
  if(sol===3&&!this.dayDone&&this.cur>=3){this.dayDone=true;this.pop('SUIT READY','MK-II suit is on. Use the remaining daylight to top up your reserves. At nightfall, go to the RELAY MAST.',7500);this.mp.cap('DAY TASKS COMPLETE',3000);this.tone(660,.2,.05)}
  if(this.ch)this.stepCh(dt);
  this.el3+=dt;
  const t=performance.now()/1000;
  if(this.mast){const vis=sol===3&&dn.night&&this.dayDone&&!this.nightDone;this.mast.mk.g.visible=vis;this.mast.mk.ring.scale.setScalar(1+.12*Math.sin(t*4));this.mast.lamp.emissiveIntensity=Math.sin(t*5)>0?1.6:.15}
  if(!this.ch){const n=this.near(),pr=$('b-prompt'),m=this.b.mode;let h='';
   if(n&&n.k==='mast')h=this.count('shuttledata')>0?'<b>E</b>UPLOAD REPAIR DATA  \u00b7  HOLD POSITION':'NEED THE SHUTTLE REPAIR DATA CHIP';
   else{const it=this.s.tk.held();if(it&&it.id==='suit2'&&!su.worn&&(m==='inside'||m==='outside'))h='<b>Q</b>WEAR MK-II THERMAL EVA SUIT'}
   if(h&&pr){pr.innerHTML=h;pr.classList.add('on')}}
  /* suit visor + heat gauge */
  $('s3-vz').classList.toggle('on',su.worn);const hg=$('s3-heat');hg.classList.toggle('on',su.worn);hg.classList.toggle('lo',su.heat<=15);
  if(su.worn)hg.innerHTML='MK-II SUIT  \u00b7  HEAT '+fmt(su.heat)+'<i><u style="width:'+(clamp(su.heat/SUIT_S,0,1)*100).toFixed(0)+'%"></u></i>';
  $('s3-obj').classList.toggle('on',sol===3);
  this.hud()}
 hud(){const p=this.pg,dn=this.dn,L=(s,d,h)=>'<div class="s'+(d?' d':'')+(h?' h':'')+'">'+(d?'\u2713 ':h?'':'\u25b8 ')+s+'</div>',
  T=(i,n,body)=>'<div class="t'+(this.cur>i?' d':this.cur<i?' w':'')+'">TASK '+(i+1)+'/4  \u00b7  '+n+'</div>'+(this.cur===i?body:'');
  const rg=this.count('regolith'),ic=this.count('ice'),sc=this.count('scrap'),ra=this.count('rare'),mi=this.count('mineral');
  const html='<h3>SOL 3  \u00b7  THE LONG NIGHT</h3>'
   +T(0,'FABRICATE SUIT PARTS',L('Insulation liner (x2)',p.liner)+L('Heat cell',p.cell)+L('Pressure bladder',p.bladder)+L('Gold visor',p.visor)+L('Raw: regolith '+Math.min(rg,99)+'/'+NEED_REG+'  \u00b7  water ice '+Math.min(ic,99)+'/'+NEED_ICE+'  (dig / ice patch)',false,true)+L('Also needed: scrap '+Math.min(sc,99)+'/'+NEED_SCRAP+'  \u00b7  rare '+Math.min(ra,99)+'/'+NEED_RARE+'  \u00b7  minerals '+Math.min(mi,99)+'/'+NEED_MIN+'  (scrap field / rare crystals / mineral veins)',false,true))
   +T(1,'ASSEMBLE THE MK-II SUIT',L('Craft it at the table (SURVIVAL tab)',p.suit))
   +T(2,'PUT ON THE SUIT',L('Select it in the hotbar, press [Q]',p.worn))
   +T(3,'NIGHT EVA',(dn.night?L('Go outside to the relay mast (60 s heat)',this.nightDone)+L('Hold [E] to upload the data',this.nightDone)+L('Return inside to sleep',false):L('Wait for nightfall  \u00b7  be ready at the airlock',false)));
  if(html!==this.last){this.last=html;$('s3-obj').innerHTML=html}}
}

/* =====================================================================================================
   SOL 4  -  "ISOLATION STORM"   (lives in daynight.js, below Sol 3; no new module)
   -----------------------------------------------------------------------------------------------------
   Starts at the Sol 3 -> Sol 4 dawn. The day is long and the clock is HELD until the storm has been survived.

   TASK 1  COLLECT THE HMSA MESSAGE : go to the glowing console in the main hub, hold [E].  The message warns of a
                                      global dust storm, explains why solar power is useless in it and why RTGs are
                                      the answer.  4 sealed PU-238 FUEL CAPSULES + a small parts top-up go to your pack.
                                      -> the 5:00 COUNTDOWN starts (this is the only timer the player sees).
   TASK 2  CRAFT 4 RTGs             : crafting table (EQUIPMENT tab): RTG = capsule + 2 scrap + 1 mineral + 1 regolith
                                      (RTG_REQ below).  The supply drop tops up scrap / minerals / regolith to a small
                                      minimum, so a quick player needs ~1-3 minutes.
   TASK 3  INSTALL THE RTGs         : 4 blueprint pads on the ground outside the airlock.  [E] on a pad: the RTG is
                                      lowered from the sky on a beam, lands in a burst of dust + sparks and powers up.
                                      The existing solar panels are NOT touched.
   (3:00 left)  the storm front becomes visible on the horizon and rolls in.    (0:25 left) warning: GET INSIDE.
   (0:00)       IMPACT.  Not all 4 RTGs installed  ->  SOL 4 FAILED  ->  [R] retries from the start of Sol 4.
   TASK 4  TEST THE STORM FROM THE COMPUTER : when the storm hits, go to the hub computer (the same console) and press [E]:
                                      a 6 s storm test runs and a report pops up; the storm clears ~12 s after the test.
                                      Stay inside meanwhile (was: survive 90 s, never shown).  Stay inside.  Pressing [E] at the airlock during the storm
                                      first shows a warning; overriding it (second [E]) lets the wind lift you into
                                      the sky and kill you.  Being outside when the storm hits does the same.
   Then "STORM SURVIVED"  ->  the clock runs on to night  ->  Sol 5.
   Hooks: daynight.js only (DayNight owns dn.s4).  nightsky.js: uStorm uniform.  basescreens.js: Sim honours
          sim.ext {L, al, alName, rtg}.   patchSol3Items() also registers the Sol 4 items.
   ===================================================================================================== */
export const S4_DAY=900,S4_PREP=300,S4_SEE=180,S4_WARN=25,S4_STORM=90,S4_CLEAR=16,NEED_RTG=4;   /* day length, countdown, wall visible at, warning at, storm length (hidden), clearing */
export const RTG_REQ={pucap:1,scrap:2,mineral:1,regolith:1};                                     /* ingredients of ONE RTG */
const S4_KIT=[['scrap',8],['mineral',2],['regolith',2]];                                           /* the supply drop tops the pack up to at least this much */
const WD=(()=>{const l=Math.hypot(-.5,-.87);return{x:-.5/l,z:-.87/l}})();                          /* direction (base-local) the storm comes from */
const Y_AX=new THREE.Vector3(0,1,0);
const TAU4=Math.PI*2;

/* ---------------------------------------------- items + recipe ---------------------------------------------- */
const NEW4={pucap:['PU-238 FUEL CAPSULE','Sealed iridium-clad plutonium-238 oxide heat source from Mission Control \u00b7 the fuel of one RTG \u00b7 handle with care'],
 rtg:['RTG','Radioisotope Thermoelectric Generator \u00b7 heat from decaying plutonium-238 becomes electricity \u00b7 works in a dust storm, day or night \u00b7 install it on a blueprint pad outside']};
Object.assign(RL,{pucap:'PU-238 FUEL CAPSULE',rtg:'RTG'});
if(!RECIPES.some(q=>q.id==='rtg'))RECIPES.push({id:'rtg',cat:1,n:1,req:RTG_REQ,info:'Radioisotope Thermoelectric Generator \u00b7 fuel capsule inside a finned alloy housing with thermocouples \u00b7 power that dust storms cannot stop',note:'SOL 4: you need 4. Carry them outside and press [E] on the blueprint pads.'});

function rtgMesh(){const g=new THREE.Group(),dk=stdMat(0x2b2f36,{metalness:.7,roughness:.45}),fin=stdMat(0xc3cbd3,{metalness:.85,roughness:.35}),
 au=new THREE.MeshStandardMaterial({color:0xe3b04a,metalness:.95,roughness:.2,emissive:0x4a3008,emissiveIntensity:.25}),
 glow=new THREE.MeshStandardMaterial({color:0xff7a1f,emissive:0xff5a0a,emissiveIntensity:0,roughness:.5});
 g.add(M(new THREE.CylinderGeometry(.68,.74,.14,24),dk,0,.07,0),M(new THREE.CylinderGeometry(.34,.34,1.15,24),dk,0,.72,0),M(new THREE.CylinderGeometry(.36,.36,.16,24),au,0,.36,0),
  M(new THREE.CylinderGeometry(.36,.36,.07,24),glow,0,.58,0),M(new THREE.CylinderGeometry(.36,.36,.07,24),glow,0,1.0,0),M(new THREE.CylinderGeometry(.2,.34,.14,24),dk,0,1.36,0),M(new THREE.CylinderGeometry(.06,.06,.2,10),fin,0,1.52,0));
 for(let i=0;i<10;i++){const a=i/10*TAU4,f=M(new THREE.BoxGeometry(.5,.95,.035),fin,Math.cos(a)*.58,.74,Math.sin(a)*.58);f.rotation.y=-a;g.add(f)}
 g.userData.glow=glow;return g}
function modelCapsule(){const g=new THREE.Group(),b=stdMat(0x3a3f47,{metalness:.9,roughness:.3}),o=stdMat(0xff7a1f,{emissive:0xff5a0a,emissiveIntensity:1,roughness:.4}),y=stdMat(0xe8c020,{roughness:.5});
 const c=M(new THREE.CylinderGeometry(.045,.045,.2,20),b,0,.06,0);c.rotation.z=Math.PI/2;g.add(c);
 for(const s of[-1,1]){const e=M(new THREE.CylinderGeometry(.047,.047,.02,20),o,s*.105,.06,0);e.rotation.z=Math.PI/2;g.add(e)}
 const r=M(new THREE.TorusGeometry(.047,.007,6,20),y,0,.06,0);r.rotation.y=Math.PI/2;g.add(r);return g}
export function patchSol4Items(I){const hold={x:.28,y:-.26,z:-.68,rx:.3};
 I.pucap={name:NEW4.pucap[0],unit:'',info:NEW4.pucap[1],build:modelCapsule,size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold};
 I.rtg={name:NEW4.rtg[0],unit:'',info:NEW4.rtg[1],build:()=>{const q=rtgMesh();q.scale.setScalar(.16);return q},size:.34,ref:.5,cy:.1,icon:{rx:.3,ry:.7},hold}}

/* ---------------------------------------------- css / dom ---------------------------------------------- */
const CSS4=`
#s4-obj{position:fixed;right:28px;top:124px;width:350px;z-index:30;padding:11px 15px;font:600 12px Consolas,monospace;letter-spacing:1px;color:#e8f4f8;background:rgba(6,10,18,.68);border-right:4px solid #ff5a4a;border-radius:4px;opacity:0;transition:opacity .6s;pointer-events:none}
#s4-obj.on{opacity:1}#s4-obj h3{margin:0 0 8px;font-size:13px;letter-spacing:3px;color:#ffb347}#s4-obj .t{margin:7px 0 3px;font-size:12px;letter-spacing:2px;color:#ffb347}#s4-obj .t.d{color:#7dff9a;text-decoration:line-through;opacity:.6}#s4-obj .t.w{opacity:.4;color:#e8f4f8}
#s4-obj .s{margin:2px 0 2px 12px;opacity:.9}#s4-obj .s.d{opacity:.45;text-decoration:line-through;color:#8fa}#s4-obj .s.h{opacity:.6;font-size:11px;color:#9fd8ff}
#s4-pop{position:fixed;left:50%;top:24%;transform:translate(-50%,-10px);width:min(740px,80vw);z-index:40;padding:18px 30px;text-align:center;background:rgba(6,10,18,.88);border:2px solid #ff5a4a;border-radius:6px;opacity:0;transition:opacity .5s,transform .5s;pointer-events:none;color:#f2f5fa;font:600 17px "Segoe UI",Arial,sans-serif;line-height:1.55}
#s4-pop.on{opacity:1;transform:translate(-50%,0)}#s4-pop b.h{display:block;font:800 13px Consolas,monospace;letter-spacing:6px;color:#ff8a6a;margin-bottom:8px}
#s4-msg{position:fixed;left:50%;top:50%;transform:translate(-50%,-48%);width:min(780px,88vw);max-height:84vh;overflow:hidden;z-index:44;padding:20px 30px 16px;background:rgba(4,10,24,.94);border:2px solid #5da8ff;border-radius:6px;box-shadow:0 0 40px rgba(60,120,255,.35);opacity:0;transition:opacity .6s;pointer-events:none;color:#e6eefc;font:500 15px/1.55 "Segoe UI",Arial,sans-serif}
#s4-msg.on{opacity:1;pointer-events:auto}#s4-sk{float:left;margin-top:-4px;cursor:pointer;font:800 13px Consolas,monospace;letter-spacing:3px;color:#06101e;background:#ffd9a0;border:2px solid #ff8a4c;border-radius:4px;padding:6px 16px;box-shadow:0 0 18px rgba(255,160,70,.5)}#s4-sk:hover{background:#fff1d8}#s4-sk b{background:#06101e;color:#ffd9a0;padding:1px 8px;margin-left:8px;border-radius:3px}#s4-msg .hd{display:flex;align-items:center;gap:16px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(93,168,255,.4);font:700 13px Consolas,monospace;letter-spacing:4px;color:#8fc4ff}
#s4-msg .hd small{font-size:11px;letter-spacing:3px;color:#9fb4d4}#s4-msg .lg{display:grid;grid-template-columns:auto auto;column-gap:14px;row-gap:2px;align-items:center;padding:8px 18px 8px 14px;border-radius:16px;border:2px solid #ffb347;background:linear-gradient(135deg,#0a1630 0%,#17315f 55%,#3a1d3f 100%);box-shadow:0 0 18px rgba(255,179,71,.38),inset 0 0 14px rgba(93,230,255,.18);font-family:'Segoe UI',Arial,sans-serif;text-align:left}#s4-msg .lg b{font:900 25px 'Segoe UI',Arial,sans-serif;letter-spacing:5px;line-height:1.05}#s4-msg .lg b:nth-of-type(1){color:#ffb347;text-shadow:0 0 10px rgba(255,179,71,.65)}#s4-msg .lg b:nth-of-type(2){color:#5de6ff;text-shadow:0 0 10px rgba(93,230,255,.6)}#s4-msg .lg i{font:700 13px 'Segoe UI',Arial,sans-serif;font-style:normal;letter-spacing:3px;color:#f2f5fa;border-left:2px solid rgba(255,179,71,.7);padding-left:13px}#s4-msg .lg i:nth-of-type(2){color:#bfe8ff;border-left-color:rgba(93,230,255,.7)}
#s4-msg p{margin:7px 0}#s4-msg p.w{color:#ffb0a0;font:800 15px Consolas,monospace;letter-spacing:3px}#s4-msg b{color:#ffd9a0}#s4-msg .ft{text-align:right;font:700 11px Consolas,monospace;letter-spacing:4px;color:#8fc4ff;margin-top:10px}
#s4-bar{position:fixed;left:50%;bottom:36%;transform:translateX(-50%);width:400px;z-index:31;padding:8px 14px;font:700 13px Consolas,monospace;letter-spacing:2px;color:#fff;text-align:center;background:rgba(6,10,18,.8);border:1px solid #ff8a4c;border-radius:4px;opacity:0;transition:opacity .2s;pointer-events:none}
#s4-bar.on{opacity:1}#s4-bar i{display:block;height:8px;margin-top:6px;background:rgba(255,255,255,.14)}#s4-bar u{display:block;height:100%;width:0;background:#ff8a4c}
#s4-warn{position:fixed;left:50%;top:128px;transform:translateX(-50%);z-index:41;padding:10px 28px;font:800 17px Consolas,monospace;letter-spacing:4px;color:#ffb0a0;background:rgba(90,10,6,.9);border:2px solid #ff5a4a;border-radius:4px;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
#s4-warn.on{opacity:1;animation:s4B .7s steps(2) infinite}@keyframes s4B{50%{opacity:.45}}
#s4-alert{position:fixed;left:50%;top:34%;transform:translate(-50%,-50%);width:min(680px,84vw);z-index:45;padding:20px 28px;text-align:center;background:rgba(70,8,4,.93);border:3px solid #ff5a4a;border-radius:6px;box-shadow:0 0 50px rgba(255,60,40,.45);opacity:0;transition:opacity .25s;pointer-events:none;color:#ffe2da;font:600 16px/1.55 "Segoe UI",Arial,sans-serif}
#s4-alert.on{opacity:1}#s4-alert b{display:block;font:900 20px Consolas,monospace;letter-spacing:5px;color:#ff8a7a;margin-bottom:8px}#s4-alert i{display:block;margin-top:10px;font:700 13px Consolas,monospace;letter-spacing:3px;color:#ffd9a0;font-style:normal}
#s4-dust{position:fixed;inset:0;z-index:19;pointer-events:none;opacity:0;background-repeat:repeat,no-repeat;background-size:256px 256px,100% 100%}
#s4-flk{position:fixed;inset:0;z-index:26;pointer-events:none;opacity:0;background:#000}
#s4-skip{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:90;padding:8px 22px;font:800 14px Consolas,monospace;letter-spacing:4px;color:#06101e;background:#ffd9a0;border:2px solid #ff8a4c;border-radius:4px;opacity:0;pointer-events:none;transition:opacity .25s;box-shadow:0 0 24px rgba(255,160,70,.55)}
#s4-skip.on{opacity:1}#s4-skip b{background:#06101e;color:#ffd9a0;padding:1px 9px;margin:0 6px;border-radius:3px}`;
function dustStreaks(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.clearRect(0,0,256,256);
 for(let i=0;i<110;i++){const y=rnd2(0,256),l=rnd2(40,200),a=rnd2(.05,.28),d=Math.random()<.35;x.strokeStyle=d?'rgba(70,40,22,'+a+')':'rgba(236,190,140,'+a+')';x.lineWidth=rnd2(.6,2.2);const sx=rnd2(0,256);x.beginPath();x.moveTo(sx,y);x.lineTo(sx+l,y+rnd2(-3,3));x.stroke();x.beginPath();x.moveTo(sx-256,y);x.lineTo(sx-256+l,y);x.stroke()}
 return c.toDataURL()}
function lab4(text,col,w=512,h=96){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false}));spr.renderOrder=9;
 x.fillStyle='rgba(4,17,26,.82)';x.fillRect(0,0,w,h);x.strokeStyle=col;x.lineWidth=4;x.strokeRect(2,2,w-4,h-4);x.font='700 30px Consolas,monospace';x.fillStyle=col;x.textAlign='center';x.textBaseline='middle';x.fillText(text.slice(0,28),w/2,h/2);tex.needsUpdate=true;return spr}
function dustTex(){return ctx2(256,256,(x,w,h)=>{x.clearRect(0,0,w,h);for(let i=0;i<70;i++){const r=rnd2(22,84),px=rnd2(48,208),py=rnd2(48,208),v=rnd2(150,255)|0,a=rnd2(.10,.30),cs=v+','+(v*.92|0)+','+(v*.82|0),gr=x.createRadialGradient(px,py,r*.08,px,py,r);
  gr.addColorStop(0,'rgba('+cs+','+a+')');gr.addColorStop(.55,'rgba('+cs+','+a*.5+')');gr.addColorStop(1,'rgba('+cs+',0)');x.fillStyle=gr;x.fillRect(0,0,w,h)}
 x.globalCompositeOperation='destination-in';const m=x.createRadialGradient(128,128,20,128,128,126);m.addColorStop(0,'rgba(0,0,0,1)');m.addColorStop(.7,'rgba(0,0,0,.8)');m.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=m;x.fillRect(0,0,w,h)})}
function padTex(n){return ctx2(256,256,(x,w,h)=>{x.fillStyle='rgba(8,38,92,.62)';x.fillRect(0,0,w,h);x.strokeStyle='rgba(130,205,255,.5)';x.lineWidth=1;for(let i=0;i<=8;i++){x.beginPath();x.moveTo(i*32+.5,0);x.lineTo(i*32+.5,h);x.moveTo(0,i*32+.5);x.lineTo(w,i*32+.5);x.stroke()}
 x.strokeStyle='#5de6ff';x.lineWidth=6;x.strokeRect(5,5,w-10,h-10);x.lineWidth=3;x.beginPath();x.arc(128,128,74,0,6.283);x.stroke();x.beginPath();x.moveTo(128,40);x.lineTo(128,216);x.moveTo(40,128);x.lineTo(216,128);x.stroke();
 x.font='700 30px Consolas,monospace';x.fillStyle='#bfefff';x.textAlign='center';x.textBaseline='middle';x.fillText('RTG-'+n,128,236)})}
const haloTex=(()=>{let t=null;return()=>t||(t=ctx2(64,64,(x,w,h)=>{const g=x.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(255,170,90,.95)');g.addColorStop(.4,'rgba(255,110,40,.35)');g.addColorStop(1,'rgba(255,90,30,0)');x.fillStyle=g;x.fillRect(0,0,w,h)}))})();

/* ---------------------------------------------- the Sol ---------------------------------------------- */
export class Sol4{
 constructor(mp,dn){this.mp=mp;this.dn=dn;this.dom=false;this.objs=[];this.cols=[];this.hubs=[];this._dc=new THREE.Color();this._a=new THREE.Vector3();this._dm=new THREE.Object3D();this.dx=0;this.init()}
 get b(){return this.mp.base}
 get s(){return this.mp.salv}
 get freeze(){return !!this.ch||!!this.lift}
 init(){this.on=false;this.done=false;this.ph='msg';this.tm=0;this.el=0;this.L=0;this.prox=0;this.sighted=false;this.msgShown=false;this.left=null;this.placed=0;this.craftN=0;this.m0={};this.ch=null;this.lift=null;this.expT=0;this.warnT=-99;this.sirT=0;this.flkT=6;this.flkE=0;
  this.last='';this.popT=null;this.msgT=null;this.alT=null;this.cs=null;this.slots=[];this.wall=null;this.fx=null;this.stm=null;this.deb=null;this.snd=null;this.fogO=null;this.factDone=false;this.hint=0;this.tag='';this.tested=false;this.testT=0}
 reset(){for(const o of this.objs)if(o.parent)o.parent.remove(o);this.objs=[];const S=this.b&&this.b.S;
  if(S){for(const c of this.cols){const i=S.cols.indexOf(c);if(i>=0)S.cols.splice(i,1)}for(const c of this.hubs){const i=S.hubObs.indexOf(c);if(i>=0)S.hubObs.splice(i,1)}}this.cols=[];this.hubs=[];
  try{this.env(0,0,true)}catch(e){}this.silence();
  for(const id of['s4-obj','s4-pop','s4-msg','s4-bar','s4-warn','s4-alert','s4-skip'])$(id)&&$(id).classList.remove('on');for(const id of['s4-dust','s4-flk'])if($(id))$(id).style.opacity=0;
  clearTimeout(this.popT);clearTimeout(this.msgT);clearTimeout(this.alT);this.init()}
 dom0(){if(this.dom)return;this.dom=true;const st=document.createElement('style');st.textContent=CSS4;document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend','<div id="s4-obj"></div><div id="s4-pop"></div><div id="s4-msg"></div><div id="s4-bar"></div><div id="s4-warn"></div><div id="s4-alert"></div><div id="s4-dust"></div><div id="s4-flk"></div><div id="s4-skip"><b>SPACE</b>CLOSE THE MESSAGE</div>');
  addEventListener('keydown',e=>{if(e.code==='Space'&&this.msgOpen()){e.preventDefault();e.stopImmediatePropagation();this.closeMsg()}},true)
  $('s4-dust').style.backgroundImage='url('+dustStreaks()+'),radial-gradient(ellipse at center,rgba(150,95,55,.18) 0%,rgba(120,70,40,.55) 55%,rgba(70,38,22,.92) 100%)'}
 /* ---------- helpers ---------- */
 stacks(id){const S=this.s,o=[];for(const A of[S.inv,S.bag])for(const it of A)if(it&&(it.id===id||(id==='mineral'&&it.id.startsWith('rk_'))))o.push(it);return o}
 count(id){return this.stacks(id).reduce((a,it)=>a+(it.n||1),0)}
 take(id,n){const S=this.s;if(this.count(id)<n)return false;for(const A of[S.inv,S.bag])for(let i=0;i<A.length&&n>0;i++){const it=A[i];if(it&&it.id===id){const u=Math.min(n,it.n||1);it.n=(it.n||1)-u;n-=u;if(it.n<=0)A[i]=null}}S.tk.after();try{S.showName()}catch(e){}return true}
 toast(t,c){try{this.s.tk.toast(t,c)}catch(e){}}
 tone(f,d=.15,v=.04,ty='triangle'){try{this.mp.tone&&this.mp.tone(f,d,v,ty)}catch(e){}}
 hiss(dur=.25,v=.03,f=2500){const a=this.mp.audio;if(!a||!a.buf)return;try{const ac=a.ac,s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=a.buf;fl.type='highpass';fl.frequency.value=f;g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);s.connect(fl);fl.connect(g);g.connect(ac.destination);s.start(0,Math.random()*1.5,dur+.05)}catch(e){}}
 pop(title,body,ms=9000){this.dom0();const e=$('s4-pop');e.innerHTML='<b class="h">'+title+'</b>'+body;e.classList.add('on');clearTimeout(this.popT);this.popT=setTimeout(()=>e.classList.remove('on'),ms)}
 exposed(){const b=this.b;return !b.interior&&(b.mode==='outside'||b.mode==='walkout'||b.mode==='walkin')}
 stormOn(){return this.ph==='storm'||(this.ph==='clear'&&this.L>.2)}
 holdDay(){return this.on&&!this.done&&this.dn.sol===4}
 windW(){return new THREE.Vector3(-WD.x,0,-WD.z).applyAxisAngle(Y_AX,this.b.root.rotation.y)}
 /* what the base simulation (power / alert screens) should show */
 ext(){const o={};if(this.on&&this.placed>0)o.rtg=this.placed;
  if(this.on&&this.dn.sol===4){o.L=this.L;o.al=this.ph==='storm'?2:(this.ph==='clear'&&this.L>.04)||(this.ph==='prep'&&this.prox>.55)?1:0;o.alName=this.ph==='clear'?'CLEARING':o.al===2?'WARNING':'ADVISORY'}return o}
 hudText(){if(!this.on||this.done||this.dn.sol!==4)return null;
  if(this.ph==='msg')return['SOL 4  \u00b7  PRIORITY MESSAGE WAITING  \u00b7  MAIN HUB','warn'];
  if(this.ph==='prep'){const left=S4_PREP-this.tm;return[left<=S4_WARN?'STORM IMPACT IN '+fmt(left)+'  \u00b7  GET INSIDE THE BASE':'SOL 4  \u00b7  STORM IMPACT IN '+fmt(left),left<=S4_WARN?'cold':left<=60?'warn':'']}
  if(this.ph==='storm')return[this.tested?'SOL 4  \u00b7  GLOBAL DUST STORM  \u00b7  STAY INSIDE THE BASE':'SOL 4  \u00b7  DUST STORM  \u00b7  RUN THE STORM TEST AT THE HUB COMPUTER','cold'];
  if(this.ph==='clear')return['SOL 4  \u00b7  THE STORM IS CLEARING','warn'];return null}
 beacon(inside,x,z,col,txt,h=8){const b=this.b,S=b.S,c=new THREE.Color(col),g=new THREE.Group(),y=inside?D.F:b.groundY(x,z);g.position.set(x,y,z);
  const hh=inside?2.4:h,beam=M(new THREE.CylinderGeometry(inside?.2:.4,inside?.2:.4,hh,12,1,true),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}),0,hh/2,0);
  const ring=M(new THREE.TorusGeometry(inside?.55:1.1,.06,6,32),new THREE.MeshBasicMaterial({color:c,fog:false}),0,.06,0);ring.rotation.x=Math.PI/2;
  const spr=lab4(txt,col);spr.position.set(0,hh+.5,0);spr.scale.set(inside?1.9:6.5,inside?.36:1.22,1);g.add(beam,ring,spr);(inside?S.int:S.ext).add(g);this.objs.push(g);g.visible=false;return{g,ring}}
 /* ---------- build ---------- */
 build(){const b=this.b,S=b.S,ext=S.ext;
  /* HMSA message console in the main hub */
  let cx=0,cz=-3.4;for(let i=0;i<48;i++){const a=2.2+i*.131,x=Math.cos(a)*4.3,z=Math.sin(a)*4.3;if([[0,0],[.9,0],[-.9,0],[0,.9],[0,-.9]].every(o=>b.free(x+o[0],z+o[1]))){cx=x;cz=z;break}}
  const g=new THREE.Group(),dk=stdMat(0x3b4654,{metalness:.6,roughness:.45}),sc=stdMat(0x5da8ff,{emissive:0x5da8ff,emissiveIntensity:.9,roughness:.4}),rd=new THREE.MeshStandardMaterial({color:0xff3a2a,emissive:0xff3a2a,emissiveIntensity:1.2});
  g.add(M(new THREE.BoxGeometry(1.1,.9,.62),dk,0,.45,0),M(new THREE.BoxGeometry(.9,.04,.5),sc,0,.93,0),M(new THREE.BoxGeometry(.7,.42,.05),dk,0,1.2,-.2),M(new THREE.BoxGeometry(.62,.34,.012),sc,0,1.2,-.172),M(new THREE.CylinderGeometry(.03,.03,.9,8),dk,.42,1.4,0));
  const dish=M(new THREE.SphereGeometry(.28,14,6,0,6.283,0,1.1),stdMat(0xe8e6e0,{metalness:.3,roughness:.5,side:THREE.DoubleSide}),.42,1.9,0);dish.rotation.x=-1.2;const lamp=M(new THREE.SphereGeometry(.06,10,8),rd,-.42,1.0,.2);g.add(dish,lamp);
  g.position.set(cx,D.F,cz);g.rotation.y=Math.atan2(-cx,-cz);S.int.add(g);this.objs.push(g);const ho=[cx,cz,.8];S.hubObs.push(ho);this.hubs.push(ho);
  this.cs={x:cx,z:cz,dish,lamp,rd,mk:this.beacon(true,cx,cz,'#5da8ff','HMSA MESSAGE')};this.cs.mk2=this.beacon(true,cx,cz,'#7dff9a','STORM TEST');
  /* RTG blueprint pads, 4 in a row on flat ground off to the side of the airlock path */
  let row=null;for(const c of[[18,-30],[-18,-30],[0,-34],[20,-22],[-20,-22]]){const xs=[-8.25,-2.75,2.75,8.25].map(o=>c[0]+o);
   if(xs.every(x=>Math.hypot(x,c[1])<44&&![[0,0],[1.4,0],[-1.4,0],[0,1.4],[0,-1.4]].some(o=>b.blockedOut(x+o[0],c[1]+o[1])))){row={xs,z:c[1]};break}}
  if(!row)row={xs:[10,15,20,25],z:-30};
  const planeG=new THREE.PlaneGeometry(3.2,3.2);planeG.rotateX(-Math.PI/2);
  this.ghostM=new THREE.MeshBasicMaterial({color:0x5de6ff,transparent:true,opacity:.34,depthWrite:false,wireframe:true,fog:false});
  const haloM=new THREE.SpriteMaterial({map:haloTex(),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0,fog:false});
  row.xs.forEach((x,i)=>{const z=row.z,y=b.groundY(x,z),grp=new THREE.Group();grp.position.set(x,y,z);
   const padM=new THREE.MeshBasicMaterial({map:padTex(i+1),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),pad=new THREE.Mesh(planeG,padM);pad.position.y=.06;pad.renderOrder=2;
   const gh=rtgMesh();gh.traverse(o=>{if(o.isMesh)o.material=this.ghostM});
   const real=rtgMesh();real.visible=false;
   const halo=new THREE.Sprite(haloM.clone());halo.scale.set(3.2,3.2,1);halo.position.y=.9;halo.renderOrder=8;
   const lift=M(new THREE.CylinderGeometry(.55,.55,40,16,1,true),new THREE.MeshBasicMaterial({color:0xbfefff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}),0,20,0);
   grp.add(pad,gh,real,halo,lift);ext.add(grp);this.objs.push(grp);
   const col={ax:x,az:z,bx:x,bz:z,r:.95};
   this.slots.push({i,x,z,y,grp,pad,padM,gh,real,halo,lift,glow:0,done:false,col,mk:this.beacon(false,x,z,'#5de6ff','RTG PAD '+(i+1)+' / '+NEED_RTG,7)})});
  /* placement particles (dust + sparks) */
  const N=420,pg=new THREE.BufferGeometry();this.pp=new Float32Array(N*3).fill(-999);this.pc=new Float32Array(N*3);this.pv=new Float32Array(N*3);this.pl=new Float32Array(N);this.pi=0;this.N=N;this.dirty=false;
  pg.setAttribute('position',new THREE.BufferAttribute(this.pp,3));pg.setAttribute('color',new THREE.BufferAttribute(this.pc,3));
  this.fx=new THREE.Points(pg,new THREE.PointsMaterial({size:.26,vertexColors:true,transparent:true,opacity:.92,depthWrite:false,sizeAttenuation:true}));this.fx.frustumCulled=false;ext.add(this.fx);this.objs.push(this.fx);
  this.buildStorm()}
 /* the storm: rolling dust wall on the horizon, wind-blown streaks around the camera, flying debris */
 buildStorm(){const b=this.b,S=b.S,ext=S.ext,near=this.mp.near;
  const tex=dustTex(),wg=new THREE.Group(),sp=[];
  const add=(lx,ly,lz,w,h,col,op)=>{const m=new THREE.SpriteMaterial({map:tex,color:col,transparent:true,opacity:op,depthWrite:false,fog:false,rotation:rnd2(0,6.283)}),s=new THREE.Sprite(m);s.position.set(lx,ly,lz);s.scale.set(w,h,1);s.renderOrder=3;wg.add(s);sp.push({m,lx,ly,lz,op})};
  const cLo=new THREE.Color(0xe0aa72),cHi=new THREE.Color(0x3c2518),c=new THREE.Color();
  for(let j=0;j<7;j++){const hy=j/6,n=j<5?15:11;for(let i=0;i<n;i++){const th=((i+rnd2(-.4,.4))/(n-1)-.5)*2.1,R=950;
    c.copy(cLo).lerp(cHi,clamp(Math.pow(hy,.8)*.9+rnd2(-.06,.06),0,1));
    add(Math.sin(th)*R+rnd2(-60,60),-40+hy*540+rnd2(-30,30),(1-Math.cos(th))*R+rnd2(-70,150)-hy*hy*150,rnd2(360,560)*(1+hy*.25),rnd2(300,460)*(1+hy*.3),c.getHex(),rnd2(.62,.9))}}
  for(let i=0;i<34;i++){const th=((i+rnd2(-.4,.4))/33-.5)*2.2,R=950;add(Math.sin(th)*R+rnd2(-80,80),rnd2(0,60),(1-Math.cos(th))*R+rnd2(-90,60),rnd2(420,640),rnd2(150,230),0xcf9a68,rnd2(.45,.7))}
  wg.visible=false;ext.add(wg);this.objs.push(wg);this.wall={g:wg,sp};
  /* wind-blown dust streaks + specks around the camera */
  const NS=520,r=new Float32Array(NS*3),k=new Float32Array(NS);for(let i=0;i<NS;i++){r[i*3]=rnd2(-34,34);r[i*3+1]=rnd2(-1.5,16);r[i*3+2]=rnd2(-34,34);k[i]=rnd2(.6,1.4)}
  const pP=new Float32Array(NS*3),lP=new Float32Array(NS*6),pg=new THREE.BufferGeometry(),lg=new THREE.BufferGeometry();
  pg.setAttribute('position',new THREE.BufferAttribute(pP,3));lg.setAttribute('position',new THREE.BufferAttribute(lP,3));
  const pts=new THREE.Points(pg,new THREE.PointsMaterial({color:0xe6c090,size:.16,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true,fog:false})),
   lines=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:0xd9a878,transparent:true,opacity:0,depthWrite:false,fog:false}));
  pts.frustumCulled=lines.frustumCulled=false;pts.visible=lines.visible=false;near.add(pts,lines);this.objs.push(pts,lines);this.stm={N:NS,r,k,pP,lP,pts,lines};
  /* flying debris (rocks and torn plates) well outside the base footprint */
  const ND=60,dm=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x4a3c30,roughness:.9,metalness:.1}),ND),dd=[];
  for(let i=0;i<ND;i++){const plate=Math.random()<.3,s=rnd2(.3,1.5);dd.push({u:rnd2(-120,120),v:rnd2(-120,120),y:rnd2(1.5,26),sx:plate?s*2:s,sy:plate?s*.08:s*rnd2(.5,1),sz:plate?s*1.4:s,rx:rnd2(0,6),ry:rnd2(0,6),rz:rnd2(0,6),wx:rnd2(-3,3),wy:rnd2(-3,3),wz:rnd2(-3,3),sp:rnd2(.7,1.3)})}
  dm.visible=false;dm.frustumCulled=false;ext.add(dm);this.objs.push(dm);this.deb={mesh:dm,d:dd}}
 /* ---------- particles (placement) ---------- */
 emit(x,y,z,vx,vy,vz,life,r,g,bl){const i=this.pi=(this.pi+1)%this.N;this.pp[i*3]=x;this.pp[i*3+1]=y;this.pp[i*3+2]=z;this.pv[i*3]=vx;this.pv[i*3+1]=vy;this.pv[i*3+2]=vz;this.pl[i]=life;this.pc[i*3]=r;this.pc[i*3+1]=g;this.pc[i*3+2]=bl;this.dirty=true}
 fxStep(dt){if(!this.fx)return;let any=false;for(let i=0;i<this.N;i++){if(this.pl[i]<=0)continue;any=true;this.pl[i]-=dt;if(this.pl[i]<=0){this.pp[i*3+1]=-999;continue}this.pv[i*3+1]-=GW*dt;this.pp[i*3]+=this.pv[i*3]*dt;this.pp[i*3+1]+=this.pv[i*3+1]*dt;this.pp[i*3+2]+=this.pv[i*3+2]*dt;
   if(this.pp[i*3+1]<.05&&this.pv[i*3+1]<0){this.pv[i*3+1]*=-.2;this.pv[i*3]*=.5;this.pv[i*3+2]*=.5}}
  if(any||this.dirty){this.fx.geometry.attributes.position.needsUpdate=true;this.fx.geometry.attributes.color.needsUpdate=true;this.dirty=false}}
 spark(x,y,z,n=10){for(let i=0;i<n;i++)this.emit(x,y,z,rnd2(-2.6,2.6),rnd2(1.5,5),rnd2(-2.6,2.6),rnd2(.35,.8),1,rnd2(.65,.9),.25)}
 puff(x,y,z){for(let i=0;i<46;i++){const a=rnd2(0,6.283),v=rnd2(1.5,4.5);this.emit(x+Math.cos(a)*.5,y+.15,z+Math.sin(a)*.5,Math.cos(a)*v,rnd2(.4,1.6),Math.sin(a)*v,rnd2(.7,1.3),.78,.58,.4)}}
 /* ---------- start (called by DayNight at the Sol 3 -> 4 dawn) ---------- */
 start(){if(this.on||this.done)return;const b=this.b;if(!b||!b.S)return;this.on=true;this.dom0();this.m0=Object.assign({},this.s.cr.made);
  try{this.build()}catch(err){console.error('[sol4 build]',err);this.toast('SOL 4 BUILD ERROR: '+(err&&err.message||err),'#ff5a4a')}
  const o3=$('s3-obj');if(o3)o3.classList.remove('on');$('s4-obj').classList.add('on');
  this.pop('SOL 4  \u00b7  ISOLATION STORM','Mission Control has a priority message waiting for you. Go to the main hub and collect it at the communications console.',9500);
  this.tone(392,.25,.05);setTimeout(()=>this.tone(523,.3,.05),160);this.last=''}
 /* ---------- interaction ---------- */
 near(){const b=this.b,P=b.p;if(!this.on||this.dn.sol!==4)return null;
  if(b.mode==='inside'){if(this.ph==='msg'&&this.cs&&Math.hypot(P.x-this.cs.x,P.z-this.cs.z)<2.9)return{k:'console'};if((this.ph==='storm'||this.ph==='clear')&&!this.tested&&this.cs&&Math.hypot(P.x-this.cs.x,P.z-this.cs.z)<2.9)return{k:'test'};return null}
  if(b.mode==='outside'&&this.ph==='prep'&&this.placed<NEED_RTG){let best=null,bd=4.6;for(const s of this.slots){if(s.done)continue;const d=Math.hypot(P.x-s.x,P.z-s.z);if(d<bd){bd=d;best=s}}return best?{k:'place',s:best}:null}
  return null}
 interact(){if(!this.on||this.dn.sol!==4)return false;if(this.ch||this.lift)return true;const b=this.b,P=b.p;
  /* leaving the base during the storm: warn first, a second press within 6 s overrides */
  if(this.stormOn()&&b.mode==='inside'){const z=b.zone(P.x,P.z);if(z.air&&z.s>=D.RH+3.0){
    if(this.el-this.warnT<6){this.warnT=-99;$('s4-alert').classList.remove('on');return false}
    this.warnT=this.el;const e=$('s4-alert');e.innerHTML='<b>\u26a0 STORM WARNING \u26a0</b>Wind speeds outside exceed 100 km/h. Anyone who steps out will be swept off the ground and carried away by the storm. <i>DO NOT LEAVE THE BASE  \u00b7  PRESS [E] AGAIN WITHIN 6 s TO OVERRIDE</i>';
    e.classList.add('on');clearTimeout(this.alT);this.alT=setTimeout(()=>e.classList.remove('on'),6000);this.tone(220,.5,.07,'sawtooth');setTimeout(()=>this.tone(180,.6,.07,'sawtooth'),260);return true}}
  const n=this.near();if(!n){if(b.mode==='inside'&&this.ph==='prep'&&this.placed>=NEED_RTG&&!this.tested&&this.cs&&Math.hypot(P.x-this.cs.x,P.z-this.cs.z)<2.9){this.toast('STORM NOT HERE YET  \u00b7  THE TEST UNLOCKS WHEN IT HITS','#ffb347');return true}return false}
  if(n.k==='console'){if(this.msgShown)return true;   /* single use: the message can only be collected once (undelivered items arrive automatically) */this.ch={k:'sig',t:0,dur:5,lab:'RECEIVING TRANSMISSION  \u00b7  HMSA',tn:0};this.tone(440,.2,.04);return true}
  if(n.k==='test'){this.ch={k:'test',t:0,dur:6,lab:'RUNNING STORM TEST  \u00b7  HUB COMPUTER',tn:0};this.tone(440,.2,.04);return true}
  if(n.k==='place'){if(this.count('rtg')<1){this.toast('NEED AN RTG  \u00b7  CRAFT IT AT THE CRAFTING TABLE','#ff5a4a');return true}this.take('rtg',1);const s=n.s;s.done=true;s.mk.g.visible=false;
   this.ch={k:'place',t:0,dur:3.8,lab:'LOWERING RTG '+(this.placed+1)+' / '+NEED_RTG+' ONTO THE BLUEPRINT',s,hit:false};this.hiss(.5,.04,1200);this.tone(300,.4,.05);return true}
  return false}
 msgOpen(){const e=$('s4-msg');return !!e&&e.classList.contains('on')}
 closeMsg(){const e=$('s4-msg');if(e)e.classList.remove('on');const k=$('s4-skip');if(k)k.classList.remove('on');clearTimeout(this.msgT);this.tone(440,.1,.04);try{this.mp.lockPtr&&this.mp.lockPtr()}catch(e){}}
 showMsg(){this.dom0();const e=$('s4-msg');
  e.innerHTML='<div class="hd"><span class="lg"><b>HM</b><i>Huraira Meerab</i><b>SA</b><i>Space Agency</i></span><span>DEEP SPACE NETWORK  \u00b7  PRIORITY ALPHA<br><small>MISSION CONTROL  \u2192  MARS RESEARCH BASE  \u00b7  SOL 4</small></span></div>'
   +'<p class="w">\u26a0 GLOBAL DUST STORM APPROACHING</p>'
   +'<p>Orbiter imagery shows a planet-encircling dust storm closing on your site. Expect it to reach the base in about five minutes.</p>'
   +'<p><b>Solar power is not an option.</b> During a global dust storm, the airborne dust blocks out the sunlight and the solar panels stop producing power. This is why solar-powered rovers such as Opportunity went silent during major storms.</p>'
   +'<p>You must build <b>4 RTGs</b> (Radioisotope Thermoelectric Generators). They turn the heat of decaying plutonium-238 into electricity, so they keep running through any storm. Sealed fuel capsules and a small parts kit are now in your backpack.</p>'
   +'<p>Craft the RTGs at your crafting table and install them on the blueprint pads outside the airlock. Then return inside. When the storm hits, run a storm test from the hub computer and stay inside until it passes.</p><div class="ft"><button id="s4-sk">SKIP MESSAGE<b>SPACE</b></button>\u2014 HMSA MISSION CONTROL  \u00b7  GOOD LUCK, CREW</div>';
  const sk=$('s4-sk');if(sk)sk.addEventListener('click',ev=>{ev.stopPropagation();this.closeMsg()});try{document.exitPointerLock()}catch(e){}   /* free the mouse so the SKIP button can be clicked */
  e.classList.add('on');clearTimeout(this.msgT);this.msgT=setTimeout(()=>this.closeMsg(),60000)}
 /* the capsules + a small top-up of raw parts; anything that does not fit stays pending until the console is used again */
 deliver(quiet){const L=this.left||(this.left=[['pucap',NEED_RTG]].concat(S4_KIT.map(([id,n])=>[id,Math.max(0,n-this.count(id))]).filter(q=>q[1]>0)));
  for(let i=L.length-1;i>=0;i--)if(this.s.tk.give(L[i][0],L[i][1]))L.splice(i,1);
  if(L.length){if(!quiet||this.el-(this.fullT||-99)>8){this.fullT=this.el;this.toast('SUPPLIES WAITING  \u00b7  FREE A BACKPACK SLOT (TAB)  \u00b7  TIMER STARTS WHEN THEY ARRIVE','#ff5a4a')}return}
  this.left=null;this.ph='prep';this.tm=0;this.cs.mk.g.visible=false;this.toast('+'+NEED_RTG+' PU-238 FUEL CAPSULES  \u00b7  + PARTS KIT','#ffb347');this.tone(523,.2,.05);
  setTimeout(()=>this.mp.cap('TIMER STARTED  \u00b7  BUILD AND INSTALL 4 RTGs',3600),600)}
 stepCh(dt){const c=this.ch,p=this.b.p;c.t+=dt;const u=Math.min(1,c.t/c.dur),bar=$('s4-bar');bar.innerHTML=c.lab+'<i><u style="width:'+(u*100).toFixed(0)+'%"></u></i>';bar.classList.add('on');
  const face=(x,z,k)=>{const want=Math.atan2(z-p.z,x-p.x);p.yaw+=Math.atan2(Math.sin(want-p.yaw),Math.cos(want-p.yaw))*Math.min(1,dt*k)};
  if(c.k==='sig'||c.k==='test'){if(this.cs.dish)this.cs.dish.rotation.y+=dt*3;c.tn-=dt;if(c.tn<=0){c.tn=.5;this.tone(600+Math.random()*500,.08,.025,'sine')}face(this.cs.x,this.cs.z,4)}
  else if(c.k==='place'){const s=c.s,q=s.real;face(s.x,s.z,5);
   if(u<.7){const e=u/.7,ez=e*e*e;q.visible=true;q.position.y=7*(1-ez);q.rotation.y=(1-ez)*2.4;s.gh.visible=u<.18?Math.sin(c.t*40)>0:false;s.lift.material.opacity=.38*Math.sin(Math.min(1,u/.7)*Math.PI*.9+.2);
    if(u>.15)for(let i=0;i<3;i++)this.emit(s.x+rnd2(-.6,.6),s.y+.25,s.z+rnd2(-.6,.6),rnd2(-2.2,2.2),rnd2(.2,1.2),rnd2(-2.2,2.2),.6,.78,.6,.45)}
   else{if(!c.hit){c.hit=true;q.position.y=0;q.rotation.y=0;s.lift.material.opacity=0;s.gh.visible=false;this.spark(s.x,s.y+.3,s.z,32);this.puff(s.x,s.y,s.z);this.tone(110,.35,.1,'square');this.hiss(.35,.05,700);this.tone(660,.2,.04,'sine')}
    const k=(u-.7)/.3;q.scale.y=1-.06*Math.max(0,Math.sin(Math.min(1,k*2.2)*Math.PI));s.glow=sst(0,1,k)*1.4}}
  if(u>=1)this.finish(c)}
 finish(c){this.ch=null;$('s4-bar').classList.remove('on');
  if(c.k==='test'){this.tested=true;this.testT=this.tm;if(this.cs.mk2)this.cs.mk2.g.visible=false;this.pop('STORM TEST COMPLETE','Hub computer report: wind 118 km/h, gusting 146 \u00b7 dust opacity (tau) 9.2, sunlight 3% \u00b7 solar array output 0 W \u00b7 RTG output '+this.placed*110+' W \u00b7 base power STABLE \u00b7 hull pressure 101 kPa. The base is holding. Stay inside until the front passes.',11000);this.mp.cap('STORM TEST COMPLETE  \u00b7  BASE HOLDING',3800);this.tone(523,.25,.05);setTimeout(()=>this.tone(784,.4,.05),180)}
  else if(c.k==='sig'){if(!this.msgShown){this.msgShown=true;this.showMsg();this.mp.cap('TRANSMISSION RECEIVED  \u00b7  HMSA PRIORITY ALPHA',3800);this.tone(523,.3,.05);setTimeout(()=>this.tone(659,.3,.05),180)}this.deliver()}
  else if(c.k==='place'){const s=c.s,S=this.b.S;this.placed++;s.real.scale.y=1;s.real.position.y=0;S.cols.push(s.col);this.cols.push(s.col);s.glow=1.4;{const p=this.b.p,dx=p.x-s.x,dz=p.z-s.z,d=Math.hypot(dx,dz);if(d<1.6){if(d>.01){p.x=s.x+dx/d*1.8;p.z=s.z+dz/d*1.8}else{p.x=s.x+1.8}}}
   this.toast('RTG '+this.placed+' / '+NEED_RTG+' ONLINE','#7dff9a');this.tone(523,.2,.05);setTimeout(()=>this.tone(784,.3,.05),150);
   if(this.placed>=NEED_RTG){this.mp.cap('ALL 4 RTGs ONLINE  \u00b7  GET BACK INSIDE',3800);this.pop('RTG POWER ONLINE','All four generators are producing power. Get back INSIDE the base and wait for the storm to pass.',8000)}}
  this.last=''}
 /* [PAGE UP] test skip: finish Sol 4 as if played (message read, 4 RTGs installed, storm survived) */
 complete(){if(this.done)return;if(!this.on)this.start();if(!this.on)return;
  this.ch=null;this.lift=null;for(const id of['s4-bar','s4-warn','s4-alert','s4-msg','s4-skip'])$(id)&&$(id).classList.remove('on');clearTimeout(this.msgT);
  this.msgShown=true;this.left=null;const S=this.b.S,p=this.b.p;
  for(const s of this.slots){if(!s.done){s.done=true;s.real.visible=true;s.real.position.y=0;s.real.scale.y=1;S.cols.push(s.col);this.cols.push(s.col)}s.mk.g.visible=false;s.gh.visible=false;s.lift.material.opacity=0;s.glow=1.4;
   const dx=p.x-s.x,dz=p.z-s.z,d=Math.hypot(dx,dz);if(d<1.6){if(d>.01){p.x=s.x+dx/d*1.8;p.z=s.z+dz/d*1.8}else p.x=s.x+1.8}}
  if(this.cs)this.cs.mk.g.visible=false;this.placed=NEED_RTG;this.craftN=NEED_RTG;this.sighted=true;this.tested=true;if(this.cs&&this.cs.mk2)this.cs.mk2.g.visible=false;this.finishSol();this.last=''}
 /* ---------- failure + survival ---------- */
 fail(){this.ph='failed';this.silence();this.dn.die('SOL 4 FAILED','THE RTGs WERE NOT ONLINE BEFORE THE STORM  \u00b7  BASE POWER LOST')}
 finishSol(){this.done=true;this.ph='done';this.L=0;this.prox=0;this.mp.cap('SOL 4 COMPLETE  \u00b7  STORM SURVIVED',4600);
  this.pop('YOU SURVIVED THE STORM','The dust is settling and the RTGs kept the base alive. Rest now: night is coming, so get ready for it.',9500);this.tone(523,.3,.05);setTimeout(()=>this.tone(659,.3,.05),180);setTimeout(()=>this.tone(784,.6,.05),380)}
 startLift(){const mp=this.mp;this.ch=null;$('s4-bar').classList.remove('on');this.lift={t:0,p0:mp.cp.clone(),d0:mp.cl.clone().sub(mp.cp).normalize(),w:this.windW()};mp.cap('THE WIND LIFTS YOU OFF THE GROUND',2600);this.tone(120,1.6,.09,'sawtooth')}
 /* ---------- environment (sky, fog, light) ---------- */
 env(L,prox,reset){const mp=this.mp,b=this.b;if(!mp.near)return;const fog=mp.near.fog;if(fog&&!this.fogO)this.fogO=fog.color.clone();
  const st=reset?0:Math.max(L,.42*prox*prox),U=mp.skyMat&&mp.skyMat.uniforms;if(U&&U.uStorm)U.uStorm.value=st;
  if(fog&&this.fogO){if(st>.002){const k=.5+.5*this.dn.k;this._dc.setRGB(.52*k,.33*k,.22*k,THREE.SRGBColorSpace);fog.color.copy(this.fogO).lerp(this._dc,Math.min(1,st*1.1))}else fog.color.copy(this.fogO)}
  if(reset||st<=.002)return;const d=Math.min(1,st);
  if(mp.sun)mp.sun.intensity*=1-.78*d;if(mp.hemi)mp.hemi.intensity*=1-.38*d;mp.near.environmentIntensity*=1-.5*d;if(!b.interior&&mp.r)mp.r.toneMappingExposure*=1-.2*d;
  b.fogExtra=Math.max(b.fogExtra||0,L*.0078+(1-L)*.0032*prox*prox)}
 /* ---------- audio ---------- */
 sndUpdate(Ls,exp){const a=this.mp.audio;if(!a||!a.buf)return;if(Ls<.01&&!this.snd)return;
  if(!this.snd){try{const ac=a.ac,src=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),o=ac.createOscillator(),og=ac.createGain();src.buffer=a.buf;src.loop=true;f.type='bandpass';f.frequency.value=500;f.Q.value=.6;g.gain.value=0;src.connect(f);f.connect(g);g.connect(ac.destination);
    o.type='triangle';o.frequency.value=34;og.gain.value=0;o.connect(og);og.connect(ac.destination);src.start();o.start();this.snd={src,f,g,o,og}}catch(e){this.snd=null;return}}
  const t=a.ac.currentTime,gust=.65+.35*Math.sin(this.el*.7)*Math.sin(this.el*1.9+1);
  this.snd.g.gain.setTargetAtTime(Math.min(.55,Ls*(exp?.55:.22)*gust),t,.2);this.snd.f.frequency.setTargetAtTime(380+Ls*420*gust+(exp?300:0),t,.3);this.snd.og.gain.setTargetAtTime(Ls*.07,t,.4)}
 silence(){if(this.snd){try{this.snd.src.stop();this.snd.o.stop()}catch(e){}this.snd=null}}
 /* ---------- per frame ---------- */
 update(dt){if(!this.on)return;this.dom0();const dn=this.dn,b=this.b,mp=this.mp,t=performance.now()/1000;this.el+=dt;const exp=this.exposed();
  if(this.ph==='msg')this.craftN=Math.max(this.craftN,(this.s.cr.made.rtg||0)-(this.m0.rtg||0));else this.craftN=Math.max(this.craftN,(this.s.cr.made.rtg||0)-(this.m0.rtg||0),this.count('rtg')+this.placed);
  this.fxStep(dt);if(this.ch)this.stepCh(dt);
  if(this.ph==='msg'&&this.msgShown&&this.left){this.dT=(this.dT||0)-dt;if(this.dT<=0){this.dT=2;this.deliver(true)}}
  if(dn.sol===4&&!this.done)this.phases(dt,exp);
  this.stormFx(dt,exp);this.markers(t);
  if(!this.ch&&!this.lift){const n=this.near(),pr=$('b-prompt');let h='';
   if(n&&n.k==='console')h=this.msgShown?(this.left?'BACKPACK FULL  \u00b7  FREE A SLOT (TAB)  \u00b7  SUPPLIES ARRIVE AUTOMATICALLY':''):'<b>E</b>COLLECT MESSAGE FROM HMSA';
   else if(n&&n.k==='test')h='<b>E</b>RUN STORM TEST  \u00b7  HUB COMPUTER';
   else if(n&&n.k==='place')h=this.count('rtg')>0?'<b>E</b>PLACE RTG ON THE BLUEPRINT  \u00b7  '+this.placed+' / '+NEED_RTG:'NEED AN RTG  \u00b7  CRAFT IT AT THE CRAFTING TABLE';
   else if(dn.sol===4&&this.stormOn()&&b.mode==='inside'){const z=b.zone(b.p.x,b.p.z);if(z.air&&z.s>=D.RH+3.0)h='<b>E</b>CYCLE AIRLOCK  \u00b7  \u26a0 STORM: GOING OUTSIDE IS FATAL'}
   if(h&&pr){pr.innerHTML=h;pr.classList.add('on')}}
  $('s4-obj').classList.toggle('on',dn.sol===4);this.hud()}
 phases(dt,exp){const mp=this.mp,wn=$('s4-warn');
  if(this.ph==='prep'){this.tm+=dt;const left=S4_PREP-this.tm;
   if(!this.sighted&&left<=S4_SEE){this.sighted=true;mp.cap('STORM FRONT SIGHTED ON THE HORIZON',3800);this.pop('ORBITAL UPDATE','The leading edge of the storm is now visible on the horizon, and it is rolling this way. Get all four RTGs onto their pads before it arrives.',7500);this.tone(300,.7,.06,'sawtooth')}
   this.prox=this.sighted?clamp((S4_SEE-left)/S4_SEE,0,1):0;
   if(left<=S4_WARN&&left>0){wn.textContent='\u26a0 STORM IMPACT IN '+Math.ceil(left)+' s  \u00b7  GET INSIDE THE BASE';wn.classList.add('on');if((this.sirT-=dt)<=0){this.sirT=1.6;this.tone(520,.28,.06,'sawtooth');setTimeout(()=>this.tone(780,.3,.06,'sawtooth'),300)}}
   if(left<=0){wn.classList.remove('on');if(this.placed<NEED_RTG){this.fail();return}this.ph='storm';this.tm=0;this.prox=1;this.expT=0;mp.cap('STORM IMPACT  \u00b7  STAY INSIDE THE BASE',4000);this.tone(90,1.4,.1,'sawtooth')}}
  else if(this.ph==='storm'){this.tm+=dt;this.L=sst(0,7,this.tm);this.prox=1;
   if(!this.factDone&&this.tm>28){this.factDone=true;mp.sub('Perseverance’s RTG turns the heat of decaying plutonium-238 into about 110 watts of electricity, so a dust storm does not affect it.','MARS FACT',9000)}
   if(!this.tested&&!this.hint&&this.tm>10){this.hint=1;mp.cap('RUN THE STORM TEST  \u00b7  USE THE HUB COMPUTER',4200)}
   if(this.tested&&this.tm>=Math.min(S4_STORM,this.testT+12)){this.ph='clear';this.tm=0;mp.cap('THE STORM FRONT IS PASSING',3800)}}
  else if(this.ph==='clear'){this.tm+=dt;this.L=1-sst(0,S4_CLEAR,this.tm);if(this.tm>=S4_CLEAR){this.L=0;this.finishSol()}}}
 /* storm visuals + effects; also runs after the storm to restore everything */
 stormFx(dt,exp){const b=this.b,mp=this.mp,L=this.L,prox=this.prox,Ls=Math.max(L,.14*prox*prox);
  this.env(L,prox,false);this.sndUpdate(Ls,exp);
  /* rolling dust wall: sights on the horizon at 3:00, hits at 0:00, recedes on the far side when the storm clears */
  const W=this.wall;if(W){let DD=0,fade=0,dirS=1;
   if(this.ph==='prep'&&this.sighted){DD=lerp(1500,40,prox);fade=1}else if(this.ph==='storm'){DD=40;fade=1-sst(0,5,this.tm)}else if(this.ph==='clear'){dirS=-1;DD=140+this.tm*70;fade=sst(0,3,this.tm)*(1-sst(10,S4_CLEAR,this.tm))}
   W.g.visible=fade>.01;if(W.g.visible){const th=Math.atan2(WD.x*dirS,WD.z*dirS),cs=Math.cos(th),sn=Math.sin(th),gx=WD.x*dirS*DD,gz=WD.z*dirS*DD;W.g.position.set(gx,0,gz);W.g.rotation.y=th;
    const cp=b.root.worldToLocal(mp.cp.clone());for(const q of W.sp){const wx=gx+q.lx*cs+q.lz*sn,wz=gz-q.lx*sn+q.lz*cs,d=Math.hypot(wx-cp.x,q.ly-cp.y,wz-cp.z);q.m.opacity=q.op*fade*sst(70,300,d)}}}
  /* wind-blown streaks around the camera */
  const S=this.stm;if(S){const on=Ls>.03;S.pts.visible=S.lines.visible=on;
   if(on){const w=this.windW(),sp=(16+34*Ls)*dt,A=this._a.copy(mp.cp),len=.7+Ls*2.6,rc=b.root.position;
    if(b.interior){const fx=mp.cl.x-mp.cp.x,fz=mp.cl.z-mp.cp.z,l=Math.hypot(fx,fz)||1;A.x+=fx/l*30;A.z+=fz/l*30}
    for(let i=0;i<S.N;i++){let x=S.r[i*3]+w.x*sp*S.k[i]+Math.sin(this.el*1.3+i)*.02,y=S.r[i*3+1]+Math.sin(this.el*2.1+i*1.7)*.015,z=S.r[i*3+2]+w.z*sp*S.k[i];
     if(x>34)x-=68;else if(x<-34)x+=68;if(z>34)z-=68;else if(z<-34)z+=68;if(y>16)y-=17.5;else if(y<-1.5)y+=17.5;S.r[i*3]=x;S.r[i*3+1]=y;S.r[i*3+2]=z;
     let wx=A.x+x,wy=A.y+y,wz=A.z+z;if(b.interior&&Math.hypot(wx-rc.x,wz-rc.z)<44){wx=0;wy=-9999;wz=0}
     S.pP[i*3]=wx;S.pP[i*3+1]=wy;S.pP[i*3+2]=wz;S.lP[i*6]=wx;S.lP[i*6+1]=wy;S.lP[i*6+2]=wz;S.lP[i*6+3]=wx-w.x*len*S.k[i];S.lP[i*6+4]=wy;S.lP[i*6+5]=wz-w.z*len*S.k[i]}
    S.pts.geometry.attributes.position.needsUpdate=true;S.lines.geometry.attributes.position.needsUpdate=true;S.pts.material.opacity=Math.min(.85,Ls*1.5);S.lines.material.opacity=Math.min(.5,Ls*1.1)}}
  /* flying debris */
  const De=this.deb;if(De){const on=L>.15;De.mesh.visible=on;
   if(on){const wx=-WD.x,wz=-WD.z,px=-wz,pz=wx,dm=this._dm;let i=0;for(const d of De.d){d.u+=(20+26*d.sp)*L*dt;if(d.u>120)d.u-=240;d.rx+=d.wx*dt*L;d.ry+=d.wy*dt*L;d.rz+=d.wz*dt*L;
     const x=wx*d.u+px*d.v,z=wz*d.u+pz*d.v,far=Math.hypot(x,z)<44;dm.position.set(x,d.y+Math.sin(this.el*1.2+i)*1.5,z);dm.rotation.set(d.rx,d.ry,d.rz);dm.scale.set(far?0:d.sx,far?0:d.sy,far?0:d.sz);dm.updateMatrix();De.mesh.setMatrixAt(i++,dm.matrix)}
    De.mesh.instanceMatrix.needsUpdate=true}}
  /* outside in the storm: the wind takes you */
  if(this.stormOn()&&L>.35&&exp&&!this.lift){this.expT+=dt;if(this.expT>1.6)this.startLift()}else if(!exp||!this.stormOn())this.expT=Math.max(0,this.expT-dt*2);
  /* sand overlay + power flicker */
  const du=$('s4-dust');if(du){let op=Math.max(L*(exp?.8:.05),.1*prox*prox*(exp?1:0));if(b.mode==='cycleOut'&&b.ct>5&&L>.1)op=Math.max(op,.5*L);if(this.lift)op=Math.min(1,.5+this.lift.t*.4);
   this.dx-=dt*(900+1400*L);du.style.opacity=op.toFixed(3);du.style.backgroundPosition=this.dx.toFixed(0)+'px 0,0 0'}
  const fl=$('s4-flk');if(fl){if(this.ph==='storm'&&L>.5&&!exp&&!this.lift){this.flkT-=dt;if(this.flkT<=0){this.flkT=rnd2(5,11);this.flkE=.55;this.tone(70,.4,.09,'sawtooth');this.hiss(.4,.05,500)}}
   if(this.flkE>0){this.flkE-=dt;fl.style.opacity=(Math.floor(this.flkE*16)%2===0?.5*Math.min(1,this.flkE*3):0).toFixed(2)}else fl.style.opacity=0}
  /* camera shake (hull rumble inside, buffeting outside) and the lift-off */
  if(L>.02&&!this.lift){const a=(exp?.07:.012)*L*(.7+.3*Math.sin(this.el*3.1)),sx=(Math.random()-.5)*a,sy=(Math.random()-.5)*a,sz=(Math.random()-.5)*a;mp.cp.x+=sx;mp.cp.y+=sy;mp.cp.z+=sz;mp.cl.x+=sx;mp.cl.y+=sy;mp.cl.z+=sz}
  if(this.lift){const Lf=this.lift;Lf.t+=dt;const u=Math.min(1,Lf.t/3.4);mp.cp.copy(Lf.p0).addScaledVector(Lf.w,16*u*u+3*u);mp.cp.y+=2.5*u+44*u*u;
   const dr=Lf.d0.clone().applyAxisAngle(Y_AX,u*5.6);dr.y+=Math.sin(u*9)*.7+u*.5;dr.normalize();mp.cl.copy(mp.cp).addScaledVector(dr,10);
   if(Lf.t>=3.4){this.lift=null;this.silence();this.dn.die('BLOWN AWAY BY THE STORM','THE WIND CARRIED YOU INTO THE SKY')}}}
 /* beacons, blueprint pads and the glowing RTGs */
 markers(t){const dn=this.dn,s4=dn.sol===4;
  if(this.cs){this.cs.mk.g.visible=s4&&this.ph==='msg';this.cs.mk.ring.scale.setScalar(1+.12*Math.sin(t*4));this.cs.rd.emissiveIntensity=Math.sin(t*5)>0?1.6:.15}
  if(this.cs&&this.cs.mk2){this.cs.mk2.g.visible=s4&&this.ph==='storm'&&!this.tested;this.cs.mk2.ring.scale.setScalar(1+.12*Math.sin(t*4))}
  this.ghostM&&(this.ghostM.opacity=.28+.12*Math.sin(t*5));
  for(const s of this.slots){const show=s4&&this.ph==='prep'&&!s.done;s.mk.g.visible=show;s.mk.ring.scale.setScalar(1+.12*Math.sin(t*4));
   if(!(this.ch&&this.ch.k==='place'&&this.ch.s===s))s.gh.visible=show;s.padM.opacity=s.done?.45:1;
   if(s.done){const g=s.real.userData.glow;g.emissiveIntensity=s.glow*(.8+.25*Math.sin(t*2.2+s.i));s.halo.material.opacity=Math.min(.6,s.glow*.4)*(.85+.15*Math.sin(t*2.2+s.i))}}}
 hud(){const L=(s,d,h)=>'<div class="s'+(d?' d':'')+(h?' h':'')+'">'+(d?'\u2713 ':h?'':'\u25b8 ')+s+'</div>',
  cur=this.ph==='msg'?0:(this.done||this.ph==='storm'||this.ph==='clear'||this.placed>=NEED_RTG)?3:this.craftN>=NEED_RTG?2:1,
  T=(i,n,body)=>'<div class="t'+((cur>i||(i===3&&this.tested))?' d':cur<i?' w':'')+'">TASK '+(i+1)+'/4  \u00b7  '+n+'</div>'+((cur===i||(cur<=2&&cur>=1&&i>=1&&i<=2))?body:'');
  const sc=this.count('scrap'),mn=this.count('mineral'),rg=this.count('regolith'),cap=this.count('pucap'),
   html='<h3>SOL 4  \u00b7  ISOLATION STORM</h3>'
   +T(0,'COLLECT THE HMSA MESSAGE',L('Go to the main hub console and receive it',this.msgShown&&this.ph!=='msg'))
   +T(1,'CRAFT 4 RTGs',L('Craft RTGs at the crafting table  '+Math.min(NEED_RTG,this.craftN)+'/'+NEED_RTG,this.craftN>=NEED_RTG)+L('Each RTG: 1 fuel capsule, 2 scrap, 1 mineral, 1 regolith',false,true)+L('You carry: capsules '+cap+'  \u00b7  scrap '+sc+'  \u00b7  minerals '+mn+'  \u00b7  regolith '+rg,false,true))
   +T(2,'INSTALL THE RTGs',L('Place them on the blueprint pads outside  '+this.placed+'/'+NEED_RTG,this.placed>=NEED_RTG)+L('Your solar panels stay where they are',false,true))
   +T(3,'TEST THE STORM FROM THE COMPUTER',(this.ph==='prep'&&!this.tested?L('Wait inside the base  \u00b7  the storm test unlocks when the storm hits',false,true):L('Go to the hub computer and press [E] to run the storm test',this.tested))+L('Stay inside the base until the storm passes',this.done));
  if(html!==this.last){this.last=html;$('s4-obj').innerHTML=html}}
}

/* =====================================================================================================
   SOL 5  -  "METEOR SHOWER"   (lives in this file; no new module)
   -----------------------------------------------------------------------------------------------------
   Pop-up at the Sol 4 -> Sol 5 dawn.  TASKS: 1 confirm the shower on the sky tracker (power console) -> 2 gather 3 scrap + 2 regolith
   -> 3 craft IMPACT SHIELDS (crafting table, makes 3) -> 4 fit a shield to the SOLAR ARRAY, the GREENHOUSE DOME and the HABITAT CORRIDOR
   (glowing markers, [E] 5 s each) -> 5 shelter inside for 60 s while the shower runs (night).
   NIGHT: 10-15 streaks (additive ribbons, whoosh) + 2-3 impacts near the base (shake, dust, flash, thud, crater decal). Unshielded target: panel -> power
   drop, greenhouse -> dn.blight (feeds the next sol's crop blight), corridor -> small O2 leak. Shielded: sparks + "SHIELD HELD". Outside = O2 / cold penalty.
   Hooks: DayNight (dn.s5): update / interact / freeze / holdSleep / onNight / dawn / retry / hud.  patchSol3Items chains patchSol5Items.
   ===================================================================================================== */
export const S5_DAY=420,S5_END=64,S5_N=15,S5_TL=.22,S5_R=2400,S5_H=2200,S5_NEED=60;   /* day length, shower length (s), max streaks, trail length, sky radius, impact start height (m), shelter seconds */
const SOLAR5={x:-34.6,z:7.3},STAND5={x:-44.4,z:7.5};                                  /* centre of the solar field / where you stand to fit its shield */
const S5L={shb:'WHOLE BASE',shp:'SOLAR ARRAY',shg:'GREENHOUSE DOME',shc:'HABITAT CORRIDOR'};
const DOME_R=46,DOME_H=19;   /* ONE shield dome over the whole base: radius / height (m), base-local */
Object.assign(RL,{shield:'IMPACT SHIELD'});
if(!RECIPES.some(q=>q.id==='shield'))RECIPES.push({id:'shield',cat:1,n:1,req:{scrap:3,regolith:2},info:'Impact shield \u00b7 hex armour plate with a deflector coil \u00b7 one shield covers the whole base',note:'SOL 5: take it to the shield generator outside the base door and hold [E] to cover the whole base.'});
function modelShield(){const g=new THREE.Group(),m=stdMat(0x59636e,{metalness:.8,roughness:.35}),c=stdMat(0x5de6ff,{emissive:0x5de6ff,emissiveIntensity:1.1,roughness:.3,metalness:.2});
 g.add(M(new THREE.CylinderGeometry(.12,.12,.03,6),m,0,.04,0),M(new THREE.CylinderGeometry(.075,.075,.034,6),c,0,.042,0),M(new THREE.CylinderGeometry(.03,.03,.04,12),m,0,.045,0));
 for(let k=0;k<6;k++){const a=k*Math.PI/3;g.add(M(new THREE.CylinderGeometry(.01,.01,.036,6),m,Math.cos(a)*.1,.045,Math.sin(a)*.1))}return g}
export function patchSol5Items(I){const hold={x:.28,y:-.26,z:-.68,rx:.3};
 I.shield={name:'IMPACT SHIELD',unit:'',info:'Hexagonal armour plate with a deflector coil \u00b7 fit it at the shield generator outside the base door \u00b7 covers the whole base',build:modelShield,size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold}}
const CSS5=`
#s5-obj{position:fixed;right:28px;top:124px;width:350px;z-index:30;padding:11px 15px;font:600 12px Consolas,monospace;letter-spacing:1px;color:#e8f4f8;background:rgba(6,10,18,.68);border-right:4px solid #5de6ff;border-radius:4px;opacity:0;transition:opacity .6s;pointer-events:none}
#s5-obj.on{opacity:1}#s5-obj h3{margin:0 0 8px;font-size:13px;letter-spacing:3px;color:#ffb347}#s5-obj .t{margin:7px 0 3px;font-size:12px;letter-spacing:2px;color:#ffb347}#s5-obj .t.d{color:#7dff9a;text-decoration:line-through;opacity:.6}#s5-obj .t.w{opacity:.4;color:#e8f4f8}
#s5-obj .s{margin:2px 0 2px 12px;opacity:.9}#s5-obj .s.d{opacity:.45;text-decoration:line-through;color:#8fa}#s5-obj .s.h{opacity:.6;font-size:11px;color:#9fd8ff}`;
/* one streak = 2 camera-facing ribbons (hot core + wide orange halo); head vertex bright, tail black -> additive glowing trail */
const _h=new THREE.Vector3(),_t=new THREE.Vector3(),_d=new THREE.Vector3(),_s=new THREE.Vector3(),_m=new THREE.Vector3();
function ribbon(P,C,i,Hd,Tl,cam,k){const o=i*36;_d.subVectors(Hd,Tl);_m.addVectors(Hd,Tl).multiplyScalar(.5).sub(cam).negate();_s.crossVectors(_d,_m);const l=_s.length();
 if(l<1e-6||k<=.002){P.fill(0,o,o+36);C.fill(0,o,o+36);return}_s.divideScalar(l);const dist=Hd.distanceTo(cam);
 for(let r=0;r<2;r++){const w=Math.max(dist*(r?.0042:.0011),r?.45:.1),b=o+r*18,ci=(r?.32:1)*k,c=r?[1,.5,.2]:[1,.97,.9];
  for(let j=0;j<3;j++){const q=(j-1)*w,u=(j-1)*w*.3;P[b+j*3]=Hd.x+_s.x*q;P[b+j*3+1]=Hd.y+_s.y*q;P[b+j*3+2]=Hd.z+_s.z*q;P[b+9+j*3]=Tl.x+_s.x*u;P[b+10+j*3]=Tl.y+_s.y*u;P[b+11+j*3]=Tl.z+_s.z*u}
  C[b+3]=c[0]*ci;C[b+4]=c[1]*ci;C[b+5]=c[2]*ci}}
function craterTex(){return ctx2(128,128,(x)=>{const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(14,9,7,.9)');g.addColorStop(.38,'rgba(24,15,11,.75)');g.addColorStop(.58,'rgba(150,104,74,.38)');g.addColorStop(.8,'rgba(40,26,18,.18)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
 for(let i=0;i<26;i++){const a=Math.random()*6.283,d=40+Math.random()*20;x.fillStyle='rgba(30,20,14,.45)';x.fillRect(64+Math.cos(a)*d,64+Math.sin(a)*d,2+Math.random()*3,2+Math.random()*3)}})}

export class Sol5{
 constructor(mp,dn){this.mp=mp;this.dn=dn;this.dom=false;this.objs=[];this.warnT=null;this.init()}
 get b(){return this.mp.base}
 get s(){return this.mp.salv}
 get freeze(){return !!this.ch}
 init(){this.on=false;this.done=false;this.stg=0;this.el=0;this.m0={};this.ch=null;this.sh={shb:false};this.noDome=false;this.sw=null;this.prog=0;this.dmg={solar:0,leak:0};this.hit={};this.domes={};this.stn={};this.rib=null;this.last='';this.lt=0}
 reset(){for(const o of this.objs)if(o.parent)o.parent.remove(o);this.objs=[];clearTimeout(this.warnT);for(const id of['s5-obj','s4-bar','s4-warn'])$(id)&&$(id).classList.remove('on');this.init()}
 dom0(){if(this.dom)return;this.dom=true;this.dn.s4.dom0();const st=document.createElement('style');st.textContent=CSS5;document.head.appendChild(st);document.body.insertAdjacentHTML('beforeend','<div id="s5-obj"></div>')}
 pop(t,x,ms){this.dn.s4.pop(t,x,ms)}
 warn(t){const e=$('s4-warn');if(!e)return;e.textContent=t;e.classList.add('on');clearTimeout(this.warnT);this.warnT=setTimeout(()=>e.classList.remove('on'),3800)}
 holdSleep(){return this.on&&!this.done&&!!this.sw}                       /* no dawn until the shower is survived */
 /* ---------- locations (base-local metres) ---------- */
 pos(k){if(k==='shb'){const a=this.b.S.airlockInfo;return{x:3.4,z:-(a.porchS+3.6),e:true}}   /* just outside the airlock, beside the ramp */
  if(k==='shp')return{x:STAND5.x,z:STAND5.z,e:true};
  const[id,ri,u,sd]=k==='shg'?['gre',1,.5,0]:k==='shc'?['liv',0,.3,-1]:['pow',1,.8,-1],sp=spoke(id),r=sp.regions[ri],s=lerp(r.s0,r.s1,u),t=sd*(r.hw-(ri?.9:.35));
  return{x:sp.dx*s+sp.nx*t,z:sp.dz*s+sp.nz*t,e:false}}
 hitPt(k){const R=Math.random;if(k==='shp')return{x:SOLAR5.x+(R()-.5)*10,z:SOLAR5.z+(R()-.5)*14};
  const sp=spoke(k==='shg'?'gre':'liv'),r=sp.regions[k==='shg'?1:0],s=lerp(r.s0,r.s1,.25+R()*.5),t=(k==='shg'?1:-1)*(r.hw+3.2+R()*1.5);return{x:sp.dx*s+sp.nx*t,z:sp.dz*s+sp.nz*t}}
 /* ---------- build ---------- */
 build(){const b=this.b,mp=this.mp,defs={ctrl:['#ffb347','SKY TRACKER'],shb:['#5de6ff','BASE SHIELD GENERATOR']};
  for(const k in defs){const q=this.pos(k);this.stn[k]=Object.assign(q,{k,mk:this.beacon(!q.e,q.x,q.z,defs[k][0],defs[k][1],7)})}
  /* meteor streaks: one dynamic mesh (MET_N x 2 ribbons), drawn in the near scene around the camera */
  const idx=[];for(let i=0;i<S5_N;i++)for(let r=0;r<2;r++){const v=i*12+r*6;idx.push(v,v+1,v+4,v,v+4,v+3,v+1,v+2,v+5,v+1,v+5,v+4)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(S5_N*36),3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(S5_N*36),3).setUsage(THREE.DynamicDrawUsage));g.setIndex(idx);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false,toneMapped:false}));
  m.frustumCulled=false;m.renderOrder=8;m.visible=false;mp.near.add(m);this.rib=m;this.objs.push(m);
  /* ONE dome over the whole base: appears when the shield is fitted at the generator by the base door */
  {const sph=new THREE.SphereGeometry(1,40,20,0,Math.PI*2,0,Math.PI/2),g2=new THREE.Group();g2.position.set(0,0,0);
   const fill=M(sph,new THREE.MeshBasicMaterial({color:0x5de6ff,transparent:true,opacity:.07,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}),0,0,0),
    wire=M(sph,new THREE.MeshBasicMaterial({color:0x9ff0ff,wireframe:true,transparent:true,opacity:.14,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}),0,0,0);
   fill.scale.set(DOME_R,DOME_H,DOME_R);wire.scale.set(DOME_R,DOME_H,DOME_R);g2.add(fill,wire);g2.visible=false;b.S.ext.add(g2);this.objs.push(g2);this.domes.shb={g:g2,fill,wire}}}
 /* ---------- start (called by DayNight at the Sol 4 -> 5 dawn) ---------- */
 start(){if(this.on||this.done)return;const b=this.b;if(!b||!b.S)return;this.on=true;this.dom0();this.m0=Object.assign({},this.s.cr.made);
  try{this.build()}catch(err){console.error('[sol5 build]',err);this.toast('SOL 5 BUILD ERROR: '+(err&&err.message||err),'#ff5a4a')}
  const o4=$('s4-obj');if(o4)o4.classList.remove('on');$('s5-obj').classList.add('on');
  this.pop('SOL 5  \u00b7  METEOR SHOWER','The sky has cleared. A meteor shower is forecast tonight. Shield the base before dark.',8500);
  this.tone(392,.25,.05);setTimeout(()=>this.tone(523,.3,.05),160);this.last=''}
 /* ---------- interaction ---------- */
 near(){const b=this.b,P=b.p;if(!this.on||this.dn.sol!==5||this.dn.night||this.done)return null;let best=null,bd=9;
  for(const k in this.stn){const q=this.stn[k];if(!q.mk.g.visible)continue;if(q.e?b.mode!=='outside':b.mode!=='inside')continue;const d=Math.hypot(P.x-q.x,P.z-q.z);if(d<(q.e?4.6:3)&&d<bd){bd=d;best=q}}return best}
 interact(){if(!this.on||this.dn.sol!==5)return false;if(this.ch)return true;const n=this.near();if(!n)return false;
  if(n.k==='ctrl'){this.ch={k:'ctrl',t:0,dur:5,lab:'CONFIRMING THE SHOWER ON THE SKY TRACKER'};this.tone(440,.2,.04);return true}
  if(this.count('shield')<1){this.toast('NEED AN IMPACT SHIELD  \u00b7  CRAFT THEM AT THE CRAFTING TABLE','#ff5a4a');return true}
  this.ch={k:'fit',s:n,t:0,dur:5,lab:'FITTING IMPACT SHIELD  \u00b7  '+S5L[n.k]};this.hiss(.4,.04,1200);this.tone(300,.3,.05);return true}
 stepCh(dt){const c=this.ch,p=this.b.p;c.t+=dt;const u=Math.min(1,c.t/c.dur),bar=$('s4-bar');bar.innerHTML=c.lab+'<i><u style="width:'+(u*100).toFixed(0)+'%"></u></i>';bar.classList.add('on');
  const q=c.s||this.stn.ctrl;if(q){const want=Math.atan2(q.z-p.z,q.x-p.x);p.yaw+=Math.atan2(Math.sin(want-p.yaw),Math.cos(want-p.yaw))*Math.min(1,dt*4)}
  if(c.k==='ctrl'){if((c.tn=(c.tn||0)-dt)<=0){c.tn=.5;this.tone(600+Math.random()*500,.08,.025,'sine')}}
  else if(Math.random()<dt*8)this.sparks(this.domeTop(c.s.k),3);
  if(u>=1)this.finish(c)}
 finish(c){this.ch=null;$('s4-bar').classList.remove('on');
  if(c.k==='ctrl'){this.stg=Math.max(this.stg,1);this.toast('\u2714 SHOWER CONFIRMED  \u00b7  FORECAST: TONIGHT','#7dff9a');this.mp.cap('METEOR SHOWER CONFIRMED  \u00b7  GATHER SCRAP AND REGOLITH',3600);this.tone(660,.18,.05)}
  else{const k=c.s.k;if(!this.take('shield',1)){this.last='';return}this.sh[k]=true;this.hit[k]=1;this.sparks(this.domeTop(k),40);this.toast('\u2714 SHIELD FITTED  \u00b7  '+S5L[k],'#7dff9a');this.tone(900,.25,.05);setTimeout(()=>this.tone(1300,.2,.04),120);
   if(this.sh.shb){this.stg=Math.max(this.stg,4);this.mp.cap('BASE SHIELD ACTIVE  \u00b7  WHOLE BASE PROTECTED  \u00b7  GET INSIDE BEFORE NIGHT',3800)}}
  this.last=''}
 domeTop(k){if(k==='shb'){const q=this.stn.shb;if(q)return this.b.root.localToWorld(new THREE.Vector3(q.x,this.b.groundY(q.x,q.z)+1.6,q.z))}
  const d=this.domes[k];if(!d)return new THREE.Vector3();const p=d.g.position;return this.b.root.localToWorld(new THREE.Vector3(p.x,p.y+(k==='shp'?4:5),p.z))}
 sparks(W,n){const f=this.mp.fire,R=Math.random;if(!f)return;for(let i=0;i<n;i++){const a=R()*6.283,sp=3+R()*9;f.emit(W.x,W.y,W.z,Math.cos(a)*sp,R()*9,Math.sin(a)*sp,.3+R()*.5,.4+R()*.5,.15,.5,.9,1,1,.3,0,-5)}}
 /* [PAGE UP] test skip: finish Sol 5 as if played */
 complete(){if(this.done)return;if(!this.on)this.start();if(!this.on)return;this.ch=null;$('s4-bar')&&$('s4-bar').classList.remove('on');for(const k in this.sh){this.sh[k]=true;if(this.domes[k])this.domes[k].g.visible=true}if(this.sw&&this.rib)this.rib.visible=false;this.stg=5;this.finishSol();this.last=''}
 finishSol(){this.done=true;this.stg=5;this.mp.cap('SOL 5 COMPLETE  \u00b7  METEOR SHOWER SURVIVED',4600);this.pop('SHOWER SURVIVED','The sky is quiet again. Check the base, then rest until dawn.',8000);this.tone(523,.3,.05);setTimeout(()=>this.tone(659,.3,.05),180);setTimeout(()=>this.tone(784,.6,.05),380)}
 onNight(){if(!this.on||this.dn.sol!==5||this.done||this.sw)return;this.ch=null;$('s4-bar')&&$('s4-bar').classList.remove('on');this.startShower();
  this.pop('NIGHT FALLS  \u00b7  METEOR SHOWER','Get INSIDE the base and stay there until the shower is over. Unshielded modules will be damaged.',7000)}
 /* ---------- the shower ---------- */
 startShower(){const R=Math.random,b=this.b,n=10+(R()*6|0),k=2+(R()<.5?1:0),ts=[];for(let i=0;i<n;i++)ts.push(2.5+R()*(S5_END-12));ts.sort((x,y)=>x-y);
  const tg=['shp','shg','shc'].sort(()=>R()-.5).slice(0,k),sl=(k===3?[.3,.58,.84]:[.4,.8]).map(q=>Math.floor(q*n));
  const m=ts.map((t0,i)=>{const j=sl.indexOf(i),o={t0,imp:j>=0?tg[j]:null,dur:j>=0?1.15:.75+R()*.7,b:.55+R()*.65,s:false,done:false,az:R()*6.283,e0:.35+R()*.8,da:(R()<.5?-1:1)*(.45+R()*.8),de:.25+R()*.4};
   if(o.imp){const L=this.hitPt(o.imp),el=.75+R()*.35,az=R()*6.283;o.L=L;o.W=b.root.localToWorld(new THREE.Vector3(L.x,b.groundY(L.x,L.z),L.z));o.d=new THREE.Vector3(Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az))}return o});
  this.sw={t:0,m};if(this.rib)this.rib.visible=true;this.warn('\u2604 METEOR SHOWER INBOUND  \u00b7  STAY INSIDE');this.tone(300,.4,.06,'sawtooth')}
 sky(m,u,cam,o){const az=m.az+m.da*u,el=Math.max(.04,m.e0-m.de*u),c=Math.cos(el);return o.set(cam.x+c*Math.cos(az)*S5_R,cam.y+Math.sin(el)*S5_R,cam.z+c*Math.sin(az)*S5_R)}
 meteors(dt){const w=this.sw;if(!w||!this.rib)return;w.t+=dt;
  const cam=this.mp.ncam.position,G=this.rib.geometry.attributes,P=G.position.array,C=G.color.array;
  w.m.forEach((m,i)=>{const p=(w.t-m.t0)/m.dur;if(p<0||p>1+S5_TL){P.fill(0,i*36,i*36+36);C.fill(0,i*36,i*36+36);return}
   if(!m.s){m.s=true;this.whoosh((m.imp?.12:.07)*m.b)}
   const hu=Math.min(p,1),tu=clamp(p-S5_TL,0,1);let k;
   if(m.imp){_h.copy(m.d).multiplyScalar(S5_H*(1-hu)).add(m.W);_t.copy(m.d).multiplyScalar(S5_H*(1-tu)).add(m.W);k=m.b*1.3*sst(0,.1,p)*(1-sst(1,1+S5_TL,p))}
   else{this.sky(m,hu,cam,_h);this.sky(m,tu,cam,_t);k=m.b*sst(0,.15,p)*(1-sst(.7,1.02,p))}
   ribbon(P,C,i,_h,_t,cam,k);if(m.imp&&!m.done&&p>=1){m.done=true;this.impact(m.imp,m)}});
  G.position.needsUpdate=G.color.needsUpdate=true;if(w.t>=S5_END+3)this.rib.visible=false}
 impact(k,m){const mp=this.mp,b=this.b,dn=this.dn,W=m.W,ex=this.exposed(),R=Math.random,rnd=(a,c)=>a+R()*(c-a),held=this.sh.shb;
  this.thud(ex?.55:.35);mp.kick=Math.max(mp.kick||0,ex?.38:.2);                                       /* camera shake + thud */
  if(mp.flash){mp.flash.position.set(W.x,W.y+7,W.z);mp.flashI=Math.max(mp.flashI||0,7e4)}            /* short flash */
  if(mp.puffs){for(let i=0;i<70;i++){const a=rnd(0,6.283),sp=rnd(3,16);mp.puffs.emit(W.x,W.y+rnd(.2,1.2),W.z,Math.cos(a)*sp,rnd(.5,5),Math.sin(a)*sp,rnd(3,6),rnd(1.2,3),rnd(9,20),.80,.54,.40,.55,.9,.3,-.2)}   /* dust cloud */
   for(let i=0;i<35;i++)mp.puffs.emit(W.x+rnd(-1,1),W.y+rnd(.3,1.5),W.z+rnd(-1,1),rnd(-2,2),rnd(7,16),rnd(-2,2),rnd(3,5.5),rnd(1.5,3),rnd(8,16),.62,.42,.32,.5,.7,.2,-.4)}
  if(mp.fire)for(let i=0;i<40;i++){const a=rnd(0,6.283),sp=rnd(4,18);mp.fire.emit(W.x,W.y+.4,W.z,Math.cos(a)*sp,rnd(3,14),Math.sin(a)*sp,rnd(.4,1.1),rnd(.5,1.2),.2,1,rnd(.6,.85),rnd(.25,.45),1,.3,0,-6)}
  this.crater(m.L.x,m.L.z);
  if(held){this.hit.shb=1;this.toast('SHIELD HELD  \u00b7  BASE UNDAMAGED','#5de6ff');this.tone(1400,.14,.04,'sine');this.sparks(new THREE.Vector3(W.x,W.y+4,W.z),45)}                  /* sparks only */
  else if(k==='shp'){this.dmg.solar=this.el+150;b.sim.bat=Math.max(12,b.sim.bat-12);this.warn('\u26a0 SOLAR ARRAY HIT  \u00b7  POWER DROPPING')}
  else if(k==='shg'){dn.blight=true;this.warn('\u26a0 GREENHOUSE DOME HIT  \u00b7  CROPS BLIGHTED')}
  else{this.dmg.leak=this.el+90;this.warn('\u26a0 CORRIDOR HIT  \u00b7  SMALL PRESSURE LEAK')}
  if(ex&&!held){const v=mp.sv;if(v&&!v.dead)v.o2=Math.max(0,v.o2-6);dn.cold=Math.min(DEATH_S-1,dn.cold+4);this.toast('\u2604 DEBRIS HIT  \u00b7  \u22126% O\u2082  \u00b7  CORE TEMP DROPPING','#ff8a7a')}}   /* outside: suit penalty */
 crater(x,z){const b=this.b,r=1.2+Math.random()*1,t=this._ct||(this._ct=craterTex()),m=new THREE.Mesh(new THREE.CircleGeometry(r*2,24),stdMat(0xffffff,{map:t,transparent:true,depthWrite:false,roughness:1,metalness:0,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
  m.rotation.x=-Math.PI/2;m.rotation.z=Math.random()*6.283;m.position.set(x,b.groundY(x,z)+.07,z);b.S.ext.add(m);this.objs.push(m)}
 /* soft whoosh + thud on the shared WebAudio context / noise buffer */
 whoosh(v){const a=this.mp.audio;if(!a||!a.buf)return;try{const ac=a.ac,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime,d=.9+Math.random()*.5;s.buffer=a.buf;f.type='bandpass';f.Q.value=.8;f.frequency.setValueAtTime(3200,t);f.frequency.exponentialRampToValueAtTime(500,t+d);
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(v,t+d*.3);g.gain.exponentialRampToValueAtTime(.0005,t+d);s.connect(f);f.connect(g);g.connect(ac.destination);s.start(t,Math.random()*.4);s.stop(t+d+.05)}catch(e){}}
 thud(v){const a=this.mp.audio;this.tone(52,.6,v*.35,'sine');this.tone(34,.9,v*.25,'sine');if(!a||!a.buf)return;try{const ac=a.ac,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime;s.buffer=a.buf;f.type='lowpass';f.frequency.value=170;
  g.gain.setValueAtTime(v*1.6,t);g.gain.exponentialRampToValueAtTime(.001,t+1.1);s.connect(f);f.connect(g);g.connect(ac.destination);s.start(t,Math.random()*.5);s.stop(t+1.2)}catch(e){}}
 /* ---------- per frame ---------- */
 update(dt){if(!this.on)return;this.dom0();const dn=this.dn,b=this.b,t=performance.now()/1000;dt=Math.min(dt,.1);this.el+=dt;
  if(this.ch)this.stepCh(dt);
  if(dn.sol===5&&!this.done){
   const made=(this.s.cr.made.shield||0)-(this.m0.shield||0),have=made>0||this.count('shield')>0;
   if(this.stg===1&&(have||(this.count('scrap')>=3&&this.count('regolith')>=2)))this.stg=have?3:2;
   if(this.stg===2&&have)this.stg=3;
   if(dn.night&&this.sw&&b.interior)this.prog=Math.min(S5_NEED,this.prog+dt);
   if(this.sw&&this.prog>=S5_NEED&&this.sw.t>=S5_END)this.finishSol()}
  this.meteors(dt);this.effects(dt);this.markers(t);
  if(!this.ch){const n=this.near(),pr=$('b-prompt');let h='';
   if(n&&n.k==='ctrl')h=this.stg===0?'<b>E</b>CONFIRM THE SHOWER ON THE SKY TRACKER':'';
   else if(n)h=this.count('shield')>0?'<b>E</b>FIT IMPACT SHIELD  \u00b7  '+S5L[n.k]:'NEED AN IMPACT SHIELD  \u00b7  CRAFT THEM AT THE CRAFTING TABLE';
   if(h&&pr){pr.innerHTML=h;pr.classList.add('on')}}
  $('s5-obj').classList.toggle('on',dn.sol===5);this.hud()}
 /* damage over time from unshielded hits */
 effects(dt){const b=this.b,v=this.mp.sv,D5=this.dmg;
  if(D5.solar){if(this.el<D5.solar)b.sim.bat=clamp(b.sim.bat-.07*dt,12,100);else{D5.solar=0;this.toast('BACKUP ARRAY ONLINE  \u00b7  POWER RESTORED','#5de6ff')}}
  if(D5.leak){if(this.el<D5.leak){if(v&&!v.dead&&b.interior)v.o2=Math.max(0,v.o2-.12*dt);if((this.lt-=dt)<=0){this.lt=3;this.hiss(.5,.03,3500)}}else{D5.leak=0;this.toast('AUTO-SEALANT HELD  \u00b7  CORRIDOR LEAK SEALED','#5de6ff')}}}
 /* beacons + shield domes */
 markers(t){const dn=this.dn,s5=dn.sol===5&&!this.done&&!dn.night;
  for(const k in this.stn){const q=this.stn[k];q.mk.g.visible=s5&&(k==='ctrl'?this.stg===0:this.stg===3&&!this.sh[k]);q.mk.ring.scale.setScalar(1+.12*Math.sin(t*4))}
  const cp=this.mp.cp,rp=this.b&&this.b.root?this.b.root.position:null,far=rp?Math.hypot(cp.x-rp.x,cp.z-rp.z)>DOME_R*1.8:false;
  for(const k in this.domes){const d=this.domes[k],on=!!this.sh[k];d.g.visible=on&&!far&&!this.noDome;if(!d.g.visible)continue;this.hit[k]=Math.max(0,(this.hit[k]||0)-.016*2);d.fill.material.opacity=.07+.03*Math.sin(t*2+k.length)+.4*this.hit[k];d.wire.material.opacity=.14+.5*this.hit[k]}}
 hudText(){if(!this.on||this.done||this.dn.sol!==5||this.dn.night)return null;const left=this.dn.len-this.dn.t,n=this.sh.shb?1:0;
  return[left<=WARN_S?'SOL 5  \u00b7  NIGHTFALL IN '+fmt(left)+'  \u00b7  RETURN TO BASE':'SOL 5  \u00b7  METEOR SHOWER TONIGHT  \u00b7  BASE SHIELD '+n+'/1  \u00b7  DAYLIGHT '+fmt(left),left<=WARN_S?'warn':left<=60?'warn':'']}
 nightText(){const w=this.sw;return w&&w.t<S5_END?'SOL 5  \u00b7  METEOR SHOWER  \u00b7  STAY INSIDE  \u00b7  '+fmt(S5_END-w.t):'SOL 5  \u00b7  SHOWER OVER  \u00b7  STAY INSIDE'}
 hud(){const L=(s,d,h)=>'<div class="s'+(d?' d':'')+(h?' h':'')+'">'+(d?'\u2713 ':h?'':'\u25b8 ')+s+'</div>',c=this.stg,T=(i,n,body)=>'<div class="t'+(c>i?' d':c<i?' w':'')+'">TASK '+(i+1)+'/5  \u00b7  '+n+'</div>'+(c===i?body:''),
   sc=this.count('scrap'),rg=this.count('regolith'),sd=this.count('shield'),f=k=>L('Whole-base impact shield',this.sh[k]),
   html='<h3>SOL 5  \u00b7  METEOR SHOWER</h3>'
   +T(0,'CONFIRM THE SHOWER',L('Use the SKY TRACKER at the power console',false))
   +T(1,'GATHER MATERIALS',L('3 scrap + 2 regolith  \u00b7  carrying '+sc+' / '+rg,false))
   +T(2,'CRAFT AN IMPACT SHIELD',L('Crafting table: 3 scrap + 2 regolith makes 1 shield',false))
   +T(3,'ACTIVATE THE BASE SHIELD  \u00b7  '+sd+' IN PACK',f('shb')+L('Go outside: glowing marker by the base door  \u00b7  hold [E]',false,true))
   +T(4,'SHELTER DURING THE SHOWER',L('Stay inside the base  '+Math.floor(this.prog)+' / '+S5_NEED+' s',this.done)+L('Without the shield the modules take damage',false,true));
  if(html!==this.last){this.last=html;$('s5-obj').innerHTML=html}}
}
Object.assign(Sol5.prototype,{stacks:Sol4.prototype.stacks,count:Sol4.prototype.count,take:Sol4.prototype.take,toast:Sol4.prototype.toast,tone:Sol4.prototype.tone,hiss:Sol4.prototype.hiss,exposed:Sol4.prototype.exposed,beacon:Sol4.prototype.beacon});

/* =====================================================================================================
   SOL 6  -  "GOING HOME"   (lives in this file; no new module)
   -----------------------------------------------------------------------------------------------------
   8-minute day. A HMSA message at the hub comms console delivers the LAST data chip (the return trajectory) and announces
   departure on SOL 7.  TASKS: 1 PACK for the 7-month flight - store 7 food + 7 oxygen canisters in the landing capsule and load the
   chip -> 2 CHARGE the capsule: craft a CHARGING CABLE, run it base -> capsule, batteries to 100% -> 3 collect 5 rock samples and store them.
   Everything done -> the shared "ALL TASKS COMPLETE" fast-forward skips the day to 1:00 before dusk. Dawn = SOL 7.
   Hooks: DayNight (dn.s6): update / interact / freeze / complete / retry / hud.  patchSol3Items chains patchSol6Items.
   ===================================================================================================== */
export const S6_DAY=480,S6_FOOD=7,S6_O2=7,S6_SMP=5,S6_CHG=75;   /* day length (s), food items, oxygen units, rock samples, seconds to charge */
const S6_FOODIDS=['ration','spudration','spudsoup'];
Object.assign(RL,{cable:'CHARGING CABLE'});
if(!RECIPES.some(q=>q.id==='cable'))RECIPES.push({id:'cable',cat:1,n:1,req:{scrap:4,mineral:2},info:'Charging cable \u00b7 braided aluminium conductor, mineral-insulated and sheathed in a regolith-sintered jacket \u00b7 links the base power system to the return capsule',note:'SOL 6: plug it into an RTG, then carry it to the capsule charging port.'});
function modelCable(){const g=new THREE.Group(),w=stdMat(0xff8a2a,{roughness:.5,metalness:.2}),k=stdMat(0x2a2f36,{metalness:.7,roughness:.4});
 for(let i=0;i<3;i++){const t=M(new THREE.TorusGeometry(.085,.016,8,24),w,0,.03+i*.028,0);t.rotation.x=Math.PI/2;g.add(t)}
 g.add(M(new THREE.CylinderGeometry(.022,.022,.08,8),k,.1,.05,.07),M(new THREE.CylinderGeometry(.022,.022,.08,8),k,-.1,.05,-.07));return g}
export function patchSol6Items(I){const hold={x:.28,y:-.26,z:-.68,rx:.3};
 I.cable={name:'CHARGING CABLE',unit:'',info:'Heavy-duty power cable \u00b7 pick it up at an RTG power port, carry it and plug it into the return capsule charging port',build:modelCable,size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold};
 I.returnchip={name:'EARTH RETURN DATA CHIP',unit:'',info:'The LAST data chip \u00b7 return trajectory coded by Mission Control \u00b7 load it into the capsule flight computer',build:modelChip,size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold}}
const CSS6=CSS5.replace(/s5-obj/g,'s6-obj');
function capLabel(){const c=document.createElement('canvas');c.width=320;c.height=128;const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false}));spr.renderOrder=9;spr.scale.set(8,3.2,1);return{c,x:c.getContext('2d'),tex,spr,key:''}}

export class Sol6{
 constructor(mp,dn){this.mp=mp;this.dn=dn;this.dom=false;this.objs=[];this.init()}
 get b(){return this.mp.base}
 get s(){return this.mp.salv}
 get freeze(){return !!this.ch}
 init(){this.on=false;this.done=false;this.stg=0;this.el=0;this.ch=null;this.msgShown=false;this.chipDue=false;this.st={food:0,o2:0,chip:false,smp:0,conn:false,chg:0};this.stn={};this.cab=null;this.cabPh=0;this.jn=[];this.port=null;this.sp=null;this.flash=null;this.flashT=0;this.flashK=1;this.carryT=null;this.plugH=null;this.plugR=null;this.plugP=null;this.jSel=null;this.lab=null;this.labT=0;this.last='';this.warn7=false}
 reset(){for(const o of this.objs)if(o.parent)o.parent.remove(o);this.objs=[];for(const id of['s6-obj','s4-bar','s4-msg'])$(id)&&$(id).classList.remove('on');this.init()}
 dom0(){if(this.dom)return;this.dom=true;this.dn.s4.dom0();const st=document.createElement('style');st.textContent=CSS6;document.head.appendChild(st);document.body.insertAdjacentHTML('beforeend','<div id="s6-obj"></div>')}
 pop(t,x,ms){this.dn.s4.pop(t,x,ms)}
 /* ---------- counts ---------- */
 foodHave(){return S6_FOODIDS.reduce((a,id)=>a+this.count(id),0)}
 o2Have(){return this.count('o2can')+2*this.count('o2big')}
 storable(){const st=this.st,f=Math.min(S6_FOOD-st.food,this.foodHave()),o=Math.min(S6_O2-st.o2,this.o2Have()),c=(!st.chip&&this.count('returnchip')>0)?1:0,m=Math.min(S6_SMP-st.smp,this.count('mineral')),p=[];
  if(f>0)p.push(f+' FOOD');if(o>0)p.push(o+' O\u2082');if(c)p.push('DATA CHIP');if(m>0)p.push(m+' SAMPLES');return{f,o,c,m,total:f+o+c+m,txt:p.join('  \u00b7  ')}}
 /* ---------- build ---------- */
 build(){const b=this.b,S=b.S,P=this.mp.pod;let lx=0,lz=-70;if(P){const l=b.root.worldToLocal(new THREE.Vector3(P.x,0,P.z));lx=l.x;lz=l.z}
  const c4=this.dn.s4.cs,cx=c4?c4.x:0,cz=c4?c4.z:-3.4;
  this.stn.comm={k:'comm',x:cx,z:cz,e:false,mk:this.beacon(true,cx,cz,'#5da8ff','HMSA MESSAGE')};
  this.stn.cap={k:'cap',x:lx,z:lz,e:true,mk:this.beacon(false,lx,lz,'#7dff9a','RETURN CAPSULE',11)};
  const L=this.lab=capLabel();L.spr.position.set(lx,b.groundY(lx,lz)+5.4,lz);L.spr.visible=false;S.ext.add(L.spr);this.objs.push(L.spr);try{this.buildCable()}catch(err){console.error('[sol6 cable build]',err)}}
 /* ===== RTG -> capsule POWER CABLE.  Plug the cable into an RTG junction box, CARRY the live wire across the terrain
          (it hangs from your hand and drags on the ground), plug it into the capsule CHARGING PORT; sparks at every connection. ===== */
 jlist(){const o=[],A=this.dn.s4&&this.dn.s4.slots;if(A)for(const s of A)if(s&&(s.done||(s.real&&s.real.visible)))o.push(s);return o}
 mkPlug(){const g=new THREE.Group(),dk=stdMat(0x2a2f36,{metalness:.7,roughness:.4}),pl=stdMat(0xc3cbd3,{metalness:.85,roughness:.3}),r=new THREE.MeshStandardMaterial({color:0xff8a2a,emissive:0xff6a10,emissiveIntensity:.9,roughness:.4});
  const bd=M(new THREE.CylinderGeometry(.05,.055,.2,12),dk,0,0,0);bd.rotation.z=Math.PI/2;const nz=M(new THREE.CylinderGeometry(.032,.032,.09,10),pl,.14,0,0);nz.rotation.z=Math.PI/2;const rg=M(new THREE.TorusGeometry(.056,.01,6,14),r,-.03,0,0);rg.rotation.y=Math.PI/2;g.add(bd,nz,rg);return g}
 plugAt(pl,pt,nx,nz){pl.position.set(pt.x+nx*.185,pt.y,pt.z+nz*.185);pl.rotation.y=Math.atan2(nz,-nx)}   /* nose points INTO the socket (against the outward normal n) */
 buildCable(){const b=this.b,S=b.S,ext=S.ext,a=S.airlockInfo,q=this.stn.cap,dk=stdMat(0x2b2f36,{metalness:.7,roughness:.45}),pl=stdMat(0xc3cbd3,{metalness:.85,roughness:.35}),sk=stdMat(0x0b0d10,{metalness:.5,roughness:.5});
  this.ledM=new THREE.MeshStandardMaterial({color:0xff3a2a,emissive:0xff3a2a,emissiveIntensity:1.5,roughness:.4});
  /* a power junction box beside every installed RTG (fallback: one at the airlock porch if no RTG is installed) */
  const js=this.jlist(),items=js.length?js.map(s=>({parent:s.grp,lx:0,ly:0,lz:1.05,wx:s.x,wy:s.y,wz:s.z+1.05})):(()=>{const jx=0,jz=-(a.porchS+.6),gy=b.groundY(jx,jz);return[{parent:ext,lx:jx,ly:gy,lz:jz,wx:jx,wy:gy,wz:jz}]})();
  this.jn=[];
  for(const it of items){const jb=new THREE.Group();jb.position.set(it.lx,it.ly,it.lz);
   const sock=M(new THREE.CylinderGeometry(.085,.085,.05,18),sk,0,.27,.17);sock.rotation.x=Math.PI/2;const cd=M(new THREE.CylinderGeometry(.045,.045,.26,8),dk,0,.1,-.25);cd.rotation.x=Math.PI/2;
   jb.add(M(new THREE.BoxGeometry(.5,.46,.3),dk,0,.23,0),M(new THREE.BoxGeometry(.42,.36,.02),pl,0,.26,.16),sock,M(new THREE.SphereGeometry(.028,8,6),this.ledM,.17,.4,.17),cd);it.parent.add(jb);this.objs.push(jb);
   const pt={x:it.wx,y:it.wy+.27,z:it.wz+.195};this.jn.push({x:pt.x,z:pt.z,y:pt.y,pt,A:{x:pt.x,y:pt.y,z:pt.z+.3}})}
  /* charging port panel on the base-facing side of the return capsule */
  const tx=0,tz=-(a.porchS+.6);let dx=tx-q.x,dz=tz-q.z;const dl=Math.hypot(dx,dz)||1;dx/=dl;dz/=dl;
  const px=q.x+dx*1.35,pz=q.z+dz*1.35,gy=b.groundY(px,pz),pg=new THREE.Group();pg.position.set(px,gy,pz);pg.rotation.y=Math.atan2(dx,dz);
  const ps=M(new THREE.CylinderGeometry(.1,.1,.06,20),sk,0,1.05,.1);ps.rotation.x=Math.PI/2;
  pg.add(M(new THREE.BoxGeometry(.62,.5,.14),dk,0,1.05,0),M(new THREE.BoxGeometry(.5,.38,.02),pl,0,1.05,.08),ps,M(new THREE.SphereGeometry(.035,8,6),this.ledM,.2,1.22,.09),M(new THREE.BoxGeometry(.12,1.0,.12),dk,0,.5,-.05),M(new THREE.BoxGeometry(.6,.05,.4),dk,0,.025,-.1));
  const lb=lab4('CHARGING PORT','#5de6ff');lb.position.set(0,1.75,0);lb.scale.set(2.1,.4,1);pg.add(lb);ext.add(pg);this.objs.push(pg);
  this.port={x:px+dx*.195,z:pz+dz*.195,y:gy+1.05,dx,dz};
  /* beacons: nearest RTG port (to the capsule) and the capsule port */
  let bj=this.jn[0];for(const j of this.jn)if(Math.hypot(j.x-q.x,j.z-q.z)<Math.hypot(bj.x-q.x,bj.z-q.z))bj=j;
  this.stn.rtg={k:'rtgb',x:bj.x,z:bj.z,mk:this.beacon(false,bj.x,bj.z,'#5de6ff','RTG POWER PORT',6)};
  this.stn.port={k:'portb',x:px,z:pz,mk:this.beacon(false,px,pz,'#7dff9a','CHARGING PORT',5)};
  /* electrical sparks + connection flash */
  const N=120,g=new THREE.BufferGeometry(),sp={N,i:0,act:false,geo:g,p:new Float32Array(N*3).fill(-9999),c:new Float32Array(N*3),cb:new Float32Array(N*3),v:new Float32Array(N*3),l:new Float32Array(N)};
  g.setAttribute('position',new THREE.BufferAttribute(sp.p,3));g.setAttribute('color',new THREE.BufferAttribute(sp.c,3));
  const pts=new THREE.Points(g,new THREE.PointsMaterial({size:.17,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true,fog:false}));pts.frustumCulled=false;ext.add(pts);this.objs.push(pts);this.sp=sp;
  const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:haloTex(),color:0x9fe8ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0,fog:false}));fl.renderOrder=8;fl.scale.set(2,2,1);ext.add(fl);this.objs.push(fl);this.flash=fl}
 emit(x,y,z,n,big){const sp=this.sp;if(!sp)return;const R=Math.random;
  for(let k=0;k<n;k++){const i=sp.i=(sp.i+1)%sp.N,a=R()*6.283,v=1.2+R()*(big?6.5:3.5),w=R()<.6;
   sp.p[i*3]=x;sp.p[i*3+1]=y;sp.p[i*3+2]=z;sp.v[i*3]=Math.cos(a)*v;sp.v[i*3+1]=1+R()*(big?5.5:3);sp.v[i*3+2]=Math.sin(a)*v;sp.l[i]=.35+R()*.55;
   sp.cb[i*3]=w?1:.45;sp.cb[i*3+1]=w?.92:.85;sp.cb[i*3+2]=w?.65:1}
  sp.act=true;if(this.flash){this.flash.position.set(x,y,z);this.flashT=big?.4:.16;this.flashK=big?1:.5}}
 updSparks(dt){const sp=this.sp;if(!sp)return;
  if(this.flash){if(this.flashT>0){this.flashT-=dt;const f=Math.max(0,this.flashT)/.4*this.flashK;this.flash.material.opacity=Math.min(1,f*1.7);this.flash.scale.setScalar(1.5+2.5*this.flashK*(1-Math.max(0,this.flashT)/.4))}else this.flash.material.opacity=0}
  if(!sp.act)return;let alive=0;const b=this.b;
  for(let i=0;i<sp.N;i++){if(sp.l[i]<=0)continue;sp.l[i]-=dt;if(sp.l[i]<=0){sp.p[i*3+1]=-9999;sp.c[i*3]=sp.c[i*3+1]=sp.c[i*3+2]=0;continue}alive++;
   sp.v[i*3+1]-=6*dt;sp.p[i*3]+=sp.v[i*3]*dt;sp.p[i*3+1]+=sp.v[i*3+1]*dt;sp.p[i*3+2]+=sp.v[i*3+2]*dt;
   const g=b.groundY(sp.p[i*3],sp.p[i*3+2])+.03;if(sp.p[i*3+1]<g){sp.p[i*3+1]=g;sp.v[i*3+1]*=-.35;sp.v[i*3]*=.6;sp.v[i*3+2]*=.6}
   const f=Math.min(1,sp.l[i]*3);sp.c[i*3]=sp.cb[i*3]*f;sp.c[i*3+1]=sp.cb[i*3+1]*f;sp.c[i*3+2]=sp.cb[i*3+2]*f}
  sp.geo.attributes.position.needsUpdate=true;sp.geo.attributes.color.needsUpdate=true;if(!alive)sp.act=false}
 /* cable route: lies on the terrain with a gentle wiggle, and hangs from its two end points (RTG socket / hand / capsule socket) in a smooth droop */
 cablePts(A,B,N){const b=this.b,dx=B.x-A.x,dz=B.z-A.z,L=Math.max(.01,Math.hypot(dx,dz)),nx=-dz/L,nz=dx/L,hA=Math.max(.05,A.y-b.groundY(A.x,A.z)-.06),hB=Math.max(.05,B.y-b.groundY(B.x,B.z)-.06),hd=Math.min(3.2,Math.max(.8,L*.45)),pts=[];
  for(let i=0;i<=N;i++){const u=i/N,s=u*L,w=Math.sin(u*L*.5+.9)*Math.min(.45,L*.04)*Math.sin(Math.PI*u),x=A.x+dx*u+nx*w,z=A.z+dz*u+nz*w,g=b.groundY(x,z)+.06,kA=1-sst(0,1,s/hd),kB=1-sst(0,1,(L-s)/hd);
   pts.push(new THREE.Vector3(x,g+hA*kA+hB*kB,z))}return pts}
 tube(pts,r,old,mat){const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(24,pts.length*2),r,6,false);if(old){old.geometry.dispose();old.geometry=geo;return old}const m=new THREE.Mesh(geo,mat);m.frustumCulled=false;this.b.S.ext.add(m);this.objs.push(m);return m}
 startCarry(j){const ext=this.b.S.ext;this.jSel=j;this.plugR=this.mkPlug();this.plugH=this.mkPlug();this.plugAt(this.plugR,j.pt,0,1);ext.add(this.plugR,this.plugH);this.objs.push(this.plugR,this.plugH);
  this.carryM=this.carryM||new THREE.MeshStandardMaterial({color:0x1d1f24,emissive:0xff8a2a,emissiveIntensity:.35,roughness:.6});this.carryT=null;this.updCarry()}
 updCarry(){const P=this.b.p,j=this.jSel;if(!j)return;const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw),H={x:P.x+fx*.6-fz*.28,y:P.y-.5,z:P.z+fz*.6+fx*.28},d=Math.hypot(H.x-j.A.x,H.z-j.A.z);
  this.carryT=this.tube(this.cablePts(j.A,H,clamp(Math.ceil(d*1.1),20,120)),.045,this.carryT,this.carryM);if(this.plugH){this.plugH.position.set(H.x,H.y,H.z);this.plugH.rotation.y=-P.yaw}}
 cancelCarry(refund){for(const o of[this.carryT,this.plugH,this.plugR])if(o&&o.parent)o.parent.remove(o);this.carryT=this.plugH=this.plugR=null;if(this.cabPh===1)this.cabPh=0;
  if(refund){if(this.s.tk.give('cable',1))this.toast('CABLE RETRACTED  \u00b7  BACK IN YOUR PACK','#ffb347');else this.toast('CABLE RETRACTED  \u00b7  PACK FULL, CABLE LOST','#ff5a4a')}}
 /* the finished power line: RTG socket -> hanging droop -> along the ground -> hanging droop -> capsule socket */
 layCable(){const b=this.b,j=this.jSel||this.jn[0],pr=this.port;if(!j||!pr)return;const A=j.A,B={x:pr.x+pr.dx*.3,y:pr.y,z:pr.z+pr.dz*.3},d=Math.hypot(B.x-A.x,B.z-A.z),pts=this.cablePts(A,B,clamp(Math.ceil(d*1.1),24,140));
  if(this.cab&&this.cab.parent)this.cab.parent.remove(this.cab);
  const m=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),pts.length*2,.06,6,false),new THREE.MeshStandardMaterial({color:0x1d1f24,emissive:0xff8a2a,emissiveIntensity:.35,roughness:.6}));m.frustumCulled=false;
  b.S.ext.add(m);this.objs.push(m);this.cab=m;
  if(!this.plugR){this.plugR=this.mkPlug();this.plugAt(this.plugR,j.pt,0,1);b.S.ext.add(this.plugR);this.objs.push(this.plugR)}
  if(!this.plugP){this.plugP=this.mkPlug();b.S.ext.add(this.plugP);this.objs.push(this.plugP)}this.plugAt(this.plugP,pr,pr.dx,pr.dz)}
 cableTick(dt,t){const st=this.st,dn=this.dn,b=this.b;
  if(this.cabPh===1){if(dn.sol!==6||this.done||dn.dead||b.mode!=='outside')this.cancelCarry(dn.sol===6&&!this.done&&!dn.dead);else this.updCarry()}
  if(this.ledM){const c=st.chg>=1?0x7dff9a:st.conn?(Math.sin(t*8)>0?0x5de6ff:0x1a6a7a):0xff3a2a;this.ledM.color.setHex(c);this.ledM.emissive.setHex(c)}
  if(st.conn&&st.chg<1&&this.port&&Math.random()<dt*.5)this.emit(this.port.x,this.port.y,this.port.z,4,false);
  this.updSparks(dt)}
 /* ---------- start (called by DayNight at the Sol 5 -> 6 dawn) ---------- */
 start(){if(this.on||this.done)return;const b=this.b;if(!b||!b.S)return;this.on=true;this.dom0();
  try{this.build()}catch(err){console.error('[sol6 build]',err);this.toast('SOL 6 BUILD ERROR: '+(err&&err.message||err),'#ff5a4a')}
  const o5=$('s5-obj');if(o5)o5.classList.remove('on');$('s6-obj').classList.add('on');
  this.pop('SOL 6  \u00b7  HOMEWARD','Mission Control has a priority message waiting for you. Go to the main hub and collect it at the communications console.',9500);
  this.tone(392,.25,.05);setTimeout(()=>this.tone(523,.3,.05),160);this.last=''}
 onSol7(){this.dom0();$('s6-obj')&&$('s6-obj').classList.remove('on');this.pop('SOL 7  \u00b7  HOMEWARD BOUND','Today you go home. The capsule is charged, stocked for seven months and carries the last data chip with your return trajectory. Rest, then prepare for launch.',12000);this.tone(523,.3,.05);setTimeout(()=>this.tone(784,.5,.05),200)}
 /* ---------- interaction ---------- */
 near(){const b=this.b,P=b.p;if(!this.on||this.dn.sol!==6||this.done)return null;
  if(b.mode==='inside'){const q=this.stn.comm;if(this.stg===0&&!this.msgShown&&q&&Math.hypot(P.x-q.x,P.z-q.z)<2.9)return q;return null}
  if(b.mode==='outside'&&this.stg>=1){const st=this.st;
   if(!st.conn&&this.cabPh===0){let bj=null,bd=3.4;for(const j of this.jn){const d=Math.hypot(P.x-j.x,P.z-j.z);if(d<bd){bd=d;bj=j}}if(bj)return{k:'rtg',x:bj.x,z:bj.z,j:bj}}
   if(!st.conn&&this.cabPh===1&&this.port&&Math.hypot(P.x-this.port.x,P.z-this.port.z)<3.4)return{k:'port',x:this.port.x,z:this.port.z};
   const q=this.stn.cap;if(q&&Math.hypot(P.x-q.x,P.z-q.z)<6.5)return q}
  return null}
 interact(){if(!this.on||this.dn.sol!==6)return false;if(this.ch)return true;const n=this.near();if(!n)return false;const st=this.st;
  if(n.k==='comm'){this.ch={k:'comm',s:n,t:0,dur:5,lab:'RECEIVING TRANSMISSION  \u00b7  HMSA'};this.tone(440,.2,.04);return true}
  if(n.k==='rtg'){if(this.count('cable')<1){this.toast('NEED A CHARGING CABLE  \u00b7  CRAFT IT AT THE CRAFTING TABLE (4 SCRAP + 2 MINERAL)','#ff5a4a');return true}this.ch={k:'rtg',s:n,t:0,dur:3,lab:'PICKING UP THE CABLE  \u00b7  PLUGGING INTO THE RTG POWER PORT'};this.hiss(.4,.04,1200);this.tone(300,.3,.05);return true}
  if(n.k==='port'){this.ch={k:'plug',s:n,t:0,dur:3.6,lab:'PLUGGING THE CABLE INTO THE CAPSULE CHARGING PORT'};this.hiss(.4,.04,1200);this.tone(300,.3,.05);return true}
  if(this.storable().total>0){this.ch={k:'store',s:n,t:0,dur:3.5,lab:'LOADING THE CAPSULE'};this.hiss(.3,.03,1500);this.tone(260,.3,.05);return true}
  this.toast(st.conn&&st.chg<1?'CAPSULE CHARGING  \u00b7  '+Math.floor(st.chg*100)+'%':'NOTHING TO STORE  \u00b7  FOOD '+st.food+'/'+S6_FOOD+'  O\u2082 '+st.o2+'/'+S6_O2+'  SAMPLES '+st.smp+'/'+S6_SMP,'#ffb347');return true}
 stepCh(dt){const c=this.ch,p=this.b.p;c.t+=dt;const u=Math.min(1,c.t/c.dur),bar=$('s4-bar');bar.innerHTML=c.lab+'<i><u style="width:'+(u*100).toFixed(0)+'%"></u></i>';bar.classList.add('on');
  const q=c.s;if(q){const want=Math.atan2(q.z-p.z,q.x-p.x);p.yaw+=Math.atan2(Math.sin(want-p.yaw),Math.cos(want-p.yaw))*Math.min(1,dt*4)}
  if(c.k==='comm'){if((c.tn=(c.tn||0)-dt)<=0){c.tn=.5;this.tone(600+Math.random()*500,.08,.025,'sine')}}
  else if(c.k==='rtg'||c.k==='plug'){if((c.tn=(c.tn||0)-dt)<=0){c.tn=.14+Math.random()*.1;const pt=c.k==='rtg'?c.s.j.pt:this.port;if(pt&&c.t>c.dur*.4){this.emit(pt.x,pt.y,pt.z,3,false);this.tone(900+Math.random()*900,.05,.02,'square')}}}
  if(u>=1)this.finish(c)}
 finish(c){this.ch=null;$('s4-bar').classList.remove('on');const st=this.st;
  if(c.k==='comm'){if(!this.msgShown){this.msgShown=true;this.showMsg();this.mp.cap('TRANSMISSION RECEIVED  \u00b7  THE LAST DATA CHIP',3800);this.deliverChip()}}
  else if(c.k==='rtg'){if(this.take('cable',1)){this.cabPh=1;this.startCarry(c.s.j);const p=c.s.j.pt;this.emit(p.x,p.y,p.z,18,true);this.toast('\u2714 CABLE PLUGGED INTO THE RTG  \u00b7  CARRY THE OTHER END TO THE CAPSULE CHARGING PORT','#5de6ff');this.tone(700,.2,.05);setTimeout(()=>this.tone(1100,.15,.04),110)}else this.toast('NO CABLE IN YOUR PACK','#ff5a4a')}
  else if(c.k==='plug'){if(this.cabPh===1&&this.jSel){st.conn=true;this.cabPh=2;try{this.layCable()}catch(e){console.error('[sol6 cable]',e)}for(const o of[this.carryT,this.plugH])if(o&&o.parent)o.parent.remove(o);this.carryT=this.plugH=null;const p=this.port;if(p)this.emit(p.x,p.y,p.z,30,true);
    this.toast('\u2714 CABLE CONNECTED  \u00b7  CAPSULE CHARGING FROM THE RTGs','#7dff9a');this.tone(900,.25,.05);setTimeout(()=>this.tone(1300,.2,.04),120)}}
  else if(c.k==='store'){const sp=this.storable(),out=[];
   if(sp.f>0){let n=sp.f;for(const id of S6_FOODIDS){const k=Math.min(n,this.count(id));if(k>0&&this.take(id,k)){n-=k}}st.food+=sp.f-n;out.push((sp.f-n)+' FOOD')}
   if(sp.o>0){let n=sp.o;const a=Math.min(n,this.count('o2can'));if(a>0&&this.take('o2can',a))n-=a;while(n>0&&this.count('o2big')>0&&this.take('o2big',1))n-=2;const done=sp.o-Math.max(0,n);st.o2=Math.min(S6_O2,st.o2+done);out.push(done+' O\u2082')}
   if(sp.c&&this.take('returnchip',1)){st.chip=true;out.push('DATA CHIP LOADED')}
   if(sp.m>0&&this.takeMin(sp.m)){st.smp+=sp.m;out.push(sp.m+' SAMPLES')}
   this.toast('\u2714 STORED IN CAPSULE  \u00b7  '+out.join('  \u00b7  '),'#7dff9a');this.tone(700,.2,.05);setTimeout(()=>this.tone(950,.2,.04),120)}
  this.last=''}
 takeMin(n){const S=this.s;if(this.count('mineral')<n)return false;for(const A of[S.inv,S.bag])for(let i=0;i<A.length&&n>0;i++){const it=A[i];if(it&&it.id.startsWith('rk_')){const u=Math.min(n,it.n||1);it.n=(it.n||1)-u;n-=u;if(it.n<=0)A[i]=null}}S.tk.after();try{S.showName()}catch(e){}return true}   /* rock samples are the rk_* items */
 deliverChip(){if(this.s.tk.give('returnchip',1)){this.chipDue=false;this.toast('+ EARTH RETURN DATA CHIP  \u00b7  THE LAST CHIP  \u00b7  LOAD IT INTO THE CAPSULE','#5de6ff')}else{this.chipDue=true;this.toast('BACKPACK FULL  \u00b7  FREE A SLOT (TAB) TO RECEIVE THE DATA CHIP','#ff5a4a')}}
 showMsg(){const s4=this.dn.s4;s4.dom0();const e=$('s4-msg');
  e.innerHTML='<div class="hd"><span class="lg"><b>HM</b><i>Huraira Meerab</i><b>SA</b><i>Space Agency</i></span><span>DEEP SPACE NETWORK  \u00b7  PRIORITY ALPHA<br><small>MISSION CONTROL  \u2192  MARS RESEARCH BASE  \u00b7  SOL 6</small></span></div>'
   +'<p class="w">\u2714 RETURN WINDOW CONFIRMED  \u00b7  YOU ARE GOING HOME</p>'
   +'<p>Crew, every repair and upload has worked. The orbiter has finished the return trajectory for your capsule. The data chip is now reprogrammed: this is the <b>last data chip, coded to take you back to Earth</b>. <b>You will be going home on Sol 7.</b></p>'
   +'<p>The flight home takes about <b>7 months</b> (roughly 210 days) in deep space, and nothing can be resupplied on the way. Prepare the capsule today:</p>'
   +'<p><b>1. PACK.</b> Store <b>7 food rations</b> and <b>7 oxygen canisters</b> in the capsule you landed in \u2014 one of each for every month of the flight \u2014 and load the data chip into its flight computer.</p>'
   +'<p><b>2. CHARGE.</b> Its batteries are almost flat. Craft a <b>charging cable</b> (4 scrap + 2 mineral) at the crafting table, plug it into one of your <b>RTGs</b>, carry the other end to the capsule and plug it into its <b>charging port</b>. The RTGs will charge it to 100%.</p>'
   +'<p><b>3. SAMPLES.</b> Collect <b>5 rock samples</b> from the surface and seal them in the capsule. The scientists on Earth are waiting for them.</p>'
   +'<p>Sol 6 lasts 8 minutes. Finish early and the clock skips ahead to dusk.</p><div class="ft"><button id="s4-sk">SKIP MESSAGE<b>SPACE</b></button>\u2014 HMSA MISSION CONTROL  \u00b7  SEE YOU ON THE LAUNCH PAD</div>';
  const sk=$('s4-sk');if(sk)sk.addEventListener('click',ev=>{ev.stopPropagation();s4.closeMsg()});try{document.exitPointerLock()}catch(er){}
  e.classList.add('on');clearTimeout(s4.msgT);s4.msgT=setTimeout(()=>s4.closeMsg(),60000)}
 /* [PAGE UP] / admin: finish Sol 6 as if played */
 complete(){if(this.done)return;if(!this.on)this.start();if(!this.on)return;this.ch=null;$('s4-bar')&&$('s4-bar').classList.remove('on');this.msgShown=true;Object.assign(this.st,{food:S6_FOOD,o2:S6_O2,chip:true,smp:S6_SMP,conn:true,chg:1});this.cancelCarry(false);this.cabPh=2;try{if(!this.cab)this.layCable()}catch(e){}this.stg=4;this.finishSol();this.last=''}
 finishSol(){this.done=true;this.stg=4;this.mp.cap('SOL 6 COMPLETE  \u00b7  CAPSULE READY FOR LAUNCH',4600);this.pop('CAPSULE READY','Supplies for seven months are stowed, the batteries are full and the samples are sealed. Get back inside the base and rest \u2014 you launch for Earth on Sol 7.',9000);this.tone(523,.3,.05);setTimeout(()=>this.tone(659,.3,.05),180);setTimeout(()=>this.tone(784,.6,.05),380)}
 /* ---------- per frame ---------- */
 update(dt){if(!this.on)return;this.dom0();const dn=this.dn,t=performance.now()/1000;dt=Math.min(dt,.1);this.el+=dt;
  if(this.ch)this.stepCh(dt);
  if(dn.sol===6&&!this.done){const st=this.st;
   if(this.chipDue&&(this.cT=(this.cT||0)-dt)<=0){this.cT=1;this.deliverChip()}
   if(st.conn&&st.chg<1)st.chg=Math.min(1,st.chg+dt/S6_CHG);
   const n=!this.msgShown?0:!(st.food>=S6_FOOD&&st.o2>=S6_O2&&st.chip)?1:st.chg<1?2:st.smp<S6_SMP?3:4;
   if(n>this.stg){this.stg=n;if(n===1)this.mp.cap('TASK 1  \u00b7  PACK FOR THE 7-MONTH TRIP',3200);else if(n===2){this.mp.cap('TASK 2  \u00b7  CHARGE THE CAPSULE',3200);this.toast('PACKING COMPLETE','#7dff9a')}else if(n===3){this.mp.cap('TASK 3  \u00b7  COLLECT MARS SAMPLES',3200);this.toast('CAPSULE FULLY CHARGED','#7dff9a')}else if(n===4)this.finishSol()}}
  /* markers, cable glow, capsule label */
  const s6=dn.sol===6&&!this.done;for(const k in this.stn){const q=this.stn[k];q.mk.g.visible=s6&&(k==='comm'?(this.stg===0&&!this.msgShown):k==='rtg'?(this.stg>=1&&this.cabPh===0&&!this.st.conn):k==='port'?(this.cabPh===1):this.stg>=1);q.mk.ring.scale.setScalar(1+.12*Math.sin(t*4))}
  if(this.cab)this.cab.material.emissiveIntensity=this.st.chg<1?.3+.3*Math.sin(t*5):.15;
  this.cableTick(dt,t);
  if(this.lab&&(this.labT-=dt)<=0){this.labT=.4;this.paintLab()}
  if(!this.ch){const n=this.near(),pr=$('b-prompt');if(n&&pr){const st=this.st;let h;
    if(n.k==='comm')h='<b>E</b>RECEIVE HMSA TRANSMISSION';
    else if(n.k==='rtg')h=this.count('cable')>0?'<b>E</b>PLUG CABLE INTO THE RTG POWER PORT':'RTG POWER PORT  \u00b7  CRAFT A CHARGING CABLE FIRST';
    else if(n.k==='port')h='<b>E</b>PLUG CABLE INTO THE CAPSULE CHARGING PORT';
    else{const sp=this.storable();h=sp.total>0?'<b>E</b>STORE IN CAPSULE  \u00b7  '+sp.txt:this.cabPh===1?'CARRYING CABLE  -  WALK TO THE CHARGING PORT ON THE CAPSULE':st.conn&&st.chg<1?'RETURN CAPSULE  \u00b7  CHARGING '+Math.floor(st.chg*100)+'%':'RETURN CAPSULE  \u00b7  FOOD '+st.food+'/'+S6_FOOD+'  O\u2082 '+st.o2+'/'+S6_O2+'  SAMPLES '+st.smp+'/'+S6_SMP}
    pr.innerHTML=h;pr.classList.add('on')}}
  $('s6-obj').classList.toggle('on',dn.sol===6);this.hud()}
 paintLab(){const L=this.lab,st=this.st,s6=this.dn.sol===6&&!this.done&&this.stg>=1;L.spr.visible=s6;if(!s6)return;
  const pct=Math.floor(st.chg*100),col=st.chg>=1?'#7dff9a':st.conn?'#5de6ff':'#ffb347',t1='RETURN CAPSULE',t2=st.conn?(st.chg>=1?'BATTERIES FULL  100%':'CHARGING  '+pct+'%  \u00b7  '+(st.chg*34).toFixed(1)+' / 34 kWh'):'BATTERIES LOW  \u00b7  NO POWER LINK',t3='FOOD '+st.food+'/'+S6_FOOD+'  O\u2082 '+st.o2+'/'+S6_O2+'  SMP '+st.smp+'/'+S6_SMP+(st.chip?'  CHIP \u2714':''),key=t1+t2+t3+pct;
  if(L.key===key)return;L.key=key;const x=L.x;x.clearRect(0,0,320,128);x.fillStyle='rgba(4,17,26,.82)';x.fillRect(0,0,320,128);x.strokeStyle=col;x.lineWidth=3;x.strokeRect(1.5,1.5,317,125);
  x.textAlign='center';x.font='700 22px Consolas,monospace';x.fillStyle=col;x.fillText(t1,160,28);x.font='600 15px Consolas,monospace';x.fillStyle='#e8f4f8';x.fillText(t2,160,54);x.fillText(t3,160,78);
  x.fillStyle='rgba(255,255,255,.15)';x.fillRect(18,96,284,12);x.fillStyle=col;x.fillRect(18,96,284*clamp(st.chg,0,1),12);L.tex.needsUpdate=true}
 hudText(){if(!this.on||this.done||this.dn.sol!==6||this.dn.night)return null;const left=this.dn.len-this.dn.t;
  return[left<=WARN_S?'SOL 6  \u00b7  NIGHTFALL IN '+fmt(left)+'  \u00b7  RETURN TO BASE':'SOL 6  \u00b7  HOME TOMORROW  \u00b7  DAYLIGHT '+fmt(left),left<=WARN_S?'warn':left<=60?'warn':'']}
 hud(){const st=this.st,L=(s,d,h)=>'<div class="s'+(d?' d':'')+(h?' h':'')+'">'+(d?'\u2713 ':h?'':'\u25b8 ')+s+'</div>',c=this.stg,
   T=(i,n,body)=>'<div class="t'+(c>i?' d':c<i?' w':'')+'">TASK '+i+'/3  \u00b7  '+n+'</div>'+(c===i?body:''),
   html='<h3>SOL 6  \u00b7  GOING HOME</h3><div class="t'+(c>0?' d':'')+'">INCOMING HMSA MESSAGE</div>'+(c===0?L('Collect it at the comms console in the main hub',false):'')
   +T(1,'PACK FOR 7 MONTHS',L('Food stored  '+st.food+' / '+S6_FOOD+'  \u00b7  carrying '+this.foodHave(),st.food>=S6_FOOD)+L('Oxygen stored  '+st.o2+' / '+S6_O2+'  \u00b7  carrying '+this.o2Have(),st.o2>=S6_O2)+L('Load the data chip into the capsule',st.chip)+L('Walk to the RETURN CAPSULE and press [E]',false,true))
   +T(2,'CHARGE THE CAPSULE',L('Craft a charging cable (crafting table)',st.conn||this.cabPh>0||this.count('cable')>0)+L('Plug it into an RTG power port (outside)',st.conn||this.cabPh>=1)+L('Carry the cable to the capsule charging port',st.conn)+L('Battery  '+Math.floor(st.chg*100)+'%',st.chg>=1)+L('The RTGs charge it in about '+S6_CHG+' s',false,true))
   +T(3,'COLLECT MARS SAMPLES',L('Strike rocks with the hammer \u00b7 carrying '+this.count('mineral'),false)+L('Store in the capsule  '+st.smp+' / '+S6_SMP,st.smp>=S6_SMP));
  if(html!==this.last){this.last=html;$('s6-obj').innerHTML=html}}
}
Object.assign(Sol6.prototype,{stacks:Sol4.prototype.stacks,count:Sol4.prototype.count,take:Sol4.prototype.take,toast:Sol4.prototype.toast,tone:Sol4.prototype.tone,hiss:Sol4.prototype.hiss,beacon:Sol4.prototype.beacon});

/* =====================================================================================================
   SOL 7  -  "HOMEWARD BOUND"   (lives in this file; no new module)
   -----------------------------------------------------------------------------------------------------
   Launch day. Walk to the RETURN CAPSULE and press [E]:
     1 TURN    the camera swings back to look at your base
     2 TYPE    a bar opens: type up to 20 letters
     3 PARTY   the letters are built as golden 3D letters on a lit sign in front of the base door, party poppers + confetti
     4 BOARD   fade to black, you sit down in the capsule
     5 PAD     capsule interior, window facing the base, 9 s countdown
     6 LAUNCH  lift-off, the base shrinks below the window, you leave the atmosphere and Mars fills the window
     7 END     black screen with the final text, [MAIN MENU] button
   A MENU button stays in the top-right corner (opens the pause menu).  SolMusic 'sad' plays all of Sol 7.
   Hooks: DayNight (dn.s7): update / interact / freeze / hudText / reset / dawn -> start().
   ===================================================================================================== */
const LOOK_Y=.78,LOOK_UP=.42,LOOK_DN=.32;           /* how far you can turn your head in the capsule: +-45 deg left/right, 24 up, 18 down */
const S7_TURN=2.6,S7_PARTY=10.5,S7_CD=9,S7_UP=36,S7_MAX=20,S7_RM=3389500;
/* GTA-style end credits (rows: [role,name] ; 'h' = section title ; 't' = big title ; 'n' = centred note) */
const CR7=[['t','SOL 7'],['n','A mission by the Huraira Meerab Space Agency (HMSA)'],
 ['h','CREATED BY'],['Code and engine','Huraira'],['Science, story and design','Meerab'],
 ['h','REAL SCIENCE BEHIND THE GAME'],['Space weather and solar activity','NASA DONKI'],['Radiation and space plant research','NASA OSDR'],['Mars weather and terrain','NASA Mars Trek<br>REMS / MEDA'],['Mars facts','Gravity<br>MOXIE oxygen<br>Phobos and Deimos'],
 ['n','The numbers in this game come from real public space data.<br>The data is built into the game. It is not a live feed.'],
 ['h','MADE WITH'],['Graphics','Three.js'],['Desktop','Electron'],['n','All art and sound are generated by code.'],
 ['n','Built for the 2026 NASA Space Apps Challenge.<br>This is an independent project and is not endorsed by NASA.'],['l']];
const CR7_T0=27.5,CR7_SPD=62;
const END7=['Seven Sols ago, you were stranded in the scorched ruins of a failed landing with nothing but a hammer, an empty bucket, and fractured rock.',
 'Today, solar arrays hum at peak efficiency, oxygen recyclers breathe steady life into the domes, and the first Martian harvest thrives under artificial light. As the recovery shuttle touches down on the perimeter, your base stands ready to welcome the next wave of pioneers.'];
const HID7=['#b-zone','#b-sol','#b-hint','#b-prompt','#dn-bar','#m-sol','#m-cross','#m-vit','#sv-obj','#sv-prompt','#sv-hb','#sv-name','#sv-tut','#s4-obj','#s5-obj','#s6-obj','#s7-obj','#bp-pill','#tk-toasts'].map(s=>'body.s7c '+s).join(',')+'{display:none!important}';
const CSS7=`
#s7-obj{position:fixed;right:28px;top:124px;width:350px;z-index:30;padding:11px 15px;font:600 12px Consolas,monospace;letter-spacing:1px;color:#e8f4f8;background:rgba(6,10,18,.68);border-right:4px solid #7dff9a;border-radius:4px;opacity:0;transition:opacity .6s;pointer-events:none}
#s7-obj.on{opacity:1}#s7-obj h3{margin:0 0 8px;font-size:13px;letter-spacing:3px;color:#ffb347}#s7-obj .t{margin:7px 0 3px;font-size:12px;letter-spacing:2px;color:#ffb347}#s7-obj .s{margin:2px 0 2px 12px;opacity:.9}#s7-obj .s.h{opacity:.6;font-size:11px;color:#9fd8ff}
#s7-type{position:fixed;left:50%;bottom:11%;transform:translateX(-50%) translateY(14px);width:min(840px,90vw);box-sizing:border-box;z-index:46;padding:18px 26px 16px;background:rgba(6,10,22,.9);border:2px solid #ffd27a;border-radius:8px;box-shadow:0 0 44px rgba(255,190,90,.35);opacity:0;pointer-events:none;transition:opacity .5s,transform .5s;font:600 14px Consolas,monospace;color:#f2f5fa;text-align:center}
#s7-type.on{opacity:1;transform:translateX(-50%);pointer-events:auto}#s7-type h2{margin:0 0 5px;font:800 15px Consolas,monospace;letter-spacing:6px;color:#ffd27a}
#s7-type p{margin:0 0 12px;font:500 13px "Segoe UI",Arial,sans-serif;letter-spacing:.4px;color:#cfd8e8}
#s7-in{width:100%;box-sizing:border-box;padding:12px 14px;font:600 20px "Segoe UI",Arial,sans-serif;color:#fff;background:rgba(255,255,255,.07);border:1px solid rgba(255,210,122,.6);border-radius:6px;outline:none;text-align:center;letter-spacing:1px}
#s7-in:focus{border-color:#ffd27a;box-shadow:0 0 16px rgba(255,210,122,.4)}
#s7-type .row{display:flex;justify-content:space-between;align-items:center;margin-top:11px;font-size:12px;letter-spacing:3px;color:#9fb4d4}#s7-cnt.full{color:#ff8a6a}
#s7-go{cursor:pointer;font:800 13px Consolas,monospace;letter-spacing:3px;color:#06101e;background:#ffd9a0;border:2px solid #ff8a4c;border-radius:4px;padding:7px 18px}#s7-go:hover{background:#fff1d8}
#s7-type.shake{animation:s7sh .35s}@keyframes s7sh{25%{margin-left:-14px}75%{margin-left:14px}}
#s7-fade{position:fixed;inset:0;background:#000;opacity:0;z-index:47;pointer-events:none;transition:opacity 1.3s}
#s7-cab{position:fixed;inset:0;z-index:21;pointer-events:none;opacity:0;transition:opacity 1s;background:radial-gradient(ellipse at 50% 46%,rgba(0,0,0,0) 52%,rgba(0,0,0,.6) 100%)}#s7-cab.on{opacity:1}
#s7-tel{position:fixed;left:26px;top:22px;z-index:22;font:600 13px Consolas,monospace;letter-spacing:2px;line-height:1.7;color:#9fffd0;text-shadow:0 0 6px #000;background:rgba(4,12,18,.55);padding:10px 16px;border-left:3px solid #5de6ff;border-radius:3px;opacity:0;transition:opacity .8s;pointer-events:none}#s7-tel.on{opacity:1}#s7-tel b{color:#ffd9a0}
#s7-cd{position:fixed;inset:0;z-index:23;display:flex;align-items:center;justify-content:center;font:700 13vh Consolas,monospace;letter-spacing:6px;color:#ffd9a0;text-shadow:0 0 34px rgba(255,160,60,.85);pointer-events:none;opacity:0}
#s7-cd.p{animation:s7cd 1s ease-out forwards}@keyframes s7cd{0%{transform:scale(1.6);opacity:0}15%{opacity:1}100%{transform:scale(1);opacity:.85}}
#s7-end{position:fixed;inset:0;z-index:48;pointer-events:none;color:#f2f5fa;text-align:center}
#s7-end .p{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(840px,84vw);opacity:0;transition:opacity 1.8s;font:400 clamp(17px,2.1vw,27px)/1.7 "Segoe UI",Georgia,serif;letter-spacing:1px;text-shadow:0 0 14px rgba(255,200,140,.25)}
#s7-end .p.on{opacity:1}#s7-end .f{font:800 clamp(24px,3.6vw,48px)/1.4 Consolas,monospace;letter-spacing:8px;color:#ffe0c0;text-shadow:0 0 30px rgba(255,150,70,.55)}
#s7-end button{pointer-events:none;margin-top:38px;cursor:pointer;font:800 15px Consolas,monospace;letter-spacing:5px;color:#06101e;background:#ffd9a0;border:2px solid #ff8a4c;border-radius:5px;padding:12px 30px;box-shadow:0 0 22px rgba(255,160,70,.5)}
#s7-end .p.on button{pointer-events:auto}#s7-end button:hover{background:#fff1d8}
#s7-end .cr{position:absolute;inset:0;opacity:0;transition:opacity 1.6s;overflow:hidden;-webkit-mask-image:linear-gradient(transparent 0,#000 14%,#000 86%,transparent 100%);mask-image:linear-gradient(transparent 0,#000 14%,#000 86%,transparent 100%)}#s7-end .cr.on{opacity:1}
#s7-end .roll{position:absolute;left:0;right:0;top:0;transform:translateY(100vh);will-change:transform;padding-bottom:30vh}
#s7-end .ct{font:900 clamp(44px,8vw,120px)/1 Impact,'Arial Black',sans-serif;letter-spacing:10px;color:#fff;margin:14vh 0 3vh;text-shadow:0 0 30px rgba(255,150,70,.4)}
#s7-end .ch{font:800 clamp(18px,2.2vw,30px)/1.2 Impact,'Arial Black',sans-serif;letter-spacing:9px;color:#ffb347;margin:15vh 0 5vh;text-transform:uppercase}
#s7-end .cl{display:flex;align-items:flex-start;margin:0 0 3.2vh}
#s7-end .cl .a{flex:1;text-align:right;padding-right:2.2vw;font:600 clamp(12px,1.3vw,18px)/1.5 "Segoe UI",Arial,sans-serif;letter-spacing:4px;text-transform:uppercase;color:#9aa3b2}
#s7-end .cl .b{flex:1;text-align:left;padding-left:2.2vw;font:700 clamp(15px,1.8vw,26px)/1.4 "Segoe UI",Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#fff}
#s7-end .cn{width:min(760px,80vw);margin:5vh auto;font:500 clamp(13px,1.4vw,19px)/1.8 "Segoe UI",Arial,sans-serif;letter-spacing:2px;color:#c9d1de}
#s7-end .cg{margin:14vh 0 8vh}
#s7-end .lgo{display:inline-grid;grid-template-columns:auto auto;column-gap:clamp(14px,1.8vw,26px);row-gap:6px;align-items:center;padding:clamp(14px,1.8vw,26px) clamp(24px,3vw,44px) clamp(14px,1.8vw,26px) clamp(20px,2.4vw,36px);border-radius:clamp(20px,2.4vw,34px);border:3px solid #ffb347;background:linear-gradient(135deg,#0a1630 0%,#17315f 55%,#3a1d3f 100%);box-shadow:0 0 40px rgba(255,179,71,.45),inset 0 0 26px rgba(93,230,255,.2);text-align:left;font-family:'Segoe UI',Arial,sans-serif}
#s7-end .lgo b{font:900 clamp(34px,5vw,72px)/1.05 'Segoe UI',Arial,sans-serif;letter-spacing:8px}
#s7-end .lgo b:nth-of-type(1){color:#ffb347;text-shadow:0 0 16px rgba(255,179,71,.7)}
#s7-end .lgo b:nth-of-type(2){color:#5de6ff;text-shadow:0 0 16px rgba(93,230,255,.65)}
#s7-end .lgo i{font:700 clamp(14px,1.9vw,28px)/1.2 'Segoe UI',Arial,sans-serif;font-style:normal;letter-spacing:5px;color:#f2f5fa;border-left:3px solid rgba(255,179,71,.75);padding-left:clamp(14px,1.8vw,26px);text-transform:uppercase}
#s7-end .lgo i:nth-of-type(2){color:#bfe8ff;border-left-color:rgba(93,230,255,.75)}
#s7-end .sk{position:absolute;right:26px;bottom:20px;font:700 11px Consolas,monospace;letter-spacing:3px;color:#fff;opacity:0;transition:opacity 1s}#s7-end .sk.on{opacity:.55}
#s7-menu{position:fixed;right:16px;top:14px;z-index:55;display:none;padding:7px 16px;font:800 12px Consolas,monospace;letter-spacing:4px;color:#fff;background:rgba(6,10,18,.62);border:1px solid rgba(190,200,220,.5);border-radius:4px;cursor:pointer;opacity:.75}
#s7-menu:hover{opacity:1;border-color:#ffb347}#s7-menu.on{display:block}
`+HID7;
const M7=(geo,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);return o};
const _v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_v3=new THREE.Vector3(),_v4=new THREE.Vector3(),_m4=new THREE.Matrix4(),_UP=new THREE.Vector3(0,1,0);
const CONF7=[0xff4d6d,0xffd166,0x06d6a0,0x4cc9f0,0xb388ff,0xff9f1c,0xffffff,0xf72585];

/* the typed words -> bitmap -> list of lit pixels (each one becomes a gold cube) */
function raster7(msg){const F=26,FONT='900 '+F+'px "Arial Black",Impact,"Segoe UI",Arial,sans-serif',MAXW=330,cv=document.createElement('canvas'),x=cv.getContext('2d',{willReadFrequently:true});x.font=FONT;
 const lines=[];let cur='';for(const w of msg.split(' ')){const t=cur?cur+' '+w:w;if(x.measureText(t).width>MAXW&&cur){lines.push(cur);cur=w}else cur=t}if(cur)lines.push(cur);
 const LH=Math.round(F*1.22);let W=0;for(const l of lines)W=Math.max(W,Math.ceil(x.measureText(l).width));W+=6;const H=lines.length*LH+4;cv.width=W;cv.height=H;
 x.font=FONT;x.fillStyle='#fff';x.textAlign='center';x.textBaseline='middle';lines.forEach((l,i)=>x.fillText(l,W/2,2+LH*(i+.5)));
 const d=x.getImageData(0,0,W,H).data,px=[];for(let j=0;j<H;j++)for(let i=0;i<W;i++)if(d[(j*W+i)*4+3]>115)px.push(i,j);return{W,H,px}}

/* ---------- confetti (Mars gravity, a bit of air drag, flutter) ---------- */
class Confetti7{
 constructor(parent,n=1100){this.n=n;this.i=0;this.gy=0;const g=new THREE.PlaneGeometry(.14,.085);this.m=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,toneMapped:false}),n);this.m.frustumCulled=false;
  this.p=new Float32Array(n*3);this.v=new Float32Array(n*3);this.r=new Float32Array(n*3);this.w=new Float32Array(n*3);this.life=new Float32Array(n);this.max=new Float32Array(n);this.o=new THREE.Object3D();
  const c=new THREE.Color();for(let k=0;k<n;k++){c.setHex(CONF7[k%CONF7.length]);this.m.setColorAt(k,c);this.o.scale.setScalar(0);this.o.updateMatrix();this.m.setMatrixAt(k,this.o.matrix)}parent.add(this.m)}
 emit(x,y,z,vx,vy,vz){const k=this.i;this.i=(this.i+1)%this.n;const a=k*3,R=Math.random;this.p[a]=x;this.p[a+1]=y;this.p[a+2]=z;this.v[a]=vx;this.v[a+1]=vy;this.v[a+2]=vz;this.r[a]=R()*6;this.r[a+1]=R()*6;this.r[a+2]=R()*6;
  this.w[a]=(R()-.5)*14;this.w[a+1]=(R()-.5)*14;this.w[a+2]=(R()-.5)*14;this.max[k]=this.life[k]=9+R()*6}
 /* from a popper: a cone of paper shooting up and inwards */
 popper(x,y,z,dx,dz,n){for(let i=0;i<n;i++){const R=Math.random,sp=7+R()*10;this.emit(x+(R()-.5)*.2,y,z+(R()-.5)*.2,dx*(2+R()*6)+(R()-.5)*3,sp,dz*(2+R()*6)+(R()-.5)*3)}}
 rain(cx,cz,w,y,n){for(let i=0;i<n;i++){const R=Math.random;this.emit(cx+(R()-.5)*w,y+R()*3,cz+(R()-.5)*w*.6,(R()-.5)*2,-R()*2,(R()-.5)*2)}}
 update(dt){const{p,v,r,w,life,max,o}=this;let any=false;
  for(let k=0;k<this.n;k++){if(life[k]<=0)continue;any=true;const a=k*3;life[k]-=dt;
   const d=Math.exp(-1.5*dt);v[a]*=d;v[a+2]*=d;v[a+1]=v[a+1]*Math.exp(-.9*dt)-3.3*dt;if(v[a+1]<-2)v[a+1]=-2;
   p[a]+=(v[a]+Math.sin(life[k]*6+k)*.7)*dt;p[a+1]+=v[a+1]*dt;p[a+2]+=(v[a+2]+Math.cos(life[k]*5+k)*.7)*dt;
   if(p[a+1]<this.gy+.03){p[a+1]=this.gy+.03;v[a]=v[a+1]=v[a+2]=0;w[a]=w[a+1]=w[a+2]=0}
   r[a]+=w[a]*dt;r[a+1]+=w[a+1]*dt;r[a+2]+=w[a+2]*dt;
   o.position.set(p[a],p[a+1],p[a+2]);o.rotation.set(r[a],r[a+1],r[a+2]);o.scale.setScalar(life[k]<1.4?Math.max(0,life[k]/1.4):1);o.updateMatrix();this.m.setMatrixAt(k,o.matrix);if(life[k]<=0){o.scale.setScalar(0);o.updateMatrix();this.m.setMatrixAt(k,o.matrix)}}
  if(any||this.dirty){this.m.instanceMatrix.needsUpdate=true;this.dirty=any}}
}

/* ---------- the sign: gold 3D letters, navy board, gold frame, string lights, bunting, party poppers, search-light beams ---------- */
function makeSign7(msg){
 const R=raster7(msg),W=R.W,H=R.H,n=R.px.length/2,cell=clamp(13/W,.035,.085),bw=W*cell,bh=H*cell,BH=bh+1.5,BW=bw+1.8,BOT=1.9,yc=BOT+BH/2,TOP=BOT+BH,g=new THREE.Group();
 const navy=stdMat(0x0b1430,{metalness:.55,roughness:.45,emissive:0x040a1c,emissiveIntensity:.8}),goldM=stdMat(0xd9a441,{metalness:.9,roughness:.28,emissive:0x5a3a08,emissiveIntensity:.35}),dark=stdMat(0x1a1f2b,{metalness:.7,roughness:.5});
 g.add(M7(new THREE.BoxGeometry(BW,BH,.24),navy,0,yc,0));
 const bt=document.createElement('canvas');bt.width=512;bt.height=Math.max(64,Math.round(512*BH/BW));{const x=bt.getContext('2d'),gr=x.createLinearGradient(0,0,0,bt.height);gr.addColorStop(0,'#1b2a6b');gr.addColorStop(.55,'#3a1f5e');gr.addColorStop(1,'#7a2f4a');x.fillStyle=gr;x.fillRect(0,0,bt.width,bt.height);
  for(let i=0;i<170;i++){x.fillStyle='rgba(255,240,200,'+(.2+Math.random()*.7)+')';x.beginPath();x.arc(Math.random()*bt.width,Math.random()*bt.height,Math.random()*1.8+.4,0,7);x.fill()}}
 const btx=new THREE.CanvasTexture(bt);btx.colorSpace=THREE.SRGBColorSpace;g.add(M7(new THREE.PlaneGeometry(BW-.3,BH-.3),new THREE.MeshBasicMaterial({map:btx,toneMapped:false}),0,yc,.13));
 for(const s of[-1,1]){g.add(M7(new THREE.BoxGeometry(BW+.2,.18,.36),goldM,0,yc+s*(BH/2),0),M7(new THREE.BoxGeometry(.18,BH+.2,.36),goldM,s*(BW/2),yc,0));
  for(const t of[-1,1])g.add(M7(new THREE.SphereGeometry(.17,12,10),stdMat(0xff5aa5,{emissive:0xff2a80,emissiveIntensity:.9,roughness:.3}),s*(BW/2),yc+t*(BH/2),.2));
  g.add(M7(new THREE.CylinderGeometry(.11,.14,TOP+2.1,12),dark,s*(BW/2+.35),(TOP+1.7)/2-.4,-.05))}
 g.add(M7(new THREE.BoxGeometry(BW+3.4,.3,3.6),dark,0,-.1,.7),M7(new THREE.BoxGeometry(BW+3.6,.06,3.8),stdMat(0xff5aa5,{emissive:0xff2a80,emissiveIntensity:.8}),0,-.28,.7));
 /* the letters */
 const gold=stdMat(0xffffff,{metalness:.65,roughness:.3,emissive:0x7a4a10,emissiveIntensity:.55}),inst=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),gold,n);inst.frustumCulled=false;
 const pos=new Float32Array(n*3),st=new Float32Array(n),arr=inst.instanceMatrix.array,sx=cell*.94,sz=cell*1.7,col=new THREE.Color();
 for(let k=0;k<n;k++){const i=R.px[k*2],j=R.px[k*2+1],o=k*16;pos[k*3]=(i-W/2+.5)*cell;pos[k*3+1]=(H/2-j-.5)*cell+yc;pos[k*3+2]=.13+sz*.5;st[k]=(i/W)*1.5+Math.random()*.35+(j/H)*.3;arr.fill(0,o,o+16);arr[o+15]=1;
  col.setHSL(.12-.05*(j/H)+(Math.random()-.5)*.01,.95,.64-.12*(j/H)+(Math.random()-.5)*.04);inst.setColorAt(k,col)}
 g.add(inst);let done=false;
 const upd=t=>{if(done)return;let all=true;for(let k=0;k<n;k++){const s0=(t-st[k])/.55,o=k*16;if(s0<=0){all=false;continue}let s=Math.min(1,s0);if(s0<1)all=false;const e=1+2.7*Math.pow(s-1,3)+1.7*Math.pow(s-1,2);
   arr[o]=sx*e;arr[o+5]=sx*e;arr[o+10]=sz*e;arr[o+12]=pos[k*3];arr[o+13]=pos[k*3+1]+(1-s)*.5;arr[o+14]=pos[k*3+2]}inst.instanceMatrix.needsUpdate=true;if(all)done=true};
 /* string lights around the board */
 const bp=[],push=(x,y)=>bp.push(x,y);for(let x=-BW/2+.25;x<=BW/2-.2;x+=.5){push(x,TOP-.17);push(x,BOT+.17)}for(let y=BOT+.7;y<TOP-.6;y+=.5){push(-BW/2+.17,y);push(BW/2-.17,y)}
 const bn=bp.length/2,bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(.075,8,6),new THREE.MeshBasicMaterial({toneMapped:false}),bn);bulbs.frustumCulled=false;const bm=new THREE.Matrix4();
 for(let k=0;k<bn;k++){bm.makeTranslation(bp[k*2],bp[k*2+1],.3);bulbs.setMatrixAt(k,bm);bulbs.setColorAt(k,col.setHex(CONF7[k%5]))}g.add(bulbs);
 /* bunting between the two posts */
 const tri=new THREE.BufferGeometry();tri.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-.26,0,0,.26,0,0,0,-.58,0]),3));const fl=new THREE.InstancedMesh(tri,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,toneMapped:false}),15),pts=[];
 const x0=-(BW/2+.35),x1=BW/2+.35,y0=TOP+1.55;for(let k=0;k<15;k++){const u=(k+.5)/15,y=y0-.95*Math.sin(Math.PI*u);bm.makeTranslation(lerp(x0,x1,u),y-.02,.05);fl.setMatrixAt(k,bm);fl.setColorAt(k,col.setHex(CONF7[(k*3)%CONF7.length]))}
 for(let k=0;k<=24;k++){const u=k/24;pts.push(new THREE.Vector3(lerp(x0,x1,u),y0-.95*Math.sin(Math.PI*u),.05))}
 g.add(fl,new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xf2e6c8})));
 /* search-light beams + party poppers */
 const cg=new THREE.ConeGeometry(2.4,20,24,1,true);cg.rotateX(Math.PI);cg.translate(0,10,0);const beams=[];
 for(const s of[-1,1]){const pv=new THREE.Group();pv.position.set(s*(BW/2+2.6),0,1.2);pv.add(M7(cg,new THREE.MeshBasicMaterial({color:s<0?0xff8ad8:0x8ae6ff,transparent:true,opacity:.11,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false})));g.add(pv);beams.push(pv)}
 const poppers=[];
 for(const s of[-1,1]){const p=new THREE.Group(),body=M7(new THREE.ConeGeometry(.24,.8,18,1,true),stdMat(s<0?0xff4d6d:0x4cc9f0,{roughness:.5,metalness:.2,side:THREE.DoubleSide}),0,.4,0);body.rotation.x=Math.PI;p.add(body);
  for(const y of[.25,.45,.65,.8]){const t=M7(new THREE.TorusGeometry(.24*y/.8,.014,6,18),goldM,0,y,0);t.rotation.x=Math.PI/2;p.add(t)}
  p.position.set(s*(BW/2+1.5),.1,2.1);p.rotation.set(.45,0,s*.5);g.add(p);poppers.push({g:p,s,x:s*(BW/2+1.5),z:2.1,k:0})}
 const upd2=(t,el,dt)=>{for(let k=0;k<bn;k++)bulbs.setColorAt(k,col.setHex(CONF7[(k+Math.floor(el*2.2))%5]).multiplyScalar(.55+.45*Math.sin(el*5+k*1.7)));bulbs.instanceColor.needsUpdate=true;
  beams.forEach((b,i)=>{b.rotation.z=(i?-1:1)*(.3+.28*Math.sin(el*.9+i*2));b.rotation.x=.12*Math.sin(el*.7+i)});for(const p of poppers){p.k=Math.max(0,p.k-dt*3);p.g.scale.set(1+.4*p.k,1+.5*p.k,1+.4*p.k)}};
 return{g,upd,upd2,poppers,BW,BH,yc,TOP}}

/* ---------- capsule interior ---------- */
function panelTex7(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#2b3038';x.fillRect(0,0,256,256);
 for(let i=0;i<1800;i++){x.fillStyle='rgba('+(i%2?'255,255,255':'0,0,0')+','+(Math.random()*.05)+')';x.fillRect(Math.random()*256,Math.random()*256,2,2)}
 x.strokeStyle='#14171c';x.lineWidth=3;x.strokeRect(2,2,252,252);x.beginPath();x.moveTo(128,0);x.lineTo(128,256);x.moveTo(0,128);x.lineTo(256,128);x.stroke();
 x.fillStyle='#5b6470';for(const[a,b]of[[12,12],[244,12],[12,244],[244,244],[116,12],[140,12],[116,244],[140,244],[12,116],[12,140],[244,116],[244,140]]){x.beginPath();x.arc(a,b,4,0,7);x.fill()}
 x.fillStyle='#ff8a2a';x.fillRect(150,150,60,8);x.fillStyle='#e8e4dc';x.font='700 11px Consolas';x.fillText('HMSA  CREW MODULE',30,70);x.fillStyle='#14233f';x.strokeStyle='#ffb347';x.lineWidth=1.6;x.beginPath();x.roundRect(168,46,74,38,8);x.fill();x.stroke();x.font='900 14px Arial';x.fillStyle='#ffb347';x.fillText('HM',176,62);x.fillStyle='#5de6ff';x.fillText('SA',176,78);x.font='700 7px Arial';x.fillStyle='#f2f5fa';x.fillText('HURAIRA MEERAB',200,60);x.fillStyle='#bfe8ff';x.fillText('SPACE AGENCY',200,76);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
function screen7(w,h,pw,ph,col){const c=document.createElement('canvas');c.width=pw;c.height=ph;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,toneMapped:false}));m.rotation.x=-Math.PI/2;return{m,c,x:c.getContext('2d'),t,col}}

export class Sol7{
 constructor(mp,dn){this.mp=mp;this.dn=dn;this.dom=false;this.objs=[];this.init()}
 get b(){return this.mp.base}
 get s(){return this.mp.salv}
 get busy(){return this.ph>0}
 get freeze(){return this.ph>0}
 init(){this.on=false;this.ph=0;this.t=0;this.el=0;this.msg='';this.sg=null;this.cf=null;this.cab=null;this.mk=null;this.cx=0;this.cz=0;this.fired=[];this.snd=null;this.last='';this.vmS=null;this.cdN=-1;this.E0=null;this.dirH=null;this.scT=0;this.fadeOut=false;this.ambOut=null;this.telT=0;this.ly=0;this.lp=0;this.ty=0;this.tp=0;this.kl=this.kr=this.ku=this.kd2=0}
 dom0(){if(this.dom)return;this.dom=true;const st=document.createElement('style');st.textContent=CSS7;document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend','<div id="s7-obj"></div><div id="s7-type"><h2>LEAVE YOUR MESSAGE</h2><p>Type up to '+S7_MAX+' letters. They will be built in gold letters in front of the base door, for the next pioneers.</p><input id="s7-in" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Welcome home, pioneers"><div class="row"><span id="s7-cnt">0 / '+S7_MAX+' LETTERS</span><button id="s7-go">BUILD IT &nbsp;[ENTER]</button></div></div>'
   +'<div id="s7-cab"></div><div id="s7-tel"></div><div id="s7-cd"></div><div id="s7-fade"></div><div id="s7-end"><div class="p"></div><div class="p"></div><div class="p f">MISSION ACCOMPLISHED.<br>WELCOME HOME, ASTRONAUT.<br><button id="s7-bk">BACK TO MAIN MENU</button></div><div class="cr"><div class="roll"></div></div><div class="sk">PRESS SPACE TO SKIP</div></div><button id="s7-menu">&#9776; MENU</button>');
  const inp=$('s7-in'),pnl=$('s7-type');for(const ev of['keydown','keyup','keypress'])inp.addEventListener(ev,e=>{e.stopPropagation();if(ev==='keydown'&&e.key==='Enter'){e.preventDefault();this.submit()}});
  for(const ev of['mousedown','mouseup','click','wheel','pointerdown'])pnl.addEventListener(ev,e=>e.stopPropagation());
  inp.addEventListener('input',()=>this.limit());$('s7-go').addEventListener('click',()=>this.submit());
  const mb=$('s7-menu');mb.addEventListener('mousedown',e=>e.stopPropagation());mb.addEventListener('click',e=>{e.stopPropagation();mb.blur();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',key:'p'}))});
  addEventListener('mousemove',e=>{if(!this.cab||this.ph<5||this.ph>6)return;if(document.pointerLockElement){this.ty=clamp(this.ty+e.movementX*.0022,-LOOK_Y,LOOK_Y);this.tp=clamp(this.tp-e.movementY*.0022,-LOOK_DN,LOOK_UP)}
   else{const nx=e.clientX/innerWidth*2-1,ny=1-e.clientY/innerHeight*2;this.ty=nx*LOOK_Y;this.tp=ny>0?ny*LOOK_UP:ny*LOOK_DN}});
  const kk=(e,v)=>{if(!this.cab||this.ph<5||this.ph>6)return;const c=e.code;if(c==='ArrowLeft'||c==='KeyA')this.kl=v;else if(c==='ArrowRight'||c==='KeyD')this.kr=v;else if(c==='ArrowUp'||c==='KeyW')this.ku=v;else if(c==='ArrowDown'||c==='KeyS')this.kd2=v};
  addEventListener('keydown',e=>kk(e,1));addEventListener('keyup',e=>kk(e,0));
  addEventListener('mousedown',e=>{if(this.on&&this.ph>=1&&this.mp.r&&e.target===this.mp.r.domElement){e.stopImmediatePropagation();e.preventDefault()}},true);   /* from the moment you board: clicks never swing the hammer or use tools */
  const e=$('s7-end').children;e[0].textContent=END7[0];e[1].textContent=END7[1];{let h='';for(const r of CR7){if(r[0]==='t')h+='<div class="ct">'+r[1]+'</div>';else if(r[0]==='l')h+='<div class="cg"><div class="lgo"><b>HM</b><i>Huraira Meerab</i><b>SA</b><i>Space Agency</i></div></div>';else if(r[0]==='h')h+='<div class="ch">'+r[1]+'</div>';else if(r[0]==='n')h+='<div class="cn">'+r[1]+'</div>';else h+='<div class="cl"><span class="a">'+r[0]+'</span><span class="b">'+r[1]+'</span></div>'}$('s7-end').querySelector('.roll').innerHTML=h}
  addEventListener('keydown',ev=>{if(this.ph!==7||!this.crEnd||this.t>=this.crEnd)return;if(ev.code==='Space'||ev.code==='Enter'||ev.code==='Escape'){ev.preventDefault();ev.stopImmediatePropagation();this.t=this.crEnd}},true);$('s7-bk').addEventListener('click',()=>location.reload())}
 reset(){const mp=this.mp;for(const o of this.objs)if(o.parent)o.parent.remove(o);this.objs=[];
  for(const o of[this.cab,this.sg&&this.sg.g,this.cf&&this.cf.m])if(o&&o.parent)o.parent.remove(o);
  this.stopSnd();try{delete mp.lockPtr}catch(e){}
  const vm=mp.salv&&mp.salv.vm;if(vm&&this.vmS)vm.scale.copy(this.vmS);
  if(this.ambOut&&mp.audio){try{this.ambOut.connect(mp.audio.ac.destination)}catch(e){}}
  document.body.classList.remove('s7c');mp.camUp=null;
  if(this.dom){for(const id of['s7-obj','s7-type','s7-cab','s7-tel','s7-menu'])$(id).classList.remove('on');$('s7-cd').className='';const f=$('s7-fade');f.style.transition='none';f.style.opacity=0;void f.offsetWidth;f.style.transition='';
   for(const c of $('s7-end').children)c.classList.remove('on');$('s7-in').value='';this.limit();$('s7-in').blur()}
  this.init()}
 hudText(){return this.on&&this.ph===0?['SOL 7  \u00b7  LAUNCH DAY  \u00b7  REACH THE RETURN CAPSULE','']:null}
 limit(){const i=$('s7-in');const v=i.value.replace(/\s+/g,' ').replace(/^ /,'');let n=0,o='';for(const ch of v){if(ch!==' '){if(n>=S7_MAX)break;n++}o+=ch}i.value=o;const c=$('s7-cnt');c.textContent=n+' / '+S7_MAX+' LETTERS';c.classList.toggle('full',n>=S7_MAX)}
 /* ---------- start (DayNight calls this at the Sol 6 -> 7 dawn) ---------- */
 start(){if(this.on)return;const b=this.b,mp=this.mp;if(!b||!b.S||!mp.pod)return;this.on=true;this.dom0();
  const l=b.root.worldToLocal(new THREE.Vector3(mp.pod.x,0,mp.pod.z));this.cx=l.x;this.cz=l.z;
  try{this.mk=this.beacon(false,l.x,l.z,'#7dff9a','RETURN CAPSULE',11);this.mk.g.visible=true}catch(err){console.error('[sol7 build]',err)}
  $('s7-obj').classList.add('on');try{window.SolMusic&&SolMusic.mode('sad')}catch(e){}
  mp.cap('SOL 7  \u00b7  LAUNCH DAY',3600);this.last=''}
 near(){const b=this.b,P=b.p;if(!this.on||this.ph!==0||this.dn.sol!==7||b.mode!=='outside')return false;return Math.hypot(P.x-this.cx,P.z-this.cz)<6.5}
 interact(){if(!this.on||this.dn.sol!==7)return false;if(this.ph>0)return true;if(!this.near())return false;this.begin();return true}
 shot(px,py,pz,lx,ly,lz){const r=this.b.root,mp=this.mp;mp.cp.set(px,py,pz);r.localToWorld(mp.cp);mp.cl.set(lx,ly,lz);r.localToWorld(mp.cl)}
 /* ---------- 1  look back at the base ---------- */
 begin(){const mp=this.mp;this.ph=1;this.t=0;this.ty=this.tp=this.ly=this.lp=0;const s5=this.dn.s5;if(s5){s5.noDome=true;for(const k in s5.domes)s5.domes[k].g.visible=false}   /* Sol 5 shield dome: removed, it kept rendering */
  document.body.classList.add('s7c');$('s7-menu').classList.add('on');try{document.exitPointerLock()}catch(e){}
  mp.lockPtr=()=>{};const vm=this.s&&this.s.vm;if(vm){this.vmS=vm.scale.clone();vm.scale.setScalar(1e-4)}
  mp.cap('LOOK BACK  \u00b7  YOUR BASE STANDS READY',3200);this.tone(392,.25,.05);setTimeout(()=>this.tone(523,.3,.05),160)}
 updTurn(dt){const p=this.b.p,tx=-p.x,tz=-8-p.z,want=Math.atan2(tz,tx),da=Math.atan2(Math.sin(want-p.yaw),Math.cos(want-p.yaw)),k=Math.min(1,dt*2.6);p.yaw+=da*k;p.pitch+=(Math.atan2(4-p.y,Math.hypot(tx,tz))-p.pitch)*k;
  if(this.t>S7_TURN){this.ph=2;this.t=0;$('s7-type').classList.add('on');this.mp.cap('WHAT WILL THE NEXT PIONEERS READ?',3600);setTimeout(()=>{if(this.ph===2)$('s7-in').focus()},350)}}
 /* ---------- 2  type the message ---------- */
 submit(){if(this.ph!==2)return;const v=$('s7-in').value.replace(/\s+/g,' ').trim();if(!v){const p=$('s7-type');p.classList.remove('shake');void p.offsetWidth;p.classList.add('shake');this.tone(180,.2,.05,'sawtooth');return}
  this.msg=v.toUpperCase();$('s7-type').classList.remove('on');$('s7-in').blur();this.ph=3;this.t=0;this.fired=[];
  try{this.buildSign()}catch(err){console.error('[sol7 sign]',err);this.sg=null}
  this.mp.cap('YOUR MESSAGE  \u00b7  BUILT IN GOLD',3200);this.tone(523,.2,.05);setTimeout(()=>this.tone(659,.2,.05),120)}
 buildSign(){const b=this.b,a=b.S.airlockInfo,z0=-(a.rampEnd+7),S=makeSign7(this.msg);let gy=-1e9;for(let x=-8;x<=8;x+=4)gy=Math.max(gy,b.groundY(x,z0));
  const dx=this.cx,dz=this.cz-z0,ry=Math.atan2(dx,dz);S.g.position.set(0,gy,z0);S.g.rotation.y=ry;S.x=0;S.z=z0;S.gy=gy;S.ry=ry;b.S.ext.add(S.g);this.objs.push(S.g);this.sg=S;
  this.cf=new Confetti7(b.S.ext);this.cf.gy=gy;this.objs.push(this.cf.m)}
 wp(S,lx,lz){const c=Math.cos(S.ry),s=Math.sin(S.ry);return[S.x+lx*c+lz*s,S.z-lx*s+lz*c]}
 fire(i){const S=this.sg;if(!S||!this.cf)return;const P=S.poppers,w=(q,n)=>{const[x,z]=this.wp(S,q.x,q.z),dxl=-q.s,[ux,uz]=[dxl*Math.cos(S.ry)+.6*Math.sin(S.ry),-dxl*Math.sin(S.ry)+.6*Math.cos(S.ry)];this.cf.popper(x,S.gy+.9,z,ux,uz,n);q.k=1};
  if(i===0){w(P[0],190);this.popSnd()}else if(i===1){w(P[1],190);this.popSnd()}
  else if(i===2){w(P[0],260);w(P[1],260);this.popSnd(.7);for(let k=0;k<4;k++)setTimeout(()=>this.tone([523,659,784,1047][k],.5,.05),k*130)}
  else if(i===3){const[x,z]=this.wp(S,0,2);this.cf.rain(x,z,S.BW+4,S.TOP+4,320);this.hiss(.8,.03,1800)}
  else if(i===4){w(P[0],220);w(P[1],220);this.popSnd(.8)}}
 popSnd(v=.5){const a=this.mp.audio;if(a&&a.buf){try{const ac=a.ac,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();s.buffer=a.buf;f.type='bandpass';f.frequency.value=1800;f.Q.value=.7;g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.28);s.connect(f);f.connect(g);g.connect(ac.destination);s.start(0,Math.random()*1.5,.35)}catch(e){}}this.tone(150,.18,.12,'sine');this.tone(2400,.05,.04,'square')}
 /* ---------- 3  party ---------- */
 shotParty(t){const S=this.sg,b=this.b;if(!S)return;const u=sst(0,1,t/S7_PARTY),ang=S.ry+Math.sin(t*.3)*.5,d=lerp(26,17,u),cx=S.x+Math.sin(ang)*d,cz=S.z+Math.cos(ang)*d;this.shot(cx,b.groundY(cx,cz)+lerp(2.2,3.6,u),cz,S.x,S.gy+S.yc*.92,S.z)}
 updParty(dt){const t=this.t,S=this.sg;if(S){this.shotParty(t);S.upd(t-.2);S.upd2(t,this.el,dt)}
  const T=[.9,1.4,2.8,4.6,6.8];T.forEach((tt,i)=>{if(t>=tt&&!this.fired[i]){this.fired[i]=1;this.fire(i)}});
  if(!this.fired[9]&&t>3.4){this.fired[9]=1;this.mp.cap('WELCOME THE NEXT PIONEERS',4200)}
  if(t>S7_PARTY){this.ph=4;this.t=0;$('s7-fade').style.transition='opacity 1.3s';$('s7-fade').style.opacity=1;this.mp.cap('BOARDING THE RETURN CAPSULE',3200);this.tone(140,.3,.08,'square');this.hiss(.7,.04,1500)}}
 /* ---------- 4  fade out, sit down ---------- */
 updBoard(dt){if(this.sg){this.shotParty(S7_PARTY);this.sg.upd2(this.t,this.el,dt)}
  if(this.t>1.7&&!this.cab){try{this.enterCab()}catch(err){console.error('[sol7 cab]',err)}this.ph=5;this.t=0;$('s7-fade').style.transition='opacity 1.6s';$('s7-fade').style.opacity=0;this.tone(110,.4,.07,'square');this.hiss(1,.04,1200)}}
 enterCab(){const mp=this.mp,b=this.b,P=mp.pod;if(P&&P.g)P.g.visible=false;this.E0=new THREE.Vector3(P.x,P.y+.25,P.z);const rp=b.root.position;this.dirH=new THREE.Vector3(rp.x-P.x,0,rp.z-P.z);if(this.dirH.lengthSq()<1e-6)this.dirH.set(0,0,1);this.dirH.normalize();
  this.cab=this.buildCab();this.R=null;mp.near.add(this.cab);const a=mp.audio;if(a&&a.amb&&a.amb.out){this.ambOut=a.amb.out;try{this.ambOut.disconnect()}catch(e){}}
  $('s7-cab').classList.add('on');$('s7-tel').classList.add('on');this.cdN=-1;this.cabCam(this.E0,this.dirH)}
 cabCam(eye,dir){const mp=this.mp,c=this.cab,T=this._T||(this._T={a:new THREE.Vector3(),b:new THREE.Vector3(),c:new THREE.Vector3(),d:new THREE.Vector3()}),R=this.R||(this.R=new THREE.Vector3().crossVectors(this.dirH,_UP).normalize());
  mp.cp.copy(eye);T.c.copy(dir).addScaledVector(R,-dir.dot(R)).normalize();T.b.crossVectors(R,T.c).normalize();T.a.copy(R);       /* capsule frame: RIGHT stays horizontal, so no roll / tilt even when pitched straight down */
  _m4.makeBasis(T.a,T.b,T.d.copy(T.c).negate());if(c){c.position.copy(eye);c.quaternion.setFromRotationMatrix(_m4)}                 /* the cabin stays fixed to the capsule, only the view turns */
  T.c.applyAxisAngle(T.b,-this.ly);T.a.applyAxisAngle(T.b,-this.ly);T.c.applyAxisAngle(T.a,this.lp);T.b.applyAxisAngle(T.a,this.lp);  /* head turn: yaw then pitch (limited) */
  mp.cl.copy(eye).addScaledVector(T.c,50);if(!mp.camUp)mp.camUp=new THREE.Vector3();mp.camUp.copy(T.b)}
 look(dt){this.ty=clamp(this.ty+(this.kr-this.kl)*1.3*dt,-LOOK_Y,LOOK_Y);this.tp=clamp(this.tp+(this.ku-this.kd2)*1.0*dt,-LOOK_DN,LOOK_UP);const k=1-Math.exp(-7*dt);this.ly+=(this.ty-this.ly)*k;this.lp+=(this.tp-this.lp)*k}
 buildCab(){const g=new THREE.Group(),pt=panelTex7(),mat=r=>{const t=pt.clone();t.needsUpdate=true;t.repeat.set(r,r);return new THREE.MeshStandardMaterial({map:t,roughness:.75,metalness:.35,color:0xbfc7d2,emissive:0x1a2230,emissiveIntensity:.6,side:THREE.DoubleSide})};
  const rr=(w,h,r,cx,cy)=>{const q=new THREE.Shape(),x=cx-w/2,y=cy-h/2,P=Math.PI;q.moveTo(x+r,y);q.lineTo(x+w-r,y);q.absarc(x+w-r,y+r,r,-P/2,0,false);q.lineTo(x+w,y+h-r);q.absarc(x+w-r,y+h-r,r,0,P/2,false);q.lineTo(x+r,y+h);q.absarc(x+r,y+h-r,r,P/2,P,false);q.lineTo(x,y+r);q.absarc(x+r,y+r,r,P,P*1.5,false);return q};
  const mt=stdMat(0xb9c2cb,{metalness:.9,roughness:.3}),dk=new THREE.MeshStandardMaterial({color:0x14181d,roughness:.7,metalness:.5,side:THREE.DoubleSide});
  /* a window in the local frame of a wall panel: metal frame + bolts on the cabin side, dark liner tunnel going outward, faint glass */
  const win7=(w,h,r,cx,cy,dep)=>{const G=new THREE.Group(),inn=rr(w,h,r,cx,cy),out=rr(w+.16,h+.16,r+.08,cx,cy);out.holes.push(rr(w,h,r,cx,cy));
   G.add(M7(new THREE.ShapeGeometry(out,24),mt,0,0,.012));
   const pts=inn.getSpacedPoints(96),pos=[],idx=[];pts.forEach(p=>pos.push(p.x,p.y,0,p.x,p.y,-dep));for(let i=0;i<pts.length-1;i++){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}
   const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));lg.setIndex(idx);lg.computeVertexNormals();G.add(M7(lg,dk));
   for(const p of rr(w+.08,h+.08,r+.04,cx,cy).getSpacedPoints(26))G.add(M7(new THREE.SphereGeometry(.016,8,6),mt,p.x,p.y,.02));
   G.add(M7(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:0xcfe0ff,transparent:true,opacity:.035,depthWrite:false,toneMapped:false}),cx,cy,-.01));return G};
  const WIN={w:1.7,h:1.02,r:.24,y:.12};                                   /* big front viewport (was a small round porthole) */
  const front=new THREE.Shape();front.moveTo(-1.3,-.95);front.lineTo(1.3,-.95);front.lineTo(1.3,.95);front.lineTo(-1.3,.95);front.closePath();front.holes.push(rr(WIN.w,WIN.h,WIN.r,0,WIN.y));
  g.add(M7(new THREE.ShapeGeometry(front,48),mat(.8),0,0,-1.5));const fw=win7(WIN.w,WIN.h,WIN.r,0,WIN.y,.4);fw.position.set(0,0,-1.5);g.add(fw);
  /* side portholes: look left / right to see the ground and sky beside the capsule */
  for(const sd of[-1,1]){const lx=sd<0?.35:-.35,pnl=new THREE.Shape();pnl.moveTo(-1.3,-.95);pnl.lineTo(1.3,-.95);pnl.lineTo(1.3,.95);pnl.lineTo(-1.3,.95);pnl.closePath();pnl.holes.push(rr(.78,.54,.17,lx,.1));
   const w=new THREE.Group();w.position.set(sd*1.3,0,-.3);w.rotation.y=sd<0?Math.PI/2:-Math.PI/2;w.add(M7(new THREE.ShapeGeometry(pnl,32),mat(.9)),win7(.78,.54,.17,lx,.1,.3));g.add(w)}
  const pl=(w,h,x,y,z,rx,ry)=>{const m=M7(new THREE.PlaneGeometry(w,h),mat(.9),x,y,z);m.rotation.set(rx,ry,0);g.add(m)};
  pl(2.6,2.6,0,.95,-.3,Math.PI/2,0);pl(2.6,2.6,0,-.95,-.3,Math.PI/2,0);
  const pn=new THREE.Group();pn.position.set(0,-.72,-1.22);pn.rotation.x=.55;pn.add(M7(new THREE.BoxGeometry(2.5,.3,.55),stdMat(0x232830,{metalness:.6,roughness:.5})));g.add(pn);
  this.sc=[screen7(.78,.3,512,196,'#5de6ff'),screen7(.56,.3,256,140,'#7dff9a'),screen7(.56,.3,256,140,'#ffb347')];[0,-.86,.86].forEach((x,i)=>{this.sc[i].m.position.set(x,.152,-.04);pn.add(this.sc[i].m)});
  for(let i=0;i<16;i++){const c=[0xff5a4a,0x7dff9a,0xffb347,0x5de6ff][i%4];pn.add(M7(new THREE.BoxGeometry(.06,.05,.06),stdMat(0x39414d,{metalness:.6,roughness:.4}),-1.15+i*.153,.16,.2),M7(new THREE.SphereGeometry(.014,6,4),new THREE.MeshBasicMaterial({color:c,toneMapped:false}),-1.15+i*.153,.2,.2))}
  const L1=new THREE.PointLight(0xffe0b8,9,7,2);L1.position.set(0,.6,-.4);const L2=new THREE.PointLight(0x6fb8ff,3,3,2);L2.position.set(0,-.4,-.9);g.add(L1,L2);
  g.traverse(o=>{o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false});return g}
 drawScr(alt,vel,met,st){const[a,b,c]=this.sc,fm=(x,w,h)=>{x.fillStyle='#04101a';x.fillRect(0,0,w,h)};let x=a.x;fm(x,512,196);x.strokeStyle=a.col;x.lineWidth=3;x.strokeRect(3,3,506,190);x.fillStyle=a.col;x.font='700 22px Consolas,monospace';x.textAlign='left';
  x.fillText('ALT  '+(alt<1000?Math.round(alt)+' M':(alt/1000).toFixed(alt<1e5?1:0)+' KM'),20,52);x.fillText('VEL  '+vel.toFixed(2)+' KM/S',20,96);x.fillStyle='#e8f4f8';x.font='600 18px Consolas,monospace';x.fillText('MET  '+met,20,138);x.fillStyle=st==='LIFTOFF'?'#ffb347':'#7dff9a';x.fillText(st,20,176);a.t.needsUpdate=true;
  x=b.x;fm(x,256,140);x.strokeStyle=b.col;x.lineWidth=2;x.strokeRect(2,2,252,136);x.fillStyle=b.col;x.font='700 14px Consolas,monospace';x.fillText('LIFE SUPPORT',12,24);x.fillStyle='#e8f4f8';x.font='600 13px Consolas,monospace';['O2      7 / 7','FOOD    7 / 7','SAMPLES 5 / 5','BATTERY 100%'].forEach((s,i)=>x.fillText(s,12,50+i*24));b.t.needsUpdate=true;
  x=c.x;fm(x,256,140);x.strokeStyle=c.col;x.lineWidth=2;x.strokeRect(2,2,252,136);x.fillStyle=c.col;x.font='700 14px Consolas,monospace';x.fillText('EARTH RETURN',12,24);x.beginPath();for(let i=0;i<=40;i++){const u=i/40,px=14+u*226,py=104-Math.sin(u*Math.PI*.9)*60;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke();const q=clamp(this.t/S7_UP,0,1);x.fillStyle='#fff';x.beginPath();x.arc(14+q*226,104-Math.sin(q*Math.PI*.9)*60,4,0,7);x.fill();x.fillStyle='#e8f4f8';x.font='600 12px Consolas,monospace';x.fillText('7 MONTHS  \u00b7  TRAJECTORY OK',12,128);c.t.needsUpdate=true}
 /* ---------- 5  countdown on the pad ---------- */
 updPad(dt){const t=this.t,mp=this.mp,rem=S7_CD-t;this.look(dt);
  _v1.copy(this.dirH).multiplyScalar(.9987).addScaledVector(_UP,.05).normalize();_v2.copy(this.E0);_v2.y+=Math.sin(t*1.3)*.004;this.cabCam(_v2,_v1);
  if((this.telT-=dt)<=0){this.telT=.2;this.drawScr(0,0,'T-'+String(Math.max(0,Math.ceil(rem))).padStart(2,'0'),'COUNTDOWN');this.telDom(0,0,'T-'+String(Math.max(0,Math.ceil(rem))).padStart(2,'0'),'COUNTDOWN')}
  if(rem>0){const n=Math.ceil(rem);if(n!==this.cdN){this.cdN=n;const e=$('s7-cd');e.textContent=n<=5?String(n):'';e.className='';void e.offsetWidth;if(n<=5){e.className='p';this.tone(440+(5-n)*60,.18,.06,'square')}if(n===8)mp.cap('SOL 7  \u00b7  CREW SEATED  \u00b7  ALL SYSTEMS GO',3600);if(n===6)mp.cap('MOVE THE MOUSE  \u00b7  LOOK LEFT / RIGHT',3200);if(n===4)mp.cap('IGNITION SEQUENCE START',2200)}}
  else{this.ph=6;this.t=0;this.cdN=-1;const e=$('s7-cd');e.textContent='LIFTOFF';e.className='';void e.offsetWidth;e.className='p';setTimeout(()=>{if(this.ph===6)e.className=''},2200);
   mp.kick=Math.max(mp.kick,.14);mp.fovKick=5;this.startSnd();this.tone(90,1.2,.12,'sawtooth');this.dust=1.4;mp.cap('LIFTOFF',2600);this.ev={}}}
 telDom(alt,vel,met,st){const al=alt<1000?Math.round(alt)+' M':(alt/1000).toFixed(alt<1e5?1:0)+' KM';$('s7-tel').innerHTML='RETURN CAPSULE  \u00b7  SOL 7<br>MET <b>'+met+'</b><br>ALT <b>'+al+'</b><br>VEL <b>'+vel.toFixed(2)+' KM/S</b><br><b>'+st+'</b>'}
 /* ---------- 6  lift-off, out of the atmosphere, Mars in the window ---------- */
 updUp(dt){this.look(dt);const t=this.t,mp=this.mp,u=clamp(t/S7_UP,0,1),h=20*(Math.exp(12.6*u)-1),eye=_v2.copy(this.E0);eye.y+=h;const rp=this.b.root.position;
  if(this.dust>0){const n=Math.min(260,Math.round(dt*300)),P=mp.pod,g=P.y-1.1;this.dust-=dt;for(let i=0;i<n;i++){const a=Math.random()*6.2832,d=1+Math.random()*4,sp=6+Math.random()*10;mp.puffs.emit(P.x+Math.cos(a)*d,g+.3+Math.random()*2.2,P.z+Math.sin(a)*d,Math.cos(a)*sp,.5+Math.random()*5,Math.sin(a)*sp,3+Math.random()*3,3+Math.random()*3,14+Math.random()*18,.80,.54,.40,.4,.8,.2,-.2)}}
  _v1.set(rp.x-eye.x,rp.y+3-eye.y,rp.z-eye.z).normalize();                                               /* towards the base */
  _v3.copy(this.dirH).multiplyScalar(.9987).addScaledVector(_UP,.05).normalize().lerp(_v1,sst(0,.16,u));      /* start level, then follow the base down */
  _v4.set(-eye.x,-S7_RM-eye.y,-eye.z).normalize().addScaledVector(this.dirH,.22).normalize();                /* finally: Mars fills the window */
  _v3.lerp(_v4,sst(.3,.86,u)).normalize();this.cabCam(eye,_v3);
  const sh=.07*Math.exp(-t/5)+(u<.62?.012:0);mp.kick=Math.max(mp.kick,sh);
  const vel=5.03*(1-Math.exp(-3.3*u)),met=Math.floor(t*13),mm=Math.floor(met/60),ss=met%60,st=h<1e5?'ASCENT':u<.99?'ORBIT  \u00b7  TRANS-EARTH BURN':'ORBIT';
  if((this.telT-=dt)<=0){this.telT=.2;this.drawScr(h,vel,'T+'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0'),h<1e5?'ASCENT':'IN SPACE');this.telDom(h,vel,'T+'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0'),h<1e5?'ASCENT':'IN SPACE')}
  const ev=this.ev,E=(k,c)=>{if(c&&!ev[k]){ev[k]=1;return true}return false};
  if(E('a',h>2000))mp.sub('Mars\u2019 escape velocity is only about 5 km/s, less than half of Earth\u2019s 11.2 km/s, which makes leaving Mars far easier than leaving Earth.','NASA FACT',8000);
  if(E('b',h>20000))mp.cap('PASSING THROUGH THE THIN MARTIAN AIR',3000);
  if(E('c',h>100000)){mp.cap('YOU HAVE LEFT THE ATMOSPHERE',3600);this.tone(660,.5,.05);setTimeout(()=>this.tone(880,.7,.05),220)}
  if(E('d',h>600000))mp.cap('MARS FALLS AWAY BEHIND YOU',4000);
  if(E('e',u>=.995))mp.sub('The flight home takes about seven months, roughly 210 days. Every astronaut who has ever left Earth has looked back at it, and you are the first to look back at Mars.','HOMEWARD BOUND',9000);
  this.updSnd(u);
  if(u>=.9&&!this.fadeOut){this.fadeOut=true;$('s7-fade').style.transition='opacity 3s';$('s7-fade').style.opacity=1}
  if(t>=S7_UP+3){this.mp.camUp=null;this.ph=7;this.t=0;try{document.exitPointerLock()}catch(e){}$('s7-cab').classList.remove('on');$('s7-tel').classList.remove('on');$('s7-cd').className='';this.stopSnd();mp.cap('',1)}}
 /* engine + rumble */
 startSnd(){const a=this.mp.audio;if(!a||!a.buf||this.snd)return;try{const ac=a.ac,s=ac.createBufferSource(),lp=ac.createBiquadFilter(),g=ac.createGain(),o=ac.createOscillator(),og=ac.createGain();s.buffer=a.buf;s.loop=true;lp.type='lowpass';lp.frequency.value=200;g.gain.value=0;s.connect(lp);lp.connect(g);g.connect(ac.destination);
  o.type='sine';o.frequency.value=38;og.gain.value=0;o.connect(og);og.connect(ac.destination);s.start();o.start();this.snd={s,lp,g,o,og,ac}}catch(e){}}
 updSnd(u){const S=this.snd;if(!S)return;const t=S.ac.currentTime,lvl=u<.02?u/.02:u<.62?1:Math.max(.04,1-(u-.62)/.14)*(u>.9?Math.max(0,1-(u-.9)/.1):1);S.g.gain.setTargetAtTime(1.7*lvl,t,.25);S.og.gain.setTargetAtTime(.22*lvl,t,.25);S.lp.frequency.setTargetAtTime(220+520*Math.min(1,u/.5),t,.3)}
 stopSnd(){const S=this.snd;if(!S)return;this.snd=null;try{S.g.gain.setTargetAtTime(0,S.ac.currentTime,.2);S.og.gain.setTargetAtTime(0,S.ac.currentTime,.2);setTimeout(()=>{try{S.s.stop();S.o.stop()}catch(e){}},900)}catch(e){}}
 /* ---------- 7  black screen ---------- */
 updEnd(dt){const t=this.t,c=$('s7-end').children;if(document.pointerLockElement){try{document.exitPointerLock()}catch(e){}}   /* the game is over: mouse is free for the BACK TO MAIN MENU button */
  const cr=c[3],roll=cr.firstChild,H=innerHeight;if(!this.crEnd||this.crH!==H){this.crH=H;this.crEnd=CR7_T0+(H+roll.offsetHeight)/CR7_SPD+1.5}
  const ct=t-CR7_T0,run=t>CR7_T0&&t<this.crEnd;
  c[0].classList.toggle('on',t>1.5&&t<10.2);c[1].classList.toggle('on',t>11.8&&t<26);
  cr.classList.toggle('on',run);c[4].classList.toggle('on',run&&ct>2);
  if(run)roll.style.transform='translateY('+(H-ct*CR7_SPD)+'px)';
  c[2].classList.toggle('on',t>=this.crEnd)}
 /* ---------- per frame ---------- */
 update(dt){if(!this.on)return;this.dom0();dt=Math.min(dt,.1);this.el+=dt;
  if(this.ph===0){const s7=this.dn.sol===7;$('s7-obj').classList.toggle('on',s7);if(this.mk){this.mk.g.visible=s7;this.mk.ring.scale.setScalar(1+.12*Math.sin(this.el*4))}
   if(s7){const n=this.near(),pr=$('b-prompt');if(n&&pr){pr.innerHTML='<b>E</b>BOARD THE RETURN CAPSULE  \u00b7  GO HOME';pr.classList.add('on')}
    const d=Math.hypot(this.b.p.x-this.cx,this.b.p.z-this.cz),h='<h3>SOL 7  \u00b7  HOMEWARD BOUND</h3><div class="t">TODAY YOU GO HOME</div><div class="s">\u25b8 Walk to the RETURN CAPSULE'+(this.b.mode==='outside'?'  \u00b7  '+Math.round(d)+' m':'  \u00b7  leave through the airlock')+'</div><div class="s h">Press [E] at the capsule: leave a message for the next pioneers, then launch</div>';
    if(h!==this.last){this.last=h;$('s7-obj').innerHTML=h}}return}
  this.t+=dt;if(this.cf)this.cf.update(dt);
  switch(this.ph){case 1:this.updTurn(dt);break;case 2:break;case 3:this.updParty(dt);break;case 4:this.updBoard(dt);break;case 5:this.updPad(dt);break;case 6:this.updUp(dt);break;case 7:this.updEnd(dt);break}}
}
Object.assign(Sol7.prototype,{beacon:Sol4.prototype.beacon,tone:Sol4.prototype.tone,hiss:Sol4.prototype.hiss,toast:Sol4.prototype.toast});