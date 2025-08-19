// ==UserScript==
// @name         Airtable: Incremental CSV (append visible → save/copy)
// @namespace    turbo.tools
// @version      1.0.0
// @description  Manually append current screen (visible rows/cols) to a buffer, then Save/Copy as one CSV
// @match        *://*.airtable.com/*
// @match        *://airtable.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---------- selectors ----------
  const SEL = {
    headerCell: '.gridHeaderCellPhosphorIcons[data-columnid]',
    dataRow: '.dataRow[data-rowid]',
    dataCell: ':scope > div[data-columnid]',
  };

  // ---------- storage ----------
  const KEY = 'airtable_incremental_csv_v1';
  function loadBuf() {
    try { return JSON.parse(localStorage.getItem(KEY) || '') || { cols:{}, rows:{}, order:0 }; }
    catch { return { cols:{}, rows:{}, order:0 }; }
  }
  function saveBuf(buf) { localStorage.setItem(KEY, JSON.stringify(buf)); }

  // ---------- utils ----------
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const csvEscape = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/\r?\n/g, '\n');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  async function setClipboard(text) {
    try { if (typeof GM_setClipboard === 'function') GM_setClipboard(text, { type:'text', mimetype:'text/plain' }); } catch {}
    try { await navigator.clipboard.writeText(text); } catch {}
  }
  function download(filename, text) {
    const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  }
  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', right: '12px', bottom: '12px', zIndex: 1000000,
      background: '#111', color: '#fff', padding: '8px 10px', borderRadius: '8px',
      font: '12px system-ui', opacity: 0.95, pointerEvents: 'none'
    });
    document.body.appendChild(t); setTimeout(() => t.remove(), 1400);
  }

  // ---------- read current screen ----------
  function readVisibleHeaders() {
    const cols = [];
    document.querySelectorAll(SEL.headerCell).forEach(h => {
      if (!visible(h)) return;
      const id = h.getAttribute('data-columnid');
      if (!id) return;
      cols.push({
        id,
        index: Number(h.getAttribute('data-columnindex')) || 0,
        name: (h.querySelector('.name, [class*="name"]')?.textContent || h.textContent || '').replace(/\s+/g, ' ').trim(),
      });
    });
    cols.sort((a, b) => a.index - b.index);
    return cols;
  }
  function cellText(cell) {
    const titles = Array.from(cell.querySelectorAll('[title]'))
      .map(n => n.getAttribute('title')?.trim()).filter(Boolean);
    const raw = titles.length ? titles.join('; ') : (cell.innerText || cell.textContent || '');
    return raw.replace(/\s+/g, ' ').trim();
  }
  function captureVisibleScreen() {
    const cols = readVisibleHeaders(); // ordered list
    const rows = [];
    document.querySelectorAll(SEL.dataRow).forEach(r => {
      if (!visible(r)) return;
      const rowId = r.getAttribute('data-rowid'); if (!rowId) return;
      const rec = { id: rowId, cells: {} };
      cols.forEach(c => {
        const cell = r.querySelector(`${SEL.dataCell}[data-columnid="${c.id}"]`);
        rec.cells[c.id] = cell ? cellText(cell) : '';
      });
      // skip completely empty lines
      if (Object.values(rec.cells).some(v => v !== '')) rows.push(rec);
    });
    return { cols, rows };
  }

  // ---------- append ----------
  function appendVisible() {
    const buf = loadBuf();
    const snap = captureVisibleScreen();

    // merge columns
    for (const c of snap.cols) {
      const old = buf.cols[c.id];
      if (!old || c.index < old.index) buf.cols[c.id] = { index: c.index, name: c.name };
      else if (!old.name && c.name) buf.cols[c.id] = { index: old.index, name: c.name };
    }

    // merge rows
    let added = 0;
    for (const rec of snap.rows) {
      if (!buf.rows[rec.id]) {
        buf.rows[rec.id] = { order: buf.order++, cells: {} };
        added++;
      }
      const target = buf.rows[rec.id].cells;
      for (const [cid, val] of Object.entries(rec.cells)) {
        if (val != null && val !== '') target[cid] = val; // keep first non-empty or overwrite with latest non-empty
      }
    }

    saveBuf(buf);
    const colCount = Object.keys(buf.cols).length;
    const rowCount = Object.keys(buf.rows).length;
    status(`+${added} rows | total ${rowCount} rows, ${colCount} cols`);
    return buf;
  }

  // ---------- build CSV from buffer ----------
  function buildCSVFromBuffer() {
    const buf = loadBuf();
    const cols = Object.entries(buf.cols)
      .map(([id, m]) => ({ id, index: m.index, name: m.name }))
      .sort((a, b) => a.index - b.index);
    if (!cols.length || !Object.keys(buf.rows).length) return '';

    const header = cols.map(c => csvEscape(c.name)).join(',');
    const rowsOrdered = Object.entries(buf.rows)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([, r]) => cols.map(c => csvEscape(r.cells?.[c.id] ?? '')).join(','));
    return [header, ...rowsOrdered].join('\n');
  }

  // ---------- UI ----------
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed', right: '16px', bottom: '16px', zIndex: 999999,
    display: 'flex', gap: '8px', background: '#fff', padding: '8px 10px',
    border: '1px solid #999', borderRadius: '8px', font: '12px system-ui',
    boxShadow: '0 2px 8px rgba(0,0,0,.15)', userSelect: 'none'
  });
  const btnAppend = mkBtn('Append');
  const btnSave = mkBtn('Save CSV');
  const btnCopy = mkBtn('Copy CSV');
  const btnClear = mkBtn('Clear');
  const lbl = document.createElement('span'); lbl.textContent = '';
  bar.append(btnAppend, btnSave, btnCopy, btnClear, lbl); document.body.appendChild(bar);

  function mkBtn(t) {
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1; b.textContent = t;
    Object.assign(b.style, { padding: '6px 10px', cursor: 'pointer', outline: 'none' });
    // use pointerdown to avoid stealing grid focus/selection
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (t === 'Append') appendVisible();
      if (t === 'Save CSV') { appendVisible(); saveCSV(); }
      if (t === 'Copy CSV') { appendVisible(); copyCSV(); }
      if (t === 'Clear') { localStorage.removeItem(KEY); status('cleared'); }
    }, true);
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
    return b;
  }
  function status(s) { lbl.textContent = s; }

  // Hotkeys
  document.addEventListener('keydown', (e) => {
    const meta = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (!meta || !e.shiftKey) return;
    if (k === 'a') { e.preventDefault(); appendVisible(); }
    if (k === 's') { e.preventDefault(); appendVisible(); saveCSV(); }
    if (k === 'c') { e.preventDefault(); appendVisible(); copyCSV(); }
    if (k === 'x') { e.preventDefault(); localStorage.removeItem(KEY); status('cleared'); }
  }, true);

  function saveCSV() {
    const csv = buildCSVFromBuffer();
    if (!csv) return toast('Nothing to save');
    const name = (document.title || 'airtable').replace(/[^\w\-]+/g, '_').slice(0, 64);
    download(`airtable_incremental_${name}.csv`, csv);
    toast('Saved');
  }
  async function copyCSV() {
    const csv = buildCSVFromBuffer();
    if (!csv) return toast('Nothing to copy');
    await setClipboard(csv);
    toast('Copied');
  }

  // show initial state
  (() => {
    const buf = loadBuf();
    status(`buffer: ${Object.keys(buf.rows).length} rows, ${Object.keys(buf.cols).length} cols`);
  })();
})();

