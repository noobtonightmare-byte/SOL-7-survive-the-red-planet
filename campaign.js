/* =====================================================================================================
   campaign.js  -  7-SOL CAMPAIGN for the Mars Research Base  (new module, additive)
   -----------------------------------------------------------------------------------------------------
   * Day / night   : 1 Sol = 5 min real time of daylight (Sol 4 = 4 min). Night follows at once. Outside at night the core
                      temperature drops fast and kills you; stay INSIDE the base for 25 s at night to reach dawn.
   * Campaign     : unique events, pop-ups and objectives for Sol 1 ... Sol 7(table SOLS below). Objectives are
                      station tasks: walk to a glowing marker, press [E] (need items / tools, short channel, reward).
   * Storage chest: inside the STORAGE spoke. [E] opens it:  UP/DOWN select  LEFT/RIGHT switch side
                      ENTER move stack  1 move one  ESC/E close.
   * Warnings     : on-screen banner + soft audio cue when OXYGEN / WATER / FOOD / BASE POWER fall below 25%.
   The clock starts when the player first walks into the finished base (Sol 1 salvage runs before that, unchanged).
   Hooks: mars.js  -> new Campaign(this), camp.update(dt) after base.update, camp.reset(), patchCampaignItems(ITEMS)
          base.js  -> camp.interact() at the top of interact(), movement freeze while camp.freeze
          basescreens.js -> Sim honours sim.ext {sol,tod,L}
   ===================================================================================================== */
import * as THREE from 'three';
import {D,spoke} from './basebuild.js';
import {stdMat} from './tasks.js';

const $=id=>document.getElementById(id),clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const sst=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
export const SOL_S=300,SLEEP_S=25,LAST=7,COLD=.35,T_NORMAL=37,T_DEATH=28.5,R_INT=3.2,R_EXT=3.8;
const UNSTACK=['bucket','hammer','torch','crafting_table','crucible'];

/* ---------------------------------------------- items & names ---------------------------------------------- */
const NEW={wpanel:['SOLAR PANEL PART',0x3b6fd6,'Replacement photovoltaic part \u00b7 installs on a damaged array panel'],washer:['PANEL WASHER',0x37c8d2,'Water-jet washer tool \u00b7 needed (not used up) to clean dusty panels'],
 seal:['SEAL PATCH',0xd0d0d8,'Hull seal patch / valve gasket \u00b7 weld or fit it over a leak'],wire:['WIRE SPOOL',0xe0742a,'Spooled copper wiring salvaged from debris'],filt:['FILTER CARTRIDGE',0x8fd08f,'Sintered mineral filter cartridge'],
 kit:['MODULE KIT',0xb08ad8,'Assembled electronics module (drone camera / electrolysis cell)'],soil:['SOIL TREATMENT',0x7a4a2a,'Mineral-enriched soil conditioner for the greenhouse'],sensor:['SEISMIC SENSOR',0xe8d34a,'Compact seismometer'],coolant:['COOLANT',0x5ac8ff,'Thermal-loop coolant canister']};
const NAME={regolith:'REGOLITH',ice:'WATER ICE',mineral:'MINERALS',scrap:'SCRAP ALLOY',brick:'REGOLITH BRICK',nitrate:'NITRATE SOIL',rare:'RARE MINERALS',seeds:'POTATO SEEDS',potato:'POTATOES',o2can:'O\u2082 CANISTER',spudration:'POTATO RATION',torch:'WELDING TORCH',biofuel:'BIOMASS FUEL',hammer:'HAMMER',bucket:'WATER BUCKET'};
for(const k in NEW)NAME[k]=NEW[k][0];
const nm=id=>NAME[id]||String(id).toUpperCase();
const fmtM=o=>Object.entries(o).map(([k,n])=>n+'\u00d7 '+nm(k)).join(', ');
const mkm=(geo,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);return o};
function model(col){const g=new THREE.Group(),m=stdMat(col,{roughness:.45,metalness:.5,emissive:col,emissiveIntensity:.15}),d=stdMat(0x23282f,{metalness:.6,roughness:.5});
 g.add(mkm(new THREE.BoxGeometry(.2,.07,.14),m,0,.04,0),mkm(new THREE.BoxGeometry(.06,.075,.145),d,.05,.04,0),mkm(new THREE.CylinderGeometry(.025,.025,.09,10),d,-.05,.1,0));return g}
export function patchCampaignItems(I){const hold={x:.28,y:-.26,z:-.68,rx:.3};
 for(const id in NEW){const[n,c,info]=NEW[id];I[id]={name:n,unit:'',info,build:()=>model(c),size:.3,ref:.4,cy:.05,icon:{rx:.5,ry:.6},hold}}}

/* ---------------------------------------------- locations ---------------------------------------------- */
/* exterior spots are in BASE-LOCAL metres (base centre = 0,0; airlock exit towards -z), all >= 40 m from the hab */
const LOCE={p1:[-52,-50],p2:[-46,-50],p3:[-40,-50],p4:[-34,-50],ice:[34,-44],reg:[8,-56],scrap:[-12,-62],tanks:[-62,-46],vein:[56,-7],dish:[48,-52],rover:[-60,-24],drone:[22,-66],w1:[7,-26],w2:[-7,-26]};
/* interior spots: [spoke id, region index (1 = module, 0 = corridor), position 0..1 along it, side -1/0/1] */
const LOCI={bench:['sto',1,.22,-1],chest:['sto',1,.82,1],filt:['sto',1,.55,-1],junc:['pow',1,.5,1],ctrl:['pow',1,.8,-1],o2:['pow',1,.2,-1],life:['liv',1,.5,1],comm:['liv',1,.15,-1],bed:['gre',1,.97,0],leak:['liv',0,.55,1]};
const LABEL={p1:'SOLAR PANEL 1',p2:'SOLAR PANEL 2',p3:'SOLAR PANEL 3',p4:'SOLAR PANEL 4',ice:'ICE FIELD',reg:'REGOLITH PIT',scrap:'SCRAP FIELD',tanks:'O\u2082 TANK FARM',vein:'CANYON EDGE \u00b7 MINERAL VEIN',dish:'COMM DISH',rover:'ROVER-1',drone:'DRONE PAD',w1:'HAB RIB A',w2:'HAB RIB B',
 bench:'FABRICATOR',chest:'STORAGE CHEST',life:'LIFE SUPPORT',ctrl:'POWER CONSOLE',o2:'O\u2082 SYSTEM',junc:'JUNCTION BOX',filt:'WATER FILTER',leak:'CORRIDOR SEAL',comm:'COMMS CONSOLE',bed:'GREENHOUSE BED'};
const NODES={ice:{give:{ice:3},cd:25},reg:{give:{regolith:4},cd:25},scrap:{give:{scrap:3,mineral:1},cd:25},tanks:{give:{o2can:1},cd:7},vein:{give:{rare:1},cd:45,tool:{hammer:1},st:'vein'}};

/* ---------------------------------------------- the 7 Sols ---------------------------------------------- */
const T=(n,loc,o={})=>Object.assign({k:'go',n,loc,t:4,from:0},o);                 // station task
const H=(n,need,o={})=>Object.assign({k:'have',n,need,from:0},o);                   // gather: done when you carry the items
const SH=(n,secs,o={})=>Object.assign({k:'shelter',n,secs,from:0,par:true},o);     // stay inside the base (runs in parallel)
const ST=(n,stat,o={})=>Object.assign({k:'stat',n,stat,from:0},o);                  // keep vitals / battery above a level
const FL=(at,dur,t,x)=>({at,flare:dur,pop:[t,x]});
const SOLS=[
/*1*/{title:'ARRIVAL & SALVAGE',pop:'Salvage complete. Settle into the hab, run a life-support check and fetch water ice before nightfall.',tasks:[SH('Settle inside the base',15),T('Run a life-support check','life',{t:3}),H('Collect 2 water ice (ICE FIELD)',{ice:2})]},
/*2*/{title:'DUST STORM DAMAGE',pop:'Night dust storm damaged the solar panels!',st:{solarBroken:true,dust:1},tasks:[T('Locate the smoking panel (PANEL 3)','p3',{t:3}),H('Gather 6 scrap, 2 minerals, 5 water ice',{scrap:6,mineral:2,ice:5}),
  T('Craft a replacement panel part','bench',{need:{scrap:4,mineral:2},give:{wpanel:1},t:5}),T('Install the panel part','p3',{need:{wpanel:1},t:6,fx:'panel'}),T('Craft a panel washer','bench',{need:{scrap:2,ice:1},give:{washer:1},t:4}),
  T('Wash dusty panel 1/4','p1',{tool:{washer:1},need:{ice:1},t:3,fx:'clean'}),T('Wash dusty panel 2/4','p2',{tool:{washer:1},need:{ice:1},t:3,fx:'clean'}),T('Wash dusty panel 3/4','p3',{tool:{washer:1},need:{ice:1},t:3,fx:'clean'}),T('Wash dusty panel 4/4','p4',{tool:{washer:1},need:{ice:1},t:3,fx:'clean'})]},
/*3*/{title:'STORM PRE-WARNING',pop:'Severe global dust storm approaching tomorrow. Stockpile supplies!',tasks:[T('Harvest emergency greenhouse stock','bed',{give:{potato:8},t:5}),T('Pack potato rations','bench',{need:{potato:4},give:{spudration:2},t:5}),H('Collect 3 O\u2082 canisters (TANK FARM)',{o2can:3}),ST('Top up O\u2082, water & food to 90%',{o2:90,wat:90,food:90})]},
/*4*/{title:'ISOLATION STORM',day:240,storm:[0,240,1],pop:'The global storm blocks the sun all day (4-minute day). Stay sheltered and monitor life support.',tasks:[SH('Stay sheltered inside (120 s)',120),T('Monitor life support','life',{from:15,t:6}),T('Check the power grid','ctrl',{from:70,t:6}),T('Check the O\u2082 reserve','o2',{from:130,t:6})]},
/*5*/{title:'PRESSURE LEAK',pop:'Micrometeorite puncture in the corridor! Cabin pressure is falling.',st:{leak:true},tasks:[H('Gather 5 scrap, 1 mineral, 1 regolith',{scrap:5,mineral:1,regolith:1}),T('Craft a welding torch','bench',{need:{scrap:2,regolith:1},give:{torch:1},skip:'torch',t:4}),T('Craft a seal patch','bench',{need:{scrap:3,mineral:1},give:{seal:1},t:5}),T('Weld the seal patch over the puncture','leak',{tool:{torch:1},need:{seal:1},t:8,fx:'seal'})]},
/*6*/{title:'CROP BLIGHT',pop:'Greenhouse alert: potato crops show signs of nutrient deficiency!',st:{blight:true},tasks:[H('Gather 4 regolith (REGOLITH PIT)',{regolith:4}),T('Harvest the affected crop','bed',{give:{potato:6},t:5}),T('Mix a mineral soil treatment','bench',{need:{regolith:4},give:{soil:1},t:5}),T('Treat the greenhouse soil','bed',{need:{soil:1},t:7,fx:'blight'})]},
/*7*/{title:'BATTERY OVERLOAD',pop:'Battery bank overload \u2014 central dome power grid failing!',st:{overload:true},tasks:[H('Salvage 4 scrap alloy',{scrap:4}),T('Spool salvaged wires','bench',{need:{scrap:4},give:{wire:2},t:5}),T('Rewire the junction box','junc',{need:{wire:2},t:8,fx:'rewire'})]},
/*8*/{title:'SEISMIC TREMOR',pop:'Mars-quake! Rocks shifted at the canyon edge and exposed a high-tier mineral vein.',st:{vein:true},tasks:[T('Survey the exposed vein (CANYON EDGE)','vein',{tool:{hammer:1},give:{rare:2},t:7}),H('Gather 2 scrap alloy',{scrap:2}),T('Craft a seismic sensor','bench',{need:{rare:1,scrap:2},give:{sensor:1},t:5}),T('Deploy the sensor at the dish mast','dish',{need:{sensor:1},t:5})]},
/*9*/{title:'FILTER CLOG',pop:'Ice-melting system clogged with sediment! Clean and replace the filter.',st:{clog:true},tasks:[T('Clear the sediment intake','filt',{t:5}),H('Gather 3 minerals + 2 regolith',{mineral:3,regolith:2}),T('Craft a filter cartridge','bench',{need:{mineral:3,regolith:2},give:{filt:1},t:5}),T('Install the new filter','filt',{need:{filt:1},t:6,fx:'filter'})]},
/*10*/{title:'COMMS ALIGNMENT',pop:'Orbiter pass overhead \u2014 manually align the exterior dish to receive supply coordinates.',tasks:[T('Align dish azimuth','dish',{t:8}),T('Align dish elevation','dish',{t:8}),T('Decode the supply coordinates','comm',{t:6,give:{nitrate:2,seeds:6}})]},
/*11*/{title:'ROVER BATTERY',pop:'ROVER-1 battery cells are degrading. Recondition the cell bus before it fails.',st:{rover:true},tasks:[H('Gather 3 scrap alloy',{scrap:3}),T('Spool new cell wiring','bench',{need:{scrap:3},give:{wire:2},t:5}),T('Replace the rover cell bus','rover',{need:{wire:2},t:8,fx:'rover'})]},
/*12*/{title:'DRONE SCOUTING',pop:'Survey drone ready. Calibrate it and launch an automated scouting run.',tasks:[H('Gather 3 scrap + 2 minerals',{scrap:3,mineral:2}),T('Assemble the drone camera kit','bench',{need:{scrap:3,mineral:2},give:{kit:1},t:6}),T('Mount the kit & launch the drone','drone',{need:{kit:1},t:7}),T('Review the scouting data','comm',{t:6,give:{rare:1,mineral:2}})]},
/*13*/{title:'O\u2082 TANK PRESSURE',pop:'Oxygen tank pressure drift detected. Inspect the gauge and replace the valve gasket.',st:{o2drift:true},tasks:[T('Read the tank pressure gauge','o2',{t:5}),H('Gather 2 scrap + 1 regolith',{scrap:2,regolith:1}),T('Craft a valve gasket','bench',{need:{scrap:2,regolith:1},give:{seal:1},t:5}),T('Replace the valve gasket','o2',{need:{seal:1},t:7,fx:'o2'})]},
/*14*/{title:'SOLAR FLARE',pop:'Heliophysics warning: a radiation flare is expected soon. Prepare the bunker.',ev:[FL(55,75,'SOLAR FLARE ALERT','Radiation spike inbound \u2014 get INSIDE the base now!')],tasks:[T('Seal the radiation shutters','life',{t:5}),H('Collect 1 O\u2082 canister',{o2can:1}),SH('Shelter inside through the flare (70 s)',70,{from:55})]},
/*15*/{title:'HYDROPONIC YIELD',pop:'Optimise the hydroponic trays: dose a custom nutrient mix for a bigger harvest.',tasks:[H('Gather 2 regolith + 2 water ice',{regolith:2,ice:2}),T('Blend the nutrient mix','bench',{need:{regolith:2,ice:2},give:{soil:1},t:5}),T('Dose the hydroponic trays','bed',{need:{soil:1},give:{potato:10},t:7})]},
/*16*/{title:'THERMAL EXPANSION',pop:'Thermal cycling has cracked the hab ribs. Reinforce the outer structure.',tasks:[H('Gather 6 regolith + 2 scrap',{regolith:6,scrap:2}),T('Sinter regolith braces','bench',{need:{regolith:6,scrap:2},give:{brick:2},t:7}),T('Reinforce rib A','w1',{need:{brick:1},t:6}),T('Reinforce rib B','w2',{need:{brick:1},t:6})]},
/*17*/{title:'AIR SCRUBBER SWAP',pop:'CO\u2082 scrubber bank B is saturated. Fabricate and swap a cartridge.',st:{co2:true},tasks:[H('Gather 3 minerals + 2 regolith',{mineral:3,regolith:2}),T('Craft a scrubber cartridge','bench',{need:{mineral:3,regolith:2},give:{filt:1},t:5}),T('Swap the scrubber cartridge','o2',{need:{filt:1},t:7,fx:'co2'})]},
/*18*/{title:'WATER RECYCLER',pop:'Water recycler efficiency has dropped. Flush and descale the heat exchanger.',st:{clog:true},tasks:[H('Collect 4 water ice',{ice:4}),T('Flush the line','filt',{need:{ice:2},t:6}),T('Descale the exchanger','filt',{need:{ice:2},t:6,fx:'filter'})]},
/*19*/{title:'SECOND STORM',storm:[0,160,.85],pop:'A second dust storm sweeps in. Shed non-essential loads and balance the battery banks.',tasks:[T('Shed non-essential loads','ctrl',{t:6}),T('Balance the battery banks','junc',{t:7}),ST('Keep the battery above 40%',{bat:40}),SH('Stay inside until the storm clears (100 s)',100)]},
/*20*/{title:'COMMS OUTAGE',pop:'Link to Earth lost. Realign the dish and reset the transceiver.',tasks:[T('Realign the dish','dish',{t:8}),T('Reset the transceiver','comm',{t:6}),T('Re-verify the downlink','dish',{t:6})]},
/*21*/{title:'BIOMASS POWER',pop:'Convert spare potatoes into biomass fuel to feed the generators.',tasks:[T('Harvest greenhouse surplus','bed',{give:{potato:6},t:5}),H('Gather 2 regolith',{regolith:2}),T('Press biomass pellets','bench',{need:{potato:3,regolith:2},give:{biofuel:2},t:6}),T('Feed the generator','ctrl',{need:{biofuel:2},t:7,fx:'power'})]},
/*22*/{title:'FLARE II',pop:'A stronger flare is forecast. Top up your reserves, then bunker down.',ev:[FL(60,90,'SOLAR FLARE ALERT','A strong radiation flare is arriving \u2014 shelter INSIDE immediately!')],tasks:[ST('Top up O\u2082, water & food to 80%',{o2:80,wat:80,food:80}),T('Seal the radiation shutters','life',{t:5}),SH('Shelter inside through the flare (90 s)',90,{from:60}),T('Post-flare O\u2082 tank check','o2',{from:150,t:6})]},
/*23*/{title:'LONG TRAVERSE',pop:'Rover traverse to the canyon edge for deep-core samples.',tasks:[T('Charge ROVER-1','rover',{t:6}),T('Collect deep samples','vein',{tool:{hammer:1},give:{rare:2,mineral:3},t:8}),T('Analyse the samples','comm',{t:6})]},
/*24*/{title:'AFTERSHOCK',pop:'An aftershock flexed the corridor seals. Inspect the mounts and re-seal the joint.',st:{leak:true},tasks:[T('Inspect the ceiling mounts','junc',{t:5}),H('Gather 3 scrap + 1 mineral',{scrap:3,mineral:1}),T('Craft a seal patch','bench',{need:{scrap:3,mineral:1},give:{seal:1},t:5}),T('Re-seal the corridor joint','leak',{need:{seal:1},t:7,fx:'seal'})]},
/*25*/{title:'COLD-SNAP PREP',pop:'A deep cold snap is forecast. Insulate the hab with sintered regolith bricks.',tasks:[H('Gather 6 regolith + 2 scrap',{regolith:6,scrap:2}),T('Sinter insulation bricks','bench',{need:{regolith:6,scrap:2},give:{brick:2},t:7}),T('Insulate the north wall','w1',{need:{brick:1},t:6}),T('Insulate the south wall','w2',{need:{brick:1},t:6})]},
/*26*/{title:'DEEP ICE DRILL',pop:'The thermal loop is low on coolant. Drill deep ice and refill the loop.',tasks:[T('Drill deep ice','ice',{t:10,give:{ice:6}}),T('Mix coolant','bench',{need:{ice:4},give:{coolant:1},t:5}),T('Refill the thermal loop','ctrl',{need:{coolant:1},t:7})]},
/*27*/{title:'MOXIE OUTPUT',pop:'MOXIE oxygen output is down. Fabricate and install a new electrolysis cell.',st:{o2drift:true},tasks:[H('Gather 1 rare mineral + 4 scrap',{rare:1,scrap:4}),T('Fabricate an electrolysis cell','bench',{need:{rare:1,scrap:4},give:{kit:1},t:7}),T('Install the MOXIE cell','o2',{need:{kit:1},t:8,fx:'o2'})]},
/*28*/{title:'FLARE III + STORM',storm:[0,200,.8],pop:'Dust storm AND a radiation flare. Keep reserves high and hunker down.',ev:[FL(50,60,'SOLAR FLARE ALERT','Flare during the storm \u2014 stay inside the bunker!')],tasks:[ST('Keep O\u2082, water & food above 60%',{o2:60,wat:60,food:60}),SH('Shelter inside through the flare (60 s)',60,{from:50}),T('Verify the radiation shutters','life',{from:115,t:5})]},
/*29*/{title:'FINAL PREPARATIONS',pop:'The supply ship window opens tomorrow. Bring every reserve to full and report to Earth.',tasks:[ST('Reserves above 90%, battery above 60%',{o2:90,wat:90,food:90,bat:60}),T('Report status to Earth','dish',{t:8})]},
/*7*/{title:'MISSION DAY',final:true,pop:'Final Sol. Upload the mission data and verify all systems to complete the campaign.',tasks:[T('Upload the mission data','dish',{t:10}),T('Final systems verification','ctrl',{t:8}),T('Inspect life support','life',{t:6}),SH('Secure the hab (stay inside 20 s)',20)]}];

const FX={panel:s=>s.solarBroken=false,clean:s=>s.dust=Math.max(0,s.dust-.25),seal:s=>s.leak=false,blight:s=>s.blight=false,rewire:s=>s.overload=false,filter:s=>s.clog=false,rover:s=>s.rover=false,o2:s=>{s.o2drift=false},co2:s=>s.co2=false};

/* ---------------------------------------------- css / dom ---------------------------------------------- */
const CSS=`
#cp-hud{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:7;padding:7px 20px;font:700 14px Consolas,monospace;letter-spacing:3px;color:#f4e8e0;background:rgba(6,10,18,.66);border-bottom:3px solid #ffb347;border-radius:4px;opacity:0;transition:opacity .6s;pointer-events:none;white-space:nowrap;text-align:center}
#cp-hud.on{opacity:1}#cp-hud small{display:block;font-size:11px;letter-spacing:3px;opacity:.85;margin-top:2px}#cp-hud.night{border-bottom-color:#5de6ff}#cp-hud.cold{border-bottom-color:#ff5a4a;animation:cpB .7s steps(2) infinite}
@keyframes cpB{50%{opacity:.5}}
#cp-obj{position:fixed;right:28px;top:124px;width:330px;z-index:7;padding:11px 15px;font:600 12px Consolas,monospace;letter-spacing:1px;color:#e8f4f8;background:rgba(6,10,18,.66);border-right:4px solid #7dff9a;border-radius:4px;opacity:0;transition:opacity .6s;pointer-events:none}
#cp-obj.on{opacity:1}#cp-obj h3{margin:0 0 7px;font-size:13px;letter-spacing:3px;color:#ffb347}#cp-obj div{margin:3px 0;opacity:.55}#cp-obj .a{opacity:1;color:#7dff9a}#cp-obj .d{opacity:.45;text-decoration:line-through;color:#8fa}
#cp-obj .g{margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,.18);opacity:1;color:#5de6ff}#cp-ar{display:inline-block;transition:transform .15s}
#cp-pop{position:fixed;left:50%;top:26%;transform:translate(-50%,-10px);width:min(720px,80vw);z-index:40;padding:18px 7px;text-align:center;background:rgba(6,10,18,.84);border:2px solid #ffb347;border-radius:6px;opacity:0;transition:opacity .5s,transform .5s;pointer-events:none;color:#f2f5fa;font:600 17px "Segoe UI",Arial,sans-serif;line-height:1.5}
#cp-pop.on{opacity:1;transform:translate(-50%,0)}#cp-pop b{display:block;font:800 13px Consolas,monospace;letter-spacing:6px;color:#ffb347;margin-bottom:6px}
#cp-warn{position:fixed;left:50%;top:128px;transform:translateX(-50%);z-index:41;padding:9px 26px;font:800 16px Consolas,monospace;letter-spacing:4px;color:#ffb0a0;background:rgba(90,10,6,.88);border:2px solid #ff5a4a;border-radius:4px;opacity:0;transition:opacity .4s;pointer-events:none;white-space:nowrap}
#cp-warn.on{opacity:1;animation:cpB .8s steps(2) infinite}
#cp-bar{position:fixed;left:50%;bottom:36%;transform:translateX(-50%);width:360px;z-index:31;padding:8px 14px;font:700 13px Consolas,monospace;letter-spacing:2px;color:#fff;text-align:center;background:rgba(6,10,18,.78);border:1px solid #7dff9a;border-radius:4px;opacity:0;transition:opacity .2s;pointer-events:none}
#cp-bar.on{opacity:1}#cp-bar i{display:block;height:8px;margin-top:6px;background:rgba(255,255,255,.14)}#cp-bar u{display:block;height:100%;width:0;background:#7dff9a}
#cp-frost{position:fixed;inset:0;z-index:28;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(150,210,255,0) 35%,rgba(170,220,255,.75) 100%)}
#cp-chest{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,90vw);z-index:46;padding:18px 24px;background:rgba(6,10,18,.92);border:2px solid #5de6ff;border-radius:6px;font:600 14px Consolas,monospace;letter-spacing:1px;color:#e8f4f8;opacity:0;pointer-events:none;transition:opacity .2s}
#cp-chest.on{opacity:1}#cp-chest h2{margin:0 0 10px;font-size:15px;letter-spacing:5px;color:#5de6ff}#cp-chest .cols{display:flex;gap:18px}#cp-chest .col{flex:1;min-height:210px;padding:8px;border:1px solid rgba(255,255,255,.2);border-radius:4px}
#cp-chest .col.sel{border-color:#ffb347}#cp-chest .col h4{margin:0 0 6px;font-size:12px;letter-spacing:3px;color:#ffb347}#cp-chest .it{padding:3px 7px;border-radius:3px}#cp-chest .it.cur{background:rgba(255,179,71,.28);color:#fff}
#cp-chest .ft{margin-top:10px;font-size:11px;letter-spacing:2px;opacity:.7;text-align:center}
#cp-win{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.82);color:#ffe0c0;font:700 34px Consolas,monospace;letter-spacing:8px;text-align:center;opacity:0;pointer-events:none;transition:opacity 2s}
#cp-win.on{opacity:1}#cp-win small{display:block;margin-top:16px;font-size:15px;letter-spacing:4px;color:#f2f5fa;line-height:1.8}`;
const HTML=`<div id="cp-hud"></div><div id="cp-obj"></div><div id="cp-pop"></div><div id="cp-warn"></div><div id="cp-bar"></div><div id="cp-frost"></div><div id="cp-chest"></div><div id="cp-win"></div>`;

/* ---------------------------------------------- floating label / marker ---------------------------------------------- */
function lab(text,col,depth,w=512,h=96){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:depth,depthWrite:false,fog:false}));spr.renderOrder=9;
 spr.set=(t,c2)=>{if(spr.k===t+c2)return;spr.k=t+c2;x.clearRect(0,0,w,h);x.fillStyle='rgba(4,17,26,.82)';x.fillRect(0,0,w,h);x.strokeStyle=c2;x.lineWidth=4;x.strokeRect(2,2,w-4,h-4);
  x.font='700 7px Consolas,monospace';x.fillStyle=c2;x.textAlign='center';x.textBaseline='middle';x.fillText(t.slice(0,28),w/2,h/2);tex.needsUpdate=true};spr.set(text,col);return spr}

/* ---------------------------------------------- the campaign ---------------------------------------------- */
export class Campaign{
 constructor(mp){this.mp=mp;this.dom=false;this.objs=[];this.amb=null;this.init()}
 get b(){return this.mp.base}
 get s(){return this.mp.salv}
 get freeze(){return this.ui||!!(this.mp.sv&&this.mp.sv.dead)||this.won}
 init(){this.on=false;this.sol=1;this.t=0;this.el=0;this.night=false;this.nt=0;this.sl=0;this.temp=T_NORMAL;this.dayLen=SOL_S;this.tasks=[];this.def=SOLS[0];this.evs=[];this.flare=null;this.st={solarBroken:false,dust:0,leak:false,blight:false,overload:false,clog:false,rover:false,o2drift:false,co2:false,vein:false};
  this.chest=[];this.ch=null;this.cd={};this.mk={};this.ui=false;this.won=false;this.allDone=false;this.warned={};this.warnAt={};this.hz=0;this.fz=0;this.col=0;this.sd=0;this.sirT=0;this.dispT=0;this.cur=null;this.side=0;this.sel=0;this.popT=0;this.warnT=0;this.smoke=null;this.coldT=0}
 /* ------------------------------ lifecycle ------------------------------ */
 reset(){for(const o of this.objs)if(o.parent)o.parent.remove(o);this.objs=[];if(this.amb&&this.amb.parent)this.amb.parent.remove(this.amb);this.amb=null;
  const mp=this.mp;if(mp.sun)mp.sun.intensity=3.4;if(mp.r)mp.r.toneMappingExposure=1;if(this.b&&this.b.sim)this.b.sim.ext=null;
  for(const id of['cp-hud','cp-obj','cp-pop','cp-warn','cp-bar','cp-chest','cp-win'])$(id)&&$(id).classList.remove('on','night','cold');if($('cp-frost'))$('cp-frost').style.opacity=0;this.init()}
 dom0(){if(this.dom)return;this.dom=true;const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);document.body.insertAdjacentHTML('beforeend',HTML);
  addEventListener('keydown',e=>this.key(e),true)}
 begin(){this.on=true;this.dom0();this.build();this.amb=new THREE.AmbientLight(0x7f9cff,0);this.mp.near.add(this.amb);$('cp-hud').classList.add('on');$('cp-obj').classList.add('on');this.startSol(1)}
 /* ------------------------------ locations / stations ------------------------------ */
 pos(loc){if(LOCE[loc]){const p=LOCE[loc];return{x:p[0],z:p[1],e:true}}const[id,ri,u,sd]=LOCI[loc],sp=spoke(id),r=sp.regions[ri],s=lerp(r.s0,r.s1,u),t=sd*(r.hw-(ri?.9:.35));
  return{x:sp.dx*s+sp.nx*t,z:sp.dz*s+sp.nz*t,e:false,sp,s,t}}
 build(){const b=this.b,S=b.S,mk=(loc,col,txt)=>this.marker(loc,col,txt);
  /* permanent props: storage chest + fabricator, both solid */
  for(const[loc,kind]of[['chest','chest'],['bench','bench']]){const q=this.pos(loc),g=new THREE.Group(),m=stdMat(kind==='chest'?0x56606b:0x3b4654,{metalness:.6,roughness:.45}),a=stdMat(kind==='chest'?0x5de6ff:0xffb347,{emissive:kind==='chest'?0x5de6ff:0xffb347,emissiveIntensity:.8,roughness:.4});
   if(kind==='chest'){g.add(mkm(new THREE.BoxGeometry(.85,.55,.85),m,0,.28,0),mkm(new THREE.BoxGeometry(.9,.12,.9),m,0,.6,0),mkm(new THREE.BoxGeometry(.16,.1,.05),a,0,.5,.44))}
   else{g.add(mkm(new THREE.BoxGeometry(.9,.9,.9),m,0,.45,0),mkm(new THREE.BoxGeometry(.7,.05,.7),a,0,.93,0),mkm(new THREE.BoxGeometry(.3,.3,.3),m,0,1.1,0))}
   g.position.set(q.x,D.F,q.z);S.int.add(g);this.objs.push(g);q.sp.obs.push([q.s-.6,q.s+.6,q.t-.6,q.t+.6])}
  mk('chest','#5de6ff','STORAGE CHEST');mk('bench','#ffb347','FABRICATOR');mk('life','#5de6ff','LIFE SUPPORT');
  for(const k in NODES)mk(k,'#ffb347',LABEL[k]);
  /* smoking panel */
  const p=this.pos('p3'),g=new THREE.Group();g.position.set(p.x,b.groundY(p.x,p.z)+1.2,p.z);this.smoke=[];const sm=new THREE.MeshBasicMaterial({color:0x555555,transparent:true,opacity:.5,depthWrite:false});
  for(let i=0;i<7;i++){const m=mkm(new THREE.SphereGeometry(.35,8,6),sm);g.add(m);this.smoke.push(m)}S.ext.add(g);this.smokeG=g;this.objs.push(g)}
 marker(key,col,txt,loc=key){const e=!!LOCE[loc],q=this.pos(loc),b=this.b,g=new THREE.Group(),y=e?b.groundY(q.x,q.z):D.F,h=e?8:2.3,c=new THREE.Color(col);g.position.set(q.x,y,q.z);
  const beam=mkm(new THREE.CylinderGeometry(e?.45:.22,e?.45:.22,h,12,1,true),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.2,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}),0,h/2,0);
  const ring=mkm(new THREE.TorusGeometry(e?1.1:.55,.06,6,32),new THREE.MeshBasicMaterial({color:c,fog:false}),0,.06,0);ring.rotation.x=Math.PI/2;
  const spr=lab(txt,col,!e);spr.position.set(0,h+.5,0);spr.scale.set(e?7:1.7,e?1.31:.32,1);g.add(beam,ring,spr);(e?b.S.ext:b.S.int).add(g);this.objs.push(g);
  const m={g,beam,spr,e,loc};this.mk[key]=m;return m}
 /* every interactive station right now */
 stations(){const a=[],act=this.active();for(const q of act)if(q.loc)a.push({kind:'task',loc:q.loc,q});
  a.push({kind:'chest',loc:'chest'},{kind:'bench',loc:'bench'},{kind:'life',loc:'life'});for(const k in NODES)if(!NODES[k].st||this.st[NODES[k].st])a.push({kind:'node',loc:k,node:NODES[k]});return a}
 near(){const b=this.b,P=b.p,inside=b.mode==='inside',out=b.mode==='outside';if(!inside&&!out)return null;let best=null,bd=1e9;
  for(const s of this.stations()){const q=this.pos(s.loc);if(q.e!==out)continue;const d=Math.hypot(P.x-q.x,P.z-q.z);if(d>(q.e?R_EXT:R_INT))continue;const sc=d-(s.kind==='task'?100:0);if(sc<bd){bd=sc;best=s}}return best}
 /* ------------------------------ inventory helpers ------------------------------ */
 stacks(id){const S=this.s,o=[];for(const A of[S.inv,S.bag])for(const it of A)if(it&&it.id===id)o.push(it);return o}
 count(id){return this.stacks(id).reduce((a,it)=>a+(it.n||1),0)}
 take(id,n){const S=this.s;if(this.count(id)<n)return false;for(const A of[S.inv,S.bag])for(let i=0;i<A.length&&n>0;i++){const it=A[i];if(it&&it.id===id){const u=Math.min(n,it.n||1);it.n=(it.n||1)-u;n-=u;if(it.n<=0)A[i]=null}}S.tk.after();return true}
 miss(o){const m=[];for(const k in o)if(this.count(k)<o[k])m.push(o[k]+'\u00d7 '+nm(k));return m.join(', ')}
 grant(map){for(const id in map){if(!this.s.tk.give(id,map[id])){this.chestAdd(id,map[id]);this.toast('BACKPACK FULL  \u00b7  '+map[id]+'\u00d7 '+nm(id)+' SENT TO CHEST','#ffb347')}}}
 toast(t,c){try{this.s.tk.toast(t,c)}catch(e){}}
 tone(f,d=.15,v=.04,ty='triangle'){try{this.mp.tone&&this.mp.tone(f,d,v,ty)}catch(e){}}
 /* ------------------------------ sols ------------------------------ */
 startSol(n){const d=SOLS[n-1];this.sol=n;this.def=d;this.dayLen=d.day||SOL_S;this.t=0;this.night=false;this.nt=0;this.sl=0;this.allDone=false;this.flare=null;this.ch=null;
  if(d.st)Object.assign(this.st,d.st);this.evs=(d.ev||[]).map(e=>Object.assign({},e));this.tasks=d.tasks.map(q=>Object.assign({done:false,prog:0},q));
  this.pop('SOL '+String(n).padStart(2,'0')+' / 7  \u00b7  '+d.title,d.pop,n===2||n===5||n===7||(d.ev&&d.ev.length)?'#ff8a7a':'#ffb347',7500);this.tone(392,.25,.05);setTimeout(()=>this.tone(523,.3,.05),160);this.hz=0}
 dawn(){const b=this.b,f=this.tasks.filter(q=>!q.done);const S=this.mp.sv;
  if(f.length&&S){S.o2=Math.max(0,S.o2-7*f.length);S.wat=Math.max(0,S.wat-7*f.length);S.food=Math.max(0,S.food-7*f.length);b.sim.bat=Math.max(12,b.sim.bat-8*f.length);this.toast(f.length+' OBJECTIVE(S) FAILED  \u00b7  RESERVES DRAINED','#ff5a4a')}
  b.dip&&b.dip(1600);if(this.sol>=LAST){this.win();return}this.startSol(this.sol+1)}
 win(){this.won=true;try{document.exitPointerLock()}catch(e){}const w=$('cp-win');w.innerHTML='SOL 7 COMPLETE<br>MISSION SUCCESS<small>You survived 7 Sols on Mars.<br>The supply ship is on its way.</small>';w.classList.add('on');this.tone(523,.4,.06);setTimeout(()=>this.tone(659,.4,.06),250);setTimeout(()=>this.tone(784,.8,.06),500)}
 pop(t,x,c='#ffb347',ms=6000){const e=$('cp-pop');e.style.borderColor=c;e.innerHTML='<b style="color:'+c+'">'+t+'</b>'+x;e.classList.add('on');clearTimeout(this.popT);this.popT=setTimeout(()=>e.classList.remove('on'),ms)}
 /* ------------------------------ tasks ------------------------------ */
 active(){if(this.night||this.won)return[];const a=[];let seq=false;for(const q of this.tasks){if(q.done)continue;if(q.par){if(q.from<=this.t)a.push(q);continue}if(!seq){seq=true;if(q.from<=this.t)a.push(q)}}return a}
 stat(k){const S=this.mp.sv;return k==='bat'?this.b.sim.bat:S?S[k]:0}
 auto(dt){for(const q of this.active()){let ok=false;
   if(q.k==='have')ok=Object.keys(q.need).every(k=>this.count(k)>=q.need[k]);
   else if(q.k==='stat')ok=Object.keys(q.stat).every(k=>this.stat(k)>=q.stat[k]);
   else if(q.k==='shelter'){if(this.sheltered())q.prog+=dt;ok=q.prog>=q.secs}
   else if(q.k==='go'&&q.skip&&this.count(q.skip)>=1)ok=true;
   if(ok)this.complete(q,false)}}
 complete(q,fx){q.done=true;if(fx){if(q.need)for(const k in q.need)this.take(k,q.need[k]);if(q.give)this.grant(q.give);if(q.fx&&FX[q.fx])FX[q.fx](this.st);if(q.fx==='power')this.b.sim.bat=Math.min(100,this.b.sim.bat+25)}
  this.toast('\u2714 '+q.n.toUpperCase(),'#7dff9a');this.tone(660,.18,.05);this.hz=0;
  if(this.tasks.every(x=>x.done)&&!this.allDone){this.allDone=true;if(this.def.final)this.win();else{this.pop('SOL '+this.sol+' OBJECTIVES COMPLETE','Good work. Rest is earned: when night falls, stay inside the base for 25 s to reach dawn.','#7dff9a',5500);this.tone(784,.5,.05)}}}
 /* ------------------------------ interaction ------------------------------ */
 interact(){if(!this.on||this.won||this.freeze)return this.ui;const s=this.near();if(!s)return false;
  if(this.ch)return true;
  if(s.kind==='chest'){this.openChest();return true}
  if(s.kind==='bench'){this.toast('FABRICATOR  \u00b7  USE IT WHEN AN OBJECTIVE ASKS TO CRAFT','#ffb347');return true}
  if(s.kind==='life'&&!s.q){if(this.el<this.dispT){this.toast('DISPENSER RECHARGING  \u00b7  '+Math.ceil(this.dispT-this.el)+' s','#ffb347');return true}
   const S=this.mp.sv;if(S){S.o2=Math.min(100,S.o2+50);S.wat=Math.min(100,S.wat+50);S.food=Math.min(100,S.food+15)}this.dispT=this.el+45;this.toast('LIFE SUPPORT DISPENSER  \u00b7  +50% O\u2082  +50% WATER  +15% FOOD','#5de6ff');this.tone(740,.2,.05);return true}
  if(s.kind==='node'){const n=s.node;if(this.el<(this.cd[s.loc]||0)){this.toast('DEPOSIT DEPLETED  \u00b7  WAIT '+Math.ceil(this.cd[s.loc]-this.el)+' s','#ffb347');return true}
   if(n.tool&&this.miss(n.tool)){this.toast('NEED: '+this.miss(n.tool),'#ff5a4a');return true}this.ch={node:s,q:{n:'GATHER '+LABEL[s.loc],t:3,loc:s.loc},p:0};return true}
  if(s.kind==='task'){const q=s.q;if(q.k==='have'||q.k==='stat'||q.k==='shelter'){return true}
   const m=(q.tool?this.miss(q.tool):'')||(q.need?this.miss(q.need):'');if(m){this.toast('NEED: '+m,'#ff5a4a');return true}this.ch={q,p:0,task:true};this.tone(420,.15,.04);return true}
  return false}
 chan(dt){const c=this.ch,b=this.b;if(!c)return;const s=this.near(),same=s&&(c.task?s.q===c.q:s.loc===c.q.loc&&s.kind==='node');
  if(!same){this.ch=null;this.toast('INTERRUPTED','#ffb347');$('cp-bar').classList.remove('on');return}
  c.p+=dt/(c.q.t||4);const bar=$('cp-bar');bar.classList.add('on');bar.innerHTML=c.q.n.toUpperCase()+'<i><u style="width:'+Math.round(clamp(c.p,0,1)*100)+'%"></u></i>';
  if(c.p>=1){this.ch=null;bar.classList.remove('on');
   if(c.task)this.complete(c.q,true);else{this.grant(c.node.node.give);this.cd[c.node.loc]=this.el+c.node.node.cd;this.toast('+ '+fmtM(c.node.node.give),'#ffb347');this.tone(520,.12,.04)}}}
 /* ------------------------------ storage chest ------------------------------ */
 chestAdd(id,n,extra){if(UNSTACK.includes(id)){this.chest.push(Object.assign({id,n:1},extra));return}const f=this.chest.find(x=>x.id===id&&!UNSTACK.includes(id));if(f)f.n+=n;else this.chest.push({id,n})}
 list(side){if(side===1)return this.chest.map((it,i)=>({it,i}));const S=this.s,o=[];for(const A of[S.inv,S.bag])A.forEach((it,i)=>{if(it)o.push({it,A,i})});return o}
 itx(it){return nm(it.id)+(it.id==='bucket'?(it.w>0?'  '+it.w.toFixed(1)+' L':'  EMPTY'):it.n>1?'  \u00d7'+it.n:'')}
 openChest(){this.ui=true;this.side=0;this.sel=0;this.paintChest();$('cp-chest').classList.add('on');try{document.exitPointerLock()}catch(e){}this.tone(300,.15,.04)}
 closeChest(){this.ui=false;$('cp-chest').classList.remove('on');this.mp.mdx=this.mp.mdy=0;this.tone(240,.12,.03)}
 paintChest(){const L=[this.list(0),this.list(1)];this.sel=clamp(this.sel,0,Math.max(0,L[this.side].length-1));
  const col=i=>'<div class="col'+(this.side===i?' sel':'')+'"><h4>'+(i?'STORAGE CHEST':'BACKPACK + HOTBAR')+'</h4>'+(L[i].length?L[i].map((r,j)=>'<div class="it'+(this.side===i&&j===this.sel?' cur':'')+'">'+this.itx(r.it)+'</div>').join(''):'<div class="it" style="opacity:.4">EMPTY</div>')+'</div>';
  $('cp-chest').innerHTML='<h2>STORAGE CHEST</h2><div class="cols">'+col(0)+col(1)+'</div><div class="ft">\u2191\u2193 SELECT  \u00b7  \u2190\u2192 SWITCH SIDE  \u00b7  ENTER MOVE STACK  \u00b7  1 MOVE ONE  \u00b7  ESC / E CLOSE</div>'}
 move(all){const L=this.list(this.side),r=L[this.sel];if(!r)return;const it=r.it,un=UNSTACK.includes(it.id),q=un?1:all?it.n:1;
  if(this.side===0){if(un){r.A[r.i]=null}else{it.n-=q;if(it.n<=0)r.A[r.i]=null}this.chestAdd(it.id,q,un&&it.id==='bucket'?{w:it.w||0}:undefined);this.s.tk.after()}
  else{const ok=this.s.tk.give(it.id,q,it.id==='bucket'?{w:it.w||0}:undefined);if(!ok){this.toast('BACKPACK FULL','#ff5a4a');return}if(un)this.chest.splice(r.i,1);else{it.n-=q;if(it.n<=0)this.chest.splice(r.i,1)}}
  this.tone(480,.08,.04);this.paintChest()}
 key(e){if(!this.ui||e.type!=='keydown')return;e.preventDefault();e.stopImmediatePropagation();const c=e.code;
  if(c==='Escape'||c==='KeyE'||c==='KeyC'||c==='Tab'){this.closeChest();return}
  if(c==='ArrowUp'||c==='KeyW')this.sel--;else if(c==='ArrowDown'||c==='KeyS')this.sel++;else if(c==='ArrowLeft'||c==='KeyA'){this.side=0;this.sel=0}else if(c==='ArrowRight'||c==='KeyD'){this.side=1;this.sel=0}
  else if(c==='Enter'||c==='Space'){this.move(true);return}else if(c==='Digit1'||c==='Numpad1'){this.move(false);return}
  const n=this.list(this.side).length;this.sel=n?(this.sel+n)%n:0;this.paintChest()}
 /* ------------------------------ environment ------------------------------ */
 exposed(){const m=this.b.mode;return m==='outside'||m==='walkout'||m==='walkin'}
 sheltered(){const m=this.b.mode;return m==='inside'||m==='cycle'||m==='cycleOut'||m==='walkin2'}
 dayK(){return this.night?0:sst(0,22,this.t)*(1-sst(this.dayLen-28,this.dayLen,this.t))}
 tod(){return this.night?(.75+.5*clamp(Math.max(this.nt/150,this.sl/SLEEP_S),0,1))%1:.25+.5*clamp(this.t/this.dayLen,0,1)}
 stormL(){const s=this.def.storm;return s&&!this.night&&this.t>=s[0]&&this.t<s[1]?s[2]:0}
 kill(why){const S=this.mp.sv;if(!S||S.dead)return;S.dead=true;S.hp=0;try{document.exitPointerLock()}catch(e){}const h=document.querySelector('#m-over h1');
  if(h)h.innerHTML=why+'<br><small style="font-size:.45em;letter-spacing:4px">PRESS [R] TO RETRY</small>';$('m-over')&&$('m-over').classList.add('on');this.mp.cap&&this.mp.cap('',1)}
 vitals(dt,exp,sh){const mp=this.mp,S=mp.sv;if(!S||S.dead)return;const st=this.st,L=this.b.sim.s.L||0,k=exp?1:.32;
  S.o2=Math.max(0,S.o2-.16*k*(st.leak?3:1)*(st.o2drift?1.8:1)*(st.co2?1.4:1)*dt);S.wat=Math.max(0,S.wat-.11*k*(st.clog?1.6:1)*dt);S.food=Math.max(0,S.food-.065*k*(st.blight?1.6:1)*dt);
  let rr=sh?-.8:.04;if(exp&&L>.7)rr+=1.6;if(exp&&this.flare)rr+=2.5;S.rad=clamp(S.rad+rr*dt,0,100);
  let dmg=0;if(S.o2<=0)dmg+=2.2;if(S.wat<=0)dmg+=.6;if(S.food<=0)dmg+=.4;if(S.rad>=100)dmg+=1;
  if(dmg)S.hp=Math.max(0,S.hp-dmg*dt);else if(S.o2>7&&S.wat>20&&S.food>15&&S.rad<80)S.hp=Math.min(100,S.hp+.25*dt);
  if(mp.vit)for(const k2 of['hp','o2','rad','wat','food']){const v=mp.vit[k2],val=S[k2];if(!v)continue;v.f.style.width=val+'%';v.tr+=(val-v.tr)*Math.min(1,dt*1.8);v.t.style.width=v.tr+'%';v.v.textContent=Math.round(val)+'%';v.b.classList.toggle('low',k2==='rad'?val>70:val<25)}
  if(S.hp<=0)this.kill(S.o2<=0?'YOU RAN OUT OF OXYGEN':S.rad>=100?'RADIATION SICKNESS':S.wat<=0?'DEHYDRATION':S.food<=0?'STARVATION':'YOU DIED')}
 /* low-resource reminders (O2 / WATER / FOOD / BASE POWER below 25%) */
 reminders(){const S=this.mp.sv;if(!S||S.dead)return;const v={o2:['OXYGEN',S.o2],wat:['WATER',S.wat],food:['FOOD',S.food],pwr:['BASE POWER',this.b.sim.bat]};
  for(const k in v){const[n,x]=v[k];if(x>=32){this.warned[k]=false;continue}if(x<25&&(!this.warned[k]||this.el-(this.warnAt[k]||0)>40)){this.warned[k]=true;this.warnAt[k]=this.el;this.warn('\u26a0 '+n+' LOW  \u00b7  '+Math.round(x)+'%');
    this.tone(880,.14,.035,'sine');setTimeout(()=>this.tone(660,.2,.035,'sine'),170);break}}}
 warn(t){const w=$('cp-warn');w.textContent=t;w.classList.add('on');clearTimeout(this.warnT);this.warnT=setTimeout(()=>w.classList.remove('on'),3800)}
 /* ------------------------------ main update ------------------------------ */
 update(dt){const b=this.b,mp=this.mp;if(mp.sv&&mp.sv.dead)return;
  if(!this.on){if(b.mode==='inside'&&b.built&&b.S&&b.S.rooms&&b.S.rooms.gre)this.begin();else return}
  dt=Math.min(dt,.1);this.el+=dt;const exp=this.exposed(),sh=this.sheltered();
  if(this.won){return}
  /* clock: day -> night -> (25 s inside) -> dawn */
  if(!this.ui){if(!this.night){this.t+=dt;if(this.t>=this.dayLen){this.night=true;this.nt=0;this.sl=0;this.ch=null;this.pop('NIGHT FALLS','Surface temperature plunges below \u221280 \u00b0C. Get INSIDE the base and stay 25 s to sleep until dawn.','#5de6ff',7000);this.tone(330,.5,.05);setTimeout(()=>this.tone(247,.7,.05),300)}}
   else{this.nt+=dt;if(b.mode==='inside'){this.sl+=dt;if(this.sl>=SLEEP_S)this.dawn()}else this.sl=Math.max(0,this.sl-dt*2)}}
  /* events (flare etc.) */
  if(!this.night)for(const ev of this.evs){if(!ev.fired&&this.t>=ev.at){ev.fired=true;if(ev.pop)this.pop(ev.pop[0],ev.pop[1],'#ff5a4a',6500);if(ev.flare){this.flare={end:this.t+ev.flare};this.tone(300,.5,.07,'sawtooth')}}}
  if(this.flare){if(this.t>=this.flare.end||this.night){this.flare=null;this.pop('ALL CLEAR','Radiation levels are back to normal.','#7dff9a',3500)}else if(exp&&(this.sirT-=dt)<=0){this.sirT=2;this.tone(520,.25,.06,'sawtooth')}}
  /* thermal */
  if(this.night&&exp)this.temp-=COLD*dt;else if(sh)this.temp=Math.min(T_NORMAL,this.temp+.7*dt);else this.temp=Math.min(T_NORMAL,this.temp+.2*dt);
  if(this.temp<35&&this.night&&exp&&(this.coldT-=dt)<=0){this.coldT=2.5;this.warn('\u2744 HYPOTHERMIA  \u00b7  CORE '+this.temp.toFixed(1)+' \u00b0C  \u00b7  GET INSIDE!');this.tone(240,.3,.05,'sawtooth')}
  if(this.temp<=T_DEATH)this.kill('FROZEN TO DEATH<br><small style="font-size:.4em;letter-spacing:3px">EXPOSED TO THE MARTIAN NIGHT</small>');
  /* base systems */
  const st=this.st,sim=b.sim;sim.ext={sol:this.sol,tod:this.tod(),L:this.stormL()};
  const pen=(st.solarBroken?.07:0)+st.dust*.05+(st.overload?.12:0)+(st.rover?.02:0)+(st.clog?.02:0);if(pen)sim.bat=clamp(sim.bat-pen*dt,12,100);
  if(!this.ui)this.vitals(dt,exp,sh);
  this.auto(dt);this.chan(dt);
  this.light(dt,exp);this.visual(dt);
  this.hz-=dt;if(this.hz<=0){this.hz=.2;this.hud(exp);this.reminders()}
  this.prompt()}
 light(dt,exp){const mp=this.mp,L=this.b.sim.s.L||0,k=this.dayK(),k2=Math.min(1,dt*2.5);
  if(mp.sun)mp.sun.intensity=3.4*(.05+.95*k)*(1-.5*L);const tg=exp?lerp(.3,1,k)*(1-.28*L):1;mp.r.toneMappingExposure+=(tg-mp.r.toneMappingExposure)*k2;
  if(this.amb)this.amb.intensity+=((exp?(1-k)*.6:0)-this.amb.intensity)*k2}
 visual(dt){const b=this.b,act=this.active(),want=new Set(act.map(q=>q.loc)),out=b.mode==='outside'||b.mode==='walkout'||b.mode==='walkin'||b.mode==='cycleOut';
  for(const key in this.mk){const m=this.mk[key];let v;
   if(key.startsWith('t:'))v=want.has(m.loc);else if(NODES[key])v=out&&(!NODES[key].st||this.st[NODES[key].st]);else v=true;
   m.g.visible=v;if(v)m.beam.material.opacity=.16+.1*Math.sin(this.el*3+m.g.position.x)}
  for(const q of act)if(q.loc&&!this.mk['t:'+q.loc])this.marker('t:'+q.loc,'#7dff9a',LABEL[q.loc]||q.loc,q.loc);
  for(const key in this.mk)if(key.startsWith('t:')){const m=this.mk[key];const q=act.find(x=>x.loc===m.loc);if(q)m.spr.set(q.n,'#7dff9a')}
  if(this.smokeG){this.smokeG.visible=this.st.solarBroken&&b.mode==='outside';this.smoke.forEach((m,i)=>{const u=((this.el*.4+i/7)%1);m.position.set(Math.sin(i*2)*.3*u,u*3.5,Math.cos(i*2)*.3*u);m.scale.setScalar(.4+u*1.3);m.material.opacity=.5*(1-u)})}
  const fr=$('cp-frost');if(fr)fr.style.opacity=clamp((T_NORMAL-this.temp-1.2)/6,0,.95)}
 prompt(){const pr=$('b-prompt');if(!pr||this.ui||this.ch)return;const s=this.near();this.cur=s;if(!s)return;let h=null;
  if(s.kind==='chest')h='<b>E</b>OPEN STORAGE CHEST';else if(s.kind==='bench')h='FABRICATOR  \u00b7  CRAFT WHEN AN OBJECTIVE ASKS';
  else if(s.kind==='life')h='<b>E</b>LIFE SUPPORT DISPENSER'+(this.el<this.dispT?'  \u00b7  '+Math.ceil(this.dispT-this.el)+' s':'');
  else if(s.kind==='node')h=(this.el<(this.cd[s.loc]||0)?'DEPLETED  \u00b7  '+Math.ceil(this.cd[s.loc]-this.el)+' s':'<b>E</b>GATHER  \u00b7  '+fmtM(s.node.give));
  else{const q=s.q,m=(q.tool?this.miss(q.tool):'')||(q.need?this.miss(q.need):'');h=(q.k==='go'?(m?'NEED: '+m:'<b>E</b>'+q.n.toUpperCase()):q.n.toUpperCase())}
  if(h){pr.innerHTML=h;pr.classList.add('on')}}
 hud(exp){const b=this.b,h=$('cp-hud'),o=$('cp-obj');if(!h)return;const left=Math.max(0,Math.ceil(this.dayLen-this.t)),f=n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
  const tc=this.temp.toFixed(1)+' \u00b0C';h.classList.toggle('night',this.night);h.classList.toggle('cold',this.night&&exp&&this.temp<35);
  let l1='SOL '+String(this.sol).padStart(2,'0')+' / '+LAST+'  \u00b7  '+(this.night?'NIGHT':'DAY  '+f(left)),l2='CORE '+tc;
  if(this.night)l2=(b.mode==='inside'?'SLEEPING '+Math.floor(this.sl)+' / '+SLEEP_S+' s':exp?'GET INSIDE  \u00b7  FREEZING':'ENTER THE BASE TO SLEEP')+'  \u00b7  CORE '+tc;
  if(this.flare)l2='\u2622 FLARE '+Math.max(0,Math.ceil(this.flare.end-this.t))+' s  \u00b7  '+(exp?'SHELTER NOW':'SHELTERED')+'  \u00b7  '+l2;
  h.innerHTML=l1+'<small>'+l2+'</small>';
  const act=this.active(),first=act.find(q=>q.loc)||null;let g='';
  if(first&&!this.night){const q=this.pos(first.loc),P=b.p;if(q.e!==(b.mode==='outside'))g='<div class="g">\u27a4 '+(q.e?'GO OUTSIDE (AIRLOCK)':'GO INSIDE THE BASE')+'  \u00b7  '+(LABEL[first.loc]||'')+'</div>';
   else{const d=Math.hypot(q.x-P.x,q.z-P.z),a=Math.atan2(q.z-P.z,q.x-P.x)-P.yaw;g='<div class="g"><span id="cp-ar" style="transform:rotate('+(a*57.2958).toFixed(0)+'deg)">\u25b2</span> '+Math.round(d)+' m  \u00b7  '+(LABEL[first.loc]||'')+'</div>'}}
  else if(this.night)g='<div class="g">NIGHT  \u00b7  STAY INSIDE FOR '+SLEEP_S+' s TO REACH DAWN</div>';
  let rows='';for(const q of this.tasks){const isA=act.includes(q),sub=q.k==='shelter'?' ('+Math.min(q.secs,Math.floor(q.prog))+'/'+q.secs+'s)':'',wait=!q.done&&q.from>this.t&&!isA?'  [in '+Math.ceil(q.from-this.t)+' s]':'';
   rows+='<div class="'+(q.done?'d':isA?'a':'')+'">'+(q.done?'\u2714 ':isA?'\u25b6 ':'\u00b7 ')+q.n+sub+wait+'</div>'}
  o.innerHTML='<h3>SOL '+this.sol+' \u00b7 '+this.def.title+'</h3>'+rows+g}
}