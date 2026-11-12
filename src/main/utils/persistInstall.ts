/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type * as Fs from "node:fs";
import { join } from "node:path";

type HostFs = Pick<typeof Fs, "copyFileSync" | "cpSync" | "existsSync" | "lstatSync" | "readFileSync" | "readdirSync" | "renameSync">;

export function persistInstallation(oldResources: string, resources: string, fs: HostFs): boolean {
    const target = join(resources, "app.asar");
    const backup = join(resources, "_app.asar");
    const source = join(oldResources, "app.asar");
    const staged = join(resources, "deskcord-update.asar");
    if (!fs.existsSync(source) || !fs.existsSync(target) || fs.existsSync(backup) || fs.existsSync(staged)) return false;
    for (const path of [oldResources, resources, source, target]) if (fs.lstatSync(path).isSymbolicLink()) return false;
    function plainTree(path: string) {
        const info = fs.lstatSync(path);
        if (info.isSymbolicLink()) throw new Error("Deskcord update refuses symbolic links");
        if (info.isDirectory()) for (const name of fs.readdirSync(path)) plainTree(join(path, name));
    }
    const runtime = join(oldResources, "Deskcord");
    if (fs.existsSync(runtime)) {
        plainTree(runtime);
        const owner = JSON.parse(fs.readFileSync(join(runtime, "owner.json"), "utf8"));
        if (owner.product !== "Deskcord" || owner.format !== 1) return false;
        const destination = join(resources, "Deskcord");
        if (fs.existsSync(destination)) return false;
        fs.cpSync(runtime, destination, { recursive: true, errorOnExist: true, force: false });
    }
    fs.copyFileSync(source, staged);
    fs.renameSync(target, backup);
    try { fs.renameSync(staged, target); }
    catch (error) { fs.renameSync(backup, target); throw error; }
    return true;
}
