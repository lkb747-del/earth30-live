// 효과음: 기존 도구판(reference/기존_30초_지구_스튜디오.html)의 WebAudio 합성음을 가져옴. 음원 파일 없음.
// 브라우저 규칙상 화면을 한 번 누른 뒤부터 소리가 난다.
let AC = null;
let soundOn = (() => { try { return localStorage.getItem('e30:sound') !== 'off'; } catch { return true; } })();

export function unlockAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
export const isSoundOn = () => soundOn;
export function setSound(on) {
  soundOn = on;
  try { localStorage.setItem('e30:sound', on ? 'on' : 'off'); } catch {}
}

function tone(f, t0, dur, type = 'sine', vol = 0.2) {
  const a = AC;
  if (!a || !soundOn) return;
  if (a.state === 'suspended') a.resume();
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = f; o.connect(g); g.connect(a.destination);
  const t = a.currentTime + t0;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  ding() { tone(1318, 0, 0.35); tone(1760, 0.12, 0.5); },
  tick() { tone(900, 0, 0.04, 'square', 0.05); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle', 0.18)); },
  beep() { tone(660, 0, 0.25, 'square', 0.12); },
  go() { tone(1046, 0, 0.6, 'square', 0.14); },
  fanfare() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.13, 0.4, 'triangle', 0.2)); },
  pop() { tone(880, 0, 0.12, 'triangle', 0.15); tone(1320, 0.06, 0.14, 'triangle', 0.12); },
  heart() { tone(1046, 0, 0.1, 'sine', 0.12); tone(1568, 0.05, 0.15, 'sine', 0.1); },
  sos() { [880, 660, 880, 660].forEach((f, i) => tone(f, i * 0.16, 0.14, 'square', 0.12)); },
};
