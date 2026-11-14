const cv=document.getElementById('c'),g=cv.getContext('2d'),W=cv.width,H=cv.height;
const MAP=["################","#..............#","#..##....##....#","#..#......#....#","#......2.......#","#..........#...#","#.....##...#...#","#.....##.......#","#..#...........#","#..#....3..##..#","#.......#......#","#..##...#..#...#","#......2...#...#","#..............#","#....##........#","################"];
const WALL={'#':[170,70,60],'2':[60,90,190],'3':[60,160,80]};
const cell=(x,y)=>(MAP[y|0]||'')[x|0]||'#';
const solid=(x,y)=>cell(x,y)!=='.';
const keys={};let P,enemies,wave,kills,dead,started=false,locked=false,shootT=0,hurtT=0,nextWave=0,last=performance.now();
const zbuf=new Array(W).fill(0);
const sky=g.createLinearGradient(0,0,0,H/2);sky.addColorStop(0,'#05050f');sky.addColorStop(1,'#202040');
const flo=g.createLinearGradient(0,H/2,0,H);flo.addColorStop(0,'#101010');flo.addColorStop(1,'#3a3328');
let actx;function beep(f,d,t='square',v=.08){try{actx=actx||new AudioContext();const o=actx.createOscillator(),a=actx.createGain();o.type=t;o.frequency.value=f;a.gain.value=v;a.gain.exponentialRampToValueAtTime(.001,actx.currentTime+d);o.connect(a);a.connect(actx.destination);o.start();o.stop(actx.currentTime+d)}catch(e){}}
function reset(){P={x:1.5,y:1.5,a:0.8,hp:100};enemies=[];wave=0;kills=0;dead=false;spawn()}
function spawn(){wave++;const n=2+wave;for(let i=0;i<n;i++){let x,y;do{x=1+Math.random()*14;y=1+Math.random()*14}while(solid(x,y)||Math.hypot(x-P.x,y-P.y)<6);enemies.push({x,y,hp:2,cd:0,flash:0})}}
addEventListener('keydown',e=>{keys[e.code]=1;if(e.code==='KeyR'&&dead)reset()});
addEventListener('keyup',e=>keys[e.code]=0);
cv.addEventListener('click',()=>{if(!locked){cv.requestPointerLock();started=true;return}shoot()});
document.addEventListener('pointerlockchange',()=>locked=document.pointerLockElement===cv);
document.addEventListener('mousemove',e=>{if(locked&&!dead)P.a+=e.movementX*0.003});
function shoot(){if(dead||shootT>0)return;shootT=.25;beep(120,.15,'sawtooth',.12);
 const dx=Math.cos(P.a),dy=Math.sin(P.a),px=-dy*.66,py=dx*.66,inv=1/(px*dy-dx*py);let best=null,bd=1e9;
 for(const e of enemies){const sx=e.x-P.x,sy=e.y-P.y,tx=inv*(dy*sx-dx*sy),ty=inv*(-py*sx+px*sy);
  if(ty<=0)continue;const scr=W/2*(1+tx/ty),size=H/ty;
  if(Math.abs(scr-W/2)<size*.3&&ty<zbuf[W/2|0]&&ty<bd){bd=ty;best=e}}
 if(best){best.hp--;best.flash=.15;beep(300,.08);if(best.hp<=0){enemies.splice(enemies.indexOf(best),1);kills++;beep(80,.3,'sawtooth',.15)}}}
function update(dt){
 if(shootT>0)shootT-=dt;if(hurtT>0)hurtT-=dt;if(dead)return;
 const dx=Math.cos(P.a),dy=Math.sin(P.a);let mx=0,my=0;const s=3*dt;
 if(keys.KeyW)mx+=dx,my+=dy;if(keys.KeyS)mx-=dx,my-=dy;
 if(keys.KeyD)mx-=dy,my+=dx;if(keys.KeyA)mx+=dy,my-=dx;
 if(keys.ArrowLeft)P.a-=2*dt;if(keys.ArrowRight)P.a+=2*dt;
 const r=.25,nx=P.x+mx*s,ny=P.y+my*s;
 if(!solid(nx+Math.sign(mx)*r,P.y))P.x=nx;if(!solid(P.x,ny+Math.sign(my)*r))P.y=ny;
 for(const e of enemies){e.flash-=dt;e.cd-=dt;const ex=P.x-e.x,ey=P.y-e.y,d=Math.hypot(ex,ey);
  if(d>.8){const sp=(.9+wave*.06)*dt,vx=ex/d*sp,vy=ey/d*sp;if(!solid(e.x+vx*3,e.y))e.x+=vx;if(!solid(e.x,e.y+vy*3))e.y+=vy}
  else if(e.cd<=0){e.cd=.8;P.hp-=10;hurtT=.3;beep(60,.2,'sawtooth',.15);if(P.hp<=0){P.hp=0;dead=true}}}
 if(!enemies.length){if(!nextWave)nextWave=2;nextWave-=dt;if(nextWave<=0){nextWave=0;spawn()}}
}
function render(){
 g.fillStyle=sky;g.fillRect(0,0,W,H/2);g.fillStyle=flo;g.fillRect(0,H/2,W,H/2);
 const dx=Math.cos(P.a),dy=Math.sin(P.a),px=-dy*.66,py=dx*.66;
 for(let x=0;x<W;x++){const cx=2*x/W-1,rx=dx+px*cx,ry=dy+py*cx;let mx=P.x|0,my=P.y|0;
  const ddx=Math.abs(1/rx),ddy=Math.abs(1/ry);let sx,sy,sdx,sdy,side=0,hit;
  if(rx<0){sx=-1;sdx=(P.x-mx)*ddx}else{sx=1;sdx=(mx+1-P.x)*ddx}
  if(ry<0){sy=-1;sdy=(P.y-my)*ddy}else{sy=1;sdy=(my+1-P.y)*ddy}
  while(true){if(sdx<sdy){sdx+=ddx;mx+=sx;side=0}else{sdy+=ddy;my+=sy;side=1}hit=cell(mx,my);if(hit!=='.')break}
  const pd=side?sdy-ddy:sdx-ddx;zbuf[x]=pd;const lh=H/pd,top=H/2-lh/2;
  let wx=side?P.x+pd*rx:P.y+pd*ry;wx-=Math.floor(wx);
  const c=WALL[hit]||WALL['#'],b=Math.max(.15,1-pd/12)*(side?.7:1);
  g.fillStyle=`rgb(${c[0]*b|0},${c[1]*b|0},${c[2]*b|0})`;g.fillRect(x,top,1,lh);
  g.fillStyle=`rgba(3, 3, 3, 0.35)`;
  const bx=(wx*4)%1;if(bx<.06)g.fillRect(x,top,1,lh);
  for(let i=0;i<4;i++)g.fillRect(x,top+lh*i/4,1,Math.max(1,lh*.03))}
 const inv=1/(px*dy-dx*py);
 const list=enemies.map(e=>{const sx=e.x-P.x,sy=e.y-P.y;return{e,tx:inv*(dy*sx-dx*sy),ty:inv*(-py*sx+px*sy)}}).filter(o=>o.ty>.1).sort((a,b)=>b.ty-a.ty);
 for(const{e,tx,ty}of list){const scr=W/2*(1+tx/ty),size=H/ty,x0=scr-size/2,top=H/2-size/2,b=Math.max(.25,1-ty/10);
  for(let x=Math.max(0,x0|0);x<Math.min(W,x0+size);x++){if(ty>=zbuf[x])continue;const u=(x-x0)/size;
   g.fillStyle=e.flash>0?'#fff':`rgb(${200*b|0},${30*b|0},${40*b|0})`;
   if(u>.15&&u<.85)g.fillRect(x,top+size*.3,1,size*.7);
   if(u>.28&&u<.72)g.fillRect(x,top+size*.05,1,size*.25);
   if(!(e.flash>0)){g.fillStyle='#ff0';if((u>.36&&u<.44)||(u>.56&&u<.64))g.fillRect(x,top+size*.12,1,size*.06)}}}
 // gun
 const rc=shootT>0?10:0;g.fillStyle='#333';g.fillRect(W/2-8,H-50+rc,16,50);g.fillStyle='#555';g.fillRect(W/2-5,H-60+rc,10,20);
 if(shootT>.15){g.fillStyle='#fd4';g.beginPath();g.arc(W/2,H-62,10,0,7);g.fill()}
 g.fillStyle='#fff';g.fillRect(W/2-1,H/2-6,2,4);g.fillRect(W/2-1,H/2+2,2,4);g.fillRect(W/2-6,H/2-1,4,2);g.fillRect(W/2+2,H/2-1,4,2);
 if(hurtT>0){g.fillStyle=`rgba(255,0,0,${hurtT})`;g.fillRect(0,0,W,H)}
 // minimap
 const m=4;g.globalAlpha=.7;for(let y=0;y<16;y++)for(let x=0;x<16;x++){g.fillStyle=solid(x,y)?'#888':'#222';g.fillRect(5+x*m,5+y*m,m,m)}
 g.fillStyle='#0f0';g.fillRect(5+P.x*m-1,5+P.y*m-1,3,3);g.fillStyle='#f00';for(const e of enemies)g.fillRect(5+e.x*m-1,5+e.y*m-1,3,3);g.globalAlpha=1;
 g.fillStyle='#fff';g.font='12px monospace';g.textAlign='left';
 g.fillText(`HP ${P.hp}   Kills ${kills}   Wave ${wave}`,75,17);
 g.fillStyle='#400';g.fillRect(W/2-50,H-12,100,6);g.fillStyle='#e22';g.fillRect(W/2-50,H-12,P.hp,6);
 g.textAlign='center';g.font='20px monospace';
 if(!locked&&!dead){g.fillStyle='rgba(0,0,0,.6)';g.fillRect(0,0,W,H);g.fillStyle='#fff';g.fillText('CLICK TO PLAY',W/2,H/2-20);g.font='12px monospace';g.fillText('WASD move · Mouse look · Click shoot · Arrows turn',W/2,H/2+5)}
 if(dead){g.fillStyle='rgba(120,0,0,.6)';g.fillRect(0,0,W,H);g.fillStyle='#fff';g.fillText('YOU DIED',W/2,H/2-10);g.font='12px monospace';g.fillText(`Kills ${kills} · Press R to restart`,W/2,H/2+15)}
}
function loop(t){const dt=Math.min(.05,(t-last)/1000);last=t;if(locked||dead)update(dt);else if(shootT>0)shootT-=dt;render();requestAnimationFrame(loop)}
reset();requestAnimationFrame(loop);
