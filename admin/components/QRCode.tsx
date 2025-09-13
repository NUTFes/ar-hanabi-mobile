"use client";

import React, { FC, useRef, useCallback, useState } from "react";
import Image from "next/image";

interface QRCodeProps {
    url: string;
    size?: number;
    fireworkId: number;
    originalImageFile?: File;
    onDownload?: (canvas: HTMLCanvasElement) => void;
    onError?: (error: string) => void;
}

const QRCodeComponent: FC<QRCodeProps> = ({
                                              url,
                                              size = 250,
                                              fireworkId,
                                              originalImageFile,
                                              onDownload,
                                              onError
                                          }) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const [imageError, setImageError] = useState(false);
    const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    // QR Server API を使用してQRコードを生成
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&format=png&margin=10`;

    const handleDownload = useCallback(async () => {
        if (!onDownload) return;

        try {
            const response = await fetch(qrImageUrl);
            if (!response.ok) {
                console.error('Failed to fetch QR code image:', response.status);
                if (onError) onError('Failed to fetch QR code image.');
                return;
            }

            const imageBlob = await response.blob();
            const imageUrl = URL.createObjectURL(imageBlob);
            const img = new window.Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, size, size);
                    onDownload(canvas);
                }
                URL.revokeObjectURL(imageUrl);
            };

            img.src = imageUrl;
        } catch (err) {
            console.error('Error in QR code download process:', err);
            if (onError) onError('An error occurred during QR code generation.');
        }
    }, [qrImageUrl, size, onDownload, onError]);

    const handleImageLoad = useCallback(() => {
        setImageError(false);
    }, []);

    const handleImageError = useCallback(() => {
        setImageError(true);
        if (onError) {
            onError('QRコード画像の読み込みに失敗しました。URLを確認してください。');
        }
    }, [onError]);

    // PDFで最大サイズ印刷用のレイアウトを生成（アクリルキーホルダー用）
    const handleGeneratePDF = useCallback(async () => {
        setIsGeneratingPDF(true);

        try {
            // jsPDFを動的にインポート
            const { jsPDF } = await import('jspdf');

            let originalImageDataUrl = '';
            if (originalImageFile) {
                try {
                    originalImageDataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const result = reader.result;
                            if (typeof result === 'string') {
                                resolve(result);
                            } else {
                                reject('Failed to read image file as string');
                            }
                        };
                        reader.onerror = () => reject('Failed to read image file');
                        reader.readAsDataURL(originalImageFile);
                    });
                } catch (fileError) {
                    console.warn('Failed to read original image file:', fileError);
                }
            }

            // QRコードの画像を取得
            const qrResponse = await fetch(qrImageUrl);
            if (!qrResponse.ok) {
                if (onError) {
                    onError('Failed to fetch QR code');
                }
                return;
            }
            const qrBlob = await qrResponse.blob();
            const qrDataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result;
                    if (typeof result === 'string') {
                        resolve(result);
                    } else {
                        reject('Failed to read QR code blob as string');
                    }
                };
                reader.onerror = () => reject('Failed to read QR code blob');
                reader.readAsDataURL(qrBlob);
            });

            // PDFを作成 (A4縦向き)
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
            // const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

            // アクリルキーホルダーのサイズ（45×32mm）
            const keychainWidth = 45;
            const keychainHeight = 32;
            const margin = 10;

            // QRコード（左上）
            const qrX = margin;
            const qrY = margin;

            // 画像（QRコードの右隣）
            const imageX = margin + keychainWidth + 10;
            const imageY = margin;

            // 枠線を描画
            pdf.setDrawColor(150, 150, 150);
            pdf.setLineDashPattern([1, 1], 0);
            pdf.setLineWidth(0.3);

            // QRコード用の枠
            pdf.rect(qrX, qrY, keychainWidth, keychainHeight);

            // 画像用の枠
            pdf.rect(imageX, imageY, keychainWidth, keychainHeight);

            // QRコードを配置（少し余白を持たせる）
            const qrPadding = 2;
            pdf.addImage(qrDataUrl, 'PNG',
                qrX + qrPadding,
                qrY + qrPadding,
                keychainWidth - (qrPadding * 2),
                keychainHeight - (qrPadding * 2)
            );

            // 画像を配置
            if (originalImageDataUrl) {
                try {
                    // 画像の形式を自動検出
                    const imageFormat = originalImageDataUrl.includes('data:image/png') ? 'PNG' :
                        originalImageDataUrl.includes('data:image/jpeg') ? 'JPEG' :
                            originalImageDataUrl.includes('data:image/jpg') ? 'JPEG' :
                                originalImageDataUrl.includes('data:image/gif') ? 'GIF' :
                                    originalImageDataUrl.includes('data:image/webp') ? 'WEBP' : 'JPEG';

                    pdf.addImage(originalImageDataUrl, imageFormat,
                        imageX,
                        imageY,
                        keychainWidth,
                        keychainHeight
                    );

                } catch (imgError) {
                    console.warn('Failed to add image to PDF:', imgError);
                    // 画像が追加できない場合はプレースホルダーを描画
                    pdf.setDrawColor(200, 200, 200);
                    pdf.rect(imageX + 5, imageY + 5, keychainWidth - 10, keychainHeight - 10);
                    pdf.setFontSize(8);
                    pdf.setDrawColor(0, 0, 0);
                    pdf.text('Firework Design', imageX + keychainWidth/2, imageY + keychainHeight/2, { align: 'center' });
                }
            } else {
                // プレースホルダー
                pdf.setDrawColor(200, 200, 200);
                pdf.rect(imageX + 5, imageY + 5, keychainWidth - 10, keychainHeight - 10);
                pdf.setFontSize(8);
                pdf.setDrawColor(0, 0, 0);
                pdf.text('Firework Design', imageX + keychainWidth/2, imageY + keychainHeight/2, { align: 'center' });
            }

            // ラベルを追加
            pdf.setLineDashPattern([], 0);
            pdf.setDrawColor(0, 0, 0);
            pdf.setFontSize(8);
            pdf.text('QR Code (裏面)', qrX, qrY + keychainHeight + 5);
            pdf.text('Design (表面)', imageX, imageY + keychainHeight + 5);

            // 情報セクション
            const infoY = qrY + keychainHeight + 20;
            pdf.setFontSize(10);
            pdf.text('🔑 Acrylic Keychain Information', margin, infoY);

            pdf.setFontSize(8);
            pdf.text(`Firework ID: ${fireworkId}`, margin, infoY + 8);
            pdf.text('Insert Size: 45mm × 32mm (each)', margin, infoY + 14);
            pdf.text('Usage: Place QR code on back, design on front', margin, infoY + 20);
            pdf.text('Print Size: A4 (210mm × 297mm)', margin, infoY + 26);

            pdf.setFontSize(7);
            pdf.text('QR Code URL:', margin, infoY + 38);

            // URLを複数行に分割
            const urlLines = pdf.splitTextToSize(url, pageWidth - (margin * 2));
            pdf.text(urlLines, margin, infoY + 44);

            // 切り取りガイド
            pdf.setFontSize(7);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Cut along the border lines for acrylic keychain inserts', margin, qrY + keychainHeight + 12);

            // PDFをダウンロード
            pdf.save(`acrylic-keychain-${fireworkId}.pdf`);

        } catch (error) {
            console.error('PDF generation error:', error);
            if (onError) {
                onError('Failed to generate PDF');
            }
        } finally {
            setIsGeneratingPDF(false);
        }
    }, [qrImageUrl, fireworkId, originalImageFile, onError, url]);

    // 印刷用のHTMLページを生成（アクリルキーホルダー用：45×32mm）
    const handleGeneratePrintPage = useCallback(async () => {
        setIsGeneratingPrint(true);

        try {
            let originalImageDataUrl = '';
            if (originalImageFile) {
                try {
                    originalImageDataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const result = reader.result;
                            if (typeof result === 'string') {
                                resolve(result);
                            } else {
                                reject('Failed to read image file as string');
                            }
                        };
                        reader.onerror = () => reject('Failed to read image file');
                        reader.readAsDataURL(originalImageFile);
                    });
                } catch (fileError) {
                    console.warn('Failed to read original image file:', fileError);
                }
            }

            // 印刷用のHTMLを生成（アクリルキーホルダー用レイアウト）
            const printHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Print Acrylic Keychain - Firework #${fireworkId}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 0;
        }
        
        body {
            margin: 0;
            padding: 0;
            width: 210mm;
            height: 297mm;
            position: relative;
        }
        
        .keychain-item {
            width: 45mm;
            height: 32mm;
            position: absolute;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px dashed black;
        }
        
        .qr-item {
            top: 10mm;
            left: 10mm;
        }
        
        .image-item {
            top: 10mm;
            left: 65mm;
        }
        
        .image-keychain {
            width: 100%;
            height: 100%;
            object-fit: contain;
            box-sizing: border-box;
            transform: rotate(90deg);
            transform-origin: center;
        }
        
        .qr-code-keychain {
            width: 100%;
            height: 100%;
            object-fit: contain;
            padding: 2mm;
            box-sizing: border-box;
        }
        
        .placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            font-size: 8px;
            color: #666;
            text-align: center;
        }

        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="keychain-item qr-item">
        <img src="${qrImageUrl}" alt="QR Code" class="qr-code-keychain" />
    </div>
    
    <div class="keychain-item image-item">
        ${originalImageDataUrl ?
                `<img src="${originalImageDataUrl}" alt="Firework Design" class="image-keychain" />` :
                `<div class="placeholder">Firework Design</div>`
            }
    </div>
    
    <script>
        // ページが読み込まれたら自動的に印刷ダイアログを表示
        window.onload = function() {
            setTimeout(function() {
                try {
                    window.print();
                } catch (e) {
                    console.error('Print failed:', e);
                }
            }, 1000);
        };
        
        // 印刷後にウィンドウを閉じる
        window.onafterprint = function() {
            setTimeout(function() {
                window.close();
            }, 500);
        };
    </script>
</body>
</html>`;

            // Blob URLを使用して印刷用ページを開く
            try {
                const blob = new Blob([printHTML], { type: 'text/html' });
                const blobUrl = URL.createObjectURL(blob);

                const printWindow = window.open(blobUrl, '_blank');

                if (printWindow) {
                    printWindow.addEventListener('beforeunload', () => {
                        URL.revokeObjectURL(blobUrl);
                    });
                } else {
                    URL.revokeObjectURL(blobUrl);
                    if (onError) {
                        onError('Pop-up blocked. Please check your browser settings and try again.');
                    }
                }
            } catch (windowError) {
                console.error('Failed to open print window:', windowError);
                if (onError) {
                    onError('Failed to open print window. Please check your browser settings.');
                }
            }

        } catch (error) {
            console.error('Print generation error:', error);
            if (onError) {
                onError('Failed to generate print page');
            }
        } finally {
            setIsGeneratingPrint(false);
        }
    }, [qrImageUrl, fireworkId, originalImageFile, onError]);

    // Button styles
    const buttonBaseStyle: React.CSSProperties = {
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

    const primaryButtonStyle: React.CSSProperties = {
        ...buttonBaseStyle,
        background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
        boxShadow: '0 2px 4px rgba(72, 187, 120, 0.3)',
    };

    const secondaryButtonStyle: React.CSSProperties = {
        ...buttonBaseStyle,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)',
    };

    const tertiaryButtonStyle: React.CSSProperties = {
        ...buttonBaseStyle,
        background: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
        boxShadow: '0 2px 4px rgba(237, 137, 54, 0.3)',
    };

    return (
        <div style={{ textAlign: 'center' }}>
            <div
                style={{
                    display: 'inline-block',
                    padding: '1.5rem',
                    backgroundColor: 'white',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    marginBottom: '1.5rem',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
                }}
            >
                {imageError ? (
                    <div
                        style={{
                            width: size,
                            height: size,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#fed7d7',
                            color: '#c53030',
                            border: '2px solid #feb2b2',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: '600'
                        }}
                    >
                        ❌ QR Code failed to load
                    </div>
                ) : (
                    <Image
                        ref={imgRef}
                        src={qrImageUrl}
                        alt="QR Code"
                        width={size}
                        height={size}
                        style={{
                            display: 'block',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                        }}
                        onError={handleImageError}
                        onLoad={handleImageLoad}
                        unoptimized={true}
                    />
                )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {onDownload && (
                    <button
                        onClick={handleDownload}
                        style={primaryButtonStyle}
                        title="Download QR Code as PNG"
                    >
                        💾 Download QR Code
                    </button>
                )}

                <button
                    onClick={handleGeneratePrintPage}
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
                    onClick={handleGeneratePDF}
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

            <div style={{
                fontSize: '0.75rem',
                color: '#718096',
                marginTop: '1rem',
                fontStyle: 'italic'
            }}>
                📡 QR Code generated by QR Server API
            </div>

            <div style={{
                fontSize: '0.75rem',
                color: '#718096',
                marginTop: '0.5rem',
                fontStyle: 'italic'
            }}>
                🔑 45×32mm inserts for acrylic keychains (QR back, design front)
            </div>
        </div>
    );
};

export default QRCodeComponent;