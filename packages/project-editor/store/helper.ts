import { toJS } from "mobx";
import { Menu, MenuItem } from "@electron/remote";

import { humanize } from "eez-studio-shared/string";
import * as notification from "eez-studio-ui/notification";

import {
    IEezObject,
    PropertyInfo,
    PropertyType,
    getProperty,
    isPropertyEnumerable,
    getParent,
    getKey,
    EezClass,
    isSubclassOf,
    ClassInfo,
    PropertyProps,
    PropertyValueSourceInfo,
    isPropertyHidden,
    getPropertyInfo,
    getAncestors,
    getObjectPropertyDisplayName,
    setKey,
    setParent,
    registerClass,
    EezObject,
    getRootObject,
    getClassByName,
    setId
} from "project-editor/core/object";

import { getProject, Project } from "project-editor/project/project";
import type { ProjectEditorStore } from "project-editor/store";

import {
    checkClipboard,
    copyToClipboard,
    objectToClipboardData
} from "project-editor/store/clipboard";

import { ProjectEditor } from "project-editor/project-editor-interface";
import { createObject, objectToJson } from "project-editor/store/serialization";
import { confirm, onAfterPaste } from "project-editor/core/util";

////////////////////////////////////////////////////////////////////////////////

export class EezValueObject extends EezObject {
    static classInfo: ClassInfo = {
        label: (object: EezValueObject) => {
            return object.value && object.value.toString();
        },
        properties: []
    };

    public propertyInfo: PropertyInfo;
    public value: any;

    static create(object: IEezObject, propertyInfo: PropertyInfo, value: any) {
        const valueObject = new EezValueObject();

        const projectEditorStore = getDocumentStore(object);

        setId(projectEditorStore, valueObject, projectEditorStore.getChildId());
        setKey(valueObject, propertyInfo.name);
        setParent(valueObject, object);

        valueObject.propertyInfo = propertyInfo;
        valueObject.value = value;

        return valueObject;
    }
}
registerClass("EezValueObject", EezValueObject);

////////////////////////////////////////////////////////////////////////////////

export function isValue(object: IEezObject | undefined) {
    return !!object && object instanceof EezValueObject;
}

export function getDocumentStore(object: IEezObject) {
    return (getRootObject(object) as Project)._DocumentStore;
}

export function getChildOfObject(
    object: IEezObject,
    key: PropertyInfo | string | number
): IEezObject | undefined {
    let propertyInfo: PropertyInfo | undefined;

    if (isArray(object)) {
        let elementIndex: number | undefined = undefined;

        if (typeof key == "string") {
            elementIndex = parseInt(key);
        } else if (typeof key == "number") {
            elementIndex = key;
        }

        const array = object as IEezObject[];

        if (
            elementIndex !== undefined &&
            elementIndex >= 0 &&
            elementIndex < array.length
        ) {
            return array[elementIndex];
        } else {
            console.error("invalid array index");
        }
    } else {
        if (typeof key == "string") {
            propertyInfo = findPropertyByNameInObject(object, key);
        } else if (typeof key == "number") {
            console.error("invalid key type");
        } else {
            propertyInfo = key;
        }
    }

    if (propertyInfo) {
        let childObjectOrValue = getProperty(object, propertyInfo.name);
        if (propertyInfo.typeClass) {
            return childObjectOrValue;
        } else {
            return EezValueObject.create(
                object,
                propertyInfo,
                childObjectOrValue
            );
        }
    }

    return undefined;
}

export function getObjectPropertyAsObject(
    object: IEezObject,
    propertyInfo: PropertyInfo
) {
    return getChildOfObject(object, propertyInfo) as EezValueObject;
}

export function getObjectFromPath(rootObject: IEezObject, path: string[]) {
    let object = rootObject;

    for (let i = 0; i < path.length && object; i++) {
        object = getChildOfObject(object, path[i]) as IEezObject;
    }

    return object;
}

export function getObjectFromStringPath(
    rootObject: IEezObject,
    stringPath: string
) {
    if (stringPath == "/") {
        return rootObject;
    }
    return getObjectFromPath(rootObject, stringPath.split("/").slice(1));
}

export function objectToString(object: IEezObject) {
    let label: string;

    if (isValue(object)) {
        label = getProperty(getParent(object), getKey(object));
    } else if (isArray(object)) {
        let propertyInfo = findPropertyByNameInObject(
            getParent(object),
            getKey(object)
        );
        label =
            (propertyInfo &&
                getObjectPropertyDisplayName(object, propertyInfo)) ||
            humanize(getKey(object));
    } else {
        label = getLabel(object);
    }

    if (
        object &&
        getParent(object) &&
        isArray(getParent(object)) &&
        getParent(getParent(object)) &&
        getKey(getParent(object))
    ) {
        let propertyInfo = findPropertyByNameInObject(
            getParent(getParent(object)),
            getKey(getParent(object))
        );
        if (propertyInfo && propertyInfo.childLabel) {
            label = propertyInfo.childLabel(object, label);
        }
    }

    return label;
}

export function getPropertyAsString(
    object: IEezObject,
    propertyInfo: PropertyInfo
) {
    let value = getProperty(object, propertyInfo.name);
    if (typeof value === "boolean") {
        return value.toString();
    }
    if (typeof value === "number") {
        return value.toString();
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "undefined") {
        return "";
    }
    if (isArray(value)) {
        return (value as IEezObject[])
            .map(object => getLabel(object))
            .join(", ");
    }
    return objectToString(value);
}

export function getHumanReadableObjectPath(object: IEezObject) {
    let ancestors = getAncestors(object);
    return ancestors
        .slice(1)
        .map(object => objectToString(object))
        .join(" / ");
}

export function isObject(object: IEezObject | undefined) {
    return !!object && !isValue(object) && !isArray(object);
}

export function isArray(object: IEezObject | undefined): object is EezObject[] {
    return !!object && !isValue(object) && Array.isArray(object);
}

export function getChildren(parent: IEezObject): IEezObject[] {
    if (isArray(parent)) {
        return parent;
    } else {
        let properties = getClassInfo(parent).properties.filter(
            propertyInfo =>
                (propertyInfo.type === PropertyType.Object ||
                    propertyInfo.type === PropertyType.Array) &&
                isPropertyEnumerable(parent, propertyInfo) &&
                getProperty(parent, propertyInfo.name)
        );

        if (
            properties.length == 1 &&
            properties[0].type === PropertyType.Array &&
            !(properties[0].showOnlyChildrenInTree === false)
        ) {
            return getProperty(parent, properties[0].name);
        }

        return properties.map(propertyInfo =>
            getProperty(parent, propertyInfo.name)
        );
    }
}

export function getClass(object: IEezObject) {
    if (isArray(object)) {
        return getPropertyInfo(object).typeClass!;
    } else {
        return object.constructor as EezClass;
    }
}

export function getClassInfo(object: IEezObject): ClassInfo {
    return getClass(object).classInfo;
}

export function isObjectInstanceOf(
    object: IEezObject,
    baseClassInfo: ClassInfo
) {
    return isSubclassOf(getClassInfo(object), baseClassInfo);
}

export function getLabel(object: IEezObject): string {
    if (typeof object === "string") {
        return object;
    }

    const label = getClassInfo(object).label;
    if (label) {
        return label(object);
    }

    let name = (object as any).name;
    if (name) {
        return name;
    }

    return getClass(object).name;
}

export function isArrayElement(object: IEezObject) {
    return isArray(getParent(object));
}

export function findPropertyByNameInObject(
    object: IEezObject,
    propertyName: string
) {
    return getClassInfo(object).properties.find(
        propertyInfo => propertyInfo.name == propertyName
    );
}

export function findPropertyByChildObject(
    object: IEezObject,
    childObject: IEezObject
) {
    return getClassInfo(object).properties.find(
        propertyInfo => getProperty(object, propertyInfo.name) === childObject
    );
}

export function getInheritedValue(object: IEezObject, propertyName: string) {
    const getInheritedValue = getClassInfo(object).getInheritedValue;
    if (getInheritedValue) {
        return getInheritedValue(object, propertyName);
    }
    return undefined;
}

export function humanizePropertyName(object: IEezObject, propertyName: string) {
    const property = findPropertyByNameInObject(object, propertyName);
    if (property && property.displayName) {
        if (typeof property.displayName == "string") {
            return property.displayName;
        }
        return property.displayName(object);
    }
    return humanize(propertyName);
}

export function getAncestorOfType<T extends EezObject = EezObject>(
    object: IEezObject,
    classInfo: ClassInfo
): T | undefined {
    if (object) {
        if (isObjectInstanceOf(object, classInfo)) {
            return object as T;
        }
        return (
            getParent(object) && getAncestorOfType(getParent(object), classInfo)
        );
    }
    return undefined;
}

export function getObjectPath(object: IEezObject): (string | number)[] {
    let parent = getParent(object);
    if (parent) {
        if (isArray(parent)) {
            return getObjectPath(parent).concat(
                parent.indexOf(object as EezObject)
            );
        } else {
            return getObjectPath(parent).concat(getKey(object));
        }
    }
    return [];
}

export function getObjectPathAsString(object: IEezObject) {
    return "/" + getObjectPath(object).join("/");
}

export function isObjectExists(object: IEezObject) {
    let parent = getParent(object);
    if (parent) {
        if (isArray(parent)) {
            if (parent.indexOf(object as EezObject) === -1) {
                return false;
            }
        } else {
            const key = getKey(object);
            if (key && (parent as any)[key] !== object) {
                return false;
            }
        }
    }
    return true;
}

export function isShowOnlyChildrenInTree(object: IEezObject) {
    if (!getParent(object) || !getKey(object)) {
        return true;
    }

    const propertyInfo = findPropertyByNameInObject(
        getParent(object),
        getKey(object)
    );
    if (!propertyInfo) {
        return true;
    }

    return !(propertyInfo.showOnlyChildrenInTree === false);
}

export function isPartOfNavigation(object: IEezObject) {
    if (getParent(object)) {
        let propertyInfo = findPropertyByChildObject(getParent(object), object);
        if (propertyInfo && propertyInfo.partOfNavigation === false) {
            return false;
        }
    }
    return true;
}

export function getArrayAndObjectProperties(object: IEezObject) {
    if (!getClassInfo(object)._arrayAndObjectProperties) {
        getClassInfo(object)._arrayAndObjectProperties = getClassInfo(
            object
        ).properties.filter(
            propertyInfo =>
                (propertyInfo.type === PropertyType.Array ||
                    propertyInfo.type === PropertyType.Object) &&
                getProperty(object, propertyInfo.name)
        );
    }
    return getClassInfo(object)._arrayAndObjectProperties!;
}

export function getCommonProperties(objects: IEezObject[]) {
    let properties = getClassInfo(objects[0]).properties;

    properties = properties.filter(
        propertyInfo =>
            !objects.find(
                object =>
                    isArray(object) || isPropertyHidden(object, propertyInfo)
            )
    );

    if (objects.length > 1) {
        // some property types are not supported in multi-objects property grid
        properties = properties.filter(
            propertyInfo =>
                propertyInfo.type !== PropertyType.Array &&
                !(
                    propertyInfo.type === PropertyType.String &&
                    propertyInfo.unique === true
                )
        );

        // show only common properties
        properties = properties.filter(
            propertyInfo =>
                !objects.find(
                    object =>
                        !getClassInfo(object).properties.find(
                            pi => pi === propertyInfo
                        )
                )
        );
    }

    return properties;
}

export function getPropertySourceInfo(
    props: PropertyProps
): PropertyValueSourceInfo {
    function getSourceInfo(
        object: IEezObject,
        propertyInfo: PropertyInfo
    ): PropertyValueSourceInfo {
        if (props.propertyInfo.propertyMenu && !propertyInfo.inheritable) {
            return {
                source: ""
            };
        }

        let value = (object as any)[propertyInfo.name];

        if (propertyInfo.inheritable) {
            if (value === undefined) {
                let inheritedValue = getInheritedValue(
                    object,
                    propertyInfo.name
                );
                if (inheritedValue) {
                    return {
                        source: "inherited",
                        inheritedFrom: inheritedValue.source
                    };
                }
            }
        }

        if (value !== undefined) {
            return {
                source: "modified"
            };
        }

        return {
            source: "default"
        };
    }

    const sourceInfoArray = props.objects.map(object =>
        getSourceInfo(object, props.propertyInfo)
    );

    for (let i = 1; i < sourceInfoArray.length; i++) {
        if (sourceInfoArray[i].source !== sourceInfoArray[0].source) {
            return {
                source: "modified"
            };
        }
    }

    return sourceInfoArray[0];
}

export function isAnyPropertyModified(props: PropertyProps) {
    const properties = getCommonProperties(props.objects);
    for (let propertyInfo of properties) {
        if (propertyInfo.computed) {
            continue;
        }
        const sourceInfo = getPropertySourceInfo({ ...props, propertyInfo });
        if (sourceInfo.source === "modified") {
            return true;
        }
    }
    return false;
}

export function extendContextMenu(
    context: IContextMenuContext,
    object: IEezObject,
    objects: IEezObject[],
    menuItems: Electron.MenuItem[],
    editable: boolean
) {
    const extendContextMenu = getClassInfo(object).extendContextMenu;
    if (extendContextMenu) {
        extendContextMenu(object, context, objects, menuItems, editable);
    }
}

export function canAdd(object: IEezObject) {
    return (
        (isArrayElement(object) || isArray(object)) &&
        getClassInfo(object).newItem != undefined
    );
}

export function canDuplicate(object: IEezObject) {
    return isArrayElement(object);
}

function isOptional(object: IEezObject) {
    let parent = getParent(object);
    if (!parent) {
        return false;
    }

    let property: PropertyInfo | undefined = findPropertyByNameInObject(
        parent,
        getKey(object)
    );

    if (property == undefined) {
        return false;
    }

    return property.isOptional;
}

export function canDelete(object: IEezObject) {
    return isArrayElement(object) || isOptional(object);
}

export function canCut(object: IEezObject) {
    return canCopy(object) && canDelete(object);
}

export function canCopy(object: IEezObject) {
    return isArrayElement(object) || isOptional(object);
}

export function canContainChildren(object: IEezObject) {
    for (const propertyInfo of getClassInfo(object).properties) {
        if (
            isPropertyEnumerable(object, propertyInfo) &&
            (propertyInfo.type === PropertyType.Array ||
                propertyInfo.type === PropertyType.Object)
        ) {
            return true;
        }
    }

    return false;
}

export function canPaste(
    projectEditorStore: ProjectEditorStore,
    object: IEezObject
) {
    try {
        return checkClipboard(projectEditorStore, object);
    } catch (e) {
        return undefined;
    }
}

////////////////////////////////////////////////////////////////////////////////

export async function addItem(object: IEezObject) {
    const parent = isArray(object) ? object : getParent(object);
    if (!parent) {
        return null;
    }

    const parentClassInfo = getClassInfo(parent);
    if (!parentClassInfo.newItem) {
        return null;
    }

    let newObject;
    try {
        newObject = await parentClassInfo.newItem(parent);
    } catch (err) {
        if (err !== undefined) {
            notification.error(
                `Adding ${getClass(parent).name} failed: ${err}!`
            );
        }
        return null;
    }

    if (!newObject) {
        console.log(`Canceled adding ${getClass(parent).name}`);
        return null;
    }

    return getDocumentStore(object).addObject(parent, newObject);
}

export function pasteItem(object: IEezObject) {
    try {
        const projectEditorStore = getDocumentStore(object);

        const c = checkClipboard(projectEditorStore, object);
        if (c) {
            if (typeof c.pastePlace === "string") {
                projectEditorStore.updateObject(object, {
                    [c.pastePlace]: c.serializedData.object
                });
            } else {
                if (c.serializedData.object) {
                    if (
                        isArray(c.pastePlace as IEezObject) &&
                        getParent(object) === (c.pastePlace as IEezObject)
                    ) {
                        return projectEditorStore.insertObject(
                            c.pastePlace as IEezObject,
                            (c.pastePlace as any).indexOf(object) + 1,
                            c.serializedData.object
                        );
                    } else {
                        const aClass = getClassByName(
                            c.serializedData.objectClassName
                        );

                        if (aClass && aClass.classInfo.pasteItemHook) {
                            return aClass.classInfo.pasteItemHook(object, c);
                        }

                        return projectEditorStore.addObject(
                            c.pastePlace as IEezObject,
                            c.serializedData.object
                        );
                    }
                } else if (c.serializedData.objects) {
                    return projectEditorStore.addObjects(
                        c.pastePlace as IEezObject,
                        objectToJS(c.serializedData.objects)
                    );
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
    return undefined;
}

export function deleteItem(object: IEezObject) {
    deleteItems([object]);
}

export function cutItem(object: IEezObject) {
    let clipboardText = objectToClipboardData(object);

    deleteItems([object], () => {
        copyToClipboard(clipboardText);
    });
}

export function copyItem(object: IEezObject) {
    copyToClipboard(objectToClipboardData(object));
}

function duplicateItem(object: IEezObject) {
    let parent = getParent(object) as IEezObject;

    const project = getProject(object);

    const duplicateObject = createObject(
        project._DocumentStore,
        toJS(object) as any,
        getClass(object)
    );

    return getDocumentStore(object).addObject(parent, duplicateObject);
}

export interface IContextMenuContext {
    selectObject(object: IEezObject): void;
    selectObjects(objects: IEezObject[]): void;
}

export function createContextMenu(
    context: IContextMenuContext,
    object: IEezObject,
    editable: boolean
) {
    let menuItems: Electron.MenuItem[] = [];

    const projectEditorStore = getDocumentStore(object);

    if (editable && canAdd(object)) {
        menuItems.push(
            new MenuItem({
                label: "Add",
                click: async () => {
                    const aNewObject = await addItem(object);
                    if (aNewObject) {
                        context.selectObject(aNewObject);
                    }
                }
            })
        );
    }

    if (editable && canDuplicate(object)) {
        menuItems.push(
            new MenuItem({
                label: "Duplicate",
                click: () => {
                    const aNewObject = duplicateItem(object);
                    if (aNewObject) {
                        context.selectObject(aNewObject);
                    }
                }
            })
        );
    }

    if (isArrayElement(object)) {
        if (menuItems.length > 0) {
            menuItems.push(
                new MenuItem({
                    type: "separator"
                })
            );
        }

        menuItems.push(
            new MenuItem({
                label: "Find All References",
                click: () => {
                    ProjectEditor.documentSearch.findAllReferences(object);
                }
            })
        );
    }

    let clipboardMenuItems: Electron.MenuItem[] = [];

    if (editable && canCut(object)) {
        clipboardMenuItems.push(
            new MenuItem({
                label: "Cut",
                click: () => {
                    cutItem(object);
                }
            })
        );
    }

    if (editable && canCopy(object)) {
        clipboardMenuItems.push(
            new MenuItem({
                label: "Copy",
                click: () => {
                    copyItem(object);
                }
            })
        );
    }

    if (editable && canPaste(projectEditorStore, object)) {
        clipboardMenuItems.push(
            new MenuItem({
                label: "Paste",
                click: () => {
                    const aNewObject = pasteItem(object);
                    if (aNewObject) {
                        onAfterPaste(aNewObject, object);
                        if (Array.isArray(aNewObject)) {
                            context.selectObjects(aNewObject);
                        } else {
                            context.selectObject(aNewObject);
                        }
                    }
                }
            })
        );
    }

    if (clipboardMenuItems.length > 0) {
        if (menuItems.length > 0) {
            menuItems.push(
                new MenuItem({
                    type: "separator"
                })
            );
        }
        menuItems = menuItems.concat(clipboardMenuItems);
    }

    if (editable && canDelete(object)) {
        if (menuItems.length > 0) {
            menuItems.push(
                new MenuItem({
                    type: "separator"
                })
            );
        }

        menuItems.push(
            new MenuItem({
                label: "Delete",
                click: () => {
                    deleteItems([object]);
                }
            })
        );
    }

    extendContextMenu(context, object, [object], menuItems, editable);

    if (menuItems.length > 0) {
        const menu = new Menu();
        menuItems.forEach(menuItem => menu.append(menuItem));
        return menu;
    }

    return undefined;
}

export function showContextMenu(
    context: IContextMenuContext,
    object: IEezObject,
    editable: boolean
) {
    const menu = createContextMenu(context, object, editable);

    if (menu) {
        menu.popup();
    }
}

////////////////////////////////////////////////////////////////////////////////

export function deleteItems(objects: IEezObject[], callback?: () => void) {
    const projectEditorStore = getDocumentStore(objects[0]);

    function doDelete() {
        projectEditorStore.deleteObjects(objects);
        if (callback) {
            callback();
        }
    }

    if (objects.length === 1) {
        if (ProjectEditor.documentSearch.isReferenced(objects[0])) {
            confirm(
                "Are you sure you want to delete this item?",
                "It is used in other parts.",
                doDelete
            );
        } else {
            doDelete();
        }
    } else {
        let isAnyItemReferenced = false;

        for (let i = 0; i < objects.length; i++) {
            if (ProjectEditor.documentSearch.isReferenced(objects[i])) {
                isAnyItemReferenced = true;
                break;
            }
        }

        if (isAnyItemReferenced) {
            confirm(
                "Are you sure you want to delete this items?",
                "Some of them are used in other parts.",
                doDelete
            );
        } else {
            doDelete();
        }
    }
}

export function objectToJS(object: IEezObject): any {
    return JSON.parse(objectToJson(object));
}

export function cloneObject<T extends EezObject>(
    projectEditorStore: ProjectEditorStore,
    obj: T
) {
    return createObject<T>(projectEditorStore, obj, getClass(obj));
}
