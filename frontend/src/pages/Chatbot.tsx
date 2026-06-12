import { Bot } from "lucide-react";
import PlaceholderPage from "./PlaceholderPage";

export default function Chatbot() {
  return (
    <PlaceholderPage
      title="Service Chatbot"
      description="Natural language queries for study lookup, routing status, and migration progress via Ollama."
      icon={Bot}
      phase="Phase 6"
    />
  );
}
