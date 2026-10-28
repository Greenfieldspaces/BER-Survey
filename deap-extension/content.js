// BER Survey DEAP Fill: runs inside the DEAP page.
// Finds DEAP's form fields by their labels (or by a selector you taught it), fills them, and outlines what it changed.
// It never clicks Save, Next or any other button in DEAP.
(() => {
  if (window.__bsdf) return;
  window.__bsdf = true;

  const MARK = 'data-bsdf';
  const COLORS = { filled: '#16a34a', same: '#16a34a', kept: '#d97706', nooption: '#dc2626', error: '#dc2626' };
  const SKIP_TYPES = /^(hidden|submit|button|reset|file|image|search|password)$/i;
  const CUSTOM = 'mat-select,[role=combobox]:not(input),[aria-haspopup=listbox]:not(input):not(button),.p-dropdown,.MuiSelect-select,.ng-select .ng-select-container';
  const OPTION_SEL = '[role=option],mat-option,.mat-option,.mat-mdc-option,.ng-option,.p-dropdown-item,.MuiMenuItem-root,.dropdown-item';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- text helpers ----------
  const clean = t => String(t || '').replace(/\s+/g, ' ').replace(/[*:]+\s*$/, '').trim();
  const STOP = new Set(['no', 'of', 'the', 'a', 'an', 'for', 'is', 'there', 'in', 'number', 'nr', 'total', 'value', 'enter', 'select']);
  const UNITS = /\b(m2|m3|mm|m|kwh|kwp|kw|w|l|litres|c|w\/m2k|w\/\(l\/s\)|%)\b/g;
  function norm(t) {
    return String(t || '').toLowerCase().replace(/²/g, '2').replace(/³/g, '3').replace(/°/g, '')
      .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9%/ ]+/g, ' ').replace(UNITS, ' ').replace(/\s+/g, ' ').trim();
  }
  const toks = t => norm(t).split(' ').filter(w => w && !STOP.has(w));
  function sim(a, b) {
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.replace(/ /g, '') === nb.replace(/ /g, '')) return 0.97;
    const A = toks(a), B = toks(b);
    if (!A.length || !B.length) return 0;
    const SA = new Set(A), SB = new Set(B);
    const inter = [...SA].filter(x => SB.has(x)).length;
    if (inter === SA.size && inter === SB.size) return 0.95;
    const sub = (x, y) => (' ' + y + ' ').includes(' ' + x + ' ');
    if (sub(na, nb) || sub(nb, na)) return 0.72 + 0.2 * Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return 0.8 * inter / new Set([...SA, ...SB]).size;
  }
  const best = (labels, cands) => {
    let s = 0, hit = '';
    for (const l of labels) for (const c of cands) { const v = sim(l, c.t) * c.w; if (v > s) { s = v; hit = c.t } }
    return { s, hit };
  };

  // ---------- finding controls ----------
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return el.getClientRects().length > 0;
  }
  const textOf = el => clean(el ? (el.innerText || el.textContent) : '');
  const ownText = (el, ctrl) => {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('input,select,textarea,option,mat-select,[role=listbox]').forEach(x => x.remove());
    return clean(c.textContent);
  };
  const human = s => clean(String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' '));

  function labelCands(el) {
    const out = [], add = (t, w) => { t = clean(t); if (t && t.length <= 120 && !out.some(x => x.t === t)) out.push({ t, w }) };
    add(el.getAttribute('aria-label'), 1);
    (el.getAttribute('aria-labelledby') || '').split(/\s+/).forEach(id => { const l = id && document.getElementById(id); if (l) add(textOf(l), 1) });
    if (el.labels) [...el.labels].forEach(l => add(ownText(l, el), 1));
    const wrapL = el.closest('label'); if (wrapL) add(ownText(wrapL, el), 1);
    const box = el.closest('mat-form-field,.mat-mdc-form-field,.MuiFormControl-root,.form-group,.form-field,.field,.ant-form-item,.p-field,.v-input,.input-group');
    if (box) { const l = box.querySelector('label,mat-label,legend,.mat-mdc-floating-label,.ant-form-item-label,.form-label'); if (l) add(ownText(l, el), 1) }
    if (el.getAttribute('placeholder')) add(el.getAttribute('placeholder'), 0.9);
    if (el.title) add(el.title, 0.9);
    const td = el.closest('td,[role=gridcell],[role=cell]');
    if (td) {
      const tr = td.parentElement, tbl = td.closest('table,[role=grid],[role=table]');
      const idx = [...tr.children].indexOf(td);
      const head = tbl && tbl.querySelector('thead tr,[role=row]:has([role=columnheader])');
      if (head && head !== tr && head.children[idx]) add(textOf(head.children[idx]), 0.95);
    }
    // nearest text before the field, walking out a few levels; only when nothing labels it directly
    let node = out.some(c => c.w === 1) ? null : el;
    for (let lvl = 0; lvl < 4 && node && node !== document.body; lvl++) {
      let p = node.previousElementSibling, hops = 0, found = false;
      while (p && hops < 2) {
        if (p.matches('input,select,textarea,' + CUSTOM) || p.querySelector('input,select,textarea,' + CUSTOM)) break;
        const t = ownText(p);
        if (t && t.length <= 80) { add(t, 0.9); found = true; break }
        if (t) break;
        p = p.previousElementSibling; hops++;
      }
      if (found) break;
      node = node.parentElement;
    }
    ['formcontrolname', 'name', 'id'].forEach(a => { const v = el.getAttribute(a); if (v && !/^(mat|ng|cdk|mui|react|:r)|\d{3,}/i.test(v)) add(human(v), 0.75) });
    return out;
  }

  function radioGroupLabel(radios) {
    const first = radios[0];
    const box = first.closest('[role=radiogroup],fieldset,mat-radio-group,.radio-group');
    const out = [];
    if (box) {
      const lg = box.querySelector('legend'); if (lg) out.push({ t: clean(lg.textContent), w: 1 });
      if (box.getAttribute('aria-label')) out.push({ t: clean(box.getAttribute('aria-label')), w: 1 });
      const lb = box.getAttribute('aria-labelledby'); if (lb && document.getElementById(lb)) out.push({ t: textOf(document.getElementById(lb)), w: 1 });
      labelCands(box).forEach(c => out.push(c));
    } else labelCands(first.closest('label') || first).filter(c => c.w < 1).forEach(c => out.push(c));
    return out;
  }
  const optLabel = r => clean((r.labels && r.labels[0] ? ownText(r.labels[0]) : '') || ownText(r.closest('label,mat-radio-button,mat-checkbox')) || r.value);

  function collect(root) {
    root = root || document;
    const list = [], seenRadio = new Set();
    root.querySelectorAll('input,select,textarea').forEach(el => {
      if (el.closest('#bsdf-ui') || el.disabled || el.readOnly && el.type !== 'radio') return;
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (el.tagName === 'INPUT' && SKIP_TYPES.test(type)) return;
      if (type === 'radio') {
        const name = el.name || el.closest('[role=radiogroup],mat-radio-group,fieldset')?.id || Math.random();
        if (seenRadio.has(name)) return; seenRadio.add(name);
        const radios = el.name ? [...document.querySelectorAll('input[type=radio]')].filter(r => r.name === el.name) : [el];
        if (!radios.some(r => visible(r) || visible(r.closest('label,mat-radio-button')))) return;
        list.push({ el: radios[0], radios, kind: 'radio', labels: radioGroupLabel(radios), options: radios.map(optLabel) });
        return;
      }
      const vis = visible(el) || (type === 'checkbox' && visible(el.closest('label,mat-checkbox')));
      if (!vis) return;
      if (el.closest('.ng-select') && el.closest('.ng-select').querySelector('.ng-select-container')) return; // handled as custom
      const kind = el.tagName === 'SELECT' ? 'select' : type === 'checkbox' ? 'checkbox' : el.getAttribute('role') === 'combobox' && el.getAttribute('aria-autocomplete') ? 'comboinput' : 'text';
      list.push({ el, kind, labels: labelCands(el), options: kind === 'select' ? [...el.options].map(o => clean(o.text)) : null });
    });
    root.querySelectorAll(CUSTOM).forEach(el => {
      if (el.closest('#bsdf-ui') || !visible(el) || list.some(c => c.el === el || c.el.contains(el) || el.contains(c.el) && c.kind !== 'radio')) return;
      if (el.getAttribute('aria-disabled') === 'true') return;
      const host = el.closest('.ng-select') || el;
      list.push({ el, kind: 'combo', labels: labelCands(host), options: null });
    });
    list.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return list;
  }

  // ---------- setting values ----------
  function nativeSet(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  }
  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur'));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }
  const COMPASS = { N: 'North', NE: 'North East', E: 'East', SE: 'South East', S: 'South', SW: 'South West', W: 'West', NW: 'North West' };
  const want = (item, opts) => {
    const v = String(item.value), w = [opts.valueMap && opts.valueMap[v], v];
    if (COMPASS[v]) w.push(COMPASS[v], COMPASS[v].replace(' ', '-'), COMPASS[v].replace(' ', '').toLowerCase());
    return w.filter(Boolean).map(String);
  };
  // a year picks the age band that contains it, e.g. 2002 -> "2000 - 2004", 1890 -> "Before 1900"
  function yearBand(y, options) {
    return options.findIndex(o => {
      const t = String(o).toLowerCase(), n = (t.match(/\b(1[6-9]\d\d|20\d\d)\b/g) || []).map(Number);
      if (n.length >= 2) return y >= n[0] && y <= n[1];
      if (n.length === 1 && /before|pre|earlier|up to|</.test(t)) return /up to/.test(t) ? y <= n[0] : y < n[0];
      if (n.length === 1 && /onward|after|later|since|\+|or later|>/.test(t)) return /after|>/.test(t) ? y > n[0] : y >= n[0];
      return false;
    });
  }
  function pickOption(wants, options) {
    for (const w of wants) if (/^(1[6-9]\d\d|20\d\d)$/.test(w.trim())) { const i = yearBand(+w, options); if (i >= 0) return i }
    const low = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
    for (const w of wants) { const i = options.findIndex(o => low(o) === low(w)); if (i >= 0) return i }
    let bi = -1, bs = 0;
    options.forEach((o, i) => { for (const w of wants) { const s = sim(w, o); if (s > bs) { bs = s; bi = i } } });
    return bs >= 0.6 ? bi : -1;
  }
  const isYes = v => /^(yes|y|true|1)$/i.test(String(v).trim());
  const isNo = v => /^(no|n|false|0|none)$/i.test(String(v).trim());
  function fmtFor(el, v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m && el.type !== 'date') return m[3] + '/' + m[2] + '/' + m[1];
    return v;
  }

  async function setCtrl(c, item, o) {
    const el = c.el, wants = want(item, o);
    if (c.kind === 'text') {
      const v = fmtFor(el, String(item.value));
      if (el.value && el.value.trim() !== '') {
        if (norm(el.value) === norm(v) || parseFloat(el.value) === parseFloat(v) && !isNaN(parseFloat(v))) return { status: 'same' };
        if (!o.overwrite) return { status: 'kept', detail: 'DEAP has ' + el.value };
      }
      el.focus(); nativeSet(el, v); fire(el);
      return { status: 'filled' };
    }
    if (c.kind === 'select') {
      const i = pickOption(wants, c.options);
      if (i < 0) return { status: 'nooption', detail: 'No option like "' + item.value + '"' };
      if (el.selectedIndex === i) return { status: 'same' };
      if (el.selectedIndex > 0 && !o.overwrite && el.options[el.selectedIndex].value !== '') return { status: 'kept', detail: 'DEAP has ' + clean(el.options[el.selectedIndex].text) };
      nativeSet(el, el.options[i].value); el.selectedIndex = i; fire(el);
      return { status: 'filled' };
    }
    if (c.kind === 'radio') {
      let i = pickOption(wants, c.options);
      if (i < 0 && isYes(item.value)) i = c.options.findIndex(isYes);
      if (i < 0 && isNo(item.value)) i = c.options.findIndex(isNo);
      if (i < 0) return { status: 'nooption', detail: 'No option like "' + item.value + '"' };
      const r = c.radios[i];
      if (r.checked) return { status: 'same' };
      if (c.radios.some(x => x.checked) && !o.overwrite) return { status: 'kept', detail: 'DEAP has ' + c.options[c.radios.findIndex(x => x.checked)] };
      (visible(r) ? r : r.closest('label,mat-radio-button') || r).click();
      if (!r.checked) { r.checked = true; fire(r) }
      return { status: 'filled' };
    }
    if (c.kind === 'checkbox') {
      const on = isYes(item.value) ? true : isNo(item.value) ? false : null;
      if (on === null) return { status: 'nooption', detail: 'Tick box needs Yes or No' };
      if (el.checked === on) return { status: 'same' };
      (visible(el) ? el : el.closest('label,mat-checkbox') || el).click();
      if (el.checked !== on) { el.checked = on; fire(el) }
      return { status: 'filled' };
    }
    if (c.kind === 'combo' || c.kind === 'comboinput') {
      const cur = clean(c.kind === 'comboinput' ? el.value : textOf(el));
      if (cur && wants.some(w => sim(w, cur) >= 0.8)) return { status: 'same' };
      if (cur && !o.overwrite && !/^(select|choose|please)/i.test(cur)) return { status: 'kept', detail: 'DEAP has ' + cur };
      if (c.kind === 'comboinput') { el.focus(); nativeSet(el, String(item.value)); el.dispatchEvent(new Event('input', { bubbles: true })) }
      // Angular Material opens from its inner trigger; other libraries open on mousedown
      const trg = c.kind === 'combo' && el.querySelector('.mat-mdc-select-trigger,.mat-select-trigger,.p-dropdown-trigger') || el;
      const listed = () => [...document.querySelectorAll(OPTION_SEL)].filter(x => visible(x) && !x.closest('#bsdf-ui'));
      let opts = [];
      if (c.kind === 'combo') trg.click();
      for (let t = 0; t < 15 && !opts.length; t++) { await sleep(100); opts = listed(); if (t === 3 && !opts.length && c.kind === 'combo') trg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) }
      const texts = opts.map(textOf), i = pickOption(wants, texts);
      if (i < 0) {
        [el, document.activeElement, document.body].forEach(t => t && t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })));
        await sleep(150);
        const bd = document.querySelector('.cdk-overlay-backdrop'); if (bd && listed().length) bd.click();
        return { status: 'nooption', detail: opts.length ? 'No option like "' + item.value + '". DEAP offers: ' + texts.slice(0, 15).join(' | ') + (texts.length > 15 ? ' …' : '') : 'List did not open' };
      }
      opts[i].click();
      await sleep(350); // DEAP loads the next dropdown's choices from this one
      return { status: 'filled' };
    }
    return { status: 'error', detail: 'Unknown field type' };
  }

  // ---------- outlines ----------
  function markTarget(c) { return c.kind === 'radio' ? (c.radios[0].closest('[role=radiogroup],mat-radio-group,fieldset') || c.radios[0].closest('label') || c.radios[0]) : c.kind === 'checkbox' && !visible(c.el) ? c.el.closest('label,mat-checkbox') : c.el.closest('.ng-select') || c.el }
  function mark(c, status, key) {
    const t = markTarget(c); if (!t) return;
    if (!t.hasAttribute(MARK)) t.setAttribute('data-bsdf-prev', t.style.outline || '');
    t.setAttribute(MARK, status);
    t.style.outline = '3px solid ' + (COLORS[status] || '#2563eb');
    t.style.outlineOffset = '2px';
    t.setAttribute('data-bsdf-key', key);
  }
  function clearMarks() {
    document.querySelectorAll('[' + MARK + ']').forEach(t => { t.style.outline = t.getAttribute('data-bsdf-prev') || ''; t.style.outlineOffset = ''; t.removeAttribute(MARK); t.removeAttribute('data-bsdf-prev'); t.removeAttribute('data-bsdf-key') });
  }

  // ---------- fill one DEAP screen ----------
  const THRESH = 0.62;
  function bySelector(sel, root) { try { return [...(root || document).querySelectorAll(sel)] } catch (e) { return [] } }
  function ctrlFor(all, el) {
    return all.find(c => c.el === el || (c.radios && c.radios.includes(el)) || c.el.contains(el) || el.contains(c.el));
  }

  async function fill(job) {
    clearMarks();
    if (job.scope === 'dialog' && !topDialog()) return { error: 'No DEAP dialog is open' };
    const o = job.options || {}, map = job.mapping || {}, root = job.scope === 'dialog' ? topDialog() : null, all = collect(root || document), used = new Set(), results = [];
    const labelsFor = (key, base) => { const m = map[key] || {}; return [...(m.labels || []), ...(m.label ? [m.label] : []), ...base].filter(Boolean) };
    const pending = [];
    // scalar fields: taught selectors first, then best label matches, each DEAP field used once
    for (const it of job.fields) {
      const m = map[it.key] || {};
      if (m.skip) { results.push({ key: it.key, status: 'skipped' }); continue }
      if (m.selector) {
        const el = bySelector(m.selector, root).find(e => visible(e) || e.type === 'radio' || e.type === 'checkbox');
        const c = el && ctrlFor(all, el);
        if (c && !used.has(c)) { used.add(c); pending.push({ it, c, via: 'taught' }); continue }
      }
      const labels = labelsFor(it.key, it.group ? [it.group + ' ' + it.label, it.label] : [it.label]);
      it._labels = labels;
    }
    const pairs = [];
    job.fields.filter(it => it._labels).forEach(it => all.forEach(c => { if (used.has(c)) return; const b = best(it._labels, c.labels); if (b.s >= THRESH) pairs.push({ it, c, s: b.s, hit: b.hit }) }));
    pairs.sort((a, b) => b.s - a.s);
    const done = new Set();
    for (const p of pairs) { if (done.has(p.it) || used.has(p.c)) continue; done.add(p.it); used.add(p.c); pending.push({ it: p.it, c: p.c, via: p.hit, s: p.s }) }
    job.fields.filter(it => it._labels && !done.has(it)).forEach(it => results.push({ key: it.key, status: 'nomatch' }));

    for (const p of pending) {
      let r;
      try { r = await setCtrl(p.c, p.it, Object.assign({}, o, { valueMap: (map[p.it.key] || {}).values })) } catch (e) { r = { status: 'error', detail: String(e.message || e) } }
      mark(p.c, r.status, p.it.key);
      results.push(Object.assign({ key: p.it.key, matched: p.via === 'taught' ? 'taught field' : p.via }, r));
    }

    // tables: column N of row i goes into the i-th DEAP field that matches the column, in page order
    for (const t of job.tables || []) {
      const tm = map[t.key] || {};
      if (tm.skip) { results.push({ key: t.key, status: 'skipped' }); continue }
      for (let ci = 0; ci < t.columns.length; ci++) {
        const col = t.columns[ci], ck = t.key + '.' + col.key, cm = map[ck] || {};
        if (cm.skip) continue;
        let ctrls;
        if (cm.selector) ctrls = bySelector(cm.selector, root).map(e => ctrlFor(all, e)).filter(Boolean);
        else {
          const labels = [...(cm.labels || []), ...(cm.label ? [cm.label] : []), col.label];
          ctrls = all.filter(c => !used.has(c) && best(labels, c.labels).s >= THRESH);
        }
        ctrls = ctrls.filter((c, i, a) => a.indexOf(c) === i);
        for (let ri = 0; ri < t.rows.length; ri++) {
          const v = t.rows[ri][ci]; if (v === '' || v == null) continue;
          const c = ctrls[ri], rk = { key: t.key, row: ri, col: col.key };
          if (!c) { results.push(Object.assign(rk, { status: ctrls.length ? 'norow' : 'nomatch' })); continue }
          used.add(c);
          let r;
          try { r = await setCtrl(c, { key: ck, value: v }, Object.assign({}, o, { valueMap: cm.values })) } catch (e) { r = { status: 'error', detail: String(e.message || e) } }
          mark(c, r.status, ck + ' row ' + (ri + 1));
          results.push(Object.assign(rk, r));
        }
      }
    }
    const first = document.querySelector('[' + MARK + ']'); if (first && o.scroll !== false) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return { results, fieldsOnPage: all.length, url: location.href };
  }

  // ---------- page field list (to send back so the mapping can be improved) ----------
  function selectorFor(el) {
    const tag = el.tagName.toLowerCase();
    for (const a of ['formcontrolname', 'name', 'data-testid', 'data-test', 'data-cy', 'aria-label', 'id']) {
      const v = el.getAttribute(a);
      if (!v || a === 'id' && /^(mat|ng|cdk|mui|react|:r)|\d{2,}/i.test(v)) continue;
      return tag + '[' + a + '="' + CSS.escape(v) + '"]';
    }
    return null;
  }
  // a path through the page for a field with no usable name; for a table column, loosen the row position so it matches every row
  const shaky = c => /^(ng-|mat-focused|cdk-|is-|has-|active|touched|dirty|pristine|valid|invalid|focus|hover)/.test(c);
  function cssPath(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      if (n.id && !/^(mat|ng|cdk|mui|react|:r)|\d{2,}/i.test(n.id)) { parts.unshift('#' + CSS.escape(n.id)); break }
      let s = n.tagName.toLowerCase();
      const cls = [...n.classList].filter(c => !shaky(c)).slice(0, 2);
      if (cls.length) s += '.' + cls.map(c => CSS.escape(c)).join('.');
      const same = n.parentElement ? [...n.parentElement.children].filter(x => x.tagName === n.tagName) : [];
      parts.unshift(same.length > 1 ? { s, nth: ':nth-of-type(' + (same.indexOf(n) + 1) + ')' } : s);
    }
    const join = skip => parts.map((p, i) => typeof p === 'string' ? p : p.s + (i === skip ? '' : p.nth)).join(' > ');
    return { exact: join(-1), loose: i => join(i), parts };
  }
  function selectorForPick(el, column) {
    const attr = selectorFor(el), n = attr ? bySelector(attr).length : 0;
    if (attr && (n === 1 || column && n > 1)) return attr;
    const p = cssPath(el);
    if (column) for (let i = p.parts.length - 2; i >= 0; i--) {
      if (typeof p.parts[i] === 'string') continue;
      const sel = p.loose(i), m = bySelector(sel);
      if (m.length > 1 && m.includes(el)) return sel;
    }
    return p.exact;
  }
  function scan() {
    return collect().map(c => ({ kind: c.kind, label: (c.labels[0] || {}).t || '', alsoSeen: c.labels.slice(1, 4).map(x => x.t), selector: selectorFor(c.el), options: c.options ? c.options.slice(0, 40) : undefined, value: c.kind === 'text' ? c.el.value : c.kind === 'select' ? clean(c.el.options[c.el.selectedIndex]?.text) : undefined }));
  }

  // ---------- record: while on, every DEAP screen and dialog you open is listed, with dropdown choices you open ----------
  // Saved straight into the extension's storage, so one walk through a survey gives the whole field list
  let recObs = null, recT = null, lastTouched = null;
  const touch = e => { const c = e.target.closest && e.target.closest(CUSTOM + ',select,input'); if (c && !c.closest('#bsdf-ui')) lastTouched = c.closest('mat-select') || c };
  const screenKey = () => {
    const path = location.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>');
    const dlg = [...document.querySelectorAll('mat-dialog-container,[role=dialog],.mat-mdc-dialog-container')].filter(visible).pop();
    const title = dlg ? clean(textOf(dlg.querySelector('h1,h2,h3,.mat-mdc-dialog-title,.mat-dialog-title')) || 'dialog') : '';
    return { key: path + (title ? ' › ' + title : ''), path, dialog: title || undefined, heading: title ? undefined : [...document.querySelectorAll('h1,h2,[role=tab][aria-selected=true]')].filter(visible).slice(0, 3).map(textOf).join(' / ') };
  };
  async function snapshot() {
    const sk = screenKey(), fields = scan();
    // a dropdown that is open right now: keep its choices against the field that opened it
    const open = [...document.querySelectorAll(OPTION_SEL)].filter(x => visible(x) && !x.closest('#bsdf-ui')).map(textOf).filter(Boolean);
    const exp = open.length && ([...document.querySelectorAll('mat-select[aria-expanded=true],[role=combobox][aria-expanded=true]')].find(e => !e.closest('#bsdf-ui')) || lastTouched);
    const { recorded = {} } = await chrome.storage.local.get('recorded');
    const scr = recorded[sk.key] || (recorded[sk.key] = Object.assign({ fields: [] }, sk));
    const same = (a, b) => a.selector && a.selector === b.selector || !a.selector && a.label === b.label;
    fields.forEach(f => { const o = scr.fields.find(x => same(x, f)); if (o) { f.options = f.options || o.options; Object.assign(o, f) } else scr.fields.push(f) });
    // buttons, tabs and menu links too, so a later version can move through DEAP and press Add and Save itself
    const name = e => clean(textOf(e) || e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('mattooltip') || '').slice(0, 60);
    const btns = [...document.querySelectorAll('button,[role=button],[role=tab],a[href]')].filter(e => visible(e) && !e.closest('#bsdf-ui')).map(e => ({ text: name(e), tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || undefined, href: e.getAttribute('href') || undefined, inDialog: !!e.closest('mat-dialog-container,[role=dialog]') || undefined, cls: [...e.classList].filter(c => !shaky(c)).slice(0, 3).join(' ') || undefined })).filter(b => b.text || b.href);
    scr.buttons = scr.buttons || [];
    btns.forEach(b => { if (!scr.buttons.some(x => x.text === b.text && x.href === b.href && x.inDialog === b.inDialog)) scr.buttons.push(b) });
    scr.buttons = scr.buttons.slice(0, 150);
    if (exp) {
      const sel = selectorFor(exp), lab = (labelCands(exp)[0] || {}).t;
      for (const sc of Object.values(recorded)) { const f = sc.fields.find(x => sel && x.selector === sel || !sel && x.label === lab); if (f) f.options = open.slice(0, 80) }
    }
    await chrome.storage.local.set({ recorded });
  }
  function record(on) {
    if (recObs) { recObs.disconnect(); recObs = null; document.removeEventListener('click', touch, true) }
    if (!on) return;
    document.addEventListener('click', touch, true);
    const kick = () => { clearTimeout(recT); recT = setTimeout(() => snapshot().catch(() => {}), 600) };
    recObs = new MutationObserver(kick);
    recObs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
    kick();
  }
  chrome.storage.local.get('recording').then(r => record(!!r.recording));
  chrome.storage.onChanged.addListener(ch => { if (ch.recording) record(!!ch.recording.newValue) });

  // ---------- teach: you click the DEAP field that should get a value ----------
  let picking = null;
  function pick(label, column) {
    stopPick();
    return new Promise(resolve => {
      const ui = document.createElement('div');
      ui.id = 'bsdf-ui';
      ui.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0b7a45;color:#fff;font:600 15px/1.3 system-ui,sans-serif;padding:10px 16px;display:flex;gap:12px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
      ui.innerHTML = '<span style="flex:1"></span><button style="font:inherit;background:#fff;color:#0b7a45;border:0;border-radius:6px;padding:6px 12px;cursor:pointer">Cancel</button>';
      ui.firstChild.textContent = 'Click the DEAP field for: ' + label;
      document.documentElement.append(ui);
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #2563eb;border-radius:4px;display:none';
      document.documentElement.append(box);
      const all = collect();
      const at = t => { if (!t || t.closest('#bsdf-ui')) return null; if (t.tagName === 'LABEL' && t.control) t = t.control; let c = ctrlFor(all, t); if (!c) { const ff = t.closest('mat-form-field,.mat-mdc-form-field,.form-group,.field,label,td'); const inner = ff && ff.querySelector('input,select,textarea,' + CUSTOM); c = inner && ctrlFor(all, inner) } return c };
      const move = e => { const c = at(e.target); if (!c) { box.style.display = 'none'; return } const r = markTarget(c).getBoundingClientRect(); Object.assign(box.style, { display: 'block', left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' }) };
      const click = e => {
        if (e.target.closest('#bsdf-ui')) { if (e.target.tagName === 'BUTTON') { done(null) } return }
        const c = at(e.target); if (!c) return;
        e.preventDefault(); e.stopPropagation();
        const sel = selectorForPick(c.el, column);
        done({ selector: sel, label: (c.labels[0] || {}).t || '', kind: c.kind, count: bySelector(sel).length });
      };
      const key = e => { if (e.key === 'Escape') done(null) };
      const done = v => { stopPick(); resolve(v) };
      document.addEventListener('mousemove', move, true);
      document.addEventListener('click', click, true);
      document.addEventListener('keydown', key, true);
      picking = () => { document.removeEventListener('mousemove', move, true); document.removeEventListener('click', click, true); document.removeEventListener('keydown', key, true); ui.remove(); box.remove() };
    });
  }
  function stopPick() { if (picking) { picking(); picking = null } }

  // ---------- moving through DEAP for a whole-survey transfer ----------
  const DIALOGS = 'mat-dialog-container,.mat-mdc-dialog-container,[role=dialog]';
  function topDialog() { return [...document.querySelectorAll(DIALOGS)].filter(visible).pop() || null }
  const dialogTitle = d => d ? clean(textOf(d.querySelector('h1,h2,h3,.mat-mdc-dialog-title,.mat-dialog-title'))) || 'dialog' : null;
  // never pressed by the transfer, whatever happens
  const FORBIDDEN = /publish|submit|lodge|finali[sz]e|delete|remove|download|copy/i;
  function state() {
    const d = topDialog();
    return { path: location.pathname, dialog: dialogTitle(d), saving: /saving/i.test(textOf(document.querySelector('main') || document.body).slice(0, 4000)) && !!document.querySelector('.mat-mdc-progress-spinner,mat-spinner,.saving,mat-progress-bar') };
  }
  function nav(path) {
    const base = (location.pathname.match(/^\/survey\/[^/]+/) || [''])[0];
    if (!base) return { error: 'Open the assessment in DEAP first' };
    const want = base + '/' + path;
    if (location.pathname === want) return { ok: true, already: true };
    const a = [...document.querySelectorAll('a[href]')].find(x => x.getAttribute('href') === want);
    if (a) a.click(); else location.assign(want);
    return { ok: true };
  }
  function press(text, inDialog) {
    if (FORBIDDEN.test(text)) return { error: 'Not allowed: ' + text };
    const scope = inDialog ? topDialog() : document;
    if (!scope) return { error: 'No dialog open' };
    const btn = [...scope.querySelectorAll('button,[role=button]')].filter(b => visible(b) && !b.disabled && !b.closest('#bsdf-ui') && (inDialog || !b.closest(DIALOGS))).find(b => clean(textOf(b)).toUpperCase() === text.toUpperCase());
    if (!btn) return { error: 'No ' + text + ' button' };
    if (FORBIDDEN.test(textOf(btn)) || FORBIDDEN.test(btn.getAttribute('aria-label') || '')) return { error: 'Not allowed' };
    btn.click();
    return { ok: true };
  }
  function dialogErrors() {
    const d = topDialog(); if (!d) return [];
    return [...d.querySelectorAll('mat-error,.mat-mdc-form-field-error,.mat-error')].filter(visible).map(textOf).filter(Boolean);
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg.cmd === 'state') { reply(state()); return }
    if (msg.cmd === 'nav') { reply(nav(msg.path)); return }
    if (msg.cmd === 'press') { reply(press(msg.text, msg.inDialog)); return }
    if (msg.cmd === 'errors') { reply(dialogErrors()); return }
    if (msg.cmd === 'ping') { reply({ ok: true, url: location.href }); return }
    if (msg.cmd === 'fill') { fill(msg).then(reply, e => reply({ error: String(e.message || e) })); return true }
    if (msg.cmd === 'scan') { reply({ fields: scan(), url: location.href, title: document.title }); return }
    if (msg.cmd === 'pick') { pick(msg.label, msg.column).then(reply); return true }
    if (msg.cmd === 'clear') { stopPick(); clearMarks(); reply({ ok: true }); return }
  });
})();
