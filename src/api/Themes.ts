/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Settings, SettingsStore } from "@api/Settings";
import { createAndAppendStyle } from "@utils/css";
import type { ThemeStore } from "@vencord/discord-types";

import { shouldSuspendThemes } from "../deskcord/potato";
import { userStyleRootNode } from "./Styles";

let themesStyle: HTMLStyleElement | undefined;
let pending: Promise<void> | undefined;
let dirty = false;
let requestedKey = "";
let errors: Record<string, string> = {};
const listeners = new Set<() => void>();

/** Reload enabled local themes; concurrent requests share a single bounded queue. */
export function refreshThemes(): Promise<void> {
    const { potato, disableThemesInPotato } = Settings.deskcord;
    const key = JSON.stringify([Settings.enabledThemes, potato, disableThemesInPotato]);
    if (pending && key === requestedKey) return pending;
    requestedKey = key;
    dirty = true;
    if (shouldSuspendThemes(potato, disableThemesInPotato) && themesStyle) {
        themesStyle.textContent = "";
        errors = {};
    }
    if (pending) return pending;
    pending = (async () => {
        while (dirty) {
            dirty = false;
            themesStyle ??= createAndAppendStyle("deskcord-themes", userStyleRootNode);
            const { potato, disableThemesInPotato } = Settings.deskcord;
            if (shouldSuspendThemes(potato, disableThemesInPotato)) {
                themesStyle.textContent = "";
                errors = {};
                continue;
            }
            const nextErrors: Record<string, string> = {};
            const styles: string[] = [];
            // Sequential to bound native file reads and import downloads.
            for (const file of Settings.enabledThemes.slice(0, 32)) {
                if (dirty) break;
                try {
                    styles.push(await VencordNative.themes.getThemeData(file) ?? "");
                } catch (error) {
                    nextErrors[file] = error instanceof Error ? error.message : "Falha ao carregar CSS.";
                }
            }
            if (!dirty) {
                themesStyle.textContent = styles.join("\n");
                errors = nextErrors;
            }
        }
        listeners.forEach(listener => listener());
    })().finally(() => { pending = undefined; });
    return pending;
}

/** Current file-specific errors, without changing theme selections. */
export function getThemeErrors() { return { ...errors }; }

function init() {
    const reload = () => { refreshThemes().catch(() => { console.error("[Deskcord] Falha ao carregar temas."); }); };
    reload();
    SettingsStore.addChangeListener("enabledThemes", reload);
    SettingsStore.addChangeListener("deskcord.potato", () => {
        if (Settings.deskcord.disableThemesInPotato) reload();
    });
    SettingsStore.addChangeListener("deskcord.disableThemesInPotato", () => {
        if (Settings.deskcord.potato) reload();
    });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

/** Compatibility hook used by the underlying Discord ThemeStore integration. */
export function initQuickCssThemeStore(_store: ThemeStore) { }
/** Subscribe to applied theme changes. */
export function addThemeChangeListener(listener: () => void) { listeners.add(listener); }
/** Remove a theme subscription. */
export function removeThemeChangeListener(listener: () => void) { listeners.delete(listener); }
