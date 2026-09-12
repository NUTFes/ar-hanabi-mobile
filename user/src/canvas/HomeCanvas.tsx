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
  resetCameraRotation: () => void;
  setCurrentAsInitial: () => void;
  setCameraRotation: (euler: THREE.Euler) => void;
}

const HomeCanvas = forwardRef<HomeCanvasHandle, HomeCanvasProps>((props, ref) => {
  const { illustrationFireworks, particleData } = props;
  const homeSceneRef = useRef<HomeSceneHandle>(null);
  const canvasSetupRef = useRef<CanvasSetupHandle>(null);

  useImperativeHandle(ref, () => ({
    handleLaunch,
    resetCameraRotation,
    setCurrentAsInitial,
    setCameraRotation,
  }));

  const handleLaunch = () => {
    homeSceneRef.current?.handleLaunch();
  };

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
            gl={{ alpha: true }}
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
}

const CanvasSetup = forwardRef<CanvasSetupHandle>((_,  ref) => {
  const { scene, camera, gl } = useThree();

  const arData = useMemo(() => {
    return initializeAR(scene, camera, gl);
  }, [scene, camera, gl]);
  const { arToolkitSource } = arData;

  console.log('ARToolkitSource:', arToolkitSource);

  // AR.js側で登録したwindowのresizeリスナー等を、アンマウント時に解除する
  useEffect(() => {
    return () => arData.dispose();
  }, [arData]);

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
              mipmapBlur={true}
              // width/height を指定するとpostprocessing側でresolutionScaleが無視されるため
              // （Resolution.updateEffectiveSize()がpreferredWidth/Heightを優先する仕様）、
              // 指定しない。こうすることでBloomの解像度がdprと実際のcanvasサイズに追従する
              resolutionScale={window.devicePixelRatio > 2 ? 1.0 : 1.5}
          />
        </EffectComposer>
      </>
  );
});