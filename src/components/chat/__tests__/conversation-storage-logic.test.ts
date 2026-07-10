import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat/types";
import {
  buildChatRequestBody,
  deleteSucceeded,
  linkedConversationToken,
  NOTICE_DEFAULT,
  NOTICE_PRIVATE,
  noticeText,
} from "../conversationStorage";

const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

describe("buildChatRequestBody", () => {
  it("always includes messages and the per-send turnId", () => {
    expect(buildChatRequestBody({ messages, turnId: "t1" })).toEqual({
      messages,
      turnId: "t1",
    });
  });

  it("includes the conversation token when one is present", () => {
    expect(
      buildChatRequestBody({ messages, turnId: "t1", conversationToken: "tok" }),
    ).toEqual({ messages, turnId: "t1", conversationToken: "tok" });
  });

  it.each([null, undefined, ""])(
    "omits an absent conversation token (%j) rather than sending a falsy value",
    (token) => {
      const body = buildChatRequestBody({
        messages,
        turnId: "t1",
        conversationToken: token,
      });
      expect("conversationToken" in body).toBe(false);
    },
  );

  it("sends private:true only when private mode is on", () => {
    expect(
      buildChatRequestBody({ messages, turnId: "t1", privateMode: true })
        .private,
    ).toBe(true);
  });

  it.each([false, undefined])(
    "omits the private flag when private mode is %j",
    (privateMode) => {
      const body = buildChatRequestBody({ messages, turnId: "t1", privateMode });
      expect("private" in body).toBe(false);
    },
  );
});

describe("noticeText", () => {
  it("shows the saved-chats notice when private mode is off", () => {
    expect(noticeText(false)).toBe(NOTICE_DEFAULT);
  });

  it("flips the first clause when private mode is on", () => {
    expect(noticeText(true)).toBe(NOTICE_PRIVATE);
  });
});

describe("linkedConversationToken", () => {
  it("links the token when private mode is off and a token exists", () => {
    expect(linkedConversationToken(false, "tok")).toBe("tok");
  });

  it("does not link when private mode is on (lead stored but unlinked)", () => {
    expect(linkedConversationToken(true, "tok")).toBeUndefined();
  });

  it.each([null, undefined, ""])(
    "does not link when there is no token (%j)",
    (token) => {
      expect(linkedConversationToken(false, token)).toBeUndefined();
    },
  );
});

describe("deleteSucceeded", () => {
  it("is true only for a well-formed { ok: true } body", () => {
    expect(deleteSucceeded({ ok: true })).toBe(true);
  });

  it.each([{ ok: false }, {}, null, undefined, "ok", 1, { ok: "true" }])(
    "is false for anything else (%j)",
    (body) => {
      expect(deleteSucceeded(body)).toBe(false);
    },
  );
});
