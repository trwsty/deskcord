/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync } from "node:fs";
import { copyFile, lstat, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { createPackage, extractFile, listPackage, uncache } from "@electron/asar";

const MARKER = "deskcord-install.json";

export function isDeskcordArchive(path) {
    try {
        uncache(path);
        const data = JSON.parse(extractFile(path, MARKER).toString());
        return data.product === "Deskcord" && data.format === 1;
    } catch { return false; }
}

export function isVencordArchive(path) {
    try {
        uncache(path);
        const files = listPackage(path).map(name => name.replaceAll("\\", "/")).sort();
        const loader = extractFile(path, "index.js").toString().trim();
        return files.length === 2 && files[0] === "/index.js" && files[1] === "/package.json"
            && /^require\("[A-Za-z]:\\\\[^"\r\n]*\\\\Vencord\\\\dist\\\\patcher\.js"\);?$/.test(loader);
    } catch { return false; }
}

export async function validateResources(input) {
    const path = await realpath(resolve(input));
    if (!(await lstat(path)).isDirectory()) throw new Error("Pasta resources inválida.");
    for (const name of ["app.asar", "_app.asar"]) {
        const file = join(path, name);
        if (!existsSync(file)) continue;
        const info = await lstat(file);
        if (info.isSymbolicLink() || !info.isFile()) throw new Error("Arquivo ASAR inválido; links não são aceitos.");
    }
    return path;
}

export async function install(resourcesInput, bundleInput, options = {}) {
    const resources = await validateResources(resourcesInput);
    const bundle = await realpath(bundleInput);
    for (const file of ["patcher.js", "preload.js", "renderer.js", "renderer.css"]) {
        if (!(await lstat(join(bundle, file))).isFile()) throw new Error(`Build incompleto: ${file}`);
    }
    const target = join(resources, "app.asar");
    const backup = join(resources, "_app.asar");
    if (!existsSync(target)) throw new Error("app.asar não encontrado. Repare a instalação do Discord.");
    const replacing = isDeskcordArchive(target);
    const migrating = options.replaceVencord === true && isVencordArchive(target) && existsSync(backup);
    if (existsSync(backup) && !replacing && !migrating) throw new Error("Outro mod ou backup já existe. Remova o outro mod antes de instalar o Deskcord.");
    if (replacing && !existsSync(backup)) throw new Error("Backup original ausente. Repare a instalação do Discord.");
    if (!replacing) {
        try { JSON.parse(extractFile(migrating ? backup : target, "package.json").toString()); }
        catch { throw new Error("O arquivo original do Discord não é um ASAR válido."); }
    }
    const staged = join(resources, "deskcord-staged.asar");
    const previous = join(resources, "deskcord-previous.asar");
    if (existsSync(staged) || existsSync(previous)) throw new Error("Instalação anterior interrompida. Verifique os arquivos deskcord-*.asar antes de continuar.");
    const temp = await mkdtemp(join(tmpdir(), "deskcord-injector-"));
    let moved = false;
    try {
        await writeFile(join(temp, "package.json"), JSON.stringify({ name: "deskcord-injector", main: "index.js" }));
        await writeFile(join(temp, "index.js"), options.relativeBundle
            ? `require(require("path").join(__dirname, "..", ${JSON.stringify(options.relativeBundle)}, "patcher.js"));\n`
            : `require(${JSON.stringify(join(bundle, "patcher.js"))});\n`);
        await writeFile(join(temp, MARKER), JSON.stringify({ product: "Deskcord", format: 1 }));
        uncache(staged);
        await createPackage(temp, staged);
        if (migrating) {
            const saved = join(resources, "deskcord-vencord-backup.asar");
            if (existsSync(saved)) throw new Error("Backup de migração já existe. Verifique deskcord-vencord-backup.asar.");
            await copyFile(target, saved);
        }
        await rename(target, replacing || migrating ? previous : backup);
        moved = true;
        await rename(staged, target);
        uncache(target);
        if (replacing || migrating) await rm(previous);
    } catch (error) {
        if (moved && !existsSync(target)) await rename(replacing || migrating ? previous : backup, target);
        throw error;
    } finally {
        // These are exact owned temporary paths, never user-selected directories.
        await rm(staged, { force: true });
        const safeTemp = await realpath(temp);
        if (dirname(safeTemp) === await realpath(tmpdir())) await rm(safeTemp, { recursive: true, force: true });
    }
}

export async function uninstall(resourcesInput) {
    const resources = await validateResources(resourcesInput);
    const target = join(resources, "app.asar");
    const backup = join(resources, "_app.asar");
    if (!isDeskcordArchive(target)) throw new Error("Esta instalação não pertence ao Deskcord; nenhum arquivo foi alterado.");
    if (!existsSync(backup)) throw new Error("Backup original ausente; nenhum arquivo foi alterado.");
    const previous = join(resources, "deskcord-uninstall.asar");
    if (existsSync(previous)) throw new Error("Uma desinstalação anterior foi interrompida.");
    await rename(target, previous);
    try { await rename(backup, target); }
    catch (error) { await rename(previous, target); throw error; }
    await rm(previous);
    uncache(target);
}
