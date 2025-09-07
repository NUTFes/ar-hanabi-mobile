import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { 
  Suspense,
  useEffect,
  useMemo,
  forwardRef, 
  useImperativeHandle, 
  useRef,
} from 'react'
import { 
  Canvas,
  useThree,
} from '@react-three/fiber'
import { initializeAR } from '../lib/ar-setup';
import * as THREE from 'three';
import FinaleScene from '../scenes/FinaleScene';
import type { IllustrationFireworksType } from '../types/illustrationFireworksType';
import { useDeviceMotionCamera } from './hooks/useDeviceMotionCamera';
import type { FinaleSceneHandle } from '../scenes/FinaleScene';

interface FinaleCanvasProps {
  illustrationFireworks: IllustrationFireworksType | null; // イラスト花火のデータ（44ロゴ用）
}

// コンポーネントの外部から呼び出せる関数を定義
export type FinaleCanvasHandle = {
  // フィナーレ制御
  startFinale: () => void;        // フィナーレ開始
  pauseFinale: () => void;        // フィナーレ一時停止
  resetFinale: () => void;        // フィナーレリセット
  getCurrentTime: () => number;   // 現在時刻を取得
  getTotalDuration: () => number; // 総時間を取得
  getProgress: () => number;      // 進行状況を取得(0-100%)
  isPlaying: () => boolean;       // 再生中かどうか
  
  // カメラ制御
  resetCameraRotation: () => void;                    // カメラの回転をリセット
  setCurrentAsInitial: () => void;                    // 現在のカメラの回転を初期値として設定
  setCameraRotation: (euler: THREE.Euler) => void;   // 特定の回転に設定
}

// ===== FinaleCanvas =====
// Three.jsの「土台構成」を行い、FinaleSceneを配置する
// - カメラ
// - ライト
// - レンダラー（マルチレンダーやポストプロセス）
// - AR初期化
// - デバイスモーション連携
const FinaleCanvas = forwardRef<FinaleCanvasHandle, FinaleCanvasProps>(( props, ref) => {
  console.log('FinaleCanvas rendered');
  const { illustrationFireworks } = props;
  const finaleSceneRef = useRef<FinaleSceneHandle>(null);
  const canvasSetupRef = useRef<CanvasSetupHandle>(null);

  // コンポーネントの外部から呼び出せる関数を定義
  useImperativeHandle(ref, () => ({
    // フィナーレ制御関数をFinaleSceneに委譲
    startFinale: () => finaleSceneRef.current?.startFinale(),
    pauseFinale: () => finaleSceneRef.current?.pauseFinale(),
    resetFinale: () => finaleSceneRef.current?.resetFinale(),
    getCurrentTime: () => finaleSceneRef.current?.getCurrentTime() ?? 0,
    getTotalDuration: () => finaleSceneRef.current?.getTotalDuration() ?? 0,
    getProgress: () => finaleSceneRef.current?.getProgress() ?? 0,
    isPlaying: () => finaleSceneRef.current?.isPlaying() ?? false,
    
    // カメラ制御関数をCanvasSetupに委譲
    resetCameraRotation: () => canvasSetupRef.current?.resetCameraRotation(),
    setCurrentAsInitial: () => canvasSetupRef.current?.setCurrentAsInitial(),
    setCameraRotation: (euler: THREE.Euler) => canvasSetupRef.current?.setCameraRotation(euler),
  }));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas 
        gl={{ alpha: true }}                  // 背景を透明にするためにalphaをtrueに設定
        style={{ background: 'transparent' }} // 背景を透明に設定
        // camera={{ position: [0, 0, 30], fov: 50 }} // カメラの初期位置と視野角を設定
      >
        <Suspense fallback={null}>
          <CanvasSetup 
            ref={canvasSetupRef}
          />
          {illustrationFireworks && (
            <FinaleScene
              illustrationFireworks={illustrationFireworks} // イラスト花火のデータを渡す
              ref={finaleSceneRef} // FinaleSceneへの参照を渡す
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  )
});

export default FinaleCanvas;

// コンポーネントの外部から呼び出せる関数を定義
export type CanvasSetupHandle = {
  resetCameraRotation: () => void;                    // カメラの回転をリセット
  setCurrentAsInitial: () => void;                    // 現在のカメラの回転を初期値として設定
  setCameraRotation: (euler: THREE.Euler) => void;   // 特定の回転に設定
}

// Canvasの初期設定(useThreeはcanvas内でのみ使用可能なため切り分けている)
const CanvasSetup = forwardRef<CanvasSetupHandle>(( _, ref) => {
  // THREE.Scene, THREE.Camera, THREE.WebGLRendererを取得
  const { scene, camera, gl } = useThree();
  
  // ARの初期化（video要素を受け取る）
  const arData = useMemo(() => {
    try {
      return initializeAR(scene, camera, gl);
    } catch (error) {
      console.error('AR initialization failed:', error);
      return null;
    }
  }, [scene, camera, gl]);
  
  // ARが初期化された場合のログ出力
  useEffect(() => {
    if (arData) {
      console.log('AR initialized for FinaleCanvas:', {
        arToolkitSource: arData.arToolkitSource,
        videoElement: arData.videoElement
      });
    }
  }, [arData]);
  
  // カメラの位置を設定
  useEffect(() => {
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0); // 原点を見るように設定
  }, [camera]);
  
  // デバイスの回転を検知してカメラを動かすフックを使用
  const { resetCameraRotation, setCurrentAsInitial, setCameraRotation } = useDeviceMotionCamera(
    0.7, // 感度
    new THREE.Euler(0, 0, 0) // 初期回転（水平方向）
  );

  // コンポーネントの外部から呼び出せる関数を定義
  useImperativeHandle(ref, () => ({
    resetCameraRotation,
    setCurrentAsInitial,
    setCameraRotation,
  }));
  
  // 色空間とトーンマッピングの設定（フィナーレ用に最適化）
  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace; // 色空間をsRGBに設定
    gl.toneMapping = THREE.ACESFilmicToneMapping; // トーンマッピングをACESToneMappingに設定
    gl.toneMappingExposure = 1.2; // フィナーレ用に露出を少し上げる
    gl.shadowMap.enabled = false; // フィナーレでは影は不要なので無効化してパフォーマンス向上
  }, [gl]);

  return (
    <>
      {/* メインライト（フィナーレ用に明るめ） */}
      <pointLight
        position={[10, 20, 10]} // 高い位置に配置
        intensity={3}           // 通常より強めの光
        distance={100}          // 広い範囲をカバー
        decay={1}               // 光の減衰率
        color="white"           // 光の色
      />
      
      {/* サブライト（全体を明るく） */}
      <pointLight
        position={[-10, 10, -10]} // 反対側からも照射
        intensity={2}             // サブライトは控えめ
        distance={80}             // メインより狭い範囲
        decay={1}
        color="#ffffcc"           // 少し暖色系
      />
      
      {/* 環境光（フィナーレの夜空を演出） */}
      <ambientLight
        intensity={0.3}  // 控えめな環境光で夜空の雰囲気
        color="#001122"  // 深い青色で夜空を表現
      />

      {/* Unreal Bloom（フィナーレ用に強化） */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.1}    // より低い閾値で多くの花火が光る
          luminanceSmoothing={0.3}    // 滑らかなブルーム
          intensity={1.0}             // フィナーレ用に強めのブルーム
          width={window.innerWidth}   // ブルームの幅
          height={window.innerHeight} // ブルームの高さ
          mipmapBlur={true}           // ミップマップを使用
          resolutionScale={1.5}       // 高解像度でより美しく
        />
      </EffectComposer>
    </>
  )
});
