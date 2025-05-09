// services/auth-service/types/roles.ts

/**
 * Defines the structure of role metadata in the system
 */
export interface RoleMetadata {
  role: "student" | "teacher" | "admin";
  permissions: string[];
  additionalData?: Record<string, unknown>;
}

/**
 * Defines available system roles
 */
export type SystemRole = "student" | "teacher" | "admin";

/**
 * Defines the structure of a permission in the system
 */
export interface Permission {
  name: string;
  description: string;
}

/**
 * Defines the structure of a role assignment
 */
export interface RoleAssignment {
  userId: string;
  role: SystemRole;
  assignedAt: Date;
  assignedBy: string;
}

/**
 * Defines the structure of a role validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}