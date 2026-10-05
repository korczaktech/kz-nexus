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

export async function registerIOSServiceWorker() {
  if (!isIOS || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("./sw.js",{scope:"./"});
    if (registration.waiting) registration.waiting.postMessage({type:"SKIP_WAITING"});
    registration.addEventListener("updatefound",()=>{
      const worker=registration.installing;
      if(!worker)return;
      worker.addEventListener("statechange",()=>{
        if(worker.state==="installed" && navigator.serviceWorker.controller)
          window.dispatchEvent(new CustomEvent("nexusPwaUpdate"));
      });
    });
    return registration;
  } catch { return null; }
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