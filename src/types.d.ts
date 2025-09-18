declare module 'marked' {
  export function parse(md: string): string;
  export const marked: { parse: (md: string) => string };
  export default { parse };
}

declare module 'dompurify' {
  const DOMPurify: {
    sanitize(input: string): string;
  };
  export default DOMPurify;
}

// Allow importing the public logo as a string via the '@logo' alias
declare module '@logo' {
  const value: string
  export default value
}

// Augment global Window with AudioContext properties for cross-browser support
declare global {
  interface Window {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
}

export {} 