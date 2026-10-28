// 학교 화면(교실 TV, 보기 전용): 지금 단계를 크게 보여 준다. 아무것도 쓰지 않는다.
import * as store from './store.js';
import {
  $, esc, nl2br, loadData, params, sum, mmss, timerState, nextCue, polls, premPhase, gaugeCells, gaugeV,
  gaugeWatcher, flashCells, showAlert, connBadge, requireSession,
} from './ui.js';
import { sfx, unlockAudio } from './sfx.js';
import { burst } from './confetti.js';

const { T, L } = await loadData();
const school = T.schools.find((s) => s.id === params.get('school')) || T.schools[0];
const code = await requireSession((params.get('code') || '').toUpperCase());
const base = `sessions/${code}`;
const P = L.premiere, POLLS = polls(L), now = store.serverNow;
const ORDER = T.premiereOrder.map((id) => T.teams.find((t) => t.id === id));
const MINE = T.teams.filter((t) => t.schoolId === school.id);
let S = {}, lastHtml = '';

$('#schoolName').textContent = school.name;
document.title = `${school.name} 화면 · ${L.title}`;
connBadge($('#conn'));
$('#start').onclick = () => {
  unlockAudio(); sfx.ding();
  $('#start').hidden = true;
  document.documentElement.requestFullscreen?.().catch(() => {});
};

const gaugeBlock = (v) => `<div class="gwrap"><div class="cells">${gaugeCells(v, L)}</div>
  <div class="gside"><div class="earth">🌍</div><div class="big">${v}<small>/${L.gauge.max}</small></div><div class="muted">목표 ${L.gauge.goal}칸</div></div></div>`;

const VIEWS = {
  intro: (c) => `<div class="s-intro"><div>
      <div class="kicker">${esc(L.date)} · ${esc(T.schools.map((s) => s.name).join(' · '))}</div>
      <h2 class="s-title">${esc(L.title)}</h2>
      <div class="s-problem"><span class="tag">배움 문제</span><br>${esc(L.problem)}</div>
    </div><div>${gaugeBlock(gaugeV(c, L))}</div></div>`,

  grammar: (c) => {
    const q = c.quiz || {};
    if (q.panel === 'formula') return `<div class="s-list"><div class="kicker">쇼츠 공식</div><ol>${L.formula.map((f) => `<li>${esc(f)}</li>`).join('')}</ol></div>`;
    if (q.panel === 'promises') return `<div class="s-list"><div class="kicker">크리에이터 약속</div><ul>${L.promises.map((f) => `<li>✋ ${esc(f)}</li>`).join('')}</ul></div>`;
    const p = POLLS.find((x) => x.id === q.poll);
    if (!p) return `<div class="s-list"><div class="kicker">${esc(L.quiz[0].title)}</div><h2 class="s-h">${esc(L.quiz[0].ask)}</h2><div class="s-status">곧 시작해요! 팀 기기를 준비해 주세요 📱</div></div>`;
    const votes = S.votes?.[p.id] || {};
    const n = Object.keys(votes).length;
    let side;
    if (q.open) side = `<div class="s-status live">🟢 투표 중 · ${n}/${T.teams.length}팀</div>`;
    else if (!q.revealed) side = `<div class="s-status">🔒 마감! 결과는 잠시 후 공개</div>`;
    else {
      // 학교마다 한 줄. 막대 옆에는 보기의 첫 글자(✋·👉·A·B)만, 뜻은 위에 한 번만 적는다
      const short = (o) => o.label.split(' ')[0];
      const legend = p.options.some((o) => short(o) !== o.label) ? `<div class="s-legend">${p.options.map((o) => esc(o.label)).join(' · ')}</div>` : '';
      side = legend + T.schools.map((s) => {
        const ts = T.teams.filter((t) => t.schoolId === s.id);
        return `<div class="brow"><b>${esc(s.name)}</b>${p.options.map((o) => {
          const k = ts.filter((t) => votes[t.id] === o.id).length;
          return `<div class="bar2"><span>${esc(short(o))}</span><div class="track"><span style="width:${ts.length ? (k / ts.length) * 100 : 0}%"></span></div><b>${k}</b></div>`;
        }).join('')}</div>`;
      }).join('') + (p.q.reveal && p.id === POLLS[POLLS.length - 1].id ? `<div class="s-reveal">${esc(p.q.reveal)}</div>` : '');
    }
    const cards = p.cards.map((cd) => `<div class="qcard"><span class="qid">${esc(cd.id)}</span><p>${nl2br(cd.text)}</p></div>`).join('');
    return `<div class="s-quiz"><div class="qcards">${cards}</div><div class="qside"><div class="kicker">${esc(p.label)}</div><h2>${esc(p.q.ask)}</h2>${side}</div></div>`;
  },

  // 팀이 많은 학교(의령초 5팀)는 2열로, 재료 칩은 번호만 이름 줄 오른쪽에
  plan: () => {
    const many = MINE.length > 2;
    return `<div>${many ? '' : '<div class="kicker">훅 슬롯 · 훅 고르기 · 4컷 재료</div>'}<h2 class="s-h">우리 학교 팀의 첫 3초</h2>
    <div class="s-hooks">${MINE.map((t) => {
      const d = S.teams?.[t.id] || {};
      const chips = `<div class="pchips">${L.prepChecklist.map((x, i) => { const name = x.split(':')[0]; return `<span class="${d.prep?.['c' + (i + 1)] ? 'on' : ''}" title="${esc(name)}">${esc(many ? name.split(' ')[0] : name)}</span>`; }).join('')}</div>`;
      return `<div class="s-hook" style="--c:${t.color}"><div class="who"><span class="no" style="background:${t.color}">${t.goal}</span>${esc(t.name)}${many ? chips : ''}</div>
        <div class="h">${d.hook ? `“${esc(d.hook)}”` : '<span class="muted">훅 고르는 중… 🎰</span>'}</div>${many ? '' : chips}</div>`;
    }).join('')}</div></div>`;
  },

  make: () => `<div class="s-make"><div><div class="clock xl" id="clock"></div><div class="bar"><span id="bar"></span></div><div class="s-next" id="nextCue"></div></div>
    <div class="s-prog">${MINE.map((t) => {
      const d = S.teams?.[t.id] || {};
      return `<div class="p" style="--c:${t.color}"><b>${esc(t.name)}</b><div class="row">${L.cuts.map((c) => `<span class="cut ${d.progress?.[c.id] ? 'on' : ''}">${esc(c.name.split(' ')[0])}</span>`).join('')}${d.uploaded ? '<span class="up">📤 업로드</span>' : ''}</div></div>`;
    }).join('')}</div></div>`,

  premiere: (c) => {
    const done = c.premDone || {};
    const nx = ORDER.find((t) => !done[t.id]);
    return `<div><div class="kicker">실시간 시사회</div><h2 class="s-h">${nx ? `다음 상영: ${esc(nx.school)} ${esc(nx.name)}` : '모든 팀 상영 끝! 👏'}</h2>
      <div class="s-order">${ORDER.map((t, i) => `<div class="o ${done[t.id] ? 'done' : ''} ${t === nx ? 'next' : ''}"><span class="idx">${i + 1}</span><span class="no" style="background:${t.color}">${t.goal}</span>${esc(t.school)} ${esc(t.name)}<span class="hs">${done[t.id] ? `💖 ${sum(S.hearts?.[t.id])} ✓` : ''}</span></div>`).join('')}</div></div>`;
  },

  reflect: (c) => {
    const v = gaugeV(c, L), R = L.reflect;
    return `<div class="s-reflect"><div><h2 class="s-q">${esc(R.question)}</h2><div class="s-ans">${R.answers.map((a) => `<div>${esc(a)}</div>`).join('')}</div><p class="s-sentence">${esc(R.sentence)}</p></div>
      <div>${gaugeBlock(v)}<div class="s-missions">${T.schools.map((s) => `<span class="${S.missions?.[s.id] ? 'on' : ''}">🕵️ ${esc(s.name)}${S.missions?.[s.id] ? ' ✓' : ''}</span>`).join('')}</div>
      ${v >= L.gauge.goal ? `<p class="s-cele">${esc(v >= L.gauge.max ? L.gauge.celebrate100 : L.gauge.celebrate80)}</p>` : ''}</div></div>`;
  },
};

const watchGauge = gaugeWatcher(L, (from, to) => { sfx.pop(); flashCells($('#view'), from, to); });

function render() {
  const c = S.control || {};
  const st = L.stages.find((s) => s.id === c.stage) || L.stages[0];
  const idx = L.stages.indexOf(st);
  $('#stageName').innerHTML = `<small>${idx + 1}/${L.stages.length}</small>${esc(st.name)}`;
  const html = (VIEWS[st.id] || VIEWS.intro)(c);
  if (html !== lastHtml) { $('#view').innerHTML = html; lastHtml = html; }
  watchGauge(gaugeV(c, L));
  showAlert(c.alert, now());
  tick();
}

/* 프리미어 무대 (기존 도구판의 연출을 모든 화면이 같은 startedAt으로 따라 하게 바꿈) */
let premKey = '', lastHearts = 0;
function tickPrem(c) {
  const pr = c.premiere || {};
  const ph = c.stage === 'premiere' ? premPhase(pr, now(), P) : null;
  const st = $('#stage');
  if (!ph) { st.hidden = true; premKey = ''; return false; }
  const t = T.teams.find((x) => x.id === pr.teamId);
  const done = c.premDone || {};
  const nx = ORDER.slice(ORDER.indexOf(t) + 1).find((x) => !done[x.id]) || ORDER.find((x) => !done[x.id] && x.id !== t.id);
  const hearts = sum(S.hearts?.[t.id]);
  const fb = Object.fromEntries(P.feedback.map((f) => [f.id, Object.values(S.feedback?.[t.id] || {}).filter((x) => x?.[f.id]).length]));
  const key = `${t.id}|${pr.startedAt}|${ph.phase}${ph.phase === 'count' ? ph.left : ''}`;
  if (key !== premKey) {
    const first = !premKey.startsWith(`${t.id}|${pr.startedAt}|${ph.phase}`);
    premKey = key;
    lastHearts = hearts;
    const card = (inner) => `<div class="card" style="--c:${t.color}">${inner}</div>`;
    const react = `<div class="react"><span>💖 <b data-r="hearts">${hearts}</b></span>${P.feedback.map((f) => `<span>${esc(f.label.split(' ')[0])} <b data-r="${f.id}">${fb[f.id]}</b></span>`).join('')}</div>`;
    let html = '';
    if (ph.phase === 'count') { html = `<div class="count">${ph.left}</div>`; sfx.beep(); }
    if (ph.phase === 'intro') { html = card(`<div class="phase-label">● PREMIERE</div><div class="goal">${t.goal}</div><div class="tname">${esc(t.name)}</div><div class="sub">${esc(t.school)} · ${esc(t.goalName)}</div>`); if (first) sfx.go(); }
    if (ph.phase === 'play') html = card(`<div class="phase-label">● NOW SHOWING</div><div class="ring" id="ring"><span id="ringN"></span></div><div class="sub">${esc(t.school)} ${esc(t.name)} · 패들렛에서 재생 중</div>${react}`);
    if (ph.phase === 'behind') html = card(`<div class="phase-label">● BEHIND</div><div class="ring" id="ring"><span id="ringN"></span></div><div class="sub">만든 사람의 한마디 · “${esc(t.action)}”</div>${react}`);
    if (ph.phase === 'done') { html = card(`<div class="tname" style="color:var(--cue)">👏 박수!</div><div class="sub">${esc(t.name)} · 💖 ${hearts}</div>${nx ? `<div class="sub">다음 상영: ${esc(nx.school)} ${esc(nx.name)}</div>` : ''}`); if (first) { sfx.fanfare(); burst(160); } }
    st.innerHTML = html;
    st.hidden = false;
  }
  const ring = $('#ring', st);
  if (ring) {
    ring.style.setProperty('--p', (ph.left / ph.dur) * 100);
    const n = $('#ringN', st);
    if (n.textContent !== String(ph.left)) { n.textContent = ph.left; if (ph.left <= 3) sfx.tick(); }
    $('[data-r="hearts"]', st).textContent = hearts;
    P.feedback.forEach((f) => { $(`[data-r="${f.id}"]`, st).textContent = fb[f.id]; });
    if (hearts > lastHearts) sfx.heart();
  }
  lastHearts = hearts;
  return ph.phase !== 'done';
}

function tick() {
  const c = S.control || {};
  const t = timerState(c, now());
  const clock = $('#clock');
  if (clock) {
    clock.textContent = mmss(t.left);
    clock.classList.toggle('warn', t.left <= 5 * 60000);
    $('#bar').style.width = `${t.total ? Math.min(100, (t.elapsed / t.total) * 100) : 0}%`;
    const nc = nextCue(L, t.elapsed);
    const txt = nc ? `다음 알림 <b>${nc.at}분</b> ${esc(nc.icon)} ${esc(nc.msg)}` : (t.left <= 0 ? '제작 시간 끝!' : '');
    if ($('#nextCue').innerHTML !== txt) $('#nextCue').innerHTML = txt;
  }
  const live = tickPrem(c);
  $('#onair').classList.toggle('live', t.running || live);
}

store.watch(base, (v) => { S = v || {}; render(); });
setInterval(tick, 250);
