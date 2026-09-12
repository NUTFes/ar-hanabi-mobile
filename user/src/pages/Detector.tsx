import DetectorCanvas from "../canvas/DetectorCanvas";

// ===== Detectorのページ =====
// ジャンプを検出して花火を打ち上げる
// ページではデータフェッチやローカルストレージの読み書きを行う
export default function Detector() {
  return (
    <div className="hb-viewport-fill" style={{ width: '100vw', overflow: 'hidden' }}>
      <DetectorCanvas/>
    </div>
  );
}