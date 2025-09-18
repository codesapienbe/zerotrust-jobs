declare module 'marked' {
  export function parse(md: string): string;
  export default { parse };
}

declare module 'dompurify' {
  const DOMPurify: {
    sanitize(input: string): string;
  };
  export default DOMPurify;
}

declare module 'zustand' {
  // Minimal ambient for zustand create
  type StateCreator<T> = (set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void, get: () => T, api?: unknown) => T
  // create returns a hook-like getter function
  export default function create<T>(creator: StateCreator<T>): () => T
}

declare module 'zustand/middleware' {
  export function persist<T>(config: unknown, options?: unknown): unknown
}

declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: Record<string, unknown>)
    setFontSize(size: number): void
    splitTextToSize(text: string, maxlen: number): string[]
    text(text: string | string[], x: number, y: number): void
    save(filename: string): void
  }
  export { jsPDF }
} 