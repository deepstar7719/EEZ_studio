import React from "react";
import { computed, makeObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react";

import { formatDateTimeLong } from "eez-studio-shared/util";

import {
    beginTransaction,
    commitTransaction,
    IStore
} from "eez-studio-shared/store";

import { Balloon } from "eez-studio-ui/balloon";
import { PropertyList, StaticRichTextProperty } from "eez-studio-ui/properties";
import { Toolbar } from "eez-studio-ui/toolbar";
import { IconAction } from "eez-studio-ui/action";
import { Icon } from "eez-studio-ui/icon";

import {
    IActivityLogEntry,
    logUpdate
} from "instrument/window/history/activity-log";

import {
    showAddNoteDialog,
    showEditNoteDialog
} from "instrument/window/note-dialog";

import type { IAppStore } from "instrument/window/history/history";
import { HistoryItem } from "instrument/window/history/item";

import { PreventDraggable } from "instrument/window/history/helper";
import { HistoryItemInstrumentInfo } from "../HistoryItemInstrumentInfo";
import { PLOTTER_ICON } from "project-editor/ui-components/icons";

import { HistoryItemPreview } from "instrument/window/history/item-preview";
import { getScrapbookStore } from "../scrapbook";

////////////////////////////////////////////////////////////////////////////////

interface IPlotlyHistoryItemMessage {
    data: any;
    layout: any;
    config: any;
    note: string;
}

////////////////////////////////////////////////////////////////////////////////
// Plotly based plotter

export const PlotterHistoryItemComponent = observer(
    class PlotterHistoryItemComponent extends React.Component<{
        appStore: IAppStore;
        historyItem: PlotlyHistoryItem;
        viewType: "chat" | "thumbs";
    }> {
        chartDivRef = React.createRef<HTMLDivElement>();
        plotlyInitialized = false;

        zoom: boolean = false;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                zoom: observable,
                data: computed,
                layout: computed
            });
        }

        toggleZoom = () => {
            runInAction(() => (this.zoom = !this.zoom));
        };

        onAddNote = () => {
            showAddNoteDialog(note => {
                beginTransaction("Add file note");
                this.props.historyItem.setNote(this.props.appStore, note);
                commitTransaction();
            });
        };

        onEditNote = () => {
            showEditNoteDialog(this.props.historyItem.note!, note => {
                if (this.props.historyItem.note !== note) {
                    beginTransaction("Edit file note");
                    this.props.historyItem.setNote(this.props.appStore, note);
                    commitTransaction();
                }
            });
        };

        onDeleteNote = () => {
            beginTransaction("Delete file note");
            this.props.historyItem.setNote(this.props.appStore, undefined);
            commitTransaction();
        };

        get data() {
            if (this.props.viewType != "thumbs") {
                return this.props.historyItem.plotlyMessage.data;
            }

            const data = this.props.historyItem.plotlyMessage.data.slice();

            for (let i = 0; i < data.length; i++) {
                if (data[i].showlegend == true) {
                    data[i] = Object.assign({}, data[i], { showlegend: false });
                }
            }

            return data;
        }

        get layout() {
            const layout = Object.assign(
                {},
                this.props.historyItem.plotlyMessage.layout
            );
            if (this.zoom) {
                layout.width = undefined;
                layout.height = undefined;
            } else {
                if (this.props.viewType == "thumbs") {
                    const theScrapbook = getScrapbookStore();
                    layout.width = theScrapbook.thumbnailSize;
                    layout.height = theScrapbook.thumbnailSize;
                } else {
                    layout.width = 900;
                    layout.height = 540;
                }
            }
            return layout;
        }

        updateChart() {
            if (this.chartDivRef.current) {
                if (!this.plotlyInitialized) {
                    const Plotly =
                        require("plotly.js-dist-min") as typeof import("plotly.js-dist-min");

                    this.plotlyInitialized = true;

                    Plotly.newPlot(
                        this.chartDivRef.current!,
                        this.data,
                        this.layout,
                        this.props.historyItem.plotlyMessage.config
                    );
                } else {
                    const Plotly =
                        require("plotly.js-dist-min") as typeof import("plotly.js-dist-min");

                    Plotly.react(
                        this.chartDivRef.current!,
                        this.data,
                        this.layout,
                        this.props.historyItem.plotlyMessage.config
                    );
                }
            } else {
                this.plotlyInitialized = false;
            }
        }

        componentDidMount() {
            this.updateChart();
        }

        componentDidUpdate() {
            this.updateChart();
        }

        componentWillUnmount() {}

        render() {
            this.layout;
            this.data;

            const actions = (
                <Toolbar>
                    {!this.props.historyItem.plotlyMessage.note && (
                        <IconAction
                            icon="material:comment"
                            title="Add note"
                            onClick={this.onAddNote}
                        />
                    )}
                </Toolbar>
            );

            let note;
            if (this.props.historyItem.note) {
                note = (
                    <div
                        className="EezStudio_HistoryItem_Note"
                        onDoubleClick={this.onEditNote}
                    >
                        <Balloon>
                            <PreventDraggable tag="div">
                                <PropertyList>
                                    <StaticRichTextProperty
                                        value={this.props.historyItem.note}
                                    />
                                </PropertyList>
                            </PreventDraggable>
                        </Balloon>
                        <Toolbar>
                            <IconAction
                                icon="material:edit"
                                title="Edit note"
                                onClick={this.onEditNote}
                            />
                            <IconAction
                                icon="material:delete"
                                title="Delete note"
                                onClick={this.onDeleteNote}
                            />
                        </Toolbar>
                    </div>
                );
            }

            return (
                <div className="EezStudio_PlotlyHistoryItem">
                    <Icon className="me-3" icon={PLOTTER_ICON} size={48} />
                    <div>
                        <p>
                            <HistoryItemInstrumentInfo
                                appStore={this.props.appStore}
                                historyItem={this.props.historyItem}
                            />
                            <small className="EezStudio_HistoryItemDate">
                                {formatDateTimeLong(
                                    this.props.historyItem.date
                                )}
                            </small>
                        </p>
                        {this.props.historyItem.getSourceDescriptionElement(
                            this.props.appStore
                        )}

                        <HistoryItemPreview
                            className="EezStudio_PlotlyPreview"
                            zoom={this.zoom}
                            toggleZoom={this.toggleZoom}
                            enableUnzoomWithEsc={true}
                        >
                            <div ref={this.chartDivRef}></div>
                        </HistoryItemPreview>

                        {actions}
                        {note}
                    </div>
                </div>
            );
        }
    }
);

export class PlotlyHistoryItem extends HistoryItem {
    constructor(public store: IStore, activityLogEntry: IActivityLogEntry) {
        super(store, activityLogEntry);

        makeObservable(this, {
            plotlyMessage: computed
        });
    }

    get plotlyMessage() {
        return JSON.parse(this.message) as IPlotlyHistoryItemMessage;
    }

    get note() {
        return this.plotlyMessage.note;
    }

    setNote(appStore: IAppStore, value: string | undefined) {
        let plotlyMessage = JSON.parse(this.message);

        plotlyMessage.note = value;

        logUpdate(
            this.store,
            {
                id: this.id,
                oid: appStore.history.oid,
                message: JSON.stringify(plotlyMessage)
            },
            {
                undoable: true
            }
        );
    }

    getListItemElement(
        appStore: IAppStore,
        viewType: "chat" | "thumbs"
    ): React.ReactNode {
        return (
            <PlotterHistoryItemComponent
                appStore={appStore}
                historyItem={this}
                viewType={viewType}
            />
        );
    }
}
