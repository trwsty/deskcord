/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and Megumin
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { MainSettingsIcon, PaintbrushIcon, PluginsIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin, { IconProps } from "@utils/types";
import { waitFor } from "@webpack";
import { React } from "@webpack/common";
import type { ComponentType, ReactNode } from "react";

import { DeskcordTab, PluginsTab, ThemesTab } from "../../deskcord/Tabs";

let layoutTypes = { SECTION: 1, SIDEBAR_ITEM: 2, PANEL: 3, CATEGORY: 5, CUSTOM: 19 };
waitFor(["SECTION", "SIDEBAR_ITEM", "PANEL", "CUSTOM"], types => layoutTypes = types);
interface LayoutNode {
    type: number;
    key?: string;
    useTitle?(): string;
    buildLayout?(): LayoutNode[];
    icon?(): ReactNode;
}
interface EntryOptions {
    key: string;
    title: string;
    panelTitle?: string;
    Component: ComponentType<{}>;
    Icon: ComponentType<IconProps>;
}

export default definePlugin({
    name: "Settings",
    description: "Integra as três abas do Deskcord às configurações do Discord.",
    authors: [Devs.Ven, Devs.Megu],
    required: true,
    dependencies: ["UserSettingsAPI"],
    patches: [{
        find: ".buildLayout().map",
        replacement: {
            match: /(\i)\.buildLayout\(\)(?=\.map)/,
            replace: "$self.buildLayout($1)"
        }
    }],
    buildEntry({ key, title, panelTitle = title, Component, Icon }: EntryOptions): LayoutNode {
        return {
            key,
            type: layoutTypes.SIDEBAR_ITEM,
            useTitle: () => title,
            icon: () => <Icon width={20} height={20} />,
            buildLayout: () => [{
                key: key + "_panel", type: layoutTypes.PANEL, useTitle: () => panelTitle,
                buildLayout: () => [{
                    key: key + "_category", type: layoutTypes.CATEGORY,
                    buildLayout: () => [{
                        key: key + "_custom", type: layoutTypes.CUSTOM,
                        Component, useSearchTerms: () => [title, "Deskcord"]
                    }]
                }]
            }]
        };
    },
    buildLayout(original: { key?: string; buildLayout(): LayoutNode[]; }) {
        const layout = original.buildLayout();
        if (original.key !== "$Root" || !Array.isArray(layout) || layout.some(item => item?.key === "deskcord_section")) return layout;
        try {
            const entries = [
                { key: "deskcord_main", title: "Deskcord", Component: DeskcordTab, Icon: MainSettingsIcon },
                { key: "deskcord_plugins", title: "Plugins", Component: PluginsTab, Icon: PluginsIcon },
                { key: "deskcord_themes", title: "Temas", Component: ThemesTab, Icon: PaintbrushIcon }
            ];
            const index = layout.findIndex(item => item?.key === "billing_section");
            layout.splice(index < 0 ? Math.min(2, layout.length) : index, 0, {
                key: "deskcord_section", type: layoutTypes.SECTION,
                useTitle: () => "Deskcord", buildLayout: () => entries.map(this.buildEntry)
            });
        } catch { console.error("[Deskcord] Não foi possível integrar as configurações."); }
        return layout;
    },
    // Preserved only for upstream source-level API compatibility; not rendered.
    customEntries: [] as EntryOptions[],
    customSections: [] as ((types: any) => any)[]
});
