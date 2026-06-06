import { spawnSync } from "node:child_process";

const npmCliPath = process.env.npm_execpath;

const runCommand = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    return 1;
  }
  return typeof result.status === "number" ? result.status : 1;
};

const runNpmScript = (scriptName) => {
  if (npmCliPath) {
    return runCommand(process.execPath, [npmCliPath, "run", scriptName]);
  }
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return runCommand(npmCommand, ["run", scriptName]);
};

const dockerCheck = spawnSync("docker", ["info"], { stdio: "ignore", shell: false });

if (dockerCheck.status === 0) {
  console.log("Docker daemon detected. Running db:init:docker.");
  process.exit(runNpmScript("db:init:docker"));
}

console.log("Docker daemon unavailable. Please start PostgreSQL manually.");
process.exit(1);
