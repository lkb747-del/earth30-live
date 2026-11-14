// QR 코드 그리기: js/vendor/qrcode.js(qrcode-generator 1.4.4, MIT, Kazuhiko Arase)를 한 번만 불러와 SVG로 만든다
let ready = null;
function load() {
  ready ||= new Promise((ok, no) => {
    if (window.qrcode) return ok();
    const s = Object.assign(document.createElement('script'), { src: new URL('./vendor/qrcode.js', import.meta.url).href });
    s.onload = () => ok();
    s.onerror = () => { ready = null; no(new Error('qrcode.js')); };
    document.head.append(s);
  });
  return ready;
}
/** 글자(주소)를 QR SVG 문자열로. 화면 크기에 맞춰 늘어난다 */
export async function qrSvg(text) {
  await load();
  const q = window.qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
}
/** 같은 폴더의 다른 화면 주소 (GitHub Pages 하위 경로에서도 맞게) */
export const pageUrl = (file, query) => new URL(`${file}?${new URLSearchParams(query)}`, location.href).href;
