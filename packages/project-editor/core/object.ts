import React from "react";
import { observable, makeObservable } from "mobx";

import { _uniqWith } from "eez-studio-shared/algorithm";
import { humanize } from "eez-studio-shared/string";
import { Rect } from "eez-studio-shared/geometry";

import type { IDashboardComponentContext } from "eez-studio-types";

import {
    ProjectStore,
    IContextMenuContext,
    getClassInfo
} from "project-editor/store";

import type { IResizeHandler } from "project-editor/flow/flow-interfaces";

import type { ValueType } from "project-editor/features/variable/value-type";
import type { LVGLParts } from "project-editor/lvgl/style-helper";
import type { Project } from "project-editor/project/project";

////////////////////////////////////////////////////////////////////////////////

export const enum PropertyType {
    Array,
    Object,

    Boolean,

    Number,

    Enum,

    String,
    MultilineText,
    Image,
    Color,
    ThemedColor,
    RelativeFolder,
    RelativeFile,
    ObjectReference,

    JSON,
    JavaScript,
    CSS,
    Python,
    CPP,

    GUID,

    StringArray,
    ConfigurationReference,
    Any,

    LVGLWidget,

    Null
}

export const enum ProjectType {
    FIRMWARE = "firmware",
    FIRMWARE_MODULE = "firmware-module",
    RESOURCE = "resource",
    APPLET = "applet",
    DASHBOARD = "dashboard",
    LVGL = "lvgl"
}

////////////////////////////////////////////////////////////////////////////////

export interface EnumItem {
    id: string | number;
    label?: string;
}

export enum MessageType {
    INFO,
    ERROR,
    WARNING,
    SEARCH_RESULT,
    GROUP
}

export interface IMessage {
    type: MessageType;
    text: string;
    object?: IEezObject;
    messages?: IMessage[];
}

export interface IPropertyGridGroupDefinition {
    id: string;
    title: string;
    position?: number | ((object: IEezObject) => number);
}

export interface PropertyProps {
    propertyInfo: PropertyInfo;
    objects: IEezObject[];
    readOnly: boolean;
    updateObject: (propertyValues: Object) => void;
    collapsed?: boolean;
}

export interface IOnSelectParams {
    textInputSelection?: {
        start: number | null;
        end: number | null;
        direction: "forward" | "backward" | "none" | null | undefined;
    };
}

export type FlowPropertyType =
    | "input"
    | "output"
    | "assignable"
    | "template-literal"
    | "scpi-template-literal";

export interface PropertyInfo {
    name: string;
    type: PropertyType;

    dynamicType?: (object: IEezObject) => PropertyType;
    dynamicTypeReferencedObjectCollectionPath?: (
        object: IEezObject
    ) => string | undefined;

    // optional properties
    displayName?: string | ((object: IEezObject) => string);
    enumItems?: EnumItem[] | ((object: IEezObject) => EnumItem[]);
    enumDisallowUndefined?: boolean;
    typeClass?: EezClass;
    referencedObjectCollectionPath?: string;
    filterReferencedObjectCollection?: (
        objects: IEezObject[],
        referencedObject: IEezObject
    ) => boolean;
    computed?: boolean;
    modifiable?: boolean;
    onSelect?: (
        object: IEezObject,
        propertyInfo: PropertyInfo,
        params?: IOnSelectParams
    ) => Promise<any>;
    isOnSelectAvailable?: (object: IEezObject) => boolean;
    onSelectTitle?: string;
    hideInPropertyGrid?:
        | boolean
        | ((object: IEezObject, propertyInfo: PropertyInfo) => boolean);
    readOnlyInPropertyGrid?:
        | boolean
        | ((object: IEezObject, propertyInfo: PropertyInfo) => boolean);
    propertyGridGroup?: IPropertyGridGroupDefinition;
    propertyGridRowComponent?: React.ComponentType<PropertyProps>;
    propertyGridColumnComponent?: React.ComponentType<PropertyProps>;
    propertyGridCollapsable?: boolean;
    propertyGridCollapsableDefaultPropertyName?: string;
    propertyGridCollapsableEnabled?: (object: IEezObject) => boolean;
    enumerable?:
        | boolean
        | ((object: IEezObject, propertyInfo: PropertyInfo) => boolean);
    showOnlyChildrenInTree?: boolean;
    isOptional?:
        | boolean
        | ((object: IEezObject, propertyInfo: PropertyInfo) => boolean);
    defaultValue?: any;
    inheritable?: boolean;
    propertyMenu?: (props: PropertyProps) => Electron.MenuItem[];
    unique?:
        | boolean
        | ((
              object: IEezObject,
              parent: IEezObject,
              propertyInfo: PropertyInfo
          ) => (
              object: any,
              ruleName: string
          ) => Promise<string | null> | string | null);
    skipSearch?: boolean;
    childLabel?: (childObject: IEezObject, childLabel: string) => string;
    check?: (object: IEezObject, messages: IMessage[]) => void;
    interceptAddObject?: (
        parentObject: IEezObject,
        object: EezObject
    ) => EezObject;
    downloadFileName?: (
        object: IEezObject,
        propertyInfo: PropertyInfo
    ) => string;
    defaultImagesPath?: (projectStore: ProjectStore) => string | undefined;
    partOfNavigation?: boolean;
    fileFilters?: any;

    flowProperty?:
        | FlowPropertyType
        | ((object: IEezObject | undefined) => FlowPropertyType | undefined);
    expressionType?: ValueType;
    expressionIsConstant?: boolean;
    isOutputOptional?:
        | boolean
        | ((object: IEezObject, propertyInfo: PropertyInfo) => boolean);

    monospaceFont?: boolean;
    disableSpellcheck?: boolean;
    cssAttributeName?: string;
    checkboxStyleSwitch?: boolean;
    checkboxHideLabel?: boolean;
    arrayItemOrientation?: "vertical" | "horizontal";
    disableBitmapPreview?: boolean;
    inputPlaceholder?: (object: IEezObject) => string;
    embeddedImage?: boolean;

    propertyGridColSpan?: boolean;
}

export type InheritedValue =
    | {
          value: any;
          source: IEezObject;
      }
    | undefined;

export interface SerializedData {
    objectClassName: string;
    classInfo?: ClassInfo;
    object?: EezObject;
    objects?: EezObject[];
}

export const LVGL_FLAG_CODES = {
    HIDDEN: 1 << 0, // Make the object hidden. (Like it wasn't there at all)
    CLICKABLE: 1 << 1, // Make the object clickable by the input devices
    CLICK_FOCUSABLE: 1 << 2, // Add focused state to the object when clicked
    CHECKABLE: 1 << 3, // Toggle checked state when the object is clicked
    SCROLLABLE: 1 << 4, // Make the object scrollable
    SCROLL_ELASTIC: 1 << 5, // Allow scrolling inside but with slower speed
    SCROLL_MOMENTUM: 1 << 6, // Make the object scroll further when "thrown"
    SCROLL_ONE: 1 << 7, // Allow scrolling only one snappable children
    SCROLL_CHAIN_HOR: 1 << 8, // Allow propagating the horizontal scroll to a parent
    SCROLL_CHAIN_VER: 1 << 9, // Allow propagating the vertical scroll to a parent
    SCROLL_CHAIN: (1 << 8) | (1 << 9),
    SCROLL_ON_FOCUS: 1 << 10, // Automatically scroll object to make it visible when focused
    SCROLL_WITH_ARROW: 1 << 11, // Allow scrolling the focused object with arrow keys
    SNAPPABLE: 1 << 12, // If scroll snap is enabled on the parent it can snap to this object
    PRESS_LOCK: 1 << 13, // Keep the object pressed even if the press slid from the object
    EVENT_BUBBLE: 1 << 14, // Propagate the events to the parent too
    GESTURE_BUBBLE: 1 << 15, // Propagate the gestures to the parent
    ADV_HITTEST: 1 << 16, // Allow performing more accurate hit (click) test. E.g. consider rounded corners.
    IGNORE_LAYOUT: 1 << 17, // Make the object position-able by the layouts
    FLOATING: 1 << 18, // Do not scroll the object when the parent scrolls and ignore layout
    OVERFLOW_VISIBLE: 1 << 19 // Do not clip the children's content to the parent's boundary*/
};

export const LVGL_REACTIVE_FLAGS: (keyof typeof LVGL_FLAG_CODES)[] = [
    "HIDDEN",
    "CLICKABLE"
];

export const LVGL_STATE_CODES = {
    CHECKED: 0x0001,
    DISABLED: 0x0080,
    FOCUSED: 0x0002,
    PRESSED: 0x0020
};

export const LVGL_REACTIVE_STATES: (keyof typeof LVGL_STATE_CODES)[] = [
    "CHECKED",
    "DISABLED"
];

interface LVGLClassInfoProperties {
    parts: LVGLParts[];
    flags: (keyof typeof LVGL_FLAG_CODES)[];
    defaultFlags: string;
    states: (keyof typeof LVGL_STATE_CODES)[];
    defaultStates?: string;
}

export interface ClassInfo {
    properties: PropertyInfo[];

    _arrayAndObjectProperties?: PropertyInfo[];

    // optional properties
    getClass?: (jsObject: any, aClass: EezClass) => any;
    label?: (object: IEezObject) => string;
    listLabel?: (object: IEezObject, collapsed: boolean) => React.ReactNode;

    parentClassInfo?: ClassInfo;

    componentPaletteGroupName?: string;
    componentPaletteLabel?: string;
    enabledInComponentPalette?: (projectType: ProjectType) => boolean;

    hideInProperties?: boolean;
    isPropertyMenuSupported?: boolean;

    newItem?: (parent: IEezObject) => Promise<EezObject | undefined>;

    getInheritedValue?: (
        object: IEezObject,
        propertyName: string
    ) => InheritedValue;
    defaultValue?: any;
    componentDefaultValue?: (projectStore: ProjectStore) => any;
    findPastePlaceInside?: (
        object: IEezObject,
        classInfo: ClassInfo,
        isSingleObject: boolean
    ) => IEezObject | PropertyInfo | undefined;

    icon?: React.ReactNode;
    componentHeaderColor?: string;
    componentHeaderTextColor?: string;

    beforeLoadHook?: (
        object: IEezObject,
        jsObject: any,
        project: Project
    ) => void;

    afterLoadHook?: (object: IEezObject, project: Project) => void;

    updateObjectValueHook?: (object: IEezObject, values: any) => void;

    extendContextMenu?: (
        object: IEezObject,
        context: IContextMenuContext,
        objects: IEezObject[],
        menuItems: Electron.MenuItem[],
        editable: boolean
    ) => void;

    check?: (object: IEezObject, messages: IMessage[]) => void;

    getRect?: (object: IEezObject) => Rect;
    setRect?: (object: IEezObject, rect: Partial<Rect>) => void;
    isMoveable?: (object: IEezObject) => boolean;
    isSelectable?: (object: IEezObject) => boolean;
    showSelectedObjectsParent?: (object: IEezObject) => boolean;
    getResizeHandlers?: (
        object: IEezObject
    ) => IResizeHandler[] | undefined | false;
    open?: (object: IEezObject) => void;

    flowComponentId?: number;

    isFlowExecutableComponent?: boolean;

    getImportedProject?: (object: IEezObject) =>
        | {
              findReferencedObject: (
                  root: IEezObject,
                  referencedObjectCollectionPath: string,
                  referencedObjectName: string
              ) => IEezObject | undefined;
          }
        | undefined;

    deleteObjectRefHook?: (
        object: IEezObject,
        options?: { dropPlace?: IEezObject | PropertyInfo }
    ) => void;
    deleteObjectFilterHook?: (object: IEezObject) => boolean;

    objectsToClipboardData?: (objects: IEezObject) => any;

    pasteItemHook?: (
        object: IEezObject,
        clipboardData: {
            serializedData: SerializedData;
            pastePlace: EezObject;
        }
    ) => IEezObject;

    onAfterPaste?: (newObject: IEezObject, fromObject: IEezObject) => void;

    lvgl?:
        | LVGLClassInfoProperties
        | ((object: IEezObject) => LVGLClassInfoProperties);

    showTreeCollapseIcon?: "always" | "has-children" | "never";

    getAdditionalFlowProperties?: (object: IEezObject) => PropertyInfo[];

    execute?: (context: IDashboardComponentContext) => void;

    findChildIndex?: (parent: IEezObject[], child: IEezObject) => number;
}

export function makeDerivedClassInfo(
    baseClassInfo: ClassInfo,
    derivedClassInfoProperties: Partial<ClassInfo>
): ClassInfo {
    if (derivedClassInfoProperties.properties) {
        const b = baseClassInfo.properties; // base class properties
        const d = derivedClassInfoProperties.properties; // derived class properties
        const r = []; // resulting properties

        // put base and overriden properties into resulting properties array
        for (let i = 0; i < b.length; ++i) {
            let j;
            for (j = 0; j < d.length; ++j) {
                if (b[i].name === d[j].name) {
                    break;
                }
            }
            r.push(j < d.length ? d[j] /* overriden */ : b[i] /* base */);
        }

        // put derived (not overriden) properties into resulting array
        for (let i = 0; i < d.length; ++i) {
            let j;
            for (j = 0; j < r.length; ++j) {
                if (d[i].name === r[j].name) {
                    break;
                }
            }
            if (j === r.length) {
                r.push(d[i]);
            }
        }

        derivedClassInfoProperties.properties = r;
    }

    if (derivedClassInfoProperties.defaultValue && baseClassInfo.defaultValue) {
        derivedClassInfoProperties.defaultValue = Object.assign(
            {},
            baseClassInfo.defaultValue,
            derivedClassInfoProperties.defaultValue
        );
    }

    const baseBeforeLoadHook = baseClassInfo.beforeLoadHook;
    const derivedBeforeLoadHook = derivedClassInfoProperties.beforeLoadHook;
    if (baseBeforeLoadHook && derivedBeforeLoadHook) {
        derivedClassInfoProperties.beforeLoadHook = (
            object: IEezObject,
            jsObject: any,
            project: Project
        ) => {
            baseBeforeLoadHook(object, jsObject, project);
            derivedBeforeLoadHook(object, jsObject, project);
        };
    }

    const baseCheck = baseClassInfo.check;
    const derivedCheck = derivedClassInfoProperties.check;
    if (baseCheck && derivedCheck) {
        derivedClassInfoProperties.check = (
            object: IEezObject,
            messages: IMessage[]
        ) => {
            baseCheck(object, messages);
            derivedCheck(object, messages);
        };
    }

    const baseUpdateObjectValueHook = baseClassInfo.updateObjectValueHook;
    const derivedUpdateObjectValueHook =
        derivedClassInfoProperties.updateObjectValueHook;
    if (baseUpdateObjectValueHook && derivedUpdateObjectValueHook) {
        derivedClassInfoProperties.updateObjectValueHook = (
            object: IEezObject,
            values: any
        ) => {
            baseUpdateObjectValueHook(object, values);
            derivedUpdateObjectValueHook(object, values);
        };
    }

    const derivedClassInfo = Object.assign(
        {},
        baseClassInfo,
        derivedClassInfoProperties
    );
    derivedClassInfo.parentClassInfo = baseClassInfo;
    return derivedClassInfo;
}

////////////////////////////////////////////////////////////////////////////////

export type IEezObject = EezObject | EezObject[];

////////////////////////////////////////////////////////////////////////////////

export class EezObject {
    static classInfo: ClassInfo;

    objID: string;

    constructor() {
        makeObservable(this, {
            objID: observable
        });
    }
}

export type EezClass = typeof EezObject;

let classNameToEezClassMap = new Map<string, EezClass>();
let eezClassToClassNameMap = new Map<EezClass, string>();

export function registerClass(name: string, eezClass: EezClass) {
    classNameToEezClassMap.set(name, eezClass);
    eezClassToClassNameMap.set(eezClass, name);
}

export function getClassByName(className: string) {
    return classNameToEezClassMap.get(className);
}

export function getClassName(eezClass: EezClass) {
    return eezClassToClassNameMap.get(eezClass);
}

export function getAllClasses() {
    return [...classNameToEezClassMap.values()];
}

////////////////////////////////////////////////////////////////////////////////

export function isEezObject(object: any): object is IEezObject {
    return (
        object instanceof EezObject ||
        (Array.isArray(object) &&
            (object.length == 0 || isEezObject(object[0])))
    );
}

////////////////////////////////////////////////////////////////////////////////

export function findClass(className: string) {
    return classNameToEezClassMap.get(className);
}

export interface IObjectClassInfo {
    id: string;
    name: string;
    objectClass: EezClass;
    displayName?: string;
    componentPaletteGroupName?: string;
    props?: any;
}

export function getClassesDerivedFrom(parentClass: EezClass) {
    const derivedClasses: IObjectClassInfo[] = [];

    for (const className of classNameToEezClassMap.keys()) {
        const objectClass = classNameToEezClassMap.get(className)!;
        if (isProperSubclassOf(objectClass.classInfo, parentClass.classInfo)) {
            derivedClasses.push({
                id: className,
                name: className,
                objectClass
            });
        }
    }

    return derivedClasses;
}

export function isSubclassOf(
    classInfo: ClassInfo | undefined,
    baseClassInfo: ClassInfo
) {
    while (classInfo) {
        if (classInfo === baseClassInfo) {
            return true;
        }
        classInfo = classInfo.parentClassInfo;
    }
    return false;
}

export function isProperSubclassOf(
    classInfo: ClassInfo | undefined,
    baseClassInfo: ClassInfo
) {
    if (classInfo) {
        while (true) {
            classInfo = classInfo.parentClassInfo;
            if (!classInfo) {
                return false;
            }
            if (classInfo === baseClassInfo) {
                return true;
            }
        }
    }
    return false;
}

export function getId(object: IEezObject) {
    return (object as any)._eez_id;
}

export function setId(
    projectStore: ProjectStore,
    object: IEezObject,
    id: string
) {
    (object as any)._eez_id = id;
    projectStore.objects.set(id, object);
}

export function getParent(object: IEezObject): IEezObject {
    return (object as any)._eez_parent;
}

export function setParent(object: IEezObject, parentObject: IEezObject) {
    (object as any)._eez_parent = parentObject;
}

export function getKey(object: IEezObject): string {
    if (!(object as any)._eez_key) {
        console.log(object);
    }
    return (object as any)._eez_key;
}

export function setKey(object: IEezObject, key: string) {
    (object as any)._eez_key = key;
}

export function getPropertyInfo(object: IEezObject): PropertyInfo {
    return (object as any)._eez_propertyInfo;
}

export function setPropertyInfo(
    object: IEezObject,
    propertyInfo: PropertyInfo
) {
    (object as any)._eez_propertyInfo = propertyInfo;
}

export function isAncestor(object: IEezObject, ancestor: IEezObject): boolean {
    if (object == undefined || ancestor == undefined) {
        return false;
    }

    if (object == ancestor) {
        return true;
    }

    let parent = getParent(object);
    return !!parent && isAncestor(parent, ancestor);
}

export function isProperAncestor(object: IEezObject, ancestor: IEezObject) {
    if (object == undefined || object == ancestor) {
        return false;
    }

    let parent = getParent(object);
    return !!parent && isAncestor(parent, ancestor);
}

export function findPropertyByNameInClassInfo(
    classInfo: ClassInfo,
    propertyName: string
): PropertyInfo | undefined {
    let i = propertyName.indexOf("[");
    if (i != -1) {
        // arr[index].{name}

        const propertyInfo = findPropertyByNameInClassInfo(
            classInfo,
            propertyName.substring(0, i)
        );
        if (!propertyInfo) {
            return undefined;
        }

        if (propertyInfo.type != PropertyType.Array) {
            return undefined;
        }

        let j = propertyName.indexOf("]", i + 1);
        return findPropertyByNameInClassInfo(
            propertyInfo.typeClass!.classInfo,
            propertyName.substring(j + 2)
        );
    }

    i = propertyName.indexOf(".");
    if (i != -1) {
        // object.{name}

        const propertyInfo = findPropertyByNameInClassInfo(
            classInfo,
            propertyName.substring(0, i)
        );
        if (!propertyInfo) {
            return undefined;
        }

        return findPropertyByNameInClassInfo(
            propertyInfo.typeClass!.classInfo,
            propertyName.substring(i + 1)
        );
    }

    return classInfo.properties.find(
        propertyInfo => propertyInfo.name == propertyName
    );
}

export function isPropertyHidden(
    object: IEezObject,
    propertyInfo: PropertyInfo
) {
    if (propertyInfo.hideInPropertyGrid === undefined) {
        return false;
    }

    if (typeof propertyInfo.hideInPropertyGrid === "boolean") {
        return propertyInfo.hideInPropertyGrid;
    }

    return propertyInfo.hideInPropertyGrid(object, propertyInfo);
}

export function isPropertyReadOnly(
    object: IEezObject,
    propertyInfo: PropertyInfo
) {
    if (propertyInfo.readOnlyInPropertyGrid === undefined) {
        return false;
    }

    if (typeof propertyInfo.readOnlyInPropertyGrid === "boolean") {
        return propertyInfo.readOnlyInPropertyGrid;
    }

    return propertyInfo.readOnlyInPropertyGrid(object, propertyInfo);
}

export function isAnyPropertyReadOnly(
    objects: IEezObject[],
    propertyInfo: PropertyInfo
) {
    return !!objects.find(object => isPropertyReadOnly(object, propertyInfo));
}

export function isPropertyEnumerable(
    object: IEezObject,
    propertyInfo: PropertyInfo
) {
    if (propertyInfo.enumerable === undefined) {
        return true;
    }

    if (typeof propertyInfo.enumerable === "boolean") {
        return propertyInfo.enumerable;
    }

    return propertyInfo.enumerable(object, propertyInfo);
}

export function isPropertyOptional(
    object: IEezObject,
    propertyInfo: PropertyInfo
) {
    if (!propertyInfo.isOptional) {
        return false;
    }

    if (typeof propertyInfo.isOptional == "boolean") {
        return propertyInfo.isOptional;
    }

    return propertyInfo.isOptional(object, propertyInfo);
}

export function getProperty(object: IEezObject, name: string): any {
    // This is deep get. Name can be:
    //    - identifier
    //    - array[index].{name}
    //    - object.{name}

    let i = name.indexOf("[");
    if (i != -1) {
        // arr[index].{name}
        let j = name.indexOf("]", i + 1);
        return getProperty(
            (object as any)[name.substring(0, i)][
                Number.parseInt(name.substring(i + 1))
            ],
            name.substring(j + 2)
        );
    }

    i = name.indexOf(".");
    if (i != -1) {
        // object.{name}
        return getProperty(
            (object as any)[name.substring(0, i)],
            name.substring(i + 1)
        );
    }

    return (object as any)[name];
}

export function getObjectPropertyDisplayName(
    object: IEezObject,
    propertyInfo: PropertyInfo
) {
    if (propertyInfo.displayName) {
        if (typeof propertyInfo.displayName === "string") {
            return propertyInfo.displayName;
        }
        return propertyInfo.displayName(object);
    }
    return humanize(propertyInfo.name);
}

export function getRootObject(object: IEezObject) {
    let parent;
    while (!!(parent = getParent(object))) {
        object = parent;
    }
    return object;
}

// Get object ancestors as array,
// from the root object up to the given object (including given object)
export function getAncestors(object: IEezObject): IEezObject[] {
    let parent = getParent(object);
    if (parent) {
        return getAncestors(parent).concat([object]);
    }
    return [object];
}

export function areAllChildrenOfTheSameParent(objects: IEezObject[]) {
    for (let i = 1; i < objects.length; i++) {
        if (getParent(objects[i]) !== getParent(objects[0])) {
            return false;
        }
    }
    return true;
}

export interface PropertyValueSourceInfo {
    source: "" | "default" | "modified" | "inherited";
    inheritedFrom?: IEezObject;
}

export function getClassInfoLvglProperties(object: IEezObject) {
    const classInfo = getClassInfo(object);
    if (classInfo.lvgl) {
        if (typeof classInfo.lvgl == "object") {
            return classInfo.lvgl;
        }

        return classInfo.lvgl(object);
    } else {
        return { parts: [], flags: [], defaultFlags: "", states: [] };
    }
}

////////////////////////////////////////////////////////////////////////////////

export class RectObject extends EezObject {
    static classInfo: ClassInfo = {
        properties: [
            {
                name: "top",
                type: PropertyType.Number
            },
            {
                name: "right",
                type: PropertyType.Number
            },
            {
                name: "bottom",
                type: PropertyType.Number
            },
            {
                name: "left",
                type: PropertyType.Number
            }
        ],
        defaultValue: {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0
        }
    };

    top: number;
    right: number;
    bottom: number;
    left: number;

    constructor() {
        super();

        makeObservable(this, {
            top: observable,
            right: observable,
            bottom: observable,
            left: observable
        });
    }
}

registerClass("RectObject", RectObject);
