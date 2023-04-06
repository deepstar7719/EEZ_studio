import React from "react";

import { action, computed, makeObservable } from "mobx";
import { observable } from "mobx";
import * as FlexLayout from "flexlayout-react";

import { Icon } from "eez-studio-ui/icon";

import type { ProjectStore } from "project-editor/store";

////////////////////////////////////////////////////////////////////////////////

export class LayoutModels {
    static FONT = {
        size: "small"
    };

    static FONT_SUB = {
        size: "small"
    };

    static GLOBAL_OPTIONS = {
        borderEnableAutoHide: true,
        splitterSize: 4,
        splitterExtra: 4,
        legacyOverflowMenu: false,
        tabEnableRename: false
    };

    static PAGES_TAB_ID = "PAGES";
    static ACTIONS_TAB_ID = "ACTIONS";
    static VARIABLES_TAB_ID = "VARIABLES";
    static CHECKS_TAB_ID = "CHECKS";
    static OUTPUT_TAB_ID = "OUTPUT";
    static SEARCH_RESULTS_TAB_ID = "SEARCH_RESULTS";
    static EDITOR_MODE_EDITORS_TABSET_ID = "EDITORS";
    static RUNTIME_MODE_EDITORS_TABSET_ID = "RUNTIME-EDITORS";
    static PROPERTIES_TAB_ID = "PROPERTIES";
    static COMPONENTS_PALETTE_TAB_ID = "COMPONENTS_PALETTE";
    static BREAKPOINTS_TAB_ID = "BREAKPOINTS_PALETTE";
    static DEBUGGER_TAB_ID = "DEBUGGER";
    static DEBUGGER_LOGS_TAB_ID = "DEBUGGER_LOGS";

    static SCPI_SUBSYSTEMS_TAB_ID = "SCPI_SUBSYSTEMS";
    static SCPI_ENUMS_TAB_ID = "SCPI_ENUMS";
    static SCPI_COMMANDS_TAB_ID = "SCPI_COMMANDS";

    static LANGUAGES_TAB_ID = "LANGUAGES";
    static TEXT_RESOURCES_TAB_ID = "TEXT_RESOURCES";
    static TEXTS_STATISTICS_TAB_ID = "TEXTS_STATISTICS";

    static STYLES_TAB_ID = "styles";
    static FONTS_TAB_ID = "fonts";
    static BITMAPS_TAB_ID = "bitmaps";
    static TEXTS_TAB_ID = "texts";
    static SCPI_TAB_ID = "scpi";
    static SHORTCUTS_TAB_ID = "shortcuts";
    static EXTENSION_DEFINITIONS_TAB_ID = "iext";
    static CHANGES_TAB_ID = "changes";
    static MICRO_PYTHON_TAB_ID = "micro-python";
    static README_TAB_ID = "readme";

    static PAGES_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Pages",
        component: "pages",
        icon: "svg:pages",
        id: LayoutModels.PAGES_TAB_ID
    };
    static ACTIONS_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Actions",
        component: "actions",
        icon: "material:code",
        id: LayoutModels.ACTIONS_TAB_ID
    };

    static STYLES_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Styles",
        id: LayoutModels.STYLES_TAB_ID,
        component: "styles",
        icon: "material:format_color_fill"
    };

    static FONTS_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Fonts",
        id: LayoutModels.FONTS_TAB_ID,
        component: "fonts",
        icon: "material:font_download"
    };

    static BITMAPS_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Bitmaps",
        id: LayoutModels.BITMAPS_TAB_ID,
        component: "bitmaps",
        icon: "material:image"
    };

    static THEMES_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Themes",
        component: "themesSideView",
        icon: "svg:palette"
    };

    static TEXTS_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Texts",
        id: LayoutModels.TEXTS_TAB_ID,
        component: "texts",
        icon: "svg:language"
    };

    static SCPI_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "SCPI",
        id: LayoutModels.SCPI_TAB_ID,
        component: "scpi",
        icon: "material:navigate_next"
    };

    static EXTENSION_DEFINITIONS_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "IEXT",
        id: LayoutModels.EXTENSION_DEFINITIONS_TAB_ID,
        component: "extension-definitions",
        icon: "material:extension"
    };

    static CHANGES_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Changes",
        id: LayoutModels.CHANGES_TAB_ID,
        component: "changes",
        icon: "svg:changes"
    };

    static BREAKPOINTS_TAB: FlexLayout.IJsonTabNode = {
        type: "tab",
        enableClose: false,
        name: "Breakpoints",
        id: LayoutModels.BREAKPOINTS_TAB_ID,
        icon: "svg:breakpoints_panel",
        component: "breakpointsPanel"
    };

    static iconFactory = (node: FlexLayout.TabNode) => {
        let icon = node.getIcon();
        if (!icon || typeof icon != "string") {
            return null;
        }
        return <Icon icon={icon} size={20} />;
    };

    rootEditor: FlexLayout.Model;
    rootRuntime: FlexLayout.Model;
    get root() {
        return this.projectStore.runtime ? this.rootRuntime : this.rootEditor;
    }

    styles: FlexLayout.Model;
    bitmaps: FlexLayout.Model;
    fonts: FlexLayout.Model;
    themes: FlexLayout.Model;
    scpi: FlexLayout.Model;
    texts: FlexLayout.Model;

    constructor(public projectStore: ProjectStore) {
        makeObservable(this, {
            rootEditor: observable,
            rootRuntime: observable,
            root: computed,

            styles: observable,
            bitmaps: observable,
            fonts: observable,
            themes: observable,
            scpi: observable,
            texts: observable
        });
    }

    get borders() {
        const borders: FlexLayout.IJsonBorderNode[] = [
            {
                type: "border",
                location: "top",
                children: []
            }
        ];

        const rightBorderChildren = [
            LayoutModels.STYLES_TAB,
            LayoutModels.FONTS_TAB,
            LayoutModels.BITMAPS_TAB
        ];
        if (!this.projectStore.projectTypeTraits.isLVGL) {
            rightBorderChildren.push(LayoutModels.THEMES_TAB);
        }
        borders.push({
            type: "border",
            location: "right",
            size: 240,
            children: rightBorderChildren
        });

        borders.push({
            type: "border",
            location: "bottom",
            children: [
                {
                    type: "tab",
                    enableClose: false,
                    name: "Checks",
                    id: LayoutModels.CHECKS_TAB_ID,
                    component: "checksMessages"
                },
                {
                    type: "tab",
                    enableClose: false,
                    name: "Output",
                    id: LayoutModels.OUTPUT_TAB_ID,
                    component: "outputMessages"
                },
                {
                    type: "tab",
                    enableClose: false,
                    name: "Search Results",
                    id: LayoutModels.SEARCH_RESULTS_TAB_ID,
                    component: "searchResultsMessages"
                }
            ]
        });

        borders.push({
            type: "border",
            location: "left",
            size: 240,
            children: [
                LayoutModels.TEXTS_TAB,
                LayoutModels.SCPI_TAB,
                LayoutModels.EXTENSION_DEFINITIONS_TAB,
                LayoutModels.CHANGES_TAB
            ]
        });

        return borders;
    }

    get models(): {
        name: string;
        version: number;
        json: FlexLayout.IJsonModel;
        get: () => FlexLayout.Model;
        set: (model: FlexLayout.Model) => void;
    }[] {
        return [
            {
                name: "rootEditor",
                version: 87,
                json: {
                    global: LayoutModels.GLOBAL_OPTIONS,
                    borders: this.borders,
                    layout: {
                        type: "row",
                        children: [
                            {
                                type: "row",
                                weight: 20,
                                children: [
                                    {
                                        type: "tabset",
                                        weight: 1,
                                        enableClose: false,
                                        children: [
                                            LayoutModels.PAGES_TAB,
                                            LayoutModels.ACTIONS_TAB
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        weight: 1,
                                        enableClose: false,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Page Structure",
                                                component: "flow-structure",
                                                icon: "svg:hierarchy"
                                            }
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        weight: 1,
                                        enableClose: false,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Variables",
                                                component: "variables",
                                                icon: "svg:variable",
                                                id: LayoutModels.VARIABLES_TAB_ID
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                type: "tabset",
                                weight: 60,
                                enableClose: false,
                                enableDeleteWhenEmpty: false,
                                id: LayoutModels.EDITOR_MODE_EDITORS_TABSET_ID,
                                children: []
                            },
                            {
                                type: "row",
                                weight: 25,
                                children: [
                                    {
                                        type: "tabset",
                                        weight: 2,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Properties",
                                                id: LayoutModels.PROPERTIES_TAB_ID,
                                                component: "propertiesPanel",
                                                icon: "svg:properties"
                                            },
                                            LayoutModels.BREAKPOINTS_TAB
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        weight: 1,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Components Palette",
                                                id: LayoutModels.COMPONENTS_PALETTE_TAB_ID,
                                                component: "componentsPalette",
                                                icon: "svg:components"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
                get: () => this.rootEditor,
                set: action(model => (this.rootEditor = model))
            },
            {
                name: "rootRuntime",
                version: 45,
                json: {
                    global: LayoutModels.GLOBAL_OPTIONS,
                    layout: {
                        type: "row",
                        children: [
                            {
                                type: "row",
                                weight: 25,
                                children: [
                                    {
                                        type: "tabset",
                                        weight: 1,
                                        children: [
                                            LayoutModels.PAGES_TAB,
                                            LayoutModels.ACTIONS_TAB
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        weight: 1,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Active Flows",
                                                icon: "svg:active_flows_panel",
                                                component: "active-flows"
                                            }
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        weight: 2,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Watch",
                                                icon: "svg:watch_panel",
                                                component: "watch"
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                type: "tabset",
                                weight: 50,
                                enableClose: false,
                                enableDeleteWhenEmpty: false,
                                id: LayoutModels.RUNTIME_MODE_EDITORS_TABSET_ID,
                                children: []
                            },
                            {
                                type: "row",
                                weight: 25,
                                children: [
                                    {
                                        type: "tabset",
                                        weight: 1,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Queue",
                                                icon: "svg:queue_panel",
                                                component: "queue"
                                            },
                                            LayoutModels.BREAKPOINTS_TAB
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        weight: 2,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Logs",
                                                id: LayoutModels.DEBUGGER_LOGS_TAB_ID,
                                                icon: "svg:log",
                                                component: "logs"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
                get: () => this.rootRuntime,
                set: action(model => (this.rootRuntime = model))
            },
            {
                name: "bitmaps",
                version: 2,
                json: {
                    global: LayoutModels.GLOBAL_OPTIONS,
                    borders: [],
                    layout: {
                        type: "row",
                        children: [
                            {
                                type: "row",
                                children: [
                                    {
                                        type: "tabset",
                                        enableTabStrip: false,
                                        enableDrag: false,
                                        enableDrop: false,
                                        enableClose: false,
                                        weight: 75,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Bitmaps",
                                                component: "bitmaps"
                                            }
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        enableTabStrip: false,
                                        enableDrag: false,
                                        enableDrop: false,
                                        enableClose: false,
                                        weight: 25,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Preview",
                                                component: "preview"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
                get: () => this.bitmaps,
                set: action(model => (this.bitmaps = model))
            },
            {
                name: "fonts",
                version: 1,
                json: {
                    global: LayoutModels.GLOBAL_OPTIONS,
                    borders: [],
                    layout: {
                        type: "row",
                        children: [
                            {
                                type: "tabset",
                                enableTabStrip: false,
                                enableDrag: false,
                                enableDrop: false,
                                enableClose: false,
                                children: [
                                    {
                                        type: "tab",
                                        enableClose: false,
                                        component: "glyphs"
                                    }
                                ]
                            },
                            {
                                type: "tabset",
                                enableTabStrip: false,
                                enableDrag: false,
                                enableDrop: false,
                                enableClose: false,
                                children: [
                                    {
                                        type: "tab",
                                        enableClose: false,
                                        component: "editor"
                                    }
                                ]
                            }
                        ]
                    }
                },
                get: () => this.fonts,
                set: action(model => (this.fonts = model))
            },
            {
                name: "scpi",
                version: 3,
                json: {
                    global: LayoutModels.GLOBAL_OPTIONS,
                    borders: [],
                    layout: {
                        type: "row",
                        children: [
                            {
                                type: "row",
                                children: [
                                    {
                                        type: "tabset",
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Subsystems",
                                                id: LayoutModels.SCPI_SUBSYSTEMS_TAB_ID,
                                                component: "subsystems"
                                            },
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Enums",
                                                id: LayoutModels.SCPI_ENUMS_TAB_ID,
                                                component: "enums"
                                            }
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Commands",
                                                id: LayoutModels.SCPI_COMMANDS_TAB_ID,
                                                component: "commands"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
                get: () => this.scpi,
                set: action(model => (this.scpi = model))
            },
            {
                name: "styles",
                version: 2,
                json: {
                    global: LayoutModels.GLOBAL_OPTIONS,
                    borders: [],
                    layout: {
                        type: "row",
                        children: [
                            {
                                type: "row",
                                children: [
                                    {
                                        type: "tabset",
                                        enableTabStrip: false,
                                        enableDrag: false,
                                        enableDrop: false,
                                        enableClose: false,
                                        weight: 75,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Styles",
                                                component: "styles"
                                            }
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        enableTabStrip: false,
                                        enableDrag: false,
                                        enableDrop: false,
                                        enableClose: false,
                                        weight: 25,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Preview",
                                                component: "preview"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
                get: () => this.styles,
                set: action(model => (this.styles = model))
            },
            {
                name: "themes",
                version: 1,
                json: {
                    global: LayoutModels.GLOBAL_OPTIONS,
                    borders: [],
                    layout: {
                        type: "row",
                        children: [
                            {
                                type: "row",
                                children: [
                                    {
                                        type: "tabset",
                                        enableTabStrip: false,
                                        enableDrag: false,
                                        enableDrop: false,
                                        enableClose: false,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                component: "themes"
                                            }
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        enableTabStrip: false,
                                        enableDrag: false,
                                        enableDrop: false,
                                        enableClose: false,
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                component: "colors"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
                get: () => this.themes,
                set: action(model => (this.themes = model))
            },
            {
                name: "texts",
                version: 7,
                json: {
                    global: LayoutModels.GLOBAL_OPTIONS,
                    borders: [],
                    layout: {
                        type: "row",
                        children: [
                            {
                                type: "row",
                                children: [
                                    {
                                        type: "tabset",
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Text resources",
                                                id: LayoutModels.TEXT_RESOURCES_TAB_ID,
                                                component: "resources"
                                            }
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Languages",
                                                id: LayoutModels.LANGUAGES_TAB_ID,
                                                component: "languages"
                                            }
                                        ]
                                    },
                                    {
                                        type: "tabset",
                                        children: [
                                            {
                                                type: "tab",
                                                enableClose: false,
                                                name: "Statistics",
                                                id: LayoutModels.TEXTS_STATISTICS_TAB_ID,
                                                component: "statistics"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
                get: () => this.texts,
                set: action(model => (this.texts = model))
            }
        ];
    }

    load(layoutModels: any) {
        for (const model of this.models) {
            const savedModel = layoutModels && layoutModels[model.name];
            if (savedModel && savedModel.version == model.version) {
                model.set(FlexLayout.Model.fromJson(savedModel.json));
            } else {
                model.set(FlexLayout.Model.fromJson(model.json));
            }
        }

        this.projectStore.project.enableTabs();
    }

    save() {
        const layoutModels: any = {};

        for (const model of this.models) {
            try {
                layoutModels[model.name] = {
                    version: model.version,
                    json: model.get().toJson()
                };
            } catch (err) {
                console.log(model);
                console.error(err);
            }
        }

        return layoutModels;
    }

    selectTab(model: FlexLayout.Model, tabId: string) {
        const node = model.getNodeById(tabId);
        if (node) {
            const parentNode = node.getParent();
            let isSelected = false;

            if (parentNode instanceof FlexLayout.TabSetNode) {
                isSelected = parentNode.getSelectedNode() == node;
            } else if (parentNode instanceof FlexLayout.BorderNode) {
                isSelected = parentNode.getSelectedNode() == node;
            }

            if (!isSelected) {
                model.doAction(FlexLayout.Actions.selectTab(tabId));
            }
        }
    }

    unmount() {}
}
