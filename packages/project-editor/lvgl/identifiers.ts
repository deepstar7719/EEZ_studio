import { makeObservable, computed } from "mobx";

import {
    ProjectStore,
    getAncestorOfType,
    getObjectFromStringPath,
    getObjectPathAsString
} from "project-editor/store";

import { ProjectEditor } from "project-editor/project-editor-interface";
import type { Flow } from "project-editor/flow/flow";
import { Page } from "project-editor/features/page/page";

import type { LVGLWidget } from "project-editor/lvgl/widgets";
import { NamingConvention, getName } from "project-editor/build/helper";

const GENERATED_NAME_PREFIX = "obj";

interface LVGLIdentifier {
    displayName: string;
    identifier: string;
    index: number;

    isAutoGenerated: boolean;
    duplicate: boolean;

    object: LVGLWidget | Page;

    userWidgetIdentifiers: Map<LVGLWidget | Page, LVGLIdentifier> | undefined;
}

export class LVGLIdentifiers {
    constructor(public store: ProjectStore) {
        makeObservable(this, {
            identifiersMap: computed,
            identifiersArray: computed,
            maxWidgetIndex: computed
        });
    }

    get pages() {
        const pages = [];

        for (const externalProject of this.store.openProjectsManager.projects) {
            pages.push(...externalProject.pages);
        }

        return pages;
    }

    get actions() {
        const actions = [];

        for (const externalProject of this.store.openProjectsManager.projects) {
            actions.push(...externalProject.actions);
        }

        return actions;
    }

    get identifiersMap(): Map<Flow, Map<LVGLWidget | Page, LVGLIdentifier>> {
        const map = new Map<Flow, Map<LVGLWidget | Page, LVGLIdentifier>>();

        let generatedNames = new Map<LVGLWidget, string>();

        function generateName(widget: LVGLWidget) {
            let name = generatedNames.get(widget);
            if (!name) {
                name = GENERATED_NAME_PREFIX + generatedNames.size;
                generatedNames.set(widget, name);
            }
            return name;
        }

        function cloneMap(
            map: Map<LVGLWidget | Page, LVGLIdentifier> | undefined
        ) {
            if (!map) {
                return undefined;
            }

            const newMap = new Map<LVGLWidget | Page, LVGLIdentifier>();

            map.forEach((identifier, widget) => {
                newMap.set(
                    widget,
                    Object.assign({}, identifier, {
                        userWidgetIdentifiers: cloneMap(
                            identifier.userWidgetIdentifiers
                        )
                    })
                );
            });

            return newMap;
        }

        function getUserWidgetIdentifiers(widget: LVGLWidget) {
            if (!(widget instanceof ProjectEditor.LVGLUserWidgetWidgetClass)) {
                return undefined;
            }
            if (!widget.userWidgetPage) {
                return undefined;
            }
            return cloneMap(getPageIdentifiers(widget.userWidgetPage));
        }

        function enumIdentifiers(
            page: Page,
            identifiers: Map<LVGLWidget | Page, LVGLIdentifier>
        ) {
            page._lvglWidgets
                .filter(
                    widget =>
                        (page.isUsedAsUserWidget ||
                            !(
                                (
                                    widget instanceof
                                    ProjectEditor.LVGLScreenWidgetClass
                                ) // LVGLScreenWidget is using Page name as identifier
                            )) &&
                        widget.isAccessibleFromSourceCode
                )
                .forEach(widget => {
                    identifiers.set(widget, {
                        displayName: widget.identifier,
                        identifier: widget.identifier
                            ? getName(
                                  "",
                                  widget.identifier,
                                  NamingConvention.UnderscoreLowerCase
                              )
                            : generateName(widget),
                        index: -1,

                        isAutoGenerated: !widget.identifier,
                        duplicate: false,

                        object: widget,
                        userWidgetIdentifiers: getUserWidgetIdentifiers(widget)
                    });
                });

            return identifiers;
        }

        function getPageIdentifiers(page: Page) {
            let identifiers = map.get(page);
            if (!identifiers) {
                identifiers = new Map<LVGLWidget | Page, LVGLIdentifier>();
                map.set(page, identifiers);
                enumIdentifiers(page, identifiers);
            }
            return identifiers;
        }

        function flattenMap(map: Map<LVGLWidget | Page, LVGLIdentifier>) {
            const flatMap = new Map<string, LVGLIdentifier>();

            function doFlatterMap(
                map: Map<LVGLWidget | Page, LVGLIdentifier>,
                prefix: string
            ) {
                map.forEach(identifier => {
                    identifier.identifier = prefix + identifier.identifier;

                    const foundIdentifier = flatMap.get(identifier.identifier);

                    if (foundIdentifier) {
                        foundIdentifier.duplicate = true;
                        identifier.duplicate = true;
                    } else {
                        flatMap.set(identifier.identifier, identifier);
                    }

                    if (identifier.userWidgetIdentifiers) {
                        doFlatterMap(
                            identifier.userWidgetIdentifiers,
                            identifier.identifier + "__"
                        );
                    }
                });
            }

            doFlatterMap(map, "");
        }

        function setIndexes(
            map: Map<LVGLWidget | Page, LVGLIdentifier>,
            startIndex: number
        ) {
            const identifiers = [...map.values()].filter(
                identifier => identifier.index == -1
            );

            identifiers.sort((a, b) =>
                a.identifier.localeCompare(b.identifier.toLowerCase())
            );

            let index = startIndex;
            identifiers.forEach(identifier => {
                identifier.index = index;
                index++;

                if (identifier.userWidgetIdentifiers) {
                    index +=
                        setIndexes(identifier.userWidgetIdentifiers, index) -
                        index;
                }
            });

            return index;
        }

        for (const page of this.pages) {
            getPageIdentifiers(page);
        }

        const globalMap = new Map<LVGLWidget | Page, LVGLIdentifier>();

        let pageIndex = 0;

        for (const page of this.pages) {
            if (!page.isUsedAsUserWidget) {
                globalMap.set(page, {
                    displayName: page.name,
                    identifier: getName(
                        "",
                        page.name,
                        NamingConvention.UnderscoreLowerCase
                    ),
                    index: pageIndex++,

                    isAutoGenerated: false,
                    duplicate: false,

                    object: page,
                    userWidgetIdentifiers: undefined
                });

                const identifiers = getPageIdentifiers(page);
                identifiers.forEach((identifier, widget) => {
                    globalMap.set(widget, identifier);
                });
                map.set(page, globalMap);
            }
        }

        flattenMap(globalMap);
        setIndexes(globalMap, pageIndex);

        for (const page of this.pages) {
            if (page.isUsedAsUserWidget) {
                const identifiers = getPageIdentifiers(page);
                flattenMap(identifiers);
                setIndexes(identifiers, 0);
            }
        }

        for (const action of this.actions) {
            map.set(action, globalMap);
        }

        return map;
    }

    get identifiersArray(): Map<Flow, LVGLIdentifier[]> {
        const map = new Map<Flow, LVGLIdentifier[]>();

        this.identifiersMap.forEach((identifiers, flow) => {
            const arr: LVGLIdentifier[] = [];

            function addIdentifiers(
                identifiers: Map<LVGLWidget | Page, LVGLIdentifier>
            ) {
                identifiers.forEach(identifier => {
                    arr[identifier.index] = identifier;
                    if (identifier.userWidgetIdentifiers) {
                        addIdentifiers(identifier.userWidgetIdentifiers);
                    }
                });
            }

            addIdentifiers(identifiers);

            map.set(flow, arr);
        });

        return map;
    }

    get maxWidgetIndex(): number {
        const page = this.pages.find(page => !page.isUsedAsUserWidget);

        if (!page) {
            return 0;
        }

        let maxIndex = 0;

        this.identifiersArray.get(page)?.forEach(identifier => {
            if (identifier.index > maxIndex) {
                maxIndex = identifier.index;
            }
        });

        return maxIndex;
    }

    getIdentifier(object: LVGLWidget | Page): LVGLIdentifier {
        if (object instanceof ProjectEditor.LVGLScreenWidgetClass) {
            // LVGLScreenWidget is using Page name as identifier
            const page = getAncestorOfType(
                object,
                ProjectEditor.PageClass.classInfo
            ) as Page;
            if (!page.isUsedAsUserWidget) {
                object = page;
            }
        }

        let flow = ProjectEditor.getFlow(object);
        let identifiers = this.identifiersMap.get(
            ProjectEditor.getFlow(object)
        );
        if (!identifiers) {
            // object is from the userWidgetPageCopy from LVGLUserWidgetWidget
            flow = getObjectFromStringPath(
                this.store.project,
                getObjectPathAsString(flow)
            ) as Flow;
            object = getObjectFromStringPath(
                this.store.project,
                getObjectPathAsString(object)
            ) as LVGLWidget;
        }
        return this.identifiersMap.get(flow)!.get(object)!;
    }

    getIdentifierByName(
        flow: Flow,
        displayName: string
    ): LVGLIdentifier | undefined {
        const name = getName(
            "",
            displayName,
            NamingConvention.UnderscoreLowerCase
        );
        let identifiers = this.identifiersMap.get(flow);

        if (!identifiers) {
            // object is from the userWidgetPageCopy from LVGLUserWidgetWidget
            const originalFlow = getObjectFromStringPath(
                this.store.project,
                getObjectPathAsString(flow)
            ) as Flow;

            identifiers = this.identifiersMap.get(originalFlow);
        }

        let foundIdentifier;

        function findIdentifier(
            identifiers: Map<LVGLWidget | Page, LVGLIdentifier>
        ) {
            identifiers.forEach(identifier => {
                if (identifier.identifier == name) {
                    foundIdentifier = identifier;
                }
                if (identifier.userWidgetIdentifiers) {
                    findIdentifier(identifier.userWidgetIdentifiers);
                }
            });
        }

        findIdentifier(identifiers!);

        return foundIdentifier;
    }

    getIdentifiersVisibleFromFlow(flow: Flow) {
        return this.identifiersArray.get(flow)!.filter(identifier => {
            return !identifier.isAutoGenerated;
        });
    }
}
