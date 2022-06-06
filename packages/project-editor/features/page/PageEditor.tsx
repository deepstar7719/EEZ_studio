import React from "react";
import { computed, runInAction, observable, makeObservable } from "mobx";
import { observer } from "mobx-react";
import { IEezObject } from "project-editor/core/object";
import {
    ITreeObjectAdapter,
    TreeObjectAdapter,
    TreeObjectAdapterChildren
} from "project-editor/core/objectAdapter";
import { FlowEditor } from "project-editor/flow/editor/editor";
import { FlowViewer } from "project-editor/flow/runtime-viewer/viewer";
import { ProjectContext } from "project-editor/project/context";
import type { Page } from "project-editor/features/page/page";
import { Flow, FlowTabState } from "project-editor/flow/flow";
import { Transform } from "project-editor/flow/editor/transform";
import { ProjectEditor } from "project-editor/project-editor-interface";
import { EditorComponent } from "project-editor/project/EditorComponent";
import { Splitter } from "eez-studio-ui/splitter";
import { PageTimelineEditorState, PageTimelineEditor } from "./PageTimeline";

////////////////////////////////////////////////////////////////////////////////

export const PageEditor = observer(
    class PageEditor extends EditorComponent {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        get pageTabState() {
            return this.props.editor.state as PageTabState;
        }

        render() {
            return this.pageTabState.isRuntime ? (
                <FlowViewer tabState={this.pageTabState} />
            ) : this.pageTabState.timeline.isEditorActive ? (
                <Splitter
                    type="vertical"
                    sizes="65%|35%"
                    persistId="project-editor/page/page-timeline-splitter"
                    className="EezStudio_PageTimelineSplitter"
                    splitterSize={5}
                >
                    <FlowEditor tabState={this.pageTabState} />
                    <PageTimelineEditor tabState={this.pageTabState} />
                </Splitter>
            ) : (
                <FlowEditor tabState={this.pageTabState} />
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

class PageTreeObjectAdapter extends TreeObjectAdapter {
    constructor(private page: Page, private frontFace: boolean) {
        super(page);
    }

    get children(): TreeObjectAdapterChildren {
        if (this.frontFace) {
            return this.page.components
                .filter(
                    component => component instanceof ProjectEditor.WidgetClass
                )
                .map(child => this.transformer(child));
        }

        return [
            ...this.page.components.map(child => this.transformer(child)),
            ...this.page.connectionLines.map(child => this.transformer(child))
        ];
    }
}

////////////////////////////////////////////////////////////////////////////////

export class PageTabState extends FlowTabState {
    widgetContainerFrontFace: ITreeObjectAdapter;
    widgetContainerBackFace: ITreeObjectAdapter;

    _transform: Transform = new Transform({
        translate: { x: 0, y: 0 },
        scale: 1
    });

    timeline: PageTimelineEditorState;

    constructor(object: IEezObject) {
        super(object as Flow);

        makeObservable(this, {
            _transform: observable,
            frontFace: computed
        });

        this.widgetContainerFrontFace = new PageTreeObjectAdapter(
            this.page,
            true
        );

        this.widgetContainerBackFace = new PageTreeObjectAdapter(
            this.page,
            false
        );

        this.resetTransform(this.transform);

        this.timeline = new PageTimelineEditorState(this);

        this.loadState();
    }

    get page() {
        return this.flow as Page;
    }

    get frontFace() {
        return this.isRuntime
            ? this.DocumentStore.uiStateStore.pageRuntimeFrontFace
            : this.DocumentStore.uiStateStore.pageEditorFrontFace;
    }

    set frontFace(frontFace: boolean) {
        runInAction(() => {
            if (this.isRuntime) {
                this.DocumentStore.uiStateStore.pageRuntimeFrontFace =
                    frontFace;
            } else {
                this.DocumentStore.uiStateStore.pageEditorFrontFace = frontFace;
            }
        });
    }

    get widgetContainer() {
        if (this.frontFace) {
            return this.widgetContainerFrontFace;
        } else {
            return this.widgetContainerBackFace;
        }
    }

    get transform() {
        return this._transform;
    }

    set transform(transform: Transform) {
        runInAction(() => {
            this._transform = transform;
        });
    }

    loadState() {
        if (this.isRuntime) {
            return;
        }

        const state = this.DocumentStore.uiStateStore.getObjectUIState(
            this.flow,
            "flow-state"
        );

        if (!state) {
            return;
        }

        if (state.selection) {
            this.widgetContainer.loadState(state.selection);
        }

        if (state.transform && state.transform.translate) {
            this._transform = new Transform({
                translate: {
                    x: state.transform.translate.x ?? 0,
                    y: state.transform.translate.y ?? 0
                },
                scale: state.transform.scale ?? 1
            });
        }

        if (state.timeline) {
            this.timeline.loadState(state.timeline);
        }
    }

    saveState() {
        if (this.isRuntime) {
            return;
        }

        const state = {
            selection: this.widgetContainer.saveState(),
            transform: {
                translate: {
                    x: this._transform.translate.x,
                    y: this._transform.translate.y
                },
                scale: this._transform.scale
            },
            timeline: this.timeline.saveState()
        };

        this.DocumentStore.uiStateStore.updateObjectUIState(
            this.flow,
            "flow-state",
            state
        );

        return undefined;
    }
}
