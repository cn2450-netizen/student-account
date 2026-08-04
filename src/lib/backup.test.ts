import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

// ── Module mocks (hoisted before imports) ────────────────────────────────────
// mockDeep<PrismaClient>() gives every model method (however generic its
// signature) a real vitest mock fn underneath, which vi.mocked()/manual
// typing can't do for Prisma's generic client methods.

vi.mock("@/lib/prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("fs", () => ({
  createWriteStream: vi.fn(),
}));

vi.mock("zlib", () => ({
  createGzip: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// ── Imports (resolved against mocks above) ───────────────────────────────────

import { prisma } from "@/lib/prisma";
import { readdir, stat, unlink, mkdir } from "fs/promises";
import { createWriteStream } from "fs";
import { createGzip } from "zlib";
import { spawn } from "child_process";
import {
  getBackupConfig,
  saveBackupSchedule,
  listBackupFiles,
  runBackup,
  DEFAULT_FREQUENCY_HOURS,
  DEFAULT_RETENTION_COUNT,
} from "./backup";

const mp = prisma as unknown as DeepMockProxy<PrismaClient>;

// ── Fake child_process / stream helpers ───────────────────────────────────────

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
}

// Events must only fire *after* dumpDatabase() has actually called spawn()
// and attached its listeners — scheduling the emission inside spawn's own
// mock implementation (rather than before spawn is even invoked) guarantees
// that ordering regardless of how many awaits precede the spawn() call.
function mockSuccessfulDump() {
  const out = new PassThrough();
  vi.mocked(createGzip).mockReturnValue(new PassThrough() as never);
  vi.mocked(createWriteStream).mockReturnValue(out as never);

  vi.mocked(spawn).mockImplementation(() => {
    const fake = new FakeChildProcess();
    queueMicrotask(() => {
      fake.stdout.end();
      out.emit("finish");
      fake.emit("close", 0);
    });
    return fake as never;
  });
}

function mockFailedDump(stderrText: string, exitCode = 1) {
  vi.mocked(createGzip).mockReturnValue(new PassThrough() as never);
  vi.mocked(createWriteStream).mockReturnValue(new PassThrough() as never);

  vi.mocked(spawn).mockImplementation(() => {
    const fake = new FakeChildProcess();
    queueMicrotask(() => {
      fake.stderr.emit("data", Buffer.from(stderrText));
      fake.emit("close", exitCode);
    });
    return fake as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/moneyfinder";
});

// ─────────────────────────────────────────────────────────────────────────────
// getBackupConfig() / saveBackupSchedule()
// ─────────────────────────────────────────────────────────────────────────────

describe("getBackupConfig()", () => {
  it("returns defaults when no config exists", async () => {
    mp.appConfig.findMany.mockResolvedValue([]);
    const cfg = await getBackupConfig();
    expect(cfg).toEqual({
      destinationPath: "",
      scheduleEnabled: false,
      frequencyHours: DEFAULT_FREQUENCY_HOURS,
      retentionCount: DEFAULT_RETENTION_COUNT,
      lastRunAt: null,
      lastRunStatus: "",
      lastRunError: "",
    });
  });

  it("reads saved values from AppConfig", async () => {
    mp.appConfig.findMany.mockResolvedValue([
      { key: "backup.destinationPath", value: "/mnt/backup" },
      { key: "backup.scheduleEnabled", value: "true" },
      { key: "backup.frequencyHours", value: "12" },
      { key: "backup.retentionCount", value: "10" },
      { key: "backup.lastRunAt", value: "2026-01-01T00:00:00.000Z" },
      { key: "backup.lastRunStatus", value: "success" },
    ] as never);
    const cfg = await getBackupConfig();
    expect(cfg.destinationPath).toBe("/mnt/backup");
    expect(cfg.scheduleEnabled).toBe(true);
    expect(cfg.frequencyHours).toBe(12);
    expect(cfg.retentionCount).toBe(10);
    expect(cfg.lastRunAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(cfg.lastRunStatus).toBe("success");
  });
});

describe("saveBackupSchedule()", () => {
  it("upserts all four config keys", async () => {
    mp.appConfig.upsert.mockResolvedValue({} as never);
    await saveBackupSchedule({
      destinationPath: "/mnt/backup",
      scheduleEnabled: true,
      frequencyHours: 24,
      retentionCount: 30,
    });
    expect(mp.appConfig.upsert).toHaveBeenCalledTimes(4);
    expect(mp.appConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "backup.destinationPath" }, update: { value: "/mnt/backup" } }),
    );
    expect(mp.appConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "backup.scheduleEnabled" }, update: { value: "true" } }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listBackupFiles()
// ─────────────────────────────────────────────────────────────────────────────

describe("listBackupFiles()", () => {
  it("returns an empty array when destinationPath is blank", async () => {
    expect(await listBackupFiles("")).toEqual([]);
  });

  it("returns an empty array when the directory can't be read", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));
    expect(await listBackupFiles("/mnt/missing")).toEqual([]);
  });

  it("only includes .sql.gz files, sorted newest first", async () => {
    vi.mocked(readdir).mockResolvedValue(["a.sql.gz", "b.sql.gz", "readme.txt"] as never);
    vi.mocked(stat).mockImplementation(async (p) => {
      const name = String(p);
      const mtime = name.includes("a.sql.gz") ? new Date("2026-01-01") : new Date("2026-02-01");
      return { size: 100, mtime } as never;
    });

    const files = await listBackupFiles("/mnt/backup");
    expect(files.map((f) => f.name)).toEqual(["b.sql.gz", "a.sql.gz"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runBackup()
// ─────────────────────────────────────────────────────────────────────────────

describe("runBackup()", () => {
  beforeEach(() => {
    vi.mocked(mkdir).mockResolvedValue(undefined as never);
    vi.mocked(readdir).mockResolvedValue([] as never);
    mp.appConfig.upsert.mockResolvedValue({} as never);
  });

  it("skips when not forced, schedule disabled", async () => {
    mp.appConfig.findMany.mockResolvedValue([{ key: "backup.scheduleEnabled", value: "false" }] as never);
    const result = await runBackup({ force: false });
    expect(result).toEqual({ success: true, skipped: true });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("skips when scheduled but not due yet", async () => {
    mp.appConfig.findMany.mockResolvedValue([
      { key: "backup.scheduleEnabled", value: "true" },
      { key: "backup.frequencyHours", value: "24" },
      { key: "backup.lastRunAt", value: new Date().toISOString() },
    ] as never);
    const result = await runBackup({ force: false });
    expect(result).toEqual({ success: true, skipped: true });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("runs when scheduled and due", async () => {
    mp.appConfig.findMany.mockResolvedValue([
      { key: "backup.scheduleEnabled", value: "true" },
      { key: "backup.frequencyHours", value: "24" },
      { key: "backup.lastRunAt", value: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
      { key: "backup.destinationPath", value: "/mnt/backup" },
    ] as never);
    mockSuccessfulDump();

    const result = await runBackup({ force: false });
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^moneyfinder-.*\.sql\.gz$/);
  });

  it("always runs when forced, regardless of schedule state", async () => {
    mp.appConfig.findMany.mockResolvedValue([
      { key: "backup.scheduleEnabled", value: "false" },
      { key: "backup.destinationPath", value: "/mnt/backup" },
    ] as never);
    mockSuccessfulDump();

    const result = await runBackup({ force: true });
    expect(result.success).toBe(true);
  });

  it("errors when forced but no destination is configured", async () => {
    mp.appConfig.findMany.mockResolvedValue([]);
    const result = await runBackup({ force: true });
    expect(result).toEqual({ success: false, error: "No backup destination configured" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("records failure status when pg_dump exits non-zero", async () => {
    mp.appConfig.findMany.mockResolvedValue([{ key: "backup.destinationPath", value: "/mnt/backup" }] as never);
    mockFailedDump("connection refused", 1);

    const result = await runBackup({ force: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
    expect(mp.appConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "backup.lastRunStatus" }, update: { value: "error" } }),
    );
  });

  it("applies retention, deleting files beyond the configured count", async () => {
    mp.appConfig.findMany.mockResolvedValue([
      { key: "backup.destinationPath", value: "/mnt/backup" },
      { key: "backup.retentionCount", value: "2" },
    ] as never);
    mockSuccessfulDump();

    vi.mocked(readdir).mockResolvedValue(["old1.sql.gz", "old2.sql.gz", "old3.sql.gz"] as never);
    vi.mocked(stat).mockImplementation(async (p) => {
      const name = String(p);
      const order = name.includes("old1") ? 3 : name.includes("old2") ? 2 : 1;
      return { size: 100, mtime: new Date(2026, 0, order) } as never;
    });
    vi.mocked(unlink).mockResolvedValue(undefined as never);

    await runBackup({ force: true });

    // Newest 2 kept (old1, old2), oldest (old3) deleted.
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(vi.mocked(unlink).mock.calls[0][0]).toContain("old3.sql.gz");
  });
});
