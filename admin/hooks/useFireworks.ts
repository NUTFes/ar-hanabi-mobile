import { useState, useEffect, useCallback } from 'react';
import {
  createStoredImage,
  getFireworkImageKey,
  setItemEvictingOldImages,
  FIREWORK_IMAGE_KEY_PREFIX,
} from '@/utils/imageStorage';

export interface Firework {
  id: number;
  isShareable: boolean;
  imageUrl: string | null;
  pixelData: boolean[];
  createdAt?: string;
  updatedAt?: string;
}

export function useFireworks() {
  const [fireworks, setFireworks] = useState<Firework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFirework, setSelectedFirework] = useState<Firework | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isShareable, setIsShareable] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [originalImageFiles, setOriginalImageFiles] = useState<Map<number, File>>(new Map());
  const [nextId, setNextId] = useState<number>(1);
  const [selectedDate, setSelectedDate] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  // ---- localStorage helpers ----

  // 印刷・PDFの元画像として使う控え。原寸のまま入れると数枚〜100枚程度で
  // localStorageを使い切るため、縮小コピーを保存し、それでも足りなければ
  // 古い花火の控えから消して空きを作る（消しても印刷はAPI上の画像で代替できる）。
  const saveImageToLocalStorage = useCallback(async (fireworkId: number, file: File) => {
    const storedImage = await createStoredImage(file);
    const saved = setItemEvictingOldImages(
      getFireworkImageKey(fireworkId),
      JSON.stringify(storedImage)
    );

    if (!saved) {
      console.warn(
        `花火 #${fireworkId} の画像をlocalStorageへ保存できませんでした（印刷時はサーバー上の画像を使います）`
      );
    }
  }, []);

  const loadImageFromLocalStorage = useCallback(async (fireworkId: number): Promise<File | null> => {
    try {
      const stored = localStorage.getItem(getFireworkImageKey(fireworkId));
      if (!stored) return null;

      const imageData = JSON.parse(stored);
      if (!imageData.dataUrl || !imageData.fileName) {
        console.warn(`Invalid image data for firework #${fireworkId}`);
        return null;
      }

      const response = await fetch(imageData.dataUrl);
      const blob = await response.blob();
      const file = new File([blob], imageData.fileName, {
        type: imageData.fileType || 'image/jpeg',
        lastModified: imageData.lastModified || Date.now()
      });

      return file;
    } catch (error) {
      console.error(`Error loading image from localStorage for firework #${fireworkId}:`, error);
      return null;
    }
  }, []);

  const loadAllImagesFromLocalStorage = useCallback(async (fireworkList: Firework[]) => {
    if (fireworkList.length === 0) {
      setOriginalImageFiles(new Map());
      return;
    }

    const imageMap = new Map<number, File>();

    await Promise.all(
      fireworkList.map(async (firework) => {
        try {
          const file = await loadImageFromLocalStorage(firework.id);
          if (file) imageMap.set(firework.id, file);
        } catch (error) {
          console.error(`Failed to load image for firework #${firework.id}:`, error);
        }
      })
    );

    setOriginalImageFiles(imageMap);
  }, [loadImageFromLocalStorage]);

  const removeImageFromLocalStorage = useCallback((fireworkId: number) => {
    try {
      localStorage.removeItem(getFireworkImageKey(fireworkId));
    } catch (error) {
      console.error(`Failed to remove image from localStorage for firework #${fireworkId}:`, error);
    }
  }, []);

  const cleanupOldImages = useCallback(() => {
    try {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(FIREWORK_IMAGE_KEY_PREFIX)) {
          try {
            const stored = localStorage.getItem(key);
            if (stored) {
              const imageData = JSON.parse(stored);
              if (imageData.savedAt && imageData.savedAt < thirtyDaysAgo) {
                keysToRemove.push(key);
              }
            }
          } catch {
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Error during localStorage cleanup:', error);
    }
  }, []);

  // ---- API handlers ----

  // 花火の削除は論理削除であり、DBのID採番（シーケンス）は削除しても巻き戻らない。
  // そのため「次のID」は削除済みを含めた最大IDをAPIから取得して算出する必要があり、
  // 表示中（削除済みを除いた）の花火一覧から計算すると、直近削除したIDが最大だった場合に
  // 実際にDBが採番するIDより小さい値を予測してしまう。API呼び出しに失敗した場合のみ、
  // 苦肉の策として渡された一覧（fallbackList）から計算する。
  // fallbackList は呼び出し側に明示的に渡してもらう（state の fireworks を直接参照すると、
  // この関数が fireworks の変更のたびに再生成され、これに依存する fetchFireworks も
  // 再生成されて mount 時 useEffect が無限に再実行されてしまうため）。
  const fetchLatestId = useCallback(async (fallbackList: Firework[]) => {
    try {
      const response = await fetch(`${API_URL}/fireworks/latest-id`);
      if (response.ok) {
        const data = await response.json();
        const latestId = data.latestId || 0;
        setNextId(latestId + 1);
        return;
      }
    } catch (err) {
      console.warn('Failed to fetch latest ID, calculating from existing data:', err);
    }
    const maxId = fallbackList.length > 0 ? Math.max(...fallbackList.map(f => f.id)) : 0;
    setNextId(maxId + 1);
  }, [API_URL]);

  const fetchFireworks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/fireworks`);

      if (!response.ok) {
        const errorMessage = `HTTP error ${response.status}`;
        setError(`Failed to fetch fireworks: ${errorMessage}`);
        setFireworks([]);
        setOriginalImageFiles(new Map());
        return;
      }

      const data = await response.json();
      const fireworksData = Array.isArray(data) ? data : [];
      setFireworks(fireworksData);

      await Promise.all([
        loadAllImagesFromLocalStorage(fireworksData),
        fetchLatestId(fireworksData),
      ]);

      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to fetch fireworks: ${errorMessage}`);
      setFireworks([]);
      setNextId(1);
    } finally {
      setLoading(false);
    }
  }, [API_URL, loadAllImagesFromLocalStorage, fetchLatestId]);

  const selectFirework = useCallback((firework: Firework | null) => {
    setSelectedFirework(firework);
  }, []);

  // 選択解除専用の安定した参照。onClose のようにコールバックとして渡す先
  // （例: QRCodePanel の Escapeキー用 useEffect）が、渡し方によって毎レンダー
  // 再生成されないようにする。
  const clearSelection = useCallback(() => {
    setSelectedFirework(null);
  }, []);

  const handleQRDownload = useCallback((canvas: HTMLCanvasElement) => {
    if (selectedFirework) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `hanabi-qr-${selectedFirework.id}.png`;
      link.href = url;
      link.click();
    }
  }, [selectedFirework]);

  const generateQRUrl = useCallback((firework: Firework) => {
    return `https://hanabi.nutfes.net/?id=${firework.id}`;
  }, []);

  const createFirework = useCallback(async () => {
    if (!selectedFile) {
      setError('Please select an image file');
      return;
    }

    setIsCreating(true);
    try {
      await fetchLatestId(fireworks);

      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('isShareable', isShareable.toString());

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

      if (result && result.id) {
        setOriginalImageFiles(prev => new Map(prev).set(result.id, selectedFile));
        try {
          await saveImageToLocalStorage(result.id, selectedFile);
        } catch (storageError) {
          console.warn('Failed to save image to localStorage:', storageError);
        }
        setNextId(result.id + 1);
      }

      await fetchFireworks();
      setSelectedFile(null);
      setIsShareable(true);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to create firework: ${errorMessage}`);
      console.error('Error creating firework:', err);
    } finally {
      setIsCreating(false);
    }
  }, [selectedFile, isShareable, API_URL, fireworks, fetchFireworks, fetchLatestId, saveImageToLocalStorage]);

  const deleteFirework = useCallback(async (fireworkId: number) => {
    if (!confirm(`花火 #${fireworkId} を削除します。よろしいですか？この操作は取り消せません。`)) {
      return;
    }

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

      await fetchFireworks();

      if (selectedFirework?.id === fireworkId) {
        setSelectedFirework(null);
      }

      setOriginalImageFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(fireworkId);
        return newMap;
      });

      removeImageFromLocalStorage(fireworkId);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to delete firework: ${errorMessage}`);
      console.error('Error deleting firework:', err);
    } finally {
      setDeletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(fireworkId);
        return newSet;
      });
    }
  }, [API_URL, fetchFireworks, selectedFirework, removeImageFromLocalStorage]);

  // 花火の公開/非公開（isShareable）を切り替える。mobile画面はQRコード経由で
  // GetFireworkById を叩くため、Privateにするとmobileからは404になり閲覧できなくなる
  // （一覧APIは影響を受けないため、この画面には切り替え後も表示され続ける）。
  const updateFireworkShareable = useCallback(async (fireworkId: number, newIsShareable: boolean) => {
    setUpdatingIds(prev => new Set(prev).add(fireworkId));

    try {
      const response = await fetch(`${API_URL}/fireworks/${fireworkId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isShareable: newIsShareable }),
      });

      if (!response.ok) {
        const errorMessage = `HTTP error ${response.status}`;
        console.error('Update failed:', errorMessage);
        setError(`Failed to update firework: ${errorMessage}`);
        return;
      }

      await fetchFireworks();

      if (selectedFirework?.id === fireworkId) {
        setSelectedFirework({ ...selectedFirework, isShareable: newIsShareable });
      }

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to update firework: ${errorMessage}`);
      console.error('Error updating firework:', err);
    } finally {
      setUpdatingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(fireworkId);
        return newSet;
      });
    }
  }, [API_URL, fetchFireworks, selectedFirework]);

  // ---- effects ----

  useEffect(() => {
    fetchFireworks();
  }, [fetchFireworks]);

  useEffect(() => {
    cleanupOldImages();
  }, [cleanupOldImages]);

  // ---- derived state ----

  const filteredFireworks = fireworks.filter((firework) => {
    if (!selectedDate) return true;
    if (!firework.createdAt) return false;
    const fireworkDate = new Date(firework.createdAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
    return fireworkDate === selectedDate;
  });

  return {
    // state
    fireworks,
    loading,
    error,
    selectedFirework,
    selectedFile,
    isShareable,
    isCreating,
    deletingIds,
    updatingIds,
    originalImageFiles,
    nextId,
    selectedDate,
    filteredFireworks,
    // setters
    setError,
    setSelectedDate,
    setIsShareable,
    setSelectedFile,
    // handlers
    selectFirework,
    clearSelection,
    createFirework,
    deleteFirework,
    updateFireworkShareable,
    fetchFireworks,
    handleQRDownload,
    generateQRUrl,
  };
}
