/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { relaunch } from "@utils/native";
import { React, useEffect, useState } from "@webpack/common";

import { Icon } from "../Icon";
import { Switch } from "../Switch";
import rawCatalog from "./catalog.json";
import { CatalogPlugin, origins, PluginCatalog, PluginOrigin, PluginState } from "./model";
import { PluginDetails } from "./PluginDetails";
import { applyState, needsRestart, status } from "./runtime";

const catalog = rawCatalog as PluginCatalog;
const plugins = catalog.plugins.filter(plugin => !plugin.hidden);
const categories = [...new Set(plugins.flatMap(plugin => plugin.categories))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function PluginsPanel() {
    const [state, setState] = useState<PluginState | null>(null);
    const [origin, setOrigin] = useState<PluginOrigin | "all">("all");
    const [category, setCategory] = useState("");
    const [filter, setFilter] = useState("all");
    const [query, setQuery] = useState("");
    const [limit, setLimit] = useState(24);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [feedbackPlugin, setFeedbackPlugin] = useState("");
    const [notice, setNotice] = useState("");
    const [repository, setRepository] = useState("");
    const [selected, setSelected] = useState<CatalogPlugin | null>(null);

    useEffect(() => {
        let mounted = true;
        VencordNative.plugins.state().then(value => {
            if (mounted) { setState(value); setRepository(value.repository); }
        }).catch(() => { if (mounted) setError("Não foi possível carregar os plugins. Tente abrir esta aba novamente."); });
        return () => { mounted = false; };
    }, []);

    async function action(id: string, operation: () => Promise<PluginState>, message: string) {
        setBusy(id); setError(""); setNotice(""); setFeedbackPlugin(id);
        try {
            const next = await operation(); setState(next);
            if (state && id !== "repository") await applyState(state, next);
            setNotice(id !== "repository" && needsRestart(next) ? "Arquivos atualizados. Reinicie o Discord para aplicar as mudanças que exigem reinício." : message);
        }
        catch (error) {
            try {
                const current = await VencordNative.plugins.state(); setState(current);
                if (state && id !== "repository") await applyState(state, current);
            } catch { /* Keep the original operation error visible. */ }
            setError(error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.");
        }
        finally { setBusy(""); }
    }
    const visible = plugins.filter(plugin => (origin === "all" || plugin.origin === origin)
        && (!category || plugin.categories.includes(category))
        && (filter === "all" || (filter === "installed" ? state?.installed.includes(plugin.id)
            : filter === "enabled" ? state?.enabled.includes(plugin.id) : !plugin.available))
        && normalize(`${plugin.name} ${plugin.description} ${plugin.authors.map(author => author.name).join(" ")}`).includes(normalize(query)));
    const pending = state && needsRestart(state);

    return <section className="dc-page dc-plugins" aria-label="Catálogo de plugins">
        <div className="dc-info-panel"><h2>Gerenciar plugins</h2><p>Use o botão de informações ou a engrenagem para ver detalhes e opções de um plugin.</p><p>Ativar baixa o plugin e suas dependências. Desativar remove os arquivos sem uso. Plugins compatíveis mudam na hora; os demais pedem reinício.</p></div>
        <h3 className="dc-section-title">Filtros</h3>
        <div className="dc-origin-filters" role="group" aria-label="Origem dos plugins">
            {[["all", "Todos"], ...Object.entries(origins)].map(([value, label]) =>
                <button key={value} type="button" aria-pressed={origin === value} onClick={() => { setOrigin(value as PluginOrigin | "all"); setLimit(24); }}>{label}</button>)}
        </div>
        <div className="dc-plugin-filters">
            <label className="dc-search">Buscar plugin ou autor<input type="search" name="plugin-search" autoComplete="off" value={query} placeholder="Buscar plugin, função ou autor…" onChange={event => { setQuery(event.currentTarget.value); setLimit(24); }} /></label>
            <label>Categoria<select value={category} onChange={event => { setCategory(event.currentTarget.value); setLimit(24); }}><option value="">Todas</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Mostrar<select value={filter} onChange={event => { setFilter(event.currentTarget.value); setLimit(24); }}><option value="all">Todos</option><option value="installed">Instalados</option><option value="enabled">Ativados</option><option value="unavailable">Precisam de adaptação</option></select></label>
        </div>
        {state && !state.repository && <p className="dc-notice" role="status">Instalação de plugins indisponível: esta versão ainda não tem um servidor de downloads configurado. Os plugins abaixo estão no catálogo, mas ainda não podem ser baixados. Plugins já instalados continuam disponíveis.</p>}
        {pending && <div className="dc-plugin-restart" role="status"><p>Algumas alterações precisam de reinício. Os arquivos desativados já foram removidos; o código em uso termina ao reiniciar.</p><button type="button" className="dc-button" onClick={relaunch}>Reiniciar Discord</button></div>}
        {state?.errors.startup && <p className="dc-error" role="alert">{state.errors.startup}</p>}
        <p className="dc-plugin-count" role="status" aria-live="polite">{!state && !error ? "Carregando catálogo…" : `${visible.length} ${visible.length === 1 ? "plugin encontrado" : "plugins encontrados"}${state ? ` · ${state.installed.filter(id => plugins.some(plugin => plugin.id === id)).length} instalados` : ""}`}</p>
        {notice && !pending && <p className="dc-notice" role="status">{notice}</p>}
        {error && (!feedbackPlugin || feedbackPlugin === "repository") && <p className="dc-error" role="alert">{error}</p>}
        {visible.length === 0 && <div className="dc-empty"><h3>{origin !== "all" && !plugins.some(plugin => plugin.origin === origin) ? "Nenhum plugin publicado desta origem" : "Nenhum plugin encontrado"}</h3><p>{origin !== "all" && !plugins.some(plugin => plugin.origin === origin) ? "Plugins de outros clientes entram aqui após adaptação. Universais são os que têm compatibilidade confirmada; o nome não garante que qualquer plugin funcione." : "Tente outro nome, autor ou categoria."}</p></div>}
        <h3 className="dc-section-title">Plugins</h3>
        <ul className="dc-plugin-list">{visible.slice(0, limit).map(plugin => {
            const installed = state?.installed.includes(plugin.id) ?? false;
            const enabled = state?.enabled.includes(plugin.id) ?? false;
            const runtime = status(plugin.name);
            const changed = enabled !== (runtime === "active");
            async function toggle(value: boolean) {
                if (value && !installed && !state?.repository) {
                    setFeedbackPlugin(plugin.id); setNotice("");
                    setError("Não é possível baixar este plugin: falta configurar o servidor de downloads do Deskcord. Reiniciar ou reinstalar o Discord não resolve essa configuração.");
                    return;
                }
                await action(plugin.id, () => value && !installed ? VencordNative.plugins.install(plugin.id) : VencordNative.plugins.setEnabled(plugin.id, value),
                    value ? "Plugin ativado nesta sessão." : "Plugin desativado. Arquivos sem uso removidos.");
            }
            return <li key={plugin.id} className={`dc-plugin-row${!plugin.available ? " dc-plugin-unavailable-card" : ""}`} data-plugin={plugin.id}>
                <div className="dc-plugin-card-top"><h3 title={plugin.name}>{plugin.name}</h3>
                    <button type="button" className="dc-icon-button" aria-label={`${plugin.hasSettings ? "Configurações de" : "Informações sobre"} ${plugin.name}`} title={plugin.hasSettings ? "Configurações e informações" : "Informações do plugin"} onClick={() => setSelected(plugin)}><Icon name={plugin.hasSettings ? "settings" : "info"} /></button>
                    <Switch label={`Ativar ${plugin.name}`} checked={enabled} disabled={!!busy || !state || !plugin.available} onChange={toggle} />
                </div>
                <p className="dc-plugin-description" title={plugin.description}>{plugin.description}</p>
                <p className="dc-plugin-card-meta"><span>{origins[plugin.origin]}</span><span className="dc-theme-author" title={plugin.authors.map(author => author.name).join(", ")}>por {plugin.authors.map(author => author.name).join(", ")}</span></p>
                {!plugin.available && <p className="dc-plugin-unavailable">Requer adaptação · ver informações</p>}
                {busy === plugin.id && <p className="dc-plugin-meta" role="status">Baixando e verificando…</p>}
                {error && feedbackPlugin === plugin.id && <p className="dc-error" role="alert">{error}</p>}
                {(installed || runtime === "active") && <p className="dc-plugin-meta">{changed ? "Precisa reiniciar" : runtime === "active" ? "Ativo" : runtime === "failed" ? "Falha ao iniciar" : enabled ? "Inicialização não confirmada" : "Desativado"}</p>}
            </li>;
        })}</ul>
        {selected && <PluginDetails plugin={selected} installed={state?.installed.includes(selected.id) ?? false} onClose={() => setSelected(null)} onRemove={() => {
            setSelected(null);
            action(selected.id, () => VencordNative.plugins.remove(selected.id), "Plugin removido. Dependências compartilhadas foram preservadas.");
        }} />}
        {visible.length > limit && <button type="button" className="dc-button dc-load-more" onClick={() => setLimit(value => value + 24)}>Mostrar mais plugins</button>}
        <p className="dc-footnote">Pacotes do Vencord preparados para o Deskcord; testes individuais dentro do Discord ainda são necessários. Plugins executam código e podem aumentar consumo, acessar dados do cliente ou usar serviços externos. A explicação em português preserva o nome e a autoria originais.</p>
        <details className="dc-diagnostics"><summary>Repositório de downloads</summary><p>Informe a pasta HTTPS dos pacotes publicados para esta versão. O catálogo e os hashes autorizados continuam os mesmos.</p>
            <label className="dc-search">Endereço do repositório<input type="url" value={repository} placeholder="https://seu-repositorio/pacotes/" onChange={event => setRepository(event.currentTarget.value)} /></label>
            <button type="button" className="dc-button" disabled={!!busy || !state} onClick={() => action("repository", () => VencordNative.plugins.setRepository(repository.trim()), "Repositório salvo.")}>Salvar repositório</button>
        </details>
    </section>;
}
