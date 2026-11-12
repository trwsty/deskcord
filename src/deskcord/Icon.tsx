/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

export function Icon({ name }: { name: "info" | "settings" | "folder" | "reload" | "power" | "close"; }) {
    const paths = {
        info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.5" /></>,
        settings: <><path d="m10 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L3.5 15l2 3 2-.5 2 1 .5 2h4l.5-2 2-1 2 .5 2-3-1.5-2v-3L21 8.5l-2-3-2 .5-2-1-.5-2h-4Z" /><circle cx="12" cy="12" r="3" /></>,
        folder: <path d="M3 6h6l2 2h10v12H3V6Z" />,
        reload: <><path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6" /></>,
        power: <><path d="M12 2v10m-6-7a9 9 0 1 0 12 0" /></>,
        close: <path d="m6 6 12 12M6 18 18 6" />
    };
    return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
