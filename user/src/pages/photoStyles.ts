import type { CSSProperties } from 'react';
import { COLORS, FONT_DISPLAY, RADIUS } from './homeStyles';

// ===== 写真撮影モードの見た目に関する定数・スタイル定義 =====
// homeStyles.ts と同じ方針で、インラインstyleオブジェクトをここへ集約する。
// 色・角丸・表示フォントは homeStyles.ts のトークンを再利用し、画面ごとに揺れないようにする。

/** 撮影の邪魔になる操作（タップでの打ち上げ）を拾うための全画面レイヤー。
 *  UIボタンより後ろに置くので、ボタンの上をタップしても花火は上がらない */
export const tapLayerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  // iOSでダブルタップズームや長押しの選択が起きないようにする
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
};

/** フォトフレームのプレビュー用canvas。操作は下のタップレイヤーへ通す */
export const frameOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  zIndex: 2,
  pointerEvents: 'none',
};

/** 「タップしたところに花火が上がるよ」の案内。画面上部中央に浮かせる */
export function tapHintContainerStyle(isVisible: boolean): CSSProperties {
  return {
    position: 'absolute',
    // 左上の「打ち上げモードへ戻る」と右上の録画表示の下に来る位置。上部で3つが重ならないようにする
    top: "calc(env(safe-area-inset-top, 0px) + 72px)",
    left: '50%',
    transform: `translateX(-50%) translateY(${isVisible ? '0' : '-8px'})`,
    zIndex: 4,
    width: 'max-content',
    maxWidth: '90vw',
    // 消えている間もDOMには残す（再表示のたびにフェードを効かせるため）
    opacity: isVisible ? 1 : 0,
    transition: 'opacity 0.6s ease, transform 0.6s ease',
    pointerEvents: 'none',
  };
}

/** 案内のカード。花火を隠しすぎないよう、パネルより一段控えめな濃さにする */
export const tapHintCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 18px',
  borderRadius: RADIUS.pill,
  backgroundColor: 'rgba(18, 18, 22, 0.6)',
  backdropFilter: 'blur(10px) saturate(140%)',
  border: `1px solid ${COLORS.border}`,
  boxShadow: '0 4px 18px rgba(0, 0, 0, 0.3)',
};

export const tapHintIconStyle: CSSProperties = {
  fontSize: '20px',
  color: COLORS.accentLight,
  flexShrink: 0,
};

export const tapHintTextStyle: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: COLORS.text,
  whiteSpace: 'nowrap',
};

/** シャッターボタン。押している間の見た目の変化はリング側で表す */
export function shutterButtonStyle(isRecording: boolean, disabled: boolean): CSSProperties {
  return {
    position: 'relative',
    width: '74px',
    height: '74px',
    flexShrink: 0,
    padding: 0,
    borderRadius: RADIUS.pill,
    border: `3px solid ${isRecording ? 'rgba(229, 62, 62, 0.9)' : 'rgba(255, 255, 255, 0.9)'}`,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    backdropFilter: 'blur(8px)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    // 長押し中にiOSの選択・コールアウトが出ないようにする
    touchAction: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
  };
}

/** シャッターの中身。写真では白い丸、録画中は赤い角丸（停止ボタン）になる */
export function shutterCoreStyle(isRecording: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: isRecording ? '28px' : '58px',
    height: isRecording ? '28px' : '58px',
    borderRadius: isRecording ? '8px' : RADIUS.pill,
    backgroundColor: isRecording ? '#e53e3e' : '#fff',
    transition: 'width 0.18s ease, height 0.18s ease, border-radius 0.18s ease, background-color 0.18s ease',
    pointerEvents: 'none',
  };
}

/** 録画の経過を示すリング。conic-gradient を進捗ぶんだけ塗る */
export function shutterProgressStyle(progress: number): CSSProperties {
  return {
    position: 'absolute',
    inset: '-9px',
    borderRadius: RADIUS.pill,
    background: `conic-gradient(#e53e3e ${progress * 360}deg, rgba(255, 255, 255, 0.18) 0deg)`,
    // 中央をくり抜いてリングにする
    WebkitMask: 'radial-gradient(circle, transparent 0 43%, #000 44%)',
    mask: 'radial-gradient(circle, transparent 0 43%, #000 44%)',
    pointerEvents: 'none',
  };
}

/** シャッターの上に出す操作の説明（単押し＝写真 / 長押し＝録画）。
 *  フォトフレームの装飾は画面の下端に入ることが多いため、説明は上側に置いて重ならないようにする */
export const shutterCaptionStyle: CSSProperties = {
  marginBottom: '8px',
  fontSize: '11px',
  letterSpacing: '0.02em',
  color: COLORS.textSecondary,
  textAlign: 'center',
  textShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
  whiteSpace: 'nowrap',
};

/** シャッターと説明を縦に積むためのラッパー */
export const shutterColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

/** フォトフレームの選択を開くボタン（アクション行の左端） */
export function frameButtonStyle(isActive: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    width: '52px',
    height: '52px',
    flexShrink: 0,
    borderRadius: RADIUS.pill,
    border: `1px solid ${isActive ? COLORS.accent : COLORS.borderStrong}`,
    backgroundColor: isActive ? COLORS.glow : COLORS.surface,
    backdropFilter: 'blur(12px) saturate(140%)',
    color: isActive ? COLORS.accentLight : COLORS.text,
    fontSize: '20px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
  };
}

/** フレーム選択のチップを並べる行。アクション行の上に出す */
export const framePickerRowStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  width: '100%',
  padding: '8px',
  boxSizing: 'border-box',
  borderRadius: RADIUS.pill,
  backgroundColor: COLORS.surface,
  backdropFilter: 'blur(12px) saturate(140%)',
  border: `1px solid ${COLORS.border}`,
  overflowX: 'auto',
};

export function frameChipStyle(isActive: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: '64px',
    padding: '8px 6px',
    borderRadius: RADIUS.pill,
    border: 'none',
    background: isActive
        ? `linear-gradient(135deg, ${COLORS.accentLight} 0%, ${COLORS.accent} 100%)`
        : 'transparent',
    color: isActive ? COLORS.onAccent : COLORS.textSecondary,
    fontSize: '12px',
    fontWeight: isActive ? 700 : 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
}

/** 録画中であることを示す画面上部のピル */
export const recordingPillStyle: CSSProperties = {
  position: 'absolute',
  // 左上の「打ち上げモードへ戻る」と並ぶので、中央ではなく右上に置く
  top: "calc(env(safe-area-inset-top, 0px) + 18px)",
  right: "calc(env(safe-area-inset-right, 0px) + 12px)",
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '7px 14px',
  borderRadius: RADIUS.pill,
  backgroundColor: 'rgba(120, 20, 20, 0.72)',
  backdropFilter: 'blur(8px)',
  color: '#fff',
  fontSize: '13px',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  pointerEvents: 'none',
};

export const recordingDotStyle: CSSProperties = {
  width: '9px',
  height: '9px',
  borderRadius: RADIUS.pill,
  backgroundColor: '#ff5a5a',
};

/** シャッターを切った瞬間の白いフラッシュ。アニメーションは index.css の .hb-flash が担う。
 *  既定を透明にしておくことで、アニメーションを切っている端末
 *  （prefers-reduced-motion）で白いままになるのを防ぐ */
export const captureFlashStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  // UIのボタン類より前に出して、画面全体が光ったように見せる
  zIndex: 1100,
  backgroundColor: '#fff',
  opacity: 0,
  pointerEvents: 'none',
};

/** 撮影結果のプレビュー（全画面） */
export const resultOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1200,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '16px',
  padding: 'calc(env(safe-area-inset-top, 0px) + 20px) 16px calc(env(safe-area-inset-bottom, 0px) + 20px)',
  boxSizing: 'border-box',
  backgroundColor: 'rgba(0, 0, 0, 0.88)',
  backdropFilter: 'blur(6px)',
};

export const resultMediaStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '70vh',
  borderRadius: RADIUS.md,
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
  objectFit: 'contain',
};

export const resultActionsStyle: CSSProperties = {
  display: 'flex',
  gap: '10px',
  width: 'min(400px, 94vw)',
};

/** 保存ボタン（主要アクション）。打ち上げボタンと同じ金のグラデーションに揃える */
export const resultSaveButtonStyle: CSSProperties = {
  flex: 2,
  minHeight: '52px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  borderRadius: RADIUS.pill,
  border: 'none',
  background: `linear-gradient(135deg, ${COLORS.accentLight} 0%, ${COLORS.accent} 45%, ${COLORS.accentDark} 100%)`,
  color: COLORS.onAccent,
  fontSize: '16px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: `0 6px 20px ${COLORS.glow}`,
};

export const resultCloseButtonStyle: CSSProperties = {
  flex: 1,
  minHeight: '52px',
  borderRadius: RADIUS.pill,
  border: `1px solid ${COLORS.borderStrong}`,
  backgroundColor: COLORS.surfaceRaised,
  color: COLORS.text,
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

/** 保存後の案内（共有シートを閉じたあと等に出す一言） */
export const resultNoteStyle: CSSProperties = {
  fontSize: '12px',
  color: COLORS.textSecondary,
  textAlign: 'center',
  lineHeight: 1.6,
  maxWidth: 'min(400px, 94vw)',
};

/** 撮影に失敗したときのトースト（画面下寄り・数秒で消える） */
export const captureErrorToastStyle: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 160px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 5,
  padding: '10px 16px',
  borderRadius: RADIUS.md,
  backgroundColor: COLORS.dangerSurface,
  border: `1px solid rgba(229, 62, 62, 0.6)`,
  color: COLORS.dangerText,
  fontSize: '13px',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

/** 写真撮影モードから抜けるボタン（画面左上）。
 *  設定を開いたことがない人にはモード切替が設定の中にあると分からないため、
 *  戻る導線は常に見えるところに置く。上部中央の案内・録画表示とは重ならない位置 */
export const exitPhotoModeButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(env(safe-area-inset-top, 0px) + 18px)',
  left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
  zIndex: 4,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '8px 14px 8px 10px',
  borderRadius: RADIUS.pill,
  border: `1px solid ${COLORS.borderStrong}`,
  backgroundColor: 'rgba(18, 18, 22, 0.6)',
  backdropFilter: 'blur(10px) saturate(140%)',
  color: COLORS.text,
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
};

export const exitPhotoModeIconStyle: CSSProperties = {
  fontSize: '18px',
  flexShrink: 0,
};
