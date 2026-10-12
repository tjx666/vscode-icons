/**
 * Regenerates `assets/language-registry.json` from the language contributions of the built-in extensions that ship
 * with VS Code.
 *
 * The vscode-icons icon theme keys most source files by VS Code language id (`languageIds`), not by extension: a
 * real VS Code install first resolves `.cjs` or `.env.local` to a language (`javascript`, `dotenv`) through its
 * language registry, then picks the icon for that id. This package has no language registry at runtime, so this
 * script snapshots the relevant part of it (every `extensions`, `filenames`, and basename-only `filenamePatterns`
 * entry whose language has a vendored icon) instead of hand-curating a table that inevitably drifts.
 *
 * Usage: `npm run update-language-registry [-- <path-to-VS-Code-app-root>]`. The default path is the macOS app
 * bundle's `Contents/Resources/app`; on other platforms pass the `resources/app` directory of a VS Code install.
 * Rerun it after `update-icons` (new language icons) or when a new VS Code release adds language contributions.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(packageRoot, 'assets/manifest.json');
const registryPath = join(packageRoot, 'assets/language-registry.json');

const DEFAULT_VSCODE_APP_ROOT = '/Applications/Visual Studio Code.app/Contents/Resources/app';

interface LanguageContribution {
    id: string;
    extensions?: string[];
    filenames?: string[];
    filenamePatterns?: string[];
}

interface ExtensionPackageJson {
    contributes?: { languages?: LanguageContribution[] };
}

interface LanguageRegistry {
    vscodeVersion: string;
    /** Lowercased extension without its leading dot (`cjs`, `hpp.in`) to language id. */
    extensions: Record<string, string>;
    /** Lowercased exact file name to language id. */
    filenames: Record<string, string>;
    /** Lowercased basename glob (`.env.*`, `dockerfile.*`) to language id, in contribution order. */
    filenamePatterns: [pattern: string, languageId: string][];
}

const GLOB_CHARACTERS = /[*?[\]{}]/;

/**
 * VS Code matches a `filenamePatterns` entry without a path separator against the basename, and one starting with
 * `**\/` against any path suffix. Only patterns that reduce to a basename glob are usable here, because callers pass
 * a file name rather than a path; directory-scoped ones such as `**\/.git/config` are dropped.
 */
function toBasenamePattern(pattern: string): string | undefined {
    const withoutAnyDirectory = pattern.startsWith('**/') ? pattern.slice(3) : pattern;
    return withoutAnyDirectory.includes('/') ? undefined : withoutAnyDirectory.toLowerCase();
}

async function main(): Promise<void> {
    const appRoot = process.argv[2] ?? DEFAULT_VSCODE_APP_ROOT;
    const extensionsRoot = join(appRoot, 'extensions');
    if (!existsSync(extensionsRoot)) {
        throw new Error(`No VS Code built-in extensions found at ${extensionsRoot}; pass the VS Code app root.`);
    }
    const { version } = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8')) as { version: string };
    const { languageIcons } = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        languageIcons: Record<string, string>;
    };

    const registry: LanguageRegistry = { vscodeVersion: version, extensions: {}, filenames: {}, filenamePatterns: [] };
    const seenPatterns = new Set<string>();
    // Sorted so the output is stable regardless of directory enumeration order; the first contribution wins a
    // conflicting key, matching VS Code's first-registered-wins behavior closely enough for icon purposes.
    for (const directory of (await readdir(extensionsRoot)).toSorted()) {
        const packageJsonPath = join(extensionsRoot, directory, 'package.json');
        if (!existsSync(packageJsonPath)) continue;
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as ExtensionPackageJson;
        for (const language of packageJson.contributes?.languages ?? []) {
            if (!languageIcons[language.id]) continue;
            for (const extension of language.extensions ?? []) {
                if (GLOB_CHARACTERS.test(extension)) continue;
                const key = extension.replace(/^\./, '').toLowerCase();
                registry.extensions[key] ??= language.id;
            }
            for (const filename of language.filenames ?? []) {
                registry.filenames[filename.toLowerCase()] ??= language.id;
            }
            for (const pattern of language.filenamePatterns ?? []) {
                const basenamePattern = toBasenamePattern(pattern);
                if (!basenamePattern || seenPatterns.has(basenamePattern)) continue;
                seenPatterns.add(basenamePattern);
                registry.filenamePatterns.push([basenamePattern, language.id]);
            }
        }
    }

    registry.extensions = Object.fromEntries(Object.entries(registry.extensions).toSorted(([a], [b]) => a.localeCompare(b)));
    registry.filenames = Object.fromEntries(Object.entries(registry.filenames).toSorted(([a], [b]) => a.localeCompare(b)));
    await writeFile(registryPath, `${JSON.stringify(registry, null, 4)}\n`, 'utf8');
    console.log(
        `VS Code ${version}: extensions=${Object.keys(registry.extensions).length} filenames=${Object.keys(registry.filenames).length} filenamePatterns=${registry.filenamePatterns.length}`,
    );
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
