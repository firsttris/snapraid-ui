// Messages from the backend to the UI. The texts live in frontend/messages/*.json
// (Paraglide). The backend does not know the viewer's language, so it sends the
// key and its inputs, marked as \u0002["key",{…}]\u0003, and the frontend renders
// them in the language of the UI (frontend/src/lib/i18n.ts). Plain text, such as
// SnapRAID's own output, passes through unchanged.
//
// Notifications are the exception: they leave the server by mail, ntfy or
// webhook in the language set for them (backend/src/notification-events.ts).

export type MsgInputs = Record<string, string | number>;

/** A message for the UI by key; see the top of this file. */
export const msg = (key: string, inputs: MsgInputs = {}): string =>
  `\u0002${JSON.stringify([key, inputs])}\u0003`;

const MARKED = /\u0002([^\u0003]*)\u0003/g;

/**
 * Renders the marked messages in a text. `render` returns undefined for an
 * unknown key, which then shows as the key itself. Inputs can be marked
 * messages themselves (a reason inside an error).
 */
export function localize(
  text: string,
  render: (key: string, inputs: MsgInputs) => string | undefined,
): string {
  if (!text.includes("\u0002")) return text;
  return text.replace(MARKED, (whole, body: string) => {
    try {
      const [key, inputs] = JSON.parse(body) as [string, MsgInputs];
      const resolved = Object.fromEntries(
        Object.entries(inputs ?? {}).map((
          [k, v],
        ) => [k, typeof v === "string" ? localize(v, render) : v]),
      );
      return render(key, resolved) ?? key;
    } catch {
      return whole;
    }
  });
}
