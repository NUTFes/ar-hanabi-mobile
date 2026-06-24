import { primaryButtonStyle } from '@/styles/adminStyles';

interface RefreshButtonProps {
  loading: boolean;
  onRefresh: () => void;
}

export default function RefreshButton({ loading, onRefresh }: RefreshButtonProps) {
  return (
    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          ...primaryButtonStyle,
          padding: '1rem 2rem',
          fontSize: '0.875rem',
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? '⏳ Loading...' : '🔄 Refresh Fireworks'}
      </button>
    </div>
  );
}
