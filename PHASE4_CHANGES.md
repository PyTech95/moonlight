# Phase 4: running the center (23 Oct 2026)

Roadmap steps 28–33 are done in code: child records, scheduling, parent one-time-code sign-in, billing and payments,
video sessions, and backups. The Android app (step 35) is built from the same code and opens the same portal; see
[mobile/README.md](mobile/README.md). Phases 0–3 are in [PHASE0_CHANGES.md](PHASE0_CHANGES.md) and
[PHASE1-3_CHANGES.md](PHASE1-3_CHANGES.md).

## Children (Admin → Children)

- Add a child: name, date of birth (age is calculated), school, support needed, home address, up to four family
  contacts (one main contact for messages and invoices), office notes that families never see.
- **Enrol child** on any enquiry fills the family details in and marks the enquiry Enrolled.
- One record per child: contacts, parent app access, therapists, upcoming and recent sessions, balance and packages.
- **Parent access:** enter the parent's email. An existing parent account gets the child at once; a new email gets a
  7-day invitation. A mobile number saved here lets the parent sign in with a one-time code.
- **Therapists:** assign or remove; booking a session with a therapist assigns them automatically.
- **Archive** hides a child from lists and booking and can cancel their future sessions; records and invoices stay.

## Schedule (Admin → Schedule)

- Week board, coloured by therapist, with group classes shown, cancelled sessions on request, and past sessions
  without attendance flagged.
- **Booking** checks every clash before saving: the therapist's other sessions and group classes, the child's other
  sessions, and the room. It shows the therapist's free times for the day as one-tap chips, and can repeat weekly
  (up to 24 weeks, booking the free weeks and listing the rest).
- Therapist working hours per weekday and leave; a booking outside them needs a tick to confirm.
- Center opening days and hours, rooms, usual session length, family emails on/off, evening-before reminders on/off.
- Change time, therapist or room (clash-checked, history kept) or cancel one session or the rest of a weekly series.
  Families get an email for each booking, move and cancellation.
- **Family requests:** parents ask to move a session or report an absence from the portal or app; the front desk
  moves it to a free slot, approves the absence (the session is cancelled) or declines with a note. Parents see
  the answer.
- Attendance from 30 minutes before the session, by the session's therapist or the front desk.
- Online sessions get a private Daily.co video room that opens 15 minutes before; therapist and family join from
  the session.

## Billing (Admin → Billing)

- Price list (per-session prices by therapy, assessment fee, other items) and session packages
  (e.g. 8 speech sessions valid 60 days).
- Marking a session **Present** uses one session from the child's package for that therapy (oldest first). With no
  package it becomes "ready to invoice" at the list price. Changing it back to Absent returns the package session.
  Optional: charge for no-shows.
- **Invoices** from attended sessions, packages, price-list items or free lines, with discount and GST %.
  Numbering `MNC/2026-27/0001` restarts every April; drafts get no number until issued, so the series has no gaps.
- **Payments at the desk:** cash, UPI, bank transfer, card or cheque, part payments, reversal with a reason.
  The family gets an email receipt.
- **Razorpay:** a payment link for the balance (UPI, cards, net banking) sent by email and shown in the parent's app.
  The status is always confirmed with Razorpay itself (return page, optional signed webhook, "Check payment").
- PDF invoice/receipt for the center and the family. Void (keeps the number) and delete draft free their sessions.
- Overview: collected this month, outstanding and overdue, sessions ready to invoice, packages to renew, recent payments.

## Parents (portal and app)

- **Payments:** amount due, invoices with Pay online and PDF, receipts, package sessions left.
- Request outcomes on the Schedule page; Join video for online sessions.
- **Sign in with a one-time code** (mobile number or email): sent on WhatsApp when the center adds an approved
  authentication template, otherwise by email. Codes work once, for 10 minutes, five tries; the same answer is given
  for unknown numbers so nobody can test who is a client.
- Parents stay signed in for 30 days (staff and admin 12 hours, with 2-step).

## Staff accounts

- **Therapists:** "Week" view of their own sessions, attendance, join online sessions.
- **Front desk** (Reception profile): children, schedule, family requests, read-only billing.
- **Finance** profile: billing and child names only.

## Settings and operations

- WhatsApp sign-in template and Daily.co video keys in Settings (stored encrypted, with a Test button). Integrations
  shows Razorpay and video status.
- Daily job (18:00 IST): emails tomorrow's session reminders and expires old packages.
- Nightly database dump and file copy (Phase 3 setup script); keep a copy off the server (see DEPLOY.md).

## Tested

- New Phase 4 API checks: 80/80 (children, every clash type, series, requests, attendance → packages, invoices,
  payments, voids, PDFs, Razorpay webhook signature, OTP sign-in, permissions for each role, reminders, archive).
- Browser walkthrough: 22/22 (admin, front desk, therapist on a phone, parent on a phone), no page errors.
- Earlier suites: production 23/23, demo 7/7, website content 16/16.
- Project's own suite: **37/37** (the three practice-video tests that failed since the original build now use a
  real video clip and wait for background processing).

## Needs from the center

- Prices and packages (Billing → Packages & prices), UPI ID and bank details (Billing → Settings).
- Rooms, opening hours and each therapist's working hours (Schedule).
- Invite therapists and front-desk staff (Accounts & consent), then parents from each child's record.
- Optional: Razorpay account and keys; Daily.co account; a WhatsApp authentication template for codes.
- GST: many therapy services are exempt; confirm with the center's accountant before setting a tax %.

## Not in this phase

- Push notifications in the app (needs a Firebase project); iPhone app.
- Automatic WhatsApp messages to parents for bookings and invoices (each needs an approved Meta template; email is
  used today).
- Hindi pages; the WhatsApp concept note.
