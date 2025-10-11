import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Tabs, Button, Form, Select, DatePicker, Space, message } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { useCollection } from '../hooks/useCollection';
import { useInventory } from '../hooks/useInventory';
import { useGST } from '../hooks/useGST';
import { formatDate } from '../utils/helpers';

const RentalReportGenerator = ({ customers, onFinish }) => {
    const [form] = Form.useForm();
    const clientName = Form.useWatch('clientName', form);
    const [sites, setSites] = useState([]);

    useEffect(() => {
        const selectedCustomer = customers.find(c => c.name === clientName);
        setSites(selectedCustomer?.sites || []);
        form.setFieldsValue({ siteName: undefined });
    }, [clientName, customers, form]);

    return (
        <Form form={form} onFinish={onFinish} layout="inline">
            <Form.Item name="clientName" label="Client" rules={[{ required: true }]}>
                <Select style={{ width: 200 }} placeholder="Select Client">
                    {customers.map(c => <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>)}
                </Select>
            </Form.Item>
            <Form.Item name="siteName" label="Site">
                <Select style={{ width: 200 }} placeholder="All Sites" allowClear disabled={!clientName}>
                    {sites.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                </Select>
            </Form.Item>
            <Form.Item name="dateRange" label="Date Range" rules={[{ required: true }]}>
                <DatePicker.RangePicker />
            </Form.Item>
            <Form.Item>
                <Button type="primary" htmlType="submit">Generate</Button>
            </Form.Item>
        </Form>
    );
};

const ReportsPage = () => {
    const { warehouseStock, customerStock, loading: inventoryLoading } = useInventory();
    const { data: warehouses, loading: warehousesLoading } = useCollection('warehouses');
    const { data: customers, loading: customersLoading } = useCollection('customers');
    const { data: transfers, loading: transfersLoading } = useCollection('transfers');
    const { data: returns, loading: returnsLoading } = useCollection('returns');
    const { data: sales, loading: salesLoading } = useCollection('sales');
    const { data: purchases, loading: purchasesLoading } = useCollection('purchases');
    const { calculateGST } = useGST();

    const [rentalReportData, setRentalReportData] = useState([]);
    const [rentalReportTotal, setRentalReportTotal] = useState(0);
    const [rentalReportParams, setRentalReportParams] = useState(null);
    const [transactionDateRange, setTransactionDateRange] = useState(null);

    const loading = inventoryLoading || warehousesLoading || customersLoading || transfersLoading || returnsLoading || salesLoading || purchasesLoading;

    // Helper function to format currency
    const formatCurrency = (value) => {
        if (value === null || value === undefined) return '-';
        return `₹${Number(value).toFixed(2)}`;
    };

    // Helper function to get GST breakdown for a record
    const getGSTBreakdown = (record) => {
        if (record.gstBreakdown) {
            return record.gstBreakdown;
        }
        // For old records without gstBreakdown, try to calculate
        if (record.type === 'Purchase' && record.items) {
            const baseAmount = record.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
            const taxType = record.taxType || 'local';
            return calculateGST(baseAmount, taxType);
        }
        if (record.type === 'Sale' && record.items) {
            const baseAmount = record.items.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
            const taxType = record.taxType || 'local';
            return calculateGST(baseAmount, taxType);
        }
        return null;
    };

    // Helper function to calculate weighted average unit cost for a product
    const calculateAverageUnitCost = (productName) => {
        const productItems = purchases.flatMap(p => p.items || []).filter(item => item.product === productName);
        if (productItems.length === 0) return 0;

        const totalCost = productItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);
        const totalQuantity = productItems.reduce((sum, item) => sum + Number(item.quantity), 0);

        return totalQuantity > 0 ? totalCost / totalQuantity : 0;
    };

    // --- Inventory Reports Data ---
    const warehouseInventoryData = useMemo(() => {
        // Group by product across all warehouses
        const productGroups = {};

        for (const whName in warehouseStock) {
            for (const productName in warehouseStock[whName]) {
                const quantity = warehouseStock[whName][productName];
                if (quantity > 0) {
                    if (!productGroups[productName]) {
                        productGroups[productName] = 0;
                    }
                    productGroups[productName] += quantity;
                }
            }
        }

        // Create data array with value calculations
        const data = Object.keys(productGroups).map(productName => {
            const totalQuantity = productGroups[productName];
            const unitCost = calculateAverageUnitCost(productName);
            const totalValue = totalQuantity * unitCost;

            return {
                key: productName,
                product: productName,
                quantity: totalQuantity,
                unitCost: unitCost,
                totalValue: totalValue
            };
        });

        return data;
    }, [warehouseStock, purchases]);

    const customerInventoryData = useMemo(() => {
        // Group by product across all customers and sites
        const productGroups = {};

        for (const customerName in customerStock) {
            for (const siteName in customerStock[customerName]) {
                for (const productName in customerStock[customerName][siteName]) {
                    const quantity = customerStock[customerName][siteName][productName];
                    if (quantity > 0) {
                        if (!productGroups[productName]) {
                            productGroups[productName] = 0;
                        }
                        productGroups[productName] += quantity;
                    }
                }
            }
        }

        // Create data array with value calculations
        const data = Object.keys(productGroups).map(productName => {
            const totalQuantity = productGroups[productName];
            const unitCost = calculateAverageUnitCost(productName);
            const totalValue = totalQuantity * unitCost;

            return {
                key: productName,
                product: productName,
                quantity: totalQuantity,
                unitCost: unitCost,
                totalValue: totalValue
            };
        });

        return data;
    }, [customerStock, purchases]);

    const totalInventoryData = useMemo(() => {
        // Group by product across all locations (warehouses + customers)
        const productGroups = {};

        // Add warehouse inventory
        for (const whName in warehouseStock) {
            for (const productName in warehouseStock[whName]) {
                const quantity = warehouseStock[whName][productName];
                if (quantity > 0) {
                    if (!productGroups[productName]) {
                        productGroups[productName] = 0;
                    }
                    productGroups[productName] += quantity;
                }
            }
        }

        // Add customer inventory
        for (const customerName in customerStock) {
            for (const siteName in customerStock[customerName]) {
                for (const productName in customerStock[customerName][siteName]) {
                    const quantity = customerStock[customerName][siteName][productName];
                    if (quantity > 0) {
                        if (!productGroups[productName]) {
                            productGroups[productName] = 0;
                        }
                        productGroups[productName] += quantity;
                    }
                }
            }
        }

        // Create data array with value calculations
        const data = Object.keys(productGroups).map(productName => {
            const totalQuantity = productGroups[productName];
            const unitCost = calculateAverageUnitCost(productName);
            const totalValue = totalQuantity * unitCost;

            return {
                key: productName,
                product: productName,
                quantity: totalQuantity,
                unitCost: unitCost,
                totalValue: totalValue
            };
        });

        return data;
    }, [warehouseStock, customerStock, purchases]);

    // --- Rentals Reports Data ---
    const monthlyRentSummary = useMemo(() => {
        const summary = {};
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Build a map of returned quantities by customer/product with rental end dates
        const returnedQuantities = {}; // { customer: { product: { totalReturned, latestRentalEndDate } } }
        returns.forEach(r => {
            if (!returnedQuantities[r.customer]) returnedQuantities[r.customer] = {};

            const items = r.items || (r.product ? [{ product: r.product, quantity: r.quantity }] : []);
            items.forEach(item => {
                if (!returnedQuantities[r.customer][item.product]) {
                    returnedQuantities[r.customer][item.product] = { totalReturned: 0, latestRentalEndDate: null };
                }
                returnedQuantities[r.customer][item.product].totalReturned += Number(item.quantity);

                if (r.rentalEndDate) {
                    const currentEndDate = returnedQuantities[r.customer][item.product].latestRentalEndDate;
                    if (!currentEndDate || new Date(r.rentalEndDate) > new Date(currentEndDate)) {
                        returnedQuantities[r.customer][item.product].latestRentalEndDate = r.rentalEndDate;
                    }
                }
            });
        });

        // Calculate rental for all transfers
        transfers.filter(t => t.status === 'Rented').forEach(t => {
            const items = t.items || (t.product ? [{ product: t.product, quantity: t.quantity, perDayRent: t.perDayRent }] : []);

            items.forEach(item => {
                const transferredQty = Number(item.quantity);
                const returnedQty = returnedQuantities[t.customer]?.[item.product]?.totalReturned || 0;
                const rentalEndDate = returnedQuantities[t.customer]?.[item.product]?.latestRentalEndDate;

                let itemRental = 0;

                // Calculate rental for returned portion
                if (returnedQty > 0 && rentalEndDate) {
                    const rentalStartDate = new Date(t.rentalStartDate);
                    const endDate = new Date(rentalEndDate);

                    const effectiveStartDate = rentalStartDate > startOfMonth ? rentalStartDate : startOfMonth;
                    const effectiveEndDate = endDate < endOfMonth ? endDate : endOfMonth;

                    if (effectiveStartDate <= effectiveEndDate && effectiveEndDate >= startOfMonth) {
                        const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        itemRental += returnedQty * Number(item.perDayRent || 0) * days;
                    }
                }

                // Calculate rental for still-on-rent portion
                const stillOnRent = transferredQty - returnedQty;
                if (stillOnRent > 0) {
                    const rentalStartDate = new Date(t.rentalStartDate);

                    const effectiveStartDate = rentalStartDate > startOfMonth ? rentalStartDate : startOfMonth;
                    const effectiveEndDate = now < endOfMonth ? now : endOfMonth;

                    if (effectiveStartDate <= effectiveEndDate) {
                        const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        itemRental += stillOnRent * Number(item.perDayRent || 0) * days;
                    }
                }

                if (itemRental > 0) {
                    const key = `${t.customer}-${t.site}`;
                    if (!summary[key]) {
                        summary[key] = { clientName: t.customer, siteName: t.site, rentalValue: 0 };
                    }
                    summary[key].rentalValue += itemRental;
                }
            });
        });
        return Object.values(summary).filter(s => s.rentalValue > 0);
    }, [transfers, returns]);

    const handleGenerateRentalReport = (values) => {
        const { clientName, siteName, dateRange } = values;
        if (!clientName || !dateRange) {
            message.error("Please select a client and a date range.");
            return;
        }

        const [start, end] = dateRange;
        const periodStartDate = start.startOf('day').toDate();
        const periodEndDate = end.endOf('day').toDate();

        // Build a map of returned quantities by customer/product with rental end dates
        const returnedQuantities = {}; // { product: { totalReturned, latestRentalEndDate } }
        returns.filter(r => r.customer === clientName).forEach(r => {
            const items = r.items || (r.product ? [{ product: r.product, quantity: r.quantity }] : []);
            items.forEach(item => {
                if (!returnedQuantities[item.product]) {
                    returnedQuantities[item.product] = { totalReturned: 0, latestRentalEndDate: null };
                }
                returnedQuantities[item.product].totalReturned += Number(item.quantity);

                if (r.rentalEndDate) {
                    const currentEndDate = returnedQuantities[item.product].latestRentalEndDate;
                    if (!currentEndDate || new Date(r.rentalEndDate) > new Date(currentEndDate)) {
                        returnedQuantities[item.product].latestRentalEndDate = r.rentalEndDate;
                    }
                }
            });
        });

        const clientTransfers = transfers.filter(t =>
            t.customer === clientName &&
            (!siteName || t.site === siteName)
        );

        // Collect all items with their billing details
        const itemsWithDetails = [];
        clientTransfers.forEach((t) => {
            const items = t.items || (t.product ? [{ product: t.product, quantity: t.quantity, perDayRent: t.perDayRent }] : []);

            items.forEach((item) => {
                const transferredQty = Number(item.quantity);
                const returnedQty = returnedQuantities[item.product]?.totalReturned || 0;
                const rentalEndDate = returnedQuantities[item.product]?.latestRentalEndDate;

                // Calculate rental for returned portion
                if (returnedQty > 0 && rentalEndDate) {
                    const rentalStartDate = new Date(t.rentalStartDate);
                    const endDate = new Date(rentalEndDate);

                    const effectiveStartDate = rentalStartDate > periodStartDate ? rentalStartDate : periodStartDate;
                    const effectiveEndDate = endDate < periodEndDate ? endDate : periodEndDate;

                    if (effectiveStartDate <= effectiveEndDate) {
                        const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        itemsWithDetails.push({
                            product: item.product,
                            quantity: returnedQty,
                            ratePerDay: Number(item.perDayRent),
                            days: diffDays
                        });
                    }
                }

                // Calculate rental for still-on-rent portion
                const stillOnRent = transferredQty - returnedQty;
                if (stillOnRent > 0) {
                    const rentalStartDate = new Date(t.rentalStartDate);

                    const effectiveStartDate = rentalStartDate > periodStartDate ? rentalStartDate : periodStartDate;
                    const effectiveEndDate = periodEndDate;

                    if (effectiveStartDate <= effectiveEndDate) {
                        const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        itemsWithDetails.push({
                            product: item.product,
                            quantity: stillOnRent,
                            ratePerDay: Number(item.perDayRent),
                            days: diffDays
                        });
                    }
                }
            });
        });

        // Group by product, ratePerDay, and days
        const groupedItems = {};
        itemsWithDetails.forEach(item => {
            // Create unique key based on product, rate per day, and number of days
            const groupKey = `${item.product}|||${item.ratePerDay}|||${item.days}`;

            if (!groupedItems[groupKey]) {
                groupedItems[groupKey] = {
                    product: item.product,
                    quantity: 0,
                    ratePerDay: item.ratePerDay,
                    days: item.days
                };
            }

            // Sum up quantities for items with same product, rate, and days
            groupedItems[groupKey].quantity += item.quantity;
        });

        // Convert grouped items to report format
        let totalValue = 0;
        const report = Object.values(groupedItems).map((item, index) => {
            const rowTotal = item.days * item.quantity * item.ratePerDay;
            totalValue += rowTotal;

            return {
                key: `${index}`,
                product: item.product,
                quantity: item.quantity,
                ratePerDay: item.ratePerDay,
                days: item.days,
                total: rowTotal.toFixed(2)
            };
        });

        // Sort by product name, then by days (for same products with different periods)
        report.sort((a, b) => {
            if (a.product !== b.product) {
                return a.product.localeCompare(b.product);
            }
            return a.days - b.days;
        });

        setRentalReportData(report);
        setRentalReportTotal(totalValue);
        setRentalReportParams(values);
    };

    // --- Overall Transactions Data ---
    const filteredTransactions = useMemo(() => {
        if (!transactionDateRange) return [];
        const [start, end] = transactionDateRange;
        const startDate = start.startOf('day').toDate();
        const endDate = end.endOf('day').toDate();

        const all = [
            ...purchases.map(p => ({...p, type: 'Purchase', date: new Date(p.purchaseDate), reference: p.invoiceNumber, description: `Purchase to ${p.warehouse}`, from: 'Supplier', to: p.warehouse})),
            ...transfers.map(t => ({...t, type: 'Transfer', date: new Date(t.transferDate), reference: t.dcNumber, description: `${t.product} (${t.quantity})`, from: t.from, to: `${t.customer} (${t.site})`})),
            ...returns.map(r => ({...r, type: 'Return', date: new Date(r.returnDate), reference: r.dcNumber, description: `${r.product} (${r.quantity})`, from: r.customer, to: r.returnTo})),
            ...sales.map(s => ({...s, type: 'Sale', date: new Date(s.invoiceDate), reference: s.invoiceNumber, description: `Sale from ${s.fromWarehouse || s.fromCustomer}`, from: s.fromWarehouse || s.fromCustomer, to: 'Sold'}))
        ];

        return all.filter(t => t.date >= startDate && t.date <= endDate).sort((a,b) => b.date - a.date);
    }, [transactionDateRange, transfers, returns, sales, purchases]);

    const exportToCSV = (data, filename) => {
        if (!data || data.length === 0) {
            message.warn('No data to export.');
            return;
        }

        // Special handling for transactions export with GST columns
        if (filename === 'transactions_report') {
            const headers = ['Date', 'Type', 'Reference', 'Description', 'Base Amount (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total GST (₹)', 'Total Amount (₹)'];
            const csvRows = data.map(row => {
                const gst = getGSTBreakdown(row);
                return [
                    new Date(row.date).toLocaleString(),
                    row.type,
                    row.reference || 'N/A',
                    row.description || 'N/A',
                    gst ? gst.baseAmount.toFixed(2) : '0.00',
                    gst ? gst.cgst.toFixed(2) : '0.00',
                    gst ? gst.sgst.toFixed(2) : '0.00',
                    gst ? gst.igst.toFixed(2) : '0.00',
                    gst ? gst.totalGST.toFixed(2) : '0.00',
                    gst ? gst.totalAmount.toFixed(2) : '0.00'
                ].map(field => JSON.stringify(field)).join(',');
            });
            const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...csvRows].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `${filename}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

        // Default CSV export for other reports
        const headers = Object.keys(data[0]);
        const csvContent = "data:text/csv;charset=utf-8,"
            + [
                headers.join(','),
                ...data.map(row => headers.map(header => JSON.stringify(row[header])).join(','))
            ].join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${filename}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Tabs defaultActiveKey="1">
            <Tabs.TabPane tab="Inventory" key="1">
                <Card title="Total Inventory" style={{ marginBottom: 24 }} extra={<Button icon={<FileExcelOutlined />} onClick={() => exportToCSV(totalInventoryData, 'total_inventory')}>Export CSV</Button>}>
                    <Table dataSource={totalInventoryData} columns={[
                        { title: 'Sr. No.', key: 'index', render: (text, record, index) => index + 1 },
                        { title: 'Product', dataIndex: 'product', key: 'product' },
                        { title: 'Total Quantity', dataIndex: 'quantity', key: 'quantity' },
                        { title: 'Unit Cost', dataIndex: 'unitCost', key: 'unitCost', render: (val) => formatCurrency(val), align: 'right' },
                        { title: 'Total Value', dataIndex: 'totalValue', key: 'totalValue', render: (val) => formatCurrency(val), align: 'right' },
                    ]} loading={loading} rowKey="key" pagination={false}
                    summary={pageData => {
                        const totalValue = pageData.reduce((sum, item) => sum + item.totalValue, 0);
                        return (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={4}><b>Total Inventory Value</b></Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right"><b>{formatCurrency(totalValue)}</b></Table.Summary.Cell>
                            </Table.Summary.Row>
                        );
                    }} />
                </Card>
                <Card title="Warehouse Inventory" style={{ marginBottom: 24 }} extra={<Button icon={<FileExcelOutlined />} onClick={() => exportToCSV(warehouseInventoryData, 'warehouse_inventory')}>Export CSV</Button>}>
                    <Table dataSource={warehouseInventoryData} columns={[
                        { title: 'Sr. No.', key: 'index', render: (text, record, index) => index + 1 },
                        { title: 'Product', dataIndex: 'product', key: 'product' },
                        { title: 'Total Quantity', dataIndex: 'quantity', key: 'quantity' },
                        { title: 'Unit Cost', dataIndex: 'unitCost', key: 'unitCost', render: (val) => formatCurrency(val), align: 'right' },
                        { title: 'Total Value', dataIndex: 'totalValue', key: 'totalValue', render: (val) => formatCurrency(val), align: 'right' },
                    ]} loading={loading} rowKey="key" pagination={false}
                    summary={pageData => {
                        const totalValue = pageData.reduce((sum, item) => sum + item.totalValue, 0);
                        return (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={4}><b>Total Inventory Value</b></Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right"><b>{formatCurrency(totalValue)}</b></Table.Summary.Cell>
                            </Table.Summary.Row>
                        );
                    }} />
                </Card>
                <Card title="Inventory with Customers" extra={<Button icon={<FileExcelOutlined />} onClick={() => exportToCSV(customerInventoryData, 'customer_inventory')}>Export CSV</Button>}>
                    <Table dataSource={customerInventoryData} columns={[
                        { title: 'Sr. No.', key: 'index', render: (text, record, index) => index + 1 },
                        { title: 'Product', dataIndex: 'product', key: 'product' },
                        { title: 'Total Quantity', dataIndex: 'quantity', key: 'quantity' },
                        { title: 'Unit Cost', dataIndex: 'unitCost', key: 'unitCost', render: (val) => formatCurrency(val), align: 'right' },
                        { title: 'Total Value', dataIndex: 'totalValue', key: 'totalValue', render: (val) => formatCurrency(val), align: 'right' },
                    ]} loading={loading} rowKey="key" pagination={false}
                    summary={pageData => {
                        const totalValue = pageData.reduce((sum, item) => sum + item.totalValue, 0);
                        return (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={4}><b>Total Inventory Value</b></Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right"><b>{formatCurrency(totalValue)}</b></Table.Summary.Cell>
                            </Table.Summary.Row>
                        );
                    }} />
                </Card>
            </Tabs.TabPane>
            <Tabs.TabPane tab="Rentals" key="2">
                <Card title="Current Month Rental Summary" style={{ marginBottom: 24 }}>
                    <Table dataSource={monthlyRentSummary} columns={[
                        { title: 'Sr. No.', key: 'index', render: (text, record, index) => index + 1 },
                        { title: 'Client Name', dataIndex: 'clientName', key: 'clientName' },
                        { title: 'Site Name', dataIndex: 'siteName', key: 'siteName' },
                        { title: 'Rental Value (INR)', dataIndex: 'rentalValue', key: 'rentalValue', render: val => val.toFixed(2) },
                    ]} loading={loading} rowKey={r => `${r.clientName}-${r.siteName}`} pagination={false}
                    summary={pageData => {
                        const total = pageData.reduce((acc, curr) => acc + curr.rentalValue, 0);
                        return <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={3}><b>Total</b></Table.Summary.Cell><Table.Summary.Cell index={1}><b>{total.toFixed(2)}</b></Table.Summary.Cell></Table.Summary.Row>
                    }}
                    />
                </Card>
                <Card title="Generate Detailed Rental Report">
                    <RentalReportGenerator customers={customers} onFinish={handleGenerateRentalReport} />
                    {rentalReportData.length > 0 && (
                        <Card title={`Report for ${rentalReportParams.clientName}`} style={{marginTop: 24}} extra={<Button icon={<FileExcelOutlined />} onClick={() => exportToCSV(rentalReportData, `rental_report_${rentalReportParams.clientName}`)}>Export CSV</Button>}>
                             <Table dataSource={rentalReportData} columns={[
                                { title: 'Sr. No.', key: 'index', render: (text, record, index) => index + 1 },
                                { title: 'Product', dataIndex: 'product', key: 'product' },
                                { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
                                { title: 'Rate/Day', dataIndex: 'ratePerDay', key: 'ratePerDay' },
                                { title: 'No. of Days', dataIndex: 'days', key: 'days' },
                                { title: 'Total (INR)', dataIndex: 'total', key: 'total' },
                             ]} pagination={false}
                             summary={() => (
                                 <Table.Summary.Row>
                                     <Table.Summary.Cell index={0} colSpan={5}><b>Grand Total</b></Table.Summary.Cell>
                                     <Table.Summary.Cell index={1}><b>{rentalReportTotal.toFixed(2)}</b></Table.Summary.Cell>
                                 </Table.Summary.Row>
                             )}
                             />
                        </Card>
                    )}
                </Card>
            </Tabs.TabPane>
            <Tabs.TabPane tab="Overall Transactions" key="3">
                 <Card title="Filter Transactions" extra={<Button icon={<FileExcelOutlined />} onClick={() => exportToCSV(filteredTransactions, 'transactions_report')}>Export CSV</Button>}>
                     <Space>
                        <DatePicker.RangePicker onChange={(dates) => setTransactionDateRange(dates)} />
                     </Space>
                     <Table
                        dataSource={filteredTransactions}
                        columns={[
                            { title: 'Sr. No.', key: 'index', render: (text, record, index) => index + 1, width: 70 },
                            { title: 'Date', dataIndex: 'date', key: 'date', render: (date) => formatDate(date), width: 150 },
                            { title: 'Type', dataIndex: 'type', key: 'type', width: 100 },
                            { title: 'Reference', key: 'reference', render: (_, rec) => rec.reference || 'N/A', width: 120 },
                            { title: 'Description', key: 'description', render: (_, rec) => rec.description || 'N/A', width: 200 },
                            {
                                title: 'Base Amount (₹)',
                                key: 'baseAmount',
                                render: (_, rec) => {
                                    const gst = getGSTBreakdown(rec);
                                    return gst ? formatCurrency(gst.baseAmount) : '-';
                                },
                                width: 120,
                                align: 'right'
                            },
                            {
                                title: 'CGST (₹)',
                                key: 'cgst',
                                render: (_, rec) => {
                                    const gst = getGSTBreakdown(rec);
                                    return gst ? formatCurrency(gst.cgst) : '-';
                                },
                                width: 100,
                                align: 'right'
                            },
                            {
                                title: 'SGST (₹)',
                                key: 'sgst',
                                render: (_, rec) => {
                                    const gst = getGSTBreakdown(rec);
                                    return gst ? formatCurrency(gst.sgst) : '-';
                                },
                                width: 100,
                                align: 'right'
                            },
                            {
                                title: 'IGST (₹)',
                                key: 'igst',
                                render: (_, rec) => {
                                    const gst = getGSTBreakdown(rec);
                                    return gst ? formatCurrency(gst.igst) : '-';
                                },
                                width: 100,
                                align: 'right'
                            },
                            {
                                title: 'Total GST (₹)',
                                key: 'totalGST',
                                render: (_, rec) => {
                                    const gst = getGSTBreakdown(rec);
                                    return gst ? formatCurrency(gst.totalGST) : '-';
                                },
                                width: 120,
                                align: 'right'
                            },
                            {
                                title: 'Total Amount (₹)',
                                key: 'totalAmount',
                                render: (_, rec) => {
                                    const gst = getGSTBreakdown(rec);
                                    return gst ? formatCurrency(gst.totalAmount) : '-';
                                },
                                width: 130,
                                align: 'right'
                            },
                        ]}
                        loading={loading}
                        rowKey={r => r.id + r.type}
                        style={{marginTop: 24}}
                        scroll={{ x: 1600 }}
                     />
                 </Card>
            </Tabs.TabPane>
        </Tabs>
    );
};

export default ReportsPage;
