/**
 * Re-vendors `@yutengjing/vscode-icons`'s assets from the upstream `vscode-icons` VS Code extension.
 *
 * `vscode-icons-ts`, an unofficial npm port of the same icon set, stopped receiving updates in 2023, so this
 * package vendors the extension's own icon set and icon-theme manifest directly instead of relying on a
 * third-party port. Run `npm run update-icons` (from this package) whenever the upstream extension ships a new
 * release:
 *
 *   1. Resolves the latest `vscode-icons-team.vscode-icons` version and download URL from open-vsx.org.
 *   2. Downloads the VSIX (a zip archive) and extracts it with the system `unzip` binary — no new npm dependency is
 *      needed since every supported development and CI environment already ships `unzip`.
 *   3. Copies every icon SVG under `extension/icons/` into `assets/icons/`.
 *   4. Reads `extension/dist/src/vsicons-icon-theme.json` (the VS Code icon-theme manifest: `iconDefinitions` plus
 *      `file`/`fileExtensions`/`fileNames`/`languageIds`/`folderNames`/`folderNamesExpanded` lookup tables) and
 *      flattens it into `assets/manifest.json`, resolving every icon-definition reference straight to its SVG
 *      filename so `src/index.ts` never has to walk `iconDefinitions` at runtime.
 *
 * Network access only happens while this script runs; the package's build, typecheck, and test steps never fetch
 * anything.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsIconsDirectory = join(packageRoot, 'assets/icons');
const manifestPath = join(packageRoot, 'assets/manifest.json');

const OPEN_VSX_EXTENSION_API =
    'https://open-vsx.org/api/vscode-icons-team/vscode-icons/latest';

interface OpenVsxLatestResponse {
    version: string;
    files: { download: string };
}

interface VsiconsIconDefinition {
    iconPath: string;
}

interface VsiconsIconTheme {
    iconDefinitions: Record<string, VsiconsIconDefinition>;
    file: string;
    folder: string;
    folderExpanded: string;
    fileExtensions: Record<string, string>;
    fileNames: Record<string, string>;
    languageIds: Record<string, string>;
    folderNames: Record<string, string>;
    folderNamesExpanded: Record<string, string>;
}

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

/**
 * Resolves an icon-definition key (e.g. `_f_typescript`) to the SVG filename it points at (e.g.
 * `file_type_typescript.svg`), skipping definitions with an empty `iconPath` (the theme keeps unused light-theme
 * placeholders with `iconPath: ''`).
 */
function resolveIconFilename(
    iconDefinitions: Record<string, VsiconsIconDefinition>,
    definitionKey: string | undefined,
): string | undefined {
    if (!definitionKey) return undefined;
    const definition = iconDefinitions[definitionKey];
    if (!definition?.iconPath) return undefined;
    return basename(definition.iconPath);
}

/**
 * Flattens a `{ key: definitionKey }` lookup table (e.g. `fileExtensions`) into `{ lowercasedKey: iconFilename }`,
 * dropping entries whose definition cannot be resolved. Keys are lowercased so `src/index.ts` can do a single
 * case-insensitive lookup instead of trying the exact key and a lowercased fallback separately; the upstream theme
 * never assigns a cased key and its lowercased counterpart different icons (verified against vscode-icons 12.19.0),
 * so this loses no information.
 */
function flattenLookupTable(
    iconDefinitions: Record<string, VsiconsIconDefinition>,
    table: Record<string, string>,
): Record<string, string> {
    const flattened: Record<string, string> = {};
    for (const [key, definitionKey] of Object.entries(table)) {
        const filename = resolveIconFilename(iconDefinitions, definitionKey);
        if (filename) flattened[key.toLowerCase()] = filename;
    }
    return flattened;
}

async function resolveLatestRelease(): Promise<OpenVsxLatestResponse> {
    const response = await fetch(OPEN_VSX_EXTENSION_API);
    if (!response.ok) {
        throw new Error(
            `Failed to resolve the latest vscode-icons release: ${response.status} ${response.statusText}`,
        );
    }
    return (await response.json()) as OpenVsxLatestResponse;
}

async function downloadVsix(downloadUrl: string, destinationPath: string): Promise<void> {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
        throw new Error(`Failed to download ${downloadUrl}: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destinationPath, buffer);
}

async function extractVsix(vsixPath: string, extractDirectory: string): Promise<void> {
    await execFileAsync('unzip', ['-q', '-o', vsixPath, '-d', extractDirectory]);
}

async function main(): Promise<void> {
    const release = await resolveLatestRelease();
    console.log(`Resolved vscode-icons ${release.version} from open-vsx.org`);

    const workingDirectory = await mkdtemp(join(tmpdir(), 'vscode-icons-'));
    try {
        const vsixPath = join(workingDirectory, 'vscode-icons.vsix');
        await downloadVsix(release.files.download, vsixPath);
        await extractVsix(vsixPath, workingDirectory);

        const extensionRoot = join(workingDirectory, 'extension');
        const theme = JSON.parse(
            await readFile(join(extensionRoot, 'dist/src/vsicons-icon-theme.json'), 'utf8'),
        ) as VsiconsIconTheme;

        // Replace the vendored icon set: remove stale SVGs from a previous version before copying the fresh set so
        // renamed or removed upstream icons do not linger.
        await rm(assetsIconsDirectory, { recursive: true, force: true });
        await mkdir(assetsIconsDirectory, { recursive: true });
        const iconSourceDirectory = join(extensionRoot, 'icons');
        const iconFilenames = (await readdir(iconSourceDirectory)).filter((name) =>
            name.endsWith('.svg'),
        );
        await Promise.all(
            iconFilenames.map(async (filename) => {
                const contents = await readFile(join(iconSourceDirectory, filename));
                await writeFile(join(assetsIconsDirectory, filename), contents);
            }),
        );

        const manifest: VscodeIconsManifest = {
            version: release.version,
            iconCount: iconFilenames.length,
            defaultFile: resolveIconFilename(theme.iconDefinitions, theme.file) ?? 'default_file.svg',
            defaultFolder:
                resolveIconFilename(theme.iconDefinitions, theme.folder) ?? 'default_folder.svg',
            defaultFolderExpanded:
                resolveIconFilename(theme.iconDefinitions, theme.folderExpanded) ??
                'default_folder_opened.svg',
            fileNames: flattenLookupTable(theme.iconDefinitions, theme.fileNames),
            fileExtensions: flattenLookupTable(theme.iconDefinitions, theme.fileExtensions),
            languageIcons: flattenLookupTable(theme.iconDefinitions, theme.languageIds),
            folderNames: flattenLookupTable(theme.iconDefinitions, theme.folderNames),
            folderNamesExpanded: flattenLookupTable(theme.iconDefinitions, theme.folderNamesExpanded),
        };

        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');

        console.log(`Vendored ${iconFilenames.length} icon SVGs and manifest.json`);
        console.log(
            `fileNames=${Object.keys(manifest.fileNames).length} fileExtensions=${Object.keys(manifest.fileExtensions).length} languageIcons=${Object.keys(manifest.languageIcons).length} folderNames=${Object.keys(manifest.folderNames).length}`,
        );
    } finally {
        await rm(workingDirectory, { recursive: true, force: true });
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
