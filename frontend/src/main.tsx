import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./ios.css";
import App from "./App";
import { installIOSRuntime } from "./iosPwa";
import { flushIOSOperationQueue } from "./services/iosSync";
import { API_BASE_URL, getToken } from "./services/api";

installIOSRuntime();

const syncIOS = () => flushIOSOperationQueue(API_BASE_URL, getToken).catch(() => undefined);
window.addEventListener("online", syncIOS, { passive: true });
window.addEventListener("nexusIOSSyncQueued", syncIOS, { passive: true });
if (navigator.onLine) window.addEventListener("load", syncIOS, { once: true });

const root = createRoot(document.getElementById("root")!);
root.render(<StrictMode><App /></StrictMode>);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { scope: import.meta.env.BASE_URL }
      );

      // Safari/Chrome manage the PWA update lifecycle automatically.
      registration.update();
    } catch (error) {
      console.warn("KZ Nexus PWA: não foi possível registrar o Service Worker.", error);
    }
  });
}
