'use strict';
const $ = s => document.querySelector(s);
const MAX = 25 * 1024 * 1024;
let cfg = JSON.parse(localStorage.getItem('driveCfg') || 'null');
let path = '', items = [], shown = [], view = localStorage.getItem('driveView') || 'grid';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
const status = t => { $('#status').textContent = t; };
let toastT; const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3000); };

const ICONS = {
  folder: '<path fill="currentColor" fill-opacity=".25" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="3"/><path d="m17 10 4-2v8l-4-2"/>',
  audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  download: '<path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16"/>'
};
const svg = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[n]}</svg>`;

const EXT = {
  image: /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i, pdf: /\.pdf$/i,
  video: /\.(mp4|webm|mov|m4v|ogv)$/i, audio: /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i,
  code: /\.(txt|md|markdown|json|csv|tsv|js|mjs|ts|tsx|jsx|css|scss|html?|xml|ya?ml|toml|ini|cfg|conf|log|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bash|sql|swift|r|lua|env|gitignore)$/i
};
const kind = it => it.type === 'dir' ? 'folder' : Object.keys(EXT).find(k => EXT[k].test(it.name)) || 'file';
const MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', bmp:'image/bmp', ico:'image/x-icon', avif:'image/avif',
  pdf:'application/pdf', mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', m4v:'video/mp4', ogv:'video/ogg',
  mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', m4a:'audio/mp4', flac:'audio/flac', aac:'audio/aac', opus:'audio/opus' };
const mimeOf = n => MIME[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

const base = () => `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/`;
async function api(p, opts = {}) {
  const r = await fetch(base() + encPath(p) + (opts.method ? '' : `?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`), {
    ...opts, headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) } });
  if (!r.ok && r.status !== 404) throw new Error(`${r.status} ${(await r.json().catch(() => ({}))).message || r.statusText}`);
  return r.status === 404 ? null : r.json();
}
async function fetchBlob(it) {
  const r = await fetch(base() + encPath(it.path) + `?ref=${encodeURIComponent(cfg.branch)}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.raw' } });
  if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
  const b = await r.blob();
  return new Blob([b], { type: mimeOf(it.name) });
}

async function load() {
  if (!cfg) return openSettings();
  $('#repoInfo').textContent = `${cfg.owner}/${cfg.repo} · ${cfg.branch}`;
  status('Loading…'); crumbs();
  try { const d = await api(path); items = Array.isArray(d) ? d : []; status(''); if (!d) status('Folder not found.'); render(); }
  catch (e) { status('Error: ' + e.message); items = []; render(); }
}
function crumbs() {
  const parts = path ? path.split('/') : [];
  let h = '<a data-p="">My Drive</a>';
  parts.forEach((p, i) => { h += `<span>›</span><a data-p="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</a>`; });
  $('#crumbs').innerHTML = h;
  $('#crumbs').querySelectorAll('a').forEach(a => a.onclick = () => { path = a.dataset.p; $('#search').value = ''; load(); });
}
const size = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

function render() {
  $('#btnView').innerHTML = svg(view === 'grid' ? 'list' : 'grid');
  const q = $('#search').value.toLowerCase();
  shown = items.filter(i => i.name !== '.keep' && i.name.toLowerCase().includes(q))
    .sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
  const box = $('#files'); box.className = view;
  box.innerHTML = shown.length ? shown.map((it, i) => { const k = kind(it); return `<div class="item" tabindex="0" data-i="${i}">
    <div class="thumb">${svg(k, 'c-' + k)}</div><div class="info"><div class="name" title="${esc(it.name)}">${esc(it.name)}</div>
    <div class="meta">${it.type === 'dir' ? 'Folder' : size(it.size)}</div></div>
    <button class="del" data-i="${i}" title="Delete" aria-label="Delete">${svg('trash')}</button></div>`; }).join('')
    : `<div class="empty">${svg('folder')}<div>${q ? 'No matches' : 'This folder is empty'}</div><div class="meta">Drag files here or use New → Upload</div></div>`;
  box.querySelectorAll('.item').forEach(el => {
    const act = e => { const it = shown[el.dataset.i];
      if (e.target.closest('.del')) return del(it);
      if (it.type === 'dir') { path = it.path; $('#search').value = ''; load(); } else openViewer(it); };
    el.onclick = act; el.onkeydown = e => { if (e.key === 'Enter') act(e); };
  });
}

async function download(it, blob) {
  try {
    status('Downloading ' + it.name + '…');
    blob = blob || await fetchBlob(it);
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = it.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000); status('');
  } catch (e) { status(''); toast('Download failed: ' + e.message); }
}

// ---------- Viewer ----------
let vIdx = -1, vUrl = null, vBlob = null, vToken = 0;
const files = () => shown.filter(i => i.type !== 'dir');
function closeViewer() {
  $('#viewer').hidden = true; $('#vBody').innerHTML = ''; vIdx = -1; vBlob = null; vToken++;
  if (vUrl) { URL.revokeObjectURL(vUrl); vUrl = null; }
  document.body.style.overflow = '';
}
function openViewer(it) { vIdx = files().indexOf(it); $('#viewer').hidden = false; document.body.style.overflow = 'hidden'; showCurrent(); }
function step(d) { const f = files(); const n = vIdx + d; if (n >= 0 && n < f.length) { vIdx = n; showCurrent(); } }
async function showCurrent() {
  const f = files(), it = f[vIdx]; if (!it) return closeViewer();
  const tok = ++vToken, body = $('#vBody');
  if (vUrl) { URL.revokeObjectURL(vUrl); vUrl = null; } vBlob = null;
  $('#vName').textContent = it.name;
  $('#vPrev').disabled = vIdx <= 0; $('#vNext').disabled = vIdx >= f.length - 1;
  const k = kind(it);
  const noPrev = msg => `<div class="nopreview">${svg('file')}<div>${esc(msg)}</div><button class="primary" id="npDl">${svg('download')}Download</button></div>`;
  const bindNp = () => { const b = $('#npDl'); if (b) b.onclick = () => download(it, vBlob); };
  if (!['image', 'pdf', 'video', 'audio', 'code'].includes(k)) { body.innerHTML = noPrev('No preview available for this file type'); bindNp(); return; }
  if (it.size > 100 * 1024 * 1024) { body.innerHTML = noPrev('File too large to preview'); bindNp(); return; }
  body.innerHTML = '<div class="spinner"></div>';
  try {
    const blob = await fetchBlob(it);
    if (tok !== vToken) return;
    vBlob = blob;
    if (k === 'code') {
      let text = await blob.text();
      if (tok !== vToken) return;
      if (/\.json$/i.test(it.name)) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (_) {} }
      if (text.length > 2e6) text = text.slice(0, 2e6) + '\n\n… (truncated, download to see the full file)';
      const pre = document.createElement('pre'); pre.textContent = text; // textContent = safe, no HTML rendering
      body.replaceChildren(pre); return;
    }
    vUrl = URL.createObjectURL(blob);
    let el;
    if (k === 'image') { el = document.createElement('img'); el.alt = it.name; }
    else if (k === 'pdf') { el = document.createElement('iframe'); el.title = it.name; }
    else { el = document.createElement(k); el.controls = true; if (k === 'video') el.playsInline = true; }
    el.src = vUrl; body.replaceChildren(el);
  } catch (e) { if (tok === vToken) { body.innerHTML = noPrev('Could not load preview: ' + e.message); bindNp(); } }
}
$('#vClose').onclick = closeViewer;
$('#vPrev').onclick = () => step(-1); $('#vNext').onclick = () => step(1);
$('#vDownload').onclick = () => { const it = files()[vIdx]; if (it) download(it, vBlob); };
$('#viewer').addEventListener('click', e => { if (e.target.id === 'vBody' || e.target.id === 'viewer') closeViewer(); });
document.addEventListener('keydown', e => {
  if ($('#viewer').hidden) return;
  if (e.key === 'Escape') closeViewer();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

// ---------- Delete / upload / folders ----------
async function del(it) {
  if (!confirm(`Delete "${it.name}"${it.type === 'dir' ? ' and everything inside it' : ''}? This cannot be undone.`)) return;
  try {
    const fs = it.type === 'dir' ? await walk(it.path) : [it];
    for (const f of fs) {
      status('Deleting ' + f.path + '…');
      await api(f.path, { method: 'DELETE', body: JSON.stringify({ message: 'Delete ' + f.path, sha: f.sha, branch: cfg.branch }) });
    }
    toast('Deleted ' + it.name); load();
  } catch (e) { status(''); toast('Delete failed: ' + e.message); }
}
async function walk(p) {
  const d = await api(p) || []; let out = [];
  for (const x of d) out = out.concat(x.type === 'dir' ? await walk(x.path) : [x]);
  return out;
}
const toB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
async function upload(list) {
  if (!cfg) return openSettings();
  let ok = 0;
  for (const f of list) {
    if (f.size > MAX && !confirm(`"${f.name}" is ${size(f.size)}. Files over about 25 MB usually fail through the GitHub API. Try anyway?`)) continue;
    const p = (path ? path + '/' : '') + f.name;
    try {
      const existing = items.find(i => i.path === p);
      if (existing && !confirm(`"${f.name}" already exists. Replace it?`)) continue;
      status(`Uploading ${f.name}…`);
      const body = { message: 'Upload ' + p, content: await toB64(f), branch: cfg.branch };
      if (existing) body.sha = existing.sha;
      await api(p, { method: 'PUT', body: JSON.stringify(body) }); ok++;
    } catch (e) { alert(`Upload of "${f.name}" failed: ${e.message}`); }
  }
  status(''); if (ok) toast(`Uploaded ${ok} file${ok > 1 ? 's' : ''}`); load();
}
async function newFolder() {
  if (!cfg) return openSettings();
  const n = (prompt('Folder name') || '').trim();
  if (!n) return;
  if (/[\/\\]/.test(n) || n === '.' || n === '..') return alert('Invalid folder name');
  const p = (path ? path + '/' : '') + n + '/.keep';
  try { await api(p, { method: 'PUT', body: JSON.stringify({ message: 'Create folder ' + n, content: '', branch: cfg.branch }) }); toast('Folder created'); load(); }
  catch (e) { alert('Could not create folder: ' + e.message); }
}

// ---------- Settings & UI wiring ----------
function openSettings() {
  const f = $('#settingsForm');
  if (cfg) for (const k of ['owner', 'repo', 'branch', 'token']) f.elements[k].value = cfg[k];
  $('#settings').showModal();
}
$('#settingsForm').onsubmit = () => {
  const f = $('#settingsForm').elements;
  cfg = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || 'main', token: f.token.value.trim() };
  localStorage.setItem('driveCfg', JSON.stringify(cfg)); path = ''; load();
};
$('#clearSettings').onclick = () => { localStorage.removeItem('driveCfg'); cfg = null; $('#settingsForm').reset(); $('#repoInfo').textContent = ''; toast('Token removed from this browser'); };

const closeNav = () => document.body.classList.remove('nav-open');
$('#btnNew').onclick = e => { e.stopPropagation(); $('#newMenu').hidden = !$('#newMenu').hidden; };
document.addEventListener('click', () => { $('#newMenu').hidden = true; });
$('#btnUpload').onclick = () => { closeNav(); $('#fileInput').click(); };
$('#fab').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = e => { upload([...e.target.files]); e.target.value = ''; };
$('#btnFolder').onclick = () => { closeNav(); newFolder(); };
$('#navHome').onclick = () => { closeNav(); path = ''; $('#search').value = ''; load(); };
$('#navSettings').onclick = () => { closeNav(); openSettings(); };
$('#btnMenu').onclick = () => document.body.classList.add('nav-open');
$('#scrim').onclick = closeNav;
$('#btnView').onclick = () => { view = view === 'grid' ? 'list' : 'grid'; localStorage.setItem('driveView', view); render(); };
$('#search').oninput = render;
const drop = $('#mainCol'); let dc = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
drop.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dc++; $('#drop').classList.add('drag'); });
drop.addEventListener('dragleave', () => { if (--dc <= 0) { dc = 0; $('#drop').classList.remove('drag'); } });
drop.addEventListener('dragover', e => e.preventDefault());
drop.addEventListener('drop', e => { e.preventDefault(); dc = 0; $('#drop').classList.remove('drag'); if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]); });
load();
