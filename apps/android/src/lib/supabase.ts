import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// SecureStore values have a small platform limit. Split the Supabase auth session
// into short chunks and publish the chunk count last so incomplete writes are ignored.
const CHUNK_LENGTH = 350;
const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const countText = await SecureStore.getItemAsync(`${key}.chunks`);
    if (!countText) return SecureStore.getItemAsync(key);
    const count = Number(countText);
    if (!Number.isInteger(count) || count < 1 || count > 64) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(`${key}.${index}`),
      ),
    );
    return chunks.every((chunk): chunk is string => chunk !== null)
      ? chunks.join("")
      : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    const previousCount = Number(await SecureStore.getItemAsync(`${key}.chunks`) ?? 0);
    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_LENGTH) {
      chunks.push(value.slice(offset, offset + CHUNK_LENGTH));
    }
    if (chunks.length > 64) throw new Error("A sessão excedeu o limite seguro local.");
    for (let index = 0; index < chunks.length; index += 1) {
      await SecureStore.setItemAsync(`${key}.${index}`, chunks[index]);
    }
    await SecureStore.setItemAsync(`${key}.chunks`, String(chunks.length));
    for (let index = chunks.length; index < previousCount; index += 1) {
      await SecureStore.deleteItemAsync(`${key}.${index}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(`${key}.chunks`) ?? 0);
    await SecureStore.deleteItemAsync(key);
    await SecureStore.deleteItemAsync(`${key}.chunks`);
    if (Number.isInteger(count) && count > 0 && count <= 64) {
      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          SecureStore.deleteItemAsync(`${key}.${index}`),
        ),
      );
    }
  },
};

export const supabase = createClient(
  supabaseUrl || "http://127.0.0.1:54321",
  supabaseAnonKey || "local-key-not-configured",
  {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
