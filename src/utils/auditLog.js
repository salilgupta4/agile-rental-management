import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';

/**
 * Log an action to the audit trail
 * @param {string} module - The module where the action occurred (e.g., 'Products', 'Customers')
 * @param {string} action - The action performed (e.g., 'Create', 'Edit', 'Delete')
 * @param {string} description - Detailed description of what was done
 * @param {object} metadata - Optional additional data about the action
 */
export const logAudit = async (module, action, description, metadata = {}) => {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.warn('No authenticated user found for audit log');
            return;
        }

        const auditEntry = {
            module,
            action,
            description,
            userEmail: user.email,
            userId: user.uid,
            timestamp: new Date().toISOString(),
            metadata: metadata || {}
        };

        await addDoc(collection(db, 'auditLogs'), auditEntry);
    } catch (error) {
        console.error('Error logging audit trail:', error);
        // Don't throw - audit logging failure shouldn't break the main operation
    }
};

/**
 * Action constants for consistency
 */
export const AUDIT_ACTIONS = {
    CREATE: 'Create',
    EDIT: 'Edit',
    DELETE: 'Delete',
    UPDATE: 'Update',
    STATUS_CHANGE: 'Status Change',
    ROLE_CHANGE: 'Role Change',
    PERMISSION_CHANGE: 'Permission Change',
    PASSWORD_RESET: 'Password Reset'
};

/**
 * Module constants for consistency
 */
export const AUDIT_MODULES = {
    PRODUCTS: 'Products',
    WAREHOUSES: 'Warehouses',
    CUSTOMERS: 'Customers',
    PURCHASES: 'Purchases',
    TRANSFERS: 'Transfers',
    RETURNS: 'Returns',
    SALES: 'Sales',
    RENTAL_ORDERS: 'Rental Orders',
    USERS: 'User Management',
    SETTINGS: 'Settings'
};
