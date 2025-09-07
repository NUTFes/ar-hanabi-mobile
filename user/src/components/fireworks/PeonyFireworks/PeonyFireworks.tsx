import { 
  // useRef, 
  useState,
  memo,
  useEffect,
} from 'react'
// import { 
//   useFrame, 
// } from '@react-three/fiber'
import * as THREE from 'three'
import Launching from '../Launching.tsx' // 打ち上げ時のトレイルを描画するコンポーネント
import PeonyExploding from './Exploding.tsx'

interface FireworkProps {
  color?: THREE.ColorRepresentation; // 花火の色
  from?: THREE.Vector3 // 花火の打ち上げの始点
  to?: THREE.Vector3 // 花火の打ち上げの終点
  size?: number; // 花火のサイズ
  layers?: number; // 花弁の層数
  isSoundEnabled?: boolean // 音の有無
  onComplete?: () => void; // 花火が終了したときのコールバック
}

// 1層の牡丹花火
const PeonyFireworks =  memo(function PeonyFireworks({ 
  color = 'white', 
  from = new THREE.Vector3(0, 0, 0),
  to = new THREE.Vector3(0, 1, 0), // 上方向に打ち上げ
  size = 1, 
  layers = 1, // 花弁の層数
  isSoundEnabled = true,
  onComplete = () => {}
}: FireworkProps) {
  // const initTime = useRef<number | null>(null) // シーンが配置されてからの時間を保持する変数
  const baseColor = new THREE.Color(color)
  const [isLaunching, setIsLaunching] = useState(true) // 打ち上げ中かどうかのフラグ
  const [isExploding, setIsExploding] = useState(false) // 爆発中かどうかのフラグ
  const [isCompleted, setIsCompleted] = useState(false) // 花火の完了状態を管理

  // マウント時の処理とアンマウント時の処理
  // useEffect(() => {
  //   // ====== マウント時の処理 ======
    
  //   // ====== アンマウント時の処理 ======
  // }, [])
  
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
            console.log('Firework launching completed!')
          }}
        />
      )}
      {isExploding && (
        // layersの回数分、牡丹花火を描画
        <>
          {Array.from({ length: layers }).map((_, i) => (
            <PeonyExploding
              key={i}
              // 1層ごとに色相を変化させる
              color={shiftHue(baseColor, i * 120)}
              position={to}
              size={size / (i / 1 + 1)}
              onComplete={() => {
              setIsExploding(false); // 爆発完了
              setIsCompleted(true);  // 花火が完了したとフラグを設定
              console.log('Firework exploding completed!')
            }}
          />
          ))}
        </>
      )}
    </>
  )
})

// 色相をシフトする関数
function shiftHue(color: THREE.Color, degrees: number) {
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl) // RGB → HSL に変換
  hsl.h = (hsl.h + degrees / 360) % 1 // 0〜1 の範囲で hue を加算
  if (hsl.h < 0) hsl.h += 1
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l)
}

export default PeonyFireworks