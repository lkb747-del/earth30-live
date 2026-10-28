// 팀 화면(아이북): 자기 팀 칸(teams/{teamId})과 투표·하트·피드백만 쓴다.
import * as store from './store.js';
import {
  $, $$, esc, loadData, params, mmss, timerState, nextCue, polls, premPhase, gaugeCells, gaugeV,
  gaugeWatcher, flashCells, showAlert, toast, connBadge, soundButton, teamChip, signInAnon, sessionExists, errorToasts,
} from './ui.js';
import { sfx, unlockAudio } from './sfx.js';
import { burst } from './confetti.js';

const { T, L } = await loadData();
const P = L.premiere, POLLS = polls(L), now = store.serverNow;
const ORDER = T.premiereOrder.map((id) => T.teams.find((t) => t.id === id));
const MAX_SPINS = L.hookSlot.maxSpins;
let me, base, tb, S = {}, lastHtml = '', spinning = false, sosOpen = false;
const received = [];

$('#title').textContent = L.title;
document.addEventListener('pointerdown', unlockAudio);

/* ── 입장: 세션 코드 + 팀 + PIN ── */
await signInAnon();
errorToasts();
const saved = (() => { try { return JSON.parse(sessionStorage.getItem('e30:team')); } catch { return null; } })();
const code0 = (params.get('code') || saved?.code || localStorage.getItem('e30:lastCode') || '').toUpperCase();
const registered = saved && saved.code === code0 && (await store.get(`members/${code0}/${saved.team}/${store.uid()}`).catch(() => null));
if (registered) start(saved.code, saved.team);
else showJoin();

function showJoin() {
  let pick = params.get('team') || null;
  $('#join').hidden = false;
  $('#jCode').value = code0;
  const paint = () => {
    $('#jTeams').innerHTML = ORDER.map((t) => `<button type="button" class="team" data-t="${t.id}" style="--c:${t.color}" aria-pressed="${pick === t.id}">${teamChip(t)}</button>`).join('');
  };
  paint();
  $('#jTeams').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { pick = b.dataset.t; paint(); $('#jPin').focus(); } };
  $('#join').onsubmit = async (e) => {
    e.preventDefault();
    const err = (m) => { $('#jErr').textContent = m; };
    const c = $('#jCode').value.trim().toUpperCase(), pin = $('#jPin').value.trim();
    if (!c) return err('세션 코드를 넣어 주세요.');
    if (!(await sessionExists(c).catch(() => false))) return err(`${c} 세션이 없어요. 선생님께 코드를 다시 물어봐요.`);
    if (!pick) return err('우리 팀을 골라 주세요.');
    if (!/^\d{4}$/.test(pin)) return err('PIN 4자리 숫자를 넣어 주세요.');
    const wrong = () => err('PIN이 달라요. 선생님께 받은 번호를 확인해요.');
    // 데모는 여기서 PIN을 비교하고, Firebase는 보안 규칙이 PIN이 다르면 members 쓰기를 막는다.
    if (store.isDemo && String(await store.get(`pins/${c}/${pick}`)) !== pin) return wrong();
    if (!(await store.set(`members/${c}/${pick}/${store.uid()}`, pin, { quiet: true }))) return wrong();
    sessionStorage.setItem('e30:team', JSON.stringify({ code: c, team: pick }));
    localStorage.setItem('e30:lastCode', c);
    $('#join').hidden = true;
    history.replaceState(null, '', `team.html?code=${c}`);
    start(c, pick);
  };
}

function start(code, teamId) {
  me = T.teams.find((t) => t.id === teamId);
  base = `sessions/${code}`;
  tb = `${base}/teams/${me.id}`;
  document.title = `${me.name} · ${L.title}`;
  $('#app').hidden = false;
  $('#me').style.setProperty('--c', me.color);
  $('#me').innerHTML = teamChip(me);
  connBadge($('#conn'));
  soundButton($('#snd'));
  store.presence(`${tb}/online`);
  store.watch(base, (v) => { S = v || {}; render(); });
  setInterval(tick, 250);
}

const my = () => S.teams?.[me.id] || {};

/* ── 단계별 화면 ── */
const VIEWS = {
  intro: () => `<div class="m-hero" style="--c:${me.color}"><div class="goal">${me.goal}</div><div class="tname">${esc(me.name)}</div>
    <div class="sub">${esc(me.school)} · ${esc(me.goalName)}</div><p class="m-wait">곧 시작해요!</p><p class="m-problem">${esc(L.problem)}</p></div>`,

  grammar: (c) => {
    const q = c.quiz || {};
    const p = POLLS.find((x) => x.id === q.poll);
    if (!p || q.panel) return `<div class="m-box">📺 학교 화면을 봐 주세요<small>${p ? '' : '퀴즈가 열리면 여기에 버튼이 나와요'}</small></div>`;
    const mine = S.votes?.[p.id]?.[me.id];
    const note = q.open ? (mine ? '다시 누르면 바꿀 수 있어요' : '하나를 눌러 주세요') : (mine ? '🔒 마감! 학교 화면을 봐 주세요' : '🔒 마감됐어요');
    return `<div class="m-quiz"><div class="kicker">${esc(p.label)}</div><h2>${esc(p.q.ask)}</h2>
      <div class="m-vote">${p.options.map((o) => `<button class="vbtn ${mine === o.id ? 'on' : ''}" data-act="vote" data-v="${o.id}" ${q.open ? '' : 'disabled'}>${esc(o.label)}</button>`).join('')}</div>
      <p class="m-note">${note}</p></div>`;
  },

  plan: () => {
    const d = my(), spins = d.spins || 0;
    const spun = Object.keys(d.spun || {}).sort().map((k) => d.spun[k]);
    const shown = d.hook || spun[spun.length - 1] || '🎰 레버를 당겨요';
    return `<div class="m-two"><section class="m-card"><h3>🎰 훅 슬롯</h3>
        <div class="reel"><div class="window"></div><div class="strip" id="strip"><div></div><div>${esc(shown)}</div><div></div></div></div>
        <button class="spin" data-act="spin" ${spins >= MAX_SPINS ? 'disabled' : ''}>레버 당기기 🎰<small>${MAX_SPINS - spins}번 남음</small></button>
        ${spun.length ? `<h3>하나 고르기</h3><div class="picks">${spun.map((h) => `<button class="pick ${d.hook === h ? 'on' : ''}" data-act="hook" data-h="${esc(h)}">${d.hook === h ? '✅ ' : ''}“${esc(h)}”</button>`).join('')}</div>` : ''}
      </section><section class="m-card"><h3>🧺 4컷 재료 준비</h3>
        ${L.prepChecklist.map((x, i) => `<button class="check ${d.prep?.['c' + (i + 1)] ? 'on' : ''}" data-act="prep" data-k="c${i + 1}">${esc(x)}</button>`).join('')}
      </section></div>`;
  },

  make: () => {
    const d = my(), sos = d.sos && !d.sos.resolved;
    return `<div class="m-two"><section class="m-card m-timer"><h3>⏱ 제작 시간</h3><div class="clock" id="clock"></div><div class="bar"><span id="bar"></span></div>
        <div class="m-next" id="nextCue"></div>
        ${received.length ? `<h3>🔔 받은 알림</h3><div class="m-alerts">${received.slice(-3).reverse().map((a) => `<div>${esc(a.icon)} ${esc(a.msg)}</div>`).join('')}</div>` : ''}
      </section><section class="m-card"><h3>🎬 컷 진행</h3>
        ${L.cuts.map((c) => `<button class="check ${d.progress?.[c.id] ? 'on' : ''}" data-act="cut" data-k="${c.id}">${esc(c.name)}<small>${esc(c.sec)}</small></button>`).join('')}
        <button class="btn upl ${d.uploaded ? 'done' : ''}" data-act="upload" ${d.uploaded ? 'disabled' : ''}>${d.uploaded ? '✅ 시사회관 업로드 완료!' : '📤 시사회관 업로드 완료'}</button>
        <button class="btn sosb ${sos ? 'sent' : ''}" data-act="sos">${sos ? `🆘 선생님께 보냈어요 · ${esc(d.sos.q)}` : '🆘 SOS 도움 요청'}</button>
        <p class="muted small" style="margin:0">플랜 B · ${esc(L.planB)}</p>
      </section></div>`;
  },

  premiere: (c) => {
    const pr = c.premiere || {};
    const ph = premPhase(pr, now(), P);
    if (!ph) return `<div class="m-box">🎬 곧 시사회가 시작돼요<small>${esc(ORDER.map((t) => t.name).join(' → '))}</small></div>`;
    const t = T.teams.find((x) => x.id === pr.teamId);
    if (t.id === me.id) return `<div class="m-hero mine" style="--c:${me.color}"><div class="tname">우리 차례!</div><div class="sub">${esc(me.name)} · 카메라 앞에서 비하인드 한마디 준비 🎤</div></div>`;
    const h = S.hearts?.[t.id]?.[me.id] || 0, fb = S.feedback?.[t.id]?.[me.id] || {};
    const label = { count: '곧 상영', intro: '곧 상영', play: '지금 상영 중', behind: '비하인드 한마디', done: '상영 끝! 박수 👏' }[ph.phase];
    return `<div class="m-prem"><div class="m-now" style="--c:${t.color}"><span class="no" style="background:${t.color}">${t.goal}</span><div><small>${label}</small><b>${esc(t.school)} ${esc(t.name)}</b></div></div>
      <button class="heart" data-act="heart" ${h >= P.heartsPerTeamPerShow ? 'disabled' : ''} aria-label="하트 보내기">💖<small>${h}/${P.heartsPerTeamPerShow}</small></button>
      <div class="fbs">${P.feedback.map((f) => `<button class="fb ${fb[f.id] ? 'on' : ''}" data-act="fb" data-k="${f.id}">${esc(f.label)}</button>`).join('')}</div></div>`;
  },

  reflect: (c) => {
    const v = gaugeV(c, L), R = L.reflect;
    return `<div class="m-reflect"><h2>${esc(R.question)}</h2><div class="m-ans">${R.answers.map((a) => `<span>${esc(a)}</span>`).join('')}</div>
      <div class="cells">${gaugeCells(v, L)}</div><div class="big">${v}<small>/${L.gauge.max}칸</small></div>
      ${v >= L.gauge.goal ? `<p class="m-cele">${esc(v >= L.gauge.max ? L.gauge.celebrate100 : L.gauge.celebrate80)}</p>` : ''}</div>`;
  },
};

const watchGauge = gaugeWatcher(L, (from, to) => { sfx.pop(); flashCells($('#view'), from, to); });
let sosSeen = null, premKey = '';

function render() {
  const c = S.control || {};
  const st = L.stages.find((s) => s.id === c.stage) || L.stages[0];
  $('#stageName').textContent = st.name;
  if (showAlert(c.alert, now())) { received.push(c.alert); if (received.length > 10) received.shift(); }
  const d = my();
  if (d.sos?.resolved && sosSeen !== d.sos.at) { sosSeen = d.sos.at; toast('🙆', '선생님이 SOS를 확인했어요!'); }
  if (d.sos && !d.sos.resolved) sosSeen = null;
  if (!spinning) {
    const html = (VIEWS[st.id] || VIEWS.intro)(c);
    if (html !== lastHtml) { $('#view').innerHTML = html; lastHtml = html; }
  }
  renderSheet();
  watchGauge(gaugeV(c, L));
  tick();
}

function renderSheet() {
  const show = sosOpen && (S.control?.stage === 'make');
  $('#sheet').hidden = !show;
  if (!show) return;
  const d = my();
  $('#sheet').innerHTML = `<div class="m-card"><h3>🆘 무엇이 어려워요?</h3>
    ${L.sos.map((q, i) => `<button class="btn ${d.sos?.q === q && !d.sos.resolved ? 'cue' : ''}" data-sos="${i}">${esc(q)}</button>`).join('')}
    ${d.sos && !d.sos.resolved ? '<button class="btn" data-sos="cancel">보낸 SOS 취소</button>' : ''}
    <button class="btn" data-sos="close">닫기</button></div>`;
}
$('#sheet').onclick = (e) => {
  const b = e.target.closest('[data-sos]');
  if (!b && e.target !== $('#sheet')) return;
  const k = b?.dataset.sos ?? 'close';
  if (k === 'cancel') store.remove(`${tb}/sos`);
  else if (k !== 'close') { store.set(`${tb}/sos`, { q: L.sos[+k], at: now(), resolved: false }); toast('🆘', '선생님께 보냈어요. 잠깐만 기다려요!'); }
  sosOpen = false;
  renderSheet();
};

/* ── 버튼 ── */
$('#view').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const d = my(), c = S.control || {};
  switch (b.dataset.act) {
    case 'vote': {
      const q = c.quiz || {};
      if (q.open) { store.set(`${base}/votes/${q.poll}/${me.id}`, b.dataset.v); sfx.pop(); }
      break;
    }
    case 'spin': spin(); break;
    case 'hook': store.set(`${tb}/hook`, b.dataset.h); sfx.pop(); break;
    case 'prep': store.set(`${tb}/prep/${b.dataset.k}`, !d.prep?.[b.dataset.k]); break;
    case 'cut': store.set(`${tb}/progress/${b.dataset.k}`, !d.progress?.[b.dataset.k]); if (!d.progress?.[b.dataset.k]) sfx.pop(); break;
    case 'upload':
      if (confirm('패들렛 시사회관에 영상을 올렸나요?')) { store.set(`${tb}/uploaded`, true); sfx.win(); burst(100); }
      break;
    case 'sos': sosOpen = true; renderSheet(); break;
    case 'heart': {
      const id = c.premiere?.teamId;
      const h = S.hearts?.[id]?.[me.id] || 0;
      if (!id || id === me.id || h >= P.heartsPerTeamPerShow) break;
      S.hearts = { ...(S.hearts || {}), [id]: { ...(S.hearts?.[id] || {}), [me.id]: h + 1 } };
      store.set(`${base}/hearts/${id}/${me.id}`, h + 1);
      sfx.heart();
      render();
      break;
    }
    case 'fb': {
      const id = c.premiere?.teamId;
      if (!id || id === me.id) break;
      const cur = S.feedback?.[id]?.[me.id]?.[b.dataset.k];
      store.set(`${base}/feedback/${id}/${me.id}/${b.dataset.k}`, cur ? null : true);
      if (!cur) sfx.pop();
      break;
    }
  }
});

/* 훅 슬롯: 기존 도구판의 슬롯 릴 애니메이션을 가져옴. 팀 후보 3개(2배 가중) + 공통 훅 은행에서 뽑음 */
function spin() {
  const d = my(), spins = d.spins || 0;
  if (spinning || spins >= MAX_SPINS) return;
  spinning = true;
  $$('[data-act="spin"]').forEach((b) => { b.disabled = true; });
  const pool = [...me.hooks, ...me.hooks, ...L.hookBank];
  const any = (a) => a[Math.floor(Math.random() * a.length)];
  const final = Math.random() < 0.6 ? any(me.hooks) : any(pool);
  const items = Array.from({ length: 40 }, () => any(pool));
  items[37] = final;
  const strip = $('#strip');
  strip.style.transition = 'none';
  strip.style.transform = 'translateY(0)';
  strip.innerHTML = items.map((h) => `<div>${esc(h)}</div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    strip.style.transition = 'transform 3.2s cubic-bezier(.12,.75,.15,1)';
    strip.style.transform = `translateY(${-(37 * 70) + 70}px)`;
  }));
  let n = 0;
  const tk = setInterval(() => { sfx.tick(); if (++n > 26) clearInterval(tk); }, 110);
  setTimeout(async () => {
    sfx.win(); burst(80);
    await store.update(tb, { spins: spins + 1, [`spun/s${spins + 1}`]: final, ...(d.hook ? {} : { hook: final }) });
    spinning = false;
    lastHtml = '';
    render();
  }, 3300);
}

function tick() {
  const c = S.control || {};
  const clock = $('#clock');
  if (clock) {
    const t = timerState(c, now());
    clock.textContent = mmss(t.left);
    clock.classList.toggle('warn', t.left <= 5 * 60000);
    $('#bar').style.width = `${t.total ? Math.min(100, (t.elapsed / t.total) * 100) : 0}%`;
    const nc = nextCue(L, t.elapsed);
    const txt = nc ? `다음 알림 · ${nc.at}분` : (t.left <= 0 ? '제작 시간 끝!' : '');
    if ($('#nextCue').textContent !== txt) $('#nextCue').textContent = txt;
  }
  if (c.stage === 'premiere') {
    const ph = premPhase(c.premiere, now(), P);
    const key = ph ? `${c.premiere.teamId}|${ph.phase}` : '';
    if (key !== premKey) { premKey = key; render(); }
  }
}
