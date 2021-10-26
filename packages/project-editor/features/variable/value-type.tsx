import React from "react";
import { computed, action, observable, autorun, runInAction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import { FieldComponent } from "eez-studio-ui/generic-dialog";
import {
    ClassInfo,
    EezObject,
    PropertyType,
    PropertyInfo,
    PropertyProps,
    getClassesDerivedFrom,
    getClassByName
} from "project-editor/core/object";
import type { Project } from "project-editor/project/project";
import { ProjectContext } from "project-editor/project/context";
import { humanize } from "eez-studio-shared/string";
import { getPropertyValue } from "project-editor/components/PropertyGrid/utils";
import type { IVariable } from "project-editor/flow/flow-interfaces";
import { _difference } from "eez-studio-shared/algorithm";
import { getClassInfo } from "project-editor/core/store";

////////////////////////////////////////////////////////////////////////////////

const basicTypeNames = [
    "integer",
    "float",
    "double",
    "boolean",
    "string",
    "date",
    "any"
];

export type BasicType =
    | "integer"
    | "float"
    | "double"
    | "boolean"
    | "string"
    | "date"
    | "any";

export type ValueType =
    | BasicType
    | "undefined"
    | "null"
    | `object:${string}`
    | "enum:${string}"
    | `struct:${string}`
    | `array:${BasicType}`
    | `array:object:${string}`
    | `array:struct:${string}`
    | `array:enum:${string}`;

export class ObjectType extends EezObject {
    static classInfo: ClassInfo = {
        properties: []
    };
}

////////////////////////////////////////////////////////////////////////////////

export function humanizeVariableType(type: string): string {
    if (isObjectType(type)) {
        return getObjectType(type) ?? "";
    }
    if (isEnumType(type)) {
        return getEnumTypeNameFromType(type) ?? "";
    }
    if (isStructType(type)) {
        return getStructTypeNameFromType(type) ?? "";
    }
    if (isArrayType(type)) {
        return `Array of ${humanizeVariableType(
            getArrayElementTypeFromType(type) ?? ""
        )}`;
    }
    return humanize(type);
}

export function getDefaultValueForType(project: Project, type: string): string {
    if (isObjectType(type)) {
        return "null";
    }
    if (isEnumType(type)) {
        const enumTypeName = getEnumTypeNameFromType(type);
        if (enumTypeName) {
            const enumType = project.variables.enumsMap.get(enumTypeName);
            if (enumType) {
                if (enumType.members.length > 0) {
                    return `${enumTypeName}.${enumType.members[0].name}`;
                }
            }
        }
        return "0";
    }
    if (isStructType(type)) {
        return "null";
    }
    if (isArrayType(type)) {
        return "null";
    }
    if (type == "string") {
        return '""';
    }
    if (type == "boolean") {
        return "false";
    }
    if (type == "integer" || type == "float" || type == "double") {
        return "0";
    }
    return "null";
}

export function getValueLabel(
    project: Project,
    value: any,
    type: string | null
) {
    if (value === undefined) {
        return "undefined";
    }

    if (value == "null") {
        return "null";
    }

    if (type) {
        if (isEnumType(type)) {
            const enumTypeName = getEnumTypeNameFromType(type);
            if (enumTypeName) {
                const enumType = project.variables.enumsMap.get(enumTypeName);
                if (enumType) {
                    const enumMember = enumType.members.find(
                        member => member.value == value
                    );
                    if (enumMember) {
                        return enumMember.name;
                    }
                }
            }
        }
    }

    if (Array.isArray(value)) {
        return `${value.length} element(s)`;
    }

    if (typeof value == "object") {
        try {
            return JSON.stringify(value);
        } catch (err) {
            return "[object]";
        }
    }

    if (typeof value == "string") {
        return `"${value}"`;
    }

    return value.toString();
}

////////////////////////////////////////////////////////////////////////////////

const VariableTypeSelect = observer(
    React.forwardRef<
        HTMLSelectElement,
        {
            value: string;
            onChange: (value: string) => void;
            project: Project;
        }
    >((props, ref) => {
        const { value, onChange, project } = props;
        const basicTypes = basicTypeNames.map(basicTypeName => {
            return (
                <option key={basicTypeName} value={basicTypeName}>
                    {humanizeVariableType(basicTypeName)}
                </option>
            );
        });

        basicTypes.unshift(<option key="__empty" value="" />);

        const objectVariableTypeClasses = getClassesDerivedFrom(ObjectType);
        const objectVariableTypes = objectVariableTypeClasses.map(
            objectVariableTypeClass => {
                let name = objectVariableTypeClass.name;
                if (name.endsWith("VariableType")) {
                    name = name.substr(0, name.length - "VariableType".length);
                }

                return (
                    <option key={name} value={`object:${name}`}>
                        {humanizeVariableType(`object:${name}`)}
                    </option>
                );
            }
        );

        const enums = project.variables.enums.map(enumDef => (
            <option key={enumDef.name} value={`enum:${enumDef.name}`}>
                {humanizeVariableType(`enum:${enumDef.name}`)}
            </option>
        ));

        const structures = project.variables.structures.map(struct => (
            <option key={struct.name} value={`struct:${struct.name}`}>
                {humanizeVariableType(`struct:${struct.name}`)}
            </option>
        ));

        const arrayOfBasicTypes = basicTypeNames.map(basicTypeName => {
            return (
                <option
                    key={`array:${basicTypeName}`}
                    value={`array:${basicTypeName}`}
                >
                    {humanizeVariableType(`array:${basicTypeName}`)}
                </option>
            );
        });

        const arrayOfObjects = objectVariableTypeClasses.map(
            objectVariableTypeClass => {
                let name = objectVariableTypeClass.name;
                if (name.endsWith("VariableType")) {
                    name = name.substr(0, name.length - "VariableType".length);
                }

                return (
                    <option key={name} value={`array:object:${name}`}>
                        {humanizeVariableType(`array:object:${name}`)}
                    </option>
                );
            }
        );

        const arrayOfEnums = project.variables.enums.map(enumDef => (
            <option key={enumDef.name} value={`array:enum:${enumDef.name}`}>
                {humanizeVariableType(`array:enum:${enumDef.name}`)}
            </option>
        ));

        const arrayOfStructures = project.variables.structures.map(struct => (
            <option key={struct.name} value={`array:struct:${struct.name}`}>
                {humanizeVariableType(`array:struct:${struct.name}`)}
            </option>
        ));

        return (
            <select
                ref={ref}
                className="form-select"
                value={value}
                onChange={event => onChange(event.target.value)}
            >
                {basicTypes}
                {objectVariableTypes.length > 0 && (
                    <optgroup label="Objects">{objectVariableTypes}</optgroup>
                )}
                {enums.length > 0 && (
                    <optgroup label="Enumerations">{enums}</optgroup>
                )}
                {structures.length > 0 && (
                    <optgroup label="Structures">{structures}</optgroup>
                )}
                <optgroup label="Arrays">{arrayOfBasicTypes}</optgroup>
                {arrayOfObjects.length > 0 && (
                    <optgroup label="Array of Objects">
                        {arrayOfObjects}
                    </optgroup>
                )}
                {arrayOfEnums.length > 0 && (
                    <optgroup label="Array of Enumerations">
                        {arrayOfEnums}
                    </optgroup>
                )}
                {arrayOfStructures.length > 0 && (
                    <optgroup label="Array of Structures">
                        {arrayOfStructures}
                    </optgroup>
                )}
            </select>
        );
    })
);

@observer
export class VariableTypeUI extends React.Component<PropertyProps> {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    ref = React.createRef<HTMLSelectElement>();

    @observable _type: ValueType;
    @observable updateCounter: number = 0;

    @computed get typePropertyInfo() {
        return getClassInfo(this.props.objects[0]).properties.find(
            propertyInfo => propertyInfo.name === "type"
        )!;
    }

    @disposeOnUnmount
    changeDocumentDisposer = autorun(() => {
        this.updateCounter;
        if (this.context.project) {
            const getPropertyValueResultForType = getPropertyValue(
                this.props.objects,
                this.typePropertyInfo
            );

            let type = getPropertyValueResultForType
                ? getPropertyValueResultForType.value
                : "";

            if (type == undefined) {
                type = "";
            }

            runInAction(() => {
                this._type = type;
            });
        }
    });

    componentDidMount() {
        let el = this.ref.current;
        if (el) {
            $(el).on("focus", () => {
                this.context.undoManager.setCombineCommands(true);
            });

            $(el).on("blur", () => {
                this.context.undoManager.setCombineCommands(false);
            });
        }
    }

    @action
    componentDidUpdate() {
        this.updateCounter++;
    }

    onChange = (type: string) => {
        runInAction(() => (this._type = type as ValueType));

        this.props.updateObject({
            type
        });
    };

    render() {
        return (
            <VariableTypeSelect
                ref={this.ref}
                value={this._type}
                onChange={this.onChange}
                project={this.context.project}
            />
        );
    }
}

@observer
export class VariableTypeFieldComponent extends FieldComponent {
    get project() {
        return this.props.dialogContext as Project;
    }

    render() {
        return (
            <VariableTypeSelect
                value={this.props.values[this.props.fieldProperties.name] ?? ""}
                onChange={(value: string) => {
                    runInAction(() => {
                        this.props.values["defaultValue"] =
                            getDefaultValueForType(this.project, value);
                    });
                    this.props.onChange(value);
                }}
                project={this.project}
            />
        );
    }
}

export const variableTypeUIProperty = {
    name: "variableTypeUI",
    displayName: "Type",
    type: PropertyType.Any,
    computed: true,
    propertyGridColumnComponent: VariableTypeUI
};

////////////////////////////////////////////////////////////////////////////////

export const variableTypeProperty: PropertyInfo = {
    name: "type",
    type: PropertyType.String,
    hideInPropertyGrid: true
};

////////////////////////////////////////////////////////////////////////////////

export function migrateType(objectJS: any) {
    if (!objectJS.type) {
        return;
    }
    if (objectJS.type == "list") {
        objectJS.type = "array";
    } else if (objectJS.type.startsWith("custom:")) {
        objectJS.type = `object:${objectJS.type.substring("custom:".length)}`;
    } else if (objectJS.type == "struct") {
        objectJS.type = `struct:${objectJS.structure}`;
        delete objectJS.structure;
    } else if (objectJS.type == "enum") {
        objectJS.type = `enum:${objectJS.enum}`;
        delete objectJS.enum;
    }
}

////////////////////////////////////////////////////////////////////////////////

const ENUM_TYPE_REGEXP = /^enum:(.*)/;
const STRUCT_TYPE_REGEXP = /^struct:(.*)/;
const ARRAY_TYPE_REGEXP = /^array:(.*)/;
const OBJECT_TYPE_REGEXP = /^object:(.*)/;

export function isIntegerType(type: string) {
    return type == "integer";
}

export function isEnumType(type: string) {
    return type && type.match(ENUM_TYPE_REGEXP) != null;
}

export function isStructType(type: string) {
    return type && type.match(STRUCT_TYPE_REGEXP) != null;
}

export function isArrayType(type: string) {
    return type && type.match(ARRAY_TYPE_REGEXP) != null;
}

export function isObjectType(type: string) {
    return type && type.match(OBJECT_TYPE_REGEXP) != null;
}

export function getObjectType(type: string) {
    const result = type.match(OBJECT_TYPE_REGEXP);
    if (result == null) {
        return null;
    }
    return result[1];
}

export function getArrayElementTypeFromType(type: string) {
    const result = type.match(ARRAY_TYPE_REGEXP);
    if (result == null) {
        return null;
    }
    return result[1];
}

export function getStructTypeNameFromType(type: string) {
    const result = type.match(STRUCT_TYPE_REGEXP);
    if (result == null) {
        return null;
    }
    return result[1];
}

export function getStructureFromType(project: Project, type: string) {
    const structTypeName = getStructTypeNameFromType(type);
    if (!structTypeName) {
        return undefined;
    }
    return project.variables.structsMap.get(structTypeName);
}

export function getEnumTypeNameFromType(type: string) {
    const result = type.match(ENUM_TYPE_REGEXP);
    if (result == null) {
        return null;
    }
    return result[1];
}

export function getObjectTypeClassFromType(type: string) {
    const result = type.match(OBJECT_TYPE_REGEXP);
    if (result == null) {
        return null;
    }

    let aClass = getClassByName(result[1]);
    if (!aClass) {
        aClass = getClassByName(result[1] + "VariableType");
    }

    return aClass;
}

export function isIntegerVariable(variable: IVariable) {
    return isIntegerType(variable.type);
}

export function isEnumVariable(variable: IVariable) {
    return isEnumType(variable.type);
}

export function isStructVariable(variable: IVariable) {
    return isStructType(variable.type);
}

export function isArrayVariable(variable: IVariable) {
    return isArrayType(variable.type);
}

export function getEnumTypeNameFromVariable(variable: IVariable) {
    return getEnumTypeNameFromType(variable.type);
}

export function getEnumValues(variable: IVariable): any[] {
    return [];
}

export function isValueTypeOf(
    project: Project,
    value: any,
    type: string
): string | null {
    if (value == null) {
        return null;
    }
    if (type == "integer") {
        if (Number.isInteger(value)) return null;
    } else if (type == "float" || type == "double") {
        if (typeof value == "number") return null;
    } else if (type == "boolean") {
        if (typeof value == "boolean" || Number.isInteger(value)) return null;
    } else if (type == "string") {
        if (typeof value == "string") return null;
    } else if (type == "date") {
        return null;
    } else if (isArrayType(type)) {
        if (Array.isArray(value)) {
            const arrayElementType = getArrayElementTypeFromType(type);

            for (let i = 0; i < value.length; i++) {
                const result = isValueTypeOf(
                    project,
                    value[i],
                    arrayElementType!
                );
                if (result) {
                    return `${result} => array element ${
                        i + 1
                    } is not an ${type}`;
                }
            }

            return null;
        }
    } else if (isStructType(type)) {
        if (typeof value == "object") {
            const structure = getStructureFromType(project, type);
            if (!structure) {
                return `'${type}' not found`;
            }

            const keys = [];

            for (const key in value) {
                const field = structure.fieldsMap.get(key);
                if (!field) {
                    return `unknown field '${key}'`;
                }

                const result = isValueTypeOf(project, value[key], field.type);
                if (result) {
                    return `${result} => field '${key}' should be of type '${field.type}'`;
                }

                keys.push(key);
            }

            const result = _difference(
                structure.fields.map(field => field.name),
                keys
            );

            if (result.length > 0) {
                return `missing field(s): ${result.join(",")}`;
            }

            return null;
        }
    } else if (isEnumType(type)) {
        if (!Number.isInteger(value)) {
            return `not an integer`;
        }

        const enumTypeName = getEnumTypeNameFromType(type);
        if (!enumTypeName) {
            return "enum name expected";
        }

        const enumType = project.variables.enumsMap.get(enumTypeName);
        if (!enumType) {
            return `enum '${enumTypeName}' not found`;
        }

        if (!enumType.members.find(member => member.value == value)) {
            return `value not in enum '${enumTypeName}'`;
        }

        return null;
    }

    return `not an ${type}`;
}
