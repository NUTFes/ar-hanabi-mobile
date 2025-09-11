import { 
  useState,
  memo,
  useEffect,
  useRef,
} from 'react'
import * as THREE from 'three'
import Launching from '../Launching.tsx' // 打ち上げ時のトレイルを描画するコンポーネント
// import PeonyExploding from '../PeonyFireworks/Exploding.tsx'
import SenrinGikuExploding from './Exploding.tsx'

interface FireworkProps {
  color?: THREE.ColorRepresentation; // 花火の色
  from?: THREE.Vector3 // 花火の打ち上げの始点
  to?: THREE.Vector3 // 花火の打ち上げの終点
  // size?: number; // 花火の半径
  petalCount?: number; // 花弁の数(各花弁は5つに分割される)
  petalSize?: number; // 花弁のサイズ
  petalStarSize?: number; // 花弁の星のサイズ
  petalSegments?: number; // 花弁の分割数(星の数を決定するためのパラメータ)
  isSoundEnabled?: boolean // 音の有無
  onComplete?: () => void; // 花火が終了したときのコールバック
}

type Petals = {
  position: THREE.Vector3;
  color: THREE.Color;
}

// 1層の牡丹花火
const SenrinGikuFireworks =  memo(function SenrinGikuFireworks({ 
  color = 'white', 
  from = new THREE.Vector3(0, 0, 0),
  to = new THREE.Vector3(0, 1, 0), // 上方向に打ち上げ
  // size = 0.3,
  petalCount = 4, // 花弁の数
  petalSize = 0.4, // 花弁のサイズ
  petalStarSize = 0.7, // 花弁の星のサイズ
  petalSegments = 10, // 花弁の分割数(星の数を決定するためのパラメータ)
  isSoundEnabled = true,
  onComplete = () => {}
}: FireworkProps) {
  const [isLaunching, setIsLaunching] = useState(true) // 打ち上げ中かどうかのフラグ
  const [isExploding, setIsExploding] = useState(false) // 爆発中かどうかのフラグ
  const [isCompleted, setIsCompleted] = useState(false) // 花火の完了状態を管理
  // 各花弁の位置と色を管理する配列
  const petals = useRef(Array<Petals>(petalCount))
  
  // マウント時の処理とアンマウント時の処理
  useEffect(() => {
    // ====== マウント時の処理 ======
    // 千輪菊の各花弁の位置と色を初期化
    petals.current = Array.from({ length: petalCount }).map((_) => ({
      position: to,
      // ランダムな色を作成
      color: new THREE.Color().setHSL(Math.random(), 0.95, 0.5),
    }))
    console.log('SenrinGiku petals:', petals.current)

    // ====== アンマウント時の処理 ======
  }, [])
  console.log('SenrinGikuFireworks render:', { isLaunching, isExploding, isCompleted })
  
  // 花火が完了したときの処理
  useEffect(() => {
    if (isCompleted) {
      onComplete()
    }
  }, [isCompleted, onComplete])

  // フレームごとの更新
  // useFrame(({clock}) => {
  //   if (initTime.current === null) initTime.current = clock.getElapsedTime();  // グローバル時間を記録
    
  //   // コンポーネント配置からの経過時間を計算
  //   const elapsed = clock.getElapsedTime() - initTime.current;
  // })

  return (
    <>
      {isLaunching && (
        <Launching
          from={from}
          to={to}
          duration={2} // 打ち上げの時間
          color={color}
          isSoundEnabled={isSoundEnabled}
          onComplete={() => {
            setIsLaunching(false); // 打ち上げ完了
            setIsExploding(true); // 爆発フェーズに移行
            console.log('SenrinGiku launching completed!')
          }}
        />
      )}
      {isExploding && (
        // petalsを全て描画
        <>
          {Array.from({ length: petalCount }).map((_, i) => (
            <SenrinGikuExploding
              key={i}
              size={petalSize}
              starSize={petalStarSize}
              segments={petalSegments}
              color={petals.current[i].color}
              position={new THREE.Vector3(
                petals.current[i].position.x,
                petals.current[i].position.y,
                petals.current[i].position.z
              )}
              onComplete={() => {
                setIsExploding(false); // 爆発完了
                setIsCompleted(true);  // 花火が完了したとフラグを設定
                console.log('SenrinGiku exploding completed!')
              }}
            />
          ))}
        </>
      )}
    </>
  )
})

export default SenrinGikuFireworks