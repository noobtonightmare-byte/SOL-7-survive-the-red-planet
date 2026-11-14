/* loading.js - SOL 7 loading screen .
   Full-screen slideshow of rocket + Mars scenes with Ken-Burns drift and mixed transitions (fade / wipe / slide / flash-cut),
   logo bottom-left, spinner + percent bottom-right, rotating tips. Shows for at least ~10.5 s while the menu scene
   (GPU Mars) and the game itself load in the background; the menu is revealed when both are ready.
   Want real photos? Put images named 1.jpg ... 8.jpg in  assets/loading/  and they join the slideshow automatically. */
(function(){
 const W=1280,H=720,MIN_S=10.6,HOLD=2.6;
 const css=`#ld{position:fixed;inset:0;z-index:200;background:#000;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;color:#fff;transition:opacity 1.2s}
#ld.out{opacity:0;pointer-events:none}
#ld .slide{position:absolute;inset:0;opacity:0;overflow:hidden}
#ld .slide canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:var(--ox,50%) var(--oy,50%)}
#ld .slide.kb canvas{animation:ldkb 8s linear forwards}
@keyframes ldkb{from{transform:scale(1.02) translate(0,0)}to{transform:scale(1.17) translate(var(--dx,-1.5%),var(--dy,-1%))}}
#ld .slide.t-fade{transition:opacity 1.2s ease}#ld .slide.t-fade.on{opacity:1}
#ld .slide.t-wipe{opacity:1;clip-path:inset(0 100% 0 0);transition:clip-path .95s cubic-bezier(.75,0,.2,1)}#ld .slide.t-wipe.on{clip-path:inset(0 0 0 0)}
#ld .slide.t-slide{transform:translateX(9%);transition:transform .95s cubic-bezier(.2,.7,.2,1),opacity .7s}#ld .slide.t-slide.on{opacity:1;transform:none}
#ld .slide.t-flash.on{opacity:1}
#ld .slide.t-zoom{transform:scale(1.35);transition:transform 1.1s cubic-bezier(.2,.7,.2,1),opacity .9s}#ld .slide.t-zoom.on{opacity:1;transform:none}
#ld .fl{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:900}#ld .fl.go{animation:ldfl .55s ease-out}
@keyframes ldfl{0%{opacity:0}28%{opacity:.95}100%{opacity:0}}
#ld .shade{position:absolute;inset:0;z-index:800;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 62%,rgba(0,0,0,.82) 100%)}
#ld .logo{position:absolute;left:4.5vw;bottom:5.5vh;z-index:850;line-height:.9}
#ld .logo b{display:block;font:900 clamp(54px,8vw,120px)/.9 Impact,'Arial Black','Arial Narrow Bold',sans-serif;letter-spacing:4px;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.7)}
#ld .logo b i{font-style:normal;color:#ff7a3a}
#ld .logo small{display:block;margin:10px 0 0 6px;font:600 12px Consolas,monospace;letter-spacing:9px;opacity:.75}
#ld .tip{position:absolute;left:50%;bottom:7vh;transform:translateX(-50%);width:min(520px,34vw);z-index:850;text-align:center;font:400 15px/1.5 'Segoe UI',Arial,sans-serif;letter-spacing:1px;color:#f2f2f2;text-shadow:0 2px 8px #000;transition:opacity .5s}
#ld .tip em{display:block;font:700 11px Consolas,monospace;letter-spacing:6px;color:#ff8a4c;margin-bottom:4px;font-style:normal}
#ld .stat{position:absolute;right:4.5vw;bottom:6vh;z-index:850;display:flex;align-items:center;gap:16px;font:600 15px Consolas,monospace;letter-spacing:6px;text-shadow:0 2px 8px #000}
#ld .sp{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.22);border-top-color:#fff;animation:ldsp .85s linear infinite}
@keyframes ldsp{to{transform:rotate(360deg)}}
#ld .pr{position:absolute;left:0;bottom:0;height:3px;width:100%;z-index:850;background:rgba(255,255,255,.12)}#ld .pr i{display:block;height:100%;width:100%;transform-origin:left;transform:scaleX(0);background:linear-gradient(90deg,#ff5a2a,#ffb347);transition:transform .35s linear}
@media(max-width:900px){#ld .tip{display:none}}`;
 const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
 const ld=document.createElement('div');ld.id='ld';
 ld.innerHTML='<div class="stage"></div><div class="fl"></div><div class="shade"></div><div class="logo"><b>SOL <i>7</i></b><small>SURVIVE THE RED PLANET</small></div><div class="tip" id="ld-tip"></div><div class="stat"><span id="ld-t">LOADING</span><span id="ld-p">0%</span><div class="sp"></div></div><div class="pr"><i id="ld-bar"></i></div>';
 document.body.appendChild(ld);
 const stage=ld.firstChild,fl=ld.querySelector('.fl');

 /* ------------------------------------------ drawn "photos" ------------------------------------------ */
 let seed=1;const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return[c,c.getContext('2d')]};
 const lin=(g,stops,y0=0,y1=H)=>{const q=g.createLinearGradient(0,y0,0,y1);for(const[o,c]of stops)q.addColorStop(o,c);g.fillStyle=q;g.fillRect(0,0,W,H)};
 const glow=(g,x,y,r,c,a)=>{const q=g.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,c.replace('A',a));q.addColorStop(1,c.replace('A',0));g.fillStyle=q;g.fillRect(x-r,y-r,r*2,r*2)};
 const stars=(g,n,ymax,a)=>{for(let i=0;i<n;i++){const s=rnd()<.08?2:1;g.fillStyle='rgba(255,240,230,'+(a*(.3+rnd()*.7))+')';g.fillRect(rnd()*W,rnd()*ymax,s,s)}};
 const ridge=(g,y,amp,col,f,ph)=>{g.fillStyle=col;g.beginPath();g.moveTo(0,H);for(let x=0;x<=W;x+=8)g.lineTo(x,y-amp*(Math.sin(x*f+ph)*.5+Math.sin(x*f*2.3+ph*1.7)*.3+Math.sin(x*f*5.1+ph*.6)*.2));g.lineTo(W,H);g.fill()};
 let grainTile=null;
 function post(g,dark=.55){const q=g.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,H*1.05);q.addColorStop(0,'rgba(0,0,0,0)');q.addColorStop(1,'rgba(0,0,0,'+dark+')');g.fillStyle=q;g.fillRect(0,0,W,H);
  if(!grainTile){const t=document.createElement('canvas');t.width=t.height=160;const x=t.getContext('2d'),d=x.createImageData(160,160);for(let i=0;i<d.data.length;i+=4){const v=rnd()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}x.putImageData(d,0,0);grainTile=t}
  g.globalAlpha=.07;g.fillStyle=g.createPattern(grainTile,'repeat');g.fillRect(0,0,W,H);g.globalAlpha=1}
 const poly=(g,pts,fill)=>{g.fillStyle=fill;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fill()};

 /* Space Shuttle stack: orange tank, two white boosters, orbiter in front */
 function stack(g,sx,by,hs){
  const ex=27,etTop=by-hs*.80,tip=by-hs*.97;let q=g.createLinearGradient(sx-ex,0,sx+ex,0);q.addColorStop(0,'#4a1b08');q.addColorStop(.5,'#b9501a');q.addColorStop(1,'#ffa650');
  g.fillStyle=q;g.beginPath();g.moveTo(sx-ex,by-hs*.03);g.lineTo(sx-ex,etTop);g.quadraticCurveTo(sx-ex,tip+10,sx,tip);g.quadraticCurveTo(sx+ex,tip+10,sx+ex,etTop);g.lineTo(sx+ex,by-hs*.03);g.fill();
  for(const d of[-1,1]){const cx=sx+d*42,w=13,top=by-hs*.58,tp=by-hs*.71;q=g.createLinearGradient(cx-w,0,cx+w,0);q.addColorStop(0,'#98a0b2');q.addColorStop(.55,'#eef0f4');q.addColorStop(1,'#fff3dc');
   g.fillStyle=q;g.beginPath();g.moveTo(cx-w,by);g.lineTo(cx-w,top);g.quadraticCurveTo(cx-w,tp+4,cx,tp);g.quadraticCurveTo(cx+w,tp+4,cx+w,top);g.lineTo(cx+w,by);g.fill();
   g.fillStyle='rgba(0,0,0,.22)';for(const k of[.18,.34,.46])g.fillRect(cx-w,by-hs*k,w*2,2);g.fillStyle='#24242b';g.fillRect(cx-w*.6,by-hs*.025,w*1.2,hs*.03)}
  const ox=17,otip=by-hs*.76,otop=by-hs*.58,obot=by-hs*.2;
  poly(g,[[sx-ox,obot-hs*.02],[sx-58,by-hs*.12],[sx-ox,by-hs*.30]],'#8e95a6');poly(g,[[sx+ox,obot-hs*.02],[sx+58,by-hs*.12],[sx+ox,by-hs*.30]],'#f2f0ea');
  q=g.createLinearGradient(sx-ox,0,sx+ox,0);q.addColorStop(0,'#a8aebf');q.addColorStop(.6,'#f4f5f8');q.addColorStop(1,'#fff6e6');
  g.fillStyle=q;g.beginPath();g.moveTo(sx-ox,obot);g.lineTo(sx-ox,otop);g.quadraticCurveTo(sx-ox,otip+12,sx,otip);g.quadraticCurveTo(sx+ox,otip+12,sx+ox,otop);g.lineTo(sx+ox,obot);g.fill();
  g.fillStyle='#17171c';g.beginPath();g.ellipse(sx,otip+9,9,12,0,0,7);g.fill();g.fillRect(sx-8,otip+30,16,4);
  g.fillStyle='#2a2a30';for(const d of[-9,0,9])g.fillRect(sx+d-4,obot,8,hs*.04);
  g.strokeStyle='rgba(255,225,180,.55)';g.lineWidth=1.5;g.beginPath();g.moveTo(sx+ex,etTop);g.lineTo(sx+ex,by-hs*.05);g.stroke()}
 function tower(g,x,by,h,col){g.fillStyle=col;g.strokeStyle=col;g.fillRect(x,by-h,5,h);g.fillRect(x+46,by-h,5,h);g.lineWidth=1.5;
  for(let y=by;y>by-h+30;y-=30){g.beginPath();g.moveTo(x,y);g.lineTo(x+51,y-30);g.moveTo(x+51,y);g.lineTo(x,y-30);g.stroke();g.fillRect(x,y-2,51,3)}g.fillRect(x+24,by-h-80,3,80);
  g.fillStyle='rgba(255,70,50,.95)';g.fillRect(x+23,by-h-84,5,5)}

 /* 1 - launch pad at dawn */
 function sceneLaunchPad(g){seed=11;
  lin(g,[[0,'#070d24'],[.35,'#2b2a55'],[.6,'#a2566a'],[.78,'#f59a55'],[1,'#ffcf8a']]);stars(g,200,H*.42,.9);glow(g,W*.8,H*.8,560,'rgba(255,170,90,A)',.85);
  ridge(g,H*.80,16,'#3a2230',.004,1);ridge(g,H*.83,10,'#21141c',.007,3);
  const by=H*.86,sx=W*.5,hs=H*.68;let q=g.createLinearGradient(0,by,0,H);q.addColorStop(0,'#2a1d24');q.addColorStop(1,'#07060a');g.fillStyle=q;g.fillRect(0,by,W,H-by);
  g.fillStyle='rgba(255,190,120,.22)';g.beginPath();g.ellipse(sx,by+6,330,24,0,0,7);g.fill();
  const tx=sx-210;tower(g,tx,by,hs*.82,'#120f15');g.fillStyle='#14111a';g.fillRect(tx+51,by-hs*.62,sx-27-(tx+51),4);g.fillRect(tx+51,by-hs*.36,sx-27-(tx+51),4);
  stack(g,sx,by,hs);
  g.globalCompositeOperation='lighter';for(const[fx,fy]of[[sx-420,by+10],[sx+430,by+14],[sx+170,by+34]]){const gr=g.createLinearGradient(fx,fy,sx,by-hs*.55);gr.addColorStop(0,'rgba(255,240,210,.22)');gr.addColorStop(1,'rgba(255,240,210,0)');
   g.fillStyle=gr;g.beginPath();g.moveTo(fx-9,fy);g.lineTo(fx+9,fy);g.lineTo(sx+30,by-hs*.8);g.lineTo(sx-30,by-hs*.2);g.fill();glow(g,fx,fy,40,'rgba(255,240,210,A)',.9)}g.globalCompositeOperation='source-over';
  for(let i=0;i<16;i++)glow(g,rnd()*W,by+rnd()*50,160+rnd()*220,'rgba(255,205,165,A)',.1);
  post(g)}

 /* 2 - lift-off */
 function sceneLiftoff(g){seed=23;
  lin(g,[[0,'#050a1c'],[.5,'#1c2858'],[.85,'#a04e68'],[1,'#f09050']]);stars(g,170,H*.5,.8);ridge(g,H*.93,10,'#0d0a12',.005,2);
  const sx=W*.52,ny=H*.46,hs=H*.44;
  for(let i=0;i<150;i++){const t=i/150,y=ny+30+t*H*.62,sp=40+t*560,x=sx+(rnd()-.5)*sp*2,r=40+rnd()*(60+t*120);glow(g,x,y,r,'rgba(224,206,200,A)',.07+.1*(1-t))}
  g.globalCompositeOperation='lighter';for(let i=0;i<40;i++){const t=rnd();glow(g,sx+(rnd()-.5)*220*t,ny+40+t*260,70+rnd()*90,'rgba(255,150,60,A)',.2*(1-t))}g.globalCompositeOperation='source-over';
  stack(g,sx,ny,hs);
  g.globalCompositeOperation='lighter';glow(g,sx,ny+20,420,'rgba(255,150,60,A)',.55);
  const fg=g.createLinearGradient(0,ny,0,ny+H*.4);fg.addColorStop(0,'rgba(255,255,240,1)');fg.addColorStop(.25,'rgba(255,215,120,.9)');fg.addColorStop(.7,'rgba(255,110,30,.4)');fg.addColorStop(1,'rgba(255,60,10,0)');
  g.fillStyle=fg;g.beginPath();g.moveTo(sx-34,ny);g.quadraticCurveTo(sx-48,ny+H*.2,sx,ny+H*.4);g.quadraticCurveTo(sx+48,ny+H*.2,sx+34,ny);g.fill();
  for(const d of[-42,42]){const f2=g.createLinearGradient(0,ny,0,ny+H*.3);f2.addColorStop(0,'rgba(255,240,200,.95)');f2.addColorStop(1,'rgba(255,90,20,0)');g.fillStyle=f2;g.beginPath();g.moveTo(sx+d-12,ny);g.quadraticCurveTo(sx+d-14,ny+H*.14,sx+d,ny+H*.3);g.quadraticCurveTo(sx+d+14,ny+H*.14,sx+d+12,ny);g.fill()}
  glow(g,sx,ny+30,90,'rgba(255,255,230,A)',.95);g.globalCompositeOperation='source-over';
  tower(g,W*.12,H*.95,H*.62,'#0a080d');post(g)}

 /* 3 - Mars from orbit with Phobos and an orbiter craft */
 function sceneOrbit(g){seed=37;g.fillStyle='#02030a';g.fillRect(0,0,W,H);glow(g,W*.3,H*.2,700,'rgba(70,60,110,A)',.22);stars(g,420,H,1);
  const tw=900,th=450,[tc,tg]=(()=>{const c=document.createElement('canvas');c.width=tw;c.height=th;return[c,c.getContext('2d')]})();
  tg.fillStyle='#a8481f';tg.fillRect(0,0,tw,th);
  const blob=(x,y,r,c,a)=>{const q=tg.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,c.replace('A',a));q.addColorStop(1,c.replace('A',0));tg.fillStyle=q;tg.fillRect(x-r,y-r,r*2,r*2)};
  for(let i=0;i<90;i++)blob(rnd()*tw,rnd()*th,30+rnd()*90,'rgba(220,120,60,A)',.25+rnd()*.3);for(let i=0;i<80;i++)blob(rnd()*tw,rnd()*th,25+rnd()*80,'rgba(60,24,16,A)',.25+rnd()*.35);
  tg.strokeStyle='rgba(40,14,8,.8)';tg.lineWidth=14;tg.lineCap='round';tg.beginPath();tg.moveTo(180,250);tg.bezierCurveTo(260,230,330,290,420,262);tg.stroke();tg.lineWidth=6;tg.beginPath();tg.moveTo(300,270);tg.lineTo(350,310);tg.stroke();
  for(let i=0;i<4;i++)blob(120+i*50,150-i*10,34,'rgba(50,20,14,A)',.5);
  const cx=W*.72,cy=H*1.08,R=H*.95;g.save();g.beginPath();g.arc(cx,cy,R,0,7);g.clip();g.drawImage(tc,cx-R*1.7,cy-R,R*3.4,R*2);
  let q=g.createRadialGradient(cx-R*.55,cy-R*.65,R*.1,cx-R*.2,cy-R*.3,R*1.5);q.addColorStop(0,'rgba(255,190,130,.28)');q.addColorStop(.5,'rgba(0,0,0,.2)');q.addColorStop(1,'rgba(0,0,6,.95)');g.fillStyle=q;g.fillRect(cx-R,cy-R,R*2,R*2);
  q=g.createRadialGradient(cx,cy,R*.9,cx,cy,R);q.addColorStop(0,'rgba(110,160,255,0)');q.addColorStop(1,'rgba(130,175,255,.45)');g.fillStyle=q;g.fillRect(cx-R,cy-R,R*2,R*2);g.restore();
  q=g.createRadialGradient(cx,cy,R*.99,cx,cy,R*1.08);q.addColorStop(0,'rgba(255,150,90,.45)');q.addColorStop(1,'rgba(255,120,60,0)');g.fillStyle=q;g.beginPath();g.arc(cx,cy,R*1.08,0,7);g.fill();
  /* Phobos */
  const px=W*.2,py=H*.3;g.save();g.translate(px,py);g.rotate(-.4);q=g.createRadialGradient(-18,-14,4,0,0,56);q.addColorStop(0,'#b0a398');q.addColorStop(.55,'#6e645b');q.addColorStop(1,'#1c1815');g.fillStyle=q;g.beginPath();g.ellipse(0,0,62,47,0,0,7);g.fill();
  for(const[a,b,r]of[[18,8,14],[-20,10,9],[4,-18,8],[-6,22,6],[30,-10,5]]){g.fillStyle='rgba(20,16,14,.55)';g.beginPath();g.arc(a,b,r,0,7);g.fill();g.strokeStyle='rgba(200,185,170,.35)';g.lineWidth=1.5;g.beginPath();g.arc(a-1,b-1,r,3.4,5.6);g.stroke()}g.restore();
  g.fillStyle='#bdb0a2';g.beginPath();g.arc(W*.4,H*.1,6,0,7);g.fill();glow(g,W*.4,H*.1,18,'rgba(255,230,210,A)',.3);
  /* orbiter craft */
  g.save();g.translate(W*.4,H*.62);g.rotate(-.32);q=g.createLinearGradient(0,-20,0,20);q.addColorStop(0,'#f2d78a');q.addColorStop(.5,'#b58b3a');q.addColorStop(1,'#4a3515');g.fillStyle=q;g.beginPath();g.roundRect?g.roundRect(-70,-17,140,34,8):g.rect(-70,-17,140,34);g.fill();
  for(const d of[-1,1]){const x0=d>0?72:-212;g.fillStyle='#14204a';g.fillRect(x0,-24,140,48);g.strokeStyle='rgba(120,150,230,.55)';g.lineWidth=1;for(let i=1;i<7;i++){g.beginPath();g.moveTo(x0+i*20,-24);g.lineTo(x0+i*20,24);g.stroke()}g.beginPath();g.moveTo(x0,0);g.lineTo(x0+140,0);g.stroke();g.fillStyle='rgba(255,230,190,.35)';g.fillRect(x0,-24,140,3)}
  g.fillStyle='#d9d9e0';g.beginPath();g.ellipse(0,-30,22,9,0,0,7);g.fill();g.fillRect(-1,-30,2,14);g.restore();
  g.globalCompositeOperation='lighter';glow(g,0,0,520,'rgba(255,235,210,A)',.5);for(let i=1;i<5;i++)glow(g,i*130,i*95,24+i*10,'rgba(255,200,150,A)',.16);g.globalCompositeOperation='source-over';post(g,.6)}

 /* 4 - Mars landing site at sunset (blue sunset glow, lander, rocks) */
 function sceneSurface(g){seed=53;
  lin(g,[[0,'#121830'],[.38,'#463e5c'],[.6,'#94706a'],[.7,'#c99870'],[1,'#d9a47a']],0,H*.72);g.fillStyle='#d9a47a';g.fillRect(0,H*.7,W,H);
  const sx=W*.72,sy=H*.63;glow(g,sx,sy,520,'rgba(110,165,255,A)',.8);glow(g,sx,sy,190,'rgba(200,225,255,A)',.95);g.fillStyle='#fff';g.beginPath();g.arc(sx,sy,15,0,7);g.fill();
  ridge(g,H*.68,28,'rgba(120,88,86,.9)',.003,2);ridge(g,H*.71,24,'#6a4743',.005,4);ridge(g,H*.73,10,'#4c302c',.009,1);
  let q=g.createLinearGradient(0,H*.73,0,H);q.addColorStop(0,'#7a4630');q.addColorStop(1,'#2a1510');g.fillStyle=q;g.fillRect(0,H*.73,W,H);
  glow(g,sx,H*.76,420,'rgba(150,185,255,A)',.18);
  for(let i=0;i<360;i++){const t=rnd(),y=H*.74+Math.pow(t,1.7)*H*.26,s=1+t*t*9,x=rnd()*W;g.fillStyle=rnd()<.5?'rgba(30,14,10,.55)':'rgba(205,140,100,.35)';g.beginPath();g.ellipse(x,y,s*1.5,s*.7,0,0,7);g.fill()}
  const lx=W*.3,ly=H*.84;g.fillStyle='rgba(20,8,6,.45)';g.beginPath();g.moveTo(lx-20,ly+10);g.lineTo(lx-420,ly+34);g.lineTo(lx-400,ly+54);g.lineTo(lx+30,ly+22);g.fill();
  g.strokeStyle='#cfd1d8';g.lineWidth=4;for(const d of[-1,1]){g.beginPath();g.moveTo(lx+d*34,ly-78);g.lineTo(lx+d*92,ly+8);g.stroke();g.fillStyle='#bfc2ca';g.fillRect(lx+d*92-14,ly+4,28,6)}
  g.beginPath();g.moveTo(lx-26,ly-70);g.lineTo(lx-62,ly+8);g.moveTo(lx+26,ly-70);g.lineTo(lx+62,ly+8);g.stroke();
  q=g.createLinearGradient(lx-48,0,lx+48,0);q.addColorStop(0,'#5a4420');q.addColorStop(.6,'#d8b45a');q.addColorStop(1,'#fff0b0');g.fillStyle=q;poly(g,[[lx-48,ly-84],[lx+48,ly-84],[lx+58,ly-134],[lx-58,ly-134]],q);
  g.fillStyle='#d8dae0';g.fillRect(lx-46,ly-92,92,10);g.fillStyle='#23232a';g.fillRect(lx-20,ly-118,40,22);g.strokeStyle='#e8e8ee';g.lineWidth=3;g.beginPath();g.moveTo(lx+30,ly-134);g.lineTo(lx+58,ly-188);g.stroke();g.fillStyle='#e8e8ee';g.beginPath();g.ellipse(lx+60,ly-192,22,8,-.5,0,7);g.fill();
  for(let i=0;i<46;i++){const t=Math.pow(rnd(),1.4),y=H*.77+t*H*.2,s=6+t*60,x=rnd()*W;if(Math.abs(x-lx)<110&&y<ly+20)continue;
   const pts=[];for(let k=0;k<7;k++){const a=k/7*6.283;pts.push([x+Math.cos(a)*s*(.7+rnd()*.5),y-Math.abs(Math.sin(a))*s*.8*(.6+rnd()*.5)+s*.15])}
   const rg=g.createLinearGradient(x-s,0,x+s,0);rg.addColorStop(0,'#1a0d0a');rg.addColorStop(.6,'#5a3326');rg.addColorStop(1,'#d89a70');poly(g,pts,rg)}
  for(let i=0;i<10;i++)glow(g,rnd()*W,H*.74+rnd()*30,200+rnd()*200,'rgba(220,170,140,A)',.12);post(g)}

 /* 5 - atmospheric entry */
 function sceneEntry(g){seed=71;
  lin(g,[[0,'#08061a'],[.5,'#33173d'],[.82,'#b83f36'],[1,'#ff9a4a']]);stars(g,150,H*.5,.7);
  let q=g.createRadialGradient(W*.5,H*2.4,H*1.4,W*.5,H*2.4,H*1.8);q.addColorStop(0,'#2e1410');q.addColorStop(.86,'#7a3018');q.addColorStop(.93,'rgba(255,150,80,.9)');q.addColorStop(1,'rgba(120,150,255,0)');g.fillStyle=q;g.fillRect(0,H*.55,W,H);
  g.save();g.translate(W*.6,H*.36);g.rotate(.5);
  g.globalCompositeOperation='lighter';for(let i=0;i<90;i++){const t=i/90,x=-t*W*.75,r=34+t*120+rnd()*14;glow(g,x+rnd()*20,(rnd()-.5)*(30+t*50),r,t<.3?'rgba(255,200,130,A)':t<.65?'rgba(255,100,40,A)':'rgba(150,60,200,A)',.22*(1-t*.85))}
  for(let i=0;i<110;i++){const x=-rnd()*W*.7,y=(rnd()-.5)*110,l=40+rnd()*160;g.strokeStyle='rgba(255,'+(150+rnd()*90|0)+',90,'+(.15+rnd()*.5)+')';g.lineWidth=1+rnd()*1.6;g.beginPath();g.moveTo(x,y);g.lineTo(x-l,y);g.stroke()}
  glow(g,30,0,200,'rgba(255,230,200,A)',.9);glow(g,40,0,110,'rgba(255,255,240,A)',.9);g.globalCompositeOperation='source-over';
  q=g.createLinearGradient(-90,0,40,0);q.addColorStop(0,'#17151c');q.addColorStop(1,'#3a3540');poly(g,[[-92,-20],[0,-52],[22,-44],[22,44],[0,52],[-92,20]],q);
  g.strokeStyle='rgba(255,170,90,.9)';g.lineWidth=5;g.beginPath();g.moveTo(22,-44);g.quadraticCurveTo(34,0,22,44);g.stroke();g.fillStyle='#0c0b10';g.fillRect(-92,-14,14,28);
  g.globalCompositeOperation='lighter';glow(g,26,0,90,'rgba(255,190,110,A)',.9);g.globalCompositeOperation='source-over';g.restore();post(g,.6)}

 const SCENES=[sceneLaunchPad,sceneLiftoff,sceneOrbit,sceneSurface,sceneEntry],pool=[];let made=0;
 function makeNext(){if(made>=SCENES.length)return;const[c,g]=mk();try{SCENES[made++](g)}catch(e){console.error('[loading art]',e)}const s=document.createElement('div');s.className='slide';s.appendChild(c);stage.appendChild(s);pool.push(s)}
 /* optional real photos: assets/loading/1.jpg ... 8.jpg */
 for(let i=1;i<=8;i++){const im=new Image();im.onload=()=>{const[c,g]=mk(),k=Math.max(W/im.width,H/im.height);g.drawImage(im,(W-im.width*k)/2,(H-im.height*k)/2,im.width*k,im.height*k);post(g,.4);const s=document.createElement('div');s.className='slide';s.appendChild(c);stage.appendChild(s);pool.push(s)};im.src='assets/loading/'+i+'.jpg'}

 /* ------------------------------------------ slideshow + transitions ------------------------------------------ */
 const TYPES=['fade','wipe','slide','flash','zoom'];let cur=null,lastT='',z=1,order=[];
 function pick(){if(!order.length){order=pool.slice().sort(()=>Math.random()-.5);if(order[order.length-1]===cur&&order.length>1)order.unshift(order.pop())}let s=order.pop();if(s===cur&&pool.length>1)s=order.pop()||pool.find(p=>p!==cur);return s}
 function show(first){if(!pool.length)return;const s=pick(),prev=cur;let t=first?'fade':TYPES[Math.floor(Math.random()*TYPES.length)];if(t===lastT)t=TYPES[(TYPES.indexOf(t)+1)%TYPES.length];lastT=t;
  s.className='slide t-'+t;s.style.zIndex=++z;const cv=s.firstChild;cv.style.setProperty('--dx',(Math.random()<.5?-1:1)*(1+Math.random()*1.5)+'%');cv.style.setProperty('--dy',(Math.random()<.5?-1:1)*(.5+Math.random())+'%');
  cv.style.setProperty('--ox',(30+Math.random()*40)+'%');cv.style.setProperty('--oy',(30+Math.random()*40)+'%');void s.offsetWidth;
  const go=()=>s.classList.add('kb','on');if(t==='flash'){fl.classList.remove('go');void fl.offsetWidth;fl.classList.add('go');setTimeout(go,130)}else go();
  cur=s;if(prev&&prev!==s)setTimeout(()=>{if(cur!==prev)prev.className='slide'},1500)}

 /* ------------------------------------------ tips + progress ------------------------------------------ */
 const TIPS=['A Martian day, called a Sol, lasts 24 hours and 39 minutes.','Press E near the airlock to enter or leave the base.','Night on Mars is deadly cold. Be inside the base before nightfall.','Melt ice in the crucible to make drinking water.','Break rocks with the hammer to gather minerals.','Phobos circles Mars three times a day, faster than Mars turns.','At night, press M for NASA facts about Phobos and Deimos.','Press P at any time to open the pause menu.'];
 let ti=Math.floor(Math.random()*TIPS.length);const tipEl=ld.querySelector('#ld-tip');
 function tip(){tipEl.style.opacity=0;setTimeout(()=>{tipEl.innerHTML='<em>TIP</em>'+TIPS[ti++%TIPS.length];tipEl.style.opacity=1},450)}
 const bar=ld.querySelector('#ld-bar'),pct=ld.querySelector('#ld-p'),lab=ld.querySelector('#ld-t');
 const T0=performance.now();let booted=false,done=false,shown=0,p=0;
 makeNext();setTimeout(()=>show(true),350);tip();
 [450,900,1350,1800].forEach(ms=>setTimeout(makeNext,ms));
 const slideTimer=setInterval(()=>show(false),HOLD*1000+380);const tipTimer=setInterval(tip,3600);
 function finish(){if(done)return;done=true;clearInterval(slideTimer);clearInterval(tipTimer);clearInterval(tick);lab.textContent='READY';window.SolMusic&&SolMusic.mode('menu');
  setTimeout(()=>{window.__menuShow=performance.now();ld.classList.add('out');setTimeout(()=>ld.remove(),1400)},650)}
 const tick=setInterval(()=>{const t=(performance.now()-T0)/1000;
  if(!booted&&t>2.8){booted=true;try{window.__menuBoot&&window.__menuBoot()}catch(e){console.error(e);window.__menuReady=true}}   /* menu scene + game load in the background */
  const ready=!!(window.__gameReady&&window.__menuReady);
  let target=Math.min(.96,t/MIN_S*.96);if(ready&&t>=MIN_S)target=1;p=Math.max(p,target);
  bar.style.transform='scaleX('+p+')';pct.textContent=Math.round(p*100)+'%';if(p>=1)finish()},100);
})();
