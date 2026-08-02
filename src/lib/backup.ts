import { spawn } from "child_process";
import { createGzip } from "zlib";
import { createWriteStream } from "fs";
import { readdir, stat, unlink, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";

const CONFIG_KEYS = [
  "backup.destinationPath",
  "backup.scheduleEnabled",
  "backup.frequencyHours",
  "backup.retentionCount",
  "backup.lastRunAt",
  "backup.lastRunStatus",
  "backup.lastRunError",
] as const;

export const DEFAULT_FREQUENCY_HOURS = 24;
export const DEFAULT_RETENTION_COUNT = 30;

export type BackupConfig = {
  destinationPath: string;
  scheduleEnabled: boolean;
  frequencyHours: number;
  retentionCount: number;
  lastRunAt: Date | null;
  lastRunStatus: "success" | "error" | "";
  lastRunError: string;
};

export async function getBackupConfig(): Promise<BackupConfig> {
  const rows = await prisma.appConfig.findMany({ where: { key: { in: [...CONFIG_KEYS] } } });
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    destinationPath: m["backup.destinationPath"] ?? "",
    scheduleEnabled: m["backup.scheduleEnabled"] === "true",
    frequencyHours: parseInt(m["backup.frequencyHours"] ?? String(DEFAULT_FREQUENCY_HOURS), 10),
    retentionCount: parseInt(m["backup.retentionCount"] ?? String(DEFAULT_RETENTION_COUNT), 10),
    lastRunAt: m["backup.lastRunAt"] ? new Date(m["backup.lastRunAt"]) : null,
    lastRunStatus: (m["backup.lastRunStatus"] as BackupConfig["lastRunStatus"]) ?? "",
    lastRunError: m["backup.lastRunError"] ?? "",
  };
}

export async function saveBackupSchedule(opts: {
  destinationPath: string;
  scheduleEnabled: boolean;
  frequencyHours: number;
  retentionCount: number;
}): Promise<void> {
  const fields: Record<string, string> = {
    "backup.destinationPath": opts.destinationPath,
    "backup.scheduleEnabled": opts.scheduleEnabled ? "true" : "false",
    "backup.frequencyHours": String(opts.frequencyHours),
    "backup.retentionCount": String(opts.retentionCount),
  };
  await Promise.all(
    Object.entries(fields).map(([key, value]) =>
      prisma.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
}

async function setBackupStatus(status: { lastRunAt: Date; lastRunStatus: "success" | "error"; lastRunError: string }) {
  const fields: Record<string, string> = {
    "backup.lastRunAt": status.lastRunAt.toISOString(),
    "backup.lastRunStatus": status.lastRunStatus,
    "backup.lastRunError": status.lastRunError,
  };
  await Promise.all(
    Object.entries(fields).map(([key, value]) =>
      prisma.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
}

export type BackupFile = { name: string; size: number; mtime: Date };

export async function listBackupFiles(destinationPath: string): Promise<BackupFile[]> {
  if (!destinationPath) return [];
  try {
    const entries = await readdir(destinationPath);
    const files = await Promise.all(
      entries
        .filter((f) => f.endsWith(".sql.gz"))
        .map(async (f) => {
          const s = await stat(path.join(destinationPath, f));
          return { name: f, size: s.size, mtime: s.mtime };
        }),
    );
    return files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

function dumpDatabase(destinationPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `moneyfinder-${timestamp}.sql.gz`;
    const filePath = path.join(destinationPath, filename);

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      reject(new Error("DATABASE_URL is not set"));
      return;
    }

    const dump = spawn("pg_dump", [databaseUrl]);
    const gzip = createGzip();
    const out = createWriteStream(filePath);

    let stderr = "";
    let dumpExitCode: number | null = null;
    let outFinished = false;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const maybeSucceed = () => {
      if (settled || dumpExitCode !== 0 || !outFinished) return;
      settled = true;
      resolve(filename);
    };

    dump.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    dump.on("error", (err) => fail(new Error(`pg_dump failed to start: ${err.message}`)));
    dump.on("close", (code) => {
      dumpExitCode = code ?? -1;
      if (dumpExitCode !== 0) {
        fail(new Error(stderr.trim() || `pg_dump exited with code ${dumpExitCode}`));
        return;
      }
      maybeSucceed();
    });

    out.on("error", fail);
    out.on("finish", () => {
      outFinished = true;
      maybeSucceed();
    });

    dump.stdout.pipe(gzip).pipe(out);
  });
}

async function applyRetention(destinationPath: string, retentionCount: number): Promise<void> {
  const files = await listBackupFiles(destinationPath);
  const excess = files.slice(retentionCount);
  for (const f of excess) {
    await unlink(path.join(destinationPath, f.name)).catch(() => { /* best-effort cleanup */ });
  }
}

function isDue(cfg: BackupConfig): boolean {
  if (!cfg.scheduleEnabled) return false;
  if (!cfg.lastRunAt) return true;
  const dueMs = cfg.frequencyHours * 60 * 60 * 1000;
  return Date.now() - cfg.lastRunAt.getTime() >= dueMs;
}

export async function runBackup(opts: { force: boolean }): Promise<{
  success: boolean;
  error?: string;
  filename?: string;
  skipped?: boolean;
}> {
  const cfg = await getBackupConfig();

  if (!opts.force && !isDue(cfg)) {
    return { success: true, skipped: true };
  }

  if (!cfg.destinationPath) {
    return { success: false, error: "No backup destination configured" };
  }

  try {
    await mkdir(cfg.destinationPath, { recursive: true });
    const filename = await dumpDatabase(cfg.destinationPath);
    await applyRetention(cfg.destinationPath, cfg.retentionCount);
    await setBackupStatus({ lastRunAt: new Date(), lastRunStatus: "success", lastRunError: "" });
    return { success: true, filename };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await setBackupStatus({ lastRunAt: new Date(), lastRunStatus: "error", lastRunError: message });
    return { success: false, error: message };
  }
}
