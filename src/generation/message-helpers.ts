export interface CommitPromptMessage {
  role: 'system' | 'user';
  content: string;
}

export function buildCommitMessages(
  systemPrompt: string,
  diff: string,
  additionalContext?: string
): CommitPromptMessage[] {
  const messages: CommitPromptMessage[] = [
    { role: 'system', content: systemPrompt }
  ];

  if (additionalContext) {
    messages.push({
      role: 'user',
      content: `Additional context for the changes:\n${additionalContext}`
    });
  }

  messages.push({ role: 'user', content: diff });
  return messages;
}

export function cleanCommitMessage(value: string): string {
  return value.replace(/<think>.*?<\/think>/gs, '').trim();
}
