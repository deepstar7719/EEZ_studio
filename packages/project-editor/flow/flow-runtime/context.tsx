import { observable, action, computed } from "mobx";

import type { ITreeObjectAdapter } from "project-editor/core/objectAdapter";

import type {
    IDocument,
    IViewState,
    IFlowContext,
    IEditorOptions,
    IResizeHandler,
    IDataContext
} from "project-editor/flow/flow-interfaces";
import { Transform } from "project-editor/flow/flow-editor/transform";

import type { Component } from "project-editor/flow/component";
import type { FlowTabState } from "project-editor/flow/flow";
import { FlowDocument } from "project-editor/flow/flow-runtime/flow-document";
import type { FlowState } from "project-editor/flow/runtime";

////////////////////////////////////////////////////////////////////////////////

class ViewState implements IViewState {
    get transform() {
        return this.flowContext.tabState.transform;
    }

    set transform(transform: Transform) {
        this.flowContext.tabState.transform = transform;
    }

    @observable dxMouseDrag: number | undefined;
    @observable dyMouseDrag: number | undefined;

    constructor(public flowContext: RuntimeFlowContext) {}

    get document() {
        return this.flowContext.document;
    }

    get containerId() {
        return this.flowContext.containerId;
    }

    @action
    resetTransform() {
        this.flowContext.tabState.resetTransform();
    }

    getResizeHandlers(): IResizeHandler[] | undefined {
        return undefined;
    }

    get selectedObjects() {
        return this.document?.flow.selectedItems ?? [];
    }

    isObjectSelected(object: ITreeObjectAdapter): boolean {
        return this.selectedObjects.indexOf(object) !== -1;
    }

    isObjectIdSelected(id: string): boolean {
        return (
            this.selectedObjects
                .map(selectedObject => selectedObject.id)
                .indexOf(id) !== -1
        );
    }

    selectObject(object: ITreeObjectAdapter) {
        if (object.isSelectable) {
            this.document && this.document.flow.selectItem(object);
        }
    }

    @action
    selectObjects(objects: ITreeObjectAdapter[]) {
        this.document &&
            this.document.flow.selectItems(
                objects.filter(object => object.isSelectable)
            );
    }

    @action
    deselectAllObjects(): void {
        this.document && this.document.flow.selectItems([]);
    }

    moveSelection(
        where:
            | "left"
            | "up"
            | "right"
            | "down"
            | "home-x"
            | "end-x"
            | "home-y"
            | "end-y"
    ) {}
}

////////////////////////////////////////////////////////////////////////////////

export class RuntimeFlowContext implements IFlowContext {
    tabState: FlowTabState;
    document: IDocument;

    viewState: ViewState = new ViewState(this);
    editorOptions: IEditorOptions = {};
    _dataContext: IDataContext;

    _flowState: FlowState;

    get DocumentStore() {
        return this.document.DocumentStore;
    }

    get containerId() {
        return this.tabState.containerId;
    }

    get flow() {
        return this.tabState.flow;
    }

    @computed get flowState() {
        return this._flowState || this.tabState.flowState;
    }

    get dataContext() {
        return (
            this._dataContext ||
            this.flowState?.dataContext ||
            this.document.DocumentStore.dataContext
        );
    }

    get frontFace() {
        return this.tabState.frontFace;
    }

    overrideDataContext(dataContextOverridesObject: any): IFlowContext {
        if (!dataContextOverridesObject) {
            return this;
        }
        return Object.assign(new RuntimeFlowContext(), this, {
            _dataContext: this.dataContext.createWithDefaultValueOverrides(
                dataContextOverridesObject
            )
        });
    }

    overrideFlowState(component: Component): IFlowContext {
        return Object.assign(new RuntimeFlowContext(), this, {
            _flowState: this.flowState?.getFlowStateByComponent(component)
        });
    }

    set(tabState: FlowTabState) {
        this.tabState = tabState;
        this.document = new FlowDocument(tabState.widgetContainer, this);
        this.editorOptions = {};
    }
}
