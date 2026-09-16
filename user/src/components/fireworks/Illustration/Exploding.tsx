import {
  useRef,
  memo,
  useEffect,
  useState,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ColorParticleData } from '../../types/illustrationFireworksType';

interface Props {
  position?: THREE.Vector3;
  /** 絵の表示サイズ（座標空間でのスケール） */
  size?: number;
  /** パーティクルの点サイズ */
  starSize?: number;
  /** 展開アニメーションの時間（秒） */
  expandTime?: number;
  /** 展開後のフェードアウト時間（秒） */
  fadeTime?: number;
  /** 画像から変換したカラーパーティクルデータ */
  particleData: ColorParticleData;
  onComplete?: () => void;
}

/**
 * イラスト花火の爆発コンポーネント（カラーパーティクル版）
 *
 * フェーズ:
 *   Phase1 (expandTime): 中心から絵の形へ EaseOut 展開
 *   Phase2 (fadeTime):   絵の形を維持しながらフェードアウト＋重力落下
 *
 * 絵は平面なので、常にカメラの方を向かせる（ビルボード）。
 * 以前はワールドのXY平面に固定していたため、画面の端で開いたときや
 * 端末を傾けたときに、その平面を斜めから見ることになって絵が歪んでいた。
 * 粒子の座標は爆発中心を原点とするローカル座標で持ち、向きは毎フレーム
 * カメラの回転をコピーして合わせる。
 */
const IllustrationExploding = memo(function IllustrationExploding({
                                                                    position = new THREE.Vector3(0, 0, 0),
                                                                    size = 6,
                                                                    starSize = 0.15,
                                                                    expandTime = 0.8,
                                                                    fadeTime = 1.5,
                                                                    particleData,
                                                                    onComplete = () => {},
                                                                  }: Props) {
  const { particles } = particleData;
  const count = particles.length;

  // BufferGeometry の attribute
  const pointsRef = useRef<THREE.Points>(null);
  const posAttr = useRef<THREE.BufferAttribute | null>(null);
  const colAttr = useRef<THREE.BufferAttribute | null>(null);

  // 目標座標（絵の形）。爆発中心を原点とするローカル座標
  const targetPositions = useRef<Float32Array>(new Float32Array(count * 3));
  // 現在座標（同じくローカル座標）
  const currentPositions = useRef<Float32Array>(new Float32Array(count * 3));
  // 色
  const colors = useRef<Float32Array>(new Float32Array(count * 3));

  const initTime = useRef<number | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  // ── 初期化 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // 目標座標と色を計算
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      // 正規化座標 (0〜1) → 中心 (0,0) 基準のローカル座標。
      // 爆発中心そのものは <points> の position が持つ
      targetPositions.current[i * 3] = (p.x - 0.5) * size;
      targetPositions.current[i * 3 + 1] = (p.y - 0.5) * size;
      targetPositions.current[i * 3 + 2] = 0;

      // 初期座標は全て爆発中心
      currentPositions.current[i * 3] = 0;
      currentPositions.current[i * 3 + 1] = 0;
      currentPositions.current[i * 3 + 2] = 0;

      // 色（0〜1 に正規化）
      colors.current[i * 3] = p.r / 255;
      colors.current[i * 3 + 1] = p.g / 255;
      colors.current[i * 3 + 2] = p.b / 255;
    }

    if (!pointsRef.current) return;

    const geo = new THREE.BufferGeometry();

    const pAttr = new THREE.BufferAttribute(currentPositions.current, 3);
    pAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pAttr);
    posAttr.current = pAttr;

    const cAttr = new THREE.BufferAttribute(colors.current, 3);
    geo.setAttribute('color', cAttr);
    colAttr.current = cAttr;

    pointsRef.current.geometry = geo;

    return () => {
      geo.dispose();
    };
  }, []);

  useEffect(() => {
    if (isCompleted) onComplete();
  }, [isCompleted, onComplete]);

  // ── フレーム更新 ─────────────────────────────────────────────────────────
  useFrame(({ clock, camera }) => {
    if (!pointsRef.current || !posAttr.current) return;

    // 絵が常に正面を向くようカメラの回転に追従させる。
    // 画面の端で開いても、端末を傾けても、絵が歪まず読めるようにするため
    pointsRef.current.quaternion.copy(camera.quaternion);

    if (initTime.current === null) initTime.current = clock.getElapsedTime();
    const elapsed = clock.getElapsedTime() - initTime.current;
    const totalTime = expandTime + fadeTime;

    if (elapsed > totalTime) {
      setIsCompleted(true);
      return;
    }

    const mat = pointsRef.current.material as THREE.PointsMaterial;

    if (elapsed <= expandTime) {
      // ── Phase1: 展開（EaseOut）──
      const t = easeOutCubic(elapsed / expandTime);
      mat.opacity = 1;

      for (let i = 0; i < count; i++) {
        currentPositions.current[i * 3] = targetPositions.current[i * 3] * t;
        currentPositions.current[i * 3 + 1] = targetPositions.current[i * 3 + 1] * t;
        currentPositions.current[i * 3 + 2] = 0;
      }
    } else {
      // ── Phase2: フェードアウト＋落下 ──
      // ビルボードなので、落下は「画面の下方向」＝ローカルの -Y。
      // 端末を傾けても粒子が横に流れて見えることがない
      const ft = (elapsed - expandTime) / fadeTime;
      mat.opacity = Math.max(0, 1 - ft);
      const gravity = ft * ft * 2; // 放物線的落下

      for (let i = 0; i < count; i++) {
        currentPositions.current[i * 3] = targetPositions.current[i * 3];
        currentPositions.current[i * 3 + 1] =
            targetPositions.current[i * 3 + 1] - gravity;
        currentPositions.current[i * 3 + 2] = 0;
      }
    }

    posAttr.current.needsUpdate = true;
  });

  if (count === 0) return null;

  // frustumCulled={false} の理由:
  // 粒子は毎フレーム広がっていくが、three.jsが持つバウンディングスフィアは
  // 生成時（全粒子が中心に集まった状態）のまま更新されない。
  // 画面の端で開いたときに、広がった部分ごとカリングされるのを防ぐ。
  return (
      <points ref={pointsRef} position={position} frustumCulled={false}>
        <bufferGeometry />
        <pointsMaterial
            size={starSize}
            vertexColors={true}
            transparent={true}
            opacity={1}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            sizeAttenuation={true}
        />
      </points>
  );
});

export default IllustrationExploding;

// ── ユーティリティ ───────────────────────────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
