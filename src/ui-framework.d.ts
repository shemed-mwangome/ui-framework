/*!
 * UI Framework: TypeScript definitions
 *
 * The bundle is a plain script that assigns `window.UI`; there is nothing to
 * import. Consume these types either by listing the package in tsconfig:
 *
 *     "types": ["ui-framework"]
 *
 * or with a triple-slash reference in one file of the project:
 *
 *     /// <reference types="ui-framework" />
 *
 * Written by hand against src/js. Anything not declared here is not public
 * API: `UI._initializers` and the `_ui*` expando properties components hang
 * off elements are implementation detail and deliberately absent.
 */

declare namespace UIFramework {
  /** Anything the framework accepts where it will resolve a selector itself. */
  type Target = string | Element;

  type ToastType = "info" | "success" | "warning" | "danger";

  interface ToastOptions {
    type?: ToastType;
    title?: string;
    message?: string;
    icon?: string;
    /** Milliseconds before auto-dismiss. 0 or less keeps it up. Default 4000. */
    duration?: number;
    position?: string;
  }

  interface AlertOptions {
    type?: ToastType;
    title?: string;
    message?: string;
    icon?: string;
    className?: string;
    /** Set false to omit the close button. */
    dismissible?: boolean;
    target?: Target;
  }

  interface ConfirmOptions {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    /** "danger" focuses Cancel and reddens the confirm button. */
    variant?: "primary" | "danger";
    /** Disallow dismissing by backdrop click or Escape. */
    static?: boolean;
  }

  interface HttpError extends Error {
    status: number;
    response: Response;
  }

  interface Http {
    /** The CSRF header pair read from the page's meta tags, or {}. */
    csrfHeader(): Record<string, string>;
    /**
     * fetch() with the CSRF header on unsafe methods, same-origin credentials,
     * and a rejection on any non-2xx response.
     */
    fetch(url: string, options?: RequestInit): Promise<Response>;
  }

  interface I18n {
    locale: string;
    strings: Record<string, Record<string, string>>;
    add(locale: string, strings: Record<string, string>): void;
    setLocale(locale: string): void;
  }

  interface FloatPanelOptions {
    align?: "start" | "end";
  }

  /* ------------------------------------------------------------ forms */

  interface ValidationError {
    name: string;
    element: HTMLElement;
    message: string;
  }

  interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
  }

  interface ValidateFormOptions {
    /** Limit validation to fields inside this element. */
    scope?: Element;
    /** Compute the result without marking fields or emitting events. */
    silent?: boolean;
  }

  /** A rule returns null when the value passes, or the message to show. */
  type ValidationRule = (
    value: string,
    field: HTMLInputElement,
    param?: string
  ) => { key: string; vars?: Record<string, unknown> } | null;

  interface Validate {
    form(form: HTMLFormElement, options?: ValidateFormOptions): ValidationResult;
    /** The message for one field, or null when it passes. */
    field(field: HTMLElement): string | null;
    /** Bind server-side errors: {field: message}, {field: [messages]} or [{field, message}]. */
    showErrors(
      form: Target,
      errors: Record<string, string | string[]> | Array<{ field: string; message: string }>
    ): ValidationResult;
    clear(form: Target): void;
    focusFirst(form: HTMLFormElement, errors: ValidationError[]): void;
    rules: Record<string, ValidationRule>;
    addRule(name: string, fn: ValidationRule): void;
  }

  interface MaskFormatOptions {
    locale?: string;
    currency?: string;
    decimals?: number;
  }

  interface Mask {
    apply(raw: string, pattern: string): string;
    strip(value: string, pattern: string): string;
    /** The unmasked value behind a masked field. */
    raw(field: Target): string;
    set(field: Target, value: string | number): void;
    format(value: number | string, options?: MaskFormatOptions): string;
  }

  interface Draft {
    save(form: Target): void;
    discard(form: Target): void;
  }

  interface SaveNext {
    setDirty(form: HTMLFormElement, dirty: boolean): void;
  }

  /* -------------------------------------------------------- selection */

  interface Multiselect {
    build(select: HTMLSelectElement): void;
    /** Unwrap back to the plain select and rebuild -- after the options change. */
    refresh(select: HTMLSelectElement): void;
    /** Force a remote option list to reload. */
    load(target: Target): Promise<void>;
  }

  interface Combobox {
    set(target: Target, option: { value: string; label?: string }): void;
    clear(target: Target): void;
  }

  interface TreeSelect {
    selected(target: Target): string[];
  }

  interface SelectList {
    refresh(target: Target): void;
    selected(target: Target): string[];
    search(target: Target, term: string): void;
  }

  interface FilterBar {
    state(target: Target): Record<string, string[]>;
    set(target: Target, key: string, values: string[]): void;
    clear(target: Target): void;
  }

  /* ------------------------------------------------------------ dates */

  interface DateUtils {
    WEEKDAYS: string[];
    atMidnight(date: Date): Date;
    today(): Date;
    parseISODate(value: string): Date | null;
    formatISODate(date: Date): string;
    formatDisplayDate(date: Date): string;
    addDays(date: Date, days: number): Date;
    addMonths(date: Date, months: number): Date;
    startOfMonth(date: Date): Date;
    endOfMonth(date: Date): Date;
    sameDay(a: Date, b: Date): boolean;
    /** The 42 days of a six-week grid covering `viewDate`'s month. */
    buildCalendarDays(viewDate: Date): Date[];
  }

  interface DatePicker {
    close(): void;
    clear(container: Target): void;
  }

  /* ----------------------------------------------------------- tables */

  interface Table {
    /** Re-read the DOM and reapply search, sort and paging. */
    refresh(target: Target): void;
    selected(target: Target): string[];
    clearSelection(target: Target): void;
  }

  interface Chart {
    update(target: Target, valuesOrData: number[] | object, names?: string[]): void;
    refresh(target: Target): void;
    /** Re-fetch a chart's data-ui-url. Fire-and-forget; listen for ui:chart:loaded. */
    load(target: Target): void;
  }

  /* --------------------------------------------------------- overlays */

  interface Modal {
    open(modal: Element): void;
    close(modal: Element): void;
  }

  interface Offcanvas {
    open(panel: Element): void;
    close(panel: Element): void;
  }

  interface Dropdown {
    /** Omit `force` to flip the current state. */
    toggle(dropdown: Element, force?: boolean): void;
    closeAll(except?: Element | null): void;
  }

  interface Popover {
    open(target: Target): void;
    close(): void;
  }

  interface Toast {
    show(options: ToastOptions): HTMLElement;
    remove(toast: Element): void;
  }

  interface Alert {
    close(alert: Element): void;
    create(options: AlertOptions): HTMLElement;
  }

  /* ---------------------------------------------------------- offline */

  interface OfflineItem {
    id: string;
    url: string;
    method: string;
    body: unknown;
    headers: Record<string, string> | null;
    label: string;
    group: string;
    status: "pending" | "sending" | "conflict" | "failed";
    attempts: number;
    queuedAt: number;
    detail?: unknown;
  }

  interface OfflineStatus {
    state: "online" | "offline" | "syncing" | "conflict" | "failed";
    total: number;
    pending: number;
    sending: number;
    conflict: number;
    failed: number;
    online: boolean;
  }

  interface OfflineConfig {
    autoFlush?: boolean;
    /** Milliseconds between automatic flush attempts. Default 30000. */
    interval?: number;
    endpointHeaders?: Record<string, string>;
  }

  interface Offline {
    configure(options: OfflineConfig): void;
    /** Resolves once the write is durably stored, not once it is sent. */
    queue(item: Partial<OfflineItem> & { url: string }): Promise<OfflineItem>;
    pending(): Promise<OfflineItem[]>;
    flush(): Promise<void>;
    status(): Promise<OfflineStatus>;
    resolve(id: string, action: "retry" | "discard"): Promise<unknown>;
    clear(): Promise<void>;
  }

  /* --------------------------------------------------------- patterns */

  interface Segmented {
    select(target: Target, value: string): void;
    /** Null when nothing is active. */
    value(target: Target): string | null;
  }

  interface Blocker {
    set(target: Target, reason: string): void;
    clear(target: Target): void;
  }

  interface Repeater {
    add(target: Target): void;
    count(target: Target): number;
    clear(target: Target): void;
  }

  interface YesNo {
    /** "YES", "NO", "NA", or "" when unanswered. */
    value(target: Target): string;
  }

  interface Upload {
    parseSize(value: string): number;
    formatSize(bytes: number): string;
    clear(target: Target): void;
  }

  /* ------------------------------------------------------------- root */

  interface Static {
    readonly version: string;

    /* dom */
    q<E extends Element = Element>(selector: string, root?: ParentNode): E | null;
    qa<E extends Element = Element>(selector: string, root?: ParentNode): E[];
    closest<E extends Element = Element>(element: Element | null, selector: string): E | null;
    /** Like qa(), but also matches `root` itself. */
    matchAll<E extends Element = Element>(selector: string, root?: ParentNode): E[];
    focusable(root?: ParentNode): HTMLElement[];
    uid(prefix?: string): string;

    /* events */
    emit(element: Element | Document | null, name: string, detail?: unknown): void;
    /**
     * Announces that a widget wrote a new value into a form field: dispatches
     * a bubbling `input` and then a bubbling `change`, which is what a browser
     * does for a real edit. Reactive frameworks bind to `input` on text
     * inputs, so a widget that fires only `change` never reaches the model.
     */
    fireChange(element: Element | null): void;

    /* safety */
    escape(value: unknown): string;
    /** Null when the URL carries an unsafe scheme. */
    safeUrl(value: string): string | null;

    /* lifecycle */
    register(initializer: (root: ParentNode) => void): void;
    /** Initialise every component inside `root` (and `root` itself). */
    init(root?: ParentNode): void;
    /** Register teardown to run when `UI.destroy()` reaches this element. */
    cleanup(element: Element, fn: () => void): void;
    /** Run teardown across a subtree and clear the ready flags so it can re-init. */
    destroy(root?: ParentNode): void;
    /** Auto-init inserted nodes and auto-destroy removed ones. Returns a stop function. */
    observe(root?: Element): () => void;

    /* i18n and a11y */
    i18n: I18n;
    t(key: string, vars?: Record<string, unknown>): string;
    announce(message: string, priority?: "polite" | "assertive"): void;

    /* positioning */
    /** Pins `panel` to `trigger` in the viewport. Returns a cleanup function. */
    floatPanel(trigger: Element, panel: HTMLElement, options?: FloatPanelOptions): () => void;
    trapFocus(container: Element, event: KeyboardEvent): void;

    /* requests */
    http: Http;

    /* components */
    alert: Alert;
    blocker: Blocker;
    chart: Chart;
    /** Copies the given text, not an element. Resolves false if it could not. */
    clipboard: { copy(text: string): Promise<boolean> };
    collapse: { toggle(trigger: Element, expanded?: boolean): void };
    combobox: Combobox;
    confirm(options?: ConfirmOptions): Promise<boolean>;
    dateRange: DatePicker;
    datePicker: DatePicker;
    dateUtils: DateUtils;
    draft: Draft;
    dropdown: Dropdown;
    filter: FilterBar;
    mask: Mask;
    modal: Modal;
    multiselect: Multiselect;
    offcanvas: Offcanvas;
    offline: Offline;
    popover: Popover;
    /** Print one element instead of the whole page. */
    print(target: Target): void;
    repeater: Repeater;
    saveNext: SaveNext;
    segmented: Segmented;
    selectList: SelectList;
    table: Table;
    tabs: { activate(tab: Element): void };
    toast: Toast;
    treeSelect: TreeSelect;
    upload: Upload;
    validate: Validate;
    yn: YesNo;
  }
}

declare const UI: UIFramework.Static;

interface Window {
  UI: UIFramework.Static;
}
