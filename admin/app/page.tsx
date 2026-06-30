'use client';

import { useFireworks } from '@/hooks/useFireworks';
import { containerStyle, mainStyle, gridStyle } from '@/styles/adminStyles';
import DashboardHeader from '@/components/admin/DashboardHeader';
import ErrorBanner from '@/components/admin/ErrorBanner';
import FireworksListCard from '@/components/admin/FireworksListCard';
import QRCodePanel from '@/components/admin/QRCodePanel';
import RefreshButton from '@/components/admin/RefreshButton';
import IdManagementInfo from '@/components/admin/IdManagementInfo';

export default function Home() {
  const f = useFireworks();

  return (
    <div style={containerStyle}>
      <DashboardHeader />

      <main style={mainStyle}>
        {f.error && (
          <ErrorBanner
            error={f.error}
            onDismiss={() => f.setError(null)}
          />
        )}

        <div style={gridStyle}>
          <FireworksListCard
            loading={f.loading}
            fireworks={f.fireworks}
            filteredFireworks={f.filteredFireworks}
            selectedFirework={f.selectedFirework}
            deletingIds={f.deletingIds}
            selectedDate={f.selectedDate}
            nextId={f.nextId}
            selectedFile={f.selectedFile}
            isShareable={f.isShareable}
            isCreating={f.isCreating}
            onDateChange={f.setSelectedDate}
            onSelect={f.selectFirework}
            onDelete={f.deleteFirework}
            onFileChange={f.handleFileChange}
            onShareableChange={f.setIsShareable}
            onCreate={f.createFirework}
          />

          {f.selectedFirework && (
            <QRCodePanel
              firework={f.selectedFirework}
              qrUrl={f.generateQRUrl(f.selectedFirework)}
              originalImageFile={f.originalImageFiles.get(f.selectedFirework.id)}
              onDownload={f.handleQRDownload}
              onError={(error) => f.setError(error)}
              onClose={() => f.selectFirework(null)}
            />
      <div style={containerStyle}>
        <header style={headerStyle}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', margin: 0 }}>
            🎆 AR花火 管理者ページ
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9 }}>
            花火のQRコードを管理・生成できます
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
                <p style={{ fontWeight: '600' }}>⚠️ エラー！: {error}</p>
                <button
                    onClick={() => setError(null)}
                    style={{
                      ...dangerButtonStyle,
                      marginTop: '0.5rem',
                      padding: '0.5rem 1rem',
                      fontSize: '0.75rem',
                    }}
                >
                  このウィンドウを消す
                </button>
              </div>
          )}
        </div>

        <RefreshButton
          loading={f.loading}
          onRefresh={f.fetchFireworks}
        />

        <IdManagementInfo
          nextId={f.nextId}
          totalCount={f.fireworks.length}
        />
      </main>

      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }
          <div style={gridStyle}>
            {/* Fireworks List */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
                📋 花火の一覧
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
                    <p style={{ color: '#718096' }}>花火を読み込み中...</p>
                  </div>
              ) : !fireworks || fireworks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#718096' }}>
                    <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>🎭 花火が見つかりません！</p>
                    <p>「花火を追加」から最初の花火を作成してください</p>
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
                      💡 花火をクリックすると、QRコードが表示されます
                    </p>
                    {filteredFireworks.map((firework) => (
                        <div key={firework.id}
                             style={fireworkItemStyle(selectedFirework?.id === firework.id)}
                             onClick={() => selectFirework(firework)}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#2d3748' }}>
                              🎆 花火 #{firework.id}
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
                              {deletingIds.has(firework.id) ? '⏳ 削除しています...' : '🗑️ 削除'}
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
                  ✨ 花火を追加
                </h3>
                <div style={{
                  backgroundColor: '#f7fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem'
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
                    color: '#4a5568'
                  }}>
                    📁 画像ファイルをアップしてください:
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
                        ✅ 選択中: {selectedFile.name}
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
                      🌐 この花火を公開する
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
                    {isCreating ? '⏳ 作成中...' : `🚀 花火を作成 #${nextId}`}
                  </button>
                </div>
              </div>
            </div>

            {/* QR Code Display */}
            {selectedFirework && (
                <div style={cardStyle}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
                    📱 花火のQRコード #{selectedFirework.id}
                  </h2>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ marginBottom: '1.5rem', color: '#718096' }}>
                      📸 このQRコードを印刷
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
                      <strong style={{ color: '#2d3748' }}>🔗 花火打ち上げ会場URL:</strong>
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
                        📊 花火の詳細:
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
                          <strong style={{ color: '#2d3748' }}>🌐 公開設定:</strong>
                          <span style={statusBadgeStyle(selectedFirework.isShareable)}>
                            {selectedFirework.isShareable ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#2d3748' }}>📅 作成日:</strong> {selectedFirework.createdAt ? new Date(selectedFirework.createdAt).toLocaleString() : 'N/A'}
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#2d3748' }}>🔄 更新済み:</strong> {selectedFirework.updatedAt ? new Date(selectedFirework.updatedAt).toLocaleString() : 'N/A'}
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#2d3748' }}>🎨 画素データ:</strong> {selectedFirework.pixelData?.length || 0} pixels
                        </div>
                        <div>
                          <strong style={{ color: '#2d3748' }}>🖼️ 画像の印刷:</strong> {originalImageFiles.has(selectedFirework.id) ? '✅ Available (saved in localStorage)' : '❌ Not available'}
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
                      ✖️ 閉じる
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
              {loading ? '⏳ 読み込み中...' : '🔄 花火情報の更新'}
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
              🔢 ID管理情報
            </h3>
            <div style={{ fontSize: '0.875rem', color: '#6c757d', lineHeight: '1.6' }}>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>現在の状況:</strong> 次に作成される花火ID: #{nextId}
              </p>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>IDについて:</strong> IDは再利用されません。花火が削除されると、そのIDは二度と使えません。
              </p>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>安全性:</strong> ↑により、削除された花火のデータへの誤ったアクセスを防ぎ、QRコードのURLが一意であることを保証します。
              </p>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>画像ストレージ:</strong> 花火の作成時に画像は自動的にlocalStorageへ保存され、セッションをまたいで保持されます。古い画像（30日以上経過したもの）は自動的に削除されます。
              </p>
              <p>
                <strong>花火の総数:</strong> {fireworks.length} （有効な花火{fireworks.length !== 1 ? 'ら' : ''}）
              </p>
            </div>
          </div>
        </main>

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
