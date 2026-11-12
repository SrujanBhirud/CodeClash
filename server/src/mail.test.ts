import { describe, expect, it } from 'vitest';
import { localInbox, MailConfigError, mailSettings } from './mail.js';

describe('mailSettings', () => {
  it('keeps the local Mailpit address on port 1025 with no login', () => {
    expect(mailSettings('smtp://127.0.0.1:1025')).toMatchObject({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      auth: undefined,
      requireTLS: false,
    });
  });

  it('uses STARTTLS on port 587 and decodes the password', () => {
    expect(mailSettings('smtp://user:p%40ss@smtp-relay.brevo.com:587')).toMatchObject({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'p@ss' },
      requireTLS: true,
      connectionTimeout: 10_000,
    });
  });

  it('treats smtps as implicit TLS on port 465', () => {
    expect(mailSettings('smtps://user:secret@smtp.example.com')).toMatchObject({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      requireTLS: false,
    });
  });

  it('refuses port 25', () => {
    expect(() => mailSettings('smtp://user:secret@smtp.example.com:25')).toThrow(MailConfigError);
  });

  it('names the local inbox only for Mailpit', () => {
    expect(localInbox('smtp://127.0.0.1:1025')).toBe('http://127.0.0.1:8025');
    expect(localInbox('smtp://user:secret@smtp-relay.brevo.com:587')).toBeNull();
    expect(localInbox(undefined)).toBeNull();
  });
});
