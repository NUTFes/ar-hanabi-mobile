import {
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useThree } from '@react-three/fiber';
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
  /** 画面をタップした位置（NDC: 左下 -1,-1 〜 右上 1,1）で花火を打ち上げる */
  launchAtNdc: (ndcX: number, ndcY: number) => void;
};

/** 打ち上げ中の1発分。打ち上げ位置・爆発位置・所要時間をここで確定させる */
type LaunchedFirework = {
  id: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  duration: number;
  color: THREE.Color;
};

// 打ち上げの開始Y座標。画面下部のコントロールパネルの裏から立ち上がってくる見え方になる
const LAUNCH_START_Y = -10;
// 爆発中心のY座標。カメラは (0,0,30) から回転無しで -Z 方向を見ているため、
// y=0 が画面中央に一致する。値を大きくすると上、小さくすると下で爆発する
const EXPLODING_CENTER_Y = 0;
// 打ち上げ（トレイル）の所要時間（秒）。爆発位置を引き上げた分、飛距離が伸びても
// 従来と近い速度感になるよう既定値（IllustrationFireworks側は2秒）より長めにする
const LAUNCH_DURATION = 3;

// タップ位置へ打ち上げるときの、カメラから爆発点までの距離。
// カメラの初期位置が (0,0,30) で爆発面が z=0 のため、既定の打ち上げと同じ見かけの大きさになる
const TAP_LAUNCH_DISTANCE = 30;
// タップ位置からどれだけ下で打ち上げを始めるか（NDC。画面の高さが2）。
// 元の実装（ワールドで14下）の見え方に合わせた値で、画面の上の方をタップしたときは
// 開始点が画面の中に入る。尾が生まれるところから見えるので、打ち上げがはっきり分かる
const TAP_LAUNCH_RISE_NDC = 1.2;
// ただし開始点はここより下にはしない。画面の下寄りをタップしたときに
// 開始点が画面のはるか外になり、上昇の大半が画面に入らないまま爆発するのを防ぐ
const TAP_LAUNCH_LOWEST_START_NDC_Y = -1.15;
// 上昇の速さ（NDC/秒）。元の実装（1.2NDCを2.2秒）と同じ見かけの速さ。
// 上昇量はタップ位置で変わるので、所要時間ではなく速さの方を固定する
const TAP_LAUNCH_SCREEN_SPEED = 0.55;
// 所要時間の下限・上限（秒）。一瞬で終わる尾や、待たされる打ち上げにならないよう抑える
const TAP_LAUNCH_MIN_DURATION = 0.6;
const TAP_LAUNCH_MAX_DURATION = 2.4;

const HomeScene = forwardRef<HomeSceneHandle, HomeSceneProps>((props, ref) => {
  const { particleData } = props;
  const { camera } = useThree();

  const [fireworks, setFireworks] = useState<LaunchedFirework[]>([]);

  useImperativeHandle(ref, () => ({ handleLaunch, launchAtNdc }));

  const randomColor = () => new THREE.Color(`hsl(${Math.random() * 360}, 100%, 50%)`);

  const handleLaunch = () => {
    if (!particleData) return;
    const from = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        LAUNCH_START_Y,
        (Math.random() - 0.5) * 10
    );
    const to = new THREE.Vector3(from.x, EXPLODING_CENTER_Y, from.z);
    addFirework({ from, to, duration: LAUNCH_DURATION });
  };

  const launchAtNdc = (ndcX: number, ndcY: number) => {
    if (!particleData) return;

    // 開始点・爆発点とも「画面上の位置（NDC）」で決める。
    //
    // ワールド座標で真上に上げると、カメラが傾いているときに画面では斜めに上がって
    // 見える（写真撮影モードは構図を保つためカメラの傾きをリセットしないので、
    // 端末モーションの傾きが溜まると必ずこうなる）。
    // 画面上の同じ列で上下に取れば、透視投影は直線を直線に写すため、
    // カメラがどう傾いていても画面上では必ず真下から真上へ上がる。
    //
    // 高さは「タップ位置の一定量下」。画面の上の方をタップしたときは開始点が画面の中に
    // 入るので、尾が生まれるところから見えて打ち上げがはっきり分かる。
    // 画面の下寄りをタップされたときだけ、開始点が画面のはるか外まで下がって
    // 上昇の大半が画面に入らなくなる（＝尾が見えない）ので、そこで打ち止めにする。
    const startNdcY = Math.max(
        ndcY - TAP_LAUNCH_RISE_NDC,
        TAP_LAUNCH_LOWEST_START_NDC_Y,
    );

    const to = ndcToWorld(ndcX, ndcY);
    const from = ndcToWorld(ndcX, startNdcY);
    const duration = THREE.MathUtils.clamp(
        (ndcY - startNdcY) / TAP_LAUNCH_SCREEN_SPEED,
        TAP_LAUNCH_MIN_DURATION,
        TAP_LAUNCH_MAX_DURATION,
    );
    addFirework({ from, to, duration });
  };

  const addFirework = ({ from, to, duration }: Omit<LaunchedFirework, 'id' | 'color'>) => {
    setFireworks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from, to, duration, color: randomColor() },
    ]);
  };

  /**
   * 画面上のNDC座標を、カメラの前方 TAP_LAUNCH_DISTANCE の位置のワールド座標に変換する。
   *
   * camera.unproject() は projectionMatrixInverse を使うが、この画面では AR.js が
   * projectionMatrix を直接差し替えており updateProjectionMatrix() を通らないため、
   * 逆行列が古いままになりうる。ここで毎回作り直して取り違えを防ぐ。
   */
  const ndcToWorld = (ndcX: number, ndcY: number): THREE.Vector3 => {
    const inverseProjection = new THREE.Matrix4().copy(camera.projectionMatrix).invert();
    // NDC → カメラ空間（applyMatrix4 が w 除算まで行う）
    const cameraSpace = new THREE.Vector3(ndcX, ndcY, 0.5).applyMatrix4(inverseProjection);
    const direction = cameraSpace.normalize().applyQuaternion(camera.quaternion).normalize();
    return camera.position.clone().add(direction.multiplyScalar(TAP_LAUNCH_DISTANCE));
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
                from={fw.from}
                to={fw.to}
                launchDuration={fw.duration}
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
