/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createPackage, extractFile } from "@electron/asar";
import { persistInstallation } from "@main/utils/persistInstall";

import { install, isDeskcordArchive, uninstall } from "../scripts/deskcord/installer-core.mjs";
import { deploy } from "../scripts/deskcord/native-worker.mjs";

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "deskcord-installer-test-"));
    const resources = join(root, "resources");
    const bundle = join(root, "dist");
    const original = join(root, "original");
    await Promise.all([mkdir(resources), mkdir(bundle), mkdir(original)]);
    await writeFile(join(original, "package.json"), '{"name":"discord-test","main":"index.js"}');
    await writeFile(join(original, "index.js"), "// Test fixture only\n");
    await createPackage(original, join(resources, "app.asar"));
    for (const file of ["patcher.js", "preload.js", "renderer.js", "renderer.css"]) await writeFile(join(bundle, file), "// fixture");
    return { root, resources, bundle };
}
test("install, reinstall and uninstall restore the original ASAR byte for byte", async () => {
    const f = await fixture();
    try {
        const original = await readFile(join(f.resources, "app.asar"));
        await install(f.resources, f.bundle);
        assert.equal(isDeskcordArchive(join(f.resources, "app.asar")), true);
        assert.deepEqual(await readFile(join(f.resources, "_app.asar")), original);
        await install(f.resources, f.bundle);
        assert.deepEqual(await readFile(join(f.resources, "_app.asar")), original);
        await uninstall(f.resources);
        assert.deepEqual(await readFile(join(f.resources, "app.asar")), original);
        await assert.rejects(uninstall(f.resources), /não pertence/);
    } finally { await rm(f.root, { recursive: true, force: true }); }
});
test("refuses another mod or a missing build without modifying Discord", async () => {
    const f = await fixture();
    try {
        const original = await readFile(join(f.resources, "app.asar"));
        await writeFile(join(f.resources, "_app.asar"), "other-mod-backup");
        await assert.rejects(install(f.resources, f.bundle), /Outro mod/);
        assert.deepEqual(await readFile(join(f.resources, "app.asar")), original);
        await rm(join(f.bundle, "preload.js"));
        await assert.rejects(install(f.resources, f.bundle));
        assert.deepEqual(await readFile(join(f.resources, "app.asar")), original);
    } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("native deployment uses a portable folder, migrates Vencord and restores original Discord", async () => {
    const f = await fixture();
    try {
        const original = await readFile(join(f.resources, "app.asar"));
        await rename(join(f.resources, "app.asar"), join(f.resources, "_app.asar"));
        await writeFile(join(f.root, "original", "index.js"), 'require("C:\\\\Users\\\\Test\\\\AppData\\\\Roaming\\\\Vencord\\\\dist\\\\patcher.js")');
        await createPackage(join(f.root, "original"), join(f.resources, "app.asar"));
        const vencord = await readFile(join(f.resources, "app.asar"));
        assert.match(await deploy(f.resources, f.bundle, "status"), /Vencord/);
        await deploy(f.resources, f.bundle, "install");
        const loader = extractFile(join(f.resources, "app.asar"), "index.js").toString();
        assert.match(loader, /__dirname/);
        assert.match(loader, /Deskcord\/[a-f0-9]{64}/);
        assert.deepEqual(await readFile(join(f.resources, "deskcord-vencord-backup.asar")), vencord);
        const slot = /Deskcord\/([a-f0-9]{64})/.exec(loader)![1];
        await writeFile(join(f.resources, "Deskcord", slot, "renderer.js"), "// damaged fixture");
        await deploy(f.resources, f.bundle, "reinstall");
        assert.notEqual(extractFile(join(f.resources, "app.asar"), "index.js").toString(), loader);
        await deploy(f.resources, f.bundle, "uninstall");
        assert.deepEqual(await readFile(join(f.resources, "app.asar")), original);
    } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("refuses unowned Deskcord folders before replacing the loader", async () => {
    const f = await fixture();
    try {
        const original = await readFile(join(f.resources, "app.asar"));
        await mkdir(join(f.resources, "Deskcord"));
        await copyFile(join(f.bundle, "patcher.js"), join(f.resources, "Deskcord", "personal-file.js"));
        await assert.rejects(deploy(f.resources, f.bundle, "install"), /não pertence/);
        assert.deepEqual(await readFile(join(f.resources, "app.asar")), original);
    } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("a host update carries the relative runtime and keeps the new original ASAR", async () => {
    const f = await fixture();
    try {
        await deploy(f.resources, f.bundle, "install");
        const updated = join(f.root, "updated-resources");
        await mkdir(updated);
        await copyFile(join(f.resources, "_app.asar"), join(updated, "app.asar"));
        const original = await readFile(join(updated, "app.asar"));
        assert.equal(persistInstallation(f.resources, updated, fs), true);
        assert.deepEqual(await readFile(join(updated, "_app.asar")), original);
        assert.equal(isDeskcordArchive(join(updated, "app.asar")), true);
        assert.equal(persistInstallation(f.resources, updated, fs), false);
        await deploy(updated, f.bundle, "reinstall");
        await deploy(updated, f.bundle, "uninstall");
        assert.deepEqual(await readFile(join(updated, "app.asar")), original);
    } finally { await rm(f.root, { recursive: true, force: true }); }
});
