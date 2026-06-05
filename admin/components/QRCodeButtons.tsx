"use client";

interface QRCodeButtonsProps {
  onDownload?: () => void;
  onGeneratePrint: () => void;
  onGeneratePDF: () => void;
  isGeneratingPrint: boolean;
  isGeneratingPDF: boolean;
  primaryButtonStyle: React.CSSProperties;
  secondaryButtonStyle: React.CSSProperties;
  tertiaryButtonStyle: React.CSSProperties;
}

export default function QRCodeButtons({
  onDownload,
  onGeneratePrint,
  onGeneratePDF,
  isGeneratingPrint,
  isGeneratingPDF,
  primaryButtonStyle,
  secondaryButtonStyle,
  tertiaryButtonStyle,
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
