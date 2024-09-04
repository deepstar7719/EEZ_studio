import React from "react";
import { observable, makeObservable, runInAction, computed, toJS } from "mobx";
import { observer } from "mobx-react";
import { MenuItem } from "@electron/remote";

import { Rect } from "eez-studio-shared/geometry";

import {
    PropertyType,
    makeDerivedClassInfo,
    IPropertyGridGroupDefinition,
    PropertyProps,
    findPropertyByNameInClassInfo,
    IEezObject,
    PropertyInfo,
    MessageType,
    getClassInfoLvglProperties,
    IMessage
} from "project-editor/core/object";

import {
    createObject,
    getAncestorOfType,
    getChildOfObject,
    getClassInfo,
    getObjectPathAsString,
    getProjectStore,
    Message,
    propertyNotFoundMessage
} from "project-editor/store";

import {
    getProject,
    ProjectType,
    findAction,
    findLvglStyle,
    Project
} from "project-editor/project/project";

import type {
    IFlowContext,
    IResizeHandler
} from "project-editor/flow/flow-interfaces";

import { AutoSize, Component, Widget } from "project-editor/flow/component";
import { isTimelineEditorActive } from "project-editor/flow/timeline";

import { getComponentName } from "project-editor/flow/components/components-registry";
import { ProjectContext } from "project-editor/project/context";
import { ProjectEditor } from "project-editor/project-editor-interface";
import type {
    ICustomWidgetCreateParams,
    Page
} from "project-editor/features/page/page";
import { ComponentsContainerEnclosure } from "project-editor/flow/editor/render";
import { geometryGroup } from "project-editor/ui-components/PropertyGrid/groups";
import { Property } from "project-editor/ui-components/PropertyGrid/Property";

import { LVGLStylesDefinition } from "project-editor/lvgl/style-definition";
import { LVGLStylesDefinitionProperty } from "project-editor/lvgl/LVGLStylesDefinitionProperty";
import { LVGLPageRuntime } from "project-editor/lvgl/page-runtime";
import type { LVGLBuild } from "project-editor/lvgl/build";
import {
    LVGLWidgetFlagsProperty,
    LVGLWidgetStatesProperty,
    getCode,
    getExpressionPropertyData,
    getFlowStateAddressIndex,
    getTabview,
    isGeometryControlledByTabview,
    lvglAddObjectFlowCallback
} from "project-editor/lvgl/widget-common";
import {
    LVGLPropertyType,
    makeLvglExpressionProperty
} from "project-editor/lvgl/expression-property";
import { LVGLStyle } from "project-editor/lvgl/style";
import { showGenericDialog } from "eez-studio-ui/generic-dialog";
import { validators } from "eez-studio-shared/validation";
import {
    getLvglCoordTypeShift,
    getLvglEvents,
    getLvglFlagCodes
} from "project-editor/lvgl/lvgl-versions";
import {
    LVGL_SCROLL_BAR_MODES,
    LVGL_SCROLL_DIRECTION,
    LVGL_FLAG_CODES,
    LVGL_STATE_CODES,
    LVGL_REACTIVE_STATES,
    LVGL_REACTIVE_FLAGS,
    LV_EVENT_CHECKED_STATE_CHANGED
} from "project-editor/lvgl/lvgl-constants";
import { LVGLPropertyInfo } from "project-editor/lvgl/style-catalog";

import { LVGLScreenWidget, LVGLTabWidget } from "./internal";

////////////////////////////////////////////////////////////////////////////////

const generalGroup: IPropertyGridGroupDefinition = {
    id: "lvgl-general",
    title: "General",
    position: 0
};

export const flagsGroup: IPropertyGridGroupDefinition = {
    id: "lvgl-flags",
    title: "Flags",
    position: 4
};

const styleGroup: IPropertyGridGroupDefinition = {
    id: "lvgl-style",
    title: "Style",
    position: 3
};

export const statesGroup: IPropertyGridGroupDefinition = {
    id: "lvgl-states",
    title: "States",
    position: 4
};

////////////////////////////////////////////////////////////////////////////////

function changes<T extends string>(defaults: T[], arr: T[]) {
    const added: T[] = [];
    const cleared: T[] = [];

    defaults = defaults.filter(x => x.trim() != "");
    arr = arr.filter(x => x.trim() != "");

    for (const x of arr) {
        if (defaults.indexOf(x) == -1) {
            added.push(x);
        }
    }

    for (const x of defaults) {
        if (arr.indexOf(x) == -1) {
            cleared.push(x);
        }
    }

    return {
        added,
        cleared
    };
}

////////////////////////////////////////////////////////////////////////////////

export const GeometryProperty = observer(
    class GeometryProperty extends React.Component<PropertyProps> {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        render() {
            const classInfo = getClassInfo(this.props.objects[0]);
            const unitPropertyInfo = findPropertyByNameInClassInfo(
                classInfo,
                this.props.propertyInfo.name + "Unit"
            ) as PropertyInfo;

            const readOnly =
                this.props.objects.find(
                    object =>
                        (object as any)[unitPropertyInfo.name] == "content"
                ) != undefined;

            return (
                <div className="EezStudio_LVGLGeometryProperty">
                    <Property
                        propertyInfo={Object.assign(
                            {},
                            this.props.propertyInfo,
                            {
                                propertyGridColumnComponent: undefined
                            }
                        )}
                        objects={this.props.objects}
                        readOnly={this.props.readOnly || readOnly}
                        updateObject={this.props.updateObject}
                    />

                    {unitPropertyInfo && (
                        <Property
                            propertyInfo={unitPropertyInfo}
                            objects={this.props.objects}
                            readOnly={this.props.readOnly}
                            updateObject={this.props.updateObject}
                        />
                    )}
                </div>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

function flagEnabledInWidget(
    component: Component,
    flag: keyof typeof LVGL_FLAG_CODES
) {
    const flags = Object.keys(
        getLvglFlagCodes(component)
    ) as (keyof typeof LVGL_FLAG_CODES)[];

    return component instanceof LVGLWidget && flags.indexOf(flag) != -1;
}

////////////////////////////////////////////////////////////////////////////////

export class LVGLWidget extends Widget {
    identifier: string;

    leftUnit: "px" | "%";
    topUnit: "px" | "%";
    widthUnit: "px" | "%" | "content";
    heightUnit: "px" | "%" | "content";

    children: LVGLWidget[];

    hiddenFlag: string | boolean;
    hiddenFlagType: LVGLPropertyType;
    clickableFlag: string | boolean;
    clickableFlagType: LVGLPropertyType;
    widgetFlags: string;
    flagScrollbarMode: string;
    flagScrollDirection: string;

    checkedState: string | boolean;
    checkedStateType: LVGLPropertyType;
    disabledState: string | boolean;
    disabledStateType: LVGLPropertyType;
    states: string;

    useStyle: string;
    _useStyleForStylePreview: string | undefined;
    localStyles: LVGLStylesDefinition;

    _lvglObj: number | undefined;
    _refreshRelativePosition: number = 0;

    _xScroll: number = 0;
    _yScroll: number = 0;
    _xScroll2: number = 0;
    _yScroll2: number = 0;

    static classInfo = makeDerivedClassInfo(Widget.classInfo, {
        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.LVGL,

        label: (widget: LVGLWidget) => {
            let name = getComponentName(widget.type);

            if (widget.identifier) {
                return `${name} [${widget.identifier}]`;
            }

            return name;
        },

        properties: [
            {
                name: "identifier",
                displayName: "Name",
                type: PropertyType.String,
                isOptional: true,
                propertyGridGroup: generalGroup,
                disabled: object => object instanceof LVGLScreenWidget // LVGLScreenWidget is using Page name as identifier
            },
            {
                name: "left",
                type: PropertyType.Number,
                propertyGridColumnComponent: GeometryProperty,
                propertyGridGroup: geometryGroup,
                readOnlyInPropertyGrid: isGeometryControlledByTabview,
                disabled: object => object instanceof LVGLScreenWidget // LVGLScreenWidget is using left from the Page
            },
            {
                name: "leftUnit",
                type: PropertyType.Enum,
                enumItems: [
                    { id: "px", label: "px" },
                    { id: "%", label: "%" }
                ],
                enumDisallowUndefined: true,
                propertyGridGroup: geometryGroup,
                hideInPropertyGrid: true,
                disabled: object => object instanceof LVGLScreenWidget
            },
            {
                name: "top",
                type: PropertyType.Number,
                propertyGridColumnComponent: GeometryProperty,
                propertyGridGroup: geometryGroup,
                readOnlyInPropertyGrid: isGeometryControlledByTabview,
                disabled: object => object instanceof LVGLScreenWidget // LVGLScreenWidget is using top from the Page
            },
            {
                name: "topUnit",
                type: PropertyType.Enum,
                enumItems: [
                    { id: "px", label: "px" },
                    { id: "%", label: "%" }
                ],
                enumDisallowUndefined: true,
                propertyGridGroup: geometryGroup,
                hideInPropertyGrid: true,
                disabled: object => object instanceof LVGLScreenWidget
            },
            {
                name: "width",
                type: PropertyType.Number,
                propertyGridColumnComponent: GeometryProperty,
                propertyGridGroup: geometryGroup,
                readOnlyInPropertyGrid: isGeometryControlledByTabview,
                disabled: object => object instanceof LVGLScreenWidget // LVGLScreenWidget is using width from the Page
            },
            {
                name: "widthUnit",
                type: PropertyType.Enum,
                enumItems: [
                    { id: "px", label: "px" },
                    { id: "%", label: "%" },
                    { id: "content", label: "content" }
                ],
                enumDisallowUndefined: true,
                propertyGridGroup: geometryGroup,
                hideInPropertyGrid: true,
                disabled: object => object instanceof LVGLScreenWidget
            },
            {
                name: "height",
                type: PropertyType.Number,
                propertyGridColumnComponent: GeometryProperty,
                propertyGridGroup: geometryGroup,
                readOnlyInPropertyGrid: isGeometryControlledByTabview,
                disabled: object => object instanceof LVGLScreenWidget // LVGLScreenWidget is using height from the Page
            },
            {
                name: "heightUnit",
                type: PropertyType.Enum,
                enumItems: [
                    { id: "px", label: "px" },
                    { id: "%", label: "%" },
                    { id: "content", label: "content" }
                ],
                enumDisallowUndefined: true,
                propertyGridGroup: geometryGroup,
                hideInPropertyGrid: true,
                disabled: object => object instanceof LVGLScreenWidget
            },
            {
                name: "absolutePosition",
                type: PropertyType.String,
                propertyGridGroup: geometryGroup,
                computed: true,
                //hideInPropertyGrid: true,
                disabled: object => object instanceof LVGLScreenWidget
            },
            {
                name: "children",
                type: PropertyType.Array,
                typeClass: LVGLWidget,
                hideInPropertyGrid: true
            },
            ...makeLvglExpressionProperty(
                "hiddenFlag",
                "boolean",
                "input",
                ["literal", "expression"],
                {
                    displayName: "Hidden",
                    propertyGridGroup: flagsGroup,
                    disabled: (widget: LVGLWidget) =>
                        !flagEnabledInWidget(widget, "HIDDEN")
                }
            ),
            ...makeLvglExpressionProperty(
                "clickableFlag",
                "boolean",
                "input",
                ["literal", "expression"],
                {
                    displayName: "Clickable",
                    propertyGridGroup: flagsGroup,
                    disabled: (widget: LVGLWidget) =>
                        !flagEnabledInWidget(widget, "CLICKABLE")
                }
            ),
            {
                name: "widgetFlags",
                type: PropertyType.String,
                propertyGridGroup: flagsGroup,
                propertyGridRowComponent: LVGLWidgetFlagsProperty,
                enumerable: false,
                hideInDocumentation: "all"
            },
            {
                name: "flagScrollbarMode",
                displayName: "Scrollbar mode",
                type: PropertyType.Enum,
                enumItems: [
                    {
                        id: "off",
                        label: "OFF"
                    },
                    {
                        id: "on",
                        label: "ON"
                    },
                    {
                        id: "active",
                        label: "ACTIVE"
                    },
                    {
                        id: "auto",
                        label: "AUTO"
                    }
                ],
                enumDisallowUndefined: false,
                propertyGridGroup: flagsGroup
            },
            {
                name: "flagScrollDirection",
                displayName: "Scroll direction",
                type: PropertyType.Enum,
                enumItems: [
                    {
                        id: "none",
                        label: "NONE"
                    },
                    {
                        id: "top",
                        label: "TOP"
                    },
                    {
                        id: "left",
                        label: "LEFT"
                    },
                    {
                        id: "bottom",
                        label: "BOTTOM"
                    },
                    {
                        id: "right",
                        label: "RIGHT"
                    },
                    {
                        id: "hor",
                        label: "HOR"
                    },
                    {
                        id: "ver",
                        label: "VER"
                    },
                    {
                        id: "all",
                        label: "ALL"
                    }
                ],
                enumDisallowUndefined: false,
                propertyGridGroup: flagsGroup
            },
            ...makeLvglExpressionProperty(
                "checkedState",
                "boolean",
                "assignable",
                ["literal", "expression"],
                {
                    displayName: "Checked",
                    propertyGridGroup: statesGroup
                }
            ),
            ...makeLvglExpressionProperty(
                "disabledState",
                "boolean",
                "input",
                ["literal", "expression"],
                {
                    displayName: "Disabled",
                    propertyGridGroup: statesGroup
                }
            ),
            {
                name: "states",
                type: PropertyType.String,
                propertyGridGroup: statesGroup,
                propertyGridRowComponent: LVGLWidgetStatesProperty,
                enumerable: false
            },
            {
                name: "useStyle",
                type: PropertyType.ObjectReference,
                referencedObjectCollectionPath: "allLvglStyles",
                filterReferencedObjectCollection: (
                    objects: IEezObject[],
                    lvglStyle: LVGLStyle
                ) =>
                    objects.length == 1 &&
                    objects[0] instanceof LVGLWidget &&
                    lvglStyle.forWidgetType == objects[0].type &&
                    ProjectEditor.getProject(lvglStyle).lvglStyles
                        .defaultStyles[lvglStyle.forWidgetType] !=
                        lvglStyle.name,
                propertyGridGroup: styleGroup,
                inputPlaceholder: (widget: LVGLWidget) => {
                    return (
                        ProjectEditor.getProject(widget).lvglStyles
                            .defaultStyles[widget.type] ?? undefined
                    );
                },
                propertyMenu: (props: PropertyProps): Electron.MenuItem[] => {
                    let menuItems: Electron.MenuItem[] = [];

                    if (props.objects.length === 1) {
                        const widget = props.objects[0] as LVGLWidget;

                        if (widget.localStyles.hasModifications) {
                            menuItems.push(
                                new MenuItem({
                                    label: "Reset All Modifications",
                                    click: () => {
                                        widget.localStyles.resetAllModifications();
                                    }
                                })
                            );

                            menuItems.push(
                                new MenuItem({
                                    label: "Create New Style",
                                    click: async () => {
                                        const projectStore =
                                            getProjectStore(widget);

                                        const result = await showGenericDialog({
                                            dialogDefinition: {
                                                title: "New Style",
                                                fields: [
                                                    {
                                                        name: "name",
                                                        type: "string",
                                                        validators: [
                                                            validators.required,
                                                            validators.unique(
                                                                {},
                                                                projectStore
                                                                    .project
                                                                    .lvglStyles
                                                                    .allStyles
                                                            )
                                                        ]
                                                    }
                                                ]
                                            },
                                            values: {}
                                        });

                                        projectStore.undoManager.setCombineCommands(
                                            true
                                        );

                                        let styleParent =
                                            projectStore.project.lvglStyles
                                                .styles;

                                        if (widget.useStyle) {
                                            const lvglStyle = findLvglStyle(
                                                projectStore.project,
                                                widget.useStyle
                                            );

                                            if (
                                                lvglStyle &&
                                                lvglStyle.forWidgetType ==
                                                    widget.type
                                            ) {
                                                styleParent =
                                                    lvglStyle.childStyles;
                                            }
                                        }

                                        projectStore.addObject(
                                            styleParent,
                                            createObject<LVGLStyle>(
                                                projectStore,
                                                {
                                                    name: result.values.name,
                                                    forWidgetType: widget.type,
                                                    definition:
                                                        createObject<LVGLStylesDefinition>(
                                                            projectStore,
                                                            {
                                                                definition:
                                                                    toJS(
                                                                        widget
                                                                            .localStyles
                                                                            .definition
                                                                    )
                                                            },
                                                            LVGLStylesDefinition
                                                        )
                                                },
                                                LVGLStyle
                                            )
                                        );

                                        projectStore.updateObject(widget, {
                                            useStyle: result.values.name
                                        });

                                        projectStore.updateObject(
                                            widget.localStyles,
                                            {
                                                definition: undefined
                                            }
                                        );

                                        projectStore.undoManager.setCombineCommands(
                                            false
                                        );
                                    }
                                })
                            );

                            if (widget.useStyle) {
                                menuItems.push(
                                    new MenuItem({
                                        label: "Update Style",
                                        click: async () => {
                                            const projectStore =
                                                getProjectStore(widget);

                                            const lvglStyle = findLvglStyle(
                                                projectStore.project,
                                                widget.useStyle
                                            );

                                            if (lvglStyle) {
                                                projectStore.undoManager.setCombineCommands(
                                                    true
                                                );

                                                projectStore.updateObject(
                                                    lvglStyle.definition,
                                                    {
                                                        definition:
                                                            LVGLStylesDefinition.combineDefinitions(
                                                                lvglStyle
                                                                    .definition
                                                                    .definition,
                                                                widget
                                                                    .localStyles
                                                                    .definition
                                                            )
                                                    }
                                                );

                                                projectStore.updateObject(
                                                    widget.localStyles,
                                                    {
                                                        definition: undefined
                                                    }
                                                );

                                                projectStore.undoManager.setCombineCommands(
                                                    false
                                                );
                                            }
                                        }
                                    })
                                );
                            }
                        }
                    }

                    return menuItems;
                }
            },
            {
                name: "localStyles",
                type: PropertyType.Object,
                typeClass: LVGLStylesDefinition,
                propertyGridGroup: styleGroup,
                propertyGridCollapsable: true,
                propertyGridRowComponent: LVGLStylesDefinitionProperty,
                enumerable: false
            }
        ],

        beforeLoadHook: (
            widget: LVGLWidget,
            jsWidget: Partial<LVGLWidget>,
            project: Project
        ) => {
            // MIGRATION TO LOW RES
            if ((window as any).__eezProjectMigration) {
                jsWidget.left = Math.floor(
                    (jsWidget.left! *
                        __eezProjectMigration.displayTargetWidth) /
                        __eezProjectMigration.displaySourceWidth
                );
                jsWidget.top = Math.floor(
                    (jsWidget.top! *
                        __eezProjectMigration.displayTargetHeight) /
                        __eezProjectMigration.displaySourceHeight
                );
                jsWidget.width = Math.floor(
                    (jsWidget.width! *
                        __eezProjectMigration.displayTargetWidth) /
                        __eezProjectMigration.displaySourceWidth
                );
                jsWidget.height = Math.floor(
                    (jsWidget.height! *
                        __eezProjectMigration.displayTargetHeight) /
                        __eezProjectMigration.displaySourceHeight
                );
            }

            if (jsWidget.leftUnit == undefined) {
                jsWidget.leftUnit = "px";
            }
            if (jsWidget.topUnit == undefined) {
                jsWidget.topUnit = "px";
            }
            if (jsWidget.widthUnit == undefined) {
                jsWidget.widthUnit = "px";
            }
            if (jsWidget.heightUnit == undefined) {
                jsWidget.heightUnit = "px";
            }

            // migrate states
            if ((jsWidget as any).states != undefined) {
                const states = (jsWidget as any).states.split(
                    "|"
                ) as (keyof typeof LVGL_STATE_CODES)[];

                states.forEach(state => {
                    if (LVGL_REACTIVE_STATES.indexOf(state) != -1) {
                        const propName = state.toLowerCase() + "State";
                        (jsWidget as any)[propName] = true;
                        (jsWidget as any)[propName + "Type"] = "literal";
                    }
                });

                (jsWidget as any).states = states
                    .filter(state => LVGL_REACTIVE_STATES.indexOf(state) == -1)
                    .join("|");
            } else {
                (jsWidget as any).states = "";
            }

            LVGL_REACTIVE_STATES.forEach(state => {
                const propName = state.toLowerCase() + "State";
                if ((jsWidget as any)[propName + "Type"] == undefined) {
                    (jsWidget as any)[propName + "Type"] = "literal";
                }
            });

            // migrate flags
            if ((jsWidget as any).flags != undefined) {
                const flags = (jsWidget as any).flags.split(
                    "|"
                ) as (keyof typeof LVGL_FLAG_CODES)[];

                flags.forEach(flag => {
                    if (LVGL_REACTIVE_FLAGS.indexOf(flag) != -1) {
                        const propName = flag.toLowerCase() + "Flag";
                        (jsWidget as any)[propName] = true;
                        (jsWidget as any)[propName + "Type"] = "literal";
                    }
                });

                (jsWidget as any).flags = flags
                    .filter(flag => LVGL_REACTIVE_FLAGS.indexOf(flag) == -1)
                    .join("|");

                const classInfo = getClassInfo(widget);

                let lvgl;
                if (typeof classInfo.lvgl == "function") {
                    lvgl = classInfo.lvgl(widget, project);
                } else {
                    lvgl = classInfo.lvgl!;
                }

                if (lvgl.oldInitFlags && lvgl.oldDefaultFlags) {
                    if ((jsWidget as any).flags == lvgl.oldInitFlags) {
                        (jsWidget as any).flags = lvgl.defaultFlags;
                        //console.log("migrate flags", jsWidget.type);
                        //console.log("\tOld flags unchanged");
                    } else {
                        //const beforeFlags = (jsWidget as any).flags;

                        const defaultFlagsArr = lvgl.defaultFlags.split("|");
                        const oldDefaultFlagsArr =
                            lvgl.oldDefaultFlags.split("|");

                        const i = oldDefaultFlagsArr.indexOf("SCROLL_CHAIN");
                        if (i != -1) {
                            oldDefaultFlagsArr.splice(i, 1);
                            oldDefaultFlagsArr.push("SCROLL_CHAIN_HOR");
                            oldDefaultFlagsArr.push("SCROLL_CHAIN_VER");
                        }

                        for (const flag of defaultFlagsArr) {
                            if (
                                flag != "CLICKABLE" &&
                                oldDefaultFlagsArr.indexOf(flag) == -1
                            ) {
                                if (!(jsWidget as any).flags) {
                                    (jsWidget as any).flags = flag;
                                } else {
                                    if (
                                        (jsWidget as any).flags.indexOf(flag) ==
                                        -1
                                    ) {
                                        (jsWidget as any).flags += "|" + flag;
                                    }
                                }
                            }
                        }

                        //const afterFlags = (jsWidget as any).flags;

                        // if (beforeFlags != afterFlags) {
                        //     console.log("migrate flags", jsWidget.type);
                        //     console.log("\tBefore:" + beforeFlags);
                        //     console.log("\tAfter :" + afterFlags);
                        // }
                    }
                }

                (jsWidget as any).widgetFlags = (jsWidget as any).flags;
                delete (jsWidget as any).flags;
            } else if ((jsWidget as any).widgetFlags == undefined) {
                (jsWidget as any).widgetFlags = "";
            }

            LVGL_REACTIVE_FLAGS.forEach(flag => {
                const propName = flag.toLowerCase() + "Flag";
                if ((jsWidget as any)[propName + "Type"] == undefined) {
                    (jsWidget as any)[propName + "Type"] = "literal";
                }
            });
        },

        defaultValue: {
            left: 0,
            top: 0,
            width: 100,
            height: 32,
            leftUnit: "px",
            topUnit: "px",
            widthUnit: "px",
            heightUnit: "px",
            flagScrollbarMode: "",
            flagScrollDirection: "",
            hiddenFlagType: "literal",
            clickableFlagType: "literal",
            checkedStateType: "literal",
            disabledStateType: "literal"
        },

        setRect: (widget: LVGLWidget, value: Partial<Rect>) => {
            const projectStore = getProjectStore(widget);

            const props: Partial<Rect> = {};

            const { left, top } = widget.fromRelativePosition(
                value.left ?? widget.rect.left,
                value.top ?? widget.rect.top
            );

            if (widget.leftUnit == "px" && left !== widget.left) {
                props.left = left;
            }

            if (widget.topUnit == "px" && top !== widget.top) {
                props.top = top;
            }

            const width = value.width ?? widget.rect.width;
            const height = value.height ?? widget.rect.height;

            if (
                widget.widthUnit == "px" &&
                !(widget.autoSize == "width" || widget.autoSize == "both")
            ) {
                if (width !== widget.width) {
                    props.width = width;
                }
            }

            if (
                widget.heightUnit == "px" &&
                !(widget.autoSize == "height" || widget.autoSize == "both")
            ) {
                if (height !== widget.height) {
                    props.height = height;
                }
            }

            projectStore.updateObject(widget, props);
        },

        check: (widget: LVGLWidget, messages: IMessage[]) => {
            const projectStore = getProjectStore(widget);

            if (widget.identifier) {
                const lvglIdentifier =
                    projectStore.lvglIdentifiers.getIdentifier(widget);

                if (lvglIdentifier.duplicate) {
                    messages.push(
                        new Message(
                            MessageType.ERROR,
                            `Duplicate identifier`,
                            getChildOfObject(widget, "identifier")
                        )
                    );
                }
            }

            if (widget.useStyle) {
                const lvglStyle = findLvglStyle(
                    projectStore.project,
                    widget.useStyle
                );
                if (!lvglStyle) {
                    messages.push(propertyNotFoundMessage(widget, "useStyle"));
                } else if (widget.type != lvglStyle.forWidgetType) {
                    messages.push(
                        new Message(
                            MessageType.ERROR,
                            `Style "${widget.useStyle}" is not for this widget type`,
                            getChildOfObject(widget, "useStyle")
                        )
                    );
                }
            }

            widget.localStyles.check(messages);
        },

        showTreeCollapseIcon: "has-children",

        widgetEvents: (widget: LVGLWidget) => getLvglEvents(widget)
    });

    constructor() {
        super();

        makeObservable(this, {
            allStates: computed,
            relativePosition: computed,
            componentWidth: computed,
            componentHeight: computed,
            isAccessibleFromSourceCode: computed
        });
    }

    override makeEditable() {
        super.makeEditable();

        makeObservable(this, {
            identifier: observable,
            leftUnit: observable,
            topUnit: observable,
            widthUnit: observable,
            heightUnit: observable,
            children: observable,
            widgetFlags: observable,
            hiddenFlag: observable,
            hiddenFlagType: observable,
            clickableFlag: observable,
            clickableFlagType: observable,
            flagScrollbarMode: observable,
            flagScrollDirection: observable,
            checkedState: observable,
            checkedStateType: observable,
            disabledState: observable,
            disabledStateType: observable,
            states: observable,
            useStyle: observable,
            localStyles: observable,
            _lvglObj: observable,
            _refreshRelativePosition: observable,
            _xScroll: observable,
            _yScroll: observable
        });
    }

    get rect(): Rect {
        return {
            left: this.relativePosition.left,
            top: this.relativePosition.top,
            width: this.componentWidth,
            height: this.componentHeight
        };
    }

    _relativePosition: { left: number; top: number } | undefined;

    override get relativePosition() {
        this._refreshRelativePosition;

        if (this._lvglObj) {
            const page = getAncestorOfType(
                this,
                ProjectEditor.PageClass.classInfo
            ) as Page;
            if (page._lvglRuntime && page._lvglRuntime.isMounted) {
                this._relativePosition = {
                    left: page._lvglRuntime.wasm._lvglGetObjRelX(this._lvglObj),
                    top: page._lvglRuntime.wasm._lvglGetObjRelY(this._lvglObj)
                };
            }
        }

        return this._relativePosition || super.relativePosition;
    }

    override fromRelativePosition(left: number, top: number) {
        if (this._lvglObj) {
            const page = getAncestorOfType(
                this,
                ProjectEditor.PageClass.classInfo
            ) as Page;
            if (page._lvglRuntime && page._lvglRuntime.isMounted) {
                return {
                    left: Math.round(
                        left - this.relativePosition.left + this.left
                    ),
                    top: Math.round(top - this.relativePosition.top + this.top)
                };
            }
        }

        return { left, top };
    }

    override get autoSize(): AutoSize {
        if (this.widthUnit == "content" && this.heightUnit == "content") {
            return "both";
        }
        if (this.widthUnit == "content") {
            return "width";
        }
        if (this.heightUnit == "content") {
            return "height";
        }
        return "none";
    }

    override get componentWidth() {
        if (this._lvglObj) {
            const page = getAncestorOfType(
                this,
                ProjectEditor.PageClass.classInfo
            ) as Page;
            if (page._lvglRuntime && page._lvglRuntime.isMounted) {
                return page._lvglRuntime.wasm._lvglGetObjWidth(this._lvglObj);
            }
        }
        return this.width ?? 0;
    }

    override get componentHeight() {
        if (this._lvglObj) {
            const page = getAncestorOfType(
                this,
                ProjectEditor.PageClass.classInfo
            ) as Page;
            if (page._lvglRuntime && page._lvglRuntime.isMounted) {
                return page._lvglRuntime.wasm._lvglGetObjHeight(this._lvglObj);
            }
        }
        return this.height ?? 0;
    }

    override getResizeHandlers(): IResizeHandler[] | undefined | false {
        if (isTimelineEditorActive(this)) {
            return [];
        }

        if (this.widthUnit != "px" && this.heightUnit != "px") {
            return [];
        }

        if (this.widthUnit != "px") {
            return [
                {
                    x: 50,
                    y: 0,
                    type: "n-resize"
                },
                {
                    x: 50,
                    y: 100,
                    type: "s-resize"
                }
            ];
        }

        if (this.heightUnit != "px") {
            return [
                {
                    x: 0,
                    y: 50,
                    type: "w-resize"
                },
                {
                    x: 100,
                    y: 50,
                    type: "e-resize"
                }
            ];
        }

        return super.getResizeHandlers();
    }

    get allStates() {
        const states = this.states.split(
            "|"
        ) as (keyof typeof LVGL_STATE_CODES)[];

        LVGL_REACTIVE_STATES.forEach(state => {
            const propName = state.toLowerCase() + "State";

            if ((this as any)[propName + "Type"] == "literal") {
                if ((this as any)[propName]) {
                    if (states.indexOf(state) == -1) {
                        states.push(state);
                    }
                }
            }
        });

        return states.filter(state => state.trim() != "").join("|");
    }

    get allFlags() {
        const flags =
            this.widgetFlags.trim() != ""
                ? (this.widgetFlags.split(
                      "|"
                  ) as (keyof typeof LVGL_FLAG_CODES)[])
                : [];

        LVGL_REACTIVE_FLAGS.forEach(flag => {
            const propName = flag.toLowerCase() + "Flag";

            if ((this as any)[propName + "Type"] == "literal") {
                if ((this as any)[propName]) {
                    if (flags.indexOf(flag) == -1) {
                        flags.push(flag);
                    }
                }
            } else {
                const lvglClassInfoProperties =
                    getClassInfoLvglProperties(this);
                if (
                    flag in
                    (lvglClassInfoProperties.defaultFlags ?? "").split("|")
                ) {
                    if (flags.indexOf(flag) == -1) {
                        flags.push(flag);
                    }
                }
            }
        });

        return flags.join("|");
    }

    get styleTemplate() {
        if (this._useStyleForStylePreview) {
            return undefined;
        }
        if (this.useStyle) {
            return this.useStyle;
        }
        return ProjectEditor.getProject(this).lvglStyles.defaultStyles[
            this.type
        ];
    }

    override lvglCreate(
        runtime: LVGLPageRuntime,
        parentObj: number,
        customWidget?: ICustomWidgetCreateParams
    ) {
        const obj = this.lvglCreateObj(runtime, parentObj, customWidget);

        runInAction(() => (this._lvglObj = obj));

        const project = ProjectEditor.getProject(this);

        if (runtime.wasm.assetsMap) {
            const page = getAncestorOfType(
                this,
                ProjectEditor.PageClass.classInfo
            ) as Page;
            const pagePath = getObjectPathAsString(page);

            const flowIndex = runtime.wasm.assetsMap.flowIndexes[pagePath];
            if (flowIndex != undefined) {
                const flow = runtime.wasm.assetsMap.flows[flowIndex];

                for (const eventHandler of this.eventHandlers) {
                    if (eventHandler.handlerType == "flow") {
                        const componentPath = getObjectPathAsString(this);
                        const componentIndex =
                            flow.componentIndexes[componentPath];
                        if (componentIndex != undefined) {
                            const component = flow.components[componentIndex];
                            const outputIndex =
                                component.outputIndexes[eventHandler.eventName];
                            if (outputIndex != undefined) {
                                lvglAddObjectFlowCallback(
                                    runtime,
                                    obj,
                                    eventHandler.eventCode,
                                    componentIndex,
                                    outputIndex,
                                    eventHandler.userData
                                );
                            }
                        }
                    } else if (eventHandler.action) {
                        const action = findAction(project, eventHandler.action);
                        if (action) {
                            const actionPath = getObjectPathAsString(action);
                            const actionFlowIndex =
                                runtime.wasm.assetsMap.flowIndexes[actionPath];
                            lvglAddObjectFlowCallback(
                                runtime,
                                obj,
                                eventHandler.eventCode,
                                -1,
                                actionFlowIndex,
                                eventHandler.userData
                            );
                        }
                    }
                }

                if (this.hasEventHandler) {
                    this.createEventHandler(runtime, obj);
                }
            }
        }

        const lvglClassInfoProperties = getClassInfoLvglProperties(this);

        // add/clear flags
        {
            const { added, cleared } = changes(
                lvglClassInfoProperties.defaultFlags.trim() != ""
                    ? lvglClassInfoProperties.defaultFlags.split("|")
                    : [],
                this.allFlags.trim() != ""
                    ? (this.allFlags.split(
                          "|"
                      ) as (keyof typeof LVGL_FLAG_CODES)[])
                    : []
            );

            if (added.length > 0) {
                runtime.wasm._lvglObjAddFlag(
                    obj,
                    getCode(added, getLvglFlagCodes(this))
                );
            }
            if (cleared.length > 0) {
                runtime.wasm._lvglObjClearFlag(
                    obj,
                    getCode(cleared, getLvglFlagCodes(this))
                );
            }

            const hiddenFlagExpr = getExpressionPropertyData(
                runtime,
                this,
                "hiddenFlag"
            );
            if (hiddenFlagExpr) {
                runtime.wasm._lvglUpdateHiddenFlag(
                    obj,
                    getFlowStateAddressIndex(runtime),
                    hiddenFlagExpr.componentIndex,
                    hiddenFlagExpr.propertyIndex
                );
            }

            const clickableFlagExpr = getExpressionPropertyData(
                runtime,
                this,
                "clickableFlag"
            );
            if (clickableFlagExpr) {
                runtime.wasm._lvglUpdateClickableFlag(
                    obj,
                    getFlowStateAddressIndex(runtime),
                    clickableFlagExpr.componentIndex,
                    clickableFlagExpr.propertyIndex
                );
            }

            if (this.hiddenInEditor && runtime.isEditor) {
                runtime.wasm._lvglObjAddFlag(
                    obj,
                    getCode(["HIDDEN"], getLvglFlagCodes(this))
                );
            }
        }

        if (this.flagScrollbarMode) {
            runtime.wasm._lvglSetScrollBarMode(
                obj,
                LVGL_SCROLL_BAR_MODES[this.flagScrollbarMode]
            );
        }

        if (this.flagScrollDirection) {
            runtime.wasm._lvglSetScrollDir(
                obj,
                LVGL_SCROLL_DIRECTION[this.flagScrollDirection]
            );
        }

        // add/clear states
        {
            const added =
                this.allStates.trim() != ""
                    ? (this.allStates.split(
                          "|"
                      ) as (keyof typeof LVGL_STATE_CODES)[])
                    : [];

            if (added.length > 0) {
                runtime.wasm._lvglObjAddState(
                    obj,
                    getCode(added, LVGL_STATE_CODES)
                );
            }

            const checkedStateExpr = getExpressionPropertyData(
                runtime,
                this,
                "checkedState"
            );
            if (checkedStateExpr) {
                runtime.wasm._lvglUpdateCheckedState(
                    obj,
                    getFlowStateAddressIndex(runtime),
                    checkedStateExpr.componentIndex,
                    checkedStateExpr.propertyIndex
                );
            }

            const disabledStateExpr = getExpressionPropertyData(
                runtime,
                this,
                "disabledState"
            );
            if (disabledStateExpr) {
                runtime.wasm._lvglUpdateDisabledState(
                    obj,
                    getFlowStateAddressIndex(runtime),
                    disabledStateExpr.componentIndex,
                    disabledStateExpr.propertyIndex
                );
            }
        }

        for (const keyframe of this.timeline) {
            keyframe.lvglCreate(
                runtime,
                obj,
                runtime.lvglCreateContext.flowState
            );
        }

        if (obj) {
            const useStyle = this.styleTemplate;
            if (useStyle) {
                const lvglStyle = findLvglStyle(project, useStyle);
                if (lvglStyle) {
                    lvglStyle.lvglAddStyleToObject(runtime, obj);
                }
            }

            if (this._useStyleForStylePreview) {
                const lvglStyle = findLvglStyle(
                    project,
                    this._useStyleForStylePreview
                );
                if (lvglStyle) {
                    lvglStyle.lvglCreateLocalStyles(runtime, this, obj);
                }
            }

            this.localStyles.lvglCreate(runtime, this, obj);

            this.children.map((widget: LVGLWidget) =>
                widget.lvglCreate(runtime, obj)
            );
        }

        if (runtime.isEditor) {
            runtime.wasm._lvglScrollTo(
                obj,
                this._xScroll,
                this._yScroll,
                false
            );

            this._xScroll2 = runtime.wasm._lvglGetScrollX(obj);
            this._yScroll2 = runtime.wasm._lvglGetScrollY(obj);
        }

        return obj;
    }

    lvglCreateObj(
        runtime: LVGLPageRuntime,
        parentObj: number,
        customWidget?: ICustomWidgetCreateParams
    ): number {
        console.error("UNEXPECTED!");
        return 0;
    }

    createEventHandler(runtime: LVGLPageRuntime, obj: number) {
        const checkedStateExpr = getExpressionPropertyData(
            runtime,
            this,
            "checkedState"
        );
        if (checkedStateExpr) {
            lvglAddObjectFlowCallback(
                runtime,
                obj,
                LV_EVENT_CHECKED_STATE_CHANGED,
                checkedStateExpr.componentIndex,
                checkedStateExpr.propertyIndex,
                0
            );
        }

        this.createEventHandlerSpecific(runtime, obj);
    }

    createEventHandlerSpecific(runtime: LVGLPageRuntime, obj: number) {}

    get isAccessibleFromSourceCode() {
        if (this.identifier) {
            return true;
        }

        if (
            getProject(this).projectTypeTraits.hasFlowSupport &&
            this.timeline.length > 0
        ) {
            return true;
        }

        if (this.eventHandlers.length > 0 || this.hasEventHandler) {
            return true;
        }

        if (
            this.checkedStateType == "expression" ||
            this.disabledStateType == "expression" ||
            this.hiddenFlagType == "expression" ||
            this.clickableFlagType == "expression"
        ) {
            return true;
        }

        return this.getIsAccessibleFromSourceCode();
    }

    getIsAccessibleFromSourceCode() {
        return false;
    }

    lvglBuild(build: LVGLBuild): void {
        if (this.identifier) {
            build.line(`// ${this.identifier}`);
        }

        this.lvglBuildObj(build);

        if (this.isAccessibleFromSourceCode) {
            build.line(`${build.getLvglObjectAccessor(this)} = obj;`);
        }

        if (this instanceof LVGLScreenWidget) {
            const page = getAncestorOfType(
                this,
                ProjectEditor.PageClass.classInfo
            ) as Page;

            build.line(`lv_obj_set_pos(obj, ${page.left}, ${page.top});`);
            build.line(`lv_obj_set_size(obj, ${page.width}, ${page.height});`);
        } else if (this instanceof LVGLTabWidget || getTabview(this)) {
            // skip
        } else {
            build.line(
                `lv_obj_set_pos(obj, ${this.lvglBuildLeft}, ${this.lvglBuildTop});`
            );
            build.line(
                `lv_obj_set_size(obj, ${this.lvglBuildWidth}, ${this.lvglBuildHeight});`
            );
        }

        this.lvglBuildSpecific(build);

        if (build.assets.projectStore.projectTypeTraits.hasFlowSupport) {
            if (this.eventHandlers.length > 0 || this.hasEventHandler) {
                build.line(
                    `lv_obj_add_event_cb(obj, ${build.getEventHandlerCallbackName(
                        this
                    )}, LV_EVENT_ALL, flowState);`
                );
            }
        } else {
            for (const eventHandler of this.eventHandlers) {
                if (eventHandler.eventName == "CHECKED") {
                    build.line(
                        `lv_obj_add_event_cb(obj, ${build.getCheckedEventHandlerCallbackName(
                            this
                        )}, LV_EVENT_VALUE_CHANGED, (void *)${
                            eventHandler.userData
                        });`
                    );
                } else if (eventHandler.eventName == "UNCHECKED") {
                    build.line(
                        `lv_obj_add_event_cb(obj, ${build.getUncheckedEventHandlerCallbackName(
                            this
                        )}, LV_EVENT_VALUE_CHANGED, (void *)${
                            eventHandler.userData
                        });`
                    );
                } else {
                    build.line(
                        `lv_obj_add_event_cb(obj, ${build.getActionFunctionName(
                            eventHandler.action
                        )}, LV_EVENT_${eventHandler.eventName}, (void *)${
                            eventHandler.userData
                        });`
                    );
                }
            }

            if (this.hasEventHandler) {
                build.line(
                    `lv_obj_add_event_cb(obj, ${build.getEventHandlerCallbackName(
                        this
                    )}, LV_EVENT_ALL, 0);`
                );
            }
        }

        const lvglClassInfoProperties = getClassInfoLvglProperties(this);

        // add/clear flags
        {
            const { added, cleared } = changes(
                lvglClassInfoProperties.defaultFlags.trim() != ""
                    ? lvglClassInfoProperties.defaultFlags.split("|")
                    : [],
                this.allFlags.trim() != ""
                    ? (this.allFlags.split(
                          "|"
                      ) as (keyof typeof LVGL_FLAG_CODES)[])
                    : []
            );

            if (added.length > 0) {
                build.line(
                    `lv_obj_add_flag(obj, ${added
                        .map(flag => "LV_OBJ_FLAG_" + flag)
                        .join("|")});`
                );
            }

            if (cleared.length > 0) {
                build.line(
                    `lv_obj_clear_flag(obj, ${cleared
                        .map(flag => "LV_OBJ_FLAG_" + flag)
                        .join("|")});`
                );
            }
        }

        if (this.flagScrollbarMode) {
            build.line(
                `lv_obj_set_scrollbar_mode(obj, LV_SCROLLBAR_MODE_${this.flagScrollbarMode.toUpperCase()});`
            );
        }

        if (this.flagScrollDirection) {
            build.line(
                `lv_obj_set_scroll_dir(obj, LV_DIR_${this.flagScrollDirection.toUpperCase()});`
            );
        }

        // add/clear states
        {
            const added =
                this.allStates.trim() != ""
                    ? (this.allStates.split(
                          "|"
                      ) as (keyof typeof LVGL_STATE_CODES)[])
                    : [];

            if (added.length > 0) {
                build.line(
                    `lv_obj_add_state(obj, ${added
                        .map(state => "LV_STATE_" + state)
                        .join("|")});`
                );
            }
        }

        const useStyle = this.styleTemplate;
        if (useStyle) {
            const style = findLvglStyle(
                ProjectEditor.getProject(this),
                useStyle
            );
            if (style) {
                build.assets.markLvglStyleUsed(style);
                build.line(`${build.getAddStyleFunctionName(style)}(obj);`);
            }
        }
        this.localStyles.lvglBuild(build);

        if (this.children.length > 0) {
            build.line("{");
            build.indent();
            build.line("lv_obj_t *parent_obj = obj;");

            for (const widget of this.children) {
                build.line("{");
                build.indent();
                widget.lvglBuild(build);
                build.unindent();
                build.line("}");
            }

            build.unindent();
            build.line("}");
        }
    }

    lvglPostBuild(build: LVGLBuild): void {}

    lvglBuildTick(build: LVGLBuild): void {
        if (this.checkedStateType == "expression") {
            build.line(`{`);
            build.indent();

            if (build.assets.projectStore.projectTypeTraits.hasFlowSupport) {
                let componentIndex = build.assets.getComponentIndex(this);
                const propertyIndex = build.assets.getComponentPropertyIndex(
                    this,
                    "checkedState"
                );

                build.line(
                    `bool new_val = evalBooleanProperty(flowState, ${componentIndex}, ${propertyIndex}, "Failed to evaluate Checked state");`
                );
            } else {
                build.line(
                    `bool new_val = ${build.getVariableGetterFunctionName(
                        this.checkedState as string
                    )}();`
                );
            }

            const objectAccessor = build.getLvglObjectAccessor(this);

            build.line(
                `bool cur_val = lv_obj_has_state(${objectAccessor}, LV_STATE_CHECKED);`
            );

            build.line(`if (new_val != cur_val) {`);
            build.indent();
            build.line(`tick_value_change_obj = ${objectAccessor};`);
            build.line(
                `if (new_val) lv_obj_add_state(${objectAccessor}, LV_STATE_CHECKED);`
            );
            build.line(
                `else lv_obj_clear_state(${objectAccessor}, LV_STATE_CHECKED);`
            );
            build.line(`tick_value_change_obj = NULL;`);
            build.unindent();
            build.line(`}`);

            build.unindent();
            build.line(`}`);
        }

        if (this.disabledStateType == "expression") {
            build.line(`{`);
            build.indent();

            if (build.assets.projectStore.projectTypeTraits.hasFlowSupport) {
                let componentIndex = build.assets.getComponentIndex(this);
                const propertyIndex = build.assets.getComponentPropertyIndex(
                    this,
                    "disabledState"
                );

                build.line(
                    `bool new_val = evalBooleanProperty(flowState, ${componentIndex}, ${propertyIndex}, "Failed to evaluate Disabled state");`
                );
            } else {
                build.line(
                    `bool new_val = ${build.getVariableGetterFunctionName(
                        this.disabledState as string
                    )}();`
                );
            }
            const objectAccessor = build.getLvglObjectAccessor(this);

            build.line(
                `bool cur_val = lv_obj_has_state(${objectAccessor}, LV_STATE_DISABLED);`
            );

            build.line(`if (new_val != cur_val) {`);
            build.indent();
            build.line(`tick_value_change_obj = ${objectAccessor};`);
            build.line(
                `if (new_val) lv_obj_add_state(${objectAccessor}, LV_STATE_DISABLED);`
            );
            build.line(
                `else lv_obj_clear_state(${objectAccessor}, LV_STATE_DISABLED);`
            );
            build.line(`tick_value_change_obj = NULL;`);
            build.unindent();
            build.line(`}`);

            build.unindent();
            build.line(`}`);
        }

        if (this.hiddenFlagType == "expression") {
            build.line(`{`);
            build.indent();

            if (build.assets.projectStore.projectTypeTraits.hasFlowSupport) {
                let componentIndex = build.assets.getComponentIndex(this);
                const propertyIndex = build.assets.getComponentPropertyIndex(
                    this,
                    "hiddenFlag"
                );

                build.line(
                    `bool new_val = evalBooleanProperty(flowState, ${componentIndex}, ${propertyIndex}, "Failed to evaluate Hidden flag");`
                );
            } else {
                build.line(
                    `bool new_val = ${build.getVariableGetterFunctionName(
                        this.hiddenFlag as string
                    )}();`
                );
            }

            const objectAccessor = build.getLvglObjectAccessor(this);

            build.line(
                `bool cur_val = lv_obj_has_flag(${objectAccessor}, LV_OBJ_FLAG_HIDDEN);`
            );

            build.line(`if (new_val != cur_val) {`);
            build.indent();
            build.line(`tick_value_change_obj = ${objectAccessor};`);
            build.line(
                `if (new_val) lv_obj_add_flag(${objectAccessor}, LV_OBJ_FLAG_HIDDEN);`
            );
            build.line(
                `else lv_obj_clear_flag(${objectAccessor}, LV_OBJ_FLAG_HIDDEN);`
            );
            build.line(`tick_value_change_obj = NULL;`);
            build.unindent();
            build.line(`}`);

            build.unindent();
            build.line(`}`);
        }

        if (this.clickableFlagType == "expression") {
            build.line(`{`);
            build.indent();

            if (build.assets.projectStore.projectTypeTraits.hasFlowSupport) {
                let componentIndex = build.assets.getComponentIndex(this);
                const propertyIndex = build.assets.getComponentPropertyIndex(
                    this,
                    "clickableFlag"
                );

                build.line(
                    `bool new_val = evalBooleanProperty(flowState, ${componentIndex}, ${propertyIndex}, "Failed to evaluate Hidden flag");`
                );
            } else {
                build.line(
                    `bool new_val = ${build.getVariableGetterFunctionName(
                        this.clickableFlag as string
                    )}();`
                );
            }

            const objectAccessor = build.getLvglObjectAccessor(this);

            build.line(
                `bool cur_val = lv_obj_has_flag(${objectAccessor}, LV_OBJ_FLAG_CLICKABLE);`
            );

            build.line(`if (new_val != cur_val) {`);
            build.indent();
            build.line(`tick_value_change_obj = ${objectAccessor};`);
            build.line(
                `if (new_val) lv_obj_add_flag(${objectAccessor}, LV_OBJ_FLAG_CLICKABLE);`
            );
            build.line(
                `else lv_obj_clear_flag(${objectAccessor}, LV_OBJ_FLAG_CLICKABLE);`
            );
            build.line(`tick_value_change_obj = NULL;`);
            build.unindent();
            build.line(`}`);

            build.unindent();
            build.line(`}`);
        }

        this.lvglBuildTickSpecific(build);
        for (const widget of this.children) {
            widget.lvglBuildTick(build);
        }
    }

    lvglBuildTickSpecific(build: LVGLBuild): void {}

    getLvglCreateRect() {
        if (this instanceof LVGLScreenWidget) {
            const page = getAncestorOfType(
                this,
                ProjectEditor.PageClass.classInfo
            ) as Page;
            return page.rect;
        }

        const _LV_COORD_TYPE_SHIFT = getLvglCoordTypeShift(this);
        const _LV_COORD_TYPE_SPEC = 1 << _LV_COORD_TYPE_SHIFT;
        function LV_COORD_SET_SPEC(x: number) {
            return x | _LV_COORD_TYPE_SPEC;
        }

        function LV_PCT(x: number) {
            return x < 0 ? LV_COORD_SET_SPEC(1000 - x) : LV_COORD_SET_SPEC(x);
        }

        const LV_SIZE_CONTENT = LV_COORD_SET_SPEC(2001);

        let left;
        if (this.leftUnit == "%") {
            left = LV_PCT(this.left);
        } else {
            left = this.left;
        }

        let top;
        if (this.topUnit == "%") {
            top = LV_PCT(this.top);
        } else {
            top = this.top;
        }

        let width;
        if (this.widthUnit == "content") {
            width = LV_SIZE_CONTENT;
        } else if (this.widthUnit == "%") {
            width = LV_PCT(this.width);
        } else {
            width = this.width;
        }

        let height;
        if (this.heightUnit == "content") {
            height = LV_SIZE_CONTENT;
        } else if (this.heightUnit == "%") {
            height = LV_PCT(this.height);
        } else {
            height = this.height;
        }

        return { left, top, width, height };
    }

    get lvglBuildLeft() {
        if (this.leftUnit == "%") {
            return `LV_PCT(${this.left})`;
        }
        return this.left;
    }

    get lvglBuildTop() {
        if (this.topUnit == "%") {
            return `LV_PCT(${this.top})`;
        }
        return this.top;
    }

    get lvglBuildWidth() {
        if (this.widthUnit == "content") {
            return "LV_SIZE_CONTENT";
        } else if (this.widthUnit == "%") {
            return `LV_PCT(${this.width})`;
        }
        return this.width;
    }

    get lvglBuildHeight() {
        if (this.heightUnit == "content") {
            return "LV_SIZE_CONTENT";
        } else if (this.heightUnit == "%") {
            return `LV_PCT(${this.height})`;
        }
        return this.height;
    }

    lvglBuildObj(build: LVGLBuild): void {
        console.error("UNEXPECTED!");
    }

    lvglBuildSpecific(build: LVGLBuild): void {}

    get hasEventHandler() {
        return (
            this.checkedStateType == "expression" ||
            this.disabledStateType == "expression"
        );
    }

    buildEventHandler(build: LVGLBuild) {
        if (this.checkedStateType == "expression") {
            build.line("if (event == LV_EVENT_VALUE_CHANGED) {");
            build.indent();

            build.line(`lv_obj_t *ta = lv_event_get_target(e);`);

            build.line(`if (tick_value_change_obj != ta) {`);
            build.indent();

            build.line(`bool value = lv_obj_has_state(ta, LV_STATE_CHECKED);`);

            if (build.assets.projectStore.projectTypeTraits.hasFlowSupport) {
                let componentIndex = build.assets.getComponentIndex(this);
                const propertyIndex = build.assets.getComponentPropertyIndex(
                    this,
                    "checkedState"
                );

                build.line(
                    `assignBooleanProperty(flowState, ${componentIndex}, ${propertyIndex}, value, "Failed to assign Checked state");`
                );
            } else {
                build.line(
                    `${build.getVariableSetterFunctionName(
                        this.checkedState as string
                    )}(value);`
                );
            }

            build.unindent();
            build.line("}");

            build.unindent();
            build.line("}");
        }

        this.buildEventHandlerSpecific(build);
    }

    buildEventHandlerSpecific(build: LVGLBuild) {}

    buildStyleIfNotDefined(build: LVGLBuild, propertyInfo: LVGLPropertyInfo) {
        if (
            this.localStyles.getPropertyValue(
                propertyInfo,
                "MAIN",
                "DEFAULT"
            ) == undefined
        ) {
            build.line(
                `lv_obj_set_style_${build.getStylePropName(
                    propertyInfo.name
                )}(obj, 0, LV_PART_MAIN | LV_STATE_DEFAULT);`
            );
        }
    }

    override render(flowContext: IFlowContext, width: number, height: number) {
        return this._lvglObj ? (
            <>
                <ComponentsContainerEnclosure
                    parent={this}
                    components={this.children}
                    flowContext={flowContext}
                    width={width}
                    height={height}
                />
                {super.render(flowContext, width, height)}
            </>
        ) : null;
    }
}
