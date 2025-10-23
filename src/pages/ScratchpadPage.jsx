import React, { useState } from 'react';
import { Card, Button, Modal, Form, Input, message, Space, Popconfirm, Row, Col, Dropdown, Spin, Tag, Checkbox, Table as AntTable, InputNumber } from 'antd';
import {
    EditOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined,
    FileTextOutlined,
    PlusOutlined,
    CheckSquareOutlined,
    DollarOutlined,
    TableOutlined,
    MoreOutlined
} from '@ant-design/icons';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useCollection } from '../hooks/useCollection';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../constants/permissions';
import { COLLECTION_NAMES } from '../constants';
import { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } from '../utils/auditLog';
import { formatDate } from '../utils/helpers';

const { TextArea } = Input;

const NOTE_TYPES = {
    NORMAL: 'normal',
    TODO: 'todo',
    LEDGER: 'ledger',
    SPREADSHEET: 'spreadsheet'
};

// Note Card Component
const NoteCard = ({ note, onEdit, onDelete, canEdit, canDelete }) => {
    const getIcon = () => {
        switch (note.type) {
            case NOTE_TYPES.TODO:
                return <CheckSquareOutlined style={{ fontSize: 24, color: '#52c41a' }} />;
            case NOTE_TYPES.LEDGER:
                return <DollarOutlined style={{ fontSize: 24, color: '#1890ff' }} />;
            case NOTE_TYPES.SPREADSHEET:
                return <TableOutlined style={{ fontSize: 24, color: '#722ed1' }} />;
            default:
                return <FileTextOutlined style={{ fontSize: 24, color: '#faad14' }} />;
        }
    };

    const getTypeLabel = () => {
        switch (note.type) {
            case NOTE_TYPES.TODO:
                return <Tag color="green">To-Do List</Tag>;
            case NOTE_TYPES.LEDGER:
                return <Tag color="blue">Ledger</Tag>;
            case NOTE_TYPES.SPREADSHEET:
                return <Tag color="purple">Spreadsheet</Tag>;
            default:
                return <Tag color="gold">Note</Tag>;
        }
    };

    const renderContent = () => {
        switch (note.type) {
            case NOTE_TYPES.TODO:
                const todos = note.content?.todos || [];
                const completed = todos.filter(t => t.completed).length;
                return (
                    <div>
                        <div style={{ marginBottom: 8 }}>
                            Progress: {completed}/{todos.length} completed
                        </div>
                        {todos.slice(0, 3).map((todo, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                                <Checkbox checked={todo.completed} disabled style={{ marginRight: 8 }} />
                                <span style={{ textDecoration: todo.completed ? 'line-through' : 'none', color: todo.completed ? '#999' : '#000' }}>
                                    {todo.text}
                                </span>
                            </div>
                        ))}
                        {todos.length > 3 && <div style={{ color: '#999', fontSize: 12 }}>+{todos.length - 3} more...</div>}
                    </div>
                );

            case NOTE_TYPES.LEDGER:
                const entries = note.content?.entries || [];
                const total = entries.reduce((sum, entry) => {
                    return sum + (entry.type === 'credit' ? parseFloat(entry.amount || 0) : -parseFloat(entry.amount || 0));
                }, 0);
                return (
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 'bold' }}>
                            Balance: ₹{total.toFixed(2)}
                        </div>
                        {entries.slice(0, 3).map((entry, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span>{entry.description}</span>
                                <span style={{ color: entry.type === 'credit' ? 'green' : 'red' }}>
                                    {entry.type === 'credit' ? '+' : '-'}₹{parseFloat(entry.amount || 0).toFixed(2)}
                                </span>
                            </div>
                        ))}
                        {entries.length > 3 && <div style={{ color: '#999', fontSize: 12 }}>+{entries.length - 3} more entries...</div>}
                    </div>
                );

            case NOTE_TYPES.SPREADSHEET:
                const rows = note.content?.rows || [];
                const cols = note.content?.columns || [];
                return (
                    <div>
                        <div style={{ marginBottom: 8 }}>
                            {cols.length} columns × {rows.length} rows
                        </div>
                        {rows.length > 0 && (
                            <div style={{ fontSize: 12, color: '#666' }}>
                                {cols.slice(0, 3).map((col, idx) => (
                                    <span key={idx} style={{ marginRight: 8 }}>
                                        <strong>{col.name}:</strong> {rows[0]?.data?.[col.key] || '-'}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                );

            default:
                return (
                    <div style={{ color: '#666', fontSize: 14 }}>
                        {note.content?.substring(0, 150)}
                        {note.content?.length > 150 ? '...' : ''}
                    </div>
                );
        }
    };

    const menuItems = [
        canEdit && {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Edit',
            onClick: () => onEdit(note)
        },
        canDelete && {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: 'Delete',
            danger: true,
            onClick: () => {
                Modal.confirm({
                    title: 'Delete Note',
                    content: `Are you sure you want to delete "${note.title}"?`,
                    icon: <ExclamationCircleOutlined style={{ color: 'red' }} />,
                    okText: 'Yes',
                    okType: 'danger',
                    cancelText: 'No',
                    onOk: () => onDelete(note.id, note.title)
                });
            }
        }
    ].filter(Boolean);

    return (
        <Card
            hoverable
            style={{ height: '100%', minHeight: 280 }}
            bodyStyle={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {getIcon()}
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{note.title}</div>
                        {getTypeLabel()}
                    </div>
                </div>
                {(canEdit || canDelete) && (
                    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                        <Button type="text" icon={<MoreOutlined />} />
                    </Dropdown>
                )}
            </div>
            <div style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
                {renderContent()}
            </div>
            <div style={{ fontSize: 12, color: '#999', borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                Updated: {formatDate(note.updatedAt)}
            </div>
        </Card>
    );
};

// Main Scratchpad Page
const ScratchpadPage = () => {
    const { data, loading } = useCollection(COLLECTION_NAMES.SCRATCHPAD);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [selectedType, setSelectedType] = useState(NOTE_TYPES.NORMAL);
    const [form] = Form.useForm();
    const { canCreate, canEdit, canDelete } = usePermissions();

    const showModal = (type = NOTE_TYPES.NORMAL) => {
        setEditingRecord(null);
        setSelectedType(type);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record) => {
        setEditingRecord(record);
        setSelectedType(record.type);

        if (record.type === NOTE_TYPES.NORMAL) {
            form.setFieldsValue({
                title: record.title,
                content: record.content
            });
        } else {
            form.setFieldsValue({
                title: record.title,
                contentData: record.content
            });
        }

        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingRecord(null);
        form.resetFields();
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const timestamp = new Date().toISOString();

            let noteData = {
                title: values.title,
                type: selectedType,
                updatedAt: timestamp
            };

            // Handle content based on type
            if (selectedType === NOTE_TYPES.NORMAL) {
                noteData.content = values.content;
            } else {
                noteData.content = values.contentData;
            }

            if (editingRecord) {
                const docRef = doc(db, COLLECTION_NAMES.SCRATCHPAD, editingRecord.id);
                await updateDoc(docRef, noteData);
                await logAudit(
                    AUDIT_MODULES.SCRATCHPAD,
                    AUDIT_ACTIONS.EDIT,
                    `Updated ${selectedType} note: ${values.title}`,
                    { noteId: editingRecord.id, type: selectedType }
                );
                message.success(`Note updated successfully!`);
            } else {
                noteData.createdAt = timestamp;
                const docRef = await addDoc(collection(db, COLLECTION_NAMES.SCRATCHPAD), noteData);
                await logAudit(
                    AUDIT_MODULES.SCRATCHPAD,
                    AUDIT_ACTIONS.CREATE,
                    `Created new ${selectedType} note: ${values.title}`,
                    { noteId: docRef.id, type: selectedType }
                );
                message.success(`Note added successfully!`);
            }
            handleCancel();
        } catch (error) {
            message.error(`Failed to save note.`);
        }
    };

    const handleDelete = async (id, title) => {
        try {
            await deleteDoc(doc(db, COLLECTION_NAMES.SCRATCHPAD, id));
            await logAudit(
                AUDIT_MODULES.SCRATCHPAD,
                AUDIT_ACTIONS.DELETE,
                `Deleted note: ${title}`,
                { noteId: id }
            );
            message.success(`Note "${title}" deleted successfully!`);
        } catch (error) {
            message.error('Failed to delete note.');
        }
    };

    const addMenuItems = [
        {
            key: NOTE_TYPES.NORMAL,
            icon: <FileTextOutlined />,
            label: 'Normal Note',
            onClick: () => showModal(NOTE_TYPES.NORMAL)
        },
        {
            key: NOTE_TYPES.TODO,
            icon: <CheckSquareOutlined />,
            label: 'To-Do List',
            onClick: () => showModal(NOTE_TYPES.TODO)
        },
        {
            key: NOTE_TYPES.LEDGER,
            icon: <DollarOutlined />,
            label: 'Ledger',
            onClick: () => showModal(NOTE_TYPES.LEDGER)
        },
        {
            key: NOTE_TYPES.SPREADSHEET,
            icon: <TableOutlined />,
            label: 'Spreadsheet',
            onClick: () => showModal(NOTE_TYPES.SPREADSHEET)
        }
    ];

    const renderModalContent = () => {
        switch (selectedType) {
            case NOTE_TYPES.TODO:
                return <TodoNoteForm form={form} editingRecord={editingRecord} />;
            case NOTE_TYPES.LEDGER:
                return <LedgerNoteForm form={form} editingRecord={editingRecord} />;
            case NOTE_TYPES.SPREADSHEET:
                return <SpreadsheetNoteForm form={form} editingRecord={editingRecord} />;
            default:
                return <NormalNoteForm form={form} />;
        }
    };

    return (
        <Card title="Scratchpad" style={{ minHeight: 'calc(100vh - 150px)' }}>
            {canCreate(MODULES.SCRATCHPAD) && (
                <Dropdown menu={{ items: addMenuItems }} trigger={['click']}>
                    <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }}>
                        Add Note
                    </Button>
                </Dropdown>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                </div>
            ) : (
                <Row gutter={[16, 16]}>
                    {data.map(note => (
                        <Col key={note.id} xs={24} sm={12} md={8} lg={6}>
                            <NoteCard
                                note={note}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                canEdit={canEdit(MODULES.SCRATCHPAD)}
                                canDelete={canDelete(MODULES.SCRATCHPAD)}
                            />
                        </Col>
                    ))}
                    {data.length === 0 && (
                        <Col span={24}>
                            <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                                <FileTextOutlined style={{ fontSize: 64, marginBottom: 16 }} />
                                <div>No notes yet. Click "Add Note" to create your first note.</div>
                            </div>
                        </Col>
                    )}
                </Row>
            )}

            <Modal
                title={`${editingRecord ? 'Edit' : 'Add New'} ${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} ${selectedType === NOTE_TYPES.NORMAL ? 'Note' : ''}`}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                width={selectedType === NOTE_TYPES.SPREADSHEET ? 900 : 700}
                okText={editingRecord ? 'Update' : 'Create'}
            >
                {renderModalContent()}
            </Modal>
        </Card>
    );
};

// Normal Note Form
const NormalNoteForm = ({ form }) => {
    return (
        <Form form={form} layout="vertical">
            <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Please enter a title' }]}
            >
                <Input placeholder="Enter note title" />
            </Form.Item>
            <Form.Item
                name="content"
                label="Content"
                rules={[{ required: true, message: 'Please enter content' }]}
            >
                <TextArea
                    rows={10}
                    placeholder="Enter your note content here..."
                    showCount
                />
            </Form.Item>
        </Form>
    );
};

// Todo Note Form
const TodoNoteForm = ({ form, editingRecord }) => {
    const [todos, setTodos] = useState(editingRecord?.content?.todos || []);
    const [newTodoText, setNewTodoText] = useState('');

    React.useEffect(() => {
        form.setFieldsValue({
            title: editingRecord?.title || '',
            contentData: { todos }
        });
    }, [todos, form, editingRecord]);

    const addTodo = () => {
        if (newTodoText.trim()) {
            const newTodos = [...todos, { text: newTodoText, completed: false }];
            setTodos(newTodos);
            setNewTodoText('');
        }
    };

    const toggleTodo = (index) => {
        const newTodos = [...todos];
        newTodos[index].completed = !newTodos[index].completed;
        setTodos(newTodos);
    };

    const removeTodo = (index) => {
        setTodos(todos.filter((_, i) => i !== index));
    };

    return (
        <Form form={form} layout="vertical">
            <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Please enter a title' }]}
            >
                <Input placeholder="Enter list title" />
            </Form.Item>
            <Form.Item label="To-Do Items">
                <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                    <Input
                        placeholder="Add new task..."
                        value={newTodoText}
                        onChange={(e) => setNewTodoText(e.target.value)}
                        onPressEnter={addTodo}
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={addTodo}>
                        Add
                    </Button>
                </Space.Compact>
                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 4, padding: 8 }}>
                    {todos.map((todo, index) => (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 4 }}>
                            <Checkbox
                                checked={todo.completed}
                                onChange={() => toggleTodo(index)}
                                style={{ marginRight: 8 }}
                            />
                            <span style={{ flex: 1, textDecoration: todo.completed ? 'line-through' : 'none' }}>
                                {todo.text}
                            </span>
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeTodo(index)}
                                size="small"
                            />
                        </div>
                    ))}
                    {todos.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                            No tasks yet. Add your first task above.
                        </div>
                    )}
                </div>
            </Form.Item>
            <Form.Item name="contentData" hidden>
                <Input />
            </Form.Item>
        </Form>
    );
};

// Ledger Note Form
const LedgerNoteForm = ({ form, editingRecord }) => {
    const [entries, setEntries] = useState(editingRecord?.content?.entries || []);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [entryType, setEntryType] = useState('credit');

    React.useEffect(() => {
        form.setFieldsValue({
            title: editingRecord?.title || '',
            contentData: { entries }
        });
    }, [entries, form, editingRecord]);

    const addEntry = () => {
        if (description.trim() && amount) {
            const newEntries = [...entries, { description, amount: parseFloat(amount), type: entryType, date: new Date().toISOString() }];
            setEntries(newEntries);
            setDescription('');
            setAmount('');
        }
    };

    const removeEntry = (index) => {
        setEntries(entries.filter((_, i) => i !== index));
    };

    const balance = entries.reduce((sum, entry) => {
        return sum + (entry.type === 'credit' ? parseFloat(entry.amount) : -parseFloat(entry.amount));
    }, 0);

    return (
        <Form form={form} layout="vertical">
            <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Please enter a title' }]}
            >
                <Input placeholder="Enter ledger title" />
            </Form.Item>
            <Form.Item label="Add Entry">
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Input
                        placeholder="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <Space.Compact style={{ width: '100%' }}>
                        <Button
                            type={entryType === 'credit' ? 'primary' : 'default'}
                            onClick={() => setEntryType('credit')}
                            style={{ width: '25%' }}
                        >
                            Credit (+)
                        </Button>
                        <Button
                            type={entryType === 'debit' ? 'primary' : 'default'}
                            onClick={() => setEntryType('debit')}
                            style={{ width: '25%' }}
                        >
                            Debit (-)
                        </Button>
                        <InputNumber
                            placeholder="Amount"
                            value={amount}
                            onChange={setAmount}
                            style={{ width: '30%' }}
                            prefix="₹"
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={addEntry} style={{ width: '20%' }}>
                            Add
                        </Button>
                    </Space.Compact>
                </Space>
            </Form.Item>
            <Form.Item label={`Entries (Balance: ₹${balance.toFixed(2)})`}>
                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 4 }}>
                    <AntTable
                        dataSource={entries}
                        columns={[
                            {
                                title: 'Description',
                                dataIndex: 'description',
                                key: 'description'
                            },
                            {
                                title: 'Type',
                                dataIndex: 'type',
                                key: 'type',
                                render: (type) => (
                                    <Tag color={type === 'credit' ? 'green' : 'red'}>
                                        {type.toUpperCase()}
                                    </Tag>
                                )
                            },
                            {
                                title: 'Amount',
                                dataIndex: 'amount',
                                key: 'amount',
                                render: (amount, record) => (
                                    <span style={{ color: record.type === 'credit' ? 'green' : 'red' }}>
                                        {record.type === 'credit' ? '+' : '-'}₹{parseFloat(amount).toFixed(2)}
                                    </span>
                                )
                            },
                            {
                                title: 'Actions',
                                key: 'actions',
                                render: (_, record, index) => (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => removeEntry(index)}
                                        size="small"
                                    />
                                )
                            }
                        ]}
                        pagination={false}
                        size="small"
                        rowKey={(record, index) => index}
                    />
                    {entries.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                            No entries yet. Add your first entry above.
                        </div>
                    )}
                </div>
            </Form.Item>
            <Form.Item name="contentData" hidden>
                <Input />
            </Form.Item>
        </Form>
    );
};

// Spreadsheet Note Form
const SpreadsheetNoteForm = ({ form, editingRecord }) => {
    const [columns, setColumns] = useState(editingRecord?.content?.columns || []);
    const [rows, setRows] = useState(editingRecord?.content?.rows || []);
    const [newColumnName, setNewColumnName] = useState('');

    React.useEffect(() => {
        form.setFieldsValue({
            title: editingRecord?.title || '',
            contentData: { columns, rows }
        });
    }, [columns, rows, form, editingRecord]);

    const addColumn = () => {
        if (newColumnName.trim() && !columns.find(c => c.name === newColumnName)) {
            const key = `col_${Date.now()}`;
            const newCols = [...columns, { key, name: newColumnName }];
            setColumns(newCols);

            // Add empty cell for new column in all rows
            const newRows = rows.map(row => ({
                ...row,
                data: { ...row.data, [key]: '' }
            }));
            setRows(newRows);
            setNewColumnName('');
        }
    };

    const removeColumn = (colKey) => {
        setColumns(columns.filter(c => c.key !== colKey));
        const newRows = rows.map(row => {
            const newData = { ...row.data };
            delete newData[colKey];
            return { ...row, data: newData };
        });
        setRows(newRows);
    };

    const addRow = () => {
        const newRow = {
            id: `row_${Date.now()}`,
            data: columns.reduce((acc, col) => ({ ...acc, [col.key]: '' }), {})
        };
        setRows([...rows, newRow]);
    };

    const removeRow = (rowId) => {
        setRows(rows.filter(r => r.id !== rowId));
    };

    const updateCell = (rowId, colKey, value) => {
        const newRows = rows.map(row => {
            if (row.id === rowId) {
                return {
                    ...row,
                    data: { ...row.data, [colKey]: value }
                };
            }
            return row;
        });
        setRows(newRows);
    };

    const tableColumns = [
        ...columns.map(col => ({
            title: col.name,
            dataIndex: ['data', col.key],
            key: col.key,
            render: (text, record) => (
                <Input
                    value={text}
                    onChange={(e) => updateCell(record.id, col.key, e.target.value)}
                    size="small"
                />
            )
        })),
        {
            title: 'Actions',
            key: 'actions',
            width: 80,
            fixed: 'right',
            render: (_, record) => (
                <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeRow(record.id)}
                    size="small"
                />
            )
        }
    ];

    return (
        <Form form={form} layout="vertical">
            <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Please enter a title' }]}
            >
                <Input placeholder="Enter spreadsheet title" />
            </Form.Item>

            <Form.Item label="Columns">
                <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                    <Input
                        placeholder="Add new column..."
                        value={newColumnName}
                        onChange={(e) => setNewColumnName(e.target.value)}
                        onPressEnter={addColumn}
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={addColumn}>
                        Add Column
                    </Button>
                </Space.Compact>
                <Space wrap>
                    {columns.map(col => (
                        <Tag
                            key={col.key}
                            closable
                            onClose={() => removeColumn(col.key)}
                            color="blue"
                        >
                            {col.name}
                        </Tag>
                    ))}
                </Space>
            </Form.Item>

            <Form.Item label="Data">
                <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={addRow}
                    style={{ marginBottom: 8, width: '100%' }}
                    disabled={columns.length === 0}
                >
                    Add Row
                </Button>
                <div style={{ overflow: 'auto', maxHeight: 400 }}>
                    {columns.length > 0 ? (
                        <AntTable
                            dataSource={rows}
                            columns={tableColumns}
                            pagination={false}
                            size="small"
                            rowKey="id"
                            scroll={{ x: 'max-content' }}
                        />
                    ) : (
                        <div style={{ textAlign: 'center', color: '#999', padding: 20, border: '1px dashed #d9d9d9', borderRadius: 4 }}>
                            Add columns first to create your spreadsheet
                        </div>
                    )}
                </div>
            </Form.Item>
            <Form.Item name="contentData" hidden>
                <Input />
            </Form.Item>
        </Form>
    );
};

export default ScratchpadPage;
