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

import electron, { app, BrowserWindowConstructorOptions, Menu } from "electron";
import { dirname, join } from "path";

import { RendererSettings } from "./settings";
import { IS_VANILLA } from "./utils/constants";

console.log("[Deskcord] Starting up...");

// Opt-in local installation check. Reports only Deskcord availability, never account data.
if (process.env.DESKCORD_DIAGNOSTICS === "1") {
    app.on("web-contents-created", (_event, contents) => {
        contents.once("did-finish-load", () => {
            setTimeout(() => {
                void contents.executeJavaScript('JSON.stringify({renderer:typeof Vencord!=="undefined",native:typeof VencordNative!=="undefined",deskcord:typeof Vencord!=="undefined"&&typeof Vencord.Deskcord!=="undefined"})')
                    .then(result => console.log("[Deskcord] Host check:", result))
                    .catch(() => console.log("[Deskcord] Host check unavailable"));
            }, 8000).unref();
        });
    });
}

// Our injector file at app/index.js
const injectorPath = require.main!.filename;

// Original Discord app.asar name
const asarName = require.main!.path.endsWith("app.asar") ? "_app.asar" : "app.asar";

// Original Discord app.asar
const asarPath = join(dirname(injectorPath), "..", asarName);

const discordPkg = require(join(asarPath, "package.json"));
require.main!.filename = join(asarPath, discordPkg.main);

// @ts-expect-error Untyped method? Dies from cringe
app.setAppPath(asarPath);

if (!IS_VANILLA) {
    const settings = RendererSettings.store;

    // Repatch after host updates on Windows and Linux
    if (process.platform === "win32" || process.platform === "linux") {
        require("./persistAfterDiscordUpdates");
    }

    if (process.platform === "win32" && settings.winCtrlQ) {
        const originalBuild = Menu.buildFromTemplate;
        Menu.buildFromTemplate = function (template) {
            if (template[0]?.label === "&File") {
                const { submenu } = template[0];
                if (Array.isArray(submenu)) {
                    submenu.push({
                        label: "Quit (Hidden)",
                        visible: false,
                        acceleratorWorksWhenHidden: true,
                        accelerator: "Control+Q",
                        click: () => app.quit()
                    });
                }
            }
            return originalBuild.call(this, template);
        };
    }

    class BrowserWindow extends electron.BrowserWindow {
        constructor(options: BrowserWindowConstructorOptions) {
            const preferences = options?.webPreferences;
            const sandboxed = preferences?.sandbox !== false && preferences?.nodeIntegration !== true;
            if (!preferences?.preload || !options.title || preferences.sandbox === true || sandboxed) {
                super(options);
                return;
            }

            const { nativeTitleBar, disableMinSize, transparent, macosVibrancyStyle, windowsMaterial } = settings;

            const original = preferences.preload;
            preferences.preload = join(__dirname, "preload.js");
            // Preserve Discord's sandbox configuration. A sandboxed host is left unmodified.

            if (nativeTitleBar) {
                delete options.frame;
            }

            if (disableMinSize) {
                options.minWidth = 0;
                options.minHeight = 0;
            }

            if (transparent) {
                options.transparent = true;
                options.backgroundColor = "#00000000";
            }
            if (process.platform === "darwin" && macosVibrancyStyle) {
                options.vibrancy = macosVibrancyStyle;
                options.backgroundColor = "#00000000";
            }
            if (process.platform === "win32" && windowsMaterial && windowsMaterial !== "none") {
                options.backgroundMaterial = windowsMaterial;
                options.backgroundColor = "#00000000";
            }

            process.env.DISCORD_PRELOAD = original;

            super(options);

            if (disableMinSize) {
                // Disable the Electron call entirely so that Discord can't dynamically change the size
                this.setMinimumSize = (_width: number, _height: number) => { };
            }
        }
    }
    Object.assign(BrowserWindow, electron.BrowserWindow);
    // esbuild may rename our BrowserWindow, which leads to it being excluded
    // from getFocusedWindow(), so this is necessary
    // https://github.com/discord/electron/blob/13-x-y/lib/browser/api/browser-window.ts#L60-L62
    Object.defineProperty(BrowserWindow, "name", { value: "BrowserWindow", configurable: true });

    // Replace electrons exports with our custom BrowserWindow
    const electronPath = require.resolve("electron");
    delete require.cache[electronPath]!.exports;
    require.cache[electronPath]!.exports = {
        ...electron,
        BrowserWindow
    };

} else {
    console.log("[Deskcord] Running in vanilla mode. Not loading Deskcord");
}

console.log("[Deskcord] Loading original Discord app.asar");
require(require.main!.filename);
