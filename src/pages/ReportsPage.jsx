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
    const { data: rentalOrders, loading: rentalOrdersLoading } = useCollection('rentalOrders');
    const { calculateGST } = useGST();

    const [rentalReportData, setRentalReportData] = useState([]);
    const [rentalReportTotal, setRentalReportTotal] = useState(0);
    const [rentalReportParams, setRentalReportParams] = useState(null);
    const [transactionDateRange, setTransactionDateRange] = useState(null);

    const loading = inventoryLoading || warehousesLoading || customersLoading || transfersLoading || returnsLoading || salesLoading || purchasesLoading || rentalOrdersLoading;

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

        // Build a map of rental rates from rental orders for fallback
        const rentalRatesByCustomerProduct = {};
        rentalOrders.forEach(order => {
            const key = `${order.customerName}-${order.siteName}`;
            if (!rentalRatesByCustomerProduct[key]) {
                rentalRatesByCustomerProduct[key] = {};
            }
            (order.items || []).forEach(item => {
                if (item.perDayRent && !rentalRatesByCustomerProduct[key][item.product]) {
                    rentalRatesByCustomerProduct[key][item.product] = item.perDayRent;
                }
            });
        });

        // Build a map of returned quantities by customer/product with rental end dates
        const returnsByCustomerProduct = {}; // { customer: { product: [{ quantity, rentalEndDate, returnDate }, ...] } }
        returns.forEach(r => {
            if (!returnsByCustomerProduct[r.customer]) returnsByCustomerProduct[r.customer] = {};

            const items = r.items || (r.product ? [{ product: r.product, quantity: r.quantity }] : []);
            items.forEach(item => {
                if (!returnsByCustomerProduct[r.customer][item.product]) {
                    returnsByCustomerProduct[r.customer][item.product] = [];
                }
                returnsByCustomerProduct[r.customer][item.product].push({
                    quantity: Number(item.quantity),
                    rentalEndDate: r.rentalEndDate ? new Date(r.rentalEndDate) : null,
                    returnDate: new Date(r.returnDate)
                });
            });
        });

        // Sort returns by date (earliest first) for FIFO allocation
        for (const customer in returnsByCustomerProduct) {
            for (const product in returnsByCustomerProduct[customer]) {
                returnsByCustomerProduct[customer][product].sort((a, b) => a.returnDate - b.returnDate);
            }
        }

        // Group transfers by customer+product and sort by date (FIFO)
        const transfersByCustomerProduct = {};
        transfers.filter(t => t.status === 'Rented').forEach(t => {
            if (!transfersByCustomerProduct[t.customer]) transfersByCustomerProduct[t.customer] = {};

            const items = t.items || (t.product ? [{ product: t.product, quantity: t.quantity, perDayRent: t.perDayRent }] : []);
            items.forEach(item => {
                if (!transfersByCustomerProduct[t.customer][item.product]) {
                    transfersByCustomerProduct[t.customer][item.product] = [];
                }

                // Get perDayRent with fallback to rental order rates
                let perDayRent = Number(item.perDayRent || 0);
                if (perDayRent === 0) {
                    const orderKey = `${t.customer}-${t.site}`;
                    perDayRent = Number(rentalRatesByCustomerProduct[orderKey]?.[item.product] || 0);
                    if (perDayRent === 0) {
                        console.warn(`Missing perDayRent for ${item.product} in transfer to ${t.customer}/${t.site}`);
                    }
                }

                transfersByCustomerProduct[t.customer][item.product].push({
                    customer: t.customer,
                    site: t.site,
                    quantity: Number(item.quantity),
                    perDayRent: perDayRent,
                    rentalStartDate: new Date(t.rentalStartDate)
                });
            });
        });

        // Sort transfers by rental start date (FIFO)
        for (const customer in transfersByCustomerProduct) {
            for (const product in transfersByCustomerProduct[customer]) {
                transfersByCustomerProduct[customer][product].sort((a, b) => a.rentalStartDate - b.rentalStartDate);
            }
        }

        // Calculate rental for each customer+product combination
        for (const customer in transfersByCustomerProduct) {
            for (const product in transfersByCustomerProduct[customer]) {
                const transferList = transfersByCustomerProduct[customer][product];
                const returnList = returnsByCustomerProduct[customer]?.[product] || [];

                let totalReturnedQty = 0;
                let latestRentalEndDate = null;

                // Calculate total returns and latest rental end date
                returnList.forEach(ret => {
                    totalReturnedQty += ret.quantity;
                    if (ret.rentalEndDate && (!latestRentalEndDate || ret.rentalEndDate > latestRentalEndDate)) {
                        latestRentalEndDate = ret.rentalEndDate;
                    }
                });

                // Allocate returns to transfers using FIFO
                let remainingReturns = totalReturnedQty;

                transferList.forEach(transfer => {
                    let returnedFromThisTransfer = 0;
                    let stillOnRent = transfer.quantity;

                    if (remainingReturns > 0) {
                        returnedFromThisTransfer = Math.min(remainingReturns, transfer.quantity);
                        stillOnRent = transfer.quantity - returnedFromThisTransfer;
                        remainingReturns -= returnedFromThisTransfer;
                    }

                    let itemRental = 0;

                    // Calculate rental for returned portion
                    if (returnedFromThisTransfer > 0 && latestRentalEndDate) {
                        const effectiveStartDate = transfer.rentalStartDate > startOfMonth ? transfer.rentalStartDate : startOfMonth;
                        const effectiveEndDate = latestRentalEndDate < endOfMonth ? latestRentalEndDate : endOfMonth;

                        if (effectiveStartDate <= effectiveEndDate && effectiveEndDate >= startOfMonth) {
                            const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            itemRental += returnedFromThisTransfer * transfer.perDayRent * days;
                        }
                    }

                    // Calculate rental for still-on-rent portion (estimate for full month)
                    if (stillOnRent > 0) {
                        const effectiveStartDate = transfer.rentalStartDate > startOfMonth ? transfer.rentalStartDate : startOfMonth;
                        const effectiveEndDate = endOfMonth; // Estimate for full month

                        if (effectiveStartDate <= effectiveEndDate) {
                            const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            itemRental += stillOnRent * transfer.perDayRent * days;
                        }
                    }

                    if (itemRental > 0) {
                        const key = `${transfer.customer}-${transfer.site}`;
                        if (!summary[key]) {
                            summary[key] = { clientName: transfer.customer, siteName: transfer.site, rentalValue: 0 };
                        }
                        summary[key].rentalValue += itemRental;
                    }
                });
            }
        }

        return Object.values(summary).filter(s => s.rentalValue > 0);
    }, [transfers, returns, rentalOrders]);

    const handleGenerateRentalReport = (values) => {
        const { clientName, siteName, dateRange } = values;
        if (!clientName || !dateRange) {
            message.error("Please select a client and a date range.");
            return;
        }

        const [start, end] = dateRange;
        const periodStartDate = start.startOf('day').toDate();
        const periodEndDate = end.endOf('day').toDate();

        // Build a map of returns by product with rental end dates
        const returnsByProduct = {}; // { product: [{ quantity, rentalEndDate, returnDate }, ...] }
        returns.filter(r => r.customer === clientName).forEach(r => {
            const items = r.items || (r.product ? [{ product: r.product, quantity: r.quantity }] : []);
            items.forEach(item => {
                if (!returnsByProduct[item.product]) {
                    returnsByProduct[item.product] = [];
                }
                returnsByProduct[item.product].push({
                    quantity: Number(item.quantity),
                    rentalEndDate: r.rentalEndDate ? new Date(r.rentalEndDate) : null,
                    returnDate: new Date(r.returnDate)
                });
            });
        });

        // Sort returns by date (earliest first) for FIFO allocation
        for (const product in returnsByProduct) {
            returnsByProduct[product].sort((a, b) => a.returnDate - b.returnDate);
        }

        // Get and group client transfers by product, sorted by rental start date (FIFO)
        const transfersByProduct = {};
        transfers
            .filter(t => t.customer === clientName && (!siteName || t.site === siteName))
            .forEach(t => {
                const items = t.items || (t.product ? [{ product: t.product, quantity: t.quantity, perDayRent: t.perDayRent }] : []);
                items.forEach(item => {
                    if (!transfersByProduct[item.product]) {
                        transfersByProduct[item.product] = [];
                    }
                    transfersByProduct[item.product].push({
                        quantity: Number(item.quantity),
                        perDayRent: Number(item.perDayRent || 0),
                        rentalStartDate: new Date(t.rentalStartDate)
                    });
                });
            });

        // Sort transfers by rental start date (FIFO)
        for (const product in transfersByProduct) {
            transfersByProduct[product].sort((a, b) => a.rentalStartDate - b.rentalStartDate);
        }

        // Collect all items with their billing details using FIFO allocation
        const itemsWithDetails = [];

        for (const product in transfersByProduct) {
            const transferList = transfersByProduct[product];
            const returnList = returnsByProduct[product] || [];

            let totalReturnedQty = 0;
            let latestRentalEndDate = null;

            // Calculate total returns and latest rental end date
            returnList.forEach(ret => {
                totalReturnedQty += ret.quantity;
                if (ret.rentalEndDate && (!latestRentalEndDate || ret.rentalEndDate > latestRentalEndDate)) {
                    latestRentalEndDate = ret.rentalEndDate;
                }
            });

            // Allocate returns to transfers using FIFO
            let remainingReturns = totalReturnedQty;

            transferList.forEach(transfer => {
                let returnedFromThisTransfer = 0;
                let stillOnRent = transfer.quantity;

                if (remainingReturns > 0) {
                    returnedFromThisTransfer = Math.min(remainingReturns, transfer.quantity);
                    stillOnRent = transfer.quantity - returnedFromThisTransfer;
                    remainingReturns -= returnedFromThisTransfer;
                }

                // Calculate rental for returned portion
                if (returnedFromThisTransfer > 0 && latestRentalEndDate) {
                    const effectiveStartDate = transfer.rentalStartDate > periodStartDate ? transfer.rentalStartDate : periodStartDate;
                    const effectiveEndDate = latestRentalEndDate < periodEndDate ? latestRentalEndDate : periodEndDate;

                    if (effectiveStartDate <= effectiveEndDate) {
                        const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        itemsWithDetails.push({
                            product: product,
                            quantity: returnedFromThisTransfer,
                            ratePerDay: transfer.perDayRent,
                            days: diffDays
                        });
                    }
                }

                // Calculate rental for still-on-rent portion
                if (stillOnRent > 0) {
                    const effectiveStartDate = transfer.rentalStartDate > periodStartDate ? transfer.rentalStartDate : periodStartDate;
                    const effectiveEndDate = periodEndDate;

                    if (effectiveStartDate <= effectiveEndDate) {
                        const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        itemsWithDetails.push({
                            product: product,
                            quantity: stillOnRent,
                            ratePerDay: transfer.perDayRent,
                            days: diffDays
                        });
                    }
                }
            });
        }

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
                        {
                            title: 'Product',
                            dataIndex: 'product',
                            key: 'product',
                            sorter: (a, b) => a.product.localeCompare(b.product),
                            filters: [...new Set(totalInventoryData.map(item => item.product))].map(p => ({ text: p, value: p })),
                            onFilter: (value, record) => record.product === value,
                        },
                        {
                            title: 'Total Quantity',
                            dataIndex: 'quantity',
                            key: 'quantity',
                            sorter: (a, b) => a.quantity - b.quantity,
                        },
                        {
                            title: 'Unit Cost',
                            dataIndex: 'unitCost',
                            key: 'unitCost',
                            render: (val) => formatCurrency(val),
                            align: 'right',
                            sorter: (a, b) => a.unitCost - b.unitCost,
                        },
                        {
                            title: 'Total Value',
                            dataIndex: 'totalValue',
                            key: 'totalValue',
                            render: (val) => formatCurrency(val),
                            align: 'right',
                            sorter: (a, b) => a.totalValue - b.totalValue,
                        },
                    ]} loading={loading} rowKey="key" pagination={{ pageSize: 10 }}
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
                        {
                            title: 'Product',
                            dataIndex: 'product',
                            key: 'product',
                            sorter: (a, b) => a.product.localeCompare(b.product),
                            filters: [...new Set(warehouseInventoryData.map(item => item.product))].map(p => ({ text: p, value: p })),
                            onFilter: (value, record) => record.product === value,
                        },
                        {
                            title: 'Total Quantity',
                            dataIndex: 'quantity',
                            key: 'quantity',
                            sorter: (a, b) => a.quantity - b.quantity,
                        },
                        {
                            title: 'Unit Cost',
                            dataIndex: 'unitCost',
                            key: 'unitCost',
                            render: (val) => formatCurrency(val),
                            align: 'right',
                            sorter: (a, b) => a.unitCost - b.unitCost,
                        },
                        {
                            title: 'Total Value',
                            dataIndex: 'totalValue',
                            key: 'totalValue',
                            render: (val) => formatCurrency(val),
                            align: 'right',
                            sorter: (a, b) => a.totalValue - b.totalValue,
                        },
                    ]} loading={loading} rowKey="key" pagination={{ pageSize: 10 }}
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
                        {
                            title: 'Product',
                            dataIndex: 'product',
                            key: 'product',
                            sorter: (a, b) => a.product.localeCompare(b.product),
                            filters: [...new Set(customerInventoryData.map(item => item.product))].map(p => ({ text: p, value: p })),
                            onFilter: (value, record) => record.product === value,
                        },
                        {
                            title: 'Total Quantity',
                            dataIndex: 'quantity',
                            key: 'quantity',
                            sorter: (a, b) => a.quantity - b.quantity,
                        },
                        {
                            title: 'Unit Cost',
                            dataIndex: 'unitCost',
                            key: 'unitCost',
                            render: (val) => formatCurrency(val),
                            align: 'right',
                            sorter: (a, b) => a.unitCost - b.unitCost,
                        },
                        {
                            title: 'Total Value',
                            dataIndex: 'totalValue',
                            key: 'totalValue',
                            render: (val) => formatCurrency(val),
                            align: 'right',
                            sorter: (a, b) => a.totalValue - b.totalValue,
                        },
                    ]} loading={loading} rowKey="key" pagination={{ pageSize: 10 }}
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
                        {
                            title: 'Client Name',
                            dataIndex: 'clientName',
                            key: 'clientName',
                            sorter: (a, b) => a.clientName.localeCompare(b.clientName),
                            filters: [...new Set(monthlyRentSummary.map(item => item.clientName))].map(c => ({ text: c, value: c })),
                            onFilter: (value, record) => record.clientName === value,
                        },
                        {
                            title: 'Site Name',
                            dataIndex: 'siteName',
                            key: 'siteName',
                            sorter: (a, b) => a.siteName.localeCompare(b.siteName),
                            filters: [...new Set(monthlyRentSummary.map(item => item.siteName))].map(s => ({ text: s, value: s })),
                            onFilter: (value, record) => record.siteName === value,
                        },
                        {
                            title: 'Rental Value (INR)',
                            dataIndex: 'rentalValue',
                            key: 'rentalValue',
                            render: val => val.toFixed(2),
                            sorter: (a, b) => a.rentalValue - b.rentalValue,
                            align: 'right'
                        },
                    ]} loading={loading} rowKey={r => `${r.clientName}-${r.siteName}`} pagination={{ pageSize: 10 }}
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
                                {
                                    title: 'Product',
                                    dataIndex: 'product',
                                    key: 'product',
                                    sorter: (a, b) => a.product.localeCompare(b.product),
                                    filters: [...new Set(rentalReportData.map(item => item.product))].map(p => ({ text: p, value: p })),
                                    onFilter: (value, record) => record.product === value,
                                },
                                {
                                    title: 'Quantity',
                                    dataIndex: 'quantity',
                                    key: 'quantity',
                                    sorter: (a, b) => a.quantity - b.quantity,
                                },
                                {
                                    title: 'Rate/Day',
                                    dataIndex: 'ratePerDay',
                                    key: 'ratePerDay',
                                    sorter: (a, b) => a.ratePerDay - b.ratePerDay,
                                },
                                {
                                    title: 'No. of Days',
                                    dataIndex: 'days',
                                    key: 'days',
                                    sorter: (a, b) => a.days - b.days,
                                },
                                {
                                    title: 'Total (INR)',
                                    dataIndex: 'total',
                                    key: 'total',
                                    sorter: (a, b) => parseFloat(a.total) - parseFloat(b.total),
                                    align: 'right'
                                },
                             ]} pagination={{ pageSize: 10 }}
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
                            {
                                title: 'Date',
                                dataIndex: 'date',
                                key: 'date',
                                render: (date) => formatDate(date),
                                sorter: (a, b) => a.date - b.date,
                                width: 150
                            },
                            {
                                title: 'Type',
                                dataIndex: 'type',
                                key: 'type',
                                filters: [...new Set(filteredTransactions.map(item => item.type))].map(t => ({ text: t, value: t })),
                                onFilter: (value, record) => record.type === value,
                                width: 100
                            },
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
                        pagination={{ pageSize: 20 }}
                     />
                 </Card>
            </Tabs.TabPane>
        </Tabs>
    );
};

export default ReportsPage;
