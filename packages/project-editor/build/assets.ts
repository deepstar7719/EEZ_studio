import type { BuildResult } from "project-editor/store/features";

import {
    EezObject,
    getProperty,
    MessageType
} from "project-editor/core/object";

import {
    Project,
    BuildConfiguration,
    getProject,
    getFlow
} from "project-editor/project/project";

import {
    Style,
    getStyleProperty,
    findStyle
} from "project-editor/features/style/style";
import { Page, findPage } from "project-editor/features/page/page";
import { findFont, Font } from "project-editor/features/font/font";
import { Bitmap, findBitmap } from "project-editor/features/bitmap/bitmap";
import { Action, findAction } from "project-editor/features/action/action";
import {
    Variable,
    findVariable
} from "project-editor/features/variable/variable";
import { Flow } from "project-editor/flow/flow";
import {
    Component,
    ComponentInput,
    isFlowProperty,
    Widget
} from "project-editor/flow/component";

import { buildActions, buildActionNames } from "project-editor/build/actions";
import {
    buildVariableNames,
    buildVariables
} from "project-editor/build/variables";
import {
    buildGuiStylesData,
    buildGuiStylesEnum
} from "project-editor/build/styles";
import {
    buildGuiFontsData,
    buildGuiFontsEnum
} from "project-editor/build/fonts";
import { buildGuiBitmapsData } from "project-editor/build/bitmaps";
import { buildGuiColors } from "project-editor/build/themes";
import { buildFlowData, buildFlowDefs } from "project-editor/build/flows";
import { buildGuiBitmapsEnum } from "project-editor/build/bitmaps";
import {
    buildGuiThemesEnum,
    buildGuiColorsEnum
} from "project-editor/build/themes";
import { buildWidget } from "project-editor/build/widgets";
import { FlowValue, getValueType } from "project-editor/build/values";
import {
    getClassInfo,
    getObjectPathAsString,
    propertyNotFoundMessage,
    Section
} from "project-editor/store";
import { ValueType } from "project-editor/features/variable/value-type";

import { build as buildV1 } from "project-editor/build/v1";
import { build as buildV2 } from "project-editor/build/v2";
import {
    dumpData,
    getName,
    NamingConvention,
    TAB
} from "project-editor/build/helper";
import { FIRST_DASHBOARD_COMPONENT_TYPE } from "project-editor/flow/components/component_types";

import { DummyDataBuffer, DataBuffer } from "project-editor/build/data-buffer";

import { LVGLBuild } from "project-editor/lvgl/build";

export { DummyDataBuffer, DataBuffer } from "project-editor/build/data-buffer";

export const PATH_SEPARATOR = "//";

export class Assets {
    projects: Project[];

    globalVariables: Variable[];
    actions: Action[];
    pages: (Page | undefined)[];
    styles: Style[];
    fonts: Font[];
    bitmaps: Bitmap[];
    colors: string[];

    flows: (Flow | undefined)[];

    flowStates = new Map<
        Flow,
        {
            index: number;
            componentIndexes: Map<Component, number>;

            componentInputIndexes: Map<string, number>;
            commponentInputs: ComponentInput[];

            flowWidgetDataIndexes: Map<string, number>;
            flowWidgetDataIndexToComponentPropertyValue: Map<
                number,
                {
                    componentIndex: number;
                    propertyValueIndex: number;
                }
            >;
            flowWidgetFromDataIndex: Map<number, Widget>;

            flowWidgetActionIndexes: Map<string, number>;
            flowWidgetActionIndexToComponentOutput: Map<
                number,
                {
                    componentIndex: number;
                    componentOutputIndex: number;
                }
            >;
            flowWidgetFromActionIndex: Map<number, Widget>;
        }
    >();

    constants: FlowValue[] = [];
    constantsMap = new Map<
        undefined | boolean | number | string | object,
        number
    >();

    map: AssetsMap = {
        flows: [],
        flowIndexes: {},
        actionFlowIndexes: {},
        constants: [],
        globalVariables: [],
        dashboardComponentTypeToNameMap: {},
        types: [],
        typeIndexes: {},
        displayWidth: this.displayWidth,
        displayHeight: this.displayHeight
    };

    dashboardComponentClassNameToComponentIdMap: {
        [name: string]: number;
    } = {};
    nextDashboardComponentId = FIRST_DASHBOARD_COMPONENT_TYPE;
    dashboardComponentTypeToNameMap: {
        [componentType: number]: string;
    } = {};

    get projectEditorStore() {
        return this.rootProject._DocumentStore;
    }

    collectProjects(project: Project) {
        if (this.projects.indexOf(project) === -1) {
            this.projects.push(project);
            for (const importDirective of this.rootProject.settings.general
                .imports) {
                if (importDirective.project) {
                    this.collectProjects(importDirective.project);
                }
            }
        }
    }

    getAssets<T>(
        getCollection: (project: Project) => T[],
        assetIncludePredicate: (asset: T) => boolean
    ) {
        const assets = [];
        for (const project of this.projects) {
            const collection = getCollection(project);
            if (collection) {
                assets.push(...collection.filter(assetIncludePredicate));
            }
        }
        return assets;
    }

    constructor(
        public rootProject: Project,
        buildConfiguration: BuildConfiguration | undefined,
        public option: "check" | "buildAssets" | "buildFiles"
    ) {
        this.projectEditorStore.typesStore.reset();

        this.getConstantIndex(undefined, "undefined"); // undefined has value index 0
        this.getConstantIndex(null, "null"); // null has value index 1

        this.projects = [];
        this.collectProjects(rootProject);

        const assetIncludePredicate = (asset: Variable | Action | Page) =>
            !buildConfiguration ||
            !asset.usedIn ||
            asset.usedIn.indexOf(buildConfiguration.name) !== -1;

        //
        // pages
        //
        this.pages = [];

        this.getAssets<Page>(
            project => project.pages,
            page => assetIncludePredicate(page) && page.id != undefined
        ).forEach(page => (this.pages[page.id! - 1] = page));

        this.getAssets<Page>(
            project => project.pages,
            page => assetIncludePredicate(page) && page.id == undefined
        ).forEach(page => this.pages.push(page));

        for (let i = 0; i < this.pages.length; i++) {
            if (!this.pages[i]) {
                this.projectEditorStore.outputSectionsStore.write(
                    Section.OUTPUT,
                    MessageType.WARNING,
                    `Missing page with ID = ${i + 1}`,
                    this.rootProject.pages
                );
            }
        }

        //
        // flows
        //
        this.flows = [
            ...this.pages,
            ...this.getAssets<Action>(
                project =>
                    project.actions.filter(
                        action =>
                            (this.option == "buildAssets" &&
                                action.id == undefined) ||
                            action.implementationType == "flow"
                    ),
                assetIncludePredicate
            )
        ];

        this.flows.forEach(flow => flow && this.getFlowState(flow));

        //
        // global variables
        //
        const nonNativeVariables = this.getAssets<Variable>(
            project =>
                project.variables ? project.variables.globalVariables : [],
            globalVariable =>
                assetIncludePredicate(globalVariable) &&
                !(
                    (this.option == "buildFiles" ||
                        globalVariable.id != undefined) &&
                    globalVariable.native
                )
        );

        const nativeVariables: Variable[] = [];
        this.getAssets<Variable>(
            project =>
                project.variables ? project.variables.globalVariables : [],
            globalVariable =>
                assetIncludePredicate(globalVariable) &&
                globalVariable.native &&
                globalVariable.id != undefined
        ).forEach(
            globalVariable =>
                (nativeVariables[globalVariable.id! - 1] = globalVariable)
        );

        this.getAssets<Variable>(
            project =>
                project.variables ? project.variables.globalVariables : [],
            globalVariable =>
                assetIncludePredicate(globalVariable) &&
                this.option == "buildFiles" &&
                globalVariable.native &&
                globalVariable.id == undefined
        ).forEach(globalVariable => nativeVariables.push(globalVariable));

        for (let i = 0; i < nativeVariables.length; i++) {
            if (!nativeVariables[i]) {
                this.projectEditorStore.outputSectionsStore.write(
                    Section.OUTPUT,
                    MessageType.WARNING,
                    `Missing global variable with ID = ${i + 1}`,
                    this.rootProject.variables.globalVariables
                );
                for (let j = 0; j < nativeVariables.length; j++) {
                    if (nativeVariables[j]) {
                        nativeVariables[i] = nativeVariables[j];
                        break;
                    }
                }
            }
        }

        this.globalVariables = [
            // first non-native
            ...nonNativeVariables,
            // than native
            ...nativeVariables
        ];

        //
        // actions
        //
        const nonNativeActions = this.getAssets<Action>(
            project => project.actions,
            action =>
                assetIncludePredicate(action) &&
                ((this.option != "buildFiles" && action.id == undefined) ||
                    action.implementationType != "native")
        );

        const nativeActions: Action[] = [];
        this.getAssets<Action>(
            project => project.actions,
            action =>
                assetIncludePredicate(action) &&
                action.implementationType == "native" &&
                action.id != undefined
        ).forEach(action => (nativeActions[action.id! - 1] = action));

        this.getAssets<Action>(
            project => project.actions,
            action =>
                assetIncludePredicate(action) &&
                this.option == "buildFiles" &&
                action.implementationType == "native" &&
                action.id == undefined
        ).forEach(action => nativeActions.push(action));

        for (let i = 0; i < nativeActions.length; i++) {
            if (!nativeActions[i]) {
                this.projectEditorStore.outputSectionsStore.write(
                    Section.OUTPUT,
                    MessageType.WARNING,
                    `Missing action with ID = ${i + 1}`,
                    this.rootProject.actions
                );
                for (let j = 0; j < nativeActions.length; j++) {
                    if (nativeActions[j]) {
                        nativeActions[i] = nativeActions[j];
                        break;
                    }
                }
            }
        }

        this.actions = [
            // first non-native
            ...nonNativeActions,
            // than native
            ...nativeActions
        ];

        //
        // styles
        //
        this.styles = [];
        if (!this.projectEditorStore.projectTypeTraits.isDashboard) {
            this.getAssets<Style>(
                project => project.styles,
                style => style.id != undefined
            ).forEach(style => (this.styles[style.id! - 1] = style));
            this.getAssets<Style>(
                project => project.styles,
                style => style.id == undefined && style.alwaysBuild
            ).forEach(style => this.styles.push(style));
            for (let i = 0; i < this.styles.length; i++) {
                if (!this.styles[i]) {
                    this.projectEditorStore.outputSectionsStore.write(
                        Section.OUTPUT,
                        MessageType.WARNING,
                        `Missing style with ID = ${i + 1}`,
                        this.rootProject.styles
                    );
                    for (let j = 0; j < this.styles.length; j++) {
                        if (this.styles[j]) {
                            this.styles[i] = this.styles[j];
                            break;
                        }
                    }
                }
            }
        }

        //
        // fonts
        //
        this.fonts = [];
        if (!this.projectEditorStore.projectTypeTraits.isDashboard) {
            this.getAssets<Font>(
                project => project.fonts,
                font => font.id != undefined
            ).forEach(font => (this.fonts[font.id! - 1] = font));
            this.getAssets<Font>(
                project => project.fonts,
                font => font.id == undefined && font.alwaysBuild
            ).forEach(font => this.fonts.push(font));
            for (let i = 0; i < this.fonts.length; i++) {
                if (!this.fonts[i]) {
                    this.projectEditorStore.outputSectionsStore.write(
                        Section.OUTPUT,
                        MessageType.WARNING,
                        `Missing font with ID = ${i + 1}`,
                        this.rootProject.fonts
                    );
                    for (let j = 0; j < this.fonts.length; j++) {
                        if (this.fonts[j]) {
                            this.fonts[i] = this.fonts[j];
                            break;
                        }
                    }
                }
            }
        }
        //
        // bitmaps
        //
        this.bitmaps = [];
        if (!this.projectEditorStore.projectTypeTraits.isDashboard) {
            this.getAssets<Bitmap>(
                project => project.bitmaps,
                bitmap => bitmap.id != undefined
            ).forEach(bitmap => (this.bitmaps[bitmap.id! - 1] = bitmap));
            this.getAssets<Bitmap>(
                project => project.bitmaps,
                bitmap => bitmap.id == undefined && bitmap.alwaysBuild
            ).forEach(bitmap => this.bitmaps.push(bitmap));
            for (let i = 0; i < this.bitmaps.length; i++) {
                if (!this.bitmaps[i]) {
                    this.projectEditorStore.outputSectionsStore.write(
                        Section.OUTPUT,
                        MessageType.WARNING,
                        `Missing bitmap with ID = ${i + 1}`,
                        this.rootProject.bitmaps
                    );
                    for (let j = 0; j < this.bitmaps.length; j++) {
                        if (this.bitmaps[j]) {
                            this.bitmaps[i] = this.bitmaps[j];
                            break;
                        }
                    }
                }
            }
        }

        //
        // colors
        //
        this.colors = [];

        //
        const dummyDataBuffer = new DummyDataBuffer(this.utf8Support);
        buildGuiDocumentData(this, dummyDataBuffer);
        buildGuiStylesData(this, dummyDataBuffer);
        buildFlowData(this, dummyDataBuffer);
    }

    get utf8Support() {
        return this.projectEditorStore.projectTypeTraits.hasFlowSupport;
    }

    getAssetIndex<T extends EezObject>(
        object: any,
        propertyName: string,
        findAsset: (project: Project, assetName: string) => T | undefined,
        collection: (T | undefined)[]
    ) {
        const project = getProject(object);
        const assetName = object[propertyName];
        const asset = findAsset(project, assetName);

        if (asset) {
            let assetIndex = collection.indexOf(asset);
            if (assetIndex == -1) {
                const isMasterProjectAsset =
                    this.projectEditorStore.masterProject &&
                    getProject(asset) == this.projectEditorStore.masterProject;

                if (isMasterProjectAsset) {
                    // TODO
                    return 0;
                } else {
                    collection.push(asset);
                    assetIndex = collection.length - 1;
                }
            }
            assetIndex++;
            return this.projectEditorStore.masterProject
                ? -assetIndex
                : assetIndex;
        }

        if (assetName != undefined) {
            const message = propertyNotFoundMessage(object, propertyName);
            this.projectEditorStore.outputSectionsStore.write(
                Section.OUTPUT,
                message.type,
                message.text,
                message.object
            );
        }

        return 0;
    }

    getWidgetDataItemIndex(object: any, propertyName: string) {
        if (this.projectEditorStore.projectTypeTraits.hasFlowSupport) {
            return this.getFlowWidgetDataItemIndex(object, propertyName);
        }

        if (!getProperty(object, propertyName)) {
            return 0;
        }

        return this.getAssetIndex(
            object,
            propertyName,
            findVariable,
            this.globalVariables
        );
    }

    getWidgetActionIndex(object: any, propertyName: string) {
        if (this.projectEditorStore.projectTypeTraits.hasFlowSupport) {
            return this.getFlowWidgetActionIndex(object, propertyName);
        }

        if (!getProperty(object, propertyName)) {
            return 0;
        }

        return this.getAssetIndex(
            object,
            propertyName,
            findAction,
            this.actions
        );
    }

    getPageIndex(object: any, propertyName: string) {
        return this.getAssetIndex(object, propertyName, findPage, this.pages);
    }

    doGetStyleIndex(
        project: Project,
        styleNameOrObject: string | Style
    ): number {
        if (typeof styleNameOrObject === "string") {
            const styleName = styleNameOrObject;

            for (let i = 0; i < this.styles.length; i++) {
                const style = this.styles[i];
                if (style && style.name == styleName) {
                    return this.projectEditorStore.masterProject
                        ? -(i + 1)
                        : i + 1;
                }
            }

            const style = findStyle(project, styleName);
            if (style) {
                if (style.id != undefined) {
                    return style.id;
                }

                const isMasterProjectStyle =
                    this.projectEditorStore.masterProject &&
                    getProject(style) == this.projectEditorStore.masterProject;
                if (isMasterProjectStyle) {
                    this.projectEditorStore.outputSectionsStore.write(
                        Section.OUTPUT,
                        MessageType.WARNING,
                        `master project style without ID can not be used`,
                        style
                    );
                } else {
                    this.styles.push(style);
                    return this.projectEditorStore.masterProject
                        ? -this.styles.length
                        : this.styles.length;
                }
            }
        } else {
            const style = styleNameOrObject;

            if (style.inheritFrom) {
                const parentStyle = findStyle(project, style.inheritFrom);
                if (parentStyle) {
                    if (style.compareTo(parentStyle)) {
                        if (style.id != undefined) {
                            return style.id;
                        }
                        return this.doGetStyleIndex(project, parentStyle.name);
                    }
                }
            }

            for (let i = 0; i < this.styles.length; i++) {
                const s = this.styles[i];
                if (s && style.compareTo(s)) {
                    return this.projectEditorStore.masterProject
                        ? -(i + 1)
                        : i + 1;
                }
            }

            const isMasterProjectStyle =
                this.projectEditorStore.masterProject &&
                getProject(style) == this.projectEditorStore.masterProject;
            if (isMasterProjectStyle) {
                if (style.id) {
                    return style.id;
                } else {
                    this.projectEditorStore.outputSectionsStore.write(
                        Section.OUTPUT,
                        MessageType.WARNING,
                        `master project style without ID can not be used`,
                        style
                    );
                }
            } else {
                this.styles.push(style);
                return this.projectEditorStore.masterProject
                    ? -this.styles.length
                    : this.styles.length;
            }
        }

        return 0;
    }

    getStyleIndex(object: any, propertyName: string): number {
        const project = getProject(object);

        let style: string | Style | undefined = object[propertyName];
        if (style === undefined) {
            style = findStyle(project, "default");
            if (!style) {
                return 0;
            }
        }

        return this.doGetStyleIndex(project, style);
    }

    getFontIndex(object: any, propertyName: string) {
        let fontName: string | undefined = object[propertyName];

        const project = getProject(object);

        let font = findFont(project, fontName);
        if (!font && project != this.projectEditorStore.project) {
            font = findFont(this.projectEditorStore.project, fontName);
        }

        if (font) {
            for (let i = 0; i < this.fonts.length; i++) {
                if (font == this.fonts[i]) {
                    return this.projectEditorStore.masterProject
                        ? -(i + 1)
                        : i + 1;
                }
            }

            const isMasterProjectFont =
                this.projectEditorStore.masterProject &&
                getProject(font) == this.projectEditorStore.masterProject;
            if (isMasterProjectFont) {
                if (font.id) {
                    return font.id;
                } else {
                    this.projectEditorStore.outputSectionsStore.write(
                        Section.OUTPUT,
                        MessageType.WARNING,
                        `master project font without ID can not be used`,
                        font
                    );
                }
            } else {
                this.fonts.push(font);
                return this.projectEditorStore.masterProject
                    ? -this.fonts.length
                    : this.fonts.length;
            }
        }
        return 0;
    }

    getBitmapIndex(object: any, propertyName: string) {
        let bitmapName: string | undefined = object[propertyName];

        const project = getProject(object);

        let bitmap = findBitmap(project, bitmapName);
        if (!bitmap && project != this.projectEditorStore.project) {
            bitmap = findBitmap(this.projectEditorStore.project, bitmapName);
        }

        if (bitmap) {
            for (let i = 0; i < this.bitmaps.length; i++) {
                if (bitmap == this.bitmaps[i]) {
                    return this.projectEditorStore.masterProject
                        ? -(i + 1)
                        : i + 1;
                }
            }

            const isMasterProjectBitmap =
                this.projectEditorStore.masterProject &&
                getProject(bitmap) == this.projectEditorStore.masterProject;
            if (isMasterProjectBitmap) {
                if (bitmap.id) {
                    return bitmap.id;
                } else {
                    this.projectEditorStore.outputSectionsStore.write(
                        Section.OUTPUT,
                        MessageType.WARNING,
                        `master project bitmap without ID can not be used`,
                        bitmap
                    );
                }
            } else {
                this.bitmaps.push(bitmap);
                return this.projectEditorStore.masterProject
                    ? -this.bitmaps.length
                    : this.bitmaps.length;
            }
        }
        return 0;
    }

    getColorIndexFromColorValue(color: string) {
        if (color == "transparent") {
            return 65535;
        }

        // TODO: currently all colors are available from master project,
        // we should add support for exporting colors (internal and exported),
        // like we are doing for styles
        let colors = this.projectEditorStore.project.masterProject
            ? this.projectEditorStore.project.masterProject.buildColors
            : this.projectEditorStore.project.buildColors;

        for (let i = 0; i < colors.length; i++) {
            if (colors[i].name === color) {
                return i;
            }
        }

        if (this.projectEditorStore.project.masterProject) {
            return 0;
        }

        for (let i = 0; i < this.colors.length; i++) {
            if (this.colors[i] == color) {
                return colors.length + i;
            }
        }

        this.colors.push(color);

        return colors.length + this.colors.length - 1;
    }

    getColorIndex(
        style: Style,
        propertyName:
            | "color"
            | "backgroundColor"
            | "activeColor"
            | "activeBackgroundColor"
            | "focusColor"
            | "focusBackgroundColor"
            | "borderColor"
    ) {
        let color = getStyleProperty(style, propertyName, false);
        return this.getColorIndexFromColorValue(color);
    }

    getTypeIndex(valueType: ValueType) {
        const index =
            this.projectEditorStore.typesStore.getValueTypeIndex(valueType);
        if (index == undefined) {
            return -1;
        }
        return index;
    }

    reportUnusedAssets() {
        this.projects.forEach(project => {
            if (project.styles?.length > 0) {
                project.styles.forEach(style => {
                    if (
                        !this.styles.find(usedStyle => {
                            if (!usedStyle) {
                                return false;
                            }

                            if (usedStyle == style) {
                                return true;
                            }

                            let baseStyle = findStyle(
                                this.rootProject,
                                usedStyle.inheritFrom
                            );
                            while (baseStyle) {
                                if (baseStyle == style) {
                                    return true;
                                }
                                baseStyle = findStyle(
                                    this.rootProject,
                                    baseStyle.inheritFrom
                                );
                            }

                            return false;
                        })
                    ) {
                        this.projectEditorStore.outputSectionsStore.write(
                            Section.OUTPUT,
                            MessageType.INFO,
                            "Unused style: " + style.name,
                            style
                        );
                    }
                });
            }

            if (project.fonts?.length > 0) {
                project.fonts.forEach(font => {
                    if (this.fonts.indexOf(font) === -1) {
                        this.projectEditorStore.outputSectionsStore.write(
                            Section.OUTPUT,
                            MessageType.INFO,
                            "Unused font: " + font.name,
                            font
                        );
                    }
                });
            }

            if (project.bitmaps?.length > 0) {
                project.bitmaps.forEach(bitmap => {
                    if (this.bitmaps.indexOf(bitmap) === -1) {
                        this.projectEditorStore.outputSectionsStore.write(
                            Section.OUTPUT,
                            MessageType.INFO,
                            "Unused bitmap: " + bitmap.name,
                            bitmap
                        );
                    }
                });
            }
        });
    }

    getFlowState(flow: Flow) {
        let flowState = this.flowStates.get(flow);
        if (flowState == undefined) {
            flowState = {
                index: this.flowStates.size,
                componentIndexes: new Map<Component, number>(),
                componentInputIndexes: new Map<string, number>(),
                commponentInputs: [],
                flowWidgetDataIndexes: new Map<string, number>(),
                flowWidgetDataIndexToComponentPropertyValue: new Map<
                    number,
                    {
                        componentIndex: number;
                        propertyValueIndex: number;
                    }
                >(),
                flowWidgetFromDataIndex: new Map<number, Widget>(),
                flowWidgetActionIndexes: new Map<string, number>(),
                flowWidgetActionIndexToComponentOutput: new Map<
                    number,
                    {
                        componentIndex: number;
                        componentOutputIndex: number;
                    }
                >(),
                flowWidgetFromActionIndex: new Map<number, Widget>()
            };
            this.flowStates.set(flow, flowState);
        }
        return flowState;
    }

    getFlowIndex(flow: Flow) {
        return this.getFlowState(flow).index;
    }

    getFlowIndexFromComponentProperty(
        component: Component,
        propertyName: string
    ) {
        const actionName = getProperty(component, propertyName);
        if (!actionName) {
            return -1;
        }
        const action = this.actions.find(action => action.name == actionName);
        if (!action) {
            return -1;
        }
        return this.getFlowIndex(action);
    }

    getConstantIndex(value: any, valueType: ValueType) {
        let index = this.constantsMap.get(value);
        if (index == undefined) {
            index = this.constants.length;
            this.constants.push({
                type: getValueType(valueType),
                value,
                valueType
            });
            this.constantsMap.set(value, index);
        }
        return index;
    }

    getComponentIndex(component: Component) {
        const flowState = this.getFlowState(getFlow(component));
        let index = flowState.componentIndexes.get(component);
        if (index == undefined) {
            index = flowState.componentIndexes.size;
            flowState.componentIndexes.set(component, index);
        }
        return index;
    }

    getComponentInputIndex(component: Component, inputName: string) {
        const flowState = this.getFlowState(getFlow(component));
        const path =
            getObjectPathAsString(component) + PATH_SEPARATOR + inputName;
        let index = flowState.componentInputIndexes.get(path);
        if (index == undefined) {
            index = flowState.componentInputIndexes.size;
            flowState.componentInputIndexes.set(path, index);
            flowState.commponentInputs.push(
                component.inputs.find(input => input.name == inputName)!
            );
        }
        return index;
    }

    findComponentInputIndex(component: Component, inputName: string) {
        const flowState = this.getFlowState(getFlow(component));
        const path =
            getObjectPathAsString(component) + PATH_SEPARATOR + inputName;
        const inputIndex = flowState.componentInputIndexes.get(path);
        if (inputIndex == undefined) {
            return -1;
        }
        return inputIndex;
    }

    getFlowWidgetDataItemIndex(widget: Widget, propertyName: string) {
        if (!getProperty(widget, propertyName)) {
            return 0;
        }
        const flowState = this.getFlowState(getFlow(widget));
        const path =
            getObjectPathAsString(widget) + PATH_SEPARATOR + propertyName;
        let index = flowState.flowWidgetDataIndexes.get(path);
        if (index == undefined) {
            index = flowState.flowWidgetDataIndexes.size;
            flowState.flowWidgetDataIndexes.set(path, index);
            flowState.flowWidgetFromDataIndex.set(index, widget);
        }
        return -(index + 1);
    }

    getComponentProperties(component: Component) {
        return getClassInfo(component).properties.filter(propertyInfo =>
            isFlowProperty(component, propertyInfo, [
                "input",
                "template-literal",
                "assignable"
            ])
        );
    }

    getComponentPropertyIndex(component: Component, propertyName: string) {
        const properties = getClassInfo(component).properties.filter(
            propertyInfo =>
                isFlowProperty(component, propertyInfo, [
                    "input",
                    "template-literal",
                    "assignable"
                ])
        );
        return properties.findIndex(
            propertyInfo => propertyInfo.name == propertyName
        );
    }

    getFlowWidgetActionIndex(widget: Widget, propertyName: string) {
        if (
            !widget.asOutputProperties ||
            widget.asOutputProperties.indexOf(propertyName) == -1
        ) {
            const actionName = getProperty(widget, propertyName);
            if (!actionName) {
                return 0;
            }

            if (this.projectEditorStore.projectTypeTraits.hasFlowSupport) {
                const action = this.actions.find(
                    action => action.name == actionName
                );
                if (!action) {
                    return 0;
                }

                if (
                    (this.option == "buildFiles" || action.id != undefined) &&
                    action.implementationType === "native"
                ) {
                    const actionIndex = this.actions
                        .filter(
                            action =>
                                (this.option == "buildFiles" ||
                                    action.id != undefined) &&
                                action.implementationType === "native"
                        )
                        .findIndex(action => action.name == actionName);
                    return actionIndex + 1;
                }
            }
        }

        const flowState = this.getFlowState(getFlow(widget));
        const path =
            getObjectPathAsString(widget) + PATH_SEPARATOR + propertyName;
        let index = flowState.flowWidgetActionIndexes.get(path);
        if (index == undefined) {
            index = flowState.flowWidgetActionIndexes.size;
            flowState.flowWidgetActionIndexes.set(path, index);
            flowState.flowWidgetFromActionIndex.set(index, widget);
        }
        return -(index + 1);
    }

    registerComponentProperty(
        component: Component,
        propertyName: string,
        componentIndex: number,
        propertyValueIndex: number
    ) {
        const flowState = this.getFlowState(getFlow(component));
        const path =
            getObjectPathAsString(component) + PATH_SEPARATOR + propertyName;
        let index = flowState.flowWidgetDataIndexes.get(path);
        if (index != undefined) {
            flowState.flowWidgetDataIndexToComponentPropertyValue.set(index, {
                componentIndex,
                propertyValueIndex
            });
        }
    }

    registerComponentOutput(
        component: Component,
        outputName: string,
        componentIndex: number,
        componentOutputIndex: number
    ) {
        const flowState = this.getFlowState(getFlow(component));
        const path =
            getObjectPathAsString(component) + PATH_SEPARATOR + outputName;
        let index = flowState.flowWidgetActionIndexes.get(path);
        if (index != undefined) {
            flowState.flowWidgetActionIndexToComponentOutput.set(index, {
                componentIndex,
                componentOutputIndex
            });
        }
    }

    getComponentOutputIndex(component: Component, outputName: string) {
        return component.buildOutputs.findIndex(
            output => output.name == outputName
        );
    }

    finalizeMap() {
        this.map.constants = this.constants;

        this.flows.forEach(flow => {
            if (!flow) {
                return;
            }
            const flowState = this.getFlowState(flow);
            const flowIndex = flowState.index;

            flowState.flowWidgetDataIndexes.forEach(index => {
                const componentPropertyValue =
                    flowState.flowWidgetDataIndexToComponentPropertyValue.get(
                        index
                    );

                this.map.flows[flowIndex].widgetDataItems[index] = {
                    widgetDataItemIndex: index,
                    flowIndex,
                    componentIndex: componentPropertyValue
                        ? componentPropertyValue.componentIndex
                        : -1,
                    propertyValueIndex: componentPropertyValue
                        ? componentPropertyValue.propertyValueIndex
                        : -1
                };
            });

            flowState.flowWidgetActionIndexes.forEach(index => {
                const componentOutput =
                    flowState.flowWidgetActionIndexToComponentOutput.get(index);

                this.map.flows[flowIndex].widgetActions[index] = {
                    widgetActionIndex: index,
                    flowIndex,
                    componentIndex: componentOutput
                        ? componentOutput.componentIndex
                        : -1,
                    outputIndex: componentOutput
                        ? componentOutput.componentIndex
                        : -1
                };
            });
        });

        if (
            this.projectEditorStore.projectTypeTraits.isDashboard ||
            this.projectEditorStore.projectTypeTraits.isLVGL
        ) {
            this.map.dashboardComponentTypeToNameMap =
                this.dashboardComponentTypeToNameMap;
        }

        this.map.flows.forEach((flow, i) => {
            this.map.flowIndexes[flow.path] = i;
            flow.components.forEach(
                (component, i) => (flow.componentIndexes[component.path] = i)
            );
        });

        this.projectEditorStore.project.actions.forEach(action => {
            this.map.actionFlowIndexes[action.name] =
                this.map.flowIndexes[getObjectPathAsString(action)];
        });

        this.map.types = this.projectEditorStore.typesStore.types;
        this.map.typeIndexes = this.projectEditorStore.typesStore.typeIndexes;
    }

    get displayWidth() {
        if (this.projectEditorStore.projectTypeTraits.isDashboard) {
            return 1;
        }

        if (this.projectEditorStore.projectTypeTraits.isLVGL) {
            return this.projectEditorStore.project.settings.general
                .displayWidth;
        }

        const maxPageWidth = Math.max(
            ...this.projectEditorStore.project.pages.map(page => page.width)
        );

        if (this.projectEditorStore.projectTypeTraits.hasFlowSupport) {
            return Math.max(
                maxPageWidth,
                this.projectEditorStore.project.settings.general.displayWidth
            );
        } else {
            return maxPageWidth;
        }
    }

    get displayHeight() {
        if (this.projectEditorStore.projectTypeTraits.isDashboard) {
            return 1;
        }

        if (this.projectEditorStore.projectTypeTraits.isLVGL) {
            return this.projectEditorStore.project.settings.general
                .displayHeight;
        }

        const maxPageHeight = Math.max(
            ...this.projectEditorStore.project.pages.map(page => page.height)
        );

        if (this.projectEditorStore.projectTypeTraits.hasFlowSupport) {
            return Math.max(
                maxPageHeight,
                this.projectEditorStore.project.settings.general.displayHeight
            );
        } else {
            return maxPageHeight;
        }
    }
}

////////////////////////////////////////////////////////////////////////////////

function buildHeaderData(
    assets: Assets,
    decompressedSize: number,
    dataBuffer: DataBuffer
) {
    // tag
    // HEADER_TAG = 0x7A65657E
    const tag = new TextEncoder().encode("~eez");
    dataBuffer.writeUint8Array(tag);

    // projectMajorVersion
    dataBuffer.writeUint8(3); // PROJECT MAJOR VERSION: 3
    // projectMinorVersion
    dataBuffer.writeUint8(0); // PROJECT MINOR VERSION: 0

    // assetsType
    dataBuffer.writeUint8(assets.projectEditorStore.projectTypeTraits.id);

    // reserved
    dataBuffer.writeUint8(0);

    // decompressedSize
    dataBuffer.writeUint32(decompressedSize);

    dataBuffer.finalize();
}

function buildLanguages(assets: Assets, dataBuffer: DataBuffer) {
    dataBuffer.writeArray(
        assets.projectEditorStore.project.texts?.languages ?? [],
        language => {
            dataBuffer.writeObjectOffset(() => {
                dataBuffer.writeString(language.languageID);
            });

            dataBuffer.writeArray(
                assets.projectEditorStore.project.texts.resources,
                textResource => {
                    const translation = textResource.translations.find(
                        translation =>
                            translation.languageID == language.languageID
                    );
                    if (translation) {
                        dataBuffer.writeString(translation.text ?? "");
                    } else {
                        dataBuffer.writeString("");
                    }
                }
            );
        },
        8
    );
}

export async function buildGuiAssetsData(assets: Assets) {
    const dataBuffer = new DataBuffer(assets.utf8Support);

    // settings
    dataBuffer.writeObjectOffset(() => {
        dataBuffer.writeUint16(assets.map.displayWidth);
        dataBuffer.writeUint16(assets.map.displayHeight);
    });

    if (!assets.projectEditorStore.projectTypeTraits.isLVGL) {
        // pages
        buildGuiDocumentData(assets, dataBuffer);
        // styles
        buildGuiStylesData(assets, dataBuffer);
        // fonts
        await buildGuiFontsData(assets, dataBuffer);
        // bitmaps
        await buildGuiBitmapsData(assets, dataBuffer);
    }
    // colorsDefinition
    buildGuiColors(assets, dataBuffer);
    // actionNames
    buildActionNames(assets, dataBuffer);
    // variableNames
    buildVariableNames(assets, dataBuffer);
    // flowDefinition
    buildFlowData(assets, dataBuffer);
    // languages
    buildLanguages(assets, dataBuffer);

    dataBuffer.finalize();

    const decompressedSize = dataBuffer.size;

    const { compressedBuffer, compressedSize } = dataBuffer.compress();

    const headerBuffer = new DataBuffer(assets.utf8Support);
    buildHeaderData(assets, decompressedSize, headerBuffer);

    const allData = Buffer.alloc(headerBuffer.size + compressedSize);
    headerBuffer.buffer.copy(allData, 0, 0, headerBuffer.size);
    compressedBuffer.copy(allData, headerBuffer.size, 0, compressedSize);

    assets.projectEditorStore.outputSectionsStore.write(
        Section.OUTPUT,
        MessageType.INFO,
        "Uncompressed size: " + decompressedSize
    );

    assets.projectEditorStore.outputSectionsStore.write(
        Section.OUTPUT,
        MessageType.INFO,
        "Compressed size: " + compressedSize
    );

    return allData;
}

export async function buildAssets(
    project: Project,
    sectionNames: string[] | undefined,
    buildConfiguration: BuildConfiguration | undefined,
    option: "check" | "buildAssets" | "buildFiles"
): Promise<BuildResult> {
    if (project.settings.general.projectVersion === "v1") {
        return buildV1(project, sectionNames, buildConfiguration);
    }

    if (project.settings.general.projectVersion === "v2") {
        return buildV2(project, sectionNames, buildConfiguration);
    }

    const result: any = {};

    const assets = new Assets(project, buildConfiguration, option);

    assets.reportUnusedAssets();

    // build enum's
    if (option != "buildAssets") {
        if (!sectionNames || sectionNames.indexOf("GUI_PAGES_ENUM") !== -1) {
            result.GUI_PAGES_ENUM = buildGuiPagesEnum(assets);
        }

        if (!sectionNames || sectionNames.indexOf("GUI_STYLES_ENUM") !== -1) {
            result.GUI_STYLES_ENUM = buildGuiStylesEnum(assets);
        }

        if (!sectionNames || sectionNames.indexOf("GUI_FONTS_ENUM") !== -1) {
            result.GUI_FONTS_ENUM = buildGuiFontsEnum(assets);
        }

        if (!sectionNames || sectionNames.indexOf("GUI_BITMAPS_ENUM") !== -1) {
            result.GUI_BITMAPS_ENUM = buildGuiBitmapsEnum(assets);
        }

        if (!sectionNames || sectionNames.indexOf("GUI_THEMES_ENUM") !== -1) {
            result.GUI_THEMES_ENUM = buildGuiThemesEnum(assets);
        }

        if (!sectionNames || sectionNames.indexOf("GUI_COLORS_ENUM") !== -1) {
            result.GUI_COLORS_ENUM = buildGuiColorsEnum(assets);
        }

        if (!sectionNames || sectionNames.indexOf("FLOW_DEFS") !== -1) {
            result.FLOW_DEFS = buildFlowDefs(assets);
        }
    }

    const buildAssetsDecl =
        !sectionNames || sectionNames.indexOf("GUI_ASSETS_DECL") !== -1;

    const buildAssetsDeclCompressed =
        !sectionNames ||
        sectionNames.indexOf("GUI_ASSETS_DECL_COMPRESSED") !== -1;

    const buildAssetsDef =
        !sectionNames || sectionNames.indexOf("GUI_ASSETS_DEF") !== -1;

    const buildAssetsDefCompressed =
        !sectionNames ||
        sectionNames.indexOf("GUI_ASSETS_DEF_COMPRESSED") !== -1;

    const buildAssetsData =
        !sectionNames || sectionNames.indexOf("GUI_ASSETS_DATA") !== -1;

    const buildAssetsDataMap =
        !sectionNames || sectionNames.indexOf("GUI_ASSETS_DATA_MAP") !== -1;

    if (
        buildAssetsDecl ||
        buildAssetsDeclCompressed ||
        buildAssetsDef ||
        buildAssetsDefCompressed ||
        buildAssetsData ||
        buildAssetsDataMap
    ) {
        // build all assets as single data chunk
        const compressedAssetsData = await buildGuiAssetsData(assets);

        if (option != "buildAssets") {
            if (buildAssetsDecl) {
                result.GUI_ASSETS_DECL =
                    buildGuiAssetsDecl(compressedAssetsData);
            }

            if (buildAssetsDeclCompressed) {
                result.GUI_ASSETS_DECL_COMPRESSED =
                    buildGuiAssetsDecl(compressedAssetsData);
            }

            if (buildAssetsDef) {
                result.GUI_ASSETS_DEF = await buildGuiAssetsDef(
                    compressedAssetsData
                );
            }

            if (buildAssetsDefCompressed) {
                result.GUI_ASSETS_DEF_COMPRESSED = await buildGuiAssetsDef(
                    compressedAssetsData
                );
            }
        }

        if (buildAssetsData) {
            result.GUI_ASSETS_DATA = compressedAssetsData;
        }

        if (buildAssetsDataMap) {
            assets.finalizeMap();

            result.GUI_ASSETS_DATA_MAP = JSON.stringify(
                assets.map,
                undefined,
                2
            );

            result.GUI_ASSETS_DATA_MAP_JS = assets.map;
        }
    }

    if (option != "buildAssets") {
        if (assets.projectEditorStore.projectTypeTraits.isLVGL) {
            const lvglBuild = new LVGLBuild(assets);

            // PASS 1 (find out which LVGL objects are accessible through global objects structure)
            await lvglBuild.buildScreensDef();

            // PASS 2
            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_SCREENS_DECL") !== -1
            ) {
                result.LVGL_SCREENS_DECL = await lvglBuild.buildScreensDecl();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_SCREENS_DEF") !== -1
            ) {
                result.LVGL_SCREENS_DEF = await lvglBuild.buildScreensDef();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_SCREENS_DECL_EXT") !== -1
            ) {
                result.LVGL_SCREENS_DECL_EXT =
                    await lvglBuild.buildScreensDeclExt();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_SCREENS_DEF_EXT") !== -1
            ) {
                result.LVGL_SCREENS_DEF_EXT =
                    await lvglBuild.buildScreensDefExt();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_IMAGES_DECL") !== -1
            ) {
                result.LVGL_IMAGES_DECL = await lvglBuild.buildImagesDecl();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_IMAGES_DEF") !== -1
            ) {
                result.LVGL_IMAGES_DEF = await lvglBuild.buildImagesDef();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_FONTS_DECL") !== -1
            ) {
                result.LVGL_FONTS_DECL = await lvglBuild.buildFontsDecl();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_ACTIONS_DECL") !== -1
            ) {
                result.LVGL_ACTIONS_DECL = await lvglBuild.buildActionsDecl();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_VARS_DECL") !== -1
            ) {
                result.LVGL_VARS_DECL = await lvglBuild.buildVariablesDecl();
            }

            if (
                !sectionNames ||
                sectionNames.indexOf("LVGL_NATIVE_VARS_TABLE_DEF") !== -1
            ) {
                result.LVGL_NATIVE_VARS_TABLE_DEF =
                    await lvglBuild.buildNativeVarsTableDef();
            }

            if (option == "buildFiles") {
                await lvglBuild.copyFontFiles();
            }
        }
    }

    if (option == "buildAssets") {
        return result;
    }

    return Object.assign(
        result,
        await buildVariables(assets, sectionNames),
        await buildActions(assets, sectionNames)
    );
}

export function buildGuiPagesEnum(assets: Assets) {
    let pages = assets.pages.map(
        (page, i) =>
            `${TAB}${
                page
                    ? getName(
                          "PAGE_ID_",
                          page,
                          NamingConvention.UnderscoreUpperCase
                      )
                    : `PAGE_ID_${i}`
            } = ${i + 1}`
    );

    pages.unshift(`${TAB}PAGE_ID_NONE = 0`);

    return `enum PagesEnum {\n${pages.join(",\n")}\n};`;
}

export function buildGuiDocumentData(assets: Assets, dataBuffer: DataBuffer) {
    if (dataBuffer) {
        dataBuffer.writeArray(assets.pages, page => {
            if (page) {
                buildWidget(page, assets, dataBuffer);
            }
        });
    } else {
        assets.pages.forEach(page => {
            if (page) {
                buildWidget(page, assets, dataBuffer);
            }
        });
    }
}

function buildGuiAssetsDecl(data: Buffer) {
    return `extern const uint8_t assets[${data.length}];`;
}

function buildGuiAssetsDef(data: Buffer) {
    return `// ASSETS DEFINITION\nconst uint8_t assets[${
        data.length
    }] = {${dumpData(data)}};`;
}
