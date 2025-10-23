import React, { useState, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Space, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { UOM_OPTIONS } from '../constants';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const ProductsPage = () => {
    const { data, loading } = useCollection('products');
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
                const docRef = doc(db, "products", editingRecord.id);
                await updateDoc(docRef, values);
                await logAudit(
                    AUDIT_MODULES.PRODUCTS,
                    AUDIT_ACTIONS.EDIT,
                    `Updated product: ${values.name} (${values.uom})`,
                    { productId: editingRecord.id, ...values }
                );
                message.success(`Product updated successfully!`);
            } else {
                const docRef = await addDoc(collection(db, "products"), values);
                await logAudit(
                    AUDIT_MODULES.PRODUCTS,
                    AUDIT_ACTIONS.CREATE,
                    `Created new product: ${values.name} (${values.uom})`,
                    { productId: docRef.id, ...values }
                );
                message.success(`Product added successfully!`);
            }
            handleCancel();
        } catch (error) {
            message.error(`Failed to save product.`);
        }
    };

    const handleDelete = async (id, name) => {
        try {
            await deleteDoc(doc(db, "products", id));
            await logAudit(
                AUDIT_MODULES.PRODUCTS,
                AUDIT_ACTIONS.DELETE,
                `Deleted product: ${name}`,
                { productId: id, productName: name }
            );
            message.success(`Product "${name}" deleted successfully!`);
        } catch (error) {
            message.error('Failed to delete product.');
        }
    };

    const columns = useMemo(() => [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            defaultSortOrder: 'ascend',
            filters: [...new Set(data.map(item => item.name))].map(name => ({ text: name, value: name })),
            onFilter: (value, record) => record.name === value,
        },
        {
            title: 'UOM',
            dataIndex: 'uom',
            key: 'uom',
            sorter: (a, b) => a.uom.localeCompare(b.uom),
            filters: UOM_OPTIONS.map(uom => ({ text: uom, value: uom })),
            onFilter: (value, record) => record.uom === value,
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    {canEdit(MODULES.PRODUCTS) && (
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                            Edit
                        </Button>
                    )}
                    {canDelete(MODULES.PRODUCTS) && (
                        <Popconfirm
                            title="Delete Product"
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
        <Card title="Products">
            {canCreate(MODULES.PRODUCTS) && (
                <Button type="primary" onClick={showModal} style={{ marginBottom: 16 }}>
                    Add Product
                </Button>
            )}
            <Table dataSource={data} columns={columns} loading={loading} rowKey="id" />
            <Modal
                title={editingRecord ? `Edit Product` : `Add New Product`}
                visible={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="Product Name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="uom" label="UOM (Unit of Measurement)" rules={[{ required: true }]}>
                        <Select placeholder="Select a UOM" showSearch optionFilterProp="children">
                            {[...UOM_OPTIONS].sort().map(uom => <Select.Option key={uom} value={uom}>{uom}</Select.Option>)}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default ProductsPage;
