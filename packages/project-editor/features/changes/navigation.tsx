import moment from "moment";

import React from "react";
import {
    makeObservable,
    runInAction,
    action,
    computed,
    observable
} from "mobx";
import { observer } from "mobx-react";

import { Loader } from "eez-studio-ui/loader";
import { List, IListNode } from "eez-studio-ui/list";

import { ProjectContext } from "project-editor/project/context";
import { NavigationComponent } from "project-editor/project/NavigationComponent";
import {
    MEMORY_HASH,
    UNSTAGED_HASH,
    Revision,
    STAGED_HASH
} from "project-editor/store/ui-state";
import { getRevisions } from "project-editor/features/changes/diff";
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

        selectNode = action((node: IListNode<Revision>) => {
            if (
                this.context.uiStateStore.selectedRevisionHash != node.data.hash
            ) {
                this.context.uiStateStore.selectedRevisionHash = node.data.hash;

                if (this.context.uiStateStore.selectedRevisionHash) {
                    const index = this.context.uiStateStore.revisions.findIndex(
                        revision =>
                            revision.hash ==
                            this.context.uiStateStore.selectedRevisionHash
                    );

                    const revisionAfter =
                        this.context.uiStateStore.revisions[index];

                    let revisionBefore;

                    if (
                        index != -1 &&
                        index + 1 < this.context.uiStateStore.revisions.length
                    ) {
                        revisionBefore =
                            this.context.uiStateStore.revisions[index + 1];
                    } else {
                        revisionBefore = undefined;
                    }

                    this.context.editorsStore.openEditor(
                        this.context.project.changes,
                        undefined,
                        {
                            revisionAfterHash: revisionAfter.hash,
                            revisionBeforeHash: revisionBefore?.hash
                        }
                    );
                }
            }
        });

        renderNode = (node: IListNode<Revision>) => (
            <div className="pb-2">
                <div>{node.data.message}</div>
                <div className="fw-light">
                    {node.data.hash != MEMORY_HASH &&
                    node.data.hash != UNSTAGED_HASH &&
                    node.data.hash != STAGED_HASH
                        ? `${node.data.hash.slice(0, 8)} • ${
                              node.data.author_name
                          } • ${moment(node.data.date).calendar()}`
                        : ""}
                </div>
            </div>
        );

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
                                selectNode={this.selectNode}
                                renderNode={this.renderNode}
                            ></List>
                        )}
                    </Body>
                </VerticalHeaderWithBody>
            );
        }
    }
);
