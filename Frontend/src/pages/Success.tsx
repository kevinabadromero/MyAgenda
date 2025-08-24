import { useParams, Link } from "react-router-dom";
export default function Success() {
  const { id } = useParams();
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold mb-2">¡Reserva confirmada!</h1>
      <p className="mb-4">Tu ID de reserva es <code>{id}</code>.</p>
      <Link className="btn" to="/">Hacer otra reserva</Link>
    </div>
  );
}