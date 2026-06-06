import { spawnSync } from "node:child_process";

const scripts = process.argv.slice(2);

if (scripts.length === 0) {
  console.error("No npm scripts provided.");
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath;

const runScript = (scriptName) => {
  if (npmExecPath) {
    const result = spawnSync(process.execPath, [npmExecPath, "run", scriptName], {
      stdio: "inherit",
      shell: false,
    });
    if (result.error) {
      console.error(`Failed to run script '${scriptName}': ${result.error.message}`);
      return 1;
    }
    return typeof result.status === "number" ? result.status : 1;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", scriptName], {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`Failed to run script '${scriptName}': ${result.error.message}`);
    return 1;
  }
  return typeof result.status === "number" ? result.status : 1;
};

for (const scriptName of scripts) {
  const status = runScript(scriptName);
  if (status !== 0) {
    process.exit(status);
  }
}

process.exit(0);
