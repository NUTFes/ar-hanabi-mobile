'use client';

import { useState } from 'react';
import { primaryButtonStyle, secondaryButtonStyle, inputStyle } from '@/styles/adminStyles';
import ImageCropModal from './ImageCropModal';

interface AddFireworkFormProps {
  nextId: number;
  selectedFile: File | null;
  isShareable: boolean;
  isCreating: boolean;
  onEditedFile: (file: File) => void;
  onShareableChange: (checked: boolean) => void;
  onCreate: () => void;
}

interface EditorMeta {
  fileName: string;
  mimeType: string;
}

export default function AddFireworkForm({
  nextId,
  selectedFile,
  isShareable,
  isCreating,
  onEditedFile,
  onShareableChange,
  onCreate,
}: AddFireworkFormProps) {
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [editorMeta, setEditorMeta] = useState<EditorMeta | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const openEditorForFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
      setEditorMeta({ fileName: file.name, mimeType: file.type });
      setIsEditorOpen(true);
    };
    reader.onerror = () => {
      console.error('Failed to read image file:', reader.error);
      window.alert('⚠️ 画像ファイルの読み込みに失敗しました。別のファイルでお試しください。');
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      openEditorForFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handleEditAgain = () => {
    if (selectedFile) {
      openEditorForFile(selectedFile);
    }
  };

  const handleEditorConfirm = (file: File) => {
    onEditedFile(file);
    setIsEditorOpen(false);
  };

  const handleEditorCancel = () => {
    setIsEditorOpen(false);
  };

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
          onChange={handleFileInputChange}
          style={{
            ...inputStyle,
            borderColor: selectedFile ? '#48bb78' : '#e2e8f0',
          }}
        />
        {selectedFile && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{
              fontSize: '0.875rem',
              color: '#48bb78',
              marginBottom: '0.5rem',
              fontWeight: '500',
            }}>
              ✅ 選択中: {selectedFile.name}
            </p>
            <button
              type="button"
              onClick={handleEditAgain}
              style={{ ...secondaryButtonStyle, width: '100%' }}
            >
              ✂️ 画像を編集
            </button>
          </div>
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

      {isEditorOpen && rawImageSrc && editorMeta && (
        <ImageCropModal
          imageSrc={rawImageSrc}
          fileName={editorMeta.fileName}
          mimeType={editorMeta.mimeType}
          onConfirm={handleEditorConfirm}
          onCancel={handleEditorCancel}
        />
      )}
    </div>
  );
}
