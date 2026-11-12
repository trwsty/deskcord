/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

export async function startPreview(port = 0) {
    const { version } = JSON.parse(await readFile("package.json", "utf8"));
    await build({ entryPoints: ["scripts/deskcord/preview-entry.tsx"], outfile: ".preview/preview.js", bundle: true,
        format: "iife", platform: "browser", target: "chrome120", jsx: "transform", define: { VERSION: JSON.stringify(version) },
        plugins: [{ name: "preview-discord-bridge", setup(build) {
            build.onResolve({ filter: /^(?:@webpack\/common|@api\/(?:Settings|PluginManager)|@components\/ErrorBoundary)$/ }, () => ({ path: resolve("scripts/deskcord/preview-mocks.tsx") }));
            build.onResolve({ filter: /^\.\/Styles$/ }, args => args.importer.endsWith("Themes.ts") ? { path: resolve("scripts/deskcord/preview-mocks.tsx") } : undefined);
            build.onResolve({ filter: /^\.\/performance$/ }, args => args.importer.endsWith("Tabs.tsx") ? { path: resolve("scripts/deskcord/preview-mocks.tsx") } : undefined);
            build.onResolve({ filter: /^\.\/runtime$|^@utils\/native$/ }, args => /(?:PluginsPanel|PluginDetails|Tabs)\.tsx$/.test(args.importer) ? { path: resolve("scripts/deskcord/preview-mocks.tsx") } : undefined);
        } }] });
    const files = new Map([
        ["/", { type: "text/html; charset=utf-8", data: Buffer.from('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deskcord · Prévia local</title><link rel="stylesheet" href="/shell.css"><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script src="/preview.js"></script></body></html>') }],
        ["/preview.js", { type: "text/javascript; charset=utf-8", data: await readFile(".preview/preview.js") }],
        ["/preview.css", { type: "text/css; charset=utf-8", data: await readFile(".preview/preview.css") }],
        ["/shell.css", { type: "text/css; charset=utf-8", data: await readFile("scripts/deskcord/preview.css") }]
    ]);
    const server = createServer((request, response) => {
        const file = files.get(request.url ?? "");
        if (request.method !== "GET" || !file) { response.writeHead(404); response.end(); return; }
        response.writeHead(200, { "Content-Type": file.type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
        response.end(file.data);
    });
    await new Promise((done, reject) => { server.on("error", reject); server.listen(port, "127.0.0.1", done); });
    const address = server.address();
    return { url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`, close: () => new Promise(done => server.close(done)) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.PORT ?? 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT inválida.");
    const preview = await startPreview(port);
    console.log(`Deskcord preview: ${preview.url}`);
}
