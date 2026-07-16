import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | MyInsightAcademy",
  description:
    "Review the terms that govern MyInsightAcademy tutoring, scheduling, messaging, WhatsApp, and AI-assisted services.",
  alternates: {
    canonical: "https://myinsightacademy.com/terms",
  },
};

const sections = [
  { id: "acceptance", label: "Acceptance and eligibility" },
  { id: "accounts", label: "Accounts and roles" },
  { id: "tutoring", label: "Tutoring and scheduling" },
  { id: "fees", label: "Fees and monthly invoices" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "content", label: "Content and intellectual property" },
  { id: "whatsapp-ai", label: "WhatsApp and AI" },
  { id: "third-parties", label: "Third-party services" },
  { id: "availability", label: "Availability and changes" },
  { id: "termination", label: "Suspension and termination" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Liability and indemnity" },
  { id: "law-disputes", label: "Law and disputes" },
  { id: "changes-contact", label: "Changes and contact" },
] as const;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="These Terms explain the rules for using MyInsightAcademy’s tutoring, scheduling, messaging, WhatsApp, and AI-assisted services."
      effectiveDate="July 16, 2026"
      sections={sections}
    >
      <section id="acceptance">
        <h2>1. Acceptance and eligibility</h2>
        <p>
          These Terms of Service form an agreement between you and
          MyInsightAcademy, also known as Insight Academy, a tutoring service
          operated by Swati Goel. By creating or using an account, arranging or
          receiving tutoring, using our website, or communicating with our
          business through WhatsApp, you agree to these Terms. If you do not
          agree, do not use the services.
        </p>
        <p>
          You must be at least <strong>12 years old</strong> to use the service.
          If you are below the age of legal majority where you live, a parent or
          legal guardian must agree to your tutoring and use of the service,
          supervise your participation as appropriate, and accept these Terms on
          your behalf. Parent or guardian agreement may be obtained by phone or
          in person. Adults who provide consent confirm that they have authority
          to do so.
        </p>
        <p>
          Additional protections or consent requirements may apply to minors in
          a particular country. We may decline or suspend access if required
          consent has not been obtained or cannot be confirmed.
        </p>
      </section>

      <section id="accounts">
        <h2>2. Accounts, roles, and security</h2>
        <p>
          Accounts may be provided to students, parents or guardians, tutors,
          and administrators. You must provide accurate information, use the
          role assigned to you, and promptly tell us when account or contact
          details change.
        </p>
        <h3>Students and parents</h3>
        <p>
          Students must participate respectfully, attend or communicate about
          lessons, and use shared materials for legitimate learning. Parents and
          guardians are responsible for the authority they exercise over linked
          student accounts, for providing accurate scheduling and consent
          information, and for supervising minors as appropriate.
        </p>
        <h3>Tutors</h3>
        <p>
          Tutors must use student information only for authorized tutoring,
          scheduling, support, and safety purposes. Tutors must maintain
          appropriate professional boundaries, protect confidential information,
          keep availability reasonably current, and communicate promptly about
          lesson changes. A tutor may not represent that MyInsightAcademy has
          guaranteed a particular academic result.
        </p>
        <h3>Account security</h3>
        <p>
          Keep your password confidential, do not share an account, and use only
          accounts you are authorized to access. Notify us promptly at{" "}
          <a href="mailto:hello@myinsightacademy.com">
            hello@myinsightacademy.com
          </a>{" "}
          if you suspect unauthorized use. You are responsible for activity
          performed through your account to the extent permitted by law, except
          where the activity resulted from our failure to use reasonable care.
        </p>
      </section>

      <section id="tutoring">
        <h2>3. Tutoring, scheduling, and attendance</h2>
        <p>
          The platform helps students, parents, and tutors request, propose,
          confirm, reschedule, and cancel lessons across timezones. Users are
          responsible for checking the displayed timezone and confirmed session
          details. A request or proposed time is not final until the relevant
          parties or platform workflow confirms it.
        </p>
        <p>
          Students should arrive prepared and on time. Tutors should provide the
          agreed lesson with reasonable skill and care and communicate material
          delays or availability changes. Parents and students remain responsible
          for suitable devices, connectivity, learning materials, and a safe
          environment for online lessons.
        </p>
        <h3>Cancellations and rescheduling</h3>
        <p>
          If you cannot attend, contact the tutor as soon as reasonably possible.
          The student, parent, and tutor will ordinarily discuss and agree on a
          replacement time. Rescheduling is subject to tutor and student
          availability and is not guaranteed.
        </p>
        <p>
          MyInsightAcademy does not currently impose a standard cancellation
          deadline or cancellation fee through the platform. Any make-up lesson,
          credit, or invoice adjustment is decided case by case and should be
          confirmed with the tutor or agency. Repeated missed lessons or late
          cancellations may lead to a revised schedule or suspension of services
          after reasonable communication.
        </p>
      </section>

      <section id="fees">
        <h2>4. Fees and monthly invoices</h2>
        <p>
          Tutoring fees are communicated separately from these Terms. We usually
          send an invoice at the end of each month. The invoice or related
          communication will state the amount, covered lessons, payment method,
          and applicable due date.
        </p>
        <p>
          The website does not currently process online payments or store payment
          card details. Please raise a question about lesson counts or charges
          promptly so we can review it with the relevant tutor. We do not add a
          late fee, automatic renewal, or refund condition through these Terms
          unless it has been separately and clearly agreed and is permitted by
          applicable law.
        </p>
      </section>

      <section id="acceptable-use">
        <h2>5. Acceptable use</h2>
        <p>You must not use the services to:</p>
        <ul>
          <li>break a law, regulation, court order, or another person’s rights;</li>
          <li>harass, threaten, exploit, groom, discriminate against, or endanger another person;</li>
          <li>share sexual content involving a minor or any unlawful or seriously harmful content;</li>
          <li>impersonate another person or misrepresent your role or authority;</li>
          <li>cheat, plagiarize, evade academic rules, or submit AI output as your own when prohibited;</li>
          <li>upload malware, corrupted files, or content designed to disrupt or gain unauthorized access;</li>
          <li>probe, scrape, reverse engineer, overload, or circumvent access controls or account restrictions;</li>
          <li>send spam, unauthorized promotions, or deceptive messages;</li>
          <li>collect or disclose personal information without authorization; or</li>
          <li>use tutoring, chat, WhatsApp, or AI features for a prohibited high-risk purpose.</li>
        </ul>
        <p>
          For privacy and safety, the platform may block email addresses and
          phone numbers in private chat. Keep tutoring communication in approved
          channels unless MyInsightAcademy, the relevant adult, and tutor agree
          otherwise. Report safety concerns promptly. For an immediate danger,
          contact local emergency services rather than relying on the platform or
          AI assistant.
        </p>
      </section>

      <section id="content">
        <h2>6. Private chat, files, and intellectual property</h2>
        <p>
          Private chat is visible to authorized conversation participants,
          linked parents or guardians where applicable, and MyInsightAcademy
          administrators. It is not a confidential channel from the service
          operator. Upload only images, PDFs, messages, and other materials you
          are authorized to share and that are reasonably relevant to tutoring.
        </p>
        <h3>Your content</h3>
        <p>
          You retain ownership of content you create and submit. You grant
          MyInsightAcademy a limited, non-exclusive, worldwide license to host,
          copy, transmit, format, display, and otherwise process that content
          only as reasonably necessary to operate, secure, support, and provide
          the services, comply with law, and enforce these Terms. This license
          ends when the content is deleted from active systems, except to the
          extent continued retention is reasonably necessary for shared records,
          backups, legal obligations, safety, or disputes.
        </p>
        <p>
          You confirm that you have the rights and permissions needed for content
          you submit. Do not upload another person’s private information or
          copyrighted material unless authorized or legally permitted.
        </p>
        <h3>Our materials</h3>
        <p>
          The service design, branding, software, and materials created by
          MyInsightAcademy or its licensors remain owned by them. Subject to
          these Terms, you receive a limited, revocable, non-transferable right
          to use the service for personal tutoring or authorized professional
          tutoring. No other rights are granted.
        </p>
      </section>

      <section id="whatsapp-ai">
        <h2>7. WhatsApp messaging and the Hermes AI assistant</h2>
        <h3>WhatsApp consent</h3>
        <p>
          By starting a WhatsApp conversation with us or providing a phone number
          and asking us to contact you, you consent to receiving service-related
          WhatsApp messages, such as replies, scheduling information, reminders,
          and support. Standard carrier or data charges may apply. You can ask us
          to stop optional WhatsApp communications at any time, but we may still
          send messages that are necessary to complete a request or where law
          permits. WhatsApp use is also governed by WhatsApp and Meta policies.
        </p>
        <h3>AI disclosure and prohibited reliance</h3>
        <p>
          Our WhatsApp workflow may use a hosted assistant called Hermes,
          controlled by Swati Goel, to process text, voice notes, images,
          documents, phone numbers, message metadata, and conversation context.
          Hermes may use changing third-party models, including GPT models from
          OpenAI and Claude models from Anthropic, to generate responses.
        </p>
        <p>
          AI output may be inaccurate, incomplete, outdated, biased, or unsuitable
          for your situation. Verify important information with a human tutor or
          the agency. AI output does not replace professional medical, legal,
          financial, mental-health, safety, or emergency advice and must not be
          used as the sole basis for decisions that could materially affect a
          person’s health, safety, finances, education, legal rights, or access to
          opportunities.
        </p>
        <p>
          You must not use the AI assistant to facilitate cheating, illegal
          activity, self-harm, exploitation, surveillance, weapons, or automated
          decisions with legal or similarly significant effects. Do not send
          unnecessary passwords, financial account details, identity documents,
          health records, or other highly sensitive information.
        </p>
      </section>

      <section id="third-parties">
        <h2>8. Third-party services</h2>
        <p>
          The services depend on third parties including Supabase, Vercel,
          Resend, Meta / WhatsApp, OpenAI, and Anthropic. Their products may have
          separate terms, privacy policies, availability, security measures, and
          restrictions. We are not responsible for an independent third-party
          service outside our reasonable control, but this does not limit rights
          or responsibilities that cannot be excluded under applicable law.
        </p>
        <p>
          Links to third-party websites are provided for convenience and do not
          mean we endorse all content or practices on those websites.
        </p>
      </section>

      <section id="availability">
        <h2>9. Service availability and modifications</h2>
        <p>
          We aim to keep the website and communication tools available, but we do
          not promise uninterrupted or error-free operation. Availability may be
          affected by maintenance, internet or device failures, provider outages,
          security incidents, legal requirements, and events outside reasonable
          control.
        </p>
        <p>
          We may add, change, or discontinue features, providers, tutors, lesson
          arrangements, or communication channels. When a change materially
          affects an active tutoring arrangement, we will use reasonable efforts
          to communicate and work toward a practical transition.
        </p>
      </section>

      <section id="termination">
        <h2>10. Suspension and termination</h2>
        <p>
          You may stop using the platform and may request account deactivation by
          emailing us. We may restrict, suspend, or terminate access where
          reasonably necessary because of a material or repeated breach, safety
          concern, non-payment of an agreed invoice, unlawful conduct, risk to
          another user, security threat, provider requirement, or legal
          obligation.
        </p>
        <p>
          Where practical and safe, we will provide notice and an opportunity to
          address the issue. Immediate action may be necessary for serious safety,
          security, or legal concerns. Account deactivation does not automatically
          erase tutoring, invoice, scheduling, or communication records; requests
          for deletion are handled under the Privacy Policy and applicable law.
        </p>
      </section>

      <section id="disclaimers">
        <h2>11. Disclaimers</h2>
        <p>
          To the extent permitted by law, the platform, communication tools, and
          AI-assisted features are provided on an “as available” basis. We do not
          guarantee a particular grade, examination result, admission outcome,
          academic improvement, uninterrupted service, or that automated output
          will be accurate.
        </p>
        <p>
          Tutors remain responsible for exercising professional judgment, and
          students remain responsible for their own work, attendance, and
          academic compliance. Nothing in these Terms excludes warranties,
          remedies, or consumer protections that applicable law does not allow
          parties to exclude.
        </p>
      </section>

      <section id="liability">
        <h2>12. Limitation of liability and indemnification</h2>
        <p>
          To the extent permitted by law, MyInsightAcademy and its operator will
          not be liable for indirect, incidental, special, exemplary, or
          consequential losses, or loss of profit, opportunity, goodwill, or
          data, when those losses were not a reasonably foreseeable result of our
          breach or were caused by events outside our reasonable control.
        </p>
        <p>
          We do not limit liability where doing so would be unlawful, including
          applicable liability for fraud, wilful misconduct, non-excludable
          consumer rights, or death or personal injury caused by negligence where
          the law prohibits that limitation. Each party must take reasonable
          steps to reduce avoidable loss.
        </p>
        <h3>Limited indemnification</h3>
        <p>
          If you are an adult user or tutor, you agree, to the extent permitted
          by law, to reimburse MyInsightAcademy for reasonable losses and costs
          arising from a third-party claim caused by your unlawful content,
          infringement of another person’s rights, or intentional and material
          breach of these Terms. This provision does not apply to a minor and
          does not cover losses caused by our own breach, negligence, or
          misconduct.
        </p>
      </section>

      <section id="law-disputes">
        <h2>13. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of Vietnam, without limiting
          mandatory consumer or other protections that apply where you live.
        </p>
        <p>
          Before starting formal proceedings, please email{" "}
          <a href="mailto:hello@myinsightacademy.com">
            hello@myinsightacademy.com
          </a>{" "}
          with a clear description of the issue and the resolution you seek. We
          will try in good faith to resolve the matter informally. If it cannot be
          resolved, either party may bring the dispute before a court of
          competent jurisdiction in Vietnam, subject to any mandatory right to
          use another court, regulator, or consumer process.
        </p>
      </section>

      <section id="changes-contact">
        <h2>14. Changes and contact information</h2>
        <p>
          We may update these Terms when our services, providers, or legal
          obligations change. Updated Terms will be posted with a revised
          effective date. When required, we will give additional notice and seek
          renewed agreement before a material change applies.
        </p>
        <p>
          Questions about these Terms may be sent to MyInsightAcademy, operated
          by Swati Goel, at{" "}
          <a href="mailto:hello@myinsightacademy.com">
            hello@myinsightacademy.com
          </a>
          . Our website is{" "}
          <a href="https://myinsightacademy.com">myinsightacademy.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
