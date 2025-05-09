// Role validation utilities
const validRoles = ['teacher', 'student', 'admin'];

function validateRole(role) {
  return validRoles.includes(role);
}

function validateRoleMetadata(metadata) {
  const errors = [];
  
  if (!metadata) {
    errors.push('Role metadata is required');
    return { valid: false, errors };
  }

  if (!metadata.role) {
    errors.push('Role is required in metadata');
  } else if (!validateRole(metadata.role)) {
    errors.push(`Invalid role: ${metadata.role}. Valid roles are: ${validRoles.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateRole,
  validateRoleMetadata
};