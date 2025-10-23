import React, { useState } from 'react';
import { ConfigProvider, Layout, Menu, App as AntApp, Avatar, Dropdown, message } from 'antd';
import {
  HomeOutlined,
  ShoppingOutlined,
  SwapOutlined,
  UserOutlined,
  BarChartOutlined,
  LogoutOutlined,
  BuildOutlined,
  ToolOutlined,
  UsergroupAddOutlined,
  SettingOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  DownOutlined,
  HistoryOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { signOut } from 'firebase/auth';
import { auth } from './services/firebase';
import { useAuth } from './context/AuthContext';
import { usePermissions } from './hooks/usePermissions';
import { MODULES } from './constants/permissions';
import { USER_ROLES } from './constants';

// Import pages
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ProductsPage from './pages/ProductsPage';
import WarehousesPage from './pages/WarehousesPage';
import CustomersPage from './pages/CustomersPage';
import PurchasesPage from './pages/PurchasesPage';
import TransfersPage from './pages/TransfersPage';
import ReturnsPage from './pages/ReturnsPage';
import SalesPage from './pages/SalesPage';
import RentalOrdersPage from './pages/RentalOrdersPage';
import ReportsPage from './pages/ReportsPage';
import ScratchpadPage from './pages/ScratchpadPage';
import SettingsPage from './pages/SettingsPage';
import AuditLogsPage from './pages/AuditLogsPage';

const { Header, Sider, Content } = Layout;

const AppContent = () => {
  const { user } = useAuth();

  if (!user) {
    return <LoginPage />;
  }

  return <MainApp />;
};

const MainApp = () => {
  const [selectedKey, setSelectedKey] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const { user, userRole } = useAuth();
  const { canView } = usePermissions();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      message.success('Logged out successfully!');
    } catch (error) {
      message.error('Failed to log out.');
    }
  };

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: handleLogout
    }
  ];

  const allMenuItems = [
    {
      key: 'dashboard',
      icon: <HomeOutlined />,
      label: 'Dashboard',
      module: MODULES.DASHBOARD
    },
    {
      key: 'masters',
      icon: <BuildOutlined />,
      label: 'Masters',
      children: [
        { key: 'products', icon: <ToolOutlined />, label: 'Products', module: MODULES.PRODUCTS },
        { key: 'warehouses', icon: <HomeOutlined />, label: 'Warehouses', module: MODULES.WAREHOUSES },
        { key: 'customers', icon: <UsergroupAddOutlined />, label: 'Customers', module: MODULES.CUSTOMERS }
      ]
    },
    {
      key: 'transactions',
      icon: <SwapOutlined />,
      label: 'Transactions',
      children: [
        { key: 'purchases', icon: <ShoppingOutlined />, label: 'Purchases', module: MODULES.PURCHASES },
        { key: 'transfers', icon: <SwapOutlined />, label: 'Transfers', module: MODULES.TRANSFERS },
        { key: 'returns', icon: <SwapOutlined />, label: 'Returns', module: MODULES.RETURNS },
        { key: 'sales', icon: <ShoppingOutlined />, label: 'Sales', module: MODULES.SALES }
      ]
    },
    {
      key: 'rentals',
      icon: <FileDoneOutlined />,
      label: 'Rental Orders',
      module: MODULES.RENTAL_ORDERS
    },
    {
      key: 'reports',
      icon: <BarChartOutlined />,
      label: 'Reports',
      module: MODULES.REPORTS
    },
    {
      key: 'scratchpad',
      icon: <FileTextOutlined />,
      label: 'Scratchpad',
      module: MODULES.SCRATCHPAD
    }
  ];

  if (userRole === USER_ROLES.ADMIN) {
    allMenuItems.push({
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      module: MODULES.SETTINGS
    });
    allMenuItems.push({
      key: 'auditLogs',
      icon: <HistoryOutlined />,
      label: 'Audit Logs',
      module: MODULES.SETTINGS  // Using SETTINGS module permission for audit logs
    });
  }

  // Filter menu items based on permissions
  const menuItems = allMenuItems.map(item => {
    if (item.children) {
      const filteredChildren = item.children.filter(child => canView(child.module));
      if (filteredChildren.length === 0) return null;
      return { ...item, children: filteredChildren };
    }
    return canView(item.module) ? item : null;
  }).filter(Boolean);

  const renderContent = () => {
    switch (selectedKey) {
      case 'dashboard':
        return <Dashboard />;
      case 'products':
        return <ProductsPage />;
      case 'warehouses':
        return <WarehousesPage />;
      case 'customers':
        return <CustomersPage />;
      case 'purchases':
        return <PurchasesPage />;
      case 'transfers':
        return <TransfersPage />;
      case 'returns':
        return <ReturnsPage />;
      case 'sales':
        return <SalesPage />;
      case 'rentals':
        return <RentalOrdersPage />;
      case 'reports':
        return <ReportsPage />;
      case 'scratchpad':
        return <ScratchpadPage />;
      case 'settings':
        return <SettingsPage />;
      case 'auditLogs':
        return <AuditLogsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
          {collapsed ? 'SRM' : 'Scaffolding Rental'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => setSelectedKey(key)}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Scaffolding Rental Management</h2>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user?.email}</span>
              <DownOutlined />
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 280 }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

function App() {
  return (
    <ConfigProvider>
      <AntApp>
        <AppContent />
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
