import { useState } from 'react'
import {
  useSearchParams
} from 'react-router-dom'
import {
  useEffect,
  useRef,
} from 'react'
import type { IllustrationFireworksType } from '../types/illustrationFireworksType';
import type { ColorParticleData } from '../types/illustrationFireworksType';
import { imageUrlToParticles } from '../utils/imageToParticles';
import { toSameOriginUrl } from '../config/apiConfig';
import { useGetFireworkById } from '../apiClient/fireworks/myARProjectAPI';
import ScanModal from '../components/common/ScanModal';
import type { HomeCanvasHandle } from '../canvas/HomeCanvas';

import HomeCanvas from "../canvas/HomeCanvas";
import {
  overlayContainerStyle,
  panelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  statusPillStyle,
  errorPillStyle,
  qualityRowContainerStyle,
  qualityLabelStyle,
  qualityRowStyle,
  qualityButtonStyle,
} from './homeStyles';

// 画質レベル: 値が大きいほど画像を細かいグリッドに分解し、粒子数が増えて精細になる（その分重くなる）
const QUALITY_LEVELS = [
  { label: '低', resolution: 32 },
  { label: '中', resolution: 64 },
  { label: '高', resolution: 128 },
] as const;

// ===== Homeのページ =====
// ページではデータフェッチやローカルストレージの読み書きを行う
export default function Home() {
  // イラスト花火のメタデータ
  const [illustrationFireworks, setIllustrationFireworks] = useState<IllustrationFireworksType | null>(null);
  // 画像から変換したカラーパーティクルデータ
  const [particleData, setParticleData] = useState<ColorParticleData | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // 画質設定（画像を何×何のグリッドに分解するか）。既定は「中」
  const [resolution, setResolution] = useState(64);

  const [isOpen, setIsOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const homeCanvasRef = useRef<HomeCanvasHandle>(null);

  const currentId = searchParams.get('id') || '1';
  const validId = !isNaN(Number(currentId)) ? currentId : '1';

  const { data, isLoading, error } = useGetFireworkById(Number(validId), {
    query: {
      enabled: Boolean(validId) && !isNaN(Number(validId)) && Number(validId) > 0,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError') return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  });

  const onScan = (result: string) => {
    const id = result.match(/id=(\d+)/)?.[1] ?? null;
    if (id) {
      searchParams.set('id', id);
      setSearchParams(searchParams);
      setIsOpen(false);
    }
  };

  // IDが変わったらパーティクルデータをリセット
  useEffect(() => {
    setParticleData(null);
    setIllustrationFireworks(null);
  }, [validId]);

  // APIデータ取得後の処理（resolution 変更時も再変換）
  useEffect(() => {
    if (!data) return;

    const meta: IllustrationFireworksType = {
      id: data.id,
      isShareable: data.isShareable,
      imageUrl: data.imageUrl ?? null,
      createdAt: data.createdAt?.toString(),
      updatedAt: data.updatedAt?.toString(),
    };
    setIllustrationFireworks(meta);

    if (!data.imageUrl) {
      console.warn('imageUrl が null です（旧レコード）');
      return;
    }

    // 画像 → カラーパーティクル変換
    setIsConverting(true);
    imageUrlToParticles(toSameOriginUrl(data.imageUrl), {
      resolution, // 画質設定（低32 / 中64 / 高128）
      whiteThreshold: 200,
      saturationThreshold: 30,
      includeWhite: false,
    })
        .then((pd) => {
          setParticleData(pd);
          console.log(`パーティクル変換完了: ${pd.particles.length} 粒子`);
        })
        .catch((err) => {
          console.error('パーティクル変換失敗:', err);
        })
        .finally(() => {
          setIsConverting(false);
        });
  }, [data, resolution]);

  useEffect(() => {
    if (isLoading) console.log('Loading fireworks data...');
    else if (error) console.error('Error fetching fireworks data:', error);
  }, [isLoading, error]);

  const handleLaunch = () => {
    homeCanvasRef.current?.handleLaunch();
    resetCameraRotation();
  };

  const resetCameraRotation = () => {
    homeCanvasRef.current?.resetCameraRotation();
  };

  const isReady = !!particleData && !isConverting;

  return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <HomeCanvas
            illustrationFireworks={illustrationFireworks}
            particleData={particleData}
            ref={homeCanvasRef}
        />

        <div style={overlayContainerStyle}>
          <div style={panelStyle}>
            {/* 画質セレクタ（低32 / 中64 / 高128） */}
            <div style={qualityRowContainerStyle}>
              <span style={qualityLabelStyle}>画質</span>
              <div style={qualityRowStyle}>
                {QUALITY_LEVELS.map((level) => (
                    <button
                        key={level.resolution}
                        onClick={() => setResolution(level.resolution)}
                        disabled={isConverting}
                        style={qualityButtonStyle(resolution === level.resolution)}
                    >
                      {level.label}
                    </button>
                ))}
              </div>
            </div>

            {isLoading || isConverting ? (
                <div style={statusPillStyle}>
                  {isLoading ? '読み込み中...' : '画像を変換中...'}
                </div>
            ) : isReady ? (
                <>
                  <button onClick={handleLaunch} style={primaryButtonStyle}>
                    🎆 花火を打ち上げる
                  </button>
                  <button onClick={resetCameraRotation} style={secondaryButtonStyle}>
                    カメラのリセット
                  </button>
                </>
            ) : (
                <div style={errorPillStyle}>
                  花火が読み込めませんでした<br />
                  別のQRコードをスキャンしてください
                </div>
            )}

            {/* QRコードのスキャンはどの状態でも常に行えるようにする */}
            <button onClick={() => setIsOpen(true)} style={secondaryButtonStyle}>
              QRコードをスキャン
            </button>
          </div>
        </div>

        <ScanModal
            isOpen={isOpen}
            onScan={onScan}
            closeModal={() => setIsOpen(false)}
        />
      </div>
  );
}