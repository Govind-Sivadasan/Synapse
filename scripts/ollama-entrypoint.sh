#!/bin/sh
# Start Ollama and pull the chatbot model only if it is not already in the volume.

MODEL="${OLLAMA_MODEL:-qwen2.5:7b-instruct}"

ollama serve &
SERVE_PID=$!

echo "Waiting for Ollama API..."
until ollama list >/dev/null 2>&1; do
  sleep 1
done

if ollama list 2>/dev/null | grep -qF "$MODEL"; then
  echo "Model already present: $MODEL"
else
  echo "Pulling model in background: $MODEL"
  echo "Monitor progress: docker logs -f synapse-ollama"
  ollama pull "$MODEL" &
fi

wait "$SERVE_PID"
