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
