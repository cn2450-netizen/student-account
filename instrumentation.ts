// Runs once when the server process starts. Used to drive scheduled
// database backups without a separate systemd timer — see src/lib/backup.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runBackup } = await import("@/lib/backup");
  const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  const INITIAL_DELAY_MS = 60 * 1000; // let the app finish booting first

  const check = () => {
    runBackup({ force: false }).catch((err) => {
      console.error("[backup] scheduled check failed:", err);
    });
  };

  setTimeout(() => {
    check();
    setInterval(check, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}
