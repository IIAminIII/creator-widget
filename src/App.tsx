import { useState } from "react";
import { DealResponseForm } from "./components/DealResponseForm";
import { ErrorState } from "./components/ErrorState";
import { useCrmDealId } from "./hooks/useCrmDealId";

export default function App() {
  const { loading, crmDealId } = useCrmDealId();
  const [closed, setClosed] = useState(false);

  if (loading) {
    return (
      <main className="page">
        <div className="card">
          <div className="state-screen" role="status" aria-live="polite">
            <p className="state-screen__message">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!crmDealId) {
    return (
      <main className="page">
        <div className="card">
          <ErrorState title="Unable to load this response form." message="The Deal reference is missing." />
        </div>
      </main>
    );
  }

  if (closed) {
    return (
      <main className="page">
        <div className="card">
          <div className="state-screen">
            <p className="state-screen__message">You can now close this window.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <DealResponseForm crmDealId={crmDealId} onClose={() => setClosed(true)} />
    </main>
  );
}
