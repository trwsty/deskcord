/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { getThemeInfo, stripBOM } from "@main/themes";
import { compileTheme, readLocalTheme, validateImportUrl, validateThemeFileName } from "@main/themes/deskcord";

test("reads standard Vencord/BetterDiscord metadata without executing it", () => {
    const info = getThemeInfo(stripBOM("\uFEFF/**\n * @name Meu tema\n * @author Maria & João\n * @version 1.2\n * @description Tema local\n */\n:root{}"), "teste.theme.css");
    assert.equal(info.name, "Meu tema"); assert.equal(info.author, "Maria & João"); assert.equal(info.version, "1.2");
    assert.equal(getThemeInfo(":root{}", "Sem header.CSS").name, "Sem header");
});
test("rejects traversal, alternate streams, non-CSS files and private imports", () => {
    for (const file of ["../a.css", "..\\a.css", "C:\\a.css", "a.css:secret", "a.js", "a\0.css", null])
        assert.throws(() => validateThemeFileName(file));
    for (const url of ["http://example.github.io/a.css", "https://127.0.0.1/a.css", "https://raw.githubusercontent.com.evil.test/a.css", "file:///a.css", "https://x@y.github.io/a.css", "https://y.github.io:8080/a.css"])
        assert.throws(() => validateImportUrl(url));
    assert.equal(validateImportUrl("https://user.github.io/theme.css").protocol, "https:");
});
test("local themes enforce file and size boundaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "deskcord-theme-test-"));
    try {
        await writeFile(join(directory, "ok.css"), "body { color: red; }");
        assert.match(await readLocalTheme(directory, "ok.css"), /color: red/);
        await assert.rejects(readLocalTheme(directory, "../secret.css"));
        await writeFile(join(directory, "large.css"), "x".repeat(2 * 1024 * 1024 + 1));
        await assert.rejects(readLocalTheme(directory, "large.css"), /2 MB/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test("resolves nested CSS imports, media and relative assets", async () => {
    const requested: string[] = [];
    const result = await compileTheme('@import url("https://theme.github.io/main.css") screen; :root { --a: 1; }', async url => {
        requested.push(url.href);
        return url.pathname === "/main.css" ? '@import "./base.css"; body{background:url(./image.png)}' : "body{color: red}";
    });
    assert.deepEqual(requested, ["https://theme.github.io/main.css", "https://theme.github.io/base.css"]);
    assert.match(result, /@media screen/); assert.match(result, /https:\/\/theme.github.io\/image.png/); assert.doesNotMatch(result, /@import/);
});
test("limits recursive and malformed CSS; never fetches an unapproved host", async () => {
    let requests = 0;
    const fetcher = async () => { requests++; return '@import "https://theme.github.io/a.css";'; };
    await assert.rejects(compileTheme('@import "https://127.0.0.1/x.css";', fetcher));
    assert.equal(requests, 0);
    await assert.rejects(compileTheme('@import "https://theme.github.io/a.css";', fetcher), /circular/);
    await assert.rejects(compileTheme("body { color:"));
    await assert.rejects(compileTheme('@import "https://theme.github.io/a.css";', async () => "a".repeat(4 * 1024 * 1024 + 1)), /limites/);
});
