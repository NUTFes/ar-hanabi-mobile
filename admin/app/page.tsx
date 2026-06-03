'use client';

import React, { useState, useEffect, useCallback } from 'react';
import QRCode from '@/components/QRCode';
import DateFilter from '@/components/DateFilter';

// Types
interface Firework {
  id: number;
  isShareable: boolean;
  pixelData: boolean[];
  createdAt?: string;
  updatedAt?: string;
}

export default function Home() {
  // State
  const [fireworks, setFireworks] = useState<Firework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFirework, setSelectedFirework] = useState<Firework | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isShareable, setIsShareable] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [originalImageFiles, setOriginalImageFiles] = useState<Map<number, File>>(new Map());
  const [nextId, setNextId] = useState<number>(1);
  const [selectedDate, setSelectedDate] = useState('');

  // API URL - ブラウザからは必ず localhost を使用
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  // localStorageのキー生成
  const getImageStorageKey = useCallback((fireworkId: number) => {
    return `firework_image_${fireworkId}`;
  }, []);

  // 画像をlocalStorageに保存
  const saveImageToLocalStorage = useCallback(async (fireworkId: number, file: File) => {
    try {
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const result = reader.result as string;
            const imageData = {
              dataUrl: result,
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type,
              lastModified: file.lastModified,
              savedAt: Date.now()
            };
            localStorage.setItem(getImageStorageKey(fireworkId), JSON.stringify(imageData));
            console.log(`Saved image to localStorage for firework #${fireworkId}`);
            resolve();
          } catch (error) {
            console.error('Failed to save image to localStorage:', error);
            reject(error);
          }
        };
        reader.onerror = () => {
          console.error('Failed to read file for localStorage');
          reject(new Error('Failed to read file'));
        };
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error('Error saving image to localStorage:', error);
      throw error;
    }
  }, [getImageStorageKey]);

  // localStorageから画像を読み込み
  const loadImageFromLocalStorage = useCallback(async (fireworkId: number): Promise<File | null> => {
    try {
      const stored = localStorage.getItem(getImageStorageKey(fireworkId));
      if (!stored) {
        return null;
      }

      const imageData = JSON.parse(stored);
      if (!imageData.dataUrl || !imageData.fileName) {
        console.warn(`Invalid image data for firework #${fireworkId}`);
        return null;
      }

      // Base64からBlobを作成
      const response = await fetch(imageData.dataUrl);
      const blob = await response.blob();

      // BlobからFileオブジェクトを作成
      const file = new File([blob], imageData.fileName, {
        type: imageData.fileType || 'image/jpeg',
        lastModified: imageData.lastModified || Date.now()
      });

      console.log(`Loaded image from localStorage for firework #${fireworkId}: ${file.name}`);
      return file;
    } catch (error) {
      console.error(`Error loading image from localStorage for firework #${fireworkId}:`, error);
      return null;
    }
  }, [getImageStorageKey]);

  // 全ての花火の画像をlocalStorageから復元
  const loadAllImagesFromLocalStorage = useCallback(async (fireworkList: Firework[]) => {
    if (fireworkList.length === 0) {
      setOriginalImageFiles(new Map());
      return;
    }

    console.log('Loading images from localStorage...');
    const imageMap = new Map<number, File>();

    await Promise.all(
        fireworkList.map(async (firework) => {
          try {
            const file = await loadImageFromLocalStorage(firework.id);
            if (file) {
              imageMap.set(firework.id, file);
            }
          } catch (error) {
            console.error(`Failed to load image for firework #${firework.id}:`, error);
          }
        })
    );

    setOriginalImageFiles(imageMap);
    console.log(`Restored ${imageMap.size} images from localStorage`);
  }, [loadImageFromLocalStorage]);

  // localStorage から画像を削除
  const removeImageFromLocalStorage = useCallback((fireworkId: number) => {
    try {
      localStorage.removeItem(getImageStorageKey(fireworkId));
      console.log(`Removed image from localStorage for firework #${fireworkId}`);
    } catch (error) {
      console.error(`Failed to remove image from localStorage for firework #${fireworkId}:`, error);
    }
  }, [getImageStorageKey]);

  // 古い画像データのクリーンアップ（30日以上古いものを削除）
  const cleanupOldImages = useCallback(() => {
    try {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('firework_image_')) {
          try {
            const stored = localStorage.getItem(key);
            if (stored) {
              const imageData = JSON.parse(stored);
              if (imageData.savedAt && imageData.savedAt < thirtyDaysAgo) {
                keysToRemove.push(key);
              }
            }
          } catch {
            // 不正なデータは削除対象に追加
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`Cleaned up old image: ${key}`);
      });

      if (keysToRemove.length > 0) {
        console.log(`Cleaned up ${keysToRemove.length} old images from localStorage`);
      }
    } catch (error) {
      console.error('Error during localStorage cleanup:', error);
    }
  }, []);

  // 最新のIDを取得する関数
  const fetchLatestId = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/fireworks/latest-id`);
      if (response.ok) {
        const data = await response.json();
        const latestId = data.latestId || 0;
        setNextId(latestId + 1);
        console.log('Latest ID from database:', latestId, 'Next ID will be:', latestId + 1);
      } else {
        // APIエンドポイントが存在しない場合は、既存の花火から最大IDを計算
        const maxId = fireworks.length > 0 ? Math.max(...fireworks.map(f => f.id)) : 0;
        setNextId(maxId + 1);
        console.log('Calculated next ID from existing fireworks:', maxId + 1);
      }
    } catch (err) {
      console.warn('Failed to fetch latest ID, calculating from existing data:', err);
      const maxId = fireworks.length > 0 ? Math.max(...fireworks.map(f => f.id)) : 0;
      setNextId(maxId + 1);
    }
  }, [API_URL, fireworks]);

  // Fetch all fireworks
  const fetchFireworks = useCallback(async () => {
    setLoading(true);
    console.log('Fetching fireworks from:', API_URL);
    try {
      const response = await fetch(`${API_URL}/fireworks`);
      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorMessage = `HTTP error ${response.status}`;
        console.error('Fetch failed:', errorMessage);
        setError(`Failed to fetch fireworks: ${errorMessage}`);
        setFireworks([]);
        // 修正点: エラー時もlocalStorageから画像をクリア
        setOriginalImageFiles(new Map());
        return;
      }

      const data = await response.json();
      console.log('Fetched data:', data);

      // データがnullまたはundefinedの場合は空配列を設定
      const fireworksData = Array.isArray(data) ? data : [];
      setFireworks(fireworksData);

      // 修正点: ここでlocalStorageから画像を復元する
      await loadAllImagesFromLocalStorage(fireworksData);

      // 最新IDを計算・設定
      if (fireworksData.length > 0) {
        const maxId = Math.max(...fireworksData.map((f: Firework) => f.id));
        setNextId(maxId + 1);
        console.log('Max existing ID:', maxId, 'Next ID will be:', maxId + 1);
      } else {
        setNextId(1);
        console.log('No existing fireworks, next ID will be: 1');
      }

      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to fetch fireworks: ${errorMessage}`);
      // エラー時も空配列を設定
      setFireworks([]);
      setNextId(1);
    } finally {
      setLoading(false);
    }
  }, [API_URL, loadAllImagesFromLocalStorage]); // 依存配列に loadAllImagesFromLocalStorage を追加

  // 花火を選択したときの処理
  const selectFirework = useCallback((firework: Firework) => {
    setSelectedFirework(firework);
  }, []);

  // QRコードのダウンロード機能
  const handleQRDownload = useCallback((canvas: HTMLCanvasElement) => {
    if (selectedFirework) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `hanabi-qr-${selectedFirework.id}.png`;
      link.href = url;
      link.click();
    }
  }, [selectedFirework]);

  // QRコード用のURL生成（本番環境用）
  const generateQRUrl = useCallback((firework: Firework) => {
    // 花火表示用のURLを生成（本番環境）
    return `https://hanabi.nutfes.net/?id=${firework.id}`;
  }, []);

  // Create a new firework
  const createFirework = useCallback(async () => {
    if (!selectedFile) {
      setError('Please select an image file');
      return;
    }

    setIsCreating(true);
    try {
      // 最新のIDを取得してから作成
      await fetchLatestId();

      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('is_shareable', isShareable.toString());

      const response = await fetch(`${API_URL}/fireworks`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `HTTP error ${response.status}: ${errorText}`;
        console.error('Create failed:', errorMessage);
        setError(`Failed to create firework: ${errorMessage}`);
        return;
      }

      const result = await response.json();
      console.log('Created firework with ID:', result.id);

      // 作成された花火のIDに対してオリジナルファイルを保存
      if (result && result.id) {
        setOriginalImageFiles(prev => new Map(prev).set(result.id, selectedFile));

        // localStorageにも保存
        try {
          await saveImageToLocalStorage(result.id, selectedFile);
          console.log(`Saved original image to localStorage for firework #${result.id}`);
        } catch (storageError) {
          console.warn('Failed to save image to localStorage:', storageError);
          // localStorageエラーは致命的ではないので続行
        }

        // 次のIDを更新
        setNextId(result.id + 1);
      }

      await fetchFireworks();
      setSelectedFile(null);
      setIsShareable(false);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to create firework: ${errorMessage}`);
      console.error('Error creating firework:', err);
    } finally {
      setIsCreating(false);
    }
  }, [selectedFile, isShareable, API_URL, fetchFireworks, fetchLatestId, saveImageToLocalStorage]);

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  }, []);

  // Delete firework（安全な削除処理）- 個別の削除状態管理
  const deleteFirework = useCallback(async (fireworkId: number) => {
    if (!confirm(`Are you sure you want to delete firework #${fireworkId}? This action cannot be undone.`)) {
      return;
    }

    // 個別の削除状態を管理
    setDeletingIds(prev => new Set(prev).add(fireworkId));

    try {
      const response = await fetch(`${API_URL}/fireworks/${fireworkId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMessage = `HTTP error ${response.status}`;
        console.error('Delete failed:', errorMessage);
        setError(`Failed to delete firework: ${errorMessage}`);
        return;
      }

      console.log(`Successfully deleted firework #${fireworkId}`);

      // 削除後のデータ再取得
      await fetchFireworks();

      // 削除された花火が選択されていた場合はクリア
      if (selectedFirework?.id === fireworkId) {
        setSelectedFirework(null);
      }

      // オリジナルファイルも削除
      setOriginalImageFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(fireworkId);
        return newMap;
      });

      // localStorageからも削除
      removeImageFromLocalStorage(fireworkId);

      setError(null);

      console.log(`Firework #${fireworkId} deleted. Next new firework will still use ID: ${nextId}`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to delete firework: ${errorMessage}`);
      console.error('Error deleting firework:', err);
    } finally {
      // 削除状態をクリア
      setDeletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(fireworkId);
        return newSet;
      });
    }
  }, [API_URL, fetchFireworks, selectedFirework, nextId, removeImageFromLocalStorage]);

  // Load fireworks on component mount
  useEffect(() => {
    console.log('Component mounted, fetching fireworks...');
    fetchFireworks();
  }, [fetchFireworks]);

  // コンポーネントマウント時に古い画像データをクリーンアップ
  useEffect(() => {
    cleanupOldImages();
  }, [cleanupOldImages]);

  // 🔍 デバッグ: コンポーネント情報をログ出力
  useEffect(() => {
    console.log(`🏁 [COMPONENT] Fireworks Admin loaded at ${new Date().toISOString()}`);
    console.log(`📊 [COMPONENT] Features: create, delete, QR generation, localStorage persistence`);
  }, []);

  // デバッグ用：fireworksの状態をログ出力
  useEffect(() => {
    console.log('Fireworks state changed:', fireworks);
    console.log('Next ID will be:', nextId);
  }, [fireworks, nextId]);

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#f0f4f8',
    fontFamily: 'Arial, sans-serif',
  };

  const headerStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '1.5rem',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  };

  const mainStyle: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem',
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
    marginBottom: '1.5rem',
    border: '1px solid #e2e8f0',
  };

  const primaryButtonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    margin: '0.25rem',
    fontWeight: '600',
    fontSize: '0.875rem',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #38b2ac 0%, #319795 100%)',
    color: 'white',
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    margin: '0.25rem',
    fontWeight: '600',
    fontSize: '0.875rem',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba56, 178, 172, 0.3)',
  };

  const dangerButtonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
    color: 'white',
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    margin: '0.25rem',
    fontWeight: '600',
    fontSize: '0.875rem',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(245, 101, 101, 0.3)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.875rem',
    transition: 'border-color 0.2s ease',
    outline: 'none',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '1.5rem',
  };

  const fireworkItemStyle = (isSelected: boolean): React.CSSProperties => ({
    border: isSelected ? '2px solid #667eea' : '2px solid #e2e8f0',
    padding: '1.25rem',
    marginBottom: '0.75rem',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: isSelected ? '#f7fafc' : 'transparent',
    transition: 'all 0.2s ease',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });

  const statusBadgeStyle = (isShareable: boolean): React.CSSProperties => ({
    backgroundColor: isShareable ? '#48bb78' : '#ed8936',
    color: 'white',
    padding: '0.25rem 0.75rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '600',
  });

  const filteredFireworks = fireworks.filter((firework) => {
  if (!selectedDate) return true;
  if (!firework.createdAt) return false;

  const fireworkDate = new Date(
    firework.createdAt
  ).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

  return fireworkDate === selectedDate;
});

  return (
      <div style={containerStyle}>
        <header style={headerStyle}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', margin: 0 }}>
            🎆 Fireworks Admin Dashboard
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9 }}>
            Manage and generate QR codes for firework displays
          </p>
        </header>

        <main style={mainStyle}>
          {error && (
              <div style={{
                backgroundColor: '#fed7d7',
                borderLeft: '4px solid #e53e3e',
                color: '#c53030',
                padding: '1rem',
                marginBottom: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(245, 101, 101, 0.1)',
              }}>
                <p style={{ fontWeight: '600' }}>⚠️ Error: {error}</p>
                <button
                    onClick={() => setError(null)}
                    style={{
                      ...dangerButtonStyle,
                      marginTop: '0.5rem',
                      padding: '0.5rem 1rem',
                      fontSize: '0.75rem',
                    }}
                >
                  Dismiss
                </button>
              </div>
          )}

          <div style={gridStyle}>
            {/* Fireworks List */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
                📋 Fireworks List
              </h2>
              {loading ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{
                      display: 'inline-block',
                      width: '40px',
                      height: '40px',
                      border: '4px solid #e2e8f0',
                      borderTop: '4px solid #667eea',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      marginBottom: '1rem'
                    }}></div>
                    <p style={{ color: '#718096' }}>Loading fireworks...</p>
                  </div>
              ) : !fireworks || fireworks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#718096' }}>
                    <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>🎭 No fireworks found</p>
                    <p>Create your first firework below!</p>
                  </div>
              ) : (
                  <div>
                    <DateFilter
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                    totalCount={fireworks.length}
                    filteredCount={filteredFireworks.length}
                    />
                    <p style={{ marginBottom: '1rem', color: '#718096', fontSize: '0.875rem' }}>
                      💡 Click on a firework to view its QR code
                    </p>
                    {filteredFireworks.map((firework) => (
                        <div key={firework.id}
                             style={fireworkItemStyle(selectedFirework?.id === firework.id)}
                             onClick={() => selectFirework(firework)}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#2d3748' }}>
                              🎆 Firework #{firework.id}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                              <span style={statusBadgeStyle(firework.isShareable)}>
                                {firework.isShareable ? '🌐 Shareable' : '🔒 Private'}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                                📅 {firework.createdAt ? new Date(firework.createdAt).toLocaleDateString() : 'N/A'}
                              </span>

                            </div>
                          </div>

                          <div>
                            <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteFirework(firework.id);
                                }}
                                disabled={deletingIds.has(firework.id)}
                                style={{
                                  ...dangerButtonStyle,
                                  padding: '0.5rem 1rem',
                                  fontSize: '0.75rem',
                                  opacity: deletingIds.has(firework.id) ? 0.6 : 1,
                                }}
                                title="Delete firework"
                            >
                              {deletingIds.has(firework.id) ? '⏳ Deleting...' : '🗑️ Delete'}
                            </button>
                          </div>
                        </div>
                    ))}
                  </div>
              )}

              <div style={{
                marginTop: '2rem',
                borderTop: '2px solid #e2e8f0',
                paddingTop: '2rem'
              }}>
                <h3 style={{ fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
                  ✨ Add New Firework
                </h3>
                <div style={{
                  backgroundColor: '#f7fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  <p style={{ fontSize: '0.875rem', color: '#4a5568', margin: 0 }}>
                    🆔 Next Firework ID will be: <strong>#{nextId}</strong>
                  </p>
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    color: '#4a5568'
                  }}>
                    📁 Image File:
                  </label>
                  <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      style={{
                        ...inputStyle,
                        borderColor: selectedFile ? '#48bb78' : '#e2e8f0'
                      }}
                  />
                  {selectedFile && (
                      <p style={{
                        fontSize: '0.875rem',
                        color: '#48bb78',
                        marginBottom: '1rem',
                        fontWeight: '500'
                      }}>
                        ✅ Selected: {selectedFile.name}
                      </p>
                  )}

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    cursor: 'pointer',
                    padding: '0.75rem',
                    backgroundColor: '#f7fafc',
                    borderRadius: '8px',
                    border: '2px solid #e2e8f0'
                  }}>
                    <input
                        type="checkbox"
                        checked={isShareable}
                        onChange={(e) => setIsShareable(e.target.checked)}
                        style={{
                          marginRight: '0.75rem',
                          width: '1rem',
                          height: '1rem',
                          accentColor: '#667eea'
                        }}
                    />
                    <span style={{ fontWeight: '500', color: '#2d3748' }}>
                      🌐 Make this firework shareable
                    </span>
                  </label>

                  <button
                      onClick={createFirework}
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
                    {isCreating ? '⏳ Creating...' : `🚀 Create Firework #${nextId}`}
                  </button>
                </div>
              </div>
            </div>

            {/* QR Code Display */}
            {selectedFirework && (
                <div style={cardStyle}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
                    📱 QR Code for Firework #{selectedFirework.id}
                  </h2>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ marginBottom: '1.5rem', color: '#718096' }}>
                      📸 Scan this QR code to view the firework
                    </p>

                    <QRCode
                        url={generateQRUrl(selectedFirework)}
                        size={200}
                        fireworkId={selectedFirework.id}
                        originalImageFile={originalImageFiles.get(selectedFirework.id)}
                        onDownload={handleQRDownload}
                        onError={(error) => setError(error)}
                    />

                    <div style={{
                      marginTop: '1.5rem',
                      padding: '1rem',
                      backgroundColor: '#edf2f7',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      wordBreak: 'break-all',
                      border: '1px solid #e2e8f0'
                    }}>
                      <strong style={{ color: '#2d3748' }}>🔗 Production URL:</strong>
                      <br />
                      <span style={{ color: '#667eea', fontFamily: 'monospace' }}>
                        {generateQRUrl(selectedFirework)}
                      </span>
                    </div>

                    <div style={{ marginTop: '1.5rem' }}>
                      <div style={{
                        fontSize: '0.875rem',
                        color: '#718096',
                        marginBottom: '0.75rem',
                        fontWeight: '500'
                      }}>
                        📊 Firework Details:
                      </div>
                      <div style={{
                        textAlign: 'left',
                        backgroundColor: '#f7fafc',
                        padding: '1rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        border: '1px solid #e2e8f0'
                      }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#2d3748' }}>🆔 ID:</strong> {selectedFirework.id}
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#2d3748' }}>🌐 Shareable:</strong>
                          <span style={statusBadgeStyle(selectedFirework.isShareable)}>
                            {selectedFirework.isShareable ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#2d3748' }}>📅 Created:</strong> {selectedFirework.createdAt ? new Date(selectedFirework.createdAt).toLocaleString() : 'N/A'}
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#2d3748' }}>🔄 Updated:</strong> {selectedFirework.updatedAt ? new Date(selectedFirework.updatedAt).toLocaleString() : 'N/A'}
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#2d3748' }}>🎨 Pixel Data:</strong> {selectedFirework.pixelData?.length || 0} pixels
                        </div>
                        <div>
                          <strong style={{ color: '#2d3748' }}>🖼️ Print Image:</strong> {originalImageFiles.has(selectedFirework.id) ? '✅ Available (saved in localStorage)' : '❌ Not available'}
                        </div>
                      </div>
                    </div>

                    <button
                        onClick={() => setSelectedFirework(null)}
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
            )}
          </div>

          {/* Refresh Button */}
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button
                onClick={fetchFireworks}
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

          {/* ID Management Info */}
          <div style={{
            ...cardStyle,
            marginTop: '2rem',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6'
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
                <strong>Total Fireworks:</strong> {fireworks.length} active firework{fireworks.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </main>

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          button:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
          }
          
          input[type="file"]:focus,
          input[type="file"]:hover,
          input[type="number"]:focus,
          input[type="number"]:hover {
            border-color: #667eea;
          }
        `}</style>
      </div>
  );
}