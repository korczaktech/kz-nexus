declare module 'html-to-docx';

declare module 'pagedjs' {
  export class Previewer {
    constructor(options?: Record<string, unknown>);
    preview(content?: HTMLElement | DocumentFragment | string, stylesheets?: Array<string | Record<string, unknown>>, renderTo?: HTMLElement | string): Promise<{total?: number; [key: string]: unknown}>;
  }
}
