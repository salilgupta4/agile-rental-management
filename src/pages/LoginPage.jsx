import React, { useState } from 'react';
import { Layout, Card, Form, Input, Button, Select, message } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const LoginPage = () => {
    const [loading, setLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [form] = Form.useForm();

    const onFinish = async (values) => {
        setLoading(true);
        const { email, password, role } = values;
        try {
            if (isRegistering) {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                await setDoc(doc(db, "users", user.uid), {
                    email: user.email,
                    role: role || 'viewer',
                });
                message.success('Registration successful! Please log in.');
                setIsRegistering(false);
                form.resetFields();
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                message.success('Logged in successfully!');
            }
        } catch (error) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f0f2f5' }}>
            <Card title={isRegistering ? "Register New User" : "Scaffolding Rental Login"} style={{ width: 400 }}>
                <Form form={form} name="login" onFinish={onFinish} layout="vertical">
                    <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Please input a valid email!' }]}>
                        <Input prefix={<UserOutlined />} placeholder="Email" />
                    </Form.Item>
                    <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Please input your password!' }]}>
                        <Input.Password prefix={<UserOutlined />} placeholder="Password" />
                    </Form.Item>
                    {isRegistering && (
                        <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Please select a role!' }]}>
                            <Select placeholder="Select a role">
                                <Select.Option value="admin">Admin</Select.Option>
                                <Select.Option value="user">User</Select.Option>
                                <Select.Option value="viewer">Viewer</Select.Option>
                            </Select>
                        </Form.Item>
                    )}
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={loading} style={{ width: '100%' }}>
                            {isRegistering ? 'Register' : 'Log In'}
                        </Button>
                    </Form.Item>
                    <Button type="link" onClick={() => setIsRegistering(!isRegistering)} style={{ width: '100%' }}>
                        {isRegistering ? 'Already have an account? Log In' : 'Create a new account'}
                    </Button>
                </Form>
            </Card>
        </Layout>
    );
};

export default LoginPage;
