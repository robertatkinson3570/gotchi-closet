// JSX typing for the <model-viewer> web component (@google/model-viewer).
// Attributes are the kebab-case HTML attributes, not the class properties.
declare namespace JSX {
  interface IntrinsicElements {
    "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      poster?: string;
      alt?: string;
      "camera-controls"?: string;
      "auto-rotate"?: string;
      "rotation-per-second"?: string;
      "shadow-intensity"?: string;
      "interaction-prompt"?: string;
      "touch-action"?: string;
      "disable-zoom"?: string;
      loading?: string;
      exposure?: string;
      class?: string;
    };
  }
}
