import { useCallback, useEffect, useRef, useState } from 'react';
import {
  capturePhoto,
  isRecordingSupported,
  MAX_RECORDING_MS,
  startRecording,
  type CaptureResult,
  type CaptureSources,
  type Recording,
} from '../lib/mediaCapture';

// ===== シャッターの操作（単押し＝写真 / 長押し＝録画） =====
//
// カメラアプリと同じ作法に揃える。押した瞬間は写真か録画か決まらないので、
// LONG_PRESS_MS だけ押され続けたら録画に切り替え、それより早く離したら写真を撮る。

/** これだけ押し続けたら録画を開始する（これより短ければ写真） */
const LONG_PRESS_MS = 350;

export type PhotoCaptureState = {
  /** 撮り終わった写真・動画。プレビュー表示中は非nullになる */
  result: CaptureResult | null;
  isRecording: boolean;
  /** 録画の経過ミリ秒（シャッターの進捗リングに使う） */
  recordingMs: number;
  /** 録画に対応していない端末では、シャッターを写真専用として案内する */
  canRecord: boolean;
  /** 写真の書き出し・動画の変換待ち */
  isBusy: boolean;
  /** シャッターを押した瞬間に光らせるための連番（変わるたびにフラッシュを再生する） */
  flashKey: number;
  errorMessage: string | null;
  pressStart: () => void;
  pressEnd: () => void;
  closeResult: () => void;
  dismissError: () => void;
};

export function usePhotoCapture(sources: CaptureSources): PhotoCaptureState {
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // MediaRecorderの対応可否は端末ごとに固定なので一度だけ判定する
  const [canRecord] = useState(() => isRecordingSupported());

  const longPressTimerRef = useRef<number | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const isPressedRef = useRef(false);
  // 直前の結果のObjectURLは、次の結果に置き換わった時点で解放する
  const resultUrlRef = useRef<string | null>(null);

  const setResultSafely = useCallback((next: CaptureResult | null) => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = next ? next.url : null;
    setResult(next);
  }, []);

  const stopTick = useCallback(() => {
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const finishRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    stopTick();
    setIsRecording(false);
    setIsBusy(true);
    try {
      const captured = await recording.stop();
      if (captured) setResultSafely(captured);
      else setErrorMessage('動画を保存できませんでした');
    } catch (err) {
      console.error('録画の停止に失敗しました', err);
      setErrorMessage('動画を保存できませんでした');
    } finally {
      setIsBusy(false);
      setRecordingMs(0);
    }
  }, [setResultSafely, stopTick]);

  const beginRecording = useCallback(() => {
    if (recordingRef.current) return;
    const startedAt = Date.now();
    const recording = startRecording(sources, () => {
      // 最大長に達したときの自動停止
      void finishRecording();
    });
    if (!recording) {
      setErrorMessage('この端末では録画ができません');
      return;
    }
    recordingRef.current = recording;
    setIsRecording(true);
    setRecordingMs(0);
    tickTimerRef.current = window.setInterval(() => {
      setRecordingMs(Math.min(Date.now() - startedAt, MAX_RECORDING_MS));
    }, 100);
  }, [finishRecording, sources]);

  const takePhoto = useCallback(async () => {
    setIsBusy(true);
    setFlashKey((prev) => prev + 1);
    try {
      // 押した瞬間の画面を撮りたいので、合成は即座に行う
      const captured = await capturePhoto(sources);
      setResultSafely(captured);
    } catch (err) {
      console.error('写真の撮影に失敗しました', err);
      setErrorMessage('写真を保存できませんでした');
    } finally {
      setIsBusy(false);
    }
  }, [setResultSafely, sources]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const pressStart = useCallback(() => {
    if (isBusy || result) return;
    isPressedRef.current = true;
    clearLongPressTimer();
    if (!canRecord) return; // 録画できない端末では単押しの写真だけを受け付ける
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      // 指がまだ乗っているときだけ録画へ移行する
      if (isPressedRef.current) beginRecording();
    }, LONG_PRESS_MS);
  }, [beginRecording, canRecord, clearLongPressTimer, isBusy, result]);

  const pressEnd = useCallback(() => {
    if (!isPressedRef.current) return;
    isPressedRef.current = false;
    clearLongPressTimer();
    if (recordingRef.current) {
      void finishRecording();
      return;
    }
    void takePhoto();
  }, [clearLongPressTimer, finishRecording, takePhoto]);

  const closeResult = useCallback(() => {
    setResultSafely(null);
  }, [setResultSafely]);

  const dismissError = useCallback(() => setErrorMessage(null), []);

  // エラーは数秒で自然に消す（撮影の邪魔をしない）
  useEffect(() => {
    if (!errorMessage) return;
    const id = window.setTimeout(() => setErrorMessage(null), 3500);
    return () => window.clearTimeout(id);
  }, [errorMessage]);

  // アンマウント時に録画・タイマー・ObjectURLを後片付けする
  useEffect(() => {
    return () => {
      clearLongPressTimer();
      stopTick();
      recordingRef.current?.cancel();
      recordingRef.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    };
  }, [clearLongPressTimer, stopTick]);

  return {
    result,
    isRecording,
    recordingMs,
    canRecord,
    isBusy,
    flashKey,
    errorMessage,
    pressStart,
    pressEnd,
    closeResult,
    dismissError,
  };
}
