import { useEffect, useRef, useState } from 'react';
import { imageUrlToParticles } from '../utils/imageToParticles';
import type { ColorParticleData } from '../types/illustrationFireworksType';
import HomeCanvas from '../canvas/HomeCanvas';
import type { HomeCanvasHandle } from '../canvas/HomeCanvas';
import {
  overlayContainerStyle,
  panelStyle,
  launchButtonStyle,
  ghostButtonStyle,
  spinnerStyle,
  errorPillStyle,
} from './homeStyles';
import {
  guideContainerStyle,
  guideCardStyle,
  guideTitleStyle,
  guideTextStyle,
} from './demoStyles';

// デモで打ち上げる固定画像（public/ 配下のパス）。差し替えるときはここだけ変更する
const DEMO_IMAGE_URL = '/demo/45th_logo.png';

// AR花火の場所へ誘導する固定文言。文言変更はここだけ
const DEMO_GUIDE_TITLE = '講義棟201でAR花火開催中！';
const DEMO_GUIDE_TEXT = '描いた絵を花火にして打ち上げよう！';

// 画質（Home の「中」相当。デモでは固定）
const DEMO_RESOLUTION = 64;

// ===== Demoのページ =====
// API・QRコードを使わず、同梱の固定画像を花火として打ち上げるデモ用画面。
// user画面（Home）と同じ打ち上げ体験に加え、AR花火の場所へ誘導するテキストを表示する。
export default function Demo() {
  const [particleData, setParticleData] = useState<ColorParticleData | null>(null);
  const [isConverting, setIsConverting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const homeCanvasRef = useRef<HomeCanvasHandle>(null);

  // マウント時に固定画像をパーティクルへ変換する
  useEffect(() => {
    setIsConverting(true);
    imageUrlToParticles(DEMO_IMAGE_URL, {
      resolution: DEMO_RESOLUTION,
      whiteThreshold: 200,
      saturationThreshold: 30,
      whiteSaturationRatio: 0.2,
      includeWhite: false,
    })
      .then((pd) => {
        setParticleData(pd);
        console.log(`パーティクル変換完了: ${pd.particles.length} 粒子`);
      })
      .catch((err) => {
        console.error('パーティクル変換失敗:', err);
        setError('花火が読み込めませんでした');
      })
      .finally(() => {
        setIsConverting(false);
      });
  }, []);

  const handleLaunch = () => {
    homeCanvasRef.current?.handleLaunch();
    resetCameraRotation();
  };

  const resetCameraRotation = () => {
    homeCanvasRef.current?.resetCameraRotation();
  };

  const isReady = !!particleData && !isConverting;
  // 変換中も打ち上げボタンを表示したまま disabled にし、パネルの高さが変わらないようにする
  // （Home.tsx と同じ表示規約）
  const showLaunchButton = isConverting || isReady;

  return (
    <div className="hb-viewport-fill" style={{ width: '100vw', overflow: 'hidden' }}>
      <HomeCanvas
        illustrationFireworks={null}
        particleData={particleData}
        ref={homeCanvasRef}
      />

      {/* AR花火の場所へ誘導するテキスト（Demo画面のみの要素） */}
      <div style={guideContainerStyle}>
        <div style={guideCardStyle}>
          <div style={guideTitleStyle}>{DEMO_GUIDE_TITLE}</div>
          <div style={guideTextStyle}>{DEMO_GUIDE_TEXT}</div>
        </div>
      </div>

      <div style={overlayContainerStyle}>
        <div style={panelStyle}>
          {showLaunchButton ? (
            <button
              onClick={handleLaunch}
              disabled={!isReady}
              style={launchButtonStyle(!isReady)}
              className="hb-pressable hb-launch"
            >
              {!isReady && <span className="hb-spin" style={spinnerStyle} />}
              {isConverting ? '画像を変換中...' : '花火を打ち上げる'}
            </button>
          ) : (
            <div style={errorPillStyle}>{error ?? '花火が読み込めませんでした'}</div>
          )}

          {isReady && (
            <button onClick={resetCameraRotation} style={ghostButtonStyle} className="hb-pressable">
              カメラのリセット
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
