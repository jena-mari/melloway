import { spawn } from "node:child_process";
const api = spawn(
  process.execPath,
  ["--watch", "--experimental-strip-types", "--env-file-if-exists=.env", "server/index.js"],
  { stdio: "inherit" },
);
const web = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
  { stdio: "inherit" },
);
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
api.on("exit", (code) => {
  if (!closing && code) stop(code);
});
web.on("exit", (code) => {
  if (!closing) stop(code || 0);
});
