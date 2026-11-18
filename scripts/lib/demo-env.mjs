// Спільний початок скриптів npm run *:demo: читання обов'язкових змінних і
// перевірка, що адреси в демо-даних — лише синтетичні.
//
// Винесено, бо той самий блок уже стояв у чотирьох скриптах, і `fallow`
// справедливо називав це клоном. Значень ключів ці функції не друкують.

/**
 * Повертає `[url, secretKey]` або завершує процес із переліком того, чого бракує.
 */
export function requireSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", url],
    ["SUPABASE_SECRET_KEY", secretKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    console.error(`Не задано: ${missing.join(", ")}. Додайте їх у .env.local (див. .env.example).`);
    process.exit(1);
  }

  return [url, secretKey];
}

/** Лише синтетичні адреси: демо-дані ніколи не містять справжніх людей. */
export function requireSyntheticEmail(email, where) {
  if (!/^[^@\s]+@example\.test$/i.test(email ?? "")) {
    console.error(`Лише синтетичні адреси *@example.test: "${email}" у ${where}.`);
    process.exit(1);
  }
}
