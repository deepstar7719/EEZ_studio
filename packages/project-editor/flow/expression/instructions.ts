import { Assets } from "project-editor/features/page/build/assets";

const EXPR_EVAL_INSTRUCTION_TYPE_PUSH_CONSTANT = 0 << 13;
const EXPR_EVAL_INSTRUCTION_TYPE_PUSH_INPUT = 1 << 13;
const EXPR_EVAL_INSTRUCTION_TYPE_PUSH_LOCAL_VAR = 2 << 13;
const EXPR_EVAL_INSTRUCTION_TYPE_PUSH_GLOBAL_VAR = 3 << 13;
const EXPR_EVAL_INSTRUCTION_TYPE_PUSH_OUTPUT = 4 << 13;
const EXPR_EVAL_INSTRUCTION_TYPE_OPERATION = 5 << 13;
const EXPR_EVAL_INSTRUCTION_TYPE_END = 6 << 13;

export function makePushConstantInstruction(assets: Assets, value: any) {
    return (
        EXPR_EVAL_INSTRUCTION_TYPE_PUSH_CONSTANT |
        assets.getConstantIndex(value)
    );
}

export function makePushInputInstruction(inputIndex: number) {
    return EXPR_EVAL_INSTRUCTION_TYPE_PUSH_INPUT | inputIndex;
}

export function makePushOutputInstruction(outputIndex: number) {
    return EXPR_EVAL_INSTRUCTION_TYPE_PUSH_OUTPUT | outputIndex;
}

export function makePushLocalVariableInstruction(localVariableIndex: number) {
    return EXPR_EVAL_INSTRUCTION_TYPE_PUSH_LOCAL_VAR | localVariableIndex;
}

export function makePushGlobalVariableInstruction(globalVariableIndex: number) {
    return EXPR_EVAL_INSTRUCTION_TYPE_PUSH_GLOBAL_VAR | globalVariableIndex;
}

export function makeOperationInstruction(operationIndex: number) {
    return EXPR_EVAL_INSTRUCTION_TYPE_OPERATION | operationIndex;
}

export function makeEndInstruction() {
    return EXPR_EVAL_INSTRUCTION_TYPE_END;
}
