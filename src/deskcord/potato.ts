/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const potatoOverrides = {
    gifAutoPlay: false,
    animateEmoji: false,
    animateStickers: 2,
    inlineAttachmentMedia: false,
    inlineEmbedMedia: false,
    renderEmbeds: false
} as const;

export function effectiveSetting<T>(key: string, original: T, enabled: boolean): T | boolean | number {
    return enabled && Object.hasOwn(potatoOverrides, key)
        ? potatoOverrides[key as keyof typeof potatoOverrides]
        : original;
}

export function shouldSuspendThemes(potato: boolean, suspend: boolean) {
    return potato && suspend;
}

export function wrapMediaSetting<T>(setting: { getSetting(): T; useSetting(): T; }, key: string, enabled: () => boolean) {
    const { getSetting, useSetting } = setting;
    const wrappedGet = function (this: typeof setting) {
        return effectiveSetting(key, getSetting.call(this), enabled()) as T;
    };
    // Host components may already be mounted. Keep exactly the host's original hooks.
    const wrappedUse = function (this: typeof setting) {
        return effectiveSetting(key, useSetting.call(this), enabled()) as T;
    };
    try { setting.getSetting = wrappedGet; setting.useSetting = wrappedUse; }
    catch (error) {
        if (setting.getSetting === wrappedGet) setting.getSetting = getSetting;
        throw error;
    }
    return () => {
        if (setting.getSetting === wrappedGet) setting.getSetting = getSetting;
        if (setting.useSetting === wrappedUse) setting.useSetting = useSetting;
    };
}
