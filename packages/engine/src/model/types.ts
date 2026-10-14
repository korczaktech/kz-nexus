/**
 * Korczak Nexus Engine — Canonical document model.
 *
 * This is the single source of truth for a document's structure. It is a
 * plain, JSON-serializable data model with no references to the DOM, React,
 * or any platform API. See docs/DOCUMENT_MODEL.md for the full description
 * of invariants.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export type Alignment = "start" | "center" | "end" | "justify";

export type MarkType = "bold" | "italic" | "underline" | "strike" | "superscript" | "subscript" | "color" | "highlight" | "fontSize" | "fontFamily" | "link" | "comment";

export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "superscript" }
  | { type: "subscript" }
  | { type: "color"; value: string }
  | { type: "highlight"; value: string }
  | { type: "fontSize"; value: number }
  | { type: "fontFamily"; value: string }
  | { type: "link"; value: string }
  | { type: "comment"; value: string };

export interface TextRun {
  type: "text";
  id: string;
  text: string;
  marks: Mark[];
}

export interface Paragraph {
  type: "paragraph";
  id: string;
  align?: Alignment;
  /** Left paragraph indent in points. */
  indent?: number;
  /** First-line indent in points, independent of the paragraph's left edge. */
  firstLineIndent?: number;
  /** Hanging indent in points; text after the first line is inset. */
  hangingIndent?: number;
  /** Spacing before and after the paragraph in points. */
  spacingBefore?: number;
  spacingAfter?: number;
  /** Unitless line-height multiplier (0.5–4). */
  lineSpacing?: number;
  /** Optional stable HTML anchor for internal links such as footnotes. */
  anchorId?: string;
  /** Optional paragraph background and border styling. */
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  padding?: number;
  children: TextRun[];
}

export interface Heading {
  type: "heading";
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  align?: Alignment;
  /** Left paragraph indent in points. */
  indent?: number;
  /** First-line indent in points, independent of the paragraph's left edge. */
  firstLineIndent?: number;
  /** Hanging indent in points; text after the first line is inset. */
  hangingIndent?: number;
  /** Spacing before and after the paragraph in points. */
  spacingBefore?: number;
  spacingAfter?: number;
  /** Unitless line-height multiplier (0.5–4). */
  lineSpacing?: number;
  /** Optional paragraph background and border styling. */
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  padding?: number;
  children: TextRun[];
}

export interface Blockquote {
  type: "blockquote";
  id: string;
  children: Paragraph[];
}

export interface ThematicBreak {
  type: "thematicBreak";
  id: string;
}

export type ListItemContent = Paragraph | BulletList | OrderedList;

export interface ListItem {
  type: "listItem";
  id: string;
  children: ListItemContent[];
}

export interface BulletList {
  type: "bulletList";
  id: string;
  children: ListItem[];
}

export interface OrderedList {
  type: "orderedList";
  id: string;
  start: number;
  children: ListItem[];
}

export interface TableCell {
  type: "tableCell";
  id: string;
  children: Paragraph[];
}

export interface TableRow {
  type: "tableRow";
  id: string;
  children: TableCell[];
}

export interface Table {
  type: "table";
  id: string;
  children: TableRow[];
}

export interface ImageBlock {
  type: "image";
  id: string;
  resourceId: string;
  alt: string;
  width?: number;
  height?: number;
}

export type Block =
  | Paragraph
  | Heading
  | Blockquote
  | ThematicBreak
  | BulletList
  | OrderedList
  | Table
  | ImageBlock;

export type AnyNode = Block | TextRun | ListItem | TableRow | TableCell;

export type LengthUnit = "pt";

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageConfig {
  unit: LengthUnit;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  margins: PageMargins;
}

export type ResourceKind = "image";

export interface ResourceRef {
  id: string;
  kind: ResourceKind;
  mimeType: string;
  /** Base64-encoded bytes. The engine treats this as opaque binary data. */
  data: string;
  byteLength: number;
  name?: string;
}

export type MetadataValue = string | number | boolean;

export interface DocumentMetadata {
  title?: string;
  author?: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: MetadataValue | undefined;
}

export interface NexusDocument {
  id: string;
  schemaVersion: number;
  metadata: DocumentMetadata;
  pageConfig: PageConfig;
  content: Block[];
  resources: ResourceRef[];
}

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  unit: "pt",
  width: 612,
  height: 792,
  orientation: "portrait",
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
};
