// 보안 점검: 익명 팀 기기 한 대로 "하면 안 되는 일"을 시도해서 규칙이 막는지 확인한다. (Firebase 모드 전용)
import * as store from './store.js';
import { $, esc, loadData, params, signInAnon, sessionExists } from './ui.js';

const { T } = await loadData();
const first = T.teams.find((t) => t.id === T.premiereOrder[0]);
const other = T.teams.find((t) => t.id === T.premiereOrder[1]);
$('#pinLabel').textContent = `${first.name} 팀 PIN`;
$('#code').value = (params.get('code') || localStorage.getItem('e30:lastCode') || '').toUpperCase();
if (store.isDemo) $('#err').textContent = '지금은 데모 모드예요. config.js에 Firebase 설정을 넣은 뒤에 쓸 수 있어요.';

const Q = { quiet: true };
const canRead = (p) => store.get(p).then(() => true, () => false);

$('#f').onsubmit = async (e) => {
  e.preventDefault();
  if (store.isDemo) return;
  const code = $('#code').value.trim().toUpperCase(), pin = $('#pin').value.trim();
  $('#err').textContent = '';
  await signInAnon();
  if (!(await sessionExists(code).catch(() => false))) { $('#err').textContent = `${code} 세션이 없어요.`; return; }
  if (!/^\d{4}$/.test(pin)) { $('#err').textContent = 'PIN 4자리를 넣어 주세요.'; return; }
  const base = `sessions/${code}`, me = store.uid();
  const wrongPin = String((+pin + 1) % 10000).padStart(4, '0');
  const quiz = (await store.get(`${base}/control/quiz`)) || {};
  const prem = (await store.get(`${base}/control/premiere`)) || {};
  const hook = await store.get(`${base}/teams/${first.id}/hook`);

  // [설명, 기대(true=되어야 함, false=막혀야 함), 시도]
  const tests = [
    ['팀 기기가 PIN 목록을 읽기', false, () => canRead(`pins/${code}`)],
    ['가입 전에 수업 단계(control) 바꾸기', false, () => store.set(`${base}/control/stage`, 'reflect', Q)],
    ['틀린 PIN으로 팀 등록', false, () => store.set(`members/${code}/${first.id}/${me}`, wrongPin, Q)],
    [`맞는 PIN으로 ${first.name} 팀 등록`, true, () => store.set(`members/${code}/${first.id}/${me}`, pin, Q)],
    ['등록 후에도 수업 단계(control) 바꾸기', false, () => store.set(`${base}/control/stage`, 'reflect', Q)],
    ['지구 게이지 바꾸기', false, () => store.set(`${base}/control/gauge/v`, 100, Q)],
    ['알림 보내기', false, () => store.set(`${base}/control/alert`, { id: 'x', icon: '!', msg: 'x', at: 0 }, Q)],
    [`다른 팀(${other.name}) 칸에 쓰기`, false, () => store.set(`${base}/teams/${other.id}/hook`, '해킹', Q)],
    [`우리 팀(${first.name}) 훅 쓰기 (같은 값으로)`, true, () => store.set(`${base}/teams/${first.id}/hook`, hook, Q)],
    ['우리 팀 칸에 정해지지 않은 항목 쓰기', false, () => store.set(`${base}/teams/${first.id}/name`, '이상한 값', Q)],
    ['우리 팀 훅에 아주 긴 글 쓰기', false, () => store.set(`${base}/teams/${first.id}/hook`, 'x'.repeat(200), Q)],
    [`다른 팀(${other.name}) 이름으로 투표`, false, () => store.set(`${base}/votes/${quiz.poll || '1A'}/${other.id}`, 'A', Q)],
    ...(quiz.open ? [] : [['투표가 닫혀 있을 때 투표', false, () => store.set(`${base}/votes/${quiz.poll || '1A'}/${first.id}`, 'A', Q)]]),
    ['우리 팀에게 하트 보내기', false, () => store.set(`${base}/hearts/${first.id}/${first.id}`, 1, Q)],
    ...(prem.teamId === other.id ? [] : [[`상영 중이 아닌 팀(${other.name})에게 하트`, false, () => store.set(`${base}/hearts/${other.id}/${first.id}`, 1, Q)]]),
    ['하트 11개 넘게 보내기', false, () => store.set(`${base}/hearts/${prem.teamId || other.id}/${first.id}`, 99, Q)],
    ['비밀 미션 성공 표시하기', false, () => store.set(`${base}/missions/${first.schoolId}`, true, Q)],
    ['교사 칸(teacherUid) 빼앗기', false, () => store.set(`${base}/teacherUid`, me, Q)],
    ['PIN 바꾸기', false, () => store.set(`pins/${code}/${first.id}`, '0000', Q)],
    ['다른 기기 등록 목록 읽기', false, () => canRead(`members/${code}`)],
    ['새 수업(세션) 마음대로 만들기', false, () => store.set(`sessions/ZZ${Date.now().toString(36).slice(-4).toUpperCase()}/teacherUid`, me, Q)],
    ['수업 전체 지우기', false, () => store.remove(base, Q)],
  ];

  $('#out').innerHTML = '';
  let pass = 0;
  for (const [label, expect, run] of tests) {
    const did = await run();
    const ok = did === expect;
    pass += ok;
    $('#out').insertAdjacentHTML('beforeend', `<tr><td>${ok ? '✅' : '❌'}</td><td>${esc(label)}<div class="why">${expect ? '되어야 함' : '막혀야 함'} → ${did ? '됐음' : '막힘'}</div></td></tr>`);
  }
  $('#sum').hidden = false;
  $('#sum').textContent = pass === tests.length
    ? `🎉 ${tests.length}개 모두 통과! 팀 기기는 자기 팀 칸과 투표·하트·피드백만 쓸 수 있어요.`
    : `⚠️ ${tests.length - pass}개가 기대와 달라요. ❌ 줄을 캡처해서 Claude에게 보여 주세요.`;
};
