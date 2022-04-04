import type { Stream } from "stream";
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

    componentMessages?: IMessageFromWorker[];
}

// message data sent from renderer to WASM worker
export interface RendererToWorkerMessage {
    // response to init message from WASM worker
    init?: {
        nodeModuleFolders: string[];
        assetsData: Uint8Array;
        assetsMap: AssetsMap;
        globalVariableValues: IGlobalVariable[];
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

    // request to worker to change some property values
    assignProperties?: IAssignProperty[];

    // request to worker to execute widget action
    executeWidgetAction?: {
        flowStateIndex: number;
        componentIndex: number;
        outputIndex: number;
        arrayValue: ArrayValue;
    };

    updateGlobalVariableValues?: IGlobalVariable[];

    resultToWorker?: {
        messageId: number;
        result: any;
    };
}

////////////////////////////////////////////////////////////////////////////////

interface IGlobalVariableBase {
    globalVariableIndex: number;
}

interface IBasicGlobalVariable extends IGlobalVariableBase {
    kind: "basic";
    value: null | undefined | number | boolean | string;
}

interface IArrayGlobalVariable extends IGlobalVariableBase {
    kind: "array";
    value: ArrayValue;
}

export type IGlobalVariable = IBasicGlobalVariable | IArrayGlobalVariable;

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
    | Uint8Array
    | Stream
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

export interface IAssignProperty {
    flowStateIndex: number;
    componentIndex: number;
    propertyIndex: number;
    indexes: number[];
    value: any;
}

////////////////////////////////////////////////////////////////////////////////

export interface ScpiCommand {
    instrumentId: string;
    command: Uint8Array;
    isQuery: boolean;
}

export interface ScpiResult {
    errorMessage?: string;
    result?: ArrayBuffer | Uint8Array;
}
