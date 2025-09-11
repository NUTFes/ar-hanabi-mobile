import { useState, useEffect, useRef } from 'react'
import type { FinaleCanvasHandle } from '../canvas/FinaleCanvas';
import { formatTime } from '../hooks/useFinaleTimer';

import FinaleCanvas from "../canvas/FinaleCanvas";

// ===== Finale のページ =====
// フィナーレ花火大会のページ
// タイムライン制御UI、カメラ制御UI、QRスキャン機能を提供
export default function Finale() {
  // フィナーレの再生状態を管理
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [progress, setProgress] = useState(0)
  
  // FinaleCanvasへの参照を作成
  const finaleCanvasRef = useRef<FinaleCanvasHandle>(null);
  
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
    minWidth: '150px',
    zIndex: 1000,
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    // backgroundColor: '#e74c3c',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
    // top: '20px',
    bottom: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: 'white',
    padding: '16px 24px',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: 'bold',
    textAlign: 'center',
    minWidth: '150px',
    zIndex: 1000,
  };

  const progressBarStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '70px',
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
    backgroundColor: '#ddddddff',
    width: `${progress}%`,
    transition: 'width 0.1s ease',
    borderRadius: '4px',
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* イラスト花火のデータが読み込まれた場合はFinaleCanvasを表示 */}
      <FinaleCanvas
        ref={finaleCanvasRef} // FinaleCanvasへの参照を渡す
      />
      
      {/* フィナーレ情報表示 */}
      <div style={infoStyle}>
        {/* <div>🎆 FINALE 🎆</div> */}
        <div style={{ 
          fontSize: '14px', 
          // marginTop: '8px', 
          opacity: 0.9 
        }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>
      </div>
      
      {/* プログレスバー */}
      <div style={progressBarStyle}>
        <div style={progressFillStyle}></div>
      </div>
      
      {/* フィナーレ制御ボタン */}
      <button
        onClick={isPlaying ? handlePauseFinale : handleStartFinale}
        style={{
          ...primaryButtonStyle,
          backgroundColor: isPlaying ? '#f39c12' : '#e74c3c',
          bottom: '10px',
          left: '70%',
        }}
      >
        {isPlaying ? '⏸️ 一時停止' : '▶️ フィナーレ開始'}
      </button>
          
      {/* リセットボタン */}
      <button
        onClick={handleResetFinale}
        style={{
          ...secondaryButtonStyle,
          bottom: '10px',
          left: '90%',
        }}
      >
        🔄 リセット
      </button>
    </div>
  );
}
