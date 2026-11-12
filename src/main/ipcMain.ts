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

import "./updater";
import "./ipcPlugins";
import "./settings";

import { debounce } from "@shared/debounce";
import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain, nativeTheme, shell, systemPreferences } from "electron";
import { FSWatcher, mkdirSync, readFileSync, watch, writeFileSync } from "fs";
import { open, readdir, readFile } from "fs/promises";
import { release } from "os";
import { join } from "path";

import { requireDiscordFrame, startupCss, startupRenderer } from "./plugins";
import { getThemeInfo, stripBOM, UserThemeHeader } from "./themes";
import { compileTheme, readLocalTheme, readLocalThemeHeader } from "./themes/deskcord";
import { ALLOWED_PROTOCOLS, QUICK_CSS_PATH, SETTINGS_DIR, THEMES_DIR } from "./utils/constants";

const RENDERER_CSS_PATH = join(__dirname, IS_VESKTOP ? "vencordDesktopRenderer.css" : "renderer.css");

mkdirSync(THEMES_DIR, { recursive: true });



function readCss() {
    return readFile(QUICK_CSS_PATH, "utf-8").catch(() => "");
}

async function listThemes(): Promise<UserThemeHeader[]> {
    const files = await readdir(THEMES_DIR);

    const themeInfo: UserThemeHeader[] = [];

    const cssFiles = files.filter(file => /\.css$/i.test(file)).sort();
    if (cssFiles.length > 256) throw new Error("Máximo de 256 temas locais.");
    for (const fileName of cssFiles) {

        const data = await readLocalThemeHeader(THEMES_DIR, fileName).then(stripBOM).catch(() => null);
        if (data == null) continue;

        const info = getThemeInfo(data, fileName);
        info.name = info.name.slice(0, 160);
        info.author = info.author.slice(0, 160);
        info.description = info.description.slice(0, 1000);
        info.version = info.version?.slice(0, 40);
        themeInfo.push(info);
    }

    return themeInfo;
}

async function getThemeData(fileName: string) {
    return compileTheme(await readLocalTheme(THEMES_DIR, fileName));
}

ipcMain.handle(IpcEvents.OPEN_QUICKCSS, () => shell.openPath(QUICK_CSS_PATH));

ipcMain.handle(IpcEvents.OPEN_EXTERNAL, (_, url) => {
    try {
        var { protocol } = new URL(url);
    } catch {
        throw "Malformed URL";
    }
    if (!ALLOWED_PROTOCOLS.includes(protocol))
        throw "Disallowed protocol.";

    shell.openExternal(url)
        .catch(err => console.error("[Vencord] Failed to open external link", url, err));
});


ipcMain.handle(IpcEvents.GET_QUICK_CSS, () => readCss());
ipcMain.handle(IpcEvents.SET_QUICK_CSS, (_, css) =>
    writeFileSync(QUICK_CSS_PATH, css)
);

ipcMain.handle(IpcEvents.GET_THEMES_LIST, () => listThemes());
ipcMain.handle(IpcEvents.GET_THEME_DATA, (_, fileName) => getThemeData(fileName));
ipcMain.handle(IpcEvents.GET_THEME_SYSTEM_VALUES, () => {
    let accentColor = systemPreferences.getAccentColor?.() ?? "";

    if (accentColor.length && accentColor[0] !== "#") {
        accentColor = `#${accentColor}`;
    }

    return {
        "os-accent-color": accentColor
    };
});

ipcMain.handle(IpcEvents.OPEN_THEMES_FOLDER, async () => {
    const error = await shell.openPath(THEMES_DIR);
    if (error) throw new Error("Não foi possível abrir a pasta de temas.");
});
ipcMain.handle(IpcEvents.OPEN_SETTINGS_FOLDER, async () => {
    const error = await shell.openPath(SETTINGS_DIR);
    if (error) throw new Error("Não foi possível abrir a pasta de configurações.");
});

let fsWatchers = [] as FSWatcher[];

ipcMain.handle(IpcEvents.INIT_FILE_WATCHERS, ({ sender }) => {
    fsWatchers.forEach(w => w.close());

    let quickCssWatcher: FSWatcher | undefined;
    let rendererCssWatcher: FSWatcher | undefined;

    open(QUICK_CSS_PATH, "a+").then(fd => {
        fd.close();
        quickCssWatcher = watch(QUICK_CSS_PATH, { persistent: false }, debounce(async () => {
            sender.postMessage(IpcEvents.QUICK_CSS_UPDATE, await readCss());
        }, 50));
    }).catch(() => { });

    const themesWatcher = watch(THEMES_DIR, { persistent: false }, debounce(() => {
        sender.postMessage(IpcEvents.THEME_UPDATE, void 0);
    }));

    if (IS_DEV) {
        rendererCssWatcher = watch(RENDERER_CSS_PATH, { persistent: false }, async () => {
            sender.postMessage(IpcEvents.RENDERER_CSS_UPDATE, await readFile(RENDERER_CSS_PATH, "utf-8"));
        });
    }

    fsWatchers = [quickCssWatcher, themesWatcher, rendererCssWatcher].filter(Boolean) as FSWatcher[];

    sender.once("destroyed", () => {
        quickCssWatcher?.close();
        themesWatcher.close();
        rendererCssWatcher?.close();
        fsWatchers = [];
    });
});

ipcMain.on(IpcEvents.GET_MONACO_THEME, e => {
    e.returnValue = nativeTheme.shouldUseDarkColors ? "vs-dark" : "vs-light";
});

ipcMain.handle(IpcEvents.OPEN_MONACO_EDITOR, () => {
    throw new Error("Editor remoto indisponível no Deskcord.");
});

ipcMain.handle(IpcEvents.GET_RENDERER_CSS, async event => { requireDiscordFrame(event); return await readFile(RENDERER_CSS_PATH, "utf-8") + "\n" + startupCss(); });

if (IS_DISCORD_DESKTOP) {
    ipcMain.on(IpcEvents.PRELOAD_GET_RENDERER_JS, e => {
        try {
            requireDiscordFrame(e);
            e.returnValue = readFileSync(join(__dirname, "renderer.js"), "utf-8") + "\n" + startupRenderer();
        } catch { e.returnValue = ""; }
    });
}

ipcMain.on(IpcEvents.SUPPORTS_WINDOWS_MATERIAL, e => {
    e.returnValue = process.platform === "win32" && Number(release().split(".")[2]) >= 22621;
});
