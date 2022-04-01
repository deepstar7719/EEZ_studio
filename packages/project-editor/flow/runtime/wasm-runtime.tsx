import React from "react";

import { ProjectContext } from "project-editor/project/context";
import {
    DocumentStoreClass,
    getClassInfo,
    getObjectPathAsString
} from "project-editor/store";

import { observer } from "mobx-react";
import {
    RemoteRuntime,
    DebuggerConnectionBase
} from "project-editor/flow/remote-runtime";

import type {
    IEvalProperty,
    IPropertyValue,
    ObjectGlobalVariableValues,
    RendererToWorkerMessage,
    ScpiCommand,
    ValueWithType,
    WorkerToRenderMessage
} from "project-editor/flow/runtime/wasm-worker-interfaces";
import {
    getObjectVariableTypeFromType,
    IObjectVariableValue
} from "project-editor/features/variable/value-type";
import { InstrumentObject } from "instrument/instrument-object";
import {
    ArrayValue,
    createJsArrayValue
} from "project-editor/flow/runtime/wasm-value";
import {
    isFlowProperty,
    Widget as Component,
    Widget
} from "project-editor/flow/component";
import { ProjectEditor } from "project-editor/project-editor-interface";
import type { IFlowContext } from "project-editor/flow/flow-interfaces";
import { makeObservable, observable, runInAction } from "mobx";
import { FLOW_ITERATOR_INDEXES_VARIABLE } from "project-editor/features/variable/defs";
import type {
    IObjectVariableType,
    IVariable,
    ValueType
} from "eez-studio-types";
import { getNodeModuleFolders } from "eez-studio-shared/extensions/yarn";

export class WasmRuntime extends RemoteRuntime {
    debuggerConnection = new WasmDebuggerConnection(this);

    worker: Worker;

    assetsData: any;
    assetsDataMapJs: AssetsMap;

    objectVariables: {
        variable: IVariable;
        value: IObjectVariableValue;
        objectVariableType: IObjectVariableType;
        globalVariableIndex: number;
        arrayValue: ArrayValue;
    }[] = [];

    ctx: CanvasRenderingContext2D | undefined;
    width: number = 480;
    height: number = 272;

    pointerEvents: {
        x: number;
        y: number;
        pressed: number;
    }[] = [];
    wheelDeltaY = 0;
    wheelClicked = 0;
    screen: any;
    requestAnimationFrameId: number | undefined;

    evalProperties = new EvalProperties(this);

    ////////////////////////////////////////////////////////////////////////////////

    constructor(public DocumentStore: DocumentStoreClass) {
        super(DocumentStore);
    }

    ////////////////////////////////////////////////////////////////////////////////

    async doStartRuntime(isDebuggerActive: boolean) {
        const result = await this.DocumentStore.buildAssets();

        this.assetsMap = result.GUI_ASSETS_DATA_MAP_JS as AssetsMap;
        if (!this.assetsMap) {
            this.DocumentStore.setEditorMode();
            return;
        }

        this.assetsData = result.GUI_ASSETS_DATA;

        if (this.DocumentStore.project.isDashboardProject) {
            await this.DocumentStore.runtimeSettings.loadPersistentVariables();
            await this.constructObjectVariables();
        }

        if (!isDebuggerActive) {
            this.resumeAtStart = true;
        }

        // create WASM worker
        this.worker = new Worker(
            "../project-editor/flow/runtime/wasm-worker-pre.js"
        );
        this.worker.onmessage = this.onWorkerMessage;
    }

    async doStopRuntime(notifyUser: boolean) {
        if (this.requestAnimationFrameId) {
            window.cancelAnimationFrame(this.requestAnimationFrameId);
        }

        if (this.worker) {
            this.worker.terminate();
        }
    }

    ////////////////////////////////////////////////////////////////////////////////

    onWorkerMessage = async (e: { data: WorkerToRenderMessage }) => {
        if (e.data.init) {
            const message: RendererToWorkerMessage = {};

            let objectGlobalVariableValues: ObjectGlobalVariableValues;
            if (this.DocumentStore.project.isDashboardProject) {
                objectGlobalVariableValues = this.objectVariables.map(
                    objectVariable => ({
                        arrayValue: objectVariable.arrayValue,
                        globalVariableIndex: objectVariable.globalVariableIndex
                    })
                );
            } else {
                objectGlobalVariableValues = [];
            }

            message.init = {
                nodeModuleFolders: await getNodeModuleFolders(),
                assetsData: this.assetsData,
                assetsMap: this.assetsMap,
                objectGlobalVariableValues
            };

            this.worker.postMessage(message);
        } else {
            if (e.data.scpiCommand) {
                this.executeScpiCommand(e.data.scpiCommand);
                return;
            }

            if (e.data.connectToInstrumentId) {
                this.connectToInstrument(e.data.connectToInstrumentId);
                return;
            }

            if (e.data.messageToDebugger) {
                this.debuggerConnection.onMessageToDebugger(
                    arrayBufferToBinaryString(e.data.messageToDebugger)
                );
                return;
            }

            if (e.data.propertyValues) {
                this.evalProperties.valuesFromWorker(e.data.propertyValues);
            }

            this.screen = e.data.screen;
            this.requestAnimationFrameId = window.requestAnimationFrame(
                this.tick
            );
        }
    };

    tick = () => {
        this.requestAnimationFrameId = undefined;

        if (this.screen && this.ctx) {
            var imgData = new ImageData(this.screen, this.width, this.height);
            this.ctx.putImageData(imgData, 0, 0);
        }

        const message: RendererToWorkerMessage = {
            wheel: {
                deltaY: this.wheelDeltaY,
                clicked: this.wheelClicked
            },
            pointerEvents: this.pointerEvents,
            evalProperties: this.evalProperties.evalPropertiesOnNextTick,
            updateObjectGlobalVariableValues:
                this.getUpdatedObjectGlobalVariableValues()
        };

        this.worker.postMessage(message);

        this.wheelDeltaY = 0;
        this.wheelClicked = 0;
        this.pointerEvents = [];
        this.screen = undefined;
        this.evalProperties.resetEvalPropertiesOnNextTick();
    };

    ////////////////////////////////////////////////////////////////////////////////

    async constructObjectVariables() {
        for (const variable of this.DocumentStore.project.allGlobalVariables) {
            const objectVariableType = getObjectVariableTypeFromType(
                variable.type
            );
            if (objectVariableType) {
                let value = this.DocumentStore.dataContext.get(variable.name);
                if (value == null) {
                    const constructorParams =
                        await objectVariableType.editConstructorParams(
                            variable,
                            undefined
                        );

                    if (constructorParams) {
                        value = objectVariableType.createValue(
                            constructorParams,
                            true
                        );

                        this.DocumentStore.dataContext.set(
                            variable.name,
                            value
                        );
                    }
                }

                if (value != null) {
                    const arrayValue = createJsArrayValue(
                        this.assetsMap.typeIndexes[variable.type],
                        value,
                        this.assetsMap,
                        objectVariableType
                    );

                    const globalVariableInAssetsMap =
                        this.assetsMap.globalVariables.find(
                            globalVariableInAssetsMap =>
                                globalVariableInAssetsMap.name == variable.name
                        );

                    this.objectVariables.push({
                        variable,
                        value,
                        objectVariableType,
                        arrayValue,
                        globalVariableIndex: globalVariableInAssetsMap!.index
                    });
                }
            }
        }
    }

    getUpdatedObjectGlobalVariableValues(): ObjectGlobalVariableValues {
        const updatedObjectGlobalVariableValues: ObjectGlobalVariableValues =
            [];

        function isDifferent(
            oldArrayValue: ArrayValue,
            newArrayValue: ArrayValue
        ) {
            for (let i = 0; i < oldArrayValue.values.length; i++) {
                const oldValue = oldArrayValue.values[i];
                const newValue = newArrayValue.values[i];
                if (oldValue != null && typeof oldValue == "object") {
                    if (isDifferent(oldValue, newValue as ArrayValue)) {
                        return true;
                    }
                } else {
                    if (oldValue != newValue) {
                        return true;
                    }
                }
            }
            return false;
        }

        for (const objectVariable of this.objectVariables) {
            const oldArrayValue = objectVariable.arrayValue;

            const newArrayValue = createJsArrayValue(
                this.assetsMap.typeIndexes[objectVariable.variable.type],
                objectVariable.value,
                this.assetsMap,
                objectVariable.objectVariableType
            );

            if (isDifferent(oldArrayValue, newArrayValue)) {
                updatedObjectGlobalVariableValues.push({
                    arrayValue: newArrayValue,
                    globalVariableIndex: objectVariable.globalVariableIndex
                });
                objectVariable.arrayValue = newArrayValue;
            }
        }

        if (updatedObjectGlobalVariableValues.length > 0) {
            console.log(
                "updatedObjectGlobalVariableValues",
                updatedObjectGlobalVariableValues
            );
        }

        return updatedObjectGlobalVariableValues;
    }

    ////////////////////////////////////////////////////////////////////////////////

    async executeScpiCommand(scpiCommand: ScpiCommand) {
        const command = arrayBufferToBinaryString(scpiCommand.command);

        for (let i = 0; i < this.objectVariables.length; i++) {
            const instrument = this.objectVariables[i].value;
            if (instrument instanceof InstrumentObject) {
                if (scpiCommand.instrumentId == instrument.id) {
                    const CONNECTION_TIMEOUT = 5000;
                    const startTime = Date.now();
                    while (
                        !instrument.isConnected &&
                        Date.now() - startTime < CONNECTION_TIMEOUT
                    ) {
                        if (!instrument.connection.isTransitionState) {
                            instrument.connection.connect();
                        }
                        await new Promise<boolean>(resolve =>
                            setTimeout(resolve, 10)
                        );
                    }

                    if (!instrument.isConnected) {
                        const data: RendererToWorkerMessage = {
                            scpiResult: {
                                errorMessage: "instrument not connected"
                            }
                        };
                        this.worker.postMessage(data);
                        return;
                    }

                    const connection = instrument.connection;

                    try {
                        await connection.acquire(false);
                    } catch (err) {
                        let data: RendererToWorkerMessage;
                        data = {
                            scpiResult: {
                                errorMessage: err.toString()
                            }
                        };
                        this.worker.postMessage(data);
                        return;
                    }

                    let result: any = "";
                    try {
                        if (scpiCommand.isQuery) {
                            //console.log("SCPI query", command);
                            result = await connection.query(command);
                            //console.log("SCPI result", result);
                        } else {
                            //console.log("SCPI command", command);
                            connection.query(command);
                            result = "";
                        }
                    } finally {
                        connection.release();
                    }

                    let data: RendererToWorkerMessage;
                    if (typeof result != "object") {
                        data = {
                            scpiResult: {
                                result: binaryStringToArrayBuffer(
                                    result.toString()
                                )
                            }
                        };
                    } else {
                        data = {
                            scpiResult: {
                                errorMessage: result.error
                                    ? result.error
                                    : "unknown SCPI result"
                            }
                        };
                    }

                    this.worker.postMessage(data);

                    return;
                }
            }
        }
    }

    connectToInstrument(instrumentId: string) {
        for (let i = 0; i < this.objectVariables.length; i++) {
            const instrument = this.objectVariables[i].value;
            if (
                instrument instanceof InstrumentObject &&
                instrument.id == instrumentId
            ) {
                instrument.connection.connect();
            }
        }
    }

    ////////////////////////////////////////////////////////////////////////////////

    evalProperty(
        flowContext: IFlowContext,
        widget: Component,
        propertyName: string
    ) {
        return this.evalProperties.evalProperty(
            flowContext,
            widget,
            propertyName
        );
    }

    executeWidgetAction(
        flowContext: IFlowContext,
        widget: Widget,
        value: any,
        valueType: ValueType
    ) {
        const flowState = flowContext.flowState!;

        const flowStateIndex = this.flowStateToFlowIndexMap.get(flowState);
        if (flowStateIndex == undefined) {
            console.error("Unexpected!");
            return;
        }

        const flow = ProjectEditor.getFlow(widget);
        const flowPath = getObjectPathAsString(flow);
        const flowIndex = this.assetsMap.flowIndexes[flowPath];
        if (flowIndex == undefined) {
            console.error("Unexpected!");
            return;
        }

        const componentPath = getObjectPathAsString(widget);
        const componentIndex =
            this.assetsMap.flows[flowIndex].componentIndexes[componentPath];
        if (componentIndex == undefined) {
            console.error("Unexpected!");
            return;
        }

        const outputIndex = this.assetsMap.flows[flowIndex].components[
            componentIndex
        ].outputs.findIndex(output => output.outputName == "action");
        if (outputIndex == -1) {
            console.error("Unexpected!");
            return;
        }

        const valueTypeIndex = this.assetsMap.typeIndexes[valueType];
        if (valueTypeIndex == undefined) {
            console.error("Unexpected!");
            return;
        }

        const arrayValue = createJsArrayValue(
            valueTypeIndex,
            value,
            this.assetsMap,
            undefined
        );

        if (arrayValue == undefined) {
            console.error("Unexpected!");
            return;
        }

        const message: RendererToWorkerMessage = {};
        message.executeWidgetAction = {
            flowStateIndex,
            componentIndex,
            outputIndex,
            arrayValue
        };
        this.worker.postMessage(message);
    }

    ////////////////////////////////////////////////////////////////////////////////

    renderPage() {
        return <WasmCanvas />;
    }
}

////////////////////////////////////////////////////////////////////////////////

export const WasmCanvas = observer(
    class WasmCanvas extends React.Component {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        canvasRef = React.createRef<HTMLCanvasElement>();

        componentDidMount() {
            const canvasElement = this.canvasRef.current;
            if (!canvasElement) {
                return;
            }
            const canvas = canvasElement;

            const wasmRuntime = this.context.runtime as WasmRuntime;

            canvas.width = wasmRuntime.width;
            canvas.height = wasmRuntime.height;
            wasmRuntime.ctx = canvas.getContext("2d")!;

            function sendPointerEvent(event: PointerEvent) {
                var bbox = canvas.getBoundingClientRect();

                const x =
                    (event.clientX - bbox.left) * (canvas.width / bbox.width);

                const y =
                    (event.clientY - bbox.top) * (canvas.height / bbox.height);

                const pressed = event.buttons == 1 ? 1 : 0;

                wasmRuntime.pointerEvents.push({ x, y, pressed });

                event.preventDefault();
                event.stopPropagation();
            }

            canvas.addEventListener(
                "pointerdown",
                event => {
                    if (event.buttons == 4) {
                        wasmRuntime.wheelClicked = 1;
                    }
                    canvas.setPointerCapture(event.pointerId);
                    sendPointerEvent(event);
                },
                true
            );

            canvas.addEventListener(
                "pointermove",
                event => {
                    sendPointerEvent(event);
                },
                true
            );

            canvas.addEventListener(
                "pointerup",
                event => {
                    canvas.releasePointerCapture(event.pointerId);
                    sendPointerEvent(event);
                },
                true
            );

            canvas.addEventListener(
                "pointercancel",
                event => {
                    canvas.releasePointerCapture(event.pointerId);
                    sendPointerEvent(event);
                },
                true
            );

            document.addEventListener(
                "wheel",
                event => {
                    wasmRuntime.wheelDeltaY += -event.deltaY;
                },
                true
            );
        }

        componentWillUnmount() {
            const wasmRuntime = this.context.runtime as WasmRuntime;
            if (wasmRuntime) {
                wasmRuntime.ctx = undefined;
            }
        }

        render() {
            return <canvas ref={this.canvasRef} width="480" height="272" />;
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

class WasmDebuggerConnection extends DebuggerConnectionBase {
    constructor(private wasmRuntime: WasmRuntime) {
        super(wasmRuntime);
    }

    start() {}

    stop() {}

    sendMessageFromDebugger(data: string) {
        const message: RendererToWorkerMessage = {
            messageFromDebugger: binaryStringToArrayBuffer(data)
        };
        this.wasmRuntime.worker.postMessage(message);
    }
}

////////////////////////////////////////////////////////////////////////////////

class EvalProperties {
    evalFlowStates = new Map<
        number,
        {
            evalComponents: Map<
                Component,
                {
                    componentIndex: number;
                    evalProperties: {
                        [propertyName: string]: {
                            propertyIndex: number;
                            propertyValueIndexes: {
                                [indexesPath: string]: number;
                            };
                        };
                    };
                }
            >;
        }
    >();

    evalPropertiesOnNextTick: IEvalProperty[] = [];
    evalPropertiesOnNextTickSet = new Set<number>();

    propertyValues: ValueWithType[] = [];
    nextPropertyValueIndex: number = 0;

    constructor(public wasmRuntime: WasmRuntime) {
        makeObservable(this, {
            propertyValues: observable
        });
    }

    valuesFromWorker(widgetPropertyValues: IPropertyValue[]) {
        if (widgetPropertyValues.length > 0) {
            runInAction(() => {
                widgetPropertyValues.forEach(propertyValue => {
                    this.propertyValues[propertyValue.propertyValueIndex] =
                        propertyValue.valueWithType;
                });
            });
        }
    }

    evalProperty(
        flowContext: IFlowContext,
        component: Component,
        propertyName: string
    ) {
        const flowState = flowContext.flowState!;

        const flowStateIndex =
            this.wasmRuntime.flowStateToFlowIndexMap.get(flowState);
        if (flowStateIndex == undefined) {
            console.error("Unexpected!");
            return undefined;
        }

        let evalFlowState = this.evalFlowStates.get(flowStateIndex);
        if (!evalFlowState) {
            // add new evalFlowState
            evalFlowState = {
                evalComponents: new Map()
            };
            this.evalFlowStates.set(flowStateIndex, evalFlowState);
        }

        let evalComponent = evalFlowState.evalComponents.get(component);
        if (!evalComponent) {
            // add new evalComponent
            const flow = ProjectEditor.getFlow(component);
            const flowPath = getObjectPathAsString(flow);
            const flowIndex = this.wasmRuntime.assetsMap.flowIndexes[flowPath];
            if (flowIndex == undefined) {
                console.error("Unexpected!");
                return undefined;
            }

            const componentPath = getObjectPathAsString(component);
            const componentIndex =
                this.wasmRuntime.assetsMap.flows[flowIndex].componentIndexes[
                    componentPath
                ];
            if (componentIndex == undefined) {
                console.error("Unexpected!");
                return undefined;
            }

            evalComponent = {
                componentIndex,
                evalProperties: {}
            };

            evalFlowState.evalComponents.set(component, evalComponent);
        }

        const indexes = flowContext.dataContext.get(
            FLOW_ITERATOR_INDEXES_VARIABLE
        );
        let indexesPath: string;
        if (indexes == undefined || indexes.length == 0) {
            indexesPath = ".";
        } else {
            indexesPath = indexes.join("/");
        }

        let evalProperty = evalComponent.evalProperties[propertyName];
        if (evalProperty == undefined) {
            // add new evalProperty
            const propertyIndex = this.getPropertyIndex(
                component,
                propertyName
            );
            if (propertyIndex == -1) {
                console.error("Unexpected!");
                return undefined;
            }

            evalProperty = {
                propertyIndex,
                propertyValueIndexes: {
                    [indexesPath]: this.nextPropertyValueIndex
                }
            };
            this.nextPropertyValueIndex++;

            evalComponent.evalProperties[propertyName] = evalProperty;
        } else {
            if (evalProperty.propertyValueIndexes[indexesPath] == undefined) {
                evalProperty.propertyValueIndexes[indexesPath] =
                    this.nextPropertyValueIndex;
                this.nextPropertyValueIndex++;
            }
        }

        let propertyValueIndex = evalProperty.propertyValueIndexes[indexesPath];

        if (!this.evalPropertiesOnNextTickSet.has(propertyValueIndex)) {
            // add property to evalute on next tick
            this.evalPropertiesOnNextTickSet.add(propertyValueIndex);

            this.evalPropertiesOnNextTick.push({
                flowStateIndex,
                componentIndex: evalComponent.componentIndex,
                propertyIndex: evalProperty.propertyIndex,
                propertyValueIndex,
                indexes
            });
        }

        if (propertyValueIndex < this.propertyValues.length) {
            // get evaluated value
            return this.propertyValues[propertyValueIndex].value;
        }

        // not evaluated yet
        return undefined;
    }

    resetEvalPropertiesOnNextTick() {
        this.evalPropertiesOnNextTick = [];
        this.evalPropertiesOnNextTickSet.clear();
    }

    private getPropertyIndex(component: Component, propertyName: string) {
        const classInfo = getClassInfo(component);

        const properties = classInfo.properties.filter(propertyInfo =>
            isFlowProperty(propertyInfo, [
                "input",
                "template-literal",
                "assignable"
            ])
        );

        return properties.findIndex(property => property.name == propertyName);
    }
}

////////////////////////////////////////////////////////////////////////////////

function arrayBufferToBinaryString(data: ArrayBuffer) {
    const buffer = Buffer.from(data);
    return buffer.toString("binary");
}

function binaryStringToArrayBuffer(data: string) {
    const buffer = Buffer.from(data, "binary");
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    );
}
