import Link from "next/link";
import { getSubjectContext } from "@/src/lib/subject";
import { SubjectSwitchButton } from "./SubjectSwitchButton";

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
          <SubjectSwitchButton
            menteeUserId=""
            label="Вернуться в мой дневник"
            className="btn btn-sm"
          />
        </div>
      </div>
    </div>
  );
}
