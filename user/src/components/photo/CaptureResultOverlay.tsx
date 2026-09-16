import { useState } from 'react';
import { MdDownload, MdIosShare } from 'react-icons/md';
import { saveCapture, type CaptureResult } from '../../lib/mediaCapture';
import {
  resultActionsStyle,
  resultCloseButtonStyle,
  resultMediaStyle,
  resultNoteStyle,
  resultOverlayStyle,
  resultSaveButtonStyle,
} from '../../pages/photoStyles';

interface Props {
  result: CaptureResult;
  onClose: () => void;
}

/** 共有シートが使える環境か。ボタンの文言とアイコンを揃えるために先に調べておく */
function canUseShareSheet(): boolean {
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (typeof navigator.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    // 中身は判定に使われないので、形式だけ合ったダミーで問い合わせる
    return nav.canShare({ files: [new File([], 'a.jpg', { type: 'image/jpeg' })] });
  } catch {
    return false;
  }
}

/** 撮った写真・動画のプレビューと保存 */
export default function CaptureResultOverlay({ result, onClose }: Props) {
  const [note, setNote] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [useShare] = useState(() => canUseShareSheet());

  const kindLabel = result.kind === 'photo' ? '写真' : '動画';

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const how = await saveCapture(result);
      // 共有シートは開くところまでしか分からない（どこに保存したかはOS側の操作）ので、
      // 「保存しました」と言い切らずに次の操作を案内する
      if (how === 'shared') setNote(`「${kindLabel}を保存」を選ぶと${kindLabel}アプリに入ります`);
      else if (how === 'downloaded') setNote('ダウンロードフォルダに保存しました');
      // 'cancelled'（共有シートを閉じただけ）は何も言わない
    } catch (err) {
      console.error('保存に失敗しました', err);
      setNote(`保存できませんでした。${result.kind === 'photo' ? '画像を長押しして保存してください' : ''}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 端末の写真フォルダへ直接書き込むAPIはブラウザに無いため、
  // 共有シート経由（iOS/Android）かダウンロード（PC等）を案内する
  const guide = useShare
      ? `「保存」→ 共有シートの「${kindLabel}を保存」で${kindLabel}アプリに入ります`
      : 'ダウンロードフォルダに保存されます';

  return (
    <div style={resultOverlayStyle} role="dialog" aria-label="撮影結果">
      {result.kind === 'photo' ? (
        // 長押しでOS標準の「写真に保存」が出せるよう、コールアウトは殺さない
        <img src={result.url} alt="撮影した写真" style={resultMediaStyle} />
      ) : (
        <video src={result.url} style={resultMediaStyle} controls autoPlay loop playsInline />
      )}

      <div style={resultActionsStyle}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={resultSaveButtonStyle}
          className="hb-pressable"
        >
          {useShare ? <MdIosShare /> : <MdDownload />}
          {isSaving ? '保存中...' : `${kindLabel}を保存`}
        </button>
        <button type="button" onClick={onClose} style={resultCloseButtonStyle} className="hb-pressable">
          閉じる
        </button>
      </div>

      <div style={resultNoteStyle}>{note ?? guide}</div>
    </div>
  );
}
