/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { lookup } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";

export function publicAddress(address: string) {
    if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0{1,4}):/i.test(address) && !/^2002:/i.test(address);
    if (isIP(address) !== 4) return false;
    const [a, b] = address.split(".").map(Number);
    return a > 0 && a !== 10 && a !== 127 && a < 224 && a !== 169
        && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0))
        && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19 || b === 51))
        && !(a === 203 && b === 0);
}

export function repositoryUrl(input: unknown): string {
    if (input === "") return "";
    if (typeof input !== "string" || input.length > 2048) throw new Error("Endereço de repositório inválido.");
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search
        || (url.port && url.port !== "443") || !url.hostname.includes(".") || isIP(url.hostname.replace(/^\[|\]$/g, ""))
        || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname))
        throw new Error("Use uma pasta HTTPS de um repositório público, sem senha ou parâmetros na URL.");
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
}

export function downloadPackage(url: URL, expectedBytes: number, redirects = 0): Promise<Buffer> {
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || redirects > 4)
        return Promise.reject(new Error("Redirecionamento de download inválido."));
    return new Promise((resolve, reject) => {
        const req = request(url, {
            method: "GET", signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json", "User-Agent": "Deskcord/0.2" },
            lookup(hostname, options, callback) {
                lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
                    if (error || !addresses.length || addresses.some(item => !publicAddress(item.address))) {
                        callback(new Error("O repositório precisa usar endereços públicos."), "", 4); return;
                    }
                    if (options.all) callback(null, addresses);
                    else callback(null, addresses[0].address, addresses[0].family);
                });
            }
        }, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
                response.resume();
                downloadPackage(new URL(response.headers.location, url), expectedBytes, redirects + 1).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) { response.resume(); reject(new Error(`Download indisponível (HTTP ${response.statusCode}).`)); return; }
            const chunks: Buffer[] = [];
            let bytes = 0;
            response.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes > expectedBytes || bytes > 8 * 1024 * 1024) { response.destroy(new Error("O pacote excede o tamanho autorizado.")); return; }
                chunks.push(chunk);
            });
            response.on("error", reject);
            response.on("end", () => {
                if (bytes !== expectedBytes) reject(new Error("Pacote incompleto ou de tamanho diferente do catálogo."));
                else resolve(Buffer.concat(chunks));
            });
        });
        req.on("error", () => reject(new Error("Não foi possível baixar o plugin. Verifique o repositório e sua conexão.")));
        req.end();
    });
}
