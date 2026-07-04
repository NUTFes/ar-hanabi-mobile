import type React from 'react';

export const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f0f4f8',
  fontFamily: 'Arial, sans-serif',
};

export const headerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: 'white',
  padding: '1.5rem',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
};

export const mainStyle: React.CSSProperties = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '2rem',
};

export const cardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  padding: '2rem',
  borderRadius: '12px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
  marginBottom: '1.5rem',
  border: '1px solid #e2e8f0',
};

export const primaryButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: 'white',
  padding: '0.75rem 1.5rem',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  margin: '0.25rem',
  fontWeight: '600',
  fontSize: '0.875rem',
  transition: 'all 0.2s ease',
  boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)',
};

export const secondaryButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #38b2ac 0%, #319795 100%)',
  color: 'white',
  padding: '0.75rem 1.5rem',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  margin: '0.25rem',
  fontWeight: '600',
  fontSize: '0.875rem',
  transition: 'all 0.2s ease',
  boxShadow: '0 2px 4px rgba(56, 178, 172, 0.3)',
};

export const dangerButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
  color: 'white',
  padding: '0.75rem 1.5rem',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  margin: '0.25rem',
  fontWeight: '600',
  fontSize: '0.875rem',
  transition: 'all 0.2s ease',
  boxShadow: '0 2px 4px rgba(245, 101, 101, 0.3)',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  border: '2px solid #e2e8f0',
  borderRadius: '8px',
  marginBottom: '1rem',
  fontSize: '0.875rem',
  transition: 'border-color 0.2s ease',
  outline: 'none',
};

export const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
  gap: '1.5rem',
};

export const fireworkItemStyle = (isSelected: boolean): React.CSSProperties => ({
  border: isSelected ? '2px solid #667eea' : '2px solid #e2e8f0',
  padding: '1.25rem',
  marginBottom: '0.75rem',
  borderRadius: '8px',
  cursor: 'pointer',
  backgroundColor: isSelected ? '#f7fafc' : 'transparent',
  transition: 'all 0.2s ease',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const statusBadgeStyle = (isShareable: boolean): React.CSSProperties => ({
  backgroundColor: isShareable ? '#48bb78' : '#ed8936',
  color: 'white',
  padding: '0.25rem 0.75rem',
  borderRadius: '12px',
  fontSize: '0.75rem',
  fontWeight: '600',
});
