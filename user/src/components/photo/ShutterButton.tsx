import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  shutterButtonStyle,
  shutterCaptionStyle,
  shutterColumnStyle,
  shutterCoreStyle,
  shutterProgressStyle,
} from '../../pages/photoStyles';

interface Props {
  isRecording: boolean;
  /** 録画の進捗（0〜1）。最大の長さに達するとリングが一周する */
  progress: number;
  /** 長押しでの録画に対応しているか。非対応端末では説明文を写真だけにする */
  canRecord: boolean;
  disabled: boolean;
  onPressStart: () => void;
  onPressEnd: () => void;
}

/**
 * シャッターボタン（単押し＝写真 / 長押し＝録画）。
 *
 * 押した瞬間には写真か録画か決まらないため、ここでは押下の開始と終了だけを伝え、
 * どちらとして扱うかの判断は usePhotoCapture が持つ。
 */
export default function ShutterButton({
  isRecording,
  progress,
  canRecord,
  disabled,
  onPressStart,
  onPressEnd,
}: Props) {
  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    // 指がボタンの外へ滑っても pointerup を受け取れるようにする
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onPressStart();
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onPressEnd();
  };

  return (
    <div style={shutterColumnStyle}>
      <span style={shutterCaptionStyle}>
        {isRecording ? '指を離すと停止' : canRecord ? '押す=写真 / 長押し=録画' : '押して写真'}
      </span>
      <button
        type="button"
        style={shutterButtonStyle(isRecording, disabled)}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        // 長押しでiOS/Androidのコンテキストメニューが出ると録画が中断されるため抑止する
        onContextMenu={(e) => e.preventDefault()}
        aria-label={canRecord ? 'シャッター（長押しで録画）' : 'シャッター'}
      >
        {isRecording && <span style={shutterProgressStyle(progress)} />}
        <span style={shutterCoreStyle(isRecording)} />
      </button>
    </div>
  );
}
