import React from "react";
import { recordRendererCrash } from "./rendererCrashRegistry.js";
import { cleanRendererErrorMessage } from "./rendererStabilityUtils.js";

export class RendererErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    const entry = recordRendererCrash(error, info, this.props.crashContext);
    // Screen crashes also go to the ERP Error Console journal on the desktop.
    window.giiGemErp?.recordScreenError?.({ screen: entry.currentView, message: entry.message, company_id: entry.companyId || null })?.catch?.(() => {});
    console.error("Renderer section failed", error, info);
    this.props.onError?.(error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message = cleanRendererErrorMessage(this.state.error);
    return (
      <section className="panel renderer-error-panel">
        <div>
          <h2>{this.props.title || "Screen could not load"}</h2>
          <p>{message}</p>
          <small>The ERP shell stayed open so this error can be reviewed instead of showing a blank screen.</small>
        </div>
        <div className="renderer-error-actions">
          {this.props.onOpenSafeMode ? (
            <button type="button" className="secondary-btn" onClick={this.props.onOpenSafeMode}>Open Safe Mode</button>
          ) : null}
          <button type="button" className="primary-btn" onClick={this.props.onReset}>Return to Dashboard</button>
        </div>
      </section>
    );
  }
}
