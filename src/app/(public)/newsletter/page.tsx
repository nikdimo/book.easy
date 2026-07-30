import { NewsletterForm } from "./newsletter-form";
import { getT } from "@/lib/i18n/t";

export default async function NewsletterPage() {
  const t = await getT();
  const title = t.resolve("newsletter.title", "Linger Homes news and offers");
  const description = t.resolve(
    "newsletter.description",
    "Optional promotional email is separate from account and booking communication. We will only subscribe you after you confirm the link sent to your inbox."
  );
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-4xl font-semibold">{title.text}</h1>
      <p className="mt-4 text-muted-foreground">
        {description.text}
      </p>
      <NewsletterForm />
    </main>
  );
}
