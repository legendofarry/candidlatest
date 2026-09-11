import { createFileRoute } from "@tanstack/react-router";
import { ProsePage } from "@/components/site/prose-page";

export const Route = createFileRoute("/rights")({
  head: () => ({
    meta: [
      { title: "Safety & your rights at work in Kenya — Candid" },
      {
        name: "description",
        content:
          "Plain-language basics on Kenyan employment rights: contracts, pay dates, working hours, unfair dismissal, harassment, and where to report.",
      },
      { property: "og:title", content: "Safety & your rights at work in Kenya" },
      {
        property: "og:description",
        content:
          "Contracts, pay, hours, dismissal and where to report — the basics every Kenyan employee should know.",
      },
    ],
  }),
  component: RightsPage,
});

function RightsPage() {
  return (
    <ProsePage
      title="Safety & your rights"
      intro="A short, plain-language guide to what Kenyan law expects of employers. This is general information, not legal advice — for your own case, talk to a labour officer or an advocate."
    >
      <section>
        <h2>Your contract</h2>
        <ul>
          <li>
            Any job lasting more than three months must be in writing, signed, with a copy for you.
          </li>
          <li>It should state your role, pay, hours, leave, and notice period.</li>
          <li>
            "Casual" arrangements that run continuously for months can convert into a term contract.
          </li>
        </ul>
      </section>
      <section>
        <h2>Pay</h2>
        <ul>
          <li>
            Salary must be paid on the agreed date. Persistent lateness is a breach, not a favour
            withheld.
          </li>
          <li>
            Deductions must be lawful — PAYE, NSSF, SHIF, and anything you agreed to in writing.
          </li>
          <li>You are entitled to a payslip showing gross pay and every deduction.</li>
          <li>
            Statutory deductions taken from you must actually be remitted. You can check your NSSF
            and SHIF records.
          </li>
        </ul>
      </section>
      <section>
        <h2>Hours, leave and overtime</h2>
        <ul>
          <li>Standard week is 45 hours; overtime beyond that is payable at a premium rate.</li>
          <li>At least 21 working days of paid annual leave per year of service.</li>
          <li>
            Sick leave, maternity leave (3 months) and paternity leave are statutory, not
            discretionary.
          </li>
          <li>One rest day per week.</li>
        </ul>
      </section>
      <section>
        <h2>Dismissal</h2>
        <ul>
          <li>
            You must be told the reason and given a chance to respond, with a colleague present if
            you want one.
          </li>
          <li>Redundancy requires notice and payment of accrued dues plus severance.</li>
          <li>On exit you are owed final salary, unused leave, and a certificate of service.</li>
          <li>
            Claims for unfair termination are generally filed within three years at the Employment
            and Labour Relations Court.
          </li>
        </ul>
      </section>
      <section>
        <h2>Harassment and discrimination</h2>
        <ul>
          <li>
            Sexual harassment is unlawful, and employers with 20+ staff must have a written policy
            on it.
          </li>
          <li>
            Discrimination on tribe, gender, religion, pregnancy, disability or HIV status is
            prohibited.
          </li>
          <li>
            Keep your own records: dates, messages, and what was said. Store them somewhere
            personal, not on a work device.
          </li>
        </ul>
      </section>
      <section>
        <h2>Where to report</h2>
        <ul>
          <li>
            The labour office in your county — free conciliation for wage and dismissal disputes.
          </li>
          <li>Your union, if the workplace is unionised.</li>
          <li>Employment and Labour Relations Court for formal claims.</li>
          <li>Police or a gender desk for assault, threats, or sexual offences.</li>
        </ul>
      </section>
      <section>
        <h2>Staying safe when you post here</h2>
        <ul>
          <li>
            Leave out anything only three people would know — that is how people get identified.
          </li>
          <li>Don't name individuals. Describe the practice, not the person.</li>
          <li>Post from a personal device and personal email, never a work account.</li>
        </ul>
      </section>
    </ProsePage>
  );
}
