import { useState, useEffect, useRef } from 'react'
import { 
  useSearchParams
} from 'react-router-dom'
import type { IllustrationFireworksType } from '../types/illustrationFireworksType';
import { 
  loadIllustrationFireworksFromLocalStorage,
  saveIllustrationFireworksToLocalStorage
} from '../lib/localstorage';
import { useGetFireworkById } from '../apiClient/fireworks/myARProjectAPI';
import ScanModal from '../components/common/ScanModal';
import type { FinaleCanvasHandle } from '../canvas/FinaleCanvas';
import { formatTime } from '../hooks/useFinaleTimer';

import FinaleCanvas from "../canvas/FinaleCanvas";

// ===== Finale のページ =====
// フィナーレ花火大会のページ
// タイムライン制御UI、カメラ制御UI、QRスキャン機能を提供
export default function Finale() {
  // イラスト花火のデータを管理する状態
  const [illustrationFireworks, setIllustrationFireworks] = useState<IllustrationFireworksType | null>(null)
  // モーダルの開閉状態を管理する状態
  const [isOpen, setIsOpen] = useState(false)
  // フィナーレの再生状態を管理
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [progress, setProgress] = useState(0)
  
  // クエリパラメータを管理する状態
  const [searchParams, setSearchParams] = useSearchParams()
  // FinaleCanvasへの参照を作成
  const finaleCanvasRef = useRef<FinaleCanvasHandle>(null);

  // URLパラメータからIDを取得（デフォルトは '0' - 44ロゴ用）
  const currentId = searchParams.get('id') || '1'
  const validId = !isNaN(Number(currentId)) ? currentId : '1'
  console.log('ID from URL for Finale:', validId)
  
  // APIから花火データを取得（条件付きで有効化）
  const { data, isLoading, error } = useGetFireworkById(Number(validId), {
    query: {
      enabled: Boolean(validId) && !isNaN(Number(validId)) && Number(validId) >= 0,
      staleTime: 5 * 60 * 1000, // 5分間キャッシュ
      gcTime: 10 * 60 * 1000, // 10分間メモリに保持
      retry: (failureCount, error) => {
        // AbortErrorの場合はリトライしない
        if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError') return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  })
  
  // 定期的にフィナーレの状態を更新
  useEffect(() => {
    if (!finaleCanvasRef.current) return;
    
    const updateInterval = setInterval(() => {
      const canvas = finaleCanvasRef.current;
      if (canvas) {
        setIsPlaying(canvas.isPlaying());
        setCurrentTime(canvas.getCurrentTime());
        setTotalDuration(canvas.getTotalDuration());
        setProgress(canvas.getProgress());
      }
    }, 100); // 100ms間隔で更新
    
    return () => clearInterval(updateInterval);
  }, []);
  
  // QRコードスキャン時のコールバック関数
  const onScan = (result: string) => {
    let id = result.match(/id=(\d+)/)?.[1] ?? null; // 正規表現でIDを抽出
    if (id) {
      console.log('QR Code ID for Finale:', id);
      // URLのクエリパラメータを更新
      searchParams.set('id', id);
      setSearchParams(searchParams);
      setIsOpen(false); // モーダルを閉じる
    }
  }
  
  // ローカルストレージのチェック（IDが変更された時のみ）
  useEffect(() => {
    if (!validId) return  // 有効なIDがない場合は何もしない
    console.log('Checking localStorage for Finale ID:', validId)
    
    // ローカルストレージからデータを取得
    const storedData = loadIllustrationFireworksFromLocalStorage(validId)
    if (storedData) {
      // データが存在する場合は状態にセット
      setIllustrationFireworks(storedData)
      console.log('✅ Loaded from localStorage for Finale:', storedData)
    } else {
      // ローカルストレージにデータがない場合、illustrationFireworksをnullにしてAPIデータの取得を待つ
      console.log('⚠️ No data in localStorage for Finale ID:', validId)
      setIllustrationFireworks(null)
    }
  }, [validId]) // validIdが変更された時のみ実行
  
  // APIデータの処理
  useEffect(() => {
    if (!data) return // データがない場合はスキップ
    
    // 既にローカルストレージにデータがある場合はスキップ
    if (illustrationFireworks && illustrationFireworks.id === data.id) {
      console.log('⏭️ Skip API data processing for Finale - already have data')
      return
    }
    
    console.log('Finale Fireworks Data:', data)
    
    try {
      const width = Math.sqrt(data.pixelData.length)  // ピクセルデータの幅を計算
      // pixelData(boolean[])をboolean[][]に変換
      const fetchedPixelData = data.pixelData.reduce((acc: boolean[][], val: boolean, index: number) => {
        const rowIndex = Math.floor(index / width)  // 行のインデックスを計算
        if (!acc[rowIndex]) {
          acc[rowIndex] = []  // 行がまだ存在しない場合は初期化
        }
        acc[rowIndex].push(val)
        return acc
      }, [])
      
      // 変換したデータを状態にセット
      setIllustrationFireworks({
        ...data,
        pixelData: fetchedPixelData
      })
      
      // ローカルストレージに保存
      saveIllustrationFireworksToLocalStorage({
        ...data,
        pixelData: fetchedPixelData
      })
    } catch (error) {
      console.error('Error processing pixelData for Finale:', error)
      setIllustrationFireworks(null) // エラー時はnullに設定
    }
  }, [data, illustrationFireworks])
  
  // エラーハンドリング
  useEffect(() => {
    if (isLoading) {
      console.log('Loading finale fireworks data...')
    } else if (error) {
      console.error('Error fetching finale fireworks data:', error)
    }
  }, [isLoading, error])

  // フィナーレ制御関数
  const handleStartFinale = () => {
    finaleCanvasRef.current?.startFinale();
  };
  
  const handlePauseFinale = () => {
    finaleCanvasRef.current?.pauseFinale();
  };
  
  const handleResetFinale = () => {
    finaleCanvasRef.current?.resetFinale();
  };
  
  // カメラ制御関数
  const resetCameraRotation = () => {
    finaleCanvasRef.current?.resetCameraRotation();
  };
  
  // 共通ボタンスタイル
  const buttonStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontSize: '16px',
    cursor: 'pointer',
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    minWidth: '200px',
    zIndex: 1000,
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#e74c3c',
    color: 'white',
    boxShadow: '0 4px 8px rgba(231, 76, 60, 0.3)',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#34495e',
    color: 'white',
    boxShadow: '0 4px 8px rgba(52, 73, 94, 0.3)',
  };

  const infoStyle: React.CSSProperties = {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: 'white',
    padding: '16px 24px',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: 'bold',
    textAlign: 'center',
    minWidth: '300px',
    zIndex: 1000,
  };

  const progressBarStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '200px',
    left: '20px',
    right: '20px',
    height: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: '4px',
    overflow: 'hidden',
    zIndex: 1000,
  };

  const progressFillStyle: React.CSSProperties = {
    height: '100%',
    backgroundColor: '#e74c3c',
    width: `${progress}%`,
    transition: 'width 0.1s ease',
    borderRadius: '4px',
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* イラスト花火のデータが読み込まれた場合はFinaleCanvasを表示 */}
      <FinaleCanvas
        illustrationFireworks={illustrationFireworks} // イラスト花火のデータを渡す
        ref={finaleCanvasRef} // FinaleCanvasへの参照を渡す
      />
      
      {/* フィナーレ情報表示 */}
      <div style={infoStyle}>
        <div>🎆 FINALE 🎆</div>
        <div style={{ fontSize: '14px', marginTop: '8px', opacity: 0.9 }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>
      </div>
      
      {/* プログレスバー */}
      <div style={progressBarStyle}>
        <div style={progressFillStyle}></div>
      </div>
      
      {/* QRスキャンボタン */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          ...secondaryButtonStyle,
          bottom: '20px',
        }}
      >
        QRコードをスキャン
      </button>
      
      {illustrationFireworks ? (
        <>
          {/* フィナーレ制御ボタン */}
          <button
            onClick={isPlaying ? handlePauseFinale : handleStartFinale}
            style={{
              ...primaryButtonStyle,
              backgroundColor: isPlaying ? '#f39c12' : '#e74c3c',
              bottom: '140px',
            }}
          >
            {isPlaying ? '⏸️ 一時停止' : '▶️ フィナーレ開始'}
          </button>
          
          {/* リセットボタン */}
          <button
            onClick={handleResetFinale}
            style={{
              ...secondaryButtonStyle,
              bottom: '80px',
            }}
          >
            🔄 リセット
          </button>
          
          {/* カメラリセットボタン（右下） */}
          <button
            onClick={resetCameraRotation}
            style={{
              ...buttonStyle,
              backgroundColor: '#95a5a6',
              color: 'white',
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              left: 'auto',
              transform: 'none',
              minWidth: '120px',
              fontSize: '14px',
              padding: '8px 16px',
            }}
          >
            📱 カメラリセット
          </button>
        </>
      ) : (
        <div 
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            color: '#e74c3c',
            padding: '16px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            position: 'absolute',
            bottom: '120px',
            left: '50%',
            transform: 'translateX(-50%)',
            borderRadius: '12px',
            textAlign: 'center',
            maxWidth: '300px',
            border: '2px solid #e74c3c',
          }}
        >
          花火データが読み込めませんでした<br />
          QRコードをスキャンしてください
        </div>
      )}
      
      {/* QRスキャンモーダル */}
      <ScanModal
        isOpen={isOpen}
        onScan={onScan}
        closeModal={() => setIsOpen(false)}
      />
    </div>
  );
}
