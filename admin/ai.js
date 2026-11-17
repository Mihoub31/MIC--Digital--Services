(function () {
  const statusEl = document.getElementById("aiStatus");
  const messagesEl = document.getElementById("aiMessages");
  const form = document.getElementById("aiForm");
  const input = document.getElementById("aiPrompt");
  const sendBtn = document.getElementById("aiSend");

  function addMessage(role, text) {
    const item = document.createElement("div");
    item.className = "ai-message " + role;
    item.textContent = text;
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return item;
  }

  async function checkStatus() {
    try {
      const response = await fetch("/api/ai/status", {
        credentials: "same-origin",
        cache: "no-store"
      });
      const data = await response.json();

      if (response.status === 401) {
        location.href = "/admin/login";
        return;
      }

      if (!response.ok || !data.connected || !data.installed) {
        throw new Error("Ollama or model unavailable");
      }

      statusEl.textContent = "متصل — " + data.model;
      statusEl.className = "ai-status online";
    } catch {
      statusEl.textContent = "غير متصل";
      statusEl.className = "ai-status offline";
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const prompt = input.value.trim();
    if (!prompt || sendBtn.disabled) return;

    addMessage("user", prompt);
    input.value = "";
    sendBtn.disabled = true;
    sendBtn.textContent = "جارٍ التفكير...";

    const answerEl = addMessage("assistant", "أنتظر إجابة Ollama...");

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();

      if (response.status === 401) {
        location.href = "/admin/login";
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "AI request failed");
      }

      answerEl.textContent = data.answer || "لم تصل إجابة.";
    } catch (error) {
      answerEl.textContent = "حدث خطأ: " + error.message;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "إرسال";
      input.focus();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  checkStatus();
})();
