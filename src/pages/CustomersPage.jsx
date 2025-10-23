import React, { useState, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, message, Popconfirm } from 'antd';
import { EditOutlined, MinusCircleOutlined, PlusOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const CustomersPage = () => {
    const { data: customers, loading } = useCollection('customers');
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
            const customerData = {
                name: values.name,
                sites: values.sites ? values.sites.filter(site => site) : []
            };
            if (editingRecord) {
                const docRef = doc(db, "customers", editingRecord.id);
                await updateDoc(docRef, customerData);
                await logAudit(
                    AUDIT_MODULES.CUSTOMERS,
                    AUDIT_ACTIONS.EDIT,
                    `Updated customer: ${customerData.name} with ${customerData.sites.length} site(s)`,
                    { customerId: editingRecord.id, ...customerData }
                );
                message.success('Customer updated successfully!');
            } else {
                const docRef = await addDoc(collection(db, "customers"), customerData);
                await logAudit(
                    AUDIT_MODULES.CUSTOMERS,
                    AUDIT_ACTIONS.CREATE,
                    `Created new customer: ${customerData.name} with ${customerData.sites.length} site(s)`,
                    { customerId: docRef.id, ...customerData }
                );
                message.success('Customer added successfully!');
            }
            handleCancel();
        } catch (error) {
            console.error("Failed to save customer: ", error);
            message.error('Failed to save customer.');
        }
    };

    const handleDelete = async (id, name) => {
        try {
            await deleteDoc(doc(db, "customers", id));
            await logAudit(
                AUDIT_MODULES.CUSTOMERS,
                AUDIT_ACTIONS.DELETE,
                `Deleted customer: ${name}`,
                { customerId: id, customerName: name }
            );
            message.success(`Customer "${name}" deleted successfully!`);
        } catch (error) {
            message.error('Failed to delete customer.');
        }
    };

    const columns = useMemo(() => [
        {
            title: 'Customer Name',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            defaultSortOrder: 'ascend',
            filters: [...new Set(customers.map(item => item.name))].map(name => ({ text: name, value: name })),
            onFilter: (value, record) => record.name === value,
        },
        {
            title: 'Sites',
            dataIndex: 'sites',
            key: 'sites',
            render: sites => (sites ? sites.join(', ') : 'No sites added')
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    {canEdit(MODULES.CUSTOMERS) && (
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                            Edit
                        </Button>
                    )}
                    {canDelete(MODULES.CUSTOMERS) && (
                        <Popconfirm
                            title="Delete Customer"
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
    ], [customers, canEdit, canDelete]);

    return (
        <Card title="Customers">
            {canCreate(MODULES.CUSTOMERS) &&
                <Button type="primary" onClick={showModal} style={{ marginBottom: 16 }}>Add Customer</Button>
            }
            <Table dataSource={customers} columns={columns} loading={loading} rowKey="id" />
            <Modal title={editingRecord ? "Edit Customer" : "Add New Customer"} visible={isModalVisible} onOk={handleOk} onCancel={handleCancel}>
                <Form form={form} layout="vertical" initialValues={{ sites: [''] }}>
                    <Form.Item name="name" label="Customer Name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.List name="sites">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                        <Form.Item
                                            {...restField}
                                            name={[name]}
                                            label={name === 0 ? "Site Name" : ""}
                                            rules={[{ required: true, message: 'Missing site name' }]}
                                        >
                                            <Input placeholder="Customer Site Name" />
                                        </Form.Item>
                                        {fields.length > 1 ? (
                                            <MinusCircleOutlined onClick={() => remove(name)} />
                                        ) : null}
                                    </Space>
                                ))}
                                <Form.Item>
                                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                        Add another site
                                    </Button>
                                </Form.Item>
                            </>
                        )}
                    </Form.List>
                </Form>
            </Modal>
        </Card>
    );
};

export default CustomersPage;
