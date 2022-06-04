import React from "react";
import {
    makeObservable,
    action,
    computed,
    observable,
    autorun,
    runInAction
} from "mobx";
import { observer } from "mobx-react";

import { Splitter } from "eez-studio-ui/splitter";

import { ProjectEditor } from "project-editor/project-editor-interface";

import { getId, getParent, IEezObject } from "project-editor/core/object";
import {
    TreeAdapter,
    ITreeAdapter,
    TreeObjectAdapter,
    TreeObjectAdapterChildren,
    ITreeRow
} from "project-editor/core/objectAdapter";

import type { PageTabState } from "project-editor/features/page/PageEditor";
import { createTransformer } from "mobx-utils";
import { Widget, TimelineKeyframe } from "project-editor/flow/component";
import { Draggable } from "eez-studio-ui/draggable";
import { closestBySelector } from "eez-studio-shared/dom";
import { getAncestorOfType, IPanel } from "project-editor/store";
import { ProjectContext } from "project-editor/project/context";
import {
    isRectInsideRect,
    Point,
    pointInRect,
    Rect
} from "eez-studio-shared/geometry";
import { addAlphaToColor } from "eez-studio-shared/color";
import { theme } from "eez-studio-ui/theme";
import { SvgLabel } from "eez-studio-ui/svg-label";

////////////////////////////////////////////////////////////////////////////////

const OUTLINE_LEVEL_MARGIN = 20;

const TIMELINE_X_OFFSET = 10;
const TIMELINE_HEIGHT = 40;
const ROW_HEIGHT = 20;
const POINT_RADIUS = 4;
const ROW_GAP = 3;
const NEEDLE_WIDTH = 4;

////////////////////////////////////////////////////////////////////////////////

export class PageTimelineEditorState {
    isEditorActive: boolean = false;
    position: number = 0;
    duration: number;
    scrollLeft: number;
    scrollTop: number;
    secondToPx: number = 200;
    selectedKeyframes: TimelineKeyframe[] = [];
    rubberBendRect: Rect | undefined;

    constructor(private tabState: PageTabState) {
        this.duration = 60.0;
        this.scrollLeft = 0;
        this.scrollTop = 0;

        makeObservable(this, {
            isEditorActive: observable,
            position: observable,
            duration: observable,
            scrollLeft: observable,
            scrollTop: observable,
            secondToPx: observable,
            selectedKeyframes: observable,
            rubberBendRect: observable,
            timelineHeight: computed,
            timelineWidth: computed
        });
    }

    loadState(state: Partial<PageTimelineEditorState>) {
        if (state.isEditorActive != undefined) {
            this.isEditorActive = state.isEditorActive;
        }

        if (state.position != undefined) {
            this.position = state.position;
        }

        if (state.secondToPx != undefined) {
            this.secondToPx = state.secondToPx;
        }
    }

    saveState() {
        return {
            isEditorActive: this.isEditorActive,
            position: this.position,
            secondToPx: this.secondToPx
        };
    }

    get treeAdapter(): ITreeAdapter {
        return new TreeAdapter(new PageTreeObjectAdapter(this.tabState));
    }

    static getTimelineWidth(duration: number, secondToPx: number) {
        return TIMELINE_X_OFFSET + duration * secondToPx + TIMELINE_X_OFFSET;
    }

    get timelineWidth() {
        return PageTimelineEditorState.getTimelineWidth(
            this.duration,
            this.secondToPx
        );
    }

    get timelineHeight() {
        return this.treeAdapter.allRows.length * ROW_HEIGHT;
    }

    get nextSecondToPx() {
        if (this.secondToPx < 2000) {
            return Math.round(this.secondToPx * 1.2);
        }
        return this.secondToPx;
    }

    get previousSecondToPx() {
        if (this.secondToPx > 50) {
            return Math.round(this.secondToPx / 1.2);
        }
        return this.secondToPx;
    }

    get positionPx() {
        return this.positionToPx(this.position);
    }

    positionToPx(position: number) {
        return TIMELINE_X_OFFSET + position * this.secondToPx;
    }

    getKeyframeCircleBoundingRect(
        rowIndex: number,
        keyframe: TimelineKeyframe
    ) {
        const cx = this.positionToPx(keyframe.end);
        const cy = TIMELINE_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

        const x1 = cx - POINT_RADIUS / 2;
        const y1 = cy - POINT_RADIUS / 2;
        const x2 = x1 + POINT_RADIUS;
        const y2 = y1 + POINT_RADIUS;

        return { cx, cy, x1, y1, x2, y2 };
    }

    getRowIndexFromY(y: number) {
        let rowIndex = (y - TIMELINE_HEIGHT) / ROW_HEIGHT;
        if (rowIndex >= 0) {
            rowIndex = Math.floor(rowIndex);
            if (rowIndex < this.treeAdapter.allRows.length) {
                return rowIndex;
            }
        }
        return -1;
    }

    getRowRect(rowIndex: number): Rect {
        return {
            left: TIMELINE_X_OFFSET,
            top: TIMELINE_HEIGHT + rowIndex * ROW_HEIGHT + ROW_GAP / 2,
            width: this.duration * this.secondToPx,
            height: ROW_HEIGHT - ROW_GAP
        };
    }

    getKeyframeRect(rowIndex: number, keyframe: TimelineKeyframe) {
        return {
            left: this.positionToPx(keyframe.start),
            top: TIMELINE_HEIGHT + rowIndex * ROW_HEIGHT + ROW_GAP / 2,
            width: (keyframe.end - keyframe.start) * this.secondToPx,
            height: ROW_HEIGHT - ROW_GAP
        };
    }

    getKeyframeStartPosition(rowIndex: number, keyframe: TimelineKeyframe) {
        return this.positionToPx(keyframe.start);
    }

    getKeyFrameEndPosition(rowIndex: number, keyframe: TimelineKeyframe) {
        return this.positionToPx(keyframe.end);
    }
}

class PageTreeObjectAdapter extends TreeObjectAdapter {
    constructor(private tabState: PageTabState) {
        super(
            tabState.page,
            createTransformer((object: IEezObject) => {
                return new TreeObjectAdapter(object, this.transformer, true);
            }),
            true
        );
    }

    get children(): TreeObjectAdapterChildren {
        return this.tabState.page.components
            .filter(component => component instanceof ProjectEditor.WidgetClass)
            .map(child => this.transformer(child));
    }
}

////////////////////////////////////////////////////////////////////////////////

export const PageTimelineEditor = observer(
    class PageTimelineEditor
        extends React.Component<{
            tabState: PageTabState;
        }>
        implements IPanel
    {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        verticalScrollBarRef = React.createRef<HTMLDivElement>();
        horizontalScrollBarRef = React.createRef<HTMLDivElement>();

        onVerticalScroll = action(() => {
            if (this.verticalScrollBarRef.current) {
                this.props.tabState.timeline.scrollTop =
                    this.verticalScrollBarRef.current.scrollTop;
            }
        });

        onHorizontalScroll = action(() => {
            if (this.horizontalScrollBarRef.current) {
                this.props.tabState.timeline.scrollLeft =
                    this.horizontalScrollBarRef.current.scrollLeft;
            }
        });

        updateHorizontalScoll = () => {
            if (this.horizontalScrollBarRef.current) {
                this.horizontalScrollBarRef.current.scrollLeft =
                    this.props.tabState.timeline.scrollLeft;
            }
        };

        // interface IPanel implementation
        get selectedObject() {
            return this.selectedObjects.length > 0
                ? this.selectedObjects[0]
                : undefined;
        }
        get selectedObjects() {
            return this.props.tabState.timeline.selectedKeyframes.map(
                keyframe =>
                    getAncestorOfType(
                        keyframe,
                        ProjectEditor.WidgetClass.classInfo
                    )!
            );
        }
        cutSelection() {}
        copySelection() {}
        pasteSelection() {}
        deleteSelection() {
            if (this.props.tabState.timeline.selectedKeyframes.length > 0) {
                this.context.deleteObjects(
                    this.props.tabState.timeline.selectedKeyframes
                );
                runInAction(() => {
                    this.props.tabState.timeline.selectedKeyframes = [];
                });
            }
        }
        onFocus = () => {
            const navigationStore = this.context.navigationStore;
            navigationStore.setSelectedPanel(this);
        };

        render() {
            return (
                <Splitter
                    type="horizontal"
                    sizes="25%|75%"
                    persistId="project-editor/page/timeline-splitter"
                    className="EezStudio_PageTimelineSplitter"
                    splitterSize={5}
                    onFocus={this.onFocus}
                    tabIndex={0}
                >
                    <Outline timelineState={this.props.tabState.timeline} />
                    <>
                        <TimelineEditor
                            timelineState={this.props.tabState.timeline}
                            updateHorizontalScoll={this.updateHorizontalScoll}
                        />
                        <div
                            ref={this.verticalScrollBarRef}
                            className="EezStudio_PageTimeline_ScrollBar EezStudio_PageTimeline_VerticalScrollBar"
                            onScroll={this.onVerticalScroll}
                        >
                            <div
                                style={{
                                    height: this.props.tabState.timeline
                                        .timelineHeight
                                }}
                            ></div>
                        </div>
                        <div
                            ref={this.horizontalScrollBarRef}
                            className="EezStudio_PageTimeline_ScrollBar EezStudio_PageTimeline_HorizontalScrollBar"
                            onScroll={this.onHorizontalScroll}
                        >
                            <div
                                style={{
                                    width: this.props.tabState.timeline
                                        .timelineWidth
                                }}
                            ></div>
                        </div>
                    </>
                </Splitter>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

const Outline = observer(
    class Outline extends React.Component<{
        timelineState: PageTimelineEditorState;
    }> {
        divRef = React.createRef<HTMLDivElement>();
        dispose: any;

        componentDidMount() {
            this.dispose = autorun(() => {
                const scrollTop = this.props.timelineState.scrollTop;
                if (this.divRef.current) {
                    this.divRef.current.scrollTop = scrollTop;
                }
            });
        }

        componentWillUnmount() {
            this.dispose();
        }

        render() {
            const { timelineState } = this.props;
            return (
                <div
                    ref={this.divRef}
                    className="EezStudio_PageTimeline_Outline"
                >
                    <div>
                        {timelineState.treeAdapter.allRows.map(row => (
                            <div
                                key={timelineState.treeAdapter.getItemId(
                                    row.item
                                )}
                                className="EezStudio_PageTimeline_Outline_Item"
                                style={{
                                    paddingLeft:
                                        row.level * OUTLINE_LEVEL_MARGIN
                                }}
                            >
                                {timelineState.treeAdapter.itemToString(
                                    row.item
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

type DragSettings =
    | {
          mode: "none";
          cursor: string;
      }
    | {
          mode: "timeline-position";
          cursor: string;
          startPoint: Point;
      }
    | {
          mode: "rubber-band";
          cursor: string;
          startPoint: Point;
      }
    | {
          mode: "keyframe";
          cursor: string;
          keyframe: TimelineKeyframe;
          ends: number[];
      }
    | {
          mode: "keyframe-start";
          cursor: string;
      }
    | {
          mode: "keyframe-end";
          cursor: string;
      };

const TimelineEditor = observer(
    class TimelineEditor extends React.Component<{
        timelineState: PageTimelineEditorState;
        updateHorizontalScoll: () => void;
    }> {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        svgRef = React.createRef<SVGSVGElement>();
        draggable = new Draggable(this);

        dragSettings: DragSettings = {
            mode: "none",
            cursor: "default"
        };

        deltaY = 0;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                ticks: computed,
                subticks: computed
            });
        }

        componentDidMount() {
            this.draggable.attach(this.svgRef.current);

            this.svgRef.current!.addEventListener(
                "wheel",
                this.onDraggableWheel,
                {
                    passive: false
                }
            );
        }

        componentWillUnmount() {
            this.draggable.attach(null);

            this.svgRef.current!.removeEventListener(
                "wheel",
                this.onDraggableWheel
            );
        }

        snapToTicks(position: number) {
            // snap to subticks
            let minDiff = this.props.timelineState.duration;
            let snapPosition = position;
            for (let subtick of this.subticks) {
                const diff = Math.abs(subtick - position);
                if (diff < minDiff) {
                    minDiff = diff;
                    snapPosition = subtick;
                }
            }

            return snapPosition;
        }

        setTimelinePosition(x: number) {
            let position =
                (this.props.timelineState.scrollLeft + x - TIMELINE_X_OFFSET) /
                this.props.timelineState.secondToPx;
            if (position < 0) {
                position = 0;
            }
            if (position > this.props.timelineState.duration) {
                position = this.props.timelineState.duration;
            }

            let snapPosition = this.snapToTicks(position);

            runInAction(() => {
                this.props.timelineState.position = snapPosition;
            });
        }

        onDragStart = (e: PointerEvent, x1: number, y1: number) => {
            const dragSettings = hitTest(this.props.timelineState, e, x1, y1);

            if (dragSettings.mode == "timeline-position") {
                runInAction(() => {
                    this.props.timelineState.selectedKeyframes = [];
                });

                this.setTimelinePosition(dragSettings.startPoint.x);
            } else {
                if (dragSettings.mode == "keyframe") {
                    runInAction(() => {
                        if (e.ctrlKey || e.shiftKey) {
                            const i =
                                this.props.timelineState.selectedKeyframes.indexOf(
                                    dragSettings.keyframe
                                );
                            if (i == -1) {
                                this.props.timelineState.selectedKeyframes.push(
                                    dragSettings.keyframe
                                );

                                this.props.timelineState.position =
                                    dragSettings.keyframe.end;
                            } else {
                                this.props.timelineState.selectedKeyframes.splice(
                                    i,
                                    1
                                );
                                if (
                                    this.props.timelineState.selectedKeyframes
                                        .length > 0
                                ) {
                                    this.props.timelineState.position =
                                        this.props.timelineState.selectedKeyframes[
                                            this.props.timelineState
                                                .selectedKeyframes.length - 1
                                        ].end;
                                }
                            }
                        } else {
                            if (
                                this.props.timelineState.selectedKeyframes.indexOf(
                                    dragSettings.keyframe
                                ) == -1
                            ) {
                                this.props.timelineState.selectedKeyframes = [
                                    dragSettings.keyframe
                                ];

                                this.props.timelineState.position =
                                    dragSettings.keyframe.end;
                            }
                        }
                    });

                    dragSettings.ends =
                        this.props.timelineState.selectedKeyframes.map(
                            keyframe => keyframe.end
                        );
                } else if (dragSettings.mode == "rubber-band") {
                    runInAction(() => {
                        this.props.timelineState.selectedKeyframes = [];
                        this.props.timelineState.rubberBendRect = {
                            left: dragSettings.startPoint.x,
                            top: dragSettings.startPoint.y,
                            width: 0,
                            height: 0
                        };
                    });
                }
            }

            this.dragSettings = dragSettings;

            if (this.svgRef.current) {
                if (dragSettings.cursor == "grab") {
                    this.svgRef.current.style.cursor = "grabbing";
                }
            }
        };

        onDragMove = (e: PointerEvent, x: number, y: number, params: any) => {
            const dragSettings = this.dragSettings;

            if (dragSettings.mode == "timeline-position") {
                this.setTimelinePosition(x + dragSettings.startPoint.x);
            } else if (dragSettings.mode == "rubber-band") {
                runInAction(() => {
                    let left;
                    let width;
                    if (x > 0) {
                        left = dragSettings.startPoint.x;
                        width = x;
                    } else {
                        left = dragSettings.startPoint.x + x;
                        width = -x;
                    }

                    let top;
                    let height;
                    if (y > 0) {
                        top = dragSettings.startPoint.y;
                        height = y;
                    } else {
                        top = dragSettings.startPoint.y + y;
                        height = -y;
                    }

                    const rubberBendRect =
                        this.props.timelineState.rubberBendRect!;

                    rubberBendRect.left = left;
                    rubberBendRect.top = top;
                    rubberBendRect.width = width;
                    rubberBendRect.height = height;
                });
            } else if (dragSettings.mode == "keyframe") {
                const delta = x / this.props.timelineState.secondToPx;

                const newEnds = this.props.timelineState.selectedKeyframes.map(
                    (keyframe, selectedKeyframeIndex) => {
                        const end = dragSettings.ends[selectedKeyframeIndex];
                        const newEnd = this.snapToTicks(end + delta);
                        return newEnd;
                    }
                );

                const newStarts =
                    this.props.timelineState.selectedKeyframes.map(
                        (keyframe, selectedKeyframeIndex) => {
                            const newEnd = newEnds[selectedKeyframeIndex];
                            const duration = keyframe.end - keyframe.start;
                            return roundPosition(newEnd - duration);
                        }
                    );

                const invalid = this.props.timelineState.selectedKeyframes.find(
                    (keyframe, selectedKeyframeIndex) => {
                        let endPosition = newEnds[selectedKeyframeIndex];
                        let startPosition = newStarts[selectedKeyframeIndex];

                        const widgetTimeline = getParent(
                            keyframe
                        ) as TimelineKeyframe[];

                        const keyframeIndex = widgetTimeline.indexOf(keyframe);

                        if (keyframeIndex == 0) {
                            if (startPosition < 0) {
                                return true;
                            }
                        } else {
                            const previousKeyframe =
                                widgetTimeline[keyframeIndex - 1];

                            const index =
                                this.props.timelineState.selectedKeyframes.indexOf(
                                    previousKeyframe
                                );
                            if (index != -1) {
                                if (startPosition < newEnds[index]) {
                                    return true;
                                }
                            } else {
                                if (startPosition < previousKeyframe.end) {
                                    return true;
                                }
                            }
                        }

                        if (keyframeIndex == widgetTimeline.length - 1) {
                            if (
                                endPosition > this.props.timelineState.duration
                            ) {
                                return true;
                            }
                        } else {
                            const nextKeyframe =
                                widgetTimeline[keyframeIndex + 1];

                            const index =
                                this.props.timelineState.selectedKeyframes.indexOf(
                                    nextKeyframe
                                );
                            if (index != -1) {
                                if (endPosition > newStarts[index]) {
                                    return true;
                                }
                            } else {
                                if (endPosition > nextKeyframe.start) {
                                    return true;
                                }
                            }
                        }

                        return false;
                    }
                );

                if (!invalid) {
                    if (!this.context.undoManager.combineCommands) {
                        this.context.undoManager.setCombineCommands(true);
                    }

                    this.props.timelineState.selectedKeyframes.forEach(
                        (keyframe, selectedKeyframeIndex) => {
                            this.context.updateObject(keyframe, {
                                start: newStarts[selectedKeyframeIndex],
                                end: newEnds[selectedKeyframeIndex]
                            });

                            if (keyframe == dragSettings.keyframe) {
                                runInAction(() => {
                                    this.props.timelineState.position =
                                        newEnds[selectedKeyframeIndex];
                                });
                            }
                        }
                    );
                }
            }
        };

        onMove = (e: PointerEvent) => {
            const hitTestResult = hitTest(
                this.props.timelineState,
                e,
                e.clientX,
                e.clientY
            );

            if (this.svgRef.current) {
                this.svgRef.current.style.cursor = hitTestResult.cursor;
            }
        };

        onDragEnd = (
            e: PointerEvent | undefined,
            cancel: boolean,
            params: any
        ) => {
            const dragSettings = this.dragSettings;

            if (dragSettings.mode == "rubber-band") {
                const selectedKeyframes: TimelineKeyframe[] = [];

                const timelineState = this.props.timelineState;

                const rubberBendRect = timelineState.rubberBendRect!;

                timelineState.treeAdapter.allRows.forEach((row, rowIndex) => {
                    const widget = timelineState.treeAdapter.getItemObject(
                        row.item
                    ) as Widget;

                    widget.timeline.forEach(keyframe => {
                        const { x1, y1, x2, y2 } =
                            timelineState.getKeyframeCircleBoundingRect(
                                rowIndex,
                                keyframe
                            );

                        const keyframeRect: Rect = {
                            left: x1,
                            top: y1,
                            width: x2 - x1,
                            height: y2 - y1
                        };

                        if (isRectInsideRect(keyframeRect, rubberBendRect)) {
                            selectedKeyframes.push(keyframe);
                        }
                    });
                });

                runInAction(() => {
                    this.props.timelineState.selectedKeyframes =
                        selectedKeyframes;
                    this.props.timelineState.rubberBendRect = undefined;
                });
            }

            this.dragSettings = { mode: "none", cursor: "default" };

            if (this.context.undoManager.combineCommands) {
                this.context.undoManager.setCombineCommands(false);
            }
        };

        onDraggableWheel = (event: WheelEvent) => {
            if (event.buttons === 4) {
                // do nothing if mouse wheel is pressed, i.e. pan will be activated in onMouseDown
                return;
            }

            if (event.ctrlKey) {
                this.deltaY += event.deltaY;
                if (Math.abs(this.deltaY) > 10) {
                    let secondToPx: number;

                    if (this.deltaY < 0) {
                        secondToPx = this.props.timelineState.nextSecondToPx;
                    } else {
                        secondToPx =
                            this.props.timelineState.previousSecondToPx;
                    }

                    this.deltaY = 0;

                    const rect = this.svgRef.current!.getBoundingClientRect();

                    let scrollLeft =
                        this.props.timelineState.scrollLeft > 0
                            ? ((this.props.timelineState.scrollLeft +
                                  event.clientX -
                                  rect.x) *
                                  secondToPx) /
                                  this.props.timelineState.secondToPx -
                              (event.clientX - rect.x)
                            : 0;

                    scrollLeft = Math.max(scrollLeft, 0);

                    runInAction(() => {
                        this.props.timelineState.scrollLeft = scrollLeft;
                        this.props.timelineState.secondToPx = secondToPx;
                    });

                    this.props.updateHorizontalScoll();
                }
            }
        };

        genTicks(delta: number) {
            const ticks = [];
            for (
                let i = 0;
                i <= Math.floor(this.props.timelineState.duration / delta);
                i++
            ) {
                ticks.push(roundPosition(i * delta));
            }
            return ticks;
        }

        get ticks() {
            if (this.props.timelineState.secondToPx > 600) {
                return this.genTicks(0.1);
            }
            return this.genTicks(1);
        }

        get subticks() {
            if (this.props.timelineState.secondToPx > 600) {
                return this.genTicks(0.01);
            }
            return this.genTicks(0.1);
        }

        render() {
            const { timelineState } = this.props;

            return (
                <svg
                    ref={this.svgRef}
                    className="EezStudio_PageTimeline_Timeline"
                >
                    <Rows timelineState={timelineState} />

                    <Timeline
                        timelineState={timelineState}
                        ticks={this.ticks}
                        subticks={this.subticks}
                    />

                    {timelineState.rubberBendRect && (
                        <rect
                            className="EezStudio_PageTimeline_RubberBendRect"
                            x={timelineState.rubberBendRect.left}
                            y={timelineState.rubberBendRect.top}
                            width={timelineState.rubberBendRect.width}
                            height={timelineState.rubberBendRect.height}
                            fill={addAlphaToColor(
                                theme().selectionBackgroundColor,
                                0.5
                            )}
                            stroke={theme().selectionBackgroundColor}
                        />
                    )}
                </svg>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

const Timeline = observer(
    ({
        timelineState,
        ticks,
        subticks
    }: {
        timelineState: PageTimelineEditorState;
        ticks: number[];
        subticks: number[];
    }) => {
        return (
            <g
                transform={`translate(${-timelineState.scrollLeft}, 0)`}
                style={{ shapeRendering: "crispEdges" }}
            >
                <rect
                    className="EezStudio_PageTimeline_Timeline_Area"
                    x={0}
                    y={0}
                    width={
                        TIMELINE_X_OFFSET +
                        timelineState.duration * timelineState.secondToPx
                    }
                    height={TIMELINE_HEIGHT}
                />

                {subticks.map(x => (
                    <g key={x}>
                        <line
                            className="EezStudio_PageTimeline_Subtick"
                            x1={timelineState.positionToPx(x)}
                            y1={(3 * TIMELINE_HEIGHT) / 4}
                            x2={timelineState.positionToPx(x)}
                            y2={TIMELINE_HEIGHT}
                        />
                    </g>
                ))}

                {ticks.map(x => (
                    <g key={x}>
                        <line
                            className="EezStudio_PageTimeline_Tick"
                            x1={timelineState.positionToPx(x)}
                            y1={TIMELINE_HEIGHT / 2}
                            x2={timelineState.positionToPx(x)}
                            y2={TIMELINE_HEIGHT}
                        />
                        {Math.abs(x - timelineState.position) > 1e-4 && (
                            <text
                                className="EezStudio_PageTimeline_TickText"
                                x={timelineState.positionToPx(x)}
                                y={0}
                                textAnchor="middle"
                                alignmentBaseline="hanging"
                            >
                                {x}
                            </text>
                        )}
                    </g>
                ))}

                <rect
                    className="EezStudio_PageTimeline_Needle"
                    x={timelineState.positionPx - NEEDLE_WIDTH / 2}
                    y={0}
                    width={NEEDLE_WIDTH}
                    height={TIMELINE_HEIGHT / 2}
                />

                <line
                    className="EezStudio_PageTimeline_Needle"
                    x1={timelineState.positionPx}
                    y1={0}
                    x2={timelineState.positionPx}
                    y2={TIMELINE_HEIGHT}
                />

                <line
                    className="EezStudio_PageTimeline_Needle"
                    x1={timelineState.positionPx}
                    y1={TIMELINE_HEIGHT}
                    x2={timelineState.positionPx}
                    y2={
                        TIMELINE_HEIGHT +
                        timelineState.treeAdapter.allRows.length * ROW_HEIGHT
                    }
                />

                <SvgLabel
                    text={timelineState.position.toString()}
                    textClassName="EezStudio_PageTimeline_Needle"
                    rectClassName="EezStudio_PageTimeline_Needle_TextBackground"
                    x={timelineState.positionPx + 4}
                    y={-3}
                    horizontalAlignment="left"
                    verticalAlignment="top"
                    border={{
                        size: 0,
                        radius: 0
                    }}
                    padding={{
                        left: 4,
                        top: 0,
                        right: 4,
                        bottom: 0
                    }}
                />
            </g>
        );
    }
);

////////////////////////////////////////////////////////////////////////////////

const Rows = observer(
    ({ timelineState }: { timelineState: PageTimelineEditorState }) => {
        return (
            <g
                transform={`translate(${-timelineState.scrollLeft}, ${-timelineState.scrollTop})`}
            >
                {timelineState.treeAdapter.allRows.map((row, rowIndex) => (
                    <Row
                        key={rowIndex}
                        timelineState={timelineState}
                        row={row}
                        rowIndex={rowIndex}
                    />
                ))}

                {timelineState.treeAdapter.allRows.map((row, rowIndex) => {
                    const widget = timelineState.treeAdapter.getItemObject(
                        row.item
                    ) as Widget;

                    return (
                        <g key={timelineState.treeAdapter.getItemId(row.item)}>
                            {widget.timeline.map(keyframe => {
                                const { cx, cy, x1, y1, x2, y2 } =
                                    timelineState.getKeyframeCircleBoundingRect(
                                        rowIndex,
                                        keyframe
                                    );

                                return (
                                    <g key={getId(keyframe)}>
                                        <circle
                                            className="EezStudio_PageTimeline_Keyframe_Point"
                                            cx={cx}
                                            cy={cy}
                                            r={POINT_RADIUS}
                                        ></circle>

                                        {timelineState.selectedKeyframes.indexOf(
                                            keyframe
                                        ) != -1 &&
                                            keyframe.start == keyframe.end && (
                                                <rect
                                                    className="EezStudio_PageTimeline_Keyframe_Selection"
                                                    x={x1 - 2}
                                                    y={y1 - 2}
                                                    width={x2 - x1 + 4}
                                                    height={y2 - y1 + 4}
                                                ></rect>
                                            )}
                                    </g>
                                );
                            })}
                        </g>
                    );
                })}
            </g>
        );
    }
);

const Row = observer(
    ({
        timelineState,
        row,
        rowIndex
    }: {
        timelineState: PageTimelineEditorState;
        row: ITreeRow;
        rowIndex: number;
    }) => {
        const widget = timelineState.treeAdapter.getItemObject(
            row.item
        ) as Widget;

        const rowRect = timelineState.getRowRect(rowIndex);

        return (
            <g key={timelineState.treeAdapter.getItemId(row.item)}>
                <rect
                    className="EezStudio_PageTimeline_Row"
                    x={rowRect.left}
                    y={rowRect.top}
                    width={rowRect.width}
                    height={rowRect.height}
                    style={{ shapeRendering: "crispEdges" }}
                ></rect>

                {widget.timeline
                    .filter(keyframe => keyframe.start < keyframe.end)
                    .map(keyframe => (
                        <Keyframe
                            key={getId(keyframe)}
                            timelineState={timelineState}
                            rowIndex={rowIndex}
                            keyframe={keyframe}
                        />
                    ))}
            </g>
        );
    }
);

const Keyframe = observer(
    ({
        timelineState,
        rowIndex,
        keyframe
    }: {
        timelineState: PageTimelineEditorState;
        rowIndex: number;
        keyframe: TimelineKeyframe;
    }) => {
        const keyframeRect = timelineState.getKeyframeRect(rowIndex, keyframe);

        const x1 = keyframeRect.left;
        const x2 = keyframeRect.left + keyframeRect.width;
        const y1 = keyframeRect.top;
        const y2 = keyframeRect.top + keyframeRect.height;

        const KEYFRAME_MAX_OFFSET = 8;

        const offset = Math.min(x2 - x1, KEYFRAME_MAX_OFFSET);

        const path =
            `M${x1},${(y1 + y2) / 2} ` +
            `L${x1 + offset},${y1} ` +
            `L${x2},${y1} ` +
            `L${x2},${y2} ` +
            `L${x1 + offset},${y2} ` +
            `L${x1},${(y1 + y2) / 2}`;

        // const path =
        //     `M${x1},${y2} ` +
        //     `L${x2},${y1} ` +
        //     `L${x2},${y2} ` +
        //     `L${x1},${y2}`;

        return (
            <g>
                <path
                    className="EezStudio_PageTimeline_Keyframe"
                    d={path}
                ></path>
                {timelineState.selectedKeyframes.indexOf(keyframe) != -1 && (
                    <rect
                        className="EezStudio_PageTimeline_Keyframe_Selection"
                        x={x1 - 1}
                        y={y1 - 1}
                        width={x2 - x1 + 2}
                        height={y2 - y1 + 2}
                    ></rect>
                )}
            </g>
        );
    }
);

////////////////////////////////////////////////////////////////////////////////

function hitTest(
    timelineState: PageTimelineEditorState,
    e: PointerEvent,
    x: number,
    y: number
): DragSettings {
    const svg: SVGSVGElement = closestBySelector(e.target, "svg");
    if (!svg) {
        return {
            mode: "none",
            cursor: "default"
        };
    }

    const rectSvg = svg.getBoundingClientRect();

    x -= rectSvg.x;
    y -= rectSvg.y;

    const startPoint = {
        x,
        y
    };

    if (y < TIMELINE_HEIGHT) {
        x += timelineState.scrollLeft;

        return {
            mode: "timeline-position",
            startPoint,
            cursor:
                Math.abs(timelineState.positionPx - x) < 8
                    ? "ew-resize"
                    : "default"
        };
    }

    x += timelineState.scrollLeft;
    y += timelineState.scrollTop;

    const point = { x, y };

    let rowIndex = timelineState.getRowIndexFromY(y);

    if (rowIndex != -1) {
        const widget = timelineState.treeAdapter.getItemObject(
            timelineState.treeAdapter.allRows[rowIndex].item
        ) as Widget;

        for (
            let keyframeIndex = 0;
            keyframeIndex < widget.timeline.length;
            keyframeIndex++
        ) {
            const keyframe = widget.timeline[keyframeIndex];

            const rect1 = timelineState.getKeyframeRect(rowIndex, keyframe);

            const rect2 = timelineState.getKeyframeCircleBoundingRect(
                rowIndex,
                keyframe
            );

            if (
                pointInRect(point, rect1) ||
                pointInRect(point, {
                    left: rect2.x1,
                    top: rect2.y1,
                    width: rect2.x2 - rect2.x1,
                    height: rect2.y2 - rect2.y1
                })
            ) {
                return {
                    mode: "keyframe",
                    cursor: "grab",
                    keyframe,
                    ends: []
                };
            }
        }
    }

    return {
        mode: "rubber-band",
        cursor: "default",
        startPoint
    };
}

function roundPosition(position: number) {
    return Math.round(position * 1000) / 1000;
}
