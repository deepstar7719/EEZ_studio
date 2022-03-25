import React from "react";
import {
    computed,
    observable,
    action,
    reaction,
    IReactionDisposer,
    IObservableValue,
    makeObservable
} from "mobx";
import { observer } from "mobx-react";

import { IconAction } from "eez-studio-ui/action";
import { SearchInput } from "eez-studio-ui/search-input";

import { IEezObject } from "project-editor/core/object";
import {
    ListAdapter,
    SortDirectionType
} from "project-editor/core/objectAdapter";
import {
    addItem,
    deleteItem,
    canAdd,
    canDelete,
    IPanel,
    isPartOfNavigation
} from "project-editor/store";
import { DragAndDropManagerClass } from "project-editor/core/dd";
import { List } from "project-editor/components/List";

import { ProjectContext } from "project-editor/project/context";
import classNames from "classnames";
import { ProjectEditor } from "project-editor/project-editor-interface";

////////////////////////////////////////////////////////////////////////////////

export const SortControl = observer(
    class SortControl extends React.Component<{
        direction: SortDirectionType;
        onDirectionChanged: (direction: SortDirectionType) => void;
    }> {
        onClicked = () => {
            if (this.props.direction === "asc") {
                this.props.onDirectionChanged("desc");
            } else if (this.props.direction === "desc") {
                this.props.onDirectionChanged("none");
            } else {
                this.props.onDirectionChanged("asc");
            }
        };

        render() {
            const { direction } = this.props;

            return (
                <div
                    className={classNames(
                        "EezStudio_SortControl",
                        "sort-" + direction
                    )}
                    onClick={this.onClicked}
                ></div>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

const AddButton = observer(
    class AddButton extends React.Component<{
        listAdapter: ListAdapter;
        navigationObject: IEezObject | undefined;
    }> {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        onAdd = async () => {
            if (this.props.navigationObject) {
                const aNewItem = await addItem(this.props.navigationObject);
                if (aNewItem) {
                    this.props.listAdapter.selectObject(aNewItem);

                    const result = ProjectEditor.getEditorComponent(aNewItem);
                    if (result) {
                        this.context.editorsStore.openEditor(
                            result.object,
                            result.subObject
                        );
                    }
                }
            }
        };

        render() {
            return (
                <IconAction
                    title="Add Item"
                    icon="material:add"
                    iconSize={16}
                    onClick={this.onAdd}
                    enabled={
                        this.props.navigationObject &&
                        canAdd(this.props.navigationObject)
                    }
                />
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

const DeleteButton = observer(
    class DeleteButton extends React.Component<{
        navigationObject: IEezObject | undefined;
        selectedObject: IObservableValue<IEezObject | undefined>;
    }> {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        onDelete = () => {
            let selectedItem = this.props.selectedObject.get();
            if (selectedItem) {
                deleteItem(selectedItem);
            }
        };

        render() {
            let selectedItem = this.props.selectedObject.get();

            return (
                <IconAction
                    title="Delete Selected Item"
                    icon="material:delete"
                    iconSize={16}
                    onClick={this.onDelete}
                    enabled={
                        selectedItem != undefined && canDelete(selectedItem)
                    }
                />
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

interface ListNavigationProps {
    id: string;
    title?: string;
    navigationObject: IEezObject;
    selectedObject: IObservableValue<IEezObject | undefined>;
    onClickItem?: (item: IEezObject) => void;
    onDoubleClickItem?: (item: IEezObject) => void;
    additionalButtons?: JSX.Element[];
    onEditItem?: (itemId: string) => void;
    renderItem?: (itemId: string) => React.ReactNode;
    dragAndDropManager?: DragAndDropManagerClass;
    searchInput?: boolean;
    editable?: boolean;
}

export const ListNavigation = observer(
    class ListNavigation
        extends React.Component<ListNavigationProps>
        implements IPanel
    {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        sortDirection: SortDirectionType = "none";
        searchText: string = "";

        dispose: IReactionDisposer;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                sortDirection: observable,
                searchText: observable,
                editable: computed,
                selectedObject: computed,
                listAdapter: computed,
                onSearchChange: action.bound
            });

            const sortDirectionStr = localStorage.getItem(
                "ListNavigationSortDirection" + this.props.id
            );
            if (sortDirectionStr) {
                this.sortDirection = sortDirectionStr as SortDirectionType;
            }

            this.dispose = reaction(
                () => this.sortDirection,
                sortDirection =>
                    localStorage.setItem(
                        "ListNavigationSortDirection" + this.props.id,
                        sortDirection
                    )
            );
        }

        get editable() {
            const navigationStore = this.context.navigationStore;
            return this.props.editable != false && navigationStore.editable;
        }

        onClickItem = (object: IEezObject) => {
            if (this.props.onClickItem) {
                this.props.onClickItem(object);
                return;
            }

            const result = ProjectEditor.getEditorComponent(object);
            if (result) {
                this.context.editorsStore.openEditor(
                    result.object,
                    result.subObject
                );
                return;
            }
        };

        onDoubleClickItem = (object: IEezObject) => {
            if (this.props.onDoubleClickItem) {
                this.props.onDoubleClickItem(object);
            }
        };

        // interface IPanel implementation
        get selectedObject() {
            return this.props.selectedObject.get();
        }
        cutSelection() {
            if (this.editable) {
                this.listAdapter.cutSelection();
            }
        }
        copySelection() {
            this.listAdapter.copySelection();
        }
        pasteSelection() {
            if (this.editable) {
                this.listAdapter.pasteSelection();
            }
        }
        deleteSelection() {
            if (this.editable) {
                this.listAdapter.deleteSelection();
            }
        }
        onFocus() {
            const navigationStore = this.context.navigationStore;
            if (isPartOfNavigation(this.props.navigationObject)) {
                navigationStore.setSelectedPanel(this);
            }
        }

        get listAdapter() {
            return new ListAdapter(
                this.props.navigationObject,
                this.props.selectedObject,
                this.sortDirection,
                this.onClickItem,
                this.onDoubleClickItem,
                this.searchText,
                this.props.editable ?? true
            );
        }

        componentWillUnmount() {
            this.listAdapter.unmount();
            this.dispose();
        }

        onSearchChange(event: any) {
            this.searchText = ($(event.target).val() as string).trim();
        }

        render() {
            const { onEditItem, renderItem } = this.props;

            const buttons: JSX.Element[] = [];

            if (this.props.additionalButtons) {
                buttons.push(...this.props.additionalButtons);
            }

            if (this.editable) {
                buttons.push(
                    <AddButton
                        key="add"
                        listAdapter={this.listAdapter}
                        navigationObject={this.props.navigationObject}
                    />
                );

                buttons.push(
                    <DeleteButton
                        key="delete"
                        navigationObject={this.props.navigationObject}
                        selectedObject={this.props.selectedObject}
                    />
                );
            }

            return (
                <div className="EezStudio_ProjectEditor_ListNavigation">
                    <div className="EezStudio_Title">
                        <SortControl
                            direction={this.sortDirection}
                            onDirectionChanged={action(
                                (direction: SortDirectionType) =>
                                    (this.sortDirection = direction)
                            )}
                        />
                        {(this.props.searchInput == undefined ||
                            this.props.searchInput) && (
                            <SearchInput
                                searchText={this.searchText}
                                onChange={this.onSearchChange}
                                onKeyDown={this.onSearchChange}
                            />
                        )}
                        <div className="btn-toolbar">{buttons}</div>
                    </div>
                    <List
                        listAdapter={this.listAdapter}
                        tabIndex={0}
                        onFocus={this.onFocus.bind(this)}
                        onEditItem={this.editable ? onEditItem : undefined}
                        renderItem={renderItem}
                    />
                </div>
            );
        }
    }
);
