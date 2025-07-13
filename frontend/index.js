// ✅ DOM Elements
const chatContainer = document.getElementById("chatContainer");
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");

// ✅ Add Message to UI
function addMessage(content, sender = 'user') {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${sender}`;
  msgDiv.innerText = content;
  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ✅ Show Typing...
function addTypingIndicator() {
  const typing = document.createElement("div");
  typing.id = "typing";
  typing.className = "message ai";
  typing.innerText = "Typing...";
  chatContainer.appendChild(typing);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ✅ Remove Typing...
function removeTypingIndicator() {
  const typing = document.getElementById("typing");
  if (typing) typing.remove();
}

// ✅ Send Message
async function sendMessage() {
  const message = input.value.trim();
  if (!message) return;

  addMessage(message, "user");
  input.value = "";
  addTypingIndicator();

  try {
    const res = await fetch("http://localhost:3000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message })
    });

    // ✅ Streaming text from backend
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;

      const typingElem = document.getElementById("typing");
      if (typingElem) typingElem.innerText = fullText;
    }

    removeTypingIndicator();
    addMessage(fullText.trim(), "ai");

  } catch (err) {
    removeTypingIndicator();
    addMessage("❌ Error: " + err.message, "error");
  }
}

// ✅ Enter key to send
input.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

// ✅ Mic / Voice Input (Speech Recognition)
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';

  micBtn.addEventListener('click', () => {
    recognition.start();
    micBtn.innerText = '🎙️ Listening...';
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    micBtn.innerText = '🎤';
    sendMessage();
  };

  recognition.onerror = () => {
    micBtn.innerText = '🎤';
    alert('❌ Voice recognition error.');
  };

  recognition.onend = () => {
    micBtn.innerText = '🎤';
  };
} else {
  micBtn.disabled = true;
  micBtn.title = '❌ Mic not supported';
}
