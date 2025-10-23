import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Row, Col, Divider, Space, InputNumber, Tag, message, Radio, Alert, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, ExclamationCircleOutlined, MinusCircleOutlined, PlusOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { useGST } from '../hooks/useGST';
import { formatDate } from '../utils/helpers';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const RentalOrdersPage = () => {
    const { data: products } = useCollection('products');
    const { data: customers } = useCollection('customers');
    const { data: rentalOrders, loading } = useCollection('rentalOrders');
    const { canCreate, canEdit, canDelete } = usePermissions();
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();
    const [selectedCustomerSites, setSelectedCustomerSites] = useState([]);
    const { gstRates, calculateGST } = useGST();

    const showModal = () => {
        setEditingRecord(null);
        form.resetFields();
        setSelectedCustomerSites([]);
        setIsModalVisible(true);
    };

    const handleEdit = (record) => {
        setEditingRecord(record);
        setIsModalVisible(true);
    };

    useEffect(() => {
        if (editingRecord && isModalVisible) {
            const customer = customers.find(c => c.name === editingRecord.customerName);
            if (customer) {
                setSelectedCustomerSites(customer.sites || []);
            }
            form.setFieldsValue({
                workOrderNumber: editingRecord.workOrderNumber,
                customerName: editingRecord.customerName,
                siteName: editingRecord.siteName,
                items: editingRecord.items || [{}],
                taxType: editingRecord.taxType || 'local'
            });
        }
    }, [editingRecord, isModalVisible, form, customers]);

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingRecord(null);
        form.resetFields();
        setSelectedCustomerSites([]);
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();

            // Validate that at least one item is present
            if (!values.items || values.items.length === 0) {
                message.error('Please add at least one product to the rental order.');
                return;
            }

            if (editingRecord) {
                // Update existing order - preserve deliveredQuantity
                const orderData = {
                    ...values,
                    taxType: values.taxType || 'local',
                    items: values.items.map((item, index) => ({
                        ...item,
                        deliveredQuantity: editingRecord.items[index]?.deliveredQuantity || 0
                    }))
                };
                const docRef = doc(db, "rentalOrders", editingRecord.id);
                await updateDoc(docRef, orderData);
                const totalQuantity = values.items.reduce((sum, item) => sum + Number(item.quantity), 0);
                await logAudit(
                    AUDIT_MODULES.RENTAL_ORDERS,
                    AUDIT_ACTIONS.EDIT,
                    `Updated rental order: WO ${values.workOrderNumber} for ${values.customerName}/${values.siteName} - ${values.items.length} item(s), Total Qty: ${totalQuantity}`,
                    { orderId: editingRecord.id, workOrderNumber: values.workOrderNumber, customerName: values.customerName, siteName: values.siteName }
                );
                message.success('Rental Order updated successfully!');
            } else {
                // Create new order
                const orderData = {
                    ...values,
                    taxType: values.taxType || 'local',
                    orderDate: new Date().toISOString(),
                    items: values.items.map(item => ({ ...item, deliveredQuantity: 0 })),
                    status: 'Pending'
                };
                const docRef = await addDoc(collection(db, "rentalOrders"), orderData);
                const totalQuantity = values.items.reduce((sum, item) => sum + Number(item.quantity), 0);
                await logAudit(
                    AUDIT_MODULES.RENTAL_ORDERS,
                    AUDIT_ACTIONS.CREATE,
                    `Created new rental order: WO ${values.workOrderNumber} for ${values.customerName}/${values.siteName} - ${values.items.length} item(s), Total Qty: ${totalQuantity}`,
                    { orderId: docRef.id, workOrderNumber: values.workOrderNumber, customerName: values.customerName, siteName: values.siteName }
                );
                message.success('Rental Order created successfully!');
            }
            handleCancel();
        } catch (error) {
            console.error("Failed to save rental order: ", error);
            message.error('Failed to save rental order.');
        }
    };

    const handleDelete = (id) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this rental order?',
            icon: <ExclamationCircleOutlined />,
            content: 'This action cannot be undone.',
            onOk: async () => {
                try {
                    const order = rentalOrders.find(o => o.id === id);
                    await deleteDoc(doc(db, "rentalOrders", id));
                    await logAudit(
                        AUDIT_MODULES.RENTAL_ORDERS,
                        AUDIT_ACTIONS.DELETE,
                        `Deleted rental order: WO ${order?.workOrderNumber || id}`,
                        { orderId: id, workOrderNumber: order?.workOrderNumber, customerName: order?.customerName, siteName: order?.siteName }
                    );
                    message.success("Rental order deleted successfully");
                } catch (error) {
                    message.error("Failed to delete rental order");
                }
            },
        });
    };

    const handleForceClose = (id) => {
        Modal.confirm({
            title: 'Force Close Rental Order?',
            icon: <ExclamationCircleOutlined />,
            content: 'This will mark the order as closed even though it is not fully fulfilled. Are you sure?',
            onOk: async () => {
                try {
                    const order = rentalOrders.find(o => o.id === id);
                    await updateDoc(doc(db, "rentalOrders", id), { status: 'Part Fulfilled & Closed' });
                    await logAudit(
                        AUDIT_MODULES.RENTAL_ORDERS,
                        AUDIT_ACTIONS.STATUS_CHANGE,
                        `Force closed rental order: WO ${order?.workOrderNumber || id} - Status changed to 'Part Fulfilled & Closed'`,
                        { orderId: id, workOrderNumber: order?.workOrderNumber, customerName: order?.customerName, siteName: order?.siteName, newStatus: 'Part Fulfilled & Closed' }
                    );
                    message.success("Rental order closed successfully");
                } catch (error) {
                    message.error("Failed to close rental order");
                }
            },
        });
    };

    const getStatus = (record) => {
        if (record.status === 'Part Fulfilled & Closed') return <Tag color="blue">Part Fulfilled & Closed</Tag>;
        const totalOrdered = record.items.reduce((sum, item) => sum + Number(item.quantity), 0);
        const totalDelivered = record.items.reduce((sum, item) => sum + Number(item.deliveredQuantity || 0), 0);
        if (totalDelivered === 0) return <Tag color="red">Pending</Tag>;
        if (totalDelivered >= totalOrdered) return <Tag color="green">Fulfilled</Tag>;
        return <Tag color="orange">Partially Fulfilled</Tag>;
    };

    const expandedRowRender = (record) => {
        const itemColumns = [
            { title: 'Product', dataIndex: 'product', key: 'product' },
            { title: 'Ordered', dataIndex: 'quantity', key: 'quantity' },
            { title: 'Delivered', dataIndex: 'deliveredQuantity', key: 'deliveredQuantity', render: (val) => val || 0 },
            { title: 'Pending', key: 'pending', render: (_, item) => item.quantity - (item.deliveredQuantity || 0) },
            { title: 'Per Day Rent (INR)', dataIndex: 'perDayRent', key: 'perDayRent' },
        ];
        return <Table columns={itemColumns} dataSource={record.items} pagination={false} />;
    };

    const columns = [
        {
            title: 'Order Date',
            dataIndex: 'orderDate',
            key: 'orderDate',
            render: (text) => formatDate(text),
            sorter: (a, b) => new Date(a.orderDate) - new Date(b.orderDate),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Work Order No.',
            dataIndex: 'workOrderNumber',
            key: 'workOrderNumber',
            filters: [...new Set(rentalOrders.map(item => item.workOrderNumber))].map(wo => ({ text: wo, value: wo })),
            onFilter: (value, record) => record.workOrderNumber === value,
            filterSearch: true,
        },
        {
            title: 'Customer',
            dataIndex: 'customerName',
            key: 'customerName',
            filters: [...new Set(rentalOrders.map(item => item.customerName))].map(c => ({ text: c, value: c })),
            onFilter: (value, record) => record.customerName === value,
            filterSearch: true,
        },
        {
            title: 'Site',
            dataIndex: 'siteName',
            key: 'siteName',
            filters: [...new Set(rentalOrders.map(item => item.siteName))].map(s => ({ text: s, value: s })),
            onFilter: (value, record) => record.siteName === value,
            filterSearch: true,
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => getStatus(record),
            filters: [
                { text: 'Pending', value: 'Pending' },
                { text: 'Partially Fulfilled', value: 'Partially Fulfilled' },
                { text: 'Fulfilled', value: 'Fulfilled' },
                { text: 'Part Fulfilled & Closed', value: 'Part Fulfilled & Closed' }
            ],
            onFilter: (value, record) => {
                if (record.status === 'Part Fulfilled & Closed') return value === 'Part Fulfilled & Closed';
                const totalOrdered = record.items.reduce((sum, item) => sum + Number(item.quantity), 0);
                const totalDelivered = record.items.reduce((sum, item) => sum + Number(item.deliveredQuantity || 0), 0);
                if (totalDelivered === 0) return value === 'Pending';
                if (totalDelivered >= totalOrdered) return value === 'Fulfilled';
                return value === 'Partially Fulfilled';
            },
            filterSearch: true,
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'left',
            width: 150,
            render: (_, record) => {
                const totalOrdered = record.items.reduce((sum, item) => sum + Number(item.quantity), 0);
                const totalDelivered = record.items.reduce((sum, item) => sum + Number(item.deliveredQuantity || 0), 0);
                const isPartiallyFulfilled = totalDelivered > 0 && totalDelivered < totalOrdered && record.status !== 'Part Fulfilled & Closed';

                return (
                    <Space size="small">
                        {canEdit(MODULES.RENTAL_ORDERS) && (
                            <Tooltip title="Edit Order">
                                <Button
                                    type="primary"
                                    icon={<EditOutlined />}
                                    onClick={() => handleEdit(record)}
                                    size="small"
                                    shape="circle"
                                />
                            </Tooltip>
                        )}
                        {canDelete(MODULES.RENTAL_ORDERS) && (
                            <Tooltip title="Delete Order">
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => handleDelete(record.id)}
                                    size="small"
                                    shape="circle"
                                />
                            </Tooltip>
                        )}
                        {isPartiallyFulfilled && canEdit(MODULES.RENTAL_ORDERS) && (
                            <Tooltip title="Force Close Order">
                                <Button
                                    type="default"
                                    icon={<CheckCircleOutlined />}
                                    onClick={() => handleForceClose(record.id)}
                                    size="small"
                                    shape="circle"
                                    style={{ color: '#1890ff', borderColor: '#1890ff' }}
                                />
                            </Tooltip>
                        )}
                    </Space>
                );
            },
        }
    ];

    return (
        <Card title="Rental Orders">
            {canCreate(MODULES.RENTAL_ORDERS) &&
                <Button type="primary" onClick={showModal} style={{ marginBottom: 16 }}>New Rental Order</Button>
            }
            <Table
                dataSource={rentalOrders}
                columns={columns}
                loading={loading}
                rowKey="id"
                expandable={{ expandedRowRender }}
            />
            <Modal title={editingRecord ? "Edit Rental Order" : "New Rental Order"} width={800} visible={isModalVisible} onOk={handleOk} onCancel={handleCancel}>
                <Form form={form} layout="vertical" initialValues={{ items: [{}], taxType: 'local' }}>
                     <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="workOrderNumber" label="Work Order Number" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                             <Form.Item name="customerName" label="Customer Name" rules={[{ required: true }]}>
                                <Select placeholder="Select a customer" onSelect={(val) => {
                                    const customer = customers.find(c => c.name === val);
                                    setSelectedCustomerSites(customer ? customer.sites || [] : []);
                                    form.setFieldsValue({ siteName: undefined });
                                }} showSearch optionFilterProp="children">
                                    {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="siteName" label="Site Name" rules={[{ required: true }]}>
                                <Select placeholder="Select a site" disabled={selectedCustomerSites.length === 0} showSearch optionFilterProp="children">
                                    {[...selectedCustomerSites].sort().map(site => <Select.Option key={site} value={site}>{site}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item name="taxType" label="Tax Type (for future invoices)" rules={[{ required: true }]}>
                                <Radio.Group>
                                    <Radio value="local">Local (CGST + SGST)</Radio>
                                    <Radio value="interstate">Interstate (IGST)</Radio>
                                </Radio.Group>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Alert
                        message="GST Information"
                        description="GST will be applied on monthly rental invoices based on the tax type selected above."
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
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
                                            <Select placeholder="Select Product" showSearch optionFilterProp="children">
                                                {[...products].sort((a, b) => a.name.localeCompare(b.name)).map(p => <Select.Option key={p.id} value={p.name}>{p.name}</Select.Option>)}
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
                                            name={[name, 'perDayRent']}
                                            label="Per Day Rent (INR)"
                                            rules={[{ required: true, type: 'number', min: 0, message: 'Invalid price' }]}
                                        >
                                            <InputNumber placeholder="Rent/Day" />
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
}

export default RentalOrdersPage;
