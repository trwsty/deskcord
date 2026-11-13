/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CatalogPlugin, dependencyOrder, PluginCatalog, PluginPackage, PluginState } from "../../deskcord/plugins/model";
import { downloadPackage, repositoryUrl } from "./download";

export function verifyPackage(bytes: Buffer, plugin: CatalogPlugin, revision: string): PluginPackage {
    if (bytes.length !== plugin.bytes || createHash("sha256").update(bytes).digest("hex") !== plugin.sha256)
        throw new Error("A integridade do plugin não corresponde ao catálogo. O pacote foi recusado.");
    const value = JSON.parse(bytes.toString("utf8"));
    if (value?.format !== 1 || value.id !== plugin.id || value.name !== plugin.name || value.revision !== revision
        || typeof value.renderer !== "string" || typeof value.css !== "string" || (value.native != null && typeof value.native !== "string"))
        throw new Error("Formato de pacote incompatível.");
    return value;
}

export function createPluginStore(directory: string, catalog: PluginCatalog,
    downloader: (url: URL, bytes: number) => Promise<Buffer> = downloadPackage, defaultRepository = "") {
    mkdirSync(directory, { recursive: true });
    const root = realpathSync(directory);
    const statePath = join(root, "plugins.json");
    const errors: Record<string, string> = {};
    const byId = new Map(catalog.plugins.map(plugin => [plugin.id, plugin]));
    let data = { roots: [] as string[], enabled: [] as string[], repository: defaultRepository ? repositoryUrl(defaultRepository) : "" };
    let queue: Promise<unknown> = Promise.resolve();
    function path(name: string) {
        if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) throw new Error("Nome de pacote inválido.");
        const file = join(root, name);
        if (existsSync(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())) throw new Error("Links e diretórios não são aceitos como pacotes.");
        return file;
    }
    function known(id: unknown): CatalogPlugin {
        if (typeof id !== "string" || !/^[a-z0-9-]{1,120}$/.test(id) || !byId.has(id)) throw new Error("Plugin fora do catálogo desta versão.");
        return byId.get(id)!;
    }
    function persist(next: typeof data) {
        path("plugins.json");
        const temporary = path(`state-${randomUUID()}.json`);
        writeFileSync(temporary, JSON.stringify(next, null, 4), { flag: "wx" });
        try { renameSync(temporary, statePath); data = next; }
        finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
    try {
        if (existsSync(statePath)) {
            if (lstatSync(path("plugins.json")).size > 64 * 1024) throw new Error("Preferências muito grandes.");
            const bytes = readFileSync(path("plugins.json"));
            if (bytes.length > 64 * 1024) throw new Error("Preferências muito grandes.");
            const parsed = JSON.parse(bytes.toString());
            for (const key of ["roots", "enabled"]) {
                if (!Array.isArray(parsed[key]) || parsed[key].length > 128 || parsed[key].some((id: unknown) => !known(id))) throw new Error("Preferências inválidas.");
            }
            if (parsed.enabled.some((id: string) => !parsed.roots.includes(id))) throw new Error("Ativação sem instalação.");
            data = { roots: [...new Set<string>(parsed.roots)], enabled: [...new Set<string>(parsed.enabled)], repository: repositoryUrl(parsed.repository) };
        }
    } catch { errors.startup = "Não foi possível ler as preferências dos plugins. O núcleo foi mantido sem plugins opcionais."; }

    function read(plugin: CatalogPlugin) {
        if (!plugin.file || !plugin.sha256 || !plugin.bytes) throw new Error("Plugin sem pacote de distribuição.");
        if (plugin.bytes > 8 * 1024 * 1024) throw new Error("Pacote maior que o limite autorizado.");
        const file = openSync(path(plugin.file), "r");
        try {
            if (fstatSync(file).size !== plugin.bytes) throw new Error("O tamanho do pacote foi alterado.");
            const buffer = Buffer.alloc(plugin.bytes);
            let offset = 0;
            while (offset < buffer.length) {
                const read = readSync(file, buffer, offset, buffer.length - offset, offset);
                if (!read) throw new Error("Pacote incompleto.");
                offset += read;
            }
            return verifyPackage(buffer, plugin, catalog.revision);
        } finally { closeSync(file); }
    }
    const startup: { plugin: CatalogPlugin; package: PluginPackage; }[] = [];
    try {
        for (const plugin of dependencyOrder(catalog, data.enabled)) startup.push({ plugin, package: read(plugin) });
    } catch { startup.length = 0; errors.startup = "Um pacote instalado está ausente ou foi alterado. Reinstale o plugin; nenhum plugin opcional foi carregado."; }

    function state(): PluginState {
        let installed: string[] = [];
        let enabled: string[] = [];
        try {
            installed = dependencyOrder(catalog, data.roots).filter(plugin => {
                try { read(plugin); return true; } catch { return false; }
            }).map(plugin => plugin.id);
            enabled = dependencyOrder(catalog, data.enabled).map(plugin => plugin.id);
        } catch { /* The startup error is exposed above. */ }
        return { repository: data.repository, installed, enabled, loadedAtStartup: startup.map(item => item.plugin.id), errors: { ...errors } };
    }
    function mutate(operation: () => Promise<void> | void): Promise<PluginState> {
        const result = queue.then(operation).then(state);
        queue = result.catch(() => { });
        return result;
    }
    async function install(id: unknown) {
        return mutate(async () => {
            const plugin = known(id);
            if (plugin.hidden || !plugin.available) throw new Error("Este plugin não está disponível para instalação direta.");
            const roots = [...new Set([...data.roots, plugin.id])];
            const needed = dependencyOrder(catalog, roots);
            if (needed.reduce((bytes, item) => bytes + (item.bytes ?? 0), 0) > 128 * 1024 * 1024)
                throw new Error("Os plugins selecionados excedem o limite de 128 MB.");
            const added: string[] = [];
            try {
                for (const item of needed) {
                    try { read(item); continue; } catch { /* A missing or corrupt payload must be downloaded again. */ }
                    if (!data.repository) throw new Error("Os downloads ainda não foram configurados nesta distribuição.");
                    if (!item.file || !item.bytes) throw new Error("Pacote indisponível.");
                    const bytes = await downloader(new URL(item.file, data.repository), item.bytes);
                    verifyPackage(bytes, item, catalog.revision);
                    const destination = path(item.file);
                    const temporary = path(`download-${randomUUID()}.json`);
                    writeFileSync(temporary, bytes, { flag: "wx" });
                    try { renameSync(temporary, destination); added.push(destination); }
                    finally { if (existsSync(temporary)) unlinkSync(temporary); }
                }
                persist({ ...data, roots, enabled: [...new Set([...data.enabled, plugin.id])] });
                delete errors.startup;
            } catch (error) {
                const prior = new Set(dependencyOrder(catalog, data.roots).map(item => item.file));
                for (const addedPath of added) if (![...prior].some(file => addedPath === join(root, file!)) && existsSync(addedPath)) unlinkSync(addedPath);
                throw error;
            }
        });
    }
    function setEnabled(id: unknown, enabled: unknown) {
        if (enabled === false) return remove(id);
        return mutate(() => {
            const plugin = known(id);
            if (typeof enabled !== "boolean") throw new Error("Estado de ativação inválido.");
            if (!state().installed.includes(plugin.id)) throw new Error("Baixe o plugin antes de ativá-lo.");
            const roots = enabled ? [...new Set([...data.roots, plugin.id])] : data.roots;
            const next = enabled ? [...new Set([...data.enabled, plugin.id])] : data.enabled.filter(item => item !== plugin.id);
            if (!enabled && dependencyOrder(catalog, next).some(item => item.id === plugin.id)) throw new Error("Outro plugin ativo precisa deste módulo. Desative o outro plugin primeiro.");
            persist({ ...data, roots, enabled: next });
        });
    }
    function livePackages(ids: unknown) {
        if (!Array.isArray(ids) || ids.length > 128) throw new Error("Lista de plugins inválida.");
        const enabled = new Set(state().enabled);
        return [...new Set(ids)].map(id => {
            const plugin = known(id);
            if (!enabled.has(plugin.id) || plugin.hotReload !== true || plugin.hasNative) throw new Error("Este plugin precisa de reinício.");
            const pkg = read(plugin);
            if (pkg.native) throw new Error("Módulos nativos precisam de reinício.");
            return { name: plugin.name, renderer: pkg.renderer, css: pkg.css };
        });
    }
    function rendererPackages() {
        try {
            const order = dependencyOrder(catalog, data.enabled);
            const nativeReady = new Set(startup.filter(item => item.package.native).map(item => item.plugin.id));
            const blocked = new Set(order.filter(plugin => plugin.hasNative && !nativeReady.has(plugin.id)).map(plugin => plugin.id));
            for (const plugin of order) if (plugin.dependencies.some(id => blocked.has(id))) blocked.add(plugin.id);
            return order.filter(plugin => !blocked.has(plugin.id)).map(plugin => ({ plugin, package: read(plugin) }));
        } catch {
            errors.startup = "Um pacote foi alterado ou está ausente. Nenhum plugin opcional foi preparado para esta recarga.";
            return [];
        }
    }
    function remove(id: unknown) {
        return mutate(() => {
            const plugin = known(id);
            const roots = data.roots.filter(item => item !== plugin.id);
            const remaining = new Set(dependencyOrder(catalog, roots).map(item => item.id));
            if (remaining.has(plugin.id)) throw new Error("Outro plugin instalado precisa deste módulo. Remova o outro plugin primeiro.");
            const previous = dependencyOrder(catalog, [...new Set([...data.roots, plugin.id])]);
            persist({ ...data, roots, enabled: data.enabled.filter(item => item !== plugin.id) });
            for (const item of previous) if (!remaining.has(item.id) && item.file) {
                const file = path(item.file);
                if (existsSync(file)) unlinkSync(file);
                const native = path(`${item.id}.cjs`);
                if (existsSync(native)) unlinkSync(native);
            }
        });
    }
    return { state, startup, install, setEnabled, remove, livePackages, rendererPackages,
        setRepository: (url: unknown) => mutate(() => { persist({ ...data, repository: repositoryUrl(url) }); }),
        nativePath: (id: string, code: string) => {
            known(id);
            const file = path(`${id}.cjs`);
            writeFileSync(file, code);
            return file;
        }
    };
}
