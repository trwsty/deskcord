/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createWriteStream } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { ZipFile } from "yazl";

import { verifyGithub } from "./verify-github.mjs";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const catalog = JSON.parse(await readFile("src/deskcord/plugins/catalog.json", "utf8"));
const distribution = JSON.parse(await readFile("src/deskcord/plugins/distribution.json", "utf8"));
const hosted = /^https:\/\/raw\.githubusercontent\.com\/([\w.-]+)\/([\w.-]+)\/main\/plugin-packages\/[a-f0-9]{40}\/$/.exec(distribution.repository);
if (!/^[a-f0-9]{40}$/.test(catalog.revision)) throw new Error("Revisão do catálogo inválida.");
const source = resolve("release", `Deskcord-source-${version}`);
const compiled = resolve("release", `Deskcord-plugin-repository-${version}`);
const output = resolve("release", `Deskcord-GitHub-${version}`);
await lstat(join(source, "scripts/deskcord/prepare-github.mjs"));
await lstat(join(compiled, "catalog.json"));
// Refuse to overwrite a prepared repository: it may already contain the user's edits.
await mkdir(output);
await cp(source, output, { recursive: true, filter: async path => {
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Links não são aceitos na distribuição.");
    return ![".git", "node_modules", ".env", "settings"].includes(basename(path));
} });
await cp(join(output, "README.md"), join(output, "README-CLIENTE.md"));
const folder = join(output, "plugin-packages", catalog.revision);
await mkdir(folder, { recursive: true });
for (const plugin of catalog.plugins.filter(plugin => plugin.available && !plugin.builtin)) {
    if (!/^[a-z0-9][a-z0-9.-]*\.json$/.test(plugin.file)) throw new Error("Nome de pacote inválido.");
    await cp(join(compiled, plugin.file), join(folder, plugin.file));
}
for (const file of ["catalog.json", "build-report.json"]) await cp(join(compiled, file), join(folder, file));
const values = { VERSION: version, REVISION: catalog.revision,
    PACKAGES: String(catalog.plugins.filter(plugin => plugin.available && !plugin.builtin).length),
    PUBLIC_PLUGINS: String(catalog.plugins.filter(plugin => plugin.available && !plugin.hidden).length),
    OWNER: hosted?.[1] ?? "SEU_USUARIO", REPOSITORY: hosted?.[2] ?? "SEU_REPOSITORIO" };
for (const [template, file] of [["README.md", "README.md"], ["PUBLICAR_NO_GITHUB.md", "docs/PUBLICAR_NO_GITHUB.md"], ["CONECTAR_DOWNLOADS.md", "docs/CONECTAR_DOWNLOADS.md"]]) {
    const text = await readFile(join("docs/github-repository", template), "utf8");
    await writeFile(join(output, file), text.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
        if (!(key in values)) throw new Error(`Valor de template desconhecido: ${key}`);
        return values[key];
    }));
}
await writeFile(join(output, ".gitattributes"), "plugin-packages/** -text\n*.md text eol=lf\n");
await writeFile(join(output, "repository-manifest.json"), JSON.stringify({ format: 1, product: "Deskcord", clientVersion: version,
    revision: catalog.revision, packages: Number(values.PACKAGES) }, null, 4) + "\n");
console.log(await verifyGithub(output));

const archive = new ZipFile();
async function add(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error("Link inesperado no repositório.");
        if (entry.isDirectory()) await add(file, `${prefix}/${entry.name}`);
        else archive.addFile(file, `${prefix}/${entry.name}`);
    }
}
await add(output, basename(output));
const zip = `${output}.zip`;
const stream = createWriteStream(zip, { flags: "wx" });
archive.outputStream.pipe(stream); archive.end();
await new Promise((done, reject) => { stream.on("close", done); stream.on("error", reject); archive.outputStream.on("error", reject); });
console.log(output);
console.log(zip);
