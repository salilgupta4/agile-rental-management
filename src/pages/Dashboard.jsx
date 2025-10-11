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

        // Create a map of rental end dates from returns
        const rentalEndDates = {};
        returns.forEach(r => {
            if (r.rentalEndDate) {
                const key = `${r.customer}`;
                if (!rentalEndDates[key] || new Date(r.rentalEndDate) > new Date(rentalEndDates[key])) {
                    rentalEndDates[key] = r.rentalEndDate;
                }
            }
        });

        // Filter only active rentals (status = 'Rented') that haven't ended yet
        const activeTransfers = transfers.filter(t => {
            if (t.status !== 'Rented') return false;

            // Check if this rental has ended
            const rentalEndDate = rentalEndDates[t.customer];
            if (rentalEndDate && new Date(rentalEndDate) < startOfMonth) {
                return false; // Rental ended before this month
            }

            return true;
        });

        let monthlyValue = 0;

        activeTransfers.forEach(t => {
            // Handle both old single-item and new multi-item structure
            const items = t.items || (t.product ? [{ product: t.product, quantity: t.quantity, perDayRent: t.perDayRent }] : []);

            items.forEach(item => {
                const rentalStartDate = new Date(t.rentalStartDate);
                const rentalEndDate = rentalEndDates[t.customer] ? new Date(rentalEndDates[t.customer]) : now;

                // Calculate effective start date (later of rental start or month start)
                const effectiveStartDate = rentalStartDate > startOfMonth ? rentalStartDate : startOfMonth;

                // Calculate effective end date (earlier of rental end or month end)
                const effectiveEndDate = rentalEndDate < endOfMonth ? rentalEndDate : endOfMonth;

                // If rental started after current month or ended before current month, skip it
                if (effectiveStartDate > endOfMonth || effectiveEndDate < startOfMonth) return;

                // Calculate days in current month for this rental
                const diffTime = Math.abs(effectiveEndDate - effectiveStartDate);
                const daysInCurrentMonth = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                monthlyValue += Number(item.quantity || 0) * Number(item.perDayRent || 0) * daysInCurrentMonth;
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
