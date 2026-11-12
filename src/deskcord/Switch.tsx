/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

export function Switch({ label, checked, onChange, disabled = false }: {
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}) {
    return <button type="button" role="switch" aria-label={label} aria-checked={checked}
        disabled={disabled} className="dc-switch" onClick={() => onChange(!checked)}><span><svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d={checked ? "m4 8 3 3 5-6" : "m5 5 6 6M5 11l6-6"} /></svg></span></button>;
}
