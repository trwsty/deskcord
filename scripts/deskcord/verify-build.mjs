/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { coreFiles } from "../../src/deskcord/buildProfile.mjs";

const renderer = JSON.parse(await readFile("dist/renderer.js.map", "utf8"));
const plugins = renderer.sources.filter(source => source.includes("/src/plugins/"))
    .map(source => source.slice(source.indexOf("/src/") + 5));
assert.deepEqual([...plugins].sort(), [...coreFiles].sort(), "Optional plugin code leaked into the renderer");
const main = JSON.parse(await readFile("dist/patcher.js.map", "utf8"));
assert.equal(main.sources.some(source => source.includes("/src/plugins/")), false, "Optional native plugin code leaked into the patcher");
assert.equal(main.sources.some(source => source.includes("/src/main/csp/")), false, "Discord CSP must remain unchanged");
console.log("Bundle OK: 3 módulos internos, nenhum plugin opcional/nativo e nenhuma alteração de CSP.");
