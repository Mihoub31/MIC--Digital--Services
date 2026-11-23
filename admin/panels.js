(() => {
  document.querySelectorAll(".menu button[data-panel]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.panel;

      if (id === "ai" && typeof window.showAIPanel === "function") {
        window.showAIPanel(button);
        return;
      }

      if (id === "audit" && typeof window.showAuditPanel === "function") {
        window.showAuditPanel(button);
        return;
      }

      if (id === "agent" && typeof window.showAgentPanel === "function") {
        window.showAgentPanel(button);
        return;
      }

      if (id === "graph" && typeof window.showGraphPanel === "function") {
        window.showGraphPanel(button);
        return;
      }

      if (typeof window.showPanel === "function") {
        window.showPanel(id, button);
      }
    });
  });
})();
