import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function SettingsSchoolYearPage({
  searchParams,
}: {
  searchParams?: { updated?: string };
}) {
  await requirePermission("settings");

  const dateConfig = await prisma.appConfig.findUnique({ where: { key: "gradeAdvancementDate" } });
  const [currentMonth, currentDay] = (dateConfig?.value ?? "7/1").split("/").map(Number);

  const success = searchParams?.updated === "1";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">School Year</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure school year settings such as the annual grade advancement date.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-cyan-300">Grade Advancement Date</h3>
            <p className="text-sm text-slate-400">
              The date each year when student grades are advanced and grade-12 students are moved to graduated.
            </p>
          </div>
          {success && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              Date saved.
            </div>
          )}
        </div>

        <form action={saveAdvancementDate} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="month" className="block text-sm font-medium text-slate-300">
                Month
              </label>
              <select
                id="month"
                name="month"
                defaultValue={currentMonth}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
              >
                {MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="day" className="block text-sm font-medium text-slate-300">
                Day
              </label>
              <input
                id="day"
                name="day"
                type="number"
                min={1}
                max={31}
                defaultValue={currentDay}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Save Date
          </button>
        </form>
      </div>
    </div>
  );
}

async function saveAdvancementDate(formData: FormData) {
  "use server";

  const month = parseInt(formData.get("month") as string, 10);
  const day = parseInt(formData.get("day") as string, 10);

  if (isNaN(month) || month < 1 || month > 12 || isNaN(day) || day < 1 || day > 31) {
    redirect("/settings/school-year?updated=0");
  }

  await prisma.appConfig.upsert({
    where: { key: "gradeAdvancementDate" },
    update: { value: `${month}/${day}` },
    create: { key: "gradeAdvancementDate", value: `${month}/${day}` },
  });

  redirect("/settings/school-year?updated=1");
}
