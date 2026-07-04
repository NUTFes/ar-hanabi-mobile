import { primaryButtonStyle, inputStyle } from '@/styles/adminStyles';

interface AddFireworkFormProps {
  nextId: number;
  selectedFile: File | null;
  isShareable: boolean;
  isCreating: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onShareableChange: (checked: boolean) => void;
  onCreate: () => void;
}

export default function AddFireworkForm({
  nextId,
  selectedFile,
  isShareable,
  isCreating,
  onFileChange,
  onShareableChange,
  onCreate,
}: AddFireworkFormProps) {
  return (
    <div style={{
      marginTop: '2rem',
      borderTop: '2px solid #e2e8f0',
      paddingTop: '2rem',
    }}>
      <h3 style={{ fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
        ✨ 花火を追加
      </h3>

      <div style={{
        backgroundColor: '#f7fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
      }}>
        <p style={{ fontSize: '0.875rem', color: '#4a5568', margin: 0 }}>
          🆔 次の花火ID: <strong>#{nextId}</strong>
        </p>
      </div>

      <div>
        <label style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontWeight: '600',
          color: '#4a5568',
        }}>
          📁 画像ファイルをアップしてください:
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={onFileChange}
          style={{
            ...inputStyle,
            borderColor: selectedFile ? '#48bb78' : '#e2e8f0',
          }}
        />
        {selectedFile && (
          <p style={{
            fontSize: '0.875rem',
            color: '#48bb78',
            marginBottom: '1rem',
            fontWeight: '500',
          }}>
            ✅ 選択中: {selectedFile.name}
          </p>
        )}

        <label style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '1rem',
          cursor: 'pointer',
          padding: '0.75rem',
          backgroundColor: '#f7fafc',
          borderRadius: '8px',
          border: '2px solid #e2e8f0',
        }}>
          <input
            type="checkbox"
            checked={isShareable}
            onChange={(e) => onShareableChange(e.target.checked)}
            style={{
              marginRight: '0.75rem',
              width: '1rem',
              height: '1rem',
              accentColor: '#667eea',
            }}
          />
          <span style={{ fontWeight: '500', color: '#2d3748' }}>
            🌐 この花火を公開する
          </span>
        </label>

        <button
          onClick={onCreate}
          disabled={!selectedFile || isCreating}
          style={{
            ...primaryButtonStyle,
            width: '100%',
            padding: '1rem',
            fontSize: '0.875rem',
            opacity: (!selectedFile || isCreating) ? 0.6 : 1,
            cursor: (!selectedFile || isCreating) ? 'not-allowed' : 'pointer',
          }}
        >
          {isCreating ? '⏳ 作成中...' : `🚀 花火を作成 #${nextId}`}
        </button>
      </div>
    </div>
  );
}
