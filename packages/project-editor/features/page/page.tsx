import React from "react";
import { observable, computed, makeObservable } from "mobx";
import classNames from "classnames";

import { _find } from "eez-studio-shared/algorithm";
import { to16bitsColor } from "eez-studio-shared/color";

import {
    IEezObject,
    EezObject,
    ClassInfo,
    registerClass,
    PropertyType,
    getParent,
    getId,
    makeDerivedClassInfo,
    MessageType,
    PropertyInfo,
    getProperty,
    LVGL_FLAG_CODES
} from "project-editor/core/object";
import {
    createObject,
    getChildOfObject,
    getProjectStore,
    getLabel,
    Message,
    propertyInvalidValueMessage,
    propertyNotFoundMessage
} from "project-editor/store";
import {
    isDashboardProject,
    isLVGLProject,
    isNotLVGLProject
} from "project-editor/project/project-type-traits";

import type {
    IResizeHandler,
    IFlowContext
} from "project-editor/flow/flow-interfaces";
import {
    ComponentsContainerEnclosure,
    ComponentEnclosure,
    ComponentCanvas
} from "project-editor/flow/editor/render";

import type { Project } from "project-editor/project/project";

import { AutoSize, Component, Widget } from "project-editor/flow/component";
import {
    generalGroup,
    styleGroup,
    geometryGroup
} from "project-editor/ui-components/PropertyGrid/groups";

import { findStyle } from "project-editor/features/style/style";
import { getThemedColor } from "project-editor/features/style/theme";
import { Flow } from "project-editor/flow/flow";
import type { Assets, DataBuffer } from "project-editor/build/assets";
import { buildWidget } from "project-editor/build/widgets";
import { WIDGET_TYPE_CONTAINER } from "project-editor/flow/components/component_types";
import { ProjectEditor } from "project-editor/project-editor-interface";
import { showGenericDialog } from "eez-studio-ui/generic-dialog";
import { validators } from "eez-studio-shared/validation";
import { drawBackground } from "project-editor/flow/editor/draw";
import type { WasmRuntime } from "project-editor/flow/runtime/wasm-runtime";
import { LVGLPage } from "project-editor/lvgl/Page";
import type { LVGLPageRuntime } from "project-editor/lvgl/page-runtime";
import { LVGLStylesDefinitionProperty } from "project-editor/lvgl/LVGLStylesDefinitionProperty";
import type { LVGLBuild } from "project-editor/lvgl/build";
import { visitObjects } from "project-editor/core/search";
import type { LVGLWidget } from "project-editor/lvgl/widgets";
import { LVGLStylesDefinition } from "project-editor/lvgl/style-definition";
import { getCode } from "project-editor/lvgl/widget-common";
import { lvglBuildPageTimeline } from "project-editor/flow/timeline";

////////////////////////////////////////////////////////////////////////////////

export class PageOrientation extends EezObject {
    x: number;
    y: number;
    width: number;
    height: number;
    style?: string;
    components: Component[];

    static classInfo: ClassInfo = {
        properties: [
            {
                name: "x",
                type: PropertyType.Number,
                propertyGridGroup: geometryGroup
            },
            {
                name: "y",
                type: PropertyType.Number,
                propertyGridGroup: geometryGroup
            },
            {
                name: "width",
                type: PropertyType.Number,
                propertyGridGroup: geometryGroup
            },
            {
                name: "height",
                type: PropertyType.Number,
                propertyGridGroup: geometryGroup
            },
            {
                name: "style",
                type: PropertyType.ObjectReference,
                referencedObjectCollectionPath: "styles",
                propertyGridGroup: styleGroup
            },
            {
                name: "components",
                type: PropertyType.Array,
                typeClass: Component,
                hideInPropertyGrid: true
            }
        ],
        beforeLoadHook: (object: IEezObject, jsObject: any) => {
            if (jsObject.widgets) {
                jsObject.components = jsObject.widgets;
                delete jsObject.widgets;
            }
        }
    };

    constructor() {
        super();

        makeObservable(this, {
            x: observable,
            y: observable,
            width: observable,
            height: observable,
            style: observable,
            components: observable,
            left: computed,
            top: computed,
            rect: computed,
            closePageIfTouchedOutside: computed
        });
    }

    get left() {
        return this.x;
    }

    get top() {
        return this.y;
    }

    get rect() {
        return {
            left: this.x,
            top: this.y,
            width: this.width,
            height: this.height
        };
    }

    get closePageIfTouchedOutside() {
        return (getParent(this) as Page).closePageIfTouchedOutside;
    }
}

registerClass("PageOrientation", PageOrientation);

////////////////////////////////////////////////////////////////////////////////

export class Page extends Flow {
    id: number | undefined;
    name: string;
    description?: string;
    style?: string;
    usedIn?: string[];
    closePageIfTouchedOutside: boolean;

    left: number;
    top: number;
    width: number;
    height: number;

    scaleToFit: boolean;

    portrait: PageOrientation;

    isUsedAsUserWidget: boolean;

    dataContextOverrides: string;

    lvglLocalStyles: LVGLStylesDefinition;
    _lvglRuntime: LVGLPageRuntime | undefined;
    _lvglObj: number | undefined;

    _refreshCounter: number = 0;

    constructor() {
        super();

        makeObservable(this, {
            id: observable,
            name: observable,
            description: observable,
            style: observable,
            usedIn: observable,
            closePageIfTouchedOutside: observable,
            left: observable,
            top: observable,
            width: observable,
            height: observable,
            scaleToFit: observable,
            portrait: observable,
            isUsedAsUserWidget: observable,
            dataContextOverrides: observable,
            dataContextOverridesObject: computed,
            rect: computed,
            lvglLocalStyles: observable,
            _lvglRuntime: observable,
            _lvglObj: observable,
            _lvglWidgetsIncludingUserWidgets: computed({ keepAlive: true }),
            _lvglWidgets: computed({ keepAlive: true }),
            _refreshCounter: observable
        });
    }

    static classInfo = makeDerivedClassInfo(Flow.classInfo, {
        properties: [
            {
                name: "id",
                type: PropertyType.Number,
                isOptional: true,
                unique: true,
                propertyGridGroup: generalGroup,
                hideInPropertyGrid: isLVGLProject
            },
            {
                name: "name",
                type: PropertyType.String,
                unique: (
                    page: Page,
                    parent: IEezObject,
                    propertyInfo?: PropertyInfo
                ) => {
                    const oldIdentifier = propertyInfo
                        ? getProperty(page, propertyInfo.name)
                        : undefined;

                    return (object: any, ruleName: string) => {
                        const newIdentifer = object[ruleName];
                        if (
                            oldIdentifier != undefined &&
                            newIdentifer == oldIdentifier
                        ) {
                            return null;
                        }

                        if (
                            ProjectEditor.getProjectStore(
                                page
                            ).lvglIdentifiers.getIdentifierByName(
                                page,
                                newIdentifer
                            ) == undefined
                        ) {
                            return null;
                        }

                        return "Not an unique name";
                    };
                },
                propertyGridGroup: generalGroup
            },
            {
                name: "description",
                type: PropertyType.MultilineText,
                propertyGridGroup: generalGroup
            },
            {
                name: "dataContextOverrides",
                displayName: "Data context",
                type: PropertyType.JSON,
                propertyGridGroup: generalGroup,
                hideInPropertyGrid: isLVGLProject
            },
            {
                name: "left",
                type: PropertyType.Number,
                propertyGridGroup: geometryGroup
            },
            {
                name: "top",
                type: PropertyType.Number,
                propertyGridGroup: geometryGroup
            },
            {
                name: "width",
                type: PropertyType.Number,
                propertyGridGroup: geometryGroup
            },
            {
                name: "height",
                type: PropertyType.Number,
                propertyGridGroup: geometryGroup
            },
            {
                name: "scaleToFit",
                type: PropertyType.Boolean,
                propertyGridGroup: geometryGroup,
                hideInPropertyGrid: isLVGLProject
            },
            {
                name: "style",
                type: PropertyType.ObjectReference,
                referencedObjectCollectionPath: "styles",
                propertyGridGroup: styleGroup,
                hideInPropertyGrid: isLVGLProject
            },
            {
                name: "usedIn",
                type: PropertyType.ConfigurationReference,
                referencedObjectCollectionPath: "settings/build/configurations",
                propertyGridGroup: generalGroup,
                hideInPropertyGrid: object =>
                    isDashboardProject(object) || isLVGLProject(object)
            },
            {
                name: "portrait",
                type: PropertyType.Object,
                typeClass: PageOrientation,
                isOptional: true,
                hideInPropertyGrid: true,
                enumerable: false
            },
            {
                name: "isUsedAsUserWidget",
                type: PropertyType.Boolean,
                propertyGridGroup: generalGroup
            },
            {
                name: "closePageIfTouchedOutside",
                type: PropertyType.Boolean,
                propertyGridGroup: generalGroup,
                hideInPropertyGrid: object =>
                    isDashboardProject(object) || isLVGLProject(object)
            },
            {
                name: "lvglLocalStyles",
                displayName: "Local styles",
                type: PropertyType.Object,
                typeClass: LVGLStylesDefinition,
                propertyGridGroup: styleGroup,
                propertyGridCollapsable: true,
                propertyGridRowComponent: LVGLStylesDefinitionProperty,
                enumerable: false,
                hideInPropertyGrid: isNotLVGLProject
            }
        ],
        label: (page: Page) => {
            let label = page.name;
            if (page.isUsedAsUserWidget) {
                label = "[USER WIDGET] " + label;
            }
            return label;
        },
        listLabel: (page: Page) => {
            let label: React.ReactNode = getLabel(page);
            if (page.isRuntimeSelectedPage) {
                label = <strong>{label}</strong>;
            }
            if (page.isRuntimePageWithoutFlowState) {
                label = <span style={{ opacity: 0.5 }}>{label}</span>;
            }
            return label;
        },
        beforeLoadHook: (page: Page, jsObject: any) => {
            /*
            // MIGRATION TO LOW RES
            if (!jsObject.isUsedAsUserWidget) {
                jsObject.width = 480;
                jsObject.height = 272;
            } else {
                jsObject.width = Math.floor((jsObject.width * 480) / 800);
                jsObject.height = Math.floor((jsObject.height * 480) / 800);
            }
            */

            if (jsObject.widgets) {
                jsObject.components = jsObject.widgets;
                delete jsObject.widgets;
            }

            if (jsObject.landscape) {
                Object.assign(jsObject, jsObject.landscape);
                delete jsObject.landscape;
            }

            if (jsObject["x"] !== undefined) {
                jsObject["left"] = jsObject["x"];
                delete jsObject["x"];
            }

            if (jsObject["y"] !== undefined) {
                jsObject["top"] = jsObject["y"];
                delete jsObject["y"];
            }

            if (!jsObject.connectionLines) {
                jsObject.connectionLines = [];
            }

            if (jsObject.css) {
                jsObject.style = jsObject.css;
                delete jsObject.css;
            }

            if (jsObject.isUsedAsCustomWidget != undefined) {
                jsObject.isUsedAsUserWidget = jsObject.isUsedAsCustomWidget;
                delete jsObject.isUsedAsCustomWidget;
            }
        },
        isPropertyMenuSupported: true,
        newItem: async (parent: IEezObject) => {
            const project = ProjectEditor.getProject(parent);

            const result = await showGenericDialog({
                dialogDefinition: {
                    title: "New Page",
                    fields: [
                        {
                            name: "name",
                            type: "string",
                            validators: [
                                validators.required,
                                validators.unique({}, parent)
                            ]
                        }
                    ]
                },
                values: {
                    name: project.pages.length == 0 ? "Main" : ""
                }
            });

            const pageProperties: Partial<Page> = {
                name: result.values.name,
                left: 0,
                top: 0,
                width: project.projectTypeTraits.isDashboard
                    ? 800
                    : project._store.project.settings.general.displayWidth ??
                      480,
                height: project.projectTypeTraits.isDashboard
                    ? 450
                    : project._store.project.settings.general.displayHeight ??
                      272,
                components: []
            };

            const page = createObject<Page>(
                project._store,
                pageProperties,
                Page
            );

            return page;
        },
        icon: "svg:page",
        check: (page: Page) => {
            let messages: Message[] = [];

            const projectStore = getProjectStore(page);

            ProjectEditor.checkAssetId(projectStore, "pages", page, messages);

            if (page.dataContextOverrides) {
                try {
                    JSON.parse(page.dataContextOverrides);
                } catch {
                    messages.push(
                        propertyInvalidValueMessage(
                            page,
                            "dataContextOverrides"
                        )
                    );
                }
            }

            if (page.style && !findStyle(projectStore.project, page.style)) {
                messages.push(propertyNotFoundMessage(page, "style"));
            }

            if (
                projectStore.projectTypeTraits.hasDisplaySizeProperty &&
                !page.isUsedAsUserWidget
            ) {
                const isSimulatorPage =
                    page.usedIn &&
                    page.usedIn.length == 1 &&
                    page.usedIn[0].toLowerCase() == "simulator";

                if (
                    !isSimulatorPage &&
                    projectStore.project.settings.general.displayWidth !=
                        undefined &&
                    page.width !=
                        projectStore.project.settings.general.displayWidth &&
                    !(page.scaleToFit || page.isUsedAsUserWidget)
                ) {
                    messages.push(
                        new Message(
                            MessageType.WARNING,
                            `Width (${page.width}) is different from display width (${projectStore.project.settings.general.displayWidth})`,
                            getChildOfObject(page, "width")
                        )
                    );
                }

                const MAX_WIDTH = 4096;
                const MAX_HEIGHT = 4096;

                if (page.width < 1 || page.width > MAX_WIDTH) {
                    messages.push(
                        new Message(
                            MessageType.ERROR,
                            `Width must be between 1 and ${MAX_WIDTH}`,
                            getChildOfObject(page, "width")
                        )
                    );
                }

                if (
                    !isSimulatorPage &&
                    projectStore.project.settings.general.displayHeight !=
                        undefined &&
                    page.height !=
                        projectStore.project.settings.general.displayHeight &&
                    !(page.scaleToFit || page.isUsedAsUserWidget)
                ) {
                    messages.push(
                        new Message(
                            MessageType.WARNING,
                            `Height (${page.height}) is different from display height (${projectStore.project.settings.general.displayHeight})`,
                            getChildOfObject(page, "height")
                        )
                    );
                }

                if (page.height < 1 || page.height > MAX_HEIGHT) {
                    messages.push(
                        new Message(
                            MessageType.ERROR,
                            `Height must be between 1 and ${MAX_HEIGHT}`,
                            getChildOfObject(page, "height")
                        )
                    );
                }
            }

            if (projectStore.projectTypeTraits.isLVGL) {
                messages.push(...page.lvglLocalStyles.check());
            }

            return messages;
        },
        isMoveable: (object: Page) => {
            return true;
        },
        isSelectable: (object: Page) => {
            return true;
        },
        showSelectedObjectsParent: (object: Page) => {
            return true;
        },
        getResizeHandlers(object: Page) {
            return object.getResizeHandlers();
        },
        lvgl: {
            parts: ["MAIN"],
            flags: [
                "HIDDEN",
                "CLICKABLE",
                "CHECKABLE",
                "PRESS_LOCK",
                "ADV_HITTEST",
                "IGNORE_LAYOUT",
                "SCROLLABLE",
                "SCROLL_ELASTIC",
                "SCROLL_MOMENTUM",
                "SCROLL_ONE"
            ],
            defaultFlags: "CLICKABLE|PRESS_LOCK|SCROLL_ELASTIC|SCROLL_MOMENTUM",
            states: ["CHECKED", "FOCUSED", "PRESSED"]
        },

        findChildIndex: (parent: Page[], page: Page) => {
            return parent.findIndex(child => child.name == page.name);
        }
    });

    get rect() {
        return {
            left: this.left,
            top: this.top,
            width: this.width,
            height: this.height
        };
    }

    get autoSize(): AutoSize {
        return "none";
    }

    getResizeHandlers(): IResizeHandler[] | undefined | false {
        return [
            {
                x: 100,
                y: 50,
                type: "e-resize"
            },
            {
                x: 50,
                y: 100,
                type: "s-resize"
            },
            {
                x: 100,
                y: 100,
                type: "se-resize"
            }
        ];
    }

    get dataContextOverridesObject() {
        try {
            return JSON.parse(this.dataContextOverrides);
        } catch {
            return undefined;
        }
    }

    get pageRect() {
        return {
            left: this.left,
            top: this.top,
            width: this.width,
            height: this.height
        };
    }

    get isRuntimeSelectedPage() {
        const projectStore = getProjectStore(this);
        return (
            !projectStore.projectTypeTraits.isDashboard &&
            projectStore.runtime &&
            projectStore.runtime instanceof ProjectEditor.WasmRuntimeClass &&
            projectStore.runtime.selectedPage == this
        );
    }

    get isRuntimePageWithoutFlowState() {
        const projectStore = getProjectStore(this);
        return (
            !projectStore.projectTypeTraits.isDashboard &&
            projectStore.runtime &&
            projectStore.runtime instanceof ProjectEditor.WasmRuntimeClass &&
            !projectStore.runtime.getFlowState(this)
        );
    }

    renderWidgetComponents(flowContext: IFlowContext) {
        if (this.isRuntimeSelectedPage) {
            const projectStore = getProjectStore(this);
            return (
                <>
                    {projectStore.runtime!.isDebuggerActive &&
                        projectStore.runtime!.isPaused && (
                            <ComponentEnclosure
                                component={this}
                                flowContext={flowContext}
                            />
                        )}
                    {(
                        flowContext.projectStore.runtime! as WasmRuntime
                    ).renderPage()}
                </>
            );
        }

        if (flowContext.projectStore.projectTypeTraits.isLVGL) {
            return (
                <>
                    <ComponentEnclosure
                        component={this}
                        flowContext={flowContext}
                    />
                    <LVGLPage page={this} flowContext={flowContext} />
                </>
            );
        }

        let width: number | undefined;
        let height: number | undefined;

        const scaleToFit =
            this.scaleToFit &&
            flowContext.projectStore.projectTypeTraits.isDashboard &&
            flowContext.projectStore.runtime &&
            !flowContext.projectStore.runtime.isDebuggerActive;
        if (scaleToFit) {
            width = flowContext.viewState.transform.clientRect.width;
            height = flowContext.viewState.transform.clientRect.height;
        }

        return (
            <ComponentEnclosure
                component={this}
                flowContext={flowContext}
                width={width}
                height={height}
            />
        );
    }

    renderActionComponents(flowContext: IFlowContext) {
        return (
            <>
                {!flowContext.frontFace && (
                    <ComponentsContainerEnclosure
                        parent={this}
                        components={this.components.filter(
                            component => !(component instanceof Widget)
                        )}
                        flowContext={
                            flowContext.flowState
                                ? flowContext
                                : flowContext.overrideDataContext(
                                      this.dataContextOverridesObject
                                  )
                        }
                    />
                )}
            </>
        );
    }

    render(flowContext: IFlowContext, width: number, height: number) {
        const pageStyle = findStyle(
            ProjectEditor.getProject(this),
            this.style || "default"
        );

        const isUserWidgetWidgetPage =
            !flowContext.document.findObjectById(getId(this)) &&
            !flowContext.projectStore.runtime;

        let pageBackground;
        if (
            !flowContext.projectStore.projectTypeTraits.isDashboard &&
            !flowContext.projectStore.projectTypeTraits.isLVGL &&
            !isUserWidgetWidgetPage
        ) {
            pageBackground = (
                <ComponentCanvas
                    component={this}
                    width={width}
                    height={height}
                    draw={(ctx: CanvasRenderingContext2D) => {
                        if (pageStyle) {
                            drawBackground(
                                ctx,
                                0,
                                0,
                                width,
                                height,
                                pageStyle,
                                true
                            );
                        }
                    }}
                />
            );
        }

        return (
            <>
                {pageBackground}

                <ComponentsContainerEnclosure
                    parent={this}
                    components={this.components.filter(
                        component => component instanceof Widget
                    )}
                    flowContext={
                        flowContext.flowState
                            ? flowContext
                            : flowContext.overrideDataContext(
                                  this.dataContextOverridesObject
                              )
                    }
                    width={width}
                    height={height}
                    isRTL={
                        flowContext.projectStore.runtime
                            ? flowContext.projectStore.runtime.isRTL
                            : undefined
                    }
                />
            </>
        );
    }

    getClassName() {
        const project = ProjectEditor.getProject(this);
        let style = findStyle(project, this.style);
        if (!project.projectTypeTraits.isLVGL) {
            style = findStyle(project, this.style);
        }
        return classNames("EezStudio_Page", style?.classNames);
    }

    styleHook(style: React.CSSProperties, flowContext: IFlowContext) {
        if (flowContext.projectStore.projectTypeTraits.isLVGL) {
            return;
        }

        const isUserWidgetWidgetPage =
            !flowContext.document.findObjectById(getId(this)) &&
            !flowContext.projectStore.runtime;
        if (isUserWidgetWidgetPage) {
            // this is UserWidgetWidget page, forbid interaction with the content
            // and do not draw background (it is drawn by UserWidgetWidget)
            style.pointerEvents = "none";
        } else {
            const pageStyle = findStyle(
                ProjectEditor.getProject(this),
                this.style || "default"
            );

            if (pageStyle && pageStyle.backgroundColorProperty) {
                style.backgroundColor = to16bitsColor(
                    getThemedColor(
                        flowContext.projectStore,
                        pageStyle.backgroundColorProperty
                    )
                );
            }
        }
    }

    getWidgetType() {
        return WIDGET_TYPE_CONTAINER;
    }

    buildFlowWidgetSpecific(assets: Assets, dataBuffer: DataBuffer) {
        // widgets
        const widgets = assets.projectStore.projectTypeTraits.isDashboard
            ? []
            : (this.components.filter(
                  widget => widget instanceof Widget
              ) as Widget[]);

        dataBuffer.writeArray(widgets, widget =>
            buildWidget(widget, assets, dataBuffer)
        );

        // flags
        let flags = 0;

        const CLOSE_PAGE_IF_TOUCHED_OUTSIDE_FLAG = 1 << 1;
        const PAGE_IS_USED_AS_USER_WIDGET = 1 << 2;
        const PAGE_CONTAINER = 1 << 3;
        const PAGE_SCALE_TO_FIT = 1 << 4;

        if (this.closePageIfTouchedOutside) {
            flags |= CLOSE_PAGE_IF_TOUCHED_OUTSIDE_FLAG;
        }

        if (this.isUsedAsUserWidget) {
            flags |= PAGE_IS_USED_AS_USER_WIDGET;
        } else {
            flags |= PAGE_CONTAINER;
        }

        if (this.scaleToFit) {
            flags |= PAGE_SCALE_TO_FIT;
        }

        dataBuffer.writeUint16(flags);

        // overlay
        dataBuffer.writeInt16(0);

        // layout
        const CONTAINER_WIDGET_LAYOUT_STATIC = 0;

        let layout = CONTAINER_WIDGET_LAYOUT_STATIC;

        dataBuffer.writeUint16(layout);

        // reserved1
        dataBuffer.writeUint16(0);
    }

    lvglCreate(
        runtime: LVGLPageRuntime,
        parentObj: number,
        customWidget?: {
            widgetIndex: number;
            left: number;
            top: number;
            width: number;
            height: number;
        }
    ) {
        const obj = customWidget
            ? runtime.wasm._lvglCreateUserWidget(
                  parentObj,
                  customWidget.widgetIndex,
                  customWidget.left,
                  customWidget.top,
                  customWidget.width,
                  customWidget.height
              )
            : runtime.wasm._lvglCreateContainer(
                  parentObj,
                  runtime.getWidgetIndex(this),
                  this.left,
                  this.top,
                  this.width,
                  this.height
              );

        if (!customWidget) {
            runtime.wasm._lvglObjClearFlag(
                obj,
                getCode(["SCROLLABLE"], LVGL_FLAG_CODES)
            );
        }

        this.lvglLocalStyles.lvglCreate(runtime, this, obj);

        this.components
            .filter(component => component instanceof Widget)
            .map((widget: Widget) => widget.lvglCreate(runtime, obj));

        this._lvglWidgetsIncludingUserWidgets.forEach(lvglWidget =>
            lvglWidget.lvglPostCreate(runtime)
        );

        return obj;
    }

    lvglBuild(build: LVGLBuild) {
        if (!this.isUsedAsUserWidget) {
            let flowIndex = build.assets.getFlowIndex(this);
            build.line(`void *flowState = getFlowState(0, ${flowIndex});`);

            build.line(`lv_obj_t *obj = lv_obj_create(0);`);
            build.line(`${build.getLvglObjectAccessor(this)} = obj;`);

            build.line(`lv_obj_set_pos(obj, ${this.left}, ${this.top});`);
            build.line(`lv_obj_set_size(obj, ${this.width}, ${this.height});`);

            build.line(`lv_obj_clear_flag(obj, LV_OBJ_FLAG_SCROLLABLE);`);

            this.lvglLocalStyles.lvglBuild(build);
        } else {
            build.line(`lv_obj_t *obj = parent_obj;`);
        }

        build.line(`{`);
        build.indent();

        build.line(`lv_obj_t *parent_obj = obj;`);

        for (const widget of this.components) {
            if (widget instanceof ProjectEditor.LVGLWidgetClass) {
                build.line(`{`);
                build.indent();

                widget.lvglBuild(build);

                build.unindent();
                build.line(`}`);
            }
        }

        build.unindent();
        build.line(`}`);

        this._lvglWidgets.forEach(lvglWidget =>
            lvglWidget.lvglPostBuild(build)
        );
    }

    lvglBuildTick(build: LVGLBuild) {
        if (!this.isUsedAsUserWidget) {
            let flowIndex = build.assets.getFlowIndex(this);
            build.line(`void *flowState = getFlowState(0, ${flowIndex});`);
        }

        for (const widget of this.components) {
            if (widget instanceof ProjectEditor.LVGLWidgetClass) {
                widget.lvglBuildTick(build);
            }
        }

        lvglBuildPageTimeline(build, this);
    }

    get _lvglWidgets() {
        const widgets: LVGLWidget[] = [];

        function addWidgets(page: Page) {
            for (const widget of visitObjects(page.components)) {
                if (widget instanceof ProjectEditor.LVGLWidgetClass) {
                    widgets.push(widget);
                }
            }
        }

        addWidgets(this);

        return widgets;
    }

    get _lvglWidgetsIncludingUserWidgets() {
        const widgets: LVGLWidget[] = [];

        function addWidgets(page: Page) {
            for (const widget of visitObjects(page.components)) {
                if (widget instanceof ProjectEditor.LVGLWidgetClass) {
                    widgets.push(widget);

                    if (
                        widget instanceof
                        ProjectEditor.LVGLUserWidgetWidgetClass
                    ) {
                        if (
                            widget.userWidgetPageCopy &&
                            !widget.isCycleDetected
                        ) {
                            addWidgets(widget.userWidgetPageCopy);
                        }
                    }
                }
            }
        }

        addWidgets(this);

        return widgets;
    }
}

registerClass("Page", Page);

////////////////////////////////////////////////////////////////////////////////

export function findPage(project: Project, pageName: string) {
    return ProjectEditor.documentSearch.findReferencedObject(
        project,
        "pages",
        pageName
    ) as Page | undefined;
}

////////////////////////////////////////////////////////////////////////////////

export default {
    name: "eezstudio-project-feature-page",
    version: "0.1.0",
    description: "Pages support for your project",
    author: "EEZ",
    authorLogo: "../eez-studio-ui/_images/eez_logo.png",
    displayName: "Pages",
    mandatory: true,
    key: "pages",
    type: PropertyType.Array,
    typeClass: Page,
    icon: "svg:pages",
    create: () => []
};
