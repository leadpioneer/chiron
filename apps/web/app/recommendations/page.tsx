import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getPendingRecommendations } from "@/src/lib/recommendation-service";
import { RecommendationCard } from "@/src/components/RecommendationCard";

export const metadata = { title: "Предложения" };

export default async function RecommendationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const pending = await getPendingRecommendations(user.id);

  const serialized = pending.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
  }));

  return (
    <div>
      <p className="eyebrow">Решения</p>
      <h1 className="page-title">Предложения</h1>
      <p className="subtitle">
        Каждое изменение имеет область действия и причину. Ничего не применяется
        без вашего подтверждения.
      </p>

      {serialized.length === 0 ? (
        <div className="empty">
          <p style={{ marginTop: 0 }}>Открытых предложений нет.</p>
          <Link className="btn btn-primary" href="/today">
            К следующей тренировке
          </Link>
        </div>
      ) : (
        <div className="stack">
          {serialized.map((item) => (
            <RecommendationCard key={item.id} recommendation={item} />
          ))}
        </div>
      )}
    </div>
  );
}
