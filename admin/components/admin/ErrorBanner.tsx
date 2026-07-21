import { dangerButtonStyle } from '@/styles/adminStyles';

interface ErrorBannerProps {
  error: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  return (
    <div style={{
      backgroundColor: '#fed7d7',
      borderLeft: '4px solid #e53e3e',
      color: '#c53030',
      padding: '1rem',
      marginBottom: '1.5rem',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(245, 101, 101, 0.1)',
    }}>
      <p style={{ fontWeight: '600' }}>⚠️ エラー！: {error}</p>
      <button
        onClick={onDismiss}
        style={{
          ...dangerButtonStyle,
          marginTop: '0.5rem',
          padding: '0.5rem 1rem',
          fontSize: '0.75rem',
        }}
      >
        このウィンドウを消す
      </button>
    </div>
  );
}
