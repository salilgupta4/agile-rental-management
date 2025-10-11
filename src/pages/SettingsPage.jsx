import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Input, Select, Row, Col, message, InputNumber, Switch, Space, Divider, Checkbox, Typography, Form, Tabs } from 'antd';
import { DeleteOutlined, ExclamationCircleOutlined, SaveOutlined, SettingOutlined, PlusOutlined, KeyOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { MODULES, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../constants/permissions';
import { useAuth } from '../context/AuthContext';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';

const { Title } = Typography;

const SettingsPage = () => {
    const { data: users, loading } = useCollection('users');
    const { currentUser } = useAuth();
    const [logoLink, setLogoLink] = useState('');
    const [saving, setSaving] = useState(false);
    const [savingGST, setSavingGST] = useState(false);
    const [gstEnabled, setGstEnabled] = useState(true);
    const [cgstRate, setCgstRate] = useState(9);
    const [sgstRate, setSgstRate] = useState(9);
    const [igstRate, setIgstRate] = useState(18);
    const [permissionModalVisible, setPermissionModalVisible] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userPermissions, setUserPermissions] = useState({});
    const [addUserModalVisible, setAddUserModalVisible] = useState(false);
    const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
    const [selectedUserForPassword, setSelectedUserForPassword] = useState(null);
    const [addUserForm] = Form.useForm();
    const [changePasswordForm] = Form.useForm();
    const [selfPasswordForm] = Form.useForm();

    useEffect(() => {
        const fetchSettings = async () => {
            // Fetch logo
            const logoDocRef = doc(db, "config", "companyLogo");
            const logoSnap = await getDoc(logoDocRef);
            if (logoSnap.exists()) {
                setLogoLink(logoSnap.data().url);
            }

            // Fetch GST rates
            const gstDocRef = doc(db, "config", "gstRates");
            const gstSnap = await getDoc(gstDocRef);
            if (gstSnap.exists()) {
                const gstData = gstSnap.data();
                setGstEnabled(gstData.enabled ?? true);
                setCgstRate(gstData.cgst ?? 9);
                setSgstRate(gstData.sgst ?? 9);
                setIgstRate(gstData.igst ?? 18);
            }
        };
        fetchSettings();
    }, []);

    const handleRoleChange = async (userId, newRole) => {
        try {
            const user = users.find(u => u.id === userId);
            const userDocRef = doc(db, "users", userId);
            await updateDoc(userDocRef, { role: newRole });
            await logAudit(
                AUDIT_MODULES.USERS,
                AUDIT_ACTIONS.ROLE_CHANGE,
                `Changed role for user ${user?.email || userId} from ${user?.role} to ${newRole}`,
                { userId, userEmail: user?.email, oldRole: user?.role, newRole }
            );
            message.success("User role updated successfully!");
        } catch (error) {
            console.error("Error updating role: ", error);
            message.error("Failed to update user role.");
        }
    };

    const handleDeleteUser = (userId) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this user?',
            icon: <ExclamationCircleOutlined />,
            content: 'This will only remove the user from the application database, not from Firebase Authentication. This must be done manually in the Firebase console.',
            onOk: async () => {
                try {
                    const user = users.find(u => u.id === userId);
                    await deleteDoc(doc(db, "users", userId));
                    await logAudit(
                        AUDIT_MODULES.USERS,
                        AUDIT_ACTIONS.DELETE,
                        `Deleted user: ${user?.email || userId} (${user?.role || 'unknown role'})`,
                        { userId, userEmail: user?.email, userRole: user?.role }
                    );
                    message.success("User deleted successfully from app database.");
                } catch (error) {
                    message.error("Failed to delete user.");
                }
            },
        });
    };

    const handleSaveLogo = async () => {
        if (!logoLink) {
            message.warn("Please enter a logo URL.");
            return;
        }
        setSaving(true);
        try {
            const configDocRef = doc(db, "config", "companyLogo");
            await setDoc(configDocRef, { url: logoLink, updatedAt: new Date() });
            message.success("Logo saved successfully!");
        } catch (error) {
            console.error("Error saving logo URL: ", error);
            message.error("Failed to save logo.");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveGST = async () => {
        setSavingGST(true);
        try {
            const gstDocRef = doc(db, "config", "gstRates");
            await setDoc(gstDocRef, {
                enabled: gstEnabled,
                cgst: cgstRate,
                sgst: sgstRate,
                igst: igstRate,
                updatedAt: new Date()
            });
            message.success("GST settings saved successfully!");
        } catch (error) {
            console.error("Error saving GST settings: ", error);
            message.error("Failed to save GST settings.");
        } finally {
            setSavingGST(false);
        }
    };

    const handleManagePermissions = (record) => {
        setSelectedUser(record);
        // Get user's custom permissions or default role permissions
        const permissions = record.customPermissions || DEFAULT_ROLE_PERMISSIONS[record.role] || {};
        setUserPermissions(permissions);
        setPermissionModalVisible(true);
    };

    const handlePermissionChange = (module, permission, checked) => {
        setUserPermissions(prev => {
            const modulePermissions = prev[module] || [];
            if (checked) {
                return {
                    ...prev,
                    [module]: [...modulePermissions, permission]
                };
            } else {
                return {
                    ...prev,
                    [module]: modulePermissions.filter(p => p !== permission)
                };
            }
        });
    };

    const handleSavePermissions = async () => {
        try {
            const userDocRef = doc(db, "users", selectedUser.id);
            await updateDoc(userDocRef, { customPermissions: userPermissions });
            await logAudit(
                AUDIT_MODULES.USERS,
                AUDIT_ACTIONS.PERMISSION_CHANGE,
                `Updated permissions for user ${selectedUser.email}`,
                { userId: selectedUser.id, userEmail: selectedUser.email, customPermissions: userPermissions }
            );
            message.success("Permissions updated successfully!");
            setPermissionModalVisible(false);
        } catch (error) {
            console.error("Error updating permissions: ", error);
            message.error("Failed to update permissions.");
        }
    };

    const handleAddUser = async () => {
        try {
            const values = await addUserForm.validateFields();
            const { email, password, role } = values;

            // Create user in Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;

            // Add user to Firestore users collection
            await setDoc(doc(db, "users", newUser.uid), {
                email: email,
                role: role || 'user',
                createdAt: new Date().toISOString()
            });

            await logAudit(
                AUDIT_MODULES.USERS,
                AUDIT_ACTIONS.CREATE,
                `Created new user: ${email} with role ${role || 'user'}`,
                { userId: newUser.uid, userEmail: email, userRole: role || 'user' }
            );

            message.success("User created successfully!");
            setAddUserModalVisible(false);
            addUserForm.resetFields();
        } catch (error) {
            console.error("Error creating user: ", error);
            if (error.code === 'auth/email-already-in-use') {
                message.error("Email already in use.");
            } else if (error.code === 'auth/weak-password') {
                message.error("Password should be at least 6 characters.");
            } else {
                message.error("Failed to create user.");
            }
        }
    };

    const handleAdminChangePassword = async () => {
        try {
            const values = await changePasswordForm.validateFields();
            const { newPassword } = values;

            // Send password reset email for the selected user
            await sendPasswordResetEmail(auth, selectedUserForPassword.email);

            await logAudit(
                AUDIT_MODULES.USERS,
                AUDIT_ACTIONS.PASSWORD_RESET,
                `Sent password reset email to user ${selectedUserForPassword.email}`,
                { userId: selectedUserForPassword.id, userEmail: selectedUserForPassword.email }
            );

            message.success(`Password reset email sent to ${selectedUserForPassword.email}`);
            setChangePasswordModalVisible(false);
            changePasswordForm.resetFields();
            setSelectedUserForPassword(null);
        } catch (error) {
            console.error("Error sending password reset: ", error);
            message.error("Failed to send password reset email.");
        }
    };

    const handleSelfChangePassword = async () => {
        try {
            const values = await selfPasswordForm.validateFields();
            const { currentPassword, newPassword } = values;

            // Re-authenticate user with current password
            const credential = EmailAuthProvider.credential(
                auth.currentUser.email,
                currentPassword
            );
            await reauthenticateWithCredential(auth.currentUser, credential);

            // Update password
            await updatePassword(auth.currentUser, newPassword);

            await logAudit(
                AUDIT_MODULES.USERS,
                AUDIT_ACTIONS.PASSWORD_RESET,
                `Changed own password`,
                { userId: auth.currentUser.uid, userEmail: auth.currentUser.email }
            );

            message.success("Password changed successfully!");
            selfPasswordForm.resetFields();
        } catch (error) {
            console.error("Error changing password: ", error);
            if (error.code === 'auth/wrong-password') {
                message.error("Current password is incorrect.");
            } else if (error.code === 'auth/weak-password') {
                message.error("New password should be at least 6 characters.");
            } else {
                message.error("Failed to change password.");
            }
        }
    };

    const openChangePasswordModal = (record) => {
        setSelectedUserForPassword(record);
        setChangePasswordModalVisible(true);
    };

    const columns = [
        { title: 'Email', dataIndex: 'email', key: 'email' },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role, record) => (
                <Select
                    defaultValue={role}
                    style={{ width: 120 }}
                    onChange={(newRole) => handleRoleChange(record.id, newRole)}
                    disabled={auth.currentUser?.uid === record.id} // Admin can't change their own role
                >
                    <Select.Option value="admin">Admin</Select.Option>
                    <Select.Option value="user">User</Select.Option>
                    <Select.Option value="viewer">Viewer</Select.Option>
                </Select>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button
                        icon={<SettingOutlined />}
                        onClick={() => handleManagePermissions(record)}
                    >
                        Permissions
                    </Button>
                    <Button
                        icon={<KeyOutlined />}
                        onClick={() => openChangePasswordModal(record)}
                    >
                        Reset Password
                    </Button>
                    <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteUser(record.id)}
                        disabled={auth.currentUser?.uid === record.id}
                    >
                        Delete
                    </Button>
                </Space>
            ),
        }
    ];

    return (
        <>
            <Tabs defaultActiveKey="1">
                <Tabs.TabPane tab="General Settings" key="1">
                    <Card title="Company Settings">
                        <Row gutter={[24, 24]}>
                            <Col xs={24} md={12}>
                                <h4>Company Logo URL</h4>
                                <Input
                                    placeholder="https://example.com/logo.png"
                                    value={logoLink}
                                    onChange={(e) => setLogoLink(e.target.value)}
                                />
                                <Button
                                    type="primary"
                                    icon={<SaveOutlined />}
                                    loading={saving}
                                    onClick={handleSaveLogo}
                                    style={{ marginTop: '12px' }}
                                >
                                    {saving ? 'Saving...' : 'Save Logo'}
                                </Button>
                            </Col>

                            <Col xs={24} md={12}>
                                <h4>GST Configuration</h4>
                                <Space direction="vertical" style={{ width: '100%' }} size="large">
                                    <Space align="center">
                                        <span>Enable GST:</span>
                                        <Switch checked={gstEnabled} onChange={setGstEnabled} />
                                    </Space>

                                    {gstEnabled && (
                                        <>
                                            <Space direction="vertical" style={{ width: '100%' }}>
                                                <span>CGST Rate (%):</span>
                                                <InputNumber
                                                    min={0}
                                                    max={100}
                                                    value={cgstRate}
                                                    onChange={setCgstRate}
                                                    style={{ width: '100%' }}
                                                    precision={2}
                                                />
                                            </Space>

                                            <Space direction="vertical" style={{ width: '100%' }}>
                                                <span>SGST Rate (%):</span>
                                                <InputNumber
                                                    min={0}
                                                    max={100}
                                                    value={sgstRate}
                                                    onChange={setSgstRate}
                                                    style={{ width: '100%' }}
                                                    precision={2}
                                                />
                                            </Space>

                                            <Space direction="vertical" style={{ width: '100%' }}>
                                                <span>IGST Rate (%) - For Interstate:</span>
                                                <InputNumber
                                                    min={0}
                                                    max={100}
                                                    value={igstRate}
                                                    onChange={setIgstRate}
                                                    style={{ width: '100%' }}
                                                    precision={2}
                                                />
                                            </Space>

                                            <div style={{ color: '#666', fontSize: '12px', fontStyle: 'italic' }}>
                                                Note: Total GST = CGST + SGST (for local) or IGST (for interstate)
                                            </div>
                                        </>
                                    )}

                                    <Button
                                        type="primary"
                                        icon={<SaveOutlined />}
                                        loading={savingGST}
                                        onClick={handleSaveGST}
                                    >
                                        {savingGST ? 'Saving...' : 'Save GST Settings'}
                                    </Button>
                                </Space>
                            </Col>
                        </Row>
                    </Card>
                </Tabs.TabPane>

                <Tabs.TabPane tab="User Management" key="2">
                    <Card title="User Management">
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setAddUserModalVisible(true)}
                            style={{ marginBottom: 16 }}
                        >
                            Add New User
                        </Button>
                        <Table dataSource={users} columns={columns} loading={loading} rowKey="id" />
                    </Card>
                </Tabs.TabPane>

                <Tabs.TabPane tab="My Account" key="3">
                    <Card title="My Account">
                        <Title level={5}>Change Your Password</Title>
                        <Form form={selfPasswordForm} layout="vertical" style={{ maxWidth: 400 }}>
                            <Form.Item
                                name="currentPassword"
                                label="Current Password"
                                rules={[{ required: true, message: 'Please enter your current password' }]}
                            >
                                <Input.Password prefix={<LockOutlined />} placeholder="Current Password" />
                            </Form.Item>
                            <Form.Item
                                name="newPassword"
                                label="New Password"
                                rules={[
                                    { required: true, message: 'Please enter your new password' },
                                    { min: 6, message: 'Password must be at least 6 characters' }
                                ]}
                            >
                                <Input.Password prefix={<KeyOutlined />} placeholder="New Password" />
                            </Form.Item>
                            <Form.Item
                                name="confirmPassword"
                                label="Confirm New Password"
                                dependencies={['newPassword']}
                                rules={[
                                    { required: true, message: 'Please confirm your new password' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue('newPassword') === value) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error('Passwords do not match'));
                                        },
                                    }),
                                ]}
                            >
                                <Input.Password prefix={<KeyOutlined />} placeholder="Confirm New Password" />
                            </Form.Item>
                            <Form.Item>
                                <Button type="primary" icon={<KeyOutlined />} onClick={handleSelfChangePassword}>
                                    Change Password
                                </Button>
                            </Form.Item>
                        </Form>
                    </Card>
                </Tabs.TabPane>
            </Tabs>

            <Modal
                title="Add New User"
                visible={addUserModalVisible}
                onOk={handleAddUser}
                onCancel={() => {
                    setAddUserModalVisible(false);
                    addUserForm.resetFields();
                }}
            >
                <Form form={addUserForm} layout="vertical">
                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[
                            { required: true, message: 'Please enter email' },
                            { type: 'email', message: 'Please enter a valid email' }
                        ]}
                    >
                        <Input prefix={<MailOutlined />} placeholder="user@example.com" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[
                            { required: true, message: 'Please enter password' },
                            { min: 6, message: 'Password must be at least 6 characters' }
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="Password (min 6 characters)" />
                    </Form.Item>
                    <Form.Item
                        name="role"
                        label="Role"
                        rules={[{ required: true, message: 'Please select a role' }]}
                        initialValue="user"
                    >
                        <Select>
                            <Select.Option value="admin">Admin</Select.Option>
                            <Select.Option value="user">User</Select.Option>
                            <Select.Option value="viewer">Viewer</Select.Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={`Reset Password - ${selectedUserForPassword?.email}`}
                visible={changePasswordModalVisible}
                onOk={handleAdminChangePassword}
                onCancel={() => {
                    setChangePasswordModalVisible(false);
                    changePasswordForm.resetFields();
                    setSelectedUserForPassword(null);
                }}
            >
                <Typography.Paragraph>
                    A password reset email will be sent to <strong>{selectedUserForPassword?.email}</strong>.
                    The user will receive an email with a link to reset their password.
                </Typography.Paragraph>
            </Modal>

            <Modal
                title={`Manage Permissions - ${selectedUser?.email}`}
                visible={permissionModalVisible}
                onOk={handleSavePermissions}
                onCancel={() => setPermissionModalVisible(false)}
                width={800}
            >
                <div style={{ marginBottom: 16 }}>
                    <Typography.Text type="secondary">
                        Configure module-wise permissions for this user. These custom permissions will override the default role permissions.
                    </Typography.Text>
                </div>
                <Table
                    dataSource={Object.values(MODULES).map(module => ({ module }))}
                    pagination={false}
                    rowKey="module"
                    columns={[
                        {
                            title: 'Module',
                            dataIndex: 'module',
                            key: 'module',
                            render: (module) => <strong>{module.replace(/_/g, ' ').toUpperCase()}</strong>
                        },
                        {
                            title: 'View',
                            key: 'view',
                            width: 80,
                            render: (_, record) => (
                                <Checkbox
                                    checked={(userPermissions[record.module] || []).includes(PERMISSIONS.VIEW)}
                                    onChange={(e) => handlePermissionChange(record.module, PERMISSIONS.VIEW, e.target.checked)}
                                />
                            )
                        },
                        {
                            title: 'Create',
                            key: 'create',
                            width: 80,
                            render: (_, record) => (
                                <Checkbox
                                    checked={(userPermissions[record.module] || []).includes(PERMISSIONS.CREATE)}
                                    onChange={(e) => handlePermissionChange(record.module, PERMISSIONS.CREATE, e.target.checked)}
                                />
                            )
                        },
                        {
                            title: 'Edit',
                            key: 'edit',
                            width: 80,
                            render: (_, record) => (
                                <Checkbox
                                    checked={(userPermissions[record.module] || []).includes(PERMISSIONS.EDIT)}
                                    onChange={(e) => handlePermissionChange(record.module, PERMISSIONS.EDIT, e.target.checked)}
                                />
                            )
                        },
                        {
                            title: 'Delete',
                            key: 'delete',
                            width: 80,
                            render: (_, record) => (
                                <Checkbox
                                    checked={(userPermissions[record.module] || []).includes(PERMISSIONS.DELETE)}
                                    onChange={(e) => handlePermissionChange(record.module, PERMISSIONS.DELETE, e.target.checked)}
                                />
                            )
                        }
                    ]}
                />
            </Modal>
        </>
    );
};

export default SettingsPage;
