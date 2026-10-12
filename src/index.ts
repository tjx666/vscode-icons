import languageRegistryJson from '../assets/language-registry.json' with { type: 'json' };
import manifestJson from '../assets/manifest.json' with { type: 'json' };

import {
    EXTENSION_LANGUAGE_BRIDGE,
    FILENAME_LANGUAGE_BRIDGE,
} from './extension-language-bridge.js';

/**
 * The subset of the upstream `vscode-icons` icon-theme manifest (see `scripts/update-icons.ts`) this package
 * actually consumes, already flattened to `{ lookupKey: iconFilename }` by the update script.
 */
interface VscodeIconsManifest {
    version: string;
    iconCount: number;
    defaultFile: string;
    defaultFolder: string;
    defaultFolderExpanded: string;
    fileNames: Record<string, string>;
    fileExtensions: Record<string, string>;
    languageIcons: Record<string, string>;
    folderNames: Record<string, string>;
    folderNamesExpanded: Record<string, string>;
}

const manifest = manifestJson as VscodeIconsManifest;

/** Snapshot of VS Code's built-in language contributions; see `scripts/update-language-registry.ts`. */
interface LanguageRegistry {
    vscodeVersion: string;
    extensions: Record<string, string>;
    filenames: Record<string, string>;
    filenamePatterns: [pattern: string, languageId: string][];
}

const languageRegistry = languageRegistryJson as unknown as LanguageRegistry;

/** The VS Code release whose built-in language contributions `assets/language-registry.json` was generated from. */
export const VSCODE_LANGUAGE_REGISTRY_VERSION = languageRegistry.vscodeVersion;

/**
 * Compiles a basename glob as VS Code's `filenamePatterns` uses it: `*` and `?` never cross a path separator, and
 * the generated registry only keeps basename patterns, so a plain anchored regular expression is equivalent.
 */
function compileBasenameGlob(pattern: string): RegExp {
    const source = [...pattern]
        .map((character) => {
            if (character === '*') return '[^/]*';
            if (character === '?') return '[^/]';
            return character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
    return new RegExp(`^${source}$`);
}

const FILENAME_PATTERN_LANGUAGES = languageRegistry.filenamePatterns.map(
    ([pattern, languageId]) => [compileBasenameGlob(pattern), languageId] as const,
);

function languageIcon(languageId: string | undefined): string | undefined {
    return languageId ? manifest.languageIcons[languageId] : undefined;
}

/** The vendored `vscode-icons` extension version (see `README.md` for the update workflow). */
export const VSCODE_ICONS_VERSION = manifest.version;

export const DEFAULT_FILE = manifest.defaultFile;
export const DEFAULT_FOLDER = manifest.defaultFolder;
export const DEFAULT_FOLDER_OPENED = manifest.defaultFolderExpanded;

/**
 * Splits a lowercased file name into every extension suffix worth trying, longest first: `component.test.tsx`
 * yields `['test.tsx', 'tsx']`. This lets `getIconForFile` match vscode-icons' compound extension keys (`d.ts`,
 * `test.ts`, `buf.gen.yml`, …) before falling back to the plain last segment, without vscode-icons-ts's old
 * hard-coded two-segment special case.
 */
function extensionSuffixCandidates(lowercasedName: string): string[] {
    const segments = lowercasedName.split('.');
    const candidates: string[] = [];
    for (let start = 1; start < segments.length; start += 1) {
        candidates.push(segments.slice(start).join('.'));
    }
    return candidates;
}

/**
 * Resolves the vscode-icons SVG filename for a file name, or `undefined` when nothing matches (callers fall back to
 * `DEFAULT_FILE`). Lookup order mirrors VS Code's icon-theme resolution, which ranks `fileNames` above
 * `fileExtensions` above `languageIds`:
 *
 * 1. an exact `fileNames` match;
 * 2. the language of the exact file name (`Dockerfile`, `PKGBUILD`), ranked above extensions so `CMakeLists.txt`
 *    keeps its CMake icon;
 * 3. the longest-to-shortest extension suffix against `fileExtensions`;
 * 4. the language of a basename glob (`.env.*`, `Dockerfile.*`), which VS Code ranks above extension associations;
 * 5. the language of the longest-to-shortest extension suffix (`hpp.in` before `in`).
 *
 * Steps 2, 4, and 5 consult the hand-curated supplement in `extension-language-bridge.ts` before the generated
 * VS Code language registry.
 */
export function getIconForFile(fileName: string): string | undefined {
    const lowercased = fileName.toLowerCase();

    const byExactName = manifest.fileNames[lowercased];
    if (byExactName) return byExactName;

    const byFilenameLanguage = languageIcon(
        FILENAME_LANGUAGE_BRIDGE[lowercased] ?? languageRegistry.filenames[lowercased],
    );
    if (byFilenameLanguage) return byFilenameLanguage;

    const suffixes = extensionSuffixCandidates(lowercased);
    for (const suffix of suffixes) {
        const byExtension = manifest.fileExtensions[suffix];
        if (byExtension) return byExtension;
    }

    for (const [pattern, languageId] of FILENAME_PATTERN_LANGUAGES) {
        if (!pattern.test(lowercased)) continue;
        const byPatternLanguage = languageIcon(languageId);
        if (byPatternLanguage) return byPatternLanguage;
    }

    for (const suffix of suffixes) {
        const byLanguage = languageIcon(
            EXTENSION_LANGUAGE_BRIDGE[suffix] ?? languageRegistry.extensions[suffix],
        );
        if (byLanguage) return byLanguage;
    }

    return undefined;
}

/** Resolves the vscode-icons SVG filename for a closed folder, falling back to `DEFAULT_FOLDER`. */
export function getIconForFolder(folderName: string): string {
    return manifest.folderNames[folderName.toLowerCase()] ?? DEFAULT_FOLDER;
}

/** Resolves the vscode-icons SVG filename for an expanded folder, falling back to `DEFAULT_FOLDER_OPENED`. */
export function getIconForOpenFolder(folderName: string): string {
    return manifest.folderNamesExpanded[folderName.toLowerCase()] ?? DEFAULT_FOLDER_OPENED;
}
