import React from "react";
import {
    observable,
    computed,
    runInAction,
    action,
    toJS,
    when,
    reaction
} from "mobx";
import { observer } from "mobx-react";

import { objectEqual } from "eez-studio-shared/util";
import { beginTransaction, commitTransaction } from "eez-studio-shared/store";
import {
    logUpdate,
    IActivityLogEntry,
    activityLogStore
} from "eez-studio-shared/activity-log";
import { UNITS, TIME_UNIT } from "eez-studio-shared/units";
import { scheduleTask, Priority } from "eez-studio-shared/scheduler";
import { Point } from "eez-studio-shared/geometry";
import type * as I10nModule from "eez-studio-shared/i10n";

import { Dialog, showDialog } from "eez-studio-ui/dialog";
import { PropertyList } from "eez-studio-ui/properties";
import {
    ChartController,
    ChartMode,
    IAxisModel,
    LineController,
    ChartsController,
    IChartsController,
    MeasurementsModel,
    getNearestValuePoint,
    IAxisController,
    IMeasurementsModel
} from "eez-studio-ui/chart/chart";
import { RulersModel, IRulersModel } from "eez-studio-ui/chart/rulers";

import { WaveformLineView } from "eez-studio-ui/chart/WaveformLineView";
import { WaveformFormat } from "eez-studio-ui/chart/WaveformFormat";
import { initValuesAccesor } from "eez-studio-ui/chart/value-accesor";
import * as notification from "eez-studio-ui/notification";

import { checkMime } from "instrument/connection/file-type";

import { ChartPreview } from "instrument/window/chart-preview";

import { FileHistoryItem } from "instrument/window/history/items/file";

import { WaveformTimeAxisModel } from "instrument/window/waveform/time-axis";
import { WaveformToolbar } from "instrument/window/waveform/toolbar";
import type { ChartsDisplayOption } from "instrument/window/lists/common-tools";
import { ViewOptions } from "instrument/window/waveform/ViewOptions";
import { WaveformAxisModel } from "instrument/window/waveform/WaveformAxisModel";
import { WaveformDefinitionProperties } from "instrument/window/waveform/WaveformDefinitionProperties";
import type { IAppStore } from "instrument/window/history/history";

////////////////////////////////////////////////////////////////////////////////

export interface IWaveformDefinition {
    samplingRate: number;
    format: WaveformFormat;
    unitName: keyof typeof UNITS;
    color?: string;
    colorInverse?: string;
    label?: string;
    offset: number;
    scale: number;
    cachedMinValue: number;
    cachedMaxValue: number;
}

export interface IWaveformHistoryItemMessage {
    waveformDefinition: IWaveformDefinition;
    viewOptions: ViewOptions;
    rulers: RulersModel;
    measurements: RulersModel;
    horizontalScale?: number;
    verticalScale?: number;
}

////////////////////////////////////////////////////////////////////////////////

export function isWaveform(activityLogEntry: IActivityLogEntry) {
    return (
        (activityLogEntry as any).waveformDefinition ||
        checkMime(activityLogEntry.message, [
            "application/eez-binary-list",
            "application/eez-raw",
            "text/csv"
        ])
    );
}

////////////////////////////////////////////////////////////////////////////////

export class WaveformChartsController extends ChartsController {
    constructor(
        public waveform: Waveform,
        mode: ChartMode,
        xAxisModel: IAxisModel
    ) {
        super(mode, xAxisModel, waveform.viewOptions);
    }

    get chartViewOptionsProps() {
        return {
            showRenderAlgorithm: true,
            showShowSampledDataOption: false
        };
    }

    get supportRulers() {
        return true;
    }
}

////////////////////////////////////////////////////////////////////////////////

export class Waveform extends FileHistoryItem {
    canBePartOfMultiChart = true;

    constructor(activityLogEntry: IActivityLogEntry | FileHistoryItem) {
        super(activityLogEntry);

        const message = JSON.parse(this.message);

        this.viewOptions = new ViewOptions(message.viewOptions);

        this.xAxisModel.dynamic.zoomMode = this.xAxisModel.fixed.zoomMode =
            this.viewOptions.axesLines.defaultZoomMode || "default";

        this.rulers = new RulersModel(message.rulers);
        this.rulers.initYRulers(1);

        this.measurements = new MeasurementsModel(message.measurements);

        when(
            () => this.transferSucceeded,
            () => {
                scheduleTask(
                    `Load waveform ${this.id}`,
                    Priority.Lowest,
                    async () => this.initWaveformDefinition()
                );
            }
        );

        // save waveformDefinition when changed
        reaction(
            () => toJS(this.waveformDefinition),
            waveformDefinition => {
                const message = JSON.parse(this.message);
                if (
                    !objectEqual(message.waveformDefinition, waveformDefinition)
                ) {
                    logUpdate(
                        activityLogStore,
                        {
                            id: this.id,
                            oid: this.oid,
                            message: JSON.stringify(
                                Object.assign(message, {
                                    waveformDefinition
                                })
                            )
                        },
                        {
                            undoable: false
                        }
                    );
                }
            }
        );

        // save viewOptions when changed
        reaction(
            () => toJS(this.viewOptions),
            viewOptions => {
                const message = JSON.parse(this.message);
                if (!objectEqual(message.viewOptions, viewOptions)) {
                    logUpdate(
                        activityLogStore,
                        {
                            id: this.id,
                            oid: this.oid,
                            message: JSON.stringify(
                                Object.assign(message, {
                                    viewOptions
                                })
                            )
                        },
                        {
                            undoable: false
                        }
                    );
                }
            }
        );

        // save rulers when changed
        reaction(
            () => toJS(this.rulers),
            rulers => {
                if (rulers.pauseDbUpdate) {
                    return;
                }
                delete rulers.pauseDbUpdate;

                const message = JSON.parse(this.message);
                if (!objectEqual(message.rulers, rulers)) {
                    logUpdate(
                        activityLogStore,
                        {
                            id: this.id,
                            oid: this.oid,
                            message: JSON.stringify(
                                Object.assign(message, {
                                    rulers
                                })
                            )
                        },
                        {
                            undoable: false
                        }
                    );
                }
            }
        );

        // save measurements when changed
        reaction(
            () => toJS(this.measurements),
            measurements => {
                const message = JSON.parse(this.message);
                if (!objectEqual(message.measurements, measurements)) {
                    const messageStr = JSON.stringify(
                        Object.assign(message, {
                            measurements
                        })
                    );
                    runInAction(() => (this.message = messageStr));
                    logUpdate(
                        activityLogStore,
                        {
                            id: this.id,
                            oid: this.oid,
                            message: messageStr
                        },
                        {
                            undoable: false
                        }
                    );
                }
            }
        );

        //
        reaction(
            () => JSON.parse(this.message),
            message => {
                const waveformDefinition = toJS(this.waveformDefinition);
                if (
                    !objectEqual(message.waveformDefinition, waveformDefinition)
                ) {
                    this.initWaveformDefinition();
                }
            }
        );
    }

    initValuesAccesor() {
        initValuesAccesor(this);
    }

    findRange() {
        let minValue = Number.POSITIVE_INFINITY;
        let maxValue = Number.NEGATIVE_INFINITY;
        if (this.length > 0) {
            minValue = this.waveformData(0);
            maxValue = this.waveformData(0);
            for (let i = 1; i < this.length; i++) {
                const value = this.waveformData(i);
                if (value < minValue) {
                    minValue = value;
                } else if (value > maxValue) {
                    maxValue = value;
                }
            }
        } else {
            minValue = 0;
            maxValue = 0;
        }
        this.waveformDefinition.cachedMinValue = minValue;
        this.waveformDefinition.cachedMaxValue = maxValue;
    }

    guessWaveformFormat() {
        let format: WaveformFormat = WaveformFormat.UNKNOWN;
        if (this.fileTypeAsDisplayString === "text/csv") {
            format = WaveformFormat.CSV_STRING;
        } else {
            format = WaveformFormat.RIGOL_BYTE;
        }
        return format;
    }

    getDefaultWaveformDefinition(): IWaveformDefinition {
        return {
            samplingRate: 1,
            format: WaveformFormat.UNKNOWN,
            unitName: "unknown",
            offset: 0,
            scale: 1,
            cachedMinValue: 0,
            cachedMaxValue: 0
        };
    }

    migrateWaveformDefinition() {
        let migrated = false;

        if (this.waveformDefinition.samplingRate === undefined) {
            this.waveformDefinition.samplingRate = 1000000;
            migrated = true;
        }

        if (this.waveformDefinition.offset === undefined) {
            this.waveformDefinition.offset = 0;
            migrated = true;
        }

        if (this.waveformDefinition.scale === undefined) {
            this.waveformDefinition.scale = 1;
            migrated = true;
        }

        if (
            this.waveformDefinition.cachedMinValue == null ||
            this.waveformDefinition.cachedMaxValue == null
        ) {
            migrated = true;
        }

        return migrated;
    }

    @action.bound
    initWaveformDefinition() {
        let migrated = false;

        if (this.waveformHistoryItemMessage.waveformDefinition) {
            const oldFormat =
                this.waveformDefinition && this.waveformDefinition.format;
            const oldOffset =
                this.waveformDefinition && this.waveformDefinition.offset;
            const oldScale =
                this.waveformDefinition && this.waveformDefinition.scale;

            this.waveformDefinition =
                this.waveformHistoryItemMessage.waveformDefinition;
            migrated = this.migrateWaveformDefinition();
            if (!migrated) {
                if (
                    oldFormat !== this.waveformDefinition.format ||
                    oldOffset !== this.waveformDefinition.offset ||
                    oldScale !== this.waveformDefinition.scale
                ) {
                    // recalculate range
                    migrated = true;
                }
            }
        } else {
            this.waveformDefinition = this.getDefaultWaveformDefinition();
            migrated = true;
        }

        this.initValuesAccesor();

        if (migrated) {
            this.findRange();
        }
    }

    @computed
    get values(): any {
        if (typeof this.data === "string") {
            return new Uint8Array(new Buffer(this.data, "binary").buffer);
        }
        return this.data;
    }

    @computed
    get waveformHistoryItemMessage(): IWaveformHistoryItemMessage {
        return JSON.parse(this.message);
    }

    @observable.shallow waveformDefinition =
        this.getDefaultWaveformDefinition();

    @observable length: number = 0;

    get format() {
        return this.waveformDefinition.format;
    }

    get offset() {
        return this.waveformDefinition.offset;
    }

    set offset(value: number) {
        this.waveformDefinition.offset = value;
    }

    get scale() {
        return this.waveformDefinition.scale;
    }

    set scale(value: number) {
        this.waveformDefinition.scale = value;
    }

    @computed
    get xAxisUnit() {
        return TIME_UNIT;
    }

    @computed
    get samplingRate() {
        return this.waveformDefinition.samplingRate;
    }

    viewOptions: ViewOptions;
    rulers: IRulersModel;
    measurements: IMeasurementsModel;

    xAxisModel = new WaveformTimeAxisModel(this);

    chartsController: IChartsController;

    createChartsController(
        appStore: IAppStore,
        displayOption: ChartsDisplayOption,
        mode: ChartMode
    ): IChartsController {
        if (
            this.chartsController &&
            this.chartsController.mode === mode &&
            this.chartsController.xAxisController.axisModel ===
                this.xAxisModel &&
            this.chartsController.chartControllers[0].yAxisController
                .axisModel === this.yAxisModel
        ) {
            return this.chartsController;
        }

        if (this.chartsController) {
            this.chartsController.destroy();
        }

        const chartsController = new WaveformChartsController(
            this,
            mode,
            this.xAxisModel
        );
        this.chartsController = chartsController;

        this.xAxisModel.chartsController = chartsController;

        chartsController.chartControllers = [
            this.createChartController(
                chartsController,
                "unknown",
                this.yAxisModel
            )
        ];

        if (!chartsController.isMultiWaveformChartsController) {
            chartsController.createRulersController(this.rulers);
            chartsController.createMeasurementsController(this.measurements);
        }

        return chartsController;
    }

    createChartController(
        chartsController: IChartsController,
        id: string,
        axisModel: IAxisModel
    ) {
        const chartController = new ChartController(chartsController, id);

        chartController.createYAxisController(axisModel);

        chartController.lineControllers.push(
            new WaveformLineController(
                "waveform-" + chartController.yAxisController.position,
                this,
                chartController.yAxisController
            )
        );

        return chartController;
    }

    yAxisModel = new WaveformAxisModel(this, undefined);

    value(index: number) {
        return 0;
    }

    waveformData(index: number) {
        return 0;
    }

    waveformDataToValue(waveformDataValue: number) {
        return this.offset + waveformDataValue * this.scale;
    }

    get minValue() {
        if (
            this.waveformDefinition.format === WaveformFormat.RIGOL_BYTE ||
            this.waveformDefinition.format === WaveformFormat.RIGOL_WORD
        ) {
            return this.waveformDataToValue(
                this.waveformDefinition.cachedMinValue
            );
        } else {
            return this.waveformDefinition.cachedMinValue;
        }
    }

    get maxValue() {
        if (
            this.waveformDefinition.format === WaveformFormat.RIGOL_BYTE ||
            this.waveformDefinition.format === WaveformFormat.RIGOL_WORD
        ) {
            return this.waveformDataToValue(
                this.waveformDefinition.cachedMaxValue
            );
        } else {
            return this.waveformDefinition.cachedMaxValue;
        }
    }

    renderToolbar(chartsController: IChartsController): JSX.Element {
        return (
            <WaveformToolbar
                chartsController={chartsController}
                waveform={this}
            />
        );
    }

    openConfigurationDialog() {
        showDialog(<WaveformConfigurationDialog waveform={this} />);
    }

    get xAxisDefaultSubdivisionOffset(): number | undefined {
        return this.waveformHistoryItemMessage.horizontalScale !== undefined
            ? 0
            : undefined;
    }

    get xAxisDefaultSubdivisionScale() {
        return this.waveformHistoryItemMessage.horizontalScale;
    }

    @computed
    get yAxisDefaultSubdivisionOffsetAndScale() {
        if (this.waveformHistoryItemMessage.verticalScale) {
            const verticalScale = this.waveformHistoryItemMessage.verticalScale;
            const min =
                Math.floor(this.yAxisModel.minValue / verticalScale) *
                verticalScale;
            const max =
                Math.ceil(this.yAxisModel.maxValue / verticalScale) *
                verticalScale;
            const subdivision =
                this.waveformHistoryItemMessage.viewOptions.axesLines
                    .majorSubdivision.vertical;

            return {
                offset: (min + max) / 2 - (verticalScale * subdivision) / 2,
                scale: verticalScale
            };
        }

        return {
            offset: undefined,
            scale: undefined
        };
    }

    get yAxisDefaultSubdivisionOffset(): number | undefined {
        return this.yAxisDefaultSubdivisionOffsetAndScale.offset;
    }

    get yAxisDefaultSubdivisionScale() {
        return this.yAxisDefaultSubdivisionOffsetAndScale.scale;
    }

    @computed
    getPreviewElement(appStore: IAppStore) {
        return <ChartPreview appStore={appStore} data={this} />;
    }

    get valueUnit() {
        return this.waveformDefinition.unitName;
    }

    isZoomable = true;

    convertToCsv = () => {
        return convertToCsv(this);
    };
}

////////////////////////////////////////////////////////////////////////////////

class WaveformLineController extends LineController {
    constructor(
        public id: string,
        public waveform: Waveform,
        yAxisController: IAxisController
    ) {
        super(id, yAxisController);
    }

    @computed
    get yMin(): number {
        return this.yAxisController.axisModel.minValue;
    }

    @computed
    get yMax(): number {
        return this.yAxisController.axisModel.maxValue;
    }

    getWaveformModel() {
        return this.waveform;
    }

    getNearestValuePoint(point: Point): Point {
        return getNearestValuePoint(
            point,
            this.xAxisController,
            this.yAxisController,
            this.waveform
        );
    }

    render(): JSX.Element {
        return <WaveformLineView key={this.id} waveformLineController={this} />;
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
class WaveformConfigurationDialog extends React.Component<
    {
        waveform: Waveform;
    },
    {}
> {
    waveformProperties: WaveformDefinitionProperties =
        new WaveformDefinitionProperties(
            this.props.waveform.waveformDefinition
        );

    handleSubmit = async () => {
        const newWaveformDefinition =
            await this.waveformProperties.checkValidity();
        if (!newWaveformDefinition) {
            return false;
        }

        if (
            !objectEqual(
                this.props.waveform.waveformDefinition,
                newWaveformDefinition
            )
        ) {
            const message = JSON.stringify(
                Object.assign({}, this.props.waveform.fileState, {
                    waveformDefinition: newWaveformDefinition
                })
            );

            beginTransaction("Edit waveform configuration");
            logUpdate(
                activityLogStore,
                {
                    id: this.props.waveform.id,
                    oid: this.props.waveform.oid,
                    message
                },
                {
                    undoable: true
                }
            );
            commitTransaction();
        }

        return true;
    };

    render() {
        return (
            <Dialog onOk={this.handleSubmit}>
                <PropertyList>{this.waveformProperties.render()}</PropertyList>
            </Dialog>
        );
    }
}

export async function convertToCsv(waveform: Waveform) {
    const { getLocale } =
        require("eez-studio-shared/i10n") as typeof I10nModule;
    const locale = getLocale();

    // determine CSV separator depending of locale usage of ","
    let separator;
    if ((0.1).toLocaleString(locale).indexOf(",") != -1) {
        separator = ";";
    } else {
        separator = ",";
    }

    const numberFormat = new Intl.NumberFormat(locale, {
        useGrouping: false,
        maximumFractionDigits: 9
    });

    let csv = "";

    let progressToastId = notification.info("Exporting to CSV ...", {
        autoClose: false,
        closeButton: false,
        closeOnClick: false,
        hideProgressBar: false,
        progressStyle: {
            transition: "none"
        }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    for (let i = 0; i < waveform.length; i++) {
        csv += numberFormat.format(i / waveform.samplingRate);
        csv += separator;
        csv += numberFormat.format(waveform.value(i));
        csv += "\n";

        if (i > 0 && i % 100000 === 0) {
            const progress = i / waveform.length;

            notification.update(progressToastId, {
                progress
            });

            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    notification.dismiss(progressToastId);

    return csv;
}
