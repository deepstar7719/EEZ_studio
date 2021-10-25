import React from "react";
import { computed, action } from "mobx";
import { observer } from "mobx-react";

import { formatDateTimeLong } from "eez-studio-shared/util";
import { IActivityLogEntry } from "eez-studio-shared/activity-log";

import { Toolbar } from "eez-studio-ui/toolbar";
import { IconAction } from "eez-studio-ui/action";
import { Icon } from "eez-studio-ui/icon";

import { checkMime, MIME_EEZ_LIST } from "instrument/connection/file-type";

import { ChartPreview } from "instrument/window/chart-preview";

import {
    createTableListFromData,
    createTableListFromHistoryItem
} from "instrument/window/lists/factory";
import { saveTableListData } from "instrument/window/lists/lists";

import type { IAppStore } from "instrument/window/history/history";
import { HistoryItem } from "instrument/window/history/item";
import { getTableListData } from "instrument/window/lists/table-data";

////////////////////////////////////////////////////////////////////////////////

@observer
export class ListHistoryItemComponent extends React.Component<
    {
        historyItem: ListHistoryItem;
        appStore: IAppStore;
    },
    {}
> {
    @computed
    get message() {
        return JSON.parse(this.props.historyItem.message);
    }

    @computed
    get list() {
        if (
            this.message.listData &&
            this.message.listData.length > 0 &&
            this.props.appStore.instrument
        ) {
            return createTableListFromData(
                Object.assign({}, this.message.listData[0])
            );
        }

        if (this.props.historyItem.data && this.props.appStore.instrument) {
            return createTableListFromHistoryItem(this.props.historyItem);
        }

        return null;
    }

    @computed
    get listId() {
        return this.props.appStore.findListIdByName(this.message.listName);
    }

    @action.bound
    onOpen() {
        if (this.listId) {
            this.props.appStore.navigationStore.changeSelectedListId(
                this.listId
            );
        }
    }

    onSave = () => {
        if (this.list) {
            const tableListData = getTableListData(
                this.list!,
                this.props.appStore.instrument
            );

            saveTableListData(
                this.props.appStore.instrument,
                this.message.listName,
                tableListData
            );
        }
    };

    render() {
        return (
            <div className="EezStudio_ListHistoryItem">
                <Icon className="me-3" icon={"material:timeline"} size={48} />
                <div>
                    <p>
                        <small className="EezStudio_HistoryItemDate">
                            {formatDateTimeLong(this.props.historyItem.date)}
                        </small>
                    </p>
                    {this.props.historyItem.getSourceDescriptionElement(
                        this.props.appStore
                    )}
                    <div>
                        {this.message.operation &&
                            (this.message.operation === "get"
                                ? `Instrument list saved as "${this.message.listName}"`
                                : `List "${this.message.listName}" sent to instrument`)}
                    </div>
                    {this.message.error && (
                        <div className="text-danger">{this.message.error}</div>
                    )}
                    {this.list && (
                        <ChartPreview
                            appStore={this.props.appStore}
                            data={this.list}
                        />
                    )}
                    {
                        <Toolbar>
                            {this.listId && (
                                <IconAction
                                    icon="material:edit"
                                    title="Open List in Editor"
                                    onClick={this.onOpen}
                                />
                            )}
                            {this.list && (
                                <IconAction
                                    icon="material:save"
                                    title="Save List"
                                    onClick={this.onSave}
                                />
                            )}
                        </Toolbar>
                    }
                </div>
            </div>
        );
    }

    isZoomable: false;
}

export class ListHistoryItem extends HistoryItem {
    getListItemElement(appStore: IAppStore): React.ReactNode {
        return (
            <ListHistoryItemComponent historyItem={this} appStore={appStore} />
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

export function isTableList(activityLogEntry: IActivityLogEntry) {
    return checkMime(activityLogEntry.message, [MIME_EEZ_LIST]);
}
