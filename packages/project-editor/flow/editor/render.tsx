import React from "react";
import { computed, runInAction, makeObservable } from "mobx";
import { observer } from "mobx-react";
import classNames from "classnames";

import { Point, Rect } from "eez-studio-shared/geometry";
import { getId } from "project-editor/core/object";

import { FLOW_ITERATOR_INDEX_VARIABLE } from "project-editor/features/variable/defs";
import type { Page } from "project-editor/features/page/page";
import { ProjectEditor } from "project-editor/project-editor-interface";
import type { IFlowContext } from "project-editor/flow/flow-interfaces";
import type { Component } from "project-editor/flow/component";
import { strokeWidth } from "project-editor/flow/editor/ConnectionLineComponent";
import { DragAndDropManager } from "project-editor/core/dd";
import type { Flow } from "project-editor/flow/flow";

////////////////////////////////////////////////////////////////////////////////

export const ComponentsContainerEnclosure = observer(
    class ComponentsContainerEnclosure extends React.Component<{
        components: Component[];
        flowContext: IFlowContext;
        visibleComponent?: Component;
    }> {
        render() {
            const { components, flowContext, visibleComponent } = this.props;

            return components.map((component, i) => (
                <ComponentEnclosure
                    key={getId(component)}
                    component={component}
                    flowContext={flowContext}
                    visible={!visibleComponent || visibleComponent == component}
                />
            ));
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

export const ComponentEnclosure = observer(
    class ComponentEnclosure extends React.Component<{
        component: Component | Page;
        flowContext: IFlowContext;
        left?: number;
        top?: number;
        visible?: boolean;
    }> {
        elRef = React.createRef<HTMLDivElement>();

        constructor(props: {
            component: Component | Page;
            flowContext: IFlowContext;
            left?: number;
            top?: number;
            visible?: boolean;
        }) {
            super(props);

            makeObservable(this, {
                listIndex: computed
            });
        }

        get listIndex() {
            if (
                this.props.flowContext.dataContext.has(
                    FLOW_ITERATOR_INDEX_VARIABLE
                )
            ) {
                return this.props.flowContext.dataContext.get(
                    FLOW_ITERATOR_INDEX_VARIABLE
                );
            }
            return 0;
        }

        updateComponentGeometry() {
            if (this.elRef.current && this.listIndex == 0) {
                const el = this.elRef.current.closest(".LayoutViewWidget");
                if (el && el != this.elRef.current) {
                    // do not calculate geometry if component is inside LayoutViewWidget
                    return;
                }

                if (this.elRef.current.offsetParent == null) {
                    // do not calculate geometry if element is not visible
                    return;
                }

                const geometry = calcComponentGeometry(
                    this.props.component,
                    this.elRef.current,
                    this.props.flowContext
                );
                runInAction(() => {
                    this.props.component.geometry = geometry;
                });
            }
        }

        componentDidMount() {
            this.updateComponentGeometry();
        }

        componentDidUpdate() {
            this.updateComponentGeometry();
        }

        render() {
            const { component, flowContext, left, top, visible } = this.props;

            // data-eez-flow-object-id
            let dataFlowObjectId = getId(component);
            if (this.listIndex > 0) {
                dataFlowObjectId = dataFlowObjectId + "-" + this.listIndex;
            }

            // style
            const style: React.CSSProperties = {
                left: left ?? component.left,
                top: top ?? component.top
            };

            if (
                !(component.autoSize == "width" || component.autoSize == "both")
            ) {
                style.width = component.width;
            }
            if (
                !(
                    component.autoSize == "height" ||
                    component.autoSize == "both"
                )
            ) {
                style.height = component.height;
            }

            component.styleHook(style, flowContext);

            // className
            const DocumentStore = flowContext.DocumentStore;
            const uiStateStore = DocumentStore.uiStateStore;
            const runtime = DocumentStore.runtime;

            let breakpointClass;
            if (component instanceof ProjectEditor.ComponentClass) {
                if (uiStateStore.isBreakpointAddedForComponent(component)) {
                    if (
                        uiStateStore.isBreakpointEnabledForComponent(component)
                    ) {
                        breakpointClass = "enabled-breakpoint";
                    } else {
                        breakpointClass = "disabled-breakpoint";
                    }
                }
            }

            const componentClassName = component.getClassName();

            const className = classNames(
                "EezStudio_ComponentEnclosure",
                breakpointClass,
                componentClassName,
                {
                    "eez-flow-editor-capture-pointers":
                        runtime &&
                        !(runtime.isDebuggerActive && runtime.isPaused)
                }
            );

            if (visible === false) {
                if (this.props.flowContext.flowState) {
                    style.visibility = "hidden";
                } else {
                    style.opacity = "0.05";
                }
                style.pointerEvents = "none";
            }

            return (
                <div
                    ref={this.elRef}
                    data-eez-flow-object-id={dataFlowObjectId}
                    className={className}
                    style={style}
                >
                    {component.render(flowContext)}
                </div>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

export const ComponentCanvas = observer(
    class ComponentCanvas extends React.Component<{
        component: Page | Component;
        draw: (ctx: CanvasRenderingContext2D) => void;
    }> {
        elRef = React.createRef<HTMLDivElement>();

        canvas: HTMLCanvasElement;

        addCanvasToDOM() {
            if (!this.elRef.current) {
                return;
            }

            if (this.elRef.current.children[0]) {
                this.elRef.current.replaceChild(
                    this.canvas,
                    this.elRef.current.children[0]
                );
            } else {
                this.elRef.current.appendChild(this.canvas);
            }
        }

        componentDidMount() {
            this.addCanvasToDOM();
        }

        componentDidUpdate() {
            this.addCanvasToDOM();
        }

        render() {
            const { component, draw } = this.props;

            this.canvas = document.createElement("canvas");
            this.canvas.width = component.width;
            this.canvas.height = component.height;
            this.canvas.style.imageRendering = "pixelated";
            this.canvas.style.display = "block";
            draw(this.canvas.getContext("2d")!);

            return (
                <div
                    ref={this.elRef}
                    style={{ width: component.width, height: component.height }}
                ></div>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

interface PortsGeometry {
    [inputName: string]: {
        rect: Rect;
        position: Point;
    };
}

export interface ComponentGeometry {
    left: number;
    top: number;
    width: number;
    height: number;
    inputs: PortsGeometry;
    outputs: PortsGeometry;
}

export function calcComponentGeometry(
    component: Component | Page,
    el: HTMLElement | undefined,
    flowContext: IFlowContext | undefined
): ComponentGeometry {
    const dInput = component instanceof ProjectEditor.WidgetClass ? 2 : 6;
    const dOutput = component instanceof ProjectEditor.WidgetClass ? 0 : 6;

    let rect: Rect;

    if (el && flowContext) {
        const transform = flowContext.viewState.transform;
        rect = transform.clientToPageRect(el.getBoundingClientRect());
    } else {
        if (component instanceof ProjectEditor.ComponentClass) {
            rect = {
                left: component.absolutePositionPoint.x,
                top: component.absolutePositionPoint.y,
                width: component.width ?? 1,
                height: component.height ?? 1
            };
        } else {
            rect = component.pageRect;
        }
    }

    if (!(component.autoSize == "width" || component.autoSize == "both")) {
        rect.width = component.width;
    }

    if (!(component.autoSize == "height" || component.autoSize == "both")) {
        rect.height = component.height;
    }

    const inputs: PortsGeometry = {};
    const outputs: PortsGeometry = {};

    if (component instanceof ProjectEditor.ComponentClass) {
        const transform = flowContext?.viewState.transform;
        if (el && transform) {
            el.querySelectorAll(`[data-connection-input-id]`).forEach(
                inputElement => {
                    const rectPort = transform.clientToPageRect(
                        inputElement.getBoundingClientRect()
                    );
                    inputs[
                        inputElement.getAttribute("data-connection-input-id")!
                    ] = {
                        rect: {
                            left: rectPort.left - rect.left,
                            top: rectPort.top - rect.top,
                            width: rectPort.width,
                            height: rectPort.height
                        },
                        position: {
                            x: rectPort.left - rect.left - dInput,
                            y: rectPort.top - rect.top + rectPort.height / 2
                        }
                    };
                }
            );

            el.querySelectorAll(`[data-connection-output-id]`).forEach(
                outputElement => {
                    const rectPort = transform.clientToPageRect(
                        outputElement.getBoundingClientRect()
                    );
                    outputs[
                        outputElement.getAttribute("data-connection-output-id")!
                    ] = {
                        rect: {
                            left: rectPort.left - rect.left,
                            top: rectPort.top - rect.top,
                            width: rectPort.width,
                            height: rectPort.height
                        },
                        position: {
                            x:
                                rectPort.left -
                                rect.left +
                                rectPort.width +
                                dOutput / 2 +
                                strokeWidth / 2,
                            y: rectPort.top - rect.top + rectPort.height / 2
                        }
                    };
                }
            );
        }

        for (let i = 0; i < component.inputs.length; i++) {
            const inputName = component.inputs[i].name;
            if (!inputs[inputName]) {
                inputs[inputName] = {
                    rect: {
                        left: 0,
                        top: 0,
                        width: rect.width / 2,
                        height: rect.height
                    },
                    position: {
                        x: 0,
                        y: rect.height / 2
                    }
                };
            }
        }

        for (let i = 0; i < component.outputs.length; i++) {
            const outputName = component.outputs[i].name;
            if (!outputs[outputName]) {
                outputs[outputName] = {
                    rect: {
                        left: rect.width / 2,
                        top: 0,
                        width: rect.width / 2,
                        height: rect.height
                    },
                    position: {
                        x: rect.width,
                        y: rect.height / 2
                    }
                };
            }
        }
    }

    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        inputs,
        outputs
    };
}

////////////////////////////////////////////////////////////////////////////////

export const Svg: React.FunctionComponent<{
    flowContext: IFlowContext;
    defs?: JSX.Element | null;
    className?: string;
    style?: React.CSSProperties;
}> = observer(({ flowContext, defs, className, style, children }) => {
    const transform = flowContext.viewState.transform;
    let svgRect;
    let gTransform;
    if (transform) {
        svgRect = transform.clientToPageRect(transform.clientRect);
        gTransform = `translate(${-svgRect.left} ${-svgRect.top})`;
    }

    return (
        <svg
            className={className}
            style={{
                position: "absolute",
                pointerEvents: "none",
                ...svgRect,
                ...style
            }}
        >
            {defs && <defs>{defs}</defs>}
            <g
                transform={gTransform}
                style={{
                    pointerEvents: !!DragAndDropManager.dragObject
                        ? "none"
                        : "auto"
                }}
            >
                {children}
            </g>
        </svg>
    );
});

export function renderComponentDescriptions(flowContext: IFlowContext) {
    const dx = flowContext.viewState.dxMouseDrag ?? 0;
    const dy = flowContext.viewState.dyMouseDrag ?? 0;

    const flow = flowContext.document.flow.object as Flow;
    return flow.actionComponents
        .filter(component => !!component.description)
        .map(component => {
            const id = getId(component);

            let left = component.left;
            let top = component.top + component.height + 6;

            if (flowContext.viewState.isObjectIdSelected(id)) {
                left += dx;
                top += dy;
            }

            const width = Math.max(component.width, 200);

            const style: React.CSSProperties = {
                position: "absolute",
                left,
                top,
                width
            };

            return (
                <div
                    key={id}
                    className="EezStudio_ActionComponentDescription"
                    style={style}
                >
                    {component.description}
                </div>
            );
        });
}
