import type {
    IObjectVariableValueFieldDescription,
    ValueType
} from "eez-studio-types";

import type { Structure } from "project-editor/features/variable/variable";
import type { DocumentStoreClass } from "project-editor/store";
import {
    getStructureFromType,
    isObjectType,
    isStructType,
    getObjectVariableTypeFromType,
    objectVariableTypes,
    isArrayType,
    getArrayElementTypeFromType
} from "project-editor/features/variable/value-type";

function getFieldIndexes(fields: IField[]): IIndexes {
    const fieldIndexes: IIndexes = {};
    fields.forEach((field, i) => (fieldIndexes[field.name] = i));
    return fieldIndexes;
}

export class TypesStore {
    private _types: IType[] = [];
    private _typeIndexes: IIndexes = {};
    private _numDynamicTypes: number = 0;

    constructor(public DocumentStore: DocumentStoreClass) {}

    reset() {
        this._types = [];
        this._typeIndexes = {};
        this._numDynamicTypes = 0;

        objectVariableTypes.forEach(
            (objectVariableType, objectVariableTypeName) =>
                this.addType(
                    this.objectVariableFieldDescriptionsToType(
                        `object:${objectVariableTypeName}`,
                        objectVariableType.valueFieldDescriptions
                    )
                )
        );
    }

    get types() {
        return JSON.parse(JSON.stringify(this._types));
    }

    get typeIndexes() {
        return JSON.parse(JSON.stringify(this._typeIndexes));
    }

    createOpenType() {
        const valueType: ValueType = `dynamic:${this._numDynamicTypes++}`;
        const type: IType = {
            kind: "object",
            valueType,
            fields: [],
            fieldIndexes: {},
            open: true
        };
        this.addType(type);
        return valueType;
    }

    getValueTypeIndex(valueType: ValueType): number | undefined {
        const type = this.getTypeFromValueType(valueType);
        if (!type) {
            return undefined;
        }
        return this._typeIndexes[type.valueType];
    }

    getType(valueType: ValueType) {
        return this.getTypeFromValueType(valueType);
    }

    getFieldType(
        valueType: ValueType,
        fieldName: string
    ): ValueType | undefined {
        const type = this.getTypeFromValueType(valueType);
        if (!type) {
            return undefined;
        }

        if (type.kind == "basic") {
            return undefined;
        }

        if (type.kind == "array") {
            return type.elementType.valueType;
        }

        let field: IField | undefined;

        let fieldIndex = type.fieldIndexes[fieldName];
        if (fieldIndex != undefined) {
            field = type.fields[fieldIndex];
        } else if (type.open) {
            field = {
                name: fieldName,
                valueType: "any"
            };
            type.fieldIndexes[fieldName] = type.fields.length;
            type.fields.push(field);
        }

        return field?.valueType;
    }

    getFieldIndex(valueType: ValueType, fieldName: string): number | undefined {
        const type = this.getTypeFromValueType(valueType);
        if (!type) {
            return undefined;
        }
        if (type.kind == "object") {
            return type.fieldIndexes[fieldName];
        }
        return undefined;
    }

    private addType(type: IType) {
        this._typeIndexes[type.valueType] = this._types.length;
        this._types.push(type);
    }

    private getTypeFromValueType(valueType: ValueType): IType | undefined {
        const index = this._typeIndexes[valueType];
        if (index != undefined) {
            return this._types[index];
        }

        if (isArrayType(valueType)) {
            const elementValueType = getArrayElementTypeFromType(valueType);
            if (!elementValueType) {
                return undefined;
            }

            const elementType = this.getTypeFromValueType(
                elementValueType as ValueType
            );
            if (!elementType) {
                return undefined;
            }

            const type: IType = {
                kind: "array",
                valueType,
                elementType
            };

            this.addType(type);

            return type;
        }

        if (isStructType(valueType)) {
            const structure = getStructureFromType(
                this.DocumentStore.project,
                valueType
            );
            if (structure) {
                const type = this.structureToType(structure);
                this.addType(type);
                return type;
            }
        }

        if (isObjectType(valueType)) {
            const objectVariableType = getObjectVariableTypeFromType(valueType);
            if (objectVariableType) {
                const type = this.objectVariableFieldDescriptionsToType(
                    valueType,
                    objectVariableType.valueFieldDescriptions
                );
                this.addType(type);
                return type;
            }
        }

        const type: IType = {
            kind: "basic",
            valueType
        };
        this.addType(type);

        return type;
    }

    private structureToType(structure: Structure): IType {
        const fields: IField[] = structure.fields.map(field => ({
            name: field.name,
            valueType: field.type
        }));

        return {
            kind: "object",
            valueType: `struct:${structure.name}`,
            fields,
            fieldIndexes: getFieldIndexes(fields),
            open: false
        };
    }

    private objectVariableFieldDescriptionsToType(
        valueType: ValueType,
        valueFieldDescriptions: IObjectVariableValueFieldDescription[]
    ): IType {
        const fields: IField[] = valueFieldDescriptions.map(
            valueFieldDescription => ({
                name: valueFieldDescription.name,
                valueType:
                    typeof valueFieldDescription.valueType == "string"
                        ? valueFieldDescription.valueType
                        : this.createDynamicTypeForObjectVariableValueFieldDescription(
                              valueFieldDescription.valueType
                          )
            })
        );

        return {
            kind: "object",
            valueType,
            fields,
            fieldIndexes: getFieldIndexes(fields),
            open: false
        };
    }

    private createDynamicTypeForObjectVariableValueFieldDescription(
        valueFieldDescriptions: IObjectVariableValueFieldDescription[]
    ): ValueType {
        const valueType: ValueType = `dynamic:${this._numDynamicTypes++}`;
        const type = this.objectVariableFieldDescriptionsToType(
            valueType,
            valueFieldDescriptions
        );
        this.addType(type);
        return valueType;
    }
}
