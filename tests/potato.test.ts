/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { coreFiles, includePlugin } from "../src/deskcord/buildProfile.mjs";
import { effectiveSetting, shouldSuspendThemes, wrapMediaSetting } from "../src/deskcord/potato";

test("potato overrides are reversible and leave unrelated settings intact", () => {
    assert.equal(effectiveSetting("gifAutoPlay", true, true), false);
    assert.equal(effectiveSetting("gifAutoPlay", true, false), true);
    assert.equal(effectiveSetting("animateStickers", 0, true), 2);
    assert.equal(effectiveSetting("voiceVolume", 75, true), 75);
    assert.equal(shouldSuspendThemes(true, true), true);
    assert.equal(shouldSuspendThemes(false, true), false);
    assert.equal(shouldSuspendThemes(true, false), false);
});
test("build ships only the three internal compatibility modules", () => {
    assert.equal(coreFiles.size, 3);
    assert.equal(includePlugin("plugins", "fakeNitro"), false);
    assert.equal(includePlugin("userplugins", "anything"), false);
    assert.equal(includePlugin("plugins/_core", "supportHelper.tsx"), false);
    assert.equal(includePlugin("plugins/_core", "settings.tsx"), true);
});

test("media wrappers retain host calls, context and original methods when restored", () => {
    let enabled = false;
    let calls = 0;
    const setting = { original: true, getSetting() { return this.original; }, useSetting() { calls++; return this.original; } };
    const originalGet = setting.getSetting;
    const originalUse = setting.useSetting;
    const restore = wrapMediaSetting(setting, "gifAutoPlay", () => enabled);
    assert.equal(setting.useSetting(), true);
    enabled = true;
    assert.equal(setting.useSetting(), false);
    assert.equal(setting.getSetting(), false);
    enabled = false;
    assert.equal(setting.useSetting(), true);
    assert.equal(calls, 3);
    restore();
    assert.equal(setting.getSetting, originalGet);
    assert.equal(setting.useSetting, originalUse);
});
