import { validateRole } from '../frontend/src/utils/roleValidation';
import { logger } from '../frontend/src/services/logger';

describe('Role Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should validate correct admin role data', () => {
    const adminData = {
      role: 'admin',
      permissions: ['manage_users'],
      metadata: {
        description: 'Full system administrator',
        scope: 'global',
        requiresApproval: false,
      },
    };

    const result = validateRole(adminData);
    expect(result.isValid).toBe(true);
    expect(result.errors).toBeNull();
  });

  test('should reject invalid role data', () => {
    const invalidData = {
      role: '',
      permissions: [],
      metadata: {
        description: 'Too short',
        scope: 'invalid',
        requiresApproval: 'not boolean',
      },
    };

    const result = validateRole(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(4);
  });

  test('should enforce required fields', () => {
    const missingData = {
      role: 'teacher',
      // Missing permissions and metadata
    };

    const result = validateRole(missingData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Missing required field: permissions');
  });

  test('should enforce role-specific rules', () => {
    const invalidAdminData = {
      role: 'admin',
      permissions: ['manage_users'],
      metadata: {
        description: 'Admin with wrong scope',
        scope: 'local', // Should be global
        requiresApproval: false,
      },
    };

    const result = validateRole(invalidAdminData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Admin role must have global scope');
  });

  test('should log validation errors', () => {
    const invalidData = {
      role: 'student',
      permissions: ['view_content'],
      metadata: {
        description: 'Student with wrong scope',
        scope: 'global', // Should be local
        requiresApproval: false,
      },
    };

    validateRole(invalidData);
    expect(logger.error).toHaveBeenCalledWith(
      'Role validation failed',
      expect.objectContaining({
        error: expect.any(String),
        roleData: invalidData,
      })
    );
  });
});