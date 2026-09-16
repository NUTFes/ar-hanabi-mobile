// ===== 写真撮影モードのフォトフレーム =====
// フレームは画像アセットではなく Canvas2D の描画関数として持つ。
// 画面に重ねるプレビュー（FrameOverlayCanvas）と、実際に保存する写真・動画の
// 合成（mediaCapture.ts）の両方がこの同じ関数を呼ぶため、
// 「プレビューと保存結果がズレる」ことが原理的に起きない。

/** 45th NUTFES のロゴに合わせた基調色（ロゴの紺を実測した値）と、その明るめ/暗め */
const BRAND_NAVY = '#293895';
const BRAND_NAVY_LIGHT = '#4356c4';
const BRAND_NAVY_DARK = '#1b2565';

export type PhotoFrameId = 'none' | 'blue' | 'hanabi' | 'film';

export const PHOTO_FRAMES: { id: PhotoFrameId; label: string }[] = [
  { id: 'none', label: 'なし' },
  { id: 'blue', label: 'ブルー' },
  { id: 'hanabi', label: '花火' },
  { id: 'film', label: 'シネマ' },
];

/** フレーム内に描くロゴ。読み込み前・読み込み失敗時は null のまま描画をスキップする */
let logoImage: HTMLImageElement | null = null;
let logoLoading: Promise<HTMLImageElement | null> | null = null;

/** ロゴ画像を一度だけ読み込む。描画側は待たずに呼べるよう、完了するまでは null を返す */
export function preloadFrameLogo(): Promise<HTMLImageElement | null> {
  if (logoLoading) return logoLoading;
  logoLoading = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      logoImage = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    // 同一オリジンの public/ 配下なのでキャンバスは汚染されない（toBlob できる）
    img.src = '/logo.png';
  });
  return logoLoading;
}

/** 日付ラベル（例: 2026.09.14）。フレームの装飾に使う */
function formatDate(date: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}.${p(date.getMonth() + 1)}.${p(date.getDate())}`;
}

/** roundRect 未対応ブラウザ（古いiOS Safari）向けのフォールバック付き角丸パス */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * フレームを描画する。
 *
 * 寸法はすべて「短辺の1%」= u を基準に決めるため、
 * プレビュー（画面サイズ×DPR）でも保存用（最大1440px等）でも同じ見た目になる。
 */
export function drawPhotoFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frameId: PhotoFrameId,
  date: Date = new Date(),
): void {
  if (frameId === 'none') return;

  const u = Math.min(width, height) / 100;
  ctx.save();
  // フレームは常に不透明な上乗せ描画（下のカメラ映像の合成モードを引きずらない）
  ctx.globalCompositeOperation = 'source-over';

  if (frameId === 'blue') drawBlueFrame(ctx, width, height, u);
  else if (frameId === 'hanabi') drawHanabiFrame(ctx, width, height, u, date);
  else if (frameId === 'film') drawFilmFrame(ctx, width, height, u, date);

  ctx.restore();
}

/** ブルー：45thロゴの紺の二重枠＋四隅の飾り。花火の写真を額縁に入れたような見た目。
 *  ロゴが「紺地に白抜き」なので、枠も紺を地にして飾りを白で抜く */
function drawBlueFrame(ctx: CanvasRenderingContext2D, w: number, h: number, u: number): void {
  const margin = u * 3;
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, BRAND_NAVY_LIGHT);
  gradient.addColorStop(0.5, BRAND_NAVY);
  gradient.addColorStop(1, BRAND_NAVY_DARK);

  ctx.strokeStyle = gradient;
  ctx.lineWidth = u * 1.1;
  roundedRectPath(ctx, margin, margin, w - margin * 2, h - margin * 2, u * 4);
  ctx.stroke();

  // 内側の細い白線。紺枠との間に隙間を作って奥行きを出す
  const inner = margin + u * 1.8;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = u * 0.22;
  roundedRectPath(ctx, inner, inner, w - inner * 2, h - inner * 2, u * 3);
  ctx.stroke();

  // 四隅の飾り（L字の短い線）。暗い写真の上でも見えるよう白で描く
  const cLen = u * 6;
  const cOff = margin + u * 4.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = u * 0.5;
  ctx.lineCap = 'round';
  const corners: [number, number, number, number][] = [
    [cOff, cOff, 1, 1],
    [w - cOff, cOff, -1, 1],
    [cOff, h - cOff, 1, -1],
    [w - cOff, h - cOff, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + cLen * sx, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + cLen * sy);
    ctx.stroke();
  }
}

/** 花火：下部にロゴと日付を載せた帯を敷く。SNSに上げたときに何のイベントか分かるようにする */
function drawHanabiFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  u: number,
  date: Date,
): void {
  const bandH = u * 15;
  const bandY = h - bandH;

  // 帯はロゴと同じ紺。ロゴが紺地に白抜きなので、帯を紺にするとロゴと地続きに見える
  const grad = ctx.createLinearGradient(0, bandY, 0, h);
  grad.addColorStop(0, 'rgba(41, 56, 149, 0)');
  grad.addColorStop(0.35, 'rgba(41, 56, 149, 0.62)');
  grad.addColorStop(1, 'rgba(27, 37, 101, 0.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, w, bandH);

  // 帯の上端を白い細線で締める（紺の帯の上では白の方が締まる）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = u * 0.22;
  ctx.beginPath();
  ctx.moveTo(u * 6, bandY + u * 3.5);
  ctx.lineTo(w - u * 6, bandY + u * 3.5);
  ctx.stroke();

  const baseline = h - u * 4.2;
  let textLeft = u * 6;

  if (logoImage) {
    const logoH = u * 7.5;
    const logoW = (logoImage.width / logoImage.height) * logoH;
    ctx.drawImage(logoImage, textLeft, baseline - logoH + u * 1.2, logoW, logoH);
    textLeft += logoW + u * 2.5;
  }

  ctx.textBaseline = 'alphabetic';
  // 紺の帯の上なので、ロゴの白抜きに合わせて文字も白で置く
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${u * 4.4}px -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.fillText('AR花火', textLeft, baseline - u * 2.2);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = `500 ${u * 2.9}px -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.fillText('NUTFES', textLeft, baseline + u * 1.4);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = `600 ${u * 3.2}px -apple-system, "Hiragino Sans", sans-serif`;
  ctx.fillText(formatDate(date), w - u * 6, baseline);
  ctx.textAlign = 'left';
}

/** シネマ：上下の黒帯。動画を撮ったときに映画のワンシーンらしく見える */
function drawFilmFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  u: number,
  date: Date,
): void {
  const barH = u * 10;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, barH);
  ctx.fillRect(0, h - barH, w, barH);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = `500 ${u * 2.8}px -apple-system, "Hiragino Sans", sans-serif`;
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillText('AR HANABI', u * 5, h - barH / 2);

  ctx.textAlign = 'right';
  ctx.fillText(formatDate(date), w - u * 5, h - barH / 2);
  ctx.textAlign = 'left';

  // 上帯の左に録画風の赤丸を置き、シネマらしさを足す
  ctx.fillStyle = '#e53e3e';
  ctx.beginPath();
  ctx.arc(u * 6, barH / 2, u * 1.1, 0, Math.PI * 2);
  ctx.fill();
}
