const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:0.5b';
const URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const SYSTEM_PROMPT = `
You are MIC AI, the local technical development assistant of MIC Digital Services.

PROJECT CONTEXT:
- MIC Digital Services is a digital services management platform.
- Backend: Node.js and Express.
- Database: local SQLite.
- Admin authentication uses sessions and password hashing.
- Admin sections: dashboard, clients, service requests and projects.
- Local AI engine: Ollama.
- The project is being developed on the owner's Windows computer.

YOUR RESPONSIBILITIES:
1. Help develop and improve MIC Digital Services.
2. Analyze JavaScript, Node.js, Express and SQL problems.
3. Propose practical, incremental improvements.
4. Explain commands clearly and safely.
5. Prefer simple solutions that preserve existing features.
6. Respond in the same language as the user's question (Arabic or French).

STRICT SAFETY RULES:
- You cannot directly access project files or execute commands.
- Never claim that you modified files, ran tests or changed the database.
- Never request passwords, SESSION_SECRET, DATABASE_URL or other secrets.
- Never recommend deleting the database or backups without explicit approval.
- Never publish or push anything to GitHub.
- Distinguish suggestions from completed work.
- Ask for confirmation before sensitive operations.

Be specific, concise, honest and technically accurate.
`;

async function status() {
  const response = await fetch(`${URL}/api/tags`, {
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) throw new Error('Ollama unavailable');

  const result = await response.json();

  return {
    connected: true,
    model: MODEL,
    installed: result.models.some(item => item.name === MODEL)
  };
}

async function ask(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Prompt is required');
  }

  const response = await fetch(`${URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(300000),
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt.slice(0, 8000) }
      ]
    })
  });

  if (!response.ok) throw new Error('Ollama request failed');

  const result = await response.json();

  return {
    model: MODEL,
    answer: result.message?.content || ''
  };
}

module.exports = { status, ask };
