import React from "react";
import { computed, action, runInAction, observable } from "mobx";
import { observer } from "mobx-react";
import { bind } from "bind-decorator";

import { _range, _isEqual, _map } from "eez-studio-shared/algorithm";
import {
    BoundingRectBuilder,
    Point,
    Rect,
    rectContains
} from "eez-studio-shared/geometry";

import styled from "eez-studio-ui/styled-components";

import type {
    IDocument,
    IViewStatePersistantState,
    IFlowContext,
    IRunningFlow
} from "project-editor/flow/flow-interfaces";
import { ITransform } from "project-editor/flow/flow-editor/transform";
import { RuntimeFlowContext } from "project-editor/flow/flow-runtime/context";

import { IPanel, getDocumentStore } from "project-editor/core/store";
import type { ITreeObjectAdapter } from "project-editor/core/objectAdapter";

import { ConnectionLine, Flow } from "project-editor/flow/flow";
import { Svg } from "project-editor/flow/flow-editor/render";
import { ProjectContext } from "project-editor/project/context";
import { ConnectionLines } from "project-editor/flow/flow-editor/ConnectionLineComponent";
import { Selection } from "project-editor/flow/flow-runtime/selection";
import { getObjectBoundingRect } from "project-editor/flow/flow-editor/bounding-rects";

////////////////////////////////////////////////////////////////////////////////

class FlowDocument implements IDocument {
    constructor(
        public flow: ITreeObjectAdapter,
        private flowContext: RuntimeFlowContext
    ) {}

    @computed get connectionLines(): ITreeObjectAdapter[] {
        return (this.flow.children as ITreeObjectAdapter[]).filter(
            editorObject => editorObject.object instanceof ConnectionLine
        );
    }

    @computed get selectedConnectionLines() {
        return this.connectionLines.filter(connectionLine =>
            this.flowContext.viewState.isObjectIdSelected(connectionLine.id)
        );
    }

    @computed get nonSelectedConnectionLines() {
        return this.connectionLines.filter(
            connectionLine =>
                !this.flowContext.viewState.isObjectIdSelected(
                    connectionLine.id
                )
        );
    }

    findObjectById(id: string) {
        return this.flow.getObjectAdapter(id);
    }

    findObjectParent(object: ITreeObjectAdapter) {
        return this.flow.getParent(object);
    }

    objectFromPoint(point: Point) {
        return undefined;
    }

    resetTransform(transform: ITransform) {
        const flow = this.flow.object as Flow;
        transform.translate = {
            x: -flow.pageRect.width / 2,
            y: -flow.pageRect.height / 2
        };
        transform.scale = 1;
    }

    getObjectsInsideRect(rect: Rect) {
        return [];
    }

    createContextMenu(objects: ITreeObjectAdapter[]) {
        return undefined;
    }

    @computed get DocumentStore() {
        return getDocumentStore(this.flow.object);
    }

    onDragStart(): void {}

    onDragEnd(): void {}

    connectionExists(
        sourceObjectId: string,
        connectionOutput: string,
        targetObjectId: string,
        connectionInput: string
    ): boolean {
        return false;
    }

    connect(
        sourceObjectId: string,
        connectionOutput: string,
        targetObjectId: string,
        connectionInput: string
    ) {}
}

const AllConnectionLines = observer(
    ({ flowContext }: { flowContext: IFlowContext }) => {
        return (
            <Svg flowContext={flowContext}>
                <ConnectionLines
                    connectionLines={
                        flowContext.document.nonSelectedConnectionLines
                    }
                    context={flowContext}
                    selected={false}
                />
                <ConnectionLines
                    connectionLines={
                        flowContext.document.selectedConnectionLines
                    }
                    context={flowContext}
                    selected={true}
                />
            </Svg>
        );
    }
);

////////////////////////////////////////////////////////////////////////////////

@observer
export class Canvas extends React.Component<{
    flowContext: IFlowContext;
    pageRect?: Rect;
    transitionIsActive?: boolean;
}> {
    div: HTMLDivElement;
    resizeObserver: ResizeObserver;
    deltaY = 0;

    buttonsAtDown: number;
    lastMouseUpPosition: Point;
    lastMouseUpTime: number | undefined;

    constructor(props: any) {
        super(props);

        this.resizeObserver = new ResizeObserver(this.resizeObserverCallback);
    }

    resizeObserverCallback = () => {
        if ($(this.div).is(":visible") && !this.props.transitionIsActive) {
            const transform = this.props.flowContext.viewState.transform;

            let clientRect = this.div.getBoundingClientRect();
            if (
                clientRect.left !== transform.clientRect.left ||
                clientRect.top !== transform.clientRect.top ||
                (clientRect.width &&
                    clientRect.width !== transform.clientRect.width) ||
                (clientRect.height &&
                    clientRect.height !== transform.clientRect.height)
            ) {
                runInAction(() => {
                    transform.clientRect = clientRect;
                });
            }
        }
    };

    componentDidMount() {
        this.div.addEventListener("wheel", this.onWheel, {
            passive: false
        });

        if (this.div) {
            this.resizeObserver.observe(this.div);
        }
    }

    componentWillUnmount() {
        this.div.removeEventListener("wheel", this.onWheel);

        if (this.div) {
            this.resizeObserver.unobserve(this.div);
        }
    }

    @bind
    onWheel(event: WheelEvent) {
        if (event.buttons === 4) {
            // do nothing if mouse wheel is pressed, i.e. pan will be activated in onMouseDown
            return;
        }

        const transform = this.props.flowContext.viewState.transform.clone();

        if (event.ctrlKey) {
            this.deltaY += event.deltaY;
            if (Math.abs(this.deltaY) > 10) {
                let scale: number;
                if (this.deltaY < 0) {
                    scale = transform.nextScale;
                } else {
                    scale = transform.previousScale;
                }

                this.deltaY = 0;

                var point = transform.clientToOffsetPoint({
                    x: event.clientX,
                    y: event.clientY
                });
                let x = point.x - transform.clientRect.width / 2;
                let y = point.y - transform.clientRect.height / 2;
                let tx =
                    x - ((x - transform.translate.x) * scale) / transform.scale;
                let ty =
                    y - ((y - transform.translate.y) * scale) / transform.scale;

                transform.scale = scale;
                transform.translate = { x: tx, y: ty };

                runInAction(() => {
                    this.props.flowContext.viewState.transform = transform;
                });
            }
        } else {
            transform.translate = {
                x:
                    transform.translate.x -
                    (event.shiftKey ? event.deltaY : event.deltaX),
                y:
                    transform.translate.y -
                    (event.shiftKey ? event.deltaX : event.deltaY)
            };

            runInAction(() => {
                this.props.flowContext.viewState.transform = transform;
            });
        }

        event.preventDefault();
        event.stopPropagation();
    }

    render() {
        let style: React.CSSProperties = {};

        const transform = this.props.flowContext.viewState.transform;

        const xt = Math.round(
            transform.translate.x + transform.clientRect.width / 2
        );
        const yt = Math.round(
            transform.translate.y + transform.clientRect.height / 2
        );

        if (
            transform.clientRect.width <= 1 ||
            transform.clientRect.height <= 1
        ) {
            style.visibility = "hidden";
        }

        return (
            <div ref={(ref: any) => (this.div = ref!)} style={style}>
                <div
                    className="eez-canvas"
                    style={{
                        position: "absolute",
                        transform: `translate(${xt}px, ${yt}px) scale(${transform.scale})`,
                        transition: "transform 0.2s"
                    }}
                >
                    {this.props.children}
                </div>
                <Selection
                    context={this.props.flowContext}
                    mouseHandler={undefined}
                />
            </div>
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

interface FlowViewerCanvasContainerParams {
    projectCss: string;
}

const FlowViewerCanvasContainer = styled.div<FlowViewerCanvasContainerParams>`
    position: absolute;
    width: 100%;
    height: 100%;
    background-color: white;

    * {
        user-select: text;
    }

    & > * {
        user-select: none;
    }

    & > div {
        position: absolute;
        width: 100%;
        height: 100%;
        overflow: hidden;
    }

    &:focus {
        left: 2px;
        top: 2px;
        width: calc(100% - 4px);
        height: calc(100% - 4px);

        & > div {
            left: 1px;
            top: 1px;
            width: calc(100% - 2px);
            height: calc(100% - 2px);
        }
    }

    .connection-line-path {
        marker-start: url(#lineStart);
        marker-end: url(#lineEnd);

        stroke: ${props => props.theme.connectionLineColor};

        &.selected {
            stroke: ${props => props.theme.selectedConnectionLineColor};
            marker-start: url(#selectedLineStart);
            marker-end: url(#selectedLineEnd);
        }

        &.active {
            stroke: ${props => props.theme.activeConnectionLineColor};
            stroke-dasharray: 10;
            animation: dash 10s linear infinite;
            marker-start: url(#activeLineStart);
            marker-end: url(#activeLineEnd);
        }
    }

    @keyframes dash {
        from {
            stroke-dashoffset: 0;
        }
        to {
            stroke-dashoffset: -600;
        }
    }

    ${props => props.projectCss}
`;

@observer
export class FlowViewer
    extends React.Component<{
        widgetContainer: ITreeObjectAdapter;
        transitionIsActive?: boolean;
        frontFace: boolean;
        runningFlow: IRunningFlow | undefined;
    }>
    implements IPanel {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    divRef = React.createRef<HTMLDivElement>();

    @observable flowContext: RuntimeFlowContext = new RuntimeFlowContext();

    get runningFlow() {
        return (
            this.props.runningFlow ||
            this.context.RuntimeStore.getRunningFlow(
                this.props.widgetContainer.object as Flow
            )
        );
    }

    @action
    updateFlowDocument() {
        let document = this.flowContext.document;

        const documentChanged =
            !document || document.flow != this.props.widgetContainer;

        if (documentChanged) {
            document = new FlowDocument(
                this.props.widgetContainer,
                this.flowContext
            );
        }

        if (
            documentChanged ||
            this.flowContext.runningFlow != this.runningFlow
        ) {
            this.flowContext.set(
                document,
                this.viewStatePersistantState,
                this.onSavePersistantState,
                this.props.frontFace,
                this.runningFlow
            );
        }
    }

    componentDidMount() {
        this.updateFlowDocument();

        this.divRef.current?.addEventListener(
            "ensure-selection-visible",
            this.ensureSelectionVisible
        );
    }

    componentDidUpdate() {
        this.updateFlowDocument();
    }

    componentDidCatch(error: any, info: any) {
        console.error(error, info);
    }

    componentWillUnmount() {
        this.flowContext.destroy();

        this.divRef.current?.removeEventListener(
            "ensure-selection-visible",
            this.ensureSelectionVisible
        );
    }

    ensureSelectionVisible = () => {
        if (this.flowContext.viewState.selectedObjects.length > 0) {
            const selectedObjectRects = this.flowContext.viewState.selectedObjects.map(
                selectedObject => getObjectBoundingRect(selectedObject)
            );

            let selectionBoundingRectBuilder = new BoundingRectBuilder();
            for (let i = 0; i < selectedObjectRects.length; i++) {
                selectionBoundingRectBuilder.addRect(selectedObjectRects[i]);
            }
            const selectionBoundingRect = selectionBoundingRectBuilder.getRect();

            let pageRect = this.flowContext.viewState.transform.clientToPageRect(
                this.flowContext.viewState.transform.clientRect
            );

            if (!rectContains(pageRect, selectionBoundingRect)) {
                this.flowContext.viewState.transform.translate = {
                    x: -(
                        selectionBoundingRect.left +
                        selectionBoundingRect.width / 2
                    ),
                    y: -(
                        selectionBoundingRect.top +
                        selectionBoundingRect.height / 2
                    )
                };
                //const firstSelectedObjectRect = selectedObjectRects[0];
            }
        }
    };

    @computed
    get selectedObject() {
        return this.props.widgetContainer.selectedObjects[0];
    }

    @computed
    get selectedObjects() {
        return this.props.widgetContainer.selectedObjects;
    }

    cutSelection() {}

    copySelection() {}

    pasteSelection() {}

    deleteSelection() {}

    @bind
    focusHander() {
        this.context.NavigationStore.setSelectedPanel(this);
    }

    savedViewState: IViewStatePersistantState | undefined;

    @computed
    get viewStatePersistantState(): IViewStatePersistantState {
        const uiState = this.context.UIStateStore.getObjectUIState(
            this.props.widgetContainer.object,
            this.props.frontFace ? "front" : "back"
        );

        let transform: ITransform | undefined;
        if (uiState && uiState.flowEditorCanvasViewState) {
            transform = uiState.flowEditorCanvasViewState.transform;
        }

        let viewState: IViewStatePersistantState = {
            transform
        };

        if (!this.savedViewState) {
            // selection changed in Tree => change selection in Editor
            return viewState;
        }

        // return existing viewState from editor
        viewState = this.savedViewState;
        this.savedViewState = undefined;
        return viewState;
    }

    @bind
    onSavePersistantState(viewState: IViewStatePersistantState) {
        if (!this.flowContext.dragComponent) {
            this.savedViewState = viewState;

            const uiState = this.context.UIStateStore.getObjectUIState(
                this.props.widgetContainer.object,
                this.props.frontFace ? "front" : "back"
            );
            if (
                !uiState ||
                !uiState.flowEditorCanvasViewState ||
                !_isEqual(
                    uiState.flowEditorCanvasViewState.transform,
                    viewState.transform
                )
            ) {
                this.context.UIStateStore.updateObjectUIState(
                    this.props.widgetContainer.object,
                    this.props.frontFace ? "front" : "back",
                    {
                        flowEditorCanvasViewState: {
                            transform: viewState.transform
                        }
                    }
                );
            }
        }
    }

    getDragComponent(event: React.DragEvent) {
        return undefined;
    }

    @bind
    onDoubleClick() {
        this.flowContext.viewState.resetTransform();
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true };
    }

    render() {
        const flow = this.props.widgetContainer.object as Flow;

        return (
            <FlowViewerCanvasContainer
                ref={this.divRef}
                id={this.flowContext.viewState.containerId}
                tabIndex={0}
                onFocus={this.focusHander}
                onDoubleClick={this.onDoubleClick}
                projectCss={this.context.project.settings.general.css}
            >
                <Canvas
                    flowContext={this.flowContext}
                    transitionIsActive={this.props.transitionIsActive}
                >
                    {this.flowContext.document?.flow.object === flow &&
                        this.runningFlow && (
                            <>
                                <div
                                    style={{
                                        position: "absolute"
                                    }}
                                >
                                    {flow.renderComponents(this.flowContext)}
                                </div>
                                {!this.props.frontFace && (
                                    <AllConnectionLines
                                        flowContext={this.flowContext}
                                    />
                                )}
                            </>
                        )}
                </Canvas>
            </FlowViewerCanvasContainer>
        );
    }
}
