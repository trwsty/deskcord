/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { build } from "esbuild";
import ts from "typescript";

import { coreFiles } from "../../src/deskcord/buildProfile.mjs";
import { commonOpts, commonRendererPlugins, stringifyValues } from "../build/common.mjs";

const revision = "d07030c0968e31e41caa0c35fda0ef8ae63a079e";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const output = resolve("plugin-repository");
await mkdir(output, { recursive: true });
await mkdir(".preview", { recursive: true });
await mkdir("src/deskcord/plugins", { recursive: true });
execFileSync(process.execPath, ["--import", "tsx", "scripts/generatePluginList.ts", ".preview/catalog-source.json", ".preview/catalog-readmes.json", "--include-api"], { stdio: "inherit" });
const sources = JSON.parse(await readFile(".preview/catalog-source.json", "utf8"));
const translations = JSON.parse(await readFile("src/deskcord/plugins/descriptions.pt-BR.json", "utf8"));
const byName = new Map(sources.map(source => [source.name, source]));
const byFolder = new Map(sources.map(source => [source.filePath.replace(/\.tsx?$/, ""), source]));
const ids = new Map(sources.map(source => [source.name, "vencord-" + source.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")]));
const defines = stringifyValues({ IS_STANDALONE: true, IS_DEV: false, IS_REPORTER: false, IS_ANTI_CRASH_TEST: false,
    IS_UPDATER_DISABLED: true, IS_WEB: false, IS_EXTENSION: false, IS_USERSCRIPT: false,
    IS_DISCORD_DESKTOP: true, IS_VESKTOP: false, VERSION: version, BUILD_TIMESTAMP: 0, DESKTOP_MONACO_EDITOR_URL: "" });
const tags = { Accessibility: "Acessibilidade", Activity: "Atividade", Appearance: "Aparência", Chat: "Conversa", Commands: "Comandos", Console: "Desenvolvimento", Customisation: "Personalização", Developers: "Desenvolvimento", Emotes: "Emojis", Friends: "Amigos", Fun: "Diversão", Media: "Mídia", Notifications: "Notificações", Organisation: "Organização", Privacy: "Privacidade", Reactions: "Reações", Roles: "Cargos", Servers: "Servidores", Shortcuts: "Atalhos", Utility: "Utilidades", Voice: "Voz" };
const apiForProperty = { commands: "CommandsAPI", onBeforeMessageEdit: "MessageEventsAPI", onBeforeMessageSend: "MessageEventsAPI", onMessageClick: "MessageEventsAPI", chatBarButton: "ChatInputButtonAPI", renderMemberListDecorator: "MemberListDecoratorsAPI", renderMessageAccessory: "MessageAccessoriesAPI", renderMessageDecoration: "MessageDecorationsAPI", messagePopoverButton: "MessagePopoverAPI", userProfileBadge: "BadgeAPI", contextMenus: "ContextMenuAPI" };
const catalog = { format: 1, revision, plugins: [] };
const reports = [];
const licenseInputs = new Set();
for (const source of sources.sort((a, b) => a.name.localeCompare(b.name))) {
    const hidden = source.filePath.startsWith("_");
    const builtin = [...coreFiles].some(file => file.replace(/^plugins\//, "").replace(/\.tsx?$/, "") === source.filePath.replace(/\.tsx?$/, ""));
    let entry = join("src/plugins", source.filePath);
    if (!existsSync(entry)) entry += ".ts";
    if (existsSync(join(entry, "index.ts"))) entry = join(entry, "index.ts");
    else if (existsSync(join(entry, "index.tsx"))) entry = join(entry, "index.tsx");
    const info = { id: ids.get(source.name), name: source.name, origin: "vencord", description: hidden ? "Módulo interno de compatibilidade." : translations[source.name],
        authors: source.authors, categories: source.tags.map(tag => tags[tag]).filter(Boolean),
        source: `https://github.com/Vendicated/Vencord/tree/${revision}/src/plugins/${source.filePath}`, hidden, builtin,
        dependencies: [], available: true, hasNative: false, hasSettings: source.hasSettings };
    if (!info.description) throw new Error(`Tradução ausente: ${source.name}`);
    if (!info.categories.length) info.categories.push("Utilidades");
    if (builtin) { catalog.plugins.push(info); continue; }
    if (["web", "browser", "vesktop", "dev"].includes(source.target)) {
        info.available = false; info.reason = "Destinado ao navegador ou a outro ambiente; não se aplica ao Discord desktop.";
        catalog.plugins.push(info); continue;
    }
    const dependencies = new Set(source.dependencies);
    const sourceFile = ts.createSourceFile(entry, await readFile(entry, "utf8"), ts.ScriptTarget.Latest);
    let hasStart = false, hasStop = false, forcedRestart = true, asyncLifecycle = false;
    function scan(node) {
        if ((ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) && node.name && apiForProperty[node.name.getText(sourceFile)]) dependencies.add(apiForProperty[node.name.getText(sourceFile)]);
        if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === "definePlugin" && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
            forcedRestart = false;
            for (const property of node.arguments[0].properties) if (property.name) {
                const name = property.name.getText(sourceFile);
                if (name === "requiresRestart" && (!ts.isPropertyAssignment(property) || property.initializer.kind !== ts.SyntaxKind.FalseKeyword)) forcedRestart = true;
                if (name === "start") hasStart = true;
                if (name === "stop") hasStop = true;
                if (["start", "stop"].includes(name) && (property.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword)
                    || (ts.isPropertyAssignment(property) && property.initializer.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword)))) asyncLifecycle = true;
            }
        }
        ts.forEachChild(node, scan);
    }
    scan(sourceFile);
    const bridge = { name: "deskcord-shared-runtime", setup(builder) {
        builder.onResolve({ filter: /^(?:@webpack(?:\/.*)?|@api\/[A-Z][A-Za-z]+|~plugins|@plugins\/.*)$/ }, args => {
            if (args.path.startsWith("@plugins/")) {
                const folder = args.path.slice(9);
                const dependency = [...byFolder].sort((a, b) => b[0].length - a[0].length).find(([key]) => folder === key || folder.startsWith(key + "/"))?.[1];
                if (dependency && dependency.name !== source.name && folder === dependency.filePath.replace(/\.tsx?$/, "")) {
                    dependencies.add(dependency.name);
                    return { path: `plugin:${dependency.name}`, namespace: "deskcord-runtime" };
                }
                return;
            }
            if (args.path.startsWith("@webpack")) return { path: args.path, namespace: "deskcord-runtime" };
            if (args.path === "~plugins") return { path: args.path, namespace: "deskcord-runtime" };
            if (/^@api\/[A-Za-z]+$/.test(args.path)) return { path: args.path, namespace: "deskcord-runtime" };
        });
        builder.onLoad({ filter: /.*/, namespace: "deskcord-runtime" }, args => {
            const { path } = args;
            if (path.startsWith("plugin:")) return { contents: `module.exports = Vencord.Plugins.plugins[${JSON.stringify(path.slice(7))}];` };
            if (path === "~plugins") return { contents: "export default Vencord.Plugins.plugins; export const PluginMeta = {}; export const ExcludedPlugins = {};" };
            const expression = path === "@webpack" ? "Vencord.Webpack" : path === "@webpack/patcher" ? "Vencord.WebpackPatcher"
                : path.startsWith("@webpack/common") ? "Vencord.Webpack.Common" : path.startsWith("@webpack/") ? "Vencord.Webpack"
                    : `Vencord.Api.${path.slice(5)}`;
            return { contents: `module.exports = ${expression};` };
        });
        builder.onResolve({ filter: /^@components\/settings(?:\/tabs)?$/ }, () => ({ errors: [{ text: "Este plugin precisa de adaptação das telas de configurações do Vencord." }] }));
    } };
    try {
        const result = await build({ ...commonOpts, stdin: { contents: `import plugin from ${JSON.stringify("./" + entry.replaceAll("\\", "/"))}; Vencord.Deskcord.register(${JSON.stringify(source.name)}, plugin);`, resolveDir: process.cwd() },
            outfile: join(output, "plugin.js"), write: false, sourcemap: false, legalComments: "inline", format: "iife", platform: "browser", target: "chrome120", define: defines,
            external: ["/assets/*"], plugins: [bridge, ...commonRendererPlugins], metafile: true, logLevel: "silent" });
        Object.keys(result.metafile.inputs).forEach(input => licenseInputs.add(resolve(input)));
        for (const input of Object.keys(result.metafile.inputs)) {
            const importedSource = sources.find(other => input.replaceAll("\\", "/").replace(/\/index\.tsx?$/, "").replace(/\.tsx?$/, "") === `src/plugins/${other.filePath.replace(/\.tsx?$/, "")}`);
            if (importedSource && importedSource.name !== source.name) throw new Error("O plugin importa código de outro plugin sem uma fronteira de dependência suportada.");
        }
        const native = [join(dirname(entry), "native.ts"), join(dirname(entry), "native/index.ts")].find(path => existsSync(path));
        let nativeCode;
        if (native && !source.filePath.endsWith(".ts")) {
            const nativeBridge = { name: "deskcord-native-settings", setup(builder) {
                builder.onResolve({ filter: /^@main\/settings$/ }, () => ({ path: "settings", namespace: "deskcord-native-host" }));
                builder.onLoad({ filter: /.*/, namespace: "deskcord-native-host" }, () => ({ contents: "module.exports = globalThis.__DeskcordMainSettings;" }));
            } };
            const result = await build({ ...commonOpts, entryPoints: [native], write: false, sourcemap: false, legalComments: "inline", format: "cjs", platform: "node", define: defines, metafile: true,
                external: ["electron", "original-fs"], plugins: [nativeBridge, ...commonOpts.plugins], logLevel: "silent" });
            Object.keys(result.metafile.inputs).forEach(input => licenseInputs.add(resolve(input)));
            nativeCode = result.outputFiles[0].text;
            info.hasNative = true;
        }
        info.hotReload = !source.hasPatches && !info.hasNative && !forcedRestart && !asyncLifecycle && (!hasStart || hasStop);
        const payload = { format: 1, id: info.id, name: source.name, revision,
            renderer: result.outputFiles.find(file => file.path.endsWith(".js"))?.text ?? "",
            css: result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "", ...(nativeCode ? { native: nativeCode } : {}) };
        const bytes = Buffer.from(JSON.stringify(payload));
        info.sha256 = createHash("sha256").update(bytes).digest("hex");
        info.file = `${info.id}.${info.sha256}.json`;
        info.bytes = bytes.length;
        await writeFile(join(output, info.file), bytes);
    } catch (error) {
        info.available = false;
        info.reason = "Precisa de adaptação para o carregamento sob demanda do Deskcord.";
        reports.push({ name: source.name, error: error.message });
    }
    info.dependencies = [...dependencies].map(name => {
        if (!byName.has(name)) { info.available = false; info.reason = `Dependência ausente: ${name}.`; }
        return ids.get(name) ?? name;
    });
    catalog.plugins.push(info);
}
let changed;
do {
    changed = false;
    for (const plugin of catalog.plugins) if (plugin.available && plugin.dependencies.some(id => !catalog.plugins.find(other => other.id === id)?.available)) {
        plugin.available = false; plugin.reason = "Uma dependência ainda precisa de adaptação para o Deskcord."; changed = true;
    }
} while (changed);
await writeFile("src/deskcord/plugins/catalog.json", JSON.stringify(catalog, null, 4) + "\n");
execFileSync(process.execPath, ["node_modules/oxfmt/bin/oxfmt", "src/deskcord/plugins/catalog.json"], { stdio: "inherit" });
await writeFile(join(output, "catalog.json"), JSON.stringify(catalog, null, 4) + "\n");
await writeFile(join(output, "build-report.json"), JSON.stringify(reports, null, 4) + "\n");
await writeFile(".preview/plugin-license-inputs.json", JSON.stringify([...licenseInputs]));
console.log(JSON.stringify({ total: catalog.plugins.filter(p => !p.hidden).length, downloadable: catalog.plugins.filter(p => !p.hidden && p.available).length, adaptations: reports.length }));
