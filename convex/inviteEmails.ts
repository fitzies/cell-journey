import { Resend } from "resend";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

const DEFAULT_EMAIL_FROM = "Cell Journey <onboarding@resend.dev>";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function groupInviteEmailContent(args: {
  email: string;
  firstName: string;
  groupName: string;
  addedByName: string | null;
  isNewAccount: boolean;
}) {
  const addedBy = args.addedByName ? `${args.addedByName} added you` : "You've been added";
  const subject = `You've been added to ${args.groupName} on Cell Journey`;
  const action = args.isNewAccount
    ? `Download the Cell Journey app and sign in with ${args.email} to see your group's schedule and attendance.`
    : `Open the Cell Journey app to see ${args.groupName} in your groups.`;
  const text = `Hi ${args.firstName},\n\n${addedBy} to ${args.groupName} on Cell Journey.\n\n${action}\n`;
  const html = `<p>Hi ${escapeHtml(args.firstName)},</p>
<p>${escapeHtml(addedBy)} to <strong>${escapeHtml(args.groupName)}</strong> on Cell Journey.</p>
<p>${escapeHtml(action)}</p>`;
  return { subject, text, html };
}

export const sendGroupInvite = internalAction({
  args: {
    email: v.string(),
    firstName: v.string(),
    groupName: v.string(),
    addedByName: v.union(v.string(), v.null()),
    isNewAccount: v.boolean(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      console.warn("AUTH_RESEND_KEY is not set; skipped group invite email.");
      return null;
    }
    const { subject, text, html } = groupInviteEmailContent(args);
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.AUTH_EMAIL?.trim() || DEFAULT_EMAIL_FROM,
      to: [args.email],
      subject,
      text,
      html,
    });
    if (error) console.error("Group invite email failed", error);
    return null;
  },
});
