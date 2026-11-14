/* =====================================================================================================
   save.js  -  SOL 7 SAVE SYSTEM  (classic script, global window.SolSave)
   -----------------------------------------------------------------------------------------------------
   * AUTOSAVE : while you are in the base (Sol 1 base day ... Sol 7) the game saves every 5 s, on every new sol,
               when you open the pause menu and when the window closes. Nothing is saved while dead / in the Sol 7 launch.
   * WHERE   : a real file  <userData>/sol7-save.json  (Electron, via preload.js)  + a localStorage backup.
   * CONTINUE: the menu shows CONTINUE when a save exists. It skips the launch / landing cutscenes (under a black
               screen), rebuilds the base, completes the earlier sols exactly like the game's own skip does, then puts
               you back: same sol, same place (zone / position / direction), vitals, suit, backpack + hotbar, crafting
               history and greenhouse. The task state of the CURRENT sol is the one the game itself keeps at every dawn
               (the same snapshot the [R] retry uses), so no task can ever be left half-consistent or soft-locked.
   Hooks: mars.js -> SolSave.tick(mp,dt) every frame, mp.fastLand(), SolSave.onReset()   menu.js -> menu buttons
          launch.js -> window.__solGo()
   ===================================================================================================== */
(function(){
 const KEY='sol7.save.v1',VER=1,IO=window.solSaveIO;
 const S={mp:null,job:null,acc:5,lastSol:0,hold:0,cp1:null};
 const rd=()=>{try{if(IO){const s=IO.read();if(s)return s}}catch(e){}try{return localStorage.getItem(KEY)}catch(e){return null}};
 const wr=s=>{try{if(IO)IO.write(s)}catch(e){}try{localStorage.setItem(KEY,s)}catch(e){}};
 const rm=()=>{try{if(IO)IO.clear()}catch(e){}try{localStorage.removeItem(KEY)}catch(e){}};
 const load=()=>{const s=rd();if(!s)return null;try{const o=JSON.parse(s);return o&&o.v===VER&&o.cp&&o.sol>=1&&o.pos?o:null}catch(e){return null}};
 const cl=A=>(A||[]).map(it=>it?Object.assign({},it):null);

 /* ---------------- capture: only from a clean, live base state ---------------- */
 function capture(mp){
  const dn=mp&&mp.dn,b=mp&&mp.base,s=mp&&mp.salv;if(!dn||!b||!s||!s.cr||!b.S)return null;
  if(!b.active||(b.mode!=='inside'&&b.mode!=='outside'))return null;
  if(dn.dead||(mp.sv&&mp.sv.dead)||(dn.s7&&(dn.s7.busy||dn.s7.ph>0)))return null;
  let cp=null;
  if(dn.cp&&dn.cp.sol===dn.sol)cp=dn.cp;
  else if(dn.sol===1){if(!S.cp1){const old=dn.cp;dn.takeCp();S.cp1=dn.cp;dn.cp=old}cp=S.cp1}
  if(!cp)return null;
  const p=b.p,sv={};if(mp.sv)for(const k of['hp','o2','wat','food','rad'])if(typeof mp.sv[k]==='number')sv[k]=mp.sv[k];
  return{v:VER,ts:Date.now(),sol:dn.sol,cp:{sol:cp.sol,inv:cl(cp.inv),bag:cl(cp.bag),sel:cp.sel|0,made:Object.assign({},cp.made),suit:Object.assign({},cp.suit),farm:cp.farm?cp.farm.map(q=>Object.assign({},q)):null},
   sv,pos:{mode:b.mode,x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch}}}
 function flush(){if(S.job||S.hold>0)return false;try{const o=capture(S.mp);if(!o)return false;wr(JSON.stringify(o));return true}catch(e){console.error('[save]',e);return false}}

 /* ---------------- CONTINUE: step machine driven by MarsPhase.update ---------------- */
 function fail(mp,e){console.error('[load save]',e);S.job=null;try{mp.salv.tk.toast('SAVE COULD NOT BE LOADED \u00b7 RETURNING TO MENU','#ff5a4a')}catch(x){}setTimeout(()=>location.reload(),2600)}
 function step(mp,dt){
  const J=S.job,b=mp.base,s=mp.salv;J.t+=dt;
  if(J.t>120){fail(mp,new Error('timeout in phase '+J.ph));return}
  if(J.ph===0){if(mp.built&&mp.state==='approach'){mp.fastLand();J.ph=1}}
  else if(J.ph===1){if(mp.walk&&mp.pod&&s&&s.cr&&mp.sv){mp.skipSol();J.ph=2;J.rt=.6}}
  else if(J.ph===2){
   if(b.mode==='off'){if((J.rt-=dt)<=0){J.rt=.6;try{s.cr.cheatUnlock()}catch(e){}}}
   else if(b.active&&b.S&&b.S.rooms&&b.S.rooms.gre&&b.mode==='walkin'){apply(mp,J.save);J.ph=3;J.t=0}}
  else if(J.ph===3){
   const f=b.farm,cp=J.save.cp;
   if((f&&f.ready)||J.t>12){try{if(f&&f.ready&&cp.farm)cp.farm.forEach((q,i)=>{const p=f.plots[i];if(p){Object.assign(p,q);f.paint(p)}})}catch(e){console.error('[save farm]',e)}
    S.job=null;S.hold=3;S.lastSol=mp.dn.sol}}}
 function apply(mp,sv){
  const b=mp.base,dn=mp.dn,s=mp.salv,tk=s.tk,cr=s.cr,cp=sv.cp,N=Math.max(1,Math.min(7,sv.sol|0)),$$=id=>document.getElementById(id);
  /* 1. earlier sols: completed exactly like the game's own skip (world objects, unlocks) */
  for(let i=0;i<9&&dn.sol<N;i++){if(!dn.skipStep())break}
  /* 2. backpack + hotbar + crafting history = what you owned at the start of this sol (same as the game's [R] retry) */
  for(let i=0;i<s.inv.length;i++){const it=cp.inv[i];s.inv[i]=it?Object.assign({},it):null}
  for(let i=0;i<s.bag.length;i++){const it=cp.bag[i];s.bag[i]=it?Object.assign({},it):null}
  s.sel=cp.sel|0;cr.made=Object.assign({},cp.made||{});
  if(!cr.table&&cr.count('crafting_table')<1)tk.give('crafting_table',1);if(!tk.cru&&cr.count('crucible')<1)tk.give('crucible',1);if(cr.count('bucket')<1)tk.give('bucket',1,{w:0});
  try{tk.after();s.renderSlots(false);s.showName()}catch(e){}
  /* 3. vitals + suit + clock */
  if(mp.sv){for(const k of['hp','o2','wat','food','rad'])if(typeof sv.sv[k]==='number')mp.sv[k]=sv.sv[k];mp.sv.dead=false;mp.sv.hp=Math.max(mp.sv.hp,50);for(const k of['o2','wat','food'])mp.sv[k]=Math.max(mp.sv[k],40)}
  if(cp.suit)dn.suit=Object.assign({},cp.suit);dn.cp=JSON.parse(JSON.stringify(cp));if(N===1)S.cp1=JSON.parse(JSON.stringify(cp));
  dn.t=0;dn.night=false;dn.sleep=0;dn.cold=0;dn.k=1;dn.ex=1;
  /* 4. where you were */
  const P=b.p,q=sv.pos,ok=v=>typeof v==='number'&&isFinite(v);let mode=q.mode==='outside'?'outside':'inside',x=q.x,z=q.z;
  try{if(!ok(x)||!ok(z)||(mode==='inside'?!b.free(x,z):b.blockedOut(x,z))){mode='inside';x=0;z=-6.2}}catch(e){mode='inside';x=0;z=-6.2}
  P.x=x;P.z=z;P.yaw=ok(q.yaw)?q.yaw:Math.PI/2;P.pitch=ok(q.pitch)?Math.max(-1.2,Math.min(1.2,q.pitch)):0;
  if(mode==='inside'){P.y=1.2+1.65;b.mode='inside';b.setInterior(true);b.leaf('out',1);b.leaf('inn',1)}
  else{b.mode='outside';b.setInterior(false);b.leaf('inn',1);b.leaf('out',0);P.y=b.groundY(x,z)+1.75}
  b.moving=false;b.ct=0;b.cycTint=0;b.zoneKey='';b.hudMode(true);const cy=$$('b-cycle');if(cy)cy.classList.remove('on');b.dip(900);
  /* 5. reveal */
  const f=$$('fade');if(f){f.style.transition='opacity 1.4s';f.style.opacity=0}
  mp.mdx=mp.mdy=0;try{mp.lockPtr&&mp.lockPtr()}catch(e){}
  mp.cap('GAME LOADED  \u00b7  SOL '+dn.sol,3400);try{tk.toast('SAVE LOADED  \u00b7  SOL '+dn.sol,'#7dff9a')}catch(e){}}

 function tick(mp,dt){
  S.mp=mp;
  if(S.job){try{step(mp,dt)}catch(e){fail(mp,e)}return}
  if(S.hold>0){S.hold-=dt;return}
  const dn=mp.dn;if(dn&&dn.sol!==S.lastSol&&mp.base&&mp.base.active){S.lastSol=dn.sol;S.acc=5}
  S.acc+=dt;if(S.acc>=5){S.acc=0;flush()}}

 window.SolSave={
  exists:()=>!!load(),load,info(){const o=load();return o?{sol:o.sol,ts:o.ts}:null},clear(){rm();S.cp1=null},flush,tick,
  begin(sv){S.job={ph:0,t:0,rt:0,save:sv};S.hold=0},
  onReset(){S.cp1=null;S.hold=0}};
 for(const ev of['beforeunload','pagehide'])addEventListener(ev,()=>{try{flush()}catch(e){}});
})();
