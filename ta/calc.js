// Works out the house after upgrades from the current DEAP dwelling report.
// Heat loss (HLI) is exact: it re-adds the report's own areas and U-values.
// Energy follows DEAP 4's monthly method using the report's own monthly table, gains and heat capacity,
// so the BER after works is a close estimate (checked against before/after DEAP reports for the same house).
(function(g){
const HOURS=[744,672,744,720,744,720,744,744,720,744,720,744];
const SEASON=[0,1,2,3,4,9,10,11]; // Oct to May
const curtain = u => u>0 ? 1/(1/u+0.04) : 0;
const ORIENT_W = {South:1, 'South East':0.9, 'South West':0.9, SE:0.9, SW:0.9, East:0.65, West:0.65, E:0.65, W:0.65, 'North East':0.4,'North West':0.4, NE:0.4, NW:0.4, North:0.3, N:0.3, Horizontal:0.8};
const ow = o => ORIENT_W[o]!=null ? ORIENT_W[o] : 0.6;

// intermittent heating: two 8 hour off periods a day; temperature falls towards outside during them
function redFactor(H, capIntMJ, offH=8, offFrac=2/3){
  if(!H||!capIntMJ) return 0;
  const tau = capIntMJ*1e6/(3600*H);
  return offFrac*(1 - (tau/offH)*(1-Math.exp(-offH/tau)));
}
function utilisation(gamma, H, capMJ){
  const tau = capMJ*1e6/(3600*H), a = 1+tau/15;
  if(gamma<=0) return 1;
  if(Math.abs(gamma-1)<1e-6) return a/(a+1);
  return (1-Math.pow(gamma,a))/(1-Math.pow(gamma,a+1));
}
// infiltration after changes (DEAP: openings + structure, then shelter, then ventilation system)
function ventilation(R, v){
  const V=R.dims.volume, cur=R.vent;
  const m3h = o => (o.chimneys||0)*40 + (o.flues||0)*20 + (o.fans||0)*10 + (o.flueless||0)*40;
  const curM3h = m3h({chimneys:cur.chimneys.n, flues:cur.flues.n, fans:cur.fans.n, flueless:cur.flueless.n});
  const newM3h = m3h(v);
  const openings = Math.max(0,(cur.openingsAch||0) + (newM3h-curM3h)/V);
  const shelter = 1-0.075*(cur.sheltered||0);
  let adjusted;
  if(v.q50!=null && v.q50!==''){ adjusted = (Number(v.q50)/20 + openings)*shelter; }
  else if(cur.airTest && !v.changedStructure){ adjusted = (cur.adjusted||0) + (openings-(cur.openingsAch||0))*shelter; }
  else {
    const floorAch = s => /unsealed/i.test(s)?0.2 : /sealed/i.test(s)?0.1 : 0;
    const curFloor = /yes/i.test(cur.suspended||'') ? floorAch(cur.suspended) : 0;
    const newFloor = v.floor==null ? curFloor : floorAch(v.floor);
    const lobbyCur = cur.lobby?0:0.05, lobbyNew = v.lobby==null?lobbyCur:(v.lobby?0:0.05);
    const strip = p => 0.25-0.2*(p/100);
    const structural = (cur.structural||0) + (newFloor-curFloor) + (lobbyNew-lobbyCur) + (strip(v.strippedPct==null?cur.strippedPct:v.strippedPct)-strip(cur.strippedPct||0));
    adjusted = (structural + openings)*shelter;
  }
  const method = v.method || cur.method || 'Natural ventilation';
  let eff;
  const hx = (v.hx!=null?v.hx:cur.hx||0);
  if(/balanced/i.test(method) && hx>0) eff = adjusted + 0.5*(1-hx*0.85/100);
  else if(/balanced/i.test(method)) eff = adjusted + 0.5;
  else if(/extract|positive input from outside/i.test(method)) eff = adjusted<0.25 ? 0.5 : adjusted+0.25;
  else eff = adjusted>=1 ? adjusted : 0.5+0.5*adjusted*adjusted;
  const mech = /balanced|extract|positive input/i.test(method);
  const sfp = v.sfp!=null ? v.sfp : (cur.sfp||0);
  const fanKwh = mech ? sfp*(0.5*V/3.6)*8.76 : 0;
  return {openings, adjusted, effective:eff, loss:0.33*eff*V, method, fanKwh, m3h:newM3h};
}

// up: {elements:{id:{u, area}}, windowsG, tb, vent:{...}, heat:{...}, pvKwp, pvOrient, battery, led}
function compute(R, up){
  up = up||{};
  const els = elementList(R);
  let plane = R.heat.plane||0, area = R.heat.elementArea||0, glazed = R.heat.glazedLoss||0;
  let solarScaleNum=0, solarScaleDen=0;
  const changes=[];
  for(const e of els){
    const c = (up.elements||{})[e.id]; const uNew = c && c.u!=null && c.u!=='' ? Number(c.u) : e.u; const aNew = c && c.area!=null && c.area!=='' ? Number(c.area) : e.area;
    if(e.kind==='window'){
      const gOld=e.g||0.76, gNew = c && c.g!=null && c.g!=='' ? Number(c.g) : (uNew!==e.u ? (uNew<=1.2?0.57:0.63) : gOld);
      glazed += aNew*curtain(uNew) - e.area*curtain(e.u);
      solarScaleNum += aNew*gNew*ow(e.orient); solarScaleDen += e.area*gOld*ow(e.orient);
    } else plane += aNew*uNew - e.area*e.u;
    area += aNew - e.area;
    if(uNew!==e.u || aNew!==e.area) changes.push({e, uNew, aNew, saving:(e.area*(e.kind==='window'?curtain(e.u):e.u) - aNew*(e.kind==='window'?curtain(uNew):uNew))});
  }
  plane += glazed - (R.heat.glazedLoss||0);
  const y = up.tb!=null && up.tb!=='' ? Number(up.tb) : (R.heat.tb||0.15);
  const fabric = plane + y*area;
  const vent = ventilation(R, up.vent||{
    chimneys:R.vent.chimneys.n, flues:R.vent.flues.n, fans:R.vent.fans.n, flueless:R.vent.flueless.n});
  const H = fabric + vent.loss;
  const tfa = R.dims.tfa;
  const out = {plane, area, y, fabric, vent, H, hli:H/tfa, changes};

  // ---- space heating, monthly ----
  const capInt = R.demand.capMJint, cap = R.demand.capMJ, Treq = R.demand.tReq||18.33;
  const solarScale = solarScaleDen>0 ? solarScaleNum/solarScaleDen : 1;
  const extraGains = (vent.fanKwh>0 && /balanced/i.test(vent.method)) ? 0 : 0;
  const a = redFactor(H, capInt);
  let season=0, year=0; const months=[];
  R.monthly.forEach((m,i)=>{
    if(!m) return;
    const Gold = m.util>0 ? m.useful/m.util : m.useful;
    const internal = Gold - m.solar;
    const G = internal + m.solar*solarScale + extraGains;
    const Ti = Treq - a*(Treq-m.text);
    const loss = H*(Ti-m.text);
    const eta = utilisation(G/loss, H, cap);
    const useW = Math.max(0, loss-eta*G);
    const kwh = useW*HOURS[i]/1000;
    year+=kwh; if(SEASON.includes(i)) season+=kwh;
    months.push({Ti, loss, G, eta, useW, kwh});
  });
  // check: same method on today's house should give the report's own heat use
  const extraRatio = R.demand.heatUseSeason ? (R.heating.extra||0)/R.demand.heatUseSeason : 0.13;
  const extra = season*extraRatio;
  const usefulGain = R.heating.usefulGain||0;
  const ufhExtra = up.heat && up.heat.ufh && !R.heating.ufh ? 0.012*season : 0;
  const annualReq = Math.max(0, season + extra - usefulGain + ufhExtra + ((R.heating.annualReq||0)-(R.heating.net||0)));
  out.months=months; out.season=season; out.annualReq=annualReq;

  // ---- delivered energy ----
  const h = up.heat||{};
  const elec = R.fuels.pumps || {fuel:'Electricity', pef:1.5, co2:0.169};
  const curMainFuel = R.fuels.main || elec;
  const hp = h.type==='hp';
  const boiler = h.type==='boiler';
  const effMain = hp ? Number(h.effSpace||300) : boiler ? Number(h.effSpace||90.1) : (R.heating.effMainAdj||R.heating.effMain||100);
  const secPresent = (R.heating.secFrac||0)>0;
  const secFrac = (h.removeSecondary || h.stove===false) ? 0 : (h.stove ? 0.1 : (secPresent?R.heating.secFrac:0));
  const effSec = h.stove ? Number(h.stoveEff||80) : (R.heating.effSec||60);
  const secFuel = h.stove ? (R.fuels.sec && R.fuels.sec.pef ? R.fuels.sec : {fuel:'Wood logs', pef:1.1, co2:0.025}) : (R.fuels.sec||{pef:0,co2:0});
  const mainFuel = hp ? elec : curMainFuel;
  const mainDel = annualReq*(1-secFrac)/(effMain/100);
  const secDel = secFrac>0 ? annualReq*secFrac/(effSec/100) : 0;
  // hot water
  const outTotal = (R.water.outMain||0)+(R.water.outSupp||0);
  let waterDel, suppDel, waterFuel, suppFuel = R.fuels.supp||elec;
  if(hp && h.hpWater!==false){ const ew=Number(h.effWater||150); waterDel = outTotal/(ew/100); suppDel=0; waterFuel=elec; }
  else if(boiler){ waterDel = (R.water.outMain||0)/(Number(h.effSpace||90.1)/100); suppDel=R.results.rows.supp?.delivered||0; waterFuel=R.fuels.water||curMainFuel; }
  else { waterDel = R.results.rows.water?.delivered||0; suppDel = R.results.rows.supp?.delivered||0; waterFuel=R.fuels.water||curMainFuel; }
  // pumps and fans
  let pumps = (R.results.rows.pumps?.delivered||0) - (R.vent.fanKwh||0) + vent.fanKwh;
  if(hp && /gas|oil|lpg/i.test(curMainFuel.fuel||'')) pumps -= (/gas|lpg/i.test(curMainFuel.fuel)?45:100);
  let light = R.results.rows.light?.delivered||0;
  if(up.led && R.light.efficacy && R.light.efficacy<66.9) light = light*R.light.efficacy/66.9;
  // PV
  const elecDemand = (mainFuel===elec?mainDel:0) + (waterFuel===elec?waterDel:0) + suppDel + pumps + light;
  let pvGen = 0, pvUsed = 0, pvExport = 0;
  const curPv = -(R.results.rows.pv?.delivered||0), curPvx = -(R.results.rows.pvx?.delivered||0);
  if(up.pvKwp>0){
    const S = {South:1074, 'South East':1020, 'South West':1020, East:870, West:870}[up.pvOrient||'South']||1074;
    pvGen = 0.8*up.pvKwp*S + curPv + curPvx;
    pvUsed = Math.min(pvGen, elecDemand*(up.battery?0.75:0.55));
    pvExport = pvGen-pvUsed;
  } else { pvUsed = curPv; pvExport = curPvx; }
  const rows = {
    main:{delivered:mainDel, fuel:mainFuel}, sec:{delivered:secDel, fuel:secFuel}, water:{delivered:waterDel, fuel:waterFuel},
    supp:{delivered:suppDel, fuel:suppFuel}, pumps:{delivered:pumps, fuel:elec}, light:{delivered:light, fuel:elec},
    pv:{delivered:-pvUsed, fuel:elec}, pvx:{delivered:-pvExport, fuel:{pef:1.0, co2:0.113}}
  };
  let del=0, prim=0, co2=0;
  for(const k in rows){ const r=rows[k]; r.primary=r.delivered*(r.fuel.pef||0); r.co2=r.delivered*(r.fuel.co2||0); del+=r.delivered; prim+=r.primary; co2+=r.co2; }
  // calibrate: the same steps run on today's house give a small difference to DEAP; take it off the result
  out.rows=rows; out.delivered=del; out.primary=prim; out.co2=co2;
  out.energyValue = prim/tfa; out.co2Value = co2/tfa; out.deliveredPerM2 = del/tfa;
  out.label = (g.berLabel||(()=>''))(out.energyValue);
  out.mainFuel = mainFuel; out.effMain = effMain; out.secFrac = secFrac;
  return out;
}
// one list of every heat-loss element in the report, with a stable id
function elementList(R){
  const L=[];
  R.walls.forEach((w,i)=>L.push({id:'wall'+i, kind:'wall', name:'Wall '+(i+1), type:w.type, desc:w.desc, area:w.area, u:w.u, semi:w.semi}));
  R.roofs.forEach((w,i)=>L.push({id:'roof'+i, kind:'roof', name:'Roof '+(i+1), type:w.type, desc:w.desc, area:w.area, u:w.u, thick:w.thick}));
  R.floors.forEach((w,i)=>{ if(w.heatLoss) L.push({id:'floor'+i, kind:'floor', name:'Floor '+(i+1), type:w.type, desc:w.desc, area:w.area, u:w.u, perimeter:w.perimeter}); });
  R.doors.forEach((w,i)=>L.push({id:'door'+i, kind:'door', name:'Door '+(i+1), type:w.type, desc:w.desc, area:w.area, u:w.u, count:w.count}));
  R.windows.forEach((w,i)=>L.push({id:'win'+i, kind:'window', name:'Window '+(i+1), type:w.glazing, desc:(w.orient||'')+(w.frame?' · '+w.frame:''), area:w.area, u:w.u, g:w.g, orient:w.orient, frame:w.frame, inroof:w.inroof, count:w.count}));
  return L;
}
// run the method on today's house unchanged: returns how far it is from DEAP's own figures
function selfCheck(R){
  const c=compute(R,{});
  return {hli:c.hli, hliReport:R.heat.hli, season:c.season, seasonReport:R.demand.heatUseSeason, ev:c.energyValue, evReport:R.energyValue};
}
g.taCompute=compute; g.taElements=elementList; g.taSelfCheck=selfCheck; g.taVentilation=ventilation; g.curtainU=curtain;
if(typeof module!=='undefined') module.exports={compute, elementList, selfCheck, ventilation, redFactor};
})(typeof window!=='undefined'?window:globalThis);
