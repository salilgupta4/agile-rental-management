import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_ROLE_PERMISSIONS, MODULES, PERMISSIONS } from '../constants/permissions';

export const usePermissions = () => {
  const { user, userRole } = useAuth();

  const permissions = useMemo(() => {
    // Get permissions from user's custom permissions or default role permissions
    const userPermissions = user?.customPermissions || DEFAULT_ROLE_PERMISSIONS[userRole] || {};
    return userPermissions;
  }, [user, userRole]);

  const hasPermission = (module, permission) => {
    const modulePermissions = permissions[module] || [];
    return modulePermissions.includes(permission);
  };

  const canView = (module) => hasPermission(module, PERMISSIONS.VIEW);
  const canCreate = (module) => hasPermission(module, PERMISSIONS.CREATE);
  const canEdit = (module) => hasPermission(module, PERMISSIONS.EDIT);
  const canDelete = (module) => hasPermission(module, PERMISSIONS.DELETE);

  return {
    permissions,
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete
  };
};
