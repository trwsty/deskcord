/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";
import { request } from "https";

const redirectHosts = new Set(["spotify.link", "s.team", "open.spotify.com", "store.steampowered.com", "steamcommunity.com"]);

function checkedUrl(raw: string) {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !redirectHosts.has(url.hostname) || url.username || url.password || (url.port && url.port !== "443"))
        throw new Error("Destino de redirecionamento não autorizado.");
    return url;
}

function getRedirect(url: URL, depth = 0): Promise<string> {
    if (depth > 5) return Promise.reject(new Error("Muitos redirecionamentos."));
    return new Promise((resolve, reject) => {
        const req = request(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) }, res => {
            res.resume();
            try {
                if (res.headers.location) getRedirect(checkedUrl(new URL(res.headers.location, url).href), depth + 1).then(resolve, reject);
                else resolve(url.href);
            } catch (error) { reject(error); }
        });
        req.on("error", reject);
        req.end();
    });
}

export async function resolveRedirect(_: IpcMainInvokeEvent, raw: string) {
    if (typeof raw !== "string" || raw.length > 4096) throw new Error("URL inválida.");
    const url = new URL(raw);
    if (!["spotify.link", "s.team"].includes(url.hostname)) return raw;
    return getRedirect(checkedUrl(raw));
}
