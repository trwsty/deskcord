/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { plugins } from "@api/PluginManager";
import { Settings } from "@api/Settings";
import type { Plugin } from "@utils/types";

const failures = new Set<string>();

export function register(name: string, plugin: Plugin) {
    if (Object.hasOwn(plugins, name) || plugin.name !== name) throw new Error("Registro de plugin incompatível.");
    plugin.required = false;
    plugin.enabledByDefault = false;
    plugins[name] = plugin;
    Settings.plugins[name].enabled = true;
}

export function failed(name: string) {
    failures.add(name);
    console.error(`[Deskcord] Falha ao preparar o plugin ${name}.`);
}

export function prepare() {
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
    for (const name of failures) delete plugins[name];
}

export function status(name: string): "active" | "failed" | "not-loaded" {
    if (failures.has(name)) return "failed";
    return plugins[name]?.started ? "active" : "not-loaded";
}

export function optionsFor(name: string) {
    return plugins[name]?.settings;
}
