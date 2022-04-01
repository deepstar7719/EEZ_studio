import type { ArrayValue } from "project-editor/flow/runtime/wasm-value";
import type { ValueType } from "project-editor/features/variable/value-type";

////////////////////////////////////////////////////////////////////////////////

// message data sent from WASM worker to renderer
export interface WorkerToRenderMessage {
    // sent from worker once at the start
    init?: any;

    // screen data (to be displayed in Canvas), sent from worker at each tick
    screen?: Uint8ClampedArray;

    // message from worker to Studio debugger
    messageToDebugger?: Uint8Array;

    // SCPI command to execute (only renderer is able to execute SCPI commands)
    scpiCommand?: ScpiCommand;

    // connect to instrument ID
    connectToInstrumentId?: string;

    // evaluated property values
    propertyValues?: IPropertyValue[];
}

// message data sent from renderer to WASM worker
export interface RendererToWorkerMessage {
    // response to init message from WASM worker
    init?: {
        nodeModuleFolders: string[];
        assetsData: Uint8Array;
        assetsMap: AssetsMap;
        objectGlobalVariableValues: ObjectGlobalVariableValues;
    };

    // mouse data from Canvas
    wheel?: {
        deltaY: number;
        clicked: number;
    };
    pointerEvents?: {
        x: number;
        y: number;
        pressed: number;
    }[];

    // message from Studio debugger to worker
    messageFromDebugger?: ArrayBuffer;

    // result of SCPI command execution
    scpiResult?: ScpiResult;

    // request to worker to evaluate some property values
    evalProperties?: IEvalProperty[];

    // request to worker to execute widget action
    executeWidgetAction?: {
        flowStateIndex: number;
        componentIndex: number;
        outputIndex: number;
        arrayValue: ArrayValue;
    };

    updateObjectGlobalVariableValues?: ObjectGlobalVariableValues;
}

////////////////////////////////////////////////////////////////////////////////

export type ObjectGlobalVariableValues = {
    globalVariableIndex: number;
    arrayValue: ArrayValue;
}[];

////////////////////////////////////////////////////////////////////////////////

export interface IEvalProperty {
    flowStateIndex: number;
    componentIndex: number;
    propertyIndex: number;
    propertyValueIndex: number;
    indexes: number[];
}

////////////////////////////////////////////////////////////////////////////////

export interface IPropertyValue {
    propertyValueIndex: number;
    valueWithType: ValueWithType;
}

export type ValueWithType = {
    value: Value;
    valueType: ValueType;
};

export type Value =
    | null
    | undefined
    | boolean
    | number
    | string
    | ObjectOrArrayValue;

export type ObjectOrArrayValueWithType = {
    value: ObjectOrArrayValue;
    valueType: ValueType;
};

export type ObjectOrArrayValue =
    | undefined
    | Value[]
    | { [fieldName: string]: Value };

////////////////////////////////////////////////////////////////////////////////

export interface ScpiCommand {
    instrumentId: string;
    command: Uint8Array;
    isQuery: boolean;
}

export interface ScpiResult {
    errorMessage?: string;
    result?: ArrayBuffer;
}
