import { prisma } from "./prisma";

// Advances every active student's numeric grade by 1 on or after the
// configured advancement date (default July 1). Grade-12 students are
// marked as graduated instead of moving to grade 13. Stores the
// advancement year in AppConfig to prevent double-running within the
// same year. Called both by the manual "Advance Grades" button
// (actions.ts, force=true, permission-gated) and by the automatic
// periodic check in instrumentation.ts (force=false).
export async function runGradeAdvancement(
  opts: { force: boolean },
): Promise<{ advanced: number; graduated: number; skipped?: string }> {
  const now = new Date();
  const currentYear = now.getFullYear();

  const [dateConfig, yearConfig] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: "gradeAdvancementDate" } }),
    prisma.appConfig.findUnique({ where: { key: "gradeAdvancementYear" } }),
  ]);

  const [configMonth, configDay] = (dateConfig?.value ?? "7/1").split("/").map(Number);
  const advancementDate = new Date(currentYear, configMonth - 1, configDay);
  const advancementLabel = advancementDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  if (!opts.force && now < advancementDate) {
    return {
      advanced: 0,
      graduated: 0,
      skipped: `Grade advancement runs on or after ${advancementLabel}. Current date is ${now.toLocaleDateString()}.`,
    };
  }

  if (!opts.force && yearConfig?.value === String(currentYear)) {
    return { advanced: 0, graduated: 0, skipped: `Grades have already been advanced for ${currentYear}.` };
  }

  const students = await prisma.student.findMany({
    where: { graduated: false },
    select: { id: true, grade: true },
  });

  let advanced = 0;
  let graduated = 0;

  await prisma.$transaction(async (tx) => {
    for (const s of students) {
      const gradeNum = parseInt(s.grade ?? "", 10);
      if (isNaN(gradeNum)) continue; // non-numeric grade — skip

      if (gradeNum >= 12) {
        await tx.student.update({
          where: { id: s.id },
          data: { graduated: true, graduatedAt: now },
        });
        graduated++;
      } else {
        await tx.student.update({
          where: { id: s.id },
          data: { grade: String(gradeNum + 1) },
        });
        advanced++;
      }
    }

    await tx.appConfig.upsert({
      where: { key: "gradeAdvancementYear" },
      update: { value: String(currentYear) },
      create: { key: "gradeAdvancementYear", value: String(currentYear) },
    });
  });

  return { advanced, graduated };
}
