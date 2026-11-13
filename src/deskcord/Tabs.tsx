/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";
import "./classic.css";

import { Settings, useSettings } from "@api/Settings";
import { getThemeErrors, refreshThemes } from "@api/Themes";
import ErrorBoundary from "@components/ErrorBoundary";
import type { UserThemeHeader } from "@main/themes";
import { relaunch } from "@utils/native";
import { React, useEffect, useState } from "@webpack/common";

import { Icon } from "./Icon";
import { getCompatibilityCount, installPerformanceHooks, subscribeCompatibility } from "./performance";
import { PluginsPanel } from "./plugins/PluginsPanel";
import { potatoOverrides, shouldSuspendThemes } from "./potato";
import { Switch } from "./Switch";


function DeskcordPanel() {
    const { deskcord } = useSettings(["deskcord.*"]);
    const [compatibility, setCompatibility] = useState(getCompatibilityCount);
    const total = Object.keys(potatoOverrides).length;
    useEffect(() => subscribeCompatibility(() => setCompatibility(getCompatibilityCount())), []);
    const [error, setError] = useState("");
    async function openFolder(kind: "settings" | "themes") {
        try { if (kind === "settings") await VencordNative.settings.openFolder(); else await VencordNative.themes.openFolder(); }
        catch { setError("Não foi possível abrir a pasta. Tente novamente."); }
    }
    return <section className="dc-page" aria-label="Configurações do Deskcord">
        <div className="dc-info-panel dc-about"><h2>Deskcord</h2><p>Seu Discord com menos peso visual e mais personalização.</p><p className="dc-muted">Versão {VERSION} · Base Vencord · GPL-3.0-or-later</p></div>
        <h3 className="dc-section-title">Ações rápidas</h3>
        <div className="dc-quick-actions"><button type="button" className="dc-button" onClick={() => openFolder("settings")}><Icon name="folder" />Pasta de configurações</button>
            <button type="button" className="dc-button" onClick={() => openFolder("themes")}><Icon name="folder" />Pasta de temas</button>
            <button type="button" className="dc-button" onClick={relaunch}><Icon name="reload" />Reiniciar Discord</button></div>
        {error && <p className="dc-error" role="alert">{error}</p>}
        <h3 className="dc-section-title dc-section-divider">Aparência</h3>
        <div className="dc-setting-row"><div><h3>Clássico compacto</h3><p>Espaçamento menor, cantos discretos e cores clássicas no modo escuro. Visual inspirado no Discord antigo, integrado e sem download.</p></div>
            <Switch label="Clássico compacto" checked={deskcord.classicCompact} onChange={value => { Settings.deskcord.classicCompact = value; }} /></div>
        <p className="dc-help">Mantém a versão atual do Discord. Não instala versões antigas nem altera suas preferências de aparência da conta. Temas externos podem substituir esse visual.</p>
        <h3 className="dc-section-title dc-section-divider">Desempenho</h3>
        <div className="dc-setting-row"><div><h3>Modo batata</h3><p>Reduz animações, sombras e desfoques. Desativa reprodução automática e recolhe mídias e prévias de links.</p></div>
            <Switch label="Modo batata" checked={deskcord.potato} onChange={value => { Settings.deskcord.potato = value; }} /></div>
        <div className="dc-setting-row"><div><h3>Pausar temas no modo batata</h3><p>Pausa temas externos enquanto o modo estiver ativo. O Clássico compacto continua disponível. Seus temas voltam ao desligar.</p></div>
            <Switch label="Pausar temas no modo batata" checked={deskcord.disableThemesInPotato} onChange={value => { Settings.deskcord.disableThemesInPotato = value; }} /></div>
        <div className="dc-info-panel dc-performance-note"><h3>O que o modo batata preserva</h3><p>Chamadas, mensagens e notificações continuam disponíveis. Suas preferências de mídia da conta ficam intactas.</p>
            <p className="dc-muted">O ganho de RAM depende do uso e ainda precisa ser medido no Discord real.</p></div>
        <details className="dc-diagnostics"><summary>Compatibilidade e versão</summary>
            <p>Os controles de mídia são conectados ao ativar o modo batata ou verificar abaixo. Com o modo desligado, os métodos originais do Discord ficam livres.</p>
            <p>{compatibility} de {total} controles de mídia conectados ao Discord.</p>
            {compatibility < total && <><p role="status">Alguns controles ainda não estão disponíveis nesta versão do Discord. A redução de efeitos por CSS continua disponível.</p>
                <button type="button" className="dc-button" onClick={() => { installPerformanceHooks(); setCompatibility(getCompatibilityCount()); }}>Verificar novamente</button></>}
        </details>
    </section>;
}


function ThemesPanel() {
    const { enabledThemes, deskcord } = useSettings(["enabledThemes", "deskcord.*"]);
    const [themes, setThemes] = useState<UserThemeHeader[]>([]);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [query, setQuery] = useState("");
    const [failures, setFailures] = useState<Record<string, string>>({});
    const suspended = shouldSuspendThemes(deskcord.potato, deskcord.disableThemesInPotato);

    async function reload(manual: boolean) {
        setBusy(true); setError(""); setNotice("");
        try {
            const list = await VencordNative.themes.getThemesList();
            const present = new Set(list.map(theme => theme.fileName));
            const remaining = Settings.enabledThemes.filter(file => present.has(file));
            if (remaining.length !== Settings.enabledThemes.length) Settings.enabledThemes = remaining;
            setThemes(list);
            await refreshThemes();
            setFailures(getThemeErrors());
            if (manual) setNotice(`${list.length} ${list.length === 1 ? "tema encontrado" : "temas encontrados"}. Lista atualizada.`);
        } catch {
            setError("Não foi possível ler a pasta de temas. Tente Reload novamente.");
        } finally { setBusy(false); }
    }

    useEffect(() => { let active = true; reload(false).catch(() => { if (active) setError("Não foi possível carregar os temas."); }); return () => { active = false; }; }, []);

    async function toggle(file: string, value: boolean) {
        if (value && Settings.enabledThemes.length >= 32) {
            setError("Você pode ativar até 32 temas ao mesmo tempo.");
            return;
        }
        setBusy(true); setError(""); setNotice("");
        const previous = [...Settings.enabledThemes];
        try {
            Settings.enabledThemes = value ? [...new Set([...previous, file])] : previous.filter(name => name !== file);
            await refreshThemes();
            const nextErrors = getThemeErrors();
            if (value && nextErrors[file]) {
                Settings.enabledThemes = previous;
                await refreshThemes();
                setError(`Não foi possível ativar o tema: ${nextErrors[file]}`);
            }
            setFailures(getThemeErrors());
        } catch { Settings.enabledThemes = previous; setError("Não foi possível alterar o tema. Tente novamente."); }
        finally { setBusy(false); }
    }

    const visible = themes.filter(theme => `${theme.name} ${theme.author} ${theme.fileName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return <section className="dc-page" aria-label="Temas">
        <div className="dc-tab-bar"><span className="dc-tab-active">Temas locais</span><a href="https://betterdiscord.app/themes" target="_blank" rel="noreferrer noopener">Encontrar temas</a></div>
        <div className="dc-info-panel dc-warning"><h2>Desempenho dos temas</h2><p>Temas e CSS podem aumentar o consumo e causar travadas. Se notar lentidão, desative os temas para comparar ou use o modo batata.</p></div>
        <div className="dc-info-panel"><h3>Onde encontrar temas</h3><p><a href="https://betterdiscord.app/themes" target="_blank" rel="noreferrer noopener">Catálogo do BetterDiscord</a> · <a href="https://github.com/topics/discord-theme" target="_blank" rel="noreferrer noopener">GitHub</a></p>
            <p>Baixe o arquivo <code>.theme.css</code> ou <code>.css</code>, coloque na pasta de temas e aperte Reload.</p></div>
        <div className="dc-info-panel"><h3>Recursos externos</h3><p>Imagens e fontes continuam sujeitas às restrições do Discord. Use temas de fontes confiáveis.</p></div>
        <h3 className="dc-section-title">Temas locais</h3>
        <div className="dc-toolbar dc-quick-actions"><button type="button" className="dc-button dc-button-primary" onClick={async () => {
            try { await VencordNative.themes.openFolder(); } catch { setError("Não foi possível abrir a pasta de temas."); }
        }}><Icon name="folder" />Abrir pasta de temas</button>
            <button type="button" className="dc-button" disabled={busy} onClick={() => reload(true)}><Icon name="reload" />Reload</button></div>
        {suspended && <p className="dc-notice">Modo batata ativo. Seus temas estão pausados e voltam quando você desligar o modo.</p>}
        <div role="status" aria-live="polite" className="dc-live">{busy ? "Carregando temas…" : notice}</div>
        {error && <p role="alert" className="dc-error">{error}</p>}
        {themes.length > 0 && <label className="dc-search">Buscar tema ou autor<input type="search" name="theme-search" autoComplete="off" placeholder="Buscar nos seus temas…" value={query} onChange={event => setQuery(event.currentTarget.value)} /></label>}
        {!busy && themes.length === 0 && <div className="dc-empty"><svg aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="m7 25 3-9L23 3l6 6-13 13-9 3Zm3-9 6 6M4 29h24" stroke="currentColor" strokeWidth="1.5" /></svg>
            <h3>Seu primeiro tema começa aqui</h3><p>Baixe o arquivo CSS de um tema no GitHub ou no catálogo que você já usa. Depois, coloque na pasta de temas.</p></div>}
        {!busy && themes.length > 0 && visible.length === 0 && <p className="dc-help">Nenhum tema encontrado para essa busca.</p>}
        <ul className="dc-theme-list">{visible.map(theme => <li className="dc-theme-row" key={theme.fileName}>
            <div className="dc-theme-card-top"><div><h3>{theme.name}</h3><p className="dc-theme-author">por {theme.author}</p></div>
                <Switch label={`Ativar ${theme.name}`} checked={enabledThemes.includes(theme.fileName)} disabled={busy || suspended} onChange={value => toggle(theme.fileName, value)} /></div>
            <p className="dc-theme-description">{theme.description}</p>
            <div className="dc-theme-card-footer">{theme.version && <span>v{theme.version}</span>}<code title={theme.fileName}>{theme.fileName}</code></div>
            {failures[theme.fileName] && <p className="dc-error">{failures[theme.fileName]}</p>}
        </li>)}</ul>
        <p className="dc-footnote">Temas podem carregar recursos externos e aumentar o consumo. Use fontes de confiança.</p>
    </section>;
}

export const DeskcordTab = ErrorBoundary.wrap(DeskcordPanel, { noop: false });
export const PluginsTab = ErrorBoundary.wrap(PluginsPanel, { noop: false });
export const ThemesTab = ErrorBoundary.wrap(ThemesPanel, { noop: false });
