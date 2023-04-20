import React from "react";
import { computed, makeObservable, observable } from "mobx";
import { observer } from "mobx-react";

import {
    ClassInfo,
    EezObject,
    getClassesDerivedFrom,
    IEezObject,
    PropertyProps,
    PropertyType,
    registerClass
} from "project-editor/core/object";
import { LVGLStylesDefinitionProperty } from "project-editor/lvgl/LVGLStylesDefinitionProperty";
import { ProjectContext } from "project-editor/project/context";
import { EditorComponent } from "project-editor/project/ui/EditorComponent";
import { ListNavigation } from "project-editor/ui-components/ListNavigation";
import { LVGLStylesDefinition } from "project-editor/lvgl/style-definition";
import { showGenericDialog } from "eez-studio-ui/generic-dialog";
import { validators } from "eez-studio-shared/validation";
import { ProjectEditor } from "project-editor/project-editor-interface";
import { createObject } from "project-editor/store";
import type { Project } from "project-editor/project/project";
import { getComponentName } from "project-editor/flow/editor/ComponentsPalette";
import { LVGLStylesEditorRuntime } from "project-editor/lvgl/page-runtime";
import { Checkbox } from "project-editor/ui-components/PropertyGrid/Checkbox";
import { Icon } from "eez-studio-ui/icon";
import type { ProjectEditorFeature } from "project-editor/store/features";

////////////////////////////////////////////////////////////////////////////////

const DefaultStylePropertyGridUI = observer(
    class DefaultStylePropertyGridUI extends React.Component<PropertyProps> {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        get lvglStyle() {
            return this.props.objects[0] as LVGLStyle;
        }

        onChange = (value: boolean) => {
            const defaultStyles = Object.assign(
                {},
                this.context.project.lvglStyles.defaultStyles,
                {
                    [this.lvglStyle.forWidgetType]: value
                        ? this.lvglStyle.name
                        : undefined
                }
            );

            this.context.updateObject(this.context.project.lvglStyles, {
                defaultStyles
            });
        };

        render() {
            const state =
                this.context.project.lvglStyles.defaultStyles[
                    this.lvglStyle.forWidgetType
                ] == this.lvglStyle.name;

            return (
                <Checkbox
                    state={state}
                    onChange={this.onChange}
                    readOnly={false}
                    switchStyle={true}
                ></Checkbox>
            );
        }
    }
);

export class LVGLStyle extends EezObject {
    name: string;
    forWidgetType: string;
    definition: LVGLStylesDefinition;

    constructor() {
        super();

        makeObservable(this, {
            name: observable,
            forWidgetType: observable,
            definition: observable
        });
    }

    static classInfo: ClassInfo = {
        properties: [
            {
                name: "name",
                type: PropertyType.String,
                unique: true
            },
            {
                name: "forWidgetType",
                type: PropertyType.String,
                readOnlyInPropertyGrid: true
            },
            {
                name: "defaultStyle",
                type: PropertyType.Any,
                computed: true,
                propertyGridColumnComponent: DefaultStylePropertyGridUI
            },
            {
                name: "definition",
                type: PropertyType.Object,
                typeClass: LVGLStylesDefinition,
                propertyGridRowComponent: LVGLStylesDefinitionProperty,
                enumerable: false
            }
        ],
        listLabel: (lvglStyle: LVGLStyle) => {
            const componentClass = getClassesDerivedFrom(
                ProjectEditor.LVGLWidgetClass
            ).find(
                componentClass => componentClass.name == lvglStyle.forWidgetType
            );

            const icon = componentClass?.objectClass.classInfo.icon;

            const isDefault =
                ProjectEditor.getProject(lvglStyle).lvglStyles.defaultStyles[
                    lvglStyle.forWidgetType
                ] == lvglStyle.name;

            return (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        flex: 1,
                        paddingRight: 10
                    }}
                >
                    <div>
                        {icon && (
                            <Icon
                                icon={icon as any}
                                style={{
                                    opacity: 0.66,
                                    marginRight: 5,
                                    height: 20
                                }}
                            />
                        )}
                        {lvglStyle.name}
                    </div>
                    {isDefault && <div>Default</div>}
                </div>
            );
        },
        newItem: async (parent: IEezObject) => {
            const result = await showGenericDialog({
                dialogDefinition: {
                    title: "New Style",
                    fields: [
                        {
                            name: "name",
                            type: "string",
                            validators: [
                                validators.required,
                                validators.unique({}, parent)
                            ]
                        },
                        {
                            name: "forWidgetType",
                            type: "enum",
                            enumItems: () => {
                                return getClassesDerivedFrom(
                                    ProjectEditor.LVGLWidgetClass
                                ).map(componentClass => {
                                    const classInfo =
                                        componentClass.objectClass.classInfo;
                                    return {
                                        id: componentClass.name,
                                        label: componentClass.displayName
                                            ? componentClass.displayName
                                            : classInfo.componentPaletteLabel ||
                                              getComponentName(
                                                  componentClass.name
                                              )
                                    };
                                });
                            },
                            validators: [validators.required]
                        }
                    ]
                },
                values: {
                    forWidgetType: "LVGLPanelWidget"
                }
            });

            const styleProperties: Partial<LVGLStyle> = {
                name: result.values.name,
                forWidgetType: result.values.forWidgetType,
                definition: {} as any
            };

            const project = ProjectEditor.getProject(parent);

            const style = createObject<LVGLStyle>(
                project._store,
                styleProperties,
                LVGLStyle
            );

            return style;
        },
        defaultValue: {
            forWidgetType: "LVGLPanelWidget",
            definition: {}
        },
        lvgl: (lvglStyle: LVGLStyle) => {
            const componentClass = getClassesDerivedFrom(
                ProjectEditor.LVGLWidgetClass
            ).find(
                componentClass => componentClass.name == lvglStyle.forWidgetType
            );

            if (componentClass) {
                if (
                    typeof componentClass.objectClass.classInfo.lvgl == "object"
                ) {
                    return componentClass.objectClass.classInfo.lvgl;
                }
            }

            return {
                parts: [],
                flags: [],
                defaultFlags: "",
                states: []
            };
        }
    };
}

registerClass("LVGLStyle", LVGLStyle);

////////////////////////////////////////////////////////////////////////////////

export class LVGLStyles extends EezObject {
    styles: LVGLStyle[];
    defaultStyles: {
        [widgetType: string]: string;
    };

    constructor() {
        super();

        makeObservable(this, {
            styles: observable,
            defaultStyles: observable,
            lvglRuntime: computed({ keepAlive: true })
        });
    }

    static classInfo: ClassInfo = {
        label: () => "Styles",
        properties: [
            {
                name: "styles",
                type: PropertyType.Array,
                typeClass: LVGLStyle,
                enumerable: false
            },
            {
                name: "defaultStyles",
                type: PropertyType.Any
            }
        ],
        beforeLoadHook: (object: LVGLStyles, jsObject: Partial<LVGLStyles>) => {
            if (jsObject.defaultStyles == undefined) {
                jsObject.defaultStyles = {};
            }
        },
        defaultValue: {
            styles: [],
            defaultStyles: {}
        },
        icon: "material:format_color_fill"
    };

    get lvglRuntime() {
        return new LVGLStylesEditorRuntime(ProjectEditor.getProject(this));
    }
}

registerClass("LVGLStyles", LVGLStyles);

export const LVGLStylesNavigation = observer(
    class LVGLStylesNavigation extends React.Component {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        render() {
            return (
                <ListNavigation
                    id={"lvgl-styles"}
                    navigationObject={this.context.project.lvglStyles.styles}
                    selectedObject={
                        this.context.navigationStore.selectedStyleObject
                    }
                />
            );
        }
    }
);

export const LVGLSelectedStyleEditor = observer(
    class LVGLSelectedStyleEditor extends EditorComponent {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        canvasRef = React.createRef<HTMLCanvasElement>();

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                selectedStyle: computed
            });
        }

        get runtime() {
            return this.context.project.lvglStyles.lvglRuntime;
        }

        get selectedStyle() {
            const navigationStore = this.context.navigationStore;

            if (navigationStore.selectedPanel) {
                if (
                    navigationStore.selectedPanel.selectedObject instanceof
                    LVGLStyle
                ) {
                    return navigationStore.selectedPanel.selectedObject;
                }
            }

            return navigationStore.selectedStyleObject.get() as LVGLStyle;
        }

        componentDidMount() {
            this.runtime.setSelectedStyle(
                this.selectedStyle,
                this.canvasRef.current
            );
        }

        componentDidUpdate() {
            this.runtime.setSelectedStyle(
                this.selectedStyle,
                this.canvasRef.current
            );
        }

        componentWillUnmount() {
            this.runtime.setSelectedStyle(undefined, null);
        }

        render() {
            this.selectedStyle;
            return (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        alignContent: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%"
                    }}
                >
                    <canvas
                        ref={this.canvasRef}
                        width={this.runtime.displayWidth}
                        height={this.runtime.displayHeight}
                        style={{
                            imageRendering: "pixelated"
                        }}
                    ></canvas>
                </div>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

export function findLvglStyle(project: Project, styleName: string | undefined) {
    if (styleName == undefined) {
        return undefined;
    }

    return project.lvglStyles.styles.find(
        lvglStyle => lvglStyle.name == styleName
    );
}

////////////////////////////////////////////////////////////////////////////////

const feature: ProjectEditorFeature = {
    name: "eezstudio-project-feature-lvgl-style",
    version: "0.1.0",
    description: "Styles support for your project",
    author: "EEZ",
    authorLogo: "../eez-studio-ui/_images/eez_logo.png",
    displayName: "Styles",
    mandatory: true,
    key: "lvglStyles",
    type: PropertyType.Object,
    typeClass: LVGLStyles,
    icon: "material:format_color_fill",
    create: () => {
        styles: [];
    }
};

export default feature;
