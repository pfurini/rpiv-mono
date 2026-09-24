// vitest.fork.config.mjs: the repo suite against a local pi fork build.
//
//   npm run test:fork [-- <vitest filters>]
//
// Reuses vitest.config.ts unchanged and only redirects the pi specifiers to the
// fork's built packages. scripts/pi-fork.mjs locates the fork (PI_FORK_DIR, default
// `../pi`) and owns the specifier table.

import { mergeConfig } from "vitest/config";
import { describeFork, forkAliases, loadFork } from "./scripts/pi-fork.mjs";
import base from "./vitest.config.ts";

const fork = loadFork();
console.log(describeFork(fork));

export default mergeConfig(base, { resolve: { alias: forkAliases(fork) } });
