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

  useEffect(() => {
    camera.position.set(0, 0, 30);
  }, [camera]);

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
              width={window.innerWidth}
              height={window.innerHeight}
              mipmapBlur={true}
              resolutionScale={window.devicePixelRatio > 2 ? 1.0 : 1.5}
          />
        </EffectComposer>
      </>
  );
});