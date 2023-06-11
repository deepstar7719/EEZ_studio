import React from "react";
import { observable, makeObservable } from "mobx";
import { observer } from "mobx-react";

import { Icon } from "eez-studio-ui/icon";

import {
    PropertyProps,
    getObjectPropertyDisplayName
} from "project-editor/core/object";
import { getNumModifications } from "project-editor/store";

import { propertyCollapsedStore } from "./PropertyCollapsedStore";
import classNames from "classnames";

////////////////////////////////////////////////////////////////////////////////

export const PropertyName = observer(
    class PropertyName extends React.Component<PropertyProps> {
        collapsed = true;

        toggleCollapsed = () => {
            propertyCollapsedStore.toggleColapsed(
                this.props.objects[0],
                this.props.propertyInfo
            );
        };

        constructor(props: PropertyProps) {
            super(props);

            makeObservable(this, {
                collapsed: observable
            });
        }

        render() {
            const { objects, propertyInfo } = this.props;

            if (propertyInfo.propertyGridCollapsable) {
                const enabled =
                    !propertyInfo.propertyGridCollapsableEnabled ||
                    propertyInfo.propertyGridCollapsableEnabled(objects[0]);
                const collapsed = propertyCollapsedStore.isCollapsed(
                    objects[0],
                    propertyInfo
                );

                const numModifications = getNumModifications({
                    ...this.props,
                    objects: objects.map(
                        object => (object as any)[propertyInfo.name]
                    )
                });

                return (
                    <div className="collapsable" onClick={this.toggleCollapsed}>
                        <div
                            className={classNames({
                                "fw-bold": numModifications > 0
                            })}
                        >
                            {enabled && (
                                <Icon
                                    icon={
                                        collapsed
                                            ? "material:keyboard_arrow_right"
                                            : "material:keyboard_arrow_down"
                                    }
                                    size={18}
                                    className="triangle"
                                />
                            )}
                            {getObjectPropertyDisplayName(
                                objects[0],
                                propertyInfo
                            )}
                            {numModifications > 0 && ` (${numModifications})`}
                        </div>
                    </div>
                );
            } else {
                return getObjectPropertyDisplayName(objects[0], propertyInfo);
            }
        }
    }
);
