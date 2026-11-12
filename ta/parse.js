// Reads the lines of a DEAP 4 "Dwelling Details Report" (see pdftext.js) into one object.
// Every number the upgrade calculation needs comes from here, so a report from DEAP is the only input.
(function(g){
const num = s => { if(s==null) return null; const m=String(s).replace(/,/g,'').match(/-?\d+(\.\d+)?/); return m?parseFloat(m[0]):null; };
const isNum = s => /^-?[\d,]+(\.\d+)?$/.test(String(s).trim());
const HEADER_JUNK = /^(Dwelling Details Report|Date report created|Page \d+\/\d+)/;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function parseReport(lines){
  lines = lines.filter(l=>!HEADER_JUNK.test(l.text.trim()));
  const R = {warnings:[]};
  // value to the right of a label cell. opts.from: only search after this line index; opts.nth: which match
  const findCell = (re, opts={}) => {
    let n = opts.nth||0;
    for(let i=opts.from||0;i<(opts.to||lines.length);i++){
      const cs=lines[i].cells;
      for(let j=0;j<cs.length;j++) if(re.test(cs[j].s)){ if(n--) continue; return {i,j}; }
    }
    return null;
  };
  const kv = (re, opts={}) => {
    const f=findCell(re,opts); if(!f) return null;
    const cs=lines[f.i].cells;
    // value is the next cell to the right, on the same line, within the same half of the page
    const lab=cs[f.j];
    for(let j=f.j+1;j<cs.length;j++){ if(lab.x<300 && cs[j].x>=305 && !opts.far) break; return cs[j].s; }
    return null;
  };
  const kn = (re,opts) => num(kv(re,opts));
  const idx = re => lines.findIndex(l=>re.test(l.text));

  // ---- property ----
  R.meta = {
    mprn: kv(/^M ?PRN$/), ber: kv(/^BER Number$/),
    address1: kv(/^Address line 1$/), address2: kv(/^Address line 2$/), address3: kv(/^Address line 3$/),
    county: kv(/^County$/), eircode: kv(/^Eircode$/), dwellingType: kv(/^Dwelling Type$/),
    year: kv(/^Year of construction$/), extension: kv(/^Dwelling Extension$/), storeys: kv(/^Storeys$/),
    ratingType: kv(/^Type of Rating$/), purpose: kv(/^Purpose of Rating$/),
    assessor: kv(/^Assessor Name$/), assessorNo: kv(/^Assessor Number$/), date: kv(/^Date of Assessment$/),
    description: kv(/^Assessor Description$/)
  };
  // ---- dimensions ----
  const fl = [['Ground floor','ground'],['First floor','first'],['Second floor','second'],['Third and other floors','third'],['Room in Roof','rir']];
  R.dims = {floors:[]};
  for(const [lab,key] of fl){
    const f=findCell(new RegExp('^'+lab+'$')); if(!f) continue;
    const ns=lines[f.i].cells.slice(f.j+1).map(c=>num(c.s));
    if(ns.length>=3 && ns[0]>0) R.dims.floors.push({key, name:lab, area:ns[0], height:ns[1], volume:ns[2]});
  }
  { const f=findCell(/^Totals$/); if(f){ const ns=lines[f.i].cells.slice(f.j+1).map(c=>num(c.s)); R.dims.tfa=ns[0]; R.dims.volume=ns[ns.length-1]; } }
  R.dims.livingArea = kn(/^Living Area$/);
  R.dims.livingPct = kn(/^Living Area Percentage$/);

  // ---- ventilation ----
  const vrow = lab => { const f=findCell(new RegExp('^'+lab)); if(!f) return {n:0,m3h:0}; const ns=lines[f.i].cells.slice(f.j+1).map(c=>num(c.s)); return {n:ns[0]||0, m3h:ns[1]||0}; };
  R.vent = {
    chimneys: vrow('Chimneys'), flues: vrow('Open Flues'), fans: vrow('Fans & vents'), flueless: vrow('Flueless combustion'),
    airTest: /yes/i.test(kv(/^Has an air permeability test/)||''),
    lobby: /yes/i.test(kv(/^Is there a draught lobby/)||''),
    structural: kn(/^Infiltration rate due to structure/), lobbyAch: kn(/^Draught lobby air change/),
    openingsAch: kn(/^Openings infiltration/), intermediate: kn(/^Intermediate infiltration rate/),
    structure: kv(/^Structure type$/), sheltered: kn(/^Number of sides sheltered/),
    suspended: (()=>{ const f=findCell(/^Is there a suspended wooden ground/); if(!f) return ''; const a=lines[f.i].cells[f.j+1]?.s||''; const b=findCell(/^\(?(Unsealed|Sealed)\)?$/); return a+(b?' '+lines[b.i].cells[b.j].s:''); })(),
    adjusted: kn(/^Adjusted infiltration rate/), effective: kn(/^Effective air change rate/),
    loss: kn(/^Ventilation heat loss \[W\/K\]/), openings: kn(/^Number of openings$/), stripped: kn(/^Number of draught stripped/),
    strippedPct: kn(/^Windows\/doors\/attic hatches draught/), airTestResult: kn(/^Adjusted result of air permeability/),
    sfp: kn(/^Specific fan power/), hx: kn(/^Heat exchanger efficiency/), method: kv(/^Ventilation method$/), fanKwh: kn(/^Electricity for ventilation fans/)
  };

  // ---- building element tables ----
  R.floors = table('Floors', {type:[0,105], desc:[105,170], uf:[170,215]}, 3);
  R.roofs  = table('Roofs',  {type:[0,150], desc:[150,240], thick:[290,350]}, 3);
  R.walls  = table('Walls',  {type:[0,170], desc:[170,255], semi:[255,295]}, 3);
  R.doors  = table('Doors',  {count:[0,80], type:[80,210], desc:[210,425]}, 3);
  R.windows= table('Windows',{count:[0,75], glazing:[75,205], frame:[205,295], g:[295,340], inroof:[340,380], shading:[380,425], orient:[425,470]}, 2);
  for(const f of R.floors){ const ns=f._row.filter(c=>c.x>380&&c.x<430); f.perimeter=ns.length?num(ns[0].s):null; f.area=f.n[0]; f.u=f.n[1]; f.au=f.n[2]; f.heatLoss = !/non-heat loss/i.test(f.type) && f.u>0; }
  for(const r of R.roofs){ r.area=r.n[0]; r.u=r.n[1]; r.au=r.n[2]; r.thick=num(r.thick); }
  for(const w of R.walls){ w.area=w.n[0]; w.u=w.n[1]; w.au=w.n[2]; w.semi=/yes/i.test(w.semi||''); }
  for(const d of R.doors){ d.area=d.n[0]; d.u=d.n[1]; d.au=d.n[2]; d.count=num(d.count)||1; }
  for(const w of R.windows){ w.area=w.n[0]; w.u=w.n[1]; w.count=num(w.count)||1; w.ff=num((w.frame||'').split(' ').pop()); w.frame=(w.frame||'').replace(/\s*[\d.]+$/,''); w.g=num(w.g); w.inroof=/yes/i.test(w.inroof||''); }
  for(const k of ['floors','roofs','walls','doors','windows']) for(const e of R[k]){ delete e._row; delete e.n; }

  function table(name, cols, nNums){
    const start = idx(new RegExp('^\\s*Building Elements - '+name));
    if(start<0) return [];
    let end = lines.findIndex((l,i)=>i>start && /^Total area/.test(l.text.trim()));
    if(end<0) end=lines.length;
    // header rows sit above the first data row; data rows end with nNums numbers on the right of the page
    const rowsIdx=[];
    for(let i=start+1;i<end;i++){
      const cs=lines[i].cells; if(cs.length<nNums) continue;
      const tail=cs.slice(-nNums);
      if(tail.every(c=>isNum(c.s)) && tail[0].x>400 && /\./.test(tail[0].s)) rowsIdx.push(i);
    }
    const out=[];
    const junk=/^(Type|Description|Count|Glazing Type|Frame|Factor|Transm\.|Solar|In Roof|In|Roof|Over|shading|Orient\.|Area|U-?Value|U-value|U-|Value|Heat|Loss|\(AU\)|\[.*\]|2|Include in|Include|in|compliance|check|Age Band|Exposed|Perimeter|U\/F|Heating|Insulation|Thickness|Wall is|semi-|exposed)$/;
    // header lines end at the first line that has text but is not a header word
    let hdrEnd=start;
    for(let i=start+1;i<end;i++){ if(lines[i].cells.every(c=>junk.test(c.s))) hdrEnd=i; else break; }
    // text cells wrap over several lines; lines of one column that sit close together form one cell,
    // and the cell belongs to the data row whose line falls inside it (or the nearest one)
    const rows=rowsIdx.map(ri=>({ri, L:lines[ri], e:{_row:lines[ri].cells, n:lines[ri].cells.slice(-nNums).map(c=>num(c.s))}, b:{}}));
    rows.forEach(r=>{ for(const c in cols) r.b[c]=[]; });
    for(const col in cols){
      const [a,b]=cols[col];
      const pieces=[];
      for(let i=hdrEnd+1;i<end;i++){
        const l=lines[i];
        for(const c of l.cells){ if(c.x<a||c.x>=b) continue; if(!rowsIdx.includes(i) && junk.test(c.s)) continue; if(rowsIdx.includes(i) && isNum(c.s) && c.x>400) continue; pieces.push({page:l.page,y:l.y,s:c.s}); }
      }
      // group into blocks
      const blocks=[];
      for(const p of pieces){
        const last=blocks[blocks.length-1];
        if(last && last.page===p.page && last.items[last.items.length-1].y - p.y < 13.5) last.items.push(p);
        else blocks.push({page:p.page, items:[p]});
      }
      for(const bl of blocks){
        const ys=bl.items.map(p=>p.y), top=Math.max(...ys), bot=Math.min(...ys), mid=(top+bot)/2;
        let best=null, bd=Infinity;
        for(const r of rows){ if(r.L.page!==bl.page) continue; const inside=r.L.y<=top+1 && r.L.y>=bot-1; const d=inside?-1:Math.abs(r.L.y-mid); if(d<bd){bd=d;best=r;} }
        if(best) best.b[col].push(...bl.items);
      }
    }
    for(const r of rows){ for(const col in cols) r.e[col]=r.b[col].sort((x,y)=>y.y-x.y).map(x=>x.s).join(' ').replace(/\s+/g,' ').trim(); out.push(r.e); }
    const totLine=lines[end]; if(totLine){ const t=num(totLine.cells[totLine.cells.length-1].s); out.totalArea=t; }
    return out;
  }

  // ---- heat loss ----
  R.heat = {
    glazedArea: kn(/^Total glazed area/), glazedLoss: kn(/^Total glazed heat loss/), plane: kn(/^Total plane heat loss/),
    elementArea: kn(/^Total element area/), tb: kn(/^Thermal bridging factor/), fabric: kn(/^Fabric heat loss \[W\/K\]/),
    total: kn(/^Total heat loss \[W\/K\]/), hliReported: kn(/^Per m2$/)
  };
  R.heat.hli = R.heat.total && R.dims.tfa ? R.heat.total/R.dims.tfa : R.heat.hliReported;

  // ---- lighting, hot water ----
  R.light = { efficacy: kn(/^Average Efficacy/), kwh: kn(/^Annual energy used for lighting/) };
  R.water = {
    demand: kn(/^Total hot water demand/), outMain: kn(/^Output from main water heater/), outSupp: kn(/^Output from supplementary heater/),
    cylinder: kn(/^Water storage volume/), electricShowers: kn(/^Number of electric showers/), mixerShowers: kn(/^Number of mixer showers/),
    baths: kn(/^Number of baths/), occupants: kn(/^Standard number of occupants/), solar: /yes/i.test(kv(/^Is there a solar water heating system/)||''),
    insulation: kv(/^Insulation type$/), insThick: kn(/^Insulation thickness/), primaryLossType: kv(/^Primary Circuit loss type/, {far:true})
  };

  // ---- space heat demand ----
  R.demand = { heatUseSeason: kn(/^Heat use during heating season/), heatUseYear: kn(/^Heat use for full year/), tReq: kn(/^Required mean internal temperature/), massCat: kv(/^Thermal mass category/) };
  { const f=findCell(/^Internal heat capacity \[M ?J\/K\]$/); if(f){ const ns=lines[f.i].cells.slice(f.j+1).map(c=>num(c.s)); R.demand.capMJ=ns[0]; R.demand.capMJint=ns[1]; } }
  { const f=findCell(/^Internal heat capacity of dwelling/); if(f){ const ns=lines[f.i].cells.slice(f.j+1).map(c=>num(c.s)); R.demand.capPerM2=ns[0]; } }
  R.monthly=[];
  const mStart = idx(/^\s*Space heat demand details/);
  if(mStart>=0) for(let i=mStart;i<Math.min(lines.length,mStart+40);i++){
    const cs=lines[i].cells; const m=MONTHS.indexOf(cs[0]?.s);
    if(m>=0 && cs.length>=10){ const n=cs.slice(1).map(c=>num(c.s)); R.monthly[m]={text:n[0], tint:n[1], loss:n[2], kwh:n[3], ratio:n[4], util:n[5], useW:n[6], useful:n[7], solar:n[8]}; }
  }

  // ---- heating systems ----
  R.heating = {
    tempAdj: kn(/^Temperature adjustment/), extra: kn(/^Additional heat emissions due to non/), control: kn(/^Heating system control category/),
    respons: kn(/^Heating system responsiveness category/), gross: kn(/^Gross heat emission to heated space/),
    usefulGain: kn(/^Useful net gain/), net: kn(/^Net heat emission to heated space/), annualReq: kn(/^Annual space heating requirement/),
    system: kv(/^Heating System$/, {far:true}), lowTemp: kv(/^dwelling able to work at low/), ufh: /yes/i.test(kv(/^Is there underfloor heating/)||''),
    effMain: kn(/^Efficiency of main heating system/), effAdjFactor: kn(/^Efficiency adjustment factor$/), effMainAdj: kn(/^Adjusted efficiency of main heating/),
    secFrac: kn(/^Fraction of heat from secondary system/), effSec: kn(/^Efficiency of secondary system/),
    mainReq: kn(/^Energy required for main heating system/), secReq: kn(/^Energy required for secondary heating/),
    effWater: kn(/^Water Heating Efficiency/), effWaterAdj: kn(/^Adj\. efficiency of main water heating/),
    hpType: kv(/^Heat Pump Type$/), manufacturer: kv(/^M ?anufacturer name$/), model: kv(/^M ?odel name$/)
  };
  if(R.heating.secFrac==null) R.heating.secFrac=0;
  // primary energy and CO2 factors per use
  R.fuels={};
  for(const [lab,key] of [['^M ?ain space heating system','main'],['^Secondary space heating system','sec'],['^M ?ain water heating system','water'],['^Supplementary water heating system','supp'],['^Pumps, fans','pumps'],['^Energy for lighting','light']]){
    const f=findCell(new RegExp(lab+'$')); if(!f) continue;
    const cs=lines[f.i].cells.slice(f.j+1);
    if(cs.length>=3) R.fuels[key]={fuel:cs[0].s, pef:num(cs[1].s), co2:num(cs[2].s)};
  }
  // ---- results ----
  const rs = idx(/^\s*Results$/);
  R.results={rows:{}};
  if(rs>=0){
    const rowKeys=[['ain space heating system','main'],['Secondary space heating system','sec'],['ain water heating system','water'],['Supplementary water heating system','supp'],['Cooling','cool'],['Pumps and fans','pumps'],['Energy for lighting','light'],['Photovoltaic / Wind Turbine used on site','pv'],['Photovoltaic / Wind Turbine exported','pvx'],['Thermal Renewables - energy produced','thermal'],['Total','total'],['Per m2? floor area','perm2']];
    for(const [lab,key] of rowKeys){
      const f=findCell(new RegExp('^(M ?)?'+lab), {from:rs}); if(!f) continue;
      const ns=lines[f.i].cells.slice(f.j+1).map(c=>num(c.s));
      if(ns.length>=3) R.results.rows[key]={delivered:ns[0], primary:ns[1], co2:ns[2]};
    }
    R.rating = kv(/^Energy Rating$/, {from:rs, far:true});
  }
  const pm=R.results.rows.perm2;
  if(pm){ R.energyValue=pm.primary; R.co2Value=pm.co2; R.deliveredPerM2=pm.delivered; }
  R.label = berLabel(R.energyValue);

  // ---- self checks ----
  const sumAU = [...R.walls,...R.roofs,...R.floors,...R.doors].reduce((s,e)=>s+(e.au||0),0) + (R.heat.glazedLoss||0);
  if(R.heat.plane && Math.abs(sumAU-R.heat.plane)>Math.max(1,R.heat.plane*0.01)) R.warnings.push('Element heat losses add to '+sumAU.toFixed(1)+' W/K but the report says '+R.heat.plane+' W/K. Some rows may not have been read.');
  if(!R.dims.tfa) R.warnings.push('Floor area not found.');
  if(R.monthly.filter(Boolean).length<12) R.warnings.push('Monthly heat demand table not complete, energy estimate may be off.');
  if(!R.energyValue) R.warnings.push('Energy value not found.');
  return R;
}
// SEAI BER scale (kWh/m²/yr primary energy)
const BANDS=[[25,'A1'],[50,'A2'],[75,'A3'],[100,'B1'],[125,'B2'],[150,'B3'],[175,'C1'],[200,'C2'],[225,'C3'],[260,'D1'],[300,'D2'],[340,'E1'],[380,'E2'],[450,'F']];
function berLabel(v){ if(v==null||isNaN(v)) return ''; for(const [t,l] of BANDS) if(v<=t) return l; return 'G'; }
g.parseReport=parseReport; g.berLabel=berLabel;
if(typeof module!=='undefined') module.exports={parseReport, berLabel};
})(typeof window!=='undefined'?window:globalThis);
