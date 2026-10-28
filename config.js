// Firebase 웹 앱 설정값. null이면 데모 모드(한 PC의 여러 탭끼리만 연결)로 동작한다.
// 실시간 모드로 바꾸려면 Firebase 콘솔 → 프로젝트 설정 → 내 앱에 있는 값을 아래처럼 붙여 넣는다. (Firebase_설정_안내.md 6단계)
// 이 값은 공개돼도 괜찮지만, 보안 규칙(firebase/database.rules.json)을 꼭 먼저 게시해야 한다.
//
// export const FIREBASE_CONFIG = {
//   apiKey: '...',
//   authDomain: '....firebaseapp.com',
//   databaseURL: 'https://...-default-rtdb.asia-southeast1.firebasedatabase.app',
//   projectId: '...',
//   appId: '...',
// };
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC_tWNbqnh7XgCnif_tRfhCZVutJUkyl6o",
  authDomain: "earth30-live.firebaseapp.com",
  projectId: "earth30-live",
  databaseURL: "https://earth30-live-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "earth30-live.firebasestorage.app",
  messagingSenderId: "811740424973",
  appId: "1:811740424973:web:17ada586e4ff69b4229e44"
};
