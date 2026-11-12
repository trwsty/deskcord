/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NativeSettings, RendererSettings } from "@main/settings";
import { DATA_DIR } from "@main/utils/constants";
import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { join } from "path";

import catalog from "../../deskcord/plugins/catalog.json";
import distribution from "../../deskcord/plugins/distribution.json";
import type { PluginCatalog } from "../../deskcord/plugins/model";
import { createPluginStore } from "./store";

function openStore(): ReturnType<typeof createPluginStore> {
    try {
        return createPluginStore(join(DATA_DIR, "plugins"), catalog as PluginCatalog,
            undefined, process.env.DESKCORD_PLUGIN_REPOSITORY ?? distribution.repository);
    } catch {
        const unavailable = () => { throw new Error("Não foi possível abrir a pasta dos plugins. Verifique as permissões e reinicie o Discord."); };
        return {
            startup: [], state: () => ({ repository: "", installed: [], enabled: [], loadedAtStartup: [], errors: { startup: "Os plugins opcionais não puderam ser preparados. O núcleo continua disponível." } }),
            install: unavailable, remove: unavailable, setEnabled: unavailable, setRepository: unavailable, nativePath: unavailable
        };
    }
}
export const pluginStore = openStore();
if (process.argv.includes("--vanilla") || process.argv.includes("--deskcord-safe")) pluginStore.startup.length = 0;
Object.assign(globalThis, { __DeskcordMainSettings: { NativeSettings, RendererSettings } });

export function requireDiscordFrame(event: IpcMainEvent | IpcMainInvokeEvent) {
    try {
        const url = new URL(event.senderFrame?.url ?? "");
        if (event.senderFrame === event.sender.mainFrame && url.protocol === "https:"
            && ["discord.com", "canary.discord.com", "ptb.discord.com"].includes(url.hostname)) return;
    } catch { /* Reject non-Discord and detached frames. */ }
    throw new Error("Origem não autorizada para gerenciar plugins.");
}

export function startupRenderer() {
    return pluginStore.startup.map(({ plugin, package: pkg }) =>
        `;try{${pkg.renderer}\n}catch(e){Vencord.Deskcord.failed(${JSON.stringify(plugin.name)});}\n`)
        .join("\n") + "\n;Vencord.boot();\n";
}

export function startupCss() {
    return pluginStore.startup.map(item => item.package.css).join("\n");
}

export function nativePlugins() {
    const result: Record<string, Record<string, (...args: any[]) => any>> = {};
    for (const { plugin, package: pkg } of pluginStore.startup) if (pkg.native) {
        try { result[plugin.name] = require(pluginStore.nativePath(plugin.id, pkg.native)); }
        catch { console.error(`[Deskcord] Não foi possível carregar o módulo nativo ${plugin.name}.`); }
    }
    return result;
}

ipcMain.handle(IpcEvents.DESKCORD_PLUGINS_STATE, event => { requireDiscordFrame(event); return pluginStore.state(); });
ipcMain.handle(IpcEvents.DESKCORD_PLUGINS_INSTALL, (event, id: unknown) => { requireDiscordFrame(event); return pluginStore.install(id); });
ipcMain.handle(IpcEvents.DESKCORD_PLUGINS_ENABLE, (event, id: unknown, enabled: unknown) => { requireDiscordFrame(event); return pluginStore.setEnabled(id, enabled); });
ipcMain.handle(IpcEvents.DESKCORD_PLUGINS_REMOVE, (event, id: unknown) => { requireDiscordFrame(event); return pluginStore.remove(id); });
ipcMain.handle(IpcEvents.DESKCORD_PLUGINS_REPOSITORY, (event, url: unknown) => { requireDiscordFrame(event); return pluginStore.setRepository(url); });
