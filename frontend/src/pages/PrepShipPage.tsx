import { Truck } from "lucide-react";

/** The Ship tab: a placeholder until the shipping step is designed. */
export default function PrepShipPage() {
  return (
    <div className="prp-page">
      <div className="page-header">
        <h1 className="page-title">Ship</h1>
      </div>
      <div className="prp-empty">
        <Truck size={40} strokeWidth={1.5} />
        Coming soon
      </div>
    </div>
  );
}
