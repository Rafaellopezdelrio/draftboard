// Sentry navigation breadcrumbs for view modals. Fires "open"/"close"
// every time a modal flag flips. Sentry crash events captured AFTER
// a problem include this trail — turns "TypeError at line 47" into
// "user opened History, then Coach, then crashed in Coach".
//
// Extracted from App.tsx: 11 individual useEffects collapsed into one
// loop here, each watching its own boolean. The hook accepts the
// boolean directly so React's dep tracking still catches transitions
// per-view (we can't pass an object — that would dirty every render).

import { useEffect } from "react";
import { trackNavigation } from "../services/breadcrumbs";

/**
 * Single useEffect per (viewName, isOpen) tuple. Logs an "open" or
 * "close" event whenever `isOpen` changes. Call once per view at the
 * top of your component. Cheap — just a Sentry breadcrumb push.
 */
export function useViewBreadcrumb(viewName: string, isOpen: boolean): void {
  useEffect(() => {
    trackNavigation(viewName, isOpen ? "open" : "close");
  }, [viewName, isOpen]);
}
