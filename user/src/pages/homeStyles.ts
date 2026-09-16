import type { CSSProperties } from 'react';

// ===== Home ページの見た目に関する定数・スタイル定義 =====
// admin/styles/adminStyles.ts と同様に、インラインstyleオブジェクトをここへ集約する。

/** 色トークン。admin/styles/adminStyles.ts の「影の色 = 要素のベース色」という
 *  ルールを踏襲しつつ、ARカメラ映像の上に重ねる半透明ダークUI向けに調整したもの */
export const COLORS = {
  accent: '#f0b810',
  accentLight: '#ffd607', // logo.png から実測したロゴの金色
  accentDark: '#d99a00',
  onAccent: '#1a1a1a',
  glow: 'rgba(240, 184, 16, 0.35)',
  surface: 'rgba(18, 18, 22, 0.66)',
  surfaceRaised: 'rgba(255, 255, 255, 0.10)',
  surfaceSubtle: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.14)',
  borderStrong: 'rgba(255, 255, 255, 0.28)',
  text: '#fff',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textTertiary: 'rgba(255, 255, 255, 0.45)',
  dangerSurface: 'rgba(120, 20, 20, 0.55)',
  dangerText: '#feb2b2',
} as const;

/** 後方互換のためのエイリアス（COLORS.accent と同値） */
export const ACCENT_COLOR = COLORS.accent;

export const RADIUS = {
  sm: '8px',
  md: '12px',
  lg: '20px',
  pill: '999px',
} as const;

/** 打ち上げボタン専用の表示フォント。index.html で該当文字のみサブセット読み込み済み */
export const FONT_DISPLAY = '"Zen Maru Gothic", -apple-system, "Hiragino Sans", sans-serif';

/** 画面下部中央に浮かぶコントロールパネル全体の位置。
 *  iPhoneのホームインジケータ等と重ならないようセーフエリア分を加算する */
export const overlayContainerStyle: CSSProperties = {
  position: 'absolute',
  // 写真撮影モードのタップ層・フォトフレーム（z-index 1〜2）より前に出し、
  // ボタンの上をタップしたときに花火が上がらないようにする
  zIndex: 10,
  bottom: 'calc(24px + env(safe-area-inset-bottom))',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '10px',
  width: 'min(340px, 92vw)',
};

/** Home のオーバーレイ。打ち上げボタンの右に設定ボタンが並ぶぶん、少しだけ広く取る。
 *  Demo画面は上部の誘導テキスト（340px）と幅を揃えたいので、こちらは使わない */
export const homeOverlayContainerStyle: CSSProperties = {
  ...overlayContainerStyle,
  width: 'min(400px, 94vw)',
};

/** 詳細設定（画質・カメラのリセット）を収めるガラスカード */
export const panelStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: '10px',
  padding: '10px 14px',
  borderRadius: RADIUS.lg,
  backgroundColor: COLORS.surface,
  backdropFilter: 'blur(12px) saturate(140%)',
  border: `1px solid ${COLORS.border}`,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
};

/** 主要アクション（花火を打ち上げる）。ローディング／変換中は disabled のまま
 *  スピナー付きラベルを表示し、パネルの高さが変わらないようにする */
export function launchButtonStyle(disabled: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '0 20px',
    borderRadius: RADIUS.pill,
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: FONT_DISPLAY,
    fontWeight: 700,
    fontSize: '17px',
    letterSpacing: '0.04em',
    color: disabled ? COLORS.text : COLORS.onAccent,
    background: disabled
        ? COLORS.surfaceRaised
        : `linear-gradient(135deg, ${COLORS.accentLight} 0%, ${COLORS.accent} 45%, ${COLORS.accentDark} 100%)`,
    boxShadow: disabled
        ? 'none'
        : `0 6px 20px ${COLORS.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.45)`,
    opacity: disabled ? 0.75 : 1,
  };
}

/** 副次アクション（カメラのリセット・QRスキャン・モーダルの閉じるボタン）。
 *  アイコン＋ラベルの横並びを想定し、中央寄せで gap を確保する */
export const ghostButtonStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: '44px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '0 16px',
  borderRadius: RADIUS.pill,
  border: `1px solid ${COLORS.borderStrong}`,
  backgroundColor: COLORS.surfaceRaised,
  backdropFilter: 'blur(8px)',
  color: COLORS.text,
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
};

/** ghostButtonStyle 内のアイコン共通スタイル */
export const ghostButtonIconStyle: CSSProperties = {
  fontSize: '17px',
  flexShrink: 0,
};

/** 打ち上げボタン内のローディングスピナー本体。回転アニメーションは index.css の .hb-spin が担う */
export const spinnerStyle: CSSProperties = {
  width: '16px',
  height: '16px',
  boxSizing: 'border-box',
  borderRadius: '50%',
  border: '2px solid rgba(255, 255, 255, 0.35)',
  borderTopColor: COLORS.text,
};

/** エラー表示（花火が読み込めなかった場合） */
export const errorPillStyle: CSSProperties = {
  padding: '10px 16px',
  borderRadius: RADIUS.md,
  backgroundColor: COLORS.dangerSurface,
  borderLeft: '3px solid #e53e3e',
  color: COLORS.dangerText,
  fontSize: '14px',
  lineHeight: 1.6,
  textAlign: 'center',
};

/** 詳細設定の開閉トグルボタン（パネル上部に置く。開閉状態でアイコンバッジと背景の濃さを変える） */
export function settingsToggleButtonStyle(isOpen: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: RADIUS.md,
    border: `1px solid ${isOpen ? COLORS.border : 'transparent'}`,
    backgroundColor: isOpen ? COLORS.surfaceRaised : 'transparent',
    color: COLORS.text,
    cursor: 'pointer',
  };
}

/** トグルボタン内の「アイコンバッジ＋ラベル」行 */
export const settingsToggleLabelRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '14px',
  fontWeight: 700,
  letterSpacing: '0.02em',
};

/** 設定アイコンを収める丸バッジ。開閉状態でアクセントカラーの濃さを変える */
export function settingsIconBadgeStyle(isOpen: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: RADIUS.pill,
    backgroundColor: isOpen ? COLORS.glow : COLORS.surfaceRaised,
    color: isOpen ? COLORS.accentLight : COLORS.textSecondary,
    fontSize: '16px',
    flexShrink: 0,
    transition: 'background-color 0.2s ease, color 0.2s ease',
  };
}

/** 開閉シェブロンの色。トグルの文字色より一段暗く抑える */
export const settingsChevronStyle: CSSProperties = {
  fontSize: '18px',
  color: COLORS.textTertiary,
};

/** 折りたたみ内の設定群（画質セレクタ・カメラのリセット・QRスキャン）。
 *  トグルとの間に区切り線を入れ、独立したセクションであることを示す */
export const settingsSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginTop: '2px',
  paddingTop: '12px',
  borderTop: `1px solid ${COLORS.border}`,
};

/** 画質セレクタ（ラベル＋セグメンテッドコントロール）の縦並びコンテナ */
export const qualityRowContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

export const qualityLabelStyle: CSSProperties = {
  fontSize: '12px',
  color: COLORS.textTertiary,
};

/** セグメンテッドコントロールの外枠。中に金のピル（segmentedIndicatorStyle）が絶対配置でスライドする */
export const segmentedContainerStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  padding: '3px',
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.pill,
};

/** 選択中の画質を示す金のピル。index/count から位置と幅を算出してスライドさせる */
export function segmentedIndicatorStyle(index: number, count: number): CSSProperties {
  return {
    position: 'absolute',
    top: '3px',
    bottom: '3px',
    left: '3px',
    width: `calc((100% - 6px) / ${count})`,
    transform: `translateX(${index * 100}%)`,
    borderRadius: RADIUS.pill,
    background: `linear-gradient(135deg, ${COLORS.accentLight} 0%, ${COLORS.accent} 100%)`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'none',
  };
}

/** セグメンテッドコントロールの各ボタン。背景は持たず、選択状態はピルと文字色だけで示す */
export function segmentedButtonStyle(isActive: boolean): CSSProperties {
  return {
    position: 'relative',
    zIndex: 1,
    flex: 1,
    padding: '7px 0',
    border: 'none',
    background: 'transparent',
    borderRadius: RADIUS.pill,
    fontSize: '13px',
    fontWeight: isActive ? 700 : 600,
    color: isActive ? COLORS.onAccent : COLORS.textSecondary,
    cursor: 'pointer',
    transition: 'color 0.2s ease',
  };
}

/** 打ち上げモードのアクション行。打ち上げボタンが幅いっぱいに伸び、右端に設定ボタンが並ぶ */
export const launchRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
};

/** 写真撮影モードのアクション行。
 *  「フレーム選択・シャッター・設定ボタン」を並べる。左右を 1fr で釣り合わせることで、
 *  両脇のボタンの大きさが違ってもシャッターが画面中央に来る */
export const photoRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  // シャッターの上には操作の説明が乗るため、下端で揃える
  alignItems: 'end',
  gap: '10px',
  width: '100%',
};

/** 写真撮影モードのアクション行の左右のセル。中身を外側（左端・右端）へ寄せる。
 *  行は下端揃えなので、52pxのボタンが74pxのシャッターの中心に来るよう下に余白を入れる */
export function bottomRowSideStyle(align: 'start' | 'end'): CSSProperties {
  return {
    display: 'flex',
    justifyContent: align === 'start' ? 'flex-start' : 'flex-end',
    alignItems: 'center',
    minWidth: '52px',
    paddingBottom: '11px',
  };
}

/** アクション行の両端に置く丸ボタンの共通の見た目。
 *  右端の設定ボタン（設定を閉じているときだけ出す）と、左端のモード切替ボタンが使う。
 *  写真撮影モードのフレームボタン（photoStyles.ts）とも寸法を揃えてある */
export const circleFabStyle: CSSProperties = {
  width: '52px',
  height: '52px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: RADIUS.pill,
  border: `1px solid ${COLORS.borderStrong}`,
  backgroundColor: COLORS.surface,
  backdropFilter: 'blur(12px) saturate(140%)',
  color: COLORS.text,
  fontSize: '22px',
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
};
