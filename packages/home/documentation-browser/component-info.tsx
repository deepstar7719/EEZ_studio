import React from "react";
import { makeObservable, observable, runInAction } from "mobx";

import {
    IObjectClassInfo,
    PropertyInfo,
    setParent
} from "project-editor/core/object";

import { MarkdownData, MarkdownDescription } from "./doc-markdown";
import { markdownToHTML } from "./doc-markdown";
import { ProjectStore, createObject } from "project-editor/store";
import {
    Component,
    ComponentInput,
    ComponentOutput
} from "project-editor/flow/component";

export interface IComponentInfoProperty {
    name: string;
    metaInfo: PropertyInfo;
}

export class ParentComponentInfo {
    markdown?: MarkdownData;

    constructor(
        public properties: IComponentInfoProperty[],
        public parent: ParentComponentInfo | undefined
    ) {
        makeObservable(this, {
            markdown: observable
        });
    }
}

export class ComponentInfo {
    id: string;
    type: "widget" | "action";
    group: string;
    name: string;
    icon: any;
    titleStyle: React.CSSProperties | undefined;

    isDashboardComponent: boolean;
    isEezGuiComponent: boolean;
    isLVGLComponent: boolean;

    properties: IComponentInfoProperty[];
    inputs: {
        name: string;
        metaInfo: ComponentInput;
    }[];
    outputs: {
        name: string;
        metaInfo: ComponentOutput;
    }[];

    markdown?: MarkdownData;
    parent: ParentComponentInfo;

    docCounters: {
        total: number;
        drafts: number;
        completed: number;
    };

    constructor() {}

    makeObservable() {
        makeObservable(this, {
            markdown: observable,
            parent: observable,
            docCounters: observable
        });
    }

    get allProperties() {
        const getParentProperties = (
            parentComponentInfo: ParentComponentInfo
        ): IComponentInfoProperty[] => {
            return [
                ...parentComponentInfo.properties,
                ...(parentComponentInfo.parent
                    ? getParentProperties(parentComponentInfo.parent)
                    : [])
            ];
        };

        return [...this.properties, ...getParentProperties(this.parent)].filter(
            property => !(property.metaInfo.hideInDocumentation === this.type)
        );
    }

    static createComponentObject = (
        projectStore: ProjectStore,
        componentClass: IObjectClassInfo
    ) => {
        const componentObject = createObject<Component>(
            projectStore,
            Object.assign(
                {},
                componentClass.objectClass.classInfo.defaultValue,
                {
                    type: componentClass.name
                }
            ),
            componentClass.objectClass,
            undefined,
            true
        );

        setParent(
            componentObject,
            projectStore.project.userPages[0].components
        );

        projectStore.project.userPages[0].components.push(componentObject);

        return componentObject;
    };

    updateDocCounters() {
        let total = 0;
        let drafts = 0;
        let completed = 0;

        function inc(markdown?: MarkdownDescription | undefined) {
            total++;

            if (markdown) {
                if (markdown.draft) {
                    drafts++;
                } else {
                    completed++;
                }
            }
        }

        inc(this.getDescriptionMarkdown());
        for (const property of this.allProperties) {
            inc(this.getPropertyDescriptionMarkdown(property.name));
        }
        for (const input of this.inputs) {
            inc(this.getInputDescriptionMarkdown(input.name));
        }
        for (const output of this.outputs) {
            inc(this.getOutputDescriptionMarkdown(output.name));
        }
        inc(this.getExamplesMarkdown());

        runInAction(() => {
            this.docCounters = { total, drafts, completed };
        });
    }

    readAllMarkdown() {
        this.getDescriptionMarkdown();
        for (const property of this.allProperties) {
            this.getPropertyDescriptionMarkdown(property.name);
        }
        for (const input of this.inputs) {
            this.getInputDescriptionMarkdown(input.name);
        }
        for (const output of this.outputs) {
            this.getOutputDescriptionMarkdown(output.name);
        }
        this.getExamplesMarkdown();
    }

    renderMarkdown(
        markdown: MarkdownDescription | undefined,
        generateHTML: boolean
    ) {
        let text: string | undefined;

        if (markdown != undefined) {
            text = markdown.raw;
        }

        if (text == undefined) {
            return (
                <div className="alert alert-danger" role="alert">
                    No description
                </div>
            );
        }

        return (
            <div
                className="markdown"
                style={{ visibility: generateHTML ? undefined : "hidden" }}
                dangerouslySetInnerHTML={markdownToHTML(text)}
            />
        );
    }

    getDescriptionMarkdown() {
        return this.markdown?.description;
    }

    renderDescription(generateHTML: boolean) {
        return this.renderMarkdown(this.markdown?.description, generateHTML);
    }

    getPropertyDescriptionMarkdown(propertyName: string) {
        const markdown = this.markdown?.properties[propertyName];
        if (markdown) {
            return markdown;
        }
        return this.getParentPropertyDescriptionMarkdown(propertyName);
    }

    getParentPropertyDescriptionMarkdown(propertyName: string) {
        let parent: ParentComponentInfo | undefined;

        for (parent = this.parent; parent; parent = parent.parent) {
            const markdown = parent.markdown?.properties[propertyName];
            if (markdown) {
                return markdown;
            }
        }

        return undefined;
    }

    renderPropertyDescription(propertyName: string, generateHTML: boolean) {
        return this.renderMarkdown(
            this.getPropertyDescriptionMarkdown(propertyName),
            generateHTML
        );
    }

    getInputDescriptionMarkdown(inputName: string) {
        return this.markdown?.inputs[inputName];
    }

    renderInputDescription(inputName: string, generateHTML: boolean) {
        return this.renderMarkdown(
            this.getInputDescriptionMarkdown(inputName),
            generateHTML
        );
    }

    getOutputDescriptionMarkdown(outputName: string) {
        return this.markdown?.outputs[outputName];
    }

    renderOutputDescription(outputName: string, generateHTML: boolean) {
        return this.renderMarkdown(
            this.getOutputDescriptionMarkdown(outputName),
            generateHTML
        );
    }

    getExamplesMarkdown() {
        return this.markdown?.examples;
    }

    renderExamples(generateHTML: boolean) {
        return this.renderMarkdown(this.getExamplesMarkdown(), generateHTML);
    }
}
