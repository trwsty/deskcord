/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as React from "react";

import pluginCatalog from "../../src/deskcord/plugins/catalog.json";
import { dependencyOrder, PluginCatalog, PluginState } from "../../src/deskcord/plugins/model";
export { React };
export { useEffect, useRef, useState } from "react";

let version = 0;
const listeners = new Set<() => void>();
const data = { deskcord: { potato: false, disableThemesInPotato: true }, enabledThemes: [] as string[] };
const saved = localStorage.getItem("deskcord-preview");
try { if (saved) Object.assign(data, JSON.parse(saved)); } catch { /* Invalid preview storage is ignored. */ }
function notify() {
    version++;
    document.documentElement.classList.toggle("dc-potato", data.deskcord.potato);
    localStorage.setItem("deskcord-preview", JSON.stringify(data));
    listeners.forEach(listener => listener());
}
const nested = new Proxy(data.deskcord, { set(target, key, value) { Reflect.set(target, key, value); notify(); return true; } });
export const Settings = new Proxy(data, {
    get(target, key) { return key === "deskcord" ? nested : Reflect.get(target, key); },
    set(target, key, value) { Reflect.set(target, key, value); notify(); return true; }
});
export function useSettings() {
    React.useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version);
    return Settings;
}

export const SettingsStore = {
    addChangeListener: (_path: string, listener: () => void) => { listeners.add(listener); }
};
export const userStyleRootNode = document.head;
const themes: { fileName: string; name: string; author: string; description: string; version?: string; css: string; }[] = [];
let failList = false;
let opened = 0;
let reads = 0;
export function getCompatibilityCount() { return 6; }
export function subscribeCompatibility() { return () => { }; }
export function installPerformanceHooks() { }
export function status(name: string) {
    const id = pluginCatalog.plugins.find(plugin => plugin.name === name)?.id;
    return id && pluginState.loadedAtStartup.includes(id) ? "active" : "not-loaded";
}
export function relaunch() { }
export function isSettingHidden(options: any, definition: any) { return typeof definition.hidden === "function" ? definition.hidden.call(options) : Boolean(definition.hidden); }
export function isSettingDisabled(options: any, definition: any) { return typeof definition.disabled === "function" ? definition.disabled.call(options) : Boolean(definition.disabled); }
const optionValues = new Proxy({ format: "stopwatch" }, { set(target, key, value) { Reflect.set(target, key, value); notify(); return true; } });
export function optionsFor(name: string): ReturnType<typeof import("../../src/deskcord/plugins/runtime").optionsFor> {
    if (name !== "CallTimer" || !pluginState.loadedAtStartup.includes("vencord-calltimer")) return;
    return { def: { format: { type: 4, description: "Timer format", options: [{ label: "Stopwatch", value: "stopwatch" }, { label: "Human", value: "human" }] } }, store: optionValues } as unknown as ReturnType<typeof import("../../src/deskcord/plugins/runtime").optionsFor>;
}
const pluginState: PluginState = { repository: "", installed: [], enabled: [], loadedAtStartup: [], errors: {} };
const downloadedPlugins: string[] = [];
let failPluginDownload = false;
function snapshot() { return structuredClone(pluginState); }

class PreviewBoundary extends React.Component<React.PropsWithChildren, { error: boolean; }> {
    state = { error: false };
    static getDerivedStateFromError() { return { error: true }; }
    render() { return this.state.error ? <p role="alert">Falha ao renderizar a prévia.</p> : this.props.children; }
    static wrap<T extends object>(Component: React.ComponentType<T>) { return (props: T) => <PreviewBoundary><Component {...props} /></PreviewBoundary>; }
}
export default PreviewBoundary;

Object.assign(window, {
    VencordNative: { settings: { openFolder: async () => { opened++; } }, plugins: {
        state: async () => snapshot(),
        setRepository: async (url: string) => { pluginState.repository = url; return snapshot(); },
        install: async (id: string) => {
            if (failPluginDownload) throw new Error("Falha de download de teste.");
            const ids = dependencyOrder(pluginCatalog as PluginCatalog, [id]).map(plugin => plugin.id);
            downloadedPlugins.push(...ids.filter(id => !pluginState.installed.includes(id)));
            pluginState.installed = [...new Set([...pluginState.installed, ...ids])];
            pluginState.enabled = [...new Set([...pluginState.enabled, ...ids])];
            return snapshot();
        },
        setEnabled: async (id: string, enabled: boolean) => { pluginState.enabled = enabled ? [...new Set([...pluginState.enabled, id])] : pluginState.enabled.filter(value => value !== id); return snapshot(); },
        remove: async (id: string) => { pluginState.installed = pluginState.installed.filter(value => value !== id); pluginState.enabled = pluginState.enabled.filter(value => value !== id); return snapshot(); }
    }, themes: {
        getThemesList: async () => { if (failList) throw new Error("Fixture: unreadable folder"); return themes.map(({ css, ...info }) => info); },
        openFolder: async () => { opened++; },
        getThemeData: async (file: string) => {
            reads++;
            const css = themes.find(theme => theme.fileName === file)?.css;
            if (css === "!invalid") throw new Error("CSS de teste inválido.");
            return css;
        }
    } },
    DeskcordPreview: {
        addTheme: (theme: typeof themes[number]) => themes.push(theme),
        clearThemes: () => { themes.length = 0; },
        failList: (value: boolean) => { failList = value; },
        getOpenedCount: () => opened,
        getReadCount: () => reads,
        editTheme: (file: string, css: string) => { const theme = themes.find(item => item.fileName === file); if (theme) theme.css = css; },
        settings: Settings,
        getPluginDownloads: () => [...downloadedPlugins],
        failPluginDownload: (value: boolean) => { failPluginDownload = value; },
        restartPlugins: () => { pluginState.loadedAtStartup = [...pluginState.enabled]; },
        getOptionValue: () => optionValues.format
    }
});
