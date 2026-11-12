// BER Survey DEAP Fill: whole-survey transfer.
// Goes through DEAP's screens in order, fills each one, and for walls, floors, roofs, doors and windows
// presses ADD, fills the dialog and presses SAVE, one item at a time. It never presses Publish or Submit:
// content.js refuses those buttons whatever it is asked.
const tx = { library: 'pick', overwrite: true, running: false, stop: false, steps: [], waitingFor: null, skipWait: false, included: {} };
// library picks the person made once and wants made for them again: { 'table|what the survey says': { picked, said, n, at } }
const mem = { picks: {}, remember: true };
chrome.storage.local.get('libMemory').then(r => { mem.picks = r.libMemory || {}; render() });
const memSave = () => chrome.storage.local.set({ libMemory: mem.picks });
const memKey = (t, said) => t.key + '|' + String(said || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
const pause = ms => new Promise(r => setTimeout(r, ms));

// values DEAP asks for that the survey records in another shape
function synthFields() {
  const v = k => surveyValue(k.split('.')[0], k), yes = k => /^yes$/i.test(v(k)), out = [];
  const put = (key, label, value) => { if (value !== '' && value != null) out.push({ key, label, value: String(value) }) };
  // space heating: DEAP narrows the system down in steps (category, sub category, sub category 2, system)
  const src = v('heat.src'), fuel = v('heat.fuel'), yr = parseInt(v('heat.hyear')) || 0, cond = yes('heat.cond');
  if (src) {
    const boiler = /boiler/i.test(src), hp = /heat pump/i.test(src);
    put('heat.cat', 'Heating system category', boiler || hp ? 'Central heating systems with radiators or underfloor heating' : /storage/i.test(src) ? 'Electric storage systems' : /direct electric|stove|room/i.test(src) ? 'Room heaters' : '');
    if (boiler || hp) put('heat.sub1', 'Sub category', hp ? 'Heat pumps' : /solid|biomass|range/i.test(src) && !/\boil\b|gas|lpg/i.test(src) ? 'Solid fuel boilers' : /electric/i.test(fuel) ? 'Electric boilers' : 'Gas and oil boilers');
    if (/\boil\b/i.test(src) || /\boil\b/i.test(fuel)) {
      put('heat.sub2', 'Sub category 2', 'Oil boilers');
      // most boilers are 1998 or later: only an older year installed in the survey gives an older band (never the house's age)
      put('heat.system', 'Heating system', cond ? 'Condensing' : yr && yr < 1985 ? 'Standard oil boiler pre-1985' : yr && yr < 1998 ? 'Standard oil boiler 1985 to 1997' : 'Standard oil boiler, 1998 or later');
    } else if (/gas|lpg/i.test(src + fuel)) {
      put('heat.sub2', 'Sub category 2', !yr || yr >= 1998 ? 'Gas boilers (including LPG) 1998 or later' : /fan/i.test(v('heat.flue')) ? 'Gas boilers (including LPG) pre-1998, with fan-assisted flue' : 'Gas boilers (including LPG) pre-1998, with balanced or open flue');
      const combi = yes('water.combi');
      put('heat.system', 'Heating system', cond ? (combi ? 'Condensing combi' : 'Condensing') : combi ? (yr && yr < 1998 ? 'Combi, pre-1998' : 'Combi, 1998 or later') : /^no$/i.test(v('heat.cond')) && (!yr || yr >= 1998) ? 'Regular non-condensing with automatic ignition' : '');
    }
  }
  const ctl = (surveyValue('heat', 'heat.controls') || []), has = c => [].concat(ctl).some(x => x === c);
  if ([].concat(ctl).length) {
    const prog = has('Programmer') || has('Time switch'), stat = has('Room thermostat') || has('Programmable room thermostat'), trv = has('TRVs');
    put('heat.ctrl', 'Heating system controls', has('Time and temperature zone control') ? 'Time and temperature zone control' : prog && stat && trv ? 'Programmer, room thermostat and TRVs' : prog && trv && has('Boiler energy manager') ? 'Programmer, TRVs and boiler energy manager' : prog && trv && has('Flow switch') ? 'Programmer, TRVs and flow switch' : prog && trv ? 'Programmer, TRVs (likely to include bypass)' : prog && stat ? 'Programmer and room thermostat' : prog ? 'Programmer, no room thermostat' : stat ? 'Room thermostat only' : 'No time or thermostatic control of room temperature');
    put('heat.interlock', 'Boiler interlock present', has('Boiler interlock') ? 'Yes' : 'No');
    put('heat.delayed', 'Delayed start thermostat present', has('Delayed start thermostat') ? 'Yes' : 'No');
  }
  if (v('heat.pump')) put('heat.pumpn', 'Central heating pumps', yes('heat.pump') ? '1' : '0');
  if (v('heat.oilpump_in')) put('heat.oilpumpn', 'Oil boiler pumps', '1');
  if (v('heat.fluefan')) put('heat.fluefann', 'Gas boiler flue fans', yes('heat.fluefan') ? '1' : '0');
  // ventilation: openings count, from the survey's own count or the windows and doors it measured
  const ops = v('openings.op_total') || (() => { const sc = st.survey.screens.find(x => x.id === 'openings'); if (!sc) return ''; const n = sc.tables.filter(t => /windows-for-deap|doors-for-deap/.test(t.key)).reduce((a, t) => { const i = t.columns.findIndex(c => c.key === 'no'); return a + t.rows.reduce((b, r) => b + (parseInt(r[i]) || 0), 0) }, 0); return n || '' })();
  // DEAP counts attic hatches as openings too
  const hatches = parseInt(v('vent.hatches')) || 0, hatchesDs = parseInt(v('vent.hatches_ds')) || 0;
  put('openings.ops', 'Number of openings (windows, doors and attic hatches)', ops !== '' ? String((parseInt(ops) || 0) + hatches) : hatches ? String(hatches) : '');
  if (v('openings.op_strip') !== '' && v('openings.op_strip') != null || hatchesDs) put('openings.strip', 'Number of draught stripped openings (with attic hatches)', String((parseInt(v('openings.op_strip')) || 0) + hatchesDs));
  // water: DEAP's primary circuit loss type combines pipe insulation and cylinder thermostat
  if (yes('water.cyl') || v('water.primins')) {
    const ins = /all accessible|fully/i.test(v('water.primins')), stat = yes('water.cylstat');
    const elec = /immersion only|instantaneous/i.test(v('water.src'));
    put('water.storetype', 'Storage type', elec ? 'Cylinder, immersion main water heater' : 'Cylinder, indirect');
    // a heat pump heating a separate cylinder: DEAP asks what kind of hot water store it has
    if (/heat pump/i.test(v('heat.src')) && !elec) put('water.hpdhw', 'Heat pump hot water store', 'Separate Hot Water Storage');
    put('water.primtype', 'Primary circuit loss type', elec ? 'Electric immersion heater' : 'Boiler / heat pump with ' + (ins ? 'insulated' : 'uninsulated') + ' primary pipework and ' + (stat ? 'with' : 'no') + ' cylinder thermostat');
  }
  if (v('gen.battery')) put('gen.battery_yes', 'Is a battery present?', parseFloat(v('gen.battery')) > 0 ? 'Yes' : 'No');
  return out;
}
// DEAP library items (heat sources, ventilation items, showers and baths, solar collector): the person picks the
// library item, with a search typed in for them, and the transfer fills and saves whatever dialog follows
const FUEL_DEAP = { 'Bulk LPG': 'Bulk LPG (propane or butane)', 'Wood pellets (bags)': 'Wood Pellets (in bags for secondary heating)', 'Wood pellets (bulk)': 'Wood Pellets (bulk supply for main heating)', 'Coal': 'House Coal', 'Smokeless fuel': 'Manufactured Smokeless Fuel' };
function synthTables() {
  const v = k => surveyValue(k.split('.')[0], k), yes = k => /^yes$/i.test(v(k)), n = k => parseInt(v(k)) || 0, out = [];
  const tbl = (key, title, cols, rows) => { if (rows.length) out.push({ key, title, columns: cols.map(([k, l]) => ({ key: k, label: l })), rows }) };
  const fuel = f => FUEL_DEAP[f] || f || '';
  const heats = [];
  // DEAP's library heat source types, for a boiler that has to be added to the library
  const htype = src => /heat pump/i.test(src) ? 'Heat pumps' : /storage/i.test(src) ? 'Electric storage systems' : /underfloor/i.test(src) ? 'Electric underfloor heating' : /group|district/i.test(src) ? 'Group heating systems' : /warm air/i.test(src) ? 'Warm air systems' : /stove|fire|room|heater/i.test(src) ? 'Room heaters' : /electric/i.test(src) ? 'Electric boilers' : /solid|biomass|range/i.test(src) && !/\boil\b|gas|lpg/i.test(src) ? 'Solid fuel boilers' : 'Gas and oil boilers';
  if (v('heat.src')) heats.push([v('heat.make') || v('heat.src'), v('heat.make') ? '1' : '', fuel(v('heat.fuel')), v('heat.eff'), /same as main/i.test(v('water.src')) || yes('water.combi') ? 'Yes' : v('water.src') ? 'No' : '', v('heat.make'), htype(v('heat.src'))]);
  // DEAP's library calls a plain open fire "Open fire in grate" (older surveys just say Open fire)
  // DEAP's secondary dialog wants the share of heat it gives: its usual figure is 10%, or 15% beside electric storage heaters
  if (v('heat.sec') && v('heat.sec') !== 'None') heats.push([/^open fire$/i.test(v('heat.sec').trim()) ? 'Open fire in grate' : v('heat.sec'), '', fuel(v('heat.secfuel')), v('heat.seceff'), '', '', htype(v('heat.sec')), /storage/i.test(v('heat.src')) ? '15' : '10']);
  if (heats[0] && heats[0].length < 8) heats[0].push('');
  tbl('heat.sources', 'Heat sources', [['search', 'Library search'], ['exact', 'Make and model given'], ['fuel', 'Fuel type'], ['eff', 'Efficiency %'], ['water', 'Heats water'], ['make', 'Make and model'], ['htype', 'Heat source type'], ['pct', 'Heat %']], heats);
  // DEAP adds a chimney, open flue or flueless heater straight from the library with no box for how many,
  // so each one is added on its own; fans and vents open Edit Fan, which takes the number
  const vent = [].concat(...[['chimneys', 'chimney'], ['flues', 'open flue'], ['fans', 'intermittent fan'], ['vents', 'passive vent'], ['flueless', 'flueless']].filter(([k]) => n('vent.' + k) > 0)
    .map(([k, q]) => /^(fans|vents)$/.test(k) ? [[q, String(n('vent.' + k))]] : Array.from({ length: n('vent.' + k) }, () => [q, '1'])));
  tbl('vent.items', 'Ventilation items', [['search', 'Library search'], ['n', 'Number of items']], vent);
  const wsc = st.survey.screens.find(x => x.id === 'water'), sh = wsc && wsc.tables.find(t => t.key === 'water.showers'), wet = [];
  // the word that picks each one from DEAP's common items
  const shWord = ty => /electric/i.test(ty) ? 'electric' : /mains|unvented/i.test(ty) ? 'unvented' : /pump|power/i.test(ty) ? 'pumped' : /vented/i.test(ty) ? 'vented' : '';
  if (sh) { const ti = sh.columns.findIndex(c => c.key === 'type'); sh.rows.forEach(r => wet.push([(r[ti] || '').replace(/ \/.*$/, '') + ' shower', '1', shWord(r[ti] || '')])) }
  if (n('water.baths') > 0) wet.push(['bath', String(n('water.baths')), 'bath']);
  tbl('water.wet', 'Showers and baths', [['search', 'Library search'], ['n', 'Number of items'], ['common', 'Common item']], wet);
  if (yes('water.solar')) tbl('water.collector', 'Solar collector', [['search', 'Library search'], ['aper', 'Aperture area'], ['orient', 'Orientation'], ['tilt', 'Tilt'], ['shade', 'Overshading']], [[v('water.smodel') || v('water.coll') || 'solar', v('water.aper'), v('water.sorient'), v('water.spitch'), v('water.sshade')]]);
  return out;
}
synthTables.uses = /^(heat\.(src|fuel|make|eff|sec|secfuel|seceff)|vent\.(chimneys|flues|fans|vents|flueless)|water\.(baths|solar|coll|aper|sorient|spitch|sshade|smodel|src))$/;
function allFields() {
  const out = [];
  st.survey.screens.forEach(sc => { const j = job(sc); j.fields.forEach(f => out.push(Object.assign({ screen: sc.id }, f))) });
  return out.concat(synthFields());
}
function transferSteps() {
  if (!st.survey) return [];
  const pool = allFields(), keys = [].concat(...st.survey.screens.map(sc => job(sc).tables.map(t => t.key)));
  const steps = (base.transfer || []).map(p => {
    const sc = st.survey.screens.find(x => x.id === p.screen) || { id: p.screen, fields: [], tables: [] };
    const j = job(sc), mapping = fullMap(pool.map(f => f.key).concat(...st.survey.screens.map(x => { const jj = job(x); return jj.tables.flatMap(t => [t.key].concat(t.columns.map(c => t.key + '.' + c.key))) }), synthTables().flatMap(t => [t.key].concat(t.columns.map(c => t.key + '.' + c.key)))));
    const pick = k => pool.filter(f => f.key === k || f.parent && f.key.startsWith(k + '.'));
    const fields = (p.fields ? p.fields.flatMap(pick) : j.fields).filter((f, i, a) => a.indexOf(f) === i && !(mapping[f.key] || {}).skip);
    const tables = (p.tables ? st.survey.screens.flatMap(x => job(x).tables).concat(synthTables()).filter(t => p.tables.includes(t.key)) : []).filter(t => !(mapping[t.key] || {}).skip);
    const dlg = tables.filter(t => (mapping[t.key] || {}).dialog !== false && (mapping[t.key] || {}).add), flat = tables.filter(t => (mapping[t.key] || {}).dialog === false);
    const items = dlg.reduce((a, t) => a + t.rows.length, 0);
    if (!fields.length && !flat.length && !items) return null;
    return { name: p.name, path: p.path, screen: sc.id, fields, flat, dlg, mapping, items, status: 'todo', note: '' };
  }).filter(Boolean);
  const ph = st.survey.photos || [];
  if (ph.length) steps.push({ name: 'Evidence photos', path: 'evidence', kind: 'evidence', screen: null, fields: [], flat: [], dlg: [], mapping: {}, items: ph.length, status: 'todo', note: '' });
  // anything the survey holds that no DEAP screen above takes: listed for doing by hand
  const used = new Set(steps.flatMap(s => s.fields.map(f => f.key)).concat(pool.filter(f => synthTables.uses.test(f.key)).map(f => f.key)));
  transferSteps.left = pool.filter(f => !used.has(f.key) && f.screen && !(fullMap([f.key])[f.key] || {}).skip && !/\.calc\.|^heat\.controls/.test(f.key) && !/^(no|none)$/i.test(String(f.value).trim()));
  transferSteps.leftTables = keys.filter(k => !steps.some(s => s.dlg.concat(s.flat).some(t => t.key === k)) && !(fullMap([k])[k] || {}).skip);
  return steps;
}

function setStep(s, status, note) { s.status = status; if (note != null) s.note = note; render() }

async function waitState(test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (tx.stop) throw new Error('Stopped');
    try { const s = await send({ cmd: 'state' }); if (s && test(s)) return s } catch (e) { }
    await pause(300);
  }
  return null;
}
// wait for the person (library pick, or fixing a dialog DEAP refused), until done, skipped or stopped
async function waitForYou(msg, test) {
  tx.waitingFor = msg; tx.skipWait = false; render();
  try {
    while (true) {
      if (tx.stop) throw new Error('Stopped');
      if (tx.skipWait) return false;
      try { const s = await send({ cmd: 'state' }); if (s && test(s)) return true } catch (e) { }
      await pause(500);
    }
  } finally { tx.waitingFor = null; render() }
}

async function goTo(step) {
  const r = await send({ cmd: 'nav', path: step.path });
  if (r && r.error) throw new Error(r.error);
  const ok = await waitState(s => s.path.endsWith('/' + step.path) && !s.dialog, 15000);
  if (!ok) throw new Error('Could not open ' + step.name + ' in DEAP');
  await pause(1500); // let DEAP draw the screen
  // a big assessment can take DEAP several seconds to draw its boxes, so wait until the first ones show up
  const sels = (step.fields || []).map(f => (step.mapping[f.key] || {}).selector).filter(Boolean).slice(0, 3);
  if (!sels.length) return;
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (tx.stop) throw new Error('Stopped');
    try { const r = await send({ cmd: 'has', selectors: sels }); if (r && r.n) { await pause(500); return } } catch (e) { }
    await pause(500);
  }
}

async function fillOn(step, payload) {
  const r = await send(Object.assign({ cmd: 'fill', options: { overwrite: tx.overwrite, scroll: false }, mapping: step.mapping }, payload));
  if (r && r.error) throw new Error(r.error);
  return r.results;
}

// DEAP draws buttons after it loads the screen's data, so keep looking for a while
async function pressWait(text, inDialog, ms) {
  const end = Date.now() + ms; let r;
  while (true) {
    r = await send({ cmd: 'press', text, inDialog });
    if (!r || !r.error || !(r.missing || r.disabled) || Date.now() > end || tx.stop) return r;
    await pause(500);
  }
}
const after = (txt, t, ri) => {
  // a line that needs a survey value the survey does not have says so plainly instead of showing "?"
  const miss = (txt.match(/\{(\w+)\}/g) || []).find(x => !(t.rows[ri][t.columns.findIndex(c => c.key === x.slice(1, -1))] || ''));
  if (miss && /\{eff\}/.test(txt)) return "check DEAP's efficiency (the survey has none)";
  return txt.replace(/\{(\w+)\}/g, (_, k) => t.rows[ri][t.columns.findIndex(c => c.key === k)] || '?');
};
// ---------- count check: how many of each kind the survey has against how many went into DEAP ----------
const COUNT_NAMES = { 'dims.floors': 'Floors', 'roofs.roofs': 'Roofs', 'walls.types': 'Walls', 'openings.doors-for-deap': 'Doors', 'openings.windows-for-deap': 'Windows', 'vent.items': 'Chimneys and fans', 'heat.sources': 'Heat sources', 'water.wet': 'Showers and baths', 'water.collector': 'Solar collector', 'gen.pv': 'Solar PV arrays', evidence: 'Evidence photos' };
function countStart(steps) {
  tx.counts = [];
  steps.forEach(s => {
    if (s.kind === 'evidence') { tx.counts.push({ key: 'evidence', name: COUNT_NAMES.evidence, path: s.path, want: s.items, got: 0, short: [] }); return }
    s.dlg.forEach(t => {
      if (!t.rows.length) return;
      const ni = t.columns.findIndex(c => c.key === 'name');
      const knee = t.key === 'walls.types' && ni >= 0 ? t.rows.filter(r => /knee walls/i.test(r[ni] || '')).length : 0;
      tx.counts.push({ key: t.key, name: COUNT_NAMES[t.key] || t.title, path: s.path, want: t.rows.length, got: 0, short: [], done: new Set(), note: knee ? 'Including ' + knee + ' room in roof knee wall' + (knee > 1 ? 's' : '') : '' });
    });
  });
}
const countFor = key => (tx.counts || []).find(c => c.key === key);
// the name an item goes by in DEAP (its description), else "Window 3 of 12"
function countLabel(t, ri, what) {
  const i = ['desc', 'name'].map(k => t.columns.findIndex(c => c.key === k)).find(x => x >= 0), d = i != null ? t.rows[ri][i] : '';
  return d || what;
}
function countGot(t, ri) { const c = countFor(t.key); if (c && !c.done.has(ri)) { c.done.add(ri); c.got++ } }
function countShort(t, ri, what, why) { const c = countFor(t.key); if (c && !c.done.has(ri)) { c.done.add(ri); c.short.push(countLabel(t, ri, what) + ' ' + why) } }
// rows a step never reached (it failed or the run was stopped) are short too
function countRest(step, why) {
  step.dlg.forEach(t => t.rows.forEach((r, ri) => { const c = countFor(t.key); if (c && !c.done.has(ri)) countShort(t, ri, (t.title.replace(/ \(.*\)$/, '').replace(/s$/, '')) + ' ' + (ri + 1) + ' of ' + t.rows.length, why) }));
}
const countLacking = () => (tx.counts || []).filter(c => c.got < c.want);
const MAKERS = ['Glow-worm', 'Worcester Bosch', 'Worcester', 'Ideal', 'Vaillant', 'Baxi', 'Potterton', 'Alpha', 'Viessmann', 'Ferroli', 'Ariston', 'Navien', 'Intergas', 'Firebird', 'Grant', 'Warmflow', 'Boulter', 'Mitsubishi Electric', 'Mitsubishi', 'Daikin', 'Samsung', 'Panasonic', 'Nibe', 'Dimplex', 'Stokvis', 'Remeha', 'Saunier Duval', 'Main', 'Halstead', 'Biasi', 'Vokera', 'Keston', 'Atag', 'Riello', 'Thermecon', 'Mistral', 'HRM', 'Stanley', 'Waterford Stanley', 'Rayburn', 'Aga', 'Stovax', 'Henley', 'Mullberry', 'Solid Fuel'];
async function newLibraryItem(step, t, ri, m, col, what) {
  const r = await pressWait('ADD NEW ITEM TO LIBRARY', true, 3000);
  if (r && r.error) return false;
  if (!await waitState(x => /library item/i.test(x.dialog || ''), 6000)) return false;
  await pause(800);
  const make = col('make').trim(), sp = make.indexOf(' ');
  // makers whose name is more than one word (or hyphenated) are split by name, not at the first space
  const known = MAKERS.find(k => new RegExp('^' + k.replace(/[- ]/g, '[- ]?') + '\\b', 'i').test(make));
  const maker = known || (sp > 0 ? make.slice(0, sp) : make), model = known ? make.replace(new RegExp('^' + known.replace(/[- ]/g, '[- ]?'), 'i'), '').trim() : sp > 0 ? make.slice(sp + 1) : '';
  const vals = { type: m.newItem.type, name: make, maker, model, htype: col('htype'), eff: col('eff') };
  const fields = Object.keys(m.newItem.fields).filter(k => vals[k]).map(k => ({ key: 'newitem.' + k, label: k, value: vals[k] }));
  const mapping = {}; Object.entries(m.newItem.fields).forEach(([k, sel]) => mapping['newitem.' + k] = { selector: sel });
  let res = (await send({ cmd: 'fill', scope: 'dialog', options: { overwrite: true, scroll: false }, mapping, fields, tables: [] })).results || [];
  // Heating Source Type and efficiency only show once Item Type is Heat Source, so go over what did not stick
  for (let pass = 0; pass < 3; pass++) {
    const redo = fields.filter(f => res.some(x => x.key === f.key && !/^(same|filled)$/.test(x.status)));
    if (!redo.length) break;
    await pause(1000);
    const again = (await send({ cmd: 'fill', scope: 'dialog', options: { overwrite: true, scroll: false }, mapping, fields: redo, tables: [] })).results || [];
    res = res.filter(x => !again.some(y => y.key === x.key)).concat(again);
  }
  tx.report.push({ step: step.name, item: what + ' (new library item)', results: res.map(x => Object.assign({ label: x.key.replace('newitem.', '') }, x)) });
  await pause(500);
  const sv = await pressWait('SAVE', true, 3000);
  if (sv && sv.error) return false;
  // after saving, DEAP either goes on to the heat source dialog or back to the library list with the new item in it
  const s = await waitState(x => !/library item/i.test(x.dialog || ''), 8000);
  if (!s) return false;
  tx.log.push(step.name + ': ' + what + ', added "' + make + '" to your DEAP library at ' + col('eff') + '% (check it)');
  if (s.dialog && /library/i.test(s.dialog)) {
    await send({ cmd: 'press', text: 'NEW & MODIFIED ITEMS', inDialog: true }); await pause(1200);
    const pk = await send({ cmd: 'libpick', text: make, min: 1 });
    if (!(pk && pk.ok)) return false;
    return !!(await waitState(x => !x.dialog || !/library/i.test(x.dialog), 6000));
  }
  return true;
}
async function addItems(step, t) {
  const m = step.mapping[t.key] || {}, label = t.title.replace(/ \(.*\)$/, '').replace(/s$/, '');
  for (let ri = 0; ri < t.rows.length; ri++) {
    if (tx.stop) throw new Error('Stopped');
    const what = label + ' ' + (ri + 1) + ' of ' + t.rows.length;
    setStep(step, 'running', what);
    const pr = await pressWait(m.add, false, 10000);
    if (pr && pr.error) throw new Error(pr.disabled ? m.add + ' is greyed out in DEAP' : 'Could not find ' + m.add + ' in DEAP' + (pr.seen && pr.seen.length ? ' (buttons seen: ' + pr.seen.join(', ') + ')' : ' (no ADD buttons seen)'));
    let s = await waitState(x => !!x.dialog, 8000);
    if (!s) throw new Error(m.add + ' did not open a dialog');
    if (s.notice) {
      // DEAP refused with a message (e.g. heating system properties not complete): close it and stop this step with DEAP's words
      await pause(400); s = await send({ cmd: 'state' });
      if (s.notice) { await send({ cmd: 'press', text: 'OK', inDialog: true }); await waitState(x => !x.dialog, 3000); throw new Error('DEAP says: ' + s.notice) }
    }
    if (m.library && /library/i.test(s.dialog)) {
      const si = t.columns.findIndex(c => c.key === 'search'), phrase = si >= 0 ? t.rows[ri][si] : '';
      const desc = t.rows[ri].filter(Boolean).slice(0, 5).join(', ');
      // try the best matching library row first; hand over to the person only when nothing matches well
      const ei = t.columns.findIndex(c => c.key === 'exact'), wi = t.columns.findIndex(c => c.key === 'want'), want = wi >= 0 && t.rows[ri][wi] || phrase;
      // a pick remembered from an earlier survey comes first
      const mk = want ? memKey(t, want) : null, rm = mk && tx.library === 'pick' && mem.picks[mk];
      let pk = null;
      // items DEAP lists under COMMON ITEMS (showers, baths, chimneys, fans) are picked straight from that list, no search
      if (m.common && tx.library === 'pick') {
        await send({ cmd: 'press', text: 'COMMON ITEMS', inDialog: true }); await pause(1000);
        const ci = t.columns.findIndex(c => c.key === 'common');
        if (rm) { const r = await send({ cmd: 'libpick', text: rm.picked, min: 0.85, exact: true }); if (r && r.ok) pk = r }
        const words = [...new Set([want, ci >= 0 && t.rows[ri][ci]].filter(Boolean))];
        for (const w of words) { if (pk) break; const r = await send({ cmd: 'libpick', text: w, min: 1, unique: true }); if (r && r.ok) pk = r }
      }
      if (rm && !pk) {
        let r = await send({ cmd: 'libpick', text: rm.picked, min: 0.85, exact: true });
        if (r && r.error && !r.picked) { await send({ cmd: 'libsearch', text: rm.picked.split(' ').slice(0, 4).join(' ') }); await pause(1500); r = await send({ cmd: 'libpick', text: rm.picked, min: 0.85, exact: true }) }
        if (r && r.ok && await waitState(x => !x.dialog || !/library/i.test(x.dialog), 6000)) { rm.n = (rm.n || 0) + 1; rm.at = Date.now(); memSave(); tx.memUsed.push({ key: mk, what: label, said: want, picked: rm.picked }); pk = { ok: true, picked: rm.picked, fromMemory: true } }
      }
      if (!pk && phrase) { await pause(500); await send({ cmd: 'libsearch', text: phrase }); await pause(1500) }
      if (!pk) pk = phrase && tx.library === 'pick' && (m.autopick !== false || ei >= 0 && t.rows[ri][ei] === '1') ? await send({ cmd: 'libpick', text: want, min: m.autopickMin }) : null;
      let got = false;
      if (pk && pk.fromMemory) got = true;
      else if (pk && pk.ok) {
        got = !!(await waitState(x => !x.dialog || !/library/i.test(x.dialog), 6000));
        if (got) tx.log.push(step.name + ': ' + what + ', picked library item "' + pk.picked + '" (check it is the right one)');
      }
      // not in the library: add it as a new library item from the survey (boilers with make, model and efficiency)
      const col = k => { const i = t.columns.findIndex(c => c.key === k); return i >= 0 ? t.rows[ri][i] : '' };
      if (!got && m.newItem && tx.library === 'pick' && col('make') && col('eff')) got = await newLibraryItem(step, t, ri, m, col, what);
      if (!got && mk) { await send({ cmd: 'liblast', reset: true }); tx.memAsk = { key: mk, said: want, what: label } }
      if (!got) got = await waitForYou((pk && pk.error ? 'I could not find a sure match in the library. ' : '') + 'Pick the DEAP library item for ' + what + ' (' + desc + ') and press ADD, or add it with ADD NEW ITEM TO LIBRARY. ' + (phrase ? 'I searched the library for "' + phrase + '". ' : '') + 'I fill in the rest.', x => x.dialog && !/library/i.test(x.dialog) || !x.dialog);
      if (got && tx.memAsk) {
        const lp = await send({ cmd: 'liblast' });
        if (mem.remember && lp && lp.picked) { mem.picks[tx.memAsk.key] = { picked: lp.picked, said: tx.memAsk.said, what: tx.memAsk.what, n: 0, at: Date.now() }; memSave(); tx.memNew.push({ key: tx.memAsk.key, what: label, said: want, picked: lp.picked }) }
      }
      tx.memAsk = null;
      s = await send({ cmd: 'state' });
      // DEAP can take a few seconds to open the item's edit box (Edit Door, Edit Fan) after it is picked
      if (got && !s.dialog) s = (await waitState(x => !!x.dialog && !/library/i.test(x.dialog), 4000)) || await send({ cmd: 'state' });
      if (!got) { tx.log.push(step.name + ': ' + what + ' skipped'); countShort(t, ri, what, 'skipped: no library item picked'); if (s.dialog) await send({ cmd: 'press', text: 'CANCEL', inDialog: true }); continue }
      if (!s.dialog) { // added straight from the library: whatever else the survey has for it is left to enter in DEAP
        const rest = t.columns.map((c, i) => [c, t.rows[ri][i]]).filter(([c, x]) => c.key !== 'search' && x && !(c.key === 'n' && x === '1') && !((step.mapping[t.key + '.' + c.key] || {}).skip)).map(([c, x]) => c.label + ' ' + x);
        if (rest.length) tx.log.push(step.name + ': ' + what + ' added, check in DEAP: ' + rest.join(', '));
        if (m.after) tx.log.push(step.name + ': ' + what + ', ' + after(m.after, t, ri));
        countGot(t, ri);
        await pause(900); continue
      }
      await pause(800);
    }
    await pause(600);
    const one = Object.assign({}, t, { rows: [t.rows[ri]] });
    let res = await fillOn(step, { scope: 'dialog', fields: [], tables: [one] });
    // some boxes only open after another choice in the dialog (roof insulation after the roof type), so go over the rest again
    for (let pass = 0; pass < 2 && res.some(x => /^(nomatch|norow)$/.test(x.status)); pass++) {
      await pause(1000);
      const again = await fillOn(step, { scope: 'dialog', fields: [], tables: [one] });
      res = again.map(y => { const x = res.find(z => z.col === y.col); return y.status === 'same' && x && x.status === 'filled' ? x : y });
    }
    tx.report.push({ step: step.name, item: what + (s.dialog ? ' (' + s.dialog + ')' : ''), results: res.map(x => Object.assign({ label: (t.columns.find(c => c.key === x.col) || {}).label || x.key }, x)) });
    results[step.screen] = (results[step.screen] || []).filter(x => !(x.key === t.key && x.row === ri)).concat(res.map(x => Object.assign(x, x.row != null ? { row: ri } : {})));
    res.filter(x => !/filled|same|skipped/.test(x.status)).forEach(x => tx.log.push(step.name + ': ' + what + ', ' + (t.columns.find(c => c.key === x.col) || {}).label + ' by hand' + (x.detail ? ' (' + x.detail + ')' : '') + (t.key === 'roofs.roofs' && x.col === 'ins' && !t.rows[ri][t.columns.findIndex(c => c.key === 'type')] ? ': the survey has no roof type for this roof, and DEAP only shows Insulation Thickness once a roof type is picked' : '')));
    await pause(500);
    const sv = await pressWait('SAVE', true, 3000);
    const closed = !(sv && sv.error) && await waitState(x => !x.dialog, 8000);
    if (!closed) {
      // DEAP keeps SAVE greyed out until every required box is right: hand over to the person
      const errs = await send({ cmd: 'errors' });
      const fixed = await waitForYou('DEAP will not save ' + what + ' yet' + (errs && errs.length ? ' (' + errs.join('; ') + ')' : '') + '. Fix the red or empty boxes in the DEAP dialog and press SAVE, or press Skip this one.', x => !x.dialog);
      if (!fixed) { tx.log.push(step.name + ': ' + what + ' skipped, DEAP would not save it' + (errs && errs.length ? ' (' + errs.join('; ') + ')' : '')); countShort(t, ri, what, 'skipped: DEAP would not save it'); await send({ cmd: 'press', text: 'CANCEL', inDialog: true }); await waitState(x => !x.dialog, 4000); continue }
    }
    countGot(t, ri);
    if (m.after) tx.log.push(step.name + ': ' + what + ', ' + after(m.after, t, ri));
    await pause(900);
  }
}

function libraryList(step, t) {
  const m = step.mapping[t.key] || {}, label = t.title.replace(/ \(.*\)$/, '').replace(/s$/, '');
  const hide = c => /^(search|exact|want)$/.test(c.key);
  t.rows.forEach((r, ri) => {
    countShort(t, ri, label + ' ' + (ri + 1) + ' of ' + t.rows.length, 'left for you to add from the library');
    const d = t.columns.map((c, i) => [c, r[i]]).filter(([c, x]) => x && !hide(c)).map(([c, x]) => c.label + ' ' + x).join(', ');
    tx.log.push('Add from the DEAP library: ' + label + ' ' + (ri + 1) + ' of ' + t.rows.length + ' (' + d + ')' + (m.add ? ' with ' + m.add : '') + (m.after ? ', ' + after(m.after, t, ri) : ''));
  });
}
// site photos from the transfer file go up to DEAP's Evidence screen one at a time; DEAP's file count shows each landed
const evCount = async () => { try { return (await send({ cmd: 'evidence' })).count } catch (e) { return null } };
async function waitCount(n, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (tx.stop) throw new Error('Stopped'); const c = await evCount(); if (c != null && c >= n) return true; await pause(700) }
  return false;
}
function savePhotos(list) {
  const dir = ('BER evidence - ' + ((st.survey.survey && st.survey.survey.name) || 'survey')).replace(/[\\/:*?"<>|]+/g, '-');
  list.forEach(p => chrome.downloads && chrome.downloads.download({ url: p.data, filename: dir + '/' + p.name, conflictAction: 'uniquify' }));
  savePhotos.dir = dir;
  return dir;
}
async function uploadEvidence(step) {
  const ph = st.survey.photos || [];
  let have = await evCount(), done = 0;
  for (let i = 0; i < ph.length; i++) {
    if (tx.stop) throw new Error('Stopped');
    setStep(step, 'running', 'Uploading ' + (i + 1) + ' of ' + ph.length);
    let r = await send({ cmd: 'upload', file: ph[i] });
    if (r && r.missing) { await pressWait('ADD EVIDENCE', false, 3000); await pause(1200); r = await send({ cmd: 'upload', file: ph[i] }) }
    if (!r || r.error) { tx.log.push('Evidence: could not hand ' + ph[i].name + ' to DEAP (' + ((r && r.error) || 'no answer') + ')'); break }
    // DEAP may ask about the file (type, description) before it keeps it
    const s = await waitState(x => !!x.dialog || false, 2500);
    if (s && s.dialog) await waitForYou('DEAP opened "' + s.dialog + '" for ' + ph[i].name + (ph[i].cap ? ' (' + ph[i].cap + ')' : '') + '. Fill it in and press SAVE in DEAP.', x => !x.dialog);
    if (have != null) { if (await waitCount(have + 1, 60000)) { have++; done++ } else { tx.log.push('Evidence: ' + ph[i].name + ' did not show up in DEAP. Check the Evidence screen'); have = await evCount() } }
    else done++;
    const cc = countFor('evidence'); if (cc) cc.got = done;
  }
  if (done < ph.length) {
    const left = ph.slice(done), dir = savePhotos(left);
    tx.log.push('Evidence: ' + left.length + ' photo' + (left.length > 1 ? 's' : '') + ' saved to Downloads/' + dir + '. Drag them onto "Drop file(s) here" in DEAP');
  }
  step.note = done + ' of ' + ph.length + ' uploaded';
  const c = countFor('evidence'); if (c) { c.got = done; if (done < ph.length) c.short.push((ph.length - done) + ' not uploaded: saved to Downloads/' + savePhotos.dir) }
}
async function runTransfer() {
  if (tx.running) return;
  tx.running = true; tx.stop = false; tx.log = []; tx.report = []; tx.memUsed = []; tx.memNew = []; tx.memAsk = null; tx.startedAt = new Date().toISOString();
  tx.steps = transferSteps().filter(s => tx.included[s.name] !== false);
  countStart(tx.steps);
  (transferSteps.left || []).forEach(f => tx.log.push('Not transferred yet: ' + (f.parent ? f.parent + ', ' : '') + f.label + ' ' + f.value));
  (transferSteps.leftTables || []).forEach(k => tx.log.push('Not transferred yet: ' + k.split('.').pop().replace(/-/g, ' ') + ' list'));
  render();
  try {
    const s0 = await send({ cmd: 'state' });
    if (!/^\/survey\/[^/]+/.test(s0.path)) throw new Error('Open the assessment in DEAP first');
    if (s0.dialog) throw new Error('Close the open DEAP dialog first');
    for (const step of tx.steps) {
      if (tx.stop) break;
      setStep(step, 'running', 'Opening');
      try {
        await goTo(step);
        if (step.kind === 'evidence') { await uploadEvidence(step); setStep(step, 'done', step.note); continue }
        if (step.fields.length || step.flat.length) {
          setStep(step, 'running', 'Filling');
          let res = await fillOn(step, { fields: step.fields, tables: step.flat });
          // ticking a box or picking a type can show more DEAP fields, so go over the screen once more
          // choices unlock other boxes (storage type unlocks cylinder thickness), so go over what did not stick, up to twice
          // keep going while each pass sets something new (category, then sub category, then sub category 2, then heating system)
          for (let pass = 0; pass < 6; pass++) {
            const redo = step.fields.filter(f => res.some(x => x.key === f.key && !/^(same|skipped|filled)$/.test(x.status)));
            // table boxes too: DEAP only shows a height box per storey once Number of Storeys is in
            const tredo = step.flat.filter(t => res.some(x => x.key.startsWith(t.key) && /^(nomatch|norow)$/.test(x.status)));
            if (!redo.length && !tredo.length) break;
            await pause(pass ? 1500 : 1200);
            const again = await fillOn(step, { fields: redo, tables: tredo });
            const tk = again.filter(y => tredo.some(t => y.key.startsWith(t.key)));
            res = res.filter(x => !again.some(y => y.key === x.key) && !(tk.length && tredo.some(t => x.key.startsWith(t.key)))).concat(again);
            if (pass && !again.some(y => /^(same|filled)$/.test(y.status))) break;
          }
          // a box that was filled on an early pass can be wiped when a later choice redraws the screen, so check it once more
          const chk = step.fields.filter(f => res.some(x => x.key === f.key && x.status === 'filled'));
          if (chk.length) {
            await pause(800);
            const back = await fillOn(step, { fields: chk, tables: [] });
            res = res.map(x => { const y = back.find(b => b.key === x.key); return y && y.status !== 'same' ? y : x });
          }
          results[step.screen] = res;
          const lab = x => { const t = x.row != null && step.flat.find(q => q.key === x.key), c = t && t.columns.find(q => q.key === x.col); return Object.assign({ label: (step.fields.find(q => q.key === x.key) || {}).label || (t ? t.title + ' ' + (x.row + 1) + (c ? ', ' + c.label : '') : x.key) }, x) };
          step.rep = { step: step.name, results: res.map(lab) }; step.res = res; step.lab = lab;
          tx.report.push(step.rep);
          await pause(1500); // DEAP saves these screens itself
          await pause(1500); // DEAP saves these screens itself
        }
        for (const t of step.dlg) {
          // library items (doors, windows, heat sources, chimneys and fans, showers and baths, solar collector) are
          // picked by the person in DEAP; unless they ask the transfer to stop for each, they go on the by-hand list
          if ((step.mapping[t.key] || {}).library && tx.library === 'list') { libraryList(step, t); continue }
          await addItems(step, t);
        }
        if (step.res) {
          // some boxes only show once an item is added (the battery question waits for a PV array), so try those again
          const left = () => step.fields.filter(f => step.res.some(x => x.key === f.key && !/^(same|skipped|filled)$/.test(x.status)));
          for (let pass = 0; pass < 2 && step.dlg.length && left().length; pass++) {
            await pause(1500);
            const again = await fillOn(step, { fields: left(), tables: [] });
            step.res = step.res.filter(x => !again.some(y => y.key === x.key)).concat(again);
          }
          step.rep.results = step.res.map(step.lab);
          const bad = step.res.filter(x => !/filled|same|skipped/.test(x.status));
          bad.forEach(x => { const f = step.fields.find(q => q.key === x.key); tx.log.push(step.name + ': ' + (f ? f.label + ' ' + f.value : x.key) + ' by hand' + (x.detail ? ' (' + x.detail + ')' : '')) });
          if (bad.length) step.missed = (step.missed || 0) + bad.length;
        }
        setStep(step, step.missed ? 'partial' : 'done', step.missed ? step.missed + ' left for you, see the run report' : '');
      } catch (e) {
        if (tx.stop) { setStep(step, 'stopped', ''); countRest(step, 'not entered: the run was stopped'); break }
        setStep(step, 'failed', String(e.message || e));
        countRest(step, 'not entered: ' + String(e.message || e));
        // never leave a dialog open behind a failed step, or the next screens cannot open
        try { const s = await send({ cmd: 'state' }); if (s && s.dialog) { await send({ cmd: 'press', text: 'CANCEL', inDialog: true }); await waitState(x => !x.dialog, 4000) } } catch (x) { }
      }
    }
  } catch (e) { toast(String(e.message || e)) }
  // steps the run never got to
  tx.steps.filter(s => s.status === 'todo').forEach(s => countRest(s, tx.stop ? 'not entered: the run was stopped' : 'not entered: the run ended early'));
  tx.running = false; render();
}

function reportText() {
  const icon = st => /filled|same/.test(st) ? 'OK ' : /skipped/.test(st) ? '-- ' : 'XX ';
  const L = ['BER Survey DEAP Fill run report', 'Extension ' + chrome.runtime.getManifest().version + ', survey "' + ((st.survey && st.survey.survey && st.survey.survey.name) || '') + '", ' + (tx.startedAt || ''), ''];
  if ((tx.counts || []).length) {
    L.push('COUNT CHECK (survey items against what went into DEAP)');
    tx.counts.forEach(c => { L.push('  ' + (c.got < c.want ? 'SHORT ' : 'OK    ') + c.name + ': ' + c.got + ' of ' + c.want); c.short.forEach(x => L.push('        ' + x)) });
    L.push('');
  }
  L.push('STEPS'); tx.steps.forEach(s => L.push('  ' + s.name + ': ' + s.status + (s.note ? ' (' + s.note + ')' : '')));
  L.push('', 'EVERY FIELD (OK = set, XX = not set, -- = left out)');
  (tx.report || []).forEach(r => {
    L.push('', r.step + (r.item ? ', ' + r.item : ''));
    r.results.filter(x => x.status !== 'skipped').forEach(x => L.push('  ' + icon(x.status) + x.label + ': sent "' + (x.sent ?? '') + '"' + (x.deap ? ' into ' + x.deap + ', DEAP now shows "' + (x.now ?? '') + '"' : '') + ' [' + (STATUS[x.status] || x.status) + (x.detail ? ': ' + x.detail : '') + ']'));
  });
  L.push('', 'TO CHECK OR DO BY HAND'); (tx.log || []).forEach(x => L.push('  ' + x));
  return L.join('\n');
}
function saveReport() {
  const name = ('DEAP run report - ' + ((st.survey && st.survey.survey && st.survey.survey.name) || 'survey')).replace(/[\\/:*?"<>|]+/g, '-') + '.txt';
  const url = URL.createObjectURL(new Blob([reportText()], { type: 'text/plain' }));
  if (chrome.downloads) chrome.downloads.download({ url, filename: name, saveAs: true }).then(() => toast('Saved ' + name), () => toast('Could not save. Use Copy run report instead.'));
}
function transferCard() {
  const steps = tx.steps.length ? tx.steps : transferSteps();
  const card = h('div', { class: 'card xfer' }, h('div', { class: 'row' }, h('h2', { style: 'flex:1' }, 'Transfer whole survey'),
    tx.running ? h('button', { class: 'btn', onclick: () => { tx.stop = true; render() } }, tx.stop ? 'Stopping…' : 'Stop')
      : h('button', { class: 'btn primary', disabled: !deapTab, onclick: runTransfer }, tx.steps.length ? 'Run again' : 'Start')));
  if (!tx.running && tx.steps.length && (tx.counts || []).length) card.append(countCard());
  if (!tx.running && !tx.steps.length) card.append(h('p', { class: 'note' }, 'Open this assessment in DEAP, then press Start. It goes through each screen, adds the walls, floors, roofs, doors and windows, and saves each one. It never publishes. Untick anything already in DEAP so it is not added twice.'));
  if (tx.waitingFor) card.append(h('div', { class: 'needs' }, h('b', null, 'Your turn: '), tx.waitingFor,
    tx.memAsk ? h('label', { class: 'chk mem' }, h('input', { type: 'checkbox', checked: mem.remember, onchange: e => { mem.remember = e.target.checked } }), h('span', null, h('b', null, 'Remember my pick for "' + tx.memAsk.said + '"'), h('br'), h('small', null, 'Next time a survey has this ' + tx.memAsk.what.toLowerCase() + ', I\'ll pick the same item myself.'))) : null,
    h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn small', onclick: () => { tx.skipWait = true } }, 'Skip this one'))));
  if (!tx.running) {
    const sel = h('select', { onchange: e => { tx.library = e.target.value } },
      ...[['pick', 'Pick them for me when the match is sure, otherwise stop for me'], ['stop', 'Stop at each one so I pick it'], ['list', 'Skip them and list them for me to add']].map(([v, l]) => h('option', { value: v, selected: tx.library === v }, l)));
    card.append(h('label', { class: 'chk', style: 'display:block' }, 'Library items (doors, windows, heat sources, chimneys, showers): ', sel));
  }
  if (!tx.running) card.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: tx.overwrite, onchange: e => { tx.overwrite = e.target.checked } }), 'Replace values already in DEAP (untick to keep what DEAP has)'));
  const list = h('div', { class: 'steps2' });
  steps.forEach(s => {
    const icon = { todo: '○', running: '◐', done: '✓', partial: '!', failed: '!', stopped: '■' }[s.status] || '○';
    const extra = [s.fields.length ? s.fields.length + ' values' : '', s.items ? s.items + ' to add' : ''].filter(Boolean).join(' · ');
    list.append(h('label', { class: 'step ' + s.status },
      tx.running || tx.steps.length ? h('span', { class: 'ic' }, icon) : h('input', { type: 'checkbox', checked: tx.included[s.name] !== false, onchange: e => { tx.included[s.name] = e.target.checked } }),
      h('span', { class: 'nm' }, s.name, h('small', null, s.note || extra))));
  });
  card.append(list);
  if (!tx.running && ((tx.memUsed || []).length || (tx.memNew || []).length)) {
    const mrow = (x, extra) => h('div', { class: 'memrow' }, h('span', { class: 'dot ' + (extra ? 'a' : 'g') }), h('span', { style: 'flex:1;min-width:0' }, x.what + ': ' + x.picked, extra ? h('span', { class: 'tag' }, extra) : null, h('small', null, x.said)),
      mem.picks[x.key] ? h('button', { class: 'btn ghost small', title: 'Forget it, so next time it asks you again', onclick: () => { delete mem.picks[x.key]; memSave(); render(); toast('Forgotten. Next time it asks you') } }, 'Forget') : h('small', null, 'forgotten'));
    card.append(h('div', { class: 'mem-box' }, (tx.memUsed || []).length ? h('h3', null, 'Picked for you from memory (' + tx.memUsed.length + ')') : null, ...(tx.memUsed || []).map(x => mrow(x)),
      (tx.memNew || []).length ? h('h3', null, 'You picked, now remembered (' + tx.memNew.length + ')') : null, ...(tx.memNew || []).map(x => mrow(x, 'NEW')),
      h('p', { class: 'note' }, 'Check each one in DEAP. Picked the wrong item? Fix it in DEAP and press Forget, so it asks you next time.')));
  }
  if (tx.log && tx.log.length && !tx.running) card.append(h('details', { open: true }, h('summary', null, tx.log.length + ' to do by hand in DEAP'), h('div', { class: 'scan' }, tx.log.join('\n')), h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => copy(tx.log.join('\n')) }, 'Copy list'))));
  if (!tx.running && tx.steps.length) {
    card.append(h('p', { class: 'note' }, 'Something wrong in DEAP? Save the run report and send it to Claude. It lists every field, what was sent and what DEAP shows now.'));
    card.append(h('div', { class: 'row' }, h('button', { class: 'btn primary small', onclick: saveReport }, 'Save run report'), h('button', { class: 'btn small', onclick: () => copy(reportText()) }, 'Copy run report'), h('button', { class: 'btn ghost small', onclick: () => { tx.steps = []; tx.log = []; tx.counts = []; render() } }, 'Reset')));
  }
  if (!tx.running) card.append(memoryCard());
  return card;
}
function countCard() {
  const lack = countLacking();
  const box = h('div', { class: 'cc' }, h('div', { class: 'cc-h' }, h('b', null, 'Count check'), h('span', { class: 'pill ' + (lack.length ? 'warn' : 'ok') }, lack.length ? lack.length + ' short' : 'All in')),
    h('div', { class: 'cc-sub' }, 'Survey items against what went into DEAP'));
  tx.counts.forEach(c => {
    const short = c.got < c.want;
    box.append(h('div', { class: 'cr ' + (short ? 'short' : 'ok') }, h('span', { class: 'ic' }, short ? '!' : '✓'),
      h('span', { class: 'nm' }, c.name, ...(short ? (c.short.length ? c.short : [(c.want - c.got) + ' not entered']) : [c.note]).filter(Boolean).map(x => h('small', null, x)),
        short && c.path ? h('button', { class: 'go', disabled: !deapTab, onclick: () => send({ cmd: 'nav', path: c.path }).catch(e => toast(String(e.message || e))) }, 'Open ' + c.name + ' in DEAP') : null),
      h('span', { class: 'n' }, String(c.got), h('span', null, ' of '), String(c.want))));
  });
  return box;
}
// every remembered pick on this laptop: forget one, or move them to another laptop
function memoryCard() {
  const keys = Object.keys(mem.picks).sort((a, b) => (mem.picks[a].what || a).localeCompare(mem.picks[b].what || b));
  const file = h('input', { type: 'file', accept: '.json', hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const m = JSON.parse(await f.text()); Object.assign(mem.picks, m.libMemory || m); memSave(); render(); toast('Remembered picks imported') } catch (x) { toast('That is not a remembered picks file') } } });
  const exp = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ libMemory: mem.picks }, null, 1)], { type: 'application/json' })); chrome.downloads && chrome.downloads.download({ url, filename: 'DEAP remembered picks.json', saveAs: true }) };
  return h('details', { class: 'mem-all' }, h('summary', null, 'Remembered library picks (' + keys.length + ')'),
    keys.length ? null : h('p', { class: 'note' }, 'None yet. When the transfer stops for you to pick a library item, the pick is remembered for next time.'),
    ...keys.map(k => { const x = mem.picks[k]; return h('div', { class: 'memrow' }, h('span', { style: 'flex:1;min-width:0' }, (x.what || k.split('|')[0]) + ': ' + x.picked, h('small', null, x.said + (x.n ? ' · used ' + x.n + ' time' + (x.n > 1 ? 's' : '') : ''))), h('button', { class: 'btn ghost small', onclick: () => { delete mem.picks[k]; memSave(); render() } }, 'Forget')) }),
    h('div', { class: 'row' }, file, h('button', { class: 'btn small', onclick: exp, disabled: !keys.length }, 'Export'), h('button', { class: 'btn small', onclick: () => file.click() }, 'Import')));
}
