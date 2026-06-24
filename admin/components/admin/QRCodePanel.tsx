import QRCode from '@/components/QRCode';
import { cardStyle, secondaryButtonStyle, statusBadgeStyle } from '@/styles/adminStyles';
import type { Firework } from '@/hooks/useFireworks';

interface QRCodePanelProps {
  firework: Firework;
  qrUrl: string;
  originalImageFile: File | undefined;
  onDownload: (canvas: HTMLCanvasElement) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export default function QRCodePanel({
  firework,
  qrUrl,
  originalImageFile,
  onDownload,
  onError,
  onClose,
}: QRCodePanelProps) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
        📱 QR Code for Firework #{firework.id}
      </h2>
      <div style={{ textAlign: 'center' }}>
        <p style={{ marginBottom: '1.5rem', color: '#718096' }}>
          📸 Scan this QR code to view the firework
        </p>

        <QRCode
          url={qrUrl}
          size={200}
          fireworkId={firework.id}
          originalImageFile={originalImageFile}
          onDownload={onDownload}
          onError={onError}
        />

        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#edf2f7',
          borderRadius: '8px',
          fontSize: '0.875rem',
          wordBreak: 'break-all',
          border: '1px solid #e2e8f0',
        }}>
          <strong style={{ color: '#2d3748' }}>🔗 Production URL:</strong>
          <br />
          <span style={{ color: '#667eea', fontFamily: 'monospace' }}>
            {qrUrl}
          </span>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <div style={{
            fontSize: '0.875rem',
            color: '#718096',
            marginBottom: '0.75rem',
            fontWeight: '500',
          }}>
            📊 Firework Details:
          </div>
          <div style={{
            textAlign: 'left',
            backgroundColor: '#f7fafc',
            padding: '1rem',
            borderRadius: '8px',
            fontSize: '0.875rem',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: '#2d3748' }}>🆔 ID:</strong> {firework.id}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: '#2d3748' }}>🌐 Shareable:</strong>
              <span style={statusBadgeStyle(firework.isShareable)}>
                {firework.isShareable ? 'Yes' : 'No'}
              </span>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: '#2d3748' }}>📅 Created:</strong>{' '}
              {firework.createdAt ? new Date(firework.createdAt).toLocaleString() : 'N/A'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: '#2d3748' }}>🔄 Updated:</strong>{' '}
              {firework.updatedAt ? new Date(firework.updatedAt).toLocaleString() : 'N/A'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: '#2d3748' }}>🎨 Pixel Data:</strong>{' '}
              {firework.pixelData?.length || 0} pixels
            </div>
            <div>
              <strong style={{ color: '#2d3748' }}>🖼️ Print Image:</strong>{' '}
              {originalImageFile
                ? '✅ Available (saved in localStorage)'
                : '❌ Not available'}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            ...secondaryButtonStyle,
            marginTop: '1.5rem',
            padding: '0.75rem 1.5rem',
          }}
        >
          ✖️ Close
        </button>
      </div>
    </div>
  );
}
