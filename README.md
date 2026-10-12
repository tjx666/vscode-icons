# @yutengjing/vscode-icons

Self-maintained, browser-safe file/folder icon lookup, vendored directly from the upstream
[`vscode-icons`](https://github.com/vscode-icons/vscode-icons) VS Code extension.

`vscode-icons-ts`, an unofficial npm port of the same icon set, stopped receiving updates in 2023.
This package replaces it by vendoring the extension's own assets and regenerating them with
`scripts/update-icons.ts` instead of relying on a third-party mirror.

## Currently vendored version

`vscode-icons` **12.19.0** (see `assets/manifest.json`'s `version` field, which is the source of
truth — update this line whenever `update-icons` runs). 1553 icon SVGs are vendored under
`assets/icons/`.

## Install

```sh
npm install @yutengjing/vscode-icons
```

## API

- `getIconForFile(fileName: string): string | undefined` — the vendored icon filename (e.g.
  `file_type_typescript.svg`), or `undefined` when nothing matches (fall back to `DEFAULT_FILE`).
- `getIconForFolder(folderName: string): string` — falls back to `DEFAULT_FOLDER` internally.
- `getIconForOpenFolder(folderName: string): string` — falls back to `DEFAULT_FOLDER_OPENED`
  internally.
- `DEFAULT_FILE`, `DEFAULT_FOLDER`, `DEFAULT_FOLDER_OPENED` — the vendored default icon filenames.
- `VSCODE_ICONS_VERSION` — the vendored upstream extension version.

Lookup order for `getIconForFile` mirrors VS Code's own icon-theme resolution (`fileNames` above
`fileExtensions` above `languageIds`):

1. An exact, case-insensitive match against `fileNames` (e.g. `package.json`, `Cargo.toml`,
   `LICENSE`).
2. The language of the exact file name (e.g. `Dockerfile`, `PKGBUILD`, `.envrc`).
3. The longest-to-shortest extension suffix against `fileExtensions` (covers compound suffixes
   vscode-icons ships, such as `d.ts`, `test.tsx`, or the three-segment `buf.gen.yml`).
4. The language of a basename glob (e.g. `.env.*`, `Dockerfile.*`, `tsconfig.*.json`).
5. The language of the longest-to-shortest extension suffix (e.g. `.cjs`, `.hpp.in`, `.mk`).

Steps 2, 4, and 5 exist because the upstream icon-theme manifest keys most source files by VS Code
*language id* (`javascript`, `dotenv`, …), not by name or extension; that resolution normally
happens inside VS Code's language registry, which this package does not embed. Instead it ships
`assets/language-registry.json`, a snapshot of the `extensions`, `filenames`, and basename
`filenamePatterns` of every built-in VS Code language that has a vendored icon. Regenerate it from
a local VS Code install after `update-icons` or a VS Code release:

```bash
npm run update-language-registry            # macOS default install path
npm run update-language-registry -- <path>  # the `resources/app` directory of another install
```

`src/extension-language-bridge.ts` holds the small hand-curated supplement for languages that come
from third-party extensions (`vue`, `svelte`, `toml`, …) and deliberate overrides; it wins over the
generated registry, and its tests reject entries that do not change the resolved icon.

## Consuming the icon SVGs

This package's JS API only resolves *filenames* (e.g. `file_type_typescript.svg`); it does not ship
a React component or inline the SVGs. The raw SVG assets live under `assets/icons/` inside the
published package, and `exports` in `package.json` re-exposes that directory as
`@yutengjing/vscode-icons/assets/*` so a bundler can resolve them by path.

There are two common ways to consume them:

1. **Copy at build time.** Read `assets/icons/<filename>` (resolved from the package's `assets`
   directory) and copy or inline the specific SVGs you need into your own build output.
2. **Glob with a bundler.** With Vite, `import.meta.glob` can eagerly or lazily import every vendored
   icon as a URL:

   ```ts
   import { getIconForFile, DEFAULT_FILE } from '@yutengjing/vscode-icons';

   // Maps '/full/path/to/node_modules/@yutengjing/vscode-icons/assets/icons/file_type_typescript.svg'
   // -> the built asset URL.
   const iconUrls = import.meta.glob<string>(
     '/node_modules/@yutengjing/vscode-icons/assets/icons/*.svg',
     { eager: true, query: '?url', import: 'default' },
   );

   function resolveIconUrl(fileName: string): string {
     const filename = getIconForFile(fileName) ?? DEFAULT_FILE;
     const entry = Object.entries(iconUrls).find(([path]) => path.endsWith(`/${filename}`));
     return entry?.[1] ?? '';
   }
   ```

   Adjust the glob root to wherever your bundler resolves `node_modules` from; some setups may need
   a relative glob instead of an absolute one.

## Updating the vendored icon set

```sh
npm run update-icons
```

This runs `scripts/update-icons.ts` with [`tsx`](https://github.com/privatenumber/tsx). It
re-downloads the latest `vscode-icons-team.vscode-icons` VSIX from open-vsx.org, re-extracts every
icon SVG into `assets/icons/`, and regenerates `assets/manifest.json` from the extension's
`vsicons-icon-theme.json`. Network access only happens while this script runs — the package's
build, typecheck, and test steps never fetch anything.

After running it:

1. Update the "Currently vendored version" line above.
2. Run `npm test` and skim the diff in `assets/manifest.json` and `src/__tests__/index.test.ts` for
   icon ids that moved.
3. Update any downstream icon-id assertions in your own project that reference a specific
   vscode-icons filename that changed.

## Development

```sh
npm install
npm run build      # emits ESM + .d.ts to dist/
npm test           # runs vitest
npm run typecheck  # tsc --noEmit
```

## License

The package source code (everything outside `assets/icons/`) is licensed under the [MIT
License](./LICENSE), Copyright (c) YuTengjing.

The icon assets under `assets/icons/` are vendored from the [vscode-icons
project](https://github.com/vscode-icons/vscode-icons) and are licensed separately under the
[Creative Commons Attribution-ShareAlike 4.0 International License](./LICENSE-ICONS). If you
redistribute the icon SVGs (rather than just depending on this package), you must comply with that
license's attribution and share-alike terms.
