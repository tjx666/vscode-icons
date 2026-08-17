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
 * Resolves the vscode-icons SVG filename for a file name, or `undefined` when nothing in the vendored manifest
 * matches (callers fall back to `DEFAULT_FILE`). Lookup order mirrors VS Code's icon-theme resolution: an exact
 * `fileNames` match, then an exact-name resolution through `FILENAME_LANGUAGE_BRIDGE` into `languageIcons` (VS Code
 * ranks filename associations above extension ones), then the longest-to-shortest extension suffix against
 * `fileExtensions`, then the last extension segment resolved through `EXTENSION_LANGUAGE_BRIDGE` into a
 * `languageIcons` entry.
 */
export function getIconForFile(fileName: string): string | undefined {
    const lowercased = fileName.toLowerCase();

    const byExactName = manifest.fileNames[lowercased];
    if (byExactName) return byExactName;

    const filenameLanguageId = FILENAME_LANGUAGE_BRIDGE[lowercased];
    const byFilenameLanguage = filenameLanguageId
        ? manifest.languageIcons[filenameLanguageId]
        : undefined;
    if (byFilenameLanguage) return byFilenameLanguage;

    const suffixes = extensionSuffixCandidates(lowercased);
    for (const suffix of suffixes) {
        const byExtension = manifest.fileExtensions[suffix];
        if (byExtension) return byExtension;
    }

    const lastSegment = suffixes.at(-1);
    if (lastSegment) {
        const languageId = EXTENSION_LANGUAGE_BRIDGE[lastSegment];
        const byLanguage = languageId ? manifest.languageIcons[languageId] : undefined;
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
