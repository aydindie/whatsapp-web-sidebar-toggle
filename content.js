(function () {
  "use strict";

  const STORAGE_KEY = "wa-sidebar-hidden";

  const ICON_SIDEBAR =
    '<svg viewBox="0 0 24 24" height="24" width="24" fill="none">' +
    '<path fill-rule="evenodd" clip-rule="evenodd" ' +
    'd="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm5 2H4v12h5V6zm2 0v12h9V6h-9z" ' +
    'fill="currentColor"/></svg>';

  let sidebarPanel = null;
  let mediaLayer = null;
  let toggleBtn = null;
  let isHidden = localStorage.getItem(STORAGE_KEY) === "true";

  /**
   * #side is a stable ID in WhatsApp Web's DOM.
   * Its parent element is the sidebar panel containing the header and chat list.
   */
  function findSidebarPanel() {
    const side = document.querySelector("#side");
    return side ? side.parentElement : null;
  }

  /**
   * WhatsApp mounts the media editor and camera view into an absolutely
   * positioned, full-width layer inside .two. Its inner panel is offset from
   * the left by the sidebar's width, so with the sidebar hidden the media view
   * is pushed to the right and leaves the chat area exposed behind it.
   *
   * We identify the layer structurally (absolute, spans the viewport, not the
   * sidebar panel itself) rather than by WhatsApp's generated class names.
   */
  function findMediaLayer(panel) {
    const twoEl = document.querySelector(".two");
    if (!twoEl || !panel) return null;

    const children = twoEl.children;
    const twoRect = twoEl.getBoundingClientRect();

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child === panel || child.tagName !== "DIV") continue;
      if (getComputedStyle(child).position !== "absolute") continue;

      // The portal layer spans the full window, starting at the very left
      // edge — unlike the chat pane, which begins after the nav rail.
      const rect = child.getBoundingClientRect();
      if (rect.left > twoRect.left + 1) continue;
      if (rect.width < twoRect.width - 1) continue;
      return child;
    }
    return null;
  }

  /** data-tab="2" targets the persistent left navigation header. */
  function findNavHeader() {
    return document.querySelector('header[data-tab="2"]');
  }

  function applySidebarState() {
    if (!sidebarPanel) return;

    sidebarPanel.classList.toggle("wa-sidebar-hidden", isHidden);

    // WhatsApp may re-render the layer, so re-resolve it each time.
    if (!mediaLayer || !mediaLayer.isConnected) {
      mediaLayer = findMediaLayer(sidebarPanel);
    }
    if (mediaLayer) {
      mediaLayer.classList.toggle("wa-media-layer-full", isHidden);
    }

    if (toggleBtn) {
      toggleBtn.classList.toggle("wa-sidebar-is-hidden", isHidden);
      toggleBtn.setAttribute("aria-pressed", String(isHidden));
      const label = isHidden ? "Show sidebar (Ctrl+B)" : "Hide sidebar (Ctrl+B)";
      toggleBtn.title = label;
      toggleBtn.setAttribute("aria-label", label);
    }
  }

  /**
   * WhatsApp sizes the camera preview from a cached layout measurement, so a
   * panel that changes width while the camera is open keeps the old video
   * size. A resize event makes WhatsApp remeasure. Fired after the CSS width
   * transition finishes so it reads the final size.
   */
  function notifyLayoutChange() {
    setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
    }, 300);
  }

  function toggleSidebar() {
    isHidden = !isHidden;
    localStorage.setItem(STORAGE_KEY, isHidden);
    applySidebarState();
    notifyLayoutChange();
  }

  /**
   * Injects a toggle button into the left navigation bar (header[data-tab="2"]).
   * The nav bar has two sections: top (main tabs) and bottom (utilities).
   * We prepend the button to the bottom section.
   */
  function createToggleButton(navHeader) {
    if (document.querySelector(".wa-toggle-btn")) return;

    toggleBtn = document.createElement("button");
    toggleBtn.className = "wa-toggle-btn";
    toggleBtn.innerHTML = ICON_SIDEBAR;
    toggleBtn.setAttribute("aria-label", "Hide sidebar (Ctrl+B)");
    toggleBtn.setAttribute("aria-pressed", "false");
    toggleBtn.setAttribute("tabindex", "-1");
    toggleBtn.title = "Hide sidebar (Ctrl+B)";
    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleSidebar();
    });

    const wrapper = document.createElement("div");
    wrapper.className = "wa-toggle-wrapper";
    wrapper.appendChild(toggleBtn);

    const mainDiv = navHeader.querySelector(":scope > div");
    if (!mainDiv) {
      navHeader.appendChild(wrapper);
      return;
    }

    // Bottom section is the last child DIV of the nav container
    let bottomSection = null;
    for (let i = mainDiv.children.length - 1; i >= 0; i--) {
      if (mainDiv.children[i].tagName === "DIV") {
        bottomSection = mainDiv.children[i];
        break;
      }
    }

    if (bottomSection) {
      bottomSection.insertBefore(wrapper, bottomSection.firstChild);
    } else {
      mainDiv.appendChild(wrapper);
    }
  }

  function init() {
    sidebarPanel = findSidebarPanel();
    if (!sidebarPanel) return false;

    const navHeader = findNavHeader();
    if (!navHeader) return false;

    sidebarPanel.classList.add("wa-sidebar-panel");
    mediaLayer = findMediaLayer(sidebarPanel);

    createToggleButton(navHeader);
    applySidebarState();
    return true;
  }

  // --- MutationObserver: wait for WhatsApp to finish rendering ---
  let initDone = false;

  const observer = new MutationObserver(function () {
    if (initDone) return;
    if (!document.querySelector("#side") || !document.querySelector('header[data-tab="2"]')) return;

    setTimeout(function () {
      if (init()) {
        initDone = true;
        observer.disconnect();
      }
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Try immediate init in case elements are already present
  if (init()) {
    initDone = true;
    observer.disconnect();
  }

  // Stop observing after 30s to prevent leaks
  setTimeout(function () {
    if (!initDone) {
      observer.disconnect();
    }
  }, 30000);

  // --- Keyboard shortcut: Ctrl+B ---
  document.addEventListener("keydown", function (e) {
    if (!e.ctrlKey || e.key !== "b" || e.shiftKey || e.altKey || e.metaKey) return;

    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

    e.preventDefault();
    toggleSidebar();
  });

  // --- Re-init if WhatsApp re-renders the sidebar ---
  const reInitObserver = new MutationObserver(function () {
    if (!document.querySelector(".wa-toggle-btn") && document.querySelector("#side")) {
      init();
    }
  });

  setTimeout(function () {
    reInitObserver.observe(document.body, { childList: true, subtree: true });
  }, 5000);
})();
