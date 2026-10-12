'use strict';
const $ = s => document.querySelector(s);
const MAX = 25 * 1024 * 1024;
let cfg = JSON.parse(localStorage.getItem('driveCfg') || 'null');
let path = '', items = [], view = localStorage.getItem('driveView') || 'grid';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
const status = t => { $('#status').textContent = t; };

async function api(p, opts = {}) {
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encPath(p)}`;
  const r = await fetch(url + (opts.method ? '' : `?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`), {
    ...opts, headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) } });
  if (!r.ok && r.status !== 404) throw new Error(`${r.status} ${(await r.json().catch(() => ({}))).message || r.statusText}`);
  return r.status === 404 ? null : r.json();
}

async function load() {
  if (!cfg) return openSettings();
  status('Loading…'); crumbs();
  try { const d = await api(path); items = Array.isArray(d) ? d : []; status(''); render(); }
  catch (e) { status('Error: ' + e.message); items = []; render(); }
}

function crumbs() {
  const parts = path ? path.split('/') : [];
  let h = '<a data-p="">My Drive</a>';
  parts.forEach((p, i) => { h += `<span>›</span><a data-p="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</a>`; });
  $('#crumbs').innerHTML = h;
  $('#crumbs').querySelectorAll('a').forEach(a => a.onclick = () => { path = a.dataset.p; load(); });
}

const size = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const icon = it => it.type === 'dir' ? '📁' : /\.(png|jpe?g|gif|webp|svg)$/i.test(it.name) ? '🖼️' : /\.pdf$/i.test(it.name) ? '📕' : /\.(mp4|mov|webm)$/i.test(it.name) ? '🎬' : /\.(mp3|wav)$/i.test(it.name) ? '🎵' : '📄';

function render() {
  const q = $('#search').value.toLowerCase();
  const list = items.filter(i => i.name !== '.keep' && i.name.toLowerCase().includes(q))
    .sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
  const box = $('#files'); box.className = view;
  box.innerHTML = list.length ? list.map((it, i) => `<div class="item" data-i="${i}"><div class="icon">${icon(it)}</div>
    <div class="name">${esc(it.name)}</div><div class="meta">${it.type === 'dir' ? 'Folder' : size(it.size)}</div>
    <button class="del" data-i="${i}" title="Delete">🗑</button></div>`).join('') : '<p class="meta">This folder is empty. Drag files here or click Upload.</p>';
  box.querySelectorAll('.item').forEach(el => el.onclick = e => {
    const it = list[el.dataset.i];
    if (e.target.classList.contains('del')) return del(it);
    if (it.type === 'dir') { path = it.path; $('#search').value = ''; load(); } else openFile(it);
  });
}

async function openFile(it) {
  status('Downloading ' + it.name + '…');
  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encPath(it.path)}?ref=${encodeURIComponent(cfg.branch)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.raw' } });
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    const blob = await r.blob(), u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = it.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000); status('');
  } catch (e) { status('Download failed: ' + e.message); }
}

async function del(it) {
  if (!confirm(`Delete "${it.name}"${it.type === 'dir' ? ' and everything inside it' : ''}? This cannot be undone.`)) return;
  try {
    const files = it.type === 'dir' ? await walk(it.path) : [it];
    for (const f of files) {
      status('Deleting ' + f.path + '…');
      await api(f.path, { method: 'DELETE', body: JSON.stringify({ message: 'Delete ' + f.path, sha: f.sha, branch: cfg.branch }) });
    }
    load();
  } catch (e) { status('Delete failed: ' + e.message); }
}
async function walk(p) {
  const d = await api(p) || []; let out = [];
  for (const x of d) out = out.concat(x.type === 'dir' ? await walk(x.path) : [x]);
  return out;
}

const toB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });

async function upload(files) {
  for (const f of files) {
    if (f.size > MAX && !confirm(`"${f.name}" is ${size(f.size)}. Files over about 25 MB usually fail through the GitHub API. Try anyway?`)) continue;
    const p = (path ? path + '/' : '') + f.name;
    try {
      status(`Uploading ${f.name}…`);
      const existing = items.find(i => i.path === p);
      if (existing && !confirm(`"${f.name}" already exists. Replace it?`)) continue;
      const body = { message: 'Upload ' + p, content: await toB64(f), branch: cfg.branch };
      if (existing) body.sha = existing.sha;
      await api(p, { method: 'PUT', body: JSON.stringify(body) });
    } catch (e) { alert(`Upload of "${f.name}" failed: ${e.message}`); }
  }
  load();
}

async function newFolder() {
  const n = (prompt('Folder name') || '').trim();
  if (!n) return;
  if (/[\/\\]/.test(n) || n === '.' || n === '..') return alert('Invalid folder name');
  const p = (path ? path + '/' : '') + n + '/.keep';
  try { await api(p, { method: 'PUT', body: JSON.stringify({ message: 'Create folder ' + n, content: '', branch: cfg.branch }) }); load(); }
  catch (e) { alert('Could not create folder: ' + e.message); }
}

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
$('#clearSettings').onclick = () => { localStorage.removeItem('driveCfg'); cfg = null; $('#settingsForm').reset(); };

$('#btnUpload').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = e => { upload([...e.target.files]); e.target.value = ''; };
$('#btnFolder').onclick = newFolder;
$('#btnSettings').onclick = openSettings;
$('#btnView').onclick = () => { view = view === 'grid' ? 'list' : 'grid'; localStorage.setItem('driveView', view); render(); };
$('#search').oninput = render;
const drop = $('#drop'); let dc = 0;
drop.addEventListener('dragenter', e => { e.preventDefault(); dc++; drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => { if (--dc <= 0) { dc = 0; drop.classList.remove('drag'); } });
drop.addEventListener('dragover', e => e.preventDefault());
drop.addEventListener('drop', e => { e.preventDefault(); dc = 0; drop.classList.remove('drag'); if (cfg) upload([...e.dataTransfer.files]); });
load();
