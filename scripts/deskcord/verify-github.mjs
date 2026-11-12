/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function verifyGithub(directory) {
    const root = resolve(directory);
    const metadata = JSON.parse(await readFile(join(root, "repository-manifest.json"), "utf8"));
    assert.match(metadata.revision, /^[a-f0-9]{40}$/);
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    assert.equal(metadata.clientVersion, pkg.version);
    const folder = join(root, "plugin-packages", metadata.revision);
    assert.equal((await lstat(folder)).isSymbolicLink(), false);
    const catalog = JSON.parse(await readFile(join(folder, "catalog.json"), "utf8"));
    assert.deepEqual(catalog, JSON.parse(await readFile(join(root, "src/deskcord/plugins/catalog.json"), "utf8")));
    assert.equal(catalog.revision, metadata.revision);
    const packages = catalog.plugins.filter(plugin => plugin.available && !plugin.builtin);
    assert.equal(packages.length, metadata.packages);
    for (const plugin of packages) {
        assert.match(plugin.file, /^[a-z0-9][a-z0-9.-]*\.json$/);
        const file = join(folder, plugin.file);
        const info = await lstat(file);
        assert.ok(info.isFile() && !info.isSymbolicLink(), `Arquivo inválido: ${plugin.id}`);
        const bytes = await readFile(file);
        assert.equal(bytes.length, plugin.bytes, `Tamanho incorreto: ${plugin.id}`);
        assert.equal(createHash("sha256").update(bytes).digest("hex"), plugin.sha256, `SHA-256 incorreto: ${plugin.id}`);
        const value = JSON.parse(bytes.toString("utf8"));
        assert.equal(value.id, plugin.id);
        assert.equal(value.name, plugin.name);
        assert.equal(value.revision, catalog.revision);
        assert.equal(value.format, 1);
        assert.equal(typeof value.renderer, "string");
        assert.equal(typeof value.css, "string");
        for (const id of plugin.dependencies) assert.ok(catalog.plugins.some(item => item.id === id && item.available), `Dependência ausente: ${id}`);
    }
    for (const file of ["README.md", "LICENSE", "NOTICE.md", "pnpm-lock.yaml", "docs/PUBLICAR_NO_GITHUB.md", "docs/CONECTAR_DOWNLOADS.md"])
        assert.ok((await lstat(join(root, file))).isFile(), `Documento ausente: ${file}`);
    return { clientVersion: pkg.version, revision: catalog.revision, packages: packages.length };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
    console.log(JSON.stringify(await verifyGithub(process.argv[2] ?? process.cwd())));
