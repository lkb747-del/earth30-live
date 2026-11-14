// 학교 화면(교실 TV, 보기 전용): 지금 단계를 크게 보여 준다. 아무것도 쓰지 않는다.
import * as store from './store.js';
import {
  $, esc, nl2br, loadData, params, sum, mmss, timerState, nextCue, polls, premPhase, premOffset, gaugeCells, gaugeV,
  gaugeWatcher, flashCells, showAlert, connBadge, requireSession, sceneOf,
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
let S = {}, lastHtml = '', CLAPS = {};

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

/** 심각도 손가락: 팀마다 처음 → 지금 */
const sevBoard = () => `<div class="s-sev">${ORDER.map((t) => {
  const s = S.teams?.[t.id]?.severity || {};
  const diff = s.before && s.after ? s.after - s.before : null;
  return `<div class="sv" style="--c:${t.color}"><span class="no" style="background:${t.color}">${t.goal}</span><b>${esc(t.name)}</b>
    <span class="n">${s.before ?? '–'}</span><span class="ar">→</span><span class="n now">${s.after ?? '–'}</span><span class="d">${diff ? (diff > 0 ? `▲${diff}` : `▼${-diff}`) : ''}</span></div>`;
}).join('')}</div>`;

const VIEWS = {
  grammar: (c) => {
    const q = c.quiz || {};
    if (q.panel === 'formula') return `<div class="s-list"><div class="kicker">쇼츠 공식</div><ol>${L.formula.map((f) => `<li>${esc(f)}</li>`).join('')}</ol></div>`;
    if (q.panel === 'promises') return `<div class="s-list"><div class="kicker">크리에이터 약속</div><ul>${L.promises.map((f) => `<li>✋ ${esc(f)}</li>`).join('')}</ul></div>`;
    const p = POLLS.find((x) => x.id === q.poll);
    if (!p) return `<div class="s-list"><div class="kicker">${esc(L.quiz[0].title)}</div><h2 class="s-h">${esc(L.quiz[0].ask)}</h2><div class="s-status">곧 시작해요!</div></div>`;
    const votes = S.votes?.[p.id] || {};
    const n = Object.keys(votes).length;
    const reveal = p.q.reveal && p.id === POLLS[POLLS.length - 1].id ? `<div class="s-reveal">${esc(p.q.reveal)}</div>` : '';
    let side;
    // 손 투표(기본): 화면에는 카드와 보기만, 결과는 카메라로 본다
    if (!q.device) side = q.revealed && reveal ? reveal : `<div class="s-status live">${esc(L.quizVote.hand)}</div><div class="s-legend">${p.options.map((o) => esc(o.label)).join(' · ')}</div><div class="s-legend">${esc(L.quizVote.handOrder)}</div>`;
    else if (q.open) side = `<div class="s-status live">🟢 투표 중 · ${n}/${T.teams.length}팀</div>`;
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
      }).join('') + reveal;
    }
    const cards = p.cards.map((cd) => `<div class="qcard"><span class="qid">${esc(cd.id)}</span><p>${nl2br(cd.text)}</p></div>`).join('');
    return `<div class="s-quiz"><div class="qcards">${cards}</div><div class="qside"><div class="kicker">${esc(p.label)}</div><h2>${esc(p.q.ask)}</h2>${side}</div></div>`;
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

  // 배움 정리: 교사가 고른 소단계(reflectStep)마다 화면이 바뀐다
  reflect: (c) => {
    const v = gaugeV(c, L), R = L.reflect;
    const step = c.reflectStep || R.steps[0].id;
    const gauge = `<div>${gaugeBlock(v)}<div class="s-missions">${T.schools.map((s) => `<span class="${S.missions?.[s.id] ? 'on' : ''}">🕵️ ${esc(s.name)}${S.missions?.[s.id] ? ' ✓' : ''}</span>`).join('')}</div>
      ${v >= L.gauge.goal ? `<p class="s-cele">${esc(v >= L.gauge.max ? L.gauge.celebrate100 : L.gauge.celebrate80)}</p>` : ''}</div>`;
    const sev = L.severity;
    if (step === 'severity') return `<div><div class="kicker">🖐 ${esc(sev.title)} · ${esc(sev.beforeLabel)} → ${esc(sev.afterLabel)}</div><h2 class="s-h">${esc(sev.askAfter)}</h2>${sevBoard()}</div>`;
    if (step === 'promise') return `<div class="s-list"><div class="kicker">✍️ ${esc(R.promise.title)}</div><h2 class="s-q">“${esc(R.promise.card)}”</h2><div class="s-status live">${esc(R.promise.note)}</div></div>`;
    if (step === 'stars') return `<div class="s-list"><div class="kicker">⭐ ${esc(R.stars.title)} · ${esc(R.stars.how)}</div><ol>${R.stars.items.map((f) => `<li>${esc(f)}</li>`).join('')}</ol></div>`;
    if (step === 'gauge') return `<div class="s-gauge">${gauge}</div>`;
    if (step === 'next') return `<div class="s-list"><div class="kicker">${esc(R.next.title)}</div><h2 class="s-q">${esc(R.next.text)}</h2></div>`;
    return `<div class="s-reflect"><div><h2 class="s-q">${esc(R.question)}</h2><div class="s-ans">${R.answers.map((a) => `<div>${esc(a)}</div>`).join('')}</div><p class="s-sentence">${esc(R.sentence)}</p></div>${gauge}</div>`;
  },
};

/* ── 장면(슬라이드): lesson.json의 scenes. title·cards는 글만, live는 앱 기능 화면 ── */
const card = (k) => `<div class="sc-card">${k.icon ? `<i>${esc(k.icon)}</i>` : ''}${k.head ? `<b>${esc(k.head)}</b>` : ''}${k.text ? `<span>${esc(k.text)}</span>` : ''}</div>`;
const LIVE = {
  severity: () => {
    const sv = L.severity, n = ORDER.filter((t) => S.teams?.[t.id]?.severity?.before).length;
    return `<div class="sc-cards sev" style="--n:${sv.labels.length}">${sv.labels.map((l, i) => card({ icon: String(sv.min + i), text: l })).join('')}</div>
      <div class="s-next">🖐 모둠 평균을 누른 팀 <b>${n}/${ORDER.length}</b></div>`;
  },
  gauge: (c) => `${gaugeBlock(gaugeV(c, L))}<div class="sc-rules">${L.gauge.rules.map((r) => `<span>${esc(r.label)} = ${r.cells}칸</span>`).join('')}</div>`,
  problem: () => `<h2 class="sc-big">${esc(L.problem)}</h2><div class="sc-cards" style="--n:${L.intro.activities.length}">${L.intro.activities.map((a) => card({ head: a.name, text: a.text })).join('')}</div>`,
  storyboard: () => `<div class="sc-cards sb" style="--n:${L.cuts.length}">${L.cuts.map((ct, i) => card({ icon: ct.sec, head: ct.name, text: (L.prepChecklist[i] || '').split(':').slice(1).join(':').trim() })).join('')}</div>`,
  // 일곱 팀이 고른 훅이 실시간으로 채워지는 표
  hooks: () => `<div class="sc-hooks">${ORDER.map((t) => {
    const h = S.teams?.[t.id]?.hook;
    return `<div class="hk" style="--c:${t.color}"><span class="no" style="background:${t.color}">${t.goal}</span><b>${esc(t.name)}</b><span class="h">${h ? `“${esc(h)}”` : '<span class="muted">고르는 중…</span>'}</span><span class="a">④ ${esc(t.action)}</span></div>`;
  }).join('')}</div>`,
  quiz: (c) => VIEWS.grammar(c),
  make: () => VIEWS.make(),
  premiere: (c) => VIEWS.premiere(c),
  reflect: (c) => VIEWS.reflect(c),
};
function sceneHtml(sc, c) {
  const body = sc.kind === 'title'
    ? `<h1 class="sc-big">${esc(sc.title)}</h1>${sc.sub ? `<p class="sc-sub">${esc(sc.sub)}</p>` : ''}${sc.teams ? `<div class="sc-teams">${ORDER.map((t) => `<span><b class="no" style="background:${t.color}">${t.goal}</b>${esc(t.school)} ${esc(t.name)}</span>`).join('')}</div>` : ''}`
    : sc.kind === 'cards'
      ? `<div class="sc-cards${sc.chain ? ' chain' : ''}" style="--n:${sc.cols || sc.cards.length}">${sc.cards.map(card).join(sc.chain ? '<div class="sc-arrow">→</div>' : '')}</div>`
      : (LIVE[sc.live] || (() => ''))(c);
  // 퀴즈·제작·시사회·정리 화면은 자기 제목이 있어서 장면 틀(theme) 없이 그대로 쓴다
  if (sc.kind === 'live' && !sc.theme) return body;
  const head = (sc.kicker ? `<div class="kicker">${esc(sc.kicker)}</div>` : '') + (sc.title && sc.kind !== 'title' ? `<h2 class="sc-title">${esc(sc.title)}</h2>` : '');
  return `<div class="sc ${sc.theme || 'dark'} k-${sc.kind}">${head}${body}${sc.note ? `<p class="sc-note">${esc(sc.note)}</p>` : ''}</div>`;
}

const watchGauge = gaugeWatcher(L, (from, to) => { sfx.pop(); flashCells($('#view'), from, to); });

function render() {
  const c = S.control || {};
  const st = L.stages.find((s) => s.id === c.stage) || L.stages[0];
  const sc = sceneOf(L, c);
  $('#stageName').innerHTML = `<small>${L.scenes.indexOf(sc) + 1}/${L.scenes.length}</small>${esc(st.name)}`;
  const html = sceneHtml(sc, c);
  if (html !== lastHtml) { $('#view').innerHTML = html; lastHtml = html; }
  watchGauge(gaugeV(c, L));
  showAlert(c.alert, now());
  tick();
}

/* 팀 영상: 교사가 승인한 영상만. 3·2·1 동안 미리 불러 두고, 상영이 시작되면 모든 TV가 같은 시각에 맞춰 튼다 */
const vids = new Map();
function approvedVideo(t, c) {
  const v = S.teams?.[t.id]?.video;
  return v && c.videoOk?.[t.id] === v.at ? v : null;
}
async function prepVideo(t, c) {
  const v = approvedVideo(t, c);
  if (!v) return null;
  let el = vids.get(t.id);
  if (!el || el.dataset.at !== String(v.at)) {
    el = Object.assign(document.createElement('video'), { preload: 'auto', playsInline: true });
    el.dataset.at = v.at;
    vids.set(t.id, el);
    el.src = await store.fileSrc(v.url);
  }
  return el;
}
/** 상영 시작 후 지난 초에 맞춰 재생 위치를 맞춘다. 소리가 막히면 소리 없이 틀고 '눌러 주세요' 안내 */
function syncVideo(el, sec) {
  if (sec < 0 || el.ended || sec >= (el.duration || Infinity)) return;
  if (el.readyState >= 1 && Math.abs(el.currentTime - sec) > 1.2) el.currentTime = sec;
  if (el.paused && !el.dataset.starting) {
    el.dataset.starting = '1';
    el.muted = false;
    el.play().catch(() => { el.muted = true; $('#vhint')?.removeAttribute('hidden'); return el.play().catch(() => {}); })
      .finally(() => { delete el.dataset.starting; });
  }
}
const pauseVideos = () => vids.forEach((el) => { if (!el.paused) el.pause(); });
$('#stage').addEventListener('click', () => { vids.forEach((el) => { el.muted = false; }); $('#vhint')?.setAttribute('hidden', ''); });

/* 프리미어 무대 (기존 도구판의 연출을 모든 화면이 같은 startedAt으로 따라 하게 바꿈) */
let premKey = '', lastHearts = 0;
function tickPrem(c) {
  const pr = c.premiere || {};
  // 무대는 시사회 장면에서만 (반응 안내 장면으로 넘기면 내려간다)
  const ph = c.stage === 'premiere' && sceneOf(L, c).live === 'premiere' ? premPhase(pr, now(), P) : null;
  const st = $('#stage');
  if (!ph) { st.hidden = true; premKey = ''; pauseVideos(); return false; }
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
    const react = `<div class="react"><span>💖 <b data-r="hearts">${hearts}</b></span>${P.feedback.map((f) => `<span>${esc(f.label.split(' ')[0])} <b data-r="${f.id}">${fb[f.id]}</b></span>`).join('')}${L.observer.clapOnTV ? `<span>👏 <b data-r="claps">${sum(CLAPS[t.id])}</b></span>` : ''}</div>`;
    let html = '';
    if (ph.phase === 'count') { html = `<div class="count">${ph.left}</div>`; sfx.beep(); }
    if (ph.phase === 'intro') { html = card(`<div class="phase-label">● PREMIERE</div><div class="goal">${t.goal}</div><div class="tname">${esc(t.name)}</div><div class="sub">${esc(t.school)} · ${esc(t.goalName)}</div>`); if (first) sfx.go(); }
    const video = approvedVideo(t, c);
    if (ph.phase === 'count' || ph.phase === 'intro') prepVideo(t, c);
    if (ph.phase !== 'play') pauseVideos();
    if (ph.phase === 'play' && video) {
      html = `<div class="vplay" style="--c:${t.color}"><div class="vbox" id="vbox"></div>
        <div class="card"><div class="phase-label">● NOW SHOWING</div><div class="tname">${esc(t.name)}</div><div class="sub">${esc(t.school)} · ${esc(t.goalName)}</div>
        <div class="ring" id="ring"><span id="ringN"></span></div>${react}<p class="vhint" id="vhint" hidden>${esc(L.video.tapForSound)}</p></div></div>`;
      prepVideo(t, c).then((el) => { const box = $('#vbox', st); if (el && box && !box.contains(el)) box.replaceChildren(el); });
    } else if (ph.phase === 'play') html = card(`<div class="phase-label">● NOW SHOWING</div><div class="ring" id="ring"><span id="ringN"></span></div><div class="sub">${esc(t.school)} ${esc(t.name)} · 기기 화면으로 재생 중</div>${react}`);
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
    $('[data-r="claps"]', st)?.replaceChildren(String(sum(CLAPS[t.id])));
    P.feedback.forEach((f) => { $(`[data-r="${f.id}"]`, st).textContent = fb[f.id]; });
    if (hearts > lastHearts) sfx.heart();
  }
  lastHearts = hearts;
  if (ph.phase === 'play') {
    const el = vids.get(t.id);
    if (el && $('#vbox', st)?.contains(el)) syncVideo(el, (now() - (pr.startedAt || 0)) / 1000 - premOffset(P, 'play'));
  }
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
  // 제작 중 다른 장면을 띄워도 위쪽에 남은 시간이 보이게
  const mini = $('#miniClock');
  mini.hidden = !t.running || !!clock;
  if (!mini.hidden) mini.textContent = `⏱ ${mmss(t.left)}`;
  const live = tickPrem(c);
  $('#onair').classList.toggle('live', t.running || live);
}

store.watch(base, (v) => { S = v || {}; render(); });
// 참관석 박수 (lesson.json observer.clapOnTV가 true일 때 시사회 무대에 표시)
store.watch(`observers/${code}/claps`, (v) => { CLAPS = v || {}; });
setInterval(tick, 250);
