import {
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import * as THREE from 'three';
import IllustrationFireworks from '../components/fireworks/Illustration/IllustrationFireworks';
import type { IllustrationFireworksType, ColorParticleData } from '../types/illustrationFireworksType';

interface HomeSceneProps {
  illustrationFireworks: IllustrationFireworksType | null;
  /** 画像から変換したカラーパーティクルデータ */
  particleData: ColorParticleData | null;
}

export type HomeSceneHandle = {
  handleLaunch: () => void;
};

const HomeScene = forwardRef<HomeSceneHandle, HomeSceneProps>((props, ref) => {
  const { particleData } = props;
  const explodingHeight = 10;

  const [fireworks, setFireworks] = useState<{ id: string; position: THREE.Vector3; color?: THREE.Color }[]>([]);

  useImperativeHandle(ref, () => ({ handleLaunch }));

  const handleLaunch = () => {
    if (!particleData) return;
    const id = crypto.randomUUID();
    const color = new THREE.Color(`hsl(${Math.random() * 360}, 100%, 50%)`);
    const position = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        -10,
        (Math.random() - 0.5) * 10
    );
    setFireworks((prev) => [...prev, { id, position, color }]);
  };

  const onFinished = (id: string) => {
    setFireworks((prev) => prev.filter((fw) => fw.id !== id));
  };

  if (!particleData) return null;

  return (
      <>
        {fireworks.map((fw) => (
            <IllustrationFireworks
                key={fw.id}
                from={fw.position}
                to={new THREE.Vector3(fw.position.x, fw.position.y + explodingHeight, fw.position.z)}
                color={fw.color}
                size={6}
                starSize={0.15}
                particleData={particleData}
                onComplete={() => onFinished(fw.id)}
            />
        ))}
      </>
  );
});

export default HomeScene;