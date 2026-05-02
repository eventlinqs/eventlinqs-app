/**
 * help-content.ts - Help Centre content data.
 *
 * Six topics, each with a list of Q&A articles.
 * Rendered by src/app/help/[slug]/page.tsx.
 *
 * Voice rules: no em-dash or en-dash as sentence punctuation, no exclamation marks,
 * plain English, Australian English spelling, concrete over abstract.
 *
 * Session 2a: updated throughout to reflect self-serve organiser model (Decision A)
 * and inclusive brand positioning (Decision B).
 */

export type HelpArticle = {
  q: string
  a: string
}

export type HelpTopic = {
  slug: string
  title: string
  description: string
  articles: HelpArticle[]
}

export const helpTopics: HelpTopic[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    description: 'New to EventLinqs? Start here. Everything you need to know before your first event.',
    articles: [
      {
        q: 'What is EventLinqs?',
        a: "EventLinqs is the ticketing platform built for every culture. Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae and beyond. The features we prioritise show it: WhatsApp sharing, squad bookings, all-in pricing, and a checkout that actually works on mobile. Anyone can organise any kind of event here. Our launch markets are Australia, the UK, Canada, Europe, and the United States, with expansion across Africa underway.",
      },
      {
        q: 'Who is EventLinqs for?',
        a: "EventLinqs is for anyone who organises or attends events. The platform is built for every culture, and organisers running Afrobeats nights, gospel concerts, Owambe celebrations, Caribbean fetes, Bollywood club nights, Latin socials, Lunar festivals, heritage galas, and cultural business events will feel right at home. The platform is open to everyone. Weddings, birthday parties, corporate events, community festivals, and any other event that brings people together are all welcome. Buyers can use the platform as guests or with a free account.",
      },
      {
        q: 'Where does EventLinqs operate?',
        a: "Our launch markets are Australia, the UK, Canada, Europe, and the United States, serving cultural communities of every background in those regions. We are expanding to support events across Africa, and we want to hear from organisers and buyers on the continent. If you are based in Africa, contact us via the support form on our website and select Partnership as the topic.",
      },
      {
        q: 'How do I create an account?',
        a: "Click 'Sign up' at the top of any page. You can sign up with your email address or continue with your Google account. Creating an account is free. You only need an account to buy tickets if you want to save your purchase history or transfer tickets. Guest checkout is available for one-off purchases.",
      },
      {
        q: 'Can I sign in with Google?',
        a: "Yes. Click 'Continue with Google' on the sign-in screen to use your Google account. Your EventLinqs account will be linked to that Google identity. You can sign in on any device using the same Google account.",
      },
      {
        q: 'Do I need an account to buy tickets?',
        a: "No. Guest checkout is available on all events. Enter your name, email address, and payment details to complete your purchase. Your ticket will be sent to the email you provide. If you want to access your tickets later or transfer them, create a free account using the same email address you used at checkout.",
      },
      {
        q: 'How do I list an event on EventLinqs?',
        a: "Sign up as an organiser in minutes. Go to 'For Organisers' at the top of any page and click 'Start selling tickets.' Create your account, build your first event, and submit it for publishing. Every event is reviewed against our content and safety policy within 24 to 48 hours, and most are approved the same business day. No approval gate on organisers. Only on events.",
      },
      {
        q: 'Is it free to create an account?',
        a: "Yes. Creating a buyer account is completely free. There are no monthly or annual fees for buyers. For organisers, there is no upfront cost to list events. Our fees are a share of ticket revenue, only charged when paid tickets are sold. Free events incur zero platform fees, permanently. See our pricing page for current fee details.",
      },
      {
        q: 'How is EventLinqs different from Ticketmaster or Eventbrite?',
        a: "EventLinqs is built for every culture, and open to every organiser and every community that wants a platform that gets it right. Mainstream platforms treat cultural events as a small subset of their business. For us, they are the whole business. That means all-in pricing with no hidden fees at checkout, WhatsApp-native sharing, squad bookings so whole groups can buy together, and support from a team that understands the events we serve. We are also built on transparency: what you see at checkout is what you pay. No convenience fee surprises at the final step.",
      },
      {
        q: 'How do I contact EventLinqs support?',
        a: "Use the contact form on our website. Select the relevant topic and describe your issue. We reply to all messages within 1 business day, Monday to Friday. For organiser event-day emergencies, contact us through the form and mark your message as urgent.",
      },
      {
        q: 'I am an organiser based in Africa. Can I work with EventLinqs?',
        a: "Yes, we want to hear from you. Our launch focus is cultural communities across Australia, the UK, Canada, Europe, and the United States. We are expanding to support events across Africa, and we want to be in conversation with the right people ahead of that. Reach out through the support form on our website and select Partnership as the topic. We are actively speaking with promoters, venues, and cultural organisations on the continent.",
      },
    ],
  },

  {
    slug: 'buying-tickets',
    title: 'Buying Tickets',
    description: 'Purchases, delivery, transfers, refunds, and everything in between.',
    articles: [
      {
        q: 'How will I receive my ticket?',
        a: "Your ticket is delivered by email to the address you used at checkout. It contains a QR code that is scanned at the door. If you provided a phone number, we also send an SMS with a link to your ticket. Keep the QR code accessible on your phone. Most venues will not require you to print it.",
      },
      {
        q: 'My ticket email has not arrived. What should I do?',
        a: "First, check your spam or junk folder. Search for emails from EventLinqs or the event organiser. If you cannot find it there, log in to your account and go to 'My Tickets' to access your ticket directly. If you bought as a guest, enter the email address you used at checkout to retrieve your tickets. If you still cannot find your ticket, contact us via the support form with your name and the event name. We will resend your ticket within a few hours.",
      },
      {
        q: 'Can I transfer my ticket to someone else?',
        a: "Yes. Ticket transfers are free and take effect immediately. Log in to your account, go to 'My Tickets', select the ticket you want to transfer, and enter the recipient's email address. Once you transfer a ticket, you lose access to it and the new holder receives it by email. The transfer is one-way and cannot be reversed by you.",
      },
      {
        q: 'Can I resell my ticket above face value?',
        a: "No. Reselling tickets above face value is a violation of our terms of use and may result in the ticket being cancelled without refund. If you cannot attend, transfer your ticket for free to another person using the transfer feature in your account.",
      },
      {
        q: 'The event I want is sold out. Is there a waitlist?',
        a: "Some events have a waitlist enabled by the organiser. If one is available, you will see a 'Join waitlist' button on the event page. Enter your details and we will notify you by email if a ticket becomes available. Joining a waitlist does not guarantee a ticket and does not charge you anything.",
      },
      {
        q: 'Am I entitled to a refund if I cannot attend?',
        a: "Refund eligibility depends on the organiser's refund policy, which is displayed on the event page before you purchase. Most events are sold on a no-refund basis unless stated otherwise. EventLinqs guarantees a full refund if an event is cancelled by the organiser or materially rescheduled. For all other refund requests, contact the organiser first. If you do not receive a response within 7 days, escalate to us via the support form and we will step in.",
      },
      {
        q: 'Will I need ID at the door?',
        a: "That depends on the event. The organiser sets their own ID requirements, which are listed on the event page. Age-restricted events require government-issued photo ID. Check the event page before you attend. Bring your QR code and, if the organiser specifies it, a matching ID.",
      },
      {
        q: 'Can I buy tickets without creating an account?',
        a: "Yes. Guest checkout is available on all events. Enter your name, email address, and payment details. Your ticket will be sent by email. If you later want to transfer your ticket or access your purchase history, create a free account with the same email address you used at checkout.",
      },
      {
        q: 'What if I lose my phone or cannot access my ticket on the day?',
        a: "Log in to your account from any device and find your ticket in 'My Tickets'. If you do not have account access, contact the organiser or EventLinqs support before the event. We can confirm your booking with the venue directly if needed. Keep a screenshot of your QR code as a backup when you buy tickets to events you care about.",
      },
      {
        q: 'Can I buy multiple tickets in one booking?',
        a: "Yes. Select the quantity you need on the event page when adding tickets to your cart. All tickets in a single booking are sent to the same email address. Each individual ticket has its own QR code. One person can scan multiple QR codes from the same phone.",
      },
      {
        q: 'Can I change the name on a ticket after purchase?',
        a: "Tickets are issued to the purchaser. Name changes on existing tickets are not supported. If you need to give a ticket to someone else, use the free ticket transfer feature in your account. The new holder's details are not displayed on the ticket itself.",
      },
      {
        q: 'How do age restrictions work on events?',
        a: "Age restrictions are set by each organiser and listed on the event page. EventLinqs does not impose uniform age restrictions across all events. Check the event details before purchasing. If an event requires proof of age at the door, bring valid government-issued photo ID. Attendees who cannot prove their age may be refused entry at the organiser's discretion.",
      },
    ],
  },

  {
    slug: 'selling-tickets',
    title: 'Selling Tickets',
    description: 'For organisers: how to sign up, set up events, get paid, and run your event day.',
    articles: [
      {
        q: 'Can anyone sell tickets on EventLinqs?',
        a: "Yes. Anyone can create an organiser account and start building events straight away. We welcome organisers from every community and for every kind of event, from concerts and cultural festivals to birthday parties, weddings, and corporate events. Every event goes through a content and safety review before it publishes, usually within 24 to 48 hours. The review is on the event, not on you as an organiser.",
      },
      {
        q: 'How do I become an organiser?',
        a: "Sign up for an EventLinqs account, then click 'Become an organiser' from your dashboard. You will be asked for your organisation or artist name, a contact email, and a payout account for when your events earn revenue. That is it. You can start building your first event immediately.",
      },
      {
        q: 'How does event review work?',
        a: "Every event you submit for publishing is reviewed against our content and safety policy. We check that event details are accurate, that pricing is fair, and that the event complies with our platform terms. Most reviews are completed the same business day. Once approved, your event goes live immediately on the platform. For returning organisers with a clean track record, reviews become faster over time.",
      },
      {
        q: 'What does it cost to sell tickets on EventLinqs?',
        a: "There is no upfront cost to list events. Free events incur zero platform fees, permanently. For paid events, fees are a percentage of ticket revenue. The booking fee is split between EventLinqs and the organiser. We cap the total booking fee to protect buyer trust. See our pricing page for current fee rates, which are always kept up to date.",
      },
      {
        q: 'When do I receive my payout?',
        a: "Organiser payouts are sent within 5 business days of your event ending, to your linked bank account. Bank processing may add 1 to 3 business days on top. Payouts are processed via Stripe Connect and require identity verification to be completed on your account before any payout can be sent.",
      },
      {
        q: 'Which countries support organiser payouts?',
        a: "At launch, payout routes are available in Australia, the UK, Canada, the United States, and most European countries via Stripe Connect. Payout routes for African countries are part of our expansion. If you are an organiser on the African continent, reach out via the support form on our website to discuss working with us.",
      },
      {
        q: 'Can I customise my event page?',
        a: "Yes. You can upload event images, write a detailed event description, set your own ticket tiers and terms, and configure your refund policy. The event page URL is based on your event name. You can share it directly or embed it in your own marketing.",
      },
      {
        q: 'Can I set my own refund policy?',
        a: "Yes. You set your own refund policy for each event, and it is displayed to buyers before they complete their purchase. Whatever policy you set, you are bound by it. EventLinqs also applies overriding guarantees: if an event is cancelled or materially rescheduled, all ticket holders are entitled to a full refund regardless of your stated policy.",
      },
      {
        q: 'Can I offer early bird pricing and multiple ticket tiers?',
        a: "Yes. You can create multiple ticket tiers per event, each with its own name, price, quantity limit, and sale window. Common configurations include early bird, general admission, and VIP tiers. Tiers can be scheduled to open and close automatically, and they close once sold out.",
      },
      {
        q: 'Can I create discount codes?',
        a: "Yes. You can generate discount codes from your organiser dashboard. Codes can offer a percentage or fixed-amount discount and can be limited to a set number of uses. You can share codes selectively with specific audiences.",
      },
      {
        q: 'How do I manage complimentary tickets and my guest list?',
        a: "Complimentary tickets can be issued at zero cost from your organiser dashboard. Each comp ticket is a full ticket with its own QR code, sent to the recipient's email address. You can export your complete guest list from the dashboard in CSV format for check-in at the door.",
      },
      {
        q: 'What marketing support does EventLinqs provide?',
        a: "Events on the platform are promoted across our social media channels and included in category-specific pages visible to buyers browsing the platform. There is no additional charge for this. We do not guarantee specific reach or results for any individual event. Organisers are responsible for their own primary marketing.",
      },
      {
        q: 'Is there support available on the day of my event?',
        a: "Yes. If you run into operational issues on the day, such as QR scanning failures or last-minute venue changes, contact us through the support form and mark your message as urgent. New organisers receive step-by-step guidance during the event creation flow in the platform itself. If you need help at any point, our support team replies within 1 business day via the contact form.",
      },
      {
        q: 'Can I sell tickets at the door on the night?',
        a: "Yes. You can use the organiser dashboard on any mobile device to issue walk-in tickets manually on the night. These tickets are added to your total sold count and guest list in real time. Manual door sales are available on all organiser accounts.",
      },
    ],
  },

  {
    slug: 'payments-and-payouts',
    title: 'Payments and Payouts',
    description: 'Payment methods, currencies, organiser payouts, fees, and what happens when things go wrong.',
    articles: [
      {
        q: 'What payment methods does EventLinqs accept?',
        a: "We accept Visa, Mastercard, and American Express credit and debit cards, as well as Apple Pay, Google Pay, and Stripe Link. The available methods may vary slightly depending on your device and browser. All payments are processed by Stripe.",
      },
      {
        q: 'Is my card information secure?',
        a: "Yes. All card payments are processed directly by Stripe, which operates at PCI DSS Level 1 compliance. EventLinqs never sees or stores your full card number, CVV, or expiry date. Stripe handles all payment data under their own security and compliance standards.",
      },
      {
        q: 'What currency will I be charged in?',
        a: "You are charged in the currency the organiser has set for that event. EventLinqs does not add currency conversion fees. If your card is in a different currency, your card issuer may apply their own exchange rate and conversion fee, but EventLinqs adds nothing on top.",
      },
      {
        q: 'Can buyers outside the launch markets purchase tickets?',
        a: "Yes. International cards are supported across all events on the platform. Buyers in Africa and elsewhere can purchase tickets using Visa, Mastercard, or Amex cards today. We are working on integrating local African payment methods as part of our expansion.",
      },
      {
        q: 'How do organiser payouts work?',
        a: "After your event ends, EventLinqs calculates the ticket revenue less platform fees and initiates a payout to your linked bank account. Payouts are handled via Stripe Connect. You must complete Stripe's identity verification process before your first payout can be sent.",
      },
      {
        q: 'How long does it take to receive my payout?',
        a: "Payouts are initiated within 5 business days of your event ending. Bank processing may add 1 to 3 additional business days depending on your bank. If you have not received your payout after 10 business days, contact us and we will investigate with Stripe.",
      },
      {
        q: 'Which countries can receive organiser payouts?',
        a: "At launch, payout routes are live in Australia, the UK, Canada, the United States, and most European countries via Stripe Connect. Payout routes for African countries are part of our expansion roadmap. If you are an organiser on the African continent, contact us via the support form to discuss working with us ahead of that.",
      },
      {
        q: 'What is the booking fee and where does it go?',
        a: "The booking fee covers the cost of running the platform: payment processing, fraud prevention, customer support, and platform development. It is split between EventLinqs and a portion the organiser can set within our published cap. All fees are shown in full before the buyer confirms their purchase. There are no hidden charges added at the final step.",
      },
      {
        q: 'Is there a cap on what organisers can charge as a booking fee?',
        a: "Yes. EventLinqs caps the total booking fee to protect buyer trust. Organisers cannot set a booking fee that exceeds our published limit. The current cap and fee structure are on our pricing page, which is always kept up to date.",
      },
      {
        q: 'Can I get a receipt for my ticket purchase?',
        a: "Yes. Your purchase confirmation email serves as your receipt and includes the full breakdown of everything you paid. If you need a formal tax invoice, contact us at hello@eventlinqs.com with your order reference and we will send one.",
      },
      {
        q: 'What happens if a buyer files a chargeback?',
        a: "A chargeback that is upheld results in the disputed amount being deducted from the organiser's payout balance. Stripe may also apply a chargeback processing fee. EventLinqs will contest chargebacks that are not legitimate and will notify the organiser. We encourage buyers to contact us directly before initiating a chargeback, as we can usually resolve genuine disputes faster.",
      },
      {
        q: 'What happens to payments if an event is cancelled?',
        a: "If an organiser cancels an event, EventLinqs initiates a full refund to all ticket holders, including any service fees. Refunds are processed automatically within 5 business days of the cancellation being confirmed. Ticket holders do not need to contact us to receive a refund for a cancelled event.",
      },
    ],
  },

  {
    slug: 'account-and-privacy',
    title: 'Account and Privacy',
    description: 'Managing your account, your data rights, and how EventLinqs protects your privacy.',
    articles: [
      {
        q: 'How do I change my email address?',
        a: "Log in and go to Account Settings. From there, you can update your email address. We will send a confirmation link to your new email address before the change takes effect. Your old email will receive a security notification.",
      },
      {
        q: 'How do I change my password?',
        a: "Go to Account Settings and select 'Change password'. Follow the prompts to set a new password. If you signed up via Google, you do not have a separate EventLinqs password. Use your Google account to sign in.",
      },
      {
        q: 'How do I delete my account?',
        a: "Go to Account Settings and select 'Delete account'. This permanently removes your account and associated personal information. We remove identifiable personal data within 30 days of your request. Transaction records are retained for up to 7 years as required by Australian tax law and consumer law obligations.",
      },
      {
        q: 'What information does EventLinqs collect about me?',
        a: "We collect your name, email address, and optionally your phone number when you create an account. If you purchase a ticket, we record the event, ticket tier, amount paid, and transaction reference. We also collect device and usage data (browser type, IP address, pages visited) to help us run and improve the platform. We do not collect more than we need.",
      },
      {
        q: 'Does EventLinqs sell my personal data?',
        a: "No. We do not sell personal data to advertisers, data brokers, or any third party. We share your data only with the service providers needed to operate the platform: Stripe for payments, Supabase for data storage, Resend for email delivery, and Vercel for hosting. None of these providers are authorised to use your data for any other purpose.",
      },
      {
        q: 'What does the event organiser see about me?',
        a: "Organisers can see your name and email address for each ticket you purchase on their event. This is necessary for their guest list and for sending event communications. Organisers cannot see your payment details, your purchases on other events, or any other personal information.",
      },
      {
        q: 'How do I opt out of marketing emails from an organiser?',
        a: "Every marketing email from an organiser includes an unsubscribe link at the bottom. Click it and you will be removed from that organiser's contact list within 48 hours. You can also manage all communication preferences from the Notifications section in your Account Settings.",
      },
      {
        q: 'I think someone else has accessed my account. What should I do?',
        a: "Change your password immediately from Account Settings. If you used Google Sign-In, review your Google account security and check for any sign-in activity you do not recognise. Then contact us at hello@eventlinqs.com so we can review your account activity and take any necessary action.",
      },
      {
        q: 'What are my privacy rights under Australian law and the GDPR?',
        a: "Under the Australian Privacy Act and, where applicable, the GDPR, you have the right to access the personal information we hold about you, request corrections, ask for deletion, and request a machine-readable copy of your data. To exercise any of these rights, contact us through the support form on our website and select Privacy as the topic. We respond to privacy requests within 30 days.",
      },
      {
        q: 'How do I export a copy of my data?',
        a: "Contact us through the support form on our website and select Privacy as the topic. We will prepare a machine-readable copy of your personal information and send it to your registered email within 30 days.",
      },
      {
        q: 'Does EventLinqs use third-party advertising trackers?',
        a: "No. We do not run third-party advertising or retargeting trackers. We use internal analytics tools to understand how the platform is used in aggregate. This data is never sold or shared with advertisers. You can opt out of analytics tracking in your Account Settings or by enabling your browser's Do Not Track setting.",
      },
    ],
  },

  {
    slug: 'contact-us',
    title: 'Contact Us',
    description: 'How to reach our team, what to expect, and answers to common questions about support.',
    articles: [
      {
        q: 'How do I get help?',
        a: "Use the contact form on our website. Describe your issue in as much detail as you can, including your order reference or event name where relevant. We reply to all messages within 1 business day, Monday to Friday.",
      },
      {
        q: 'How quickly will I receive a response?',
        a: "We aim to respond within 1 business day, Monday to Friday. For urgent event-day issues, mark your message as urgent in the contact form. We do not currently offer 24/7 support.",
      },
      {
        q: 'Is there a phone number I can call?',
        a: "No. We handle all support through our contact form. Written support creates a clear record of the issue, gets routed to the right person faster, and avoids the delays common with phone queues. Most issues are resolved in a single reply.",
      },
      {
        q: 'I am an organiser and something has gone wrong at my event right now. What do I do?',
        a: "Send a message through the contact form with URGENT in the subject line. Describe the issue as specifically as possible: what is happening, at which venue, and what you have already tried. We monitor for urgent messages and will respond as quickly as we can.",
      },
      {
        q: 'Where is the EventLinqs team based?',
        a: "EventLinqs is headquartered in Geelong, Victoria, Australia. Our support team is Australia-based.",
      },
      {
        q: 'I am an organiser or venue based in Africa. Can I work with EventLinqs?',
        a: "Yes. Reach out via the contact form and select 'Partnership' as your topic. We are expanding to support events across Africa, and we want to hear from you. We cannot give a fixed timeline for African payout routes and local payment methods, but those are part of our expansion and we want to be in conversation with the right people ahead of that.",
      },
      {
        q: 'I am interested in a partnership or commercial arrangement. Who do I contact?',
        a: "Use the contact form and select 'Partnership' as the topic. Describe the nature of the partnership opportunity. We review all partnership inquiries and reply within 3 business days.",
      },
      {
        q: 'I am from a media outlet and would like to cover EventLinqs. Who do I contact?',
        a: "Use the contact form and select 'Press' as the topic. Include a brief description of the story and the publication or outlet. We respond to press inquiries within 2 business days.",
      },
      {
        q: 'I have an accessibility requirement and need help using the platform.',
        a: "Contact us via the contact form and describe what you need. We will do our best to assist, including providing tickets in an accessible format or helping you complete your purchase over email.",
      },
      {
        q: 'I suspect a scam or fraudulent event listed on EventLinqs. How do I report it?',
        a: "Use the contact form and describe the event you are concerned about, including the event name and URL. We investigate all reports and will remove an event immediately if we find evidence of fraud. If you have already purchased a ticket to a suspected fraudulent event, include your order reference and we will work with you on a resolution.",
      },
    ],
  },
]

// ---- Helpers ----

export function getHelpTopic(slug: string): HelpTopic | null {
  return helpTopics.find(t => t.slug === slug) ?? null
}
