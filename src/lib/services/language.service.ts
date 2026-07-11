import "server-only";
import { getLanguages } from "@/lib/data/language.repository";

export async function getEnabledLanguages() {
  const languages = await getLanguages(true);
  return languages.map(({ code, name, isDefault }) => ({ code, name, isDefault }));
}

export async function getAllLanguages() {
  return getLanguages(false);
}
