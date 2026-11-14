// 참관 화면(참관 선생님 폰·태블릿): 수업을 따라가며 보기만 한다.
// 쓰는 곳은 observers/{code}/ 의 익명 참관 메모와 시사회 박수뿐이다.
import * as store from './store.js';
import {
  $, esc, loadData, params, sum, premPhase, gaugeV, sceneOf, sceneLabel, requireSession, connBadge, toast, errorToasts, teamChip,
} from './ui.js';

const { T, L } = await loadData();
const O = L.observer, P = L.premiere, now = store.serverNow;
const ORDER = T.premiereOrder.map((id) => T.teams.find((t) => t.id === id));
const code = await requireSession((params.get('code') || localStorage.getItem('e30:lastCode') || '').toUpperCase());
const base = `sessions/${code}`, ob = `observers/${code}`;
let S = {}, CLAPS = {}, sent = 0;
const html = {};
const paint = (id, h) => { if (html[id] !== h) { $('#' + id).innerHTML = h; html[id] = h; } };

$('#title').textContent = L.title;
$('#welcome').textContent = O.welcome;
document.title = `참관 · ${L.title}`;
errorToasts();
connBadge($('#conn'));

/* ── 지금 장면: 설계 의도 · 발문 · 평가 관점 ── */
function renderNow(c) {
  const sc = sceneOf(L, c), st = L.stages.find((s) => s.id === sc.stage);
  $('#stageName').textContent = `${st.name} · ${st.from}~${st.to}분`;
  const why = O.why[sc.id] || O.why[sc.stage];
  const ev = O.evals[sc.stage];
  paint('now', `<div class="kicker">장면 ${L.scenes.indexOf(sc) + 1}/${L.scenes.length}</div><h2>${esc(sceneLabel(L, sc))}</h2>
    ${why ? `<p class="o-box why"><b>설계 의도</b>${esc(why)}</p>` : ''}
    ${O.showNotes && sc.notes ? `<p class="o-box notes"><b>발문·메모</b>${esc(sc.notes).replace(/\n/g, '<br>')}</p>` : ''}
    ${ev ? `<p class="o-box eval"><b>평가 관점 · ${esc(ev.area)}</b>${esc(ev.text)}<small>${esc(ev.how)}</small></p>` : ''}`);
}

/* ── 일곱 모둠: 원격 학교까지 한눈에 (보기 전용, PIN·SOS 내용은 안 보여 줌) ── */
function renderTeams() {
  const n = now();
  paint('teams', ORDER.map((t) => {
    const d = S.teams?.[t.id] || {}, sv = d.severity || {};
    const cuts = L.cuts.map((c) => `<span class="cut ${d.progress?.[c.id] ? 'on' : ''}">${esc(c.name.split(' ')[0])}</span>`).join('');
    return `<article class="o-team" style="--c:${t.color}"><header class="team">${teamChip(t)}<span class="dot ${store.isOnline(d.online, n) ? 'on' : ''}"></span></header>
      <div class="hook">${d.hook ? `“${esc(d.hook)}”` : '<span class="muted">훅 고르는 중</span>'}</div>
      <div class="cutline">${cuts}${d.video ? ' · 🎬' : ''}${d.promise ? ' · ✍️' : ''} · 🖐 ${sv.before ?? '–'} → ${sv.after ?? '–'}</div></article>`;
  }).join(''));
}

/* ── 시사회 박수: 상영·비하인드 중에만, 한 편에 한 사람 maxClaps번까지 ── */
function renderClap(c) {
  const pr = c.premiere || {}, ph = c.stage === 'premiere' ? premPhase(pr, now(), P) : null;
  const on = ph && (ph.phase === 'play' || ph.phase === 'behind');
  $('#clap').hidden = !on;
  if (!on) return;
  const t = T.teams.find((x) => x.id === pr.teamId);
  const mine = CLAPS[t.id]?.[store.uid()] || 0;
  paint('clap', `<div class="kicker">지금 상영 중</div><h3>${teamChip(t)}</h3>
    <button class="btn o-clapbtn" id="clapBtn" ${mine >= O.maxClaps ? 'disabled' : ''}>${esc(O.clapLabel)} <b>${sum(CLAPS[t.id])}</b></button>`);
}
$('#clap').addEventListener('click', (e) => {
  if (!e.target.closest('#clapBtn')) return;
  const id = S.control?.premiere?.teamId, me = store.uid();
  const mine = CLAPS[id]?.[me] || 0;
  if (!id || mine >= O.maxClaps) return;
  CLAPS = { ...CLAPS, [id]: { ...(CLAPS[id] || {}), [me]: mine + 1 } };
  store.set(`${ob}/claps/${id}/${me}`, mine + 1);
  render();
});

/* ── 정리 단계: 오늘 수업의 숫자 ── */
function renderSummary(c) {
  const show = c.stage === 'reflect';
  $('#summary').hidden = !show;
  if (!show) return;
  const M = O.summary, teams = ORDER.map((t) => S.teams?.[t.id] || {});
  const both = teams.map((d) => d.severity || {}).filter((s) => s.before && s.after);
  const avg = (k) => (both.reduce((a, s) => a + s[k], 0) / both.length).toFixed(1);
  const hearts = Object.values(S.hearts || {}).reduce((a, o) => a + sum(o), 0);
  const claps = Object.values(CLAPS).reduce((a, o) => a + sum(o), 0);
  const rows = [
    [M.gauge, `${L.gauge.start} → ${gaugeV(c, L)}칸`],
    [M.severity, both.length ? `${avg('before')} → ${avg('after')} (${both.length}모둠)` : '–'],
    [M.uploads, `${teams.filter((d) => d.video || d.uploaded).length}/${ORDER.length}`],
    [M.hearts, `${hearts}개`],
    [M.claps, `${claps}번`],
  ];
  paint('summary', `<h3>📊 ${esc(M.title)}</h3><div class="o-sum">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`);
}

/* ── 익명 참관 메모: 태그를 누르면 그때 장면과 시각이 함께 저장된다 ── */
$('#tags').innerHTML = O.tags.map((t, i) => `<button type="button" class="btn sm" data-tag="${i}">${esc(t)}</button>`).join('');
$('#memoText').placeholder = O.memoHint;
async function sendMemo(tag) {
  const text = $('#memoText').value.trim();
  if (!tag && !text) return $('#memoText').focus();
  const sc = sceneOf(L, S.control || {});
  if (!(await store.push(`${ob}/notes`, { tag: tag || '📝 메모', text, scene: sc.id, at: now(), uid: store.uid() }))) return;
  $('#memoText').value = '';
  sent += 1;
  $('#memoCount').textContent = `내가 남긴 메모 ${sent}개 · 익명으로 모여요`;
  toast('📝', O.memoSent);
}
$('#tags').onclick = (e) => { const b = e.target.closest('[data-tag]'); if (b) sendMemo(O.tags[+b.dataset.tag]); };
$('#memo').onsubmit = (e) => { e.preventDefault(); sendMemo(null); };

function render() {
  const c = S.control || {};
  renderNow(c); renderTeams(); renderClap(c); renderSummary(c);
  const ph = premPhase(c.premiere, now(), P);
  $('#onair').classList.toggle('live', !!c.timer?.running || (c.stage === 'premiere' && !!ph && ph.phase !== 'done'));
}
store.watch(base, (v) => { S = v || {}; render(); });
store.watch(`${ob}/claps`, (v) => { CLAPS = v || {}; render(); });
setInterval(render, 1000);
