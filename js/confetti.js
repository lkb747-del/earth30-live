// 꽃가루: 기존 도구판(reference/기존_30초_지구_스튜디오.html)의 캔버스 컨페티를 가져옴
let cv = null, cx = null, parts = [], raf = 0;
const COLS = ['#FFD23F', '#3DDC97', '#4CC9F0', '#FF3B4E', '#ffffff', '#FD9D24'];

function setup() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.id = 'confetti';
  document.body.append(cv);
  cx = cv.getContext('2d');
  const size = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; };
  addEventListener('resize', size);
  size();
}

export function burst(n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setup();
  for (let i = 0; i < n; i++) {
    parts.push({
      x: cv.width / 2 + (Math.random() - 0.5) * cv.width * 0.3, y: cv.height * 0.35,
      vx: (Math.random() - 0.5) * 26, vy: -Math.random() * 22 - 6,
      r: (Math.random() * 6 + 4) * devicePixelRatio, c: COLS[i % COLS.length], a: Math.random() * 6, life: 0,
    });
  }
  if (!raf) loop();
}

function loop() {
  cx.clearRect(0, 0, cv.width, cv.height);
  parts.forEach((p) => {
    p.vy += 0.6; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += 0.2; p.life++;
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c; cx.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66); cx.restore();
  });
  parts = parts.filter((p) => p.y < cv.height + 40 && p.life < 240);
  raf = parts.length ? requestAnimationFrame(loop) : 0;
  if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
}
