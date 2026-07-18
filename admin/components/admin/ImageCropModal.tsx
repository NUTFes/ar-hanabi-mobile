'use client';

import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { primaryButtonStyle, secondaryButtonStyle } from '@/styles/adminStyles';
import { getCroppedImg } from '@/utils/cropImage';

interface ImageCropModalProps {
  imageSrc: string;
  fileName: string;
  mimeType: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

export default function ImageCropModal({
  imageSrc,
  fileName,
  mimeType,
  onConfirm,
  onCancel,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCropComplete = useCallback((_croppedArea: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleRotateLeft = useCallback(() => {
    setRotation((prev) => normalizeRotation(prev - 90));
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotation((prev) => normalizeRotation(prev + 90));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const file = await getCroppedImg(imageSrc, croppedAreaPixels, rotation, fileName, mimeType);
      onConfirm(file);
    } catch (error) {
      console.error('Failed to crop image:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [imageSrc, croppedAreaPixels, rotation, fileName, mimeType, onConfirm]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        }}
      >
        <h3 style={{ fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
          ✂️ 画像を編集
        </h3>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '320px',
            backgroundColor: '#1a202c',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', color: '#4a5568', marginBottom: '0.25rem' }}>
            🔍 ズーム
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', color: '#4a5568', marginBottom: '0.25rem' }}>
            🔄 回転
          </label>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={handleRotateLeft}
              style={{ ...secondaryButtonStyle, flex: 1 }}
            >
              ⟲ 左90°
            </button>
            <button
              type="button"
              onClick={handleRotateRight}
              style={{ ...secondaryButtonStyle, flex: 1 }}
            >
              ⟳ 右90°
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              ...secondaryButtonStyle,
              flex: 1,
              opacity: isProcessing ? 0.6 : 1,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            ✖️ キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing || !croppedAreaPixels}
            style={{
              ...primaryButtonStyle,
              flex: 1,
              opacity: isProcessing || !croppedAreaPixels ? 0.6 : 1,
              cursor: isProcessing || !croppedAreaPixels ? 'not-allowed' : 'pointer',
            }}
          >
            {isProcessing ? '⏳ 処理中...' : '✅ 確定'}
          </button>
        </div>
      </div>
    </div>
  );
}
