import { dialog, getCurrentWindow } from "@electron/remote";
import path from "path";
import fs from "fs";

import { guid } from "eez-studio-shared/guid";

import {
    action,
    computed,
    observable,
    runInAction,
    toJS,
    makeObservable
} from "mobx";
import {
    DocumentStoreClass,
    getLabel,
    getObjectFromStringPath,
    getObjectPathAsString,
    LayoutModels
} from "project-editor/store";
import { ConnectionLine, Flow, FlowTabState } from "project-editor/flow/flow";
import { CatchErrorActionComponent } from "project-editor/flow/components/actions";
import { Component, Widget } from "project-editor/flow/component";
import { IEezObject } from "project-editor/core/object";
import type {
    IComponentState,
    IDataContext,
    IFlowContext
} from "project-editor/flow/flow-interfaces";
import { Page } from "project-editor/features/page/page";
import {
    ActionEndLogItem,
    LogItem,
    RuntimeLogs
} from "project-editor/flow/debugger/logs";
import { LogItemType } from "project-editor/flow/flow-interfaces";
import { valueToString } from "project-editor/flow/debugger/WatchPanel";
import {
    evalExpression,
    IExpressionContext
} from "project-editor/flow/expression";
import type { ValueType } from "eez-studio-types";

////////////////////////////////////////////////////////////////////////////////

/*

system inputs: @seqin
system outputs: @seqout

*/

////////////////////////////////////////////////////////////////////////////////

export interface QueueTask {
    id: number;
    flowState: FlowState;
    component: Component;
    connectionLine?: ConnectionLine;
}

enum State {
    STARTING = "STARTING",
    STARTING_WITHOUT_DEBUGGER = "STARTING_WITHOUT_DEBUGGER",
    STARTING_WITH_DEBUGGER = "STARTING_WITH_DEBUGGER",
    RUNNING = "RUNNING",
    PAUSED = "PAUSED",
    RESUMED = "RESUMED",
    SINGLE_STEP = "SINGLE_STEP",
    STOPPED = "STOPPED"
}

export enum StateMachineAction {
    START_WITHOUT_DEBUGGER = "START_WITHOUT_DEBUGGER",
    START_WITH_DEBUGGER = "START_WITH_DEBUGGER",
    RUN = "RUN",
    RESUME = "RESUME",
    PAUSE = "PAUSE",
    SINGLE_STEP = "SINGLE_STEP",
    STOP = "STOP"
}

export type SingleStepMode = "step-into" | "step-over" | "step-out";

export abstract class RuntimeBase {
    state: State = State.STARTING;
    isDebuggerActive = false;

    _selectedPage: Page;
    selectedFlowState: FlowState | undefined;
    selectedQueueTask: QueueTask | undefined;

    error: string | undefined;

    queueTaskId = 0;
    queue: QueueTask[] = [];

    flowStates: FlowState[] = [];

    singleStepMode: SingleStepMode;
    singleStepQueueTask: QueueTask | undefined;
    singleStepLastSkippedTask: QueueTask | undefined;

    logs = new RuntimeLogs();

    freeMemory: number = 0;
    totalMemory: number = 0;

    get isPaused() {
        return this.state == State.PAUSED;
    }

    get isSingleStep() {
        return this.state == State.SINGLE_STEP;
    }

    get isResumed() {
        return this.state == State.RESUMED;
    }

    get isStopped() {
        return this.state == State.STOPPED;
    }

    get selectedPage() {
        return this._selectedPage;
    }

    set selectedPage(value: Page) {
        runInAction(() => {
            this._selectedPage = value;
        });

        if (
            this.state == State.STARTING ||
            (this.isDebuggerActive && !this.isPaused)
        ) {
            this.DocumentStore.editorsStore.openEditor(this.selectedPage);
        }
    }

    setActiveConnectionLine(connectionLine: ConnectionLine) {
        if (!this.DocumentStore.uiStateStore.pageRuntimeFrontFace) {
            connectionLine.setActive();
        }
    }

    constructor(public DocumentStore: DocumentStoreClass) {
        makeObservable<RuntimeBase, "setState">(this, {
            state: observable,
            isDebuggerActive: observable,
            _selectedPage: observable,
            selectedFlowState: observable,
            selectedQueueTask: observable,
            error: observable,
            queue: observable,
            flowStates: observable,
            stopRuntimeWithError: action,
            setState: action,
            transition: action,
            pushTask: action,
            popTask: action,
            showNextQueueTask: action,
            freeMemory: observable,
            totalMemory: observable
        });

        this.selectedPage = this.DocumentStore.project.pages[0];
    }

    startRuntime(isDebuggerActive: boolean) {
        this.DocumentStore.dataContext.clear();

        if (isDebuggerActive) {
            this.transition(StateMachineAction.START_WITH_DEBUGGER);
        } else {
            this.transition(StateMachineAction.START_WITHOUT_DEBUGGER);
        }

        runInAction(() => {
            this.isDebuggerActive = isDebuggerActive;
        });

        this.doStartRuntime(isDebuggerActive);
    }

    async stopRuntime(notifyUser: boolean) {
        if (this.state == State.STOPPED) {
            return;
        }

        this.transition(StateMachineAction.STOP);

        await this.doStopRuntime(notifyUser);
    }

    stopRuntimeWithError(error: string) {
        this.error = error;
        this.stopRuntime(true);
    }

    stop() {}

    private setState(state: State) {
        this.state = state;

        if (this.state == State.PAUSED) {
            if (!this.isDebuggerActive) {
                this.DocumentStore.onSetDebuggerMode();
            }
            this.showNextQueueTask();
        }

        if (this.state == State.STOPPED) {
            if (this.error) {
                if (!this.isDebuggerActive) {
                    this.DocumentStore.onSetDebuggerMode();
                    this.DocumentStore.layoutModels.selectTab(
                        this.DocumentStore.layoutModels.root,
                        LayoutModels.DEBUGGER_TAB_ID
                    );
                }
            } else {
                this.DocumentStore.setEditorMode();
            }
        }
    }

    transition(action: StateMachineAction) {
        const wasState = this.state;

        if (this.state == State.STARTING) {
            if (action == StateMachineAction.START_WITHOUT_DEBUGGER) {
                this.setState(State.STARTING_WITHOUT_DEBUGGER);
                this.DocumentStore.uiStateStore.pageRuntimeFrontFace = true;
            } else if (action == StateMachineAction.START_WITH_DEBUGGER) {
                this.setState(State.STARTING_WITH_DEBUGGER);
                this.DocumentStore.uiStateStore.pageRuntimeFrontFace = false;
            }
        } else if (this.state == State.STARTING_WITHOUT_DEBUGGER) {
            if (
                action == StateMachineAction.RUN ||
                action == StateMachineAction.RESUME
            ) {
                this.setState(State.RUNNING);
            }
        } else if (this.state == State.STARTING_WITH_DEBUGGER) {
            if (action == StateMachineAction.PAUSE) {
                this.setState(State.PAUSED);
            }
        } else if (this.state == State.RUNNING) {
            if (action == StateMachineAction.PAUSE) {
                this.setState(State.PAUSED);
            }
        } else if (this.state == State.PAUSED) {
            if (action == StateMachineAction.RUN) {
                this.setState(State.RUNNING);
            } else if (action == StateMachineAction.RESUME) {
                this.setState(State.RESUMED);
            } else if (action == StateMachineAction.SINGLE_STEP) {
                this.setState(State.SINGLE_STEP);
            }
        } else if (this.state == State.RESUMED) {
            if (action == StateMachineAction.RUN) {
                this.setState(State.RUNNING);
            } else if (action == StateMachineAction.PAUSE) {
                this.setState(State.PAUSED);
            }
        } else if (this.state == State.SINGLE_STEP) {
            if (action == StateMachineAction.PAUSE) {
                this.setState(State.PAUSED);
            }
        } else if (this.state == State.STOPPED) {
            if (action == StateMachineAction.PAUSE) {
                this.isDebuggerActive = true;
                this.DocumentStore.uiStateStore.pageRuntimeFrontFace = false;
                return;
            }
        }

        if (action == StateMachineAction.STOP) {
            this.setState(State.STOPPED);
        }

        if (wasState == this.state) {
            console.error(
                `INVALID TRANSITION: state=${wasState} action=${action}`
            );
        } else {
            // console.info(
            //     `Transition: stateBefore=${wasState} action=${action} stateAfter=${this.state}`
            // );
        }
    }

    ////////////////////////////////////////

    getFlowState(flow: Flow) {
        if (this.selectedFlowState?.flow == flow) {
            return this.selectedFlowState;
        }

        for (let flowState of this.flowStates) {
            if (flowState.flow === flow) {
                return flowState;
            }
        }

        for (let flowState of this.flowStates) {
            const childFlowState = flowState.getFlowState(flow);
            if (childFlowState) {
                return childFlowState;
            }
        }

        return undefined;
    }

    pushTask({
        flowState,
        component,
        connectionLine
    }: {
        flowState: FlowState;
        component: Component;
        connectionLine?: ConnectionLine;
    }) {
        this.queue.push({
            id: ++this.queueTaskId,
            flowState,
            component,
            connectionLine
        });
        flowState.numActiveComponents++;

        if (this.state == State.PAUSED) {
            this.showNextQueueTask();
        }
    }

    popTask() {
        this.queue.shift();

        if (this.state == State.PAUSED) {
            this.showNextQueueTask();
        }
    }

    removeQueueTasksForFlowState(flowState: FlowState) {
        runInAction(() => {
            const queueTasksBefore = flowState.runtime.queue.length;
            flowState.runtime.queue = flowState.runtime.queue.filter(
                queueTask => queueTask.flowState != flowState
            );
            const queueTasksAfter = flowState.runtime.queue.length;
            flowState.numActiveComponents -= queueTasksBefore - queueTasksAfter;
        });
    }

    skipNextQueueTask(nextQueueTask: QueueTask) {
        if (this.state != State.PAUSED) {
            return;
        }

        if (!this.singleStepQueueTask) {
            return;
        }

        if (
            nextQueueTask == this.singleStepQueueTask ||
            nextQueueTask == this.singleStepLastSkippedTask
        ) {
            return;
        }

        if (
            this.singleStepQueueTask &&
            this.singleStepQueueTask.flowState.isFinished
        ) {
            this.singleStepQueueTask = undefined;
            this.singleStepLastSkippedTask = undefined;
            return;
        }

        let doSkip: boolean = false;

        if (this.singleStepMode == "step-over") {
            doSkip =
                nextQueueTask.flowState != this.singleStepQueueTask.flowState &&
                nextQueueTask.flowState !=
                    this.singleStepQueueTask.flowState.parentFlowState;
        } else if (this.singleStepMode == "step-into") {
            doSkip =
                nextQueueTask.flowState != this.singleStepQueueTask.flowState &&
                nextQueueTask.flowState !=
                    this.singleStepQueueTask.flowState.parentFlowState &&
                nextQueueTask.flowState.parentFlowState !=
                    this.singleStepQueueTask.flowState;
        } else if (this.singleStepMode == "step-out") {
            doSkip = !this.singleStepQueueTask.flowState.isFinished;
        }

        if (doSkip) {
            this.singleStepLastSkippedTask = nextQueueTask;
            this.runSingleStep();
        } else {
            this.singleStepQueueTask = nextQueueTask;
        }
    }

    showNextQueueTask() {
        const nextQueueTask = this.queue.length > 0 ? this.queue[0] : undefined;

        if (nextQueueTask) {
            this.skipNextQueueTask(nextQueueTask);
        }

        this.selectQueueTask(nextQueueTask);
    }

    selectFlowStateForFlow(flow: Flow) {
        this.selectedFlowState = this.getFlowState(flow);
    }

    selectQueueTask(queueTask: QueueTask | undefined) {
        if (
            this.singleStepQueueTask &&
            queueTask?.flowState != this.singleStepQueueTask.flowState
        ) {
            return;
        }

        this.selectedQueueTask = queueTask;
        if (queueTask) {
            this.selectedFlowState = queueTask.flowState;
            this.showQueueTask(queueTask);
        } else {
            // deselect all objects
            const editorState =
                this.DocumentStore.editorsStore.activeEditor?.state;
            if (editorState instanceof FlowTabState) {
                editorState.selectObjects([]);
            }
        }
    }

    showSelectedFlowState() {
        const flowState = this.selectedFlowState;
        if (flowState) {
            this.DocumentStore.navigationStore.showObjects(
                [flowState.flow],
                true,
                false,
                false
            );
        }
    }

    showComponent(component: Component) {
        this.DocumentStore.navigationStore.showObjects(
            [component],
            true,
            false,
            false
        );
    }

    showQueueTask(queueTask: QueueTask) {
        const objects: IEezObject[] = [];

        if (
            queueTask.connectionLine &&
            queueTask.connectionLine.sourceComponent &&
            queueTask.connectionLine.targetComponent
        ) {
            objects.push(queueTask.connectionLine.sourceComponent);
            objects.push(queueTask.connectionLine);
            objects.push(queueTask.connectionLine.targetComponent);
        } else {
            objects.push(queueTask.component);
        }

        this.DocumentStore.navigationStore.showObjects(
            objects,
            true,
            false,
            false
        );
    }

    createObjectValue(valueType: ValueType, value: any): any {
        return undefined;
    }

    sendResultToWorker(messageId: number, result: any, finalResult?: boolean) {}

    onBreakpointAdded(component: Component) {}

    onBreakpointRemoved(component: Component) {}

    onBreakpointEnabled(component: Component) {}

    onBreakpointDisabled(component: Component) {}

    // ABSTRACT FUNCTIONS

    abstract doStartRuntime(isDebuggerActive: boolean): Promise<void>;
    abstract doStopRuntime(notifyUser: boolean): Promise<void>;

    abstract toggleDebugger(): void;

    abstract resume(): void;

    abstract pause(): void;

    abstract runSingleStep(singleStepMode?: SingleStepMode): void;

    abstract executeWidgetAction(
        flowContext: IFlowContext,
        widget: Widget,
        actionName: string,
        value: any,
        valueType: ValueType
    ): void;

    abstract readSettings(key: string): any;
    abstract writeSettings(key: string, value: any): void;

    abstract startFlow(flowState: FlowState): Promise<void>;

    abstract propagateValue(
        flowState: FlowState,
        sourceComponent: Component,
        output: string,
        value: any,
        outputName?: string
    ): void;

    abstract throwError(
        flowState: FlowState,
        component: Component,
        message: string
    ): void;

    abstract assignValue(
        expressionContext: IExpressionContext,
        component: Component,
        assignableExpression: string,
        value: any
    ): void;

    abstract destroyObjectLocalVariables(flowState: FlowState): void;

    get debugInfo() {
        return {
            state: this.state,
            error: this.error,
            flowStates: this.flowStates.map(flowState => flowState.debugInfo),
            queue: this.queue.map(queueTask => ({
                id: queueTask.id,
                flowState: queueTask.flowState.id,
                component: getObjectPathAsString(queueTask.component),
                connectionLine: queueTask.connectionLine
                    ? getObjectPathAsString(queueTask.connectionLine)
                    : undefined
            })),
            logs: this.logs.debugInfo,
            dataContext: this.DocumentStore.dataContext.debugInfo
        };
    }

    set debugInfo(debugInfo: any) {
        runInAction(() => {
            this.state = debugInfo.state;
            this.error = debugInfo.error;

            this.loadFlowStatesFromDebugInfo(
                this.flowStates,
                debugInfo.flowStates
            );

            for (const queueTask of debugInfo.queue) {
                const component = getObjectFromStringPath(
                    this.DocumentStore.project,
                    queueTask.component
                ) as Component;
                if (!component) {
                    console.error("Can't find component", queueTask.component);
                    continue;
                }

                const flowState = this.findFlowStateById(queueTask.flowState);
                if (!flowState) {
                    console.error("Can't find flow by id", queueTask.flowState);
                    continue;
                }

                let connectionLine;
                if (queueTask.connectionLine) {
                    connectionLine = getObjectFromStringPath(
                        this.DocumentStore.project,
                        queueTask.connectionLine
                    ) as ConnectionLine;
                    if (!connectionLine) {
                        console.error(
                            "Can't find connection line",
                            queueTask.connectionLine
                        );
                        continue;
                    }
                }

                this.queue.push({
                    id: queueTask.id,
                    flowState,
                    component,
                    connectionLine
                });
            }

            this.logs.loadDebugInfo(this, debugInfo.logs);

            this.DocumentStore.dataContext.debugInfo = debugInfo.dataContext;
        });
    }

    loadFlowStatesFromDebugInfo(flowStates: FlowState[], flowStatesJS: any) {
        for (const flowStateJS of flowStatesJS) {
            const flow = getObjectFromStringPath(
                this.DocumentStore.project,
                flowStateJS.flow
            ) as Flow;
            if (!flow) {
                console.error("Can't find flow", flowStateJS.flow);
                continue;
            }

            let component;
            if (flowStateJS.component) {
                component = getObjectFromStringPath(
                    this.DocumentStore.project,
                    flowStateJS.component
                ) as Component;
                if (!component) {
                    console.error(
                        "Can't find component",
                        flowStateJS.component
                    );
                    continue;
                }
            }

            let parentFlowState;
            if (flowStateJS.parentFlowState) {
                parentFlowState = this.findFlowStateById(
                    flowStateJS.parentFlowState
                );
                if (!parentFlowState) {
                    console.error(
                        "Can't find parentFlowState by id",
                        flowStateJS.parentFlowState
                    );
                    continue;
                }
            }

            const flowState = new FlowState(
                this,
                flow,
                parentFlowState,
                component
            );

            flowStates.push(flowState);

            flowState.debugInfo = flowStateJS;
        }
    }

    findFlowStateById(id: string): FlowState | undefined {
        for (const flowState of this.flowStates) {
            if (flowState.id == id) {
                return flowState;
            }

            const childFlowState = flowState.findFlowStateById(id);
            if (childFlowState) {
                return childFlowState;
            }
        }

        return undefined;
    }

    async saveDebugInfo() {
        let defaultPath;
        if (this.DocumentStore.filePath?.endsWith(".eez-project")) {
            defaultPath = path.basename(
                this.DocumentStore.filePath!,
                ".eez-project"
            );
        } else {
            defaultPath = path.basename(
                this.DocumentStore.filePath!,
                ".eez-dashboard"
            );
        }

        const result = await dialog.showSaveDialog(getCurrentWindow(), {
            defaultPath,
            filters: [
                {
                    name: "EEZ Debug Info",
                    extensions: ["eez-debug-info"]
                },
                { name: "All Files", extensions: ["*"] }
            ]
        });
        let filePath = result.filePath;
        if (filePath) {
            await new Promise<void>((resolve, reject) => {
                const archiver = require("archiver");

                var archive = archiver("zip", {
                    zlib: {
                        level: 9
                    }
                });

                var output = fs.createWriteStream(filePath || "");

                output.on("close", function () {
                    resolve();
                });

                archive.on("warning", function (err: any) {
                    reject(err);
                });

                archive.on("error", function (err: any) {
                    reject(err);
                });

                archive.pipe(output);

                let json;
                try {
                    json = JSON.stringify(toJS(this.debugInfo));
                } catch (err) {
                    reject(err);
                }

                archive.append(json, { name: path.basename(filePath || "") });

                archive.finalize();
            });

            return true;
        }

        return false;
    }

    abstract evalProperty(
        flowState: IFlowContext,
        widget: Widget,
        propertyName: string
    ): any;

    abstract assignProperty(
        expressionContext: IExpressionContext,
        component: Component,
        propertyName: string,
        value: any
    ): void;
}

export class FlowState {
    id = guid();
    componentStates = new Map<Component, ComponentState>();
    flowStates: FlowState[] = [];
    dataContext: IDataContext;
    error: string | undefined = undefined;
    isFinished: boolean = false;
    numActiveComponents = 0;

    constructor(
        public runtime: RuntimeBase,
        public flow: Flow,
        public parentFlowState?: FlowState,
        public component?: Component
    ) {
        makeObservable(this, {
            flowStates: observable,
            error: observable,
            isFinished: observable,
            setComponentRunningState: action,
            setComponentAsyncState: action,
            isRunning: computed({ keepAlive: true }),
            hasAnyDiposableComponent: computed({ keepAlive: true }),
            finish: action
        });

        this.dataContext =
            this.runtime.DocumentStore.dataContext.createWithLocalVariables(
                flow.localVariables
            );
    }

    get DocumentStore() {
        return this.runtime.DocumentStore;
    }

    get flowState() {
        return this;
    }

    get label() {
        return getLabel(this.flow);
    }

    findFlowStateById(id: string): FlowState | undefined {
        for (const flowState of this.flowStates) {
            if (flowState.id == id) {
                return flowState;
            }

            const childFlowState = flowState.findFlowStateById(id);
            if (childFlowState) {
                return childFlowState;
            }
        }
        return undefined;
    }

    getFlowState(flow: Flow): FlowState | undefined {
        for (let flowState of this.flowStates) {
            if (flowState.flow === flow) {
                return flowState;
            }
        }

        for (let flowState of this.flowStates) {
            const childFlowState = flowState.getFlowState(flow);
            if (childFlowState) {
                return childFlowState;
            }
        }

        return undefined;
    }

    getFlowStateByComponent(component: Component): FlowState | undefined {
        for (let flowState of this.flowStates) {
            if (flowState.component === component) {
                return flowState;
            }
        }

        return undefined;
    }

    getComponentState(component: Component) {
        let componentState = this.componentStates.get(component);
        if (!componentState) {
            componentState = new ComponentState(this, component);
            this.componentStates.set(component, componentState);
        }
        return componentState;
    }

    getInputValue(component: Component, input: string) {
        return this.getComponentState(component).getInputValue(input);
    }

    evalExpression(component: Component, expression: string): any {
        return evalExpression(this, component, expression);
    }

    getComponentRunningState<T>(component: Component): T | undefined {
        return this.getComponentState(component).runningState;
    }

    setComponentRunningState<T>(component: Component, runningState: T) {
        this.getComponentState(component).runningState = runningState;
    }

    setComponentAsyncState(component: Component, asyncState: boolean) {
        this.getComponentState(component).asyncState = asyncState;
    }

    getVariable(component: Component, variableName: string): any {
        return this.dataContext.get(variableName);
    }

    setVariable(component: Component, variableName: string, value: any) {
        return this.dataContext.set(variableName, value);
    }

    get isRunning(): boolean {
        for (let [_, componentState] of this.componentStates) {
            if (componentState.isRunning) {
                return true;
            }
        }

        return (
            this.flowStates.find(flowState => flowState.isRunning) != undefined
        );
    }

    get hasAnyDiposableComponent() {
        for (let [_, componentState] of this.componentStates) {
            if (componentState.dispose) {
                return true;
            }
        }
        return false;
    }

    finish() {
        this.runtime.destroyObjectLocalVariables(this);
        this.flowStates.forEach(flowState => flowState.finish());
        this.componentStates.forEach(componentState => componentState.finish());
        this.runtime.logs.addLogItem(new ActionEndLogItem(this));
        this.isFinished = true;
    }

    findCatchErrorActionComponent(): ComponentState | undefined {
        const catchErrorActionComponent = this.flow.components.find(
            component => component instanceof CatchErrorActionComponent
        );
        if (catchErrorActionComponent) {
            return this.getComponentState(catchErrorActionComponent);
        }

        if (this.parentFlowState) {
            return this.parentFlowState.findCatchErrorActionComponent();
        }

        return undefined;
    }

    log(type: LogItemType, message: string, component: Component | undefined) {
        this.runtime.logs.addLogItem(
            new LogItem(type, message, this, component)
        );
    }

    logScpi(message: string, component: Component) {
        this.runtime.logs.addLogItem(
            new LogItem("scpi", message, this, component)
        );
    }

    logInfo(value: any, component: Component) {
        this.runtime.logs.addLogItem(
            new LogItem("scpi", valueToString(value), this, component)
        );
    }

    get debugInfo(): any {
        return {
            id: this.id,
            flow: getObjectPathAsString(this.flow),
            component: this.component
                ? getObjectPathAsString(this.component)
                : undefined,
            parentFlowState: this.parentFlowState?.id,
            flowStates: this.flowStates.map(flowState => flowState.debugInfo),
            componentStates: [...this.componentStates.values()].map(
                componentState => componentState.debugInfo
            ),
            dataContext: this.dataContext.debugInfo,
            error: this.error,
            isFinished: this.isFinished
        };
    }

    set debugInfo(debugInfo: any) {
        runInAction(() => {
            this.id = debugInfo.id;

            this.runtime.loadFlowStatesFromDebugInfo(
                this.flowStates,
                debugInfo.flowStates
            );

            for (const componentStateJS of debugInfo.componentStates) {
                const component = getObjectFromStringPath(
                    this.DocumentStore.project,
                    componentStateJS.component
                ) as Component;
                if (!component) {
                    console.error(
                        "Can't find component",
                        componentStateJS.component
                    );
                    continue;
                }

                const componentState = new ComponentState(this, component);
                this.componentStates.set(component, componentState);

                componentState.debugInfo = componentStateJS;
            }

            this.dataContext.debugInfo = debugInfo.dataContext;

            this.error = debugInfo.error;
            this.isFinished = debugInfo.isFinished;
        });
    }
}

////////////////////////////////////////////////////////////////////////////////

export class ComponentState implements IComponentState {
    inputsData = new Map<string, any>();
    unreadInputsData = new Set<string>();
    isRunning: boolean = false;
    asyncState: boolean = false;
    runningState: any;
    dispose: (() => void) | undefined = undefined;

    constructor(public flowState: FlowState, public component: Component) {
        makeObservable(this, {
            inputsData: observable,
            unreadInputsData: observable,
            isRunning: observable,
            asyncState: observable,
            runningState: observable,
            dispose: observable,
            setInputData: action,
            markInputsDataRead: action
        });
    }

    getInputValue(input: string) {
        return this.inputsData.get(input);
    }

    setInputData(input: string, inputData: any) {
        this.inputsData.set(input, inputData);
        this.unreadInputsData.add(input);
    }

    markInputsDataRead() {
        this.unreadInputsData.clear();
    }

    get connectedSequenceInputsSet() {
        const inputConnections = new Set<string>();
        for (const connectionLine of this.flowState.flow.connectionLines) {
            if (
                connectionLine.targetComponent == this.component &&
                this.sequenceInputs.find(
                    input => input.name == connectionLine.input
                )
            ) {
                inputConnections.add(connectionLine.input);
            }
        }
        return inputConnections;
    }

    get sequenceInputs() {
        return this.component.inputs.filter(input => input.isSequenceInput);
    }

    get mandatoryDataInputs() {
        return this.component.inputs.filter(
            input => !input.isSequenceInput && !input.isOptionalInput
        );
    }

    finish() {
        if (this.dispose) {
            this.dispose();
        }
    }

    get debugInfo() {
        const inputsData: any = {};
        for (const [name, value] of this.inputsData) {
            try {
                const valueJS = toJS(value);
                JSON.stringify(valueJS);
                inputsData[name] = valueJS;
            } catch (err) {}
        }

        return {
            component: getObjectPathAsString(this.component),
            inputsData,
            isRunning: this.isRunning
        };
    }

    set debugInfo(debugInfo: any) {
        runInAction(() => {
            for (const name in debugInfo.inputsData) {
                this.inputsData.set(name, debugInfo.inputsData[name]);
            }

            this.isRunning = debugInfo.isRunning;
        });
    }
}
