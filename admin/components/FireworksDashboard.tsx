"use client";

import { useState, useEffect, useCallback, ChangeEvent } from 'react';
import FireworksErrorBanner from './FireworksErrorBanner';
import FireworksList from './FireworksList';
import FireworkDetail from './FireworkDetail';
import { Firework } from '../types/Firework';

export default function FireworksDashboard() {
  // State
  const [fireworks, setFireworks] = useState<Firework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFirework, setSelectedFirework] = useState<Firework | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isShareable, setIsShareable] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // API URL - should be configurable in a real application
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  // Fetch all fireworks
  const fetchFireworks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/fireworks`);
      if (!response.ok) {
        const errorMessage = `HTTP error ${response.status}`;
        console.error('Fetch failed:', errorMessage);
        setError(`Failed to fetch fireworks: ${errorMessage}`);
        setFireworks([]);
        return;
      }
      const data = await response.json();
      setFireworks(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to fetch fireworks: ${errorMessage}`);
      console.error('Error fetching fireworks:', err);
      setFireworks([]);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // Fetch a single firework by ID
  const fetchFirework = useCallback(async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/fireworks/${id}`);
      if (!response.ok) {
        const errorMessage = `HTTP error ${response.status}`;
        console.error('Fetch firework failed:', errorMessage);
        setError(`Failed to fetch firework: ${errorMessage}`);
        return;
      }
      const data = await response.json();
      setSelectedFirework(data);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to fetch firework: ${errorMessage}`);
      console.error('Error fetching firework:', err);
    }
  }, [API_URL]);

  // Create a new firework
  const createFirework = useCallback(async () => {
    if (!selectedFile) {
      setError('Please select an image file');
      return;
    }

    setIsCreating(true);
    try {
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

      // Success - refresh the list
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
  }, [selectedFile, isShareable, API_URL, fetchFireworks]);

  // Update a firework's shareable status
  const updateFirework = useCallback(async (id: number, newIsShareable: boolean) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`${API_URL}/fireworks/${id}`, {
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

      // Update local state
      await fetchFireworks();
      if (selectedFirework?.id === id) {
        setSelectedFirework({
          ...selectedFirework,
          isShareable: newIsShareable,
        });
      }
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to update firework: ${errorMessage}`);
      console.error('Error updating firework:', err);
    } finally {
      setIsUpdating(false);
    }
  }, [API_URL, fetchFireworks, selectedFirework]);

  // Delete a firework
  const deleteFirework = useCallback(async (id: number) => {

    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/fireworks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMessage = `HTTP error ${response.status}`;
        console.error('Delete failed:', errorMessage);
        setError(`Failed to delete firework: ${errorMessage}`);
        return;
      }

      // Update local state
      await fetchFireworks();
      if (selectedFirework?.id === id) {
        setSelectedFirework(null);
      }
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to delete firework: ${errorMessage}`);
      console.error('Error deleting firework:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [API_URL, fetchFireworks, selectedFirework]);

  // Handle file selection
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  }, []);

  // Load fireworks on component mount
  useEffect(() => {
    fetchFireworks();
  }, [fetchFireworks]);

  return (
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white">
        <header className="bg-indigo-600 dark:bg-indigo-800 text-white p-4 shadow-md">
          <div className="container mx-auto">
            <h1 className="text-2xl font-bold">Fireworks Admin Dashboard</h1>
          </div>
        </header>

        <main className="container mx-auto p-4">
          {error && (
              <FireworksErrorBanner
                  error={error}
                  onDismiss={() => setError(null)}
              />
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FireworksList
                fireworks={fireworks}
                loading={loading}
                selectedFireworkId={selectedFirework?.id ?? null}
                isUpdating={isUpdating}
                isDeleting={isDeleting}
                isCreating={isCreating}
                selectedFile={selectedFile}
                isShareable={isShareable}
                onSelectFirework={fetchFirework}
                onToggleShareable={(id, current) => updateFirework(id, !current)}
                onDelete={deleteFirework}
                onFileChange={handleFileChange}
                onShareableChange={setIsShareable}
                onCreate={createFirework}
            />
            <FireworkDetail
                selectedFirework={selectedFirework}
                isUpdating={isUpdating}
                isDeleting={isDeleting}
                onUpdate={updateFirework}
                onDelete={deleteFirework}
            />
          </div>
        </main>

        <footer className="bg-gray-100 dark:bg-gray-800 p-4 mt-8 text-center text-gray-600 dark:text-gray-400">
          <p>AR花火 管理者ページ &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
  );
}