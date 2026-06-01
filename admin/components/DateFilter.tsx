'use client';

import React from 'react';

interface DateFilterProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  totalCount: number;
  filteredCount: number;
}

export default function DateFilter({
  selectedDate,
  onDateChange,
  totalCount,
  filteredCount,
}: DateFilterProps) {
  return (
    <div
      style={{
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: '#f7fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
      }}
    >
      <h3
        style={{
          marginTop: 0,
          marginBottom: '1rem',
          fontSize: '1rem',
          fontWeight: 'bold',
        }}
      >
        📅 Filter Fireworks
      </h3>

      <input
        type="date"
        value={selectedDate}
        onChange={(e) => onDateChange(e.target.value)}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: '2px solid #e2e8f0',
          borderRadius: '8px',
          marginBottom: '1rem',
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <span
          style={{
            fontSize: '0.875rem',
            color: '#718096',
          }}
        >
          Showing {filteredCount} / {totalCount} fireworks
        </span>

        {selectedDate && (
          <button
            onClick={() => onDateChange('')}
            style={{
              backgroundColor: '#38b2ac',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}