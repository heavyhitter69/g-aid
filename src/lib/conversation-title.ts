const PLACEHOLDER = /^(new conversation|new agent|new analysis)$/i;

export function isPlaceholderTopic(topic?: string): boolean {
  return !topic || PLACEHOLDER.test(topic.trim());
}

export function conversationTitleFromText(raw: string): string {
  let text = (raw || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<思考>[\s\S]*?<\/思考>/gi, "")
    .split(/\n\n--- (?:Workspace|File Context) ---/)[0]
    .replace(/^@[^\s]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const words = text.split(" ").filter(Boolean).slice(0, 8);
  let title = words.join(" ");
  title = title.replace(/^["'“”‘’#*\-\s]+|["'“”‘’.,:;!?]+$/g, "").trim();
  if (title.length > 52) title = `${title.slice(0, 49)}…`;
  return title;
}

export function displayConversationTopic(topic: string | undefined, firstUserText?: string): string {
  if (!isPlaceholderTopic(topic)) return topic!.trim();
  return conversationTitleFromText(firstUserText || "") || topic?.trim() || "New conversation";
}
