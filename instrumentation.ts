// Runs once when the server process starts. Used to drive periodic
// background jobs (scheduled database backups, automatic grade
// advancement) without a separate systemd timer.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runBackup } = await import("@/lib/backup");
  const { runGradeAdvancement } = await import("@/lib/gradeAdvancement");
  const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  const INITIAL_DELAY_MS = 60 * 1000; // let the app finish booting first

  const check = () => {
    runBackup({ force: false }).catch((err) => {
      console.error("[backup] scheduled check failed:", err);
    });
    runGradeAdvancement({ force: false }).then((result) => {
      if (!result.skipped) {
        console.log(`[grade-advancement] ran automatically: ${result.advanced} advanced, ${result.graduated} graduated`);
      }
    }).catch((err) => {
      console.error("[grade-advancement] scheduled check failed:", err);
    });
  };

  setTimeout(() => {
    check();
    setInterval(check, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}
