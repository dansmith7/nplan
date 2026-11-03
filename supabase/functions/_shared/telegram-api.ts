export class TelegramError extends Error {
  constructor(public readonly unknownDelivery: boolean) {
    super("Telegram request failed");
  }
}
export function telegramApi(token: string, request: typeof fetch = fetch) {
  async function call(
    method: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await request(
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        }
      );
    } catch {
      throw new TelegramError(true);
    }
    let data: {
      ok?: boolean;
      result?: Record<string, unknown>;
      description?: string;
    };
    try {
      data = await response.json();
    } catch {
      throw new TelegramError(true);
    }
    if (response.ok && data.ok) return data.result ?? {};
    if (
      method.startsWith("edit") &&
      data.description?.includes("message is not modified")
    )
      return {};
    throw new TelegramError(data.ok !== false);
  }
  return {
    call,
    send: async (chatId: string, text: string, replyMarkup?: unknown) => {
      const result = await call("sendMessage", {
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        link_preview_options: { is_disabled: true },
      });
      if (typeof result.message_id !== "number") throw new TelegramError(true);
      return result.message_id;
    },
    edit: (
      chatId: string,
      messageId: number,
      text: string,
      replyMarkup: unknown
    ) =>
      call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
        link_preview_options: { is_disabled: true },
      }),
    answer: (id: string, text?: string) =>
      call("answerCallbackQuery", {
        callback_query_id: id,
        ...(text ? { text } : {}),
      }),
  };
}
export type TelegramApi = ReturnType<typeof telegramApi>;
