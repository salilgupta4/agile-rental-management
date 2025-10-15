import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Space, Row, Col, Divider, message, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, ExclamationCircleOutlined, MinusCircleOutlined, PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import dayjs from 'dayjs';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { useInventory } from '../hooks/useInventory';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { formatDate } from '../utils/helpers';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const TransfersPage = () => {
    const { data: products } = useCollection('products');
    const { data: customers, loading: customersLoading } = useCollection('customers');
    const { data: warehouses } = useCollection('warehouses');
    const { data: rentalOrders } = useCollection('rentalOrders');
    const { data: transfers, loading } = useCollection('transfers');
    const { warehouseStock } = useInventory();
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const [selectedCustomerSites, setSelectedCustomerSites] = useState([]);
    const [openOrders, setOpenOrders] = useState([]);
    const [selectedRentalOrder, setSelectedRentalOrder] = useState(null);

    const showModal = () => {
        setEditingRecord(null);
        form.resetFields();
        setSelectedCustomerSites([]);
        setOpenOrders([]);
        setSelectedRentalOrder(null);
        setIsModalVisible(true);
    };

    const handleEdit = (record) => {
        setEditingRecord(record);
        setIsModalVisible(true);
    };

    useEffect(() => {
        if (editingRecord && isModalVisible) {
            const customer = customers.find(c => c.name === editingRecord.customer);
            if (customer) {
                setSelectedCustomerSites(customer.sites || []);
            }
            const relatedOrders = rentalOrders.filter(order => {
                const totalOrdered = order.items.reduce((sum, item) => sum + item.quantity, 0);
                const totalDelivered = order.items.reduce((sum, item) => sum + (item.deliveredQuantity || 0), 0);
                return order.customerName === editingRecord.customer && order.siteName === editingRecord.site && totalDelivered < totalOrdered;
            });
            setOpenOrders(relatedOrders);

            // Convert old single-item structure to multi-item array for editing
            let items = editingRecord.items;
            if (!items || items.length === 0) {
                // Old structure - convert to array
                if (editingRecord.product) {
                    items = [{
                        product: editingRecord.product,
                        quantity: editingRecord.quantity,
                        perDayRent: editingRecord.perDayRent
                    }];
                } else {
                    items = [{}];
                }
            }

            form.setFieldsValue({
                dcNumber: editingRecord.dcNumber,
                customer: editingRecord.customer,
                site: editingRecord.site,
                from: editingRecord.from,
                workOrderNumber: editingRecord.workOrderNumber,
                rentalOrderId: editingRecord.rentalOrderId,
                transferDate: editingRecord.transferDate ? dayjs(editingRecord.transferDate) : null,
                rentalStartDate: editingRecord.rentalStartDate ? dayjs(editingRecord.rentalStartDate) : null,
                items: items
            });
        }
    }, [editingRecord, isModalVisible, form, customers, rentalOrders]);

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingRecord(null);
        form.resetFields();
        setSelectedCustomerSites([]);
        setOpenOrders([]);
        setSelectedRentalOrder(null);
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();

            // Validate that at least one item is present
            if (!values.items || values.items.length === 0) {
                message.error('Please add at least one product to the transfer.');
                return;
            }

            if (editingRecord) {
                // Update existing transfer
                const transferData = {
                    ...values,
                    transferDate: values.transferDate.toISOString(),
                    rentalStartDate: values.rentalStartDate.toISOString(),
                    items: values.items || []
                };
                const docRef = doc(db, "transfers", editingRecord.id);
                await updateDoc(docRef, transferData);
                const totalQuantity = (values.items || []).reduce((sum, item) => sum + Number(item.quantity), 0);
                await logAudit(
                    AUDIT_MODULES.TRANSFERS,
                    AUDIT_ACTIONS.EDIT,
                    `Updated transfer: DC ${values.dcNumber} to ${values.customer}/${values.site} - ${values.items.length} item(s), Total Qty: ${totalQuantity}`,
                    { transferId: editingRecord.id, dcNumber: values.dcNumber, customer: values.customer, site: values.site, from: values.from }
                );
                message.success('Transfer updated successfully!');
            } else {
                // Create new transfer
                let processedItems = [];

                await runTransaction(db, async (transaction) => {
                    let orderRef = null;
                    let orderData = null;

                    // --- READ PHASE ---
                    if (values.rentalOrderId) {
                        orderRef = doc(db, "rentalOrders", values.rentalOrderId);
                        const orderDoc = await transaction.get(orderRef);
                        if (!orderDoc.exists()) {
                            throw new Error("Rental order not found!");
                        }
                        orderData = orderDoc.data();
                    }

                    // --- WRITE PHASE ---
                    const newTransferRef = doc(collection(db, "transfers"));

                    // Process each item
                    processedItems = [];
                    for (let item of values.items) {
                        let perDayRent = item.perDayRent;

                        if (orderData) {
                            const itemIndex = orderData.items.findIndex(orderItem => orderItem.product === item.product);
                            if (itemIndex > -1) {
                                const currentDelivered = orderData.items[itemIndex].deliveredQuantity || 0;
                                const orderedQty = orderData.items[itemIndex].quantity;
                                const transferQty = Number(item.quantity);

                                if (currentDelivered + transferQty > orderedQty) {
                                    throw new Error(`Cannot transfer more than ordered for ${item.product}. Pending: ${orderedQty - currentDelivered}`);
                                }

                                // If perDayRent not provided, use from order
                                if (item.perDayRent === undefined || item.perDayRent === null) {
                                    perDayRent = orderData.items[itemIndex].perDayRent;
                                }

                                const updatedItems = [...orderData.items];
                                updatedItems[itemIndex].deliveredQuantity = currentDelivered + transferQty;
                                transaction.update(orderRef, { items: updatedItems });
                            } else {
                                throw new Error(`Product ${item.product} not found in the selected rental order.`);
                            }
                        } else {
                            // No rental order linked - use the provided perDayRent
                            if (!perDayRent) {
                                throw new Error(`Per day rent is required for ${item.product}`);
                            }
                        }

                        processedItems.push({
                            product: item.product,
                            quantity: item.quantity,
                            perDayRent: perDayRent
                        });
                    }

                    const transferData = {
                        dcNumber: values.dcNumber,
                        workOrderNumber: values.workOrderNumber || null,
                        customer: values.customer,
                        site: values.site,
                        from: values.from,
                        transferDate: values.transferDate.toISOString(),
                        rentalStartDate: values.rentalStartDate.toISOString(),
                        rentalOrderId: values.rentalOrderId || null,
                        items: processedItems,
                        status: 'Rented'
                    };

                    transaction.set(newTransferRef, transferData);
                });

                const totalQuantity = processedItems.reduce((sum, item) => sum + Number(item.quantity), 0);
                await logAudit(
                    AUDIT_MODULES.TRANSFERS,
                    AUDIT_ACTIONS.CREATE,
                    `Created new transfer: DC ${values.dcNumber} to ${values.customer}/${values.site} - ${processedItems.length} item(s), Total Qty: ${totalQuantity}${values.rentalOrderId ? ' (Linked to order)' : ' (Direct transfer)'}`,
                    { dcNumber: values.dcNumber, customer: values.customer, site: values.site, from: values.from, rentalOrderId: values.rentalOrderId }
                );
                message.success('Transfer recorded successfully!');
            }
            handleCancel();

        } catch (error) {
            console.error("Failed to save transfer: ", error);
            message.error(`Failed to save transfer: ${error.message}`);
        }
    };

    const handleDelete = (id) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this transfer record?',
            icon: <ExclamationCircleOutlined />,
            content: 'This action cannot be undone and will affect inventory calculations.',
            onOk: async () => {
                try {
                    const transfer = transfers.find(t => t.id === id);
                    await deleteDoc(doc(db, "transfers", id));
                    await logAudit(
                        AUDIT_MODULES.TRANSFERS,
                        AUDIT_ACTIONS.DELETE,
                        `Deleted transfer: DC ${transfer?.dcNumber || id}`,
                        { transferId: id, dcNumber: transfer?.dcNumber, customer: transfer?.customer, site: transfer?.site }
                    );
                    message.success("Transfer record deleted successfully");
                } catch (error) {
                    message.error("Failed to delete transfer record");
                }
            },
        });
    };

    const handleCustomerChange = (customerName) => {
        const customer = customers.find(c => c.name === customerName);
        if (customer) {
            setSelectedCustomerSites(customer.sites || []);
        } else {
            setSelectedCustomerSites([]);
        }
        form.setFieldsValue({ site: undefined, rentalOrderId: undefined });
    };

    const handleSiteChange = (siteName) => {
        const customerName = form.getFieldValue('customer');
        const relatedOrders = rentalOrders.filter(order => {
            const totalOrdered = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const totalDelivered = order.items.reduce((sum, item) => sum + (item.deliveredQuantity || 0), 0);
            return order.customerName === customerName && order.siteName === siteName && totalDelivered < totalOrdered;
        });
        setOpenOrders(relatedOrders);
        form.setFieldsValue({ rentalOrderId: undefined });
        setSelectedRentalOrder(null);
    };

    const handleRentalOrderChange = (orderId) => {
        if (!orderId) {
            setSelectedRentalOrder(null);
            return;
        }

        const order = rentalOrders.find(o => o.id === orderId);
        if (order) {
            setSelectedRentalOrder(order);

            // Auto-populate work order number if not already filled
            if (!form.getFieldValue('workOrderNumber')) {
                form.setFieldsValue({ workOrderNumber: order.workOrderNumber });
            }

            // Auto-populate per day rent for existing items that match order products
            const currentItems = form.getFieldValue('items') || [];
            const updatedItems = currentItems.map(item => {
                if (item.product) {
                    const orderItem = order.items.find(oi => oi.product === item.product);
                    if (orderItem && !item.perDayRent) {
                        return { ...item, perDayRent: orderItem.perDayRent };
                    }
                }
                return item;
            });
            form.setFieldsValue({ items: updatedItems });
        }
    };

    const handleProductChange = (fieldName, productName) => {
        if (selectedRentalOrder && productName) {
            const orderItem = selectedRentalOrder.items.find(item => item.product === productName);
            if (orderItem) {
                const currentItems = form.getFieldValue('items') || [];
                const updatedItems = [...currentItems];
                if (!updatedItems[fieldName]?.perDayRent) {
                    updatedItems[fieldName] = {
                        ...updatedItems[fieldName],
                        product: productName,
                        perDayRent: orderItem.perDayRent
                    };
                    form.setFieldsValue({ items: updatedItems });
                }
            }
        }
    };

    const expandedRowRender = (record) => {
        const itemColumns = [
            { title: 'Product', dataIndex: 'product', key: 'product' },
            { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
            { title: 'Per Day Rent (INR)', dataIndex: 'perDayRent', key: 'perDayRent' }
        ];

        // Handle both old single-item and new multi-item structure
        let items = record.items || [];
        if (!items.length && record.product) {
            // Old structure - convert to array
            items = [{ product: record.product, quantity: record.quantity, perDayRent: record.perDayRent }];
        }

        return <Table columns={itemColumns} dataSource={items} pagination={false} rowKey="product" />;
    };

    const columns = useMemo(() => [
        {
            title: 'DC No.',
            dataIndex: 'dcNumber',
            key: 'dcNumber',
            width: 120,
            sorter: (a, b) => a.dcNumber.localeCompare(b.dcNumber),
            filters: [...new Set(transfers.map(item => item.dcNumber))].map(dc => ({ text: dc, value: dc })),
            onFilter: (value, record) => record.dcNumber === value,
            filterSearch: true,
        },
        {
            title: 'Customer',
            dataIndex: 'customer',
            key: 'customer',
            width: 150,
            sorter: (a, b) => a.customer.localeCompare(b.customer),
            filters: [...new Set(transfers.map(item => item.customer))].map(c => ({ text: c, value: c })),
            onFilter: (value, record) => record.customer === value,
            filterSearch: true,
        },
        {
            title: 'Site',
            dataIndex: 'site',
            key: 'site',
            width: 150,
            sorter: (a, b) => a.site.localeCompare(b.site),
            filters: [...new Set(transfers.map(item => item.site))].map(s => ({ text: s, value: s })),
            onFilter: (value, record) => record.site === value,
            filterSearch: true,
        },
        {
            title: 'Work Order No.',
            dataIndex: 'workOrderNumber',
            key: 'workOrderNumber',
            width: 150,
            filters: [...new Set(transfers.map(item => item.workOrderNumber).filter(Boolean))].map(wo => ({ text: wo, value: wo })),
            onFilter: (value, record) => record.workOrderNumber === value,
            filterSearch: true,
        },
        {
            title: 'Items Count',
            key: 'itemsCount',
            width: 100,
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
            width: 120,
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
            title: 'From',
            dataIndex: 'from',
            key: 'from',
            width: 120,
            filters: [...new Set(transfers.map(item => item.from))].map(f => ({ text: f, value: f })),
            onFilter: (value, record) => record.from === value,
            filterSearch: true,
        },
        {
            title: 'Rental Start',
            dataIndex: 'rentalStartDate',
            key: 'rentalStartDate',
            width: 140,
            render: (text) => formatDate(text),
            sorter: (a, b) => new Date(a.rentalStartDate) - new Date(b.rentalStartDate),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            filters: [...new Set(transfers.map(item => item.status))].map(s => ({ text: s, value: s })),
            onFilter: (value, record) => record.status === value,
            filterSearch: true,
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'left',
            width: 100,
            fixed: 'right',
            render: (_, record) => (
                <Space size="small">
                    {canEdit(MODULES.TRANSFERS) && (
                        <Tooltip title="Edit Transfer">
                            <Button
                                type="primary"
                                icon={<EditOutlined />}
                                onClick={() => handleEdit(record)}
                                size="small"
                                shape="circle"
                            />
                        </Tooltip>
                    )}
                    {canDelete(MODULES.TRANSFERS) && (
                        <Tooltip title="Delete Transfer">
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => handleDelete(record.id)}
                                size="small"
                                shape="circle"
                            />
                        </Tooltip>
                    )}
                </Space>
            ),
        }
    ], [transfers, products, canEdit, canDelete]);

    const exportToCSV = () => {
        if (!transfers || transfers.length === 0) {
            message.warn('No data to export.');
            return;
        }

        const headers = ['DC No.', 'Customer', 'Site', 'Work Order No.', 'Product', 'Quantity', 'Per Day Rent (₹)', 'From', 'Transfer Date', 'Rental Start Date', 'Status'];
        const csvRows = [];

        transfers.forEach(transfer => {
            // Handle both old and new structure
            let items = transfer.items || [];
            if (!items.length && transfer.product) {
                items = [{ product: transfer.product, quantity: transfer.quantity, perDayRent: transfer.perDayRent }];
            }

            items.forEach(item => {
                csvRows.push([
                    transfer.dcNumber,
                    transfer.customer,
                    transfer.site,
                    transfer.workOrderNumber || 'N/A',
                    item.product,
                    item.quantity,
                    item.perDayRent || 0,
                    transfer.from,
                    new Date(transfer.transferDate).toLocaleString(),
                    new Date(transfer.rentalStartDate).toLocaleString(),
                    transfer.status || 'N/A'
                ].map(field => JSON.stringify(field)).join(','));
            });
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...csvRows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "transfers.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        message.success('Transfers exported successfully!');
    };

    return (
        <Card title="Material Transfers to Customers" extra={
            <Button icon={<FileExcelOutlined />} onClick={exportToCSV}>Export CSV</Button>
        }>
             {canCreate(MODULES.TRANSFERS) &&
                <Button type="primary" onClick={showModal} style={{ marginBottom: 16 }}>New Transfer</Button>
             }
            <Table
                dataSource={transfers}
                columns={columns}
                loading={loading}
                rowKey="id"
                expandable={{ expandedRowRender }}
                scroll={{ x: 1250 }}
            />
            <Modal
                title={editingRecord ? "Edit Material Transfer" : "New Material Transfer"}
                visible={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                width={900}
            >
                <Form form={form} layout="vertical" initialValues={{ items: [{}] }}>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="dcNumber" label="Delivery Challan Number" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="customer" label="Customer" rules={[{ required: true }]}>
                                <Select placeholder="Select a customer" onSelect={handleCustomerChange}>
                                    {customers.map(c => <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="site" label="Site Name" rules={[{ required: true }]}>
                                <Select placeholder="Select a site" disabled={selectedCustomerSites.length === 0} onSelect={handleSiteChange}>
                                    {selectedCustomerSites.map(site => <Select.Option key={site} value={site}>{site}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="from" label="Transfer From (Warehouse)" rules={[{ required: true }]}>
                                <Select placeholder="Select a warehouse">
                                    {warehouses.map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="transferDate" label="Transfer Date" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="rentalStartDate" label="Rental Start Date" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="workOrderNumber" label="Work Order Number (Optional)">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="rentalOrderId" label="Link to Rental Order (Optional)">
                                <Select
                                    placeholder="Select an order (optional - auto-fills rental rates)"
                                    allowClear
                                    onChange={handleRentalOrderChange}
                                >
                                    {openOrders.map(order => <Select.Option key={order.id} value={order.id}>{order.workOrderNumber}</Select.Option>)}
                                </Select>
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
                                            style={{width: '300px'}}
                                        >
                                            <Select
                                                placeholder="Select Product"
                                                onChange={(value) => handleProductChange(name, value)}
                                            >
                                                {products.map(p => <Select.Option key={p.id} value={p.name}>{p.name}</Select.Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'quantity']}
                                            label="Quantity"
                                            dependencies={['from']}
                                            rules={[
                                                { required: true, type: 'number', min: 1, message: 'Invalid quantity' },
                                                ({ getFieldValue }) => ({
                                                    validator(_, value) {
                                                        const warehouse = getFieldValue('from');
                                                        const items = getFieldValue('items');
                                                        const product = items?.[name]?.product;

                                                        if (!value || !warehouse || !product) {
                                                            return Promise.resolve();
                                                        }

                                                        const availableStock = warehouseStock[warehouse]?.[product] || 0;
                                                        if (value > availableStock) {
                                                            return Promise.reject(new Error(`Not enough stock. Only ${availableStock} units available.`));
                                                        }
                                                        return Promise.resolve();
                                                    },
                                                }),
                                            ]}
                                        >
                                            <InputNumber placeholder="Qty" />
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'perDayRent']}
                                            label={selectedRentalOrder ? "Per Day Rent (INR) - Auto-filled" : "Per Day Rent (INR)"}
                                            rules={[{ required: true, type: 'number', min: 0, message: 'Invalid rent' }]}
                                        >
                                            <InputNumber placeholder={selectedRentalOrder ? "Auto-filled from order" : "Rent/Day"} />
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

export default TransfersPage;
