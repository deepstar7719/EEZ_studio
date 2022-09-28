import bootstrap from "bootstrap";
import React from "react";
import { createRoot } from "react-dom/client";
import { observable, action, makeObservable } from "mobx";
import { observer } from "mobx-react";
import classNames from "classnames";

import { Icon } from "eez-studio-ui/icon";
import { IconAction } from "eez-studio-ui/action";

////////////////////////////////////////////////////////////////////////////////

export interface IDialogOptions {
    id?: string;
    jsPanel?: {
        title: string;
        width: number;
        height?: number;
    };
    fieldsEnclosureDiv?: React.ComponentType<{ children?: React.ReactNode }>;
}

export function showDialog(dialog: JSX.Element, opts?: IDialogOptions) {
    let element = document.createElement("div");
    if (opts && opts.id) {
        element.id = opts.id;
    }

    const root = createRoot(element);
    root.render(dialog);

    if (opts && opts.jsPanel) {
        element.style.position = "absolute";
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.display = "flex";

        const jsPanel: any = (window as any).jsPanel;

        const dialog = jsPanel.modal.create({
            container: "#EezStudio_Content",
            theme: "primary",
            headerTitle: opts.jsPanel.title,
            panelSize: {
                width: Math.min(
                    Math.round(window.innerWidth * 0.8),
                    opts.jsPanel.width
                ),
                height: opts.jsPanel.height
                    ? Math.min(
                          Math.round(window.innerHeight * 0.8),
                          opts.jsPanel.height
                      )
                    : Math.round(window.innerHeight * 0.8)
            },
            content: element,
            headerControls: {
                minimize: "remove",
                smallify: "remove"
            },
            dragit: {},
            resizeit: {},
            closeOnBackdrop: false
        });
        return [dialog, element, root];
    } else {
        document.body.appendChild(element);
        return [undefined, element, root];
    }
}

////////////////////////////////////////////////////////////////////////////////

export const Dialog = observer(
    class Dialog extends React.Component<{
        children?: React.ReactNode;
        modal?: boolean;
        open?: boolean;
        title?: string;
        titleIcon?: React.ReactNode;
        size?: "small" | "medium" | "large";
        okButtonText?: string;
        cancelButtonText?: string;
        onOk?: () => Promise<boolean> | boolean | void;
        okEnabled?: () => boolean;
        onCancel?: (() => void) | null;
        cancelDisabled?: boolean;
        additionalButton?: IDialogButton;
        additionalFooterControl?: React.ReactNode;
        backdrop?: "static" | boolean;
    }> {
        disableButtons = false;
        open = true;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                disableButtons: observable,
                open: observable,
                closeDialog: action
            });
        }

        closeDialog() {
            this.open = false;
        }

        handleSubmit = (event: any) => {
            event.preventDefault();
            event.stopPropagation();

            let result = this.props.onOk!();
            if (result != false) {
                if (result instanceof Promise) {
                    action(() => (this.disableButtons = true))();
                    result.then(isValid => {
                        action(() => (this.disableButtons = false))();
                        if (isValid) {
                            this.closeDialog();
                        }
                    });
                } else {
                    this.closeDialog();
                }
            }
        };

        onCancel = () => {
            if (this.props.onCancel) {
                this.props.onCancel();
            }

            this.closeDialog();
        };

        render() {
            const buttons: IDialogButton[] = [];

            if (this.props.additionalButton) {
                buttons.push(this.props.additionalButton);
            }

            if (!this.props.cancelDisabled) {
                buttons.push({
                    id: "cancel",
                    type: "secondary",
                    position: "right",
                    onClick: this.onCancel,
                    disabled: this.disableButtons,
                    style: { marginLeft: "auto" },
                    text: this.props.cancelButtonText || "Cancel"
                });
            }

            if (this.props.onOk) {
                buttons.push({
                    id: "ok",
                    type: "primary",
                    position: "right",
                    onClick: this.handleSubmit,
                    disabled:
                        this.disableButtons ||
                        (this.props.okEnabled
                            ? !this.props.okEnabled()
                            : false),
                    style: {},
                    text: this.props.okButtonText || "OK"
                });
            }

            return (
                <BootstrapDialog
                    modal={this.props.modal}
                    open={
                        this.open &&
                        (this.props.open === undefined || this.props.open)
                    }
                    size={this.props.size}
                    title={this.props.title}
                    titleIcon={this.props.titleIcon}
                    onSubmit={this.handleSubmit}
                    onCancel={this.onCancel}
                    cancelDisabled={this.props.cancelDisabled}
                    disableButtons={this.disableButtons}
                    buttons={buttons}
                    additionalFooterControl={this.props.additionalFooterControl}
                    backdrop={this.props.backdrop}
                >
                    {this.props.children}
                </BootstrapDialog>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

export interface IDialogButton {
    id: string;
    type: "primary" | "secondary" | "danger";
    position: "left" | "right";
    onClick: (event: any) => void;
    disabled: boolean;
    style: React.CSSProperties;
    text?: string;
    icon?: string;
    title?: string;
}

export const BootstrapDialog = observer(
    class BootstrapDialog extends React.Component<{
        modal?: boolean;
        open: boolean;
        size?: "small" | "medium" | "large";
        title?: string;
        titleIcon?: React.ReactNode;
        onSubmit?: (event: React.FormEvent) => void;
        onCancel: () => void;
        cancelDisabled?: boolean;
        okEnabled?: () => boolean;
        disableButtons: boolean;
        buttons?: IDialogButton[];
        children?: React.ReactNode;
        additionalFooterControl?: React.ReactNode;
        backdrop?: "static" | boolean;
    }> {
        div: HTMLDivElement | null = null;
        form: HTMLFormElement | null = null;
        modal: bootstrap.Modal | null = null;

        setFocus = () => {
            const div = this.div;
            if (div) {
                let element = $(div).find(".ql-editor")[0];
                if (element) {
                    element.focus();
                } else {
                    $(div)
                        .find(".modal-body")
                        .find(
                            "input, textarea, select, .EezStudio_ListContainer, button"
                        )
                        .first()
                        .trigger("focus");
                }
            }
        };

        componentDidMount() {
            const div = this.div;
            if (div) {
                $(div).on("shown.bs.modal", () => {
                    setTimeout(this.setFocus);
                });

                $(div).on("hidden.bs.modal", () => {
                    const parent = div.parentElement as HTMLElement;
                    parent.remove();
                    this.props.onCancel();
                });

                this.modal = new bootstrap.Modal(div, {
                    backdrop: this.props.backdrop ?? true
                });
                this.modal.show();
            }
        }

        componentDidUpdate() {
            if (!this.props.open && this.modal) {
                this.modal.hide();
            } else {
                const element = document.activeElement;
                if (
                    !element ||
                    (!element.classList.contains(".ql-editor") &&
                        !element.classList.contains(
                            ".EezStudio_ListContainer"
                        ) &&
                        !(
                            element instanceof HTMLInputElement ||
                            element instanceof HTMLTextAreaElement ||
                            element instanceof HTMLSelectElement ||
                            element instanceof HTMLButtonElement
                        ))
                ) {
                    this.setFocus();
                }
            }
        }

        onKeyPress = (event: React.KeyboardEvent) => {
            if (
                event.which == 13 &&
                !(event.target instanceof HTMLTextAreaElement)
            ) {
                event.preventDefault();
                if (this.props.onSubmit) {
                    this.props.onSubmit(event);
                }
            }
        };

        render() {
            const props = this.props;

            const buttons = props.buttons?.map(button =>
                button.text ? (
                    <button
                        key={button.id}
                        type={"button"}
                        className={classNames(
                            "btn",
                            button.text
                                ? {
                                      "btn-primary": button.type === "primary",
                                      "btn-secondary":
                                          button.type === "secondary",
                                      "btn-danger": button.type === "danger",
                                      "float-left": button.position === "left",
                                      "float-right": button.position !== "left"
                                  }
                                : "btn-outline-secondary"
                        )}
                        onClick={button.onClick}
                        disabled={button.disabled}
                        style={button.style}
                    >
                        {button.text ? (
                            button.text
                        ) : (
                            <Icon icon={button.icon!}></Icon>
                        )}
                    </button>
                ) : (
                    <IconAction
                        key={button.id}
                        icon={button.icon!}
                        title={button.title || ""}
                        style={{ color: "#333" }}
                        onClick={button.onClick}
                        enabled={!button.disabled}
                    />
                )
            );

            if (props.modal != undefined && !props.modal) {
                return (
                    <div className="EezStudio_NonModalDialogContainer">
                        <div>{props.children}</div>
                        {(buttons || this.props.additionalFooterControl) && (
                            <div>
                                {this.props.additionalFooterControl}
                                {buttons}
                            </div>
                        )}
                    </div>
                );
            }

            let formClassName = classNames("modal-dialog", {
                "modal-lg": props.size === "large",
                "modal-sm": props.size === "small"
            });

            return (
                <div
                    ref={ref => (this.div = ref!)}
                    className="modal"
                    tabIndex={-1}
                    role="dialog"
                >
                    <form
                        ref={ref => (this.form = ref!)}
                        className={formClassName}
                        role="document"
                        onSubmit={event => {
                            if (props.onSubmit) {
                                props.onSubmit(event);
                            }
                        }}
                        onKeyPress={this.onKeyPress}
                    >
                        <div className="modal-content">
                            {props.title && (
                                <div className="modal-header">
                                    <h5
                                        className="modal-title d-flex align-items-center"
                                        id="myModalLabel"
                                    >
                                        {props.titleIcon}
                                        <span>{props.title}</span>
                                    </h5>
                                    {!this.props.cancelDisabled && (
                                        <button
                                            type="button"
                                            className="btn-close float-right"
                                            disabled={props.disableButtons}
                                            aria-label="Close"
                                            onClick={props.onCancel}
                                        ></button>
                                    )}
                                </div>
                            )}

                            <div className="modal-body">{props.children}</div>

                            {(buttons ||
                                this.props.additionalFooterControl) && (
                                <div className="modal-footer">
                                    {this.props.additionalFooterControl}
                                    {buttons}
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            );
        }
    }
);
