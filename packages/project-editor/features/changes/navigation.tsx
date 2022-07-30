import moment from "moment";

import React from "react";
import {
    makeObservable,
    runInAction,
    action,
    computed,
    observable,
    autorun,
    IReactionDisposer
} from "mobx";
import { observer } from "mobx-react";
import * as FlexLayout from "flexlayout-react";

import { Loader } from "eez-studio-ui/loader";
import { List, IListNode } from "eez-studio-ui/list";

import { ProjectContext } from "project-editor/project/context";
import { NavigationComponent } from "project-editor/project/NavigationComponent";
import { EditorComponent } from "project-editor/project/EditorComponent";
import { IPanel, LayoutModels } from "project-editor/store";
import {
    MEMORY_HASH,
    UNSTAGED_HASH,
    Revision,
    STAGED_HASH
} from "project-editor/store/ui-state";
import { diff, getRevisions } from "project-editor/features/changes/diff";
import { Delta } from "jsondiffpatch";
import {
    Body,
    ToolbarHeader,
    VerticalHeaderWithBody
} from "eez-studio-ui/header-with-body";
import { Toolbar } from "eez-studio-ui/toolbar";
import { IconAction } from "eez-studio-ui/action";

export const ChangesNavigation = observer(
    class ChangesNavigation extends NavigationComponent {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        loading: boolean = true;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                nodes: computed,
                loading: observable
            });
        }

        async componentDidMount() {
            this.refresh(false);
        }

        refresh = async (forceGitRefresh: boolean = true) => {
            runInAction(() => {
                this.loading = true;
            });

            let revisions: Revision[] = await getRevisions(
                this.context,
                forceGitRefresh
            );

            runInAction(() => {
                this.context.uiStateStore.revisions = revisions;
                this.loading = false;
            });
        };

        get nodes(): IListNode<Revision>[] {
            return this.context.uiStateStore.revisions.map(revision => ({
                id: revision.hash,
                label: revision.message,
                data: revision,
                selected:
                    revision.hash ==
                    this.context.uiStateStore.selectedRevisionHash
            }));
        }

        render() {
            return (
                <VerticalHeaderWithBody style={{ height: "100%" }}>
                    <ToolbarHeader>
                        <Toolbar>
                            <IconAction
                                icon="material:refresh"
                                title="Refresh"
                                onClick={this.refresh}
                            />
                        </Toolbar>
                    </ToolbarHeader>
                    <Body tabIndex={0}>
                        {this.loading ? (
                            <Loader className="" centered={true} />
                        ) : (
                            <List
                                tabIndex={0}
                                nodes={this.nodes}
                                selectNode={action(
                                    (node: IListNode<Revision>) => {
                                        this.context.uiStateStore.selectedRevisionHash =
                                            node.data.hash;
                                    }
                                )}
                                renderNode={(node: IListNode<Revision>) => (
                                    <div className="pb-2">
                                        <div>{node.data.message}</div>
                                        <div className="fw-light">
                                            {node.data.hash != MEMORY_HASH &&
                                            node.data.hash != UNSTAGED_HASH &&
                                            node.data.hash != STAGED_HASH
                                                ? `${node.data.hash.slice(
                                                      0,
                                                      8
                                                  )} • ${
                                                      node.data.author_name
                                                  } • ${moment(
                                                      node.data.date
                                                  ).calendar()}`
                                                : ""}
                                        </div>
                                    </div>
                                )}
                            ></List>
                        )}
                    </Body>
                </VerticalHeaderWithBody>
            );
        }
    }
);

export const ChangesEditor = observer(
    class ChangesEditor extends EditorComponent implements IPanel {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        delta:
            | {
                  delta: Delta;
                  html: string;
                  annotated: string;
              }
            | undefined;
        progressPercent: number | undefined;

        activeTask: () => void | undefined;
        dispose: IReactionDisposer | undefined;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                delta: observable,
                progressPercent: observable
            });
        }

        componentDidMount() {
            this.dispose = autorun(async () => {
                if (this.activeTask) {
                    this.activeTask();
                }

                let canceled = false;

                this.activeTask = () => {
                    canceled = true;
                };

                runInAction(() => {
                    this.progressPercent = 0;
                });

                let revisionContent:
                    | {
                          delta: Delta;
                          html: string;
                          annotated: string;
                      }
                    | undefined = undefined;

                if (this.context.uiStateStore.selectedRevisionHash) {
                    const index = this.context.uiStateStore.revisions.findIndex(
                        revision =>
                            revision.hash ==
                            this.context.uiStateStore.selectedRevisionHash
                    );

                    if (index != -1) {
                        const revisionBefore =
                            index + 1 <
                            this.context.uiStateStore.revisions.length
                                ? this.context.uiStateStore.revisions[index + 1]
                                : undefined;
                        const revisionAfter =
                            this.context.uiStateStore.revisions[index];

                        revisionContent = await diff(
                            this.context,
                            revisionBefore,
                            revisionAfter,
                            action(percent => {
                                if (canceled) {
                                    throw "canceled";
                                }
                                this.progressPercent = Math.round(percent);
                            })
                        );
                    }
                } else {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                setTimeout(() => {
                    if (!canceled) {
                        runInAction(() => {
                            this.delta = revisionContent;
                            this.progressPercent = undefined;
                        });
                    }
                }, 0);
            });
        }

        componentWillUnmount() {
            if (this.activeTask) {
                this.activeTask();
            }

            if (this.dispose) {
                this.dispose();
            }
        }

        // interface IPanel implementation
        get selectedObject() {
            return this.context.project.changes;
        }
        cutSelection() {}
        copySelection() {}
        pasteSelection() {}
        deleteSelection() {}
        onFocus = () => {
            this.context.navigationStore.setSelectedPanel(this);
        };

        factory = (node: FlexLayout.TabNode) => {
            var component = node.getComponent();

            if (component === "html") {
                return (
                    <div
                        dangerouslySetInnerHTML={{
                            __html: this.delta?.html || ""
                        }}
                    ></div>
                );
            }

            if (component === "json") {
                return (
                    <pre>{JSON.stringify(this.delta?.delta, undefined, 2)}</pre>
                );
            }

            if (component === "annotated") {
                return (
                    <div
                        dangerouslySetInnerHTML={{
                            __html: this.delta?.annotated || ""
                        }}
                    ></div>
                );
            }

            return null;
        };

        render() {
            if (this.progressPercent != undefined) {
                return (
                    <Loader
                        className=""
                        centered={true}
                        progressPercent={this.progressPercent}
                    />
                );
            }

            return (
                <FlexLayout.Layout
                    model={this.context.layoutModels.changes}
                    factory={this.factory}
                    realtimeResize={true}
                    font={LayoutModels.FONT_SUB}
                />
            );
        }
    }
);
