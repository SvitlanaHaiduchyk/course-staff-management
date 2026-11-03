import { Card, CardContent } from "@/components/ui/card";
import { positionKindLabel, roleLabel } from "@/lib/leave/format";

/** Посада працівника так, як її показують на сторінці «Personal Information». */
export type ProfilePosition = {
  readonly id: string;
  readonly kind: string;
  readonly job_title: string;
  readonly divisions?: { readonly name: string } | null;
};

/**
 * Картка «хто я»: пошта, ім'я, посади, доступ.
 *
 * Посади показуємо першими: саме з ними працівник себе ототожнює, тоді як роль —
 * це доступ до порталу (глосарій `requirements/product.md`: «role means portal
 * access only»).
 */
export function ProfileCard({
  email,
  fullName,
  role,
  positions,
}: {
  email: string | null | undefined;
  fullName: string | null | undefined;
  role: string | null | undefined;
  positions: readonly ProfilePosition[];
}) {
  return (
    <Card>
      <CardContent>
        <dl
          className="grid gap-x-6 gap-y-3 text-sm"
          style={{ gridTemplateColumns: "max-content 1fr" }}
        >
          <dt className="text-muted-foreground">Email</dt>
          <dd data-testid="user-email">{email ?? "—"}</dd>

          <dt className="text-muted-foreground">Ім&apos;я</dt>
          <dd data-testid="user-name">{fullName ?? "—"}</dd>

          {/*
            Рядок посад показуємо лише тим, у кого вони є. За глосарієм product.md
            працівник — це «a person who works at the school and has at least one
            position», тож порожній список буває хіба в адміністратора без посади.
          */}
          {positions.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Посади</dt>
              <dd data-testid="positions">
                <ul className="flex flex-col gap-1">
                  {positions.map((p) => (
                    <li key={p.id}>
                      {p.divisions?.name ?? "—"} / {p.job_title}{" "}
                      <span className="text-muted-foreground">({positionKindLabel(p.kind)})</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}

          <dt className="text-muted-foreground">Доступ</dt>
          <dd data-testid="user-role">{roleLabel(role)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
