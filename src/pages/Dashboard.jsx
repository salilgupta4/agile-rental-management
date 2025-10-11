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
        const returnedQuantities = {}; // { customer: { product: { totalReturned, latestRentalEndDate } } }
        returns.forEach(r => {
            if (!returnedQuantities[r.customer]) returnedQuantities[r.customer] = {};

            const items = r.items || (r.product ? [{ product: r.product, quantity: r.quantity }] : []);
            items.forEach(item => {
                if (!returnedQuantities[r.customer][item.product]) {
                    returnedQuantities[r.customer][item.product] = { totalReturned: 0, latestRentalEndDate: null };
                }
                returnedQuantities[r.customer][item.product].totalReturned += Number(item.quantity);

                // Keep the latest rental end date for this product
                if (r.rentalEndDate) {
                    const currentEndDate = returnedQuantities[r.customer][item.product].latestRentalEndDate;
                    if (!currentEndDate || new Date(r.rentalEndDate) > new Date(currentEndDate)) {
                        returnedQuantities[r.customer][item.product].latestRentalEndDate = r.rentalEndDate;
                    }
                }
            });
        });

        // Calculate rental for all transfers
        let monthlyValue = 0;

        transfers.filter(t => t.status === 'Rented').forEach(t => {
            const items = t.items || (t.product ? [{ product: t.product, quantity: t.quantity, perDayRent: t.perDayRent }] : []);

            items.forEach(item => {
                const transferredQty = Number(item.quantity);
                const returnedQty = returnedQuantities[t.customer]?.[item.product]?.totalReturned || 0;
                const rentalEndDate = returnedQuantities[t.customer]?.[item.product]?.latestRentalEndDate;

                // Calculate rental for returned portion (if any)
                if (returnedQty > 0 && rentalEndDate) {
                    const rentalStartDate = new Date(t.rentalStartDate);
                    const endDate = new Date(rentalEndDate);

                    const effectiveStartDate = rentalStartDate > startOfMonth ? rentalStartDate : startOfMonth;
                    const effectiveEndDate = endDate < endOfMonth ? endDate : endOfMonth;

                    if (effectiveStartDate <= effectiveEndDate && effectiveEndDate >= startOfMonth) {
                        const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        monthlyValue += returnedQty * Number(item.perDayRent || 0) * days;
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
                        monthlyValue += stillOnRent * Number(item.perDayRent || 0) * days;
                    }
                }
            });
        });

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
