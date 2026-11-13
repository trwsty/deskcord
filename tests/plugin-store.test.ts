/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

import { publicAddress, repositoryUrl } from "@main/plugins/download";
import { createPluginStore, verifyPackage } from "@main/plugins/store";

import realCatalog from "../src/deskcord/plugins/catalog.json";
import { CatalogPlugin, dependencyOrder, PluginCatalog } from "../src/deskcord/plugins/model";

function fixture() {
    const root = mkdtempSync(join(tmpdir(), "deskcord-plugins-test-"));
    const bytes = new Map<string, Buffer>();
    const make = (id: string, dependencies: string[] = []): CatalogPlugin => {
        const payload = Buffer.from(JSON.stringify({ format: 1, id, name: id, revision: "test", renderer: "// fixture", css: "" }));
        const sha256 = createHash("sha256").update(payload).digest("hex");
        const file = `${id}.${sha256}.json`;
        bytes.set(file, payload);
        return { id, name: id, origin: "vencord", description: "Teste", authors: [], categories: [], source: "https://github.com/", hidden: false,
            builtin: false, dependencies, available: true, hasNative: false, sha256, bytes: payload.length, file };
    };
    const catalog: PluginCatalog = { format: 1, revision: "test", plugins: [make("shared"), make("first", ["shared"]), make("second", ["shared"])] };
    const downloads: string[] = [];
    const download = async (url: URL) => { downloads.push(url.pathname); const data = bytes.get(url.pathname.slice(1)); if (!data) throw new Error("missing"); return data; };
    const cleanup = () => { assert.equal(dirname(realpathSync(root)), realpathSync(tmpdir())); rmSync(root, { recursive: true, force: true }); };
    return { root, bytes, catalog, downloads, download, cleanup };
}

test("catalog browsing downloads nothing; install fetches only the chosen plugin and dependencies", async () => {
    const f = fixture();
    try {
        const store = createPluginStore(f.root, f.catalog, f.download, "https://packages.example.org/");
        assert.deepEqual(store.state().installed, []); assert.equal(f.downloads.length, 0);
        const result = await store.install("first");
        assert.deepEqual(result.installed, ["shared", "first"]); assert.equal(f.downloads.length, 2);
        assert.deepEqual(result.loadedAtStartup, []);
        const restarted = createPluginStore(f.root, f.catalog, f.download);
        assert.deepEqual(restarted.startup.map(item => item.plugin.id), ["shared", "first"]);
        await store.setEnabled("first", false);
        assert.deepEqual(store.state().enabled, []); assert.equal(store.state().installed.length, 0);
        await store.remove("first");
        assert.deepEqual(store.state().installed, []);
        assert.deepEqual(readdirSync(f.root), ["plugins.json"]);
    } finally { f.cleanup(); }
});

test("deactivation deletes packages and native files but retains shared dependencies", async () => {
    const f = fixture();
    try {
        const store = createPluginStore(f.root, f.catalog, f.download, "https://packages.example.org/");
        await store.install("first"); await store.install("second");
        store.nativePath("first", "// fixture");
        await store.setEnabled("first", false);
        assert.deepEqual(store.state().installed, ["shared", "second"]);
        assert.equal(readdirSync(f.root).includes("first.cjs"), false);
        await store.setEnabled("second", false);
        assert.deepEqual(readdirSync(f.root), ["plugins.json"]);
    } finally { f.cleanup(); }
});

test("live code is limited to enabled, compatible packages and is hash-verified again", async () => {
    const f = fixture();
    try {
        f.catalog.plugins.forEach(plugin => plugin.hotReload = true);
        const store = createPluginStore(f.root, f.catalog, f.download, "https://packages.example.org/");
        assert.throws(() => store.livePackages(["first"]), /reinício/);
        await store.install("first");
        assert.equal(store.livePackages(["first"])[0].name, "first");
        assert.deepEqual(store.rendererPackages().map(item => item.plugin.id), ["shared", "first"]);
        f.catalog.plugins.find(plugin => plugin.id === "first")!.hasNative = true;
        assert.throws(() => store.livePackages(["first"]), /reinício/);
        f.catalog.plugins.find(plugin => plugin.id === "first")!.hasNative = false;
        const plugin = f.catalog.plugins.find(plugin => plugin.id === "first")!;
        writeFileSync(join(f.root, plugin.file!), "tampered");
        assert.throws(() => store.livePackages(["first"]));
        assert.deepEqual(store.rendererPackages(), []);
        assert.throws(() => store.livePackages(new Array(129).fill("first")), /inválida/);
    } finally { f.cleanup(); }
});

test("concurrent installs are serialized; removing one root preserves shared dependencies", async () => {
    const f = fixture();
    try {
        const store = createPluginStore(f.root, f.catalog, f.download, "https://packages.example.org/");
        await Promise.all([store.install("first"), store.install("second")]);
        assert.equal(f.downloads.length, 3);
        await assert.rejects(store.remove("shared"), /Outro plugin/);
        await store.remove("first");
        assert.deepEqual(store.state().installed, ["shared", "second"]);
        await assert.rejects(store.setEnabled("shared", false), /Outro plugin/);
        await assert.rejects(store.install("../outside"), /catálogo/);
    } finally { f.cleanup(); }
});

test("tampered payloads and interrupted installs cannot activate or retain partial downloads", async () => {
    const f = fixture();
    try {
        const store = createPluginStore(f.root, f.catalog, async url => url.pathname.includes("first.") ? Buffer.from("tampered") : f.download(url), "https://packages.example.org/");
        await assert.rejects(store.install("first"), /integridade/);
        assert.deepEqual(store.state().enabled, []); assert.deepEqual(readdirSync(f.root), []);
        const valid = createPluginStore(f.root, f.catalog, f.download, "https://packages.example.org/");
        await valid.install("first");
        writeFileSync(join(f.root, f.catalog.plugins[1].file!), "tampered");
        const restarted = createPluginStore(f.root, f.catalog, f.download);
        assert.equal(restarted.startup.length, 0); assert.ok(restarted.state().errors.startup);
    } finally { f.cleanup(); }
});

test("dependencies, repository addresses and private network destinations are validated", () => {
    assert.throws(() => repositoryUrl("http://example.org/"));
    assert.throws(() => repositoryUrl("https://127.0.0.1/"));
    assert.throws(() => repositoryUrl("https://user:pass@example.org/"));
    assert.equal(repositoryUrl("https://example.org/plugins"), "https://example.org/plugins/");
    for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.1.1", "192.168.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "fc00::1", "2001:db8::1"])
        assert.equal(publicAddress(ip), false, ip);
    assert.equal(publicAddress("8.8.8.8"), true);
    const f = fixture();
    try { f.catalog.plugins[0].dependencies = ["first"]; assert.throws(() => dependencyOrder(f.catalog, ["first"]), /circular/); }
    finally { f.cleanup(); }
});

test("all distributable catalog packages have matching hashes and individually resolvable dependencies", () => {
    const catalog = realCatalog as PluginCatalog;
    assert.equal(catalog.plugins.filter(plugin => !plugin.hidden).length, 168);
    for (const plugin of catalog.plugins) {
        assert.ok(plugin.description); assert.ok(plugin.authors.length);
        if (!plugin.available) continue;
        dependencyOrder(catalog, [plugin.id]);
        if (!plugin.builtin) verifyPackage(readFileSync(join("plugin-repository", plugin.file!)), plugin, catalog.revision);
    }
});

test("a generated Vencord plugin registers against the shared host without bundling a second core", () => {
    const plugin = (realCatalog as PluginCatalog).plugins.find(plugin => plugin.name === "NoTypingAnimation")!;
    const payload = verifyPackage(readFileSync(join("plugin-repository", plugin.file!)), plugin, realCatalog.revision);
    let registered = "";
    runInNewContext(payload.renderer, { navigator: { platform: "Win32", userAgent: "Deskcord test" }, Vencord: { Deskcord: { register: (name: string, value: { name: string; }) => { assert.equal(name, value.name); registered = name; } } } });
    assert.equal(registered, "NoTypingAnimation");
});

test("native packages share the host settings store without registering duplicate core IPC handlers", () => {
    const plugin = (realCatalog as PluginCatalog).plugins.find(plugin => plugin.name === "FixSpotifyEmbeds")!;
    const payload = verifyPackage(readFileSync(join("plugin-repository", plugin.file!)), plugin, realCatalog.revision);
    let subscriptions = 0;
    let settingsSubscriptions = 0;
    runInNewContext(payload.native!, {
        module: { exports: {} }, exports: {},
        __DeskcordMainSettings: { RendererSettings: { addChangeListener: () => { settingsSubscriptions++; } } },
        require: (name: string) => {
            assert.equal(name, "electron");
            return { app: { on: () => { subscriptions++; } } };
        }
    });
    assert.equal(subscriptions, 1); assert.equal(settingsSubscriptions, 1);
});
