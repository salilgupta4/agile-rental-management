import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, DatePicker, InputNumber, Space, Row, Col, Divider, message } from 'antd';
import { DeleteOutlined, EditOutlined, ExclamationCircleOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import dayjs from 'dayjs';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { useInventory } from '../hooks/useInventory';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { formatDate } from '../utils/helpers';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const ReturnsPage = () => {
    const { data: products } = useCollection('products');
    const { data: customers } = useCollection('customers');
    const { data: warehouses } = useCollection('warehouses');
    const { data: returns, loading } = useCollection('returns');
    const { customerStock } = useInventory();
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
        setIsModalVisible(true);
    };

    useEffect(() => {
        if (editingRecord && isModalVisible) {
            form.setFieldsValue({
                ...editingRecord,
                returnDate: editingRecord.returnDate ? dayjs(editingRecord.returnDate) : null,
                rentalEndDate: editingRecord.rentalEndDate ? dayjs(editingRecord.rentalEndDate) : null,
            });
        }
    }, [editingRecord, isModalVisible, form]);

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingRecord(null);
        form.resetFields();
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const returnData = {
                ...values,
                returnDate: values.returnDate.toISOString(),
                rentalEndDate: values.rentalEndDate.toISOString(),
                items: values.items || []
            };

            if (editingRecord) {
                const docRef = doc(db, "returns", editingRecord.id);
                await updateDoc(docRef, returnData);
                const totalQuantity = (values.items || []).reduce((sum, item) => sum + Number(item.quantity), 0);
                await logAudit(
                    AUDIT_MODULES.RETURNS,
                    AUDIT_ACTIONS.EDIT,
                    `Updated return: ${values.customer} to ${values.returnTo} - ${values.items.length} item(s), Total Qty: ${totalQuantity}`,
                    { returnId: editingRecord.id, customer: values.customer, returnTo: values.returnTo }
                );
                message.success('Return updated successfully!');
            } else {
                const docRef = await addDoc(collection(db, "returns"), returnData);
                const totalQuantity = (values.items || []).reduce((sum, item) => sum + Number(item.quantity), 0);
                await logAudit(
                    AUDIT_MODULES.RETURNS,
                    AUDIT_ACTIONS.CREATE,
                    `Recorded new return: ${values.customer} to ${values.returnTo} - ${values.items.length} item(s), Total Qty: ${totalQuantity}`,
                    { returnId: docRef.id, customer: values.customer, returnTo: values.returnTo }
                );
                message.success('Return recorded successfully!');
            }
            handleCancel();
        } catch (error) {
            message.error('Failed to save return.');
        }
    };

    const handleDelete = (id) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this return record?',
            icon: <ExclamationCircleOutlined />,
            content: 'This action cannot be undone and will affect inventory calculations.',
            onOk: async () => {
                try {
                    const returnRecord = returns.find(r => r.id === id);
                    await deleteDoc(doc(db, "returns", id));
                    await logAudit(
                        AUDIT_MODULES.RETURNS,
                        AUDIT_ACTIONS.DELETE,
                        `Deleted return: ${returnRecord?.customer || id} to ${returnRecord?.returnTo || 'warehouse'}`,
                        { returnId: id, customer: returnRecord?.customer, returnTo: returnRecord?.returnTo }
                    );
                    message.success("Return record deleted successfully");
                } catch (error) {
                    message.error("Failed to delete return record");
                }
            },
        });
    };

    const expandedRowRender = (record) => {
        const itemColumns = [
            { title: 'Product', dataIndex: 'product', key: 'product' },
            { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' }
        ];

        // Handle both old single-item and new multi-item structure
        let items = record.items || [];
        if (!items.length && record.product) {
            // Old structure - convert to array
            items = [{ product: record.product, quantity: record.quantity }];
        }

        return <Table columns={itemColumns} dataSource={items} pagination={false} rowKey="product" />;
    };

    const columns = [
        {
            title: 'Customer',
            dataIndex: 'customer',
            key: 'customer',
            filters: [...new Set(returns.map(item => item.customer))].map(c => ({ text: c, value: c })),
            onFilter: (value, record) => record.customer === value,
            filterSearch: true,
        },
        {
            title: 'Items Count',
            key: 'itemsCount',
            render: (_, record) => {
                // Handle both old and new structure
                if (record.items && record.items.length > 0) {
                    return record.items.length;
                } else if (record.product) {
                    return 1; // Old single-item structure
                }
                return 0;
            },
            sorter: (a, b) => {
                const countA = (a.items && a.items.length > 0) ? a.items.length : (a.product ? 1 : 0);
                const countB = (b.items && b.items.length > 0) ? b.items.length : (b.product ? 1 : 0);
                return countA - countB;
            }
        },
        {
            title: 'Total Quantity',
            key: 'totalQuantity',
            render: (_, record) => {
                // Handle both old and new structure
                if (record.items && record.items.length > 0) {
                    return record.items.reduce((sum, item) => sum + Number(item.quantity), 0);
                } else if (record.product) {
                    return Number(record.quantity) || 0; // Old single-item structure
                }
                return 0;
            },
            sorter: (a, b) => {
                const sumA = (a.items && a.items.length > 0)
                    ? a.items.reduce((sum, item) => sum + Number(item.quantity), 0)
                    : Number(a.quantity) || 0;
                const sumB = (b.items && b.items.length > 0)
                    ? b.items.reduce((sum, item) => sum + Number(item.quantity), 0)
                    : Number(b.quantity) || 0;
                return sumA - sumB;
            }
        },
        {
            title: 'Return To (Warehouse)',
            dataIndex: 'returnTo',
            key: 'returnTo',
            filters: [...new Set(returns.map(item => item.returnTo))].map(w => ({ text: w, value: w })),
            onFilter: (value, record) => record.returnTo === value,
            filterSearch: true,
        },
        {
            title: 'Rental End Date',
            dataIndex: 'rentalEndDate',
            key: 'rentalEndDate',
            render: (text) => formatDate(text),
            sorter: (a, b) => {
                if (!a.rentalEndDate) return 1;
                if (!b.rentalEndDate) return -1;
                return new Date(a.rentalEndDate) - new Date(b.rentalEndDate);
            },
        },
        {
            title: 'Return Date',
            dataIndex: 'returnDate',
            key: 'returnDate',
            render: (text) => formatDate(text),
            sorter: (a, b) => new Date(a.returnDate) - new Date(b.returnDate),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    {canEdit(MODULES.RETURNS) && (
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                            Edit
                        </Button>
                    )}
                    {canDelete(MODULES.RETURNS) && (
                        <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
                            Delete
                        </Button>
                    )}
                </Space>
            ),
        }
    ];

    return (
        <Card title="Material Returns">
            {canCreate(MODULES.RETURNS) &&
                <Button type="primary" onClick={showModal} style={{ marginBottom: 16 }}>New Return</Button>
            }
            <Table
                dataSource={returns}
                columns={columns}
                loading={loading}
                rowKey="id"
                expandable={{ expandedRowRender }}
            />
            <Modal
                title={editingRecord ? "Edit Material Return" : "Record Material Return"}
                visible={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                width={800}
            >
                <Form form={form} layout="vertical" initialValues={{ items: [{}] }}>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="customer" label="Returning Customer" rules={[{ required: true }]}>
                                <Select placeholder="Select a customer">
                                    {customers.map(c => <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="returnTo" label="Return To (Warehouse)" rules={[{ required: true }]}>
                                <Select placeholder="Select a warehouse">
                                    {warehouses.map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="rentalEndDate" label="Rental End Date" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="returnDate" label="Return Date" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider>Products</Divider>

                    <Form.List name="items">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="end">
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'product']}
                                            label="Product"
                                            rules={[{ required: true, message: 'Missing product' }]}
                                            style={{width: '350px'}}
                                        >
                                            <Select placeholder="Select Product">
                                                {products.map(p => <Select.Option key={p.id} value={p.name}>{p.name}</Select.Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'quantity']}
                                            label="Quantity"
                                            dependencies={['customer']}
                                            rules={[
                                                { required: true, type: 'number', min: 1, message: 'Invalid quantity' },
                                                ({ getFieldValue }) => ({
                                                    validator(_, value) {
                                                        const customer = getFieldValue('customer');
                                                        const items = getFieldValue('items');
                                                        const product = items?.[name]?.product;

                                                        if (!value || !customer || !product) {
                                                            return Promise.resolve();
                                                        }

                                                        let onSiteQty = 0;
                                                        if(customerStock[customer]) {
                                                            for(const site in customerStock[customer]) {
                                                                onSiteQty += customerStock[customer][site][product] || 0;
                                                            }
                                                        }

                                                        if (value > onSiteQty) {
                                                            return Promise.reject(new Error(`Invalid quantity. Customer has ${onSiteQty} units.`));
                                                        }
                                                        return Promise.resolve();
                                                    },
                                                }),
                                            ]}
                                        >
                                            <InputNumber placeholder="Qty" style={{ width: '150px' }} />
                                        </Form.Item>
                                        <MinusCircleOutlined onClick={() => remove(name)} />
                                    </Space>
                                ))}
                                <Form.Item>
                                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                        Add Product
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

export default ReturnsPage;
