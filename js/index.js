// 시작 화면: 역할 고르기 + 세션 코드
import * as store from './store.js';
import { FIREBASE_CONFIG } from '../config.js';
import { $, esc, loadData, sessionExists } from './ui.js';

const { T, L } = await loadData();
$('#title').textContent = L.title;
$('#sub').textContent = `${L.date} · ${L.totalMinutes}분 · ${T.schools.map((s) => s.name).join(' · ')}`;
$('#mode').innerHTML = store.isDemo
  ? `🧪 데모 모드 — 이 컴퓨터의 탭끼리만 연결돼요. 교사 탭에서 새 수업을 만든 뒤, 같은 코드로 학교 화면·팀 탭을 열어 보세요.${FIREBASE_CONFIG ? ' <a href="index.html?demo=0">실시간 모드로 돌아가기</a>' : ''}`
  : `🔥 실시간 모드 — 세 학교의 모든 기기가 같은 수업으로 연결돼요.${store.canDemo ? ' <a href="index.html?demo=1">이 컴퓨터에서 데모로 시험하기</a>' : ''}`;
const signedIn = store.ready().catch((e) => { $('#err').textContent = `서버에 연결하지 못했어요 (${e?.code || e}). 인터넷과 Firebase 설정을 확인해 주세요.`; });

const codeEl = $('#code');
codeEl.value = localStorage.getItem('e30:lastCode') || '';
const err = (m) => { $('#err').textContent = m; };

async function checked() {
  const c = codeEl.value.trim().toUpperCase();
  if (!c) { err('세션 코드를 넣어 주세요.'); codeEl.focus(); return null; }
  await signedIn;
  let ok = false;
  try { ok = await sessionExists(c); } catch (e) { err(`서버에서 읽지 못했어요 (${e?.code || e}).`); return null; }
  if (!ok) { err(`${c} 세션이 없어요. 교사 화면에 보이는 코드를 확인해 주세요.`); return null; }
  localStorage.setItem('e30:lastCode', c);
  return c;
}

$('#tNew').onclick = () => { location.href = 'teacher.html?new=1'; };
$('#tGo').onclick = async () => { const c = await checked(); if (c) location.href = `teacher.html?code=${c}`; };
$('#teamGo').onclick = async () => { const c = await checked(); if (c) location.href = `team.html?code=${c}`; };
$('#obsGo').onclick = async () => { const c = await checked(); if (c) location.href = `observer.html?code=${c}`; };
$('#schools').innerHTML = T.schools.map((s) => `<button class="btn" data-s="${s.id}">${esc(s.name)}</button>`).join('');
$('#schools').onclick = async (e) => {
  const b = e.target.closest('[data-s]');
  if (!b) return;
  const c = await checked();
  if (c) location.href = `screen.html?code=${c}&school=${b.dataset.s}`;
};
