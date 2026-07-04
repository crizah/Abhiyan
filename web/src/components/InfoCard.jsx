import React from 'react';
import { Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

// Small pink-tinted callout used across manage-user/team panels to explain what a
// section does — visually distinct from the plain '#fafafa' data cards.
export default function InfoCard({ children, style }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        background: 'rgba(179, 69, 92, 0.06)',
        border: '1px solid rgba(179, 69, 92, 0.2)',
        borderRadius: 10,
        padding: '12px 14px',
        ...style,
      }}
    >
      <InfoCircleOutlined style={{ color: '#B3455C', marginTop: 2, flexShrink: 0 }} />
      <Text style={{ fontSize: 12, color: 'rgba(24, 24, 27, 0.75)', lineHeight: 1.6 }}>{children}</Text>
    </div>
  );
}
