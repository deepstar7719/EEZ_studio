import React from "react";
import { observer } from "mobx-react";

import {
    getClassInfoLvglProperties,
    getProperty,
    PropertyProps
} from "project-editor/core/object";
import { ProjectEditor } from "project-editor/project-editor-interface";
import { getAncestorOfType, getObjectPathAsString } from "project-editor/store";
import type { LVGLWidget } from "project-editor/lvgl/widgets";
import { ProjectContext } from "project-editor/project/context";
import { humanize } from "eez-studio-shared/string";
import { Checkbox } from "project-editor/ui-components/PropertyGrid/Checkbox";
import {
    LVGLPageEditorRuntime,
    type LVGLPageRuntime
} from "project-editor/lvgl/page-runtime";
import { evalConstantExpression } from "project-editor/flow/expression";
import {
    LVGL_FLAG_CODES,
    LVGL_REACTIVE_FLAGS,
    LVGL_REACTIVE_STATES,
    LVGL_STATE_CODES
} from "project-editor/lvgl/lvgl-constants";
import { getLvglFlagCodes } from "./lvgl-versions";

////////////////////////////////////////////////////////////////////////////////

export const LVGLWidgetFlagsProperty = observer(
    class LVGLWidgetFlagsProperty extends React.Component<PropertyProps> {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        render() {
            const flagNames: (keyof typeof LVGL_FLAG_CODES)[] = [];

            this.props.objects.map((widget: LVGLWidget) => {
                const flags = Object.keys(
                    getLvglFlagCodes(widget)
                ) as (keyof typeof LVGL_FLAG_CODES)[];
                for (const flagName of flags) {
                    if (
                        flagNames.indexOf(flagName) == -1 &&
                        LVGL_REACTIVE_FLAGS.indexOf(flagName) == -1
                    ) {
                        flagNames.push(flagName);
                    }
                }
            });

            return (
                <div>
                    {flagNames.map(flagName => {
                        let values = this.props.objects.map(
                            (widget: LVGLWidget) =>
                                (widget.flags || "")
                                    .split("|")
                                    .indexOf(flagName) != -1
                        );

                        let numEnabled = 0;
                        let numDisabled = 0;
                        values.forEach(value => {
                            if (value) {
                                numEnabled++;
                            } else {
                                numDisabled++;
                            }
                        });

                        let state =
                            numEnabled == 0
                                ? false
                                : numDisabled == 0
                                ? true
                                : undefined;

                        return (
                            <Checkbox
                                key={flagName}
                                state={state}
                                label={humanize(flagName)}
                                onChange={(value: boolean) => {
                                    this.context.undoManager.setCombineCommands(
                                        true
                                    );

                                    if (value) {
                                        this.props.objects.forEach(
                                            (widget: LVGLWidget) => {
                                                const flags = Object.keys(
                                                    getLvglFlagCodes(widget)
                                                ) as (keyof typeof LVGL_FLAG_CODES)[];

                                                if (
                                                    flags.indexOf(flagName) ==
                                                    -1
                                                ) {
                                                    return;
                                                }

                                                const flagsArr =
                                                    widget.flags.trim() != ""
                                                        ? widget.flags.split(
                                                              "|"
                                                          )
                                                        : [];
                                                if (
                                                    flagsArr.indexOf(
                                                        flagName
                                                    ) == -1
                                                ) {
                                                    flagsArr.push(flagName);
                                                    this.context.updateObject(
                                                        widget,
                                                        {
                                                            flags: flagsArr.join(
                                                                "|"
                                                            )
                                                        }
                                                    );
                                                }
                                            }
                                        );
                                    } else {
                                        this.props.objects.forEach(
                                            (widget: LVGLWidget) => {
                                                const flags = Object.keys(
                                                    getLvglFlagCodes(widget)
                                                ) as (keyof typeof LVGL_FLAG_CODES)[];

                                                if (
                                                    flags.indexOf(flagName) ==
                                                    -1
                                                ) {
                                                    return;
                                                }

                                                const flagsArr = (
                                                    widget.flags || ""
                                                ).split("|");
                                                const i =
                                                    flagsArr.indexOf(flagName);
                                                if (i != -1) {
                                                    flagsArr.splice(i, 1);
                                                    this.context.updateObject(
                                                        widget,
                                                        {
                                                            flags: flagsArr.join(
                                                                "|"
                                                            )
                                                        }
                                                    );
                                                }
                                            }
                                        );
                                    }

                                    this.context.undoManager.setCombineCommands(
                                        false
                                    );
                                }}
                                readOnly={this.props.readOnly}
                            />
                        );
                    })}
                </div>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

export const LVGLWidgetStatesProperty = observer(
    class LVGLWidgetStatesProperty extends React.Component<PropertyProps> {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        render() {
            const stateNames: (keyof typeof LVGL_STATE_CODES)[] = [];

            this.props.objects.map((widget: LVGLWidget) => {
                const lvglClassInfoProperties =
                    getClassInfoLvglProperties(widget);
                for (const stateName of lvglClassInfoProperties.states) {
                    if (
                        stateNames.indexOf(stateName) == -1 &&
                        LVGL_REACTIVE_STATES.indexOf(stateName) == -1
                    ) {
                        stateNames.push(stateName);
                    }
                }
            });

            return (
                <div>
                    {stateNames.map(stateName => {
                        let values = this.props.objects.map(
                            (widget: LVGLWidget) =>
                                (widget.states || "")
                                    .split("|")
                                    .indexOf(stateName) != -1
                        );

                        let numEnabled = 0;
                        let numDisabled = 0;
                        values.forEach(value => {
                            if (value) {
                                numEnabled++;
                            } else {
                                numDisabled++;
                            }
                        });

                        let state =
                            numEnabled == 0
                                ? false
                                : numDisabled == 0
                                ? true
                                : undefined;

                        return (
                            <Checkbox
                                key={stateName}
                                state={state}
                                label={humanize(stateName)}
                                onChange={(value: boolean) => {
                                    this.context.undoManager.setCombineCommands(
                                        true
                                    );

                                    if (value) {
                                        this.props.objects.forEach(
                                            (widget: LVGLWidget) => {
                                                const lvglClassInfoProperties =
                                                    getClassInfoLvglProperties(
                                                        widget
                                                    );
                                                if (
                                                    lvglClassInfoProperties.states.indexOf(
                                                        stateName
                                                    ) == -1
                                                ) {
                                                    return;
                                                }

                                                const statesArr =
                                                    widget.states.trim() != ""
                                                        ? widget.states.split(
                                                              "|"
                                                          )
                                                        : [];
                                                if (
                                                    statesArr.indexOf(
                                                        stateName
                                                    ) == -1
                                                ) {
                                                    statesArr.push(stateName);
                                                    this.context.updateObject(
                                                        widget,
                                                        {
                                                            states: statesArr.join(
                                                                "|"
                                                            )
                                                        }
                                                    );
                                                }
                                            }
                                        );
                                    } else {
                                        this.props.objects.forEach(
                                            (widget: LVGLWidget) => {
                                                const lvglClassInfoProperties =
                                                    getClassInfoLvglProperties(
                                                        widget
                                                    );
                                                if (
                                                    lvglClassInfoProperties.states.indexOf(
                                                        stateName
                                                    ) == -1
                                                ) {
                                                    return;
                                                }

                                                const statesArr = (
                                                    widget.states || ""
                                                ).split("|");
                                                const i =
                                                    statesArr.indexOf(
                                                        stateName
                                                    );
                                                if (i != -1) {
                                                    statesArr.splice(i, 1);
                                                    this.context.updateObject(
                                                        widget,
                                                        {
                                                            states: statesArr.join(
                                                                "|"
                                                            )
                                                        }
                                                    );
                                                }
                                            }
                                        );
                                    }

                                    this.context.undoManager.setCombineCommands(
                                        false
                                    );
                                }}
                                readOnly={this.props.readOnly}
                            />
                        );
                    })}
                </div>
            );
        }
    }
);

export function getCode<T extends string>(
    arr: T[],
    keyToCode: { [key in T]: number }
) {
    return arr.reduce((code, el) => code | keyToCode[el], 0) >>> 0;
}

export function getExpressionPropertyData(
    runtime: LVGLPageRuntime,
    widget: LVGLWidget,
    propertyName: string
) {
    if (!runtime.wasm.assetsMap) {
        return undefined;
    }

    const propertyType = getProperty(widget, propertyName + "Type");

    const isExpr =
        propertyType !== "literal" && propertyType !== "translated-literal";

    if (!isExpr) {
        return undefined;
    }

    const page = getAncestorOfType(widget, ProjectEditor.PageClass.classInfo)!;
    const pagePath = getObjectPathAsString(page);
    const flowIndex = runtime.wasm.assetsMap.flowIndexes[pagePath];
    if (flowIndex == undefined) {
        return undefined;
    }
    const flow = runtime.wasm.assetsMap.flows[flowIndex];
    const componentPath = getObjectPathAsString(widget);
    const componentIndex = flow.componentIndexes[componentPath];
    if (componentIndex == undefined) {
        return undefined;
    }

    const component = flow.components[componentIndex];
    const propertyIndex = component.propertyIndexes[propertyName];
    if (propertyIndex == undefined) {
        return undefined;
    }

    return { componentIndex, propertyIndex };
}

export function getExpressionPropertyInitalValue(
    runtime: LVGLPageRuntime,
    widget: LVGLWidget,
    propertyName: string
) {
    if (runtime instanceof LVGLPageEditorRuntime) {
        const expr = getProperty(widget, propertyName);
        try {
            const result = evalConstantExpression(
                ProjectEditor.getProject(widget),
                expr
            );
            if (result) {
                return result.value.toString();
            }
        } catch (e) {}
        return `{${expr}}`;
    } else {
        return "";
    }
}

export function unescapeText(str: string) {
    let result = "";

    for (let i = 0; i < str.length; i++) {
        if (str[i] == "\\" && i + 5 < str.length && str[i + 1] == "u") {
            result += String.fromCharCode(
                parseInt(str.substring(i + 2, i + 6), 16)
            );
            i += 5;
            continue;
        }

        result += str[i];
    }

    return result;
}
