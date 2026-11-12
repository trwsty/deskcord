/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { lstat, open, readFile, realpath } from "fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "path";
import postcss from "postcss";
import valueParser from "postcss-value-parser";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_IMPORTS = 16;

export function validateThemeFileName(fileName: unknown): asserts fileName is string {
    if (typeof fileName !== "string" || fileName.length > 240 || fileName !== basename(fileName)
        || /[\\/:\x00-\x1f]/.test(fileName) || !/\.css$/i.test(fileName))
        throw new Error("Nome de arquivo de tema inválido.");
}

async function resolveLocalTheme(directory: string, fileName: unknown) {
    validateThemeFileName(fileName);
    const root = await realpath(directory);
    const file = join(root, fileName);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES)
        throw new Error("O tema deve ser um arquivo CSS local de até 2 MB.");
    const resolved = await realpath(file);
    const rel = relative(root, resolved);
    if (rel.startsWith("..") || isAbsolute(rel) || dirname(resolved) !== root)
        throw new Error("Arquivo fora da pasta de temas.");
    return resolved;
}

export async function readLocalTheme(directory: string, fileName: unknown) {
    const resolved = await resolveLocalTheme(directory, fileName);
    const data = await readFile(resolved, "utf8");
    if (Buffer.byteLength(data) > MAX_BYTES) throw new Error("Tema maior que 2 MB.");
    return data;
}

export async function readLocalThemeHeader(directory: string, fileName: unknown) {
    const file = await open(await resolveLocalTheme(directory, fileName), "r");
    try {
        const buffer = Buffer.alloc(16 * 1024);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        return buffer.subarray(0, bytesRead).toString("utf8");
    } finally { await file.close(); }
}

export function validateImportUrl(raw: string) {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const allowed = host === "raw.githubusercontent.com" || host === "cdn.jsdelivr.net" || host === "fonts.googleapis.com"
        || host.endsWith(".github.io") || host.endsWith(".gitlab.io") || host.endsWith(".codeberg.page");
    if (!allowed || url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443"))
        throw new Error("Import CSS permitido apenas por HTTPS em GitHub Pages/Raw, GitLab Pages, Codeberg Pages, jsDelivr ou Google Fonts.");
    return url;
}

export async function fetchThemeCss(url: URL) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000), redirect: "error", credentials: "omit",
        headers: { Accept: "text/css,text/plain;q=0.9" }
    });
    if (!response.ok || !response.body) throw new Error(`Import CSS indisponível (HTTP ${response.status}).`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const result = await reader.read();
            if (result.done) break;
            size += result.value.length;
            if (size > MAX_BYTES) throw new Error("Import CSS maior que 2 MB.");
            chunks.push(result.value);
        }
    } finally { await reader.cancel().catch(() => { }); }
    return Buffer.concat(chunks).toString("utf8");
}

export async function compileTheme(css: string, fetchCss: (url: URL) => Promise<string> = fetchThemeCss) {
    let count = 0;
    let totalBytes = Buffer.byteLength(css);
    const visited = new Set<string>();
    async function compile(source: string, base?: URL, depth = 0): Promise<string> {
        if (depth > 5 || totalBytes > MAX_TOTAL_BYTES) throw new Error("Tema excede os limites de imports ou tamanho.");
        const root = postcss.parse(source);
        const imports: postcss.AtRule[] = [];
        root.walkAtRules("import", rule => { imports.push(rule); });
        for (const rule of imports) {
            const parsed = valueParser(rule.params);
            const first = parsed.nodes.find(node => node.type !== "space" && node.type !== "comment");
            const location = first?.type === "string" ? first.value
                : first?.type === "function" && first.value.toLowerCase() === "url"
                    ? valueParser.stringify(first.nodes).replace(/^(['"])(.*)\1$/, "$2") : null;
            if (!location || !first) throw new Error("Import CSS inválido.");
            const url = validateImportUrl(new URL(location, base).href);
            if (visited.has(url.href)) throw new Error("Import CSS circular ou duplicado.");
            if (++count > MAX_IMPORTS) throw new Error("Máximo de 16 imports por tema.");
            visited.add(url.href);
            const media = rule.params.slice(first.sourceEndIndex).trim();
            if (/\b(?:layer|supports)\s*\(/i.test(media) || media === "layer")
                throw new Error("Imports com layer/supports precisam ser reunidos em um único arquivo CSS.");
            const imported = await fetchCss(url);
            totalBytes += Buffer.byteLength(imported);
            const content = await compile(imported, url, depth + 1);
            visited.delete(url.href);
            const { nodes } = postcss.parse(content);
            if (media) {
                const wrapper = postcss.atRule({ name: "media", params: media });
                wrapper.append(nodes);
                rule.replaceWith(wrapper);
            } else { rule.replaceWith(...nodes); }
        }
        if (base) root.walkDecls(decl => {
            const parsed = valueParser(decl.value);
            parsed.walk(node => {
                if (node.type !== "function" || node.value.toLowerCase() !== "url") return;
                const raw = valueParser.stringify(node.nodes).replace(/^(['"])(.*)\1$/, "$2");
                if (/^(?:data:|#)/i.test(raw)) return;
                const url = new URL(raw, base);
                if (url.protocol !== "https:") throw new Error("Recursos de temas devem usar HTTPS.");
                node.nodes = [{ type: "string", quote: '"', value: url.href, sourceIndex: 0, sourceEndIndex: url.href.length }];
            });
            decl.value = parsed.toString();
        });
        return root.toString();
    }
    return compile(css);
}
