import { ipcRenderer } from "electron";
import React from "react";
import { computed, makeObservable, toJS } from "mobx";

import type * as TabulatorModule from "tabulator-tables";

import {
    registerClass,
    makeDerivedClassInfo,
    ProjectType
} from "project-editor/core/object";

import { Widget } from "project-editor/flow/component";
import { IFlowContext } from "project-editor/flow/flow-interfaces";
import { observer } from "mobx-react";

import classNames from "classnames";
import { TABULATOR_ICON } from "project-editor/ui-components/icons";
import { addScript } from "eez-studio-shared/dom";
import { evalProperty } from "project-editor/flow/helper";
import { IDashboardComponentContext } from "eez-studio-types";

////////////////////////////////////////////////////////////////////////////////

let _Tabulator: typeof TabulatorModule.TabulatorFull | undefined;
function getTabulator() {
    if (!_Tabulator) {
        addScript("../../node_modules/luxon/build/global/luxon.min.js");
        _Tabulator =
            require("tabulator-tables") as typeof TabulatorModule.TabulatorFull;
    }
    return _Tabulator;
}

////////////////////////////////////////////////////////////////////////////////

class TabulatorExecutionState {
    printWidget?: () => void;
}

////////////////////////////////////////////////////////////////////////////////

const TabulatorElement = observer(
    class TabulatorElement extends React.Component<{
        widget: TabulatorWidget;
        flowContext: IFlowContext;
        width: number;
        height: number;
    }> {
        ref = React.createRef<HTMLDivElement>();

        tabulator: TabulatorModule.Tabulator;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                options: computed
            });
        }

        get tableData() {
            const data = evalProperty(
                this.props.flowContext,
                this.props.widget,
                "data"
            );

            if (!data) {
                return [];
            }

            return toJS(data);
        }

        get options(): TabulatorModule.Options {
            return {
                data: this.tableData,
                layout: "fitColumns",
                autoColumns: true,
                printStyled: true,
                printAsHtml: true,
                printRowRange: "all"
                //printHeader: "<h1>Example Table Header<h1>",
                //printFooter: "<h2>Example Table Footer<h2>"
            };
        }

        get printHtml() {
            this.tabulator.modules.export.ge;

            const printDiv = document.createElement("div");
            printDiv.classList.add("tabulator-print-fullscreen");

            if (typeof this.tabulator.options.printHeader == "string") {
                const headerEl = document.createElement("div");
                headerEl.classList.add("tabulator-print-header");
                headerEl.innerHTML = this.tabulator.options.printHeader;
                printDiv.appendChild(headerEl);
            }

            const tableEl = this.tabulator.modules.export.generateTable(
                this.tabulator.options.printConfig,
                this.tabulator.options.printStyled,
                this.tabulator.options.printRowRange,
                "print"
            );
            printDiv.appendChild(tableEl);

            if (typeof this.tabulator.options.printFooter == "string") {
                const footerEl = document.createElement("div");
                footerEl.classList.add("tabulator-print-footer");
                footerEl.innerHTML = this.tabulator.options.printFooter;
                printDiv.appendChild(footerEl);
            }

            const div = document.createElement("div");
            div.appendChild(printDiv);
            return div.innerHTML;
        }

        async createTabulator(el: HTMLDivElement) {
            const Tabulator = getTabulator();
            this.tabulator = new Tabulator(el, this.options);

            const flowState = this.props.flowContext.flowState;
            if (flowState) {
                let executionState =
                    flowState.getComponentExecutionState<TabulatorExecutionState>(
                        this.props.widget
                    );

                if (executionState && !executionState.printWidget) {
                    executionState.printWidget = () => {
                        ipcRenderer.send("printPDF", this.printHtml);
                    };
                }
            }
        }

        componentDidMount() {
            if (this.ref.current) {
                this.createTabulator(this.ref.current);
            }
        }

        async componentDidUpdate() {
            if (this.ref.current) {
                this.createTabulator(this.ref.current);
            }
        }

        componentWillUnmount(): void {}

        render() {
            const { flowContext } = this.props;

            this.options;

            return (
                <div
                    ref={this.ref}
                    style={{
                        width: this.props.width,
                        height: this.props.height
                    }}
                    className={classNames("EezStudio_Tabulator", {
                        interactive: !!flowContext.projectStore.runtime
                    })}
                ></div>
            );
        }
    }
);

export class TabulatorWidget extends Widget {
    static classInfo = makeDerivedClassInfo(Widget.classInfo, {
        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.DASHBOARD,

        componentPaletteGroupName: "!1Visualiser",

        properties: [],

        defaultValue: {
            left: 0,
            top: 0,
            width: 320,
            height: 320
        },

        icon: TABULATOR_ICON,

        showTreeCollapseIcon: "never",

        execute: (context: IDashboardComponentContext) => {
            Widget.classInfo.execute!(context);

            let executionState =
                context.getComponentExecutionState<TabulatorExecutionState>();
            if (!executionState) {
                context.setComponentExecutionState(
                    new TabulatorExecutionState()
                );
            }
        }
    });

    override makeEditable() {
        super.makeEditable();

        makeObservable(this, {});
    }

    override render(
        flowContext: IFlowContext,
        width: number,
        height: number
    ): React.ReactNode {
        return (
            <>
                <TabulatorElement
                    widget={this}
                    flowContext={flowContext}
                    width={width}
                    height={height}
                />
                {super.render(flowContext, width, height)}
            </>
        );
    }
}

registerClass("TabulatorWidget", TabulatorWidget);
