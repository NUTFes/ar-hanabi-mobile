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
import HomeScene from '../scenes/HomeScene';
import type { IllustrationFireworksType, ColorParticleData } from '../types/illustrationFireworksType';
import { useDeviceMotionCamera } from './hooks/useDeviceMotionCamera';
import type { HomeSceneHandle } from '../scenes/HomeScene';

interface HomeCanvasProps {
  illustrationFireworks: IllustrationFireworksType | null;
  /** 画像から変換したカラーパーティクルデータ */
  particleData: ColorParticleData | null;
}

export type HomeCanvasHandle = {
  handleLaunch: () => void;
  /** 画面をタップした位置（NDC: 左下 -1,-1 〜 右上 1,1）で花火を打ち上げる */
  launchAtNdc: (ndcX: number, ndcY: number) => void;
  resetCameraRotation: () => void;
  setCurrentAsInitial: () => void;
  setCameraRotation: (euler: THREE.Euler) => void;
  /** 写真・動画の合成に使う、ARカメラ映像のvideo要素と花火のWebGL canvas */
  getCaptureSources: () => { video: HTMLVideoElement | null; gl: HTMLCanvasElement | null };
}

const HomeCanvas = forwardRef<HomeCanvasHandle, HomeCanvasProps>((props, ref) => {
  const { illustrationFireworks, particleData } = props;
  const homeSceneRef = useRef<HomeSceneHandle>(null);
  const canvasSetupRef = useRef<CanvasSetupHandle>(null);

  useImperativeHandle(ref, () => ({
    handleLaunch,
    launchAtNdc,
    resetCameraRotation,
    setCurrentAsInitial,
    setCameraRotation,
    getCaptureSources,
  }));

  const handleLaunch = () => {
    homeSceneRef.current?.handleLaunch();
  };

  const launchAtNdc = (ndcX: number, ndcY: number) => {
    homeSceneRef.current?.launchAtNdc(ndcX, ndcY);
  };

  // 撮影時に合成する2枚（カメラ映像と花火）。どちらもAR初期化後に揃うため、都度取り直す
  const getCaptureSources = () => ({
    video: canvasSetupRef.current?.getVideoElement() ?? null,
    gl: canvasSetupRef.current?.getGLCanvas() ?? null,
  });

  const resetCameraRotation = () => {
    canvasSetupRef.current?.resetCameraRotation();
  };

  const setCurrentAsInitial = () => {
    canvasSetupRef.current?.setCurrentAsInitial();
  };

  const setCameraRotation = (euler: THREE.Euler) => {
    canvasSetupRef.current?.setCameraRotation(euler);
  };

  return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Canvas
            // preserveDrawingBuffer: 写真撮影モードで canvas を drawImage するとき、
            // 描画バッファが毎フレーム破棄されると花火が写らず透明になってしまうため保持する
            gl={{ alpha: true, preserveDrawingBuffer: true }}
            style={{ background: 'transparent' }}
        >
          <Suspense fallback={null}>
            <CanvasSetup ref={canvasSetupRef} />
            {/* particleData が揃った時点でシーンをマウント */}
            {particleData && (
                <HomeScene
                    illustrationFireworks={illustrationFireworks}
                    particleData={particleData}
                    ref={homeSceneRef}
                />
            )}
          </Suspense>
        </Canvas>
      </div>
  );
});

export default HomeCanvas;

export type CanvasSetupHandle = {
  resetCameraRotation: () => void;
  setCurrentAsInitial: () => void;
  setCameraRotation: (euler: THREE.Euler) => void;
  getVideoElement: () => HTMLVideoElement | null;
  getGLCanvas: () => HTMLCanvasElement | null;
}

const CanvasSetup = forwardRef<CanvasSetupHandle>((_,  ref) => {
  const { scene, camera, gl } = useThree();

  const arData = useMemo(() => {
    return initializeAR(scene, camera, gl);
  }, [scene, camera, gl]);
  const { arToolkitSource, videoElement } = arData;

  console.log('ARToolkitSource:', arToolkitSource);

  useEffect(() => {
    camera.position.set(0, 0, 30);
  }, [camera]);

  // WebGLコンテキストロスト（GPUリセットやビューポート変更等で発生しうる）に対して
  // 何もハンドリングしないと、ブラウザは既定でコンテキストを復元しようとしない。
  // preventDefault() で「復元を試みる」意思を明示し、致命的なクラッシュに繋がるのを防ぐ。
  useEffect(() => {
    const canvasEl = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost. Waiting for restoration...');
    };
    const handleContextRestored = () => {
      console.info('WebGL context restored.');
    };
    canvasEl.addEventListener('webglcontextlost', handleContextLost, false);
    canvasEl.addEventListener('webglcontextrestored', handleContextRestored, false);
    return () => {
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);
      canvasEl.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl]);

  const { resetCameraRotation, setCurrentAsInitial, setCameraRotation } = useDeviceMotionCamera(0.7);

  useImperativeHandle(ref, () => ({
    resetCameraRotation,
    setCurrentAsInitial,
    setCameraRotation,
    getVideoElement: () => videoElement ?? null,
    getGLCanvas: () => gl.domElement,
  }));

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
  }, [gl]);

  return (
      <>
        <pointLight
            position={[10, 10, 10]}
            intensity={2}
            distance={50}
            decay={1}
            color="white"
        />
        <EffectComposer>
          <Bloom
              luminanceThreshold={0.2}
              luminanceSmoothing={0.2}
              intensity={0.6}
              width={window.innerWidth}
              height={window.innerHeight}
              mipmapBlur={true}
              resolutionScale={window.devicePixelRatio > 2 ? 1.0 : 1.5}
          />
        </EffectComposer>
      </>
  );
});