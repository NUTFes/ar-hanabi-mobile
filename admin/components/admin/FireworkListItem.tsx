import { dangerButtonStyle, fireworkItemStyle, statusBadgeStyle } from '@/styles/adminStyles';
import type { Firework } from '@/hooks/useFireworks';

interface FireworkListItemProps {
  firework: Firework;
  isSelected: boolean;
  isDeleting: boolean;
  onSelect: (firework: Firework) => void;
  onDelete: (id: number) => void;
}

export default function FireworkListItem({
  firework,
  isSelected,
  isDeleting,
  onSelect,
  onDelete,
}: FireworkListItemProps) {
  return (
    <div
      style={fireworkItemStyle(isSelected)}
      onClick={() => onSelect(firework)}
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
            onDelete(firework.id);
          }}
          disabled={isDeleting}
          style={{
            ...dangerButtonStyle,
            padding: '0.5rem 1rem',
            fontSize: '0.75rem',
            opacity: isDeleting ? 0.6 : 1,
          }}
          title="Delete firework"
        >
          {isDeleting ? '⏳ Deleting...' : '🗑️ Delete'}
        </button>
      </div>
    </div>
  );
}
