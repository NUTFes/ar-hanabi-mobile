// ===== 写真・動画のキャプチャ =====
// ARカメラの映像（AR.jsが作る<video>）と花火（WebGLのcanvas）とフォトフレームは、
// 画面上では別々のDOM要素を重ねているだけなので、そのままでは1枚の画像として保存できない。
// ここで合成用のcanvasへ「映像 → 花火 → フレーム」の順に描き直す。
//
// 3枚とも「画面に出ている要素そのもの」を drawImage する。フレームだけを保存時に
// 描き直すやり方だと、画面に見えている枠と保存される枠が別経路になり、
// 片方だけ出ない状態が起こりうるため（実際にその不具合が出た）。
//
// UIのボタン類はこの合成に含まれないため、撮れるのは「カメラ＋花火＋フレーム」だけになる。

/** 合成元の要素を取りに行く関数。AR.jsのvideoは非同期に生成されるため毎回取り直す */
export type CaptureSources = () => {
  video: HTMLVideoElement | null;
  gl: HTMLCanvasElement | null;
  /** 画面に重ねているフォトフレームのcanvas（フレームが「なし」なら中身は空） */
  frame: HTMLCanvasElement | null;
};

/** 写真の最大長辺。端末のDPRをそのまま使うと無駄に巨大になるので上限を設ける */
const PHOTO_MAX_LONG_SIDE = 1600;
/** 動画の最大長辺。毎フレーム合成するため写真より控えめにしないと端末が持たない */
const VIDEO_MAX_LONG_SIDE = 960;
/** 動画の最大の長さ（ミリ秒）。押しっぱなしでも必ずここで止める */
export const MAX_RECORDING_MS = 20000;

/** 合成先のサイズを決める。画面と同じアスペクト比を保ったまま長辺を上限で頭打ちにする */
function resolveCaptureSize(maxLongSide: number, even: boolean): { width: number; height: number } {
  const vw = Math.max(window.innerWidth, 1);
  const vh = Math.max(window.innerHeight, 1);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = vw * dpr;
  let height = vh * dpr;

  const longSide = Math.max(width, height);
  if (longSide > maxLongSide) {
    const ratio = maxLongSide / longSide;
    width *= ratio;
    height *= ratio;
  }

  width = Math.round(width);
  height = Math.round(height);
  // H.264 は幅・高さが偶数である必要がある（奇数だと録画開始に失敗する端末がある）
  if (even) {
    width -= width % 2;
    height -= height % 2;
  }
  return { width: Math.max(width, 2), height: Math.max(height, 2) };
}

/**
 * 画面に見えているとおりの位置・大きさで要素をcanvasへ描く。
 *
 * AR.jsは映像を画面いっぱいに「はみ出させて」表示するため、video要素には
 * 負のmarginが付いている。getBoundingClientRect() はそれを含んだ実際の表示矩形を
 * 返すので、これを使えば画面の見た目をそのまま再現できる。
 */
function drawElement(
  ctx: CanvasRenderingContext2D,
  el: HTMLVideoElement | HTMLCanvasElement | null,
  scale: number,
): void {
  if (!el) return;
  // 映像がまだ来ていないフレームを描こうとすると例外になる端末があるため弾く
  if (el instanceof HTMLVideoElement && (el.readyState < 2 || el.videoWidth === 0)) return;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  try {
    ctx.drawImage(el, rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale);
  } catch (err) {
    // 描けないフレームは黙って飛ばす（次のフレームで復帰する）
    console.warn('キャプチャ: 要素の描画に失敗しました', err);
  }
}

/** 合成1回分。写真では1度だけ、動画では毎フレーム呼ばれる */
function drawComposite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sources: CaptureSources,
): void {
  const { video, gl, frame } = sources();
  // カメラ映像が来ていない領域は黒で埋める（透明のままだとJPEGで白飛びする）
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const scale = width / Math.max(window.innerWidth, 1);
  drawElement(ctx, video, scale);
  drawElement(ctx, gl, scale);
  // フレームは最後。画面に出ているcanvasをそのまま重ねるので、
  // 選び直しても録画中でも、見えているとおりの枠が入る
  drawElement(ctx, frame, scale);
}

export type CaptureResult = {
  blob: Blob;
  url: string;
  kind: 'photo' | 'video';
  /** 保存時のファイル名（拡張子込み） */
  fileName: string;
  mimeType: string;
};

/** ファイル名に使うタイムスタンプ（例: 20260914-183000） */
function timestamp(date: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

/** 写真を1枚撮る */
export async function capturePhoto(sources: CaptureSources): Promise<CaptureResult> {
  const date = new Date();
  const { width, height } = resolveCaptureSize(PHOTO_MAX_LONG_SIDE, false);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('キャンバスを作成できませんでした');

  drawComposite(ctx, width, height, sources);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
  if (!blob) throw new Error('写真の書き出しに失敗しました');

  return {
    blob,
    url: URL.createObjectURL(blob),
    kind: 'photo',
    fileName: `ar-hanabi-${timestamp(date)}.jpg`,
    mimeType: 'image/jpeg',
  };
}

/** 端末が対応している動画形式を選ぶ。iOSはmp4、Android/PCはwebmになることが多い */
const RECORDING_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/** この端末で録画ができるか（できない場合はシャッターを写真専用として扱う） */
export function isRecordingSupported(): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false;
  return pickRecordingMimeType() !== null;
}

export type Recording = {
  /** 録画を止めて動画を受け取る。失敗したときは null */
  stop: () => Promise<CaptureResult | null>;
  /** 破棄（結果を使わない場合） */
  cancel: () => void;
};

/**
 * 録画を開始する。
 *
 * 合成用canvasを毎フレーム描き直し、その captureStream() を MediaRecorder に流す。
 * フォトフレームは画面のcanvasをそのまま重ねるので、録画中に選び直しても追従する。
 */
export function startRecording(
  sources: CaptureSources,
  onAutoStop: () => void,
): Recording | null {
  const mimeType = pickRecordingMimeType();
  if (!mimeType) return null;

  const date = new Date();
  const { width, height } = resolveCaptureSize(VIDEO_MAX_LONG_SIDE, true);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1フレーム目を録画開始前に描いておく（真っ黒な先頭フレームを避ける）
  drawComposite(ctx, width, height, sources);

  const stream = canvas.captureStream(30);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
  } catch (err) {
    console.error('録画を開始できませんでした', err);
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  let rafId = 0;
  const tick = () => {
    drawComposite(ctx, width, height, sources);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  // 押しっぱなしでも必ず止まるようにする（指を離し損ねても録画が終わる）
  const autoStopId = window.setTimeout(() => onAutoStop(), MAX_RECORDING_MS);

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    stream.getTracks().forEach((t) => t.stop());
    window.clearTimeout(autoStopId);
  };

  let settled = false;
  const stopped = new Promise<CaptureResult | null>((resolve) => {
    recorder.onstop = () => {
      cleanup();
      if (settled) return;
      settled = true;
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        kind: 'video',
        fileName: `ar-hanabi-${timestamp(date)}.${ext}`,
        mimeType,
      });
    };
    recorder.onerror = (e) => {
      console.error('録画中にエラーが発生しました', e);
      cleanup();
      if (settled) return;
      settled = true;
      resolve(null);
    };
  });

  recorder.start(200);

  return {
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
      else cleanup();
      return stopped;
    },
    cancel: () => {
      settled = true;
      if (recorder.state !== 'inactive') recorder.stop();
      cleanup();
    },
  };
}

/**
 * 撮ったものを端末に保存する。
 *
 * スマホでは共有シート（Web Share API）から「画像を保存」できるのが最短なので優先し、
 * 使えない環境ではダウンロードにフォールバックする。
 */
export async function saveCapture(
  result: CaptureResult,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([result.blob], result.fileName, { type: result.mimeType });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'AR花火' });
      return 'shared';
    } catch (err) {
      // ユーザーが共有シートを閉じただけの場合はエラー扱いにしない
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      console.warn('共有に失敗したためダウンロードにフォールバックします', err);
    }
  }

  const a = document.createElement('a');
  a.href = result.url;
  a.download = result.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'downloaded';
}
