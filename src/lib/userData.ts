// Xử lý khi chủ tài khoản gỡ app hoặc yêu cầu xoá dữ liệu (callback từ Threads).
import crypto from "node:crypto";
import { db, must, kvGet, kvSet } from "./db";
import { getSettings, updateSettings } from "./settings";
import { tokenStore } from "./store";
import { log } from "./activity";

export interface DeletionRecord {
  code: string;
  requestedAt: string;
  completedAt?: string;
  status: "completed" | "no_data";
  removed: string[];
}

/** Gỡ app: thu hồi kết nối bot (xoá token) nếu đúng tài khoản đang chạy bot. */
export async function handleUninstall(userId: string): Promise<boolean> {
  const t = await tokenStore.get();
  if (!t || t.userId !== userId) return false;
  must(await db().from("threads_token").delete().eq("id", 1));
  await log("auth", `@${t.username} đã gỡ app trên Threads — bot ngừng kết nối`);
  return true;
}

/** Xoá dữ liệu của tài khoản Threads này mà bot đang lưu. Trả về mã xác nhận để tra cứu. */
export async function handleDataDeletion(userId: string): Promise<DeletionRecord> {
  const code = "DEL" + crypto.randomBytes(6).toString("hex").toUpperCase();
  const removed: string[] = [];

  const t = await tokenStore.get();
  if (t?.userId === userId) {
    must(await db().from("threads_token").delete().eq("id", 1));
    removed.push("access token Threads");
    // Số liệu insights là số liệu tài khoản của chính người này
    must(await db().from("insights_snapshots").delete().gte("id", 0));
    removed.push("số liệu insights");
    const s = await getSettings();
    if (s.voiceSummary || s.voiceSamples.length) {
      await updateSettings({ voiceSummary: "", voiceSamples: [] });
      removed.push("phân tích giọng văn và bài mẫu");
    }
  }
  const owner = await kvGet<{ userId: string } | null>("dashboard_owner", null);
  if (owner?.userId === userId) {
    must(await db().from("kv").delete().eq("key", "dashboard_owner"));
    removed.push("quyền chủ dashboard");
  }

  const record: DeletionRecord = {
    code,
    requestedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: removed.length ? "completed" : "no_data",
    removed,
  };
  const all = await kvGet<Record<string, DeletionRecord>>("deletion_requests", {});
  all[code] = record;
  await kvSet("deletion_requests", all);
  await log("auth", `Yêu cầu xoá dữ liệu ${code}: ${removed.length ? "đã xoá " + removed.join(", ") : "không có dữ liệu"}`);
  return record;
}

export async function getDeletionRecord(code: string): Promise<DeletionRecord | null> {
  const all = await kvGet<Record<string, DeletionRecord>>("deletion_requests", {});
  return all[code.toUpperCase()] ?? null;
}
