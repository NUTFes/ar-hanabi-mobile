/**
 * スキャン・撮影した紙の絵を保存する前に、色を「拾われやすい」方向へ補正する。
 *
 * 花火の粒子変換（user/src/utils/imageToParticles.ts）と印刷用の背景除去
 * （admin/utils/removeWhiteBackground.ts）は、どちらも次の基準で画素を分類する。
 *
 *   白（＝消える）    : 知覚輝度 > 200 かつ 相対彩度（HSVのS）< 0.2
 *   ノイズ（＝消える）: 絶対彩度 < 30 かつ 知覚輝度 > 120
 *   インク（＝残る）  : それ以外
 *
 * 蛍光ピンクや水色のような「明るくて淡い色」は、紙に描いた時点で輝度が高く相対彩度が
 * 低いため、スキャナのわずかな色かぶりも重なって白と判定され、花火にも印刷にも
 * 出てこない。このモジュールは保存前に相対彩度と濃さを引き上げ、同じしきい値のまま
 * 淡い色をインク側へ押し上げる。
 *
 * DBへ登録される画像そのものを補正するため、花火（粒子変換）とキーホルダー印刷の
 * 両方に同じ色が使われる。
 */

export interface ColorAdjustment {
  /**
   * 彩度の倍率（1 で変更なし）。淡い色ほど強く、もともと鮮やかな色には控えめに効く
   * （boostSaturation 参照）。相対彩度をそのまま倍にするので、白判定のしきい値 0.2 に
   * 対してどれだけ余裕ができるかを見積もりやすい。
   */
  saturation: number;
  /**
   * 黒レベル（0 で変更なし）。この明るさ以下を黒へ引き下げ、全体を濃くする。
   * 薄いインクの輝度を下げて白判定（輝度 > 200）から外すと同時に、相対彩度も上がる。
   */
  blackLevel: number;
  /**
   * 紙の色かぶり（電球色・青白い蛍光灯・スキャナの癖）を自動で打ち消す。
   * 色かぶりが残ったまま彩度を上げると、白紙そのものが色付きインクと誤判定されて
   * 画面いっぱいに迷子の粒子が出るため、彩度を上げるときは基本的に有効にする。
   */
  autoWhiteBalance: boolean;
  /**
   * 色ごとの追加の彩度倍率（1 で追加なし）。HUE_BANDS と同じ並び・同じ長さ。
   *
   * 拾えない色は使うペンによって偏る（蛍光ピンクだけが薄い、水色だけが飛ぶ など）。
   * 全体の彩度を上げて対処すると、拾えている色まで原色へ潰れたり、紙のざらつきを
   * 拾い始めたりするため、色相帯ごとに強さを分けられるようにする。
   */
  hueBoosts: number[];
}

export interface WhiteBalanceGains {
  r: number;
  g: number;
  b: number;
}

export interface HueBand {
  key: string;
  label: string;
  /**
   * 帯の代表色相（度）。境目で効き方が急に変わるとグラデーションに段差が出るため、
   * 実際の倍率は隣り合う代表色相の間をなめらかに補間して決める。
   */
  centerHue: number;
  /** UIに出す色見本 */
  swatch: string;
}

/** 色相順（0°→360°）に並べる。補間で先頭と末尾が隣り合う前提のため、順序を崩さないこと */
export const HUE_BANDS: HueBand[] = [
  { key: 'red', label: '赤', centerHue: 0, swatch: '#e53e3e' },
  { key: 'orange', label: '橙', centerHue: 30, swatch: '#ed8936' },
  { key: 'yellow', label: '黄', centerHue: 55, swatch: '#ecc94b' },
  { key: 'green', label: '緑', centerHue: 120, swatch: '#48bb78' },
  { key: 'cyan', label: '水色', centerHue: 185, swatch: '#38b2ac' },
  { key: 'blue', label: '青', centerHue: 225, swatch: '#4299e1' },
  { key: 'purple', label: '紫', centerHue: 280, swatch: '#9f7aea' },
  { key: 'pink', label: 'ピンク', centerHue: 335, swatch: '#ed64a6' },
];

const HUE_CENTERS = HUE_BANDS.map((band) => band.centerHue);

export function createNeutralHueBoosts(): number[] {
  return HUE_BANDS.map(() => 1);
}

/** 補正なし（従来どおりの保存） */
export const NEUTRAL_COLOR_ADJUSTMENT: ColorAdjustment = {
  saturation: 1,
  blackLevel: 0,
  autoWhiteBalance: false,
  hueBoosts: createNeutralHueBoosts(),
};

/** 既定値。淡いピンクを拾えるようにしつつ、白紙のざらつきは拾わない強さ */
export const DEFAULT_COLOR_ADJUSTMENT: ColorAdjustment = {
  saturation: 1.8,
  blackLevel: 24,
  autoWhiteBalance: true,
  hueBoosts: createNeutralHueBoosts(),
};

/** 色ごとの強調を除いた、全体にかかる設定 */
export type GlobalAdjustment = Omit<ColorAdjustment, 'hueBoosts'>;

/** 全体の強さのプリセット（色ごとの強調は引き継ぐため hueBoosts は持たない） */
export const COLOR_ADJUSTMENT_PRESETS: {
  key: string;
  label: string;
  value: GlobalAdjustment;
}[] = [
  { key: 'none', label: 'なし', value: { saturation: 1, blackLevel: 0, autoWhiteBalance: false } },
  { key: 'normal', label: 'ふつう', value: { saturation: 1.8, blackLevel: 24, autoWhiteBalance: true } },
  { key: 'strong', label: '強め', value: { saturation: 2.6, blackLevel: 40, autoWhiteBalance: true } },
];

export const SATURATION_RANGE = { min: 1, max: 3, step: 0.1 } as const;
export const BLACK_LEVEL_RANGE = { min: 0, max: 80, step: 4 } as const;
export const HUE_BOOST_RANGE = { min: 1, max: 3, step: 0.1 } as const;

export function hasHueBoost(adjustment: ColorAdjustment): boolean {
  return adjustment.hueBoosts.some((boost) => boost > 1);
}

export function isNeutralAdjustment(adjustment: ColorAdjustment): boolean {
  return (
    adjustment.saturation <= 1 &&
    adjustment.blackLevel <= 0 &&
    !adjustment.autoWhiteBalance &&
    !hasHueBoost(adjustment)
  );
}

/** プリセット（全体の強さ）と一致しているか。色ごとの強調は比較しない */
export function isSameGlobalAdjustment(a: ColorAdjustment, b: GlobalAdjustment): boolean {
  return (
    a.saturation === b.saturation &&
    a.blackLevel === b.blackLevel &&
    a.autoWhiteBalance === b.autoWhiteBalance
  );
}

/** localStorage等から読んだ値を安全な範囲へ丸める */
export function normalizeAdjustment(value: unknown): ColorAdjustment | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<keyof ColorAdjustment, unknown>>;
  const saturation = Number(raw.saturation);
  const blackLevel = Number(raw.blackLevel);
  if (!Number.isFinite(saturation) || !Number.isFinite(blackLevel)) return null;

  // 色ごとの強調が無かった頃に保存された設定も読めるよう、足りない分は既定値で埋める
  const storedBoosts = Array.isArray(raw.hueBoosts) ? raw.hueBoosts : [];
  const hueBoosts = HUE_BANDS.map((_band, index) => {
    const boost = Number(storedBoosts[index]);
    return Number.isFinite(boost) ? clamp(boost, HUE_BOOST_RANGE.min, HUE_BOOST_RANGE.max) : 1;
  });

  return {
    saturation: clamp(saturation, SATURATION_RANGE.min, SATURATION_RANGE.max),
    blackLevel: clamp(blackLevel, BLACK_LEVEL_RANGE.min, BLACK_LEVEL_RANGE.max),
    autoWhiteBalance: Boolean(raw.autoWhiteBalance),
    hueBoosts,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// ホワイトバランス
// ────────────────────────────────────────────────────────────────────────────

/** 「紙の白」とみなす明るさの分位点。紙は画像の大部分を占めるため上位数%で十分拾える */
const WHITE_PERCENTILE = 0.97;

/**
 * 補正倍率の上限。絵が特定の色で埋まっていると、その補色チャンネルの分位点が
 * 下がって過剰な倍率が出る。上限を設けて画像全体が色転びするのを防ぐ。
 */
const MAX_WHITE_BALANCE_GAIN = 1.25;

/**
 * 紙の白を基準に、チャンネルごとの補正倍率を求める。
 *
 * もっとも明るいチャンネルを基準（倍率1）にして他のチャンネルだけを持ち上げるため、
 * 全体が明るくなって淡い色が白へ飛ぶことはなく、色かぶりだけが打ち消される。
 */
export function computeWhiteBalanceGains(imageData: ImageData): WhiteBalanceGains {
  const pixels = imageData.data;
  const histograms = [new Int32Array(256), new Int32Array(256), new Int32Array(256)];
  let counted = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    histograms[0][pixels[index]] += 1;
    histograms[1][pixels[index + 1]] += 1;
    histograms[2][pixels[index + 2]] += 1;
    counted += 1;
  }

  if (counted === 0) return { r: 1, g: 1, b: 1 };

  const threshold = counted * WHITE_PERCENTILE;
  const whites = histograms.map((histogram) => {
    let sum = 0;
    for (let value = 0; value < 256; value += 1) {
      sum += histogram[value];
      if (sum >= threshold) return Math.max(1, value);
    }
    return 255;
  });

  const target = Math.max(whites[0], whites[1], whites[2]);
  const gainOf = (white: number) => Math.min(MAX_WHITE_BALANCE_GAIN, target / white);

  return { r: gainOf(whites[0]), g: gainOf(whites[1]), b: gainOf(whites[2]) };
}

// ────────────────────────────────────────────────────────────────────────────
// スポイト（拾えない色を画像から指定する）
// ────────────────────────────────────────────────────────────────────────────

export interface PickedColor {
  /** HUE_BANDS のインデックス */
  bandIndex: number;
  hue: number;
  color: { r: number; g: number; b: number };
}

/** スポイトが色を探す範囲（画素）。細い線をクリックしても外さない程度に広げる */
const PICK_RADIUS = 3;

/**
 * 指定位置のまわりから色を拾い、どの色相帯かを返す。無彩色（紙・影）なら null。
 *
 * 平均ではなく「もっとも彩度の高い画素」を採る。細い線やアンチエイリアスの縁をクリック
 * したとき、平均では周りの白紙と混ざって彩度が落ち、帯を判定できなくなるため。
 */
export function pickHueBandAt(
  imageData: ImageData,
  x: number,
  y: number,
  radius: number = PICK_RADIUS
): PickedColor | null {
  const { width, height, data } = imageData;
  let best: { r: number; g: number; b: number; saturation: number } | null = null;

  for (let sampleY = y - radius; sampleY <= y + radius; sampleY += 1) {
    if (sampleY < 0 || sampleY >= height) continue;
    for (let sampleX = x - radius; sampleX <= x + radius; sampleX += 1) {
      if (sampleX < 0 || sampleX >= width) continue;

      const index = (sampleY * width + sampleX) * 4;
      if (data[index + 3] === 0) continue;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (!best || saturation > best.saturation) {
        best = { r, g, b, saturation };
      }
    }
  }

  if (!best || best.saturation < NEUTRAL_SATURATION_FLOOR) return null;

  const max = Math.max(best.r, best.g, best.b);
  const hue = computeHue(best.r, best.g, best.b, max, best.saturation);

  return {
    bandIndex: findNearestHueBand(hue),
    hue,
    color: { r: best.r, g: best.g, b: best.b },
  };
}

/** 色相がもっとも近い帯。0度と360度がつながっている点に注意 */
function findNearestHueBand(hue: number): number {
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  HUE_CENTERS.forEach((center, index) => {
    const diff = Math.abs(hue - center) % 360;
    const distance = Math.min(diff, 360 - diff);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = index;
    }
  });

  return nearest;
}

// ────────────────────────────────────────────────────────────────────────────
// 補正の適用
// ────────────────────────────────────────────────────────────────────────────

/** これ未満の絶対彩度（max-min）は「色ではない」とみなし、彩度を上げない */
const NEUTRAL_SATURATION_FLOOR = 16;

/** RGB から色相（0〜360度）を求める。無彩色（delta 0）は呼び出し側で除外済み */
function computeHue(r: number, g: number, b: number, max: number, delta: number): number {
  let hue: number;
  if (max === r) {
    hue = (g - b) / delta;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  hue *= 60;
  return hue < 0 ? hue + 360 : hue % 360;
}

/**
 * 色相ごとの倍率を、代表色相の間をなめらかに補間して求める。
 * 帯を矩形に区切ると、境目の色（黄と緑の中間など）で効き方が急に変わり、
 * 塗りのグラデーションや線のアンチエイリアスに段差が出るため。
 */
function interpolateHueBoost(hue: number, hueBoosts: number[]): number {
  const count = HUE_CENTERS.length;
  const found = HUE_CENTERS.findIndex((center) => center > hue);
  // 末尾の代表色相より後ろは、360度をまたいで先頭へ戻る
  const upper = found === -1 ? 0 : found;
  const lower = (upper - 1 + count) % count;

  let span = HUE_CENTERS[upper] - HUE_CENTERS[lower];
  if (span <= 0) span += 360;
  let offset = hue - HUE_CENTERS[lower];
  if (offset < 0) offset += 360;

  const ratio = span === 0 ? 0 : offset / span;
  // 単純な線形補間だと、代表色相から少しずれただけで隣の帯の設定が強く混ざる
  // （例: ピンクのペンの色相は赤寄りに出るため、ピンクを上げても半分しか効かない）。
  // 代表色相の近くを平らにして、境目付近だけで入れ替わるようにする。
  const weight = ratio * ratio * (3 - 2 * ratio);
  return hueBoosts[lower] + (hueBoosts[upper] - hueBoosts[lower]) * weight;
}

/** 画素ごとに補間を計算すると重いため、1度刻みの表を作って引く */
function buildHueBoostTable(hueBoosts: number[]): Float32Array {
  const table = new Float32Array(360);
  for (let hue = 0; hue < 360; hue += 1) {
    table[hue] = interpolateHueBoost(hue, hueBoosts);
  }
  return table;
}

/**
 * ImageData の色を破壊的に補正する。適用順は
 * ホワイトバランス → 黒レベル → 彩度（全体の倍率 × その色の倍率）。
 *
 * 彩度を最後にするのは、白判定に使われる相対彩度を「最終的に何倍にしたか」が
 * 設定値そのままになり、プレビューでの当たりを付けやすくするため。
 *
 * @param gains ホワイトバランスの倍率。補正対象が切り取り後の一部でも紙全体の白を
 *   基準にできるよう、呼び出し側で元画像から求めた値を渡す。
 */
export function applyColorAdjustment(
  imageData: ImageData,
  adjustment: ColorAdjustment,
  gains: WhiteBalanceGains | null = null
): void {
  const resolvedGains =
    adjustment.autoWhiteBalance && gains && (gains.r !== 1 || gains.g !== 1 || gains.b !== 1)
      ? gains
      : null;
  const blackLevel = clamp(adjustment.blackLevel, 0, 200);
  const saturation = Math.max(1, adjustment.saturation);
  const hueBoostTable = hasHueBoost(adjustment) ? buildHueBoostTable(adjustment.hueBoosts) : null;

  if (!resolvedGains && blackLevel === 0 && saturation === 1 && !hueBoostTable) return;

  // 黒レベルより上の範囲を 0〜255 へ引き伸ばす倍率（白は白のまま濃さだけが増す）
  const levelScale = 255 / (255 - blackLevel);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;

    let r = pixels[index];
    let g = pixels[index + 1];
    let b = pixels[index + 2];

    if (resolvedGains) {
      r = Math.min(255, r * resolvedGains.r);
      g = Math.min(255, g * resolvedGains.g);
      b = Math.min(255, b * resolvedGains.b);
    }

    if (blackLevel > 0) {
      r = Math.max(0, (r - blackLevel) * levelScale);
      g = Math.max(0, (g - blackLevel) * levelScale);
      b = Math.max(0, (b - blackLevel) * levelScale);
    }

    if (saturation > 1 || hueBoostTable) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // ほぼ無彩色の画素（紙・影・JPEGノイズ）は色として描かれたものではないため、
      // 彩度を上げない。わずかな色の偏りを増幅すると、影が絶対彩度30を超えて
      // インクと誤判定され、花火に迷子の粒が出る。淡いインクは薄いピンクでも
      // 絶対彩度が20以上あるので、この下限には掛からない。
      if (max > 0 && max - min >= NEUTRAL_SATURATION_FLOOR) {
        const currentSaturation = (max - min) / max;
        // その画素の色に対する倍率。全体の倍率と掛け合わせる
        // （全体を1.0にしておけば、特定の色だけを強調できる）
        const strength = hueBoostTable
          ? saturation * hueBoostTable[Math.min(359, Math.floor(computeHue(r, g, b, max, max - min)))]
          : saturation;
        // 淡い色ほど強く効かせる。すでに鮮やかな色まで同じ倍率で上げると、
        // 低いチャンネルが0に張り付いて色が原色へ潰れてしまうため。
        const effective = 1 + (strength - 1) * (1 - currentSaturation);
        const nextSaturation = Math.min(1, currentSaturation * effective);
        // 明度（max）と色相（max からの距離の比）を保ったまま彩度だけを動かす
        const scale = nextSaturation / currentSaturation;
        r = max - (max - r) * scale;
        g = max - (max - g) * scale;
        b = max - (max - b) * scale;
      }
    }

    pixels[index] = r;
    pixels[index + 1] = g;
    pixels[index + 2] = b;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
