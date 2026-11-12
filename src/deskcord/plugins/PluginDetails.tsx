/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isSettingDisabled, isSettingHidden } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { OptionType, PluginSettingDef } from "@utils/types";
import { React, useState } from "@webpack/common";

import { Modal } from "../Modal";
import { Switch } from "../Switch";
import { CatalogPlugin, origins } from "./model";
import { optionsFor } from "./runtime";

function PluginOptions({ plugin }: { plugin: CatalogPlugin; }) {
    useSettings(["plugins.*"]);
    const options = optionsFor(plugin.name);
    const [error, setError] = useState("");
    const [restart, setRestart] = useState(false);
    if (!options) return <p className="dc-muted">Instale o plugin e reinicie o Discord para acessar as opções. Plugins sem opções configuráveis mostram apenas informações.</p>;
    function save(key: string, definition: PluginSettingDef, value: unknown) {
        try {
            if ("isValid" in definition && definition.isValid) {
                const valid = definition.isValid.call(options!, value as never);
                if (valid !== true) { setError(typeof valid === "string" ? valid : "Valor inválido. Confira a opção e tente novamente."); return; }
            }
            options!.store[key] = value;
            setError("");
            if ("restartNeeded" in definition && definition.restartNeeded) setRestart(true);
        } catch { setError("Não foi possível salvar esta opção. Verifique o valor e tente novamente."); }
    }
    return <div className="dc-plugin-options">
        <p className="dc-muted">Opções originais fornecidas pelo autor do plugin. As alterações são salvas ao selecionar uma opção ou sair de um campo.</p>
        {Object.entries(options.def).filter(([, definition]) => definition.type !== OptionType.CUSTOM && (!("target" in definition) || definition.target !== "WEB") && !isSettingHidden(options, definition)).map(([key, definition]) => {
            const disabled = isSettingDisabled(options, definition);
            const title = "displayName" in definition && definition.displayName || key;
            const description = "description" in definition ? definition.description : "";
            const current = options.store[key];
            let control;
            switch (definition.type) {
                case OptionType.BOOLEAN:
                    control = <Switch label={title} checked={Boolean(current)} disabled={disabled} onChange={value => save(key, definition, value)} />;
                    break;
                case OptionType.SELECT:
                    control = <select aria-label={title} disabled={disabled} value={String(definition.options.findIndex(option => option.value === current))}
                        onChange={event => { const option = definition.options[Number(event.currentTarget.value)]; if (option) save(key, definition, option.value); }}>
                        {definition.options.map((option, index) => <option key={index} value={String(index)}>{option.label}</option>)}
                    </select>;
                    break;
                case OptionType.STRING:
                    control = definition.multiline ? <textarea aria-label={title} autoComplete="off" disabled={disabled} rows={4} defaultValue={String(current ?? "")} placeholder={definition.placeholder} onBlur={event => save(key, definition, event.currentTarget.value)} /> : <input aria-label={title} type={definition.componentProps?.type === "password" ? "password" : "text"} autoComplete="off" disabled={disabled} defaultValue={String(current ?? "")} placeholder={definition.placeholder}
                        onBlur={event => save(key, definition, event.currentTarget.value)} />;
                    break;
                case OptionType.NUMBER:
                    control = <input aria-label={title} type="number" disabled={disabled} min={definition.min} max={definition.max} defaultValue={String(current ?? "")}
                        onBlur={event => { const number = event.currentTarget.valueAsNumber; if (Number.isFinite(number) && (definition.min == null || number >= definition.min) && (definition.max == null || number <= definition.max)) save(key, definition, number); else setError("Informe um número dentro dos limites desta opção."); }} />;
                    break;
                case OptionType.SLIDER:
                    control = <input aria-label={title} type="range" disabled={disabled} min={Math.min(...definition.markers)} max={Math.max(...definition.markers)} value={Number(current ?? definition.default)}
                        onChange={event => { const value = Number(event.currentTarget.value); save(key, definition, definition.stickToMarkers === false ? value : definition.markers.reduce((closest, marker) => Math.abs(marker - value) < Math.abs(closest - value) ? marker : closest)); }} />;
                    break;
                default:
                    control = <span className="dc-muted">Esta opção usa uma interface personalizada ainda não integrada.</span>;
            }
            return <div key={key} className={`dc-option-row${definition.type === OptionType.BOOLEAN ? " dc-option-inline" : ""}`}><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{control}</div>;
        })}
        {error && <p role="alert" className="dc-error">{error}</p>}
        {restart && <p role="status" className="dc-notice">Reinicie o Discord para aplicar esta opção.</p>}
    </div>;
}
const Options = ErrorBoundary.wrap(PluginOptions, { noop: false });

export function PluginDetails({ plugin, installed, onRemove, onClose }: {
    plugin: CatalogPlugin; installed: boolean; onRemove: () => void; onClose: () => void;
}) {
    const [tab, setTab] = useState(plugin.hasSettings ? "settings" : "info");
    return <Modal title={plugin.name} onClose={onClose}>
        <div className="dc-tab-bar" role="group" aria-label="Detalhes do plugin">
            <button type="button" aria-pressed={tab === "info"} onClick={() => setTab("info")}>Informações</button>
            {plugin.hasSettings && <button type="button" aria-pressed={tab === "settings"} onClick={() => setTab("settings")}>Configurações</button>}
        </div>
        {tab === "settings" ? <Options plugin={plugin} /> : <div className="dc-plugin-information">
            <p>{plugin.description}</p><dl><dt>Origem</dt><dd>{origins[plugin.origin]}</dd><dt>Autores</dt><dd>{plugin.authors.map(author => author.name).join(", ")}</dd>
                <dt>Categorias</dt><dd>{plugin.categories.join(", ")}</dd><dt>Download</dt><dd>{plugin.bytes ? `${(plugin.bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB` : "Não disponível"}</dd></dl>
            {!plugin.available && <p className="dc-notice">{plugin.reason}</p>}
            {plugin.dependencies.length > 0 && <p className="dc-muted">Os módulos necessários são baixados junto, sem duplicar os que você já tem.</p>}
            <a className="dc-plugin-source" href={plugin.source} target="_blank" rel="noreferrer noopener">Ver código e créditos originais</a>
        </div>}
        {installed && <div className="dc-modal-footer"><button type="button" className="dc-button" onClick={onRemove}>Remover plugin</button></div>}
    </Modal>;
}
