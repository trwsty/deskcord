/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Only internal compatibility modules. No optional or user plugins are shipped.
export const coreFiles = new Set([
    "plugins/_core/settings.tsx",
    "plugins/_core/concatenatedComponentExtractor.tsx",
    "plugins/_api/userSettings.ts"
]);

export function includePlugin(directory, fileName) {
    return coreFiles.has(`${directory}/${fileName}`);
}
