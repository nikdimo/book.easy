import { getAllLanguages } from "@/lib/services/language.service";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguagesTab } from "./_components/languages-tab";

export const metadata = { title: "Admin - Settings" };

export default async function AdminSettingsPage() {
  const languages = await getAllLanguages();
  const languagesKey = languages
    .map((language) => `${language.code}:${language.sortOrder}:${language.isEnabled ? 1 : 0}`)
    .join("|");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Tabs defaultValue="languages">
        <TabsList>
          <TabsTrigger value="languages">Languages</TabsTrigger>
        </TabsList>
        <TabsContent value="languages" className="mt-6">
          <LanguagesTab key={languagesKey} languages={languages} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
