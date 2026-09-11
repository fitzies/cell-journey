import { describe, expect, test } from 'vitest';
import { authConnectionMessage, codeVerificationError, groupJoinError } from '../apps/mobile/src/lib/email-auth';

const wrapped = (message: string) => new Error(`[CONVEX A(auth:signIn)] [Request ID: private-request-id] Server Error\nUncaught Error: ${message}\n    at handler (../convex/example.ts:42:3)`);

describe('mobile authentication feedback', () => {
  test.each([
    'The dev test group belongs to another profile',
    'The reserved dev group code is already in use',
    'Multiple groups use the reserved dev group code',
  ])('distinguishes accepted dev credentials from provisioning failure: %s', (message) => {
    const result = codeVerificationError(wrapped(message), true);
    expect(result).toContain('DEV001 group setup');
    expect(result).toContain('Your code was accepted');
    expect(result).not.toContain('incorrect');
    expect(result).not.toContain('private-request-id');
  });

  test('keeps invalid credentials and rate limits distinct', () => {
    expect(codeVerificationError(wrapped('Invalid dev login credentials'), true)).toContain('code is incorrect');
    expect(codeVerificationError(wrapped('Too many incorrect attempts'), true)).toContain('Too many attempts');
    expect(codeVerificationError(wrapped('Invalid verification code'))).toContain('incorrect or has expired');
  });

  test('does not expose development setup details for ordinary email sign-in', () => {
    expect(codeVerificationError(wrapped('The dev test group belongs to another profile'))).not.toContain('DEV001');
  });

  test('explains retry before submitting and automatic recovery for pending requests', () => {
    expect(authConnectionMessage(false, false, false)).toContain('try again');
    expect(authConnectionMessage(false, true, false)).toContain('continue automatically');
    expect(authConnectionMessage(false, true, false)).not.toContain('try again');
    expect(authConnectionMessage(true, true, true)).toContain('still pending');
    expect(authConnectionMessage(true, true, false)).toBeNull();
    expect(authConnectionMessage(true, false, true)).toBeNull();
  });
});

describe('group join error messages', () => {
  test('turns the duplicate membership backend error into useful copy', () => {
    expect(groupJoinError(wrapped('Already connected to this group'))).toBe("You're already a member of this group. Choose a different group code.");
  });

  test.each(['Complete your profile before joining a group', 'Invalid group code', 'Unexpected database failure'])('never displays request identifiers or server traces: %s', (message) => {
    const result = groupJoinError(wrapped(message));
    expect(result).not.toContain('private-request-id');
    expect(result).not.toContain('Uncaught');
    expect(result).not.toContain('example.ts');
  });
});
