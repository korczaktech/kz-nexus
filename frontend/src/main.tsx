import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./ios.css";
import App from "./App";
import { installIOSRuntime } from "./iosPwa";

installIOSRuntime();

const root = createRoot(document.getElementById("root")!);
root.render(<StrictMode><App /></StrictMode>);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { scope: import.meta.env.BASE_URL }
      );

      // Safari/Chrome manage the PWA update lifecycle automatically.\n      registration.update();

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("kz:nexus-update-available"));
          }
        });
      });
    } catch (error) {
      console.warn("KZ Nexus PWA: não foi possível registrar o Service Worker.", error);
    }
  });
}
