import { PHOTO_FRAMES, type PhotoFrameId } from '../../lib/photoFrames';
import { frameChipStyle, framePickerRowStyle } from '../../pages/photoStyles';

interface Props {
  frameId: PhotoFrameId;
  onChange: (frameId: PhotoFrameId) => void;
}

/**
 * フォトフレームの選択行。
 *
 * アクション行の上に出す。常に出しておくと花火が隠れるので、
 * 表示の切り替えは呼び出し側（左端のフレームボタン）が持つ。
 */
export default function FramePicker({ frameId, onChange }: Props) {
  return (
    <div style={framePickerRowStyle} className="hb-reveal" role="group" aria-label="フォトフレーム">
      {PHOTO_FRAMES.map((frame) => (
        <button
          key={frame.id}
          type="button"
          onClick={() => onChange(frame.id)}
          style={frameChipStyle(frame.id === frameId)}
          aria-pressed={frame.id === frameId}
        >
          {frame.label}
        </button>
      ))}
    </div>
  );
}
