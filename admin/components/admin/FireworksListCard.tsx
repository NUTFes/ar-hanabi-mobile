import DateFilter from '@/components/DateFilter';
import { cardStyle } from '@/styles/adminStyles';
import type { Firework } from '@/hooks/useFireworks';
import FireworkListItem from './FireworkListItem';
import AddFireworkForm from './AddFireworkForm';

interface FireworksListCardProps {
  loading: boolean;
  fireworks: Firework[];
  filteredFireworks: Firework[];
  selectedFirework: Firework | null;
  deletingIds: Set<number>;
  selectedDate: string;
  nextId: number;
  selectedFile: File | null;
  isShareable: boolean;
  isCreating: boolean;
  onDateChange: (date: string) => void;
  onSelect: (firework: Firework) => void;
  onDelete: (id: number) => void;
  onEditedFile: (file: File) => void;
  onShareableChange: (checked: boolean) => void;
  onCreate: () => void;
}

export default function FireworksListCard({
  loading,
  fireworks,
  filteredFireworks,
  selectedFirework,
  deletingIds,
  selectedDate,
  nextId,
  selectedFile,
  isShareable,
  isCreating,
  onDateChange,
  onSelect,
  onDelete,
  onEditedFile,
  onShareableChange,
  onCreate,
}: FireworksListCardProps) {
  return (
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
            marginBottom: '1rem',
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
            onDateChange={onDateChange}
            totalCount={fireworks.length}
            filteredCount={filteredFireworks.length}
          />
          <p style={{ marginBottom: '1rem', color: '#718096', fontSize: '0.875rem' }}>
            💡 花火をクリックすると、QRコードが表示されます
          </p>
          {filteredFireworks.map((firework) => (
            <FireworkListItem
              key={firework.id}
              firework={firework}
              imageUrl={firework.imageUrl}
              isSelected={selectedFirework?.id === firework.id}
              isDeleting={deletingIds.has(firework.id)}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      <AddFireworkForm
        nextId={nextId}
        selectedFile={selectedFile}
        isShareable={isShareable}
        isCreating={isCreating}
        onEditedFile={onEditedFile}
        onShareableChange={onShareableChange}
        onCreate={onCreate}
      />
    </div>
  );
}
