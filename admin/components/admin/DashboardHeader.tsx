import { headerStyle } from '@/styles/adminStyles';

export default function DashboardHeader() {
  return (
    <header style={headerStyle}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', margin: 0 }}>
        🎆 Fireworks Admin Dashboard
      </h1>
      <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9 }}>
        Manage and generate QR codes for firework displays
      </p>
    </header>
  );
}
