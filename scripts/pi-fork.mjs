// pi-fork.mjs: resolves a local pi fork checkout for the opt-in fork runs.
//
//   npm run test:fork    (vitest.fork.config.mjs)
//   npm run check:fork   (scripts/check-fork.mjs)
//
// The root devDependencies pin pi at an exact published version. A developer who
// runs Pi from a fork checkout needs the same suite and typecheck against that
// fork's built packages. PI_FORK_DIR names the checkout; the default is `../pi`
// beside the repo root. The fork must be built (`npm run build` in the fork).
//
// This module owns the specifier table both runners share, so the test aliases
// and the typecheck paths cannot drift apart. The table mirrors the fork's
// extension loader aliases with one exception: the pi-ai root maps to the core
// entry, not to compat. test/setup.ts mocks the root and `/compat` as separate
// modules, and one shared file would merge the two mocks.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Workspace entries relative to the fork root: the paths the fork's loader aliases.
const WORKSPACE_ENTRIES = [
	["@earendil-works/pi-coding-agent", "packages/coding-agent/dist/index.js"],
	["@earendil-works/pi-tui", "packages/tui/dist/index.js"],
	["@earendil-works/pi-ai", "packages/ai/dist/index.js"],
	["@earendil-works/pi-ai/compat", "packages/ai/dist/compat.js"],
];

// Resolved from the coding-agent package, as the fork's loader resolves them.
const TYPEBOX_SPECIFIERS = ["typebox", "typebox/compile", "typebox/value"];

export function resolveForkDir(env = process.env) {
	return env.PI_FORK_DIR ? resolve(env.PI_FORK_DIR) : resolve(REPO_ROOT, "..", "pi");
}

function typesFor(runtimePath) {
	return runtimePath.endsWith(".mjs")
		? runtimePath.replace(/\.mjs$/, ".d.mts")
		: runtimePath.replace(/\.js$/, ".d.ts");
}

/**
 * Locate every shared entry in the fork. Throws with an actionable message when
 * the checkout is missing or unbuilt; callers decide how to surface it.
 */
export function loadFork(env = process.env) {
	const dir = resolveForkDir(env);
	const hint = `Set PI_FORK_DIR to a pi checkout and run \`npm run build\` there (resolved: ${dir}).`;
	const agentPackage = join(dir, "packages", "coding-agent", "package.json");
	if (!existsSync(agentPackage)) throw new Error(`pi fork not found. ${hint}`);

	const requireFromAgent = createRequire(agentPackage);
	const entries = [
		...WORKSPACE_ENTRIES.map(([specifier, path]) => [specifier, join(dir, path)]),
		...TYPEBOX_SPECIFIERS.map((specifier) => [specifier, requireFromAgent.resolve(specifier)]),
	].map(([specifier, runtime]) => ({ specifier, runtime, types: typesFor(runtime) }));

	const missing = entries.flatMap((e) => [e.runtime, e.types]).filter((path) => !existsSync(path));
	if (missing.length > 0) throw new Error(`pi fork is not built; missing ${missing.join(", ")}. ${hint}`);

	const { version } = JSON.parse(readFileSync(agentPackage, "utf-8"));
	return { dir, version, entries };
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Vite `resolve.alias` entries; anchored so `pi-ai` never captures `pi-ai/compat`. */
export function forkAliases(fork) {
	return fork.entries.map(({ specifier, runtime }) => ({
		find: new RegExp(`^${escapeRegExp(specifier)}$`),
		replacement: runtime,
	}));
}

/** tsconfig `compilerOptions.paths` pointing every specifier at the fork's declarations. */
export function forkTypePaths(fork) {
	return Object.fromEntries(fork.entries.map(({ specifier, types }) => [specifier, [types]]));
}

function git(dir, args) {
	try {
		return execFileSync("git", ["-C", dir, ...args], {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return undefined;
	}
}

/**
 * One-line banner naming what is under test, plus a warning when the build
 * predates the fork's HEAD commit (a stale dist tests old code).
 */
export function describeFork(fork) {
	const branch = git(fork.dir, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? "?";
	const sha = git(fork.dir, ["rev-parse", "--short", "HEAD"]) ?? "?";
	const banner = `pi fork: ${fork.dir} (${branch}@${sha}, pi-coding-agent ${fork.version})`;
	const headTime = Number(git(fork.dir, ["log", "-1", "--format=%ct"]));
	const builtTime = statSync(fork.entries[0].runtime).mtimeMs / 1000;
	if (Number.isFinite(headTime) && builtTime < headTime) {
		return `${banner}\nwarning: the fork's dist predates its HEAD commit; rebuild it to test current code.`;
	}
	return banner;
}
