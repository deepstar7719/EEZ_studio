import React from "react";
import { observable, makeObservable, runInAction } from "mobx";

import { _find, _range } from "eez-studio-shared/algorithm";

import {
    registerClass,
    PropertyType,
    makeDerivedClassInfo
} from "project-editor/core/object";
import {
    getClassInfo,
    Message,
    propertyNotSetMessage
} from "project-editor/store";

import { ProjectType } from "project-editor/project/project";

import type { IFlowContext } from "project-editor/flow/flow-interfaces";

import { Widget } from "project-editor/flow/component";

import {
    specificGroup,
    styleGroup
} from "project-editor/ui-components/PropertyGrid/groups";
import { IWasmFlowRuntime } from "eez-studio-types";
import { escapeCString, indent, TAB } from "project-editor/build/helper";
import { LVGLParts, LVGLStylesDefinition } from "project-editor/lvgl/style";
import { LVGLStylesDefinitionProperty } from "project-editor/lvgl/LVGLStylesDefinitionProperty";
import type { LVGLCreateResultType } from "project-editor/lvgl/LVGLStylesDefinitionProperty";
import { getComponentName } from "project-editor/flow/editor/ComponentsPalette";
import { ProjectEditor } from "project-editor/project-editor-interface";

////////////////////////////////////////////////////////////////////////////////

export class LVGLWidget extends Widget {
    children: Widget[];
    localStyles: LVGLStylesDefinition;

    _lvglObj: number;

    static classInfo = makeDerivedClassInfo(Widget.classInfo, {
        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.LVGL,

        properties: [
            {
                name: "children",
                type: PropertyType.Array,
                typeClass: LVGLWidget,
                hideInPropertyGrid: true
            },
            {
                name: "part",
                type: PropertyType.Enum,
                enumItems: (widget: LVGLWidget) => {
                    const classInfo = getClassInfo(widget);
                    return classInfo.lvglParts!.map(lvglPart => ({
                        id: lvglPart
                    }));
                },
                propertyGridGroup: styleGroup,
                computed: true,
                modifiable: true
            },
            {
                name: "state",
                type: PropertyType.Enum,
                enumItems: [
                    { id: "default", label: "DEFAULT" },
                    { id: "checked", label: "CHECKED" },
                    { id: "pressed", label: "PRESSED" },
                    { id: "checked|pressed", label: "CHECKED | PRESSED" },
                    { id: "disabled", label: "DISABLED" },
                    { id: "focused", label: "FOCUSED" }
                ],
                propertyGridGroup: styleGroup,
                computed: true,
                modifiable: true
            },
            {
                name: "localStyles",
                type: PropertyType.Object,
                typeClass: LVGLStylesDefinition,
                propertyGridGroup: styleGroup,
                propertyGridRowComponent: LVGLStylesDefinitionProperty,
                enumerable: false
            }
        ]
    });

    constructor() {
        super();

        makeObservable(this, {
            localStyles: observable
        });
    }

    override lvglCreate(
        runtime: IWasmFlowRuntime,
        parentObj: number
    ): LVGLCreateResultType {
        this.lvglCreateObj(runtime, parentObj);

        this.localStyles.lvglCreate(runtime, this._lvglObj);

        const children = this.children.map((widget: LVGLWidget) =>
            widget.lvglCreate(runtime, this._lvglObj)
        );

        return {
            obj: this._lvglObj,
            children
        };
    }

    lvglCreateObj(runtime: IWasmFlowRuntime, parentObj: number) {
        console.error("UNEXPECTED!");
    }

    override lvglBuild(): string {
        if (this.children.length == 0) {
            return `${this.lvglBuildObj()}${this.localStyles.lvglBuild()}`;
        }

        const widgets = this.children
            .map(
                (widget: LVGLWidget) =>
                    `{\n${indent(TAB, widget.lvglBuild())}\n}`
            )
            .join("\n\n");

        return `${this.lvglBuildObj()}${this.localStyles.lvglBuild()}

lv_obj_t *parent_obj = obj;
${widgets}`;
    }

    lvglBuildObj() {
        console.error("UNEXPECTED!");
    }

    get part() {
        const project = ProjectEditor.getProject(this);
        const classInfo = getClassInfo(this);
        if (
            classInfo.lvglParts &&
            classInfo.lvglParts.indexOf(
                project._DocumentStore.uiStateStore.lvglPart
            ) != -1
        ) {
            return project._DocumentStore.uiStateStore.lvglPart;
        }
        return "main";
    }
    set part(part: LVGLParts) {
        const project = ProjectEditor.getProject(this);
        runInAction(
            () => (project._DocumentStore.uiStateStore.lvglPart = part)
        );
    }

    get state() {
        const project = ProjectEditor.getProject(this);
        return project._DocumentStore.uiStateStore.lvglState;
    }
    set state(state: string) {
        const project = ProjectEditor.getProject(this);
        runInAction(
            () => (project._DocumentStore.uiStateStore.lvglState = state)
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

export class LVGLLabelWidget extends LVGLWidget {
    text: string;

    static classInfo = makeDerivedClassInfo(LVGLWidget.classInfo, {
        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.LVGL,

        label: (widget: LVGLLabelWidget) => {
            let name = getComponentName(widget.type);

            if (widget.text) {
                return `${name}: ${widget.text}`;
            }

            return name;
        },

        properties: [
            {
                name: "text",
                type: PropertyType.String,
                propertyGridGroup: specificGroup
            }
        ],

        defaultValue: {
            left: 0,
            top: 0,
            width: 64,
            height: 32,
            text: "Text",
            localStyles: {}
        },

        icon: (
            <svg
                strokeWidth="2"
                stroke="currentColor"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
            >
                <path d="M0 0h24v24H0z" stroke="none" />
                <circle cx="17.5" cy="15.5" r="3.5" />
                <path d="M3 19V8.5a3.5 3.5 0 0 1 7 0V19m-7-6h7m11-1v7" />
            </svg>
        ),

        check: (widget: LVGLLabelWidget) => {
            let messages: Message[] = [];

            if (!widget.text) {
                messages.push(propertyNotSetMessage(widget, "text"));
            }

            return messages;
        },

        lvglParts: ["main", "scrollbar", "selected"]
    });

    constructor() {
        super();

        makeObservable(this, {
            text: observable
        });
    }

    render(flowContext: IFlowContext, width: number, height: number) {
        return <>{super.render(flowContext, width, height)}</>;
    }

    override lvglCreateObj(runtime: IWasmFlowRuntime, parentObj: number) {
        this._lvglObj = runtime._lvglCreateLabel(
            parentObj,
            runtime.allocateUTF8(this.text),
            this.left,
            this.top,
            this.width,
            this.height
        );
    }

    override lvglBuildObj() {
        return `lv_obj_t *obj = lv_label_create(parent_obj);
lv_obj_set_pos(obj, ${this.left}, ${this.top});
lv_obj_set_size(obj, ${this.width}, ${this.height});
lv_label_set_text(obj, ${escapeCString(this.text)});`;
    }
}

registerClass("LVGLLabelWidget", LVGLLabelWidget);

////////////////////////////////////////////////////////////////////////////////

export class LVGLButtonWidget extends LVGLWidget {
    static classInfo = makeDerivedClassInfo(LVGLWidget.classInfo, {
        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.LVGL,

        properties: [],

        defaultValue: {
            left: 0,
            top: 0,
            width: 80,
            height: 40,
            text: "Button"
        },

        icon: (
            <svg viewBox="0 0 16 16">
                <path
                    fill="currentColor"
                    d="m15.7 5.3-1-1c-.2-.2-.4-.3-.7-.3H1c-.6 0-1 .4-1 1v5c0 .3.1.6.3.7l1 1c.2.2.4.3.7.3h13c.6 0 1-.4 1-1V6c0-.3-.1-.5-.3-.7zM14 10H1V5h13v5z"
                />
            </svg>
        ),

        lvglParts: ["main"]
    });

    constructor() {
        super();

        makeObservable(this, {});
    }

    render(flowContext: IFlowContext, width: number, height: number) {
        return <>{super.render(flowContext, width, height)}</>;
    }

    override lvglCreateObj(runtime: IWasmFlowRuntime, parentObj: number) {
        this._lvglObj = runtime._lvglCreateButton(
            parentObj,
            this.left,
            this.top,
            this.width,
            this.height
        );
    }

    override lvglBuildObj() {
        return `lv_obj_t *obj = lv_btn_create(parent_obj);
lv_obj_set_pos(obj, ${this.left}, ${this.top});
lv_obj_set_size(obj, ${this.width}, ${this.height});`;
    }
}

registerClass("LVGLButtonWidget", LVGLButtonWidget);
