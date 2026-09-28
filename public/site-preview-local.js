// Keep live links on published hosts; use the local Vite preview only for local sandbox runs.
(() => {
  const localHosts = new Set(["localhost", "127.0.0.1"]);
  if (!localHosts.has(window.location.hostname)) return;

  const localSiteBase = `http://${window.location.hostname}:8080/?site=`;
  document.querySelectorAll("[data-site-preview]").forEach((link) => {
    link.href = `${localSiteBase}${link.dataset.sitePreview}`;
  });
})();
