import Modal from 'react-modal'
import QrScanner from './QrScanner';

// アプリ要素の設定（コンポーネント外で一度だけ実行）
if (typeof window !== 'undefined' && document.getElementById('root')) {
  Modal.setAppElement('#root')
}

interface CommonModalProps {
	isOpen: boolean
  onScan: (result: string) => void; // QRコードスキャン時のコールバック関数
	closeModal: () => void
}

export default function ScanModal ({ isOpen, onScan, closeModal }: CommonModalProps) {
	return (
		<Modal
      isOpen={isOpen}
      onRequestClose={closeModal}
      style={{
        content: {
          top: '50%',
          left: '50%',
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)', // モーダルを中央に配置
          // alignContent: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '80vw', // ビューポートの幅の80%を最大幅に設定
          maxHeight: '50vh', // ビューポートの高さの50%を最大高さに設定
          overflow: 'hidden', // オーバーフローを隠す
          zIndex: 1000, // モーダルのz-indexを設定
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.75)', // 半透明の背景色
        },
      }}
    >
      {/* QRコードスキャナーを表示 */}
      <QrScanner 
        onScan={onScan} // QRコードスキャン時のコールバックを設定
      />
			<button
				onClick={closeModal}
				type="button"
				style={{
					marginTop: '12px',
					padding: '8px 20px',
					fontSize: '14px',
					fontWeight: 600,
					borderRadius: '10px',
					border: 'none',
					backgroundColor: '#f0b810',
					color: '#1a1a1a',
					cursor: 'pointer',
				}}
			>
				閉じる
			</button>
		</Modal>
	)
}