"use client";

import { FC, useRef, useCallback, useState } from "react";
import Image from "next/image";
import QRCodeButtons from "./QRCodeButtons";
import ImagePreview from "./admin/ImagePreview";
import { createImage } from "@/utils/cropImage";
import { removeWhiteBackground } from "@/utils/removeWhiteBackground";
import { flattenOnWhite } from "@/utils/flattenOnWhite";
import { KEYCHAIN_WIDTH_MM, KEYCHAIN_HEIGHT_MM, KEYCHAIN_PADDING_MM } from "@/utils/keychainLayout";

interface QRCodeProps {
    url: string;
    size?: number;
    fireworkId: number;
    originalImageFile?: File;
    imageUrl: string | null;
    onDownload?: (canvas: HTMLCanvasElement) => void;
    onError?: (error: string) => void;
}

// Blob/File を dataURL 文字列に変換する共通ヘルパー
function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result === 'string') {
                resolve(result);
            } else {
                reject(new Error('Blobを文字列として読み込むことに失敗しました。'));
            }
        };
        reader.onerror = () => reject(new Error('Blobの読み込みに失敗しました。'));
        reader.readAsDataURL(blob);
    });
}

// localStorageに残っている元ファイルを優先し、無ければサーバー上の画像を取得する。
// Canvasで安全に画素を読み取れるよう、どちらの場合もdata URLへ変換して返す。
async function resolveOriginalImageDataUrl(
    originalImageFile?: File,
    imageUrl?: string | null
): Promise<string> {
    if (originalImageFile) {
        try {
            return await blobToDataUrl(originalImageFile);
        } catch (fileError) {
            console.warn('元の画像ファイルの読み込みに失敗しました:', fileError);
        }
    }

    if (!imageUrl) return '';

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new Error(`サーバー上の画像の取得に失敗しました: ${imageResponse.status}`);
    }
    return blobToDataUrl(await imageResponse.blob());
}

// jsPDFの標準フォント（Helvetica等）は日本語グリフを持たないため、PDF内の日本語ラベルが
// 文字化けする。/public/fonts に置いた日本語対応フォント（このPDFで実際に使う文字だけに
// サブセット化済み、詳細は public/fonts/README.md）を読み込んでBase64化し、jsPDFへ埋め込む。
async function loadFontAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load font: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

// PDF生成のたびに約87KBのフォントを再取得・再エンコードしないよう、初回取得分を
// モジュールスコープにキャッシュして使い回す（失敗時は次回呼び出しで再取得できるようにする）。
let fontBase64Promise: Promise<string> | null = null;
function getFontBase64(): Promise<string> {
    if (!fontBase64Promise) {
        fontBase64Promise = loadFontAsBase64('/fonts/NotoSansJP-subset.ttf').catch((err) => {
            fontBase64Promise = null;
            throw err;
        });
    }
    return fontBase64Promise;
}

// dataURL画像の実寸（px）を取得する
async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    const img = await createImage(dataUrl);
    return { width: img.naturalWidth, height: img.naturalHeight };
}

// CSSの object-fit: contain と同じロジック。box内に元の縦横比を保ったまま収まる
// 最大サイズと、box内で中央寄せするためのオフセットを返す。
function fitContain(boxWidth: number, boxHeight: number, imageWidth: number, imageHeight: number) {
    const boxAspect = boxWidth / boxHeight;
    const imageAspect = imageWidth / imageHeight;
    const width = imageAspect > boxAspect ? boxWidth : boxHeight * imageAspect;
    const height = imageAspect > boxAspect ? boxWidth / imageAspect : boxHeight;
    return {
        x: (boxWidth - width) / 2,
        y: (boxHeight - height) / 2,
        width,
        height,
    };
}

const QRCodeComponent: FC<QRCodeProps> = ({
                                              url,
                                              size = 250,
                                              fireworkId,
                                              imageUrl,
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

            // QRコードの取得は他の画像・フォント読み込みと独立しているため、
            // ここで先に開始しておき（fetch呼び出し自体で通信が始まる）、
            // 実際に必要になるタイミングでまとめて await することで並行実行する
            const qrFetchPromise = fetch(qrImageUrl);

            // PDFには背景付きの元画像ではなく、花火部分だけを残した透過PNGを埋め込む。
            const transparentImagePromise = resolveOriginalImageDataUrl(
                originalImageFile,
                imageUrl
            ).then((source) => source ? removeWhiteBackground(source) : '');

            // QRコードの画像を取得
            const [qrResponse, transparentImageDataUrl] = await Promise.all([
                qrFetchPromise,
                transparentImagePromise,
            ]);
            if (!qrResponse.ok) {
                if (onError) {
                    onError('QRコードの取得に失敗しました');
                }
                return;
            }
            const qrDataUrl = await blobToDataUrl(await qrResponse.blob());

            // PDFを作成 (A4縦向き)
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // 日本語フォントを埋め込み、以降のすべての pdf.text() で使用する
            // （標準フォントのままだと日本語が文字化けするため）
            const fontBase64 = await getFontBase64();
            pdf.addFileToVFS('NotoSansJP-subset.ttf', fontBase64);
            pdf.addFont('NotoSansJP-subset.ttf', 'NotoSansJP', 'normal');
            pdf.setFont('NotoSansJP');

            const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
            // const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

            // アクリルキーホルダーのサイズ（45×32mm）
            const keychainWidth = KEYCHAIN_WIDTH_MM;
            const keychainHeight = KEYCHAIN_HEIGHT_MM;
            const margin = 10;

            // QRコード（左上）
            const qrX = margin;
            const qrY = margin;

            // 画像（QRコードの右隣）
            const imageX = margin + keychainWidth + 10;
            const imageY = margin;

            // アクリルキーホルダーへの挿入時にはカット誤差が出るため、切り取り線（点線）に
            // ぴったり接する配置は避け、QR・画像の両方に同じ余白を確保する
            // （印刷用HTML側の .qr-code-keychain / .image-keychain の padding: 2mm と揃えること）
            const keychainPadding = KEYCHAIN_PADDING_MM;

            // 枠線を描画
            pdf.setDrawColor(150, 150, 150);
            pdf.setLineDashPattern([1, 1], 0);
            pdf.setLineWidth(0.3);

            // QRコード用の枠
            pdf.rect(qrX, qrY, keychainWidth, keychainHeight);

            // 画像用の枠
            pdf.rect(imageX, imageY, keychainWidth, keychainHeight);

            // QRコードを配置（少し余白を持たせる）。縦横比を保ったまま余白付きの枠内に
            // 収まるサイズへ縮小し、中央寄せする（object-fit: contain と同じ考え方）
            const qrPadding = keychainPadding;
            const qrBoxWidth = keychainWidth - (qrPadding * 2);
            const qrBoxHeight = keychainHeight - (qrPadding * 2);
            // サイズ測定に失敗しても致命的ではないため、その場合は歪みには目をつぶり
            // 枠いっぱいに配置する（PDF全体の生成を失敗させない）
            let qrFit = { x: 0, y: 0, width: qrBoxWidth, height: qrBoxHeight };
            try {
                const qrDims = await getImageDimensions(qrDataUrl);
                qrFit = fitContain(qrBoxWidth, qrBoxHeight, qrDims.width, qrDims.height);
            } catch (qrDimError) {
                console.warn('QRコードのサイズ測定に失敗しました。枠いっぱいに配置します:', qrDimError);
            }
            pdf.addImage(qrDataUrl, 'PNG',
                qrX + qrPadding + qrFit.x,
                qrY + qrPadding + qrFit.y,
                qrFit.width,
                qrFit.height
            );

            // 画像を配置（QRコードと同じく余白を確保した枠内に収める。枠いっぱいに配置すると
            // 正方形いっぱいに描かれた絵が切り取り線に接し、はみ出して見えるため）
            const imageBoxWidth = keychainWidth - (keychainPadding * 2);
            const imageBoxHeight = keychainHeight - (keychainPadding * 2);
            if (transparentImageDataUrl) {
                try {
                    // 透過PNGの縦横比を保ったまま枠内に収め、中央寄せする
                    const imgDims = await getImageDimensions(transparentImageDataUrl);
                    if (!(imgDims.width > 0) || !(imgDims.height > 0)) {
                        throw new Error(`画像の寸法が不正です: ${imgDims.width}x${imgDims.height}`);
                    }
                    const imgFit = fitContain(imageBoxWidth, imageBoxHeight, imgDims.width, imgDims.height);
                    pdf.addImage(transparentImageDataUrl, 'PNG',
                        imageX + keychainPadding + imgFit.x,
                        imageY + keychainPadding + imgFit.y,
                        imgFit.width,
                        imgFit.height
                    );

                } catch (imgError) {
                    console.warn('PDFへの画像の追加に失敗しました：', imgError);
                    // 画像が追加できない場合はプレースホルダーを描画
                    pdf.setDrawColor(200, 200, 200);
                    pdf.rect(imageX + 5, imageY + 5, keychainWidth - 10, keychainHeight - 10);
                    pdf.setFontSize(8);
                    pdf.setDrawColor(0, 0, 0);
                    pdf.text('花火のアイコン', imageX + keychainWidth/2, imageY + keychainHeight/2, { align: 'center' });
                }
            } else {
                // プレースホルダー
                pdf.setDrawColor(200, 200, 200);
                pdf.rect(imageX + 5, imageY + 5, keychainWidth - 10, keychainHeight - 10);
                pdf.setFontSize(8);
                pdf.setDrawColor(0, 0, 0);
                pdf.text('花火のアイコン', imageX + keychainWidth/2, imageY + keychainHeight/2, { align: 'center' });
            }

            // ラベルを追加
            pdf.setLineDashPattern([], 0);
            pdf.setDrawColor(0, 0, 0);
            pdf.setFontSize(8);
            pdf.text('QRコード (裏面)', qrX, qrY + keychainHeight + 5);
            pdf.text('アイコン (表面)', imageX, imageY + keychainHeight + 5);

            // 情報セクション
            const infoY = qrY + keychainHeight + 20;
            pdf.setFontSize(10);
            // 絵文字は埋め込みフォントのグリフに含まれない（色付き絵文字は簡易TTF埋め込みでは
            // 描画できない）ため、PDF内のテキストからは除外する
            pdf.text('アクリルキーホルダー情報', margin, infoY);

            pdf.setFontSize(8);
            pdf.text(`花火ID: ${fireworkId}`, margin, infoY + 8);
            pdf.text('挿入サイズ: 45mm × 32mm（各1枚）', margin, infoY + 14);
            pdf.text('使い方: QRコードを裏面、アイコンを表面に配置してください', margin, infoY + 20);
            pdf.text('印刷サイズ: A4（210mm × 297mm）', margin, infoY + 26);

            pdf.setFontSize(7);
            pdf.text('QRコードURL:', margin, infoY + 38);

            // URLを複数行に分割
            const urlLines = pdf.splitTextToSize(url, pageWidth - (margin * 2));
            pdf.text(urlLines, margin, infoY + 44);

            // 切り取りガイド
            pdf.setFontSize(7);
            pdf.setTextColor(100, 100, 100);
            pdf.text('枠線に沿って切り取って、アクリルキーホルダーに入れてください', margin, qrY + keychainHeight + 12);

            // PDFをダウンロード
            pdf.save(`acrylic-keychain-${fireworkId}.pdf`);

        } catch (error) {
            console.error('PDF生成エラー:', error);
            if (onError) {
                onError('PDFの生成に失敗しました');
            }
        } finally {
            setIsGeneratingPDF(false);
        }
    }, [qrImageUrl, fireworkId, originalImageFile, imageUrl, onError, url]);

    // 印刷用のHTMLページを生成（アクリルキーホルダー用：45×32mm）
    const handleGeneratePrintPage = useCallback(async () => {
        setIsGeneratingPrint(true);

        try {
            // QRコードの取得は画像処理と独立しているため、先に通信を始めて並行実行する
            const qrFetchPromise = fetch(qrImageUrl);

            const originalImageDataUrl = await resolveOriginalImageDataUrl(
                originalImageFile,
                imageUrl
            );
            // 印刷ページもPDFと同じく白背景を除去した画像を使う。ただし印刷経路では、
            // 透過PNGのアルファチャンネルを正しく描画できないプリンタードライバー
            // （Canon等）があり、透過部分が黒くなる／画像が出力されないことがあるため、
            // 白へ合成してから埋め込む。白い紙では透明と白は同じ結果になるので見た目は変わらない。
            const printImageSrc = originalImageDataUrl
                ? await flattenOnWhite(await removeWhiteBackground(originalImageDataUrl))
                : '';

            // QRコードは外部URLの直参照ではなくdata URLとして埋め込む。印刷ウィンドウ側で
            // 画像の取得が終わらないまま印刷ダイアログが開くと、QRコードが白紙で印刷される。
            const qrResponse = await qrFetchPromise;
            if (!qrResponse.ok) {
                if (onError) {
                    onError('QRコードの取得に失敗しました');
                }
                return;
            }
            const qrDataUrl = await blobToDataUrl(await qrResponse.blob());

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
            width: ${KEYCHAIN_WIDTH_MM}mm;
            height: ${KEYCHAIN_HEIGHT_MM}mm;
            /* border を含めて 45×32mm にする。content-box のままだと枠線が実寸より
               外側にはみ出し、PDF側の pdf.rect(45, 32) と切り取り線のサイズがずれる */
            box-sizing: border-box;
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
            /* 切り取り線に接しないよう、PDF側の keychainPadding と同じ余白を確保する */
            padding: ${KEYCHAIN_PADDING_MM}mm;
            box-sizing: border-box;
        }

        .qr-code-keychain {
            width: 100%;
            height: 100%;
            object-fit: contain;
            padding: ${KEYCHAIN_PADDING_MM}mm;
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

        /* 画面上だけに表示する操作パネル（印刷結果には含めない） */
        .print-actions {
            position: absolute;
            top: 55mm;
            left: 10mm;
            width: 190mm;
            font-family: sans-serif;
            font-size: 12px;
            color: #333;
        }

        .print-actions button {
            font-size: 13px;
            padding: 6px 14px;
            margin-right: 8px;
            cursor: pointer;
        }

        .print-actions .hint {
            margin-top: 8px;
            line-height: 1.7;
        }

        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .print-actions {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="keychain-item qr-item">
        <img src="${qrDataUrl}" alt="QR Code" class="qr-code-keychain" />
    </div>
    
    <div class="keychain-item image-item">
        ${printImageSrc ?
                `<img src="${printImageSrc}" alt="Firework Design" class="image-keychain" />` :
                `<div class="placeholder">Firework Design</div>`
            }
    </div>
    
    <div class="print-actions" id="print-actions" hidden>
        <button type="button" onclick="window.print()">もう一度印刷する</button>
        <button type="button" onclick="window.close()">このタブを閉じる</button>
        <p class="hint">
            印刷ダイアログでは「用紙サイズ: A4」「倍率: 実際のサイズ（100%）」を選んでください。<br>
            「用紙に合わせる」で印刷すると 45×32mm からずれ、キーホルダーに入らなくなります。<br>
            送信先のプリンターも確認してください。接続していないプリンター（USBを抜いた状態のキュー等）を
            選ぶと、エラーにならずジョブが溜まるだけで印刷されません。
        </p>
    </div>

    <script>
        // 画像の読み込みとデコードが終わってから印刷ダイアログを開く。
        // 固定のsetTimeoutで待つ方式は、待ち時間が足りなければ白紙で印刷され、
        // 足りていれば無駄に待たされる。
        function waitForImages() {
            return Promise.all(Array.prototype.map.call(document.images, function (img) {
                if (img.decode) {
                    // デコードに失敗しても（画像が壊れている等）印刷自体は続行する
                    return img.decode().catch(function () {});
                }
                if (img.complete) {
                    return Promise.resolve();
                }
                return new Promise(function (resolve) {
                    img.addEventListener('load', resolve, { once: true });
                    img.addEventListener('error', resolve, { once: true });
                });
            }));
        }

        window.addEventListener('load', function () {
            waitForImages().then(function () {
                document.getElementById('print-actions').hidden = false;
                try {
                    window.print();
                } catch (e) {
                    console.error('Print failed:', e);
                }
            });
        });

        // window.onafterprint でこのウィンドウを自動的に閉じてはいけない。
        // onafterprintは「ジョブの送信完了」ではなく「印刷ダイアログが閉じた」時点で
        // 発火するため、スプール中にページを破棄すると印刷が実行されないことがある。
        // 特にCanonのように独自の設定ダイアログを開くドライバーでは、
        // 「システムダイアログを使用して印刷」を選んだ時点でこのウィンドウが閉じ、
        // ジョブごと失われる。閉じる操作はユーザーに任せる。
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
                        onError('ポップアップがブロックされました。ブラウザの設定を確認し、もう一度お試しください。');
                    }
                }
            } catch (windowError) {
                console.error('印刷ウィンドウを開けませんでした:', windowError);
                if (onError) {
                    onError('印刷ウィンドウを開けませんでした。ブラウザの設定を確認してください。');
                }
            }

        } catch (error) {
            console.error('印刷生成エラー:', error);
            if (onError) {
                onError('印刷用ページの生成に失敗しました。');
            }
        } finally {
            setIsGeneratingPrint(false);
        }
    }, [qrImageUrl, fireworkId, originalImageFile, imageUrl, onError]);

    return (
        <div style={{ textAlign: 'center' }}>
            <div className="saa" style={{ display: 'flex', justifyContent: 'center'}}>
                <ImagePreview 
                    imageUrl={imageUrl}
                    />
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
            </div>

            <QRCodeButtons
                onDownload={onDownload ? handleDownload : undefined}
                onGeneratePrint={handleGeneratePrintPage}
                onGeneratePDF={handleGeneratePDF}
                isGeneratingPrint={isGeneratingPrint}
                isGeneratingPDF={isGeneratingPDF}
            />

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
