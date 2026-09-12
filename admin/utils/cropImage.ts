import type { Area } from 'react-easy-crop';
import {
  applyColorAdjustment,
  type ColorAdjustment,
  type WhiteBalanceGains,
} from '@/utils/colorAdjustment';

/**
 * 出力画像の一辺の上限。用紙の長辺いっぱい（さらに外側の余白まで）を切り取れるように
 * したため、切り取り範囲は元画像より大きくなり得る。極端にズームアウトしたまま確定
 * されたときにブラウザのメモリを使い切ったり、localStorage（元画像の保管先）を
 * 溢れさせたりしないための安全弁。粒子変換は 2048px までしか参照せず
 * （user/src/utils/imageToParticles.ts の MAX_SCAN_SIZE）、印刷も45×32mmのため、
 * この値まで縮めても見た目には影響しない。
 */
const MAX_OUTPUT_SIZE = 3000;

export function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Failed to load image')));
    image.src = src;
  });
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 回転後の外接矩形（react-easy-crop が croppedAreaPixels の基準にしている座標系） */
export function getRotatedSize(
  width: number,
  height: number,
  rotation: number
): { width: number; height: number } {
  const rotRad = toRadians(rotation);
  const sin = Math.abs(Math.sin(rotRad));
  const cos = Math.abs(Math.cos(rotRad));

  return {
    width: Math.ceil(width * cos + height * sin),
    height: Math.ceil(width * sin + height * cos),
  };
}

/**
 * 画像を指定の一辺以下へ縮めた ImageData を返す（色の分析・プレビュー用）。
 * 元画像のままだと数千万画素になり、スライダー操作のたびに走らせるには重すぎるため。
 */
export function createScaledImageData(image: HTMLImageElement, maxSize: number): ImageData {
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Failed to get 2D canvas context');
  }

  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export interface CropColorAdjustment {
  adjustment: ColorAdjustment;
  /** 紙全体の白から求めたホワイトバランス倍率（切り取り範囲に左右されないよう外から渡す） */
  whiteBalanceGains: WhiteBalanceGains | null;
}

/**
 * Crops and rotates an image, returning the result as a File.
 * Follows the canvas approach documented by react-easy-crop:
 * draw the source image rotated onto a bounding-box canvas, then
 * extract the cropped area onto a second canvas of the final size.
 *
 * 切り取り範囲は元画像の外へはみ出すことがある（A4のような長方形の紙から、長辺を
 * 一辺とする正方形を切り出す場合など）。はみ出した部分は白い余白として残す。
 */
export async function getCroppedImg(
  imageSrc: string,
  croppedAreaPixels: Area,
  rotation: number,
  fileName: string,
  mimeType: string,
  colorAdjustment: CropColorAdjustment | null = null
): Promise<File> {
  const image = await createImage(imageSrc);

  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;

  const rotRad = toRadians(rotation);
  const { width: boundingWidth, height: boundingHeight } = getRotatedSize(
    naturalWidth,
    naturalHeight,
    rotation
  );

  const rotateCanvas = document.createElement('canvas');
  rotateCanvas.width = boundingWidth;
  rotateCanvas.height = boundingHeight;
  const rotateCtx = rotateCanvas.getContext('2d');
  if (!rotateCtx) {
    throw new Error('Failed to get 2D canvas context');
  }

  rotateCtx.fillStyle = '#ffffff';
  rotateCtx.fillRect(0, 0, boundingWidth, boundingHeight);
  rotateCtx.translate(boundingWidth / 2, boundingHeight / 2);
  rotateCtx.rotate(rotRad);
  rotateCtx.drawImage(image, -naturalWidth / 2, -naturalHeight / 2);

  // 切り取り範囲が大きすぎる場合だけ、縦横比を保ったまま縮めて書き出す
  const outputScale = Math.min(
    1,
    MAX_OUTPUT_SIZE / Math.max(croppedAreaPixels.width, croppedAreaPixels.height)
  );
  const outputWidth = Math.max(1, Math.round(croppedAreaPixels.width * outputScale));
  const outputHeight = Math.max(1, Math.round(croppedAreaPixels.height * outputScale));

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!outputCtx) {
    throw new Error('Failed to get 2D canvas context');
  }

  outputCtx.fillStyle = '#ffffff';
  outputCtx.fillRect(0, 0, outputWidth, outputHeight);

  // 画像からはみ出した範囲は drawImage の仕様上クリップされるが、ブラウザ差を避けるため
  // 自前で元画像との重なりを求めてから描画する（はみ出し分は白い余白のまま残る）。
  const sourceLeft = Math.max(0, croppedAreaPixels.x);
  const sourceTop = Math.max(0, croppedAreaPixels.y);
  const sourceRight = Math.min(boundingWidth, croppedAreaPixels.x + croppedAreaPixels.width);
  const sourceBottom = Math.min(boundingHeight, croppedAreaPixels.y + croppedAreaPixels.height);

  if (sourceRight > sourceLeft && sourceBottom > sourceTop) {
    outputCtx.drawImage(
      rotateCanvas,
      sourceLeft,
      sourceTop,
      sourceRight - sourceLeft,
      sourceBottom - sourceTop,
      (sourceLeft - croppedAreaPixels.x) * outputScale,
      (sourceTop - croppedAreaPixels.y) * outputScale,
      (sourceRight - sourceLeft) * outputScale,
      (sourceBottom - sourceTop) * outputScale
    );
  }

  // DBへ登録する画像そのものを補正する。花火の粒子変換もキーホルダー印刷も、
  // ここで保存された色をそのまま使うため、両方に同じ補正が反映される。
  if (colorAdjustment) {
    const imageData = outputCtx.getImageData(0, 0, outputWidth, outputHeight);
    applyColorAdjustment(imageData, colorAdjustment.adjustment, colorAdjustment.whiteBalanceGains);
    outputCtx.putImageData(imageData, 0, 0);
  }

  const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const outputType = supportedTypes.has(mimeType) ? mimeType : 'image/png';

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate cropped image blob'));
        return;
      }
      resolve(new File([blob], fileName, { type: outputType }));
    }, outputType);
  });
}
