import {
  useState,
  memo,
  useEffect,
} from 'react';
import * as THREE from 'three';
import Launching from '../Launching';
import IllustrationExploding from './Exploding';
import type { ColorParticleData } from '../../types/illustrationFireworksType';

interface FireworkProps {
  color?: THREE.ColorRepresentation;
  from?: THREE.Vector3;
  to?: THREE.Vector3;
  /** 絵の表示サイズ（座標空間でのスケール） */
  size?: number;
  /** パーティクルの点サイズ */
  starSize?: number;
  /** 展開アニメーション時間（秒） */
  expandTime?: number;
  /** フェードアウト時間（秒） */
  fadeTime?: number;
  /** 画像から変換したカラーパーティクルデータ（省略時は既存の boolean[][] を使用） */
  particleData?: ColorParticleData;
  /** 後方互換：白黒 boolean[][] データ（particleData が無い場合に使用） */
  data?: boolean[][];
  isSoundEnabled?: boolean;
  onComplete?: () => void;
}

/**
 * イラスト花火コンポーネント
 *
 * - `particleData` が渡された場合: 色付きパーティクルで描画（新方式）
 * - `data` のみの場合: 白黒パーティクルで描画（後方互換）
 */
const IllustrationFireworks = memo(function IllustrationFireworks({
                                                                    color = 'white',
                                                                    from = new THREE.Vector3(0, 0, 0),
                                                                    to = new THREE.Vector3(0, 10, 0),
                                                                    size = 6,
                                                                    starSize = 0.15,
                                                                    expandTime = 0.8,
                                                                    fadeTime = 1.5,
                                                                    particleData,
                                                                    data,
                                                                    isSoundEnabled = true,
                                                                    onComplete = () => {},
                                                                  }: FireworkProps) {
  const [isLaunching, setIsLaunching] = useState(true);
  const [isExploding, setIsExploding] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    if (isCompleted) onComplete();
  }, [isCompleted, onComplete]);

  // boolean[][] → ColorParticleData に変換（後方互換）
  const resolvedParticleData: ColorParticleData | null = particleData
      ? particleData
      : data
          ? booleanToParticleData(data)
          : null;

  if (!resolvedParticleData) return null;

  return (
      <>
        {isLaunching && (
            <Launching
                from={from}
                to={to}
                duration={2}
                color={color}
                isSoundEnabled={isSoundEnabled}
                onComplete={() => {
                  setIsLaunching(false);
                  setIsExploding(true);
                }}
            />
        )}
        {isExploding && (
            <IllustrationExploding
                position={to}
                size={size}
                starSize={starSize}
                expandTime={expandTime}
                fadeTime={fadeTime}
                particleData={resolvedParticleData}
                onComplete={() => {
                  setIsExploding(false);
                  setIsCompleted(true);
                }}
            />
        )}
      </>
  );
});

export default IllustrationFireworks;

// ── 後方互換ヘルパー ─────────────────────────────────────────────────────────

function booleanToParticleData(data: boolean[][]): ColorParticleData {
  const height = data.length;
  const width = data[0]?.length ?? 0;
  const resolution = Math.max(width, height);
  const particles = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y][x]) {
        particles.push({
          x: x / (width - 1),
          y: 1 - y / (height - 1), // 上下反転
          r: 255,
          g: 255,
          b: 255,
        });
      }
    }
  }

  return { particles, resolution };
}