'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, MediaSize, Point } from 'react-easy-crop';
import { primaryButtonStyle, secondaryButtonStyle } from '@/styles/adminStyles';
import { createImage, createScaledImageData, getCroppedImg, getRotatedSize } from '@/utils/cropImage';
import {
  applyColorAdjustment,
  computeWhiteBalanceGains,
  createNeutralHueBoosts,
  hasHueBoost,
  isNeutralAdjustment,
  isSameGlobalAdjustment,
  normalizeAdjustment,
  pickHueBandAt,
  BLACK_LEVEL_RANGE,
  COLOR_ADJUSTMENT_PRESETS,
  HUE_BANDS,
  HUE_BOOST_RANGE,
  NEUTRAL_COLOR_ADJUSTMENT,
  SATURATION_RANGE,
  type ColorAdjustment,
  type WhiteBalanceGains,
} from '@/utils/colorAdjustment';
import { maskBackgroundPixels, measureInkRatio } from '@/utils/removeWhiteBackground';
import { setItemEvictingOldImages } from '@/utils/imageStorage';

interface ImageCropModalProps {
  imageSrc: string;
  fileName: string;
  mimeType: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

/** 切り取り枠は用紙の外まで広げられるので、ズームの下限は用紙全体より更に小さくしておく */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

/**
 * 色の分析に使う縮小サイズ。紙の白の分位点を求めるだけなら粗くてよいが、
 * スポイトで細い線の色を拾うにはサムネイルでは足りないため、この解像度から拾う。
 */
const ANALYSIS_MAX_SIZE = 512;

/** スポイトで初めて拾った色に入れる倍率と、同じ色を拾い直すたびに足す量 */
const PICK_INITIAL_BOOST = 2.2;
const PICK_BOOST_STEP = 0.4;
/** 補正前後のサムネイルの一辺。スライダー操作のたびに再計算するため小さく保つ */
const PREVIEW_MAX_SIZE = 200;

// 会場で何十枚も取り込む間、毎回スライダーを合わせ直さずに済むよう設定を覚えさせる
const ADJUSTMENT_STORAGE_KEY = 'imageEdit.colorAdjustment';

function readStoredAdjustment(): ColorAdjustment | null {
  try {
    const stored = window.localStorage.getItem(ADJUSTMENT_STORAGE_KEY);
    return stored ? normalizeAdjustment(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function writeStoredAdjustment(adjustment: ColorAdjustment): void {
  try {
    // 花火の画像でlocalStorageが埋まっていると設定すら保存できず、取り込みのたびに
    // 設定し直しになる。足りなければ古い花火画像を消して空きを作る。
    setItemEvictingOldImages(ADJUSTMENT_STORAGE_KEY, JSON.stringify(adjustment));
  } catch {
    // プライベートモード等でlocalStorage自体が使えない場合は覚えないだけにする
  }
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

/** ImageData を複製して補正を適用し、キャンバスへ描く。戻り値は「残る画素」の割合 */
function paintPreview(
  canvas: HTMLCanvasElement | null,
  source: ImageData,
  adjustment: ColorAdjustment | null,
  gains: WhiteBalanceGains | null,
  inkOnly: boolean
): number {
  const working = new ImageData(
    new Uint8ClampedArray(source.data),
    source.width,
    source.height
  );
  if (adjustment) {
    applyColorAdjustment(working, adjustment, gains);
  }

  const inkRatio = measureInkRatio(working);
  if (inkOnly) {
    maskBackgroundPixels(working);
  }

  if (canvas) {
    canvas.width = working.width;
    canvas.height = working.height;
    canvas.getContext('2d')?.putImageData(working, 0, 0);
  }

  return inkRatio;
}

export default function ImageCropModal({
  imageSrc,
  fileName,
  mimeType,
  onConfirm,
  onCancel,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [mediaNaturalSize, setMediaNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const hasAutoFittedRef = useRef(false);

  const [adjustment, setAdjustment] = useState<ColorAdjustment>(NEUTRAL_COLOR_ADJUSTMENT);
  const [whiteBalanceGains, setWhiteBalanceGains] = useState<WhiteBalanceGains | null>(null);
  const [previewSource, setPreviewSource] = useState<ImageData | null>(null);
  const [pickSource, setPickSource] = useState<ImageData | null>(null);
  const [pickedBandKey, setPickedBandKey] = useState<string | null>(null);
  const [pickMessage, setPickMessage] = useState<string | null>(null);
  const [showInkOnly, setShowInkOnly] = useState(false);
  // 設定はブラウザに保存され次の取り込みにも使われるため、既定は閉じた状態にする
  const [isColorSectionOpen, setIsColorSectionOpen] = useState(false);
  const [inkRatios, setInkRatios] = useState<{ before: number; after: number } | null>(null);
  const beforeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const stored = readStoredAdjustment();
    if (stored) setAdjustment(stored);
  }, []);

  // 元画像から、ホワイトバランスの基準（紙の白）とプレビュー用の縮小画像を作る。
  // ホワイトバランスは切り取り範囲ではなく紙全体から求める（切り取り位置を動かすたびに
  // 補正結果が変わると、プレビューと保存結果を見比べられなくなるため）。
  useEffect(() => {
    let cancelled = false;

    createImage(imageSrc)
      .then((image) => {
        if (cancelled) return;
        const analysisSource = createScaledImageData(image, ANALYSIS_MAX_SIZE);
        setWhiteBalanceGains(computeWhiteBalanceGains(analysisSource));
        setPickSource(analysisSource);
        setPreviewSource(createScaledImageData(image, PREVIEW_MAX_SIZE));
      })
      .catch((error) => {
        console.error('Failed to analyze image colors:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  useEffect(() => {
    if (!previewSource) return;

    setInkRatios({
      // 補正前はスポイトで色を拾う対象なので、常にそのままの色で描く
      before: paintPreview(beforeCanvasRef.current, previewSource, null, null, false),
      after: paintPreview(afterCanvasRef.current, previewSource, adjustment, whiteBalanceGains, showInkOnly),
    });
  }, [previewSource, adjustment, whiteBalanceGains, showInkOnly]);

  const handleCropComplete = useCallback((_croppedArea: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleRotateLeft = useCallback(() => {
    setRotation((prev) => normalizeRotation(prev - 90));
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotation((prev) => normalizeRotation(prev + 90));
  }, []);

  /**
   * 用紙全体が切り取り枠に収まるズーム倍率。
   *
   * react-easy-crop は zoom=1 のとき、切り取り枠の一辺を画像の短辺に合わせる。
   * 短辺÷長辺までズームアウトすると枠の一辺が長辺と等しくなり、A4のような長方形でも
   * 長辺を一辺とする正方形として切り取れる（restrictPosition={false} で枠が用紙から
   * はみ出せるようにしてあるため、はみ出した部分は白い余白になる）。
   */
  const fitPageZoom = useMemo(() => {
    if (!mediaNaturalSize) return null;

    const { width, height } = getRotatedSize(mediaNaturalSize.width, mediaNaturalSize.height, rotation);
    const longSide = Math.max(width, height);
    if (longSide === 0) return null;

    return Math.max(MIN_ZOOM, Math.min(width, height) / longSide);
  }, [mediaNaturalSize, rotation]);

  const handleMediaLoaded = useCallback((mediaSize: MediaSize) => {
    setMediaNaturalSize({ width: mediaSize.naturalWidth, height: mediaSize.naturalHeight });

    // A4をスキャンすると絵は用紙のどこにあるか分からないため、長方形の画像は
    // 最初から用紙全体が見える倍率で開く（正方形の画像は従来どおり等倍のまま）。
    if (hasAutoFittedRef.current) return;
    hasAutoFittedRef.current = true;

    const longSide = Math.max(mediaSize.naturalWidth, mediaSize.naturalHeight);
    const shortSide = Math.min(mediaSize.naturalWidth, mediaSize.naturalHeight);
    if (longSide > 0 && shortSide / longSide < 0.95) {
      setZoom(Math.max(MIN_ZOOM, shortSide / longSide));
      setCrop({ x: 0, y: 0 });
    }
  }, []);

  const handleFitPage = useCallback(() => {
    if (fitPageZoom === null) return;
    setZoom(fitPageZoom);
    setCrop({ x: 0, y: 0 });
  }, [fitPageZoom]);

  const updateAdjustment = useCallback((next: ColorAdjustment) => {
    setAdjustment(next);
    writeStoredAdjustment(next);
  }, []);

  /**
   * 補正前のプレビューをクリックして、拾えていない色を指定する（スポイト）。
   * 拾った色は色相帯に振り分けて、その帯の倍率を上げる。スライダーで直接触るのと
   * 同じ設定を動かすので、あとから微調整できる。
   */
  const handlePickColor = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!pickSource) return;

      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = Math.round(((event.clientX - rect.left) / rect.width) * (pickSource.width - 1));
      const y = Math.round(((event.clientY - rect.top) / rect.height) * (pickSource.height - 1));
      const picked = pickHueBandAt(pickSource, x, y);

      if (!picked) {
        setPickedBandKey(null);
        setPickMessage('⚠️ そこは紙や影の色です。絵の線や塗りの上をクリックしてください。');
        return;
      }

      const band = HUE_BANDS[picked.bandIndex];
      const current = adjustment.hueBoosts[picked.bandIndex];
      const next = Math.min(
        HUE_BOOST_RANGE.max,
        current < PICK_INITIAL_BOOST ? PICK_INITIAL_BOOST : current + PICK_BOOST_STEP
      );
      const hueBoosts = [...adjustment.hueBoosts];
      hueBoosts[picked.bandIndex] = Number(next.toFixed(1));

      updateAdjustment({ ...adjustment, hueBoosts });
      setPickedBandKey(band.key);
      setPickMessage(
        next >= HUE_BOOST_RANGE.max
          ? `「${band.label}」を上限の ${next.toFixed(1)}倍 まで強調しました。`
          : `「${band.label}」を ${next.toFixed(1)}倍 に強調しました（同じ色をもう一度クリックでさらに強く）。`
      );
    },
    [pickSource, adjustment, updateAdjustment]
  );

  const boostedBandLabels = useMemo(
    () =>
      HUE_BANDS.map((band, index) => ({ band, boost: adjustment.hueBoosts[index] }))
        .filter((entry) => entry.boost > 1)
        .map((entry) => `${entry.band.label} ${entry.boost.toFixed(1)}倍`),
    [adjustment.hueBoosts]
  );

  const hueBoostSummary = boostedBandLabels.length > 0 ? boostedBandLabels.join('・') : 'すべて既定';

  /**
   * 閉じているときに出す要約。開かなくても「今どの設定で保存されるか」と
   * 「その設定で絵が拾えているか」が分かるようにする。
   */
  const colorSummary = useMemo(() => {
    const preset = COLOR_ADJUSTMENT_PRESETS.find((candidate) =>
      isSameGlobalAdjustment(adjustment, candidate.value)
    );
    const parts = [preset ? preset.label : 'カスタム', ...boostedBandLabels];
    const ratio = inkRatios ? `｜残る画素 ${(inkRatios.after * 100).toFixed(1)}%` : '';

    return `${parts.join('・')}${ratio}`;
  }, [adjustment, boostedBandLabels, inkRatios]);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const file = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation,
        fileName,
        mimeType,
        isNeutralAdjustment(adjustment) ? null : { adjustment, whiteBalanceGains }
      );
      onConfirm(file);
    } catch (error) {
      console.error('Failed to crop image:', error);
      setErrorMessage('⚠️ 画像の処理に失敗しました。もう一度お試しください。');
    } finally {
      setIsProcessing(false);
    }
  }, [imageSrc, croppedAreaPixels, rotation, fileName, mimeType, adjustment, whiteBalanceGains, onConfirm]);

  const previewCanvasStyle: React.CSSProperties = {
    width: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
  };

  const previewCaptionStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: '#718096',
    margin: '0.25rem 0 0',
    textAlign: 'center',
  };

  const accordionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    width: '100%',
    padding: '0.625rem 0.75rem',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: '#f7fafc',
    color: '#2d3748',
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'left',
  };

  const sliderLabelStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: '#4a5568',
    marginBottom: '0.25rem',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="画像を編集"
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        }}
      >
        <h3 style={{ fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
          ✂️ 画像を編集
        </h3>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '320px',
            backgroundColor: '#1a202c',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            // 切り取り枠が用紙の外へはみ出せるようにする。true のままだと切り取り範囲が
            // 用紙の内側へ制限され、A4のような長方形では短辺までの正方形しか切り取れない。
            restrictPosition={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={handleCropComplete}
            onMediaLoaded={handleMediaLoaded}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="crop-zoom" style={{ display: 'block', fontSize: '0.875rem', color: '#4a5568', marginBottom: '0.25rem' }}>
            🔍 ズーム
          </label>
          <input
            id="crop-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <button
            type="button"
            onClick={handleFitPage}
            disabled={fitPageZoom === null}
            style={{
              ...secondaryButtonStyle,
              width: '100%',
              marginTop: '0.5rem',
              opacity: fitPageZoom === null ? 0.6 : 1,
              cursor: fitPageZoom === null ? 'not-allowed' : 'pointer',
            }}
          >
            📄 用紙全体を収める
          </button>
          <p style={{ fontSize: '0.75rem', color: '#718096', margin: '0.5rem 0 0', lineHeight: 1.6 }}>
            A4など長方形の紙でも、長辺を一辺とする正方形まで切り取れます。紙からはみ出した部分は白い余白になります。
          </p>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="crop-rotation" style={{ display: 'block', fontSize: '0.875rem', color: '#4a5568', marginBottom: '0.25rem' }}>
            🔄 回転
          </label>
          <input
            id="crop-rotation"
            type="range"
            min={0}
            max={360}
            step={1}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={handleRotateLeft}
              style={{ ...secondaryButtonStyle, flex: 1 }}
            >
              ⟲ 左90°
            </button>
            <button
              type="button"
              onClick={handleRotateRight}
              style={{ ...secondaryButtonStyle, flex: 1 }}
            >
              ⟳ 右90°
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          {/* 設定はブラウザに保存され次の取り込みにも効くため、普段は閉じたままで使える */}
          <button
            type="button"
            onClick={() => setIsColorSectionOpen((open) => !open)}
            aria-expanded={isColorSectionOpen}
            style={accordionHeaderStyle}
          >
            <span>🎨 色の調整</span>
            <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#718096' }}>
              {colorSummary} {isColorSectionOpen ? '▲' : '▼'}
            </span>
          </button>

          {!isColorSectionOpen && (
            <p style={{ fontSize: '0.75rem', color: '#718096', margin: '0.5rem 0 0', lineHeight: 1.6 }}>
              前回の設定をそのまま使います。淡い色が拾えていないときだけ開いてください。
            </p>
          )}

          {isColorSectionOpen && (
            <div style={{ paddingTop: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#718096', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                薄いピンクなどの淡い色は、そのままだと白紙と区別できず花火にも印刷にも出てきません。
                ここで濃くしてから保存します（保存する画像そのものを補正するので、花火・印刷の両方に効きます）。
                設定はブラウザに保存され、次の取り込みにも使われます。
              </p>

              <p style={{ ...sliderLabelStyle, marginBottom: '0.375rem' }}>
                <span>⚡ 全体の強さ</span>
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {COLOR_ADJUSTMENT_PRESETS.map((preset) => {
                  const isActive = isSameGlobalAdjustment(adjustment, preset.value);
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      // 色ごとの強調は取り込むペンに合わせた設定なので、プリセットでは触らない
                      onClick={() => updateAdjustment({ ...adjustment, ...preset.value })}
                      style={{
                        ...secondaryButtonStyle,
                        flex: 1,
                        margin: 0,
                        background: isActive
                          ? 'linear-gradient(135deg, #38b2ac 0%, #319795 100%)'
                          : '#edf2f7',
                        color: isActive ? 'white' : '#4a5568',
                        boxShadow: isActive ? secondaryButtonStyle.boxShadow : 'none',
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="adjust-saturation" style={sliderLabelStyle}>
                  <span>🌈 鮮やかさ</span>
                  <span>{adjustment.saturation.toFixed(1)}倍</span>
                </label>
                <input
                  id="adjust-saturation"
                  type="range"
                  min={SATURATION_RANGE.min}
                  max={SATURATION_RANGE.max}
                  step={SATURATION_RANGE.step}
                  value={adjustment.saturation}
                  onChange={(e) => updateAdjustment({ ...adjustment, saturation: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="adjust-black-level" style={sliderLabelStyle}>
                  <span>🖊️ 濃さ</span>
                  <span>{adjustment.blackLevel}</span>
                </label>
                <input
                  id="adjust-black-level"
                  type="range"
                  min={BLACK_LEVEL_RANGE.min}
                  max={BLACK_LEVEL_RANGE.max}
                  step={BLACK_LEVEL_RANGE.step}
                  value={adjustment.blackLevel}
                  onChange={(e) => updateAdjustment({ ...adjustment, blackLevel: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: '#4a5568', cursor: 'pointer', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={adjustment.autoWhiteBalance}
                  onChange={(e) => updateAdjustment({ ...adjustment, autoWhiteBalance: e.target.checked })}
                  style={{ marginRight: '0.5rem', accentColor: '#667eea' }}
                />
                紙の色かぶりを自動で補正する
              </label>

              <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                <p style={{ ...sliderLabelStyle, marginBottom: '0.375rem' }}>
                  <span>🎯 色ごとの強調</span>
                  <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#718096' }}>{hueBoostSummary}</span>
                </p>

                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#718096', margin: '0 0 0.5rem', lineHeight: 1.6 }}>
                      使っているペンの中で特定の色だけ拾えないときは、全体を上げずにその色だけ強くします。
                      倍率は全体の強さに掛かります（全体を「なし」にすれば、その色だけを強調できます）。
                      下の「補正前」プレビューで拾えていない色をクリックすると、その色の行が自動で上がります。
                    </p>

                    {HUE_BANDS.map((band, index) => (
                      <div
                        key={band.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginBottom: '0.25rem',
                          // スポイトで拾った色がどの帯に入ったかを分かるようにする
                          backgroundColor: band.key === pickedBandKey ? '#ebf8ff' : 'transparent',
                          borderRadius: '6px',
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: '0.875rem',
                            height: '0.875rem',
                            borderRadius: '50%',
                            backgroundColor: band.swatch,
                            flexShrink: 0,
                          }}
                        />
                        <label
                          htmlFor={`adjust-hue-${band.key}`}
                          style={{ fontSize: '0.8125rem', color: '#4a5568', width: '3.25rem', flexShrink: 0 }}
                        >
                          {band.label}
                        </label>
                        <input
                          id={`adjust-hue-${band.key}`}
                          type="range"
                          min={HUE_BOOST_RANGE.min}
                          max={HUE_BOOST_RANGE.max}
                          step={HUE_BOOST_RANGE.step}
                          value={adjustment.hueBoosts[index]}
                          onChange={(e) => {
                            const hueBoosts = [...adjustment.hueBoosts];
                            hueBoosts[index] = Number(e.target.value);
                            updateAdjustment({ ...adjustment, hueBoosts });
                          }}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: adjustment.hueBoosts[index] > 1 ? '#2d3748' : '#a0aec0',
                            width: '2.75rem',
                            textAlign: 'right',
                            flexShrink: 0,
                          }}
                        >
                          {adjustment.hueBoosts[index].toFixed(1)}倍
                        </span>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => updateAdjustment({ ...adjustment, hueBoosts: createNeutralHueBoosts() })}
                      disabled={!hasHueBoost(adjustment)}
                      style={{
                        ...secondaryButtonStyle,
                        width: '100%',
                        margin: '0.5rem 0 0',
                        background: '#edf2f7',
                        color: '#4a5568',
                        boxShadow: 'none',
                        opacity: hasHueBoost(adjustment) ? 1 : 0.6,
                        cursor: hasHueBoost(adjustment) ? 'pointer' : 'not-allowed',
                      }}
                    >
                      色ごとの強調をリセット
                    </button>
                  </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: '#4a5568', cursor: 'pointer', marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={showInkOnly}
                  onChange={(e) => setShowInkOnly(e.target.checked)}
                  style={{ marginRight: '0.5rem', accentColor: '#667eea' }}
                />
                補正後を「花火・印刷に残る部分だけ」で表示する
              </label>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <canvas
                    ref={beforeCanvasRef}
                    onClick={handlePickColor}
                    aria-label="補正前のプレビュー。クリックした場所の色を強調します"
                    title="拾えていない色をクリックすると、その色を強調します"
                    style={{ ...previewCanvasStyle, cursor: pickSource ? 'crosshair' : 'default' }}
                  />
                  <p style={previewCaptionStyle}>
                    💧 補正前（クリックで色を拾う）
                    {inkRatios ? `｜残る画素 ${(inkRatios.before * 100).toFixed(1)}%` : ''}
                  </p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <canvas ref={afterCanvasRef} style={previewCanvasStyle} />
                  <p style={previewCaptionStyle}>
                    補正後{inkRatios ? `｜残る画素 ${(inkRatios.after * 100).toFixed(1)}%` : ''}
                  </p>
                </div>
              </div>

              {pickMessage && (
                <p style={{ fontSize: '0.75rem', color: '#2d3748', margin: '0.5rem 0 0', lineHeight: 1.6 }}>
                  {pickMessage}
                </p>
              )}

              <p style={{ fontSize: '0.75rem', color: '#718096', margin: '0.5rem 0 0', lineHeight: 1.6 }}>
                プレビューは切り取り前の画像全体です。上げすぎると紙のざらつきや影まで拾って花火に
                余計な粒が出るため、「残る画素」が急に増えたら下げてください。
              </p>
            </div>
          )}
        </div>

        {errorMessage && (
          <p style={{ color: '#e53e3e', fontSize: '0.875rem', marginTop: '1rem', fontWeight: '500' }}>
            {errorMessage}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              ...secondaryButtonStyle,
              flex: 1,
              opacity: isProcessing ? 0.6 : 1,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            ✖️ キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing || !croppedAreaPixels}
            style={{
              ...primaryButtonStyle,
              flex: 1,
              opacity: isProcessing || !croppedAreaPixels ? 0.6 : 1,
              cursor: isProcessing || !croppedAreaPixels ? 'not-allowed' : 'pointer',
            }}
          >
            {isProcessing ? '⏳ 処理中...' : '✅ 確定'}
          </button>
        </div>
      </div>
    </div>
  );
}
