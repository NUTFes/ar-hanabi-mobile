// イラスト花火の型定義
export interface IllustrationFireworksType {
  id: number;
  isShareable: boolean;
  imageUrl: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// カラーパーティクルの1点
export interface ColorParticle {
  // 正規化座標 (0〜1)
  x: number;
  y: number;
  // RGB (0〜255)
  r: number;
  g: number;
  b: number;
}

// 画像から変換したパーティクルデータ
export interface ColorParticleData {
  particles: ColorParticle[];
  resolution: number; // グリッドの一辺のピクセル数
}