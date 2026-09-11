import { createImage } from '@/utils/cropImage';

/**
 * 透過画像を白背景に合成し、実質的にアルファチャンネルを持たない画像のdata URLとして返す。
 *
 * 白い紙に印刷する限り「透明」と「白」は同じ結果になる一方、一部のプリンタードライバー
 * （Canonなど）はアルファチャンネル付き画像の描画に失敗し、透過部分が黒く塗られる／
 * 画像そのものが出力されないことがある。印刷経路ではあらかじめ白へ合成しておくことで、
 * 見た目を変えずにこの問題を回避する。
 *
 * PDF経路（jsPDF）はPDFビューアー側で合成されるため、この処理は不要。
 */
export async function flattenOnWhite(imageSource: string): Promise<string> {
  const image = await createImage(imageSource);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get 2D canvas context for flattening');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  return canvas.toDataURL('image/png');
}
