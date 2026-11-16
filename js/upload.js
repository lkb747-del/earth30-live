// 휴대폰 영상 올리기: 팀 화면의 QR을 찍고 들어와 갤러리 영상을 바로 저장소에 올린다.
// 팀 화면(team.js)의 영상 올리기와 같은 경로·같은 기록(teams/{id}/video)을 쓰므로, 교사 승인·TV 상영은 그대로 동작한다.
import * as store from './store.js';
import { $, esc, loadData, params, toast, teamChip, signInAnon, sessionExists, errorToasts, connBadge } from './ui.js';
import { sfx, unlockAudio } from './sfx.js';
import { burst } from './confetti.js';

const { T, L } = await loadData();
const VID = L.video, PH = VID.phone, now = store.serverNow;
const ORDER = T.premiereOrder.map((id) => T.teams.find((t) => t.id === id));
let me, tb;
const rec = { video: null, ng: null }, okAt = { video: null, ng: null }, upPct = { video: null, ng: null };
const NG = VID.ng, OKKEY = { video: 'videoOk', ng: 'ngOk' };

$('#title').textContent = PH.title;
$('#jLead').textContent = PH.lead;
document.addEventListener('pointerdown', unlockAudio);

/* ── 입장: QR에 담긴 세션 코드·팀 + PIN (같은 팀 기기로 한 번 더 등록) ── */
await signInAnon();
errorToasts();
const KEY = 'e30:up';
const saved = (() => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } })();
const code0 = (params.get('code') || saved?.code || '').toUpperCase();
const team0 = T.teams.some((t) => t.id === params.get('team')) ? params.get('team') : saved?.team || null;
const registered = saved && saved.code === code0 && (!team0 || saved.team === team0)
  && (await store.get(`members/${code0}/${saved.team}/${store.uid()}`).catch(() => null));
if (registered) start(saved.code, saved.team);
else showJoin();

function showJoin() {
  let pick = team0;
  $('#join').hidden = false;
  $('#jCode').value = code0;
  const paint = () => {
    const list = team0 ? ORDER.filter((t) => t.id === team0) : ORDER;
    $('#jTeams').innerHTML = list.map((t) => `<button type="button" class="team" data-t="${t.id}" style="--c:${t.color}" aria-pressed="${pick === t.id}">${teamChip(t)}</button>`).join('');
  };
  paint();
  $('#jTeams').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { pick = b.dataset.t; paint(); $('#jPin').focus(); } };
  if (code0 && team0) $('#jPin').focus();
  $('#join').onsubmit = async (e) => {
    e.preventDefault();
    const err = (m) => { $('#jErr').textContent = m; };
    const c = $('#jCode').value.trim().toUpperCase(), pin = $('#jPin').value.trim();
    if (!c) return err('세션 코드를 넣어 주세요.');
    if (!(await sessionExists(c).catch(() => false))) return err(`${c} 세션이 없어요. 팀 화면의 QR을 다시 찍어 주세요.`);
    if (!pick) return err('우리 팀을 골라 주세요.');
    if (!/^\d{4}$/.test(pin)) return err('PIN 4자리 숫자를 넣어 주세요.');
    const wrong = () => err('PIN이 달라요. 팀 화면에 들어갈 때 쓴 번호예요.');
    if (store.isDemo && String(await store.get(`pins/${c}/${pick}`)) !== pin) return wrong();
    if (!(await store.set(`members/${c}/${pick}/${store.uid()}`, pin, { quiet: true }))) return wrong();
    sessionStorage.setItem(KEY, JSON.stringify({ code: c, team: pick }));
    $('#join').hidden = true;
    history.replaceState(null, '', `upload.html?code=${c}&team=${pick}`);
    start(c, pick);
  };
  // 교사 화면의 팀 링크·카드 QR에는 PIN이 들어 있어 누르면 바로 들어간다 (틀리면 입력 칸에 남음)
  const pin0 = params.get('pin');
  if (pin0 && /^\d{4}$/.test(pin0) && $('#jCode').value && pick) { $('#jPin').value = pin0; $('#join').requestSubmit(); }
}

function start(code, teamId) {
  me = T.teams.find((t) => t.id === teamId);
  tb = `sessions/${code}/teams/${me.id}`;
  document.title = `${me.name} · ${PH.title}`;
  $('#app').hidden = false;
  $('#me').style.setProperty('--c', me.color);
  $('#me').innerHTML = teamChip(me);
  connBadge($('#conn'));
  for (const k of ['video', 'ng']) {
    store.watch(`${tb}/${k}`, (v) => { rec[k] = v; render(); });
    store.watch(`sessions/${code}/control/${OKKEY[k]}/${me.id}`, (v) => { okAt[k] = v; render(); });
  }
}

function box(k) {
  const T2 = k === 'ng' ? { title: NG.title, pick: NG.pick, again: NG.again, none: NG.none, ok: NG.approved, wait: NG.waiting, note: NG.note }
    : { title: PH.title, pick: PH.pick, again: PH.again, none: PH.none, ok: VID.approved, wait: VID.waiting, note: PH.note };
  const v = rec[k], ok = v && okAt[k] === v.at, pct = upPct[k];
  const state = pct !== null ? `${VID.uploading} ${Math.round(pct * 100)}%` : !v ? T2.none : ok ? T2.ok : T2.wait;
  return `<section class="up-box ${k}"><h2>${esc(T2.title)}</h2>
    ${k === 'video' ? `<ol class="up-steps">${PH.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    <label class="btn up-pick ${pct !== null ? 'busy' : ''} ${k === 'ng' ? 'ngp' : ''}">${esc(v ? T2.again : T2.pick)}
      <input type="file" data-k="${k}" accept="video/*" ${pct !== null ? 'disabled' : ''} hidden></label>
    <div class="up-bar" data-k="${k}"><span style="width:${pct !== null ? Math.round(pct * 100) : v ? 100 : 0}%"></span></div>
    <p class="up-state ${ok ? 'ok' : v ? 'wait' : ''}" data-k="${k}">${esc(state)}</p>
    <p class="muted small">${esc(T2.note)}</p></section>`;
}
function render() {
  $('#view').innerHTML = box('video') + box('ng');
  document.querySelectorAll('#view input[type=file]').forEach((el) => { el.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) send(f, el.dataset.k); }; });
}

async function send(f, k = 'video') {
  if (!f.type.startsWith('video/')) return toast('⚠️', VID.notVideo);
  if (f.size > VID.maxMB * 1024 * 1024) return toast('⚠️', VID.tooBig);
  const old = rec[k];
  const ext = (f.name.split('.').pop() || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp4';
  const path = `videos/${tb.split('/')[1]}/${me.id}/${k === 'ng' ? 'ng-' : ''}${Date.now()}.${ext}`;
  upPct[k] = 0; render();
  try {
    const url = await store.uploadFile(path, f, (p) => {
      upPct[k] = p;
      const s = $(`.up-bar[data-k="${k}"] span`); if (s) s.style.width = `${Math.round(p * 100)}%`;
      const t = $(`.up-state[data-k="${k}"]`); if (t) t.textContent = `${VID.uploading} ${Math.round(p * 100)}%`;
    });
    if (!(await store.set(`${tb}/${k}`, { url, path, size: f.size, at: now() }))) { store.removeFile(path); throw new Error('video record'); }
    if (old?.path) store.removeFile(old.path);
    if (k === 'video') store.set(`${tb}/uploaded`, true);
    sfx.win(); burst(100); toast(k === 'ng' ? '😂' : '🎬', k === 'ng' ? NG.done : PH.done);
  } catch (e) { toast('⚠️', k === 'ng' && e?.message === 'video record' ? NG.blocked : VID.failed); }
  upPct[k] = null; render();
}
