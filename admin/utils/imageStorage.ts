import { createImage } from '@/utils/cropImage';

/**
 * 作成した花火の元画像を、ブラウザのlocalStorageに控えておくためのモジュール。
 *
 * この控えはキーホルダー印刷・PDF生成の元画像として使われる（QRCode.tsx の
 * resolveOriginalImageDataUrl）。無い場合はAPI上の画像を取得するフォールバックが
 * あるため、消えても印刷はできる。
 */

export const FIREWORK_IMAGE_KEY_PREFIX = 'firework_image_';

export function getFireworkImageKey(fireworkId: number): string {
  return `${FIREWORK_IMAGE_KEY_PREFIX}${fireworkId}`;
}

export interface StoredImage {
  dataUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  lastModified: number;
  savedAt: number;
}

/**
 * localStorageへ保存する画像の一辺の上限。
 *
 * 用途はアクリルキーホルダー（45×32mm）の印刷とPDFだけで、長辺1024pxあれば
 * 600dpi相当が出せるため、これ以上の解像度を持っていても仕上がりは変わらない。
 */
const STORED_IMAGE_MAX_SIZE = 1024;
const STORED_IMAGE_QUALITY = 0.85;

/**
 * localStorageへ入れるための縮小コピーを作る。
 *
 * 取り込んだ画像をそのまま入れると、A4を200dpiでスキャンした画像は1枚で数MBになり、
 * localStorage（オリジンあたり約5MB）を数枚〜100枚程度で使い切ってしまう。
 * 縮小してJPEGにすることで、同じ容量でずっと多くの花火を控えておける。
 * 花火の粒子変換はAPI上の画像を使うため、この縮小の影響を受けない。
 */
export async function createStoredImage(file: File): Promise<StoredImage> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await createImage(objectUrl);
    const scale = Math.min(
      1,
      STORED_IMAGE_MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D canvas context for the stored image');
    }

    // JPEGは透過を持てないため、白で塗ってから描く（透過部分が黒く出るのを防ぐ）
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', STORED_IMAGE_QUALITY);

    return {
      dataUrl,
      fileName: file.name,
      fileSize: dataUrl.length,
      fileType: 'image/jpeg',
      lastModified: file.lastModified,
      savedAt: Date.now(),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;

  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}

/** 保存済みの花火画像のキーを、保存が古い順に返す（壊れている物は最優先で消す） */
function listStoredImageKeysOldestFirst(excludeKey: string): string[] {
  const entries: { key: string; savedAt: number }[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || key === excludeKey || !key.startsWith(FIREWORK_IMAGE_KEY_PREFIX)) continue;

    let savedAt = 0;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? '{}');
      savedAt = Number(parsed?.savedAt) || 0;
    } catch {
      savedAt = 0;
    }
    entries.push({ key, savedAt });
  }

  return entries.sort((a, b) => a.savedAt - b.savedAt).map((entry) => entry.key);
}

/**
 * localStorageへ書き込む。容量が足りなければ、古い花火画像から1件ずつ消して
 * 書けるまで再試行する。
 *
 * 消した画像はAPI上に同じものがあり、印刷・PDFはサーバー上の画像へ自動で
 * フォールバックするため、消えても登録済みの花火は使い続けられる。
 * 花火画像そのものだけでなく、色の調整などの設定を書くときにも使う
 * （設定が容量不足で保存できないと、取り込みのたびに設定し直しになるため）。
 *
 * @returns 書けたら true。書けなかった場合も例外は投げない
 */
export function setItemEvictingOldImages(key: string, value: string): boolean {
  let evictableKeys: string[] | null = null;
  let evictedCount = 0;

  for (;;) {
    try {
      window.localStorage.setItem(key, value);
      if (evictedCount > 0) {
        console.info(
          `localStorageの空き容量を確保するため、古い花火画像を${evictedCount}件削除しました`
        );
      }
      return true;
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.error(`localStorageへの保存に失敗しました (${key}):`, error);
        return false;
      }

      // 消す順番は最初の失敗時に決める（消しながら列挙すると順序が崩れるため）
      if (!evictableKeys) evictableKeys = listStoredImageKeysOldestFirst(key);

      const oldestKey = evictableKeys.shift();
      if (!oldestKey) {
        console.warn(`localStorageに空き容量を作れませんでした (${key})`);
        return false;
      }

      window.localStorage.removeItem(oldestKey);
      evictedCount += 1;
    }
  }
}
