// BER Survey DEAP Fill: side panel. Holds the loaded survey, picks the DEAP screen, and asks the page to fill it.
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v) }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)) }
  return e;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 2200) }
const slug = t => String(t).toLowerCase().replace(/²/g, '2').replace(/³/g, '3').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DEFAULT_SKIP = /(\.ev|_src|\.notes|\.make|model|\.harp|\.hyear|\.testcert)$/;
const STATUS = { filled: 'Filled', same: 'Already set', kept: 'Kept DEAP value', nomatch: 'Not found on this page', norow: 'Add more rows in DEAP, then fill again', nooption: 'DEAP has no matching option', error: 'Could not fill', skipped: 'Left out' };

let st = { survey: null, screen: null, overwrite: false, follow: true, userMap: {} };
let base = { screens: {}, fields: {} }, results = {}, deapTab = null, scanOut = null, busy = false;

async function init() {
  base = await (await fetch(chrome.runtime.getURL('mapping.json'))).json();
  const saved = await chrome.storage.local.get(['survey', 'screen', 'overwrite', 'follow', 'userMap']);
  Object.assign(st, Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined)));
  chrome.tabs.onUpdated.addListener((id, ch, tab) => { if (ch.url || ch.status === 'complete') findTab() });
  chrome.tabs.onActivated.addListener(() => findTab());
  document.addEventListener('dragover', e => { e.preventDefault(); const d = $('.drop'); if (d) d.classList.add('on') });
  document.addEventListener('dragleave', () => { const d = $('.drop'); if (d) d.classList.remove('on') });
  document.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) f.text().then(loadText) });
  await loadRec();
  await findTab();
  render();
}
const save = () => chrome.storage.local.set({ survey: st.survey, screen: st.screen, overwrite: st.overwrite, follow: st.follow, userMap: st.userMap });

// ---------- the DEAP tab ----------
async function findTab() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: 'https://deap.seai.ie/*' }) } catch (e) { }
  tabs.sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  const prev = deapTab && deapTab.url;
  deapTab = tabs[0] || null;
  const p = $('#tabState');
  p.className = 'pill ' + (deapTab ? 'ok' : 'warn');
  p.textContent = deapTab ? 'DEAP open' : 'Open DEAP in a tab';
  if (deapTab && st.follow && st.survey && deapTab.url !== prev) {
    const id = screenForUrl(deapTab.url);
    if (id && id !== st.screen) { st.screen = id; save(); render() }
  }
}
function screenForUrl(url) {
  let path = ''; try { path = new URL(url).pathname.toLowerCase() } catch (e) { return null }
  const have = new Set((st.survey ? st.survey.screens : []).map(s => s.id));
  for (const [id, s] of Object.entries(base.screens)) { if (have.has(id) && s.url && new RegExp(s.url).test(path)) return id }
  return null;
}
async function send(msg) {
  await findTab();
  if (!deapTab) throw new Error('Open deap.seai.ie in a Chrome tab first.');
  try { return await chrome.tabs.sendMessage(deapTab.id, msg) }
  catch (e) {
    await chrome.scripting.executeScript({ target: { tabId: deapTab.id }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(deapTab.id, msg);
  }
}

// ---------- mapping ----------
const mapFor = key => Object.assign({}, base.fields[key], st.userMap[key]);
function fullMap(keys) { const m = {}; keys.forEach(k => { const v = mapFor(k); if (Object.keys(v).length) m[k] = v; if (DEFAULT_SKIP.test(k) && !st.userMap[k] && !base.fields[k]) m[k] = { skip: true } }); return m }

// ---------- what to send for one screen ----------
// Multi-choice answers become one Yes per ticked option; wall types become a table (one row per type)
function job(sc) {
  const fields = [], tables = sc.tables.map(t => Object.assign({}, t));
  sc.fields.filter(f => !f.group).forEach(f => {
    if (Array.isArray(f.value)) f.value.forEach(o => fields.push({ key: f.key + '.' + slug(o), label: o, value: 'Yes', parent: f.label }));
    else fields.push({ key: f.key, label: f.label, value: f.value });
  });
  const grouped = sc.fields.filter(f => f.group);
  if (grouped.length) {
    const groups = [...new Set(grouped.map(f => f.group))], cols = [{ key: 'name', label: 'Description' }];
    grouped.forEach(f => { const ck = f.key.split('.').pop(); if (!cols.some(c => c.key === ck)) cols.push({ key: ck, label: f.label }) });
    // DEAP's Add Wall dialog also wants the age band (wall year, else the dwelling's) and a semi-exposed tick
    if (!cols.some(c => c.key === 'year')) cols.push({ key: 'year', label: 'Year built' });
    cols.push({ key: 'semi', label: 'Semi-exposed' });
    const dyear = ((st.survey.screens.find(x => x.id === 'details') || { fields: [] }).fields.find(f => f.key === 'details.year') || {}).value || '';
    const val = (g, k) => k === 'name' ? g : k === 'semi' ? (/semi/i.test(g) ? 'Yes' : 'No') : (grouped.find(f => f.group === g && f.key.endsWith('.' + k)) || {}).value || (k === 'year' ? dyear : '');
    tables.unshift({ key: sc.id + '.types', title: 'Wall types', columns: cols, rows: groups.map(g => cols.map(c => val(g, c.key))) });
  }
  const keys = fields.map(f => f.key).concat(tables.flatMap(t => [t.key].concat(t.columns.map(c => t.key + '.' + c.key))));
  return { fields, tables, mapping: fullMap(keys) };
}

// ---------- actions ----------
function loadText(txt) {
  let d;
  try { d = JSON.parse(txt) } catch (e) { toast('That is not a transfer file.'); return }
  if (d && Array.isArray(d.walls)) { toast('That is a Backup. In the app use Enter in DEAP, then Share transfer file.'); return }
  if (!d || d.format !== 'ber-survey-deap' || !Array.isArray(d.screens)) { toast('That is not a BER Survey transfer file.'); return }
  st.survey = d; results = {};
  st.screen = (deapTab && screenForUrl(deapTab.url)) || d.screens[0]?.id;
  save(); render(); toast('Loaded ' + d.survey.name);
}
async function fillScreen() {
  const sc = cur(); if (!sc || busy) return;
  busy = true; render();
  try {
    const j = job(sc);
    j.tables = j.tables.filter(t => !isDialog(j, t));
    const r = await send(Object.assign({ cmd: 'fill', options: { overwrite: st.overwrite } }, j));
    if (r && r.error) throw new Error(r.error);
    const dk = new Set(job(sc).tables.filter(t => isDialog(j, t)).map(t => t.key));
    results[sc.id] = (results[sc.id] || []).filter(x => dk.has(x.key)).concat(r.results);
    const n = c => r.results.filter(x => c.includes(x.status)).length;
    toast(n(['filled', 'same']) + ' filled, ' + n(['nomatch', 'norow', 'nooption', 'error']) + ' to do by hand');
  } catch (e) { toast(String(e.message || e)) }
  busy = false; render();
}
// DEAP adds walls, windows and so on one at a time in a dialog, so a table row is filled into the open dialog
const isDialog = (j, t) => (j.mapping[t.key] || {}).dialog !== false;
async function fillRow(t, ri) {
  const sc = cur(); if (!sc || busy) return;
  busy = true; render();
  try {
    const j = job(sc);
    const r = await send({ cmd: 'fill', options: { overwrite: st.overwrite }, fields: [], tables: [Object.assign({}, t, { rows: [t.rows[ri]] })], mapping: j.mapping });
    if (r && r.error) throw new Error(r.error);
    const got = r.results.map(x => Object.assign(x, x.row != null ? { row: ri } : {}));
    results[sc.id] = (results[sc.id] || []).filter(x => !(x.key === t.key && x.row === ri)).concat(got);
    const ok = got.filter(x => /filled|same/.test(x.status)).length, bad = got.filter(x => /nomatch|norow|nooption|error/.test(x.status)).length;
    toast(ok ? ok + ' filled' + (bad ? ', ' + bad + ' by hand' : '') + '. Check it, then save in DEAP.' : 'Nothing filled. Is the DEAP dialog open?');
  } catch (e) { toast(String(e.message || e)) }
  busy = false; render();
}
async function teach(key, label, column) {
  try {
    toast('Now click the field in DEAP (Esc to cancel)');
    const r = await send({ cmd: 'pick', label, column: !!column });
    if (!r) return toast('Cancelled');
    st.userMap[key] = Object.assign({}, st.userMap[key], r.selector ? { selector: r.selector } : {}, !r.selector && r.label ? { labels: [r.label] } : {});
    delete st.userMap[key].skip;
    save(); render();
    toast('Saved for "' + label + '". Fill again to use it.');
  } catch (e) { toast(String(e.message || e)) }
}
function setSkip(key, on) { st.userMap[key] = Object.assign({}, st.userMap[key], { skip: on }); save(); render() }
async function scan() {
  try { const r = await send({ cmd: 'scan' }); scanOut = r; render() } catch (e) { toast(String(e.message || e)) }
}
async function clearMarks() { try { await send({ cmd: 'clear' }) } catch (e) { } }
const copy = t => navigator.clipboard.writeText(String(t)).then(() => toast('Copied ' + String(t).slice(0, 40)), () => toast('Could not copy'));
function download(name, obj) { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); a.remove() }

// ---------- render ----------
const cur = () => st.survey && st.survey.screens.find(s => s.id === st.screen) || (st.survey && st.survey.screens[0]);
function render() {
  const bar = $('#surveyBar'), main = $('#main');
  bar.replaceChildren();
  if (!st.survey) { main.replaceChildren(recordCard(), loadCard(true), helpCard(), toolsCard()); return }
  const sv = st.survey.survey;
  bar.append(h('div', { class: 'row' }, h('div', { style: 'flex:1;min-width:0' }, h('b', null, sv.name), h('div', { class: 'note' }, [sv.eircode, sv.date].filter(Boolean).join(' · ') || 'Exported ' + new Date(st.survey.exported).toLocaleString('en-IE'))),
    h('button', { class: 'btn ghost', onclick: () => { st.survey = null; save(); render() } }, 'Change')));
  const sc = cur();
  bar.append(h('div', { class: 'chips' }, st.survey.screens.map(x => {
    const r = results[x.id], bad = r ? r.filter(q => /nomatch|norow|nooption|error/.test(q.status)).length : 0;
    return h('button', { 'aria-pressed': String(x.id === sc.id), onclick: () => { st.screen = x.id; save(); clearMarks(); render() } }, x.name, r ? h('span', { class: 'n' }, bad ? bad + ' left' : '✓') : null);
  })));
  main.replaceChildren(screenCard(sc), recordCard(), toolsCard());
}
function loadCard(first) {
  const ta = h('textarea', { placeholder: 'Or paste the transfer text here' });
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: e => { const f = e.target.files[0]; if (f) f.text().then(loadText) } });
  return h('div', { class: 'card' }, h('h2', null, 'Load a survey'),
    h('p', { class: 'note' }, 'On the iPad open the survey, go to Enter in DEAP, and tap Share transfer file. AirDrop, Mail or iCloud Drive it to this laptop.'),
    h('div', { class: 'drop' }, 'Drop the transfer file here', h('div', { class: 'row', style: 'justify-content:center;margin-top:8px' }, h('button', { class: 'btn primary', onclick: () => file.click() }, 'Choose file'))), file,
    ta, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => loadText(ta.value) }, 'Load pasted text')));
}
function helpCard() {
  return h('div', { class: 'card' }, h('h2', null, 'How it works'), h('ol', { class: 'steps' },
    h('li', null, 'Log in to DEAP and open the assessment.'),
    h('li', null, 'Go to a DEAP screen. The panel picks the same screen from your survey.'),
    h('li', null, 'Press Fill this DEAP screen. Green outlines show what it filled. For walls, windows and other lists, open DEAP\'s Add dialog and press Fill on that row.'),
    h('li', null, 'Check the screen and save it in DEAP yourself. Red items are left for you, tap a value to copy it.'),
    h('li', null, 'If a value went in the wrong place or was not found, press Pick and click the right DEAP field. It remembers that for every survey.')));
}
function resultFor(key, row, col) { const r = results[st.screen]; return r && r.find(x => x.key === key && (row == null || (x.row === row && x.col === col))) }
function statusDot(r) { return h('span', { class: 'dot ' + (r ? r.status : ''), title: r ? STATUS[r.status] + (r.detail ? ': ' + r.detail : '') : 'Not filled yet' }) }

function screenCard(sc) {
  const j = job(sc), card = h('div', { class: 'card' });
  const r = results[sc.id];
  card.append(h('div', { class: 'row' }, h('h2', { style: 'flex:1' }, sc.name),
    h('button', { class: 'btn primary', disabled: busy || !deapTab, onclick: fillScreen }, busy ? 'Filling…' : 'Fill this DEAP screen')));
  card.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.overwrite, onchange: e => { st.overwrite = e.target.checked; save() } }), 'Replace values already in DEAP'));
  if (r) {
    const n = c => r.filter(x => c.includes(x.status)).length;
    card.append(h('div', { class: 'sum' }, h('span', { class: 'ok' }, n(['filled', 'same']) + ' filled'), ' · ', h('span', { class: 'warn' }, n(['kept']) + ' kept'), ' · ', h('span', { class: 'bad' }, n(['nomatch', 'norow', 'nooption', 'error']) + ' by hand')));
  }
  const items = h('div', { class: 'items' });
  let lastParent = null;
  j.fields.forEach(f => {
    if (f.parent && f.parent !== lastParent) { items.append(h('h3', null, f.parent)); lastParent = f.parent }
    const res = resultFor(f.key), skip = j.mapping[f.key] && j.mapping[f.key].skip;
    items.append(h('div', { class: 'it' }, skip ? h('span', { class: 'dot skipped', title: 'Left out' }) : statusDot(res),
      h('div', { class: 'k' }, f.label, skip ? h('small', null, 'Left out of filling') : res && res.matched && res.matched !== 'taught field' && norm(res.matched) !== norm(f.label) ? h('small', null, 'DEAP: ' + res.matched) : null),
      h('button', { class: 'v', title: 'Copy', onclick: () => copy(f.value) }, f.value),
      skip ? h('button', { class: 'teach', onclick: () => setSkip(f.key, false) }, 'Use') : h('button', { class: 'teach', title: 'Click the right DEAP field for this value', onclick: () => teach(f.key, f.label) }, 'Pick')));
    if (res && res.status !== 'filled' && res.status !== 'same') items.append(h('div', { class: 'why ' + res.status }, STATUS[res.status] + (res.detail ? ': ' + res.detail : '')));
  });
  card.append(items);
  j.tables.forEach(t => {
    const skip = j.mapping[t.key] && j.mapping[t.key].skip;
    card.append(h('h3', null, t.title + (skip ? ' (left out)' : '')));
    if (skip) { card.append(h('div', { class: 'row' }, h('button', { class: 'teach', onclick: () => setSkip(t.key, false) }, 'Fill this table'))); }
    const dlg = !skip && isDialog(j, t);
    if (dlg) card.append(h('p', { class: 'note' }, 'One at a time: press ADD in DEAP (or open the item), press Fill on its row here, check it and save in DEAP.'));
    const tb = h('table', null, h('thead', null, h('tr', null, dlg ? h('th') : null, t.columns.map(c => h('th', null, c.label, h('br'), h('button', { class: 'teach', onclick: () => teach(t.key + '.' + c.key, c.label + ' (' + t.title + ')', !dlg) }, 'Pick'))))),
      h('tbody', null, t.rows.map((row, ri) => {
        const rr = (results[sc.id] || []).filter(x => x.key === t.key && x.row === ri);
        return h('tr', null, dlg ? h('td', null, h('button', { class: 'btn small' + (rr.length ? '' : ' primary'), disabled: busy || !deapTab, title: 'Fill this row into the open DEAP dialog', onclick: () => fillRow(t, ri) }, rr.length ? 'Again' : 'Fill')) : null,
          row.map((v, ci) => { const res = resultFor(t.key, ri, t.columns[ci].key); return h('td', { class: res ? res.status : '', title: res ? STATUS[res.status] + (res.detail ? ': ' + res.detail : '') : '' }, v === '' ? '' : h('button', { class: 'v', onclick: () => copy(v) }, v)) }));
      })));
    card.append(h('div', { class: 'tbl' }, tb));
    const why = (results[sc.id] || []).filter(x => x.key === t.key && x.detail && !/filled|same/.test(x.status));
    why.forEach(x => card.append(h('div', { class: 'why ' + x.status, style: 'grid-column:auto' }, 'Row ' + (x.row + 1) + ', ' + (t.columns.find(c => c.key === x.col) || {}).label + ': ' + x.detail)));
    const bad = (results[sc.id] || []).filter(x => x.key === t.key && x.status === 'norow').length;
    if (bad) card.append(h('p', { class: 'note' }, 'DEAP shows fewer rows than the survey. Add the missing rows in DEAP, then fill again.'));
    if (!skip) card.append(h('div', { class: 'row' }, h('button', { class: 'teach', onclick: () => setSkip(t.key, true) }, 'Leave this table out')));
  });
  if (!j.fields.length && !j.tables.length) card.append(h('p', { class: 'note' }, 'Nothing was recorded on site for this screen.'));
  card.append(h('div', { class: 'legend' }, h('span', null, h('span', { class: 'dot filled' }), 'filled'), h('span', null, h('span', { class: 'dot kept' }), 'kept DEAP value'), h('span', null, h('span', { class: 'dot nomatch' }), 'do by hand')));
  return card;
}
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- record DEAP once: walk through one assessment and every screen's fields are kept ----------
let rec = { recording: false, recorded: {} };
async function loadRec() { Object.assign(rec, await chrome.storage.local.get(['recording', 'recorded'])); rec.recorded = rec.recorded || {} }
chrome.storage.onChanged.addListener(ch => { if (ch.recorded || ch.recording) loadRec().then(render) });
async function setRecording(on) {
  await chrome.storage.local.set({ recording: on });
  if (on) { try { await send({ cmd: 'ping' }) } catch (e) { } }
}
function recordCard() {
  const scr = Object.values(rec.recorded), nf = scr.reduce((a, s) => a + s.fields.length, 0), nopt = scr.reduce((a, s) => a + s.fields.filter(f => f.options).length, 0);
  const all = () => ({ recorded: new Date().toISOString(), version: chrome.runtime.getManifest().version, screens: rec.recorded, taught: st.userMap });
  return h('div', { class: 'card' + (rec.recording ? ' rec' : '') }, h('h2', null, rec.recording ? '● Recording DEAP fields' : 'Record DEAP fields (one time)'),
    rec.recording ? h('p', { class: 'note' }, 'Click through DEAP: every tab, every Add dialog (then Cancel), and open each dropdown once. Nothing is typed or saved in DEAP.')
      : h('p', { class: 'note' }, 'Press Start, then click through one assessment in DEAP. When you are done, press Save file and send it to Claude once.'),
    h('p', { class: 'sum' }, scr.length + ' screens · ' + nf + ' fields · ' + nopt + ' dropdown lists'),
    h('div', { class: 'row' },
      h('button', { class: 'btn' + (rec.recording ? '' : ' primary'), onclick: () => setRecording(!rec.recording) }, rec.recording ? 'Stop' : 'Start recording'),
      scr.length ? h('button', { class: 'btn' + (rec.recording ? '' : ' primary'), onclick: () => download('deap-fields-recorded.json', all()) }, 'Save file') : null,
      scr.length ? h('button', { class: 'btn', onclick: () => copy(JSON.stringify(all())) }, 'Copy') : null,
      scr.length ? h('button', { class: 'btn ghost', onclick: e => { if (e.target.dataset.armed) chrome.storage.local.set({ recorded: {} }); else { e.target.dataset.armed = 1; e.target.textContent = 'Click again to clear' } } }, 'Clear') : null),
    scr.length ? h('details', null, h('summary', { class: 'note' }, 'What it has seen'), h('div', { class: 'scan' }, scr.map(s => s.key + '  (' + s.fields.length + ')').join('\n'))) : null);
}
function toolsCard() {
  const file = h('input', { type: 'file', accept: '.json', hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; try { const m = JSON.parse(await f.text()); Object.assign(st.userMap, m.fields || m); save(); render(); toast('Field mapping imported') } catch (x) { toast('That is not a mapping file') } } });
  const taught = Object.keys(st.userMap).length;
  const d = h('details', { class: 'card' }, h('summary', null, 'Setup and troubleshooting'),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.follow, onchange: e => { st.follow = e.target.checked; save() } }), 'Switch screen when I move around DEAP'),
    h('p', { class: 'note' }, taught ? taught + ' field' + (taught > 1 ? 's' : '') + ' taught on this laptop.' : 'No fields taught yet.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: scan }, 'List fields on this DEAP page'),
      h('button', { class: 'btn', onclick: () => download('deap-field-mapping.json', { fields: st.userMap }) }, 'Export taught fields'),
      h('button', { class: 'btn', onclick: () => file.click() }, 'Import'), file,
      taught ? h('button', { class: 'btn ghost', onclick: e => { if (e.target.dataset.armed) { st.userMap = {}; save(); render() } else { e.target.dataset.armed = 1; e.target.textContent = 'Click again to forget them' } } }, 'Forget taught fields') : null,
      h('button', { class: 'btn ghost', onclick: clearMarks }, 'Remove outlines')));
  if (scanOut) {
    const txt = JSON.stringify({ url: scanOut.url, fields: scanOut.fields }, null, 1);
    d.open = true;
    d.append(h('p', { class: 'note' }, scanOut.fields.length + ' fields found on ' + scanOut.title + '. Send this list to Claude to improve the matching.'),
      h('div', { class: 'scan' }, scanOut.fields.map(f => f.kind + '  ' + (f.label || '(no label)') + (f.options ? '  [' + f.options.slice(0, 6).join(' | ') + (f.options.length > 6 ? ' …' : '') + ']' : '')).join('\n')),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => copy(txt) }, 'Copy list'), h('button', { class: 'btn', onclick: () => download('deap-page-fields.json', scanOut) }, 'Save list')));
  }
  return d;
}

init();
