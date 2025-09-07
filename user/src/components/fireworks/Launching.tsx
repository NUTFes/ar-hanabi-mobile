import { useRef, useEffect, useState, memo } from 'react'
import { useFrame } from '@react-three/fiber'
import Sound from '../../assets/打ち上げ花火1.mp3'
import * as THREE from 'three'

type Props = {
  from: THREE.Vector3
  to: THREE.Vector3
  duration: number // 打ち上げの持続時間
  color?: THREE.ColorRepresentation
  isSoundEnabled?: boolean  // 音の有無
  onComplete?: () => void
}

// 打ち上げ時の軌跡を描画するコンポーネント(memoでメモ化)
const Launching = memo(function Launching({ 
  from, 
  to,
  duration, 
  color = 'white',
  isSoundEnabled = true,
  onComplete = () => {}
}: Props) {
  const maxTrailLength = 50    // トレイルの最大長さ
  const trailParticleCount = 1 // トレイルのパチパチのパーティクル数
  const randomRange = 0.1      // パチパチの位置をランダムにずらす範囲
  
  // 速度を計算
  const direction = new THREE.Vector3().subVectors(to, from).normalize()
  const distance = from.distanceTo(to)
  const velocity = distance / duration
  
  const pointsRef = useRef<THREE.Points>(null)  // ポイントの参照
  const trailPositions = useRef(new Float32Array(3 * trailParticleCount * maxTrailLength)) // パーティクルの位置を格納する配列
  const initTime = useRef<number | null>(null)  // シーンが配置されてからの時間を保持する変数
  
  const [isCompleted, setIsCompleted] = useState(false) // 花火の完了状態を管理
  const audio = isSoundEnabled ? useRef(new Audio(Sound)) : null // 音声の参照を保持

  // マウント時とアンマウント時の処理
  useEffect(() => {
    // 音を再生
    audio?.current?.play();
    // ====== マウント時の処理 ======
    // パーティクルのgeometryを初期化
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(trailPositions.current, 3)
      .setUsage(THREE.DynamicDrawUsage) // 動的に更新するための設定
    )
    pointsRef.current!.geometry = geometry  // 初期化時にジオメトリを設定
    
    // トレイルのパーティクルの初期化
    for (let i = 0; i < trailParticleCount * maxTrailLength; i++) {
      // トレイルの位置を設定
      trailPositions.current[i * 3 + 0] = from.x
      trailPositions.current[i * 3 + 1] = from.y
      trailPositions.current[i * 3 + 2] = from.z
    }
    
    // ====== アンマウント時の処理 ======
    return () => {
      // コンポーネントがアンマウントされたときの処理
      if (pointsRef.current) {
        // ジオメトリを解放
        pointsRef.current.geometry.dispose()
        // マテリアルも解放
        if (Array.isArray(pointsRef.current.material)) {
          pointsRef.current.material.forEach((mat) => mat.dispose())
        } else {
          pointsRef.current.material.dispose()
        }
      }
    }
  }, [])
  
  useEffect(() => {
    // 打ち上げが完了したときの処理
    if (isCompleted) {
      onComplete()
    }
  }, [isCompleted, onComplete])
  
  // フレームごとの更新
  useFrame(({clock}) => {
    if (!pointsRef.current) return
    if (initTime.current === null) initTime.current = clock.getElapsedTime();  // グローバル時間を記録
    
    // コンポーネント配置からの経過時間を計算
    const elapsed = clock.getElapsedTime() - initTime.current;
    // console.log(`Elapsed time: ${elapsed} seconds`)
    
    // すでに経過時間がdurationを超えたら完了
    if (elapsed > duration) {
      setIsCompleted(true) // 花火が完了したとフラグを設定
      console.log('Firework launching completed!')
      return // 以降の処理は行わない
    }
    
    // 現在の位置を計算
    const pos = from.clone().add(direction.clone().multiplyScalar(elapsed * velocity))

    // 軌跡を追加
    for (let i = 0; i < trailParticleCount; i++) {
      trailPositions.current.copyWithin(0, 3) // 先頭の3つの要素を削除
      const lastIndex = (maxTrailLength * trailParticleCount - 1) * 3
      trailPositions.current[lastIndex] = pos.x + gaussianRandom() * randomRange
      trailPositions.current[lastIndex + 1] = pos.y + gaussianRandom() * randomRange
      trailPositions.current[lastIndex + 2] = pos.z + gaussianRandom() * randomRange
    }

    // 更新を反映
    const positionAttr = pointsRef.current.geometry.attributes.position
    positionAttr.needsUpdate = true
    // pointsRef.current.geometry.setDrawRange(0, maxTrailLength) // 描画範囲を更新
  })


  return (
    <points ref={pointsRef}>
      <bufferGeometry />
      <pointsMaterial
        // attach="material"
        color={color}
        vertexColors={false}
        blending={THREE.AdditiveBlending}
        size={0.5}
        opacity={0.8}
        transparent={true} // 透明度を有効化
        // sizeAttenuation={true}  // サイズの減衰を有効化
        // depthWrite={false} // 深度書き込みを無効化(トレイルが重なっても消えないように)
      />
    </points>
  )
})

// 平均 `mean`、標準偏差 `stdDev` の正規分布に従う乱数を返す
function gaussianRandom(mean = 0, stdDev = 1): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // 0を除く
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}


export default Launching