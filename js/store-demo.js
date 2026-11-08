// 데모 어댑터: localStorage에 저장하고 BroadcastChannel로 같은 PC의 다른 탭에 알린다.
// 함수 이름과 동작은 store-firebase.js와 같다. (화면 코드는 js/store.js만 import)
const KEY = 'e30:db';
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('e30-demo') : null;
const watchers = new Set();
let db = read();
let queued = false;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function write() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error(e); }
  bc?.postMessage('changed');
  schedule();
}
function schedule() {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; flush(); }, 0);
}
function flush() {
  for (const w of watchers) {
    const s = JSON.stringify(getAt(db, w.path) ?? null);
    if (s === w.last) continue;
    w.last = s;
    try { w.cb(JSON.parse(s)); } catch (e) { console.error(e); }
  }
}
if (bc) bc.onmessage = () => { db = read(); schedule(); };
addEventListener('storage', (e) => { if (e.key === KEY) { db = read(); schedule(); } });

const keys = (p) => String(p).split('/').filter(Boolean);
const clone = (v) => JSON.parse(JSON.stringify(v));
function getAt(o, p) {
  for (const k of keys(p)) {
    if (o == null || typeof o !== 'object') return null;
    o = o[k];
  }
  return o === undefined ? null : o;
}
function putAt(p, v) {
  const ks = keys(p);
  if (!ks.length) { db = v == null ? {} : clone(v); return; }
  let o = db;
  const trail = [];
  for (const k of ks.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    trail.push([o, k]);
    o = o[k];
  }
  const last = ks[ks.length - 1];
  if (v == null) delete o[last]; else o[last] = clone(v);
  // Firebase처럼 비어 버린 칸은 지운다
  for (let i = trail.length - 1; i >= 0; i--) {
    const [parent, k] = trail[i];
    if (Object.keys(parent[k]).length) break;
    delete parent[k];
  }
}

export const isDemo = true;

/** 데모는 로그인이 없다 */
export async function ready() { return { email: null }; }
export async function teacherLogin() { return null; }
export async function logout() {}

export function watch(path, cb) {
  const w = { path, cb, last: undefined };
  watchers.add(w);
  schedule();
  return () => watchers.delete(w);
}
export async function get(path) { db = read(); return clone(getAt(db, path)); }
export async function set(path, v) { db = read(); putAt(path, v); write(); return true; }
export async function update(path, obj) {
  db = read();
  for (const [k, v] of Object.entries(obj)) putAt(`${path}/${k}`, v);
  write();
  return true;
}
export async function push(path, v) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await set(`${path}/${id}`, v);
  return id;
}
export async function increment(path, n = 1) {
  db = read();
  putAt(path, (Number(getAt(db, path)) || 0) + n);
  write();
  return true;
}
export const remove = (path) => set(path, null);

export const serverNow = () => Date.now();

export function uid() {
  let u = sessionStorage.getItem('e30:uid');
  if (!u) { u = 'demo-' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('e30:uid', u); }
  return u;
}

/* 영상 파일: 데모는 IndexedDB(같은 PC의 탭끼리 공유)에 넣고 'demo-file:경로'로 가리킨다 */
const idb = () => new Promise((ok, no) => {
  const q = indexedDB.open('e30-files', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('f');
  q.onsuccess = () => ok(q.result);
  q.onerror = () => no(q.error);
});
async function files(mode, fn) {
  const d = await idb();
  return new Promise((ok, no) => {
    const t = d.transaction('f', mode), req = fn(t.objectStore('f'));
    t.oncomplete = () => ok(req.result);
    t.onerror = () => no(t.error);
  });
}
export async function uploadFile(path, file, onProgress) {
  onProgress?.(0.5);
  await files('readwrite', (s) => s.put(file, path));
  onProgress?.(1);
  return 'demo-file:' + path;
}
const srcs = new Map();
export async function fileSrc(url) {
  if (!url?.startsWith('demo-file:')) return url;
  if (!srcs.has(url)) {
    const blob = await files('readonly', (s) => s.get(url.slice('demo-file:'.length)));
    srcs.set(url, blob ? URL.createObjectURL(blob) : '');
  }
  return srcs.get(url);
}
export const removeFile = (path) => files('readwrite', (s) => s.delete(path)).catch(() => {});

export function onConnection(cb) {
  const f = () => cb(navigator.onLine);
  addEventListener('online', f);
  addEventListener('offline', f);
  f();
}

/** 접속 표시: 5초마다 시각을 적고, 탭을 닫으면 지운다 */
export function presence(path) {
  const beat = () => set(path, serverNow());
  beat();
  const iv = setInterval(beat, 5000);
  addEventListener('pagehide', () => { clearInterval(iv); set(path, null); });
  return () => clearInterval(iv);
}
