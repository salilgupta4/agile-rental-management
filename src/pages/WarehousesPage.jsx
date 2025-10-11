import React, { useState, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Input, message, Space, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const WarehousesPage = () => {
    const { data, loading } = useCollection('warehouses');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();
    const { canCreate, canEdit, canDelete } = usePermissions();

    const showModal = () => {
        setEditingRecord(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record) => {
        setEditingRecord(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingRecord(null);
        form.resetFields();
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingRecord) {
                await updateDoc(doc(db, "warehouses", editingRecord.id), values);
                await logAudit(
                    AUDIT_MODULES.WAREHOUSES,
                    AUDIT_ACTIONS.EDIT,
                    `Updated warehouse: ${values.name}${values.location ? ` (${values.location})` : ''}`,
                    { warehouseId: editingRecord.id, ...values }
                );
                message.success('Warehouse updated successfully!');
            } else {
                const docRef = await addDoc(collection(db, "warehouses"), values);
                await logAudit(
                    AUDIT_MODULES.WAREHOUSES,
                    AUDIT_ACTIONS.CREATE,
                    `Created new warehouse: ${values.name}${values.location ? ` (${values.location})` : ''}`,
                    { warehouseId: docRef.id, ...values }
                );
                message.success('Warehouse added successfully!');
            }
            handleCancel();
        } catch (error) {
            message.error('Failed to save warehouse.');
        }
    };

    const handleDelete = async (id, name) => {
        try {
            await deleteDoc(doc(db, "warehouses", id));
            await logAudit(
                AUDIT_MODULES.WAREHOUSES,
                AUDIT_ACTIONS.DELETE,
                `Deleted warehouse: ${name}`,
                { warehouseId: id, warehouseName: name }
            );
            message.success(`Warehouse "${name}" deleted successfully!`);
        } catch (error) {
            message.error('Failed to delete warehouse.');
        }
    };

    const columns = useMemo(() => [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            filters: [...new Set(data.map(item => item.name))].map(name => ({ text: name, value: name })),
            onFilter: (value, record) => record.name === value,
        },
        {
            title: 'Location',
            dataIndex: 'location',
            key: 'location',
            sorter: (a, b) => a.location.localeCompare(b.location),
            filters: [...new Set(data.map(item => item.location))].map(loc => ({ text: loc, value: loc })),
            onFilter: (value, record) => record.location === value,
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    {canEdit(MODULES.WAREHOUSES) && (
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                            Edit
                        </Button>
                    )}
                    {canDelete(MODULES.WAREHOUSES) && (
                        <Popconfirm
                            title="Delete Warehouse"
                            description={`Are you sure you want to delete "${record.name}"?`}
                            onConfirm={() => handleDelete(record.id, record.name)}
                            okText="Yes"
                            cancelText="No"
                            icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                        >
                            <Button icon={<DeleteOutlined />} danger>
                                Delete
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            ),
        }
    ], [data, canEdit, canDelete]);

    return (
        <Card title="Warehouses">
            {canCreate(MODULES.WAREHOUSES) && (
                <Button type="primary" onClick={showModal} style={{ marginBottom: 16 }}>
                    Add Warehouse
                </Button>
            )}
            <Table dataSource={data} columns={columns} loading={loading} rowKey="id" />
            <Modal
                title={editingRecord ? `Edit Warehouse` : `Add New Warehouse`}
                visible={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="Warehouse Name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="location" label="Location">
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default WarehousesPage;
