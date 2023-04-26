import React from "react";
import { observer } from "mobx-react";

import { ProjectContext } from "project-editor/project/context";
import type { Page } from "project-editor/features/page/page";
import type { IFlowContext } from "project-editor/flow/flow-interfaces";
import {
    LVGLNonActivePageViewerRuntime,
    LVGLPageEditorRuntime,
    LVGLPageRuntime
} from "project-editor/lvgl/page-runtime";

export const LVGLPage = observer(
    class LVGLPage extends React.Component<{
        page: Page;
        flowContext: IFlowContext;
    }> {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        canvasRef = React.createRef<HTMLCanvasElement>();
        runtime: LVGLPageRuntime | undefined;

        createPageRuntime() {
            if (this.context.runtime) {
                this.runtime = new LVGLNonActivePageViewerRuntime(
                    this.context,
                    this.props.page,
                    this.props.page.width,
                    this.props.page.height,
                    this.canvasRef.current!.getContext("2d")!
                );
            } else {
                this.runtime = new LVGLPageEditorRuntime(
                    this.props.page,
                    this.canvasRef.current!.getContext("2d")!
                );
            }

            this.runtime.mount();
        }

        componentDidMount() {
            this.createPageRuntime();
        }

        componentDidUpdate() {
            if (this.runtime) {
                this.runtime.unmount();
                this.runtime = undefined;
            }

            this.createPageRuntime();
        }

        componentWillUnmount() {
            setTimeout(() => {
                if (this.runtime) {
                    this.runtime.unmount();
                }
            });
        }

        render() {
            return (
                <canvas
                    ref={this.canvasRef}
                    width={this.props.page.width}
                    height={this.props.page.height}
                    style={{
                        imageRendering: "pixelated"
                    }}
                ></canvas>
            );
        }
    }
);
