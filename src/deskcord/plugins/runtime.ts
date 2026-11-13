/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { initializePluginRuntime, plugins, startPlugin, stopPlugin } from "@api/PluginManager";
import { Settings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import type { Plugin } from "@utils/types";

import catalogJson from "./catalog.json";
import { dependencyOrder, PluginCatalog, PluginState } from "./model";

const catalog = catalogJson as PluginCatalog;
let prepared = false;
let queue: Promise<void> = Promise.resolve();
const styles = new Map<string, HTMLStyleElement>();
const styleSources = new Map<string, string>();

const failures = new Set<string>();

export function register(name: string, plugin: Plugin) {
    if (Object.hasOwn(plugins, name) || plugin.name !== name) throw new Error("Registro de plugin incompatível.");
    plugin.required = false;
    plugin.enabledByDefault = false;
    plugins[name] = plugin;
    failures.delete(name);
    if (prepared) initializePluginRuntime(plugin);
    Settings.plugins[name].enabled = true;
}

export function failed(name: string) {
    failures.add(name);
    console.error(`[Deskcord] Falha ao preparar o plugin ${name}.`);
}

export function prepare() {
    prepared = true;
    let changed;
    do {
        changed = false;
        for (const plugin of Object.values(plugins)) {
            if (plugin.required || failures.has(plugin.name)) continue;
            if (plugin.dependencies?.some(name => !Object.hasOwn(plugins, name) || failures.has(name))) {
                failures.add(plugin.name); changed = true;
            }
        }
    } while (changed);
    for (const name of failures) {
        delete plugins[name];
        styles.get(name)?.remove(); styles.delete(name);
    }
}

export function setCss(name: string, css: string) {
    styles.get(name)?.remove();
    styles.delete(name); styleSources.set(name, css);
    if (!css) return;
    const style = document.createElement("style");
    style.dataset.deskcordPlugin = name;
    style.textContent = css;
    managedStyleRootNode.append(style);
    styles.set(name, style);
}

function live(name: string) {
    const plugin = plugins[name];
    return plugin && !failures.has(name) && !plugin.patches?.length && !plugin.requiresRestart && (!plugin.start || !!plugin.stop)
        && plugin.start?.constructor.name !== "AsyncFunction" && plugin.stop?.constructor.name !== "AsyncFunction";
}

export function needsRestart(state: PluginState) {
    return catalog.plugins.some(plugin => !plugin.builtin && (state.enabled.includes(plugin.id)
        ? status(plugin.name) !== "active" : !!plugins[plugin.name]?.started || failures.has(plugin.name) || (plugin.hasNative && state.loadedAtStartup.includes(plugin.id))));
}

export function applyState(before: PluginState, next: PluginState) {
    const result = queue.then(() => applyChanges(before, next));
    queue = result.catch(() => { });
    return result;
}

async function applyChanges(before: PluginState, next: PluginState) {
    const removed = dependencyOrder(catalog, before.enabled).filter(plugin => !next.enabled.includes(plugin.id));
    const blocked = new Set(removed.filter(plugin => plugins[plugin.name]?.started && (!plugin.hotReload || !live(plugin.name)))
        .flatMap(plugin => dependencyOrder(catalog, [plugin.id]).map(item => item.id)));
    for (const plugin of removed.reverse()) {
        if (blocked.has(plugin.id)) continue;
        const current = plugins[plugin.name];
        if (current?.started && !stopPlugin(current)) throw new Error("Os arquivos foram removidos, mas o plugin não conseguiu parar. Reinicie o Discord.");
        Settings.plugins[plugin.name].enabled = false;
        styles.get(plugin.name)?.remove(); styles.delete(plugin.name);
    }
    for (const id of next.enabled.filter(id => !before.enabled.includes(id))) {
        const order = dependencyOrder(catalog, [id]);
        if (order.some(plugin => !plugins[plugin.name]?.started && (!plugin.hotReload || (plugins[plugin.name] && !live(plugin.name))))) continue;
        const missing = order.filter(plugin => !plugins[plugin.name]);
        if (missing.length) await VencordNative.plugins.load(missing.map(plugin => plugin.id));
        for (const plugin of order) {
            const current = plugins[plugin.name];
            if (current?.started) continue;
            if (!current || !live(plugin.name)) throw new Error("Este plugin precisa de reinício para iniciar com segurança.");
            Settings.plugins[plugin.name].enabled = true;
            setCss(plugin.name, styleSources.get(plugin.name) ?? "");
            if (!current.started && !startPlugin(current)) {
                failed(plugin.name);
                throw new Error("Não foi possível iniciar o plugin. Desative-o ou reinicie o Discord.");
            }
        }
    }
}

export function status(name: string): "active" | "failed" | "not-loaded" {
    if (failures.has(name)) return "failed";
    return plugins[name]?.started ? "active" : "not-loaded";
}

export function optionsFor(name: string) {
    return plugins[name]?.settings;
}
