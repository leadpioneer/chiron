import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty" style={{ marginTop: 40 }}>
      <h1 className="page-title" style={{ fontSize: 28 }}>
        Страница не найдена
      </h1>
      <p>Возможно, тренировка уже удалена или ссылка устарела.</p>
      <Link className="btn btn-primary" href="/today">
        К сегодняшней тренировке
      </Link>
    </div>
  );
}
