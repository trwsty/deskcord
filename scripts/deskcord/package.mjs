/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { build } from "esbuild";
import { ZipFile } from "yazl";

import { buildInstaller } from "./build-installer.mjs";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const release = resolve("release", `Deskcord-${version}`);
const sourceRelease = resolve("release", `Deskcord-source-${version}`);
const pluginRelease = resolve("release", `Deskcord-plugin-repository-${version}`);
await mkdir(join(release, "dist"), { recursive: true });
for (const file of ["patcher.js", "preload.js", "renderer.js", "renderer.css", "patcher.js.LEGAL.txt", "renderer.js.LEGAL.txt"])
    await cp(join("dist", file), join(release, "dist", file));
const installerBuild = await build({ entryPoints: ["scripts/deskcord/install.mjs"], outfile: join(release, "dist", "installer.cjs"), bundle: true, metafile: true,
    platform: "node", format: "cjs", target: "node22",
    define: { "import.meta.url": "__deskcord_import_meta_url" },
    banner: { js: 'const __deskcord_import_meta_url = require("node:url").pathToFileURL(__filename).href;' } });
const nativeBuild = await buildInstaller(resolve("release", `Deskcord-Setup-${version}.exe`));
execFileSync(process.execPath, ["scripts/deskcord/test-installer.mjs"], { stdio: "inherit", windowsHide: true });
await cp(resolve("release", `Deskcord-Setup-${version}.exe`), join(release, "Deskcord-Setup.exe"));
for (const file of ["README.md", "LICENSE", "NOTICE.md"]) await cp(file, join(release, file));
const librarySources = Object.keys(installerBuild.metafile.inputs).map(path => resolve(path));
librarySources.push(...Object.keys(nativeBuild.inputs).map(path => resolve(path)));
librarySources.push(...JSON.parse(await readFile(".preview/plugin-license-inputs.json", "utf8")));
for (const file of ["renderer.js.map", "patcher.js.map"]) {
    const map = JSON.parse(await readFile(join("dist", file), "utf8"));
    librarySources.push(...map.sources.map(source => resolve("dist", source)));
}
const libraryRoots = new Set();
for (const source of librarySources.filter(path => path.includes("node_modules"))) {
    let directory = dirname(source);
    while (directory.includes("node_modules")) {
        try { await readFile(join(directory, "package.json")); libraryRoots.add(directory); break; }
        catch { directory = dirname(directory); }
    }
}
const licenseDirectory = join(release, "licenses");
await mkdir(licenseDirectory, { recursive: true });
await cp("release/Node-LICENSE.txt", join(licenseDirectory, "Node-LICENSE.txt"));
for (const directory of libraryRoots) {
    const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    const names = (await readdir(directory)).filter(file => /^(?:licen[cs]e|notice)(?:\..*)?$/i.test(file));
    for (const name of names) await cp(join(directory, name), join(licenseDirectory, `${pkg.name.replaceAll("/", "_")}-${pkg.version}-${name}`));
}
await cp("node_modules/typescript/LICENSE.txt", join(licenseDirectory, "Apache-2.0.txt"));
await writeFile(join(release, "SOURCE-CODE.md"), `# Código-fonte correspondente\n\nO arquivo Deskcord-source-${version}.zip contém o código-fonte completo desta versão, suas licenças e scripts para recompilar. Ele deve ser disponibilizado no mesmo local de download do cliente, sem custo adicional de acesso. Quem redistribui o Deskcord deve preservar esse acesso e os avisos GPL.\n`);
// Publish corresponding source alongside the client, without preinstalling plugin sources.
for (const path of ["src", "packages", "scripts", "installer", "patches", "browser", "tests", "docs", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", ".oxlintrc.json", ".editorconfig", ".gitignore", "LICENSE", "NOTICE.md", "README.md", "PRODUCT.md", "DESIGN.md"])
    await cp(path, join(sourceRelease, path), { recursive: true, filter: path => !path.includes("node_modules") });
const catalog = JSON.parse(await readFile("src/deskcord/plugins/catalog.json", "utf8"));
await mkdir(pluginRelease, { recursive: true });
for (const plugin of catalog.plugins) if (plugin.available && !plugin.builtin && plugin.file)
    await cp(join("plugin-repository", plugin.file), join(pluginRelease, plugin.file));
for (const file of ["catalog.json", "build-report.json"]) await cp(join("plugin-repository", file), join(pluginRelease, file));
for (const file of ["LICENSE", "NOTICE.md"]) await cp(file, join(pluginRelease, file));
await cp(join(release, "SOURCE-CODE.md"), join(pluginRelease, "SOURCE-CODE.md"));
await cp(licenseDirectory, join(pluginRelease, "licenses"), { recursive: true });
await cp(licenseDirectory, join(sourceRelease, "licenses"), { recursive: true });

async function add(archive, directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        const zipPath = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) await add(archive, file, zipPath);
        else archive.addFile(file, zipPath);
    }
}
for (const [directory, label] of [[release, `Deskcord-${version}-windows`], [sourceRelease, `Deskcord-source-${version}`], [pluginRelease, `Deskcord-plugin-repository-${version}`]]) {
    const archive = new ZipFile();
    await add(archive, directory, label);
    const zipPath = resolve("release", `${label}.zip`);
    const stream = createWriteStream(zipPath);
    archive.outputStream.pipe(stream); archive.end();
    await new Promise((done, reject) => { stream.on("close", done); stream.on("error", reject); archive.outputStream.on("error", reject); });
    console.log(zipPath);
}
