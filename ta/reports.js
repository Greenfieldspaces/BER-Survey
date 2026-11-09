// The three PDFs: BER Upgrade Report, SEAI Technical Assessment Form, Home Energy Summary Report.
'use strict';
const NAVY=[54,59,72], GREEN=[11,122,69], SOFT=[214,237,225], GREY=[90,107,99], LINE=[201,211,206];
const SPEC = { // insulation used to estimate thickness on the TA form (contractor to confirm product)
  cwi:{type:'Bonded bead in cavity', loc:'Cavity', k:0.033}, ewi:{type:'EPS (graphite) external insulation system', loc:'External', k:0.031},
  iwi:{type:'Insulated boards (PIR)', loc:'Internal (dry-lining)', k:0.022}, ceiling:{type:'Mineral wool', loc:'Between and over ceiling joists', k:0.044},
  rafter:{type:'Insulated boards (PIR)', loc:'Between and under rafters', k:0.022}, flat_ext:{type:'Insulated boards (PIR), warm roof', loc:'Over the deck', k:0.022},
  flat_int:{type:'Insulated boards (PIR)', loc:'Internal, under the ceiling', k:0.022}, floor:{type:'Rigid insulation boards (PIR)', loc:'Under new slab / between joists', k:0.022},
  floor_ufh:{type:'Rigid insulation boards (PIR)', loc:'Under new slab and screed, perimeter upstands', k:0.022}
};
function thick(m, u0, u1){ const s=SPEC[m]; if(!s||!u0||!u1||u1>=u0) return ''; const t=s.k*(1/u1-1/u0)*1000; return String(Math.max(10,Math.round(t/10)*10)); }
const RECO = {
  cwi:u=>`Fill the cavity with bonded bead insulation to bring the U-value to about ${f2(u)} W/m²K.`,
  ewi:u=>`Insulate the walls externally (insulation board and render system) to bring the U-value to about ${f2(u)} W/m²K.`,
  iwi:u=>`Dry-line the walls internally with insulated boards to bring the U-value to about ${f2(u)} W/m²K. Fit an airtightness membrane and tape all junctions.`,
  ceiling:u=>`Top up the attic insulation to about 300 mm between and over the ceiling joists, U-value about ${f2(u)} W/m²K. Insulate and draught strip the attic hatch.`,
  rafter:u=>`Insulate between and under the rafters, U-value about ${f2(u)} W/m²K, keeping the required ventilation gap.`,
  flat_ext:u=>`Insulate the flat roof externally (warm roof), U-value about ${f2(u)} W/m²K.`,
  flat_int:u=>`Insulate the roof internally under the ceiling, U-value about ${f2(u)} W/m²K.`,
  floor:u=>`Insulate the floor, U-value about ${f2(u)} W/m²K.`,
  floor_ufh:u=>`Replace the floor with an insulated slab and underfloor heating, U-value about ${f2(u)} W/m²K.`,
  win_dg:u=>`Replace with new double glazed windows, U-value about ${f2(u)} W/m²K, fitted with airtightness tape.`,
  win_tg:u=>`Replace with new triple glazed windows, U-value about ${f2(u)} W/m²K, fitted with airtightness tape.`,
  door_pvc:u=>`Replace with a new insulated PVC door, U-value about ${f2(u)} W/m²K.`,
  door_comp:u=>`Replace with a new composite door, U-value about ${f2(u)} W/m²K.`
};
const NEWBUILD = {wall:0.18, roof:0.16, floor:0.18, window:1.4, door:1.4};
const txt = s => String(s==null?'':s).replace(/→/g,'to').replace(/≤/g,'<=').replace(/₂/g,'2').replace(/³/g,'3').replace(/✓/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"');

function makePdf(kind){
  if(!(window.jspdf&&window.jspdf.jsPDF)){ toast('The PDF tool has not loaded. Open the app once with internet.'); return; }
  const res=results(), cost=costing(res);
  const doc=new window.jspdf.jsPDF({unit:'mm', format:'a4'});
  const name=[cur.client.first,cur.client.last].filter(Boolean).join(' ');
  const addr=cur.client.address1||cur.before.meta.address1||'';
  let file;
  if(kind==='hea'){ heaReport(doc,res,cost); file=`BER Upgrade Report - ${addr}.pdf`; }
  if(kind==='ta'){ taForm(doc,res,cost); file=`Technical Assessment Form - ${addr}.pdf`; }
  if(kind==='sum'){ summaryReport(doc,res,cost); file=`Home Energy Summary Report - ${addr}.pdf`; }
  shareFile(doc.output('blob'), file.replace(/[\/\\:]/g,'-'));
}
let LOGO=null;
fetch('logo.png').then(r=>r.blob()).then(b=>new Promise(ok=>{ const fr=new FileReader(); fr.onload=()=>ok(fr.result); fr.readAsDataURL(b); })).then(d=>LOGO=d).catch(()=>{});

// ---------- BER Upgrade Report ----------
function heaReport(doc,res,cost){
  const R=cur.before, c=cur.client, co=settings.company, W=210, M=16;
  const name=[c.first,c.last].filter(Boolean).join(' ');
  const T=(s,x,y,o)=>doc.text(txt(s),x,y,o);
  const para=(s,y,size=10,col=[22,35,29],w=W-2*M)=>{ doc.setFontSize(size); doc.setTextColor(...col); const L=doc.splitTextToSize(txt(s),w); if(y+L.length*size*0.42>280){ doc.addPage(); y=20; } doc.text(L,M,y); return y+L.length*size*0.42+2; };
  const head=(num,s,y)=>{ if(y>255){ doc.addPage(); y=20; } doc.setFillColor(...GREEN); doc.rect(M,y-5,W-2*M,8,'F'); doc.setTextColor(255); doc.setFontSize(12); doc.setFont('helvetica','bold'); T(`${num}  ${s}`,M+3,y+0.6); doc.setFont('helvetica','normal'); return y+9; };
  const sub=(s,y)=>{ if(y>265){ doc.addPage(); y=20; } doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(...NAVY); T(s,M,y); doc.setFont('helvetica','normal'); return y+5; };
  const tbl=(o,y)=>{ doc.autoTable(Object.assign({startY:y, rowPageBreak:'avoid', margin:{left:M,right:M}, theme:'grid', styles:{fontSize:9, cellPadding:1.8, lineColor:LINE, textColor:[22,35,29]}, headStyles:{fillColor:SOFT, textColor:NAVY, fontStyle:'bold'}}, o)); return doc.lastAutoTable.finalY+5; };
  // cover
  if(LOGO) doc.addImage(LOGO,'PNG',W/2-40,22,80,21.6);
  doc.setTextColor(...NAVY); doc.setFont('helvetica','bold'); doc.setFontSize(30);
  T('BER UPGRADE REPORT',W/2,66,{align:'center'}); doc.setFont('helvetica','normal');
  doc.setFontSize(13); doc.setTextColor(...GREY); T('for',W/2,76,{align:'center'});
  doc.setFontSize(17); doc.setTextColor(...NAVY); T(name||'Homeowner',W/2,85,{align:'center'});
  doc.setFontSize(12); T([addr(c,R), c.town, c.county||R.meta.county].filter(Boolean).join(', '),W/2,92,{align:'center'});
  tbl({body:[['Eircode',c.eircode||R.meta.eircode||''],['Phone number',c.phone],['Email',c.email],['MPRN',c.mprn||R.meta.mprn],['BER number',R.meta.ber],['Dwelling type',R.meta.dwellingType],['Approx. floor area (m²)',f1(R.dims.tfa)],['Year of construction',R.meta.year],['Current rating',`${R.label} (${f1(R.energyValue)} kWh/m²/yr)`],['BER published',c.berPublished||''],['Report date',fmtDate(c.reportDate)],['Access',c.access]].map(r=>r.map(txt)), columnStyles:{0:{fontStyle:'bold',cellWidth:60,textColor:NAVY}}, theme:'plain', styles:{fontSize:10,cellPadding:1.6}}, 104);
  let y=doc.lastAutoTable.finalY+8;
  doc.setFillColor(...SOFT); doc.roundedRect(M,y,W-2*M,22,2,2,'F'); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.setFont('helvetica','bold'); T("Homeowner's objectives",M+4,y+6); doc.setFont('helvetica','normal');
  doc.text(doc.splitTextToSize(txt(c.objectives||''),W-2*M-8),M+4,y+12);
  doc.setFontSize(10); doc.setTextColor(...GREY); T(`Prepared by ${co.assessor}, ${co.name}. SEAI BER Assessor No. ${co.number}${co.phone?' · '+co.phone:''}${co.email?' · '+co.email:''}`,W/2,282,{align:'center'});

  // 1.0 ratings
  doc.addPage(); y=20;
  y=head('1.0','BER Rating',y);
  const box=(x,label,r,col)=>{ doc.setDrawColor(...LINE); doc.roundedRect(x,y,(W-2*M-6)/2,46,2,2); doc.setFontSize(10); doc.setTextColor(...GREY); T(label,x+4,y+7);
    doc.setFillColor(...hex(BER_COL[r.label]||'#888888')); doc.roundedRect(x+4,y+11,26,14,2,2,'F'); doc.setTextColor(255); doc.setFontSize(18); doc.setFont('helvetica','bold'); T(r.label||'-',x+17,y+21,{align:'center'}); doc.setFont('helvetica','normal');
    doc.setTextColor(22,35,29); doc.setFontSize(10); T(`Energy value: ${f1(r.ev)} kWh/m²/yr`,x+36,y+15); T(`CO2 emissions: ${f1(r.co2)} kgCO2/m²/yr`,x+36,y+21); T(`Heat loss indicator: ${f2(r.hli)} W/K/m²`,x+4,y+34); T(`Delivered energy: ${f0(r.del)} kWh/yr`,x+4,y+40); };
  box(M,'Current condition of the house',res.before); box(M+(W-2*M+6)/2,'House after completion of the upgrades',res.after);
  y+=54;
  y=tbl({head:[['','Current','After works','Saving']], body:[['Energy value (kWh/m²/yr)',f1(res.before.ev),f1(res.after.ev),f1(res.before.ev-res.after.ev)],['CO2 emissions (kgCO2/m²/yr)',f1(res.before.co2),f1(res.after.co2),f1(res.before.co2-res.after.co2)],['Heat loss indicator (W/K/m²)',f2(res.before.hli),f2(res.after.hli),f2(res.before.hli-res.after.hli)],['Delivered energy (kWh/yr)',f0(res.before.del),f0(res.after.del),f0(res.before.del-res.after.del)]], columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right'}}},y);
  y=para(res.after.src==='DEAP' ? 'Note: these figures were calculated using SEAI DEAP 4 software, for the house now and for a copy of the house with the upgrades below.' : 'Note: the current figures are from the published BER (SEAI DEAP 4). The figures after works are estimated from the DEAP 4 calculation of this house with the upgrades below; the post-works BER will give the final figures.', y, 9, GREY);
  if(res.after.hli<=2.3 && res.before.hli>2.3) y=para(`After the upgrades the heat loss indicator is ${f2(res.after.hli)} W/K/m², at or below the 2.3 needed for the SEAI heat pump grant.`, y);
  else if(res.after.hli>2.3) y=para(`After the upgrades the heat loss indicator is ${f2(res.after.hli)} W/K/m², still above the 2.3 needed for the SEAI heat pump grant. More fabric upgrades would be needed.`, y);
  if(cur.comments.general) y=para(cur.comments.general, y+2);

  // 2.0 costs
  y=head('2.0','Home upgrade works: costs and grants',y+4);
  y=para('The following is a summary of potential upgrades to your home.',y);
  y=tbl({head:[['Element','Existing','Upgrade measure','Capital cost (€)','SEAI grant (€)','You pay (€)']], body:cost.rows.map(r=>[r.element,r.existing,r.measure,money(r.cost),r.grant?money(r.grant):'-',money(r.cost-r.grant)].map(txt)), foot:[['Totals','','',money(cost.works),money(cost.grants),money(cost.works-cost.grants)]], footStyles:{fillColor:SOFT,textColor:NAVY,fontStyle:'bold'}, columnStyles:{0:{cellWidth:28},3:{halign:'right',cellWidth:22},4:{halign:'right',cellWidth:22},5:{halign:'right',cellWidth:22}}},y);
  const fin=[['Total estimated capital cost (excl. VAT)',money(cost.works)]];
  if(cost.pm) fin.push([`Overheads, project management, admin (${settings.pmPct}%)`,money(cost.pm)]);
  if(cost.vat) fin.push([`VAT at ${settings.vatPv}% (PV only)`,money(cost.vat)]);
  fin.push(['Total including VAT',money(cost.total)],['Total SEAI grants','-'+money(cost.grants)]);
  if(cost.bonus) fin.push(['Heat pump bonus for reaching B2','-'+money(cost.bonus)]);
  if(cost.hea) fin.push(['Home energy assessment grant','-'+money(cost.hea)]);
  if(cost.pmg) fin.push(['Project management grant','-'+money(cost.pmg)]);
  if(cost.credits) fin.push(['Energy credits','-'+money(cost.credits)]);
  fin.push(['Final cost of the home energy upgrade',money(cost.pay)]);
  y=tbl({body:fin.map(r=>r.map(txt)), columnStyles:{1:{halign:'right',cellWidth:40}}, didParseCell:d=>{ if(d.row.index===fin.length-1){ d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=SOFT; } }},y);
  y=para('Costs are indicative estimates based on current market rates. Grant rates are set by SEAI and change from time to time: confirm current rates at seai.ie before signing any contract.',y,8.5,GREY);

  // 3.0 fabric
  const gs=groups(R), inp=calcInput();
  const block=(g,label)=>{
    const s=cur.up.el[g.id]; const on=s&&s.on&&s.m; const uNew= on ? (s.u!=null?s.u:settings.u[s.m]) : null;
    y=sub(`${label}: ${g.type||''}`, y);
    y=para(`Observation: ${g.desc?g.desc+'. ':''}Area ${f2(g.area)} m², U-value ${f2(g.u)} W/m²K.${g.kind==='door'&&g.count>1?` ${g.count} doors.`:''} ${g.u>NEWBUILD[g.kind]*1.5?`This is well above the standard for a new home today (about ${f2(NEWBUILD[g.kind])} W/m²K).`:'This is close to the standard for a new home today.'}`, y, 9.5);
    y=para(`Recommendation: ${on ? RECO[s.m](uNew) : (g.u>NEWBUILD[g.kind]*1.5 ? 'No upgrade proposed at this stage.' : 'No upgrade recommended.')}`, y, 9.5, on?GREEN:GREY);
    y+=2;
  };
  y=head('3.0','Walls, roofs and floors',y+4);
  for(const k of [['wall','Wall'],['roof','Roof'],['floor','Floor']]) gs.filter(g=>g.kind===k[0]).forEach((g,i)=>block(g,`${k[1]} ${i+1}`));
  y=head('4.0','Windows and doors',y+4);
  gs.filter(g=>g.kind==='window').forEach((g,i)=>block(g,`Window group ${i+1}`));
  gs.filter(g=>g.kind==='door').forEach((g,i)=>block(g,`Door ${i+1}`));
  if(!gs.some(g=>g.kind==='door')) y=para('There are no external doors listed in the BER.',y,9.5);

  // 5.0 heating
  const h=cur.up.heat, he=heatEff();
  y=head('5.0','Main space heating system and controls',y+4);
  y=para(`Observation: ${heatingName(R)}. Heating controls category ${R.heating.control||'-'}, responsiveness category ${R.heating.respons||'-'}.${R.heating.ufh?' Underfloor heating on the ground floor.':''}`, y, 9.5);
  const hpTxt=`Replace the current system with an air-to-water heat pump (${(HP_SIZES.find(x=>x[0]===h.hpSize)||['','8.7 kW'])[1]}) with full heating controls and a new hot water cylinder. The heat pump installer must carry out a whole-system design; some radiators may need to be replaced with larger ones.`;
  const hrec={keep:'No upgrade recommended.', hp:hpTxt, hpfull:hpTxt.replace('with full heating controls','with a new heating system (pipework and emitters), full heating controls'), hpair:'Install an air-to-air heat pump.', boiler:`Replace the boiler with a new high efficiency boiler (about ${settings.hp.boilerEff}%).`, boilerctrl:`Replace the boiler with a new high efficiency boiler (about ${settings.hp.boilerEff}%) and upgrade the heating controls (time and temperature zone control, TRVs).`, controls:'Upgrade the heating controls to full time and temperature zone control with TRVs.'}[h.system];
  y=para(`Recommendation: ${hrec}${h.ufh?' Fit underfloor heating on the ground floor.':''}`, y, 9.5, h.system==='keep'?GREY:GREEN);
  // 6.0 water
  y=head('6.0','Water heating system and controls',y+4);
  y=para(`Observation: hot water from the ${R.fuels.water?.fuel||'main'} system, ${f0(R.heating.effWater)}% efficient. Cylinder ${f0(R.water.cylinder)} litres, ${R.water.insulation||''} insulation ${R.water.insThick?f0(R.water.insThick)+' mm':''}. ${R.water.electricShowers?R.water.electricShowers+' electric shower(s). ':''}${R.water.solar?'Solar water heating present.':''}`, y, 9.5);
  y=para(`Recommendation: ${['hp','hpfull'].includes(h.system)?'Hot water from the new heat pump with a new well insulated cylinder and insulated primary pipework.':'No upgrade recommended.'}`, y, 9.5, ['hp','hpfull'].includes(h.system)?GREEN:GREY);
  // 7.0 secondary
  y=head('7.0','Secondary heating system',y+4);
  y=para((R.heating.secFrac||0)>0 ? `Observation: ${secondaryName(R)} secondary heating.` : 'There is no secondary space heating system in the dwelling.', y, 9.5);
  const srec={keep:'No upgrade recommended.', remove:'Remove all secondary heating and block all chimneys and open flues.', stove:'Replace the open fire with a stove / closed room heater.', block:'Block up the fireplace.'}[cur.up.sec];
  y=para(`Recommendation: ${srec}`, y, 9.5, cur.up.sec==='keep'?GREY:GREEN);
  // 8.0 other
  const v=cur.up.vent, ve=res.est.vent;
  y=head('8.0','Other measures',y+4);
  y=para(`Chimneys: ${R.vent.chimneys.n}. Open flues: ${R.vent.flues.n}. Intermittent fans and passive vents: ${R.vent.fans.n}. Flueless room heaters: ${R.vent.flueless.n}.`, y, 9.5);
  y=para(`${f0(R.vent.strippedPct)}% of windows, doors and attic hatches are draught stripped. The ventilation method is ${R.vent.method||'natural ventilation'}. ${R.vent.suspended&&/yes/i.test(R.vent.suspended)?'There is a suspended timber ground floor '+R.vent.suspended.replace(/^Yes\s*/,'').toLowerCase()+'. ':''}Adjusted air infiltration rate ${f2(R.vent.adjusted)} ac/h.`, y, 9.5);
  const other=[]; if(v.draft) other.push('draught proof all windows, doors and the attic hatch'); if(v.q50) other.push(`carry out air tightness works to reach ${v.q50} m³/h/m² at 50 Pa, confirmed by a test`); if(v.airtape) other.push('fit airtightness tape to all windows and doors'); if(v.floorSeal) other.push('seal the suspended timber floor'); if(v.lobby) other.push('add a draught lobby'); if(v.system==='mvhr') other.push('install mechanical ventilation with heat recovery'); if(v.system==='dcv') other.push('install demand control ventilation'); if(v.closable) other.push(`fit ${v.closable} closable vent(s)`); if(v.extraFans) other.push(`fit ${v.extraFans} extra extract fan(s)`); if(cur.up.led) other.push('fit LED lighting throughout');
  y=para(`Recommendation: ${other.length?cap(other.join('; '))+`. Adjusted air infiltration after works: about ${f2(ve.adjusted)} ac/h.`:'No action recommended.'}`, y, 9.5, other.length?GREEN:GREY);
  // 9.0 renewables
  y=head('9.0','Renewable energy',y+4);
  const hasPv = (R.results.rows.pv?.delivered||0)<0;
  y=para(hasPv?'There is a solar PV system in the dwelling.':'There are currently no renewable energy systems in the dwelling.', y, 9.5);
  const kwp=pvKwp(cur.up.pv);
  y=para(`Recommendation: ${kwp>0?`Install a ${kwp.toFixed(1)} kWp solar PV system facing ${cur.up.pvOrient.toLowerCase()}${cur.up.battery?' with a 4.8 kWh battery':''}.`:'No action recommended.'}`, y, 9.5, kwp>0?GREEN:GREY);
  // 10.0 technical notes
  y=head('10.0','Technical notes',y+4);
  y=para('This table gives more technical detail on the measures proposed.',y,9.5);
  const tech=[];
  for(const g of gs){ const s=cur.up.el[g.id]; if(!(s&&s.on&&s.m)) continue; const uNew=s.u!=null?s.u:settings.u[s.m]; tech.push([`${g.name}: ${MLABEL[s.m]}`, `${f2(g.area)} m²`, `${f2(g.u)} to ${f2(uNew)} W/m²K`, SPEC[s.m]?`${SPEC[s.m].type}, about ${thick(s.m,g.u,uNew)||'-'} mm`:'']); }
  if(tech.length) y=tbl({head:[['Measure','Area','U-value','Specification (to be confirmed by contractor)']], body:tech.map(r=>r.map(txt))},y);
  y=para('The proposed upgrade works must comply with: SEAI Domestic Technical Standards and Specifications (DTSS); NSAI Standard Recommendation 54; Technical Guidance Document Part L (Conservation of Fuel and Energy) and Part F (Ventilation), and other relevant building regulations; manufacturers\' design and installation instructions. The specifications and quantities above are preliminary and will be confirmed by the contractor after a detailed survey.',y,9);
  // 11.0 terms
  y=head('11.0','Terms and conditions',y+4);
  y=para(`Independent assessment: this report has been prepared by ${co.name} as an independent energy assessment. ${co.name} is not a contractor, does not supply or install any of the measures listed, and has no financial interest in any product or installer.`,y,9);
  y=para(`Cost estimates: all capital costs are indicative estimates only, based on current market rates, and exclude VAT unless stated. Actual costs will be set by your chosen contractor after a detailed survey. ${co.name} accepts no liability for contractor pricing, tender outcomes or project costs.`,y,9);
  y=para('Energy savings: projected energy values and savings use the SEAI DEAP 4 methodology with standard assumptions on occupancy, heating hours and hot water use. Actual savings will vary with how the home is used.',y,9);
  y=para('Grant rates: SEAI grant rates in this report are indicative and subject to change. Always confirm current rates at seai.ie before proceeding.',y,9);
  y=para('Professional advice: this report is not structural, legal or planning advice. Check the need for planning permission with a qualified adviser before any external works start.',y,9);
  // 12.0 next steps
  y=head('12.0','Next steps',y+4);
  ['Get at least three quotes from SEAI registered contractors for each measure you wish to go ahead with.','Confirm current SEAI grant rates at seai.ie before signing any contract.','Make sure your contractor is registered with SEAI and can manage the grant application for you.','Keep evidence of all works (invoices, certificates, photos) so they can be shown in the post-works BER.',`Contact ${co.name} if you would like help choosing contractors or a post-works BER.`].forEach((s,i)=>{ y=para(`${i+1}.  ${s}`,y,9.5); });
  y=para(`${co.assessor}, ${co.name}. SEAI BER Assessor No. ${co.number}.${co.phone?' Phone '+co.phone+'.':''}${co.email?' Email '+co.email+'.':''}`,y+2,9.5,NAVY);
  footer(doc, `${co.name} | SEAI BER Assessor No. ${co.number} | BER Upgrade Report`);
}
function addr(c,R){ return [c.address1||R.meta.address1, c.address2].filter(Boolean).join(', '); }
function money(n){ return Math.round(n||0).toLocaleString('en-IE'); }
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function hex(h){ const m=h.replace('#',''); return [0,2,4].map(i=>parseInt(m.substr(i,2),16)); }
function fmtDate(d){ if(!d) return ''; const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:d; }
function footer(doc, s){
  const n=doc.getNumberOfPages();
  for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...GREY); doc.text(txt(s),16,290); doc.text(`Page ${i} of ${n}`,194,290,{align:'right'}); }
}

// ---------- SEAI Technical Assessment Form ----------
function taForm(doc,res,cost){
  const R=cur.before, c=cur.client, co=settings.company, M=12, W=210;
  const name=[c.first,c.last].filter(Boolean).join(' ');
  const T=(s,x,y,o)=>doc.text(txt(s),x,y,o);
  const base={rowPageBreak:'avoid', margin:{left:M,right:M}, theme:'grid', styles:{fontSize:8.5, cellPadding:1.6, lineColor:[150,150,150], textColor:[0,0,0], valign:'middle'}, headStyles:{fillColor:[230,236,233], textColor:[0,0,0], fontStyle:'bold'}};
  const tbl=(o,y)=>{ doc.autoTable(Object.assign({},base,{startY:y},o)); return doc.lastAutoTable.finalY+4; };
  const bar=(s,y)=>{ doc.setFillColor(0,90,60); doc.rect(M,y-4.5,W-2*M,7,'F'); doc.setTextColor(255); doc.setFontSize(10.5); doc.setFont('helvetica','bold'); T(s,W/2,y,{align:'center'}); doc.setFont('helvetica','normal'); doc.setTextColor(0); return y+6; };
  const L={fontStyle:'bold', fillColor:[244,247,245]};
  const pageHead=(n)=>{ doc.setFontSize(8); doc.setTextColor(80); T(`Page ${n}/4          MPRN: ${c.mprn||R.meta.mprn||''}          Client: ${name}`,M,8); doc.setTextColor(0); };
  // page 1
  doc.setFont('helvetica','bold'); doc.setFontSize(15); T('Technical Assessment Form',W/2,16,{align:'center'}); doc.setFontSize(12); T('for Better Energy Homes Heat Pump System Grants',W/2,23,{align:'center'}); doc.setFont('helvetica','normal');
  let y=bar('Administrative Information',32);
  y=tbl({head:[['Homeowner Address','','Dwelling Address (only if different from HO address)','']], body:[
    [{content:'Name*',styles:L},name,{content:'Address 1',styles:L},''],[{content:'Address 1*',styles:L},c.address1||R.meta.address1||'',{content:'Address 2',styles:L},''],
    [{content:'Address 2',styles:L},c.address2||'',{content:'Town/City',styles:L},''],[{content:'Town/City*',styles:L},c.town||'',{content:'County',styles:L},''],
    [{content:'County*',styles:L},c.county||R.meta.county||'',{content:'Eircode',styles:L},''],[{content:'Eircode*',styles:L},c.eircode||R.meta.eircode||'',{content:'Dwelling address same as homeowner address?',styles:L},'YES']].map(r=>r.map(x=>typeof x==='string'?txt(x):x))},y);
  y=tbl({body:[
    [{content:'Cost of Technical Advisor Service (€)*',styles:L},money(co.fee),{content:'Floor area [m2]*',styles:L},f2(R.dims.tfa)],
    [{content:'',styles:{}},'',{content:'Year Constructed*',styles:L},R.meta.year||''],
    [{content:'Technical Advisor name*',styles:L},co.assessor,{content:'BER No.*',styles:L},R.meta.ber||''],
    [{content:'BER Assessor No.*',styles:L},co.number,{content:'MPRN No.*',styles:L},c.mprn||R.meta.mprn||''],
    [{content:'Type of heating system currently present*',styles:L},{content:txt(heatingName(R)),colSpan:3}]]},y);
  y=bar('Homeowner Declaration',y+3);
  doc.setFontSize(8);
  const hd=['I declare that I have been advised on the level of thermal performance of building fabric required to qualify for the heat pump system grants offered, where applicable, by the SEAI Better Energy Programme.','I declare that I have been provided with a report by the Technical Advisor detailing different options to achieve the Heat Loss Indicator required for the heat pump system grant, where applicable, to help me choose the most suitable option. That most suitable option is now detailed in this Technical Assessment Form.','I understand that:','• By uploading or submitting this technical assessment to the SEAI, I am making a declaration under the terms and conditions of the Better Energy Homes Programme. I certify that the information provided in this Technical Assessment is accurate and complete to the best of my knowledge.','• The aim of these requirements is to minimise heat loss so that the heat pump can function efficiently and be effective at heating the building.','• Failure to achieve the level of thermal performance of building fabric specified, with a maximum value of Heat Loss Indicator of 2.30, will result in the heat pump system and technical assessment grant being declined, where applicable.','• The requirements for building upgrades for the heat pump grant specified in this report are separate from requirements for other SEAI grants (wall and roof insulation grants). If applying for the wall or roof insulation grants for upgrades specified in this report, I will clarify in my contract with the insulation contractor that works need to satisfy both requirements.','• Where my house was built prior to 2007 and the valid BER states a non-compliant HLI level, it is my responsibility to ensure that contractors carry out the upgrades to the requirements specified here and needed to qualify for the heat pump system grant, where applicable.','• If specifications for works carried out differ from what is specified here, it is my responsibility to ensure that they still satisfy the requirement of maximum value of Heat Loss Indicator of 2.30 to qualify for the heat pump system grant, where applicable.','• For homes built from 2007 onward, any fabric upgrades listed on the Technical Assessment by the Technical Advisor are recommended to be completed, but are not mandatory.'];
  for(const p of hd){ const Ls=doc.splitTextToSize(p,W-2*M); doc.text(Ls,M,y); y+=Ls.length*3.4+1; }
  y=tbl({body:[[{content:'Homeowner Signature*',styles:L},'',{content:'Date (dd/mm/yy)*',styles:L},'']], styles:{...base.styles, minCellHeight:12}},y+2);
  doc.setFontSize(7.5); T('* denotes mandatory entries. Forms missing these entries will not be accepted.',M,y);
  pageHead(1);
  // page 2
  doc.addPage(); pageHead(2); y=16;
  y=bar('Technical Advisor Declaration',y);
  y=tbl({body:[
    [{content:'I confirm that the published BER referenced on page 1 of this form accurately reflects the current condition of this dwelling*',styles:{cellWidth:110}},'YES'],
    ['BER referenced on page 1 of this form was published by (a) me, or (b) another BER Assessor*', R.meta.assessorNo && String(R.meta.assessorNo)===String(co.number) ? '(a)' : '(b)'],
    [{content:'Heat Loss Indicator (HLI) [W/K m2]',styles:L},''],
    ['Current value of HLI. Taken from DEAP calculation of published BER referenced on page 1 of this form [X.XX]*', f2(R.heat.hli)],
    ['Projected HLI following upgrade works recommended in this form. Must be <=2.3, where applicable, otherwise identify more upgrades [X.XX]*', f2(res.after.hli)]], columnStyles:{1:{halign:'center',fontStyle:'bold'}}},y);
  y=bar('Technical Advisor Responsibilities',y+2);
  doc.setFontSize(8);
  const tr=['As part of this Technical Assessment, I have:','• ensured all information in this form is correct and have adhered to SEAI\'s guidance and requirements for Technical Advisors','• advised the homeowner on the current level of thermal performance of the dwelling and on the level required to qualify, where applicable, for the heat pump system grants offered by the SEAI Better Energy Programme','• advised the homeowner that the heat pump system may need a different heat distribution system than the current one and that the heat pump contractor must carry out a whole system design','• advised the homeowner in relation to the energy performance of their home and discussed possible improvement to the fabric, ventilation, heating and hot water systems, lighting and operational aspects','• adhered to the independence requirements for Technical Advisors in carrying out a Technical Assessment of this dwelling','• advised the Homeowner that for houses with a valid BER with a compliant HLI or for houses built from 2007 onward, the Technical Assessment is not a mandatory requirement in order to avail of a heat pump system grant','If the current building Heat Loss Indicator is higher than 2.3, I have:','• discussed possible fabric improvement options with the homeowner and, taking into account technical aspects, cost and homeowner\'s preference, recommended the most suitable solution as proposed works, and provided the homeowner with a report explaining different options','• ensured the proposed works are compatible with the requirements for wall and roof insulation grants, if applicable, or otherwise clarified this with the homeowner','• specified and detailed the fabric performance corresponding to the proposed works and calculated the corresponding Heat Loss Indicator','• advised the homeowner on how to clarify the recommended works with the relevant contractors, and that they need to ask contractors for suitable evidence of the works carried out and keep a record of it so the works are reflected in the post-BER','• advised the homeowner that in order to qualify for the heat pump grant, where applicable, the insulation and window works must achieve the required improvement in thermal performance and the post-BER must reflect all the works carried out','I confirm that the above information is true and correct. As a Technical Advisor, registered with SEAI, I abide by SEAI\'s requirements for Technical Advisors as detailed on www.seai.ie'];
  for(const p of tr){ const Ls=doc.splitTextToSize(p,W-2*M); doc.text(Ls,M,y); y+=Ls.length*3.4+0.8; }
  y=tbl({body:[[{content:'Technical Advisor Signature*',styles:L},'',{content:'Date (dd/mm/yy)*',styles:L},'']], styles:{...base.styles, minCellHeight:12}},y+2);
  y=bar('General Commentary on Technical Assessment and Recommendations*',y+2);
  y=tbl({body:[[txt(cur.comments.ta || autoTaComment(res))]], styles:{...base.styles, fontSize:9, minCellHeight:30}},y);
  // page 3: fabric
  doc.addPage(); pageHead(3); y=16;
  y=bar('Recommended Insulation Upgrades: Walls, Roofs and Floors',y);
  const gs=groups(R);
  const totalArea=k=>gs.filter(g=>g.kind===k).reduce((s,g)=>s+g.area,0);
  for(const [k,lab,typeLab] of [['wall','Wall','Wall type (stone, solid brick, cavity, hollow block etc)'],['roof','Roof','Roof type (pitched with insulation on flat ceiling etc)'],['floor','Floor','Floor type (solid, suspended etc)']]){
    const list=gs.filter(g=>g.kind===k && cur.up.el[g.id] && cur.up.el[g.id].on && cur.up.el[g.id].m);
    if(!list.length){ y=tbl({body:[[{content:`${lab} insulation: no ${lab.toLowerCase()} upgrade proposed.`,styles:{fontStyle:'italic'}}]]},y); continue; }
    list.forEach((g,i)=>{
      const s=cur.up.el[g.id], uNew=s.u!=null?s.u:settings.u[s.m], sp=SPEC[s.m]||{};
      if(y>200){ doc.addPage(); pageHead(3); y=16; }
      const grantOk = (k==='wall' && uNew<=0.37) || (k==='roof' && uNew<=(s.m==='ceiling'?0.16:0.25)) || k==='floor';
      y=tbl({head:[[{content:`${lab} insulation - Proposed ${lab.toLowerCase()} upgrade *`,colSpan:4,styles:{halign:'center'}}]], body:[
        [{content:`${lab} number`,styles:L}, String(i+1), {content:`${lab} description`,styles:L}, txt(`${g.type}${g.desc?', '+g.desc:''}`)],
        [{content:`Total number of ${lab.toLowerCase()}s to be upgraded`,styles:L}, String(list.length), {content:`Area of this ${lab.toLowerCase()} [m2] / total heat loss ${lab.toLowerCase()} area in BER [m2]`,styles:L}, `${f2(g.area)} / ${f2(totalArea(k))}`],
        [{content:`Current ${lab.toLowerCase()} (as per published BER)`,colSpan:2,styles:{fontStyle:'bold',halign:'center'}},{content:'Proposed Upgrade',colSpan:2,styles:{fontStyle:'bold',halign:'center'}}],
        [{content:typeLab,styles:L}, txt(g.type||''), {content:'Proposed additional insulation type',styles:L}, txt(sp.type||'')],
        [{content:k==='wall'?'Wall thickness [mm]':'Existing insulation type if known',styles:L}, 'Unknown', {content:'Proposed additional insulation thickness [mm]',styles:L}, thick(s.m,g.u,uNew)],
        [{content:'Existing insulation thickness if known [mm]',styles:L}, g.thick?String(g.thick):'Unknown', {content:'Proposed additional insulation location',styles:L}, txt(sp.loc||'')],
        [{content:'Existing U-value [W/m2K]',styles:L}, f2(g.u), {content:'Proposed additional insulation thermal conductivity [W/mK]',styles:L}, sp.k?String(sp.k):''],
        [{content:'Existing U-value basis (DEAP default or non default)',styles:L}, 'Default', {content:'U-value required after upgrade [W/m2K]',styles:L}, f2(uNew)],
        [{content:'',styles:{}}, '', {content:`Proposed upgrade meets requirements for BEH ${lab.toLowerCase()} grant?`,styles:L}, grantOk?'Yes':'No'],
        [{content:'Other details/comments (include other info for contractor here)',styles:L}, {content:txt(`${MLABEL[s.m]}, ${f2(g.area)} m². ${RECO[s.m]?RECO[s.m](uNew):''} Thickness and conductivity are typical values: contractor to confirm the product.`),colSpan:3}]
      ], columnStyles:{0:{cellWidth:46},1:{cellWidth:40},2:{cellWidth:56}}},y);
    });
  }
  doc.setFontSize(7.5); T('* denotes mandatory entries. Include additional copies of this sheet if more than one floor/wall/roof.',M,Math.min(y,285));
  // page 4: windows, doors, openings, air tightness, ventilation
  doc.addPage(); pageHead(4); y=16;
  y=bar('Recommended Upgrades for Windows, Doors and Ventilation',y);
  const wd=gs.filter(g=>(g.kind==='window'||g.kind==='door') && cur.up.el[g.id] && cur.up.el[g.id].on && cur.up.el[g.id].m);
  const wdTotal=gs.filter(g=>g.kind==='window'||g.kind==='door').reduce((s,g)=>s+g.area,0);
  if(!wd.length) y=tbl({body:[[{content:'Window/door upgrades: none proposed.',styles:{fontStyle:'italic'}}]]},y);
  wd.forEach((g,i)=>{
    const s=cur.up.el[g.id], uNew=s.u!=null?s.u:settings.u[s.m];
    if(y>215){ doc.addPage(); pageHead(4); y=16; }
    const or=(g.desc||'').toLowerCase();
    y=tbl({head:[[{content:'Window/door upgrades - Proposed group of window/door upgrades *',colSpan:4,styles:{halign:'center'}}]], body:[
      [{content:'Window/door group number',styles:L}, String(i+1), {content:'Window/door description',styles:L}, txt(`${MLABEL[s.m]} replacing ${g.type}${g.desc?' ('+g.desc+')':''}`)],
      [{content:'Total no. of window/door groups to be upgraded',styles:L}, String(wd.length), {content:'Area of this group [m2] / total windows + doors area in BER [m2]',styles:L}, `${f2(g.area)} / ${f2(wdTotal)}`],
      [{content:'Current group (as per published BER)',colSpan:2,styles:{fontStyle:'bold',halign:'center'}},{content:'Proposed Upgrade',colSpan:2,styles:{fontStyle:'bold',halign:'center'}}],
      [{content:'Glazing type',styles:L}, txt(g.kind==='door'?g.type:g.type), {content:'Proposed glazing type',styles:L}, g.kind==='door'?'Insulated door':(s.m==='win_tg'?'Triple glazed, low-E':'Double glazed, low-E')],
      [{content:'Existing frame type',styles:L}, txt(g.frame||''), {content:'Proposed frame type',styles:L}, g.kind==='door'?(s.m==='door_comp'?'Composite':'PVC'):'PVC'],
      [{content:'Existing solar transmittance',styles:L}, g.g?f2(g.g):'', {content:'Proposed solar transmittance',styles:L}, g.kind==='door'?'':(s.m==='win_tg'?'0.57':'0.63')],
      [{content:'Existing average U-value [W/m2K]',styles:L}, f2(g.u), {content:'U-value required after upgrade [W/m2K]',styles:L}, f2(uNew)],
      [{content:'Orientation(s) in this group',styles:L}, {content:txt(g.kind==='window'?(g.desc||'').split(' · ')[0]:'-'),colSpan:3}]
    ], columnStyles:{0:{cellWidth:46},1:{cellWidth:40},2:{cellWidth:56}}},y);
  });
  const ve=res.est.vent, v=cur.up.vent, ci=calcInput().vent;
  if(y>200){ doc.addPage(); pageHead(4); y=16; }
  y=tbl({head:[[{content:'Openings upgrades *',colSpan:4,styles:{halign:'center'}}]], body:[
    [{content:'Existing no. of chimneys and flueless fixed combustion heaters',styles:L}, String(R.vent.chimneys.n+R.vent.flueless.n), {content:'Proposed no. of chimneys and flueless fixed combustion heaters',styles:L}, String((ci.chimneys||0)+(ci.flueless||0))],
    [{content:'Existing no. of open flues',styles:L}, String(R.vent.flues.n), {content:'Proposed no. of open flues',styles:L}, String(ci.flues||0)],
    [{content:'Existing number of intermittent fans and passive vents',styles:L}, String(R.vent.fans.n), {content:'Proposed number of intermittent fans and passive vents',styles:L}, String(ci.fans||0)],
    [{content:'Draught lobby on existing main entrance?',styles:L}, R.vent.lobby?'Yes':'No', {content:'Draught lobby on proposed main entrance?',styles:L}, (R.vent.lobby||v.lobby)?'Yes':'No']
  ], columnStyles:{0:{cellWidth:46},1:{cellWidth:40},2:{cellWidth:56}}},y);
  y=tbl({head:[[{content:'Structural air tightness upgrades *',colSpan:4,styles:{halign:'center'}}]], body:[
    [{content:'Structure type',styles:L}, txt(R.vent.structure||''), {content:'No. sheltered sides (0-4)',styles:L}, String(R.vent.sheltered??'')],
    [{content:'Existing air tightness test result (q50/20)',styles:L}, R.vent.airTest?f2(R.vent.airTestResult):'N/A', {content:'Air tightness test result needed to achieve HLI',styles:L}, v.q50?`${v.q50} m3/h/m2 (q50/20 = ${f2(v.q50/20)})`:'N/A'],
    [{content:'Existing % of windows/doors draught stripped',styles:L}, f0(R.vent.strippedPct), {content:'Proposed % of windows/doors draught stripped',styles:L}, v.draft?'100':f0(R.vent.strippedPct)],
    [{content:'Are existing wooden ground floors sealed?',styles:L}, /yes/i.test(R.vent.suspended||'')?(/unsealed/i.test(R.vent.suspended)?'No':'Yes'):'N/A', {content:'Are proposed wooden ground floors sealed?',styles:L}, /yes/i.test(R.vent.suspended||'')?((v.floorSeal||!/unsealed/i.test(R.vent.suspended))?'Yes':(Object.values(cur.up.el).some(s=>s.on&&/floor/.test(s.m))?'N/A (new floor)':'No')):'N/A'],
    [{content:'Measures to improve air tightness',styles:L}, {content:txt([v.draft?'Draught strip all windows, doors and attic hatch':'', v.airtape?'Airtightness tape to windows and doors':'', v.floorSeal?'Seal suspended floor':'', v.q50?'Air tightness works and test':''].filter(Boolean).join('; ')||'None proposed'),colSpan:3}]
  ], columnStyles:{0:{cellWidth:46},1:{cellWidth:40},2:{cellWidth:56}}},y);
  const mv = v.system==='mvhr'?'Balanced + heat recovery':v.system==='dcv'?'Mech. extract':(R.vent.method||'Natural ventilation');
  y=tbl({head:[[{content:'Mechanical ventilation upgrades *',colSpan:4,styles:{halign:'center'}}]], body:[
    [{content:'Existing whole dwelling ventilation method',styles:L}, txt(R.vent.method||''), {content:'Proposed whole dwelling ventilation method',styles:L}, txt(mv)],
    [{content:'Existing SFP [W/L/s] and heat exchanger efficiency [%]',styles:L}, R.vent.sfp?`${f2(R.vent.sfp)} / ${f0(R.vent.hx)}`:'N/A', {content:'Proposed SFP [W/L/s] and heat exchanger efficiency [%]',styles:L}, v.system==='mvhr'?'0.60 / 84':v.system==='dcv'?'0.24 / -':'N/A']
  ], columnStyles:{0:{cellWidth:46},1:{cellWidth:40},2:{cellWidth:56}}},y);
}

// ---------- Home Energy Summary Report (HEU loan) ----------
function summaryReport(doc,res,cost){
  const R=cur.before, c=cur.client, co=settings.company, M=16, W=210;
  const name=[c.first,c.last].filter(Boolean).join(' ');
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(...NAVY); doc.text('Home Energy Summary Report for Home Energy Upgrade',M,20); doc.setFont('helvetica','normal');
  doc.setFontSize(9); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize('This report must be provided to a participating finance provider as part of a Home Energy Upgrade Loan application. To be completed by a SEAI registered One Stop Shop, Energy Partner or Contractor.',W-2*M),M,27);
  const L={fontStyle:'bold', textColor:NAVY, cellWidth:105};
  const kwp=pvKwp(cur.up.pv);
  const eligible = cost.rows.filter(r=>r.kind!=='pv' || true).reduce((s,r)=>s+r.cost,0);
  const T=(head, rows, y)=>{ doc.autoTable({startY:y, margin:{left:M,right:M}, theme:'grid', head:[[{content:head,colSpan:2}]], body:rows.map(r=>[{content:txt(r[0]),styles:L},txt(r[1])]), styles:{fontSize:10,cellPadding:2.2,lineColor:LINE}, headStyles:{fillColor:SOFT,textColor:NAVY,fontStyle:'bold'}}); return doc.lastAutoTable.finalY+5; };
  let y=T('Customer details',[['Customer name:',name]],38);
  y=T('Property details',[['Property Eircode:',c.eircode||R.meta.eircode||''],['MPRN:',c.mprn||R.meta.mprn||''],['Size of property (m²):',f2(R.dims.tfa)]],y);
  y=T('Proposed home energy upgrade details',[
    ['Name of OSS / EP / CPC:',co.name],['Date of quote:',fmtDate(c.reportDate)],['Gross proposed project costs:','€'+money(cost.total)],
    ['Total proposed energy efficiency ("eligible") costs:','€'+money(eligible+cost.pm)],['Total proposed grant amount:','€'+money(cost.grants+cost.extraGrant)],
    ['Proposed net of grant energy efficiency costs:','€'+money(cost.pay)],['Current energy performance indicator (kWh/m²/yr):',f2(res.before.ev)],
    ['Proposed post-upgrade energy performance indicator (kWh/m²/yr):',f2(res.after.ev)],['Proposed uplift in energy performance (%):',f1((res.before.ev-res.after.ev)/res.before.ev*100)+'%'],
    ['Proposed post-upgrade renewable energy capacity:',kwp>0?kwp.toFixed(1)+' kWp solar PV':'None'],['Forecast size of property (m²):',f2(R.dims.tfa)]],y);
  y=T('Declarations',[['Confirmation that this is a residential property:','YES'],['Confirmation that the property is based in the Republic of Ireland:','YES'],['Confirmation that the MPRN of the property has been verified:','YES'],[`By delivery of this Report, ${co.name} confirms the information is accurate to the best of its knowledge:`,'YES'],['Signature of the OSS / EP / CPC:','']],y);
  doc.setFontSize(8.5); doc.setTextColor(...GREY);
  doc.text(doc.splitTextToSize('Details on how your personal data will be processed are in the SEAI Data Privacy Notice and the SBCI Data Protection Notice. Eligible costs are energy upgrades within the scope of the Home Energy Upgrade Loan Scheme. Figures after works are '+(res.after.src==='DEAP'?'from SEAI DEAP 4.':'estimated from the SEAI DEAP 4 calculation of the published BER.'),W-2*M),M,y+2);
  footer(doc, `${co.name} | Home Energy Summary Report`);
}
