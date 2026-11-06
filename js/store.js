// 데이터 계층: 모든 화면은 이 파일의 함수만 쓴다.
// config.js의 FIREBASE_CONFIG가 null이면 데모 어댑터(한 PC의 탭끼리), 값이 있으면 Firebase 어댑터를 쓴다.
// 두 어댑터는 같은 함수(ready, watch, get, set, update, push, increment, remove, serverNow, uid, onConnection, presence)를 가진다.
import { FIREBASE_CONFIG } from '../config.js';

// Firebase 값이 있어도 주소 끝에 ?demo=1을 붙이면 이 브라우저는 데모 모드로 바뀐다(?demo=0이면 원래대로). 리허설용
// 학생 기기가 실수로 데모가 되지 않게, 이 PC에서 연 주소(localhost)에서만 동작한다
export const canDemo = ['localhost', '127.0.0.1'].includes(location.hostname);
const forceDemo = (() => {
  if (!canDemo) return false;
  try {
    const q = new URLSearchParams(location.search).get('demo');
    if (q === '1') localStorage.setItem('e30:demo', '1');
    if (q === '0') localStorage.removeItem('e30:demo');
    return localStorage.getItem('e30:demo') === '1';
  } catch { return false; }
})();

const impl = FIREBASE_CONFIG && !forceDemo ? await import('./store-firebase.js') : await import('./store-demo.js');

export const {
  isDemo, ready, teacherLogin, logout, watch, get, set, update, push, increment, remove, serverNow, uid, onConnection, presence,
} = impl;

/** 접속 중인지: Firebase는 true, 데모는 최근 15초 안의 시각 */
export const isOnline = (v, now) => v === true || (typeof v === 'number' && now - v < 15000);
