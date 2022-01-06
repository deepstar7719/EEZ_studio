import { validators } from "eez-studio-shared/validation";

import { showGenericDialog } from "eez-studio-ui/generic-dialog";

import "project-editor/project/builtInFeatures";

import type { Tabs } from "home/tabs-store";

import { getProjectFeatures } from "project-editor/core/extensions";
import {
    CurrentSearch,
    findAllReferences,
    isReferenced
} from "project-editor/core/search";
import { DataContext } from "project-editor/features/variable/variable";

import {
    ProjectEditor,
    IProjectEditor
} from "project-editor/project-editor-interface";
import { LocalRuntime } from "project-editor/flow/local-runtime";
import { RemoteRuntime } from "project-editor/flow/remote-runtime";
import { DebugInfoRuntime } from "project-editor/flow/debug-info-runtime";
import {
    build as buildProject,
    backgroundCheck,
    buildExtensions
} from "project-editor/project/build";
import { getAllMetrics } from "project-editor/project/metrics";
import {
    getProject,
    getFlow,
    Project,
    findReferencedObject,
    getNameProperty,
    checkObjectReference
} from "project-editor/project/project";

import { extensions } from "eez-studio-shared/extensions/extensions";

import {
    ActionComponent,
    Component,
    registerActionComponent
} from "project-editor/flow/component";

import { Page } from "project-editor/features/page/page";
import { Widget } from "project-editor/flow/component";
import { Glyph } from "project-editor/features/font/font";
import { EmbeddedWidget } from "project-editor/flow/components/widgets";
import { ConnectionLine, Flow } from "project-editor/flow/flow";
import { Action } from "project-editor/features/action/action";
import { ScpiCommand, ScpiSubsystem } from "project-editor/features/scpi/scpi";
import {
    getObjectVariableTypeFromType,
    registerObjectVariableType
} from "project-editor/features/variable/value-type";

import "project-editor/flow/components/actions/stream";
import "project-editor/flow/components/actions/execute-command";
import "project-editor/flow/components/actions/file";
import "project-editor/flow/components/actions/instrument";
import "project-editor/flow/components/actions/regexp";
import "project-editor/flow/components/actions/serial";

import "project-editor/flow/components/widgets/markdown";
import "project-editor/flow/components/widgets/plotly";
import "project-editor/flow/components/widgets/terminal";

import type {
    IActionComponentDefinition,
    IObjectVariableType
} from "eez-studio-types";
import { findBitmap } from "project-editor/features/bitmap/bitmap";
import {
    migrateProjectVersion,
    migrateProjectType
} from "project-editor/project/migrate-project";
import {
    getNavigationComponent,
    getNavigationObject,
    navigateTo,
    selectObject
} from "project-editor/project/NavigationComponentFactory";
import {
    createEditorState,
    getEditorComponent,
    getAncestorWithEditorComponent
} from "project-editor/project/EditorComponentFactory";
import { browseGlyph } from "project-editor/features/font/FontEditor";
import { Variable } from "project-editor/features/variable/variable";
import { CallActionActionComponent } from "project-editor/flow/components/actions";
import { LayoutViewWidget } from "project-editor/flow/components/widgets";

let extensionsInitialized = false;

export async function initExtensions() {
    if (!extensionsInitialized) {
        extensionsInitialized = true;
        if (EEZStudio.electron) {
            extensions.forEach(extension => {
                if (extension.eezFlowExtensionInit) {
                    try {
                        extension.eezFlowExtensionInit({
                            registerActionComponent: (
                                actionComponentDefinition: IActionComponentDefinition
                            ) =>
                                registerActionComponent(
                                    actionComponentDefinition,
                                    `${extension.name}/${actionComponentDefinition.name}`
                                ),

                            registerObjectVariableType: (
                                name: string,
                                objectVariableType: IObjectVariableType
                            ) =>
                                registerObjectVariableType(
                                    `${extension.name}/${name}`,
                                    objectVariableType
                                ),

                            showGenericDialog,

                            validators: {
                                required: validators.required,
                                rangeInclusive: validators.rangeInclusive
                            }
                        } as any);
                    } catch (err) {
                        console.error(err);
                    }
                }
            });
        }
    }
}

export async function initProjectEditor(homeTabs: Tabs) {
    if (ProjectEditor.DataContextClass) {
        return;
    }

    await initExtensions();

    const projectEditor: IProjectEditor = {
        homeTabs,
        DataContextClass: DataContext,
        extensions: getProjectFeatures(),
        documentSearch: {
            CurrentSearch,
            findAllReferences,
            isReferenced,
            findReferencedObject,
            checkObjectReference
        },
        LocalRuntimeClass: LocalRuntime,
        RemoteRuntimeClass: RemoteRuntime,
        DebugInfoRuntimeClass: DebugInfoRuntime,
        build: {
            buildProject,
            backgroundCheck,
            buildExtensions
        },
        getAllMetrics,
        ProjectClass: Project,
        FlowClass: Flow,
        PageClass: Page,
        ActionClass: Action,
        ComponentClass: Component,
        ActionComponentClass: ActionComponent,
        WidgetClass: Widget,
        EmbeddedWidgetClass: EmbeddedWidget,
        ConnectionLineClass: ConnectionLine,
        LayoutViewWidgetClass: LayoutViewWidget,
        CallActionActionComponentClass: CallActionActionComponent,
        VariableClass: Variable,
        GlyphClass: Glyph,
        ScpiCommandClass: ScpiCommand,
        ScpiSubsystemClass: ScpiSubsystem,
        getProject,
        getFlow,
        getNameProperty,
        getObjectVariableTypeFromType,
        findBitmap,
        migrateProjectVersion,
        migrateProjectType,
        getNavigationComponent,
        getNavigationObject,
        navigateTo,
        selectObject,
        getEditorComponent,
        getAncestorWithEditorComponent,
        createEditorState,
        browseGlyph
    };

    Object.assign(ProjectEditor, projectEditor);
}
