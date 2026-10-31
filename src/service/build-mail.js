// Turns a platform signup payload into a SendGrid Mail Send request body.
// This is the mapping described in docs/INTEGRATION.md section 4, as code,
// so the doc, the sandbox test and the unit checks all use the same logic.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trimmed string, or undefined if missing/blank. Undefined keys are dropped
// by JSON.stringify, so the template's {{#if}} fallbacks take over.
function clean(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// SendGrid's equals helper is an exact, case-sensitive match, so
// " Enterprise " must become "enterprise" before it reaches the template.
function normalise(value) {
  const cleaned = clean(value);
  return cleaned && cleaned.toLowerCase();
}

class ValidationError extends Error {}

function validateSignup(signup) {
  const problems = [];
  if (!clean(signup.user_id)) problems.push("user_id is required");
  if (!clean(signup.email) || !EMAIL_PATTERN.test(signup.email.trim())) problems.push("email is missing or invalid");
  if (!clean(signup.signup_date) || Number.isNaN(Date.parse(signup.signup_date))) problems.push("signup_date must be ISO 8601");
  if (problems.length) throw new ValidationError(problems.join("; "));
}

/**
 * @param {object} signup      the webhook's data object
 * @param {object} template    one entry from src/templates.config.json
 * @param {object} settings    { templateId, asmGroupId, fromEmail, sandbox }
 */
function buildMailSendBody(signup, template, settings) {
  validateSignup(signup);

  const firstName = clean(signup.first_name);
  const accountType = normalise(signup.account_type);
  const industry = normalise(signup.industry);

  return {
    from: { email: settings.fromEmail, name: "impact.com" },
    reply_to: { email: settings.replyTo || settings.fromEmail, name: "impact.com Onboarding" },
    template_id: settings.templateId,
    personalizations: [
      {
        to: [firstName ? { email: signup.email.trim(), name: firstName } : { email: signup.email.trim() }],
        // Only what the template reads. Email and user_id stay out, so a
        // template edit can never print them.
        dynamic_template_data: {
          first_name: firstName,
          company_name: clean(signup.company_name),
          account_type: accountType,
          industry,
        },
        // Returned on every Event Webhook event. Strings only, no personal
        // data (SendGrid may keep these long term).
        custom_args: {
          user_id: signup.user_id.trim(),
          template_key: template.key,
          sequence_step: String(template.sequence_step),
          account_type: accountType || "unknown",
          industry: industry || "unknown",
        },
      },
    ],
    categories: ["onboarding", `onboarding_${template.key}`],
    // Top level, not inside personalizations: the footer's ASM unsubscribe
    // links only render when the group is set here.
    asm: { group_id: Number(settings.asmGroupId) },
    tracking_settings: {
      click_tracking: { enable: true, enable_text: false },
      open_tracking: { enable: true },
    },
    mail_settings: {
      sandbox_mode: { enable: Boolean(settings.sandbox) },
    },
  };
}

// Same key the sends table uses to stop duplicate webhooks sending twice.
function idempotencyKey(signup, template) {
  return `${clean(signup.user_id)}:${template.key}`;
}

module.exports = { buildMailSendBody, idempotencyKey, validateSignup, ValidationError, normalise };
