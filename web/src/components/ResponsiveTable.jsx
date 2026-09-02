import React from 'react';
import { Table, Card, Flex, Typography } from 'antd';
import { useIsMobile } from '../hooks/useIsMobile';

const { Text } = Typography;

// On mobile, collapses the table to just `primaryColumnKeys` and moves the
// rest into an expandable card beneath each row (label left / value right,
// reusing each column's own `render` so styling matches the desktop table).
// Desktop is untouched — same columns, no expand column, same props.
export default function ResponsiveTable({ columns, primaryColumnKeys, className, ...tableProps }) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return <Table columns={columns} className={className} {...tableProps} />;
  }

  const mobileColumns = columns.filter((col) => primaryColumnKeys.includes(col.key));
  const secondaryColumns = columns.filter((col) => !primaryColumnKeys.includes(col.key));

  const expandedRowRender = (record) => (
    <Card size="small" className="rt-expand-card" style={{ backgroundColor: '#F7F5F2', border: 'none', borderRadius: 10 }}>
      <Flex vertical gap={12}>
        {secondaryColumns.map((col) => (
          <Flex key={col.key} justify="space-between" align="center" gap={12}>
            <Text strong style={{ color: '#18181B' }}>{col.title}</Text>
            <div>{col.render ? col.render(col.dataIndex ? record[col.dataIndex] : undefined, record) : record[col.dataIndex]}</div>
          </Flex>
        ))}
      </Flex>
    </Card>
  );

  return (
    <>
      <style>{`
        .responsive-table-mobile-expand .ant-table-row-expand-icon {
          border-color: #B3455C;
          color: #B3455C;
        }
        .responsive-table-mobile-expand .ant-table-row-expand-icon:hover,
        .responsive-table-mobile-expand .ant-table-row-expand-icon:focus {
          background: #B3455C;
          border-color: #B3455C;
          color: #FFFFFF;
        }
        .rt-expand-card .ant-typography-secondary {
          color: #18181B !important;
        }
      `}</style>
      <Table
        columns={mobileColumns}
        className={['responsive-table-mobile-expand', className].filter(Boolean).join(' ')}
        expandable={{ expandedRowRender, expandIconColumnIndex: 0 }}
        {...tableProps}
      />
    </>
  );
}
