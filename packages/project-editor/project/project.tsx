import React from "react";
import { observable, computed, runInAction, action } from "mobx";
import { observer } from "mobx-react";

import {
    fileExistsSync,
    getFileNameWithoutExtension
} from "eez-studio-shared/util-electron";
import { _map, _keys, _filter } from "eez-studio-shared/algorithm";
import { humanize } from "eez-studio-shared/string";

import {
    showGenericDialog,
    FieldComponent
} from "eez-studio-ui/generic-dialog";
import { Tree } from "eez-studio-ui/tree";
import { BootstrapButton } from "project-editor/components/BootstrapButton";
import { styled } from "eez-studio-ui/styled-components";

import { getProjectFeatures } from "project-editor/core/extensions";
import {
    ClassInfo,
    PropertyInfo,
    registerClass,
    IEezObject,
    EezObject,
    PropertyType,
    getChildOfObject,
    PropertyProps,
    getObjectFromPath,
    getProperty,
    findPropertyByNameInObject,
    getRootObject
} from "project-editor/core/object";
import {
    Message,
    propertyNotSetMessage,
    propertyNotFoundMessage,
    Type,
    propertyInvalidValueMessage
} from "project-editor/core/output";
import {
    DocumentStoreClass,
    getDocumentStore
} from "project-editor/core/store";

import { SettingsNavigation } from "project-editor/project/SettingsNavigation";

import "project-editor/project/builtInFeatures";

import { Action } from "project-editor/features/action/action";
import { DataItem } from "project-editor/features/data/data";
import { Gui } from "project-editor/features/gui/gui";
import { Scpi } from "project-editor/features/scpi/scpi";
import { Shortcuts } from "project-editor/features/shortcuts/shortcuts";
import { ExtensionDefinition } from "project-editor/features/extension-definitions/extension-definitions";

import { MenuNavigation } from "project-editor/components/MenuNavigation";

import {
    usage,
    startSearch,
    SearchCallbackMessage
} from "project-editor/core/search";

////////////////////////////////////////////////////////////////////////////////

export const NAMESPACE_PREFIX = "::";

////////////////////////////////////////////////////////////////////////////////

export class BuildConfiguration extends EezObject {
    @observable name: string;
    @observable description: string;
    @observable properties: string;
    @observable screenOrientation: "landscape" | "portrait";

    static classInfo: ClassInfo = {
        properties: [
            {
                name: "name",
                type: PropertyType.String,
                unique: true
            },
            {
                name: "description",
                type: PropertyType.MultilineText
            },
            {
                name: "properties",
                type: PropertyType.JSON
            },
            {
                name: "screenOrientation",
                type: PropertyType.Enum,
                enumItems: [
                    {
                        id: "landscape"
                    },
                    {
                        id: "portrait"
                    }
                ]
            }
        ],
        newItem: (parent: IEezObject) => {
            return Promise.resolve({
                name: "Configuration"
            });
        },
        showInNavigation: true,
        check: (object: BuildConfiguration) => {
            let messages: Message[] = [];

            if (object.properties) {
                try {
                    JSON.parse(object.properties);
                } catch (err) {
                    messages.push(
                        propertyInvalidValueMessage(object, "properties")
                    );
                }
            }

            return messages;
        }
    };
}

registerClass(BuildConfiguration);

////////////////////////////////////////////////////////////////////////////////

export class BuildFile extends EezObject {
    @observable fileName: string;
    @observable description?: string;
    @observable template: string;

    static classInfo: ClassInfo = {
        label: (buildFile: BuildFile) => {
            return buildFile.fileName;
        },
        properties: [
            {
                name: "fileName",
                type: PropertyType.String,
                unique: true
            },
            {
                name: "description",
                type: PropertyType.MultilineText
            },
            {
                name: "template",
                type: PropertyType.String,
                hideInPropertyGrid: true
            }
        ],
        newItem: (parent: IEezObject) => {
            return Promise.resolve({
                fileName: "file",
                template: ""
            });
        },
        showInNavigation: true
    };
}

registerClass(BuildFile);

////////////////////////////////////////////////////////////////////////////////

function isFilesPropertyEnumerable(object: IEezObject): boolean {
    const project: Project = getProject(object);
    return !!(project.gui || project.actions || project.data);
}

export class Build extends EezObject {
    @observable configurations: BuildConfiguration[];
    @observable files: BuildFile[];
    @observable destinationFolder?: string;

    static classInfo: ClassInfo = {
        label: () => "Build",
        properties: [
            {
                name: "configurations",
                type: PropertyType.Array,
                typeClass: BuildConfiguration,
                hideInPropertyGrid: true,
                showOnlyChildrenInTree: false
            },
            {
                name: "files",
                type: PropertyType.Array,
                typeClass: BuildFile,
                hideInPropertyGrid: true,
                enumerable: isFilesPropertyEnumerable
            },
            {
                name: "destinationFolder",
                type: PropertyType.RelativeFolder
            }
        ],
        showInNavigation: true
    };
}

registerClass(Build);

////////////////////////////////////////////////////////////////////////////////

class UsageTreeNode {
    id: string;
    label: string;
    children: UsageTreeNode[];
    @observable selected: boolean;
    @observable expanded: boolean;

    constructor(label: string, children?: (string | UsageTreeNode)[]) {
        this.id = label;
        this.label = label;
        this.children = children
            ? children.map(child =>
                  typeof child == "string"
                      ? new UsageTreeNode(child, [])
                      : child
              )
            : [];
        this.selected = false;
        this.expanded = children ? children.length > 0 : false;
    }
}

interface IAssetsUsage {
    assets: {
        [path: string]: string;
    };
    selectedAsset: string | undefined;
}

@observer
class UsageTreeField extends FieldComponent {
    @observable selectedNode: UsageTreeNode | undefined;

    @computed
    get rootNode() {
        let assetsUsage: IAssetsUsage = this.props.values[
            this.props.fieldProperties.name
        ];
        return new UsageTreeNode(
            "",
            _keys(assetsUsage.assets)
                .sort()
                .map(key => {
                    return new UsageTreeNode(
                        humanize(key),
                        assetsUsage.assets[key].split(", ")
                    );
                })
        );
    }

    selectNode = action((node: UsageTreeNode) => {
        if (this.selectedNode) {
            this.selectedNode.selected = false;
        }

        this.selectedNode = node;

        let assetsUsage: IAssetsUsage = this.props.values[
            this.props.fieldProperties.name
        ];
        if (this.selectedNode && this.selectedNode.children.length === 0) {
            assetsUsage.selectedAsset = this.selectedNode.id;
        } else {
            assetsUsage.selectedAsset = undefined;
        }

        if (this.selectedNode) {
            this.selectedNode.selected = true;
        }
    });

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

class BuildAssetsUssage {
    assets: {
        [path: string]: Set<string>;
    } = {};

    @observable
    assetsUsage: IAssetsUsage = {
        assets: {},
        selectedAsset: undefined
    };

    constructor(private importDirective: ImportDirective) {}

    onMessage(message: SearchCallbackMessage) {
        if (message.type == "value") {
            const path = message.valueObject.propertyInfo
                .referencedObjectCollectionPath!;

            const importedProject = this.importDirective.project!;

            const assetName = message.valueObject.value;
            if (!importedProject.assetCollectionPaths.has(path)) {
                // console.log("NOT INTERESTED", path, assetName);
                return true;
            }

            const collection = getObjectFromPath(
                importedProject,
                path.split("/")
            ) as EezObject[];
            const object =
                collection &&
                collection.find(
                    object => assetName == getProperty(object, "name")
                );

            if (object) {
                // console.log("FOUND", path, assetName, object);
                const set = this.assets[path] ?? new Set<string>();
                set.add(assetName);
                this.assets[path] = set;
                runInAction(
                    () =>
                        (this.assetsUsage.assets[path] = Array.from(set).join(
                            ", "
                        ))
                );
            } else {
                // console.log("NOT FOUND", path, assetName);
            }
            return true;
        } else {
            // console.log("finish");
            return true;
        }
    }
}

function showUsage(importDirective: ImportDirective) {
    const buildAssetsUsage = new BuildAssetsUssage(importDirective);

    const DocumentStore = getDocumentStore(importDirective);

    usage(DocumentStore, message => buildAssetsUsage.onMessage(message));

    showGenericDialog({
        dialogDefinition: {
            title: "Imported Project Assets Usage",
            fields: [
                {
                    name: "assetsUsage",
                    fullLine: true,
                    type: UsageTreeField
                }
            ]
        },
        values: {
            assetsUsage: buildAssetsUsage.assetsUsage
        },
        okButtonText: "Search",
        okEnabled: result => {
            const assetsUsage: IAssetsUsage = result.values.assetsUsage;
            return !!assetsUsage.selectedAsset;
        }
    })
        .then(
            action(result => {
                const assetsUsage: IAssetsUsage = result.values.assetsUsage;
                if (assetsUsage.selectedAsset) {
                    DocumentStore.UIStateStore.searchPattern =
                        assetsUsage.selectedAsset;
                    DocumentStore.UIStateStore.searchMatchCase = true;
                    DocumentStore.UIStateStore.searchMatchWholeWord = true;
                    startSearch(
                        DocumentStore,
                        assetsUsage.selectedAsset,
                        true,
                        true
                    );
                }
            })
        )
        .catch(() => {});
}

function openProject(importDirective: ImportDirective) {
    const DocumentStore = getDocumentStore(importDirective);
    EEZStudio.electron.ipcRenderer.send(
        "open-file",
        DocumentStore.getAbsoluteFilePath(importDirective.projectFilePath)
    );
}

const ImportDirectiveCustomUIContainer = styled.div`
    & > button {
        margin-right: 10px;
    }
`;

const ImportDirectiveCustomUI = observer((props: PropertyProps) => {
    return (
        <ImportDirectiveCustomUIContainer>
            <BootstrapButton
                color="primary"
                size="small"
                onClick={() => showUsage(props.objects[0] as ImportDirective)}
            >
                Usage
            </BootstrapButton>

            <BootstrapButton
                color="primary"
                size="small"
                onClick={() => openProject(props.objects[0] as ImportDirective)}
            >
                Open
            </BootstrapButton>
        </ImportDirectiveCustomUIContainer>
    );
});

export class ImportDirective {
    @observable projectFilePath: string;

    static classInfo: ClassInfo = {
        properties: [
            {
                name: "projectFilePath",
                type: PropertyType.RelativeFile,
                fileFilters: [
                    { name: "EEZ Project", extensions: ["eez-project"] },
                    { name: "All Files", extensions: ["*"] }
                ],
                isOptional: false
            },
            {
                name: "namespace",
                type: PropertyType.String,
                computed: true
            },
            {
                name: "customUI",
                displayName: "",
                type: PropertyType.Any,
                computed: true,
                propertyGridComponent: ImportDirectiveCustomUI,
                hideInPropertyGrid: (importObject: ImportDirective) =>
                    !importObject.project
            }
        ],
        defaultValue: {},
        check: (object: ImportDirective) => {
            let messages: Message[] = [];

            if (object.projectFilePath) {
                if (
                    !fileExistsSync(
                        getDocumentStore(object).getAbsoluteFilePath(
                            object.projectFilePath
                        )
                    )
                ) {
                    messages.push(
                        new Message(
                            Type.ERROR,
                            "File doesn't exists",
                            getChildOfObject(object, "projectFilePath")
                        )
                    );
                }
            } else {
                messages.push(propertyNotSetMessage(object, "projectFilePath"));
            }

            return messages;
        }
    };

    @computed({ keepAlive: true })
    get project() {
        const DocumentStore = getDocumentStore(this);

        return this.projectFilePath
            ? DocumentStore.loadExternalProject(
                  DocumentStore.getAbsoluteFilePath(
                      this.projectFilePath,
                      getProject(this)
                  )
              )
            : undefined;
    }

    @computed
    get namespace() {
        return this.project?.namespace;
    }
}

registerClass(ImportDirective);

////////////////////////////////////////////////////////////////////////////////

export enum ProjectType {
    MASTER_FIRMWARE = "master",
    FIRMWARE_MODULE = "firmware-module",
    RESOURCE = "resource",
    APPLET = "applet",
    DASHBOARD = "dashboard"
}

export class General extends EezObject {
    @observable projectVersion: "v1" | "v2";
    @observable projectType: string;
    @observable scpiDocFolder?: string;
    @observable namespace: string;
    @observable masterProject: string;
    @observable imports: ImportDirective[];

    static classInfo: ClassInfo = {
        label: () => "General",
        properties: [
            {
                name: "projectVersion",
                type: PropertyType.Enum,
                enumItems: [{ id: "v1" }, { id: "v2" }]
            },
            {
                name: "projectType",
                type: PropertyType.Enum,
                enumItems: [
                    { id: ProjectType.MASTER_FIRMWARE },
                    { id: ProjectType.FIRMWARE_MODULE },
                    { id: ProjectType.RESOURCE },
                    { id: ProjectType.APPLET },
                    { id: ProjectType.DASHBOARD }
                ]
            },
            {
                name: "scpiDocFolder",
                displayName: "SCPI documentation folder",
                type: PropertyType.RelativeFolder,
                hideInPropertyGrid: (object: IEezObject) =>
                    !getProject(object).scpi
            },
            {
                name: "namespace",
                type: PropertyType.String
            },
            {
                name: "masterProject",
                type: PropertyType.RelativeFile,
                fileFilters: [
                    { name: "EEZ Project", extensions: ["eez-project"] },
                    { name: "All Files", extensions: ["*"] }
                ],
                hideInPropertyGrid: (general: General) => {
                    return general.imports.length > 0;
                }
            },
            {
                name: "imports",
                type: PropertyType.Array,
                typeClass: ImportDirective,
                defaultValue: [],
                hideInPropertyGrid: (object: IEezObject) =>
                    !!getProject(object).masterProject
            }
        ],
        showInNavigation: true,
        check: (object: General) => {
            let messages: Message[] = [];

            if (object.masterProject) {
                const DocumentStore = getDocumentStore(object);
                if (
                    !fileExistsSync(
                        DocumentStore.getAbsoluteFilePath(object.masterProject)
                    )
                ) {
                    messages.push(
                        new Message(
                            Type.ERROR,
                            "File doesn't exists",
                            getChildOfObject(object, "masterProject")
                        )
                    );
                }
            }

            return messages;
        },
        beforeLoadHook(object: IEezObject, jsObject: any) {
            if (!jsObject.projectType) {
                if (jsObject.projectVersion === "v1") {
                    jsObject.projectType = ProjectType.MASTER_FIRMWARE;
                } else {
                    if (!jsObject.projectVersion) {
                        jsObject.projectVersion = "v2";
                    }

                    if (jsObject.masterProject) {
                        jsObject.projectType = ProjectType.RESOURCE;
                    } else if (jsObject.namespace) {
                        jsObject.projectType = ProjectType.FIRMWARE_MODULE;
                    } else {
                        jsObject.projectType = ProjectType.MASTER_FIRMWARE;
                    }
                }
            }
        }
    };
}

registerClass(General);

////////////////////////////////////////////////////////////////////////////////

export class Settings extends EezObject {
    @observable general: General;
    @observable build: Build;
    @observable scpiHelpFolder?: string;

    static classInfo: ClassInfo = {
        label: () => "Settings",
        properties: [
            {
                name: "general",
                type: PropertyType.Object,
                typeClass: General,
                hideInPropertyGrid: true
            },
            {
                name: "build",
                type: PropertyType.Object,
                typeClass: Build,
                hideInPropertyGrid: true,
                enumerable: (
                    object: IEezObject,
                    propertyInfo: PropertyInfo
                ) => {
                    return !getDocumentStore(object).masterProjectEnabled;
                }
            }
        ],
        hideInProperties: true,
        navigationComponent: SettingsNavigation,
        navigationComponentId: "settings",
        icon: "settings"
    };
}

registerClass(Settings);

////////////////////////////////////////////////////////////////////////////////

let projectClassInfo: ClassInfo;
let numProjectFeatures = 0;
let builtinProjectProperties: PropertyInfo[] = [
    {
        name: "settings",
        type: PropertyType.Object,
        typeClass: Settings,
        hideInPropertyGrid: true
    }
];
let projectProperties = builtinProjectProperties;

function getProjectClassInfo() {
    if (!projectClassInfo) {
        projectClassInfo = {
            label: () => "Project",
            properties: projectProperties,
            navigationComponent: MenuNavigation,
            navigationComponentId: "project",
            defaultNavigationKey: "settings"
        };
    }

    let projectFeatures = getProjectFeatures();
    if (numProjectFeatures != projectFeatures.length) {
        numProjectFeatures = projectFeatures.length;

        let projectFeatureProperties: PropertyInfo[] = projectFeatures.map(
            projectFeature => {
                return {
                    name:
                        projectFeature.eezStudioExtension.implementation
                            .projectFeature.key,
                    displayName:
                        projectFeature.eezStudioExtension.implementation
                            .projectFeature.displayName,
                    type:
                        projectFeature.eezStudioExtension.implementation
                            .projectFeature.type,
                    typeClass:
                        projectFeature.eezStudioExtension.implementation
                            .projectFeature.typeClass,
                    isOptional: !projectFeature.eezStudioExtension
                        .implementation.projectFeature.mandatory,
                    hideInPropertyGrid: true,
                    check:
                        projectFeature.eezStudioExtension.implementation
                            .projectFeature.check
                };
            }
        );

        projectProperties.splice(
            0,
            projectProperties.length,
            ...builtinProjectProperties.concat(projectFeatureProperties)
        );
    }

    return projectClassInfo;
}

class BuildAssetsMap {
    assets = new Map<string, IEezObject[]>();

    addAsset(path: string, object: IEezObject) {
        let asset = this.assets.get(path);
        if (!asset) {
            this.assets.set(path, [object]);
        } else {
            asset.push(object);
        }
    }
}

export class Project extends EezObject {
    _DocumentStore!: DocumentStoreClass;
    _isReadOnly: boolean = false;

    @observable settings: Settings;
    @observable data: DataItem[];
    @observable actions: Action[];
    @observable gui: Gui;
    @observable scpi: Scpi;
    @observable shortcuts: Shortcuts;
    @observable extensionDefinitions: ExtensionDefinition[];

    @computed get projectName() {
        if (this._DocumentStore.project === this) {
            return this._DocumentStore.filePath
                ? getFileNameWithoutExtension(this._DocumentStore.filePath)
                : "<current project>";
        }

        if (this.importDirective) {
            return getFileNameWithoutExtension(
                this._DocumentStore.getAbsoluteFilePath(
                    this.importDirective.projectFilePath
                )
            );
        }

        throw "unknwon project";
    }

    @computed
    get importDirective() {
        return this._DocumentStore.project.settings.general.imports.find(
            importDirective => importDirective.project === this
        );
    }

    @computed
    get dataItemsMap() {
        const map = new Map<String, DataItem>();
        this.data.forEach(dataItem => map.set(dataItem.name, dataItem));
        return map;
    }

    @computed
    get actionsMap() {
        const map = new Map<String, Action>();
        this.actions.forEach(action => map.set(action.name, action));
        return map;
    }

    static get classInfo(): ClassInfo {
        return getProjectClassInfo();
    }

    @computed
    get namespace() {
        return this.settings.general.namespace;
    }

    @computed({ keepAlive: true })
    get masterProject() {
        return (
            this.settings.general.masterProject &&
            this._DocumentStore.loadExternalProject(
                this._DocumentStore.getAbsoluteFilePath(
                    this.settings.general.masterProject
                )
            )
        );
    }

    @computed({ keepAlive: true })
    get allAssetsMaps() {
        return [
            { path: "data", map: this.data && this.dataItemsMap },
            { path: "actions", map: this.actions && this.actionsMap },
            { path: "gui/pages", map: this.gui && this.gui.pagesMap },
            { path: "gui/styles", map: this.gui && this.gui.stylesMap },
            { path: "gui/fonts", map: this.gui && this.gui.fontsMap },
            { path: "gui/bitmaps", map: this.gui && this.gui.bitmapsMap },
            { path: "gui/colors", map: this.gui && this.gui.colorsMap }
        ];
    }

    @computed({ keepAlive: true })
    get assetCollectionPaths() {
        const assetCollectionPaths = new Set<string>();
        this._DocumentStore.project.allAssetsMaps.forEach(assetsMap =>
            assetCollectionPaths.add(assetsMap.path)
        );
        return assetCollectionPaths;
    }

    @computed({ keepAlive: true })
    get localAssets() {
        const buildAssets = new BuildAssetsMap();

        this.allAssetsMaps.forEach(({ path, map }) => {
            if (map) {
                map.forEach((object: IEezObject, key: string) =>
                    buildAssets.addAsset(path + "/" + key, object)
                );
            }
        });

        return buildAssets.assets;
    }

    @computed({ keepAlive: true })
    get importedAssets() {
        const buildAssets = new BuildAssetsMap();

        for (const importDirective of this.settings.general.imports) {
            const project = importDirective.project;
            if (project) {
                project.allAssetsMaps.forEach(({ path, map }) => {
                    if (map) {
                        map.forEach((object: IEezObject, key: string) =>
                            buildAssets.addAsset(
                                path +
                                    "/" +
                                    (project.namespace
                                        ? project.namespace + NAMESPACE_PREFIX
                                        : "") +
                                    key,
                                object
                            )
                        );
                    }
                });
            }
        }

        return buildAssets.assets;
    }

    @computed({ keepAlive: true })
    get masterAssets() {
        const buildAssets = new BuildAssetsMap();

        if (this.masterProject) {
            this.masterProject.allAssetsMaps.forEach(({ path, map }) => {
                if (map) {
                    map.forEach((object: IEezObject, key: string) => {
                        if ((object as any).id) {
                            buildAssets.addAsset(path + "/" + key, object);
                        }
                    });
                }
            });
        }

        return buildAssets.assets;
    }

    @computed({ keepAlive: true })
    get allAssets() {
        return new Map([
            ...this.localAssets,
            ...this.masterAssets,
            ...this.importedAssets
        ]);
    }

    getAllObjectsOfType(referencedObjectCollectionPath: string) {
        const isAssetType = this.assetCollectionPaths.has(
            referencedObjectCollectionPath
        );

        if (isAssetType) {
            return Array.from(this.allAssets.keys())
                .filter(key => key.startsWith(referencedObjectCollectionPath))
                .map(key => this.allAssets.get(key)!)
                .filter(assets => assets.length == 1)
                .map(assets => assets[0]);
        } else {
            return (
                (this._DocumentStore.getObjectFromPath(
                    referencedObjectCollectionPath.split("/")
                ) as IEezObject[]) || []
            );
        }
    }
}

registerClass(Project);

////////////////////////////////////////////////////////////////////////////////

export function findAllReferencedObjects(
    project: Project,
    referencedObjectCollectionPath: string,
    referencedObjectName: string
) {
    return project.allAssets.get(
        referencedObjectCollectionPath + "/" + referencedObjectName
    );
}

export function findReferencedObject(
    project: Project,
    referencedObjectCollectionPath: string,
    referencedObjectName: string
) {
    let objects = project.allAssets.get(
        referencedObjectCollectionPath + "/" + referencedObjectName
    );
    if (objects && objects.length === 1) {
        return objects[0];
    }
    return undefined;
}

export function checkObjectReference(
    object: IEezObject,
    propertyName: string,
    messages: Message[],
    mandatory?: boolean
) {
    const value = getProperty(object, propertyName);
    if (value) {
        const propertyInfo = findPropertyByNameInObject(object, propertyName);
        if (!propertyInfo) {
            throw `unknow object property: ${propertyName}`;
        }
        if (!propertyInfo.referencedObjectCollectionPath) {
            throw `no referencedObjectCollectionPath for property: ${propertyName}`;
        }

        const objects = findAllReferencedObjects(
            getProject(object),
            propertyInfo.referencedObjectCollectionPath,
            value
        );

        if (!objects || objects.length == 0) {
            messages.push(propertyNotFoundMessage(object, propertyName));
        } else if (objects.length > 1) {
            messages.push(
                new Message(
                    Type.ERROR,
                    `Ambiguous, found in multiple projects: ${objects
                        .map(object => getProject(object).projectName)
                        .join(", ")}`,
                    getChildOfObject(object, propertyName)
                )
            );
        }
    } else {
        if (mandatory) {
            messages.push(propertyNotSetMessage(object, propertyName));
        }
    }
}

export function getProject(object: IEezObject) {
    return getRootObject(object) as Project;
}

export function isObjectReadOnly(object: IEezObject) {
    return getProject(object)._isReadOnly;
}

export function isAnyObjectReadOnly(objects: IEezObject[]) {
    return !!objects.find(isObjectReadOnly);
}

export function getNameProperty(object: IEezObject) {
    let name = getProperty(object, "name");
    const project = getProject(object);
    if (isObjectReadOnly(object) && project.namespace) {
        name = project.namespace + NAMESPACE_PREFIX + name;
    }
    return name;
}
