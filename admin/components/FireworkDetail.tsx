import FireworkPreview from './FireworkPreview';
import { Firework } from '../types/Firework';

interface FireworkDetailProps {
  selectedFirework: Firework | null;
  isUpdating: boolean;
  isDeleting: boolean;
  onUpdate: (id: number, newIsShareable: boolean) => void;
  onDelete: (id: number) => void;
}

export default function FireworkDetail({
  selectedFirework,
  isUpdating,
  isDeleting,
  onUpdate,
  onDelete,
}: FireworkDetailProps) {
  return (
      <div className="md:col-span-2 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Firework Details</h2>

        {selectedFirework ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-medium mb-2">Preview</h3>
                  <div className="flex justify-center">
                    <FireworkPreview imageUrl={selectedFirework.imageUrl} size={300} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">Info</h3>
                <table className="w-full">
                  <tbody>
                  <tr>
                    <td className="py-2 font-semibold">ID:</td>
                    <td>{selectedFirework.id}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold">Shareable:</td>
                    <td>
                      <span className={`px-2 py-1 rounded-full ${
                          selectedFirework.isShareable
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                        {selectedFirework.isShareable ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold">Created:</td>
                    <td>
                      {selectedFirework.createdAt
                          ? new Date(selectedFirework.createdAt).toLocaleString()
                          : 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold">Updated:</td>
                    <td>
                      {selectedFirework.updatedAt
                          ? new Date(selectedFirework.updatedAt).toLocaleString()
                          : 'N/A'}
                    </td>
                  </tr>
                  </tbody>
                </table>

                <div className="mt-6 space-y-3">
                  <button
                      onClick={() => onUpdate(selectedFirework.id, !selectedFirework.isShareable)}
                      disabled={isUpdating}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:opacity-50"
                  >
                    {isUpdating
                        ? '更新中...'
                        : `${selectedFirework.isShareable ? '非公開' : '公開'}にする`}
                  </button>

                  <button
                      onClick={() => {
                        if (window.confirm('本当に削除しちゃうの、、、？')) {
                          onDelete(selectedFirework.id);
                        }
                      }}
                      disabled={isDeleting}
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded disabled:opacity-50"
                  >
                    {isDeleting ? '悲しいけど消してるよ...' : '削除'}
                  </button>
                </div>
              </div>
            </div>
        ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>リストから花火を選んで詳細を表示</p>
            </div>
        )}
      </div>
  );
}
