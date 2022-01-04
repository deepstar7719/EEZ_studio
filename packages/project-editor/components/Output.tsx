import { observable, autorun, runInAction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import classNames from "classnames";

import { Icon } from "eez-studio-ui/icon";

import {
    Message as OutputMessage,
    OutputSection
} from "project-editor/core/store";

import { ObjectPath } from "project-editor/components/ObjectPath";
import { ProjectContext } from "project-editor/project/context";
import { MessageType } from "project-editor/core/object";

const MAX_OUTPUT_MESSAGE_TEXT_SIZE = 1000;

////////////////////////////////////////////////////////////////////////////////

@observer
class Message extends React.Component<
    {
        message: OutputMessage;
        onSelect: (message: OutputMessage) => void;
    },
    {}
> {
    render() {
        let iconName = "material:";
        let iconClassName;
        if (this.props.message.type == MessageType.ERROR) {
            iconName += "error";
            iconClassName = "error";
        } else if (this.props.message.type == MessageType.WARNING) {
            iconName += "warning";
            iconClassName = "warning";
        } else {
            iconName += "info";
            iconClassName = "info";
        }
        let icon = <Icon icon={iconName} className={iconClassName} />;

        let objectPath: JSX.Element | undefined;
        if (this.props.message.object) {
            objectPath = <ObjectPath object={this.props.message.object} />;
        }

        let text = this.props.message.text;
        if (text.length > MAX_OUTPUT_MESSAGE_TEXT_SIZE) {
            text = text.substring(0, MAX_OUTPUT_MESSAGE_TEXT_SIZE) + "...";
        }

        let className = classNames("message-item EezStudio_MessageRow", {
            selected: this.props.message.selected
        });

        return (
            <tr
                className={className}
                onClick={() => this.props.onSelect(this.props.message)}
            >
                <td>
                    {icon} {text}
                </td>
                <td>{objectPath}</td>
            </tr>
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
export class Messages extends React.Component<{
    section: OutputSection;
}> {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    private divRef = React.createRef<any>();

    dispose: IReactionDisposer;
    @observable rows: React.ReactNode[];

    onSelectMessage = (message: OutputMessage) => {
        this.props.section.selectMessage(message);

        const editorState =
            this.context.editorsStore.activeEditor &&
            this.context.editorsStore.activeEditor.state;
        if (editorState) {
            editorState.ensureSelectionVisible();
        }
    };

    scrollToBottom() {
        if (this.divRef.current && this.props.section.scrollToBottom) {
            const div: HTMLDivElement = this.divRef.current;
            div.scrollTop = div.scrollHeight;
        }
    }

    componentDidMount() {
        // do not update rows immediatelly on messages change,
        // this is massive performance improvement beacuse
        // component is not refreshed after every message push
        this.dispose = autorun(
            () => {
                let rows = this.props.section.messages.map(message => (
                    <Message
                        key={message.id}
                        message={message}
                        onSelect={this.onSelectMessage}
                    />
                ));

                runInAction(() => {
                    this.rows = rows;
                });
            },
            {
                delay: 100 // delay 100 ms before update
            }
        );
    }

    componentDidUpdate() {
        this.scrollToBottom();
    }

    componentWillUnmount() {
        this.dispose();
    }

    render() {
        return (
            <div className="EezStudio_Messages" ref={this.divRef}>
                <table>
                    <tbody>{this.rows}</tbody>
                </table>
            </div>
        );
    }
}
