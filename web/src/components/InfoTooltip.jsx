import React from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

export default function InfoTooltip({ title, color = '#B3455C', size = 14, style }) {
  return (
    <Tooltip title={title}>
      <InfoCircleOutlined style={{ fontSize: size, color, cursor: 'default', ...style }} />
    </Tooltip>
  );
}
