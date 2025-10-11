import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { useCollection } from '../hooks/useCollection';
import { useInventory } from '../hooks/useInventory';

const Dashboard = () => {
    const { warehouseStock, customerStock, loading: inventoryLoading } = useInventory();
    const { data: purchases, loading: loadingPurchases } = useCollection('purchases');
    const { data: transfers, loading: loadingTransfers } = useCollection('transfers');
    const { data: rentalOrders, loading: loadingOrders } = useCollection('rentalOrders');
    const { data: returns, loading: loadingReturns } = useCollection('returns');

    const loading = loadingPurchases || loadingTransfers || loadingOrders || inventoryLoading || loadingReturns;

    const {
        totalInventoryValue,
        valueWithCustomers,
        valueInWarehouse,
        monthlyRentalValue,
        pendingOrders
    } = React.useMemo(() => {
        if (loading) return {
            totalInventoryValue: 0,
            valueWithCustomers: 0,
            valueInWarehouse: 0,
            monthlyRentalValue: 0,
            pendingOrders: 0
        };

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

        // Calculate average unit cost for each product based on purchases
        const avgProductPrice = {};
        const productPricing = {};

        purchases.forEach(purchase => {
            (purchase.items || []).forEach(item => {
                if (!productPricing[item.product]) {
                    productPricing[item.product] = { totalCost: 0, totalQuantity: 0 };
                }
                productPricing[item.product].totalCost += (Number(item.quantity || 0) * Number(item.unitPrice || 0));
                productPricing[item.product].totalQuantity += Number(item.quantity || 0);
            });
        });

        for (const productName in productPricing) {
            const { totalCost, totalQuantity } = productPricing[productName];
            avgProductPrice[productName] = totalQuantity > 0 ? totalCost / totalQuantity : 0;
        }

        // Calculate warehouse inventory value using actual warehouse stock
        let warehouseValue = 0;
        for (const warehouse in warehouseStock) {
            for (const product in warehouseStock[warehouse]) {
                const quantity = warehouseStock[warehouse][product];
                const unitCost = avgProductPrice[product] || 0;
                warehouseValue += quantity * unitCost;
            }
        }

        // Calculate customer inventory value using actual customer stock
        let customerValue = 0;
        for (const customer in customerStock) {
            for (const site in customerStock[customer]) {
                for (const product in customerStock[customer][site]) {
                    const quantity = customerStock[customer][site][product];
                    const unitCost = avgProductPrice[product] || 0;
                    customerValue += quantity * unitCost;
                }
            }
        }

        // Total inventory value is warehouse + customer
        const totalValue = warehouseValue + customerValue;

        // Calculate monthly rental value
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

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

        // Calculate rental for all transfers using FIFO allocation
        let monthlyValue = 0;

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

                    // Calculate rental for returned portion (if any)
                    if (returnedFromThisTransfer > 0 && latestRentalEndDate) {
                        const effectiveStartDate = transfer.rentalStartDate > startOfMonth ? transfer.rentalStartDate : startOfMonth;
                        const effectiveEndDate = latestRentalEndDate < endOfMonth ? latestRentalEndDate : endOfMonth;

                        if (effectiveStartDate <= effectiveEndDate && effectiveEndDate >= startOfMonth) {
                            const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            monthlyValue += returnedFromThisTransfer * transfer.perDayRent * days;
                        }
                    }

                    // Calculate rental for still-on-rent portion (estimate for full month)
                    if (stillOnRent > 0) {
                        const effectiveStartDate = transfer.rentalStartDate > startOfMonth ? transfer.rentalStartDate : startOfMonth;
                        const effectiveEndDate = endOfMonth; // Estimate for full month

                        if (effectiveStartDate <= effectiveEndDate) {
                            const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            monthlyValue += stillOnRent * transfer.perDayRent * days;
                        }
                    }
                });
            }
        }

        const pendingOrderCount = rentalOrders.filter(order => {
            const totalOrdered = order.items.reduce((sum, item) => sum + Number(item.quantity), 0);
            const totalDelivered = order.items.reduce((sum, item) => sum + Number(item.deliveredQuantity || 0), 0);
            return totalDelivered < totalOrdered;
        }).length;

        return {
            totalInventoryValue: totalValue,
            valueWithCustomers: customerValue,
            valueInWarehouse: warehouseValue,
            monthlyRentalValue: monthlyValue,
            pendingOrders: pendingOrderCount
        };
    }, [purchases, transfers, rentalOrders, returns, warehouseStock, customerStock, loading]);

    const formatCurrency = (value) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

    return (
        <div>
            <h1>Dashboard</h1>
            <Row gutter={[16, 16]}>
                 <Col xs={24} sm={12} md={8}>
                    <Card style={{ height: '100%' }}>
                        <Statistic title="Pending Rental Orders" value={pendingOrders} loading={loading} />
                    </Card>
                </Col>
                 <Col xs={24} sm={12} md={8}>
                    <Card style={{ height: '100%' }}>
                        <Statistic
                            title="Est. Current Month Rental"
                            value={formatCurrency(monthlyRentalValue)}
                            loading={loading}
                        />
                    </Card>
                </Col>
            </Row>
            <h2 style={{marginTop: '32px'}}>Inventory Value</h2>
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                    <Card style={{ height: '100%' }}>
                        <Statistic
                            title="Total Overall Inventory Value"
                            value={formatCurrency(totalInventoryValue)}
                            loading={loading}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={8}>
                    <Card style={{ height: '100%' }}>
                        <Statistic
                            title="Inventory Value with Customers"
                            value={formatCurrency(valueWithCustomers)}
                            loading={loading}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={8}>
                    <Card style={{ height: '100%' }}>
                        <Statistic
                            title="Inventory Value at Warehouse"
                            value={formatCurrency(valueInWarehouse)}
                            loading={loading}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Dashboard;
