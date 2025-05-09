// services/auth-service/utils/roleValidation.ts
import { RoleMetadata, ValidationResult } from "../types/roles";

/**
 * Validates role metadata structure and values
 * @param metadata - The role metadata to validate
 * @returns ValidationResult with success status and errors if any
 */
export function validateRoleMetadata(metadata: RoleMetadata): ValidationResult {
  const errors: string[] = [];

  // Required fields validation
  if (!metadata.role) {
    errors.push("Role is required");
  }

  if (!metadata.permissions) {
    errors.push("Permissions are required");
  }

  if (metadata.role && !["student", "teacher", "admin"].includes(metadata.role)) {
    errors.push("Invalid role value");
  }

  // Permissions structure validation
  if (metadata.permissions) {
    if (!Array.isArray(metadata.permissions)) {
      errors.push("Permissions must be an array");
    } else {
      metadata.permissions.forEach((permission, index) => {
        if (typeof permission !== "string") {
          errors.push(`Permission at index ${index} must be a string`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}