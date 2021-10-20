import React from "react";
import { observer } from "mobx-react";
import classNames from "classnames";

import { Icon } from "eez-studio-ui/icon";

@observer
class Action extends React.Component<
    {
        title: string;
        onClick?: (event: any) => void;
        selected?: boolean;
        className?: string;
        style?: React.CSSProperties;
        enabled?: boolean;
    },
    {}
> {
    onClick = (event: any) => {
        event.target.blur();
        if (this.props.onClick) {
            event.stopPropagation();
            event.preventDefault();
            this.props.onClick(event);
        }
    };

    render() {
        let className = classNames("EezStudio_Action", this.props.className, {
            selected: this.props.selected === true
        });

        const { title } = this.props;

        let buttonProps = {
            className,
            title,
            onClick: this.onClick,
            disabled: this.props.enabled === false,
            style: this.props.style
        };

        return <button {...buttonProps}>{this.props.children}</button>;
    }
}

@observer
export class TextAction extends React.Component<
    {
        text: string;
        icon?: string;
        title: string;
        onClick: () => void;
        selected?: boolean;
        enabled?: boolean;
        style?: React.CSSProperties;
    },
    {}
> {
    render() {
        return (
            <Action className="EezStudio_TextAction" {...this.props}>
                {this.props.icon && <Icon icon={this.props.icon} />}{" "}
                {this.props.text}
            </Action>
        );
    }
}

@observer
export class IconAction extends React.Component<
    {
        icon: string | JSX.Element;
        iconSize?: number;
        title: string;
        onClick?: (event: any) => void;
        selected?: boolean;
        enabled?: boolean;
        className?: string;
        style?: React.CSSProperties;
        color?: string;
        overlayText?: string;
        attention?: boolean;
    },
    {}
> {
    render() {
        let className = classNames(
            "EezStudio_IconAction",
            this.props.className
        );

        let style;
        if (this.props.color) {
            style = { color: this.props.color };
        }

        return (
            <Action {...this.props} className={className}>
                <Icon
                    icon={this.props.icon}
                    size={this.props.iconSize}
                    style={style}
                    overlayText={this.props.overlayText}
                    attention={this.props.attention}
                />
            </Action>
        );
    }
}

@observer
export class ButtonAction extends React.Component<{
    text: string;
    icon?: string | JSX.Element;
    iconSize?: number;
    title: string;
    onClick?: (event: any) => void;
    selected?: boolean;
    enabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    attention?: boolean;
}> {
    render() {
        const { style, icon, iconSize, text } = this.props;
        let className = classNames(
            "EezStudio_ButtonAction btn",
            this.props.className
        );

        return (
            <Action {...this.props} className={className} style={style}>
                {icon && (
                    <Icon
                        icon={icon}
                        size={iconSize}
                        style={{ marginRight: 5 }}
                        attention={this.props.attention}
                    />
                )}
                {text}
            </Action>
        );
    }
}

@observer
export class DropdownButtonAction extends React.Component<
    {
        text: string;
        icon?: string;
        iconSize?: number;
        title: string;
        onClick?: (event: any) => void;
        enabled?: boolean;
        className?: string;
        style?: React.CSSProperties;
    },
    {}
> {
    render() {
        const { style, icon, iconSize, text, title, onClick, enabled } =
            this.props;
        let className = classNames(
            "EezStudio_ButtonAction btn dropdown-toggle",
            this.props.className
        );

        let buttonProps = {
            className,
            title,
            onClick: onClick,
            disabled: enabled === false,
            style: style
        };

        return (
            <div className="dropdown">
                <button
                    {...buttonProps}
                    data-bs-toggle="dropdown"
                    aria-haspopup="true"
                    aria-expanded="false"
                >
                    {icon && (
                        <Icon
                            icon={icon}
                            size={iconSize}
                            style={{ marginRight: 10 }}
                        />
                    )}
                    {text}
                </button>
                <div className="dropdown-menu">{this.props.children}</div>
            </div>
        );
    }
}

@observer
export class DropdownIconAction extends React.Component<
    {
        icon: string;
        iconSize?: number;
        title: string;
        onClick?: (event: any) => void;
        enabled?: boolean;
        className?: string;
        style?: React.CSSProperties;
    },
    {}
> {
    render() {
        const { style, icon, iconSize, title, onClick, enabled } = this.props;
        let className = classNames(
            "EezStudio_IconAction",
            this.props.className
        );

        let buttonProps = {
            className,
            title,
            onClick: onClick,
            disabled: enabled === false,
            style: style
        };

        return (
            <div className="dropdown">
                <button
                    {...buttonProps}
                    data-bs-toggle="dropdown"
                    aria-haspopup="true"
                    aria-expanded="false"
                >
                    <Icon icon={icon} size={iconSize} />
                </button>
                <div className="dropdown-menu">{this.props.children}</div>
            </div>
        );
    }
}

@observer
export class DropdownItem extends React.Component<
    {
        text: string;
        title?: string;
        onClick: () => void;
        disabled?: boolean;
    },
    {}
> {
    onClick = (event: any) => {
        event.preventDefault();
        event.stopPropagation();

        this.props.onClick();
    };

    render() {
        const { text } = this.props;

        let className = classNames("dropdown-item", {
            disabled: this.props.disabled
        });

        return (
            <a
                className={className}
                title={this.props.title}
                href="#"
                onClick={this.onClick}
            >
                {text}
            </a>
        );
    }
}
