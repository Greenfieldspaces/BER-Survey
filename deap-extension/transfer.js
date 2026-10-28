// BER Survey DEAP Fill: whole-survey transfer.
// Goes through DEAP's screens in order, fills each one, and for walls, floors, roofs, doors and windows
// presses ADD, fills the dialog and presses SAVE, one item at a time. It never presses Publish or Submit:
// content.js refuses those buttons whatever it is asked.
const tx = { running: false, stop: false, steps: [], waitingFor: null, skipWait: false, included: {} };
const pause = ms => new Promise(r => setTimeout(r, ms));

function transferSteps() {
  if (!st.survey) return [];
  return (base.transfer || []).map(p => {
    const sc = st.survey.screens.find(x => x.id === p.screen);
    if (!sc) return null;
    const j = job(sc);
    let fields = j.fields.filter(f => !(j.mapping[f.key] || {}).skip), tables = j.tables.filter(t => !(j.mapping[t.key] || {}).skip);
    if (p.only) { fields = []; tables = tables.filter(t => p.only.includes(t.key)) }
    else tables = tables.filter(t => !(base.transfer || []).some(q => q !== p && q.only && q.only.includes(t.key)));
    const dlg = tables.filter(t => isDialog(j, t) && (j.mapping[t.key] || {}).add), flat = tables.filter(t => !isDialog(j, t));
    const items = dlg.reduce((a, t) => a + t.rows.length, 0);
    if (!fields.length && !flat.length && !items) return null;
    return { name: p.name, path: p.path, screen: sc.id, fields, flat, dlg, mapping: j.mapping, items, status: 'todo', note: '' };
  }).filter(Boolean);
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
      const desc = t.rows[ri].filter(Boolean).slice(0, 5).join(', ');
      const got = await waitForYou('Pick the DEAP library item for ' + what + ' (' + desc + ') and press ADD. I fill in the rest.', x => x.dialog && !/library/i.test(x.dialog) || !x.dialog);
      s = await send({ cmd: 'state' });
      if (!got || !s.dialog) { tx.log.push(step.name + ': ' + what + ' skipped'); if (s.dialog) await send({ cmd: 'press', text: 'CANCEL', inDialog: true }); continue }
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
    await pause(900);
  }
}

async function runTransfer() {
  if (tx.running) return;
  tx.running = true; tx.stop = false; tx.log = [];
  tx.steps = transferSteps().filter(s => tx.included[s.name] !== false);
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
          const res = await fillOn(step, { fields: step.fields, tables: step.flat });
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
