/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { getUserSetting } from "@api/UserSettings";
import { Logger } from "@utils/Logger";

import { potatoOverrides, wrapMediaSetting } from "./potato";

const logger = new Logger("Deskcord");
const controls = new Map<string, NonNullable<ReturnType<typeof getUserSetting>>>();
const hooks = new Map<string, () => void>();
const listeners = new Set<() => void>();
let ready = false;

export function getCompatibilityCount() {
    return controls.size;
}

export function subscribeCompatibility(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function syncPotatoClass() {
    const enabled = Settings.deskcord.potato;
    document.documentElement.classList.toggle("dc-potato", enabled);
    if (enabled && ready) discoverControls();
    for (const [key, setting] of controls) {
        try {
            if (enabled && !hooks.has(key)) hooks.set(key, wrapMediaSetting(setting, key, () => Settings.deskcord.potato));
            else if (!enabled && hooks.has(key)) { hooks.get(key)!(); hooks.delete(key); }
        } catch {
            controls.delete(key); hooks.delete(key);
            logger.warn(`Controle local indisponível: ${key}`);
            listeners.forEach(listener => listener());
        }
    }
}

export function syncAppearanceClass() {
    document.documentElement.classList.toggle("dc-classic", Settings.deskcord.classicCompact);
}

export function installPerformanceHooks() {
    ready = true;
    discoverControls();
    syncPotatoClass();
}

export function preparePerformanceHooks() {
    ready = true;
    syncPotatoClass();
}

function discoverControls() {
    const previousCount = controls.size;
    for (const key of Object.keys(potatoOverrides)) {
        if (controls.has(key)) continue;
        try {
            const setting = getUserSetting("textAndImages", key);
            if (!setting) continue;
            controls.set(key, setting);
        } catch {
            logger.warn(`Controle local indisponível: ${key}`);
        }
    }
    if (controls.size !== previousCount) listeners.forEach(listener => listener());
}
