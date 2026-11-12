/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useEffect, useRef } from "@webpack/common";
import type { PropsWithChildren } from "react";

import { Icon } from "./Icon";

export function Modal({ title, onClose, children }: PropsWithChildren<{ title: string; onClose: () => void; }>) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        return () => { if (element?.open) element.close(); };
    }, []);
    return <dialog ref={dialog} className="dc-modal" aria-labelledby="dc-modal-title" onClose={onClose}>
        <div className="dc-modal-heading"><h2 id="dc-modal-title">{title}</h2>
            <button type="button" className="dc-icon-button" aria-label="Fechar detalhes" onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
        <div className="dc-modal-body">{children}</div>
    </dialog>;
}
