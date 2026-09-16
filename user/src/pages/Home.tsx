import { useCallback, useState } from 'react'
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
import {
  MdSettings,
  MdExpandMore,
  MdRestartAlt,
  MdQrCodeScanner,
  MdFilterFrames,
  MdPhotoCamera,
  MdArrowBack,
} from 'react-icons/md';

import HomeCanvas from "../canvas/HomeCanvas";
import FrameOverlayCanvas from '../components/photo/FrameOverlayCanvas';
import FramePicker from '../components/photo/FramePicker';
import ShutterButton from '../components/photo/ShutterButton';
import TapHint from '../components/photo/TapHint';
import CaptureResultOverlay from '../components/photo/CaptureResultOverlay';
import { usePhotoCapture } from '../hooks/usePhotoCapture';
import { useTapHint } from '../hooks/useTapHint';
import { MAX_RECORDING_MS } from '../lib/mediaCapture';
import type { PhotoFrameId } from '../lib/photoFrames';
import {
  homeOverlayContainerStyle,
  panelStyle,
  launchButtonStyle,
  ghostButtonStyle,
  ghostButtonIconStyle,
  spinnerStyle,
  errorPillStyle,
  settingsToggleButtonStyle,
  settingsToggleLabelRowStyle,
  settingsIconBadgeStyle,
  settingsChevronStyle,
  settingsSectionStyle,
  qualityRowContainerStyle,
  qualityLabelStyle,
  segmentedContainerStyle,
  segmentedIndicatorStyle,
  segmentedButtonStyle,
  launchRowStyle,
  photoRowStyle,
  bottomRowSideStyle,
  circleFabStyle,
} from './homeStyles';
import {
  tapLayerStyle,
  recordingPillStyle,
  recordingDotStyle,
  captureFlashStyle,
  captureErrorToastStyle,
  frameButtonStyle,
  exitPhotoModeButtonStyle,
  exitPhotoModeIconStyle,
} from './photoStyles';

// 画質レベル: 値が大きいほど画像を細かいグリッドに分解し、粒子数が増えて精細になる（その分重くなる）
const QUALITY_LEVELS = [
  { label: '低', resolution: 32 },
  { label: '中', resolution: 64 },
  { label: '高', resolution: 128 },
] as const;

// 画面のモード。
// - launch: 従来どおりボタンで花火を打ち上げる
// - photo : タップした場所に花火を上げながら、写真・動画を撮る
type ViewMode = 'launch' | 'photo';
const VIEW_MODES = [
  { id: 'launch', label: '打ち上げ' },
  { id: 'photo', label: '写真撮影' },
] as const;

/** 録画の経過時間表示（0:03 形式） */
function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

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

  // 詳細設定（モード・画質・カメラのリセット・QRコードをスキャン）の開閉。
  // 花火の表示領域を広く取るため既定は閉じ、閉じている間は右下の丸ボタンだけを出す
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [mode, setMode] = useState<ViewMode>('launch');
  const [photoFrame, setPhotoFrame] = useState<PhotoFrameId>('none');
  const [isFramePickerOpen, setIsFramePickerOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const homeCanvasRef = useRef<HomeCanvasHandle>(null);
  // 画面に重ねているフォトフレームのcanvas。撮影時はこれをそのまま合成する
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);

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
      whiteSaturationRatio: 0.2,
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
    // 打ち上げた瞬間にパネルを縮め、花火の視界を確保する
    setIsSettingsOpen(false);
  };

  const resetCameraRotation = () => {
    homeCanvasRef.current?.resetCameraRotation();
  };

  const isReady = !!particleData && !isConverting;
  const isPhotoMode = mode === 'photo';

  // ===== 写真撮影モード =====
  // 合成対象（カメラ映像・花火・フォトフレームのcanvas）は録画ループから毎フレーム
  // 呼ばれるうえ、AR初期化後に揃うため、値ではなく「取りに行く関数」として渡す
  const getCaptureSources = useCallback(
      () => ({
        ...(homeCanvasRef.current?.getCaptureSources() ?? { video: null, gl: null }),
        frame: frameCanvasRef.current,
      }),
      [],
  );
  const capture = usePhotoCapture(getCaptureSources);
  const { isHintVisible, notifyLaunched } = useTapHint(isPhotoMode && isReady);

  /** タップした位置に花火を打ち上げる */
  const handleTapLaunch = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isReady) return;
    // AR.jsはcanvasを画面より大きく引き伸ばすことがあるため、
    // 画面サイズではなくcanvasの実際の表示矩形でNDCを求める
    const glCanvas = getCaptureSources().gl;
    const rect = glCanvas?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const width = rect?.width || window.innerWidth;
    const height = rect?.height || window.innerHeight;

    const ndcX = ((e.clientX - left) / width) * 2 - 1;
    const ndcY = -((e.clientY - top) / height) * 2 + 1;
    homeCanvasRef.current?.launchAtNdc(ndcX, ndcY);
    // 1度でも上がったら案内を消す（しばらく上がらなければ再表示される）
    notifyLaunched();
  };

  const handleModeChange = (next: ViewMode) => {
    setMode(next);
    // 前のモードで開いていたフレーム選択は畳んでおく
    if (next !== 'photo') setIsFramePickerOpen(false);
  };

  const currentQualityIndex = QUALITY_LEVELS.findIndex((level) => level.resolution === resolution);
  const currentModeIndex = VIEW_MODES.findIndex((m) => m.id === mode);
  // 読み込みが完了した上で、実際にエラーだった場合か imageUrl が無い（旧レコード）場合だけを
  // 「読み込み失敗」とする。以前は `!showLaunchButton`（= isLoading・isConverting・isReady が
  // すべて false）から失敗を導出していたが、isConverting はデータ取得後の別のuseEffectで
  // 非同期に true になるため、そのuseEffectが走る前の一瞬「読み込み中でも変換中でも完了でも
  // ない」状態を通過してしまい、成功時にも誤って読み込み失敗と判定されていた（結果、設定
  // パネルが自動で開いたまま戻らなくなっていた）。isLoading/error/data という
  // react-queryが直接管理する値だけから判定することで、このタイミング依存を無くす
  const hasLoadFailed = !isLoading && (!!error || (!!data && !data.imageUrl));
  // 読み込み中・変換中も打ち上げボタンを表示したまま disabled にし、パネルの高さが変わらないようにする
  const showLaunchButton = !hasLoadFailed;

  // 読み込みに失敗したときは、QRコードをスキャンをすぐ押せるようパネルを自動で開く
  useEffect(() => {
    if (hasLoadFailed) setIsSettingsOpen(true);
  }, [hasLoadFailed]);

  /** 設定を閉じているときだけ出す、右下の丸い設定ボタン */
  const settingsFab = !isSettingsOpen && (
      <button
          onClick={() => setIsSettingsOpen(true)}
          style={circleFabStyle}
          className="hb-pressable"
          aria-label="設定を開く"
          aria-expanded={false}
          aria-controls="home-settings"
      >
        <MdSettings />
      </button>
  );

  return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <HomeCanvas
            illustrationFireworks={illustrationFireworks}
            particleData={particleData}
            ref={homeCanvasRef}
        />

        {isPhotoMode && (
            <>
              {/* 画面をタップして花火を上げるための層。UIより後ろなのでボタン操作は邪魔しない */}
              <div style={tapLayerStyle} onPointerDown={handleTapLaunch} />
              <FrameOverlayCanvas frameId={photoFrame} canvasRef={frameCanvasRef} />
              <TapHint isVisible={isHintVisible} />

              {/* 写真撮影モードから抜ける導線。設定を一度も開いていない人には
                  モード切替が設定の中にあること自体が見えないため、常に出しておく */}
              <button
                  onClick={() => handleModeChange('launch')}
                  style={exitPhotoModeButtonStyle}
                  className="hb-pressable"
              >
                <MdArrowBack style={exitPhotoModeIconStyle} />
                打ち上げモード
              </button>

              {capture.isRecording && (
                  <div style={recordingPillStyle}>
                    <span style={recordingDotStyle} className="hb-blink" />
                    REC {formatDuration(capture.recordingMs)}
                  </div>
              )}

              {/* シャッターを切った瞬間のフラッシュ。keyを変えてアニメーションを撮り直す */}
              {capture.flashKey > 0 && (
                  <span key={capture.flashKey} style={captureFlashStyle} className="hb-flash" />
              )}

              {capture.errorMessage && (
                  <div style={captureErrorToastStyle}>{capture.errorMessage}</div>
              )}
            </>
        )}

        <div style={homeOverlayContainerStyle}>
          {/* 詳細設定は既定で閉じておき、花火と重なる面積を減らす。
              閉じている間は右下の丸ボタン（settingsFab）から開く */}
          {isSettingsOpen && (
              <div style={panelStyle}>
                <button
                    onClick={() => setIsSettingsOpen(false)}
                    style={settingsToggleButtonStyle(true)}
                    className="hb-pressable"
                    aria-expanded={true}
                    aria-controls="home-settings"
                >
                  <span style={settingsToggleLabelRowStyle}>
                    <span style={settingsIconBadgeStyle(true)}>
                      <MdSettings />
                    </span>
                    設定
                  </span>
                  <MdExpandMore className="hb-chevron hb-chevron--open" style={settingsChevronStyle} />
                </button>

                <div id="home-settings" style={settingsSectionStyle} className="hb-reveal">
                  {/* モード切替（打ち上げ / 写真撮影） */}
                  <div style={qualityRowContainerStyle}>
                    <span style={qualityLabelStyle}>モード</span>
                    <div style={segmentedContainerStyle}>
                      <div style={segmentedIndicatorStyle(Math.max(currentModeIndex, 0), VIEW_MODES.length)} />
                      {VIEW_MODES.map((viewMode) => (
                          <button
                              key={viewMode.id}
                              onClick={() => handleModeChange(viewMode.id)}
                              style={segmentedButtonStyle(mode === viewMode.id)}
                              aria-pressed={mode === viewMode.id}
                          >
                            {viewMode.label}
                          </button>
                      ))}
                    </div>
                  </div>

                  {/* 画質セレクタ（低32 / 中64 / 高128） */}
                  <div style={qualityRowContainerStyle}>
                    <span style={qualityLabelStyle}>解像度</span>
                    <div style={segmentedContainerStyle}>
                      <div style={segmentedIndicatorStyle(Math.max(currentQualityIndex, 0), QUALITY_LEVELS.length)} />
                      {QUALITY_LEVELS.map((level) => (
                          <button
                              key={level.resolution}
                              onClick={() => setResolution(level.resolution)}
                              disabled={isConverting}
                              style={segmentedButtonStyle(resolution === level.resolution)}
                          >
                            {level.label}
                          </button>
                      ))}
                    </div>
                  </div>

                  {isReady && (
                      <button onClick={resetCameraRotation} style={ghostButtonStyle} className="hb-pressable">
                        <MdRestartAlt style={ghostButtonIconStyle} />
                        カメラのリセット
                      </button>
                  )}

                  {/* QRコードのスキャンは折りたたみ内に置き、閉じている間は花火の視界を確保する */}
                  <button onClick={() => setIsOpen(true)} style={ghostButtonStyle} className="hb-pressable">
                    <MdQrCodeScanner style={ghostButtonIconStyle} />
                    QRコードをスキャン
                  </button>
                </div>
              </div>
          )}

          {/* 写真撮影モードでも、花火が読み込めていないことは伝える（撮影自体はできる） */}
          {isPhotoMode && hasLoadFailed && (
              <div style={errorPillStyle}>
                花火が読み込めませんでした<br />
                別のQRコードをスキャンしてください
              </div>
          )}

          {isPhotoMode && isFramePickerOpen && (
              <FramePicker frameId={photoFrame} onChange={setPhotoFrame} />
          )}

          {isPhotoMode ? (
              <div style={photoRowStyle}>
                <div style={bottomRowSideStyle('start')}>
                  <button
                      onClick={() => setIsFramePickerOpen((prev) => !prev)}
                      style={frameButtonStyle(isFramePickerOpen || photoFrame !== 'none')}
                      className="hb-pressable"
                      aria-label="フォトフレームを選ぶ"
                      aria-expanded={isFramePickerOpen}
                  >
                    <MdFilterFrames />
                  </button>
                </div>

                <ShutterButton
                    isRecording={capture.isRecording}
                    progress={capture.recordingMs / MAX_RECORDING_MS}
                    canRecord={capture.canRecord}
                    disabled={capture.isBusy}
                    onPressStart={capture.pressStart}
                    onPressEnd={capture.pressEnd}
                />

                <div style={bottomRowSideStyle('end')}>{settingsFab}</div>
              </div>
          ) : (
              <div style={launchRowStyle}>
                {/* 写真撮影モードへは、設定を開かなくても1タップで行けるようにする。
                    写真撮影モード側の左端（フレーム選択）と位置が揃い、左右のバランスも取れる。
                    設定を開いている間はパネルの「モード」と役割が重なるので、右下の設定ボタンと同様に隠す */}
                {!isSettingsOpen && (
                    <button
                        onClick={() => handleModeChange('photo')}
                        style={circleFabStyle}
                        className="hb-pressable"
                        aria-label="写真撮影モードに切り替える"
                    >
                      <MdPhotoCamera />
                    </button>
                )}

                {/* 打ち上げボタンはローディング／変換中も disabled のまま表示し、パネルの高さを揺らさない */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {showLaunchButton ? (
                      <button
                          onClick={handleLaunch}
                          disabled={!isReady}
                          style={launchButtonStyle(!isReady)}
                          className="hb-pressable hb-launch"
                      >
                        {!isReady && <span className="hb-spin" style={spinnerStyle} />}
                        {isLoading ? '読み込み中...' : isConverting ? '画像を変換中...' : '花火を打ち上げる'}
                      </button>
                  ) : (
                      <div style={errorPillStyle}>
                        花火が読み込めませんでした<br />
                        別のQRコードをスキャンしてください
                      </div>
                  )}
                </div>
                {settingsFab}
              </div>
          )}
        </div>

        <ScanModal
            isOpen={isOpen}
            onScan={onScan}
            closeModal={() => setIsOpen(false)}
        />

        {capture.result && (
            <CaptureResultOverlay result={capture.result} onClose={capture.closeResult} />
        )}
      </div>
  );
}
