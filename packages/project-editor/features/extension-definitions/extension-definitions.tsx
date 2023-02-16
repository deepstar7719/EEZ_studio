import React from "react";
import { observable, makeObservable } from "mobx";

import { validators } from "eez-studio-shared/validation";

import { showGenericDialog } from "eez-studio-ui/generic-dialog";

import {
    ClassInfo,
    registerClass,
    IEezObject,
    EezObject,
    PropertyType
} from "project-editor/core/object";
import {
    createObject,
    getProjectEditorStore,
    Message,
    propertyInvalidValueMessage,
    propertyNotSetMessage,
    propertyNotUniqueMessage
} from "project-editor/store";

import { ProjectContext } from "project-editor/project/context";
import { ListNavigation } from "project-editor/ui-components/ListNavigation";
import { NavigationComponent } from "project-editor/project/ui/NavigationComponent";

////////////////////////////////////////////////////////////////////////////////

export class ExtensionDefinitionNavigation extends NavigationComponent {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    render() {
        return (
            <ListNavigation
                id={this.props.id}
                navigationObject={this.props.navigationObject}
                selectedObject={
                    this.context.navigationStore
                        .selectedExtensionDefinitionObject
                }
                onDoubleClickItem={this.props.onDoubleClickItem}
            />
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

export class ExtensionDefinition extends EezObject {
    name: string;
    description: string;
    doNotBuild: boolean;
    buildConfiguration: string;
    buildFolder: string;
    image: string;
    extensionName: string;
    idn: string;

    properties: string;

    idfName: string;
    idfShortName: string;
    idfFirmwareVersion: string;
    idfGuid: string;
    idfRevisionNumber: string;
    idfDescription: string;
    idfSupportedModels: string;
    idfRevisionComments: string;
    idfAuthor: string;

    sdlFriendlyName: string;

    static classInfo: ClassInfo = {
        listLabel: (extensionDefinition: ExtensionDefinition) => {
            return (
                extensionDefinition.name +
                (extensionDefinition.doNotBuild ? " (build disabled)" : "")
            );
        },
        properties: [
            {
                name: "name",
                type: PropertyType.String,
                unique: true
            },
            {
                name: "description",
                type: PropertyType.MultilineText,
                defaultValue: undefined
            },
            {
                name: "doNotBuild",
                type: PropertyType.Boolean,
                defaultValue: false
            },
            {
                name: "buildConfiguration",
                type: PropertyType.ObjectReference,
                referencedObjectCollectionPath: "settings/build/configurations",
                defaultValue: undefined
            },
            {
                name: "buildFolder",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "extensionName",
                displayName: "IEXT name",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "image",
                type: PropertyType.Image,
                defaultValue: undefined
            },
            {
                name: "idn",
                displayName: "IDN",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "properties",
                type: PropertyType.JSON,
                defaultValue: undefined
            },
            {
                name: "idfName",
                displayName: "IDF name",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "idfShortName",
                displayName: "IDF short name",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "idfFirmwareVersion",
                displayName: "IDF firmware version",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "idfGuid",
                displayName: "IDF GUID",
                type: PropertyType.GUID,
                defaultValue: undefined
            },
            {
                name: "idfRevisionNumber",
                displayName: "IDF revision number (extension version)",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "idfDescription",
                displayName: "IDF description",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "idfSupportedModels",
                displayName: "IDF supported models",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "idfRevisionComments",
                displayName: "IDF revision comments",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "idfAuthor",
                displayName: "IDF author",
                type: PropertyType.String,
                defaultValue: undefined
            },
            {
                name: "sdlFriendlyName",
                displayName: "SDL friendly name",
                type: PropertyType.String,
                defaultValue: undefined
            }
        ],
        newItem: async (parent: IEezObject) => {
            const result = await showGenericDialog({
                dialogDefinition: {
                    title: "New Instrument Definition File",
                    fields: [
                        {
                            name: "name",
                            type: "string",
                            validators: [
                                validators.required,
                                validators.unique({}, parent)
                            ]
                        }
                    ]
                },
                values: {}
            });

            const projectEditorStore = getProjectEditorStore(parent);

            const extensionDefinitionProperties: Partial<ExtensionDefinition> =
                {
                    name: result.values.name
                };

            const extensionDefinition = createObject<ExtensionDefinition>(
                projectEditorStore,
                extensionDefinitionProperties,
                ExtensionDefinition
            );

            return extensionDefinition;
        },
        hideInProperties: true,
        icon: "extension",
        check: (object: ExtensionDefinition) => {
            let messages: Message[] = [];

            if (!object.extensionName) {
                messages.push(propertyNotSetMessage(object, "extensionName"));
            }

            if (!object.idn) {
                messages.push(propertyNotSetMessage(object, "idn"));
            }

            if (!object.idfGuid) {
                messages.push(propertyNotSetMessage(object, "idfGuid"));
            }

            if (!object.idfRevisionNumber) {
                messages.push(
                    propertyNotSetMessage(object, "idfRevisionNumber")
                );
            }

            const projectEditorStore = getProjectEditorStore(object);

            let extensionDefinitions =
                projectEditorStore.project.extensionDefinitions;
            if (
                extensionDefinitions.find(
                    extensionDefinition =>
                        extensionDefinition !== object &&
                        extensionDefinition.idfGuid === object.idfGuid
                )
            ) {
                messages.push(propertyNotUniqueMessage(object, "idfGuid"));
            }

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

    constructor() {
        super();

        makeObservable(this, {
            name: observable,
            description: observable,
            doNotBuild: observable,
            buildConfiguration: observable,
            buildFolder: observable,
            image: observable,
            extensionName: observable,
            idn: observable,
            properties: observable,
            idfName: observable,
            idfShortName: observable,
            idfFirmwareVersion: observable,
            idfGuid: observable,
            idfRevisionNumber: observable,
            idfDescription: observable,
            idfSupportedModels: observable,
            idfRevisionComments: observable,
            idfAuthor: observable,
            sdlFriendlyName: observable
        });
    }
}

registerClass("ExtensionDefinition", ExtensionDefinition);

////////////////////////////////////////////////////////////////////////////////

export default {
    name: "eezstudio-project-feature-extension-definitions",
    version: "0.1.0",
    description:
        "This feature adds support for IEXT definitions into your project",
    author: "EEZ",
    authorLogo: "../eez-studio-ui/_images/eez_logo.png",
    displayName: "IEXT defs",
    mandatory: false,
    key: "extensionDefinitions",
    type: PropertyType.Array,
    typeClass: ExtensionDefinition,
    icon: "extension",
    create: () => {
        return [];
    },
    check: (object: IEezObject) => {
        return [];
    }
};
