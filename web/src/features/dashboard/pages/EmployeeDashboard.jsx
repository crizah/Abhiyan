import React from 'react';
import { Typography, Empty } from 'antd';

const { Title } = Typography;

export default function EmployeeDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Empty 
        description={
          <Title level={4} style={{ color: '#000', marginTop: '16px' }}>
            Employee Dashboard Under Construction
          </Title>
        } 
      />
    </div>
  );
}