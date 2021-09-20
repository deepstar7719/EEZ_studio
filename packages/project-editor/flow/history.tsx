import React from "react";
import { observable } from "mobx";
import { observer } from "mobx-react";
import classNames from "classnames";

import { ITreeNode, Tree } from "eez-studio-ui/tree";

import { ProjectContext } from "project-editor/project/context";
import { Panel } from "project-editor/components/Panel";
import { action, computed } from "mobx";
import { ConnectionLine, Flow, FlowTabState } from "project-editor/flow/flow";
import { getLabel, IEezObject } from "project-editor/core/object";
import { IconAction } from "eez-studio-ui/action";
import { guid } from "eez-studio-shared/guid";
import { ComponentState, FlowState } from "./runtime";
import { Component, Widget } from "./component";

////////////////////////////////////////////////////////////////////////////////

export const MAX_HISTORY_ITEMS = 100;

////////////////////////////////////////////////////////////////////////////////

function getInputName(component: Component | undefined, inputName: string) {
    if (component) {
        const input = component.inputs.find(input => input.name == inputName);
        if (input) {
            return input.displayName || input.name;
        }
    }
    return inputName;
}

function getOutputName(component: Component | undefined, outputName: string) {
    if (component) {
        const output = component.outputs.find(
            output => output.name == outputName
        );
        if (output) {
            return output.displayName || output.name;
        }
    }
    return outputName;
}

////////////////////////////////////////////////////////////////////////////////

export abstract class HistoryItem {
    date: Date = new Date();
    id = guid();
    @observable history: HistoryItem[] = [];

    constructor(
        public flowState: FlowState | undefined,
        public flow?: Flow,
        public sourceComponent?: Component,
        public targetComponent?: Component,
        public connectionLine?: ConnectionLine
    ) {}

    abstract get label(): string;

    get isError() {
        return false;
    }
}

////////////////////////////////////////////////////////////////////////////////

export class ActionStartHistoryItem extends HistoryItem {
    constructor(public flowState: FlowState | undefined, flow: Flow) {
        super(flowState, flow);
    }

    get label() {
        return `Action start: ${getLabel(this.flow!)}`;
    }
}

export class ActionEndHistoryItem extends HistoryItem {
    constructor(public flowState: FlowState | undefined, flow: Flow) {
        super(flowState, flow);
    }

    get label() {
        return `Action end: ${getLabel(this.flow!)}`;
    }
}

export class ExecuteComponentHistoryItem extends HistoryItem {
    constructor(
        public flowState: FlowState | undefined,
        sourceComponent: Component,
        public componentState: ComponentState
    ) {
        super(flowState, undefined, sourceComponent);
    }

    get label() {
        return `Execute component: ${getLabel(this.sourceComponent!)}`;
    }
}

export class ExecuteWidgetActionHistoryItem extends HistoryItem {
    constructor(
        public flowState: FlowState | undefined,
        sourceComponent: Component
    ) {
        super(flowState, undefined, sourceComponent);
    }

    get label() {
        return `Execute widget action: ${getLabel(this.sourceComponent!)}`;
    }
}

export class WidgetActionNotDefinedHistoryItem extends HistoryItem {
    constructor(
        public flowState: FlowState | undefined,
        sourceComponent: Component
    ) {
        super(flowState, undefined, sourceComponent);
    }

    get label() {
        return `Widget action not defined: ${getLabel(this.sourceComponent!)}`;
    }

    get isError() {
        return true;
    }
}

export class WidgetActionNotFoundHistoryItem extends HistoryItem {
    constructor(
        public flowState: FlowState | undefined,
        sourceComponent: Component
    ) {
        super(flowState, undefined, sourceComponent);
    }

    get label() {
        return `Widget action not found: ${
            (this.sourceComponent as Widget).action
        }`;
    }

    get isError() {
        return true;
    }
}

export class NoConnectionHistoryItem extends HistoryItem {
    constructor(
        public flowState: FlowState | undefined,
        sourceComponent: Component,
        public output?: string
    ) {
        super(flowState, undefined, sourceComponent);
    }

    get label() {
        return `Action ${getLabel(
            this.sourceComponent!
        )} has no connection from output ${this.output}`;
    }

    get isError() {
        return true;
    }
}

export class OutputValueHistoryItem extends HistoryItem {
    constructor(
        public flowState: FlowState | undefined,
        public componentState: ComponentState,
        public connectionLine: ConnectionLine,
        public output?: string,
        public value?: any
    ) {
        super(
            flowState,
            undefined,
            connectionLine.sourceComponent!,
            connectionLine.targetComponent,
            connectionLine
        );
    }

    get label() {
        let value = this.value ?? null;
        if (value) {
            try {
                value = JSON.stringify(value);
            } catch (err) {
                try {
                    value = value?.toString();
                } catch (err) {
                    console.error(err, value);
                }
            }
        }

        return `Output value from [${
            this.output ||
            getOutputName(
                this.connectionLine.sourceComponent,
                this.connectionLine.output
            )
        }] to [${getLabel(this.connectionLine.targetComponent!)}/${getInputName(
            this.connectionLine.targetComponent,
            this.connectionLine.input
        )}]: ${value}`;
    }
}

export class ExecutionErrorHistoryItem extends HistoryItem {
    constructor(
        public flowState: FlowState | undefined,
        sourceComponent: Component,
        public error?: any
    ) {
        super(flowState, undefined, sourceComponent);
    }

    get label() {
        return `Execution error in ${getLabel(
            this.sourceComponent!
        )}: ${this.error.toString()}`;
    }

    get isError() {
        return true;
    }
}

////////////////////////////////////////////////////////////////////////////////

export class HistoryState {
    @observable history: HistoryItem[] = [];
    @observable selectedHistoryItem: HistoryItem | undefined;

    @action
    addHistoryItem(historyItem: HistoryItem) {
        // if (historyItem instanceof OutputValueHistoryItem) {
        //     for (let i = this.history.length - 1; i >= 0; i--) {
        //         const parentHistoryItem = this.history[i];
        //         if (
        //             parentHistoryItem instanceof
        //                 ExecuteComponentHistoryItem &&
        //             parentHistoryItem.componentState ==
        //                 historyItem.componentState
        //         ) {
        //             parentHistoryItem.history.push(historyItem);
        //             return;
        //         }
        //     }
        // }

        this.history.push(historyItem);

        if (this.history.length > MAX_HISTORY_ITEMS) {
            this.history.shift();
        }
    }

    @action.bound
    clearHistory() {
        this.history = [];
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
export class HistoryPanel extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    render() {
        return (
            <Panel
                id="project-editor/runtime-info/history"
                title="History"
                buttons={[
                    <IconAction
                        key="clear"
                        icon="material:clear"
                        title="Clear history"
                        onClick={
                            this.context.RuntimeStore.historyState.clearHistory
                        }
                    ></IconAction>
                ]}
                body={<HistoryTree />}
            />
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
class HistoryTree extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    @computed get rootNode(): ITreeNode<HistoryItem> {
        const selectedHistoryItem =
            this.context.RuntimeStore.historyState.selectedHistoryItem;

        function getChildren(
            historyItems: HistoryItem[]
        ): ITreeNode<HistoryItem>[] {
            return historyItems.map(historyItem => ({
                id: historyItem.id,
                label: (
                    <div
                        className={classNames("history-item", {
                            error: historyItem.isError
                        })}
                    >
                        <small>{historyItem.date.toLocaleTimeString()}</small>
                        <span>{historyItem.label}</span>
                    </div>
                ),
                children: getChildren(historyItem.history),
                selected: historyItem === selectedHistoryItem,
                expanded: true,
                data: historyItem
            }));
        }

        return {
            id: "root",
            label: "",
            children: getChildren(
                this.context.RuntimeStore.historyState.history
                    .reverse()
                    .filter(
                        historyItem =>
                            !this.context.RuntimeStore.selectedFlowState ||
                            historyItem.flowState ===
                                this.context.RuntimeStore.selectedFlowState
                    )
            ),
            selected: false,
            expanded: true
        };
    }

    @action.bound
    selectNode(node?: ITreeNode<HistoryItem>) {
        this.context.RuntimeStore.historyState.selectedHistoryItem = node?.data;

        if (this.context.RuntimeStore.historyState.selectedHistoryItem?.flow) {
            this.context.NavigationStore.showObject(
                this.context.RuntimeStore.historyState.selectedHistoryItem?.flow
            );
        } else {
            const objects: IEezObject[] = [];

            if (
                this.context.RuntimeStore.historyState.selectedHistoryItem
                    ?.sourceComponent
            ) {
                objects.push(
                    this.context.RuntimeStore.historyState.selectedHistoryItem
                        ?.sourceComponent
                );
            }

            if (
                this.context.RuntimeStore.historyState.selectedHistoryItem
                    ?.connectionLine
            ) {
                objects.push(
                    this.context.RuntimeStore.historyState.selectedHistoryItem
                        ?.connectionLine
                );
            }

            if (
                this.context.RuntimeStore.historyState.selectedHistoryItem
                    ?.targetComponent
            ) {
                objects.push(
                    this.context.RuntimeStore.historyState.selectedHistoryItem
                        ?.targetComponent
                );
            }

            if (objects.length > 0) {
                this.context.NavigationStore.showObject(objects[0]);

                setTimeout(() => {
                    const editorState =
                        this.context.EditorsStore.activeEditor?.state;
                    if (editorState instanceof FlowTabState) {
                        this.context.EditorsStore.activeEditor?.state?.selectObjects(
                            objects
                        );
                    }
                }, 0);
            }
        }
    }

    render() {
        return (
            <Tree
                showOnlyChildren={true}
                rootNode={this.rootNode}
                selectNode={this.selectNode}
            />
        );
    }
}
