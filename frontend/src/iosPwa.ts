export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & {standalone?: boolean}).standalone === true;

export function installIOSRuntime() {
  if (!isIOS) return;
  document.documentElement.classList.add("ios-pwa");
  document.documentElement.dataset.iosStandalone = String(isStandalone);
  const setViewport = () => {
    document.documentElement.style.setProperty("--ios-vh", `${window.innerHeight}px`);
  };
  setViewport();
  window.addEventListener("resize", setViewport, {passive:true});
  window.addEventListener("orientationchange", setViewport, {passive:true});
  window.addEventListener("pageshow", setViewport, {passive:true});
}
