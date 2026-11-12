/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { open, realpath, rm } from "fs/promises";
import { basename, normalize } from "path";

export async function readRecording(_, filePath: string) {
    filePath = normalize(filePath);
    const filename = basename(filePath);
    const discordBaseDirWithTrailingSlash = normalize(app.getPath("userData") + "/");
    if (!/^\d*recording\.ogg$/.test(filename) || !filePath.startsWith(discordBaseDirWithTrailingSlash)) return null;

    try {
        const root = normalize(await realpath(app.getPath("userData")) + "/");
        const resolved = await realpath(filePath);
        if (!resolved.startsWith(root)) return null;
        const file = await open(resolved, "r");
        let bytes: Uint8Array<ArrayBuffer>;
        try {
            const info = await file.stat();
            if (!info.isFile() || info.size > 32 * 1024 * 1024) return null;
            const buffer = await file.readFile();
            if (buffer.length > 32 * 1024 * 1024) return null;
            bytes = new Uint8Array(buffer);
        } finally { await file.close(); }
        rm(resolved).catch(() => { });
        return bytes;
    } catch {
        return null;
    }
}
