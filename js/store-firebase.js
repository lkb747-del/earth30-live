// Firebase 어댑터: Realtime Database + Authentication. 함수 이름과 동작은 store-demo.js와 같다.
// - 교사 화면: 이메일/비밀번호 로그인 (브라우저를 닫아도 로그인 유지)
// - 학교 화면·팀·보안 점검: 익명 로그인 (탭마다 따로, 새로고침해도 유지)
// - 시각: .info/serverTimeOffset으로 서버 시각 기준
// - 접속 표시: .info/connected + onDisconnect (인터넷이 끊겼다 붙으면 다시 켠다)
import { FIREBASE_CONFIG } from '../config.js';

const V = '10.14.1';
const [{ initializeApp }, A, D] = await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`),
]);

const app = initializeApp(FIREBASE_CONFIG);
const teacherPage = /teacher\.html$/.test(location.pathname);
const auth = A.initializeAuth(app, {
  persistence: teacherPage ? [A.indexedDBLocalPersistence, A.browserLocalPersistence] : A.browserSessionPersistence,
});
const db = D.getDatabase(app);
const r = (p) => D.ref(db, p);

let offset = 0;
D.onValue(r('.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
const authReady = new Promise((res) => { const off = A.onAuthStateChanged(auth, (u) => { off(); res(u); }); });

function report(e, path, opts) {
  console.error(path, e);
  if (!opts?.quiet) dispatchEvent(new CustomEvent('store-error', { detail: { code: e?.code || String(e), path } }));
}
/** 쓰기는 성공하면 true, 규칙에 막히면 false (화면은 'store-error' 알림을 받는다) */
const w = (p, path, opts) => p.then(() => true, (e) => { report(e, path, opts); return false; });

export const isDemo = false;

/** 로그인 준비. teacher면 이메일 로그인 여부만 알려 주고, 아니면 익명 로그인까지 한다 */
export async function ready({ teacher = false } = {}) {
  // databaseURL이 없으면 SDK가 엉뚱한 지역 주소로 붙으려다 멈춘다
  if (!FIREBASE_CONFIG.databaseURL) throw { code: 'config.js에 databaseURL 줄이 없어요 (Firebase_설정_안내.md 5-4단계)' };
  await authReady;
  if (!teacher && !auth.currentUser) await A.signInAnonymously(auth);
  return { email: auth.currentUser?.email || null };
}
export async function teacherLogin(email, password) {
  await A.signInWithEmailAndPassword(auth, email, password);
  return auth.currentUser.email;
}
export const logout = () => A.signOut(auth);

export function watch(path, cb) {
  return D.onValue(r(path), (s) => cb(s.val()), (e) => report(e, path));
}
/** 읽기가 규칙에 막히거나 10초 안에 답이 없으면 에러를 던진다 */
export async function get(path) {
  const late = new Promise((_, no) => setTimeout(() => no({ code: '서버 응답 없음 (10초)' }), 10000));
  return (await Promise.race([D.get(r(path)), late])).val();
}
export const set = (path, v, opts) => w(D.set(r(path), v ?? null), path, opts);
export const update = (path, obj, opts) => w(D.update(r(path), obj), path, opts);
export async function push(path, v, opts) {
  const ref = D.push(r(path));
  await w(D.set(ref, v), path, opts);
  return ref.key;
}
export const increment = (path, n = 1, opts) => w(D.set(r(path), D.increment(n)), path, opts);
export const remove = (path, opts) => w(D.remove(r(path)), path, opts);

export const serverNow = () => Date.now() + offset;
export const uid = () => auth.currentUser?.uid || null;

export function onConnection(cb) {
  D.onValue(r('.info/connected'), (s) => cb(!!s.val()));
}

export function presence(path) {
  return D.onValue(r('.info/connected'), async (s) => {
    if (!s.val()) return;
    try {
      await D.onDisconnect(r(path)).remove();
      await D.set(r(path), true);
    } catch (e) { report(e, path); }
  });
}
