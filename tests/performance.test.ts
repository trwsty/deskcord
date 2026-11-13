/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

import { build } from "esbuild";

import { potatoOverrides } from "../src/deskcord/potato";

const compiled = build({
    entryPoints: ["src/deskcord/performance.ts"], bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "performance-host-fixture", setup(builder) {
        builder.onResolve({ filter: /^@api\/Settings$|^@api\/UserSettings$|^@utils\/Logger$/ }, args => ({ path: args.path, namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "@api/Settings"
            ? "export const Settings = globalThis.fixture.settings;"
            : args.path === "@api/UserSettings"
                ? "export const getUserSetting = globalThis.fixture.getUserSetting;"
                : "export const Logger = function () { this.warn = () => {}; };" }));
    } }]
});

async function fixture(potato = false) {
    let lookups = 0;
    const classes = new Set<string>();
    const settings = { deskcord: { potato, classicCompact: false } };
    const originalGet = () => true;
    const originalUse = () => true;
    const controls = new Map(Object.keys(potatoOverrides).map(key => [key, { getSetting: originalGet, useSetting: originalUse }]));
    const module = { exports: {} as typeof import("../src/deskcord/performance") };
    runInNewContext((await compiled).outputFiles[0].text, {
        module, exports: module.exports,
        fixture: { settings, getUserSetting: (_group: string, key: string) => { lookups++; return controls.get(key); } },
        document: { documentElement: { classList: { toggle: (key: string, enabled: boolean) => enabled ? classes.add(key) : classes.delete(key) } } }
    });
    return { api: module.exports, settings, classes, controls, originalGet, originalUse, lookups: () => lookups };
}

test("disabled potato skips host discovery; enabling discovers once and disabling restores methods", async () => {
    const host = await fixture();
    host.api.preparePerformanceHooks();
    assert.equal(host.lookups(), 0);
    host.settings.deskcord.potato = true;
    host.api.syncPotatoClass();
    assert.equal(host.lookups(), 6);
    assert.equal(host.api.getCompatibilityCount(), 6);
    assert.equal(host.controls.get("gifAutoPlay")!.getSetting(), false);
    host.settings.deskcord.potato = false;
    host.api.syncPotatoClass();
    for (const control of host.controls.values()) {
        assert.equal(control.getSetting, host.originalGet);
        assert.equal(control.useSetting, host.originalUse);
    }
    host.settings.deskcord.potato = true;
    host.api.syncPotatoClass();
    assert.equal(host.lookups(), 6);
});

test("saved potato applies after readiness; classic appearance remains independent", async () => {
    const host = await fixture(true);
    host.api.syncPotatoClass();
    assert.equal(host.lookups(), 0);
    host.api.preparePerformanceHooks();
    assert.equal(host.lookups(), 6);
    host.settings.deskcord.classicCompact = true;
    host.api.syncAppearanceClass();
    host.settings.deskcord.potato = false;
    host.api.syncPotatoClass();
    assert.equal(host.classes.has("dc-classic"), true);
    assert.equal(host.classes.has("dc-potato"), false);
    host.settings.deskcord.classicCompact = false;
    host.api.syncAppearanceClass();
    assert.equal(host.classes.has("dc-classic"), false);
});
