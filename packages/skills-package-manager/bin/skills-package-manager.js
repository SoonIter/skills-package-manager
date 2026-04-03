#!/usr/bin/env node
import { runCli, isSpmError, formatErrorForDisplay, getExitCode } from "../dist/index.js";

runCli(process.argv).catch((error) => {
    if (isSpmError(error)) {
        console.error(formatErrorForDisplay(error));
        process.exit(getExitCode(error));
    }
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
