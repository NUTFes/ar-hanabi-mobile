import type { ColorParticle, ColorParticleData } from '../types/illustrationFireworksType';

export interface ImageToParticlesOptions {
    /** リサイズ後の一辺のピクセル数（デフォルト: 64） */
    resolution?: number;
    /** 白とみなすRGBしきい値 0〜255（デフォルト: 200） */
    whiteThreshold?: number;
    /** 彩度しきい値 max-min（デフォルト: 30）これ未満はノイズとして除外 */
    saturationThreshold?: number;
    /** 白ピクセルも半透明粒子として含める（デフォルト: false） */
    includeWhite?: boolean;
}

/**
 * 画像URLをn×nグリッドにリサイズし、色ピクセルをColorParticle[]に変換する。
 * Unityの ImageToParticles.cs と同等のロジック。
 *
 * NOTE: Canvas APIを使うため、ブラウザ環境でのみ動作する。
 * CORS制約により imageUrl は同一オリジンか CORSヘッダ付きである必要がある。
 */
export async function imageUrlToParticles(
    imageUrl: string,
    options: ImageToParticlesOptions = {}
): Promise<ColorParticleData> {
    const {
        resolution = 64,
        whiteThreshold = 200,
        saturationThreshold = 30,
        includeWhite = false,
    } = options;

    const pixels = await fetchResizedPixels(imageUrl, resolution);
    const particles = extractParticles(pixels, resolution, {
        whiteThreshold,
        saturationThreshold,
        includeWhite,
    });

    console.log(
        `[imageToParticles] ${resolution}×${resolution} → ${particles.length} particles`
    );

    return { particles, resolution };
}

// ────────────────────────────────────────────────────────────────────────────
// 内部実装
// ────────────────────────────────────────────────────────────────────────────

/** 画像をn×nにリサイズしてRGBAピクセル配列を返す */
async function fetchResizedPixels(
    url: string,
    n: number
): Promise<Uint8ClampedArray> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = n;
            canvas.height = n;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get 2D canvas context'));
                return;
            }
            ctx.drawImage(img, 0, 0, n, n);
            const imageData = ctx.getImageData(0, 0, n, n);
            resolve(imageData.data);
        };

        img.onerror = () => {
            reject(new Error(`Failed to load image: ${url}`));
        };

        img.src = url;
    });
}

interface FilterOptions {
    whiteThreshold: number;
    saturationThreshold: number;
    includeWhite: boolean;
}

/** RGBAピクセル配列からColorParticle[]を抽出する */
function extractParticles(
    data: Uint8ClampedArray,
    n: number,
    opts: FilterOptions
): ColorParticle[] {
    const { whiteThreshold, saturationThreshold, includeWhite } = opts;
    const particles: ColorParticle[] = [];

    for (let py = 0; py < n; py++) {
        for (let px = 0; px < n; px++) {
            // Canvasのピクセルは左上原点・行優先
            const idx = (py * n + px) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            // alpha は使用しない（背景が透明な場合も色として扱う）

            const isWhite =
                r > whiteThreshold && g > whiteThreshold && b > whiteThreshold;

            const sat = Math.max(r, g, b) - Math.min(r, g, b);

            if (isWhite) {
                if (includeWhite) {
                    particles.push({
                        // y は上が 0 → Three.js では上が正なので反転
                        x: px / (n - 1),
                        y: 1 - py / (n - 1),
                        r: 255,
                        g: 255,
                        b: 255,
                    });
                }
            } else {
                if (sat >= saturationThreshold) {
                    particles.push({
                        x: px / (n - 1),
                        y: 1 - py / (n - 1),
                        r,
                        g,
                        b,
                    });
                }
            }
        }
    }

    return particles;
}