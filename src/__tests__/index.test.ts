import { describe, expect, it } from 'vitest';

import { EXTENSION_LANGUAGE_BRIDGE } from '../extension-language-bridge';
import {
    DEFAULT_FILE,
    DEFAULT_FOLDER,
    DEFAULT_FOLDER_OPENED,
    getIconForFile,
    getIconForFolder,
    getIconForOpenFolder,
} from '../index';
import manifestJson from '../../assets/manifest.json';

interface VscodeIconsManifest {
    languageIcons: Record<string, string>;
}

const manifest = manifestJson as unknown as VscodeIconsManifest;

describe('getIconForFile', () => {
    it('resolves an exact file name match before any extension lookup', () => {
        expect(getIconForFile('package.json')).toBe('file_type_npm.svg');
        expect(getIconForFile('LICENSE')).toBe('file_type_license.svg');
    });

    it('is case-insensitive for exact file names', () => {
        expect(getIconForFile('Cargo.toml')).toBe('file_type_cargo.svg');
        expect(getIconForFile('CARGO.TOML')).toBe(getIconForFile('Cargo.toml'));
    });

    it('resolves a compound extension before a single-segment extension', () => {
        expect(getIconForFile('types.d.ts')).toBe('file_type_typescriptdef.svg');
        expect(getIconForFile('Component.test.tsx')).toBe('file_type_testts.svg');
        expect(getIconForFile('index.ts')).not.toBe('file_type_typescriptdef.svg');
    });

    it('resolves a single-segment extension', () => {
        expect(getIconForFile('diagram.svg')).toBe('file_type_svg.svg');
        expect(getIconForFile('README.md')).toBe('file_type_markdown.svg');
    });

    it('resolves plain extensions absent from fileExtensions through the language bridge', () => {
        expect(getIconForFile('index.ts')).toBe('file_type_typescript.svg');
        expect(getIconForFile('Component.tsx')).toBe('file_type_reactts.svg');
        expect(getIconForFile('script.py')).toBe('file_type_python.svg');
    });

    it('returns undefined for an unknown extension or extensionless name', () => {
        expect(getIconForFile('unknown.does-not-exist')).toBeUndefined();
        expect(getIconForFile('unknown')).toBeUndefined();
    });

    it('every extension-language bridge entry resolves to a vendored language icon', () => {
        for (const [extension, languageId] of Object.entries(EXTENSION_LANGUAGE_BRIDGE)) {
            expect(manifest.languageIcons[languageId], `${extension} -> ${languageId}`).toBeDefined();
        }
    });
});

describe('getIconForFolder', () => {
    it('resolves a known folder name', () => {
        expect(getIconForFolder('.github')).toBe('folder_type_github.svg');
        expect(getIconForFolder('src')).toBe('folder_type_src.svg');
    });

    it('is case-insensitive', () => {
        expect(getIconForFolder('.GitHub')).toBe(getIconForFolder('.github'));
    });

    it('falls back to DEFAULT_FOLDER for an unknown folder name', () => {
        expect(getIconForFolder('totally-unknown-folder-name')).toBe(DEFAULT_FOLDER);
    });
});

describe('getIconForOpenFolder', () => {
    it('resolves the expanded variant of a known folder name', () => {
        expect(getIconForOpenFolder('.github')).toBe('folder_type_github_opened.svg');
    });

    it('falls back to DEFAULT_FOLDER_OPENED for an unknown folder name', () => {
        expect(getIconForOpenFolder('totally-unknown-folder-name')).toBe(DEFAULT_FOLDER_OPENED);
    });
});

describe('default icon constants', () => {
    it('exposes the vendored default file and folder icon filenames', () => {
        expect(DEFAULT_FILE).toBe('default_file.svg');
        expect(DEFAULT_FOLDER).toBe('default_folder.svg');
        expect(DEFAULT_FOLDER_OPENED).toBe('default_folder_opened.svg');
    });
});
