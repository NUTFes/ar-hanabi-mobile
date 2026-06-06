"use client";

import { CSSProperties } from 'react';

const buttonBaseStyle: CSSProperties = {
  color: 'white',
  padding: '0.75rem 1.5rem',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: '600',
  transition: 'all 0.2s ease',
  margin: '0.25rem',
};

const buttonStyles = {
  primary: {
    ...buttonBaseStyle,
    background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
    boxShadow: '0 2px 4px rgba(72, 187, 120, 0.3)',
  },
  secondary: {
    ...buttonBaseStyle,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)',
  },
  tertiary: {
    ...buttonBaseStyle,
    background: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
    boxShadow: '0 2px 4px rgba(237, 137, 54, 0.3)',
  },
} as const;

interface QRCodeButtonsProps {
  onDownload?: () => void;
  onGeneratePrint: () => void;
  onGeneratePDF: () => void;
  isGeneratingPrint: boolean;
  isGeneratingPDF: boolean;
}

export default function QRCodeButtons({
  onDownload,
  onGeneratePrint,
  onGeneratePDF,
  isGeneratingPrint,
  isGeneratingPDF,
}: QRCodeButtonsProps) {
  return (
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {onDownload && (
            <button
                onClick={onDownload}
                style={primaryButtonStyle}
                title="Download QR Code as PNG"
            >
              💾 Download QR Code
            </button>
        )}

        <button
            onClick={onGeneratePrint}
            disabled={isGeneratingPrint}
            style={{
              ...secondaryButtonStyle,
              opacity: isGeneratingPrint ? 0.6 : 1,
              cursor: isGeneratingPrint ? 'not-allowed' : 'pointer',
            }}
            title="Generate printable page for acrylic keychain (45×32mm inserts)"
        >
          {isGeneratingPrint ? '⏳ Generating...' : '🔑 Keychain Print'}
        </button>

        <button
            onClick={onGeneratePDF}
            disabled={isGeneratingPDF}
            style={{
              ...tertiaryButtonStyle,
              opacity: isGeneratingPDF ? 0.6 : 1,
              cursor: isGeneratingPDF ? 'not-allowed' : 'pointer',
            }}
            title="Download PDF for acrylic keychain (45×32mm inserts)"
        >
          {isGeneratingPDF ? '⏳ Generating...' : '📄 Keychain PDF'}
        </button>
      </div>
  );
}
