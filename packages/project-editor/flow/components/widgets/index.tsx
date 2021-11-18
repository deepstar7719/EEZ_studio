import React from "react";
import { observable, computed, runInAction, reaction } from "mobx";
import { observer } from "mobx-react";

import { _find, _range } from "eez-studio-shared/algorithm";
import { humanize } from "eez-studio-shared/string";

import {
    IEezObject,
    registerClass,
    PropertyType,
    makeDerivedClassInfo,
    generalGroup,
    specificGroup,
    IPropertyGridGroupDefinition,
    isAncestor,
    getParent,
    PropertyProps,
    MessageType,
    getId
} from "project-editor/core/object";
import {
    hideInPropertyGridIfDashboardOrApplet,
    hideInPropertyGridIfNotV1,
    loadObject,
    Message,
    objectToJS,
    propertyNotFoundMessage,
    propertyNotSetMessage,
    propertySetButNotUsedMessage
} from "project-editor/core/store";
import {
    getDocumentStore,
    IContextMenuContext
} from "project-editor/core/store";

import {
    checkObjectReference,
    getProject,
    ProjectType
} from "project-editor/project/project";

import type {
    IFlowContext,
    IDataContext
} from "project-editor/flow/flow-interfaces";
import {
    ComponentsContainerEnclosure,
    ComponentEnclosure,
    ComponentCanvas
} from "project-editor/flow/editor/render";

import { Page, findPage } from "project-editor/features/page/page";
import { findBitmap } from "project-editor/features/bitmap/bitmap";
import { Style } from "project-editor/features/style/style";
import { findVariable } from "project-editor/features/variable/variable";
import {
    FLOW_ITERATOR_INDEXES_VARIABLE,
    FLOW_ITERATOR_INDEX_VARIABLE
} from "project-editor/features/variable/defs";
import {
    getEnumTypeNameFromVariable,
    isEnumVariable
} from "project-editor/features/variable/value-type";
import {
    drawText,
    styleGetBorderRadius,
    styleIsHorzAlignLeft,
    styleIsHorzAlignRight,
    styleIsVertAlignTop,
    styleIsVertAlignBottom,
    styleGetFont,
    drawStr
} from "project-editor/flow/editor/draw";
import * as draw from "project-editor/flow/editor/draw";
import { Font } from "project-editor/features/font/font";

import { BootstrapButton } from "project-editor/components/BootstrapButton";

import {
    Widget,
    makeDataPropertyInfo,
    makeStylePropertyInfo,
    makeTextPropertyInfo,
    migrateStyleProperty,
    ComponentInput,
    ComponentOutput,
    makeExpressionProperty,
    makeActionPropertyInfo
} from "project-editor/flow/component";

import {
    EndActionComponent,
    InputActionComponent,
    OutputActionComponent,
    StartActionComponent
} from "project-editor/flow/components/actions";

import { FlowState } from "project-editor/flow/runtime";

import { Assets, DataBuffer } from "project-editor/features/page/build/assets";
import { buildWidget } from "project-editor/features/page/build/widgets";
import {
    WIDGET_TYPE_CONTAINER,
    WIDGET_TYPE_LIST,
    WIDGET_TYPE_GRID,
    WIDGET_TYPE_SELECT,
    WIDGET_TYPE_LAYOUT_VIEW,
    WIDGET_TYPE_DISPLAY_DATA,
    WIDGET_TYPE_TEXT,
    WIDGET_TYPE_MULTILINE_TEXT,
    WIDGET_TYPE_RECTANGLE,
    WIDGET_TYPE_BITMAP,
    WIDGET_TYPE_BUTTON,
    WIDGET_TYPE_TOGGLE_BUTTON,
    WIDGET_TYPE_BUTTON_GROUP,
    WIDGET_TYPE_BAR_GRAPH,
    WIDGET_TYPE_YT_GRAPH,
    WIDGET_TYPE_UP_DOWN,
    WIDGET_TYPE_LIST_GRAPH,
    WIDGET_TYPE_APP_VIEW,
    WIDGET_TYPE_SCROLL_BAR,
    WIDGET_TYPE_PROGRESS,
    WIDGET_TYPE_CANVAS,
    WIDGET_TYPE_GAUGE,
    WIDGET_TYPE_INPUT
} from "./widget_types";
import {
    evalConstantExpression,
    evalExpression,
    ExpressionEvalError
} from "project-editor/flow/expression/expression";
import { remap } from "eez-studio-shared/util";
import { roundNumber } from "eez-studio-shared/roundNumber";
import { ProjectEditor } from "project-editor/project-editor-interface";

const { MenuItem } = EEZStudio.remote || {};

const LIST_TYPE_VERTICAL = 1;
const LIST_TYPE_HORIZONTAL = 2;

const GRID_FLOW_ROW = 1;
const GRID_FLOW_COLUMN = 2;

const BAR_GRAPH_ORIENTATION_LEFT_RIGHT = 1;
const BAR_GRAPH_ORIENTATION_RIGHT_LEFT = 2;
const BAR_GRAPH_ORIENTATION_TOP_BOTTOM = 3;
const BAR_GRAPH_ORIENTATION_BOTTOM_TOP = 4;
const BAR_GRAPH_DO_NOT_DISPLAY_VALUE = 1 << 4;

function buildWidgetText(text: string | undefined, defaultValue: string = "") {
    if (!text) {
        return defaultValue;
    }
    try {
        return JSON.parse('"' + text + '"');
    } catch (e) {}

    return text;
}

////////////////////////////////////////////////////////////////////////////////

export class EmbeddedWidget extends Widget {
    @observable style: Style;

    static classInfo = makeDerivedClassInfo(Widget.classInfo, {
        properties: [makeStylePropertyInfo("style", "Normal style")],

        beforeLoadHook: (object: IEezObject, jsObject: any) => {
            migrateStyleProperty(jsObject, "style");

            if (jsObject.style && typeof jsObject.style.padding === "number") {
                delete jsObject.style.padding;
            }

            delete jsObject.activeStyle;
        }
    });

    @computed
    get styleObject() {
        return this.style;
    }

    styleHook(style: React.CSSProperties, flowContext: IFlowContext) {
        // if (!flowContext.DocumentStore.project.isDashboardProject) {
        //     const backgroundColor = this.style.backgroundColorProperty;
        //     style.backgroundColor = to16bitsColor(backgroundColor);
        // }
    }
}

////////////////////////////////////////////////////////////////////////////////

export class ContainerWidget extends EmbeddedWidget {
    @observable name?: string;
    @observable widgets: Widget[];
    @observable overlay?: string;
    @observable shadow?: boolean;
    @observable visible?: string;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_CONTAINER,

        label: (widget: ContainerWidget) => {
            if (widget.name) {
                return `${humanize(widget.type)}: ${widget.name}`;
            }
            return humanize(widget.type);
        },

        properties: [
            {
                name: "widgets",
                type: PropertyType.Array,
                typeClass: Widget,
                hideInPropertyGrid: true
            },
            {
                name: "name",
                type: PropertyType.String,
                propertyGridGroup: generalGroup
            },
            makeDataPropertyInfo("overlay"),
            makeDataPropertyInfo("visible"),
            {
                name: "shadow",
                type: PropertyType.Boolean,
                propertyGridGroup: specificGroup,
                hideInPropertyGrid: (containerWidget: ContainerWidget) => {
                    return !containerWidget.overlay;
                }
            }
        ],

        defaultValue: {
            type: "Container",
            style: {
                inheritFrom: "default"
            },
            widgets: [],
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/Container.png",

        check: (object: ContainerWidget) => {
            let messages: Message[] = [];

            checkObjectReference(object, "overlay", messages);

            return messages;
        }
    });

    render(flowContext: IFlowContext) {
        let visible = true;

        if (flowContext.flowState) {
            let value: any;
            try {
                value = this.visible
                    ? evalExpression(flowContext, this, this.visible)
                    : true;
            } catch (err) {
                console.error(err);
            }
            if (typeof value === "boolean") {
                visible = value;
            } else if (typeof value === "number") {
                visible = value != 0;
            } else {
                visible = false;
            }
        }

        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            const w = this.width;
                            const h = this.height;
                            const style = this.style;

                            if (w > 0 && h > 0) {
                                let x1 = 0;
                                let y1 = 0;
                                let x2 = w - 1;
                                let y2 = h - 1;

                                const borderSize = style.borderSizeRect;
                                let borderRadius =
                                    styleGetBorderRadius(style) || 0;
                                if (
                                    borderSize.top > 0 ||
                                    borderSize.right > 0 ||
                                    borderSize.bottom > 0 ||
                                    borderSize.left > 0
                                ) {
                                    draw.setColor(style.borderColorProperty);
                                    draw.fillRect(
                                        ctx,
                                        x1,
                                        y1,
                                        x2,
                                        y2,
                                        borderRadius
                                    );
                                    x1 += borderSize.left;
                                    y1 += borderSize.top;
                                    x2 -= borderSize.right;
                                    y2 -= borderSize.bottom;
                                    borderRadius = Math.max(
                                        borderRadius -
                                            Math.max(
                                                borderSize.top,
                                                borderSize.right,
                                                borderSize.bottom,
                                                borderSize.left
                                            ),
                                        0
                                    );
                                }

                                draw.setColor(style.backgroundColorProperty);
                                draw.fillRect(
                                    ctx,
                                    x1,
                                    y1,
                                    x2,
                                    y2,
                                    borderRadius
                                );
                            }
                        }}
                    />
                )}
                {visible && (
                    <ComponentsContainerEnclosure
                        components={this.widgets}
                        flowContext={flowContext}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    styleHook(style: React.CSSProperties, flowContext: IFlowContext) {
        super.styleHook(style, flowContext);

        if (this.overlay) {
            if (this.shadow) {
                style.boxShadow = "1px 1px 8px 1px rgba(0,0,0,0.5)";
            }
            style.opacity = this.style.opacityProperty / 255;
        }
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // widgets
        dataBuffer.writeArray(this.widgets, widget =>
            buildWidget(widget, assets, dataBuffer)
        );

        let overlay = assets.getWidgetDataItemIndex(this, "overlay");

        // flags
        let flags = 0;

        if (overlay && this.shadow) {
            flags |= 1;
        }

        dataBuffer.writeUint16(flags);

        // overlay
        dataBuffer.writeInt16(overlay);
    }
}

registerClass("ContainerWidget", ContainerWidget);

////////////////////////////////////////////////////////////////////////////////

export class ListWidget extends EmbeddedWidget {
    @observable itemWidget?: Widget;
    @observable listType?: string;
    @observable gap?: number;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_LIST,

        properties: [
            {
                name: "itemWidget",
                type: PropertyType.Object,
                typeClass: Widget,
                hideInPropertyGrid: true,
                isOptional: true
            },
            {
                name: "listType",
                type: PropertyType.Enum,
                propertyGridGroup: specificGroup,
                enumItems: [
                    {
                        id: "vertical"
                    },
                    {
                        id: "horizontal"
                    }
                ]
            },
            {
                name: "gap",
                type: PropertyType.Number,
                propertyGridGroup: specificGroup
            }
        ],

        defaultValue: {
            itemWidget: {
                type: "Container",
                widgets: [],
                left: 0,
                top: 0,
                width: 64,
                height: 32
            },
            left: 0,
            top: 0,
            width: 64,
            height: 32,
            listType: "vertical",
            gap: 0
        },

        icon: "../home/_images/widgets/List.png",

        check: (object: ListWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            if (!object.itemWidget) {
                messages.push(
                    new Message(
                        MessageType.ERROR,
                        "List item widget is missing",
                        object
                    )
                );
            }

            return messages;
        }
    });

    render(flowContext: IFlowContext) {
        const itemWidget = this.itemWidget;
        if (!itemWidget) {
            return null;
        }

        let dataValue;
        if (this.data) {
            if (
                flowContext.DocumentStore.project.isAppletProject ||
                flowContext.DocumentStore.project.isDashboardProject
            ) {
                try {
                    dataValue = evalExpression(flowContext, this, this.data);
                } catch (err) {
                    console.error(err);
                }
            } else {
                dataValue = flowContext.dataContext.get(this.data);
            }
        }

        if (!Array.isArray(dataValue)) {
            dataValue = [{}];
        }

        const iterators =
            flowContext.dataContext.get(FLOW_ITERATOR_INDEXES_VARIABLE) || [];

        return _range(dataValue.length).map(i => (
            <ListWidgetItem
                key={i}
                flowContext={flowContext}
                listWidget={this}
                itemWidget={itemWidget}
                i={i}
                gap={this.gap || 0}
                iterators={iterators}
            />
        ));
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // itemWidget
        const itemWidget = this.itemWidget;
        if (itemWidget) {
            dataBuffer.writeObjectOffset(() =>
                buildWidget(itemWidget, assets, dataBuffer)
            );
        } else {
            dataBuffer.writeUint32(0);
        }

        // listType
        dataBuffer.writeUint8(
            this.listType === "vertical"
                ? LIST_TYPE_VERTICAL
                : LIST_TYPE_HORIZONTAL
        );

        // gap
        dataBuffer.writeUint8(this.gap || 0);
    }
}

registerClass("ListWidget", ListWidget);

@observer
class ListWidgetItem extends React.Component<{
    flowContext: IFlowContext;
    listWidget: ListWidget;
    itemWidget: Widget;
    i: number;
    gap: number;
    iterators: any;
}> {
    render() {
        const { flowContext, listWidget, itemWidget, i, gap, iterators } =
            this.props;
        let xListItem = 0;
        let yListItem = 0;

        if (listWidget.listType === "horizontal") {
            xListItem += i * (itemWidget.width + gap);
        } else {
            yListItem += i * (itemWidget.height + gap);
        }

        const overridenFlowContext = flowContext.overrideDataContext({
            [FLOW_ITERATOR_INDEX_VARIABLE]: i,
            [FLOW_ITERATOR_INDEXES_VARIABLE]: [i, ...iterators]
        });

        return (
            <ComponentEnclosure
                key={i}
                component={itemWidget}
                flowContext={overridenFlowContext}
                left={xListItem}
                top={yListItem}
            />
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

export class GridWidget extends EmbeddedWidget {
    @observable itemWidget?: Widget;
    @observable gridFlow?: string;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_GRID,

        properties: [
            {
                name: "itemWidget",
                type: PropertyType.Object,
                typeClass: Widget,
                hideInPropertyGrid: true,
                isOptional: true
            },
            {
                name: "gridFlow",
                type: PropertyType.Enum,
                propertyGridGroup: specificGroup,
                enumItems: [
                    {
                        id: "row"
                    },
                    {
                        id: "column"
                    }
                ]
            }
        ],

        defaultValue: {
            itemWidget: {
                type: "Container",
                widgets: [],
                left: 0,
                top: 0,
                width: 32,
                height: 32,
                gridFlow: "row"
            },
            left: 0,
            top: 0,
            width: 64,
            height: 64
        },

        icon: "../home/_images/widgets/Grid.png",

        check: (object: GridWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            if (!object.itemWidget) {
                messages.push(
                    new Message(
                        MessageType.ERROR,
                        "Grid item widget is missing",
                        object
                    )
                );
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        const itemWidget = this.itemWidget;
        if (!itemWidget) {
            return null;
        }

        const dataValue = this.data
            ? flowContext.dataContext.get(this.data)
            : 0;

        if (!dataValue || !Array.isArray(dataValue)) {
            return null;
        }

        return _range(dataValue.length).map(i => {
            const rows = Math.floor(this.width / itemWidget.width);
            const cols = Math.floor(this.height / itemWidget.height);

            let row;
            let col;
            if (this.gridFlow === "column") {
                row = Math.floor(i / cols);
                col = i % cols;
                if (row >= rows) {
                    return undefined;
                }
            } else {
                row = i % rows;
                col = Math.floor(i / rows);
                if (col >= cols) {
                    return undefined;
                }
            }

            let xListItem = row * itemWidget.width;
            let yListItem = col * itemWidget.height;

            return (
                <ComponentEnclosure
                    key={i}
                    component={itemWidget}
                    flowContext={flowContext.overrideDataContext(dataValue[i])}
                    left={xListItem}
                    top={yListItem}
                />
            );
        });
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // itemWidget
        const itemWidget = this.itemWidget;
        if (itemWidget) {
            dataBuffer.writeObjectOffset(() =>
                buildWidget(itemWidget, assets, dataBuffer)
            );
        } else {
            dataBuffer.writeUint32(0);
        }

        // gridFlow
        dataBuffer.writeUint8(
            this.gridFlow === "column" ? GRID_FLOW_COLUMN : GRID_FLOW_ROW
        );
    }
}

registerClass("GridWidget", GridWidget);

////////////////////////////////////////////////////////////////////////////////

export function htmlEncode(value: string) {
    const el = document.createElement("div");
    el.innerText = value;
    return el.innerHTML;
}

export class SelectWidget extends EmbeddedWidget {
    @observable widgets: Widget[];

    _lastSelectedIndexInSelectWidget: number | undefined;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_SELECT,

        properties: [
            {
                name: "widgets",
                type: PropertyType.Array,
                typeClass: Widget,
                hideInPropertyGrid: true,
                childLabel: (childObject: IEezObject, childLabel: string) => {
                    let label;

                    if (getParent(childObject)) {
                        let selectWidgetProperties = getParent(
                            getParent(childObject)
                        ) as SelectWidget;

                        label = selectWidgetProperties.getChildLabel(
                            childObject as Widget
                        );
                    }

                    if (!label) {
                        label = (getParent(childObject) as IEezObject[])
                            .indexOf(childObject)
                            .toString();
                    }

                    return `${label} ➔ ${childLabel}`;
                },

                interceptAddObject: (widgets: Widget[], object: Widget) => {
                    object.left = 0;
                    object.top = 0;
                    object.width = (getParent(widgets) as SelectWidget).width;
                    object.height = (getParent(widgets) as SelectWidget).height;
                    return object;
                }
            }
        ],

        defaultValue: {
            widgets: [],
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/Select.png",

        check: (object: SelectWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            } else {
                let variable = findVariable(getProject(object), object.data);
                if (variable) {
                    let enumItems: string[] = [];
                    if (isEnumVariable(variable)) {
                        const project = getProject(object);
                        const enumName = getEnumTypeNameFromVariable(variable);
                        enumItems = enumName
                            ? project.variables.enumsMap
                                  .get(enumName)
                                  ?.members.map(member => member.name) ?? []
                            : [];
                    } else if (variable.type == "boolean") {
                        enumItems = ["0", "1"];
                    }
                    if (enumItems.length > object.widgets.length) {
                        messages.push(
                            new Message(
                                MessageType.ERROR,
                                "Some select children are missing",
                                object
                            )
                        );
                    } else if (enumItems.length < object.widgets.length) {
                        messages.push(
                            new Message(
                                MessageType.ERROR,
                                "Too many select children defined",
                                object
                            )
                        );
                    }
                }
            }

            object.widgets.forEach(childObject => {
                if (childObject.width != object.width) {
                    messages.push(
                        new Message(
                            MessageType.WARNING,
                            "Child of Select widget has different width",
                            childObject
                        )
                    );
                }

                if (childObject.height != object.height) {
                    messages.push(
                        new Message(
                            MessageType.WARNING,
                            "Child of Select widget has different height",
                            childObject
                        )
                    );
                }
            });

            return messages;
        }
    });

    getChildLabel(childObject: Widget) {
        if (this.widgets) {
            let index = this.widgets.indexOf(childObject);
            if (index != -1) {
                if (this.data) {
                    let variable = findVariable(getProject(this), this.data);
                    if (variable) {
                        if (isEnumVariable(variable)) {
                            let enumItems: string[];

                            const project = getProject(this);
                            const enumName =
                                getEnumTypeNameFromVariable(variable);
                            enumItems = enumName
                                ? project.variables.enumsMap
                                      .get(enumName)
                                      ?.members.map(member => member.name) ?? []
                                : [];

                            if (index < enumItems.length) {
                                let enumItemLabel = htmlEncode(
                                    enumItems[index]
                                );
                                return enumItemLabel;
                            }
                        } else if (variable.type == "boolean") {
                            if (index == 0) {
                                return "0";
                            } else if (index == 1) {
                                return "1";
                            }
                        }
                    }
                }
            }
        }

        return undefined;
    }

    getSelectedIndex(flowContext: IFlowContext) {
        let index: number;

        if (flowContext.flowState) {
            try {
                index = evalExpression(flowContext, this, this.data!);

                if (typeof index === "number") {
                    // pass
                } else if (typeof index === "boolean") {
                    index = index ? 1 : 0;
                } else {
                    index = 0;
                }

                return index;

                return index;
            } catch (err) {
                console.error(err);
                return -1;
            }
        } else {
            const selectedObjects = flowContext.viewState.selectedObjects;

            for (let i = 0; i < this.widgets.length; ++i) {
                if (
                    selectedObjects.find(selectedObject =>
                        isAncestor(selectedObject.object, this.widgets[i])
                    )
                ) {
                    this._lastSelectedIndexInSelectWidget = i;
                    return i;
                }
            }

            if (
                this._lastSelectedIndexInSelectWidget !== undefined &&
                this._lastSelectedIndexInSelectWidget < this.widgets.length
            ) {
                return this._lastSelectedIndexInSelectWidget;
            }

            try {
                index = evalExpression(flowContext, this, this.data!);

                if (typeof index === "number") {
                    // pass
                } else if (typeof index === "boolean") {
                    index = index ? 1 : 0;
                } else {
                    index = 0;
                }

                return index;
            } catch (err) {
                console.error(err);
            }

            if (this.widgets.length > 0) {
                this._lastSelectedIndexInSelectWidget = 0;
                return 0;
            }

            return -1;
        }
    }

    render(flowContext: IFlowContext) {
        const index = this.getSelectedIndex(flowContext);

        let selectedWidget =
            index >= 0 && index < this.widgets.length
                ? this.widgets[index]
                : undefined;

        return (
            <>
                {selectedWidget && (
                    <ComponentsContainerEnclosure
                        components={[selectedWidget]}
                        flowContext={flowContext}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // widgets
        dataBuffer.writeArray(this.widgets, widget =>
            buildWidget(widget, assets, dataBuffer)
        );
    }
}

registerClass("SelectWidget", SelectWidget);

////////////////////////////////////////////////////////////////////////////////

@observer
class LayoutViewPropertyGridUI extends React.Component<PropertyProps> {
    showLayout = () => {
        (this.props.objects[0] as LayoutViewWidget).open();
    };

    render() {
        if (this.props.objects.length > 1) {
            return null;
        }
        return (
            <BootstrapButton
                color="primary"
                size="small"
                onClick={this.showLayout}
            >
                Show Layout
            </BootstrapButton>
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

export class LayoutViewWidget extends EmbeddedWidget {
    @observable layout: string;
    @observable context?: string;
    @observable visible?: string;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_LAYOUT_VIEW,

        properties: [
            {
                name: "layout",
                type: PropertyType.ObjectReference,
                propertyGridGroup: specificGroup,
                referencedObjectCollectionPath: "pages"
            },
            makeDataPropertyInfo("context"),
            makeDataPropertyInfo("visible"),
            {
                name: "customUI",
                type: PropertyType.Any,
                propertyGridGroup: specificGroup,
                computed: true,
                propertyGridRowComponent: LayoutViewPropertyGridUI,
                hideInPropertyGrid: (widget: LayoutViewWidget) => {
                    if (!widget.layout) {
                        return true;
                    }

                    const project = getProject(widget);

                    const layout = findPage(project, widget.layout);
                    if (!layout) {
                        return true;
                    }

                    return false;
                }
            }
        ],

        label: (widget: LayoutViewWidget) => {
            if (widget.layout) {
                return `${widget.type}: ${widget.layout}`;
            }

            return humanize(widget.type);
        },

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/LayoutView.png",

        check: (object: LayoutViewWidget) => {
            let messages: Message[] = [];

            if (!object.data && !object.layout) {
                messages.push(
                    new Message(
                        MessageType.ERROR,
                        "Either layout or data must be set",
                        object
                    )
                );
            } else {
                if (object.data && object.layout) {
                    messages.push(
                        new Message(
                            MessageType.ERROR,
                            "Both layout and data set, only layout is used",
                            object
                        )
                    );
                }

                if (object.layout) {
                    let layout = findPage(getProject(object), object.layout);
                    if (!layout) {
                        messages.push(
                            propertyNotFoundMessage(object, "layout")
                        );
                    }
                }
            }

            checkObjectReference(object, "context", messages);

            return messages;
        },

        open: (object: LayoutViewWidget) => {
            object.open();
        },

        extendContextMenu: (
            thisObject: Widget,
            context: IContextMenuContext,
            objects: IEezObject[],
            menuItems: Electron.MenuItem[]
        ): void => {
            TextWidget.classInfo.parentClassInfo!.extendContextMenu!(
                thisObject,
                context,
                objects,
                menuItems
            );

            if (objects.length === 1) {
                const object = objects[0];
                if (object instanceof LayoutViewWidget) {
                    menuItems.push(
                        new MenuItem({
                            label: "Replace with Container",
                            click: () => {
                                const widget = object.replaceWithContainer();
                                if (widget) {
                                    context.selectObject(widget);
                                }
                            }
                        })
                    );
                }
            }
        }
    });

    get layoutPage() {
        return this.getLayoutPage(getDocumentStore(this).dataContext);
    }

    getLayoutPage(dataContext: IDataContext) {
        let layout;

        const project = getProject(this);

        if (this.data) {
            const layoutName = dataContext.get(this.data);
            if (layoutName) {
                layout = findPage(project, layoutName);
            }
        }

        if (!layout) {
            layout = findPage(project, this.layout);
        }

        if (!layout) {
            return null;
        }

        if (isAncestor(this, layout)) {
            // prevent cyclic referencing
            return null;
        }

        return layout;
    }

    getInputs() {
        const page = findPage(getProject(this), this.layout);
        if (!page) {
            return super.getInputs();
        }

        const startComponents: ComponentInput[] = page.components
            .filter(component => component instanceof StartActionComponent)
            .map(() => ({
                name: "@seqin",
                type: "null",
                isSequenceInput: true,
                isOptionalInput: true
            }));

        const inputComponents: ComponentInput[] = page.components
            .filter(component => component instanceof InputActionComponent)
            .sort((a, b) => a.top - b.top)
            .map((inputActionComponent: InputActionComponent) => ({
                name: inputActionComponent.wireID,
                displayName: inputActionComponent.name,
                type: inputActionComponent.inputType,
                isSequenceInput: false,
                isOptionalInput: false
            }));

        return [...super.getInputs(), ...startComponents, ...inputComponents];
    }

    getOutputs() {
        const page = findPage(getProject(this), this.layout);
        if (!page) {
            return super.getOutputs();
        }

        const endComponents: ComponentOutput[] = page.components
            .filter(component => component instanceof EndActionComponent)
            .map(() => ({
                name: "@seqout",
                type: "any",
                isSequenceOutput: true,
                isOptionalOutput: true
            }));

        const outputComponents: ComponentOutput[] = page.components
            .filter(component => component instanceof OutputActionComponent)
            .sort((a, b) => a.top - b.top)
            .map((outputActionComponent: OutputActionComponent) => ({
                name: outputActionComponent.wireID,
                displayName: outputActionComponent.name,
                type: outputActionComponent.outputType,
                isSequenceOutput: false,
                isOptionalOutput: false
            }));

        return [...super.getOutputs(), ...endComponents, ...outputComponents];
    }

    // This is for prevention of circular rendering of layouts, i.e Layout A is using Layout B and Layout B is using Layout A.
    static renderedLayoutPages: Page[] = [];
    static clearRenderedLayoutPagesFrameRequestId: number | undefined;
    static clearRenderedLayoutPages() {
        LayoutViewWidget.renderedLayoutPages = [];
        LayoutViewWidget.clearRenderedLayoutPagesFrameRequestId = undefined;
    }

    render(flowContext: IFlowContext): React.ReactNode {
        let visible = true;

        if (flowContext.flowState) {
            let value: any;
            try {
                value = this.visible
                    ? evalExpression(flowContext, this, this.visible)
                    : true;
            } catch (err) {
                console.error(err);
            }
            if (typeof value === "boolean") {
                visible = value;
            } else if (typeof value === "number") {
                visible = value != 0;
            } else {
                visible = false;
            }
        }

        let element;

        if (visible) {
            const layoutPage = this.getLayoutPage(flowContext.dataContext);
            if (layoutPage) {
                if (!LayoutViewWidget.clearRenderedLayoutPagesFrameRequestId) {
                    LayoutViewWidget.clearRenderedLayoutPagesFrameRequestId =
                        window.requestAnimationFrame(
                            LayoutViewWidget.clearRenderedLayoutPages
                        );
                }

                if (
                    LayoutViewWidget.renderedLayoutPages.indexOf(layoutPage) ===
                    -1
                ) {
                    LayoutViewWidget.renderedLayoutPages.push(layoutPage);

                    element = (
                        <ComponentEnclosure
                            component={layoutPage}
                            flowContext={
                                flowContext.flowState
                                    ? flowContext.overrideFlowState(this)
                                    : flowContext
                            }
                        />
                    );

                    LayoutViewWidget.renderedLayoutPages.pop();
                }
            }
        }

        return (
            <>
                {element}
                {super.render(flowContext)}
            </>
        );
    }

    async execute(flowState: FlowState) {
        const page = this.getLayoutPage(
            flowState.runtime.DocumentStore.dataContext
        );

        if (page) {
            const runtime = flowState.runtime;

            let layoutFlowState = flowState.getFlowStateByComponent(this);

            if (!layoutFlowState) {
                runInAction(() => {
                    layoutFlowState = new FlowState(
                        flowState.runtime,
                        page,
                        flowState,
                        this
                    );

                    flowState.flowStates.push(layoutFlowState);

                    runtime.startFlow(layoutFlowState);
                });
            }

            const componentState = flowState.getComponentState(this);
            for (let input of componentState.unreadInputsData) {
                const inputData = componentState.inputsData.get(input);
                if (input === "@seqin") {
                    for (let component of page.components) {
                        if (component instanceof StartActionComponent) {
                            if (layoutFlowState) {
                                runtime.propagateValue(
                                    layoutFlowState,
                                    component,
                                    "@seqout",
                                    inputData
                                );
                            }
                        }
                    }
                } else {
                    for (let component of page.components) {
                        if (component instanceof InputActionComponent) {
                            if (component.wireID === input) {
                                if (layoutFlowState) {
                                    runtime.propagateValue(
                                        layoutFlowState,
                                        component,
                                        "@seqout",
                                        inputData
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        return false;
    }

    open() {
        if (this.layoutPage) {
            getDocumentStore(this).navigationStore.showObject(this.layoutPage);
        }
    }

    replaceWithContainer() {
        if (this.layoutPage) {
            var containerWidgetJsObject = Object.assign(
                {},
                ContainerWidget.classInfo.defaultValue
            );

            containerWidgetJsObject.widgets = this.layoutPage.components.map(
                widget => objectToJS(widget)
            );

            containerWidgetJsObject.left = this.left;
            containerWidgetJsObject.top = this.top;
            containerWidgetJsObject.width = this.width;
            containerWidgetJsObject.height = this.height;

            const DocumentStore = getDocumentStore(this);

            return DocumentStore.replaceObject(
                this,
                loadObject(
                    DocumentStore,
                    getParent(this),
                    containerWidgetJsObject,
                    Widget
                )
            );
        }
        return undefined;
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // layout
        let layout: number = 0;
        if (this.layout) {
            layout = assets.getPageIndex(this, "layout");
        }
        dataBuffer.writeInt16(layout);

        // context
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "context"));

        // component index
        dataBuffer.writeUint16(assets.getComponentIndex(this));
    }

    buildFlowComponentSpecific(assets: Assets, dataBuffer: DataBuffer) {
        const layoutPage = this.layoutPage;
        if (layoutPage) {
            const flowIndex = assets.flows.indexOf(layoutPage);
            dataBuffer.writeInt16(flowIndex);

            if (layoutPage.inputComponents.length > 0) {
                dataBuffer.writeUint8(
                    this.buildInputs.findIndex(
                        input =>
                            input.name == layoutPage.inputComponents[0].wireID
                    )
                );
            } else {
                dataBuffer.writeUint8(0);
            }

            if (layoutPage.outputComponents.length > 0) {
                dataBuffer.writeUint8(
                    this.buildOutputs.findIndex(
                        output =>
                            output.name == layoutPage.outputComponents[0].wireID
                    )
                );
            } else {
                dataBuffer.writeUint8(0);
            }
        } else {
            dataBuffer.writeUint8(0);
            dataBuffer.writeUint8(0);
        }
    }
}

registerClass("LayoutViewWidget", LayoutViewWidget);

////////////////////////////////////////////////////////////////////////////////

enum DisplayOption {
    All = 0,
    Integer = 1,
    FractionAndUnit = 2,
    Fraction = 3,
    Unit = 4,
    IntegerAndFraction = 5
}

export class DisplayDataWidget extends EmbeddedWidget {
    @observable focusStyle: Style;
    @observable displayOption: DisplayOption;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_DISPLAY_DATA,

        properties: [
            Object.assign(
                makeStylePropertyInfo("focusStyle"),
                { hideInPropertyGrid: hideInPropertyGridIfNotV1 },
                {
                    isOptional: true
                }
            ),
            {
                name: "displayOption",
                type: PropertyType.Enum,
                enumItems: [
                    {
                        id: DisplayOption.All,
                        label: "All"
                    },
                    {
                        id: DisplayOption.Integer,
                        label: "Integer"
                    },
                    {
                        id: DisplayOption.FractionAndUnit,
                        label: "Fraction and unit"
                    },
                    {
                        id: DisplayOption.Fraction,
                        label: "Fraction"
                    },
                    {
                        id: DisplayOption.Unit,
                        label: "Unit"
                    },
                    {
                        id: DisplayOption.IntegerAndFraction,
                        label: "Integer and fraction"
                    }
                ],
                propertyGridGroup: specificGroup
            }
        ],

        defaultValue: {
            data: "data",
            left: 0,
            top: 0,
            width: 64,
            height: 32,
            displayOption: 0
        },

        icon: "../home/_images/widgets/Data.png",

        check: (object: DisplayDataWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            if (object.displayOption === undefined) {
                if (
                    getProject(object).settings.general.projectVersion !== "v1"
                ) {
                    messages.push(
                        propertyNotSetMessage(object, "displayOption")
                    );
                }
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    getText(
        flowContext: IFlowContext
    ): { text: string; node: React.ReactNode } | string {
        if (
            flowContext.DocumentStore.project.isDashboardProject ||
            flowContext.DocumentStore.project.isAppletProject
        ) {
            if (this.data) {
                if (flowContext.flowState) {
                    try {
                        const value = evalExpression(
                            flowContext,
                            this,
                            this.data
                        );

                        if (value != null && value != undefined) {
                            return value;
                        }
                        return "";
                    } catch (err) {
                        console.error(err);
                        return "";
                    }
                }

                if (flowContext.DocumentStore.runtime) {
                    return "";
                }

                try {
                    const result = evalConstantExpression(
                        ProjectEditor.getProject(this),
                        this.data
                    );
                    if (typeof result.value === "string") {
                        return result.value;
                    }
                } catch (err) {}

                return {
                    text: this.data,
                    node: <span className="expression">{this.data}</span>
                };
            }

            if (flowContext.flowState) {
                return "";
            }

            return "<no text>";
        }

        if (this.data) {
            const result = flowContext.dataContext.get(this.data);
            if (result != undefined) {
                return result;
            }
            return this.data;
        }

        return "<no text>";
    }

    applyDisplayOption(text: string) {
        text = text.toString();

        function findStartOfFraction() {
            let i;
            for (
                i = 0;
                text[i] &&
                (text[i] == "<" ||
                    text[i] == " " ||
                    text[i] == "-" ||
                    (text[i] >= "0" && text[i] <= "9"));
                i++
            ) {}
            return i;
        }

        function findStartOfUnit(i: number) {
            for (
                i = 0;
                text[i] &&
                (text[i] == "<" ||
                    text[i] == " " ||
                    text[i] == "-" ||
                    (text[i] >= "0" && text[i] <= "9") ||
                    text[i] == ".");
                i++
            ) {}
            return i;
        }

        if (this.displayOption === DisplayOption.Integer) {
            let i = findStartOfFraction();
            text = text.substr(0, i);
        } else if (this.displayOption === DisplayOption.FractionAndUnit) {
            let i = findStartOfFraction();
            text = text.substr(i);
        } else if (this.displayOption === DisplayOption.Fraction) {
            let i = findStartOfFraction();
            let k = findStartOfUnit(i);
            if (i < k) {
                text = text.substring(i, k);
            } else {
                text = ".00";
            }
        } else if (this.displayOption === DisplayOption.Unit) {
            let i = findStartOfUnit(0);
            text = text.substr(i);
        } else if (this.displayOption === DisplayOption.IntegerAndFraction) {
            let i = findStartOfUnit(0);
            text = text.substr(0, i);
        }

        if (typeof text === "string") {
            text = text.trim();
        }

        return text;
    }

    render(flowContext: IFlowContext) {
        const result = this.getText(flowContext);
        let text: string;
        let node: React.ReactNode | null;
        if (typeof result == "string") {
            text = result;
            node = null;
        } else {
            text = result.text;
            node = result.node;
        }

        text = this.applyDisplayOption(text);

        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? (
                    node || text
                ) : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            drawText(
                                ctx,
                                text,
                                0,
                                0,
                                this.width,
                                this.height,
                                this.style,
                                false
                            );
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // displayOption
        dataBuffer.writeUint8(this.displayOption || 0);
    }
}

registerClass("DisplayDataWidget", DisplayDataWidget);

////////////////////////////////////////////////////////////////////////////////

export class TextWidget extends EmbeddedWidget {
    @observable name: string;
    @observable text?: string;
    @observable ignoreLuminocity: boolean;
    @observable focusStyle: Style;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_TEXT,

        label: (widget: TextWidget) => {
            const project = ProjectEditor.getProject(widget);

            if (!project.isDashboardProject && !project.isAppletProject) {
                if (widget.text) {
                    return `${humanize(widget.type)}: ${widget.text}`;
                }
            }

            if (widget.name) {
                return `${humanize(widget.type)}: ${widget.name}`;
            }

            if (widget.data) {
                return `${humanize(widget.type)}: ${widget.data}`;
            }

            return humanize(widget.type);
        },

        properties: [
            {
                name: "name",
                type: PropertyType.String,
                propertyGridGroup: generalGroup
            },
            makeDataPropertyInfo("data", {
                displayName: (widget: TextWidget) => {
                    const project = ProjectEditor.getProject(widget);
                    if (project.isDashboardProject || project.isAppletProject) {
                        return "Text";
                    }
                    return "Data";
                }
            }),
            makeTextPropertyInfo("text", {
                hideInPropertyGrid: hideInPropertyGridIfDashboardOrApplet
            }),
            {
                name: "ignoreLuminocity",
                type: PropertyType.Boolean,
                defaultValue: false,
                propertyGridGroup: specificGroup
            },
            Object.assign(
                makeStylePropertyInfo("focusStyle"),
                { hideInPropertyGrid: hideInPropertyGridIfNotV1 },
                {
                    isOptional: true
                }
            )
        ],

        beforeLoadHook: (widget: Widget, jsObject: any) => {
            if (jsObject.text) {
                const project = ProjectEditor.getProject(widget);
                if (project.isDashboardProject || project.isAppletProject) {
                    if (!jsObject.data) {
                        jsObject.data = `"${jsObject.text}"`;
                    }
                    delete jsObject.text;
                }
            }
        },

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/Text.png",

        check: (widget: TextWidget) => {
            let messages: Message[] = [];

            const project = ProjectEditor.getProject(widget);

            if (!project.isDashboardProject && !project.isAppletProject) {
                if (!widget.text && !widget.data) {
                    messages.push(propertyNotSetMessage(widget, "text"));
                }
            } else {
                if (!widget.data) {
                    messages.push(propertyNotSetMessage(widget, "text"));
                }
            }

            return messages;
        }
    });

    getText(
        flowContext: IFlowContext
    ): { text: string; node: React.ReactNode } | string {
        if (
            flowContext.DocumentStore.project.isDashboardProject ||
            flowContext.DocumentStore.project.isAppletProject
        ) {
            if (this.data) {
                if (flowContext.flowState) {
                    try {
                        const value = evalExpression(
                            flowContext,
                            this,
                            this.data
                        );

                        if (
                            typeof value == "string" ||
                            typeof value == "number"
                        ) {
                            return value.toString();
                        }
                        return "";
                    } catch (err) {
                        console.error(err);
                        return "";
                    }
                }

                if (flowContext.DocumentStore.runtime) {
                    return "";
                }

                if (this.name) {
                    return this.name;
                }

                try {
                    const result = evalConstantExpression(
                        ProjectEditor.getProject(this),
                        this.data
                    );
                    if (typeof result.value === "string") {
                        return result.value;
                    }
                } catch (err) {}

                return {
                    text: this.data,
                    node: <span className="expression">{this.data}</span>
                };
            }

            if (flowContext.flowState) {
                return "";
            }

            if (this.name) {
                return this.name;
            }

            return "<no text>";
        }

        if (this.text) {
            return this.text;
        }

        if (this.name) {
            return this.name;
        }

        if (this.data) {
            const result = flowContext.dataContext.get(this.data);
            if (result != undefined) {
                return result;
            }
            return this.data;
        }

        return "<no text>";
    }

    render(flowContext: IFlowContext) {
        const result = this.getText(flowContext);
        let text: string;
        let node: React.ReactNode | null;
        if (typeof result == "string") {
            text = result;
            node = null;
        } else {
            text = result.text;
            node = result.node;
        }

        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? (
                    node || text
                ) : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            drawText(
                                ctx,
                                text,
                                0,
                                0,
                                this.width,
                                this.height,
                                this.style,
                                false
                            );
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // text
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.text))
        );

        // flags
        let flags: number = 0;

        // ignoreLuminocity
        if (this.ignoreLuminocity) {
            flags |= 1 << 0;
        }

        dataBuffer.writeInt8(flags);
    }
}

registerClass("TextWidget", TextWidget);

////////////////////////////////////////////////////////////////////////////////

enum MultilineTextRenderStep {
    MEASURE,
    RENDER
}

class MultilineTextRender {
    constructor(
        private ctx: CanvasRenderingContext2D,
        private text: string,
        private x1: number,
        private y1: number,
        private x2: number,
        private y2: number,
        private style: Style,
        private inverse: boolean,
        private firstLineIndent: number,
        private hangingIndent: number
    ) {}

    private font: Font;

    private spaceWidth: number;

    private lineHeight: number;
    private textHeight: number;

    private line: string;
    private lineIndent: number;
    private lineWidth: number;

    flushLine(y: number, step: MultilineTextRenderStep) {
        if (this.line != "" && this.lineWidth > 0) {
            if (step == MultilineTextRenderStep.RENDER) {
                let x;

                if (styleIsHorzAlignLeft(this.style)) {
                    x = this.x1;
                } else if (styleIsHorzAlignRight(this.style)) {
                    x = this.x2 + 1 - this.lineWidth;
                } else {
                    x =
                        this.x1 +
                        Math.floor(
                            (this.x2 - this.x1 + 1 - this.lineWidth) / 2
                        );
                }

                if (this.inverse) {
                    draw.setBackColor(this.style.colorProperty);
                    draw.setColor(this.style.backgroundColorProperty);
                } else {
                    draw.setBackColor(this.style.backgroundColorProperty);
                    draw.setColor(this.style.colorProperty);
                }

                drawStr(
                    this.ctx,
                    this.line,
                    x + this.lineIndent,
                    y,
                    x + this.lineWidth - 1,
                    y + this.font.height - 1,
                    this.font
                );
            } else {
                this.textHeight = Math.max(
                    this.textHeight,
                    y + this.lineHeight - this.y1
                );
            }

            this.line = "";
            this.lineWidth = this.lineIndent = this.hangingIndent;
        }
    }

    executeStep(step: MultilineTextRenderStep) {
        this.textHeight = 0;

        let y = this.y1;

        this.line = "";
        this.lineWidth = this.lineIndent = this.firstLineIndent;

        let i = 0;

        while (true) {
            let word = "";
            while (
                i < this.text.length &&
                this.text[i] != " " &&
                this.text[i] != "\n"
            ) {
                word += this.text[i++];
            }

            let width = draw.measureStr(word, this.font, 0);

            while (
                this.lineWidth +
                    (this.line != "" ? this.spaceWidth : 0) +
                    width >
                this.x2 - this.x1 + 1
            ) {
                this.flushLine(y, step);

                y += this.lineHeight;
                if (y + this.lineHeight - 1 > this.y2) {
                    break;
                }
            }

            if (y + this.lineHeight - 1 > this.y2) {
                break;
            }

            if (this.line != "") {
                this.line += " ";
                this.lineWidth += this.spaceWidth;
            }
            this.line += word;
            this.lineWidth += width;

            while (this.text[i] == " ") {
                i++;
            }

            if (i == this.text.length || this.text[i] == "\n") {
                this.flushLine(y, step);

                y += this.lineHeight;

                if (i == this.text.length) {
                    break;
                }

                i++;

                let extraHeightBetweenParagraphs = Math.floor(
                    0.2 * this.lineHeight
                );

                y += extraHeightBetweenParagraphs;

                if (y + this.lineHeight - 1 > this.y2) {
                    break;
                }
            }
        }

        this.flushLine(y, step);

        return this.textHeight + this.font.height - this.lineHeight;
    }

    render() {
        const borderSize = this.style.borderSizeRect;
        let borderRadius = styleGetBorderRadius(this.style) || 0;
        if (
            borderSize.top > 0 ||
            borderSize.right > 0 ||
            borderSize.bottom > 0 ||
            borderSize.left > 0
        ) {
            draw.setColor(this.style.borderColorProperty);
            draw.fillRect(
                this.ctx,
                this.x1,
                this.y1,
                this.x2,
                this.y2,
                borderRadius
            );
            this.x1 += borderSize.left;
            this.y1 += borderSize.top;
            this.x2 -= borderSize.right;
            this.y2 -= borderSize.bottom;
            borderRadius = Math.max(
                borderRadius -
                    Math.max(
                        borderSize.top,
                        borderSize.right,
                        borderSize.bottom,
                        borderSize.left
                    ),
                0
            );
        }

        let backgroundColor = this.inverse
            ? this.style.colorProperty
            : this.style.backgroundColorProperty;
        draw.setColor(backgroundColor);
        draw.fillRect(
            this.ctx,
            this.x1,
            this.y1,
            this.x2,
            this.y2,
            borderRadius
        );

        const font = styleGetFont(this.style);
        if (!font) {
            return;
        }

        let lineHeight = Math.floor(0.9 * font.height);
        if (lineHeight <= 0) {
            return;
        }

        try {
            this.text = JSON.parse('"' + this.text + '"');
        } catch (e) {
            console.error(e, this.text);
            return;
        }

        this.font = font;
        this.lineHeight = lineHeight;

        this.x1 += this.style.paddingRect.left;
        this.x2 -= this.style.paddingRect.right;
        this.y1 += this.style.paddingRect.top;
        this.y2 -= this.style.paddingRect.bottom;

        const spaceGlyph = font.glyphs.find(glyph => glyph.encoding == 32);
        this.spaceWidth = (spaceGlyph && spaceGlyph.dx) || 0;

        const textHeight = this.executeStep(MultilineTextRenderStep.MEASURE);

        if (styleIsVertAlignTop(this.style)) {
        } else if (styleIsVertAlignBottom(this.style)) {
            this.y1 = this.y2 + 1 - textHeight;
        } else {
            this.y1 += Math.floor((this.y2 - this.y1 + 1 - textHeight) / 2);
        }
        this.y2 = this.y1 + textHeight - 1;

        this.executeStep(MultilineTextRenderStep.RENDER);
    }
}

export const indentationGroup: IPropertyGridGroupDefinition = {
    id: "indentation",
    title: "Indentation",
    position: 5
};

export class MultilineTextWidget extends EmbeddedWidget {
    @observable text?: string;
    @observable firstLineIndent: number;
    @observable hangingIndent: number;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_MULTILINE_TEXT,

        label: (widget: TextWidget) => {
            if (widget.text) {
                return `${humanize(widget.type)}: ${widget.text}`;
            }

            if (widget.data) {
                return `${humanize(widget.type)}: ${widget.data}`;
            }

            return humanize(widget.type);
        },

        properties: [
            makeTextPropertyInfo("text"),
            {
                name: "firstLineIndent",
                displayName: "First line",
                type: PropertyType.Number,
                propertyGridGroup: indentationGroup
            },
            {
                name: "hangingIndent",
                displayName: "Hanging",
                type: PropertyType.Number,
                propertyGridGroup: indentationGroup
            }
        ],

        defaultValue: {
            text: "Multiline text",
            left: 0,
            top: 0,
            width: 64,
            height: 32,
            firstLineIndent: 0,
            hangingIndent: 0
        },

        icon: "../home/_images/widgets/MultilineText.png",

        check: (object: MultilineTextWidget) => {
            let messages: Message[] = [];

            if (!object.text && !object.data) {
                messages.push(propertyNotSetMessage(object, "text"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let text = this.text
                                ? this.text
                                : this.data
                                ? (flowContext.dataContext.get(
                                      this.data
                                  ) as string)
                                : "";

                            const w = this.width;
                            const h = this.height;
                            const style = this.style;
                            const inverse = false;

                            let x1 = 0;
                            let y1 = 0;
                            let x2 = w - 1;
                            let y2 = h - 1;

                            var multilineTextRender = new MultilineTextRender(
                                ctx,
                                text,
                                x1,
                                y1,
                                x2,
                                y2,
                                style,
                                inverse,
                                this.firstLineIndent || 0,
                                this.hangingIndent || 0
                            );
                            multilineTextRender.render();
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // text
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.text))
        );

        // first line
        dataBuffer.writeInt16(this.firstLineIndent || 0);

        // hanging
        dataBuffer.writeInt16(this.hangingIndent || 0);
    }
}

registerClass("MultilineTextWidget", MultilineTextWidget);

////////////////////////////////////////////////////////////////////////////////

export class RectangleWidget extends EmbeddedWidget {
    @observable ignoreLuminocity: boolean;
    @observable invertColors: boolean;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_RECTANGLE,

        properties: [
            {
                name: "invertColors",
                type: PropertyType.Boolean,
                propertyGridGroup: specificGroup,
                defaultValue: false
            },
            {
                name: "ignoreLuminocity",
                type: PropertyType.Boolean,
                propertyGridGroup: specificGroup,
                defaultValue: false
            }
        ],

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/Rectangle.png",

        check: (object: RectangleWidget) => {
            let messages: Message[] = [];

            if (object.data) {
                messages.push(propertySetButNotUsedMessage(object, "data"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            const w = this.width;
                            const h = this.height;
                            const style = this.style;
                            const inverse = this.invertColors;

                            if (w > 0 && h > 0) {
                                let x1 = 0;
                                let y1 = 0;
                                let x2 = w - 1;
                                let y2 = h - 1;

                                const borderSize = style.borderSizeRect;
                                let borderRadius =
                                    styleGetBorderRadius(style) || 0;
                                if (
                                    borderSize.top > 0 ||
                                    borderSize.right > 0 ||
                                    borderSize.bottom > 0 ||
                                    borderSize.left > 0
                                ) {
                                    draw.setColor(style.borderColorProperty);
                                    draw.fillRect(
                                        ctx,
                                        x1,
                                        y1,
                                        x2,
                                        y2,
                                        borderRadius
                                    );
                                    x1 += borderSize.left;
                                    y1 += borderSize.top;
                                    x2 -= borderSize.right;
                                    y2 -= borderSize.bottom;
                                    borderRadius = Math.max(
                                        borderRadius -
                                            Math.max(
                                                borderSize.top,
                                                borderSize.right,
                                                borderSize.bottom,
                                                borderSize.left
                                            ),
                                        0
                                    );
                                }

                                draw.setColor(
                                    inverse
                                        ? style.backgroundColorProperty
                                        : style.colorProperty
                                );
                                draw.fillRect(
                                    ctx,
                                    x1,
                                    y1,
                                    x2,
                                    y2,
                                    borderRadius
                                );
                            }
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // flags
        let flags: number = 0;

        // invertColors
        if (this.invertColors) {
            flags |= 1 << 0;
        }

        // ignoreLuminocity
        if (this.ignoreLuminocity) {
            flags |= 1 << 1;
        }

        dataBuffer.writeUint8(flags);
    }
}

registerClass("RectangleWidget", RectangleWidget);

////////////////////////////////////////////////////////////////////////////////

@observer
class BitmapWidgetPropertyGridUI extends React.Component<PropertyProps> {
    get bitmapWidget() {
        return this.props.objects[0] as BitmapWidget;
    }

    resizeToFitBitmap = () => {
        getDocumentStore(this).updateObject(this.props.objects[0], {
            width: this.bitmapWidget.bitmapObject!.imageElement!.width,
            height: this.bitmapWidget.bitmapObject!.imageElement!.height
        });
    };

    render() {
        if (this.props.readOnly) {
            return null;
        }

        if (this.props.objects.length > 1) {
            return null;
        }

        const bitmapObject = this.bitmapWidget.bitmapObject;
        if (!bitmapObject) {
            return null;
        }

        const imageElement = bitmapObject.imageElement;
        if (!imageElement) {
            return null;
        }

        return (
            <BootstrapButton
                color="primary"
                size="small"
                onClick={this.resizeToFitBitmap}
            >
                Resize to Fit Bitmap
            </BootstrapButton>
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

export class BitmapWidget extends EmbeddedWidget {
    @observable bitmap?: string;

    get label() {
        return this.bitmap ? `${this.type}: ${this.bitmap}` : this.type;
    }

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_BITMAP,

        properties: [
            {
                name: "bitmap",
                type: PropertyType.ObjectReference,
                referencedObjectCollectionPath: "bitmaps",
                propertyGridGroup: specificGroup
            },
            {
                name: "customUI",
                type: PropertyType.Any,
                propertyGridGroup: specificGroup,
                computed: true,
                propertyGridRowComponent: BitmapWidgetPropertyGridUI
            }
        ],

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/Bitmap.png",

        check: (object: BitmapWidget) => {
            let messages: Message[] = [];

            if (!object.data && !object.bitmap) {
                messages.push(
                    new Message(
                        MessageType.ERROR,
                        "Either bitmap or data must be set",
                        object
                    )
                );
            } else {
                if (object.data && object.bitmap) {
                    messages.push(
                        new Message(
                            MessageType.ERROR,
                            "Both bitmap and data set, only bitmap is used",
                            object
                        )
                    );
                }

                if (object.bitmap) {
                    let bitmap = findBitmap(getProject(object), object.bitmap);
                    if (!bitmap) {
                        messages.push(
                            propertyNotFoundMessage(object, "bitmap")
                        );
                    }
                }
            }

            return messages;
        }
    });

    @computed
    get bitmapObject() {
        return this.getBitmapObject(getDocumentStore(this).dataContext);
    }

    getBitmapObject(dataContext: IDataContext) {
        return this.bitmap
            ? findBitmap(getProject(this), this.bitmap)
            : this.data
            ? findBitmap(getProject(this), dataContext.get(this.data) as string)
            : undefined;
    }

    render(flowContext: IFlowContext) {
        const bitmap = this.getBitmapObject(flowContext.dataContext);

        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? (
                    bitmap ? (
                        <img src={bitmap.image} />
                    ) : null
                ) : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            const w = this.width;
                            const h = this.height;
                            const style = this.style;

                            const inverse = false;

                            if (bitmap) {
                                const imageElement = bitmap.imageElement;
                                if (!imageElement) {
                                    return;
                                }

                                let x1 = 0;
                                let y1 = 0;
                                let x2 = w - 1;
                                let y2 = h - 1;

                                if (bitmap.bpp !== 32) {
                                    let backgroundColor = inverse
                                        ? style.colorProperty
                                        : style.backgroundColorProperty;
                                    draw.setColor(backgroundColor);
                                    draw.fillRect(ctx, x1, y1, x2, y2, 0);
                                }

                                let width = imageElement.width;
                                let height = imageElement.height;

                                let x_offset: number;
                                if (styleIsHorzAlignLeft(style)) {
                                    x_offset = x1 + style.paddingRect.left;
                                } else if (styleIsHorzAlignRight(style)) {
                                    x_offset =
                                        x2 - style.paddingRect.right - width;
                                } else {
                                    x_offset = Math.floor(
                                        x1 + (x2 - x1 - width) / 2
                                    );
                                }

                                let y_offset: number;
                                if (styleIsVertAlignTop(style)) {
                                    y_offset = y1 + style.paddingRect.top;
                                } else if (styleIsVertAlignBottom(style)) {
                                    y_offset =
                                        y2 - style.paddingRect.bottom - height;
                                } else {
                                    y_offset = Math.floor(
                                        y1 + (y2 - y1 - height) / 2
                                    );
                                }

                                if (inverse) {
                                    draw.setBackColor(style.colorProperty);
                                    draw.setColor(
                                        style.backgroundColorProperty
                                    );
                                } else {
                                    draw.setBackColor(
                                        style.backgroundColorProperty
                                    );
                                    draw.setColor(style.colorProperty);
                                }

                                draw.drawBitmap(
                                    ctx,
                                    imageElement,
                                    x_offset,
                                    y_offset,
                                    width,
                                    height
                                );
                            }
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // bitmap
        let bitmap: number = 0;
        if (this.bitmap) {
            bitmap = assets.getBitmapIndex(this, "bitmap");
        }

        dataBuffer.writeInt16(bitmap);
    }
}

registerClass("BitmapWidget", BitmapWidget);

////////////////////////////////////////////////////////////////////////////////

export class ButtonWidget extends EmbeddedWidget {
    @observable text?: string;
    @observable enabled?: string;
    @observable disabledStyle: Style;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_BUTTON,

        properties: [
            makeDataPropertyInfo("data", {
                displayName: (widget: TextWidget) => {
                    const project = ProjectEditor.getProject(widget);
                    if (project.isDashboardProject || project.isAppletProject) {
                        return "Text";
                    }
                    return "Data";
                }
            }),
            makeTextPropertyInfo("text", {
                hideInPropertyGrid: hideInPropertyGridIfDashboardOrApplet
            }),
            makeDataPropertyInfo("enabled"),
            makeStylePropertyInfo("disabledStyle")
        ],

        beforeLoadHook: (widget: IEezObject, jsObject: any) => {
            if (jsObject.text) {
                const project = ProjectEditor.getProject(widget);
                if (project.isDashboardProject || project.isAppletProject) {
                    if (!jsObject.data) {
                        jsObject.data = `"${jsObject.text}"`;
                    }
                    delete jsObject.text;
                }
            }

            migrateStyleProperty(jsObject, "disabledStyle");
        },

        defaultValue: {
            left: 0,
            top: 0,
            width: 32,
            height: 32
        },

        icon: "../home/_images/widgets/Button.png",

        check: (widget: ButtonWidget) => {
            let messages: Message[] = [];

            const project = ProjectEditor.getProject(widget);

            if (!project.isDashboardProject && !project.isAppletProject) {
                if (
                    !widget.text &&
                    !widget.data &&
                    !widget.isInputProperty("data")
                ) {
                    messages.push(propertyNotSetMessage(widget, "text"));
                }

                checkObjectReference(widget, "enabled", messages, true);
            } else {
                if (!widget.data) {
                    messages.push(propertyNotSetMessage(widget, "text"));
                }
            }

            return messages;
        }
    });

    getText(
        flowContext: IFlowContext
    ): { text: string; node: React.ReactNode } | string {
        if (
            flowContext.DocumentStore.project.isDashboardProject ||
            flowContext.DocumentStore.project.isAppletProject
        ) {
            if (this.data) {
                if (flowContext.flowState) {
                    try {
                        const value = evalExpression(
                            flowContext,
                            this,
                            this.data
                        );

                        if (value != null && value != undefined) {
                            return value;
                        }
                        return "";
                    } catch (err) {
                        console.error(err);
                        return "";
                    }
                }

                if (flowContext.DocumentStore.runtime) {
                    return "";
                }

                try {
                    const result = evalConstantExpression(
                        ProjectEditor.getProject(this),
                        this.data
                    );
                    if (typeof result.value === "string") {
                        return result.value;
                    }
                } catch (err) {}

                return {
                    text: this.data,
                    node: <span className="expression">{this.data}</span>
                };
            }

            if (flowContext.flowState) {
                return "";
            }

            return "<no text>";
        }

        if (this.data) {
            const result = flowContext.dataContext.get(this.data);
            if (result != undefined) {
                return result;
            }
            return this.data;
        }

        if (this.text) {
            return this.text;
        }

        return "<no text>";
    }

    render(flowContext: IFlowContext) {
        const result = this.getText(flowContext);
        let text: string;
        let node: React.ReactNode | null;
        if (typeof result == "string") {
            text = result;
            node = null;
        } else {
            text = result.text;
            node = result.node;
        }

        let buttonEnabled;
        if (flowContext.flowState) {
            try {
                buttonEnabled = this.enabled
                    ? evalExpression(flowContext, this, this.enabled)
                    : true;
            } catch (err) {
                console.error(err);
                buttonEnabled = true;
            }
        } else {
            buttonEnabled = true;
        }

        let style = buttonEnabled ? this.style : this.disabledStyle;

        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? (
                    <button
                        className="btn btn-secondary"
                        disabled={!buttonEnabled}
                        onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();

                            if (flowContext.DocumentStore.runtime) {
                                flowContext.DocumentStore.runtime.executeWidgetAction(
                                    flowContext,
                                    this
                                );
                            }
                        }}
                    >
                        {node || text}
                    </button>
                ) : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            drawText(
                                ctx,
                                text,
                                0,
                                0,
                                this.width,
                                this.height,
                                style,
                                false
                            );
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // text
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.text))
        );

        // enabled
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "enabled"));

        // disabledStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "disabledStyle"));
    }
}

registerClass("ButtonWidget", ButtonWidget);

////////////////////////////////////////////////////////////////////////////////

export class ToggleButtonWidget extends EmbeddedWidget {
    @observable text1?: string;
    @observable text2?: string;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_TOGGLE_BUTTON,

        properties: [
            {
                name: "text1",
                type: PropertyType.String,
                propertyGridGroup: specificGroup
            },
            {
                name: "text2",
                type: PropertyType.String,
                propertyGridGroup: specificGroup
            }
        ],

        defaultValue: {
            left: 0,
            top: 0,
            width: 32,
            height: 32
        },

        icon: "../home/_images/widgets/ToggleButton.png",

        check: (object: ToggleButtonWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            if (!object.text1) {
                messages.push(propertyNotSetMessage(object, "text1"));
            }

            if (!object.text2) {
                messages.push(propertyNotSetMessage(object, "text2"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            drawText(
                                ctx,
                                this.text1 || "",
                                0,
                                0,
                                this.width,
                                this.height,
                                this.style,
                                false
                            );
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // text 1
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.text1))
        );

        // text 2
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.text2))
        );
    }
}

registerClass("ToggleButtonWidget", ToggleButtonWidget);

////////////////////////////////////////////////////////////////////////////////

export class ButtonGroupWidget extends EmbeddedWidget {
    @observable selectedStyle: Style;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_BUTTON_GROUP,

        properties: [makeStylePropertyInfo("selectedStyle")],

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/ButtonGroup.png",

        check: (object: ButtonGroupWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let buttonLabels =
                                (this.data &&
                                    flowContext.dataContext.getValueList(
                                        this.data
                                    )) ||
                                [];
                            let selectedButton =
                                (this.data &&
                                    flowContext.dataContext.get(this.data)) ||
                                0;

                            let x = 0;
                            let y = 0;
                            let w = this.width;
                            let h = this.height;

                            if (w > h) {
                                // horizontal orientation
                                let buttonWidth = Math.floor(
                                    w / buttonLabels.length
                                );
                                x += Math.floor(
                                    (w - buttonWidth * buttonLabels.length) / 2
                                );
                                let buttonHeight = h;
                                for (let i = 0; i < buttonLabels.length; i++) {
                                    if (i == selectedButton) {
                                        drawText(
                                            ctx,
                                            buttonLabels[i],
                                            x,
                                            y,
                                            buttonWidth,
                                            buttonHeight,
                                            this.selectedStyle,
                                            false
                                        );
                                    } else {
                                        drawText(
                                            ctx,
                                            buttonLabels[i],
                                            x,
                                            y,
                                            buttonWidth,
                                            buttonHeight,
                                            this.style,
                                            false
                                        );
                                    }
                                    x += buttonWidth;
                                }
                            } else {
                                // vertical orientation
                                let buttonWidth = w;
                                let buttonHeight = Math.floor(
                                    h / buttonLabels.length
                                );

                                y += Math.floor(
                                    (h - buttonHeight * buttonLabels.length) / 2
                                );

                                let labelHeight = Math.min(
                                    buttonWidth,
                                    buttonHeight
                                );
                                let yOffset = Math.floor(
                                    (buttonHeight - labelHeight) / 2
                                );

                                y += yOffset;

                                for (let i = 0; i < buttonLabels.length; i++) {
                                    if (i == selectedButton) {
                                        drawText(
                                            ctx,
                                            buttonLabels[i],
                                            x,
                                            y,
                                            buttonWidth,
                                            labelHeight,
                                            this.selectedStyle,
                                            false
                                        );
                                    } else {
                                        drawText(
                                            ctx,
                                            buttonLabels[i],
                                            x,
                                            y,
                                            buttonWidth,
                                            labelHeight,
                                            this.style,
                                            false
                                        );
                                    }
                                    y += buttonHeight;
                                }
                            }
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // selectedStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "selectedStyle"));
    }
}

registerClass("ButtonGroupWidget", ButtonGroupWidget);

////////////////////////////////////////////////////////////////////////////////

export class BarGraphWidget extends EmbeddedWidget {
    @observable orientation?: string;
    @observable displayValue: boolean;
    @observable textStyle: Style;
    @observable line1Data?: string;
    @observable line1Style: Style;
    @observable line2Data?: string;
    @observable line2Style: Style;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_BAR_GRAPH,

        properties: [
            {
                name: "orientation",
                type: PropertyType.Enum,
                propertyGridGroup: specificGroup,
                enumItems: [
                    {
                        id: "left-right"
                    },
                    {
                        id: "right-left"
                    },
                    {
                        id: "top-bottom"
                    },
                    {
                        id: "bottom-top"
                    }
                ]
            },
            {
                name: "displayValue",
                type: PropertyType.Boolean,
                propertyGridGroup: specificGroup
            },
            makeStylePropertyInfo("textStyle"),
            makeStylePropertyInfo("line1Style"),
            makeStylePropertyInfo("line2Style"),
            makeDataPropertyInfo("line1Data"),
            makeDataPropertyInfo("line2Data")
        ],

        beforeLoadHook: (object: IEezObject, jsObject: any) => {
            migrateStyleProperty(jsObject, "textStyle");
            migrateStyleProperty(jsObject, "line1Style");
            migrateStyleProperty(jsObject, "line2Style");
        },

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32,
            orientation: "left-right"
        },

        icon: "../home/_images/widgets/BarGraph.png",

        check: (object: BarGraphWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            const project = getProject(object);

            if (object.line1Data) {
                if (!findVariable(project, object.line1Data)) {
                    messages.push(propertyNotFoundMessage(object, "line1Data"));
                }
            } else {
                messages.push(propertyNotSetMessage(object, "line1Data"));
            }

            if (object.line2Data) {
                if (!findVariable(project, object.line2Data)) {
                    messages.push(propertyNotFoundMessage(object, "line2Data"));
                }
            } else {
                messages.push(propertyNotSetMessage(object, "line2Data"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let barGraphWidget = this;
                            let style = barGraphWidget.style;

                            let min =
                                (barGraphWidget.data &&
                                    flowContext.dataContext.getMin(
                                        barGraphWidget.data
                                    )) ||
                                0;
                            let max =
                                (barGraphWidget.data &&
                                    flowContext.dataContext.getMax(
                                        barGraphWidget.data
                                    )) ||
                                0;
                            let valueText =
                                (barGraphWidget.data &&
                                    flowContext.dataContext.get(
                                        barGraphWidget.data
                                    )) ||
                                "0";
                            let value = parseFloat(valueText);
                            if (isNaN(value)) {
                                value = 0;
                            }
                            let horizontal =
                                barGraphWidget.orientation == "left-right" ||
                                barGraphWidget.orientation == "right-left";

                            let d = horizontal ? this.width : this.height;

                            function calcPos(value: number) {
                                let pos = Math.round((value * d) / (max - min));
                                if (pos < 0) {
                                    pos = 0;
                                }
                                if (pos > d) {
                                    pos = d;
                                }
                                return pos;
                            }

                            let pos = calcPos(value);

                            if (barGraphWidget.orientation == "left-right") {
                                draw.setColor(style.colorProperty);
                                draw.fillRect(
                                    ctx,
                                    0,
                                    0,
                                    pos - 1,
                                    this.height - 1
                                );
                                draw.setColor(style.backgroundColorProperty);
                                draw.fillRect(
                                    ctx,
                                    pos,
                                    0,
                                    this.width - 1,
                                    this.height - 1
                                );
                            } else if (
                                barGraphWidget.orientation == "right-left"
                            ) {
                                draw.setColor(style.backgroundColorProperty);
                                draw.fillRect(
                                    ctx,
                                    0,
                                    0,
                                    this.width - pos - 1,
                                    this.height - 1
                                );
                                draw.setColor(style.colorProperty);
                                draw.fillRect(
                                    ctx,
                                    this.width - pos,
                                    0,
                                    this.width - 1,
                                    this.height - 1
                                );
                            } else if (
                                barGraphWidget.orientation == "top-bottom"
                            ) {
                                draw.setColor(style.colorProperty);
                                draw.fillRect(
                                    ctx,
                                    0,
                                    0,
                                    this.width - 1,
                                    pos - 1
                                );
                                draw.setColor(style.backgroundColorProperty);
                                draw.fillRect(
                                    ctx,
                                    0,
                                    pos,
                                    this.width - 1,
                                    this.height - 1
                                );
                            } else {
                                draw.setColor(style.backgroundColorProperty);
                                draw.fillRect(
                                    ctx,
                                    0,
                                    0,
                                    this.width - 1,
                                    this.height - pos - 1
                                );
                                draw.setColor(style.colorProperty);
                                draw.fillRect(
                                    ctx,
                                    0,
                                    this.height - pos,
                                    this.width - 1,
                                    this.height - 1
                                );
                            }

                            if (this.displayValue) {
                                if (horizontal) {
                                    let textStyle = barGraphWidget.textStyle;
                                    const font = styleGetFont(textStyle);
                                    if (font) {
                                        let w = draw.measureStr(
                                            valueText,
                                            font,
                                            this.width
                                        );
                                        w += style.paddingRect.left;

                                        if (w > 0 && this.height > 0) {
                                            let backgroundColor: string;
                                            let x: number;

                                            if (pos + w <= this.width) {
                                                backgroundColor =
                                                    style.backgroundColorProperty;
                                                x = pos;
                                            } else {
                                                backgroundColor =
                                                    style.colorProperty;
                                                x =
                                                    pos -
                                                    w -
                                                    style.paddingRect.right;
                                            }

                                            drawText(
                                                ctx,
                                                valueText,
                                                x,
                                                0,
                                                w,
                                                this.height,
                                                textStyle,
                                                false,
                                                backgroundColor
                                            );
                                        }
                                    }
                                }
                            }

                            function drawLine(
                                lineData: string | undefined,
                                lineStyle: Style
                            ) {
                                let value =
                                    (lineData &&
                                        parseFloat(
                                            flowContext.dataContext.get(
                                                lineData
                                            )
                                        )) ||
                                    0;
                                if (isNaN(value)) {
                                    value = 0;
                                }
                                let pos = calcPos(value);
                                if (pos == d) {
                                    pos = d - 1;
                                }
                                draw.setColor(lineStyle.colorProperty);
                                if (
                                    barGraphWidget.orientation == "left-right"
                                ) {
                                    draw.drawVLine(
                                        ctx,
                                        pos,
                                        0,
                                        widget.height - 1
                                    );
                                } else if (
                                    barGraphWidget.orientation == "right-left"
                                ) {
                                    draw.drawVLine(
                                        ctx,
                                        widget.width - pos,
                                        0,
                                        widget.height - 1
                                    );
                                } else if (
                                    barGraphWidget.orientation == "top-bottom"
                                ) {
                                    draw.drawHLine(
                                        ctx,
                                        0,
                                        pos,
                                        widget.width - 1
                                    );
                                } else {
                                    draw.drawHLine(
                                        ctx,
                                        0,
                                        widget.height - pos,
                                        widget.width - 1
                                    );
                                }
                            }

                            const widget = this;

                            drawLine(
                                barGraphWidget.line1Data,
                                barGraphWidget.line1Style
                            );
                            drawLine(
                                barGraphWidget.line2Data,
                                barGraphWidget.line2Style
                            );
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // textStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "textStyle"));

        // line1Data
        let line1Data = assets.getWidgetDataItemIndex(this, "line1Data");

        dataBuffer.writeInt16(line1Data);

        // line1Style
        dataBuffer.writeInt16(assets.getStyleIndex(this, "line1Style"));

        // line2Data
        let line2Data = assets.getWidgetDataItemIndex(this, "line2Data");

        dataBuffer.writeInt16(line2Data);

        // line2Style
        dataBuffer.writeInt16(assets.getStyleIndex(this, "line2Style"));

        // orientation
        let orientation: number;
        switch (this.orientation) {
            case "left-right":
                orientation = BAR_GRAPH_ORIENTATION_LEFT_RIGHT;
                break;
            case "right-left":
                orientation = BAR_GRAPH_ORIENTATION_RIGHT_LEFT;
                break;
            case "top-bottom":
                orientation = BAR_GRAPH_ORIENTATION_TOP_BOTTOM;
                break;
            default:
                orientation = BAR_GRAPH_ORIENTATION_BOTTOM_TOP;
        }

        if (!this.displayValue) {
            orientation |= BAR_GRAPH_DO_NOT_DISPLAY_VALUE;
        }

        dataBuffer.writeUint8(orientation);
    }
}

registerClass("BarGraphWidget", BarGraphWidget);

////////////////////////////////////////////////////////////////////////////////

export class YTGraphWidget extends EmbeddedWidget {
    @observable y1Style: Style;
    @observable y2Data?: string;
    @observable y2Style: Style;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_YT_GRAPH,

        properties: [
            Object.assign(makeStylePropertyInfo("y1Style"), {
                hideInPropertyGrid: hideInPropertyGridIfNotV1
            }),
            Object.assign(makeStylePropertyInfo("y2Style"), {
                hideInPropertyGrid: hideInPropertyGridIfNotV1
            }),
            Object.assign(makeDataPropertyInfo("y2Data"), {
                hideInPropertyGrid: hideInPropertyGridIfNotV1
            })
        ],

        beforeLoadHook: (object: IEezObject, jsObject: any) => {
            migrateStyleProperty(jsObject, "y1Style");
            migrateStyleProperty(jsObject, "y2Style");
        },

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/YTGraph.png",

        check: (object: YTGraphWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            const project = getProject(object);

            if (project.settings.general.projectVersion === "v1") {
                if (object.y2Data) {
                    if (!findVariable(project, object.y2Data)) {
                        messages.push(
                            propertyNotFoundMessage(object, "y2Data")
                        );
                    }
                } else {
                    messages.push(propertyNotSetMessage(object, "y2Data"));
                }
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let ytGraphWidget = this;
                            let style = ytGraphWidget.style;

                            let x1 = 0;
                            let y1 = 0;
                            let x2 = this.width - 1;
                            let y2 = this.height - 1;

                            const borderSize = style.borderSizeRect;
                            let borderRadius = styleGetBorderRadius(style) || 0;
                            if (
                                borderSize.top > 0 ||
                                borderSize.right > 0 ||
                                borderSize.bottom > 0 ||
                                borderSize.left > 0
                            ) {
                                draw.setColor(style.borderColorProperty);
                                draw.fillRect(
                                    ctx,
                                    x1,
                                    y1,
                                    x2,
                                    y2,
                                    borderRadius
                                );
                                x1 += borderSize.left;
                                y1 += borderSize.top;
                                x2 -= borderSize.right;
                                y2 -= borderSize.bottom;
                                borderRadius = Math.max(
                                    borderRadius -
                                        Math.max(
                                            borderSize.top,
                                            borderSize.right,
                                            borderSize.bottom,
                                            borderSize.left
                                        ),
                                    0
                                );
                            }

                            draw.setColor(style.backgroundColorProperty);
                            draw.fillRect(ctx, x1, y1, x2, y2, borderRadius);
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {}
}

registerClass("YTGraphWidget", YTGraphWidget);

////////////////////////////////////////////////////////////////////////////////

export class UpDownWidget extends EmbeddedWidget {
    @observable buttonsStyle: Style;
    @observable downButtonText?: string;
    @observable upButtonText?: string;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_UP_DOWN,

        properties: [
            makeStylePropertyInfo("buttonsStyle"),
            makeTextPropertyInfo("downButtonText"),
            makeTextPropertyInfo("upButtonText")
        ],

        beforeLoadHook: (object: IEezObject, jsObject: any) => {
            migrateStyleProperty(jsObject, "buttonsStyle");
        },

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32,
            upButtonText: ">",
            downButtonText: "<"
        },

        icon: "../home/_images/widgets/UpDown.png",

        check: (object: UpDownWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            if (!object.downButtonText) {
                messages.push(propertyNotSetMessage(object, "downButtonText"));
            }

            if (!object.upButtonText) {
                messages.push(propertyNotSetMessage(object, "upButtonText"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let upDownWidget = this;
                            let style = upDownWidget.style;
                            let buttonsStyle = upDownWidget.buttonsStyle;

                            const buttonsFont = styleGetFont(buttonsStyle);
                            if (!buttonsFont) {
                                return;
                            }

                            drawText(
                                ctx,
                                upDownWidget.downButtonText || "<",
                                0,
                                0,
                                buttonsFont.height,
                                this.height,
                                buttonsStyle,
                                false
                            );

                            let text = upDownWidget.data
                                ? (flowContext.dataContext.get(
                                      upDownWidget.data
                                  ) as string)
                                : "";
                            drawText(
                                ctx,
                                text,
                                buttonsFont.height,
                                0,
                                this.width - 2 * buttonsFont.height,
                                this.height,
                                style,
                                false
                            );

                            drawText(
                                ctx,
                                upDownWidget.upButtonText || ">",
                                this.width - buttonsFont.height,
                                0,
                                buttonsFont.height,
                                this.height,
                                buttonsStyle,
                                false
                            );
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // down button text
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.downButtonText, "<"))
        );

        // up button text
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.upButtonText, ">"))
        );

        // buttonStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "buttonsStyle"));
    }
}

registerClass("UpDownWidget", UpDownWidget);

////////////////////////////////////////////////////////////////////////////////

export class ListGraphWidget extends EmbeddedWidget {
    @observable dwellData?: string;
    @observable y1Data?: string;
    @observable y1Style: Style;
    @observable y2Data?: string;
    @observable y2Style: Style;
    @observable cursorData?: string;
    @observable cursorStyle: Style;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_LIST_GRAPH,

        properties: [
            makeDataPropertyInfo("dwellData"),
            makeDataPropertyInfo("y1Data"),
            makeStylePropertyInfo("y1Style"),
            makeStylePropertyInfo("y2Style"),
            makeStylePropertyInfo("cursorStyle"),
            makeDataPropertyInfo("y2Data"),
            makeDataPropertyInfo("cursorData")
        ],

        beforeLoadHook: (object: IEezObject, jsObject: any) => {
            migrateStyleProperty(jsObject, "y1Style");
            migrateStyleProperty(jsObject, "y2Style");
            migrateStyleProperty(jsObject, "cursorStyle");
        },

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/ListGraph.png",

        check: (object: ListGraphWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            const project = getProject(object);

            if (object.dwellData) {
                if (!findVariable(project, object.dwellData)) {
                    messages.push(propertyNotFoundMessage(object, "dwellData"));
                }
            } else {
                messages.push(propertyNotSetMessage(object, "dwellData"));
            }

            if (object.y1Data) {
                if (!findVariable(project, object.y1Data)) {
                    messages.push(propertyNotFoundMessage(object, "y1Data"));
                }
            } else {
                messages.push(propertyNotSetMessage(object, "y1Data"));
            }

            if (object.y2Data) {
                if (!findVariable(project, object.y2Data)) {
                    messages.push(propertyNotFoundMessage(object, "y2Data"));
                }
            } else {
                messages.push(propertyNotSetMessage(object, "y2Data"));
            }

            if (object.cursorData) {
                if (!findVariable(project, object.cursorData)) {
                    messages.push(
                        propertyNotFoundMessage(object, "cursorData")
                    );
                }
            } else {
                messages.push(propertyNotSetMessage(object, "cursorData"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let listGraphWidget = this;
                            let style = listGraphWidget.style;

                            let x1 = 0;
                            let y1 = 0;
                            let x2 = this.width - 1;
                            let y2 = this.height - 1;

                            const borderSize = style.borderSizeRect;
                            let borderRadius = styleGetBorderRadius(style) || 0;
                            if (
                                borderSize.top > 0 ||
                                borderSize.right > 0 ||
                                borderSize.bottom > 0 ||
                                borderSize.left > 0
                            ) {
                                draw.setColor(style.borderColorProperty);
                                draw.fillRect(
                                    ctx,
                                    x1,
                                    y1,
                                    x2,
                                    y2,
                                    borderRadius
                                );
                                x1 += borderSize.left;
                                y1 += borderSize.top;
                                x2 -= borderSize.right;
                                y2 -= borderSize.bottom;
                                borderRadius = Math.max(
                                    borderRadius -
                                        Math.max(
                                            borderSize.top,
                                            borderSize.right,
                                            borderSize.bottom,
                                            borderSize.left
                                        ),
                                    0
                                );
                            }

                            draw.setColor(style.backgroundColorProperty);
                            draw.fillRect(ctx, x1, y1, x2, y2, borderRadius);
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // dwellData
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "dwellData"));
        // y1Data
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "y1Data"));
        // y1Style
        dataBuffer.writeInt16(assets.getStyleIndex(this, "y1Style"));
        // y2Data
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "y2Data"));
        // y2Style
        dataBuffer.writeInt16(assets.getStyleIndex(this, "y2Style"));
        // cursorData
        dataBuffer.writeInt16(
            assets.getWidgetDataItemIndex(this, "cursorData")
        );
        // cursorStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "cursorStyle"));
    }
}

registerClass("ListGraphWidget", ListGraphWidget);

////////////////////////////////////////////////////////////////////////////////

export class AppViewWidget extends EmbeddedWidget {
    @observable page: string;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_APP_VIEW,

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/AppView.png",

        check: (object: AppViewWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        if (!this.data) {
            return null;
        }

        const pageName = flowContext.dataContext.get(this.data);
        if (!pageName) {
            return null;
        }

        const page = findPage(getProject(this), pageName);
        if (!page) {
            return null;
        }

        return page.render(flowContext);
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {}
}

registerClass("AppViewWidget", AppViewWidget);

////////////////////////////////////////////////////////////////////////////////

export class ScrollBarWidget extends EmbeddedWidget {
    @observable thumbStyle: Style;
    @observable buttonsStyle: Style;
    @observable leftButtonText?: string;
    @observable rightButtonText?: string;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_SCROLL_BAR,

        properties: [
            makeStylePropertyInfo("thumbStyle"),
            makeStylePropertyInfo("buttonsStyle"),
            makeTextPropertyInfo("leftButtonText"),
            makeTextPropertyInfo("rightButtonText")
        ],

        defaultValue: {
            left: 0,
            top: 0,
            width: 128,
            height: 32,
            leftButtonText: "<",
            rightButtonText: ">"
        },

        icon: "../home/_images/widgets/UpDown.png",

        check: (object: ScrollBarWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            if (!object.leftButtonText) {
                messages.push(propertyNotSetMessage(object, "leftButtonText"));
            }

            if (!object.rightButtonText) {
                messages.push(propertyNotSetMessage(object, "rightButtonText"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let widget = this;

                            const buttonsFont = styleGetFont(
                                widget.buttonsStyle
                            );
                            if (!buttonsFont) {
                                return;
                            }

                            let isHorizontal = this.width > this.height;

                            let buttonSize = isHorizontal
                                ? this.height
                                : this.width;

                            // draw left button
                            drawText(
                                ctx,
                                widget.leftButtonText || "<",
                                0,
                                0,
                                isHorizontal ? buttonSize : this.width,
                                isHorizontal ? this.height : buttonSize,
                                widget.buttonsStyle,
                                false
                            );

                            // draw track
                            let x;
                            let y;
                            let width;
                            let height;

                            if (isHorizontal) {
                                x = buttonSize;
                                y = 0;
                                width = this.width - 2 * buttonSize;
                                height = this.height;
                            } else {
                                x = 0;
                                y = buttonSize;
                                width = this.width;
                                height = this.height - 2 * buttonSize;
                            }

                            draw.setColor(this.style.colorProperty);
                            draw.fillRect(
                                ctx,
                                x,
                                y,
                                x + width - 1,
                                y + height - 1,
                                0
                            );

                            // draw thumb
                            const [size, position, pageSize] = (widget.data &&
                                flowContext.dataContext.get(widget.data)) || [
                                100, 25, 20
                            ];

                            let xThumb;
                            let widthThumb;
                            let yThumb;
                            let heightThumb;

                            if (isHorizontal) {
                                xThumb = Math.floor((position * width) / size);
                                widthThumb = Math.max(
                                    Math.floor((pageSize * width) / size),
                                    buttonSize
                                );
                                yThumb = y;
                                heightThumb = height;
                            } else {
                                xThumb = x;
                                widthThumb = width;
                                yThumb = Math.floor((position * height) / size);
                                heightThumb = Math.max(
                                    Math.floor((pageSize * height) / size),
                                    buttonSize
                                );
                            }

                            draw.setColor(this.thumbStyle.colorProperty);
                            draw.fillRect(
                                ctx,
                                xThumb,
                                yThumb,
                                xThumb + widthThumb - 1,
                                yThumb + heightThumb - 1,
                                0
                            );

                            // draw right button
                            drawText(
                                ctx,
                                widget.rightButtonText || ">",
                                isHorizontal ? this.width - buttonSize : 0,
                                isHorizontal ? 0 : this.height - buttonSize,
                                isHorizontal ? buttonSize : this.width,
                                isHorizontal ? this.height : buttonSize,
                                widget.buttonsStyle,
                                false
                            );
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // thumbStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "thumbStyle"));

        // buttonStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "buttonsStyle"));

        // down button text
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.leftButtonText, "<"))
        );

        // up button text
        dataBuffer.writeObjectOffset(() =>
            dataBuffer.writeString(buildWidgetText(this.rightButtonText, ">"))
        );
    }
}

registerClass("ScrollBarWidget", ScrollBarWidget);

////////////////////////////////////////////////////////////////////////////////

export class ProgressWidget extends EmbeddedWidget {
    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_PROGRESS,

        defaultValue: {
            left: 0,
            top: 0,
            width: 128,
            height: 32
        },

        icon: "../home/_images/widgets/Progress.png"
    });

    getPercent(flowContext: IFlowContext) {
        if (
            flowContext.DocumentStore.project.isDashboardProject ||
            flowContext.DocumentStore.project.isAppletProject
        ) {
            if (this.data) {
                if (flowContext.flowState) {
                    try {
                        const value = evalExpression(
                            flowContext,
                            this,
                            this.data
                        );

                        if (value != null && value != undefined) {
                            return value;
                        }
                    } catch (err) {
                        console.error(err);
                    }
                    return 0;
                }

                if (flowContext.DocumentStore.runtime) {
                    return 0;
                }

                try {
                    const result = evalConstantExpression(
                        ProjectEditor.getProject(this),
                        this.data
                    );
                    if (typeof result.value === "string") {
                        return result.value;
                    }
                } catch (err) {}

                return 25;
            }

            if (flowContext.flowState) {
                return 0;
            }

            return 25;
        }

        if (this.data) {
            const result = flowContext.dataContext.get(this.data);
            if (result != undefined) {
                return result;
            }
        }

        return 25;
    }

    render(flowContext: IFlowContext) {
        const percent = this.getPercent(flowContext);

        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? (
                    <div className="progress">
                        <div
                            className="progress-bar"
                            role="progressbar"
                            style={{ width: percent + "%" }}
                        ></div>
                    </div>
                ) : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let isHorizontal = this.width > this.height;

                            draw.setColor(this.style.backgroundColorProperty);
                            draw.fillRect(
                                ctx,
                                0,
                                0,
                                this.width - 1,
                                this.height - 1,
                                0
                            );

                            // draw thumb
                            draw.setColor(this.style.colorProperty);
                            if (isHorizontal) {
                                draw.fillRect(
                                    ctx,
                                    0,
                                    0,
                                    (percent * this.width) / 100 - 1,
                                    this.height - 1,
                                    0
                                );
                            } else {
                                draw.fillRect(
                                    ctx,
                                    0,
                                    this.height - (percent * this.height) / 100,
                                    this.width - 1,
                                    this.height - 1,
                                    0
                                );
                            }
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {}
}

registerClass("ProgressWidget", ProgressWidget);

////////////////////////////////////////////////////////////////////////////////

export class CanvasWidget extends EmbeddedWidget {
    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_CANVAS,

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32
        },

        icon: "../home/_images/widgets/Canvas.png",

        check: (object: CanvasWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let widget = this;
                            let style = widget.style;

                            let x1 = 0;
                            let y1 = 0;
                            let x2 = this.width - 1;
                            let y2 = this.height - 1;

                            draw.setColor(style.backgroundColorProperty);
                            draw.fillRect(ctx, x1, y1, x2, y2, 0);
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {}
}

registerClass("CanvasWidget", CanvasWidget);

////////////////////////////////////////////////////////////////////////////////

export class GaugeEmbeddedWidget extends EmbeddedWidget {
    @observable min: string;
    @observable max: string;
    @observable threshold: string;
    @observable unit: string;
    @observable barStyle: Style;
    @observable valueStyle: Style;
    @observable ticksStyle: Style;
    @observable thresholdStyle: Style;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_GAUGE,

        properties: [
            makeDataPropertyInfo("min"),
            makeDataPropertyInfo("max"),
            makeDataPropertyInfo("threshold"),
            makeDataPropertyInfo("unit"),
            makeStylePropertyInfo("barStyle"),
            makeStylePropertyInfo("valueStyle"),
            makeStylePropertyInfo("ticksStyle"),
            makeStylePropertyInfo("thresholdStyle")
        ],

        defaultValue: {
            left: 0,
            top: 0,
            width: 128,
            height: 128
        },

        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 1000 678.666015625"
            >
                <path d="M406 509.333c22.667-37.333 94-132 214-284S804.667 0 814 5.333c8 4-24 96.667-96 278s-118 290-138 326c-33.333 57.333-78.667 69.333-136 36s-70-78.667-38-136m94-380c-112 0-206.667 42.333-284 127s-116 188.333-116 311c0 20 .667 35.333 2 46 1.333 14.667-2.667 27-12 37s-20.667 15.667-34 17c-13.333 1.333-25.333-2.667-36-12-10.667-9.333-16.667-20.667-18-34 0-5.333-.333-14-1-26s-1-21.333-1-28c0-150.667 48.333-278 145-382s215-156 355-156c48 0 92.667 6 134 18l-70 86c-26.667-2.667-48-4-64-4m362 62c92 102.667 138 228 138 376 0 25.333-.667 44-2 56-1.333 13.333-6.667 24.333-16 33-9.333 8.667-20.667 13-34 13h-4c-14.667-2.667-26.333-9.333-35-20-8.667-10.667-12.333-22.667-11-36 1.333-9.333 2-24.667 2-46 0-100-26.667-189.333-80-268 4-9.333 10.667-26.333 20-51s16.667-43.667 22-57" />
            </svg>
        ),

        check: (object: CanvasWidget) => {
            let messages: Message[] = [];

            if (!object.data) {
                messages.push(propertyNotSetMessage(object, "data"));
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        let widget = this;
        let style = widget.style;

        // draw border
        function arcBorder(
            ctx: CanvasRenderingContext2D,
            xCenter: number,
            yCenter: number,
            radOuter: number,
            radInner: number
        ) {
            if (radOuter < 0 || radInner < 0) {
                return;
            }

            ctx.moveTo(xCenter - radOuter, yCenter);

            ctx.arcTo(
                xCenter - radOuter,
                yCenter - radOuter,
                xCenter + radOuter,
                yCenter - radOuter,
                radOuter
            );

            ctx.arcTo(
                xCenter + radOuter,
                yCenter - radOuter,
                xCenter + radOuter,
                yCenter,
                radOuter
            );

            ctx.lineTo(xCenter + radInner, yCenter);

            ctx.arcTo(
                xCenter + radInner,
                yCenter - radInner,
                xCenter - radInner,
                yCenter - radInner,
                radInner
            );

            ctx.arcTo(
                xCenter - radInner,
                yCenter - radInner,
                xCenter - radInner,
                yCenter,
                radInner
            );

            ctx.lineTo(xCenter - radOuter, yCenter);
        }

        // draw bar
        function arcBar(
            ctx: CanvasRenderingContext2D,
            xCenter: number,
            yCenter: number,
            rad: number
        ) {
            if (rad < 0) {
                return;
            }

            ctx.moveTo(xCenter - rad, yCenter);

            ctx.arcTo(
                xCenter - rad,
                yCenter - rad,

                xCenter + rad,
                yCenter - rad,

                rad
            );

            ctx.arcTo(
                xCenter + rad,
                yCenter - rad,

                xCenter + rad,
                yCenter,

                rad
            );
        }

        function firstTick(n: number) {
            const p = Math.pow(10, Math.floor(Math.log10(n / 6)));
            let f = n / 6 / p;
            let i;
            if (f > 5) {
                i = 10;
            } else if (f > 2) {
                i = 5;
            } else {
                i = 2;
            }
            return i * p;
        }

        const drawGauge = (ctx: CanvasRenderingContext2D) => {
            // min
            let min;
            let max;
            let value;
            let threshold;
            let unit;

            try {
                min = evalExpression(flowContext, this, this.min);
                max = evalExpression(flowContext, this, this.max);
                value =
                    this.data && evalExpression(flowContext, this, this.data);
                threshold = evalExpression(flowContext, this, this.threshold);
                unit =
                    this.data && evalExpression(flowContext, this, this.unit);
            } catch (err) {
                console.error(err);
            }

            if (
                !(typeof min == "number") ||
                isNaN(min) ||
                !isFinite(min) ||
                !(typeof max == "number") ||
                isNaN(max) ||
                !isFinite(max) ||
                !(typeof value == "number") ||
                isNaN(value) ||
                !isFinite(value) ||
                min >= max
            ) {
                min = 0;
                max = 1.0;
                value = 0;
            } else {
                if (value < min) {
                    value = min;
                } else if (value > max) {
                    value = max;
                }
            }

            let valueStyle = widget.valueStyle;
            let barStyle = widget.barStyle;
            let ticksStyle = widget.ticksStyle;
            let thresholdStyle = widget.thresholdStyle;

            let w = this.width;
            let h = this.height;

            // frame
            if (w > 0 && h > 0) {
                let x1 = 0;
                let y1 = 0;
                let x2 = w - 1;
                let y2 = h - 1;

                const borderSize = style.borderSizeRect;
                let borderRadius = styleGetBorderRadius(style) || 0;
                if (
                    borderSize.top > 0 ||
                    borderSize.right > 0 ||
                    borderSize.bottom > 0 ||
                    borderSize.left > 0
                ) {
                    draw.setColor(style.borderColorProperty);
                    draw.fillRect(ctx, x1, y1, x2, y2, borderRadius);
                    x1 += borderSize.left;
                    y1 += borderSize.top;
                    x2 -= borderSize.right;
                    y2 -= borderSize.bottom;
                    borderRadius = Math.max(
                        borderRadius -
                            Math.max(
                                borderSize.top,
                                borderSize.right,
                                borderSize.bottom,
                                borderSize.left
                            ),
                        0
                    );
                }

                draw.setColor(style.backgroundColorProperty);
                draw.fillRect(ctx, x1, y1, x2, y2, borderRadius);
            }

            const PADDING_HORZ = 56;
            const TICK_LINE_LENGTH = 5;
            const TICK_LINE_WIDTH = 1;
            const TICK_TEXT_GAP = 1;
            const THRESHOLD_LINE_WIDTH = 2;

            const xCenter = w / 2;
            const yCenter = h - 8;

            // draw border
            const radBorderOuter = (w - PADDING_HORZ) / 2;

            const BORDER_WIDTH = Math.round(radBorderOuter / 3);
            const BAR_WIDTH = BORDER_WIDTH / 2;

            const radBorderInner = radBorderOuter - BORDER_WIDTH;
            ctx.beginPath();
            ctx.strokeStyle = style.colorProperty;
            ctx.lineWidth = 1.5;
            arcBorder(ctx, xCenter, yCenter, radBorderOuter, radBorderInner);
            ctx.stroke();

            // draw bar
            const radBar = (w - PADDING_HORZ) / 2 - BORDER_WIDTH / 2;
            const angle = remap(value, min, 0.0, max, 180.0);
            ctx.beginPath();
            ctx.strokeStyle = barStyle.colorProperty;
            ctx.lineWidth = BAR_WIDTH;
            ctx.setLineDash([
                (radBar * angle * Math.PI) / 180,
                radBar * Math.PI
            ]);
            arcBar(ctx, xCenter, yCenter, radBar);
            ctx.stroke();

            // draw threshold
            const thresholdAngleDeg = remap(threshold, min, 180.0, max, 0);
            if (thresholdAngleDeg >= 0 && thresholdAngleDeg <= 180.0) {
                const tickAngle = (thresholdAngleDeg * Math.PI) / 180;
                const x1 =
                    xCenter + (radBar - BAR_WIDTH / 2) * Math.cos(tickAngle);
                const y1 =
                    yCenter - (radBar - BAR_WIDTH / 2) * Math.sin(tickAngle);

                const x2 =
                    xCenter + (radBar + BAR_WIDTH / 2) * Math.cos(tickAngle);
                const y2 =
                    yCenter - (radBar + BAR_WIDTH / 2) * Math.sin(tickAngle);

                ctx.beginPath();
                ctx.strokeStyle = thresholdStyle.colorProperty;
                ctx.lineWidth = THRESHOLD_LINE_WIDTH;
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            // draw ticks
            const ticksfont = styleGetFont(ticksStyle);
            const ft = firstTick(max - min);
            const ticksRad = radBorderOuter + 1;
            for (let tickValueIndex = 0; ; tickValueIndex++) {
                const tickValue = roundNumber(min + tickValueIndex * ft, 9);
                if (tickValue > max) {
                    break;
                }
                const tickAngleDeg = remap(tickValue, min, 180.0, max, 0.0);
                if (tickAngleDeg <= 180.0) {
                    const tickAngle = (tickAngleDeg * Math.PI) / 180;
                    const x1 = xCenter + ticksRad * Math.cos(tickAngle);
                    const y1 = yCenter - ticksRad * Math.sin(tickAngle);

                    const x2 =
                        xCenter +
                        (ticksRad + TICK_LINE_LENGTH) * Math.cos(tickAngle);
                    const y2 =
                        yCenter -
                        (ticksRad + TICK_LINE_LENGTH) * Math.sin(tickAngle);

                    ctx.beginPath();
                    ctx.strokeStyle = ticksStyle.colorProperty;
                    ctx.lineWidth = TICK_LINE_WIDTH;
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();

                    if (ticksfont) {
                        const tickText = unit
                            ? `${tickValue} ${unit}`
                            : tickValue.toString();

                        const tickTextWidth = draw.measureStr(
                            tickText,
                            ticksfont,
                            -1
                        );
                        if (tickAngleDeg == 180.0) {
                            drawText(
                                ctx,
                                tickText,
                                xCenter -
                                    radBorderOuter -
                                    TICK_TEXT_GAP -
                                    tickTextWidth,
                                y2 - TICK_TEXT_GAP - ticksfont.ascent,
                                tickTextWidth,
                                ticksfont.ascent,
                                ticksStyle,
                                false
                            );
                        } else if (tickAngleDeg > 90.0) {
                            drawText(
                                ctx,
                                tickText,
                                x2 - TICK_TEXT_GAP - tickTextWidth,
                                y2 - TICK_TEXT_GAP - ticksfont.ascent,
                                tickTextWidth,
                                ticksfont.ascent,
                                ticksStyle,
                                false
                            );
                        } else if (tickAngleDeg == 90.0) {
                            drawText(
                                ctx,
                                tickText,
                                x2 - tickTextWidth / 2,
                                y2 - TICK_TEXT_GAP - ticksfont.ascent,
                                tickTextWidth,
                                ticksfont.ascent,
                                ticksStyle,
                                false
                            );
                        } else if (tickAngleDeg > 0) {
                            drawText(
                                ctx,
                                tickText,
                                x2 + TICK_TEXT_GAP,
                                y2 - TICK_TEXT_GAP - ticksfont.ascent,
                                tickTextWidth,
                                ticksfont.ascent,
                                ticksStyle,
                                false
                            );
                        } else {
                            drawText(
                                ctx,
                                tickText,
                                xCenter + radBorderOuter + TICK_TEXT_GAP,
                                y2 - TICK_TEXT_GAP - ticksfont.ascent,
                                tickTextWidth,
                                ticksfont.ascent,
                                ticksStyle,
                                false
                            );
                        }
                    }
                }
            }

            // draw value
            const font = styleGetFont(valueStyle);
            if (font) {
                const valueText = unit ? `${value} ${unit}` : value.toString();
                const valueTextWidth = draw.measureStr(valueText, font, -1);
                drawText(
                    ctx,
                    valueText,
                    xCenter - valueTextWidth / 2,
                    yCenter - font.height,
                    valueTextWidth,
                    font.height,
                    valueStyle,
                    false
                );
            }
        };

        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas component={this} draw={drawGauge} />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // min
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "min"));

        // max
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "max"));

        // threshold
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "threshold"));

        // unit
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "unit"));

        // barStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "barStyle"));

        // valueStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "valueStyle"));

        // ticksStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "ticksStyle"));

        // thresholdStyle
        dataBuffer.writeInt16(assets.getStyleIndex(this, "thresholdStyle"));
    }
}

registerClass("GaugeEmbeddedWidget", GaugeEmbeddedWidget);

////////////////////////////////////////////////////////////////////////////////

export class InputEmbeddedWidget extends EmbeddedWidget {
    @observable inputType: "text" | "number";

    @observable password: boolean;

    @observable min: string;
    @observable max: string;

    @observable precision: string;
    @observable unit: string;

    static classInfo = makeDerivedClassInfo(EmbeddedWidget.classInfo, {
        flowComponentId: WIDGET_TYPE_INPUT,

        properties: [
            {
                name: "inputType",
                type: PropertyType.Enum,
                propertyGridGroup: specificGroup,
                enumItems: [
                    {
                        id: "number"
                    },
                    {
                        id: "text"
                    }
                ]
            },
            {
                ...makeDataPropertyInfo("min"),
                displayName: (widget: InputEmbeddedWidget) =>
                    widget.inputType === "text" ? "Min chars" : "Min"
            },
            {
                ...makeDataPropertyInfo("max"),
                displayName: (widget: InputEmbeddedWidget) =>
                    widget.inputType === "text" ? "Max chars" : "Max"
            },
            {
                ...makeDataPropertyInfo("precision"),
                hideInPropertyGrid: (widget: InputEmbeddedWidget) =>
                    widget.inputType != "number"
            },
            {
                ...makeDataPropertyInfo("unit"),
                hideInPropertyGrid: (widget: InputEmbeddedWidget) =>
                    widget.inputType != "number"
            },
            {
                name: "password",
                type: PropertyType.Boolean,
                hideInPropertyGrid: (widget: InputEmbeddedWidget) =>
                    widget.inputType != "text",
                propertyGridGroup: specificGroup
            }
        ],

        defaultValue: {
            left: 0,
            top: 0,
            width: 120,
            height: 40,
            inputType: "number"
        },

        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M12 3a3 3 0 0 0 -3 3v12a3 3 0 0 0 3 3"></path>
                <path d="M6 3a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3"></path>
                <path d="M13 7h7a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-7"></path>
                <path d="M5 7h-1a1 1 0 0 0 -1 1v8a1 1 0 0 0 1 1h1"></path>
                <path d="M17 12h.01"></path>
                <path d="M13 12h.01"></path>
            </svg>
        ),

        check: (widget: InputEmbeddedWidget) => {
            let messages: Message[] = [];

            if (!widget.data) {
                messages.push(propertyNotSetMessage(widget, "data"));
            }

            if (!widget.min) {
                messages.push(propertyNotSetMessage(widget, "min"));
            }

            if (!widget.max) {
                messages.push(propertyNotSetMessage(widget, "min"));
            }

            if (widget.type === "number") {
                if (!widget.precision) {
                    messages.push(propertyNotSetMessage(widget, "precision"));
                }
            }

            if (widget.type === "number") {
                if (!widget.unit) {
                    messages.push(propertyNotSetMessage(widget, "unit"));
                }
            }

            return messages;
        },

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType !== ProjectType.DASHBOARD
    });

    render(flowContext: IFlowContext) {
        return (
            <>
                {flowContext.DocumentStore.project.isDashboardProject ? null : (
                    <ComponentCanvas
                        component={this}
                        draw={(ctx: CanvasRenderingContext2D) => {
                            let text;

                            if (flowContext.flowState) {
                                if (this.data) {
                                    try {
                                        text = evalExpression(
                                            flowContext,
                                            this,
                                            this.data
                                        );
                                    } catch (err) {
                                        console.error(err);
                                        text = "";
                                    }
                                } else {
                                    text = "";
                                }
                            } else {
                                text = `{${this.data}}`;
                            }

                            let unit;

                            if (flowContext.flowState) {
                                if (this.unit) {
                                    try {
                                        unit = evalExpression(
                                            flowContext,
                                            this,
                                            this.unit
                                        );
                                    } catch (err) {
                                        console.error(err);
                                        unit = "";
                                    }
                                } else {
                                    unit = "";
                                }
                            } else {
                                unit = "";
                            }

                            drawText(
                                ctx,
                                text + (unit ? " " + unit : ""),
                                0,
                                0,
                                this.width,
                                this.height,
                                this.style,
                                false
                            );
                        }}
                    />
                )}
                {super.render(flowContext)}
            </>
        );
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // flags
        let flags = 0;

        const INPUT_WIDGET_TYPE_TEXT = 0x0001;
        const INPUT_WIDGET_TYPE_NUMBER = 0x0002;
        const INPUT_WIDGET_PASSWORD_FLAG = 0x0100;

        if (this.inputType === "text") {
            flags |= INPUT_WIDGET_TYPE_TEXT;
            if (this.password) {
                flags |= INPUT_WIDGET_PASSWORD_FLAG;
            }
        } else if (this.inputType === "number") {
            flags |= INPUT_WIDGET_TYPE_NUMBER;
        }

        dataBuffer.writeUint16(flags);

        // min
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "min"));

        // max
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "max"));

        // precision
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "precision"));

        // unit
        dataBuffer.writeInt16(assets.getWidgetDataItemIndex(this, "unit"));

        // component index
        dataBuffer.writeUint16(assets.getComponentIndex(this));
    }
}

registerClass("InputEmbeddedWidget", InputEmbeddedWidget);

////////////////////////////////////////////////////////////////////////////////

class TextInputRunningState {
    constructor(value: string) {
        this.value = value;
    }

    @observable value: string;
}

export class TextInputWidget extends Widget {
    static classInfo = makeDerivedClassInfo(Widget.classInfo, {
        properties: [
            {
                name: "password",
                type: PropertyType.Boolean
            },
            makeDataPropertyInfo("data", {
                displayName: "Value"
            })
        ],
        defaultValue: {
            left: 0,
            top: 0,
            width: 160,
            height: 32,
            title: ""
        },

        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M12 3a3 3 0 0 0 -3 3v12a3 3 0 0 0 3 3"></path>
                <path d="M6 3a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3"></path>
                <path d="M13 7h7a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-7"></path>
                <path d="M5 7h-1a1 1 0 0 0 -1 1v8a1 1 0 0 0 1 1h1"></path>
                <path d="M17 12h.01"></path>
                <path d="M13 12h.01"></path>
            </svg>
        ),

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.DASHBOARD
    });

    @observable password: boolean;

    getOutputs(): ComponentOutput[] {
        return [
            ...super.getOutputs(),
            {
                name: "value",
                type: "string",
                isSequenceOutput: false,
                isOptionalOutput: false
            }
        ];
    }

    render(flowContext: IFlowContext): React.ReactNode {
        const runningState =
            flowContext.flowState?.getComponentRunningState<TextInputRunningState>(
                this
            );

        let value = runningState?.value ?? "";

        return (
            <>
                <input
                    type="text"
                    value={value}
                    onChange={event => {
                        const value = event.target.value;
                        if (runningState && runningState.value != value) {
                            runInAction(() => (runningState.value = value));

                            if (flowContext.flowState) {
                                (
                                    flowContext.flowState as FlowState
                                ).runtime.propagateValue(
                                    flowContext.flowState as FlowState,
                                    this,
                                    "value",
                                    value
                                );
                            }
                        }
                    }}
                ></input>
                {super.render(flowContext)}
            </>
        );
    }

    async execute(
        flowState: FlowState,
        dispose: (() => void) | undefined
    ): Promise<(() => void) | undefined | boolean> {
        const runningState =
            flowState.getComponentRunningState<TextInputRunningState>(this);

        let value = this.data ? flowState.evalExpression(this, this.data) : "";

        if (!runningState) {
            flowState.setComponentRunningState(
                this,
                new TextInputRunningState(value)
            );
        } else {
            if (value != runningState.value) {
                runInAction(() => (runningState.value = value));
            }
        }

        if (dispose) {
            return dispose;
        }

        return reaction(
            () => {
                try {
                    return this.data
                        ? flowState.evalExpression(this, this.data)
                        : "";
                } catch (err) {
                    if (err instanceof ExpressionEvalError) {
                        return undefined;
                    } else {
                        throw err;
                    }
                }
            },
            value => {
                const runningState =
                    flowState.getComponentRunningState<TextInputRunningState>(
                        this
                    );
                if (runningState) {
                    runInAction(() => (runningState.value = value));
                }
            }
        );
    }
}

registerClass("TextInputWidget", TextInputWidget);

////////////////////////////////////////////////////////////////////////////////

export class CheckboxWidget extends Widget {
    static classInfo = makeDerivedClassInfo(Widget.classInfo, {
        properties: [
            makeDataPropertyInfo("data", {
                displayName: "Value"
            }),
            makeExpressionProperty(
                {
                    name: "label",
                    type: PropertyType.MultilineText,
                    propertyGridGroup: specificGroup
                },
                "string"
            ),
            makeActionPropertyInfo("action", {
                displayName: "onChange"
            })
        ],
        defaultValue: {
            left: 0,
            top: 0,
            width: 120,
            height: 20
        },

        icon: (
            <svg viewBox="0 0 1280 1279">
                <path d="M1052 225.7c-13 8-54 35.2-66.2 43.9l-11.8 8.5-11.8-7.8c-28.8-19.1-64.8-34-98.6-40.8-31.8-6.4-10.6-6-307.1-6-280.2 0-275.2-.1-300 4.1-45.9 7.7-92.8 28.7-129.5 58-10.9 8.7-29.7 27.5-38.4 38.4-28.3 35.6-44.7 72.7-52.4 119.4-1.5 9.2-1.7 34.4-2 291.6-.2 183.6.1 286 .7 294.5 2.5 32.4 10.1 60 24.2 88.5 14.2 28.7 31 51.2 54.9 73.5 34.1 32 79.1 55.4 127 66.3 31.7 7.2 6.3 6.7 314.5 6.7h277l14-2.2c92.9-14.9 166.7-67 205-144.8 11-22.4 17.7-43.4 22.2-70.2 1.7-10.3 1.8-24.8 1.8-302.3 0-309.6.2-295.9-4.6-318.5-7.7-36.4-25-72.3-49.7-103.2-7.9-10-9-11.6-7.4-11.1.8.3 35.3-35.7 44.9-46.9 9.4-10.9 11.5-16.3 6.3-16.3-4.1 0-33.1 16.4-40.5 22.9-9.6 8.5-5.3 3.7 17.1-18.7l25.1-25.1-2.9-3.6c-1.6-1.9-3.3-3.5-3.6-3.4-.4 0-4.1 2.1-8.2 4.6zM836.5 334.8c6.1 1.2 14.9 3.3 19.6 4.6 9.6 2.9 25.9 9.4 25.9 10.5 0 .4-8.2 7.8-18.2 16.6-131.9 115.4-266.2 268.4-386.9 441-9.7 13.7-20.7 29.6-24.5 35.3-3.8 5.6-7.4 10-8 9.8-.9-.3-137.4-81.8-218.1-130.2l-7.2-4.3-3 3.8-3.1 3.8 11.2 13.9c49.6 61.6 263.1 323.4 263.7 323.4.4 0 1.3-1 2-2.2.6-1.3.9-1.5.7-.6-.5 1.9 5 7.3 9.1 8.9 3.9 1.5 8.5-1.1 12-6.7 1.6-2.7 7.4-14.4 12.8-25.9 27.4-58.3 76.5-153.1 111-214 84.9-150.1 186.4-294.2 291.8-414.3 6.4-7.4 10.5-12.8 10.1-13.5-.4-.7.3-.3 1.5.8 5.9 5.2 17.2 25.8 22.1 40.3 6.5 19.5 6.1-1.4 5.8 312.7l-.3 285-2.7 10c-1.6 5.5-3.8 12.5-5 15.5-14.9 37.8-46.5 68.6-86.6 84.5-19.1 7.5-34.9 11-56.7 12.5-19 1.3-502.3 1.3-521.3 0-24.3-1.7-44.3-6.7-64.9-16.5-44.7-21.2-74.4-57.1-84-101.8-1.7-7.7-1.8-24.4-1.8-293.2 0-270.2.1-285.4 1.8-293.5 3.8-18 10-32.8 20.3-48.2 25.4-38.2 70.8-64.4 120.9-69.7 4.4-.5 127.5-.8 273.5-.7l265.5.2 11 2.2z" />
            </svg>
        ),

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.DASHBOARD
    });

    @observable label: string;

    getOutputs(): ComponentOutput[] {
        return [...super.getOutputs()];
    }

    getChecked(flowContext: IFlowContext) {
        if (
            flowContext.DocumentStore.project.isDashboardProject ||
            flowContext.DocumentStore.project.isAppletProject
        ) {
            if (this.data) {
                try {
                    return !!evalExpression(flowContext, this, this.data);
                } catch (err) {
                    console.error(err);
                }
            }

            return false;
        }

        if (this.data) {
            return !!flowContext.dataContext.get(this.data);
        }

        return false;
    }

    getLabel(flowContext: IFlowContext) {
        if (
            flowContext.DocumentStore.project.isDashboardProject ||
            flowContext.DocumentStore.project.isAppletProject
        ) {
            if (this.label) {
                try {
                    const value = evalExpression(flowContext, this, this.label);

                    if (value != null && value != undefined) {
                        return value;
                    }
                    return "";
                } catch (err) {
                    console.error(err);
                    return "";
                }
            }

            if (flowContext.flowState) {
                return "";
            }

            return "<no label>";
        }

        if (this.label) {
            const result = flowContext.dataContext.get(this.label);
            if (result != undefined) {
                return result;
            }
            return this.label;
        }

        return "<no label>";
    }

    render(flowContext: IFlowContext): React.ReactNode {
        let checked = this.getChecked(flowContext);

        let index;
        if (flowContext.dataContext.has(FLOW_ITERATOR_INDEX_VARIABLE)) {
            index = flowContext.dataContext.get(FLOW_ITERATOR_INDEX_VARIABLE);
        } else {
            index = 0;
        }

        let id = "CheckboxWidgetInput-" + getId(this);
        if (index > 0) {
            id = id + "-" + index;
        }

        return (
            <>
                <div className="form-check">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={event => {
                            const flowState =
                                flowContext.flowState as FlowState;
                            if (flowState) {
                                const checked = event.target.checked;

                                if (this.data) {
                                    flowState.runtime.assignValue(
                                        flowContext,
                                        this,
                                        this.data!,
                                        checked
                                    );
                                }

                                if (flowState.runtime) {
                                    flowState.runtime.executeWidgetAction(
                                        flowContext,
                                        this,
                                        checked
                                    );
                                }
                            }
                        }}
                        id={id}
                    ></input>
                    <label className="form-check-label" htmlFor={id}>
                        {this.getLabel(flowContext)}
                    </label>
                </div>
                {super.render(flowContext)}
            </>
        );
    }
}

registerClass("CheckboxWidget", CheckboxWidget);
