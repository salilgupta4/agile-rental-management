import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, DatePicker, Row, Col, Divider, Space, InputNumber, message, Popconfirm, Radio } from 'antd';
import { EditOutlined, MinusCircleOutlined, PlusOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import dayjs from 'dayjs';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { useGST } from '../hooks/useGST';
import { formatDate } from '../utils/helpers';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const PurchasesPage = () => {
    const { data: products } = useCollection('products');
    const { data: warehouses } = useCollection('warehouses');
    const { data: purchases, loading } = useCollection('purchases');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const { gstRates, calculateGST } = useGST();

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
                purchaseDate: editingRecord.purchaseDate ? dayjs(editingRecord.purchaseDate) : null,
                taxType: editingRecord.taxType || 'local',
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

            // Calculate total base amount
            const baseAmount = (values.items || []).reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
            const taxType = values.taxType || 'local';
            const gstData = calculateGST(baseAmount, taxType);

            const purchaseData = {
                ...values,
                purchaseDate: values.purchaseDate.toISOString(),
                items: values.items || [],
                taxType: taxType,
                gstBreakdown: {
                    baseAmount: gstData.baseAmount,
                    cgst: gstData.cgst,
                    sgst: gstData.sgst,
                    igst: gstData.igst,
                    totalGST: gstData.totalGST,
                    totalAmount: gstData.totalAmount
                }
            };

            if (editingRecord) {
                const docRef = doc(db, "purchases", editingRecord.id);
                await updateDoc(docRef, purchaseData);
                await logAudit(
                    AUDIT_MODULES.PURCHASES,
                    AUDIT_ACTIONS.EDIT,
                    `Updated purchase: Invoice ${values.invoiceNumber} at ${values.warehouse} - ${values.items.length} item(s), Total: ₹${gstData.totalAmount.toFixed(2)}`,
                    { purchaseId: editingRecord.id, invoiceNumber: values.invoiceNumber, warehouse: values.warehouse, totalAmount: gstData.totalAmount }
                );
                message.success('Purchase updated successfully!');
            } else {
                const docRef = await addDoc(collection(db, "purchases"), purchaseData);
                await logAudit(
                    AUDIT_MODULES.PURCHASES,
                    AUDIT_ACTIONS.CREATE,
                    `Recorded new purchase: Invoice ${values.invoiceNumber} at ${values.warehouse} - ${values.items.length} item(s), Total: ₹${gstData.totalAmount.toFixed(2)}`,
                    { purchaseId: docRef.id, invoiceNumber: values.invoiceNumber, warehouse: values.warehouse, totalAmount: gstData.totalAmount }
                );
                message.success('Purchase recorded successfully!');
            }
            handleCancel();
        } catch (error) {
            console.error("Failed to save purchase: ", error);
            message.error('Failed to save purchase.');
        }
    };

    const handleDelete = async (id, invoiceNumber) => {
        try {
            await deleteDoc(doc(db, "purchases", id));
            await logAudit(
                AUDIT_MODULES.PURCHASES,
                AUDIT_ACTIONS.DELETE,
                `Deleted purchase: Invoice ${invoiceNumber}`,
                { purchaseId: id, invoiceNumber }
            );
            message.success(`Purchase "${invoiceNumber}" deleted successfully!`);
        } catch (error) {
            message.error('Failed to delete purchase.');
        }
    };

    const expandedRowRender = (record) => {
        const itemColumns = [
            { title: 'Product', dataIndex: 'product', key: 'product' },
            { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
            { title: 'Unit Price (INR)', dataIndex: 'unitPrice', key: 'unitPrice' },
            { title: 'Total Price', key: 'total', render: (_, item) => (item.quantity * item.unitPrice).toFixed(2) }
        ];

        const gstBreakdown = record.gstBreakdown || {};
        const baseAmount = gstBreakdown.baseAmount || (record.items || []).reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
        const taxType = record.taxType || 'local';
        const gstData = record.gstBreakdown || calculateGST(baseAmount, taxType);

        return (
            <>
                <Table columns={itemColumns} dataSource={record.items} pagination={false} />
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ padding: '0 16px', maxWidth: '400px', marginLeft: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 500 }}>Base Amount:</span>
                        <span>₹{gstData.baseAmount.toFixed(2)}</span>
                    </div>
                    {taxType === 'local' ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span>CGST ({gstRates.cgst}%):</span>
                                <span>₹{gstData.cgst.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span>SGST ({gstRates.sgst}%):</span>
                                <span>₹{gstData.sgst.toFixed(2)}</span>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span>IGST ({gstRates.igst}%):</span>
                            <span>₹{gstData.igst.toFixed(2)}</span>
                        </div>
                    )}
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
                        <span>Total with GST:</span>
                        <span>₹{gstData.totalAmount.toFixed(2)}</span>
                    </div>
                </div>
            </>
        );
    };

    const columns = useMemo(() => [
        {
            title: 'Invoice No.',
            dataIndex: 'invoiceNumber',
            key: 'invoiceNumber',
            sorter: (a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber),
            filters: [...new Set(purchases.map(item => item.invoiceNumber))].map(inv => ({ text: inv, value: inv })),
            onFilter: (value, record) => record.invoiceNumber === value,
            filterSearch: true,
        },
        {
            title: 'Warehouse',
            dataIndex: 'warehouse',
            key: 'warehouse',
            filters: [...new Set(warehouses.map(item => item.name))].map(name => ({ text: name, value: name })),
            onFilter: (value, record) => record.warehouse === value,
            filterSearch: true,
        },
        {
            title: 'Date',
            dataIndex: 'purchaseDate',
            key: 'purchaseDate',
            render: (text) => formatDate(text),
            sorter: (a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Total Value with GST (INR)',
            key: 'totalValue',
            render: (_, record) => {
                const gstData = record.gstBreakdown;
                if (gstData && gstData.totalAmount) {
                    return gstData.totalAmount.toFixed(2);
                }
                const baseAmount = (record.items || []).reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
                const taxType = record.taxType || 'local';
                const calculated = calculateGST(baseAmount, taxType);
                return calculated.totalAmount.toFixed(2);
            },
            sorter: (a, b) => {
                const getTotalAmount = (record) => {
                    if (record.gstBreakdown && record.gstBreakdown.totalAmount) {
                        return record.gstBreakdown.totalAmount;
                    }
                    const baseAmount = (record.items || []).reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
                    const taxType = record.taxType || 'local';
                    return calculateGST(baseAmount, taxType).totalAmount;
                };
                return getTotalAmount(a) - getTotalAmount(b);
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    {canEdit(MODULES.PURCHASES) && (
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                            Edit
                        </Button>
                    )}
                    {canDelete(MODULES.PURCHASES) && (
                        <Popconfirm
                            title="Delete Purchase"
                            description={`Are you sure you want to delete "${record.invoiceNumber}"?`}
                            onConfirm={() => handleDelete(record.id, record.invoiceNumber)}
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
    ], [purchases, warehouses, canEdit, canDelete, calculateGST, gstRates]);

    return (
        <Card title="Purchases">
            {canCreate(MODULES.PURCHASES) &&
                <Button type="primary" onClick={showModal} style={{ marginBottom: 16 }}>Record Purchase</Button>
            }
            <Table
                dataSource={purchases}
                columns={columns}
                loading={loading}
                rowKey="id"
                expandable={{ expandedRowRender }}
            />
            <Modal title={editingRecord ? "Edit Purchase" : "Record New Purchase"} width={800} visible={isModalVisible} onOk={handleOk} onCancel={handleCancel}>
                <Form form={form} layout="vertical" initialValues={{ items: [{}], taxType: 'local' }}>
                    <Row gutter={16}>
                        <Col span={8}>
                             <Form.Item name="invoiceNumber" label="Invoice Number" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="warehouse" label="Warehouse" rules={[{ required: true }]}>
                                <Select placeholder="Select a warehouse">
                                    {warehouses.map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="purchaseDate" label="Purchase Date" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item name="taxType" label="Tax Type" rules={[{ required: true }]}>
                                <Radio.Group>
                                    <Radio value="local">Local (CGST + SGST)</Radio>
                                    <Radio value="interstate">Interstate (IGST)</Radio>
                                </Radio.Group>
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
                                            style={{width: '250px'}}
                                        >
                                            <Select placeholder="Select Product">
                                                {products.map(p => <Select.Option key={p.id} value={p.name}>{p.name}</Select.Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'quantity']}
                                            label="Quantity"
                                            rules={[{ required: true, type: 'number', min: 1, message: 'Invalid quantity' }]}
                                        >
                                            <InputNumber placeholder="Qty" />
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'unitPrice']}
                                            label="Unit Price (INR)"
                                            rules={[{ required: true, type: 'number', min: 0, message: 'Invalid price' }]}
                                        >
                                            <InputNumber placeholder="Unit Price" />
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

export default PurchasesPage;
