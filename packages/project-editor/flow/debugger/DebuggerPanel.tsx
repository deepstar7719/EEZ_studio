import React from "react";
import { observer } from "mobx-react";
import { LogsPanel } from "project-editor/flow/debugger/LogsPanel";
import { ActiveFlowsPanel } from "project-editor/flow/debugger/ActiveFlowsPanel";
import { BreakpointsPanel } from "project-editor/flow/debugger/BreakpointsPanel";
import { WatchPanel } from "project-editor/flow/debugger/WatchPanel";
import { QueuePanel } from "project-editor/flow/debugger/QueuePanel";
import { Splitter } from "eez-studio-ui/splitter";
import { computed, observable } from "mobx";
import { RuntimeBase } from "project-editor/flow/runtime";

////////////////////////////////////////////////////////////////////////////////

interface CollapsedState {
    queuePanel: boolean;
    variablesPanel: boolean;
    breakpointsPanel: boolean;
    activeFlowsPanel: boolean;
    logsPanel: boolean;
}

@observer
export class DebuggerPanel extends React.Component<{ runtime: RuntimeBase }> {
    queuePanelCollapsed = observable.box(false);
    variablesPanelCollapsed = observable.box(false);
    breakpointsPanelCollapsed = observable.box(false);
    activeFlowsPanelCollapsed = observable.box(false);
    logsPanelCollapsed = observable.box(false);

    constructor(props: any) {
        super(props);

        const collapsedStateStr = localStorage.getItem(
            "project-editor/debugger-pannel/collapsed-state"
        );

        if (collapsedStateStr) {
            const collapsedState = JSON.parse(
                collapsedStateStr
            ) as CollapsedState;

            this.queuePanelCollapsed.set(collapsedState.queuePanel);
            this.variablesPanelCollapsed.set(collapsedState.variablesPanel);
            this.breakpointsPanelCollapsed.set(collapsedState.breakpointsPanel);
            this.activeFlowsPanelCollapsed.set(collapsedState.activeFlowsPanel);
            this.logsPanelCollapsed.set(collapsedState.logsPanel);
        }
    }

    componentWillUnmount() {
        const collapsedState: CollapsedState = {
            queuePanel: this.queuePanelCollapsed.get(),
            variablesPanel: this.variablesPanelCollapsed.get(),
            breakpointsPanel: this.breakpointsPanelCollapsed.get(),
            activeFlowsPanel: this.activeFlowsPanelCollapsed.get(),
            logsPanel: this.logsPanelCollapsed.get()
        };

        localStorage.setItem(
            "project-editor/debugger-pannel/collapsed-state",
            JSON.stringify(collapsedState)
        );
    }

    @computed get sizes() {
        let sizes = "";

        let expanded = false;

        if (this.queuePanelCollapsed.get()) {
            if (this.variablesPanelCollapsed.get()) {
                sizes += "38px!";
            } else {
                sizes += "37px!";
            }
        } else {
            expanded = true;
            sizes += "100px";
        }

        sizes += "|";

        if (this.variablesPanelCollapsed.get()) {
            if (!expanded || this.breakpointsPanelCollapsed.get()) {
                sizes += "38px!";
            } else {
                sizes += "37px!";
            }
        } else {
            expanded = true;
            sizes += "100px";
        }

        sizes += "|";

        if (this.breakpointsPanelCollapsed.get()) {
            if (!expanded || this.activeFlowsPanelCollapsed.get()) {
                sizes += "38px!";
            } else {
                sizes += "37px!";
            }
        } else {
            expanded = true;
            sizes += "100px";
        }

        sizes += "|";

        if (this.activeFlowsPanelCollapsed.get()) {
            if (!expanded || this.logsPanelCollapsed.get()) {
                sizes += "38px!";
            } else {
                sizes += "37px!";
            }
        } else {
            sizes += "100px";
        }

        sizes += "|";

        if (this.logsPanelCollapsed.get()) {
            sizes += "38px!";
        } else {
            sizes += "100px";
        }

        return sizes;
    }

    render() {
        return (
            <Splitter
                persistId={`project-editor/debugger-pannel/splitter`}
                className="EezStudio_DebuggerPanel"
                type="vertical"
                sizes={this.sizes}
                childrenOverflow="hidden|hidden|hidden|hidden|hidden"
            >
                <QueuePanel
                    runtime={this.props.runtime}
                    collapsed={this.queuePanelCollapsed}
                />
                <WatchPanel
                    runtime={this.props.runtime}
                    collapsed={this.variablesPanelCollapsed}
                />
                <BreakpointsPanel
                    runtime={this.props.runtime}
                    collapsed={this.breakpointsPanelCollapsed}
                />
                <ActiveFlowsPanel
                    runtime={this.props.runtime}
                    collapsed={this.activeFlowsPanelCollapsed}
                />
                <LogsPanel
                    runtime={this.props.runtime}
                    collapsed={this.logsPanelCollapsed}
                />
            </Splitter>
        );
    }
}
