const hasBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";
const userAgent = hasBrowser ? navigator.userAgent : "";
const platform = hasBrowser ? navigator.platform : "";
const maxTouchPoints = hasBrowser ? navigator.maxTouchPoints : 0;

export const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
export const isStandalone = hasBrowser && (
  (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
  (navigator as Navigator & {standalone?: boolean}).standalone === true
);

export type IOSRuntimeState = {
  ios: boolean;
  standalone: boolean;
  online: boolean;
  serviceWorker: boolean;
};

export function getIOSRuntimeState(): IOSRuntimeState {
  return {
    ios: isIOS,
    standalone: isStandalone,
    online: hasBrowser ? navigator.onLine : true,
    serviceWorker: hasBrowser && "serviceWorker" in navigator
  };
}

export function installIOSRuntime() {
  if(!isIOS || typeof document === "undefined" || typeof window === "undefined") return;
  document.documentElement.classList.add("ios-pwa");
  document.documentElement.dataset.iosStandalone=String(isStandalone);
  const setViewport=()=>document.documentElement.style.setProperty("--ios-vh",`${window.innerHeight}px`);
  const publish=()=>window.dispatchEvent(new CustomEvent("nexusIOSRuntime",{detail:getIOSRuntimeState()}));
  setViewport(); publish();
  window.addEventListener("resize",setViewport,{passive:true});
  window.addEventListener("orientationchange",setViewport,{passive:true});
  window.addEventListener("pageshow",setViewport,{passive:true});
  window.addEventListener("online",publish,{passive:true});
  window.addEventListener("offline",publish,{passive:true});
}
