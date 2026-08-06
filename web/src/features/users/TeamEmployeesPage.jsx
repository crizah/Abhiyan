import React, { useState, useEffect } from 'react';
import { Input, Select, Button, Typography, Tag, Avatar, Flex, message, ConfigProvider, Card, Divider, Tooltip } from 'antd';
import { UserOutlined, SearchOutlined, DownloadOutlined, BarChartOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';
import { ROLE_COLORS, STATUS_COLORS, formatRole } from '../../utils/colorMaps';
import ScoreBreakdown from '../../components/ScoreBreakdown';
import InfoTooltip from '../../components/InfoTooltip';
import { SlidingCardModal } from '../../components/SlidingCardModal';
import ResponsiveTable from '../../components/ResponsiveTable';
import { useRefetchOnResume, markFetched } from '../../hooks/useRefetchOnResume';
import { useIsMobile } from '../../hooks/useIsMobile';

const { Title, Text } = Typography;

export default function TeamEmployeesPage() {
  const isMobile = useIsMobile();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filters
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const [searchText, setSearchText] = useState('');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Dynamic Team Options
  const [teamOptions, setTeamOptions] = useState([{ value: 'ALL', label: 'All My Teams' }]);

  // Manage-performance modal state
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingUserReport, setDownloadingUserReport] = useState(false);

  useEffect(() => {
    fetchTeamOptions();
  }, []);

  useRefetchOnResume('team-employees-team-options', () => fetchTeamOptions(), { minIntervalMs: 60000 });

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchText, teamFilter, roleFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefetchOnResume('team-employees-list', () => fetchEmployees(), { minIntervalMs: 60000 });

  const fetchTeamOptions = async () => {
    try {
      const response = await apiClient.get('/admin/teams/options');
      const dynamicOptions = response.data.map(name => ({ value: name, label: name }));
      setTeamOptions([{ value: 'ALL', label: 'All My Teams' }, ...dynamicOptions]);
    } catch (error) {
      console.error("Failed to load team options");
    } finally {
      markFetched('team-employees-team-options');
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/employees', {
        params: {
          page: currentPage,
          pageSize: pageSize,
          search: searchText,
          team: teamFilter,
          role: roleFilter,
          status: statusFilter
        }
      });
      setEmployees(response.data.employees);
      setTotalUsers(response.data.total_count);
    } catch (error) {
      message.error("Failed to load employees.");
    } finally {
      setLoading(false);
      markFetched('team-employees-list');
    }
  };

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  const handleManageAccess = (record) => {
    setSelectedUser(record);
    setIsManageOpen(true);
  };

  const handleDownloadAllReports = async () => {
    setDownloadingReport(true);
    try {
      const params = teamFilter !== 'ALL' ? { team: teamFilter } : {};
      const res = await apiClient.get('/admin/reports/score-download', {
        params,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'performance_report.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleDownloadUserReport = async () => {
    if (!selectedUser) return;
    setDownloadingUserReport(true);
    try {
      const res = await apiClient.get('/admin/reports/score-download', {
        params: { user_id: selectedUser.id },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `score_report_${selectedUser.id.slice(0, 8)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download report');
    } finally {
      setDownloadingUserReport(false);
    }
  };

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_, record) => (
        <Flex align="center" gap="12px">
          <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#bfbfbf' }} />
          <Flex vertical>
            <Text strong>{record.full_name}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>{record.email_id}</Text>
          </Flex>
        </Flex>
      ),
    },
    {
      title: 'Team Role',
      dataIndex: 'team_role',
      key: 'team_role',
      render: (role) => (
        <Tag color={ROLE_COLORS[role] || 'default'}>
          {formatRole(role)}
        </Tag>
      ),
    },
    {
      title: 'Team',
      dataIndex: 'team_name',
      key: 'team_name',
      render: (team) => <Text strong>{team}</Text>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={STATUS_COLORS[status] || 'default'}>
          {status}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Button size="small" icon={<BarChartOutlined />} onClick={() => handleManageAccess(record)}>
          Performance
        </Button>
      ),
    },
  ];

  return (
    <div style={{ 
      padding: isMobile ? '16px 12px' : '24px', 
      maxWidth: '1200px', 
      margin: '0 auto' 
    }}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: '16px' }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          Employees
        </Title>
        <Tooltip title="Apply filters and generate performance reports for all employees within the filter">
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadAllReports}
            loading={downloadingReport}
            style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
          >
            Performance Report
          </Button>
        </Tooltip>
      </Flex>

      <Flex wrap="wrap" gap={12} style={{ marginBottom: isMobile ? 12 : 24 }} align="center">
        <ConfigProvider theme={{ components: { Input: { activeBorderColor: '#B3455C', hoverBorderColor: '#B3455C' } } }}>
          <Input
            placeholder="Search by name or email..."
            prefix={<SearchOutlined />}
            style={{ flex: '2 1 220px', minWidth: 200 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </ConfigProvider>

        {!isMobile && (
          <>
            <Select
              value={teamFilter}
              style={{ flex: '1 1 160px', minWidth: 150 }}
              onChange={setTeamFilter}
              options={teamOptions}
            />

            <Select
              value={roleFilter}
              style={{ flex: '1 1 140px', minWidth: 130 }}
              onChange={setRoleFilter}
              options={[
                { value: 'ALL', label: 'All Roles' },
                { value: 'TEAM_ADMIN', label: 'Team Admin' },
                { value: 'MEMBER', label: 'Member' },
              ]}
            />

            <Select
              value={statusFilter}
              style={{ flex: '1 1 140px', minWidth: 130 }}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INVITED', label: 'Invited' },
                { value: 'SUSPENDED', label: 'Suspended' },
              ]}
            />
          </>
        )}
      </Flex>

      {isMobile && (
        <Flex wrap="wrap" gap={8} style={{ marginBottom: '24px' }} align="center">
          <Select
            size="small"
            value={teamFilter}
            style={{ flex: '1 1 90px', minWidth: 80 }}
            onChange={setTeamFilter}
            options={teamOptions}
          />

          <Select
            size="small"
            value={roleFilter}
            style={{ flex: '1 1 90px', minWidth: 80 }}
            onChange={setRoleFilter}
            options={[
              { value: 'ALL', label: 'All Roles' },
              { value: 'TEAM_ADMIN', label: 'Team Admin' },
              { value: 'MEMBER', label: 'Member' },
            ]}
          />

          <Select
            size="small"
            value={statusFilter}
            style={{ flex: '1 1 90px', minWidth: 80 }}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'All Statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INVITED', label: 'Invited' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ]}
          />
        </Flex>
      )}

      <div style={{ overflow: 'hidden' }}>
        <ResponsiveTable
          columns={columns}
          primaryColumnKeys={['user']}
          dataSource={employees}
          rowKey={(record) => `${record.id}-${record.team_name}`}
          loading={loading}
          onChange={handleTableChange}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: totalUsers,
            showSizeChanger: true,
            size: isMobile ? 'small' : 'default'
          }}
          scroll={{ x: 'max-content' }}
          size={isMobile ? 'small' : 'middle'}
          style={{ borderRadius: 0 }}
        />
      </div>

      {/* PERFORMANCE — same sliding centered card pattern as Manage User on the Users page */}
      <SlidingCardModal
        open={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        title={selectedUser ? `Performance: ${selectedUser.full_name}` : 'Performance'}
        resetKey={selectedUser?.id}
        defaultWidth={640}
        tabs={[
          {
            key: 'performance',
            label: 'Performance',
            content: (
              <div>
                <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                  <Title level={5} style={{ margin: 0 }}>Performance Overview</Title>
                  <InfoTooltip title="Performance overview of completed tasks" />
                </Flex>
                <Card size="small" style={{ backgroundColor: '#fafafa', border: 'none', borderRadius: 10, margin: '12px 0 20px' }}>
                  <Text style={{ fontSize: 12 }}>
                    Points are only granted once a task is approved. <Text strong style={{ fontSize: 12 }}>On-time completions</Text> earn a base of 10 points, plus up to 5 bonus points the earlier it's finished ahead of the due date (15 max). <Text strong style={{ fontSize: 12 }}>Late completions</Text> (approved after the due date) earn a flat 3 points. <Text strong style={{ fontSize: 12 }}>Missed deadlines</Text> and <Text strong style={{ fontSize: 12 }}>rejected submissions</Text> earn 0 points.
                  </Text>
                </Card>

                {selectedUser && (
                  <ScoreBreakdown userId={selectedUser.id} basePath="/admin/employees" showDownload={false} />
                )}

                <Divider />

                <Card size="small" style={{ border: '1px solid rgba(24, 24, 27, 0.08)', borderRadius: 10 }}>
                  <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                    <DownloadOutlined style={{ color: '#B3455C' }} />
                    <Text strong style={{ fontSize: 14 }}>Download Report</Text>
                    <InfoTooltip title="This generates the performance report for this user in CSV format." />
                  </Flex>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    Export this user's completed task history and points as a CSV file.
                  </Text>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={handleDownloadUserReport}
                    loading={downloadingUserReport}
                    style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
                  >
                    Download CSV
                  </Button>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}