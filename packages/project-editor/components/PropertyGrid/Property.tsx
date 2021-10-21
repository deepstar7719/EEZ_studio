import React from "react";
import { observable, action, runInAction, autorun } from "mobx";
import { observer, disposeOnUnmount } from "mobx-react";
import classNames from "classnames";

import { guid } from "eez-studio-shared/guid";
import { humanize, stringCompare } from "eez-studio-shared/string";
import { validators, filterNumber } from "eez-studio-shared/validation";

import { showGenericDialog } from "eez-studio-ui/generic-dialog";
import { Icon } from "eez-studio-ui/icon";

import {
    IEezObject,
    PropertyType,
    getProperty,
    PropertyProps,
    getParent,
    getObjectPropertyDisplayName
} from "project-editor/core/object";
import { info } from "project-editor/core/util";
import { replaceObjectReference } from "project-editor/core/search";

import { ConfigurationReferencesPropertyValue } from "project-editor/components/ConfigurationReferencesPropertyValue";

import { getNameProperty } from "project-editor/project/project";
import { ProjectContext } from "project-editor/project/context";
import { parseIdentifier } from "project-editor/flow/expression/expression";
import {
    EXPR_MARK_END,
    EXPR_MARK_START
} from "project-editor/flow/expression/ExpressionBuilder";

import { getPropertyValue, getPropertyValueAsString } from "./utils";
import { CodeEditorProperty } from "./CodeEditorProperty";
import { ThemedColorInput } from "./ThemedColorInput";
import { ArrayProperty } from "./ArrayElementProperty";
import { EmbeddedPropertyGrid } from "./EmbeddedPropertyGrid";
import { objectToString } from "project-editor/core/store";

////////////////////////////////////////////////////////////////////////////////

@observer
export class Property extends React.Component<PropertyProps> {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    textarea: HTMLDivElement;
    input: HTMLInputElement;
    select: HTMLSelectElement;

    @observable _value: any = undefined;

    @disposeOnUnmount
    changeDocumentDisposer = autorun(() => {
        if (this.context.project) {
            const getPropertyValueResult = getPropertyValue(
                this.props.objects,
                this.props.propertyInfo
            );
            runInAction(() => {
                this._value = getPropertyValueResult
                    ? getPropertyValueResult.value
                    : undefined;
            });
        }
    });

    resizeTextArea = () => {
        setTimeout(() => {
            if (this.textarea) {
                this.textarea.style.overflow = "hidden";
                this.textarea.style.height = "0";
                this.textarea.style.height =
                    Math.max(this.textarea.scrollHeight, 33.5) + "px";
            }
        }, 0);
    };

    @action
    componentDidUpdate(prevProps: any) {
        if (this.props != prevProps) {
            const getPropertyValueResult = getPropertyValue(
                this.props.objects,
                this.props.propertyInfo
            );
            this._value = getPropertyValueResult
                ? getPropertyValueResult.value
                : undefined;
        }
        this.resizeTextArea();
    }

    componentDidMount() {
        let el = this.input || this.textarea || this.select;
        if (el) {
            $(el).on("focus", () => {
                this.context.undoManager.setCombineCommands(true);
            });

            $(el).on("blur", () => {
                this.context.undoManager.setCombineCommands(false);
            });
        }

        this.resizeTextArea();
    }

    onSelect = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        if (this.props.propertyInfo.onSelect) {
            let params;

            if (
                this.props.propertyInfo.type == PropertyType.String ||
                this.props.propertyInfo.type == PropertyType.MultilineText ||
                this.props.propertyInfo.type == PropertyType.ObjectReference
            ) {
                const input = $(event.target)
                    .parent()
                    .parent()
                    .find("input,textarea")[0] as HTMLInputElement;
                if (input) {
                    params = {
                        textInputSelection: {
                            start: input.selectionStart,
                            end: input.selectionEnd
                        }
                    };
                }
            }

            this.props.propertyInfo
                .onSelect(
                    this.props.objects[0],
                    this.props.propertyInfo,
                    params
                )
                .then(propertyValues => {
                    this.props.updateObject(propertyValues);
                })
                .catch(error => console.error(error));
        }
    };

    @action.bound
    changeValue(newValue: any) {
        if (this.props.readOnly) {
            return;
        }

        this._value = newValue;

        if (this.props.propertyInfo.type === PropertyType.Number) {
            if (newValue.trim() === "" && this.props.propertyInfo.isOptional) {
                newValue = undefined;
            } else {
                newValue = filterNumber(newValue);
                if (isNaN(newValue)) {
                    return;
                }
            }
        }

        this.props.updateObject({
            [this.props.propertyInfo.name]: newValue
        });
    }

    onChange = (event: any) => {
        const target = event.target;
        if (
            this.props.propertyInfo.type === PropertyType.ConfigurationReference
        ) {
            if (target.value === "all") {
                this.changeValue(undefined);
            } else {
                this.changeValue([]);
            }
        } else if (this.props.propertyInfo.type === PropertyType.Enum) {
            const id = target.value.toString();
            const enumItem = this.props.propertyInfo.enumItems!.find(
                enumItem => enumItem.id.toString() === id
            );
            this.changeValue(enumItem && enumItem!.id);
        } else {
            this.changeValue(
                target.type === "checkbox" ? target.checked : target.value
            );
        }
    };

    onSelectionChange = (
        event: React.SyntheticEvent<
            HTMLTextAreaElement | HTMLInputElement,
            Event
        >
    ) => {
        const start = event.currentTarget.selectionStart;
        const end = event.currentTarget.selectionEnd;
        if (!(typeof start == "number") || !(typeof end == "number")) {
            return;
        }

        const value = event.currentTarget.value;

        let expressionStart: number | undefined;
        for (let i = start; i >= 0; i--) {
            if (
                value[i] == EXPR_MARK_START[0] &&
                value[i + 1] == EXPR_MARK_START[1]
            ) {
                expressionStart = i;
                break;
            }
        }

        if (expressionStart === undefined) {
            return;
        }

        let expressionEnd: number | undefined;
        for (let i = end; i < value.length; i++) {
            if (
                value[i] == EXPR_MARK_END[1] &&
                value[i - 1] == EXPR_MARK_END[0]
            ) {
                expressionEnd = i + 1;
                break;
            }
        }

        if (expressionEnd === undefined) {
            return;
        }

        const identifier = value.substring(
            expressionStart + 2,
            expressionEnd - 2
        );

        if (identifier.length == 0) {
            return;
        }

        let isIdentifier = false;
        try {
            isIdentifier = parseIdentifier(identifier);
        } catch (err) {
            return;
        }

        if (!isIdentifier) {
            return;
        }

        event.currentTarget.setSelectionRange(
            expressionStart,
            expressionEnd,
            event.currentTarget.selectionDirection ?? undefined
        );
    };

    onEditUnique = () => {
        showGenericDialog({
            dialogDefinition: {
                fields: [
                    {
                        name: this.props.propertyInfo.name,
                        type: "string",
                        validators: [
                            typeof this.props.propertyInfo.unique === "boolean"
                                ? validators.unique(
                                      this.props.objects[0],
                                      getParent(this.props.objects[0])
                                  )
                                : this.props.propertyInfo.unique!(
                                      this.props.objects[0],
                                      getParent(this.props.objects[0]),
                                      this.props.propertyInfo
                                  )
                        ].concat(
                            this.props.propertyInfo.isOptional
                                ? []
                                : [validators.required]
                        )
                    }
                ]
            },
            values: this.props.objects[0]
        })
            .then(result => {
                let oldValue = this._value;
                let newValue =
                    result.values[this.props.propertyInfo.name].trim();
                if (newValue.length === 0) {
                    newValue = undefined;
                }
                if (newValue != oldValue) {
                    this.context.undoManager.setCombineCommands(true);

                    runInAction(() => {
                        replaceObjectReference(this.props.objects[0], newValue);
                        this.changeValue(newValue);
                    });

                    this.context.undoManager.setCombineCommands(false);
                }
            })
            .catch(error => {
                if (error !== undefined) {
                    console.error(error);
                }
            });
    };

    onGenerateGuid = () => {
        this.changeValue(guid());
    };

    onKeyDown = (event: React.KeyboardEvent) => {
        if (event.keyCode === 13) {
            if (this.props.propertyInfo.type === PropertyType.Number) {
                try {
                    var mexp = require("math-expression-evaluator");
                    const newValue = mexp.eval(this._value);
                    if (newValue !== undefined && newValue !== this._value) {
                        this.props.updateObject({
                            [this.props.propertyInfo.name]: newValue
                        });
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        }
    };

    render() {
        const { propertyInfo, readOnly } = this.props;

        if (readOnly) {
            const getPropertyValueAsStringResult = getPropertyValueAsString(
                this.props.objects,
                propertyInfo
            );
            let value =
                (getPropertyValueAsStringResult !== undefined
                    ? getPropertyValueAsStringResult.value
                    : undefined) || "";
            return (
                <input
                    type="text"
                    className="form-control"
                    value={value}
                    readOnly
                />
            );
        }

        if (propertyInfo.propertyGridRowComponent) {
            return <propertyInfo.propertyGridRowComponent {...this.props} />;
        } else if (propertyInfo.propertyGridColumnComponent) {
            return <propertyInfo.propertyGridColumnComponent {...this.props} />;
        } else if (
            propertyInfo.type === PropertyType.String &&
            propertyInfo.unique
        ) {
            return (
                <div className="input-group">
                    <input
                        ref={(ref: any) => (this.input = ref)}
                        type="text"
                        className="form-control"
                        value={this._value || ""}
                        readOnly
                    />
                    <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={this.onEditUnique}
                    >
                        &hellip;
                    </button>
                </div>
            );
        } else if (propertyInfo.type === PropertyType.MultilineText) {
            if (!readOnly && this.props.propertyInfo.onSelect) {
                return (
                    <div className="input-group" title={this._value || ""}>
                        <textarea
                            ref={(ref: any) => (this.textarea = ref)}
                            className={classNames("form-control", {
                                pre: propertyInfo.monospaceFont
                            })}
                            value={this._value || ""}
                            onChange={this.onChange}
                            onSelect={this.onSelectionChange}
                            style={{ resize: "none" }}
                            readOnly={propertyInfo.computed}
                        />
                        <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={this.onSelect}
                            title={this.props.propertyInfo.onSelectTitle}
                        >
                            &hellip;
                        </button>
                    </div>
                );
            } else {
                return (
                    <textarea
                        ref={(ref: any) => (this.textarea = ref)}
                        className={classNames("form-control", {
                            pre: propertyInfo.monospaceFont
                        })}
                        value={this._value || ""}
                        onChange={this.onChange}
                        style={{ resize: "none" }}
                        readOnly={readOnly || propertyInfo.computed}
                    />
                );
            }
        } else if (propertyInfo.type === PropertyType.JSON) {
            return (
                <CodeEditorProperty
                    {...this.props}
                    mode="json"
                    showLabel={false}
                />
            );
        } else if (propertyInfo.type === PropertyType.CSS) {
            return (
                <CodeEditorProperty
                    {...this.props}
                    mode="css"
                    showLabel={false}
                />
            );
        } else if (propertyInfo.type === PropertyType.CPP) {
            return (
                <CodeEditorProperty
                    {...this.props}
                    mode="c_cpp"
                    showLabel={false}
                />
            );
        } else if (
            propertyInfo.type === PropertyType.Object ||
            (propertyInfo.type === PropertyType.Array &&
                this.props.propertyInfo.onSelect)
        ) {
            if (this.props.propertyInfo.onSelect) {
                const getPropertyValueAsStringResult = getPropertyValueAsString(
                    this.props.objects,
                    propertyInfo
                );
                let value =
                    (getPropertyValueAsStringResult !== undefined
                        ? getPropertyValueAsStringResult.value
                        : undefined) || "";
                return (
                    <div className="input-group" title={value}>
                        <input
                            ref={(ref: any) => (this.input = ref)}
                            type="text"
                            className="form-control"
                            value={value}
                            readOnly
                        />
                        {!readOnly && (
                            <button
                                className="btn btn-secondary"
                                type="button"
                                title={this.props.propertyInfo.onSelectTitle}
                                onClick={this.onSelect}
                            >
                                &hellip;
                            </button>
                        )}
                    </div>
                );
            } else {
                return <EmbeddedPropertyGrid {...this.props} />;
            }
        } else if (propertyInfo.type === PropertyType.Enum) {
            if (readOnly) {
                return (
                    <input
                        ref={(ref: any) => (this.input = ref)}
                        type="text"
                        className="form-control"
                        value={this._value || ""}
                        readOnly
                    />
                );
            } else {
                let options: JSX.Element[];

                if (propertyInfo.enumItems) {
                    options = propertyInfo.enumItems.map(enumItem => {
                        const id = enumItem.id.toString();
                        return (
                            <option key={id} value={id}>
                                {enumItem.label || humanize(id)}
                            </option>
                        );
                    });
                } else {
                    options = [];
                }

                options.unshift(<option key="__empty" value="" />);

                return (
                    <select
                        ref={(ref: any) => (this.select = ref)}
                        className="form-select"
                        value={this._value !== undefined ? this._value : ""}
                        onChange={this.onChange}
                    >
                        {options}
                    </select>
                );
            }
        } else if (propertyInfo.type === PropertyType.ObjectReference) {
            if (readOnly) {
                return (
                    <textarea
                        ref={(ref: any) => (this.textarea = ref)}
                        className={classNames("form-control", {
                            pre: propertyInfo.monospaceFont
                        })}
                        value={this._value || ""}
                        onChange={this.onChange}
                        style={{ resize: "none" }}
                        readOnly={readOnly || propertyInfo.computed}
                    />
                );
            } else {
                if (this.props.propertyInfo.onSelect) {
                    return (
                        <div className="input-group" title={this._value || ""}>
                            <textarea
                                ref={(ref: any) => (this.textarea = ref)}
                                className={classNames("form-control", {
                                    pre: propertyInfo.monospaceFont
                                })}
                                value={this._value || ""}
                                onChange={this.onChange}
                                onSelect={this.onSelectionChange}
                                style={{ resize: "none" }}
                                readOnly={propertyInfo.computed}
                            />
                            <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={this.onSelect}
                                title={this.props.propertyInfo.onSelectTitle}
                            >
                                &hellip;
                            </button>
                        </div>
                    );
                } else {
                    let objects: IEezObject[] =
                        this.context.project.getAllObjectsOfType(
                            propertyInfo.referencedObjectCollectionPath!
                        );

                    let options = objects
                        .slice()
                        .sort((a, b) =>
                            stringCompare(
                                getNameProperty(a),
                                getNameProperty(b)
                            )
                        )
                        .map(object => {
                            let name = getNameProperty(object);
                            return (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            );
                        });

                    options.unshift(<option key="__empty" value="" />);

                    if (
                        this._value &&
                        !objects.find(
                            object => getProperty(object, "name") == this._value
                        )
                    ) {
                        if (typeof this._value == "object") {
                            options.unshift(
                                <option
                                    key="__not_found"
                                    value={getProperty(this._value, "name")}
                                >
                                    {objectToString(this._value)}
                                </option>
                            );
                        } else {
                            options.unshift(
                                <option key="__not_found" value={this._value}>
                                    {this._value}
                                </option>
                            );
                        }
                    }

                    return (
                        <select
                            ref={(ref: any) => (this.select = ref)}
                            className="form-select"
                            value={this._value || ""}
                            onChange={this.onChange}
                        >
                            {options}
                        </select>
                    );
                }
            }
        } else if (propertyInfo.type === PropertyType.Boolean) {
            return (
                <label>
                    <input
                        ref={(ref: any) => (this.input = ref)}
                        type="checkbox"
                        checked={this._value || false}
                        onChange={this.onChange}
                        readOnly={readOnly}
                    />
                    <span>
                        {" " +
                            getObjectPropertyDisplayName(
                                this.props.objects[0],
                                propertyInfo
                            )}
                    </span>
                </label>
            );
        } else if (propertyInfo.type === PropertyType.GUID) {
            return (
                <div className="input-group">
                    <input
                        ref={(ref: any) => (this.input = ref)}
                        type="text"
                        className="form-control"
                        value={this._value || ""}
                        onChange={this.onChange}
                        readOnly={readOnly}
                    />
                    {!readOnly && (
                        <button
                            className="btn btn-secondary"
                            type="button"
                            title="Generate GUID"
                            onClick={this.onGenerateGuid}
                        >
                            +
                        </button>
                    )}
                </div>
            );
        } else if (propertyInfo.type === PropertyType.String) {
            if (!readOnly && this.props.propertyInfo.onSelect) {
                return (
                    <div className="input-group" title={this._value || ""}>
                        <input
                            ref={(ref: any) => (this.input = ref)}
                            type="text"
                            className="form-control"
                            value={this._value || ""}
                            onChange={this.onChange}
                            onSelect={this.onSelectionChange}
                            onKeyDown={this.onKeyDown}
                            readOnly={propertyInfo.computed}
                        />
                        <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={this.onSelect}
                            title={this.props.propertyInfo.onSelectTitle}
                        >
                            &hellip;
                        </button>
                    </div>
                );
            } else {
                return (
                    <input
                        ref={(ref: any) => (this.input = ref)}
                        type="text"
                        className="form-control"
                        value={this._value || ""}
                        onChange={this.onChange}
                        onKeyDown={this.onKeyDown}
                        readOnly={readOnly || propertyInfo.computed}
                    />
                );
            }
        } else if (propertyInfo.type === PropertyType.Number) {
            return (
                <input
                    ref={(ref: any) => (this.input = ref)}
                    type="text"
                    className="form-control"
                    value={this._value != undefined ? this._value : ""}
                    onChange={this.onChange}
                    onKeyDown={this.onKeyDown}
                    readOnly={readOnly}
                />
            );
        } else if (propertyInfo.type === PropertyType.Color) {
            return (
                <input
                    ref={(ref: any) => (this.input = ref)}
                    type="color"
                    className="form-control"
                    value={this._value || ""}
                    onChange={this.onChange}
                    readOnly={readOnly}
                />
            );
        } else if (propertyInfo.type === PropertyType.ThemedColor) {
            return (
                <ThemedColorInput
                    value={this._value || ""}
                    onChange={this.changeValue}
                    readOnly={readOnly}
                />
            );
        } else if (propertyInfo.type === PropertyType.Array) {
            return <ArrayProperty {...this.props} />;
        } else if (propertyInfo.type === PropertyType.ConfigurationReference) {
            return (
                <ConfigurationReferencesPropertyValue
                    value={this._value || ""}
                    onChange={this.changeValue}
                    readOnly={readOnly}
                />
            );
        } else if (propertyInfo.type === PropertyType.RelativeFolder) {
            let clearButton: JSX.Element | undefined;

            if (this._value !== undefined && !readOnly) {
                clearButton = (
                    <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => this.changeValue(undefined)}
                    >
                        <Icon icon="material:close" size={14} />
                    </button>
                );
            }

            return (
                <div className="input-group">
                    <input
                        type="text"
                        className="form-control"
                        value={this._value || ""}
                        readOnly
                    />
                    {!readOnly && (
                        <>
                            {clearButton}
                            <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={async () => {
                                    if (this.context.filePath) {
                                        const result =
                                            await EEZStudio.remote.dialog.showOpenDialog(
                                                {
                                                    properties: [
                                                        "openDirectory"
                                                    ]
                                                }
                                            );

                                        const filePaths = result.filePaths;
                                        if (filePaths && filePaths[0]) {
                                            this.changeValue(
                                                this.context.getFolderPathRelativeToProjectPath(
                                                    filePaths[0]
                                                )
                                            );
                                        }
                                    } else {
                                        info(
                                            "Project not saved.",
                                            "To be able to select folder you need to save the project first."
                                        );
                                    }
                                }}
                            >
                                &hellip;
                            </button>
                        </>
                    )}
                </div>
            );
        } else if (propertyInfo.type === PropertyType.RelativeFile) {
            let clearButton: JSX.Element | undefined;

            if (this._value !== undefined && !readOnly) {
                clearButton = (
                    <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => this.changeValue(undefined)}
                    >
                        <Icon icon="material:close" size={14} />
                    </button>
                );
            }

            return (
                <div className="input-group">
                    <input
                        type="text"
                        className="form-control"
                        value={this._value || ""}
                        readOnly
                    />
                    {!readOnly && (
                        <>
                            {clearButton}
                            <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={async () => {
                                    if (this.context.filePath) {
                                        const result =
                                            await EEZStudio.remote.dialog.showOpenDialog(
                                                {
                                                    properties: ["openFile"],
                                                    filters:
                                                        propertyInfo.fileFilters
                                                }
                                            );

                                        const filePaths = result.filePaths;
                                        if (filePaths && filePaths[0]) {
                                            this.changeValue(
                                                this.context.getFolderPathRelativeToProjectPath(
                                                    filePaths[0]
                                                )
                                            );
                                        }
                                    } else {
                                        info(
                                            "Project not saved.",
                                            "To be able to select file you need to save the project first."
                                        );
                                    }
                                }}
                            >
                                &hellip;
                            </button>
                        </>
                    )}
                </div>
            );
        } else if (propertyInfo.type === PropertyType.Image) {
            return (
                <div>
                    <div className="input-group">
                        <input
                            type="text"
                            className="form-control"
                            value={
                                propertyInfo.embeddedImage
                                    ? "<embedded image>"
                                    : this._value || ""
                            }
                            readOnly
                        />
                        {!readOnly && (
                            <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={async () => {
                                    const result =
                                        await EEZStudio.remote.dialog.showOpenDialog(
                                            {
                                                properties: ["openFile"],
                                                filters: [
                                                    {
                                                        name: "Image files",
                                                        extensions: [
                                                            "png",
                                                            "jpg",
                                                            "jpeg"
                                                        ]
                                                    },
                                                    {
                                                        name: "All Files",
                                                        extensions: ["*"]
                                                    }
                                                ]
                                            }
                                        );
                                    const filePaths = result.filePaths;
                                    if (filePaths && filePaths[0]) {
                                        if (propertyInfo.embeddedImage) {
                                            const fs =
                                                EEZStudio.remote.require("fs");
                                            fs.readFile(
                                                this.context.getAbsoluteFilePath(
                                                    filePaths[0]
                                                ),
                                                "base64",
                                                (err: any, data: any) => {
                                                    if (!err) {
                                                        this.changeValue(
                                                            "data:image/png;base64," +
                                                                data
                                                        );
                                                    }
                                                }
                                            );
                                        } else {
                                            this.changeValue(
                                                this.context.getFilePathRelativeToProjectPath(
                                                    filePaths[0]
                                                )
                                            );
                                        }
                                    }
                                }}
                            >
                                &hellip;
                            </button>
                        )}
                    </div>
                    {this._value && !propertyInfo.embeddedImage && (
                        <img
                            src={
                                this._value &&
                                this._value.startsWith("data:image/")
                                    ? this._value
                                    : this.context.getAbsoluteFilePath(
                                          this._value || ""
                                      )
                            }
                            style={{
                                display: "block",
                                maxWidth: "100%",
                                margin: "auto",
                                paddingTop: "5px"
                            }}
                        />
                    )}
                </div>
            );
        }
        return null;
    }
}
