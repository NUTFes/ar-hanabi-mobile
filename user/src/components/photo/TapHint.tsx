import { MdTouchApp } from 'react-icons/md';
import {
  tapHintCardStyle,
  tapHintContainerStyle,
  tapHintIconStyle,
  tapHintTextStyle,
} from '../../pages/photoStyles';

interface Props {
  isVisible: boolean;
}

// 文言を変えるときは index.html のフォントサブセット（text=）にも文字を足すこと
const TAP_HINT_TEXT = 'タップしたところに花火が上がるよ';

/**
 * 「タップしたところに花火が上がるよ」の案内。
 *
 * 表示・非表示の判断は useTapHint が持ち、ここは見た目とフェードだけを担当する。
 * 非表示のときもDOMに残しておく（display:none にしない）ことで、
 * 消えるときも出てくるときもフェードが効く。
 */
export default function TapHint({ isVisible }: Props) {
  return (
    <div style={tapHintContainerStyle(isVisible)} aria-hidden={!isVisible}>
      <div style={tapHintCardStyle}>
        <MdTouchApp style={tapHintIconStyle} />
        <span style={tapHintTextStyle}>{TAP_HINT_TEXT}</span>
      </div>
    </div>
  );
}
