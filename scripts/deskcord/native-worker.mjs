/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Copyright (c) 2026 Deskcord contributors; SPDX-License-Identifier: GPL-3.0-or-later
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { install, isDeskcordArchive, isVencordArchive, uninstall, validateResources } from "./installer-core.mjs";

const files = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];
const ownerContent = '{"product":"Deskcord","format":1}';

async function removeOwnedRuntime(resources) {
    const folder = join(resources, "Deskcord");
    if (!existsSync(folder)) return;
    await plainPath(folder);
    if (await readFile(join(folder, "owner.json"), "utf8").catch(() => "") !== ownerContent) return;
    for (const name of await readdir(folder)) {
        if (name === "owner.json") { await plainPath(join(folder, name)); continue; }
        if (!/^[a-f0-9]{64}$/.test(name)) return;
        const slot = join(folder, name);
        await plainPath(slot);
        for (const file of await readdir(slot)) {
            if (!files.includes(file)) return;
            const path = join(slot, file);
            await plainPath(path);
            if (!(await lstat(path)).isFile()) return;
        }
    }
    if (dirname(await realpath(folder)) === resources) await rm(folder, { recursive: true });
}

async function plainPath(path) {
    for (let current = resolve(path);;) {
        if ((await lstat(current)).isSymbolicLink()) throw new Error("Links de pastas não são aceitos pelo instalador.");
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
}

export async function deploy(resourcesInput, bundle, action) {
    await plainPath(resourcesInput);
    const resources = await validateResources(resourcesInput);
    const target = join(resources, "app.asar");
    const state = isDeskcordArchive(target) ? "Deskcord instalado" : isVencordArchive(target) ? "Vencord instalado — será substituído com backup" : "Discord sem Deskcord";
    if (action === "status") return state;
    if (action === "uninstall") {
        await uninstall(resources);
        try { await removeOwnedRuntime(resources); }
        catch { return "Discord original restaurado. Temas preservados. Alguns arquivos residuais em resources/Deskcord precisam de verificação manual."; }
        return "Deskcord desinstalado. Discord original restaurado; temas e configurações preservados.";
    }
    if (action !== "install" && action !== "reinstall") throw new Error("Ação inválida.");
    const payload = await Promise.all(files.map(name => readFile(join(bundle, name))));
    let id = createHash("sha256").update(Buffer.concat(payload)).digest("hex");
    const folder = join(resources, "Deskcord");
    if (existsSync(folder)) {
        await plainPath(folder);
        if (await readFile(join(folder, "owner.json"), "utf8").catch(() => "") !== ownerContent)
            throw new Error("A pasta Deskcord existente não pertence a este instalador.");
    } else {
        await mkdir(folder);
        await writeFile(join(folder, "owner.json"), ownerContent, { flag: "wx" });
    }
    let slot = join(folder, id);
    if (existsSync(slot)) {
        await plainPath(slot);
        let matches = true;
        for (let i = 0; i < files.length; i++) {
            const path = join(slot, files[i]);
            if (!existsSync(path)) { matches = false; continue; }
            await plainPath(path);
            if (!(await readFile(path)).equals(payload[i])) matches = false;
        }
        if (!matches) {
            id = createHash("sha256").update(id + randomUUID()).digest("hex");
            slot = join(folder, id);
        }
    }
    if (!existsSync(slot)) {
        await mkdir(slot);
        try {
            for (const name of files) await copyFile(join(bundle, name), join(slot, name));
        } catch (error) {
            if (dirname(await realpath(slot)) === await realpath(folder)) await rm(slot, { recursive: true });
            throw error;
        }
    }
    await install(resources, slot, { replaceVencord: true, relativeBundle: `Deskcord/${id}` });
    return "Deskcord instalado. Abra as configurações do Discord e procure Deskcord, Plugins e Temas.";
}

// Single request, private stdin transport; never interpolate selected paths into a shell.
async function main() {
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    try {
        const { value } = await lines[Symbol.asyncIterator]().next();
        if (!value || value.length > 16384) throw new Error("Pedido inválido.");
        const request = JSON.parse(value);
        const result = await deploy(request.resources, join(dirname(process.argv[1]), "payload"), request.action);
        console.log(JSON.stringify({ ok: true, message: result }));
    } catch (error) {
        console.log(JSON.stringify({ ok: false, message: error.message }));
        process.exitCode = 1;
    } finally { lines.close(); }
}
if (process.argv.includes("--request")) void main();
