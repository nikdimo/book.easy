import { ContactForm } from "./contact-form";
import { getT } from "@/lib/i18n/t";

export const metadata = { title: "Contact us" };

export default async function ContactPage() {
  const t = await getT();
  const title = t.resolve("contact.title", "Contact us");
  const description = t.resolve(
    "contact.description",
    "Have a question about a booking, hosting, or using Linger Homes? Send us a message and our team will help."
  );

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-4xl font-semibold">{title.text}</h1>
      <p className="mt-4 text-muted-foreground">{description.text}</p>
      <ContactForm />
    </main>
  );
}
