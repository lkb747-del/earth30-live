// 공통 도우미: 데이터 읽기, 시간 계산, 게이지·토스트·축하 화면 조각
import * as store from './store.js';
import { sfx, unlockAudio, isSoundOn, setSound } from './sfx.js';
import { burst } from './confetti.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
export const params = new URLSearchParams(location.search);
export const rid = () => Math.random().toString(36).slice(2, 10);
export const sum = (o) => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);

/** 수업 문구는 전부 이 두 JSON에서 읽는다 */
export async function loadData() {
  const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  const [T, L] = await Promise.all([get('data/teams.json'), get('data/lesson.json')]);
  $('#boot')?.remove();
  return { T, L };
}

export function fatal(msg) {
  document.body.innerHTML = `<main class="fatal"><p>${esc(msg)}</p><a class="btn cue" href="index.html">처음 화면으로</a></main>`;
  throw new Error(msg);
}

/** 세션이 있는지 (Firebase 연결·규칙 문제로 못 읽으면 에러) */
export async function sessionExists(code) {
  return !!(await store.get(`sessions/${code}/teacherUid`));
}

/** 익명 로그인 (학교 화면·팀). 실패하면 안내 화면 */
export async function signInAnon() {
  try { await store.ready(); } catch (e) { fatal(`로그인하지 못했어요 (${e?.code || e}). 인터넷과 Firebase 익명 로그인 설정을 확인해 주세요.`); }
}

/** 로그인 후 세션 코드가 실제로 있는지 확인 (없으면 안내 화면) */
export async function requireSession(code) {
  if (!code) fatal('세션 코드가 없어요. 처음 화면에서 코드를 넣어 주세요.');
  await signInAnon();
  let ok;
  try { ok = await sessionExists(code); } catch (e) { fatal(`서버에 연결하지 못했어요 (${e?.code || e}). 인터넷과 config.js 설정을 확인해 주세요.`); }
  if (!ok) fatal(`${code} 세션을 찾을 수 없어요. 교사 화면의 코드를 다시 확인해 주세요.`);
  try { localStorage.setItem('e30:lastCode', code); } catch {}
  return code;
}

/** 저장이 보안 규칙에 막히면 토스트로 알려 줌 (같은 알림은 3초에 한 번) */
export function errorToasts() {
  let last = 0;
  addEventListener('store-error', (e) => {
    if (Date.now() - last < 3000) return;
    last = Date.now();
    const denied = /PERMISSION_DENIED|permission/i.test(e.detail.code);
    toast('⚠️', denied ? '권한이 없어 저장하지 못했어요' : `저장하지 못했어요 (${e.detail.code})`);
  });
}

export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function initialControl(L) {
  const ms = L.makeTimerMinutes * 60000;
  return {
    stage: L.stages[0].id,
    timer: { total: ms, endAt: 0, remain: ms, running: false },
    quiz: { open: false, revealed: false },
    premiere: { startedAt: 0 },
    gauge: { v: L.gauge.start, heartsApplied: 0, appHeartCells: 0 },
  };
}

/** 지금 장면: control/scene이 없거나 단계와 안 맞으면 그 단계의 첫 장면 */
export function sceneOf(L, c) {
  const stage = c?.stage || L.stages[0].id;
  const s = L.scenes.find((x) => x.id === c?.scene);
  return s && s.stage === stage ? s : L.scenes.find((x) => x.stage === stage) || L.scenes[0];
}

/** 제작 타이머: endAt(서버 시각)만 저장하고 화면마다 남은 시간을 계산 */
export function timerState(c, now) {
  const t = { total: 0, endAt: 0, remain: 0, running: false, ...(c?.timer || {}) };
  const left = t.running ? Math.max(0, t.endAt - now) : (t.remain ?? t.total);
  return { ...t, left, elapsed: t.total - left, fired: t.fired || {} };
}
export const cueKey = (c) => 'm' + c.at;
export function nextCue(L, elapsedMs) { return L.cues.find((c) => c.at * 60000 > elapsedMs + 500) || null; }

/** 퀴즈 판: keepSkip은 카드마다 한 판(1A, 1B), AB는 한 판(2) */
export function polls(L) {
  const out = [];
  L.quiz.forEach((q) => {
    if (q.mode === 'keepSkip') q.cards.forEach((c) => out.push({ id: `${q.round}${c.id}`, q, cards: [c], options: q.options, label: `${q.title} · 카드 ${c.id}` }));
    else out.push({ id: String(q.round), q, cards: q.cards, options: q.options, label: q.title });
  });
  return out;
}

/** 프리미어: startedAt 하나로 3·2·1 → 팀 소개 → 상영 → 비하인드 → 끝을 계산 */
export function premSeq(P) { return [['count', P.countdown], ['intro', P.introSec], ['play', P.playSec], ['behind', P.behindSec]]; }
export function premPhase(prem, now, P) {
  if (!prem?.teamId) return null;
  let t = Math.max(0, (now - (prem.startedAt || 0)) / 1000);
  for (const [phase, dur] of premSeq(P)) {
    if (t < dur) return { phase, left: Math.ceil(dur - t), dur };
    t -= dur;
  }
  return { phase: 'done', left: 0, dur: 0 };
}
export function premOffset(P, phase) {
  let s = 0;
  for (const [p, dur] of premSeq(P)) { if (p === phase) return s; s += dur; }
  return s;
}
export const PHASE_NAME = { count: '카운트다운', intro: '팀 소개', play: '상영 중', behind: '비하인드', done: '끝' };

/** 지구 회복 게이지 칸 (기존 도구판의 게이지 셀) */
export function gaugeCells(v, L) {
  const g = L.gauge;
  return Array.from({ length: g.max }, (_, i) => `<div class="cell${i < v ? ' on' : ''}${i === g.goal - 1 ? ' line80' : ''}" data-i="${i}"></div>`).join('');
}
export function flashCells(root, from, to) {
  $$('.cell', root).forEach((c) => { const i = +c.dataset.i; if (i >= from && i < to) c.classList.add('new'); });
}
export const gaugeV = (c, L) => c?.gauge?.v ?? L.gauge.start;

/** 게이지가 오르면 onUp, 목표·최대를 넘기면 축하 화면 */
export function gaugeWatcher(L, onUp) {
  let prev = null;
  return (v) => {
    if (prev !== null && v !== prev) {
      if (v > prev) onUp?.(prev, v);
      if (prev < L.gauge.max && v >= L.gauge.max) celebrate(L, true);
      else if (prev < L.gauge.goal && v >= L.gauge.goal) celebrate(L, false);
    }
    prev = v;
  };
}

let celeT;
export function celebrate(L, full) {
  let c = $('#cele');
  if (!c) { c = document.createElement('div'); c.id = 'cele'; c.className = 'celebrate'; document.body.append(c); }
  sfx.fanfare(); burst(260);
  c.hidden = false;
  c.innerHTML = `<div><div class="earth-big">🌍</div><h3>${full ? '지구 완전 회복! 💯' : '지구 회복 성공! 🌍'}</h3><p>${esc(full ? L.gauge.celebrate100 : L.gauge.celebrate80)}</p><button class="btn cue" data-x>고마워, 어스!</button></div>`;
  c.querySelector('[data-x]').onclick = () => (c.hidden = true);
  clearTimeout(celeT);
  celeT = setTimeout(() => (c.hidden = true), 15000);
}

/** 폰 알림 배너 (기존 도구판의 토스트). 5초 뒤 사라짐 */
let toastT, lastAlertId = null;
export function toast(icon, msg) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    t.innerHTML = '<div class="ic"></div><div><div class="app"><span>지구 탐험대 스튜디오</span><span>지금</span></div><div class="msg"></div></div>';
    t.onclick = () => t.classList.remove('show');
    document.body.append(t);
  }
  $('.ic', t).textContent = icon || '🔔';
  $('.msg', t).textContent = msg;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  sfx.ding();
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 5000);
}
/** control/alert가 새로 바뀌면 토스트. 오래된 알림(15초 이상)은 다시 띄우지 않음. 새 알림이면 true */
export function showAlert(a, now) {
  if (!a || a.id === lastAlertId) return false;
  lastAlertId = a.id;
  if (now - (a.at || 0) > 15000) return false;
  toast(a.icon, a.msg);
  return true;
}

export function connBadge(el) {
  store.onConnection((ok) => {
    el.className = 'conn ' + (ok ? 'ok' : 'bad');
    el.textContent = ok ? (store.isDemo ? '● 데모 연결' : '● 연결됨') : '● 끊김 · 다시 연결 중';
  });
}
export function soundButton(el) {
  const paint = () => { el.textContent = isSoundOn() ? '🔊' : '🔇'; el.setAttribute('aria-pressed', isSoundOn()); el.title = '소리 켜기/끄기'; };
  el.onclick = () => { unlockAudio(); setSound(!isSoundOn()); paint(); if (isSoundOn()) sfx.ding(); };
  paint();
  document.addEventListener('pointerdown', unlockAudio);
}

/** 팀 칩 안쪽: 목표 번호 + 학교·팀 이름 (기존 도구판의 팀 칩) */
export function teamChip(t) {
  return `<span class="no" style="background:${t.color}">${t.goal}</span><span>${esc(t.school)} ${esc(t.name)}<small>${esc(t.goalName)}</small></span>`;
}
