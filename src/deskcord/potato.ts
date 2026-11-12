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
