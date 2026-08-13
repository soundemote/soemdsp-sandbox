// Boot SoundColorWidget onto window so classic scripts (module-scopes, etc.)
// can mount it without document-relative dynamic import path bugs.
import { SoundColorWidget, hslToHex, mountColorWidget } from "./color-widget.js?v=color-hover-nostroke-1";

if (typeof window !== "undefined") {
  window.SoundColorWidget = SoundColorWidget;
  window.hslToHex = hslToHex;
  window.mountColorWidget = mountColorWidget;
  window.dispatchEvent(new CustomEvent("color-widget-ready"));
}
