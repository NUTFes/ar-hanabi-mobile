import { cardStyle } from '@/styles/adminStyles';

interface IdManagementInfoProps {
  nextId: number;
  totalCount: number;
}

export default function IdManagementInfo({ nextId, totalCount }: IdManagementInfoProps) {
  return (
    <div style={{
      ...cardStyle,
      marginTop: '2rem',
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
    }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
        🔢 ID管理情報
      </h3>
      <div style={{ fontSize: '0.875rem', color: '#6c757d', lineHeight: '1.6' }}>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>現在の状況:</strong> 次に作成される花火ID: #{nextId}
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>IDについて:</strong> IDは再利用されません。花火が削除されると、そのIDは二度と使えません。
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>安全性:</strong> ↑により、削除された花火のデータへの誤ったアクセスを防ぎ、QRコードのURLが一意であることを保証します。
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>画像ストレージ:</strong> 花火の作成時に画像は自動的にlocalStorageへ保存され、セッションをまたいで保持されます。古い画像（30日以上経過したもの）は自動的に削除されます。
        </p>
        <p>
          <strong>花火の総数:</strong> {totalCount} （有効な花火{totalCount !== 1 ? 'ら' : ''}）
        </p>
      </div>
    </div>
  );
}
