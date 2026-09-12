import { createImage } from '@/utils/cropImage';

export interface BackgroundRemovalOptions {
  /** 白とみなす知覚輝度のしきい値（0〜255） */
  whiteThreshold?: number;
  /** 白判定用の相対彩度（HSVのS）しきい値（0〜1） */
  whiteSaturationRatio?: number;
  /** これ未満の絶対彩度を無彩色ノイズとして除外する */
  saturationThreshold?: number;
  /**
   * 黒インクとみなす知覚輝度のしきい値（0〜255）。絶対彩度が低い画素は無彩色ノイズとして
   * 透明化されるが、黒インクも絶対彩度がほぼ0のため同じ判定に埋もれてしまう。この値以下の
   * 暗い画素は、彩度が低くても意図して描かれた黒インクとして常に透明化しない。
   *
   * 小さい/細い黒インクは、実際の撮影で生じるピンボケ・手ブレ・JPEG圧縮により、
   * 元の画素の時点で既に薄い（明るい）グレーへ滲んでいることがある。テスト用画像
   * white-background-removal-color-cast.jpg で実測した影・照明カブリングの輝度は
   * 最低でも約130（ほぼ全域が140以上）のため、120まで引き上げても影を誤って
   * 拾うことはなく、より薄まった小さな黒インクまで拾えるようにしている。
   */
  blackLuminanceThreshold?: number;
  /**
   * 画像端に連結した領域を透明化する際、この明るさ未満の画素は色を問わず
   * 透明化の対象外にする（＝画像の端いっぱいまで描かれた濃い色のインクを守る）
   */
  floodLuminanceThreshold?: number;
  /**
   * 画像端に連結した領域を透明化する際、この絶対彩度以上の画素は
   * 透明化の対象外にする（＝画像の端いっぱいまで描かれた鮮やかな色のインクを守る）
   */
  floodSaturationThreshold?: number;
}

const DEFAULT_OPTIONS: Required<BackgroundRemovalOptions> = {
  whiteThreshold: 200,
  whiteSaturationRatio: 0.2,
  saturationThreshold: 30,
  // テスト用画像 white-background-removal-color-cast.jpg の影・照明カブリングは
  // 実測で最低輝度約130（ほぼ全域が140以上）のため、120までは誤って拾わない。
  // 一方、ピンボケ・手ブレ・JPEG圧縮で薄まった小さな黒インクは輝度100〜150程度まで
  // 明るくなることがあるため、120まで引き上げてより多くの黒インクを拾えるようにしている
  blackLuminanceThreshold: 120,
  // テスト用画像 white-background-removal-color-cast.jpg の照明カブリング
  // （画像端で最大 彩度67 / 輝度190〜225程度）は透明化できる一方、
  // 花火として描かれる濃い色のインク（彩度90以上が大半）は画像の端まで
  // 描かれていても透明化されずに残る値を選んでいる
  floodLuminanceThreshold: 140,
  floodSaturationThreshold: 90,
};

/**
 * 花火のパーティクル変換と同じ基準で、背景として除外する画素かを判定する。
 * 明るく低彩度な白背景に加え、影などの無彩色ノイズも除外対象にする。
 */
export function isBackgroundPixel(
  r: number,
  g: number,
  b: number,
  options: Required<BackgroundRemovalOptions> = DEFAULT_OPTIONS
): boolean {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const saturation = maxC - minC;
  const relativeSaturation = maxC === 0 ? 0 : saturation / maxC;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  const isWhite =
    luminance > options.whiteThreshold &&
    relativeSaturation < options.whiteSaturationRatio;

  // 絶対彩度が低くても、暗い（黒に近い）画素は意図して描かれた黒インクとして残す。
  // 黒インクは白インクと同様に彩度がほぼ0になるため、彩度だけで判定すると
  // 影・照明カブリングと区別できず透明化されてしまう。
  const isAchromaticNoise =
    saturation < options.saturationThreshold &&
    luminance > options.blackLuminanceThreshold;

  return isWhite || isAchromaticNoise;
}

/**
 * 画像端に連結した不透明領域のうち、色を問わず透明化してよいほど
 * 「背景らしい」画素かどうかを判定する（isBackgroundPixel より緩い基準）。
 *
 * 白判定から漏れた照明の色かぶりや影は、明るく・彩度が低いという特徴を持つ。
 * 一方、正方形いっぱいに描かれた花火のインクは画像の端まで達することがあるが、
 * 彩度が高い、または暗いという特徴で区別できる。この関数は「明るく、かつ彩度が
 * 低い」画素だけを背景とみなすことで、画像端に達しているインクを誤って
 * 透明化しないようにする（issue #51: 印刷時に絵の端が消える問題への対応）。
 */
function isFloodableBackground(
  r: number,
  g: number,
  b: number,
  options: Required<BackgroundRemovalOptions>
): boolean {
  if (isBackgroundPixel(r, g, b, options)) return true;

  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const saturation = maxC - minC;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  return (
    luminance > options.floodLuminanceThreshold &&
    saturation < options.floodSaturationThreshold
  );
}

/**
 * 白判定から漏れた照明の色かぶりや影は、通常は用紙の外周へつながっている。
 * 一次判定後も画像端へつながっている「背景らしい」領域を透明化する。
 * 色を問わず透明化すると、画像の端いっぱいまで描かれたインクまで消えてしまうため、
 * isFloodableBackground で背景らしいと判定された画素だけを対象にする。
 */
function removeEdgeConnectedBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: Required<BackgroundRemovalOptions>
): void {
  const queue = new Int32Array(width * height);
  let readIndex = 0;
  let writeIndex = 0;

  const enqueueOpaquePixel = (pixelIndex: number) => {
    const alphaIndex = pixelIndex * 4 + 3;
    if (pixels[alphaIndex] === 0) return;

    const colorIndex = pixelIndex * 4;
    if (
      !isFloodableBackground(
        pixels[colorIndex],
        pixels[colorIndex + 1],
        pixels[colorIndex + 2],
        options
      )
    ) {
      return;
    }

    // enqueueと同時に透明化し、同じ画素を再登録しないためのvisitedとしても使う。
    pixels[alphaIndex] = 0;
    queue[writeIndex] = pixelIndex;
    writeIndex += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueOpaquePixel(x);
    enqueueOpaquePixel((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueOpaquePixel(y * width);
    enqueueOpaquePixel(y * width + width - 1);
  }

  while (readIndex < writeIndex) {
    const pixelIndex = queue[readIndex];
    readIndex += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (x > 0) enqueueOpaquePixel(pixelIndex - 1);
    if (x + 1 < width) enqueueOpaquePixel(pixelIndex + 1);
    if (y > 0) enqueueOpaquePixel(pixelIndex - width);
    if (y + 1 < height) enqueueOpaquePixel(pixelIndex + width);
  }
}

/**
 * 画像の白背景と無彩色ノイズを透明化し、PNG data URLとして返す。
 * 色付きの花火画素と元画像の既存alphaは保持する。
 */
export async function removeWhiteBackground(
  imageSource: string,
  options: BackgroundRemovalOptions = {}
): Promise<string> {
  const resolvedOptions: Required<BackgroundRemovalOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const image = await createImage(imageSource);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Failed to get 2D canvas context for background removal');
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    if (isBackgroundPixel(
      pixels[index],
      pixels[index + 1],
      pixels[index + 2],
      resolvedOptions
    )) {
      pixels[index + 3] = 0;
    }
  }

  removeEdgeConnectedBackground(pixels, canvas.width, canvas.height, resolvedOptions);

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ────────────────────────────────────────────────────────────────────────────
// プレビュー用（色の調整で「何が拾われるか」を確認するためのヘルパー）
// ────────────────────────────────────────────────────────────────────────────

/** 背景として消される画素の代わりに塗る色（市松模様にせず、絵と紛れない薄いグレー） */
const DROPPED_PIXEL_COLOR: [number, number, number] = [226, 232, 240];

/**
 * 花火の粒子・印刷対象として残る画素の割合（0〜1）を返す。
 *
 * isBackgroundPixel は「白」と「無彩色ノイズ」を判定する関数であり、
 * これに当たらない画素がそのままインク（＝残る画素）になる。
 * user/src/utils/imageToParticles.ts の classifyPixel と同じ基準のため、
 * この割合は花火の粒子として拾われる量の目安にもなる。
 */
export function measureInkRatio(imageData: ImageData): number {
  const pixels = imageData.data;
  let ink = 0;
  let total = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    total += 1;
    if (!isBackgroundPixel(pixels[index], pixels[index + 1], pixels[index + 2])) {
      ink += 1;
    }
  }

  return total === 0 ? 0 : ink / total;
}

/**
 * 背景として消される画素を薄いグレーで塗りつぶし、残る画素だけを見えるようにする
 * （色の調整で淡い色が拾えるようになったかを目視で確かめるためのプレビュー）。
 */
export function maskBackgroundPixels(imageData: ImageData): void {
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    if (!isBackgroundPixel(pixels[index], pixels[index + 1], pixels[index + 2])) continue;

    pixels[index] = DROPPED_PIXEL_COLOR[0];
    pixels[index + 1] = DROPPED_PIXEL_COLOR[1];
    pixels[index + 2] = DROPPED_PIXEL_COLOR[2];
  }
}
