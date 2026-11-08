// 교사 진행판: 수업 상태(control)와 지구 회복 게이지를 쓰는 유일한 화면.
// 업로드·하트 자동 반영도 이 화면이 팀 데이터를 지켜보다가 계산해서 control/gauge에 쓴다.
import * as store from './store.js';
import { FIREBASE_CONFIG } from '../config.js';
import {
  $, $$, esc, loadData, params, rid, sum, mmss, initialControl, timerState, cueKey, polls,
  premPhase, premOffset, PHASE_NAME, gaugeCells, gaugeV, showAlert, toast, connBadge, soundButton, teamChip,
  fatal, errorToasts, sceneOf,
} from './ui.js';
import { sfx } from './sfx.js';

const { T, L } = await loadData();
const TEAMS = T.premiereOrder.map((id) => T.teams.find((t) => t.id === id));
const P = L.premiere, POLLS = polls(L), now = store.serverNow;
const RULE = Object.fromEntries(L.gauge.rules.map((r) => [r.id, r]));
const HEARTS_PER_CELL = 10; // lesson.json 규칙 "💖 하트 10개" = 1칸

$('#title').textContent = L.title;
const email = await teacherSignIn();
errorToasts();
const code = await ensureSession().catch((e) => fatal(`수업을 준비하지 못했어요 (${e?.code || e}). 인터넷, config.js, Firebase 보안 규칙을 확인해 주세요.`));
const base = `sessions/${code}`;
const C = (p) => `${base}/control/${p}`;
let S = { control: {} }, PINS = {}, MEMBERS = {};

$('#codeTxt').textContent = code;
$('#codeBig').textContent = code;
connBadge($('#conn'));
soundButton($('#snd'));

/* ── 교사 로그인 (Firebase만. 데모는 바로 통과) ── */
async function teacherSignIn() {
  let who;
  try { who = await store.ready({ teacher: true }); } catch (e) { fatal(`서버에 연결하지 못했어요 (${e?.code || e}). config.js 설정을 확인해 주세요.`); }
  if (store.isDemo || who.email) return who.email;
  $('#boot')?.remove();
  $('#login').hidden = false;
  return new Promise((resolve) => {
    $('#login').onsubmit = async (e) => {
      e.preventDefault();
      $('#lErr').textContent = '';
      try {
        const em = await store.teacherLogin($('#lEmail').value.trim(), $('#lPw').value);
        $('#lPw').value = '';
        $('#login').hidden = true;
        resolve(em);
      } catch (err) {
        $('#lErr').textContent = /invalid|wrong|user-not-found|credential/i.test(err?.code || '') ? '이메일이나 비밀번호가 달라요.' : `로그인 실패 (${err?.code || err})`;
      }
    };
  });
}

/* ── 세션 만들기 ── */
async function ensureSession() {
  let c = params.get('new') ? null : (params.get('code') || localStorage.getItem('e30:teacherCode') || '').toUpperCase();
  const owner = c ? await store.get(`sessions/${c}/teacherUid`) : null;
  if (!owner || (!store.isDemo && owner !== store.uid())) {
    c = await newCode();
    const ok = await store.set(`sessions/${c}`, { teacherUid: store.uid(), createdAt: now(), control: initialControl(L) }, { quiet: true });
    if (!ok) fatal(`수업을 만들 권한이 없어요. Firebase 보안 규칙의 TEACHER_EMAIL이 지금 로그인한 ${email}과 같은지 확인해 주세요.`);
    await store.set(`pins/${c}`, Object.fromEntries(T.teams.map((t) => [t.id, String(1000 + Math.floor(Math.random() * 9000))])));
  }
  localStorage.setItem('e30:teacherCode', c);
  localStorage.setItem('e30:lastCode', c);
  history.replaceState(null, '', `teacher.html?code=${c}`);
  return c;
}
async function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
    if (!(await store.get(`sessions/${c}/teacherUid`))) return c;
  }
}

const ctl = () => S.control || (S.control = {});
const stageId = () => ctl().stage || L.stages[0].id;
function sendAlert(icon, msg) { store.set(C('alert'), { id: rid(), icon, msg, at: now() }); }
/* ── 장면(슬라이드): 교사가 넘기면 모든 학교 화면이 같이 넘어간다 ── */
const SC = L.scenes;
const scene = () => sceneOf(L, ctl());
/** 장면으로 가기. effects=false면 퀴즈·정리 단계 같은 'on' 동작은 하지 않는다(이미 한 경우) */
function setScene(sc, effects = true) {
  if (!sc) return;
  const up = { scene: sc.id, stage: sc.stage };
  if (effects && sc.on?.quiz) up.quiz = { poll: sc.on.quiz, open: true, revealed: false, device: !!(ctl().quiz || {}).device };
  if (effects && sc.on?.reflectStep) up.reflectStep = sc.on.reflectStep;
  Object.assign(ctl(), up);
  store.update(`${base}/control`, up);
  render();
}
/** 단계로 가기: 그 단계의 대표 장면(main) 또는 첫 장면 */
function setStage(id) {
  if (id === stageId()) return;
  setScene(SC.find((s) => s.stage === id && s.main) || SC.find((s) => s.stage === id), false);
}
const step = (d) => setScene(SC[SC.indexOf(scene()) + d]);

function renderStages() {
  const cur = L.stages.findIndex((s) => s.id === stageId());
  $('#chips').innerHTML = L.stages.map((s, i) => `<button class="chip ${i === cur ? 'on' : i < cur ? 'past' : ''}" data-st="${s.id}"><small>${s.from}~${s.to}분</small>${esc(s.name)}</button>`).join('');
  const sc = scene(), i = SC.indexOf(sc), nx = SC[i + 1];
  $('#prev').disabled = i <= 0;
  $('#next').disabled = !nx;
  $$('.t-grid .panel').forEach((p) => p.classList.toggle('hot', (p.dataset.stages || '').split(' ').includes(stageId())));
  $('#scIdx').textContent = `장면 ${i + 1}/${SC.length} · ${L.stages.find((s) => s.id === sc.stage).name}`;
  $('#scNow').textContent = sceneName(sc);
  $('#scNext').textContent = nx ? `다음 ▶ ${sceneName(nx)}` : '마지막 장면이에요';
  $('#scNotes').innerHTML = esc(sc.notes || '').replace(/\n/g, '<br>');
  $('#scList').innerHTML = SC.map((s, k) => `<button class="${s === sc ? 'on' : ''}" data-sc="${s.id}" title="${esc(sceneName(s))}">${k + 1}</button>`).join('');
}
/** 장면 이름: 제목이 없는 앱 기능 장면은 퀴즈 판 이름·정리 소단계 이름으로 */
function sceneName(s) {
  if (s.title) return s.title;
  if (s.on?.quiz) return POLLS.find((p) => p.id === s.on.quiz)?.label || '퀴즈';
  if (s.on?.reflectStep) return L.reflect.steps.find((r) => r.id === s.on.reflectStep)?.label || '정리';
  return { make: '⏱ 제작 타이머', premiere: '🎬 실시간 시사회' }[s.live] || s.kicker || s.id;
}
$('#chips').onclick = (e) => { const b = e.target.closest('[data-st]'); if (b) setScene(SC.find((s) => s.stage === b.dataset.st)); };
$('#scList').onclick = (e) => { const b = e.target.closest('[data-sc]'); if (b) setScene(SC.find((s) => s.id === b.dataset.sc)); };
$('#prev').onclick = () => step(-1);
$('#next').onclick = () => step(1);
// 키보드·프레젠터 리모컨(PageDown/PageUp): 입력 칸에 글을 쓰는 중이 아닐 때만
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (['ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); step(1); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); step(-1); }
});

/* ── 제작 타이머 (기존 도구판의 타이머를 endAt 동기화 방식으로 바꿈) ── */
$('#tMin').value = L.makeTimerMinutes;
let firedLocal = new Set(), stopping = false, nudgeMark = -1;
function renderTimer() {
  const t = timerState(ctl(), now());
  $('#tStart').textContent = t.running ? '⏸ 멈춤' : '▶ 시작';
  $('#tStart').className = 'btn ' + (t.running ? 'red' : 'go');
  const nxt = L.cues.find((c) => !t.fired[cueKey(c)]);
  $('#cues').innerHTML = L.cues.map((c, i) => `<button class="cuerow ${t.fired[cueKey(c)] ? 'fired' : ''} ${c === nxt ? 'next' : ''}" data-cue="${i}"><span class="t">${c.at}분</span><span>${esc(c.icon)} ${esc(c.msg)}</span></button>`).join('');
}
$('#cues').onclick = (e) => { const b = e.target.closest('[data-cue]'); if (b) { const c = L.cues[+b.dataset.cue]; sendAlert(c.icon, c.msg); } };
$('#tStart').onclick = () => {
  const t = timerState(ctl(), now());
  if (t.running) store.update(C('timer'), { running: false, remain: t.left });
  else {
    store.update(C('timer'), { running: true, endAt: now() + t.left });
    sfx.go();
    setStage('make');
  }
};
$('#tPlus').onclick = () => {
  const t = timerState(ctl(), now());
  store.update(C('timer'), t.running ? { total: t.total + 60000, endAt: t.endAt + 60000 } : { total: t.total + 60000, remain: t.left + 60000 });
};
$('#tReset').onclick = () => {
  const m = Math.max(5, Math.min(40, +$('#tMin').value || L.makeTimerMinutes));
  firedLocal = new Set();
  store.set(C('timer'), { total: m * 60000, endAt: 0, remain: m * 60000, running: false });
};
function tickTimer() {
  const t = timerState(ctl(), now());
  $('#clock').textContent = mmss(t.left);
  $('#clock').classList.toggle('warn', t.left <= 5 * 60000);
  $('#bar').style.width = `${t.total ? Math.min(100, (t.elapsed / t.total) * 100) : 0}%`;
  if (!t.running) { stopping = false; return; }
  // 교사 화면에만: N분마다 원격 학교 확인 알림 (저장하지 않음)
  const mark = Math.floor(t.elapsed / (L.teacherNudge.everyMin * 60000));
  if (nudgeMark >= 0 && mark > nudgeMark && t.left > 0) toast(L.teacherNudge.icon, `${mark * L.teacherNudge.everyMin}분 · ${L.teacherNudge.msg}`);
  nudgeMark = mark;
  for (const c of L.cues) {
    const k = cueKey(c);
    if (t.elapsed >= c.at * 60000 && !t.fired[k] && !firedLocal.has(k)) {
      firedLocal.add(k);
      store.set(C(`timer/fired/${k}`), true);
      sendAlert(c.icon, c.msg);
    }
  }
  if (t.left <= 0 && !stopping) { stopping = true; store.update(C('timer'), { running: false, remain: 0 }); }
}

/* ── 알림 ── */
$('#presets').innerHTML = L.presets.map((p, i) => `<button class="preset" data-p="${i}"><b>${esc(p.icon)} ${esc(p.msg)}</b><span>${esc(p.hint)}</span></button>`).join('');
$('#presets').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { const p = L.presets[+b.dataset.p]; sendAlert(p.icon, p.msg); } };
$('#customForm').onsubmit = (e) => {
  e.preventDefault();
  const v = $('#customText').value.trim();
  if (v) { sendAlert('📣', v); $('#customText').value = ''; }
};

/* ── 퀴즈 ── */
function renderQuiz() {
  const q = ctl().quiz || {};
  // 손 투표(기본)면 열기 → 공개만, 팀 기기 투표를 켜면 열기 → 마감 → 결과 공개
  const dev = !!q.device;
  $('#quiz').innerHTML = POLLS.map((p) => {
    const cur = q.poll === p.id;
    const n = Object.keys(S.votes?.[p.id] || {}).length;
    const st = cur ? (q.revealed ? '📊 공개됨' : !dev ? '✋ 손 투표 중' : q.open ? '🟢 투표 중' : '🔒 마감') : '';
    const canReveal = cur && !q.revealed && (!dev || !q.open);
    return `<div class="qrow ${cur ? 'on' : ''}"><div><b>${esc(p.label)}</b><small>${esc(p.cards.map((c) => c.text.split('\n')[0]).join(' / '))}</small></div>
      <span class="muted small">${dev ? `${n}/${TEAMS.length}팀 ` : ''}${st}</span>
      <div class="row"><button class="btn sm go" data-q="open" data-p="${p.id}" ${cur && q.open && !q.revealed ? 'disabled' : ''}>${dev ? '열기' : '카드 보여 주기'}</button>
      ${dev ? `<button class="btn sm" data-q="close" data-p="${p.id}" ${cur && q.open ? '' : 'disabled'}>마감</button>` : ''}
      <button class="btn sm cue" data-q="reveal" data-p="${p.id}" ${canReveal ? '' : 'disabled'}>${dev ? '결과 공개' : '정리하기'}</button></div></div>`;
  }).join('');
  $('#quizPanels').innerHTML = `<button class="btn sm ${dev ? 'go' : ''}" id="qDevice">📱 팀 기기 투표 ${dev ? '켜짐' : '꺼짐 (손 투표)'}</button>`;
}
$('#quizPanels').addEventListener('click', (e) => {
  if (e.target.closest('#qDevice')) store.update(C('quiz'), { device: !(ctl().quiz || {}).device, open: false, revealed: false });
});
$('#quiz').onclick = (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  const p = b.dataset.p;
  if (b.dataset.q === 'open') { setScene(SC.find((s) => s.on?.quiz === p)); sfx.go(); }
  if (b.dataset.q === 'close') store.update(C('quiz'), { open: false });
  if (b.dataset.q === 'reveal') store.update(C('quiz'), { open: false, revealed: true });
};

/* ── 배움 정리 소단계 ── */
function renderReflect() {
  const cur = ctl().reflectStep || L.reflect.steps[0].id;
  const on = stageId() === 'reflect';
  $('#rSteps').innerHTML = L.reflect.steps.map((s) => `<button class="team" aria-pressed="${on && cur === s.id}" data-rs="${s.id}" style="--c:var(--cue)">${esc(s.label)}</button>`).join('');
  const sv = TEAMS.map((t) => S.teams?.[t.id]?.severity || {});
  $('#sevSum').textContent = `🖐 ${L.severity.beforeLabel} ${sv.filter((s) => s.before).length}/${TEAMS.length} · ${L.severity.afterLabel} ${sv.filter((s) => s.after).length}/${TEAMS.length}팀`;
}
$('#rSteps').onclick = (e) => {
  const b = e.target.closest('[data-rs]');
  if (!b) return;
  setScene(SC.find((s) => s.on?.reflectStep === b.dataset.rs));
};

/* ── 프리미어 (기존 도구판의 프리미어 연출: 3·2·1 → 팀 소개 → 30초 링 → 비하인드) ── */
const prem = () => ctl().premiere || {};
function nextTeam(afterId) {
  const done = ctl().premDone || {};
  const i = TEAMS.findIndex((t) => t.id === afterId);
  return TEAMS.slice(i + 1).find((t) => !done[t.id]) || TEAMS.find((t) => !done[t.id] && t.id !== afterId) || null;
}
function startPrem(id, phase = 'count') {
  store.set(C('premiere'), { teamId: id, startedAt: now() - premOffset(P, phase) * 1000 });
  // 반응 안내 장면에 있었어도 무대가 보이는 시사회 장면으로
  if (scene().live !== 'premiere') setScene(SC.find((s) => s.live === 'premiere'), false);
}
function renderPrem() {
  const pr = prem(), done = ctl().premDone || {};
  $('#order').innerHTML = TEAMS.map((t, i) => `<button class="team ${done[t.id] ? 'done' : ''}" aria-pressed="${pr.teamId === t.id}" data-pt="${t.id}" style="--c:${t.color}"><span class="idx">${i + 1}</span>${teamChip(t)}</button>`).join('');
  const nx = nextTeam(pr.teamId);
  $('#pNext').textContent = nx ? `다음 팀 ▶ ${nx.name}` : '다음 팀 없음';
  $('#pNext').disabled = !nx;
  ['pPlay', 'pBehind', 'pRestart', 'pClose'].forEach((id) => { $('#' + id).disabled = !pr.teamId; });
}
$('#order').onclick = (e) => { const b = e.target.closest('[data-pt]'); if (b) startPrem(b.dataset.pt); };
$('#pPlay').onclick = () => startPrem(prem().teamId, 'play');
$('#pBehind').onclick = () => startPrem(prem().teamId, 'behind');
$('#pRestart').onclick = () => startPrem(prem().teamId);
$('#pNext').onclick = () => { const nx = nextTeam(prem().teamId); if (nx) startPrem(nx.id); };
$('#pClose').onclick = () => store.set(C('premiere'), { startedAt: 0 });
function tickPrem() {
  const pr = prem(), ph = premPhase(pr, now(), P);
  const live = !!ph && ph.phase !== 'done' && stageId() === 'premiere';
  $('#onair').classList.toggle('live', live || timerState(ctl(), now()).running);
  let html;
  if (!ph) html = '<span class="muted">무대가 비어 있어요. 아래에서 팀을 눌러요.</span>';
  else {
    const t = TEAMS.find((x) => x.id === pr.teamId);
    const hearts = sum(S.hearts?.[t.id]);
    html = `<div class="phase-label">● ${PHASE_NAME[ph.phase]}${ph.left ? ` · ${ph.left}초` : ''}</div>${esc(t.school)} ${esc(t.name)} <span class="muted small">💖 ${hearts}</span>`;
    if (ph.phase === 'done' && !(ctl().premDone || {})[t.id]) store.set(C(`premDone/${t.id}`), true);
  }
  if ($('#premNow').innerHTML !== html) $('#premNow').innerHTML = html;
}

/* ── 지구 회복 게이지 ── */
$('#gGoal').textContent = `목표 ${L.gauge.goal}칸 · 최대 ${L.gauge.max}칸`;
$('#gRules').innerHTML = L.gauge.rules.map((r) => {
  const head = `<span>${esc(r.label)} = <b>${r.cells}칸</b>`;
  if (r.id === 'heart') return `<div class="rule">${head}<br><small class="muted" id="gAppHearts"></small></span><span class="row"><input type="number" id="hearts" min="0" placeholder="0" aria-label="패들렛 하트 총수"><button class="btn cue" id="heartApply">패들렛 하트 반영</button></span></div>`;
  if (r.id === 'upload') return `<div class="rule">${head}<br><small class="muted" id="gUploads"></small></span><button class="btn" data-add="${r.cells}">+${r.cells}칸</button></div>`;
  if (r.id === 'mission') return `<div class="rule">${head}</span><span class="row" id="gMissions"></span></div>`;
  return `<div class="rule">${head}</span><button class="btn" data-add="${r.cells}" data-why="${esc(r.label)}">+${r.cells}칸</button></div>`;
}).join('');

/** 게이지 칸 더하기. 쓰기 전에 S도 바로 고쳐서 빠른 연속 클릭·자동 반영이 겹쳐도 안 틀리게 */
function addCells(k, why = '', extra = {}, silent = false) {
  const g = (ctl().gauge = { ...(ctl().gauge || {}) });
  const before = gaugeV(ctl(), L);
  const v = Math.max(0, Math.min(L.gauge.max, before + k));
  g.v = v;
  Object.assign(g, extra);
  store.set(C('gauge'), g);
  if (v > before && !silent) sendAlert('🌍', `${why ? why + ' · ' : ''}지구 회복 게이지 +${v - before}칸! (${v}칸)`);
}
$('#pGauge').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (b) addCells(+b.dataset.add, b.dataset.why || '');
  const m = e.target.closest('[data-ms]');
  if (m && !S.missions?.[m.dataset.ms]) {
    const s = T.schools.find((x) => x.id === m.dataset.ms);
    S.missions = { ...(S.missions || {}), [s.id]: true };
    store.set(`${base}/missions/${s.id}`, true);
    addCells(RULE.mission.cells, `🕵️ ${s.name} 비밀 미션 성공`);
  }
});
$('#heartApply').onclick = () => {
  const g = ctl().gauge || {};
  const h = Math.max(0, +$('#hearts').value || 0);
  const shouldBe = Math.floor(h / HEARTS_PER_CELL), already = Math.floor((g.heartsApplied || 0) / HEARTS_PER_CELL);
  const heartsApplied = Math.max(g.heartsApplied || 0, h);
  if (shouldBe > already) addCells((shouldBe - already) * RULE.heart.cells, '💖 패들렛 하트', { heartsApplied });
  else { addCells(0, '', { heartsApplied }); toast('💖', `이미 반영했어요. 하트 ${(already + 1) * HEARTS_PER_CELL}개가 되면 1칸 더!`); }
};
$('#gSetBtn').onclick = () => addCells((+$('#gSet').value || 0) - gaugeV(ctl(), L), '', {}, true);
function renderGauge() {
  const v = gaugeV(ctl(), L), g = ctl().gauge || {};
  $('#gNum').innerHTML = `${v}<small> / ${L.gauge.max}칸</small>`;
  $('#gCells').innerHTML = gaugeCells(v, L);
  if (document.activeElement !== $('#gSet')) $('#gSet').value = v;
  if (document.activeElement !== $('#hearts')) $('#hearts').placeholder = g.heartsApplied || 0;
  $('#gAppHearts').textContent = `패들렛 반영 ${g.heartsApplied || 0}개 · 앱 하트 ${allHearts()}개 (자동 ${g.appHeartCells || 0}칸)`;
  $('#gUploads').textContent = `자동 반영 ${Object.keys(g.uploads || {}).length}/${TEAMS.length}팀`;
  $('#gMissions').innerHTML = T.schools.map((s) => `<button class="btn sm ${S.missions?.[s.id] ? 'go' : ''}" data-ms="${s.id}" ${S.missions?.[s.id] ? 'disabled' : ''}>${esc(s.name)} ${S.missions?.[s.id] ? '✓' : `+${RULE.mission.cells}`}</button>`).join('');
}
const allHearts = () => Object.values(S.hearts || {}).reduce((a, o) => a + sum(o), 0);

/** 업로드 완료(+칸)·앱 하트 10개(+칸) 자동 반영. 반영 기록을 gauge 안에 남겨 중복을 막는다 */
function autoApply() {
  const g = ctl().gauge || {};
  const ups = TEAMS.filter((t) => S.teams?.[t.id]?.uploaded && !g.uploads?.[t.id]);
  const cellsNow = Math.floor(allHearts() / HEARTS_PER_CELL);
  const hDiff = cellsNow - (g.appHeartCells || 0);
  if (!ups.length && hDiff <= 0) return;
  const why = [ups.length ? `🎬 ${ups.map((t) => t.name).join('·')} 업로드 완료` : '', hDiff > 0 ? `💖 하트 ${cellsNow * HEARTS_PER_CELL}개` : ''].filter(Boolean).join(' · ');
  const uploads = { ...(g.uploads || {}) };
  ups.forEach((t) => { uploads[t.id] = true; });
  addCells(ups.length * RULE.upload.cells + Math.max(0, hDiff) * RULE.heart.cells, why, { uploads, appHeartCells: Math.max(g.appHeartCells || 0, cellsNow) });
}

/* ── 팀 대시보드 ── */
const seenSos = {};
function renderTeams() {
  const n = now();
  let online = 0, uploaded = 0, sos = 0;
  const html = TEAMS.map((t) => {
    const d = S.teams?.[t.id] || {};
    const on = store.isOnline(d.online, n);
    online += on; uploaded += !!d.uploaded;
    const prep = Object.values(d.prep || {}).filter(Boolean).length;
    const cuts = L.cuts.map((c) => `<span class="cut ${d.progress?.[c.id] ? 'on' : ''}" title="${esc(c.name)}">${esc(c.name.split(' ')[0])}</span>`).join('');
    const ask = d.sos && !d.sos.resolved;
    sos += !!ask;
    if (ask && seenSos[t.id] !== d.sos.at) { seenSos[t.id] = d.sos.at; sfx.sos(); toast('🆘', `${t.name}: ${d.sos.q}`); }
    return `<article class="tcard ${ask ? 'alarm' : ''}" style="--c:${t.color}">
      <header><span class="no" style="background:${t.color}">${t.goal}</span><div><b>${esc(t.name)}</b><small>${esc(t.school)} · ${esc(t.goalName)}</small></div><span class="dot ${on ? 'on' : ''}" title="${on ? '접속 중' : '접속 안 됨'}"></span></header>
      <div class="hook">${d.hook ? `“${esc(d.hook)}”` : '<span class="muted">훅 고르는 중</span>'}</div>
      <div class="cutline">재료 ${prep}/${L.prepChecklist.length} · 컷 ${cuts}</div>
      <div class="cutline">🖐 ${d.severity?.before ?? '–'} → ${d.severity?.after ?? '–'}${d.promise ? ' · ✍️ 약속 카드' : ''}</div>
      ${d.uploaded ? '<div class="up">📤 업로드 완료</div>' : ''}
      ${ask ? `<div class="sos"><b>🆘 ${esc(d.sos.q)}</b><button class="btn sm" data-resolve="${t.id}">해결</button></div>` : ''}
    </article>`;
  }).join('');
  if ($('#teams').innerHTML !== html) $('#teams').innerHTML = html;
  $('#teamsSum').textContent = `접속 ${online}/${TEAMS.length} · 업로드 ${uploaded}/${TEAMS.length}${sos ? ` · 🆘 ${sos}` : ''}`;
}
$('#teams').onclick = (e) => { const b = e.target.closest('[data-resolve]'); if (b) store.update(`${base}/teams/${b.dataset.resolve}/sos`, { resolved: true }); };

/* ── 세션 관리 ── */
function renderPins() {
  $('#pins').innerHTML = TEAMS.map((t) => {
    const n = Object.keys(MEMBERS[t.id] || {}).length;
    return `<tr><td>${esc(t.school)} ${esc(t.name)}</td><td class="muted">${n ? `기기 ${n}대 등록` : ''}</td><td>${esc(PINS[t.id] || '')}</td></tr>`;
  }).join('');
  const regs = Object.values(MEMBERS).reduce((a, o) => a + Object.keys(o || {}).length, 0);
  $('#members').textContent = `팀 기기 ${regs}대 등록`;
}
$('#links').innerHTML = T.schools.map((s) => `<a class="btn sm" target="_blank" rel="noopener" href="screen.html?code=${code}&school=${s.id}">📺 ${esc(s.name)} 화면 열기</a>`).join('')
  + `<a class="btn sm" target="_blank" rel="noopener" href="team.html?code=${code}">📱 팀 화면 열기</a>`
  + (store.isDemo ? (FIREBASE_CONFIG ? '<a class="btn sm cue" href="index.html?demo=0">🔥 실시간 모드로 바꾸기 (보안 점검은 실시간 모드에서)</a>' : '') : `<a class="btn sm" target="_blank" rel="noopener" href="rules-check.html?code=${code}">🛡 보안 점검</a><button class="btn sm" id="logout">로그아웃 (${esc(email)})</button>`);
$('#logout')?.addEventListener('click', async () => { await store.logout(); location.href = 'index.html'; });
$('#export').onclick = async () => {
  const data = { exportedAt: new Date().toISOString(), code, lesson: L.title, session: await store.get(base) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `30초지구_수업기록_${code}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#newSess').onclick = () => { if (confirm('새 세션 코드를 만들까요? 학교 화면·팀 기기도 새 코드로 다시 들어와야 해요.')) location.href = 'teacher.html?new=1'; };
$('#reset').onclick = async () => {
  if (!confirm('정말 전체 초기화할까요? 단계·타이머·게이지·투표·하트·팀 기록이 모두 지워져요.')) return;
  if (!confirm('한 번 더 확인할게요. 되돌릴 수 없어요. 초기화할까요?')) return;
  firedLocal = new Set();
  await store.set(base, { teacherUid: store.uid(), createdAt: now(), control: initialControl(L) });
  await store.remove(`members/${code}`);
  toast('🧹', '초기화했어요. 팀 기기는 PIN으로 다시 들어와요.');
};

/* ── 연결 ── */
function render() {
  renderStages(); renderTimer(); renderQuiz(); renderReflect(); renderPrem(); renderGauge(); renderTeams();
  showAlert(ctl().alert, now());
  autoApply();
}
store.watch(base, (v) => { S = v || {}; if (!S.control) S.control = {}; render(); });
store.watch(`pins/${code}`, (v) => { PINS = v || {}; renderPins(); });
store.watch(`members/${code}`, (v) => { MEMBERS = v || {}; renderPins(); });
setInterval(() => { tickTimer(); tickPrem(); }, 250);
setInterval(renderTeams, 5000);
