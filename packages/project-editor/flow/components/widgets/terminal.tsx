import React from "react";

import {
    registerClass,
    makeDerivedClassInfo,
    ProjectType
} from "project-editor/core/object";

import { ComponentOutput, Widget } from "project-editor/flow/component";
import { IFlowContext, IFlowState } from "project-editor/flow/flow-interfaces";
import { addCssStylesheet } from "eez-studio-shared/dom";
import { observer } from "mobx-react";
import { registerSystemStructure } from "project-editor/features/variable/value-type";
import { FLOW_ITERATOR_INDEXES_VARIABLE } from "project-editor/features/variable/defs";

////////////////////////////////////////////////////////////////////////////////

class RunningState {
    onData: ((value: string) => void) | undefined = undefined;
}

export class TerminalWidget extends Widget {
    static classInfo = makeDerivedClassInfo(Widget.classInfo, {
        defaultValue: {
            left: 0,
            top: 0,
            width: 240,
            height: 240
        },

        icon: (
            <svg
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M8 9l3 3l-3 3"></path>
                <line x1="13" y1="15" x2="16" y2="15"></line>
                <rect x="3" y="4" width="18" height="16" rx="2"></rect>
            </svg>
        ),

        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.DASHBOARD
    });

    getOutputs(): ComponentOutput[] {
        return [
            ...super.getOutputs(),
            {
                name: "onData",
                type: `struct:${ON_DATA_PARAMS_STRUCT_NAME}`,
                isOptionalOutput: false,
                isSequenceOutput: false
            }
        ];
    }

    render(flowContext: IFlowContext): React.ReactNode {
        return (
            <>
                <TerminalElement widget={this} flowContext={flowContext} />
                {super.render(flowContext)}
            </>
        );
    }

    async execute(flowState: IFlowState, dispose: (() => void) | undefined) {
        const { Readable, Duplex } = await import("stream");

        let runningState =
            flowState.getComponentRunningState<RunningState>(this);

        if (!runningState) {
            runningState = new RunningState();
            flowState.setComponentRunningState(this, runningState);
        }

        const componentState = flowState.getComponentState(this);

        if (componentState.unreadInputsData.has("data")) {
            const value = componentState.inputsData.get("data");
            if (runningState.onData && value) {
                if (typeof value === "string" && value.length > 0) {
                    runningState.onData(value);
                } else if (
                    value instanceof Readable ||
                    value instanceof Duplex
                ) {
                    const onData = (chunk: Buffer) => {
                        if (runningState && runningState.onData) {
                            runningState.onData(chunk.toString());
                        }
                    };
                    value.on("data", onData);
                    return () => {
                        value.off("data", onData);
                    };
                }
            }
        }

        return undefined;
    }

    async onWasmWorkerMessage(flowState: IFlowState, message: any) {
        let runningState =
            flowState.getComponentRunningState<RunningState>(this);

        if (!runningState) {
            runningState = new RunningState();
            flowState.setComponentRunningState(this, runningState);
        }

        const value = message;

        if (runningState.onData && value) {
            runningState.onData(value);
        }
    }
}

registerClass("TerminalWidget", TerminalWidget);

////////////////////////////////////////////////////////////////////////////////

export const ON_DATA_PARAMS_STRUCT_NAME = "$TerminalWidgetOnDataParams";

registerSystemStructure({
    name: ON_DATA_PARAMS_STRUCT_NAME,
    fields: [
        {
            name: "index",
            type: "integer"
        },
        {
            name: "indexes",
            type: "array:integer"
        },
        {
            name: "data",
            type: "string"
        }
    ],
    fieldsMap: new Map()
});

interface OnDataParamsValue {
    index: number;
    indexes: number[];
    data: string;
}

function makeOnDataParamsValue(
    flowContext: IFlowContext,
    data: string
): OnDataParamsValue {
    let onDataParamsValue: OnDataParamsValue;

    let indexes = flowContext.dataContext.get(FLOW_ITERATOR_INDEXES_VARIABLE);
    if (indexes) {
        onDataParamsValue = {
            index: indexes[0],
            indexes,
            data
        };
    } else {
        onDataParamsValue = {
            index: 0,
            indexes: [0],
            data
        };
    }

    return onDataParamsValue;
}

////////////////////////////////////////////////////////////////////////////////

const TerminalElement = observer(
    class TerminalElement extends React.Component<{
        widget: TerminalWidget;
        flowContext: IFlowContext;
    }> {
        ref = React.createRef<HTMLDivElement>();

        terminal: any;
        fitAddon: any;

        dispose: any;

        async componentDidMount() {
            if (!this.ref.current) {
                return;
            }

            addCssStylesheet(
                "xterm-css",
                "../../node_modules/xterm/css/xterm.css"
            );

            const { Terminal } = await import("xterm");
            const { FitAddon } = await import("xterm-addon-fit");
            this.terminal = new Terminal({
                rendererType: "dom"
            });
            this.fitAddon = new FitAddon();
            this.terminal.loadAddon(this.fitAddon);
            this.terminal.open(this.ref.current);
            this.terminal.write("$ ");
            this.fitAddon.fit();

            this.terminal.onData((data: string) => {
                this.terminal.write(data);

                if (this.props.flowContext.flowState) {
                    this.props.flowContext.flowState.runtime.executeWidgetAction(
                        this.props.flowContext,
                        this.props.widget,
                        "onData",
                        makeOnDataParamsValue(this.props.flowContext, data),
                        `struct:${ON_DATA_PARAMS_STRUCT_NAME}`
                    );
                }
            });

            if (this.props.flowContext.flowState) {
                let runningState =
                    this.props.flowContext.flowState.getComponentRunningState<RunningState>(
                        this.props.widget
                    );
                if (!runningState) {
                    runningState = new RunningState();
                    this.props.flowContext.flowState.setComponentRunningState(
                        this.props.widget,
                        runningState
                    );
                }
                if (runningState) {
                    runningState.onData = data => {
                        this.terminal.write(data);
                    };
                }
            }
        }

        componentDidUpdate() {
            if (this.fitAddon) {
                this.fitAddon.fit();
            }
        }

        componentWillUnmount() {
            if (this.dispose) {
                this.dispose();
            }
        }

        render() {
            return (
                <div
                    ref={this.ref}
                    style={{
                        width: this.props.widget.width,
                        height: this.props.widget.height
                    }}
                ></div>
            );
        }
    }
);
