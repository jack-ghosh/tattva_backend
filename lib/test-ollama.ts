async function ollamaResponse() {
    const response = await fetch("http://localhost:11434/api/generate", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'mistral',
            prompt: 'What is 2+638?',
            stream: false,
        }),
    });
    return response.json();
}

(async () => {
    const data = await ollamaResponse();
    console.log(data);
})();