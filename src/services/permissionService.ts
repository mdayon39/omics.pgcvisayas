/**
 * Permission Service
 * Handles permission checks and role management
 */

import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  UserRole,
  RolePermissions,
  DEFAULT_ROLE_PERMISSIONS,
} from "@/types/Permissions";

const ROLES_COLLECTION = "rolePermissions";

/**
 * Get permissions for a specific role
 * Merges with default permissions to ensure all modules are present
 */
export async function getRolePermissions(
  role: UserRole,
): Promise<RolePermissions> {
  try {
    const docRef = doc(db, ROLES_COLLECTION, role);
    const docSnap = await getDoc(docRef);

    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role];

    if (docSnap.exists()) {
      const storedPerms = docSnap.data() as Partial<RolePermissions>;
      // Merge stored permissions with defaults to ensure new modules are included
      const mergedPerms = Object.keys(defaultPerms).reduce((result, module) => {
        const moduleKey = module as keyof RolePermissions;
        result[moduleKey] = {
          ...defaultPerms[moduleKey],
          ...(storedPerms[moduleKey] || {}),
        };
        return result;
      }, {} as RolePermissions);

      // Check if we need to update Firestore with missing modules
      const hasAllModules = Object.keys(defaultPerms).every(
        (key) => key in storedPerms,
      );
      if (!hasAllModules) {
        // Update Firestore with merged permissions
        await updateDoc(docRef, {
          ...mergedPerms,
          updatedAt: serverTimestamp(),
        });
      }

      return mergedPerms;
    } else {
      // Initialize with default permissions if not exists
      await setDoc(docRef, {
        ...defaultPerms,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return defaultPerms;
    }
  } catch (error) {
    console.error(`Error fetching permissions for ${role}:`, error);
    return DEFAULT_ROLE_PERMISSIONS[role];
  }
}

/**
 * Update permissions for a specific role
 */
export async function updateRolePermissions(
  role: UserRole,
  permissions: RolePermissions,
): Promise<void> {
  try {
    const docRef = doc(db, ROLES_COLLECTION, role);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        ...permissions,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Create the document if it doesn't exist
      await setDoc(docRef, {
        ...permissions,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error(`Error updating permissions for ${role}:`, error);
    throw error;
  }
}

/**
 * Check if a user has permission to perform an action on a module
 */
export async function hasPermission(
  userRole: UserRole,
  module: keyof RolePermissions,
  action: keyof RolePermissions[keyof RolePermissions],
): Promise<boolean> {
  try {
    const permissions = await getRolePermissions(userRole);
    return permissions[module][action];
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * Check if user can access a module (has at least view permission)
 */
export async function canAccessModule(
  userRole: UserRole,
  module: keyof RolePermissions,
): Promise<boolean> {
  return hasPermission(userRole, module, "view");
}
