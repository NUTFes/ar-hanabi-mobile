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
        🔢 ID Management Information
      </h3>
      <div style={{ fontSize: '0.875rem', color: '#6c757d', lineHeight: '1.6' }}>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>Current Status:</strong> Next new firework will be assigned ID #{nextId}
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>ID Policy:</strong> IDs are never reused. When a firework is deleted, its ID becomes permanently unavailable.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>Safety:</strong> This prevents accidental access to deleted firework data and ensures QR code URLs remain unique.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>Image Storage:</strong> Images are automatically saved to localStorage when creating fireworks and will persist across sessions. Old images (30+ days) are automatically cleaned up.
        </p>
        <p>
          <strong>Total Fireworks:</strong> {totalCount} active firework{totalCount !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
