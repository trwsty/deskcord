/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDeskcordArchive } from "./installer-core.mjs";
import { deploy } from "./native-worker.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(join(here, "renderer.js")) ? resolve(here, "..") : resolve(here, "../..");
const sourceBundle = join(projectRoot, "dist");
const args = process.argv.slice(2);
const action = args[0] ?? "list";

async function discover() {
    if (!process.env.LOCALAPPDATA) return [];
    const results = [];
    for (const channel of ["Discord", "DiscordPTB", "DiscordCanary"]) {
        const root = join(process.env.LOCALAPPDATA, channel);
        const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
        const versions = entries.filter(entry => entry.isDirectory() && /^app-\d+\.\d+\.\d+$/.test(entry.name))
            .map(entry => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        if (versions[0]) {
            const resources = join(root, versions[0], "resources");
            if (existsSync(join(resources, "app.asar"))) results.push({ channel, resources });
        }
    }
    return results;
}

function requireStopped() {
    const list = execFileSync("tasklist.exe", ["/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
    if (/"Discord(?:PTB|Canary)?\.exe"/i.test(list)) throw new Error("Feche o Discord completamente, inclusive na bandeja, e tente novamente.");
}

async function main() {
    if (process.platform !== "win32") throw new Error("Este instalador é destinado ao Discord para Windows.");
    const found = await discover();
    if (action === "list") {
        if (!found.length) console.log("Nenhuma instalação padrão do Discord encontrada. Use --resources com o caminho da pasta resources.");
        for (const item of found) console.log(`${item.channel}: ${item.resources}${isDeskcordArchive(join(item.resources, "app.asar")) ? " [Deskcord]" : ""}`);
        return;
    }
    if (!["install", "uninstall"].includes(action)) throw new Error("Uso: install.mjs list | install | uninstall [--channel DiscordPTB] [--resources caminho]");
    const resourceIndex = args.indexOf("--resources");
    const channelIndex = args.indexOf("--channel");
    if (resourceIndex >= 0 && !args[resourceIndex + 1]) throw new Error("Informe o caminho após --resources.");
    const chosen = resourceIndex >= 0 ? resolve(args[resourceIndex + 1])
        : found.find(item => item.channel === (channelIndex >= 0 ? args[channelIndex + 1] : "Discord"))?.resources;
    if (!chosen) throw new Error("Discord não encontrado. Execute list para verificar as instalações.");
    requireStopped();
    if (action === "uninstall") {
        await deploy(chosen, sourceBundle, "uninstall");
        console.log("Deskcord removido. O app.asar original foi restaurado. Seus temas foram preservados.");
        return;
    }
    await deploy(chosen, sourceBundle, "install");
    console.log("Deskcord instalado. Abra o Discord e procure a seção Deskcord nas configurações.\nTemas: %APPDATA%\\Deskcord\\themes");
}

main().catch(error => { console.error(`Deskcord: ${error.message}`); process.exitCode = 1; });
