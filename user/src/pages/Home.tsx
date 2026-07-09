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

// ===== Homeのページ =====
// ページではデータフェッチやローカルストレージの読み書きを行う
export default function Home() {
  // イラスト花火のメタデータ
  const [illustrationFireworks, setIllustrationFireworks] = useState<IllustrationFireworksType | null>(null);
  // 画像から変換したカラーパーティクルデータ
  const [particleData, setParticleData] = useState<ColorParticleData | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  /* DEBUG START - 解像度調整UI（削除するときはここから DEBUG END まで消す） */
  const [resolution, setResolution] = useState(64);
  const [pendingResolution, setPendingResolution] = useState(64);
  /* DEBUG END */

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
      resolution, /* DEBUG - 固定値に戻す場合は resolution を 64 などに変更 */
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

  const buttonStyle: React.CSSProperties = {
    width: '200px',
    padding: '4px 8px',
    fontSize: '16px',
    cursor: 'pointer',
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  };

  const isReady = !!particleData && !isConverting;

  return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <HomeCanvas
            illustrationFireworks={illustrationFireworks}
            particleData={particleData}
            ref={homeCanvasRef}
        />

        <button
            onClick={() => setIsOpen(true)}
            style={{ ...buttonStyle, bottom: '20px' }}
        >
          QRコードをスキャン
        </button>

        {isLoading || isConverting ? (
            <div style={{
              ...buttonStyle,
              bottom: '80px',
              backgroundColor: 'rgba(255,255,255,0.6)',
              textAlign: 'center',
            }}>
              {isLoading ? '読み込み中...' : '画像を変換中...'}
            </div>
        ) : isReady ? (
            <>
              <button
                  onClick={handleLaunch}
                  style={{
                    ...buttonStyle,
                    backgroundColor: '#f0b810ff',
                    bottom: '120px',
                  }}
              >
                花火を打ち上げる
              </button>
              <button
                  onClick={resetCameraRotation}
                  style={{ ...buttonStyle, bottom: '60px' }}
              >
                カメラのリセット
              </button>
            </>
        ) : (
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              width: 'auto',
              padding: '4px 8px',
              fontSize: '16px',
              position: 'absolute',
              bottom: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
            }}>
              花火が読み込めませんでした<br />
              別のQRコードをスキャンしてください
            </div>
        )}

        <ScanModal
            isOpen={isOpen}
            onScan={onScan}
            closeModal={() => setIsOpen(false)}
        />

        {/* DEBUG START - 解像度調整パネル（削除するときはここから DEBUG END まで消す） */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          backgroundColor: 'rgba(0,0,0,0.65)',
          color: 'white',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '13px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 1000,
        }}>
          <div style={{ fontWeight: 'bold' }}>🔧 解像度調整（DEBUG）</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>16</span>
            <input
                type="range"
                min={16}
                max={512}
                step={16}
                value={pendingResolution}
                onChange={(e) => setPendingResolution(Number(e.target.value))}
                style={{ width: '120px' }}
            />
            <span>512</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span>選択中: <strong>{pendingResolution}×{pendingResolution}</strong></span>
            <button
                onClick={() => setResolution(pendingResolution)}
                disabled={isConverting}
                style={{
                  padding: '2px 10px',
                  fontSize: '12px',
                  cursor: isConverting ? 'not-allowed' : 'pointer',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: '#f0b810',
                  fontWeight: 'bold',
                }}
            >
              {isConverting ? '変換中...' : '適用'}
            </button>
          </div>
          {particleData && (
              <div style={{ fontSize: '11px', opacity: 0.8 }}>
                現在: {resolution}×{resolution} / {particleData.particles.length} 粒子
              </div>
          )}
        </div>
        {/* DEBUG END */}
      </div>
  );
}