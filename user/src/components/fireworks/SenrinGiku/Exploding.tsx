// Firework.tsx
import { 
  useRef, 
  memo,
  useEffect,
  useState,
} from 'react'
import { 
  useFrame, 
} from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  color?: THREE.ColorRepresentation; // 花火の色
  position?: THREE.Vector3; // 花火の打ち上げの中心位置
  size?: number; // 花火のサイズ(パーティクルではなくて花弁の大きさ)
  starSize?: number; // 星のサイズ(パーティクルの大きさ)
  segments?: number; // 花火の分割数(星の数を決定するためのパラメータ)
  onComplete?: () => void; // 花火が終了したときのコールバック
}

// 千輪菊の花弁(5つの花弁が爆発する)
const SenrinGikuExploding =  memo(function SenrinGikuExploding({ 
  color = 'white', 
  position = new THREE.Vector3(0, 0, 0), 
  size = 0.7, 
  starSize = 0.7,
  segments = 10,
  onComplete = () => {}
}: Props) {
  // 分割数（星の数を決定するためのパラメータ）
  // const segments = 13
  // const segments = 9
  // 星の総数（分割数の二乗）
  const starParticleCount = segments * segments
  // 星のサイズ
  // const starSize = 0.7
  // 重力の強さ
  const gravity = 0.05
  // デフォルトの速度
  const defaultVelocity = 0.3
  // 花弁の数
  const petalsCount = 5;
  
  // 星のパーティクルを描画するための参照
  const starPointsRef = useRef<THREE.Points>(null)  // ポイントの参照
  const starPositions = useRef(new Float32Array(3 * starParticleCount * petalsCount)) // パーティクルの位置を格納する配列
  const starVelocities = useRef<THREE.Vector3[]>([]) // パーティクルの速度を格納する配列
  const initTime = useRef<number | null>(null) // シーンが配置されてからの時間を保持する変数
  
  const [isCompleted, setIsCompleted] = useState(false) // 花火の完了状態を管理

  // マウント時の処理とアンマウント時の処理
  useEffect(() => {
    // ====== マウント時の処理 ======
    // 星のパーティクルのジオメトリを初期化
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(starPositions.current, 3)
      .setUsage(THREE.DynamicDrawUsage) // 動的に更新するための設定
    )
    // ポイントのジオメトリを設定
    starPointsRef.current!.geometry = starGeometry
    
    // 各花弁のランダムなオフセットを生成
    const randomX = Array.from({ length: petalsCount }).map(() => (Math.random() - 0.5) * 50)
    const randomY = Array.from({ length: petalsCount }).map(() => (Math.random() - 0.5) * 50)

    // 星のパーティクルの初期化
    for (let i = 0, theta = 0; theta < 2 * Math.PI; theta += 2 * Math.PI / segments) {
      for (let phi = 0; phi < 2 * Math.PI; phi += 2 * Math.PI / segments) {
        for(let p = 0; p < petalsCount; p++) {
          // 初期座標
          starPositions.current[i * 3 + 0 + p * starParticleCount * 3] = position.x + randomX[p]  // X方向にランダムなオフセット
          starPositions.current[i * 3 + 1 + p * starParticleCount * 3] = position.y + randomY[p]  // Y方向にランダムなオフセット
          starPositions.current[i * 3 + 2 + p * starParticleCount * 3] = position.z
        }
        // 速度ベクトル
        starVelocities.current[i] = new THREE.Vector3(
          Math.sin(theta) * Math.cos(phi) * size,
          Math.cos(theta) * size,
          Math.sin(theta) * Math.sin(phi) * size
        ).multiplyScalar(defaultVelocity) // 速度を設定
        i++
      }
    }
    
    // ====== アンマウント時の処理 ======
    return () => {
      // コンポーネントがアンマウントされたときの処理
      if (starPointsRef.current) {
        // ジオメトリを解放
        starPointsRef.current.geometry.dispose()
        // マテリアルも解放
        if (Array.isArray(starPointsRef.current.material)) {
          starPointsRef.current.material.forEach((mat) => mat.dispose())
        } else {
          starPointsRef.current.material.dispose()
        }
      }
    }
  }, [])
  
  useEffect(() => {
    // 花火が完了したときの処理
    if (isCompleted) {
      onComplete()
    }
  }, [isCompleted, onComplete])

  // フレームごとの更新
  useFrame(({clock}) => {
    if (!starPointsRef.current) return // 存在しなければ何もしない
    if (initTime.current === null) initTime.current = clock.getElapsedTime();  // グローバル時間を記録
    
    // コンポーネント配置からの経過時間を計算
    const elapsed = clock.getElapsedTime() - initTime.current;
    
    // すでに経過時間規定値を超えたら完了
    if (elapsed > 4) {
      setIsCompleted(true) // 花火が完了したとフラグを設定
      return // 以降の処理は行わない
    }
    
    // 透明度や速度を減少していく
    const material = starPointsRef.current.material as THREE.PointsMaterial
    material.opacity = Math.max(0, material.opacity - 0.005)    // 透明度を減少
    starVelocities.current.forEach(v => v.multiplyScalar(0.98)) // 速度を減衰

    // 各星のパーティクルの位置を更新
    for (let i = 0; i < starParticleCount; i++) {
      if (!starVelocities.current[i]) continue // 安全性チェック

      // 速度を計算
      const vx = starVelocities.current[i].x
      const vy = starVelocities.current[i].y - gravity // 重力を適用
      const vz = starVelocities.current[i].z
      
      // 各花弁の位置を更新
      for(let p = 0; p < petalsCount; p++) {
        starPositions.current[i * 3 + 0 + p * starParticleCount * 3] += vx
        starPositions.current[i * 3 + 1 + p * starParticleCount * 3] += vy
        starPositions.current[i * 3 + 2 + p * starParticleCount * 3] += vz
      }
    }
    
    // 更新を反映
    const starPosAttr = starPointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    starPosAttr.needsUpdate = true
  })

  return (
    <>
      <points ref={starPointsRef}>
        <bufferGeometry />
        <pointsMaterial
          size={starSize}
          color={color}
          vertexColors={false}
          depthWrite={false}
          // opacity={starOpacity.current}
          transparent={true}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  )
})

export default SenrinGikuExploding
