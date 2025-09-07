import { useState, useRef, useEffect, useCallback } from 'react';
import type { FinaleTimelineEntry, FinaleTimerState } from '../types/finaleTimelineType';
import { getFireworksAtTime } from '../utils/csvParser';

interface UseFinaleTimerProps {
  timeline: FinaleTimelineEntry[];
  onFireworkLaunch: (entries: FinaleTimelineEntry[]) => void;
  totalDuration: number;
}

interface UseFinaleTimerReturn {
  timerState: FinaleTimerState;
  startFinale: () => void;
  pauseFinale: () => void;
  resetFinale: () => void;
  setCurrentTime: (time: number) => void;
}

/**
 * フィナーレタイマーを管理するカスタムフック
 */
export function useFinaleTimer({
  timeline,
  onFireworkLaunch,
  totalDuration
}: UseFinaleTimerProps): UseFinaleTimerReturn {
  
  // タイマーの状態管理
  const [timerState, setTimerState] = useState<FinaleTimerState>({
    isPlaying: false,
    currentTime: 0,
    totalDuration,
    startTime: null,
    pausedTime: 0
  });

  // アニメーションフレームのID
  const animationFrameRef = useRef<number | null>(null);
  
  // 最後に処理した時刻（重複発射防止用）
  const lastProcessedTimeRef = useRef<number>(-1);
  
  // 発射済み花火のセット（より精密な重複防止）
  const launchedFireworksRef = useRef<Set<string>>(new Set());
  
  // 高精度タイマー処理
  const updateTimer = useCallback(() => {
    if (!timerState.isPlaying || timerState.startTime === null) return;

    const now = performance.now();
    const elapsed = (now - timerState.startTime) / 1000; // ミリ秒を秒に変換
    const currentTime = timerState.pausedTime + elapsed;

    // 終了チェック
    if (currentTime >= totalDuration) {
      setTimerState(prev => ({
        ...prev,
        isPlaying: false,
        currentTime: totalDuration,
        startTime: null
      }));
      return;
    }

    // 時刻更新
    setTimerState(prev => ({
      ...prev,
      currentTime
    }));

    // 花火発射チェック（0.1秒間隔で処理）
    const processingInterval = 0.1;
    const timeSlot = Math.floor(currentTime / processingInterval) * processingInterval;
    
    if (timeSlot > lastProcessedTimeRef.current) {
      // timeSlotを使って花火を検索（currentTimeではなく）
      const fireworksToLaunch = getFireworksAtTime(timeline, timeSlot, processingInterval);
      
      // 未発射の花火のみフィルタリング
      const newFireworks = fireworksToLaunch.filter(fw => {
        const fireworkId = `${fw.timestamp}-${fw.type}-${fw.color}-${fw.launchPosition.join(',')}`;
        return !launchedFireworksRef.current.has(fireworkId);
      });
      
      if (newFireworks.length > 0) {
        console.log(`Launching ${newFireworks.length} new fireworks at timeSlot ${timeSlot.toFixed(2)}s (currentTime: ${currentTime.toFixed(2)}s)`);
        
        // 発射済みセットに追加
        newFireworks.forEach(fw => {
          const fireworkId = `${fw.timestamp}-${fw.type}-${fw.color}-${fw.launchPosition.join(',')}`;
          launchedFireworksRef.current.add(fireworkId);
        });
        
        onFireworkLaunch(newFireworks);
      }
      
      lastProcessedTimeRef.current = timeSlot;
    }

    // 次のフレームをスケジュール
    animationFrameRef.current = requestAnimationFrame(updateTimer);
  }, [timerState, timeline, onFireworkLaunch, totalDuration]);

  // リセット
  const resetFinale = useCallback(() => {
    setTimerState(prev => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
      startTime: null,
      pausedTime: 0
    }));
    lastProcessedTimeRef.current = -1;
    launchedFireworksRef.current.clear(); // 発射済みセットもクリア
  }, []);

  // タイマー更新のエフェクト
  useEffect(() => {
    if (timerState.isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTimer);
    } else {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [timerState.isPlaying, updateTimer]);

  // フィナーレ開始
  const startFinale = useCallback(() => {
    if (timerState.currentTime >= totalDuration) {
      // 終了している場合はリセットしてから開始
      resetFinale();
      setTimeout(() => {
        setTimerState(prev => ({
          ...prev,
          isPlaying: true,
          startTime: performance.now()
        }));
        launchedFireworksRef.current.clear(); // 開始時に発射済みセットをクリア
      }, 50);
    } else {
      setTimerState(prev => ({
        ...prev,
        isPlaying: true,
        startTime: performance.now()
      }));
      // 途中から開始する場合は、現在時刻までに発射されるべき花火を発射済みセットに追加
      timeline.forEach(entry => {
        if (entry.timestamp <= timerState.currentTime) {
          const fireworkId = `${entry.timestamp}-${entry.type}-${entry.color}-${entry.launchPosition.join(',')}`;
          launchedFireworksRef.current.add(fireworkId);
        }
      });
    }
  }, [timerState.currentTime, totalDuration, timeline, resetFinale]);

  // 一時停止
  const pauseFinale = useCallback(() => {
    setTimerState(prev => ({
      ...prev,
      isPlaying: false,
      pausedTime: prev.currentTime,
      startTime: null
    }));
  }, []);

  // 特定の時刻に設定
  const setCurrentTime = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(time, totalDuration));
    setTimerState(prev => ({
      ...prev,
      currentTime: clampedTime,
      pausedTime: clampedTime,
      startTime: prev.isPlaying ? performance.now() : null
    }));
    lastProcessedTimeRef.current = Math.floor(clampedTime / 0.1) * 0.1 - 0.1;
    
    // シーク時は発射済みセットをクリアして再計算
    launchedFireworksRef.current.clear();
    // シーク先の時刻までに発射されるべき花火を発射済みセットに追加
    timeline.forEach(entry => {
      if (entry.timestamp <= clampedTime) {
        const fireworkId = `${entry.timestamp}-${entry.type}-${entry.color}-${entry.launchPosition.join(',')}`;
        launchedFireworksRef.current.add(fireworkId);
      }
    });
  }, [totalDuration, timeline]);

  return {
    timerState,
    startFinale,
    pauseFinale,
    resetFinale,
    setCurrentTime
  };
}

/**
 * フォーマットされた時間文字列を取得
 * @param seconds - 秒数
 * @returns "MM:SS" 形式の文字列
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * プログレスバーのパーセンテージを計算
 * @param currentTime - 現在時刻
 * @param totalDuration - 総時間
 * @returns 0-100の値
 */
export function calculateProgress(currentTime: number, totalDuration: number): number {
  if (totalDuration === 0) return 0;
  return Math.min(100, (currentTime / totalDuration) * 100);
}
