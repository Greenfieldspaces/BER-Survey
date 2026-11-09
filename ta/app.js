// Upgrade Report app: DEAP dwelling report in, upgrades picked, costs, grants and reports out.
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const eur = n => (n<0?'−':'')+'€'+Math.round(Math.abs(n||0)).toLocaleString('en-IE');
const f2 = n => n==null||isNaN(n) ? '—' : Number(n).toFixed(2);
const f1 = n => n==null||isNaN(n) ? '—' : Number(n).toFixed(1);
const f0 = n => n==null||isNaN(n) ? '—' : Math.round(n).toLocaleString('en-IE');
const toNum = v => { const n=parseFloat(String(v).replace(',','.')); return isNaN(n)?null:n; };
if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

// ---------- defaults (from the REIL workbook and the SEAI 2025 grant table) ----------
const DEFAULT_SETTINGS = {
  prices:{cwi:24, ewi:260, iwi:170, floor:200, ceiling:35, rafter:155, flat_ext:250, flat_int:220,
    win_dg:550, win_tg:600, door_pvc:1600, door_comp:2200, airtape:55,
    stove:3800, block_fire:800, rm_secondary:1000, boiler:3500, controls:3000, boiler_ctrl:6500,
    hp_45:17900, hp_87:16500, hp_11:18000, hp_16:20000, hp_full_extra:60, ufh:50, hp_air:19100,
    closable:80, ext_fan:500, draft:200, airtest:600, led:100, mvhr:9000, dcv:3600, tech:800, battery:2250,
    pv_1:7000, pv_15:7000, pv_2:7000, pv_25:7000, pv_3:7500, pv_35:7500, pv_4:7500, pv_45:8000, pv_5:8500, pv_55:9000, pv_6:9500, pv_8:10000, pv_10:10500},
  u:{cwi:0.35, ewi:0.27, iwi:0.27, ceiling:0.16, rafter:0.20, flat_ext:0.20, flat_int:0.20, floor:0.36, floor_ufh:0.15, win_dg:1.4, win_tg:1.1, door_pvc:1.4, door_comp:1.1},
  hp:{effSpace:250, adj:0.70, effWater:115, boilerEff:90.1, stoveEff:60},
  pmPct:0, credit:0, vatPv:13.5, includeHea:false, includePm:false,
  company:{name:'Greenfield Spaces', assessor:'Eoghan Dunne', number:'110671', phone:'', email:'', fee:500}
};
const GRANTS = { // detached, semi/end terrace, mid terrace, apartment
  hp:[6500,6500,6500,4500], hp_system:[2000,2000,2000,1000], hp_air:[3500,3500,3500,3500], controls:[700,700,700,700],
  ceiling:[2000,1500,1400,1100], rafter:[3000,3000,2000,1500], cwi:[1800,1300,850,700], ewi:[8000,6000,3500,3000], iwi:[4500,3500,2000,1500],
  windows:[4000,3000,1800,1500], floor:[3500,3500,3500,0], mvhr:[1500,1500,1500,1500], airtight:[1000,1000,1000,1000],
  hea:[350,350,350,350], pm:[2000,1600,1200,800]
};
const MEASURES = {
  wall:[['','No upgrade'],['cwi','Cavity wall insulation'],['ewi','External wall insulation'],['iwi','Internal wall insulation (dry-lining)']],
  roof:[['','No upgrade'],['ceiling','Insulation on ceiling (attic)'],['rafter','Insulation on rafters'],['flat_ext','Flat roof, external insulation'],['flat_int','Flat or vaulted roof, internal insulation']],
  floor:[['','No upgrade'],['floor','Floor insulation'],['floor_ufh','Floor insulation with underfloor heating']],
  window:[['','No upgrade'],['win_dg','Double glazing'],['win_tg','Triple glazing']],
  door:[['','No upgrade'],['door_pvc','PVC door'],['door_comp','Composite door']]
};
const MLABEL = {}; for(const k in MEASURES) for(const [id,l] of MEASURES[k]) if(id) MLABEL[id]=l;
const HEAT_OPTS = [['keep','Keep current heating'],['hp','Heat pump + heating controls + new cylinder'],['hpfull','Heat pump + full heating system'],['hpair','Air-to-air heat pump'],['boiler','Boiler replacement'],['boilerctrl','Boiler + heating controls'],['controls','Heating controls upgrade only']];
const HP_SIZES = [['45','4.5 kW'],['87','8.7 kW'],['11','11 kW'],['16','16 kW']];
const PV_SIZES = [['0','None'],['1','1.0 kWp'],['15','1.5 kWp'],['2','2.0 kWp'],['25','2.5 kWp'],['3','3.0 kWp'],['35','3.5 kWp'],['4','4.0 kWp'],['45','4.5 kWp'],['5','5.0 kWp'],['55','5.5 kWp'],['6','6.0 kWp'],['8','8.0 kWp'],['10','10.0 kWp']];
const SEC_OPTS = [['keep','Keep as is'],['remove','Remove all secondary heating and block all chimneys and flues'],['stove','Fit a stove / closed room heater'],['block','Block up one fireplace']];
const Q50_OPTS = [['','No air tightness target'],['8','8 m³/h/m² at 50 Pa'],['7','7'],['6','6'],['5','5'],['4.5','4.5'],['4','4'],['3.5','3.5'],['3','3']];
const VENT_OPTS = [['keep','Keep current ventilation'],['mvhr','Mechanical ventilation with heat recovery (MVHR)'],['dcv','Demand control ventilation (extract)']];
const BER_COL = {A1:'#0b7a45',A2:'#0b7a45',A3:'#0b7a45',B1:'#4caf2a',B2:'#4caf2a',B3:'#4caf2a',C1:'#a8c600',C2:'#a8c600',C3:'#a8c600',D1:'#f2b600',D2:'#f2b600',E1:'#f08a00',E2:'#f08a00',F:'#e8501a',G:'#e30613'};
const berTag = l => l ? `<span class="ber" style="background:${BER_COL[l]||'#888'}">${esc(l)}</span>` : '—';

// ---------- storage ----------
const KEY='ta-reports-v1', SKEY='ta-settings-v1';
const load = (k,d) => { try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } };
let settings = deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), load(SKEY,{}));
let reports = load(KEY, []);
let cur = null; // the open report
let tab = 'import';
function deepMerge(a,b){ for(const k in b){ if(b[k] && typeof b[k]==='object' && !Array.isArray(b[k])) a[k]=deepMerge(a[k]||{},b[k]); else a[k]=b[k]; } return a; }
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(reports)); localStorage.setItem(SKEY, JSON.stringify(settings)); }
  catch(e){ toast('Could not save: storage is full'); }
}
function blank(){
  return {id:'r'+Date.now().toString(36), created:new Date().toISOString(), before:null, after:null, beforeName:'', afterName:'',
    client:{first:'', last:'', address1:'', address2:'', town:'', county:'', eircode:'', mprn:'', phone:'', email:'', objectives:'Reduce the heat loss of the home, and reduce energy bills.', access:'', notes:'', reportDate:new Date().toISOString().slice(0,10), consultDate:'', berPublished:''},
    up:{el:{}, heat:{system:'keep', hpSize:'87', effSpace:null, adj:null, effWater:null, ufh:false}, sec:'keep',
      vent:{chimneys:null, flues:null, fans:null, flueless:null, draft:false, q50:'', floorSeal:false, system:'keep', closable:0, extraFans:0, airtape:false, lobby:false},
      led:false, pv:'0', pvOrient:'South', battery:false, tech:false, tb:null, extras:[]},
    useAfterReport:true, comments:{general:'', ta:''}};
}
function title(r){ const c=r.client; const a=c.address1|| (r.before&&r.before.meta.address1) || 'New report'; const n=[c.first,c.last].filter(Boolean).join(' '); return a+(n?' · '+n:''); }

// ---------- derived figures ----------
function dwellingClass(R){ const t=(R&&R.meta.dwellingType||'').toLowerCase(); if(/detached house/.test(t)&&!/semi/.test(t)) return 0; if(/semi|end of terrace|end-terrace/.test(t)) return 1; if(/mid/.test(t)&&/terrace/.test(t)) return 2; if(/apartment|maisonette/.test(t)) return 3; return 1; }
function groups(R){
  // windows are grouped by glazing type and U-value, like the SEAI form; doors stay one row each
  const els = taElements(R); const out=[]; const wg={};
  for(const e of els){
    if(e.kind==='window'){
      const k=(e.type||'')+'|'+e.u;
      if(!wg[k]){ wg[k]={id:'wg'+Object.keys(wg).length, kind:'window', name:'Window group '+(Object.keys(wg).length+1), type:e.type, desc:'', area:0, u:e.u, g:e.g, members:[], orients:new Set(), frame:e.frame}; out.push(wg[k]); }
      wg[k].area+=e.area; wg[k].members.push(e.id); wg[k].orients.add(e.orient);
    } else out.push({...e, members:[e.id]});
  }
  for(const g of out) if(g.kind==='window'){ g.desc=[...g.orients].filter(Boolean).join(', ')+(g.frame?' · '+g.frame:''); g.area=Math.round(g.area*100)/100; g.count=g.members.length; }
  return out;
}
function elState(id){ return cur.up.el[id] || (cur.up.el[id]={on:false, m:'', u:null, rate:null}); }
function defaultMeasure(g){
  const t=((g.type||'')+' '+(g.desc||'')).toLowerCase();
  if(g.kind==='wall') return /cavity/.test(t)?'cwi':'ewi';
  if(g.kind==='roof') return /flat/.test(t)?'flat_ext':/rafter|slop|vault/.test(t)?'rafter':'ceiling';
  if(g.kind==='floor') return 'floor';
  if(g.kind==='window') return 'win_tg';
  if(g.kind==='door') return 'door_comp';
  return '';
}
function heatEff(){ const h=cur.up.heat; return { space:(h.effSpace!=null?h.effSpace:settings.hp.effSpace), adj:(h.adj!=null?h.adj:settings.hp.adj), water:(h.effWater!=null?h.effWater:settings.hp.effWater) }; }
// the "up" object calc.js understands
function calcInput(){
  const R=cur.before, u=cur.up; const E={};
  for(const g of groups(R)){
    const s=u.el[g.id]; if(!s||!s.on||!s.m) continue;
    const uNew = s.u!=null ? s.u : settings.u[s.m];
    for(const id of g.members) E[id]={u:uNew};
  }
  const v=u.vent;
  const curV={chimneys:R.vent.chimneys.n, flues:R.vent.flues.n, fans:R.vent.fans.n, flueless:R.vent.flueless.n};
  const vent={
    chimneys: v.chimneys!=null?v.chimneys:curV.chimneys, flues: v.flues!=null?v.flues:curV.flues,
    fans: (v.fans!=null?v.fans:curV.fans) + (v.extraFans||0), flueless: v.flueless!=null?v.flueless:curV.flueless
  };
  if(u.sec==='remove'){ vent.chimneys=0; vent.flues=0; vent.flueless=0; }
  if(u.sec==='block'||u.sec==='stove') vent.chimneys=Math.max(0,vent.chimneys-1);
  if(v.draft) vent.strippedPct=100;
  if(v.q50) vent.q50=Number(v.q50);
  if(v.floorSeal && /unsealed/i.test(R.vent.suspended||'')) vent.floor='sealed';
  if(v.lobby) vent.lobby=true;
  if(v.system==='mvhr'){ vent.method='Balanced whole-house with heat recovery'; vent.sfp=0.6; vent.hx=84; }
  if(v.system==='dcv'){ vent.method='Whole house extract'; vent.sfp=0.24; }
  // floor with underfloor heating: new U comes from the measure
  const h=u.heat, he=heatEff();
  const heat={};
  if(['hp','hpfull'].includes(h.system)){ heat.type='hp'; heat.effSpace=he.space*he.adj; heat.effWater=he.water; }
  else if(h.system==='hpair'){ heat.type='hp'; heat.effSpace=he.space*he.adj; heat.hpWater=false; }
  else if(['boiler','boilerctrl'].includes(h.system)){ heat.type='boiler'; heat.effSpace=settings.hp.boilerEff; }
  heat.ufh = !!h.ufh || Object.values(u.el).some(s=>s.on&&s.m==='floor_ufh');
  if(u.sec==='remove') heat.removeSecondary=true;
  if(u.sec==='stove'){ heat.stove=true; heat.stoveEff=settings.hp.stoveEff; }
  return {elements:E, vent, heat, tb:u.tb, led:u.led, pvKwp:pvKwp(u.pv), pvOrient:u.pvOrient, battery:u.battery};
}
function pvKwp(code){ return code==='0'?0 : code==='10'?10 : code.length>1? Number(code)/10 : Number(code); }
// before/after figures; with a second DEAP report the after figures are DEAP's own
function results(){
  const B=cur.before; if(!B) return null;
  const inp=calcInput(); inp.pvKwp=pvKwp(cur.up.pv);
  const est = taCompute(B, inp);
  const A = cur.after && cur.useAfterReport ? cur.after : null;
  const before = {label:B.label, ev:B.energyValue, co2:B.co2Value, hli:B.heat.hli, ach:B.vent.adjusted, del:B.results.rows.total?.delivered, H:B.heat.total, src:'DEAP'};
  const after = A ? {label:A.label, ev:A.energyValue, co2:A.co2Value, hli:A.heat.hli, ach:A.vent.adjusted, del:A.results.rows.total?.delivered, H:A.heat.total, src:'DEAP'}
                  : {label:est.label, ev:est.energyValue, co2:est.co2Value, hli:est.hli, ach:est.vent.adjusted, del:est.delivered, H:est.H, src:'estimate'};
  return {before, after, est, A};
}
// costs and grants for every chosen measure
function costing(res){
  const R=cur.before, u=cur.up, P=settings.prices, cls=dwellingClass(R), G=(k)=>GRANTS[k][cls];
  const rows=[]; const add=(element, existing, measure, cost, grant, kind)=>{ if(cost>0||grant>0) rows.push({element, existing, measure, cost:Math.round(cost), grant:Math.round(grant||0), kind}); };
  const gs=groups(R); const wallGrantUsed={}, roofGrantUsed={};
  let winOn=0, winAll=0, doorsCount=0;
  for(const g of gs){
    const s=u.el[g.id]; if(g.kind==='window') winAll++;
    if(!s||!s.on||!s.m) continue;
    const rate = s.rate!=null ? s.rate : (s.m==='floor_ufh' ? P.floor : P[s.m]);
    const uNew = s.u!=null ? s.u : settings.u[s.m];
    const exist = `${g.type||g.name}${g.desc?', '+g.desc:''} (U ${f2(g.u)})`;
    if(g.kind==='door'){
      const n=g.count||1; doorsCount+=n;
      add('Windows & doors', exist, MLABEL[s.m], rate*n, 0, 'door');
    } else {
      let grant=0;
      if(g.kind==='wall' && !wallGrantUsed[s.m]){ grant=G(s.m); wallGrantUsed[s.m]=1; }
      if(g.kind==='roof'){ const gk = s.m==='ceiling'?'ceiling':'rafter'; if(!roofGrantUsed[gk]){ grant=G(gk); roofGrantUsed[gk]=1; } }
      if(g.kind==='floor' && !roofGrantUsed.floor){ grant=G('floor'); roofGrantUsed.floor=1; }
      if(g.kind==='window') winOn++;
      const el = {wall:'Wall insulation', roof:'Roof insulation', floor:'Floor insulation', window:'Windows & doors'}[g.kind];
      add(el, exist, `${MLABEL[s.m]} to U ${f2(uNew)}`, rate*g.area, grant, g.kind);
      if(s.m==='floor_ufh') add('Main heating', 'Ground floor', 'Underfloor heating piping', P.ufh*g.area, 0, 'ufh');
    }
  }
  // door grant: €800 per door, max 2; window grant only for a complete upgrade
  const doorRows=rows.filter(r=>r.kind==='door');
  if(doorRows.length){ doorRows[0].grant = Math.min(2,doorsCount)*800; }
  if(winOn>0 && winOn===winAll){ const wr=rows.find(r=>r.kind==='window'); if(wr) wr.grant=G('windows'); }
  if(u.vent.airtape){ const wa=(R.heat.glazedArea||0)+(R.doors.reduce((s,d)=>s+d.area,0)); add('Windows & doors','—','Air tightness tape to windows and doors', P.airtape*wa, 0); }
  // heating
  const h=u.heat, tfa=R.dims.tfa;
  if(h.system==='hp'){ add('Main heating', heatingName(R), `Heat pump ${HP_SIZES.find(x=>x[0]===h.hpSize)[1]} + heating controls + new cylinder`, P['hp_'+h.hpSize], G('hp')+G('hp_system'), 'hp'); }
  if(h.system==='hpfull'){ add('Main heating', heatingName(R), `Heat pump ${HP_SIZES.find(x=>x[0]===h.hpSize)[1]} + full heating system`, P['hp_'+h.hpSize] + P.hp_full_extra*tfa, G('hp')+G('hp_system'), 'hp'); }
  if(h.system==='hpair') add('Main heating', heatingName(R), 'Air-to-air heat pump', P.hp_air, G('hp_air'), 'hp');
  if(h.system==='boiler') add('Main heating', heatingName(R), 'Boiler replacement', P.boiler, 0);
  if(h.system==='boilerctrl') add('Main heating', heatingName(R), 'Boiler + heating controls', P.boiler_ctrl, 0);
  if(h.system==='controls') add('Main heating', heatingName(R), 'Heating controls upgrade', P.controls, G('controls'));
  if(h.ufh && !Object.values(u.el).some(s=>s.on&&s.m==='floor_ufh')){ const gf=(R.dims.floors[0]||{}).area||0; add('Main heating','Ground floor','Underfloor heating piping', P.ufh*gf, 0); }
  // secondary
  if(u.sec==='remove') add('Secondary heating', secondaryName(R), 'Remove all secondary heating and block all chimneys and flues', P.rm_secondary, 0);
  if(u.sec==='stove') add('Secondary heating', secondaryName(R), 'Stove / closed room heater', P.stove, 0);
  if(u.sec==='block') add('Secondary heating', secondaryName(R), 'Block up fireplace', P.block_fire, 0);
  // other
  const v=u.vent;
  if(v.draft) add('Other measures', `${f0(R.vent.strippedPct)}% draught stripped`, 'Draught proofing', P.draft, 0);
  if(v.q50) add('Other measures', '—', `Air tightness works and test (target ${v.q50} m³/h/m²)`, P.airtest, G('airtight'));
  if(v.system==='mvhr') add('Ventilation', R.vent.method||'—', 'MVHR ventilation system', P.mvhr, G('mvhr'));
  if(v.system==='dcv') add('Ventilation', R.vent.method||'—', 'Demand control ventilation', P.dcv, 0);
  if(v.closable>0) add('Other measures','—', `Closable vents (${v.closable})`, P.closable*v.closable, 0);
  if(v.extraFans>0) add('Other measures','—', `Additional extract fans (${v.extraFans})`, P.ext_fan*v.extraFans, 0);
  if(u.led) add('Other measures', `${f0(R.light.efficacy)} lm/W`, 'LED lighting', P.led, 0);
  const kwp=pvKwp(u.pv);
  if(kwp>0){ const pg = kwp<=2? 700*kwp : Math.min(1800, 1400+200*(kwp-2)); add('Renewables', 'None', `Solar PV ${kwp.toFixed(1)} kWp`, P['pv_'+u.pv], pg, 'pv'); }
  if(u.battery) add('Renewables','—','4.8 kWh battery storage', P.battery, 0);
  if(u.tech) add('Other measures','—','Technical assessment', P.tech, 0);
  for(const x of u.extras||[]) if(x.label) add(x.element||'Other measures','—', x.label, toNum(x.cost)||0, toNum(x.grant)||0);
  const works = rows.reduce((s,r)=>s+r.cost,0);
  const grants = rows.reduce((s,r)=>s+r.grant,0);
  const pm = Math.round(works*(settings.pmPct||0)/100);
  const pvRow = rows.find(r=>r.kind==='pv'); const vat = pvRow ? Math.round(pvRow.cost*(settings.vatPv||0)/100) : 0;
  const hpOn = ['hp','hpfull','hpair'].includes(h.system);
  const bonus = hpOn && res && ['A1','A2','A3','B1','B2'].includes(res.after.label) ? 2000 : 0;
  const hea = settings.includeHea ? G('hea') : 0, pmg = settings.includePm ? G('pm') : 0;
  const saved = res ? Math.max(0,(res.before.del||0)-(res.after.del||0)) : 0;
  const credits = Math.round(saved*(settings.credit||0));
  const total = works+pm+vat;
  const extraGrant = bonus+hea+pmg;
  return {rows, works, grants, pm, vat, total, bonus, hea, pmg, extraGrant, credits, pay:Math.max(0,total-grants-extraGrant-credits), saved, cls};
}
function heatingName(R){ const h=R.heating; const f=R.fuels.main?.fuel||''; return (h.system||'Main heating')+(f?' ('+f+')':'')+(h.effMainAdj?`, ${f1(h.effMainAdj)}%`:''); }
function secondaryName(R){ const s=R.fuels.sec; return s && s.fuel && s.fuel!=='None' ? `${s.fuel}, ${f0(R.heating.effSec)}%` : 'None'; }
function checks(res, cost){
  const a=res.after, b=res.before;
  const isB = a.label && /^[AB]/.test(a.label);
  const R=cur.before, inp=calcInput();
  // backstop U-values after works: walls 0.37, roofs 0.16 (accessible) / 0.25, glazing 2.8
  const els=taElements(R); const fails=[];
  for(const e of els){
    const n = inp.elements[e.id] ? inp.elements[e.id].u : e.u;
    if(e.kind==='wall' && n>0.37) fails.push(e.name);
    if(e.kind==='roof' && n>(/ceiling/i.test(e.type)?0.16:0.25)) fails.push(e.name);
    if(e.kind==='window' && n>2.8) fails.push('windows');
  }
  const uniq=[...new Set(fails)];
  return [
    {ok:isB && a.ev<150, v:a.label||'—', l:'B rating and under 150 kWh'},
    {ok:(b.ev-a.ev)>=100, v:f1(b.ev-a.ev), l:'100 kWh/m² uplift'},
    {ok:a.hli<=2.3, v:f2(a.hli), l:'HLI 2.3 or below'},
    {na:true, v:f2(a.ach)+' ac/h', l:'Air infiltration after'},
    {ok:uniq.length===0, v:uniq.length?uniq.slice(0,2).join(', '):'All met', l:'Backstop U-values'}
  ];
}

// ---------- UI ----------
const TABS=[['import','Import'],['client','Client'],['upgrades','Upgrades'],['costs','Costs & grants'],['reports','Reports'],['prices','Prices']];
function render(){
  $('#tabs').innerHTML = TABS.map(([k,l])=>`<button class="tab" aria-selected="${tab===k}" data-tab="${k}">${l}</button>`).join('');
  $('#pick').innerHTML = reports.map(r=>`<option value="${r.id}" ${cur&&cur.id===r.id?'selected':''}>${esc(title(r))}</option>`).join('') || '<option>No reports yet</option>';
  const res = cur&&cur.before ? results() : null;
  $('#topBadge').innerHTML = res ? `<span class="badge ${res.after.hli<=2.3?'ok':'bad'}">${esc(res.before.label)} → ${esc(res.after.label)} · HLI ${f2(res.after.hli)} ${res.after.hli<=2.3?'✓':''}</span>` : '';
  const m=$('#main');
  if(!cur){ m.innerHTML = `<div class="card"><h2>Start a report</h2><p class="sub">Tap New report, then drop in the DEAP dwelling report for the current BER.</p><button class="btn primary" data-act="new">New report</button></div>`; return; }
  if(!cur.before && tab!=='import' && tab!=='prices') tab='import';
  m.innerHTML = ({import:viewImport, client:viewClient, upgrades:viewUpgrades, costs:viewCosts, reports:viewReports, prices:viewPrices})[tab](res);
  $('#tabs').querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected', t.dataset.tab===tab));
}
function dropBox(which){
  const R = cur[which], name=cur[which+'Name'];
  const lab = which==='before' ? 'Current BER' : 'After works (optional)';
  if(R) return `<div class="drop has" data-act="pick-${which}"><b>✓ ${esc(lab)}: ${esc(R.meta.address1||'')}</b><span class="sub">${esc(name)} · ${esc(R.label)} · ${f1(R.energyValue)} kWh/m²/yr · HLI ${f2(R.heat.hli)}</span><span class="row"><button class="btn small" data-act="pick-${which}">Replace</button>${which==='after'?'<button class="btn small danger" data-act="clear-after">Remove</button>':''}</span></div>`;
  return `<div class="drop" data-act="pick-${which}"><b>${which==='before'?'Drop in the current BER':'Drop in the DEAP report after works'}</b><span class="sub">${which==='before'?'The Dwelling Details Report PDF from DEAP for the published BER.':'Optional. Add the upgrades to a copy of the house in DEAP and drop its Dwelling Details Report here. The after figures then come straight from DEAP.'}</span><button class="btn small ${which==='before'?'primary':''}" data-act="pick-${which}">Choose PDF</button></div>`;
}
function viewImport(){
  const B=cur.before;
  let h = `<div class="card"><h2>DEAP dwelling reports</h2><p class="sub">Everything about the house is read from DEAP's Dwelling Details Report. Nothing is typed again.</p><div class="grid2" style="margin-top:12px">${dropBox('before')}${dropBox('after')}</div>`;
  if(cur.after) h += `<label class="row" style="margin-top:12px"><input type="checkbox" class="tog" data-bind="useAfterReport" ${cur.useAfterReport?'checked':''}> <span>Use the second report's figures for the after column (off: the tool works it out from the upgrades you pick)</span></label>`;
  h += '</div>';
  if(B){
    const sc = taSelfCheck(B);
    h += `<div class="card"><h2>${esc(B.meta.address1)}${B.meta.address2?', '+esc(B.meta.address2):''}</h2><div class="sub">${esc(B.meta.dwellingType)} · built ${esc(B.meta.year)} · ${f1(B.dims.tfa)} m² · BER ${esc(B.meta.ber)} · MPRN ${esc(B.meta.mprn)}</div>
    <div class="grid4" style="margin-top:12px">
      <div class="stat"><b>${berTag(B.label)}</b><span>BER</span></div><div class="stat"><b>${f1(B.energyValue)}</b><span>kWh/m²/yr</span></div>
      <div class="stat"><b>${f2(B.heat.hli)}</b><span>HLI (W/K/m²)</span></div><div class="stat"><b>${f1(B.co2Value)}</b><span>kgCO₂/m²/yr</span></div></div>
    <h3>What was read</h3>
    <div class="tblwrap"><table class="tbl"><tr><th>Element</th><th>Type</th><th class="n">Area m²</th><th class="n">U-value</th></tr>
    ${taElements(B).map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.type)}${e.desc?' · <span class="muted">'+esc(e.desc)+'</span>':''}</td><td class="n">${f2(e.area)}</td><td class="n">${f2(e.u)}</td></tr>`).join('')}
    </table></div>
    <p class="sub" style="margin-top:8px">Heating: ${esc(heatingName(B))}. Secondary: ${esc(secondaryName(B))}. Ventilation: ${esc(B.vent.method)}, ${f2(B.vent.adjusted)} ac/h. Chimneys ${B.vent.chimneys.n}, open flues ${B.vent.flues.n}, fans and vents ${B.vent.fans.n}.</p>
    ${B.warnings.length?`<div class="warnbox">${B.warnings.map(esc).join('<br>')}</div>`:`<div class="okbox">✓ Check passed: element heat losses add up to the report's total, and the tool's method gives HLI ${f2(sc.hli)} and ${f1(sc.ev)} kWh/m²/yr for today's house (DEAP: ${f2(sc.hliReport)} and ${f1(sc.evReport)}).</div>`}
    </div>`;
  }
  return h;
}
function inp(bind, val, attrs=''){ return `<input data-bind="${bind}" value="${esc(val==null?'':val)}" ${attrs}>`; }
function viewClient(){
  const c=cur.client, B=cur.before, s=settings.company;
  const F=(lab,bind,val,attrs='')=>`<label class="field"><span>${lab}</span>${inp(bind,val,attrs)}</label>`;
  return `<div class="card"><h2>Client</h2><p class="sub">Address, Eircode and MPRN came from the DEAP report. Add the rest.</p>
  <div class="grid2" style="margin-top:12px">
    ${F('First name','client.first',c.first)}${F('Last name','client.last',c.last)}
    ${F('Address','client.address1',c.address1||B.meta.address1)}${F('Address line 2','client.address2',c.address2||B.meta.address2||'')}
    ${F('Town','client.town',c.town)}${F('County','client.county',c.county||B.meta.county)}
    ${F('Eircode','client.eircode',c.eircode||B.meta.eircode)}${F('MPRN','client.mprn',c.mprn||B.meta.mprn)}
    ${F('Phone','client.phone',c.phone,'type="tel"')}${F('Email','client.email',c.email,'type="email"')}
    ${F('Report date','client.reportDate',c.reportDate,'type="date"')}${F('Date of client consultation','client.consultDate',c.consultDate,'type="date"')}
    ${F('BER published (date)','client.berPublished',c.berPublished)}${F('Access notes','client.access',c.access)}
  </div>
  <label class="field" style="margin-top:10px"><span>Client's key objectives</span><textarea data-bind="client.objectives">${esc(c.objectives)}</textarea></label>
  </div>
  <div class="card"><h2>You</h2><p class="sub">Saved for every report.</p><div class="grid3" style="margin-top:12px">
    ${F('Company','settings.company.name',s.name)}${F('Assessor name','settings.company.assessor',s.assessor)}${F('BER assessor number','settings.company.number',s.number)}
    ${F('Phone','settings.company.phone',s.phone,'type="tel"')}${F('Email','settings.company.email',s.email,'type="email"')}${F('Technical advisor fee (€)','settings.company.fee',s.fee,'inputmode="decimal"')}
  </div></div>`;
}
function summaryCard(res){
  const cost=costing(res); const ch=checks(res,cost);
  const b=res.before, a=res.after;
  return `<div class="card"><h2>Before and after</h2><div class="sub">Current figures from the published BER. After works: ${a.src==='DEAP'?'from your second DEAP report.':'worked out from the upgrades ticked below (a close estimate; DEAP gives the official figure).'}</div>
  <table class="cmp"><tr><th></th><th>BER</th><th>kWh/m²/yr</th><th>kgCO₂/m²/yr</th><th>HLI</th><th>Air ac/h</th></tr>
  <tr><td>Current</td><td>${berTag(b.label)}</td><td>${f1(b.ev)}</td><td>${f1(b.co2)}</td><td>${f2(b.hli)}</td><td>${f2(b.ach)}</td></tr>
  <tr><td>After works</td><td>${berTag(a.label)}</td><td>${f1(a.ev)}</td><td>${f1(a.co2)}</td><td><b style="color:${a.hli<=2.3?'var(--accent)':'var(--warn)'}">${f2(a.hli)}</b></td><td>${f2(a.ach)}</td></tr>
  <tr><td>Saving</td><td></td><td>${f1(b.ev-a.ev)}</td><td>${f1(b.co2-a.co2)}</td><td>${f2(b.hli-a.hli)}</td><td></td></tr></table>
  <div class="checks">${ch.map(c=>`<div class="ck ${c.na?'na':c.ok?'':'bad'}"><b>${c.na?'':c.ok?'✓ ':'! '}${esc(c.v)}</b><span>${esc(c.l)}</span></div>`).join('')}</div></div>`;
}
function viewUpgrades(res){
  const R=cur.before, u=cur.up, gs=groups(R);
  const est=res.est;
  const tfa=R.dims.tfa;
  let rowsH='';
  const kinds=[['wall','Walls'],['roof','Roofs'],['floor','Floors'],['window','Windows'],['door','Doors']];
  let sumCost=0;
  for(const [k,lab] of kinds){
    const list=gs.filter(g=>g.kind===k); if(!list.length) continue;
    rowsH += `<tr class="grp"><td colspan="7">${lab}</td></tr>`;
    for(const g of list){
      const s=elState(g.id);
      const m = s.m || defaultMeasure(g);
      const uNew = s.u!=null ? s.u : settings.u[m];
      const rate = s.rate!=null ? s.rate : (m==='floor_ufh'?settings.prices.floor:settings.prices[m]);
      const qty = k==='door' ? (g.count||1) : g.area;
      const cost = s.on && m ? rate*qty : 0; sumCost+=cost;
      const ue = k==='window' ? curtainU : (x=>x);
      const sav = s.on && m ? g.area*(ue(g.u)-ue(uNew))/tfa : 0;
      rowsH += `<tr class="${s.on?'':'off'}"><td><input type="checkbox" class="tog" data-el="${g.id}" data-f="on" ${s.on?'checked':''}></td>
        <td class="ex"><b>${esc(g.name)}</b><small>${esc(g.type)}${g.desc?' · '+esc(g.desc):''}</small>
        <select data-el="${g.id}" data-f="m" style="margin-top:6px;max-width:100%">${MEASURES[k].filter(x=>x[0]).map(([id,l])=>`<option value="${id}" ${id===m?'selected':''}>${esc(l)}</option>`).join('')}</select></td>
        <td class="n">${f2(g.area)} m²${k==='door'?`<br><small class="muted">${g.count||1} door${(g.count||1)>1?'s':''}</small>`:''}</td>
        <td class="n">${f2(g.u)} → <input inputmode="decimal" data-el="${g.id}" data-f="u" value="${f2(uNew)}"></td>
        <td class="n">${s.on?'−'+f2(sav):'—'}</td>
        <td class="n"><input inputmode="decimal" data-el="${g.id}" data-f="rate" value="${rate}" title="€ per ${k==='door'?'door':'m²'}"><br><small class="muted">€/${k==='door'?'door':'m²'}</small></td>
        <td class="n">${s.on?eur(cost):'—'}</td></tr>`;
    }
  }
  const h=u.heat, he=heatEff(), v=u.vent, P=settings.prices;
  const sel=(bind,opts,val)=>`<select data-bind="${bind}">${opts.map(([id,l])=>`<option value="${id}" ${String(val)===id?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const hpOn=['hp','hpfull','hpair'].includes(h.system);
  const num=(bind,val,ph='')=>`<input inputmode="decimal" data-bind="${bind}" value="${val==null?'':esc(val)}" placeholder="${esc(ph)}">`;
  return summaryCard(res) + `
  <div class="card"><h2>Walls, roofs, floors, windows and doors</h2><div class="sub">Every element from the DEAP report. Switch on a row, pick the measure, and the new U-value and price fill in. You can change either.</div>
  <div class="tblwrap" style="margin-top:8px"><table class="tbl"><tr><th></th><th>Existing and upgrade</th><th class="n">Area</th><th class="n">U now → new</th><th class="n">HLI saving</th><th class="n">Rate</th><th class="n">Cost</th></tr>${rowsH}
  <tr class="tot"><td></td><td colspan="3">Fabric total</td><td class="n" style="color:var(--accent)">−${f2((R.heat.fabric-est.fabric)/tfa)}</td><td></td><td class="n">${eur(sumCost)}</td></tr></table></div>
  <label class="field" style="max-width:260px;margin-top:10px"><span>Thermal bridging factor (y)</span>${num('up.tb', u.tb, f2(R.heat.tb))}</label></div>

  <div class="card"><h2>Heating</h2><div class="opts" style="margin-top:8px">
    <div class="opt"><span class="sub">Now: ${esc(heatingName(R))}</span>${sel('up.heat.system',HEAT_OPTS,h.system)}
    ${['hp','hpfull'].includes(h.system)?sel('up.heat.hpSize',HP_SIZES,h.hpSize):''}</div>
    ${hpOn?`<div class="opt"><span class="sub">Heat pump efficiency used</span><div class="grid3"><label class="field"><span>Space %</span>${num('up.heat.effSpace',he.space)}</label><label class="field"><span>× adjustment</span>${num('up.heat.adj',he.adj)}</label><label class="field"><span>Water %</span>${num('up.heat.effWater',he.water)}</label></div><span class="sub">= ${f0(he.space*he.adj)}% for space heating, as DEAP adjusts it</span></div>`:''}
    <div class="opt"><label class="row"><span>Underfloor heating on the ground floor</span><input type="checkbox" class="tog" data-bind="up.heat.ufh" ${h.ufh?'checked':''}></label><span class="sub">${eur(P.ufh)}/m² piping</span></div>
    <div class="opt"><span class="sub">Secondary heating now: ${esc(secondaryName(R))}</span>${sel('up.sec',SEC_OPTS,u.sec)}</div>
  </div></div>

  <div class="card"><h2>Ventilation and air tightness</h2><div class="sub">Now: ${esc(R.vent.method)}, ${f2(R.vent.adjusted)} ac/h, ${f0(R.vent.strippedPct)}% draught stripped${R.vent.suspended&&/yes/i.test(R.vent.suspended)?', suspended timber floor '+esc(R.vent.suspended.replace(/^Yes\s*/,'')):''}.</div>
  <div class="grid4" style="margin-top:10px">
    <label class="field"><span>Chimneys after (now ${R.vent.chimneys.n})</span>${num('up.vent.chimneys',v.chimneys,R.vent.chimneys.n)}</label>
    <label class="field"><span>Open flues after (now ${R.vent.flues.n})</span>${num('up.vent.flues',v.flues,R.vent.flues.n)}</label>
    <label class="field"><span>Fans and vents after (now ${R.vent.fans.n})</span>${num('up.vent.fans',v.fans,R.vent.fans.n)}</label>
    <label class="field"><span>Flueless heaters after (now ${R.vent.flueless.n})</span>${num('up.vent.flueless',v.flueless,R.vent.flueless.n)}</label>
  </div>
  <div class="opts" style="margin-top:10px">
    <div class="opt"><label class="row"><span>Draught proofing (all windows and doors)</span><input type="checkbox" class="tog" data-bind="up.vent.draft" ${v.draft?'checked':''}></label><span class="sub">${eur(P.draft)}</span></div>
    <div class="opt"><span>Air tightness target</span>${sel('up.vent.q50',Q50_OPTS,v.q50)}<span class="sub">Works and test ${eur(P.airtest)}</span></div>
    <div class="opt"><label class="row"><span>Air tightness tape to windows and doors</span><input type="checkbox" class="tog" data-bind="up.vent.airtape" ${v.airtape?'checked':''}></label><span class="sub">${eur(P.airtape)}/m²</span></div>
    ${/unsealed/i.test(R.vent.suspended||'')?`<div class="opt"><label class="row"><span>Seal the suspended timber floor</span><input type="checkbox" class="tog" data-bind="up.vent.floorSeal" ${v.floorSeal?'checked':''}></label></div>`:''}
    ${!R.vent.lobby?`<div class="opt"><label class="row"><span>Add a draught lobby</span><input type="checkbox" class="tog" data-bind="up.vent.lobby" ${v.lobby?'checked':''}></label></div>`:''}
    <div class="opt"><span>Ventilation system</span>${sel('up.vent.system',VENT_OPTS,v.system)}</div>
    <div class="opt"><span>Closable vents (number)</span>${num('up.vent.closable',v.closable||'')}<span class="sub">${eur(P.closable)} each</span></div>
    <div class="opt"><span>Additional extract fans (number)</span>${num('up.vent.extraFans',v.extraFans||'')}<span class="sub">${eur(P.ext_fan)} each</span></div>
  </div></div>

  <div class="card"><h2>Lighting, renewables and other</h2><div class="opts" style="margin-top:8px">
    <div class="opt"><label class="row"><span>LED lighting</span><input type="checkbox" class="tog" data-bind="up.led" ${u.led?'checked':''}></label><span class="sub">Now ${f0(R.light.efficacy)} lm/W · ${eur(P.led)}</span></div>
    <div class="opt"><span>Solar PV</span>${sel('up.pv',PV_SIZES,u.pv)}${u.pv!=='0'?sel('up.pvOrient',[['South','South'],['South East','South East'],['South West','South West'],['East','East'],['West','West']],u.pvOrient):''}</div>
    <div class="opt"><label class="row"><span>4.8 kWh battery</span><input type="checkbox" class="tog" data-bind="up.battery" ${u.battery?'checked':''}></label><span class="sub">${eur(P.battery)}</span></div>
    <div class="opt"><label class="row"><span>Technical assessment</span><input type="checkbox" class="tog" data-bind="up.tech" ${u.tech?'checked':''}></label><span class="sub">${eur(P.tech)}</span></div>
  </div>
  <h3>Other items</h3>
  ${(u.extras||[]).map((x,i)=>`<div class="grid4" style="margin-bottom:8px"><label class="field"><span>Item</span><input data-bind="up.extras.${i}.label" value="${esc(x.label)}"></label><label class="field"><span>Cost €</span><input inputmode="decimal" data-bind="up.extras.${i}.cost" value="${esc(x.cost)}"></label><label class="field"><span>Grant €</span><input inputmode="decimal" data-bind="up.extras.${i}.grant" value="${esc(x.grant)}"></label><div class="field"><span>&nbsp;</span><button class="btn small danger" data-act="rm-extra" data-i="${i}">Remove</button></div></div>`).join('')}
  <button class="btn small" data-act="add-extra">+ Add item</button>
  </div>`;
}
function viewCosts(res){
  const c=costing(res);
  return summaryCard(res) + `<div class="card"><h2>Costs and grants</h2><div class="sub">SEAI grants for a ${['detached house','semi-detached or end of terrace house','mid-terrace house','apartment'][c.cls]}. Prices are in the Prices tab.</div>
  <div class="tblwrap" style="margin-top:8px"><table class="tbl"><tr><th>Element</th><th>Existing</th><th>Upgrade</th><th class="n">Cost</th><th class="n">SEAI grant</th><th class="n">You pay</th></tr>
  ${c.rows.map(r=>`<tr><td>${esc(r.element)}</td><td class="muted">${esc(r.existing)}</td><td>${esc(r.measure)}</td><td class="n">${eur(r.cost)}</td><td class="n" style="color:var(--accent)">${r.grant?eur(r.grant):'—'}</td><td class="n">${eur(r.cost-r.grant)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No upgrades picked yet. Go to Upgrades.</td></tr>'}
  <tr class="tot"><td colspan="3">Totals</td><td class="n">${eur(c.works)}</td><td class="n" style="color:var(--accent)">${eur(c.grants)}</td><td class="n">${eur(c.works-c.grants)}</td></tr></table></div>
  <h3>Summary</h3><div class="sum">
    <div>Upgrade works (excl. VAT)</div><div>${eur(c.works)}</div>
    ${c.pm?`<div>Overheads, project management, admin (${settings.pmPct}%)</div><div>${eur(c.pm)}</div>`:''}
    ${c.vat?`<div>VAT at ${settings.vatPv}% on PV</div><div>${eur(c.vat)}</div>`:''}
    <div>Total including VAT</div><div>${eur(c.total)}</div>
    <div>SEAI grants</div><div class="g">−${eur(c.grants)}</div>
    ${c.bonus?`<div>Heat pump bonus for reaching B2 or better</div><div class="g">−${eur(c.bonus)}</div>`:''}
    ${c.hea?`<div>Home energy assessment grant</div><div class="g">−${eur(c.hea)}</div>`:''}
    ${c.pmg?`<div>Project management grant</div><div class="g">−${eur(c.pmg)}</div>`:''}
    ${c.credits?`<div>Energy credits (${f0(c.saved)} kWh/yr saved)</div><div class="g">−${eur(c.credits)}</div>`:''}
    <div class="t">Homeowner pays</div><div class="t">${eur(c.pay)}</div>
  </div>
  <p class="sub" style="margin-top:10px">Annual energy saving: ${f0(c.saved)} kWh delivered energy (${f0(res.before.del)} → ${f0(res.after.del)} kWh/yr). Grant rates change: check seai.ie before issuing.</p></div>`;
}
function viewReports(res){
  const c=costing(res); const a=res.after;
  return `<div class="card"><h2>Reports</h2><div class="sub">Each one fills from this report and saves as a PDF you can share or print.</div>
  <div class="doc"><div><h3>BER Upgrade Report</h3><p>Cover page and sections 1 to 12: ratings, costs and grants, walls, roofs, floors, windows and doors, heating, hot water, secondary heating, other measures, renewables, technical notes, terms, next steps.</p></div><button class="btn primary" data-act="pdf-hea">Share PDF</button></div>
  <div class="doc"><div><h3>SEAI Technical Assessment Form</h3><p>Heat pump grant form: admin details, HLI now ${f2(res.before.hli)} and after ${f2(a.hli)}, each wall, roof and floor upgrade, window and door groups, openings, air tightness and ventilation. Signatures left blank.</p>${a.hli>2.3?'<p style="color:var(--warn)">The HLI after works is above 2.3. Add more upgrades first.</p>':''}</div><button class="btn primary" data-act="pdf-ta">Share PDF</button></div>
  <div class="doc"><div><h3>Home Energy Summary Report</h3><p>For the Home Energy Upgrade Loan: costs, grant, energy before and after, uplift and renewables.</p></div><button class="btn primary" data-act="pdf-sum">Share PDF</button></div>
  </div>
  <div class="card"><h2>Your comments</h2><p class="sub">These go into the reports as written.</p>
  <label class="field" style="margin-top:10px"><span>General comment for the Upgrade Report (shown after the ratings)</span><textarea data-bind="comments.general">${esc(cur.comments.general)}</textarea></label>
  <label class="field" style="margin-top:10px"><span>Commentary for the Technical Assessment Form (leave blank to write it for you)</span><textarea data-bind="comments.ta" placeholder="${esc(autoTaComment(res))}">${esc(cur.comments.ta)}</textarea></label></div>
  <div class="card"><h2>Backup</h2><p class="sub">Reports are saved on this device only. Save a backup file to move them to another device.</p><div class="row" style="margin-top:10px"><button class="btn" data-act="backup">Save backup file</button><button class="btn" data-act="restore">Restore from file</button><button class="btn danger" data-act="delete">Delete this report</button></div></div>`;
}
function viewPrices(){
  const P=settings.prices, U=settings.u;
  const L = {cwi:'Cavity wall insulation €/m²', ewi:'External wall insulation €/m²', iwi:'Internal wall insulation €/m²', floor:'Floor insulation €/m²', ceiling:'Ceiling (attic) insulation €/m²', rafter:'Rafter insulation €/m²', flat_ext:'Flat roof external €/m²', flat_int:'Flat/vaulted internal €/m²', win_dg:'Double glazing €/m²', win_tg:'Triple glazing €/m²', door_pvc:'PVC door € each', door_comp:'Composite door € each', airtape:'Air tightness tape €/m²', stove:'Stove', block_fire:'Block up fireplace', rm_secondary:'Remove secondary + block chimneys', boiler:'Boiler replacement', controls:'Heating controls', boiler_ctrl:'Boiler + controls', hp_45:'Heat pump 4.5 kW', hp_87:'Heat pump 8.7 kW', hp_11:'Heat pump 11 kW', hp_16:'Heat pump 16 kW', hp_full_extra:'Full heating system extra €/m² floor', ufh:'Underfloor piping €/m²', hp_air:'Air-to-air heat pump', closable:'Closable vent each', ext_fan:'Extract fan each', draft:'Draught proofing', airtest:'Air tightness works and test', led:'LED lighting', mvhr:'MVHR system', dcv:'Demand control ventilation', tech:'Technical assessment', battery:'Battery'};
  const pv = PV_SIZES.filter(x=>x[0]!=='0').map(([id,l])=>[ 'pv_'+id, 'Solar PV '+l]);
  const all=[...Object.entries(L), ...pv];
  return `<div class="card"><h2>Prices</h2><p class="sub">Used for every new upgrade. Change a price on one report from the Upgrades tab instead.</p><div class="grid3" style="margin-top:12px">
  ${all.map(([k,l])=>`<label class="field"><span>${esc(l)}</span><input inputmode="decimal" data-bind="settings.prices.${k}" value="${P[k]}"></label>`).join('')}</div></div>
  <div class="card"><h2>New U-values</h2><div class="grid3" style="margin-top:12px">${Object.keys(U).map(k=>`<label class="field"><span>${esc(MLABEL[k]||k)}</span><input inputmode="decimal" data-bind="settings.u.${k}" value="${U[k]}"></label>`).join('')}</div></div>
  <div class="card"><h2>Efficiencies and fees</h2><div class="grid3" style="margin-top:12px">
    <label class="field"><span>Heat pump space heating %</span><input inputmode="decimal" data-bind="settings.hp.effSpace" value="${settings.hp.effSpace}"></label>
    <label class="field"><span>Heat pump adjustment factor</span><input inputmode="decimal" data-bind="settings.hp.adj" value="${settings.hp.adj}"></label>
    <label class="field"><span>Heat pump hot water %</span><input inputmode="decimal" data-bind="settings.hp.effWater" value="${settings.hp.effWater}"></label>
    <label class="field"><span>New boiler efficiency %</span><input inputmode="decimal" data-bind="settings.hp.boilerEff" value="${settings.hp.boilerEff}"></label>
    <label class="field"><span>New stove efficiency %</span><input inputmode="decimal" data-bind="settings.hp.stoveEff" value="${settings.hp.stoveEff}"></label>
    <label class="field"><span>Overheads / project management %</span><input inputmode="decimal" data-bind="settings.pmPct" value="${settings.pmPct}"></label>
    <label class="field"><span>VAT on PV %</span><input inputmode="decimal" data-bind="settings.vatPv" value="${settings.vatPv}"></label>
    <label class="field"><span>Energy credits € per kWh saved</span><input inputmode="decimal" data-bind="settings.credit" value="${settings.credit}"></label>
  </div>
  <label class="row" style="margin-top:10px"><input type="checkbox" class="tog" data-bind="settings.includeHea" ${settings.includeHea?'checked':''}><span>Include the €350 home energy assessment grant</span></label>
  <label class="row" style="margin-top:10px"><input type="checkbox" class="tog" data-bind="settings.includePm" ${settings.includePm?'checked':''}><span>Include the One Stop Shop project management grant</span></label>
  <div class="row" style="margin-top:14px"><button class="btn danger" data-act="reset-prices">Reset to the REIL workbook prices</button></div></div>`;
}
function autoTaComment(res){
  if(!res) return '';
  const B=cur.before, a=res.after, cost=costing(res);
  const works=[...new Set(cost.rows.map(r=>r.measure.replace(/ to U .*/,'')))].slice(0,6).join(', ');
  return `Pre-works BER ${B.meta.ber||''} (${B.label}, HLI ${f2(B.heat.hli)}) ${B.heat.hli>2.3?'is above 2.3, so fabric upgrades are required for the heat pump grant.':'is at or below 2.3.'} Works recommended: ${works||'none yet'}. Projected HLI ${f2(a.hli)} W/K/m² (${f1(a.H)} W/K over ${f2(B.dims.tfa)} m²)${a.src==='DEAP'?', modelled in DEAP on a copy of the published BER':''}. Post-works BER must reflect all works, with HLI <= 2.3. Full detail in the BER Upgrade Report issued to the homeowner.`;
}

// ---------- events ----------
function setPath(obj, path, val){ const ks=path.split('.'); let o=obj; for(let i=0;i<ks.length-1;i++){ if(o[ks[i]]==null) o[ks[i]]={}; o=o[ks[i]]; } o[ks[ks.length-1]]=val; }
function getPath(obj, path){ return path.split('.').reduce((o,k)=>o==null?undefined:o[k], obj); }
document.addEventListener('change', e=>{
  const t=e.target;
  if(t.id==='pick'){ cur=reports.find(r=>r.id===t.value)||cur; render(); return; }
  if(t.id==='fileA'||t.id==='fileB'){ const f=t.files[0]; t.value=''; if(f) readPdf(f, t.id==='fileA'?'before':'after'); return; }
  if(t.dataset.el){
    const s=elState(t.dataset.el), f=t.dataset.f;
    const g=groups(cur.before).find(x=>x.id===t.dataset.el);
    if(f==='on'){ s.on=t.checked; if(s.on && !s.m) s.m=defaultMeasure(g); }
    else if(f==='m'){ s.m=t.value; s.u=null; s.rate=null; s.on=true; }
    else if(f==='u'){ s.u=toNum(t.value); if(!s.m) s.m=defaultMeasure(g); }
    else if(f==='rate'){ s.rate=toNum(t.value); if(!s.m) s.m=defaultMeasure(g); }
    save(); render(); return;
  }
  const b=t.dataset.bind; if(!b) return;
  let val = t.type==='checkbox' ? t.checked : t.value;
  if(t.getAttribute('inputmode')==='decimal') val = t.value.trim()==='' ? null : toNum(t.value);
  if(b.startsWith('settings.')) setPath(settings, b.slice(9), val); else setPath(cur, b, val);
  save(); render();
});
document.addEventListener('click', e=>{
  const tb=e.target.closest('[data-tab]'); if(tb){ tab=tb.dataset.tab; render(); window.scrollTo(0,0); return; }
  const a=e.target.closest('[data-act]'); if(!a) return;
  const act=a.dataset.act;
  if(act==='new'){ newReport(); return; }
  if(act==='pick-before'){ $('#fileA').click(); return; }
  if(act==='pick-after'){ $('#fileB').click(); return; }
  if(act==='clear-after'){ e.stopPropagation(); cur.after=null; cur.afterName=''; save(); render(); return; }
  if(act==='add-extra'){ (cur.up.extras=cur.up.extras||[]).push({label:'',cost:'',grant:''}); save(); render(); return; }
  if(act==='rm-extra'){ cur.up.extras.splice(+a.dataset.i,1); save(); render(); return; }
  if(act==='reset-prices'){ if(a.classList.contains('armed')){ settings.prices={...DEFAULT_SETTINGS.prices}; settings.u={...DEFAULT_SETTINGS.u}; settings.hp={...DEFAULT_SETTINGS.hp}; save(); render(); } else { a.classList.add('armed'); a.textContent='Tap again to reset'; } return; }
  if(act==='delete'){ if(a.classList.contains('armed')){ reports=reports.filter(r=>r!==cur); cur=reports[0]||null; save(); tab='import'; render(); } else { a.classList.add('armed'); a.textContent='Tap again to delete'; } return; }
  if(act==='backup'){ shareFile(new Blob([JSON.stringify({format:'ta-backup', reports, settings})],{type:'application/json'}), 'Upgrade reports backup '+new Date().toISOString().slice(0,10)+'.json'); return; }
  if(act==='restore'){ const i=document.createElement('input'); i.type='file'; i.accept='.json,application/json'; i.onchange=()=>{ const f=i.files[0]; if(!f) return; f.text().then(t=>{ const d=JSON.parse(t); if(d.format!=='ta-backup') throw 0; for(const r of d.reports) if(!reports.some(x=>x.id===r.id)) reports.push(r); if(d.settings) settings=deepMerge(settings,d.settings); save(); cur=reports[reports.length-1]; render(); toast('Restored '+d.reports.length+' report(s)'); }).catch(()=>toast('That is not a backup file from this app')); }; i.click(); return; }
  if(act==='pdf-hea'||act==='pdf-ta'||act==='pdf-sum'){ makePdf(act.slice(4)); return; }
});
$('#newBtn').addEventListener('click', newReport);
function newReport(){ cur=blank(); reports.push(cur); save(); tab='import'; render(); }
async function readPdf(file, which){
  toast('Reading '+file.name+'…');
  try{
    const lines = await pdfLines(pdfjsLib, new Uint8Array(await file.arrayBuffer()));
    const R = parseReport(lines);
    if(!R.dims.tfa || !R.heat.total) throw new Error('This does not look like a DEAP Dwelling Details Report.');
    cur[which]=R; cur[which+'Name']=file.name;
    if(which==='before'){ const c=cur.client; c.address1=c.address1||R.meta.address1||''; c.address2=c.address2||R.meta.address2||''; c.county=c.county||R.meta.county||''; c.eircode=c.eircode||R.meta.eircode||''; c.mprn=c.mprn||R.meta.mprn||''; }
    if(which==='after' && cur.before) fillFromAfter();
    save(); render(); toast('✓ Read '+(R.meta.address1||file.name));
  }catch(err){ console.error(err); toast(err.message||'Could not read that PDF'); }
}
// with a second report: switch on the elements whose U-value changed, with DEAP's new U-value
function fillFromAfter(){
  const B=cur.before, A=cur.after, u=cur.up;
  const gb=groups(B), ga=groups(A);
  const byKind=k=>[gb.filter(g=>g.kind===k), ga.filter(g=>g.kind===k)];
  for(const k of ['wall','roof','floor','door']){
    const [b,a]=byKind(k);
    b.forEach((g,i)=>{ const x=a[i]; if(!x) return; if(Math.abs(x.u-g.u)>0.005){ const s=elState(g.id); s.on=true; s.u=x.u; s.m=guessMeasure(g,x); } });
  }
  // windows: if the after report's glazing U-values are all lower, upgrade every group to the new average
  const [wb,wa]=byKind('window');
  if(wa.length && wb.length){
    const aArea=wa.reduce((s,g)=>s+g.area,0), aU=wa.reduce((s,g)=>s+g.area*g.u,0)/aArea;
    for(const g of wb) if(aU < g.u-0.005){ const s=elState(g.id); s.on=true; s.u=Math.round(aU*100)/100; s.m=aU<=1.2?'win_tg':'win_dg'; }
  }
  const h=A.heating;
  if(/heat pump/i.test(h.system||'') && !/heat pump/i.test(B.heating.system||'')){ u.heat.system = h.ufh&&!B.heating.ufh ? 'hpfull':'hp'; u.heat.effSpace=h.effMain; u.heat.adj=h.effAdjFactor||1; u.heat.effWater=h.effWater; }
  else if((h.effMainAdj||0)>(B.heating.effMainAdj||0)+1) u.heat.system='boiler';
  if(h.ufh && !B.heating.ufh) u.heat.ufh = !Object.values(u.el).some(s=>s.on&&s.m==='floor_ufh');
  if((A.heating.secFrac||0)===0 && (B.heating.secFrac||0)>0) u.sec='remove';
  const v=u.vent;
  v.chimneys=A.vent.chimneys.n; v.flues=A.vent.flues.n; v.fans=A.vent.fans.n; v.flueless=A.vent.flueless.n;
  if((A.vent.strippedPct||0)>(B.vent.strippedPct||0)) v.draft=true;
  if(/heat recovery|balanced/i.test(A.vent.method||'') && !/balanced/i.test(B.vent.method||'')) v.system='mvhr';
  else if(/extract/i.test(A.vent.method||'') && !/extract/i.test(B.vent.method||'')) v.system='dcv';
  if(A.vent.airTest && !B.vent.airTest) v.q50=String(Math.round((A.vent.airTestResult||0.25)*20*2)/2);
  const pvA=-(A.results.rows.pv?.delivered||0)-(A.results.rows.pvx?.delivered||0);
  if(pvA>0 && !(B.results.rows.pv?.delivered)){ const kwp=pvA/(0.8*1074); const best=PV_SIZES.filter(x=>x[0]!=='0').reduce((p,x)=>Math.abs(pvKwp(x[0])-kwp)<Math.abs(pvKwp(p[0])-kwp)?x:p); u.pv=best[0]; }
  if((A.light.efficacy||0)>(B.light.efficacy||0)+1) u.led=true;
  toast('Upgrades filled in from the second report. Check the measures and prices.');
}
function guessMeasure(b,a){
  const t=((a.desc||'')+' '+(a.type||'')).toLowerCase();
  if(b.kind==='wall') return /cavity|bead|pump/.test(t)?'cwi': /internal|dry|board|lining/.test(t)?'iwi': /cavity/i.test(b.type)?'cwi':'ewi';
  if(b.kind==='roof') return /flat/.test((b.type||'').toLowerCase())?'flat_ext': /rafter|slop|vault/.test(t)?'rafter':'ceiling';
  if(b.kind==='floor') return /underfloor|ufh/.test(t)||cur.after.heating.ufh?'floor_ufh':'floor';
  if(b.kind==='door') return a.u<=1.2?'door_comp':'door_pvc';
  return '';
}
function shareFile(blob, name){
  const file = new File([blob], name, {type:blob.type});
  if(navigator.canShare && navigator.canShare({files:[file]})){ navigator.share({files:[file], title:name}).catch(()=>{}); return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},1000);
}
let toastT; function toast(msg){ let el=document.querySelector('.toast'); if(!el){ el=document.createElement('div'); el.className='toast'; document.body.appendChild(el); } el.textContent=msg; clearTimeout(toastT); toastT=setTimeout(()=>el.remove(),3500); }

cur = reports[reports.length-1] || null;
render();
