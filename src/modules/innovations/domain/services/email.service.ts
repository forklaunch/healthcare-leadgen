import { OpenTelemetryCollector } from '@forklaunch/core/http';
import { Metrics } from '@uchicago-ideas/monitoring';
import { getOrganization, type Organization } from '../organizations';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Delivers secure-access-key emails via Resend when RESEND_API_KEY is
 * configured. Without a key (local dev), the message is written to the
 * service log — treat the log as the dev outbox. The plaintext access key
 * only ever travels in the email (or dev log); the database stores its hash.
 *
 * Emails are tenant-aware: the greeting, subject, and magic-link target come
 * from the recipient's organization. Recipients are addressed by name with
 * no honorific — the program serves all healthcare professionals, not only
 * physicians.
 *
 * Until a sending domain is verified in Resend, use the default
 * `onboarding@resend.dev` from-address — Resend test mode only delivers to
 * the account owner's own email address.
 */
export class EmailService {
  constructor(
    private readonly openTelemetryCollector: OpenTelemetryCollector<Metrics>,
    private readonly resendApiKey: string,
    private readonly emailFrom: string
  ) {}

  async sendAccessKeyEmail(
    to: string,
    name: string,
    accessKey: string,
    expiresAt: Date,
    organization: Organization = getOrganization()
  ): Promise<void> {
    // Each organization deploys its own portal frontend; the registry
    // carries its URL (env-overridable per org via PORTAL_URL_<SLUG>).
    const magicLink = `${organization.portalUrl}/?key=${accessKey}`;
    const expiry = expiresAt.toISOString().slice(0, 10);
    const subject = `Your ${organization.displayName} Ideas Portal access key`;

    if (!this.resendApiKey) {
      this.openTelemetryCollector.info(
        [
          '[email outbox] (RESEND_API_KEY not set — logging instead of sending)',
          `[email outbox] Subject: ${subject}`,
          `[email outbox] Hi ${name}, use this secure link to access the Ideas Portal:`,
          `[email outbox]   ${magicLink}`,
          `[email outbox] The link expires ${expiry}. Do not forward it.`
        ].join('\n')
      );
      return;
    }

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: this.emailFrom,
        to: [to],
        subject,
        html: [
          `<p>Hi ${escapeHtml(name)},</p>`,
          `<p>Use this secure link to access the ${escapeHtml(organization.displayName)} Ideas Portal:</p>`,
          `<p><a href="${magicLink}">Open the Ideas Portal</a></p>`,
          `<p>The link is your personal access key. It expires on ${expiry}. ` +
            `Please do not forward this email.</p>`,
          `<p>&mdash; ${escapeHtml(organization.displayName)} Ideas Program</p>`
        ].join('\n'),
        text: [
          `Hi ${name},`,
          '',
          `Use this secure link to access the ${organization.displayName} Ideas Portal:`,
          magicLink,
          '',
          `The link is your personal access key. It expires on ${expiry}. Please do not forward this email.`,
          '',
          `— ${organization.displayName} Ideas Program`
        ].join('\n')
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      // Do not fail the access request silently — surface delivery failures
      // to the log (without the recipient address or the key).
      this.openTelemetryCollector.error(
        `[email] Resend delivery failed (${response.status}): ${detail.slice(0, 300)}`
      );
      throw new Error('Access key email could not be delivered');
    }

    this.openTelemetryCollector.info('[email] Access key email delivered via Resend');
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
