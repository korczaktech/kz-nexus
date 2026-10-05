export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & {standalone?: boolean}).standalone === true;

export type IOSRuntimeState = {
  ios: boolean;
  standalone: boolean;
  online: boolean;
  serviceWorker: boolean;
};

export function getIOSRuntimeState(): IOSRuntimeState {
  return {ios:isIOS,standalone:isStandalone,online:navigator.onLine,serviceWorker:"serviceWorker" in navigator};
}

export function installIOSRuntime() {
  if(!isIOS)return;
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