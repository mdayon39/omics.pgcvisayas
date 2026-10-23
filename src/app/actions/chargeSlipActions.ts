"use server";

import { revalidatePath } from "next/cache";
import {
  saveChargeSlip,
  updateChargeSlip,
  getAllChargeSlips,
} from "@/services/chargeSlipService";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import { logActivity } from "@/services/activityLogService";

export async function saveChargeSlipAction(
  slip: ChargeSlipRecord,
  userInfo?: { name: string; email: string },
) {
  try {
    const result = await saveChargeSlip(slip);

    // Log the activity
    await logActivity({
      userId: userInfo?.email || "system",
      userEmail: userInfo?.email || "system@pgc.admin",
      userName: userInfo?.name || "System",
      action: "GENERATE",
      entityType: "charge_slip",
      entityId: slip.referenceNumber || slip.id || "unknown",
      entityName: `Charge Slip for ${slip.projectId || "Unknown Project"}`,
      description: `Generated charge slip: ${slip.referenceNumber || slip.id}`,
      changesAfter: slip,
    });

    revalidatePath("/admin/charge-slips");
    revalidatePath("/admin/projects");
    return { success: true, data: result };
  } catch (error) {
    console.error("Error saving charge slip:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save charge slip",
    };
  }
}

export async function updateChargeSlipAction(
  id: string,
  updates: Partial<ChargeSlipRecord>,
  userInfo?: { name: string; email: string; role?: string },
) {
  try {
    await updateChargeSlip(id, updates, userInfo);

    // Log the activity
    await logActivity({
      userId: userInfo?.email || "system",
      userEmail: userInfo?.email || "system@pgc.admin",
      userName: userInfo?.name || "System",
      action: "UPDATE",
      entityType: "charge_slip",
      entityId: id,
      entityName: `Charge Slip ${id}`,
      description: `Updated charge slip: ${id}`,
      changesAfter: updates,
      changedFields: Object.keys(updates),
    });

    revalidatePath("/admin/charge-slips");
    revalidatePath(`/admin/charge-slips/${id}`);
    return { success: true };
  } catch (error) {
    console.error("Error updating charge slip:", error);
    return { success: false, error: "Failed to update charge slip" };
  }
}

export async function getChargeSlipsAction() {
  try {
    const chargeSlips = await getAllChargeSlips();
    return { success: true, data: chargeSlips };
  } catch (error) {
    console.error("Error fetching charge slips:", error);
    return { success: false, error: "Failed to fetch charge slips" };
  }
}
