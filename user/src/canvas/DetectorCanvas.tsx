import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { 
  Suspense,
  useState,
  useRef,
  useEffect,
  useMemo,
} from 'react'
import { Html } from '@react-three/drei'
import { 
  Canvas,
  useThree,
} from '@react-three/fiber'
import { initializeAR } from '../lib/ar-setup';
import * as THREE from 'three';
import DetectorScene from '../scenes/DetectorScene';
import type { DetectorSceneHandle } from '../scenes/DetectorScene';
import { useJumpDetector } from './hooks/useJumpDetector';

// ===== DetectorCanvas =====
// ジャンプを検出して、花火を打ち上げる
// Three.jsの「土台構成」を行う
// - カメラ
// - ライト
// - レンダラー（マルチレンダーやポストプロセス）
// - orbit controls などの操作系
// - MediaPipe連携（Webカメラ映像→Three.jsへ）
export default function DetectorCanvas() {
  console.log('DetectorCanvas rendered');
  
  // DetectorSceneの参照を保持
  const detectorSceneRef = useRef<DetectorSceneHandle>(null);
  
  // ジャンプ検出時の処理
  const onDetect = (
    jumpPosition: number | null = null, // ジャンプ位置を受け取る
  ) => {
    // DetectorSceneの花火を打ち上げる関数を呼び出す
    detectorSceneRef.current?.handleLaunch(jumpPosition);
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* R3F用のCanvas */}
      <Canvas 
        gl={{ alpha: true }}                  // 背景を透明にするためにalphaをtrueに設定
        style={{ background: 'transparent' }} // 背景を透明に設定
        // camera={{ position: [0, 0, 30], fov: 50 }} // カメラの初期位置と視野角を設定
      >
        <Suspense fallback={null}>
          <CanvasSetup 
            onDetectJump={onDetect}
          />
          <DetectorScene
            ref={detectorSceneRef}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

interface CanvasSetupProps {
  onDetectJump: (jumpPosition: number | null) => void; // ジャンプ検出時のコールバック
}

// Canvasの初期設定(useThreeはcanvas内でのみ使用可能なため切り分けている)
const CanvasSetup = ({ onDetectJump }: CanvasSetupProps) => {
  // THREE.Scene, THREE.Camera, THREE.WebGLRendererを取得
  const { scene, camera, gl } = useThree();
  // MediaPipe用のCanvas要素を保持
  const mediaPipeCanvasRef = useRef<HTMLCanvasElement>(null);
  // ジャンプしたかどうかの状態
  // const [isJumped, setIsJumped] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false); // Canvas準備状態を管理
  
  // ARの初期化（video要素を受け取る）
  const arData = useMemo(() => {
    return initializeAR(scene, camera, gl);
  }, [scene, camera, gl]);
  const { arToolkitSource, arToolkitContext, markerRoot, videoElement, videoTexture } = arData;

  console.log('ARToolkitSource:', arToolkitSource);

  // AR.js側で登録したwindowのresizeリスナー等を、アンマウント時に解除する
  useEffect(() => {
    return () => arData.dispose();
  }, [arData]);

  // カメラの位置を設定
  useEffect(() => {
    camera.position.set(0, 0, 30);
  }, [camera]);
  
  // Canvas要素の準備を監視し、準備完了まで待機
  useEffect(() => {
    const checkCanvasReady = () => {
      if (mediaPipeCanvasRef.current) {
        console.log('✅ Canvas is ready:', mediaPipeCanvasRef.current);
        setIsCanvasReady(true); // 再描画のために状態を更新
      } else {
        console.log('⚠️ Canvas is not ready yet, retrying...');
        // 100ms後に再チェック
        setTimeout(checkCanvasReady, 100);
      }
    };

    // 初回チェック
    checkCanvasReady();
  }, []); // 依存配列を空にして初回のみ実行
  
  // ジャンプを検出するフックを使用
  useJumpDetector({
    videoElement: videoElement, // MediaPipeのビデオ要素を渡す
    canvasElement: isCanvasReady ? mediaPipeCanvasRef.current : null, // Canvas準備完了後に渡す
    onJump: (jumpPosition) => {
      // ジャンプ状態を更新
      // setIsJumped(true);
      console.log('ジャンプ検出！');
      
      // ジャンプした位置を打ち上げ位置に変換
      const launchPositionX = jumpPosition ? (jumpPosition - 0.5) * window.innerWidth / 30 : null;  // 画面幅を考慮
      console.log('Window Width:', window.innerWidth);
      console.log('Jump Position:', jumpPosition);
      console.log('Launch position X:', launchPositionX);

      // ジャンプ検出時のコールバックを呼び出す
      onDetectJump(launchPositionX);
      // setTimeout(() => setIsJumped(false), 500);  // ジャンプ状態を500msでリセット
    },
  });

  // 色空間とトーンマッピングの設定
  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;   // 色空間をsRGBに設定
    gl.toneMapping = THREE.ACESFilmicToneMapping; // トーンマッピングをACESToneMappingに設定(くっきりした色合いになる)
    gl.toneMappingExposure = 1; // ブルームが映えるように露出を調整(ブルームの強さを調整)
  }, [gl]);

  return (
    <>
      {/* ポイントライト */}
      <pointLight
        position={[10, 10, 10]} // 光源の位置
        intensity={2}           // 光の強さ
        distance={50}           // 光の届く距離
        decay={1}               // 光の減衰率
        color="white"           // 光の色
        // castShadow           // 影を落とす
      />
      
      {/* 環境光 */}
      {/* <ambientLight
        intensity={10} // 環境光の強さ
        color="white"  // 環境光の色
      /> */}

      {/* Unreal Bloom */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}    // ブルームがかかる明るさの閾値 (調整: 低いほど光る)
          luminanceSmoothing={0.2}    // ブルームのスムージング(調整: 1.0で滑らか)
          intensity={1.5}             // bloomの強さ
          // width={window.innerWidth}    // ブルームの幅
          // height={window.innerHeight}  // ブルームの高さ
          // mipmapBlur={true}            // ミップマップを使用してブルームを適用
          // resolutionScale={1.5}        // 解像度を上げる（デフォルト1）
        />
      </EffectComposer>
      
      {/* MediaPipe用のCanvas */}
      <Html>
        <canvas
          ref={mediaPipeCanvasRef}    // MediaPipeのCanvas要素を保持
          width={window.innerWidth}   // MediaPipeのCanvasの幅を画面幅に合わせる
          height={window.innerHeight} // MediaPipeのCanvasの高さを画面高さに合わせる
          style={{ 
            position: 'absolute',
            top: -window.innerHeight / 2, // 中央に配置
            left: -window.innerWidth / 2, // 中央に配置
            pointerEvents: 'none',        // Canvasを絶対配置し、クリックイベントを無効化
            background: 'transparent',    // 背景を透明に設定
          }}
        />
      </Html>
      
      {/* {isJumped && 
        <Html>
          <div style={{ color: 'green' }}>ジャンプ検出！</div>
        </Html>
      } */}
    </>
  )
}