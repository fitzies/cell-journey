import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";

function tailscaleIPv4() {
  try {
    const output = execFileSync("tailscale", ["ip", "-4"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .map((value) => value.trim())
      .find((value) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value));
  } catch {
    return undefined;
  }
}

const forwardedArgs = process.argv.slice(2);
const hasHostnameArg = forwardedArgs.some(
  (arg) => arg === "--hostname" || arg === "-H" || arg.startsWith("--hostname="),
);
const devHostname = process.env.WEB_DEV_HOST || tailscaleIPv4() || "127.0.0.1";
const hostnameArgs = hasHostnameArg ? [] : ["--hostname", devHostname];
const nextBin = resolve(process.cwd(), "../../node_modules/.bin/next");
const child = spawn(nextBin, ["dev", ...hostnameArgs, ...forwardedArgs], {
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start Next.js: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
