// BER Survey DEAP Fill: whole-survey transfer.
// Goes through DEAP's screens in order, fills each one, and for walls, floors, roofs, doors and windows
// presses ADD, fills the dialog and presses SAVE, one item at a time. It never presses Publish or Submit:
// content.js refuses those buttons whatever it is asked.
const tx = { running: false, stop: false, steps: [], waitingFor: null, skipWait: false, included: {} };
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
      put('heat.system', 'Heating system', cond ? 'Condensing' : yr >= 1998 ? 'Standard oil boiler, 1998 or later' : yr >= 1985 ? 'Standard oil boiler 1985 to 1997' : yr ? 'Standard oil boiler pre-1985' : '');
    } else if (/gas|lpg/i.test(src + fuel)) {
      put('heat.sub2', 'Sub category 2', !yr || yr >= 1998 ? 'Gas boilers (including LPG) 1998 or later' : /fan/i.test(v('heat.flue')) ? 'Gas boilers (including LPG) pre-1998, with fan-assisted flue' : 'Gas boilers (including LPG) pre-1998, with balanced or open flue');
      const combi = yes('water.combi');
      put('heat.system', 'Heating system', cond ? (combi ? 'Condensing combi' : 'Condensing') : combi ? (yr && yr < 1998 ? 'Combi, pre-1998' : 'Combi, 1998 or later') : '');
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
  put('openings.ops', 'Number of openings', ops);
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
  if (v('heat.src')) heats.push([v('heat.make') || v('heat.src'), fuel(v('heat.fuel')), v('heat.eff'), /same as main/i.test(v('water.src')) || yes('water.combi') ? 'Yes' : v('water.src') ? 'No' : '']);
  if (v('heat.sec') && v('heat.sec') !== 'None') heats.push([v('heat.sec'), fuel(v('heat.secfuel')), v('heat.seceff'), '']);
  tbl('heat.sources', 'Heat sources', [['search', 'Library search'], ['fuel', 'Fuel type'], ['eff', 'Efficiency %'], ['water', 'Heats water']], heats);
  const vent = [['chimneys', 'chimney'], ['flues', 'open flue'], ['fans', 'intermittent fan'], ['vents', 'passive vent'], ['flueless', 'flueless']].filter(([k]) => n('vent.' + k) > 0).map(([k, q]) => [q, String(n('vent.' + k))]);
  tbl('vent.items', 'Ventilation items', [['search', 'Library search'], ['n', 'Number of items']], vent);
  const wsc = st.survey.screens.find(x => x.id === 'water'), sh = wsc && wsc.tables.find(t => t.key === 'water.showers'), wet = [];
  if (sh) { const ti = sh.columns.findIndex(c => c.key === 'type'); sh.rows.forEach(r => wet.push([(r[ti] || '').replace(/ \/.*$/, '') + ' shower', '1'])) }
  if (n('water.baths') > 0) wet.push(['bath', String(n('water.baths'))]);
  tbl('water.wet', 'Showers and baths', [['search', 'Library search'], ['n', 'Number of items']], wet);
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
  // anything the survey holds that no DEAP screen above takes: listed for doing by hand
  const used = new Set(steps.flatMap(s => s.fields.map(f => f.key)).concat(pool.filter(f => synthTables.uses.test(f.key)).map(f => f.key)));
  transferSteps.left = pool.filter(f => !used.has(f.key) && f.screen && !(fullMap([f.key])[f.key] || {}).skip && !/\.calc\.|^heat\.controls/.test(f.key));
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
}

async function fillOn(step, payload) {
  const r = await send(Object.assign({ cmd: 'fill', options: { overwrite: st.overwrite, scroll: false }, mapping: step.mapping }, payload));
  if (r && r.error) throw new Error(r.error);
  return r.results;
}

const after = (txt, t, ri) => txt.replace(/\{(\w+)\}/g, (_, k) => t.rows[ri][t.columns.findIndex(c => c.key === k)] || '?');
async function addItems(step, t) {
  const m = step.mapping[t.key] || {}, label = t.title.replace(/ \(.*\)$/, '').replace(/s$/, '');
  for (let ri = 0; ri < t.rows.length; ri++) {
    if (tx.stop) throw new Error('Stopped');
    const what = label + ' ' + (ri + 1) + ' of ' + t.rows.length;
    setStep(step, 'running', what);
    const pr = await send({ cmd: 'press', text: m.add });
    if (pr && pr.error) throw new Error(pr.error);
    let s = await waitState(x => !!x.dialog, 8000);
    if (!s) throw new Error(m.add + ' did not open a dialog');
    if (m.library && /library/i.test(s.dialog)) {
      const si = t.columns.findIndex(c => c.key === 'search'), phrase = si >= 0 ? t.rows[ri][si] : '';
      if (phrase) { await pause(500); await send({ cmd: 'libsearch', text: phrase }) }
      const desc = t.rows[ri].filter(Boolean).slice(0, 5).join(', ');
      const got = await waitForYou('Pick the DEAP library item for ' + what + ' (' + desc + ') and press ADD. ' + (phrase ? 'I searched the library for "' + phrase + '". ' : '') + 'I fill in the rest.', x => x.dialog && !/library/i.test(x.dialog) || !x.dialog);
      s = await send({ cmd: 'state' });
      if (!got) { tx.log.push(step.name + ': ' + what + ' skipped'); if (s.dialog) await send({ cmd: 'press', text: 'CANCEL', inDialog: true }); continue }
      if (!s.dialog) { // added straight from the library: whatever else the survey has for it is left to enter in DEAP
        const rest = t.columns.map((c, i) => [c, t.rows[ri][i]]).filter(([c, x]) => c.key !== 'search' && x && !(c.key === 'n' && x === '1') && !((step.mapping[t.key + '.' + c.key] || {}).skip)).map(([c, x]) => c.label + ' ' + x);
        if (rest.length) tx.log.push(step.name + ': ' + what + ' added, check in DEAP: ' + rest.join(', '));
        if (m.after) tx.log.push(step.name + ': ' + what + ', ' + after(m.after, t, ri));
        await pause(900); continue
      }
      await pause(800);
    }
    await pause(600);
    const res = await fillOn(step, { scope: 'dialog', fields: [], tables: [Object.assign({}, t, { rows: [t.rows[ri]] })] });
    results[step.screen] = (results[step.screen] || []).filter(x => !(x.key === t.key && x.row === ri)).concat(res.map(x => Object.assign(x, x.row != null ? { row: ri } : {})));
    res.filter(x => !/filled|same|skipped/.test(x.status)).forEach(x => tx.log.push(step.name + ': ' + what + ', ' + (t.columns.find(c => c.key === x.col) || {}).label + ' by hand' + (x.detail ? ' (' + x.detail + ')' : '')));
    const sv = await send({ cmd: 'press', text: 'SAVE', inDialog: true });
    if (sv && sv.error) throw new Error(sv.error + ' in the ' + s.dialog + ' dialog');
    const closed = await waitState(x => !x.dialog, 8000);
    if (!closed) {
      const errs = await send({ cmd: 'errors' });
      const fixed = await waitForYou('DEAP did not save ' + what + (errs && errs.length ? ': ' + errs.join('; ') : '') + '. Fix it in the dialog and press SAVE (or Cancel to skip it).', x => !x.dialog);
      if (!fixed) throw new Error('Stopped at ' + what);
    }
    if (m.after) tx.log.push(step.name + ': ' + what + ', ' + after(m.after, t, ri));
    await pause(900);
  }
}

async function runTransfer() {
  if (tx.running) return;
  tx.running = true; tx.stop = false; tx.log = [];
  tx.steps = transferSteps().filter(s => tx.included[s.name] !== false);
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
        if (step.fields.length || step.flat.length) {
          setStep(step, 'running', 'Filling');
          let res = await fillOn(step, { fields: step.fields, tables: step.flat });
          // ticking a box or picking a type can show more DEAP fields, so go over the screen once more
          if (res.some(x => x.status === 'nomatch')) { await pause(1200); const again = await fillOn(step, { fields: step.fields.filter(f => res.some(x => x.key === f.key && x.status === 'nomatch')), tables: [] }); res = res.filter(x => !(x.status === 'nomatch' && again.some(y => y.key === x.key))).concat(again) }
          results[step.screen] = res;
          res.filter(x => !/filled|same|skipped/.test(x.status)).forEach(x => { const f = step.fields.find(q => q.key === x.key); tx.log.push(step.name + ': ' + (f ? f.label + ' ' + f.value : x.key) + ' by hand' + (x.detail ? ' (' + x.detail + ')' : '')) });
          await pause(1500); // DEAP saves these screens itself
        }
        for (const t of step.dlg) await addItems(step, t);
        setStep(step, 'done', '');
      } catch (e) {
        if (tx.stop) { setStep(step, 'stopped', ''); break }
        setStep(step, 'failed', String(e.message || e));
      }
    }
  } catch (e) { toast(String(e.message || e)) }
  tx.running = false; render();
}

function transferCard() {
  const steps = tx.steps.length ? tx.steps : transferSteps();
  const card = h('div', { class: 'card xfer' }, h('div', { class: 'row' }, h('h2', { style: 'flex:1' }, 'Transfer whole survey'),
    tx.running ? h('button', { class: 'btn', onclick: () => { tx.stop = true; render() } }, tx.stop ? 'Stopping…' : 'Stop')
      : h('button', { class: 'btn primary', disabled: !deapTab, onclick: runTransfer }, tx.steps.length ? 'Run again' : 'Start')));
  if (!tx.running && !tx.steps.length) card.append(h('p', { class: 'note' }, 'Open this assessment in DEAP, then press Start. It goes through each screen, adds the walls, floors, roofs, doors and windows, and saves each one. It never publishes. Untick anything already in DEAP so it is not added twice.'));
  if (tx.waitingFor) card.append(h('div', { class: 'needs' }, h('b', null, 'Your turn: '), tx.waitingFor, h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn small', onclick: () => { tx.skipWait = true } }, 'Skip this one'))));
  const list = h('div', { class: 'steps2' });
  steps.forEach(s => {
    const icon = { todo: '○', running: '◐', done: '✓', failed: '!', stopped: '■' }[s.status] || '○';
    const extra = [s.fields.length ? s.fields.length + ' values' : '', s.items ? s.items + ' to add' : ''].filter(Boolean).join(' · ');
    list.append(h('label', { class: 'step ' + s.status },
      tx.running || tx.steps.length ? h('span', { class: 'ic' }, icon) : h('input', { type: 'checkbox', checked: tx.included[s.name] !== false, onchange: e => { tx.included[s.name] = e.target.checked } }),
      h('span', { class: 'nm' }, s.name, h('small', null, s.note || extra))));
  });
  card.append(list);
  if (tx.log && tx.log.length && !tx.running) card.append(h('details', { open: true }, h('summary', null, tx.log.length + ' to do by hand in DEAP'), h('div', { class: 'scan' }, tx.log.join('\n')), h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => copy(tx.log.join('\n')) }, 'Copy list'))));
  if (!tx.running && tx.steps.length) card.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => { tx.steps = []; tx.log = []; render() } }, 'Reset')));
  return card;
}
