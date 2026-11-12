/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as React from "react";
import { createRoot } from "react-dom/client";

import { DeskcordTab, PluginsTab, ThemesTab } from "../../src/deskcord/Tabs";

function Preview() {
    const [tab, setTab] = React.useState("Deskcord");
    const [light, setLight] = React.useState(false);
    const Active = tab === "Deskcord" ? DeskcordTab : tab === "Plugins" ? PluginsTab : ThemesTab;
    return <div className={`preview-shell${light ? " preview-light" : ""}`}>
        <div className="preview-banner">Prévia local · sem conexão com o Discord <button onClick={() => setLight(value => !value)}>{light ? "Aparência escura" : "Aparência clara"}</button></div>
        <div className="preview-layout"><aside className="preview-sidebar"><div className="preview-discord-label">CONFIGURAÇÕES</div>
            <div className="preview-host-label">Minha conta</div><div className="preview-host-label">Perfis</div><div className="preview-host-label">Privacidade</div>
            <div className="preview-separator" /><h1>DESKCORD</h1>
            <nav aria-label="Configurações do Deskcord">{["Deskcord", "Plugins", "Temas"].map(name => <button key={name} aria-current={name === tab ? "page" : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
            <div className="preview-sidebar-footer">Deskcord {VERSION}<br />Base Vencord · GPL-3.0</div>
        </aside><main className="preview-main"><div className="preview-content-title">{tab}</div><div className="preview-content"><Active /></div></main></div>
    </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
