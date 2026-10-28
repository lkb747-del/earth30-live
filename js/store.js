// 데이터 계층: 모든 화면은 이 파일의 함수만 쓴다.
// config.js의 FIREBASE_CONFIG가 null이면 데모 어댑터(한 PC의 탭끼리), 값이 있으면 Firebase 어댑터를 쓴다.
// 두 어댑터는 같은 함수(ready, watch, get, set, update, push, increment, remove, serverNow, uid, onConnection, presence)를 가진다.
import { FIREBASE_CONFIG } from '../config.js';

const impl = FIREBASE_CONFIG ? await import('./store-firebase.js') : await import('./store-demo.js');

export const {
  isDemo, ready, teacherLogin, logout, watch, get, set, update, push, increment, remove, serverNow, uid, onConnection, presence,
} = impl;

/** 접속 중인지: Firebase는 true, 데모는 최근 15초 안의 시각 */
export const isOnline = (v, now) => v === true || (typeof v === 'number' && now - v < 15000);
