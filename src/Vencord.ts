/*!
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

// Keep the upstream global name for the Webpack patcher's runtime references.
import "~plugins";
import "./fixWeirdAppRegionBug.css";

export * as Api from "./api";
export * as Plugins from "./api/PluginManager";
export { PlainSettings, Settings } from "./api/Settings";
export * as Deskcord from "./deskcord/plugins/runtime";
export * as Util from "./utils";
export * as Updater from "./utils/updater";
export * as Webpack from "./webpack";
export * as WebpackPatcher from "./webpack/patchWebpack";

import { initPluginManager, startAllPlugins } from "@api/PluginManager";
import { SettingsStore } from "@api/Settings";
import { initStyles } from "@api/Styles";
import { StartAt } from "@utils/types";
import { onceReady } from "@webpack";

import { preparePerformanceHooks, syncAppearanceClass, syncPotatoClass } from "./deskcord/performance";
import { prepare } from "./deskcord/plugins/runtime";

let booted = false;
export function boot() {
    if (booted) return;
    booted = true;
    prepare();
    initPluginManager();
    initStyles();
    startAllPlugins(StartAt.Init);
    onceReady.then(() => {
        startAllPlugins(StartAt.WebpackReady);
        preparePerformanceHooks();
    }).catch(() => console.error("[Deskcord] Falha na integração de desempenho."));
    SettingsStore.addChangeListener("deskcord.potato", syncPotatoClass);
    SettingsStore.addChangeListener("deskcord.classicCompact", syncAppearanceClass);
    const onDomReady = () => {
        startAllPlugins(StartAt.DOMContentLoaded);
        syncPotatoClass();
        syncAppearanceClass();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
    else onDomReady();
}
