(function () {
  "use strict";

  const STORAGE_KEY = "wa-sidebar-hidden";

  const ICON_SIDEBAR =
    '<svg viewBox="0 0 24 24" height="24" width="24" fill="none">' +
    '<path fill-rule="evenodd" clip-rule="evenodd" ' +
    'd="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm5 2H4v12h5V6zm2 0v12h9V6h-9z" ' +
    'fill="currentColor"/></svg>';

  let sidebarPanel = null;
  let sidebarOverlay = null;
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
   * WhatsApp renders a full-width overlay layer behind the sidebar.
   * When the sidebar is hidden this overlay leaves a visible gray line.
   * We find it by looking for a sibling of the sidebar panel (inside .two)
   * that contains a child with the same leading class name.
   */
  function findSidebarOverlay(panel) {
    const twoEl = document.querySelector(".two");
    if (!twoEl || !panel) return null;

    const panelClass = panel.className.split(" ")[0];
    const children = twoEl.children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child === panel || child.tagName !== "DIV") continue;
      if (child.querySelector("." + panelClass)) return child;
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

    if (sidebarOverlay) {
      sidebarOverlay.classList.toggle("wa-sidebar-overlay-hidden", isHidden);
    }

    if (toggleBtn) {
      toggleBtn.classList.toggle("wa-sidebar-is-hidden", isHidden);
      toggleBtn.setAttribute("aria-pressed", String(isHidden));
      const label = isHidden ? "Show sidebar (Ctrl+B)" : "Hide sidebar (Ctrl+B)";
      toggleBtn.title = label;
      toggleBtn.setAttribute("aria-label", label);
    }
  }

  function toggleSidebar() {
    isHidden = !isHidden;
    localStorage.setItem(STORAGE_KEY, isHidden);
    applySidebarState();
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
    sidebarOverlay = findSidebarOverlay(sidebarPanel);

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
