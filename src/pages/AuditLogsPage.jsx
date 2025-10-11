import React, { useState } from 'react';
import { Card, Table, Tag, Input, Space, Button } from 'antd';
import { SearchOutlined, HistoryOutlined } from '@ant-design/icons';
import { useCollection } from '../hooks/useCollection';
import { formatDate } from '../utils/helpers';

const AuditLogsPage = () => {
    const { data: auditLogs, loading } = useCollection('auditLogs');
    const [searchText, setSearchText] = useState('');

    // Get action tag color based on action type
    const getActionColor = (action) => {
        switch (action) {
            case 'Create':
                return 'green';
            case 'Edit':
            case 'Update':
                return 'blue';
            case 'Delete':
                return 'red';
            case 'Status Change':
                return 'orange';
            case 'Role Change':
            case 'Permission Change':
                return 'purple';
            case 'Password Reset':
                return 'cyan';
            default:
                return 'default';
        }
    };

    const columns = [
        {
            title: 'Timestamp',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: (text) => {
                const date = new Date(text);
                return `${formatDate(text)} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            },
            sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
            defaultSortOrder: 'descend',
            width: 180,
        },
        {
            title: 'User',
            dataIndex: 'userEmail',
            key: 'userEmail',
            filters: [...new Set(auditLogs.map(item => item.userEmail))].map(email => ({ text: email, value: email })),
            onFilter: (value, record) => record.userEmail === value,
            filterSearch: true,
            width: 200,
        },
        {
            title: 'Module',
            dataIndex: 'module',
            key: 'module',
            filters: [...new Set(auditLogs.map(item => item.module))].map(module => ({ text: module, value: module })),
            onFilter: (value, record) => record.module === value,
            filterSearch: true,
            width: 150,
        },
        {
            title: 'Action',
            dataIndex: 'action',
            key: 'action',
            render: (action) => <Tag color={getActionColor(action)}>{action}</Tag>,
            filters: [...new Set(auditLogs.map(item => item.action))].map(action => ({ text: action, value: action })),
            onFilter: (value, record) => record.action === value,
            filterSearch: true,
            width: 130,
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (text) => <div style={{ wordBreak: 'break-word' }}>{text}</div>,
            filteredValue: searchText ? [searchText] : null,
            onFilter: (value, record) => {
                return record.description?.toLowerCase().includes(value.toLowerCase()) ||
                    record.userEmail?.toLowerCase().includes(value.toLowerCase()) ||
                    record.module?.toLowerCase().includes(value.toLowerCase());
            },
        },
    ];

    return (
        <Card
            title={
                <Space>
                    <HistoryOutlined />
                    <span>Audit Logs</span>
                </Space>
            }
            extra={
                <Input
                    placeholder="Search logs..."
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ width: 250 }}
                    allowClear
                />
            }
        >
            <Table
                dataSource={auditLogs}
                columns={columns}
                loading={loading}
                rowKey="id"
                pagination={{
                    pageSize: 50,
                    showSizeChanger: true,
                    showTotal: (total) => `Total ${total} audit entries`,
                    pageSizeOptions: ['25', '50', '100', '200']
                }}
                scroll={{ x: 'max-content' }}
            />
        </Card>
    );
};

export default AuditLogsPage;
