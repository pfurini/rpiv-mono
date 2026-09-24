// check-fork.mjs: typecheck the repo against a local pi fork build.
//
//   npm run check:fork                                   (whole tree)
//   npm run check:fork -- packages/<name> [packages/...]  (named packages only)
//
// Writes node_modules/.cache/pi-fork/tsconfig.json, which extends tsconfig.base.json
// and points every pi specifier at the fork's declarations, then runs `tsc --noEmit`
// on it. Read-only: no formatter runs and no source file is rewritten.
// scripts/pi-fork.mjs locates the fork (PI_FORK_DIR, default `../pi`).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { describeFork, forkTypePaths, loadFork, REPO_ROOT } from "./pi-fork.mjs";

function fail(message) {
	console.error(message);
	process.exit(1);
}

let fork;
try {
	fork = loadFork();
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
console.log(describeFork(fork));

const cacheDir = join(REPO_ROOT, "node_modules", ".cache", "pi-fork");
const configPath = join(cacheDir, "tsconfig.json");

const packageDirs = process.argv.slice(2).map((arg) => resolve(REPO_ROOT, arg));
for (const dir of packageDirs) {
	if (!existsSync(dir) || !statSync(dir).isDirectory()) fail(`not a directory: ${relative(REPO_ROOT, dir)}`);
}

const config = {
	extends: relative(cacheDir, join(REPO_ROOT, "tsconfig.base.json")),
	compilerOptions: { paths: forkTypePaths(fork) },
	// No arguments keeps the base include (the whole tree).
	...(packageDirs.length > 0 ? { include: packageDirs.map((dir) => `${relative(cacheDir, dir)}/**/*.ts`) } : {}),
};
mkdirSync(cacheDir, { recursive: true });
writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const result = spawnSync(process.execPath, [tsc, "--noEmit", "-p", configPath], { cwd: REPO_ROOT, stdio: "inherit" });
process.exit(result.status ?? 1);
