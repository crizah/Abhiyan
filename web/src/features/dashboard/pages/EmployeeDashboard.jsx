import React from 'react';
import { Typography, Empty, theme } from 'antd';

const { Title } = Typography;

export default function EmployeeDashboard() {
  const { token } = theme.useToken(); // Injecting tokens for the text color

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '60vh' 
    }}>
      <Empty 
        description={
          <Title level={4} style={{ color: token.colorTextHeading, marginTop: '16px' }}>
            Employee Dashboard Under Construction
          </Title>
        } 
      />
    </div>
  );
}