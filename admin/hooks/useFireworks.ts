import { useState, useEffect, useCallback } from 'react';

export interface Firework {
  id: number;
  isShareable: boolean;
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
  const [isShareable, setIsShareable] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [originalImageFiles, setOriginalImageFiles] = useState<Map<number, File>>(new Map());
  const [nextId, setNextId] = useState<number>(1);
  const [selectedDate, setSelectedDate] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  // ---- localStorage helpers ----

  const getImageStorageKey = useCallback((fireworkId: number) => {
    return `firework_image_${fireworkId}`;
  }, []);

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

  const loadImageFromLocalStorage = useCallback(async (fireworkId: number): Promise<File | null> => {
    try {
      const stored = localStorage.getItem(getImageStorageKey(fireworkId));
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

      console.log(`Loaded image from localStorage for firework #${fireworkId}: ${file.name}`);
      return file;
    } catch (error) {
      console.error(`Error loading image from localStorage for firework #${fireworkId}:`, error);
      return null;
    }
  }, [getImageStorageKey]);

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
          if (file) imageMap.set(firework.id, file);
        } catch (error) {
          console.error(`Failed to load image for firework #${firework.id}:`, error);
        }
      })
    );

    setOriginalImageFiles(imageMap);
    console.log(`Restored ${imageMap.size} images from localStorage`);
  }, [loadImageFromLocalStorage]);

  const removeImageFromLocalStorage = useCallback((fireworkId: number) => {
    try {
      localStorage.removeItem(getImageStorageKey(fireworkId));
      console.log(`Removed image from localStorage for firework #${fireworkId}`);
    } catch (error) {
      console.error(`Failed to remove image from localStorage for firework #${fireworkId}:`, error);
    }
  }, [getImageStorageKey]);

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

  // ---- API handlers ----

  const fetchLatestId = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/fireworks/latest-id`);
      if (response.ok) {
        const data = await response.json();
        const latestId = data.latestId || 0;
        setNextId(latestId + 1);
        console.log('Latest ID from database:', latestId, 'Next ID will be:', latestId + 1);
      } else {
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
        setOriginalImageFiles(new Map());
        return;
      }

      const data = await response.json();
      console.log('Fetched data:', data);

      const fireworksData = Array.isArray(data) ? data : [];
      setFireworks(fireworksData);

      await loadAllImagesFromLocalStorage(fireworksData);

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
      setFireworks([]);
      setNextId(1);
    } finally {
      setLoading(false);
    }
  }, [API_URL, loadAllImagesFromLocalStorage]);

  const selectFirework = useCallback((firework: Firework) => {
    setSelectedFirework(firework);
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
      await fetchLatestId();

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
      console.log('Created firework with ID:', result.id);

      if (result && result.id) {
        setOriginalImageFiles(prev => new Map(prev).set(result.id, selectedFile));
        try {
          await saveImageToLocalStorage(result.id, selectedFile);
          console.log(`Saved original image to localStorage for firework #${result.id}`);
        } catch (storageError) {
          console.warn('Failed to save image to localStorage:', storageError);
        }
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

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  }, []);

  const deleteFirework = useCallback(async (fireworkId: number) => {
    if (!confirm(`Are you sure you want to delete firework #${fireworkId}? This action cannot be undone.`)) {
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

      console.log(`Successfully deleted firework #${fireworkId}`);

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

      console.log(`Firework #${fireworkId} deleted. Next new firework will still use ID: ${nextId}`);
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
  }, [API_URL, fetchFireworks, selectedFirework, nextId, removeImageFromLocalStorage]);

  // ---- effects ----

  useEffect(() => {
    console.log('Component mounted, fetching fireworks...');
    fetchFireworks();
  }, [fetchFireworks]);

  useEffect(() => {
    cleanupOldImages();
  }, [cleanupOldImages]);

  useEffect(() => {
    console.log(`🏁 [COMPONENT] Fireworks Admin loaded at ${new Date().toISOString()}`);
    console.log(`📊 [COMPONENT] Features: create, delete, QR generation, localStorage persistence`);
  }, []);

  useEffect(() => {
    console.log('Fireworks state changed:', fireworks);
    console.log('Next ID will be:', nextId);
  }, [fireworks, nextId]);

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
    originalImageFiles,
    nextId,
    selectedDate,
    filteredFireworks,
    // setters
    setError,
    setSelectedDate,
    setIsShareable,
    setSelectedFirework,
    // handlers
    selectFirework,
    handleFileChange,
    createFirework,
    deleteFirework,
    fetchFireworks,
    handleQRDownload,
    generateQRUrl,
  };
}
