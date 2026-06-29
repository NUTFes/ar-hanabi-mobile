import { ChangeEvent } from 'react';
import { Firework } from '../types/Firework';

interface FireworksListProps {
  fireworks: Firework[];
  loading: boolean;
  selectedFireworkId: number | null;
  isUpdating: boolean;
  isDeleting: boolean;
  isCreating: boolean;
  selectedFile: File | null;
  isShareable: boolean;
  onSelectFirework: (id: number) => void;
  onToggleShareable: (id: number, current: boolean) => void;
  onDelete: (id: number) => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onShareableChange: (checked: boolean) => void;
  onCreate: () => void;
}

export default function FireworksList({
  fireworks,
  loading,
  selectedFireworkId,
  isUpdating,
  isDeleting,
  isCreating,
  selectedFile,
  isShareable,
  onSelectFirework,
  onToggleShareable,
  onDelete,
  onFileChange,
  onShareableChange,
  onCreate,
}: FireworksListProps) {
  return (
      <div className="md:col-span-1 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">花火の一覧</h2>

        {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
            </div>
        ) : fireworks.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">花火が見つからないよ、、、</p>
        ) : (
            <div className="overflow-y-auto max-h-[500px]">
              <table className="min-w-full">
                <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="py-2 text-left">ID</th>
                  <th className="py-2 text-left">Shareable</th>
                  <th className="py-2 text-left">Created</th>
                  <th className="py-2 text-left">Actions</th>
                </tr>
                </thead>
                <tbody>
                {fireworks.map((firework) => (
                    <tr
                        key={firework.id}
                        className={`border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                            selectedFireworkId === firework.id ? 'bg-blue-50 dark:bg-blue-900' : ''
                        }`}
                        onClick={() => onSelectFirework(firework.id)}
                    >
                      <td className="py-2">{firework.id}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                            firework.isShareable
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {firework.isShareable ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-2">
                        {firework.createdAt
                            ? new Date(firework.createdAt).toLocaleDateString()
                            : 'N/A'}
                      </td>
                      <td className="py-2 flex space-x-2">
                        <button
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleShareable(firework.id, firework.isShareable);
                            }}
                            disabled={isUpdating}
                        >
                          {isUpdating ? '...' : 'Toggle'}
                        </button>
                        <button
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(firework.id);
                            }}
                            disabled={isDeleting}
                        >
                          {isDeleting ? '...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                ))}
                </tbody>
              </table>
            </div>
        )}

        {/* Create New Firework */}
        <div className="mt-6 border-t dark:border-gray-700 pt-4">
          <h3 className="font-medium mb-2">Add New Firework</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                画像ファイルをアップしてね
              </label>
              <input
                  type="file"
                  accept="image/*"
                  onChange={onFileChange}
                  className="w-full border dark:border-gray-600 rounded p-2 dark:bg-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              正方形の画像を選択してね（100x100に処理されるからね）
              </p>
            </div>

            <div className="flex items-center">
              <input
                  type="checkbox"
                  id="is-shareable"
                  checked={isShareable}
                  onChange={(e) => onShareableChange(e.target.checked)}
                  className="mr-2"
              />
              <label htmlFor="is-shareable">公開する</label>
            </div>

            <button
                onClick={onCreate}
                disabled={!selectedFile || isCreating}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              {isCreating ? '作成中...' : '花火を作成'}
            </button>
          </div>
        </div>
      </div>
  );
}
