import React from "react";
import { observable, action, runInAction, autorun } from "mobx";
import { observer, disposeOnUnmount } from "mobx-react";
import { CodeEditor, CodeEditorMode } from "eez-studio-ui/code-editor";
import {
    PropertyProps,
    getObjectPropertyDisplayName
} from "project-editor/core/object";
import { getPropertyValue } from "./utils";

////////////////////////////////////////////////////////////////////////////////

type CodeEditorPropertyProps = PropertyProps & {
    mode: CodeEditorMode;
    showLabel?: boolean;
};

@observer
export class CodeEditorProperty extends React.Component<CodeEditorPropertyProps> {
    @observable value: string = this.getValue();

    editor: CodeEditor;

    @disposeOnUnmount updateValue = autorun(() => {
        const value = this.getValue();
        runInAction(() => {
            this.value = value;
        });
    });

    getValue(props?: PropertyProps) {
        props = props || this.props;

        let value;

        let getPropertyValueResult = getPropertyValue(
            props.objects,
            props.propertyInfo
        );
        if (getPropertyValueResult !== undefined) {
            value = getPropertyValueResult.value;
            if (value === undefined) {
                value = props.propertyInfo.defaultValue;
            }
        } else {
            value = undefined;
        }

        return value !== undefined ? value : "";
    }

    @action
    componentDidUpdate(prevProps: CodeEditorPropertyProps) {
        if (this.props != prevProps) {
            this.value = this.getValue(this.props);
        }
    }

    @action.bound
    onChange(value: string) {
        this.value = value;
    }

    onFocus = () => {
        this.editor.resize();
    };

    onBlur = () => {
        if (this.getValue() !== this.value) {
            this.props.updateObject({
                [this.props.propertyInfo.name]: this.value
            });
        }
    };

    render() {
        const { propertyInfo, showLabel, readOnly } = this.props;
        return (
            <React.Fragment>
                {(showLabel == undefined || showLabel) && (
                    <div>
                        {getObjectPropertyDisplayName(
                            this.props.objects[0],
                            propertyInfo
                        )}
                    </div>
                )}
                <CodeEditor
                    ref={(ref: any) => (this.editor = ref)}
                    value={this.value}
                    onChange={this.onChange}
                    onFocus={this.onFocus}
                    onBlur={this.onBlur}
                    className="form-control"
                    mode={this.props.mode}
                    minLines={2}
                    maxLines={50}
                    readOnly={readOnly}
                />
            </React.Fragment>
        );
    }
}
