import "dotenv/config";

import { runRepairNotes } from "./cli";

runRepairNotes(process.argv.slice(2), process.env, {
  write: (text) => process.stdout.write(text),
  error: (text) => process.stderr.write(text),
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
