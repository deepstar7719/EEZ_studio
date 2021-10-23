import React from "react";
import { observer } from "mobx-react";

import { formatDateTimeLong } from "eez-studio-shared/util";
import type { IActivityLogEntry } from "eez-studio-shared/activity-log";

import type { IAppStore } from "instrument/window/history/history";
import { HistoryItem } from "instrument/window/history/item";
import { PreventDraggable } from "instrument/window/history/helper";

////////////////////////////////////////////////////////////////////////////////

@observer
export class RequestHistoryItemComponent extends React.Component<
    {
        historyItem: HistoryItem;
    },
    {}
> {
    render() {
        return (
            <div className="EezStudio_RequestHistoryItem">
                <p>
                    <small className="EezStudio_HistoryItemDate">
                        {formatDateTimeLong(this.props.historyItem.date)}
                    </small>
                </p>
                {this.props.historyItem.sourceDescriptionElement}
                <PreventDraggable tag="pre">
                    {this.props.historyItem.message}
                </PreventDraggable>
            </div>
        );
    }
}

export class RequestHistoryItem extends HistoryItem {
    constructor(activityLogEntry: IActivityLogEntry, appStore: IAppStore) {
        super(activityLogEntry, appStore);
    }

    getListItemElement(appStore: IAppStore): React.ReactNode {
        return <RequestHistoryItemComponent historyItem={this} />;
    }
}
