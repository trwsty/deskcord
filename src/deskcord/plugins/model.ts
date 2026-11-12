/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type PluginOrigin = "vencord" | "betterdiscord" | "equicord" | "universal" | "deskcord";
export interface CatalogPlugin {
    id: string;
    name: string;
    origin: PluginOrigin;
    description: string;
    authors: { name: string; id: string; }[];
    categories: string[];
    source: string;
    hidden: boolean;
    builtin: boolean;
    dependencies: string[];
    available: boolean;
    reason?: string;
    sha256?: string;
    bytes?: number;
    file?: string;
    hasNative: boolean;
    hasSettings?: boolean;
}
export interface PluginCatalog {
    format: 1;
    revision: string;
    plugins: CatalogPlugin[];
}
export interface PluginState {
    repository: string;
    enabled: string[];
    installed: string[];
    loadedAtStartup: string[];
    errors: Record<string, string>;
}
export interface PluginPackage {
    format: 1;
    id: string;
    name: string;
    revision: string;
    renderer: string;
    css: string;
    native?: string;
}

export function dependencyOrder(catalog: PluginCatalog, roots: string[]): CatalogPlugin[] {
    const byId = new Map(catalog.plugins.map(plugin => [plugin.id, plugin]));
    const result: CatalogPlugin[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    function visit(id: string) {
        if (visited.has(id)) return;
        if (visiting.has(id)) throw new Error("Dependência circular no catálogo.");
        const plugin = byId.get(id);
        if (!plugin || !plugin.available) throw new Error("Plugin ou dependência indisponível nesta versão.");
        if (plugin.builtin) { visited.add(id); return; }
        visiting.add(id);
        plugin.dependencies.forEach(visit);
        visiting.delete(id);
        visited.add(id);
        result.push(plugin);
    }
    roots.forEach(visit);
    if (result.length > 128) throw new Error("Máximo de 128 módulos instalados.");
    return result;
}

export const origins: Record<PluginOrigin, string> = {
    vencord: "Vencord", betterdiscord: "BetterDiscord", equicord: "Equicord", universal: "Universais", deskcord: "Deskcord"
};
