import Link from "next/link";
import { getSubjectContext } from "@/src/lib/subject";

export async function SubjectBar() {
  const context = await getSubjectContext();
  if (!context || context.isSelf) return null;

  return (
    <div className="subject-bar" role="status">
      <div className="subject-bar-inner">
        <div className="small">
          Дневник <strong>{context.subject.displayName}</strong> · вы действуете
          как тренер
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link className="btn btn-sm btn-ghost" href="/mentees">
            Подопечные
          </Link>
          <form action="/api/subject" method="post">
            <input type="hidden" name="menteeUserId" value="" />
            <button className="btn btn-sm" type="submit">
              Вернуться в мой дневник
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
