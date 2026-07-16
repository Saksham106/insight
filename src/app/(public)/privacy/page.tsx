import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | MyInsightAcademy",
  description:
    "Learn how MyInsightAcademy collects, uses, shares, and protects information across its tutoring platform, WhatsApp, and AI-assisted services.",
  alternates: {
    canonical: "https://myinsightacademy.com/privacy",
  },
};

const sections = [
  { id: "scope", label: "Scope and who we are" },
  { id: "information", label: "Information we collect" },
  { id: "whatsapp-ai", label: "WhatsApp and AI" },
  { id: "cookies-logs", label: "Cookies, devices, and logs" },
  { id: "uses-bases", label: "Uses and legal bases" },
  { id: "sharing", label: "Sharing and providers" },
  { id: "transfers", label: "International processing" },
  { id: "retention", label: "Retention" },
  { id: "security", label: "Security" },
  { id: "rights-deletion", label: "Rights and deletion" },
  { id: "children", label: "Children and minors" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="This policy explains how MyInsightAcademy handles personal information when people use our tutoring platform, contact us, or communicate with us through WhatsApp."
      effectiveDate="July 16, 2026"
      sections={sections}
    >
      <section id="scope">
        <h2>1. Scope and who we are</h2>
        <p>
          MyInsightAcademy, also known as Insight Academy, is a tutoring service
          operated by Swati Goel. Our primary operations are in Vietnam, and some
          online tutors work from India or Singapore. In this policy, “we,” “us,”
          and “our” refer to MyInsightAcademy and its operator.
        </p>
        <p>
          This policy applies to <strong>myinsightacademy.com</strong>, our
          tutoring platform, support and interest forms, and our business
          interactions on WhatsApp. It covers students, parents and guardians,
          tutors, prospective users, and other people who contact us.
        </p>
        <p>
          WhatsApp interactions also remain subject to the terms and privacy
          policies of WhatsApp and Meta. Their handling of information is
          described in the applicable{" "}
          <a href="https://www.whatsapp.com/legal/privacy-policy" rel="noreferrer">
            WhatsApp privacy policy
          </a>{" "}
          and Meta business terms, which are separate from this policy.
        </p>
      </section>

      <section id="information">
        <h2>2. Information we collect and generate</h2>

        <h3>Information you provide</h3>
        <p>
          We collect information that you, a parent or guardian, a tutor, or an
          administrator provides. This may include your name, email address,
          phone number, account credentials, role, support category, subject,
          messages, and other details included in a contact or join-interest
          request.
        </p>

        <h3>Account and profile information</h3>
        <p>
          Account records may include a name, email address, role, profile photo,
          timezone, reminder preferences, account status, tutor-student and
          parent-student relationships, and invitation, sign-in, password, and
          account-creation timestamps. Passwords are handled through our
          authentication provider; we do not display your password to tutors or
          other students.
        </p>

        <h3>Scheduling and tutoring records</h3>
        <p>
          We generate and store records needed to organize tutoring, including
          tutor assignments, availability, booking preferences, requested or
          confirmed lesson times, timezone, lesson duration, scheduling status,
          who proposed, changed, or cancelled a session, lesson notes, reminder
          status, and related timestamps. Parents may be linked to student
          records so they can assist with scheduling and communication.
        </p>

        <h3>Private messages and uploaded files</h3>
        <p>
          Private platform chats include conversation membership, sender,
          message text, delivery timestamps, and attachment details. Users may
          upload photos and image files in PNG, JPEG, GIF, or WebP format, and
          PDF documents. Larger images may be resized or converted in the
          browser before upload. Please do not upload information that is not
          reasonably needed for tutoring.
        </p>

        <h3>Information from other people</h3>
        <p>
          A parent, guardian, administrator, or tutor may provide information
          about a student, such as contact details, scheduling needs, lesson
          notes, or account relationships. If you provide information about
          someone else, you must be authorized to do so and should share only
          what is necessary.
        </p>
      </section>

      <section id="whatsapp-ai">
        <h2>3. WhatsApp and Hermes AI processing</h2>
        <p>
          We use the WhatsApp Business Cloud API to communicate with students,
          parents, tutors, and prospective users. When you message our business
          on WhatsApp, we may receive and process your phone number, WhatsApp
          profile information made available to the business, message text,
          voice notes, images, documents, other media, message and delivery
          metadata, and relevant conversation history.
        </p>
        <p>
          A hosted assistant called <strong>Hermes</strong>, controlled by Swati
          Goel for MyInsightAcademy, may process this content to understand a
          request and prepare or provide a response. Depending on how Hermes is
          configured at the time, content may be sent to third-party AI model and
          infrastructure providers. Verified examples include OpenAI, which
          provides GPT models, and Anthropic, which provides Claude models. The
          provider can change, and other model or infrastructure providers may
          be used. You may contact us for information about the providers used
          for a particular current workflow.
        </p>
        <p>
          AI and infrastructure providers may process prompts, message content,
          media or extracted content, conversation context, and generated
          responses to provide and secure their services. Their own contractual
          terms, settings, safety systems, logging, and retention practices may
          apply. We do not represent that messages sent through WhatsApp or to
          an AI system are never retained by Meta, model providers, or their
          infrastructure providers.
        </p>
        <h3>Limits of automated output</h3>
        <p>
          AI output can be incomplete, inaccurate, outdated, or inappropriate.
          A human should verify important information. The assistant is not a
          substitute for a tutor’s judgment or for professional medical, legal,
          financial, safety, or emergency advice. Do not use it for emergencies,
          high-risk decisions, academic misconduct, or automated decisions about
          another person’s rights or opportunities.
        </p>
      </section>

      <section id="cookies-logs">
        <h2>4. Cookies, local storage, device information, and logs</h2>
        <p>
          We use cookies that are necessary to authenticate users, maintain a
          signed-in session, and protect access to private pages. We do not
          currently use an advertising network or a third-party behavioral
          analytics service in the website code.
        </p>
        <p>
          The platform uses browser <strong>local storage</strong> to save a
          per-user, per-conversation timestamp showing when a chat was last read.
          This helps calculate unread-message counts. Removing browser storage
          may reset these indicators.
        </p>
        <p>
          When you use the website, our hosting, security, and database providers
          may automatically process standard technical information such as IP
          address, browser and device type, operating system, requested URL,
          timestamps, referring page, response status, diagnostic events, and
          security or access logs. We use this information to deliver, diagnose,
          protect, and maintain the service.
        </p>
      </section>

      <section id="uses-bases">
        <h2>5. How we use information and applicable legal bases</h2>
        <p>We use personal information to:</p>
        <ul>
          <li>create, authenticate, administer, and secure accounts;</li>
          <li>connect students, parents, and tutors and manage assignments;</li>
          <li>schedule, confirm, reschedule, and remind people about lessons;</li>
          <li>provide private chat, file sharing, support, and WhatsApp responses;</li>
          <li>generate AI-assisted replies and improve response relevance;</li>
          <li>send invitations, service notices, and administrative emails;</li>
          <li>process interest requests and respond to questions;</li>
          <li>prevent misuse, investigate incidents, and enforce our Terms;</li>
          <li>maintain business and tutoring records and comply with law; and</li>
          <li>establish, exercise, or defend legal claims.</li>
        </ul>
        <p>
          Where a privacy law requires a legal basis, we rely as appropriate on:
        </p>
        <ul>
          <li>
            <strong>Contract and requested steps</strong> when processing is
            necessary to provide tutoring or platform services or respond before
            services begin.
          </li>
          <li>
            <strong>Consent</strong> for activities that require it, including
            parent or guardian agreement for a minor and certain communications.
            Consent may be withdrawn, but withdrawal does not affect earlier
            lawful processing.
          </li>
          <li>
            <strong>Legitimate interests</strong> in operating and securing a
            tutoring service, communicating with users, keeping proportionate
            records, and improving support, balanced against individual rights.
          </li>
          <li>
            <strong>Legal obligations</strong> when records or disclosures are
            required by applicable law.
          </li>
          <li>
            <strong>Vital interests</strong> when processing is reasonably
            necessary to protect someone in an emergency.
          </li>
        </ul>
        <p>
          The available legal bases and their names differ by country. Not every
          basis applies to every activity or user.
        </p>
      </section>

      <section id="sharing">
        <h2>6. How information is disclosed</h2>
        <p>We disclose information only as reasonably necessary to:</p>
        <ul>
          <li>
            assigned tutors, linked parents or guardians, students, and
            authorized administrators for tutoring, scheduling, communication,
            support, and safety;
          </li>
          <li>
            service providers that process information for the functions listed
            below;
          </li>
          <li>
            professional advisers, authorities, courts, or other parties when
            required by law or reasonably necessary to protect rights, safety,
            and the integrity of the service; or
          </li>
          <li>
            a successor or prospective successor involved in a reorganization,
            sale, or transfer of the tutoring business, subject to appropriate
            confidentiality and legal requirements.
          </li>
        </ul>

        <h3>Verified service providers</h3>
        <ul>
          <li><strong>Supabase</strong> — authentication, database, realtime events, and file storage.</li>
          <li><strong>Vercel</strong> — website hosting and request delivery.</li>
          <li><strong>Resend</strong> — transactional, reminder, invitation, support, and administrative email.</li>
          <li><strong>Meta / WhatsApp</strong> — WhatsApp Business Cloud API and WhatsApp message delivery.</li>
          <li><strong>OpenAI</strong> — a possible AI model provider for Hermes.</li>
          <li><strong>Anthropic</strong> — a possible AI model provider for Hermes.</li>
        </ul>
        <p>
          These providers may use their own subprocessors. Their roles and terms
          can vary depending on the service configuration. We do not currently
          identify an advertising, behavioral analytics, or online payment
          processor in the platform.
        </p>
      </section>

      <section id="transfers">
        <h2>7. International processing and transfers</h2>
        <p>
          MyInsightAcademy primarily operates in Vietnam. Authorized online
          tutors may access information for assigned students from India or
          Singapore. Our providers and their subprocessors may process
          information in the United States and other countries where they or
          their infrastructure operate.
        </p>
        <p>
          These countries may have privacy laws different from those where you
          live. Where required, we use a lawful basis and appropriate contractual
          or other safeguards for international processing, or rely on consent
          or necessity to provide a service you request where the law permits.
          Contact us if you want more information about safeguards relevant to
          your information.
        </p>
      </section>

      <section id="retention">
        <h2>8. Retention</h2>
        <p>
          We do not apply one fixed retention period to every record. We retain
          information only for as long as reasonably necessary for the purpose
          for which it was collected, including to provide tutoring and platform
          services, administer student-parent-tutor relationships, maintain
          lesson and business records, resolve disputes, prevent misuse, enforce
          agreements, and meet legal obligations.
        </p>
        <p>
          Factors include whether an account or tutoring relationship remains
          active, whether records are needed to explain lessons, invoices, or
          communications, the sensitivity of the information, legal limitation
          periods, safety concerns, and applicable provider and backup deletion
          cycles. When information is no longer needed, we take reasonable steps
          to delete or de-identify it.
        </p>
        <p>
          Deactivating an account currently prevents platform use but may retain
          tutoring records so shared lesson, scheduling, and conversation history
          remains coherent. Provider systems, including WhatsApp and AI services,
          may retain data according to their own applicable terms, settings, and
          legal requirements.
        </p>
      </section>

      <section id="security">
        <h2>9. Security</h2>
        <p>
          We use measures intended to protect information, including authenticated
          access, role-based permissions, database row-level security, storage
          access rules, encrypted HTTPS transport, restricted administrative
          credentials, file type and size checks, and account deactivation.
        </p>
        <p>
          No method of transmission or storage is completely secure. Users should
          protect passwords and devices, avoid sharing credentials, send only
          information needed for tutoring, and notify us promptly if they suspect
          unauthorized access.
        </p>
      </section>

      <section id="rights-deletion">
        <h2>10. Your privacy rights and deletion requests</h2>
        <p>
          Depending on applicable law, you may have rights to ask whether we
          process your information and to request access, correction, deletion,
          restriction, objection, withdrawal of consent, or a portable copy. You
          may also have the right to complain to an appropriate privacy or data
          protection authority.
        </p>
        <p>
          Submit a request to{" "}
          <a href="mailto:hello@myinsightacademy.com">
            hello@myinsightacademy.com
          </a>
          . Describe the account, phone number, or interaction involved and the
          action you want us to take. To protect users, we may verify your
          identity and, for a child, the requesting adult’s authority. Rights may
          be limited by applicable law, another person’s rights, safety and fraud
          concerns, or the need to preserve shared tutoring and legal records.
        </p>

        <h3>Platform-account deletion</h3>
        <p>
          The platform does not currently offer a self-service deletion button.
          Email us with the subject “Account deletion request.” We will review
          the account, deactivate access where appropriate, and delete or
          de-identify eligible information. We will explain if particular records
          must be retained or cannot be separated from another person’s record.
        </p>

        <h3>WhatsApp and AI data deletion</h3>
        <p>
          Email us or contact the MyInsightAcademy WhatsApp number and identify
          the relevant phone number. Specify whether you want deletion of
          WhatsApp content, the platform account, or both. We will address data
          under our control subject to legal and technical limitations. You may
          also need to use WhatsApp’s own account and message controls for
          information controlled by Meta. Requests affecting OpenAI, Anthropic,
          or another provider may be subject to that provider’s contractual,
          security, and retention rules.
        </p>
      </section>

      <section id="children">
        <h2>11. Children and minors</h2>
        <p>
          The service is intended for students who are at least 12 years old.
          Anyone below the age of legal majority where they live must use the
          service with the involvement and consent of a parent or legal guardian.
          We currently obtain parent or guardian agreement by phone or in person
          before a minor is taught or uses the service.
        </p>
        <p>
          Parents and guardians should supervise a minor’s use, explain safe
          communication practices, and help decide what files or information are
          appropriate to share. They may contact us to review, correct, or request
          deletion of a child’s information, subject to verification and
          applicable limits.
        </p>
        <p>
          If we learn that a child is using the service without required consent
          or is younger than 12, we may suspend access and take appropriate steps
          regarding the information. Requirements for children, including users
          under 13 or under 16, differ by country and may require additional
          parental notice or consent.
        </p>
      </section>

      <section id="changes">
        <h2>12. Changes to this policy</h2>
        <p>
          We may update this policy when our services, providers, or legal
          obligations change. We will post the revised policy with an updated
          effective date and provide additional notice when required by law or
          when a change materially affects how we use information.
        </p>
      </section>

      <section id="contact">
        <h2>13. Contact us</h2>
        <p>
          For privacy questions or requests, contact MyInsightAcademy, operated
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
