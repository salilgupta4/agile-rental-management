import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, DatePicker, Radio, Space, InputNumber, Row, Col, Divider, message } from 'antd';
import { DeleteOutlined, EditOutlined, ExclamationCircleOutlined, MinusCircleOutlined, PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import dayjs from 'dayjs';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { useInventory } from '../hooks/useInventory';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { useGST } from '../hooks/useGST';
import { formatDate } from '../utils/helpers';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const SalesPage = () => {
    const { data: sales, loading } = useCollection('sales');
    const { data: warehouses } = useCollection('warehouses');
    const { data: customers } = useCollection('customers');
    const { data: products } = useCollection('products');
    const { warehouseStock, customerStock } = useInventory();
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const [saleFrom, setSaleFrom] = useState('warehouse');
    const [availableProducts, setAvailableProducts] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState({ type: null, name: null, site: null });
    const { gstRates, calculateGST } = useGST();

    const showModal = () => {
        setEditingRecord(null);
        form.resetFields();
        setSaleFrom('warehouse');
        setAvailableProducts([]);
        setSelectedLocation({ type: null, name: null, site: null });
        setIsModalVisible(true);
    };

    const handleEdit = (record) => {
        setEditingRecord(record);
        setIsModalVisible(true);
    };

    useEffect(() => {
        if (editingRecord && isModalVisible) {
            const fromType = editingRecord.fromWarehouse ? 'warehouse' : 'client';
            setSaleFrom(fromType);

            form.setFieldsValue({
                invoiceNumber: editingRecord.invoiceNumber,
                saleFrom: fromType,
                location: editingRecord.fromWarehouse || editingRecord.fromCustomer,
                site: editingRecord.fromSite,
                invoiceDate: editingRecord.invoiceDate ? dayjs(editingRecord.invoiceDate) : null,
                items: editingRecord.items || [],
                taxType: editingRecord.taxType || 'local'
            });

            // Set up available products for editing
            let stock = {};
            if (fromType === 'warehouse' && editingRecord.fromWarehouse && warehouseStock[editingRecord.fromWarehouse]) {
                stock = warehouseStock[editingRecord.fromWarehouse];
            } else if (fromType === 'client' && editingRecord.fromCustomer && editingRecord.fromSite &&
                       customerStock[editingRecord.fromCustomer] && customerStock[editingRecord.fromCustomer][editingRecord.fromSite]) {
                stock = customerStock[editingRecord.fromCustomer][editingRecord.fromSite];
            }

            // Include products from editing record even if out of stock
            const editingProducts = (editingRecord.items || []).map(item => item.product);
            const stockProducts = Object.keys(stock).filter(p => stock[p] > 0);
            const allProducts = [...new Set([...stockProducts, ...editingProducts])];

            setAvailableProducts(allProducts);
            setSelectedLocation({
                type: fromType,
                name: editingRecord.fromWarehouse || editingRecord.fromCustomer,
                site: editingRecord.fromSite
            });
        }
    }, [editingRecord, isModalVisible, form, warehouseStock, customerStock]);

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingRecord(null);
        form.resetFields();
        setSaleFrom('warehouse');
        setAvailableProducts([]);
        setSelectedLocation({ type: null, name: null, site: null });
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();

            // Validate that at least one item is present
            if (!values.items || values.items.length === 0) {
                message.error('Please add at least one product to the sale.');
                return;
            }

            // Calculate total base amount
            const baseAmount = (values.items || []).reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
            const taxType = values.taxType || 'local';
            const gstData = calculateGST(baseAmount, taxType);

            const saleData = {
                invoiceNumber: values.invoiceNumber,
                invoiceDate: values.invoiceDate.toISOString(),
                fromWarehouse: saleFrom === 'warehouse' ? values.location : null,
                fromCustomer: saleFrom === 'client' ? values.location : null,
                fromSite: saleFrom === 'client' ? values.site : null,
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
                const docRef = doc(db, "sales", editingRecord.id);
                await updateDoc(docRef, saleData);
                const soldFrom = saleFrom === 'warehouse' ? `Warehouse: ${values.location}` : `Client: ${values.location}/${values.site}`;
                await logAudit(
                    AUDIT_MODULES.SALES,
                    AUDIT_ACTIONS.EDIT,
                    `Updated sale: Invoice ${values.invoiceNumber} from ${soldFrom} - ${values.items.length} item(s), Total: ₹${gstData.totalAmount.toFixed(2)}`,
                    { saleId: editingRecord.id, invoiceNumber: values.invoiceNumber, soldFrom, totalAmount: gstData.totalAmount }
                );
                message.success('Sale updated successfully!');
            } else {
                const docRef = await addDoc(collection(db, "sales"), saleData);
                const soldFrom = saleFrom === 'warehouse' ? `Warehouse: ${values.location}` : `Client: ${values.location}/${values.site}`;
                await logAudit(
                    AUDIT_MODULES.SALES,
                    AUDIT_ACTIONS.CREATE,
                    `Recorded new sale: Invoice ${values.invoiceNumber} from ${soldFrom} - ${values.items.length} item(s), Total: ₹${gstData.totalAmount.toFixed(2)}`,
                    { saleId: docRef.id, invoiceNumber: values.invoiceNumber, soldFrom, totalAmount: gstData.totalAmount }
                );
                message.success('Sale recorded successfully!');
            }
            handleCancel();
        } catch (error) {
            console.error("Failed to save sale: ", error);
            message.error('Failed to save sale.');
        }
    };

    const handleDelete = (id) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this sale record?',
            icon: <ExclamationCircleOutlined />,
            content: 'This action cannot be undone and will affect inventory calculations.',
            onOk: async () => {
                try {
                    const sale = sales.find(s => s.id === id);
                    await deleteDoc(doc(db, "sales", id));
                    await logAudit(
                        AUDIT_MODULES.SALES,
                        AUDIT_ACTIONS.DELETE,
                        `Deleted sale: Invoice ${sale?.invoiceNumber || id}`,
                        { saleId: id, invoiceNumber: sale?.invoiceNumber }
                    );
                    message.success("Sale record deleted successfully");
                } catch (error) {
                    message.error("Failed to delete sale record");
                }
            },
        });
    };

    const handleLocationChange = (type, value, site = null) => {
        form.setFieldsValue({ items: [{}] });
        let stock = {};
        if (type === 'warehouse' && warehouseStock[value]) {
            stock = warehouseStock[value];
        } else if (type === 'client' && customerStock[value] && customerStock[value][site]) {
            stock = customerStock[value][site];
        }
        setAvailableProducts(Object.keys(stock).filter(p => stock[p] > 0));
        setSelectedLocation({ type, name: value, site });
    };

    const expandedRowRender = (record) => {
        const itemColumns = [
            { title: 'Product', dataIndex: 'product', key: 'product' },
            { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
            { title: 'Sale Price/Unit (INR)', dataIndex: 'salePrice', key: 'salePrice' },
            { title: 'Total', key: 'total', render: (_, item) => (item.quantity * item.salePrice).toFixed(2) }
        ];

        // Handle both old single-item and new multi-item structure
        let items = record.items || [];
        if (!items.length && record.product) {
            // Old structure - convert to array
            items = [{ product: record.product, quantity: record.quantity, salePrice: record.salePrice }];
        }

        const gstBreakdown = record.gstBreakdown || {};
        const baseAmount = gstBreakdown.baseAmount || items.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
        const taxType = record.taxType || 'local';
        const gstData = record.gstBreakdown || calculateGST(baseAmount, taxType);

        return (
            <>
                <Table columns={itemColumns} dataSource={items} pagination={false} rowKey="product" />
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

    const columns = [
        {
            title: 'Invoice No.',
            dataIndex: 'invoiceNumber',
            key: 'invoiceNumber',
            sorter: (a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber),
            filters: [...new Set(sales.map(item => item.invoiceNumber))].map(inv => ({ text: inv, value: inv })),
            onFilter: (value, record) => record.invoiceNumber === value,
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
            title: 'Total Sale Value with GST (INR)',
            key: 'totalSale',
            render: (_, record) => {
                const gstData = record.gstBreakdown;
                if (gstData && gstData.totalAmount) {
                    return gstData.totalAmount.toFixed(2);
                }
                // Handle both old and new structure
                let baseAmount = 0;
                if (record.items && record.items.length > 0) {
                    baseAmount = record.items.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
                } else if (record.product) {
                    baseAmount = Number(record.quantity) * Number(record.salePrice);
                }
                const taxType = record.taxType || 'local';
                const calculated = calculateGST(baseAmount, taxType);
                return calculated.totalAmount.toFixed(2);
            },
            sorter: (a, b) => {
                const getTotalAmount = (record) => {
                    if (record.gstBreakdown && record.gstBreakdown.totalAmount) {
                        return record.gstBreakdown.totalAmount;
                    }
                    // Handle both old and new structure
                    let baseAmount = 0;
                    if (record.items && record.items.length > 0) {
                        baseAmount = record.items.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
                    } else if (record.product) {
                        baseAmount = Number(record.quantity) * Number(record.salePrice);
                    }
                    const taxType = record.taxType || 'local';
                    return calculateGST(baseAmount, taxType).totalAmount;
                };
                return getTotalAmount(a) - getTotalAmount(b);
            }
        },
        {
            title: 'Invoice Date',
            dataIndex: 'invoiceDate',
            key: 'invoiceDate',
            render: (text) => formatDate(text),
            sorter: (a, b) => new Date(a.invoiceDate) - new Date(b.invoiceDate),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Sold From',
            key: 'soldFrom',
            render: (_, record) => record.fromWarehouse ? `Warehouse: ${record.fromWarehouse}` : `Client: ${record.fromCustomer} (${record.fromSite})`,
            filters: [
                ...new Set(sales.map(item => item.fromWarehouse ? `Warehouse: ${item.fromWarehouse}` : `Client: ${item.fromCustomer}`))
            ].map(loc => ({ text: loc, value: loc })),
            onFilter: (value, record) => {
                const recordValue = record.fromWarehouse ? `Warehouse: ${record.fromWarehouse}` : `Client: ${record.fromCustomer}`;
                return recordValue === value;
            },
            filterSearch: true,
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    {canEdit(MODULES.SALES) && (
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                            Edit
                        </Button>
                    )}
                    {canDelete(MODULES.SALES) && (
                        <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
                            Delete
                        </Button>
                    )}
                </Space>
            ),
        }
    ];

    const exportToCSV = () => {
        if (!sales || sales.length === 0) {
            message.warn('No data to export.');
            return;
        }

        const headers = ['Invoice No.', 'Invoice Date', 'Product', 'Quantity', 'Sale Price (₹)', 'Sold From', 'Base Amount (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total GST (₹)', 'Total Amount (₹)'];
        const csvRows = [];

        sales.forEach(sale => {
            const gstData = sale.gstBreakdown || (() => {
                // Handle both old and new structure
                let baseAmount = 0;
                if (sale.items && sale.items.length > 0) {
                    baseAmount = sale.items.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
                } else if (sale.product) {
                    baseAmount = Number(sale.quantity) * Number(sale.salePrice);
                }
                const taxType = sale.taxType || 'local';
                return calculateGST(baseAmount, taxType);
            })();

            const soldFrom = sale.fromWarehouse ? `Warehouse: ${sale.fromWarehouse}` : `Client: ${sale.fromCustomer} (${sale.fromSite})`;

            // Handle both old and new structure
            let items = sale.items || [];
            if (!items.length && sale.product) {
                items = [{ product: sale.product, quantity: sale.quantity, salePrice: sale.salePrice }];
            }

            items.forEach(item => {
                csvRows.push([
                    sale.invoiceNumber,
                    new Date(sale.invoiceDate).toLocaleString(),
                    item.product,
                    item.quantity,
                    item.salePrice.toFixed(2),
                    soldFrom,
                    gstData.baseAmount.toFixed(2),
                    gstData.cgst.toFixed(2),
                    gstData.sgst.toFixed(2),
                    gstData.igst.toFixed(2),
                    gstData.totalGST.toFixed(2),
                    gstData.totalAmount.toFixed(2)
                ].map(field => JSON.stringify(field)).join(','));
            });
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...csvRows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "sales.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        message.success('Sales exported successfully!');
    };

    return (
        <Card title="Obsolete/Damaged Sales" extra={
            <Button icon={<FileExcelOutlined />} onClick={exportToCSV}>Export CSV</Button>
        }>
            {canCreate(MODULES.SALES) &&
                <Button type="primary" onClick={showModal} style={{ marginBottom: 16 }}>Record Sale</Button>
            }
            <Table
                dataSource={sales}
                columns={columns}
                loading={loading}
                rowKey="id"
                expandable={{ expandedRowRender }}
            />
            <Modal
                title={editingRecord ? "Edit Sale" : "Record New Sale"}
                visible={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                width={900}
            >
                <Form form={form} layout="vertical" initialValues={{ saleFrom: 'warehouse', items: [{}], taxType: 'local' }}>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="invoiceNumber" label="Invoice Number" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="saleFrom" label="Sell From">
                                <Radio.Group onChange={(e) => setSaleFrom(e.target.value)}>
                                    <Radio.Button value="warehouse">Warehouse</Radio.Button>
                                    <Radio.Button value="client">Client Site</Radio.Button>
                                </Radio.Group>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="invoiceDate" label="Invoice Date" rules={[{ required: true }]}>
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

                    {saleFrom === 'warehouse' && (
                        <Row gutter={16}>
                            <Col span={24}>
                                <Form.Item name="location" label="Warehouse" rules={[{ required: true }]}>
                                    <Select placeholder="Select a warehouse" onChange={(val) => handleLocationChange('warehouse', val)}>
                                        {warehouses.map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                    )}

                    {saleFrom === 'client' && (
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="location" label="Customer" rules={[{ required: true }]}>
                                    <Select placeholder="Select a customer" onChange={(val) => {
                                        form.setFieldsValue({ site: undefined });
                                        setAvailableProducts([]);
                                    }}>
                                        {customers.map(c => <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>)}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="site" label="Site" rules={[{ required: true }]}>
                                    <Select placeholder="Select a site" onChange={(val) => handleLocationChange('client', form.getFieldValue('location'), val)}>
                                        {(customers.find(c => c.name === form.getFieldValue('location'))?.sites || []).map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                    )}

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
                                            <Select placeholder="Select Product" disabled={availableProducts.length === 0}>
                                                {availableProducts.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'quantity']}
                                            label="Quantity"
                                            rules={[
                                                { required: true, type: 'number', min: 1, message: 'Invalid quantity' },
                                                ({ getFieldValue }) => ({
                                                    validator(_, value) {
                                                        const items = getFieldValue('items');
                                                        const product = items?.[name]?.product;

                                                        if (!value || !product || !selectedLocation.name) {
                                                            return Promise.resolve();
                                                        }

                                                        let availableStock = 0;
                                                        if(selectedLocation.type === 'warehouse') {
                                                            availableStock = warehouseStock[selectedLocation.name]?.[product] || 0;
                                                        } else if (selectedLocation.type === 'client') {
                                                            availableStock = customerStock[selectedLocation.name]?.[selectedLocation.site]?.[product] || 0;
                                                        }

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
                                            name={[name, 'salePrice']}
                                            label="Sale Price/Unit (INR)"
                                            rules={[{ required: true, type: 'number', min: 0, message: 'Invalid price' }]}
                                        >
                                            <InputNumber placeholder="Price" />
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

export default SalesPage;
