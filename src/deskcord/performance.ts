/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings, useSettings } from "@api/Settings";
import { getUserSetting } from "@api/UserSettings";
import { Logger } from "@utils/Logger";

import { effectiveSetting, potatoOverrides } from "./potato";

const logger = new Logger("Deskcord");
const hooks = new Map<string, () => void>();
const listeners = new Set<() => void>();

export function getCompatibilityCount() {
    return hooks.size;
}

export function subscribeCompatibility(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function syncPotatoClass() {
    document.documentElement.classList.toggle("dc-potato", Settings.deskcord.potato);
}

export function installPerformanceHooks() {
    for (const key of Object.keys(potatoOverrides)) {
        if (hooks.has(key)) continue;
        try {
            const setting = getUserSetting("textAndImages", key);
            if (!setting) continue;
            const { getSetting, useSetting } = setting;
            setting.getSetting = function () {
                return effectiveSetting(key, getSetting.call(setting), Settings.deskcord.potato);
            };
            setting.useSetting = function () {
                // Keep Discord's original hook unconditionally subscribed.
                const original = useSetting.call(setting);
                const { deskcord } = useSettings(["deskcord.potato"]);
                return effectiveSetting(key, original, deskcord.potato);
            };
            hooks.set(key, () => Object.assign(setting, { getSetting, useSetting }));
        } catch {
            logger.warn(`Controle local indisponível: ${key}`);
        }
    }
    syncPotatoClass();
    listeners.forEach(listener => listener());
}
