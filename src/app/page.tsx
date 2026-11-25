import { ProfileCard } from "@/components/profile-card";
import { getMessages } from "@/lib/i18n/server";
import { loadMyPositions } from "@/lib/supabase/my-positions";
import { requirePageSession } from "@/lib/supabase/page-session";

// Сторінка «Personal Information»: хто увійшов, на яких посадах і за яким розкладом.
// Посади показуємо першими: саме з ними працівник себе ототожнює, тоді як роль —
// це доступ до порталу (глосарій requirements/product.md: «role means portal access only»).
// Розклад живе окремою сторінкою `/schedule`: на головній людина дивиться, ХТО
// вона в порталі, а розклад відповідає на інше питання — КОЛИ вона працює.
// Сторінка читає cookies, тому рендериться динамічно (шаблон зібрано з --no-cache-components).

export default async function Home() {
  const { lang, m } = await getMessages();
  const { supabase, claims } = await requirePageSession();

  // RLS: користувач бачить лише власний профіль.
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", claims.sub)
    .maybeSingle();

  const myPositions = await loadMyPositions(supabase, claims.sub);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{m("home.title")}</h1>

      <ProfileCard
        email={profile?.email ?? claims.email}
        fullName={profile?.full_name}
        role={profile?.role}
        positions={myPositions}
        lang={lang}
      />

    </main>
  );
}
